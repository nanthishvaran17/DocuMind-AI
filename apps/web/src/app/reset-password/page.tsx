"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";
import { LockKeyhole, CheckCircle2 } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

function ResetPasswordInner() {
  const searchParams = useSearchParams();
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    const t = searchParams.get("token");
    if (t) setToken(t);
  }, [searchParams]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setMessage(null);
    if (password.length < 8) {
      setError("Password must be at least 8 characters long.");
      return;
    }
    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }
    setLoading(true);
    try {
      const res = await apiRequest<{ message: string }>("/auth/reset-password", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ token: token.trim(), new_password: password }),
      });
      setMessage(res.data?.message || "Password updated. You can now sign in.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to reset password.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="dm-elevated max-w-md w-full p-7 sm:p-8 space-y-5">
      <div className="space-y-1.5">
        <div className="h-10 w-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 mb-2">
          <LockKeyhole className="h-5 w-5" />
        </div>
        <h1 className="text-xl font-semibold">Set a new password</h1>
        <p className="text-xs text-[var(--dm-muted)]">
          Paste your reset token and choose a strong new password.
        </p>
      </div>

      {message && (
        <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-3 text-xs text-emerald-400 flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{message}</span>
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
          {error}
        </div>
      )}

      <form onSubmit={submit} className="space-y-3.5">
        <div>
          <label className="text-xs font-medium text-[var(--dm-muted)] block mb-1.5">
            Reset Token
          </label>
          <input
            type="text"
            required
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="Paste reset token"
            className="dm-input w-full px-3.5 py-2.5 text-sm font-mono"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--dm-muted)] block mb-1.5">
            New Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="Minimum 8 characters"
            className="dm-input w-full px-3.5 py-2.5 text-sm"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-[var(--dm-muted)] block mb-1.5">
            Confirm Password
          </label>
          <input
            type="password"
            required
            minLength={8}
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            placeholder="Re-enter password"
            className="dm-input w-full px-3.5 py-2.5 text-sm"
          />
        </div>
        <button
          type="submit"
          disabled={loading}
          className="w-full dm-primary-btn py-2.5 text-sm font-medium disabled:opacity-60"
        >
          {loading ? "Updating..." : "Update password"}
        </button>
      </form>

      <Link
        href="/login"
        className="block text-xs text-center text-indigo-400 hover:underline font-medium"
      >
        Back to Sign in
      </Link>
    </div>
  );
}

export default function ResetPasswordPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 dm-grid-bg">
        <Suspense
          fallback={
            <div className="dm-elevated max-w-md w-full p-8 text-xs text-[var(--dm-muted)]">
              Loading reset form...
            </div>
          }
        >
          <ResetPasswordInner />
        </Suspense>
      </main>
    </div>
  );
}
