"use client";

import Link from "next/link";
import { useState } from "react";
import { apiRequest } from "@/lib/api";
import { Navbar } from "@/components/Navbar";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setMessage(null);
    try {
      const res = await apiRequest<{ message: string }>("/auth/forgot-password", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ email }),
      });
      setMessage(res.data?.message || "Reset instructions requested.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to submit request.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="dm-card max-w-md w-full p-6 sm:p-8 space-y-4">
          <h1 className="text-xl font-semibold">Reset your password</h1>
          <p className="text-xs text-[var(--dm-muted)]">
            Enter your account email to generate a time-limited reset token.
          </p>
          {message && (
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 px-3 py-2 text-xs text-emerald-400">
              {message}
            </div>
          )}
          {error && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {error}
            </div>
          )}
          <form onSubmit={submit} className="space-y-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@example.com"
              className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={loading}
              className="w-full dm-primary-btn py-2 text-sm font-medium disabled:opacity-60"
            >
              {loading ? "Sending..." : "Send reset link"}
            </button>
          </form>
          <Link href="/login" className="block text-xs text-center text-indigo-400 hover:underline">
            Back to Sign in
          </Link>
        </div>
      </main>
    </div>
  );
}
