"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Lock, ShieldCheck } from "lucide-react";
import type { AuthSession } from "@documind/types";
import { API_BASE, apiRequest } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/providers";
import { Navbar } from "@/components/Navbar";

const loginSchema = z.object({
  email: z.string().email("Enter a valid email"),
  password: z.string().min(1, "Password is required"),
});

type LoginForm = z.infer<typeof loginSchema>;

export default function LoginPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const { pushToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<LoginForm>({ resolver: zodResolver(loginSchema) });

  const onSubmit = async (values: LoginForm) => {
    setServerError(null);
    try {
      const res = await apiRequest<AuthSession>("/auth/login", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify(values),
      });
      if (res.data) {
        setSession(res.data);
        pushToast({ title: "Welcome back", variant: "success" });
        router.push("/app");
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Failed to sign in.");
    }
  };

  const startGuest = async () => {
    try {
      const res = await apiRequest<AuthSession>("/auth/guest", {
        method: "POST",
        skipAuth: true,
      });
      if (res.data) {
        setSession(res.data);
        router.push("/app");
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Could not start guest session.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 dm-grid-bg">
        <div className="dm-elevated max-w-md w-full p-7 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/25 text-[11px] font-medium text-indigo-500 dark:text-indigo-300">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Private &amp; Version-Safe Studio</span>
            </div>
            <h1 className="text-2xl font-semibold">Sign in to DocuMind AI</h1>
            <p className="text-sm text-[var(--dm-muted)]">
              Access your saved folders, version history, and student workspace.
            </p>
          </div>

          {serverError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Email</label>
              <input
                type="email"
                {...register("email")}
                placeholder="you@college.edu.in"
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium">Password</label>
                <Link href="/forgot-password" className="text-xs text-indigo-400 hover:underline">
                  Forgot password?
                </Link>
              </div>
              <input
                type="password"
                {...register("password")}
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              />
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full dm-primary-btn py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Lock className="h-4 w-4" />}
              <span>Sign in</span>
            </button>
          </form>

          <div className="grid grid-cols-2 gap-2.5 pt-1">
            <a
              href={`${API_BASE}/auth/google`}
              className="text-center py-2.5 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-[var(--dm-border-strong)] transition-colors"
            >
              Google OAuth
            </a>
            <button
              type="button"
              onClick={startGuest}
              className="py-2.5 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-[var(--dm-border-strong)] transition-colors"
            >
              Guest Mode (1h)
            </button>
          </div>

          <p className="text-xs text-center text-[var(--dm-muted)]">
            New here?{" "}
            <Link href="/register" className="text-indigo-400 hover:underline font-medium">
              Create a free account
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
