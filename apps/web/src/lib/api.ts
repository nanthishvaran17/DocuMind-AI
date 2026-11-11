import type { ApiEnvelope, AuthSession, JobRecord } from "@documind/types";
import { useAuthStore } from "@/stores/auth-store";

export const API_BASE = process.env.NEXT_PUBLIC_API_URL?.replace(/\/+$/, "") || "/api/v1";

export class ApiError extends Error {
  status: number;
  code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

let refreshInFlight: Promise<string | null> | null = null;

export async function tryRefreshSession(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    try {
      const resp = await fetch(`${API_BASE}/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });
      const body = (await resp.json().catch(() => null)) as ApiEnvelope<AuthSession> | null;
      if (resp.ok && body?.data?.access_token) {
        useAuthStore.getState().setSession(body.data);
        return body.data.access_token;
      }
      return null;
    } catch {
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();
  return refreshInFlight;
}

export async function ensureAuthSession(): Promise<string> {
  const store = useAuthStore.getState();
  if (store.accessToken) {
    if (store.isGuest && store.guestExpiresAt) {
      if (new Date(store.guestExpiresAt).getTime() > Date.now() + 15000) {
        return store.accessToken;
      }
    } else {
      return store.accessToken;
    }
  }

  const refreshed = await tryRefreshSession();
  if (refreshed) {
    return refreshed;
  }

  const resp = await fetch(`${API_BASE}/auth/guest`, {
    method: "POST",
    credentials: "include",
  });
  const body = (await resp.json()) as ApiEnvelope<AuthSession>;
  if (!resp.ok || !body.data) {
    throw new ApiError(body.error?.detail || "Could not start guest session.", resp.status);
  }
  store.setSession(body.data);
  return body.data.access_token;
}

export async function apiRequest<T>(
  path: string,
  options: RequestInit & { skipAuth?: boolean; ensureGuest?: boolean } = {}
): Promise<ApiEnvelope<T>> {
  const { skipAuth = false, ensureGuest = false, headers, ...rest } = options;
  const reqHeaders = new Headers(headers);

  if (!skipAuth) {
    let token = useAuthStore.getState().accessToken;
    if (!token && ensureGuest) {
      token = await ensureAuthSession();
    }
    if (token) {
      reqHeaders.set("Authorization", `Bearer ${token}`);
    }
    const csrf = useAuthStore.getState().csrfToken;
    if (csrf) {
      reqHeaders.set("X-CSRF-Token", csrf);
    }
  }

  if (!(rest.body instanceof FormData) && !reqHeaders.has("Content-Type")) {
    reqHeaders.set("Content-Type", "application/json");
  }

  const res = await fetch(`${API_BASE}${path}`, {
    ...rest,
    headers: reqHeaders,
    credentials: "include",
  });

  const payload = (await res.json().catch(() => ({
    data: null,
    error: { title: "Network Error", status: res.status, detail: "Invalid JSON response" },
    meta: { request_id: "-" },
  }))) as ApiEnvelope<T>;

  if (!res.ok || payload.error) {
    if (res.status === 401 && !skipAuth) {
      let freshToken = await tryRefreshSession();
      if (!freshToken && ensureGuest) {
        useAuthStore.getState().clearSession();
        freshToken = await ensureAuthSession();
      } else if (!freshToken) {
        useAuthStore.getState().clearSession();
      }
      if (freshToken) {
        reqHeaders.set("Authorization", `Bearer ${freshToken}`);
        const freshCsrf = useAuthStore.getState().csrfToken;
        if (freshCsrf) {
          reqHeaders.set("X-CSRF-Token", freshCsrf);
        }
        const retry = await fetch(`${API_BASE}${path}`, {
          ...rest,
          headers: reqHeaders,
          credentials: "include",
        });
        const retryBody = (await retry.json().catch(() => ({
          data: null,
          error: { title: "Network Error", status: retry.status, detail: "Invalid JSON response" },
          meta: { request_id: "-" },
        }))) as ApiEnvelope<T>;
        if (retry.ok && !retryBody.error) return retryBody;
      }
    }
    throw new ApiError(
      payload.error?.detail || `Request failed (${res.status})`,
      res.status,
      payload.error?.code
    );
  }
  return payload;
}

export async function fetchAuthorizedBlob(path: string): Promise<Blob> {
  const token = await ensureAuthSession();
  let res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
    credentials: "include",
  });
  if (res.status === 401) {
    let freshToken = await tryRefreshSession();
    if (!freshToken) {
      useAuthStore.getState().clearSession();
      freshToken = await ensureAuthSession();
    }
    res = await fetch(`${API_BASE}${path}`, {
      headers: { Authorization: `Bearer ${freshToken}` },
      credentials: "include",
    });
  }
  if (!res.ok) {
    throw new ApiError(`Failed to load file (${res.status})`, res.status);
  }
  return res.blob();
}

export async function pollOrStreamJob(
  jobId: string,
  onProgress: (job: Partial<JobRecord>) => void
): Promise<JobRecord> {
  const token = await ensureAuthSession();

  // Try SSE stream first via fetch reader (supports Authorization header)
  try {
    const res = await fetch(`${API_BASE}/jobs/${jobId}/events`, {
      headers: { Authorization: `Bearer ${token}` },
      credentials: "include",
    });
    if (res.ok && res.body) {
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let lastStatus: Partial<JobRecord> | null = null;
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const chunk of events) {
          const line = chunk.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          const parsed = JSON.parse(line.slice(6)) as Partial<JobRecord>;
          lastStatus = parsed;
          onProgress(parsed);
          if (
            parsed.status === "completed" ||
            parsed.status === "failed" ||
            parsed.status === "cancelled"
          ) {
            const finalRes = await apiRequest<JobRecord>(`/jobs/${jobId}`);
            return finalRes.data!;
          }
        }
      }
      if (lastStatus && lastStatus.status === "completed") {
        const finalRes = await apiRequest<JobRecord>(`/jobs/${jobId}`);
        return finalRes.data!;
      }
    }
  } catch {
    // Fallback to polling
  }

  for (let i = 0; i < 60; i += 1) {
    const res = await apiRequest<JobRecord>(`/jobs/${jobId}`);
    const job = res.data!;
    onProgress(job);
    if (job.status === "completed" || job.status === "failed" || job.status === "cancelled") {
      return job;
    }
    await new Promise((r) => setTimeout(r, 400));
  }
  throw new ApiError("Job timed out while waiting for completion.", 504);
}
