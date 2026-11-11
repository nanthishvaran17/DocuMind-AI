import { Navbar } from "@/components/Navbar";

export default function PrivacyPage() {
  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-14 space-y-6">
        <h1 className="text-3xl font-semibold">Privacy Policy (India DPDP Act & GDPR)</h1>
        <p className="text-sm text-[var(--dm-muted)]">
          Effective Date: November 11, 2026 • Plain-language summary of how DocuMind AI handles your files.
        </p>

        <section className="dm-card p-6 space-y-3 text-sm leading-relaxed">
          <h2 className="text-lg font-semibold">1. Zero Training on Your Documents</h2>
          <p className="text-[var(--dm-muted)]">
            We never sell your data and never use your uploaded PDFs, photos, notes, or generated documents to train AI models.
          </p>

          <h2 className="text-lg font-semibold pt-2">2. Guest Mode Auto-Deletion (1 Hour)</h2>
          <p className="text-[var(--dm-muted)]">
            Files uploaded in Guest Mode are scoped to an ephemeral guest session and automatically hard-deleted (database records, versions, thumbnails, and object storage) after 1 hour. You can also click <strong>Delete now</strong> at any time for immediate removal.
          </p>

          <h2 className="text-lg font-semibold pt-2">3. Data Principal Rights (DPDP 2023 & GDPR)</h2>
          <p className="text-[var(--dm-muted)]">
            Signed-in users can inspect their audit history, restore trashed files for 30 days, or permanently delete their entire account and all stored files from Settings (<code>DELETE /api/v1/users/me</code>).
          </p>

          <h2 className="text-lg font-semibold pt-2">4. Subprocessors & Storage</h2>
          <p className="text-[var(--dm-muted)]">
            Files are stored encrypted at rest in S3-compatible object storage with private, authenticated access only—never exposed via public unauthenticated file URLs.
          </p>
        </section>
      </main>
    </div>
  );
}
