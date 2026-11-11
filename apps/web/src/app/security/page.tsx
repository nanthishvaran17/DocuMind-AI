import Link from "next/link";
import { ShieldCheck, Lock, FileWarning, Server } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Security & Zero-Trust Architecture",
  description:
    "Explore DocuMind AI upload sanitization, ClamAV malware scanning, PDF script stripping, isolated workers, and immutable v1 version history.",
  path: "/security",
});

export default function SecurityPage() {
  const pillars = [
    {
      icon: FileWarning,
      tone: "text-amber-400 bg-amber-500/15 border-amber-500/25",
      title: "Untrusted Upload Sanitization",
      desc: "Extension, MIME, and magic-byte validation, decompression-bomb pixel caps, ClamAV scanning, and automatic PDF JavaScript stripping.",
    },
    {
      icon: Lock,
      tone: "text-indigo-400 bg-indigo-500/15 border-indigo-500/25",
      title: "Strict Per-User Isolation",
      desc: "Argon2id password hashing, short-lived JWTs, rotating httpOnly refresh tokens, CSRF checks, and owner-scoped queries on every endpoint.",
    },
    {
      icon: Server,
      tone: "text-cyan-400 bg-cyan-500/15 border-cyan-500/25",
      title: "Sandboxed Worker Isolation",
      desc: "Document processing runs in dedicated non-root, read-only filesystem containers isolated from the control plane.",
    },
    {
      icon: ShieldCheck,
      tone: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
      title: "Immutable Audit & Versioning",
      desc: "Original uploads are never overwritten. Every edit creates a new version linked to an immutable audit log.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-14 space-y-8">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Security" }]} />
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Zero-Trust Pipeline</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Security &amp; Architecture
            </h1>
            <p className="text-sm text-[var(--dm-muted)] max-w-2xl">
              Every file uploaded by users is treated as untrusted until validated, scanned, and sanitized.
            </p>
          </div>
          <div className="grid sm:grid-cols-2 gap-4">
            {pillars.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="dm-elevated p-6 space-y-3">
                  <div className={`h-10 w-10 rounded-xl border flex items-center justify-center ${p.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-semibold">{p.title}</h2>
                  <p className="text-sm text-[var(--dm-muted)] leading-relaxed">{p.desc}</p>
                </div>
              );
            })}
          </div>

          <div className="flex flex-wrap gap-4 text-xs text-[var(--dm-muted)] pt-2">
            <Link href="/privacy" className="hover:text-[var(--dm-text)] underline underline-offset-4">
              Privacy Policy (DPDP &amp; GDPR)
            </Link>
            <Link href="/terms" className="hover:text-[var(--dm-text)] underline underline-offset-4">
              Terms of Service
            </Link>
            <Link href="/app" className="hover:text-[var(--dm-text)] underline underline-offset-4">
              Try Workspace in Guest Mode
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
