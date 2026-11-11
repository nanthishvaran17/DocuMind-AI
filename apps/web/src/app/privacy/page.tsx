import Link from "next/link";
import { Shield } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Privacy Policy (DPDP & GDPR)",
  description:
    "How DocuMind AI protects your documents with zero AI model training, 1-hour Guest Mode auto-deletion, and encrypted private storage.",
  path: "/privacy",
});

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]} />
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              <Shield className="h-3.5 w-3.5" />
              <span>Privacy &amp; Compliance</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">
              Privacy Policy (India DPDP Act &amp; GDPR)
            </h1>
            <p className="text-sm text-[var(--dm-muted)]">
              Effective Date: November 11, 2026 • Plain-language summary of how DocuMind AI handles your files.
            </p>
          </div>

          <section className="dm-elevated p-6 sm:p-8 space-y-5 text-sm leading-relaxed">
            <div className="space-y-1.5">
              <h2 className="text-base font-semibold">1. Zero Training on Your Documents</h2>
              <p className="text-[var(--dm-muted)]">
                We never sell your data and never use your uploaded PDFs, photos, notes, or generated documents to train AI models.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[var(--dm-border)]">
              <h2 className="text-base font-semibold">2. Guest Mode Auto-Deletion (1 Hour)</h2>
              <p className="text-[var(--dm-muted)]">
                Files uploaded in Guest Mode are scoped to an ephemeral guest session and automatically hard-deleted (database records, versions, thumbnails, and object storage) after 1 hour. You can also click <strong className="text-[var(--dm-text)]">Delete now</strong> at any time for immediate removal.
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[var(--dm-border)]">
              <h2 className="text-base font-semibold">3. Data Principal Rights (DPDP 2023 &amp; GDPR)</h2>
              <p className="text-[var(--dm-muted)]">
                Signed-in users can inspect their audit history, restore trashed files for 30 days, or permanently delete their entire account and all stored files from Settings (<code className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">DELETE /api/v1/users/me</code>).
              </p>
            </div>

            <div className="space-y-1.5 pt-2 border-t border-[var(--dm-border)]">
              <h2 className="text-base font-semibold">4. Subprocessors &amp; Storage</h2>
              <p className="text-[var(--dm-muted)]">
                Files are stored encrypted at rest in S3-compatible object storage with private, authenticated access only—never exposed via public unauthenticated file URLs.
              </p>
            </div>
          </section>

          <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--dm-muted)] pt-2">
            <div className="flex flex-wrap gap-4">
              <Link href="/security" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Security Architecture
              </Link>
              <Link href="/terms" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Terms of Service
              </Link>
              <Link href="/app" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Open Document Workspace
              </Link>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}
