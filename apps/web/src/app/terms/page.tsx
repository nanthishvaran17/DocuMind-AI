import { Scale } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
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
        </div>
      </main>
    </div>
  );
}
