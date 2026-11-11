import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  FileWarning,
  Server,
  KeyRound,
  FileCheck2,
  Terminal,
  ArrowRight,
  Building,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata, BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Security & Zero-Trust Architecture",
  description:
    "Explore DocuMind AI upload sanitization, ClamAV malware scanning, PDF script stripping, isolated conversion workers, and AES-256 storage encryption.",
  path: "/security",
});

export default function SecurityPage() {
  const lastUpdated = "November 11, 2026";

  const pillars = [
    {
      icon: FileWarning,
      tone: "text-amber-400 bg-amber-500/15 border-amber-500/25",
      title: "Untrusted Upload Sanitization",
      desc: "Every uploaded file undergoes extension, MIME-type, and magic-byte verification. Decompression bombs are blocked by strict memory and pixel caps, and all PDFs are stripped of active JavaScript objects and malicious form actions.",
    },
    {
      icon: Lock,
      tone: "text-indigo-400 bg-indigo-500/15 border-indigo-500/25",
      title: "Strict Per-User Isolation",
      desc: "User credentials are protected using Argon2id hashing with cryptographic salts. APIs enforce short-lived access JWTs, rotating httpOnly refresh cookies, CSRF protection, and mandatory owner-scoped database partition filtering.",
    },
    {
      icon: Server,
      tone: "text-cyan-400 bg-cyan-500/15 border-cyan-500/25",
      title: "Sandboxed Worker Isolation",
      desc: "Document conversions (LibreOffice, Ghostscript, pdfplumber, Tesseract) run inside hardened worker containers with unprivileged non-root users, read-only root filesystems, and strict egress firewalls.",
    },
    {
      icon: ShieldCheck,
      tone: "text-emerald-400 bg-emerald-500/15 border-emerald-500/25",
      title: "Immutable Audit & Versioning",
      desc: "Original customer files are never overwritten. Edits generate discrete child versions while every upload, conversion, download, and deletion is recorded to an append-only audit trail.",
    },
  ];

  const architecturalControls = [
    {
      icon: KeyRound,
      title: "Cryptographic Storage Security",
      details: [
        "Data at Rest: Stored objects in S3/MinIO are encrypted using AES-256 with managed customer keys.",
        "Data in Transit: Modern TLS 1.3 encryption is enforced on all external endpoints with strict HSTS headers.",
        "Short-Lived Access: Object storage objects are accessed exclusively via short-lived, pre-signed HMAC URLs expiring in 15 minutes.",
      ],
    },
    {
      icon: FileCheck2,
      title: "Antivirus & Malware Defenses",
      details: [
        "ClamAV Engine: Incoming uploads are queued and scanned through real-time virus signature databases.",
        "Format Disarm (CDR): Macro-enabled documents (.docm, .xlsm) are disarmed or blocked outright.",
        "Decompression Bomb Protection: Pixel-count and extraction size thresholds prevent memory exhaustion denial-of-service.",
      ],
    },
    {
      icon: Terminal,
      title: "Container & Network Hardening",
      details: [
        "Internal Private Subnets: Databases (PostgreSQL) and Redis queues are isolated in private VPC subnets with no public IP exposure.",
        "Ephemeral Temp Drives: Worker conversions process files in RAM-backed /tmp disks that wipe completely on container termination.",
        "Rate-Limiting & WAF: Automated IP rate limiting defends against brute-force attacks and volumetric traffic spikes.",
      ],
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-12">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Security" }]} />

          {/* Header */}
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>Zero-Trust Security Architecture</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--dm-text)]">
              Security Architecture &amp; Controls
            </h1>
            <p className="text-sm sm:text-base text-[var(--dm-muted)] leading-relaxed">
              Every file entering DocuMind AI is treated as untrusted until thoroughly validated, sanitized,
              and isolated. Here is how our zero-trust architecture safeguards your documents.
            </p>
            <p className="text-xs text-[var(--dm-muted)] font-mono">
              Last audited: {lastUpdated} • Compliance Standard: ISO 27001 &amp; SOC2 Type II Aligned
            </p>
          </div>

          {/* 4 Pillars Grid */}
          <div className="grid sm:grid-cols-2 gap-5">
            {pillars.map((p) => {
              const Icon = p.icon;
              return (
                <div key={p.title} className="p-6 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-card)] space-y-3.5 shadow-xs">
                  <div className={`h-11 w-11 rounded-xl border flex items-center justify-center ${p.tone}`}>
                    <Icon className="h-5 w-5" />
                  </div>
                  <h2 className="text-base font-semibold text-[var(--dm-text)]">{p.title}</h2>
                  <p className="text-sm text-[var(--dm-muted)] leading-relaxed">{p.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Detailed Controls */}
          <div className="space-y-6">
            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--dm-text)]">
              In-Depth Defensive Safeguards
            </h2>
            <div className="grid md:grid-cols-3 gap-5">
              {architecturalControls.map((ctrl) => {
                const Icon = ctrl.icon;
                return (
                  <div
                    key={ctrl.title}
                    className="p-6 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-card)]/80 backdrop-blur-xs space-y-4 shadow-xs"
                  >
                    <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
                      <Icon className="h-4 w-4" />
                    </div>
                    <h3 className="text-sm font-semibold text-[var(--dm-text)]">{ctrl.title}</h3>
                    <ul className="space-y-2 text-xs text-[var(--dm-muted)] leading-relaxed">
                      {ctrl.details.map((detail, idx) => (
                        <li key={idx} className="flex items-start gap-2">
                          <span className="h-1.5 w-1.5 rounded-full bg-[var(--dm-accent)] mt-1.5 shrink-0" />
                          <span>{detail}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Vulnerability Disclosure & Compliance Desk */}
          <div className="p-6 sm:p-8 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-subtle)]/70 space-y-4">
            <div className="flex items-center gap-2">
              <Building className="h-4 w-4 text-[var(--dm-accent)]" />
              <h3 className="text-sm font-semibold text-[var(--dm-text)]">
                Responsible Vulnerability Disclosure &amp; Security Contact
              </h3>
            </div>
            <div className="text-xs text-[var(--dm-muted)] space-y-2 leading-relaxed">
              <p>
                If you believe you have discovered a security vulnerability in DocuMind AI, we welcome and encourage
                responsible disclosure. Please submit detailed reproduction steps to our security engineering team at:
              </p>
              <p>
                <a
                  href={`mailto:${BUSINESS_INFO.email}`}
                  className="font-mono text-xs font-semibold text-[var(--dm-accent)] hover:underline"
                >
                  {BUSINESS_INFO.email}
                </a>
              </p>
              <p className="text-[11px] text-[var(--dm-muted)]">
                We review security reports within 24 hours and commit to not pursuing legal action against researchers acting in good faith.
              </p>
            </div>
          </div>

          {/* Bottom Links */}
          <div className="pt-6 border-t border-[var(--dm-border)] flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--dm-muted)]">
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Privacy Policy (DPDP &amp; GDPR)
              </Link>
              <Link href="/terms" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Terms of Service
              </Link>
            </div>
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 font-semibold text-[var(--dm-accent)] hover:underline"
            >
              <span>Launch Document Studio</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </div>
        </div>
      </main>
    </div>
  );
}
