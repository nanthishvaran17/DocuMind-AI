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
    console.error("Global application error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen flex items-center justify-center p-6 bg-[#0a0d14] text-slate-100 font-sans">
        <div className="max-w-md w-full p-8 text-center space-y-5 rounded-2xl border border-rose-500/30 bg-[#121622] shadow-xl">
          <div className="mx-auto w-12 h-12 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-500">
            <AlertTriangle className="h-6 w-6" />
          </div>
          <div className="space-y-2">
            <h1 className="text-xl font-bold text-white">Something went wrong</h1>
            <p className="text-xs text-slate-400 leading-relaxed">
              An unexpected critical error occurred. Your original files remain safe and untouched.
            </p>
          </div>
          <div className="flex items-center justify-center gap-3 pt-2">
            <button
              type="button"
              onClick={() => reset()}
              className="px-4 py-2 text-xs font-semibold rounded-xl bg-blue-600 text-white hover:bg-blue-500 transition-colors inline-flex items-center gap-2"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span>Try Again</span>
            </button>
            <Link
              href="/app"
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-slate-700 bg-slate-800 text-slate-200 hover:border-slate-600 inline-flex items-center gap-1.5"
            >
              <ArrowLeft className="h-3.5 w-3.5" />
              <span>Workspace</span>
            </Link>
          </div>
        </div>
      </body>
    </html>
  );
}
