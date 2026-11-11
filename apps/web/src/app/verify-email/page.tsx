"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useCallback, useEffect, useState } from "react";
import { CheckCircle2, MailCheck } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

function VerifyEmailInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [status, setStatus] = useState<"idle" | "verifying" | "verified" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);

  const verify = useCallback(async (tok: string) => {
    if (!tok.trim()) return;
    setStatus("verifying");
    setMessage(null);
    try {
      const res = await apiRequest<{ message: string }>("/auth/verify-email", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ token: tok.trim() }),
      });
      setStatus("verified");
      setMessage(res.data?.message || "Email verified successfully.");
    } catch (err) {
      setStatus("error");
      setMessage(err instanceof Error ? err.message : "Invalid or expired verification token.");
    }
  }, []);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) {
      setToken(t);
      verify(t);
    }
  }, [searchParams, verify]);

  return (
    <div className="dm-elevated max-w-md w-full p-7 sm:p-8 space-y-5">
      <div className="space-y-1.5">
        <div className="h-10 w-10 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400 mb-2">
          <MailCheck className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold">Verify your email</h1>
        <p className="text-xs text-[var(--dm-muted)]">
          Confirm your email address to activate full registered account capabilities.
        </p>
      </div>

      {status === "verified" && message && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}

      {status === "error" && message && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
          {message}
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          verify(token);
        }}
        className="space-y-3.5"
      >
        <input
          type="text"
          required
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="Paste verification token"
          className="dm-input w-full px-3.5 py-2.5 text-sm font-mono"
        />
        <button
          type="submit"
          disabled={status === "verifying"}
          className="w-full dm-primary-btn py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {status === "verifying" ? "Verifying..." : "Verify email"}
        </button>
      </form>

      <div className="flex items-center justify-between text-xs pt-1">
        <Link href="/login" className="text-indigo-400 hover:underline font-medium">
          Sign in
        </Link>
        <Link href="/app" className="text-[var(--dm-muted)] hover:text-[var(--dm-text)]">
          Continue to Studio
        </Link>
      </div>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 dm-grid-bg">
        <Suspense
          fallback={
            <div className="dm-elevated max-w-md w-full p-8 text-xs text-[var(--dm-muted)]">
              Loading verification...
            </div>
          }
        >
          <VerifyEmailInner />
        </Suspense>
      </main>
    </div>
  );
}
