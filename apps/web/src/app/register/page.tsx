"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, UserPlus } from "lucide-react";
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
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="flex-1 flex items-center justify-center p-4">
        <div className="dm-card max-w-md w-full p-6 sm:p-8 space-y-5">
          <div className="space-y-1">
            <h1 className="text-2xl font-semibold">Create your free account</h1>
            <p className="text-sm text-[var(--dm-muted)]">
              Use a <code>.edu</code>, <code>.edu.in</code>, or <code>.ac.in</code> email for automatic Student verification.
            </p>
          </div>

          {serverError && (
            <div className="rounded-lg border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-400">
              {serverError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1">
              <label className="text-xs font-medium">Full Name</label>
              <input
                type="text"
                {...register("full_name")}
                placeholder="Karthik Subramanian"
                className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              {errors.full_name && <p className="text-xs text-red-400">{errors.full_name.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Email</label>
              <input
                type="email"
                {...register("email")}
                placeholder="karthik@annauniv.edu.in"
                className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-sm outline-none focus:border-indigo-500"
              />
              {errors.email && <p className="text-xs text-red-400">{errors.email.message}</p>}
            </div>

            <div className="space-y-1">
              <label className="text-xs font-medium">Password</label>
              <input
                type="password"
                {...register("password")}
                placeholder="At least 8 characters"
                className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-sm outline-none focus:border-indigo-500"
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
            <Link href="/login" className="text-indigo-400 hover:underline">
              Sign in
            </Link>
          </p>
        </div>
      </main>
    </div>
  );
}
