import { ShieldCheck, Lock, FileWarning, Server } from "lucide-react";
import { Navbar } from "@/components/Navbar";

export default function SecurityPage() {
  const pillars = [
    {
      icon: FileWarning,
      title: "Untrusted Upload Sanitization",
      desc: "Extension, MIME, and magic-byte validation, decompression-bomb pixel caps, ClamAV scanning, and automatic PDF JavaScript stripping.",
    },
    {
      icon: Lock,
      title: "Strict Per-User Isolation",
      desc: "Argon2id password hashing, short-lived JWTs, rotating httpOnly refresh tokens, CSRF checks, and owner-scoped queries on every endpoint.",
    },
    {
      icon: Server,
      title: "Sandboxed Worker Isolation",
      desc: "Document processing runs in dedicated non-root, read-only filesystem containers isolated from the control plane.",
    },
    {
      icon: ShieldCheck,
      title: "Immutable Audit & Versioning",
      desc: "Original uploads are never overwritten. Every edit creates a new version linked to an immutable audit log.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col">
      <Navbar />
      <main className="max-w-5xl mx-auto px-4 sm:px-6 py-14 space-y-8">
        <div>
          <h1 className="text-3xl font-semibold">Security & Architecture</h1>
          <p className="text-sm text-[var(--dm-muted)] mt-2">
            Every file uploaded by users is treated as untrusted until validated, scanned, and sanitized.
          </p>
        </div>
        <div className="grid sm:grid-cols-2 gap-4">
          {pillars.map((p) => {
            const Icon = p.icon;
            return (
              <div key={p.title} className="dm-card p-6 space-y-2.5">
                <Icon className="h-5 w-5 text-indigo-400" />
                <h2 className="text-base font-semibold">{p.title}</h2>
                <p className="text-sm text-[var(--dm-muted)]">{p.desc}</p>
              </div>
            );
          })}
        </div>
      </main>
    </div>
  );
}
