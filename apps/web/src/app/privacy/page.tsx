import Link from "next/link";
import {
  ShieldCheck,
  Lock,
  Clock,
  Trash2,
  FileText,
  ArrowRight,
  EyeOff,
  Building,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata, BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Privacy Policy (DPDP Act & GDPR Compliant)",
  description:
    "How DocuMind AI protects your privacy: zero AI model training, automated 1-hour guest mode deletion, encrypted private storage, and full Data Principal rights.",
  path: "/privacy",
});

export default function PrivacyPage() {
  const lastUpdated = "November 11, 2026";

  const highlights = [
    {
      icon: EyeOff,
      title: "Zero AI Model Training",
      desc: "Your files, extracted text, and OCR data are never used to train, fine-tune, or evaluate AI models.",
    },
    {
      icon: Clock,
      title: "1-Hour Guest Auto-Delete",
      desc: "Unauthenticated guest uploads, conversions, and database records are permanently purged after 60 minutes.",
    },
    {
      icon: Lock,
      title: "Private Object Storage",
      desc: "Files reside encrypted at rest (AES-256) with short-lived pre-signed URLs—never public or crawled.",
    },
    {
      icon: Trash2,
      title: "Complete Self-Serve Erasure",
      desc: "Execute one-click instant account and document deletion from Settings anytime.",
    },
  ];

  const sections = [
    {
      id: "scope",
      num: "01",
      title: "Regulatory Scope & Data Controller",
      content: (
        <div className="space-y-3">
          <p>
            This Privacy Policy explains how {BUSINESS_INFO.legalName} (&quot;DocuMind AI&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;)
            collects, processes, secures, and purges personal data and document content when you use our web platform,
            document studio, and APIs.
          </p>
          <p>
            We adhere to statutory data protection frameworks globally, specifically:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">India:</strong> Digital Personal Data Protection (DPDP) Act, 2023, and Information Technology (Reasonable Security Practices and Procedures and Sensitive Personal Data or Information) Rules, 2011.</li>
            <li><strong className="text-[var(--dm-text)]">European Union &amp; UK:</strong> General Data Protection Regulation (GDPR / UK-GDPR).</li>
            <li><strong className="text-[var(--dm-text)]">United States:</strong> California Consumer Privacy Act as amended by CPRA (CCPA/CPRA).</li>
          </ul>
        </div>
      ),
    },
    {
      id: "no-ai-training",
      num: "02",
      title: "Zero AI Model Training Guarantee",
      content: (
        <div className="space-y-3">
          <p>
            <strong className="text-[var(--dm-text)]">Our Foundational Pledge:</strong> We believe your documents belong to you. DocuMind AI does not sell, license, share, or monetize user data.
          </p>
          <p>
            Specifically, we strictly prohibit and technically prevent:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li>Using customer document files, OCR streams, table extractions, or chat prompts to train, retrain, fine-tune, or align public or proprietary machine learning models or Large Language Models (LLMs).</li>
            <li>Retaining customer content for unsupervised dataset accumulation or vendor data marketplaces.</li>
            <li>Passing unauthenticated document content to third-party public LLM providers without explicit user instruction.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "data-we-collect",
      num: "03",
      title: "Categories of Data We Process",
      content: (
        <div className="space-y-4">
          <p>We process only the minimum data required to deliver high-performance document tools:</p>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-text)]">
              A. Account Data (Registered Users Only)
            </h4>
            <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
              When creating an account, we store your email address, securely hashed password (utilizing Argon2id with unique cryptographic salts), account creation timestamps, and workspace configuration preferences.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-text)]">
              B. Document Content &amp; Processing Payloads
            </h4>
            <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
              Files uploaded for conversion (PDF, DOCX, XLSX, PPTX, images), target-KB compressed files, OCR crops, and generated outputs. These are stored in private object storage buckets and accessible only via short-lived, cryptographically signed URLs bound to your authenticated user ID or ephemeral guest session.
            </p>
          </div>

          <div className="space-y-2">
            <h4 className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-text)]">
              C. Security &amp; Audit Telemetry
            </h4>
            <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
              To defend against distributed denial-of-service (DDoS) attacks, brute-force authentication attempts, and malicious decompression bombs, we collect minimal operational logs (IP address, user agent, request timestamps, and HTTP response codes). These security logs rotate and purge automatically after 14 days.
            </p>
          </div>
        </div>
      ),
    },
    {
      id: "guest-mode",
      num: "04",
      title: "Ephemeral Guest Mode Lifecycle (1 Hour)",
      content: (
        <div className="space-y-3">
          <p>
            DocuMind AI provides unrestricted access to single-file conversion and compression tools without requiring an account. To protect guest privacy:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">Isolated Ephemeral Scope:</strong> Guest uploads are segregated using random cryptographic session IDs stored purely in client-side session storage.</li>
            <li><strong className="text-[var(--dm-text)]">Automated 1-Hour Hard Purge:</strong> An automated background cleanup worker audits and executes hard deletions of all guest files, thumbnails, and conversion artifacts exactly 60 minutes after upload.</li>
            <li><strong className="text-[var(--dm-text)]">Immediate Delete Now Action:</strong> Guest tools include an instant &quot;Delete Now&quot; button that initiates an immediate, synchronous deletion from both S3 object storage and metadata caches.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "retention-and-trash",
      num: "05",
      title: "Retention Schedules & 30-Day Trash Recovery",
      content: (
        <div className="space-y-3">
          <p>
            For registered accounts, documents remain available in your private workspace until you move them to Trash or delete them:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">30-Day Soft Delete Safety Net:</strong> Files sent to Trash are hidden from active workspace views and retained for 30 days, allowing users to restore mistakenly deleted documents.</li>
            <li><strong className="text-[var(--dm-text)]">Permanent Trash Purge:</strong> Clicking &quot;Empty Trash&quot; immediately triggers permanent cryptographic deletion across all storage backends. Expired trash files are automatically purged by our lifecycle daemon after 30 days.</li>
            <li><strong className="text-[var(--dm-text)]">Immutable Original Versions:</strong> Edits to documents generate discrete versions; the original file remains uncorrupted and intact until explicitly deleted by you.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "security-measures",
      num: "06",
      title: "Technical & Architectural Security Safeguards",
      content: (
        <div className="space-y-3">
          <p>
            DocuMind AI implements multi-tiered defense-in-depth controls across every stage of file ingestion and processing:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">Encryption Standards:</strong> All data in transit is encrypted using modern TLS 1.3. Stored documents and database partitions are encrypted at rest using industry-standard AES-256.</li>
            <li><strong className="text-[var(--dm-text)]">Sandboxed Conversion Workers:</strong> File transformation routines (LibreOffice, Ghostscript, pdfplumber, Tesseract) run inside hardened, unprivileged container sandboxes with read-only root filesystems and restricted outbound network access.</li>
            <li><strong className="text-[var(--dm-text)]">Malware &amp; Script Neutralization:</strong> Incoming PDFs are scanned by ClamAV and stripped of executable JavaScript tags, active form actions, and malicious embedded objects before processing.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "data-rights",
      num: "07",
      title: "Your Rights as a Data Principal / Data Subject",
      content: (
        <div className="space-y-3">
          <p>
            Under the DPDP Act (Sections 11–14) and GDPR (Articles 15–22), you possess comprehensive legal rights regarding your personal information:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">Right to Access &amp; Summary:</strong> Inspect the full history of your uploaded documents, active conversions, and security audit logs directly within the App dashboard.</li>
            <li><strong className="text-[var(--dm-text)]">Right to Correction:</strong> Update your profile, email address, OCR language preferences, and document metadata at any time.</li>
            <li><strong className="text-[var(--dm-text)]">Right to Erasure (Right to be Forgotten):</strong> Permanently delete specific files or purge your complete account and all associated documents from <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">Settings &gt; Delete Account</span>.</li>
            <li><strong className="text-[var(--dm-text)]">Right to Grievance Redressal:</strong> Submit inquiries or complaints directly to our designated Data Protection Officer with guaranteed review within 48 hours.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "cookies",
      num: "08",
      title: "Cookies & Storage Tokens",
      content: (
        <div className="space-y-3">
          <p>
            DocuMind AI respects browser privacy. We do not use third-party behavioral advertising cookies, affiliate tracking beacons, or cross-site fingerprinting scripts.
          </p>
          <p>
            Our web application uses only strictly necessary first-party storage primitives:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">Authentication Tokens:</strong> Secure <code className="font-mono text-xs">httpOnly</code>, <code className="font-mono text-xs">SameSite=Lax</code> session tokens protecting access to your private workspaces.</li>
            <li><strong className="text-[var(--dm-text)]">Interface Preferences:</strong> Local storage values storing your selected UI theme (dark/light/system), sidebar layout state, and default OCR language selection.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "subprocessors",
      num: "09",
      title: "Infrastructure & Subprocessors",
      content: (
        <div className="space-y-3">
          <p>
            We partner exclusively with verified enterprise cloud infrastructure providers operating under strict Data Processing Agreements (DPAs):
          </p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs border border-[var(--dm-border)] rounded-xl overflow-hidden">
              <thead className="bg-[var(--dm-subtle)] text-[var(--dm-text)] text-left">
                <tr>
                  <th className="p-3 font-semibold border-b border-[var(--dm-border)]">Provider Role</th>
                  <th className="p-3 font-semibold border-b border-[var(--dm-border)]">Function</th>
                  <th className="p-3 font-semibold border-b border-[var(--dm-border)]">Data Handled</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--dm-border)] text-[var(--dm-muted)]">
                <tr>
                  <td className="p-3 font-medium text-[var(--dm-text)]">Object Storage (MinIO / S3)</td>
                  <td className="p-3">Encrypted document storage at rest (AES-256)</td>
                  <td className="p-3">Customer files and converted outputs</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium text-[var(--dm-text)]">Database &amp; Redis Cache</td>
                  <td className="p-3">Relational metadata, audit logs, job queues</td>
                  <td className="p-3">User IDs, document metadata, hashes</td>
                </tr>
                <tr>
                  <td className="p-3 font-medium text-[var(--dm-text)]">Transactional Email Service</td>
                  <td className="p-3">Password resets and security verification notices</td>
                  <td className="p-3">User email address only</td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      ),
    },
    {
      id: "dpo-contact",
      num: "10",
      title: "Data Protection Officer & Grievance Redressal",
      content: (
        <div className="space-y-3">
          <p>
            Pursuant to Section 8(9) of the Digital Personal Data Protection Act, 2023, and Article 37 of the GDPR,
            DocuMind AI has appointed a dedicated Data Protection Officer to oversee compliance and address grievances.
          </p>
          <div className="p-4 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)]/70 space-y-2 text-xs">
            <p><strong className="text-[var(--dm-text)]">Designation:</strong> Data Protection &amp; Grievance Redressal Officer</p>
            <p><strong className="text-[var(--dm-text)]">Entity:</strong> {BUSINESS_INFO.legalName}</p>
            <p><strong className="text-[var(--dm-text)]">Location:</strong> {BUSINESS_INFO.address.addressLocality}, {BUSINESS_INFO.address.addressRegion}, India</p>
            <p>
              <strong className="text-[var(--dm-text)]">Direct Email:</strong>{" "}
              <a href={`mailto:${BUSINESS_INFO.email}`} className="text-[var(--dm-accent)] hover:underline font-mono">
                {BUSINESS_INFO.email}
              </a>
            </p>
            <p className="text-[11px] text-[var(--dm-muted)]">
              Statutory response window: Inquiries are acknowledged within 24 hours and resolved within 7 business days.
            </p>
          </div>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Privacy Policy" }]} />

          {/* Header */}
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>India DPDP Act 2023 &amp; GDPR Compliant</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--dm-text)]">
              Privacy Policy
            </h1>
            <p className="text-sm sm:text-base text-[var(--dm-muted)] leading-relaxed">
              We engineer DocuMind AI with a strict privacy-first foundation: your documents belong solely to you,
              we never train models on your data, and guest sessions auto-purge after 60 minutes.
            </p>
            <p className="text-xs text-[var(--dm-muted)] font-mono">
              Last updated: {lastUpdated} • Version 2.4.0
            </p>
          </div>

          {/* Key Privacy Highlights */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {highlights.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="p-5 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-card)]/70 backdrop-blur-xs space-y-2.5 shadow-xs"
                >
                  <div className="h-9 w-9 rounded-xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-400">
                    <Icon className="h-4 w-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-[var(--dm-text)]">{item.title}</h3>
                  <p className="text-xs text-[var(--dm-muted)] leading-relaxed">{item.desc}</p>
                </div>
              );
            })}
          </div>

          {/* Quick Table of Contents & Sections */}
          <div className="grid lg:grid-cols-12 gap-8 items-start">
            {/* Sticky Table of Contents on Desktop */}
            <aside className="lg:col-span-4 hidden lg:block sticky top-24 space-y-4 p-5 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-card)]">
              <div className="flex items-center gap-2 pb-2 border-b border-[var(--dm-border)]">
                <FileText className="h-4 w-4 text-[var(--dm-accent)]" />
                <span className="text-xs font-semibold tracking-wider uppercase text-[var(--dm-text)]">
                  Privacy Sections
                </span>
              </div>
              <nav className="space-y-1 text-xs">
                {sections.map((s) => (
                  <a
                    key={s.id}
                    href={`#${s.id}`}
                    className="flex items-center justify-between py-1.5 px-2 rounded-lg text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] transition-colors"
                  >
                    <span className="truncate">{s.title}</span>
                    <span className="font-mono text-[10px] text-[var(--dm-muted)]">{s.num}</span>
                  </a>
                ))}
              </nav>

              <div className="pt-3 border-t border-[var(--dm-border)] text-xs space-y-2">
                <p className="font-semibold text-[var(--dm-text)]">Data Protection Officer</p>
                <p className="text-[11px] text-[var(--dm-muted)]">
                  Contact our compliance desk for access or deletion requests:
                </p>
                <a
                  href={`mailto:${BUSINESS_INFO.email}`}
                  className="inline-block text-xs font-mono text-[var(--dm-accent)] hover:underline"
                >
                  {BUSINESS_INFO.email}
                </a>
              </div>
            </aside>

            {/* Main Sections */}
            <div className="lg:col-span-8 space-y-8">
              {sections.map((section) => (
                <article
                  key={section.id}
                  id={section.id}
                  className="scroll-mt-24 p-6 sm:p-8 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-card)] space-y-4 shadow-xs"
                >
                  <div className="flex items-center gap-3">
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[var(--dm-subtle)] border border-[var(--dm-border)] text-emerald-400 font-semibold">
                      {section.num}
                    </span>
                    <h2 className="text-lg sm:text-xl font-bold tracking-tight text-[var(--dm-text)]">
                      {section.title}
                    </h2>
                  </div>
                  <div className="text-sm text-[var(--dm-muted)] leading-relaxed space-y-3">
                    {section.content}
                  </div>
                </article>
              ))}

              {/* Legal Entity & Headquarters Box */}
              <div className="p-6 sm:p-8 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-subtle)]/70 space-y-4">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-[var(--dm-accent)]" />
                  <h3 className="text-sm font-semibold text-[var(--dm-text)]">
                    Operating Entity &amp; Headquarters
                  </h3>
                </div>
                <div className="text-xs text-[var(--dm-muted)] space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-[var(--dm-text)]">{BUSINESS_INFO.legalName}</p>
                  <p>{BUSINESS_INFO.address.streetAddress}</p>
                  <p>
                    {BUSINESS_INFO.address.addressLocality}, {BUSINESS_INFO.address.addressRegion} - {BUSINESS_INFO.address.postalCode}, {BUSINESS_INFO.address.addressCountry}
                  </p>
                  <p>
                    Email:{" "}
                    <a href={`mailto:${BUSINESS_INFO.email}`} className="text-[var(--dm-accent)] hover:underline">
                      {BUSINESS_INFO.email}
                    </a>{" "}
                    • Customer Support: {BUSINESS_INFO.telephone}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="pt-6 border-t border-[var(--dm-border)] flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--dm-muted)]">
            <div className="flex flex-wrap gap-4">
              <Link href="/terms" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Terms of Service
              </Link>
              <Link href="/security" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Security Architecture
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
