import Link from "next/link";
import { ArrowLeft, FileQuestion, Layers } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function NotFound() {
  const quickLinks = [
    { href: "/app/tools/scan", label: "Auto Document Scanner" },
    { href: "/app/tools/compress", label: "Compress PDF to KB" },
    { href: "/app/tools/photo-resizer", label: "Photo & Signature Resizer" },
    { href: "/app/tools/convert", label: "Format Converter" },
    { href: "/app/intelligence", label: "AI Search & Q&A" },
    { href: "/security", label: "Security & Privacy" },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg flex items-center justify-center p-6">
        <div className="dm-elevated max-w-lg w-full p-8 text-center space-y-5">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 text-xs font-mono font-semibold">
            404 • Not Found
          </div>
          <div className="mx-auto w-12 h-12 rounded-2xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center">
            <FileQuestion className="h-6 w-6 text-indigo-400" />
          </div>
          <div className="space-y-2">
            <h1 className="text-2xl font-semibold tracking-tight">
              We could not find that page
            </h1>
            <p className="text-sm text-[var(--dm-muted)] leading-relaxed">
              The URL or guest document you requested does not exist or may have auto-expired after its 1-hour session window.
            </p>
          </div>

          <div className="flex flex-wrap items-center justify-center gap-3 pt-1">
            <Link
              href="/"
              className="px-4 py-2 text-sm rounded-xl border border-[var(--dm-border)] hover:border-[var(--dm-border-strong)] inline-flex items-center gap-1.5 transition-colors"
            >
              <ArrowLeft className="h-4 w-4" />
              <span>Back to Home</span>
            </Link>
            <Link
              href="/app"
              className="dm-primary-btn px-4 py-2 text-sm font-medium inline-flex items-center gap-1.5"
            >
              <Layers className="h-4 w-4" />
              <span>Open Studio</span>
            </Link>
          </div>

          <div className="pt-4 border-t border-[var(--dm-border)] text-left space-y-2">
            <p className="text-[11px] font-mono uppercase tracking-wider text-[var(--dm-muted)]">
              Popular Destinations
            </p>
            <div className="grid grid-cols-2 gap-2 text-xs">
              {quickLinks.map((item) => (
                <Link
                  key={item.href}
                  href={item.href}
                  className="px-3 py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-indigo-500/40 transition-colors truncate"
                >
                  {item.label}
                </Link>
              ))}
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
