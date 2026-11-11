import { Navbar } from "@/components/Navbar";

export default function TermsPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
        <h1 className="text-3xl font-semibold">Terms of Service</h1>
        <section className="dm-card p-6 space-y-4 text-sm text-[var(--dm-muted)] leading-relaxed">
          <p>
            You retain full ownership and copyright of all documents you upload or create in DocuMind AI.
          </p>
          <p>
            You agree not to upload malware, illegal material, or attempt to bypass authentication, rate limits, or resource isolation boundaries.
          </p>
          <p>
            DocuMind AI reports real compression and conversion measurements honestly. Heavily designed or scanned PDFs may lose visual fidelity under aggressive KB compression; always inspect your output before official portal submission.
          </p>
        </section>
      </main>
    </div>
  );
}
