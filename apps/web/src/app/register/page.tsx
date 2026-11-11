"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { GraduationCap, Loader2, UserPlus } from "lucide-react";
import type { AuthSession } from "@documind/types";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { useToast } from "@/components/providers";
import { Navbar } from "@/components/Navbar";

const registerSchema = z.object({
  full_name: z.string().min(2, "Enter your full name"),
  email: z.string().email("Enter a valid email"),
  password: z.string().min(8, "Password must be at least 8 characters"),
});

type RegisterForm = z.infer<typeof registerSchema>;

export default function RegisterPage() {
  const router = useRouter();
  const setSession = useAuthStore((s) => s.setSession);
  const locale = useAuthStore((s) => s.locale);
  const { pushToast } = useToast();
  const [serverError, setServerError] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors, isSubmitting },
  } = useForm<RegisterForm>({ resolver: zodResolver(registerSchema) });

  const onSubmit = async (values: RegisterForm) => {
    setServerError(null);
    try {
      const res = await apiRequest<AuthSession>("/auth/register", {
        method: "POST",
        skipAuth: true,
        body: JSON.stringify({ ...values, locale }),
      });
      if (res.data) {
        setSession(res.data);
        pushToast({
          title: res.data.user?.is_student_verified
            ? "Account created (Student domain detected)"
            : "Account created",
          variant: "success",
        });
        router.push("/app");
      }
    } catch (err) {
      setServerError(err instanceof Error ? err.message : "Registration failed.");
    }
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4 dm-grid-bg">
        <div className="dm-elevated max-w-md w-full p-7 sm:p-8 space-y-6">
          <div className="space-y-2">
            <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-violet-500/10 border border-violet-500/25 text-[11px] font-medium text-violet-500 dark:text-violet-300">
              <GraduationCap className="h-3.5 w-3.5" />
              <span>.edu / .ac.in auto-verified</span>
            </div>
            <h1 className="text-2xl font-semibold">Create your free account</h1>
            <p className="text-sm text-[var(--dm-muted)]">
              Use a <code>.edu</code>, <code>.edu.in</code>, or <code>.ac.in</code> email for automatic Student verification.
            </p>
          </div>

          {serverError && (
            <div className="rounded-xl border border-red-500/30 bg-red-500/10 px-3.5 py-2.5 text-xs text-red-400">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <label className="text-xs font-medium">Full Name</label>
              <input
                type="text"
                {...register("full_name")}
                placeholder="Karthik Subramanian"
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              />
              {errors.full_name && <p className="text-xs text-red-400">{errors.full_name.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Email</label>
              <input
                type="email"
                {...register("email")}
                placeholder="karthik@annauniv.edu.in"
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-medium">Password</label>
              <input
                type="password"
                {...register("password")}
                placeholder="At least 8 characters"
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              />
              {errors.password && <p className="text-xs text-red-400">{errors.password.message}</p>}
            </div>

            <button
              type="submit"
              disabled={isSubmitting}
              className="w-full dm-primary-btn py-2.5 text-sm font-medium flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {isSubmitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <UserPlus className="h-4 w-4" />}
              <span>Create Account</span>
            </button>
          </form>

          <p className="text-xs text-center text-[var(--dm-muted)]">
            Already have an account?{" "}
            <Link href="/login" className="text-indigo-400 hover:underline font-medium">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
