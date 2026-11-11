import Link from "next/link";
import { FileQuestion } from "lucide-react";

export default function NotFound() {
  return (
    <main className="min-h-screen flex items-center justify-center p-6">
      <div className="dm-card max-w-md w-full p-8 text-center space-y-4">
        <div className="mx-auto w-12 h-12 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
          <FileQuestion className="h-6 w-6 text-indigo-400" />
        </div>
        <h1 className="text-2xl font-semibold">Page not found</h1>
        <p className="text-sm text-[var(--dm-muted)]">
          The page or document you requested does not exist or may have expired.
        </p>
        <div className="pt-2 flex items-center justify-center gap-3">
          <Link href="/" className="px-4 py-2 text-sm rounded-lg border border-[var(--dm-border)]">
            Home
          </Link>
          <Link href="/app" className="dm-primary-btn px-4 py-2 text-sm font-medium">
            Open Workspace
          </Link>
        </div>
      </div>
    </main>
  );
}
