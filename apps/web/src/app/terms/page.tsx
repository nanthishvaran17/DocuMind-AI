import Link from "next/link";
import { Scale } from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "DocuMind AI Terms of Service covering document ownership, acceptable use, and honest compression and conversion measurements.",
  path: "/terms",
});

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Terms of Service" }]} />
          <div className="space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 text-xs font-medium">
              <Scale className="h-3.5 w-3.5" />
              <span>User Agreement</span>
            </div>
            <h1 className="text-3xl sm:text-4xl font-semibold tracking-tight">Terms of Service</h1>
          </div>

          <section className="dm-elevated p-6 sm:p-8 space-y-4 text-sm text-[var(--dm-muted)] leading-relaxed">
            <p>
              You retain full ownership and copyright of all documents you upload or create in DocuMind AI.
            </p>
            <p className="pt-3 border-t border-[var(--dm-border)]">
              You agree not to upload malware, illegal material, or attempt to bypass authentication, rate limits, or resource isolation boundaries.
            </p>
            <p className="pt-3 border-t border-[var(--dm-border)]">
              DocuMind AI reports real compression and conversion measurements honestly. Heavily designed or scanned PDFs may lose visual fidelity under aggressive KB compression; always inspect your output before official portal submission.
            </p>
          </section>

          <div className="flex flex-wrap gap-4 text-xs text-[var(--dm-muted)] pt-2">
            <Link href="/privacy" className="hover:text-[var(--dm-text)] underline underline-offset-4">
              Privacy Policy
            </Link>
            <Link href="/security" className="hover:text-[var(--dm-text)] underline underline-offset-4">
              Security Architecture
            </Link>
            <Link href="/app" className="hover:text-[var(--dm-text)] underline underline-offset-4">
              Open Document Workspace
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
