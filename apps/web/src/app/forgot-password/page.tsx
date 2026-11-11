"use client";

import Link from "next/link";
import { useState } from "react";
import { KeyRound } from "lucide-react";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [devResetToken, setDevResetToken] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    setDevResetToken(null);
    try {
      const res = await apiRequest<{ message: string; dev_reset_token?: string }>(
        "/auth/forgot-password",
        {
          method: "POST",
          skipAuth: true,
          body: JSON.stringify({ email }),
        }
      );
      setMessage(res.data?.message || "Reset instructions requested.");
      if (res.data?.dev_reset_token) {
        setDevResetToken(res.data.dev_reset_token);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 dm-grid-bg">
        <div className="dm-elevated max-w-md w-full p-7 sm:p-8 space-y-5">
          <div className="space-y-1.5">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400 mb-2">
              <KeyRound className="h-5 w-5" />
            </div>
            <h1 className="text-xl font-semibold">Reset your password</h1>
            <p className="text-xs text-[var(--dm-muted)]">
              Enter your account email to generate a time-limited reset token.
            </p>
          </div>
          {message && (
            <div className="rounded-xl border border-emerald-500/30 bg-emerald-500/10 px-3.5 py-2.5 text-xs text-emerald-400 space-y-2">
              <p>{message}</p>
              {devResetToken && (
                <Link
                  href={`/reset-password?token=${encodeURIComponent(devResetToken)}`}
                  className="inline-block font-semibold underline text-emerald-300"
                >
                  Open dev reset link -&gt;
                </Link>
              )}
            </div>
          )}
          {error && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-3.5">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="dm-input w-full px-3.5 py-2.5 text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full dm-primary-btn py-2.5 text-sm font-medium disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
          <Link href="/login" className="block text-xs text-center text-indigo-400 hover:underline font-medium">
            Back to Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
