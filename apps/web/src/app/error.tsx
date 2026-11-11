"use client";

import Link from "next/link";
import { useEffect } from "react";
import { AlertTriangle, ArrowLeft, RefreshCw } from "lucide-react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log unexpected runtime error
  }, [error]);

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-[var(--dm-bg)]">
      <div className="dm-card max-w-md w-full p-8 text-center space-y-5 border-rose-300 dark:border-rose-500/30">
        <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-500">
          <AlertTriangle className="h-6 w-6" />
        </div>
        <div className="space-y-2">
          <h1 className="text-xl font-bold text-[var(--dm-text)]">Something went wrong</h1>
          <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
            An unexpected error occurred while processing this document view. Your original files remain safe and untouched.
          </p>
        </div>
        <div className="flex items-center justify-center gap-3 pt-2">
          <button
            type="button"
            onClick={() => reset()}
            className="dm-primary-btn px-4 py-2 text-xs font-semibold inline-flex items-center gap-2"
          >
            <RefreshCw className="h-3.5 w-3.5" />
            <span>Try Again</span>
          </button>
          <Link
            href="/app"
            className="px-4 py-2 text-xs font-semibold rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-500 inline-flex items-center gap-1.5"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            <span>Workspace</span>
          </Link>
        </div>
      </div>
    </div>
  );
}
