import Link from "next/link";
import {
  Scale,
  ShieldCheck,
  FileText,
  AlertTriangle,
  Lock,
  Clock,
  ArrowRight,
  CheckCircle2,
  HelpCircle,
  Building,
} from "lucide-react";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { Navbar } from "@/components/Navbar";
import { buildPageMetadata, BUSINESS_INFO } from "@/lib/siteConfig";

export const metadata = buildPageMetadata({
  title: "Terms of Service",
  description:
    "DocuMind AI Terms of Service covering document ownership, guest mode lifecycle, acceptable use, compression fidelity, and legal governing terms.",
  path: "/terms",
});

export default function TermsPage() {
  const lastUpdated = "November 11, 2026";

  const keyPoints = [
    {
      icon: ShieldCheck,
      title: "100% Document Ownership",
      desc: "You retain all intellectual property rights and copyrights over uploaded and generated files.",
    },
    {
      icon: Lock,
      title: "Zero Model Training",
      desc: "Your files and extracted text are strictly never used to train or tune AI models.",
    },
    {
      icon: Clock,
      title: "1-Hour Guest Auto-Deletion",
      desc: "Ephemeral guest sessions and all associated storage artifacts hard-delete after 60 minutes.",
    },
    {
      icon: FileText,
      title: "Honest Compression Metrics",
      desc: "All byte and visual reduction measurements reflect physical output file realities.",
    },
  ];

  const sections = [
    {
      id: "acceptance",
      num: "01",
      title: "Acceptance & Eligibility",
      content: (
        <div className="space-y-3">
          <p>
            By accessing or using DocuMind AI (&quot;the Service&quot;), including our web interface,
            REST APIs, guest tools, or background document worker pipelines, you enter into a legally
            binding agreement with {BUSINESS_INFO.legalName} (&quot;DocuMind AI&quot;, &quot;we&quot;, &quot;our&quot;, or &quot;us&quot;).
          </p>
          <p>
            If you do not agree to these Terms of Service, do not access or use the Service. You must be at least 18
            years of age (or the age of majority in your jurisdiction) or possess valid parental or legal guardian consent
            to use DocuMind AI.
          </p>
        </div>
      ),
    },
    {
      id: "scope-of-services",
      num: "02",
      title: "Scope of Services & Tooling",
      content: (
        <div className="space-y-3">
          <p>
            DocuMind AI provides high-performance, privacy-centric document intelligence software, including:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">Multi-format Document Conversion:</strong> Bi-directional transformation between PDF, Microsoft Office (DOCX, XLSX, PPTX), CSV, and image formats.</li>
            <li><strong className="text-[var(--dm-text)]">Target-Size Compression:</strong> Exact kilobyte (KB) budgeting and visual optimization pipelines.</li>
            <li><strong className="text-[var(--dm-text)]">Optical Character Recognition (OCR):</strong> Bilingual text extraction in English and Tamil (தமிழ்) with layout preservation.</li>
            <li><strong className="text-[var(--dm-text)]">Government Exam Photo &amp; Signature Resizing:</strong> Automated passport, signature, and stamp dimension and DPI re-rendering for official portals.</li>
            <li><strong className="text-[var(--dm-text)]">Document Intelligence:</strong> Grounded question answering and table extraction strictly scoped to your uploaded files.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "ownership-and-ip",
      num: "03",
      title: "Document Ownership & Intellectual Property",
      content: (
        <div className="space-y-3">
          <p>
            <strong className="text-[var(--dm-text)]">Your Content Remains Yours:</strong> You retain complete and unencumbered ownership of all documents, images, text, and datasets you submit to DocuMind AI. We claim zero proprietary or copyright interest in your materials.
          </p>
          <p>
            <strong className="text-[var(--dm-text)]">Limited Operational License:</strong> Solely for the technical purpose of executing requested conversions, compression, OCR, and storage, you grant DocuMind AI a non-exclusive, worldwide, royalty-free license to ingest, parse, transform, and serve your files back to your authenticated session. This operational license terminates automatically upon file deletion.
          </p>
          <p>
            <strong className="text-[var(--dm-text)]">No AI Training:</strong> Under no circumstances do we train, fine-tune, distill, or evaluate foundation models, public LLMs, or proprietary models using your submitted documents or extracted text.
          </p>
        </div>
      ),
    },
    {
      id: "guest-mode",
      num: "04",
      title: "Guest Mode & Ephemeral Lifecycles",
      content: (
        <div className="space-y-3">
          <p>
            Users who access document conversion or compression tools without signing in operate under <strong className="text-[var(--dm-text)]">Guest Mode</strong>:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li>Guest files are linked to an ephemeral session identifier stored in client session storage.</li>
            <li>Guest files, generated artifacts, thumbnails, and database records are scheduled for automated cryptographic hard deletion after exactly <strong className="text-[var(--dm-text)]">1 hour (60 minutes)</strong> from upload.</li>
            <li>Guest users can invoke the <span className="font-semibold text-[var(--dm-text)]">Delete Now</span> button at any moment to trigger an immediate, synchronous wipe of storage and database rows.</li>
            <li>Once deleted, guest files cannot be recovered by you or by our engineering team.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "acceptable-use",
      num: "05",
      title: "Acceptable Use & Prohibited Conduct",
      content: (
        <div className="space-y-3">
          <p>You agree not to use DocuMind AI to upload, process, or disseminate:</p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li>Malicious executables, embedded macro-viruses, decompression bombs (zip bombs), or zero-day exploits.</li>
            <li>Unlawful materials, non-consensual media, or content violating intellectual property rights of third parties.</li>
            <li>Automated scraping bots or distributed traffic intended to bypass rate limits or compromise server availability.</li>
            <li>Credentials, authorization headers, or access tokens belonging to other users.</li>
          </ul>
          <p>
            All uploads pass through automated validation, magic-byte verification, and malware scans. Attempts to probe or breach backend sandboxes or database partitions will result in immediate IP termination and, where warranted, referral to statutory authorities.
          </p>
        </div>
      ),
    },
    {
      id: "conversion-disclaimer",
      num: "06",
      title: "Processing Fidelity & Accuracy Disclaimers",
      content: (
        <div className="space-y-3">
          <p>
            DocuMind AI employs industry-standard rendering engines (including LibreOffice, Ghostscript, pdfplumber, and Tesseract OCR) to execute transformations:
          </p>
          <ul className="list-disc list-inside space-y-1.5 pl-2 text-[var(--dm-muted)]">
            <li><strong className="text-[var(--dm-text)]">Target File Size Compression:</strong> Aggressive compression to satisfy strict government portal criteria (e.g. sub-50 KB limits) may unavoidably degrade image resolution or vectorize complex gradients. Always preview compressed outputs prior to official submission.</li>
            <li><strong className="text-[var(--dm-text)]">OCR Confidence:</strong> OCR accuracy depends heavily on input image resolution, lighting, angle, and handwritten variance. High-stakes legal or financial records should be manually verified.</li>
            <li><strong className="text-[var(--dm-text)]">Spreadsheet Table Reconstruction:</strong> Multi-line merged cells or nested headers in scanned PDFs may require manual adjustment post-conversion.</li>
          </ul>
        </div>
      ),
    },
    {
      id: "quotas-and-availability",
      num: "07",
      title: "Service Availability & Rate Limits",
      content: (
        <div className="space-y-3">
          <p>
            DocuMind AI provides cloud services on a commercially reasonable best-effort availability standard. While our architecture utilizes redundant worker pools, services may periodically experience scheduled maintenance or localized downtime.
          </p>
          <p>
            Rate limits are enforced at the API gateway layer per IP address and authenticated user account to safeguard service stability for all users. Excessive concurrency or abusive throughput may trigger temporary HTTP 429 (Too Many Requests) backoff responses.
          </p>
        </div>
      ),
    },
    {
      id: "limitation-of-liability",
      num: "08",
      title: "Limitation of Liability",
      content: (
        <div className="space-y-3">
          <p>
            TO THE MAXIMUM EXTENT PERMITTED UNDER APPLICABLE LAW, DOCUMIND AI AND ITS DIRECTORS, EMPLOYEES, AND PARTNERS SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL, OR PUNITIVE DAMAGES, INCLUDING LOSS OF DATA, REVENUE, GOODWILL, OR REGISTRATION DEADLINES, ARISING FROM THE USE OR INABILITY TO USE THE SERVICES.
          </p>
          <p>
            IN NO EVENT SHALL OUR AGGREGATE LIABILITY EXCEED THE GREATER OF THE AMOUNT PAID BY YOU TO DOCUMIND AI OVER THE PRECEDING THREE (3) MONTHS OR ONE THOUSAND INDIAN RUPEES (INR 1,000).
          </p>
        </div>
      ),
    },
    {
      id: "account-deletion",
      num: "09",
      title: "Account Termination & Complete Erasure",
      content: (
        <div className="space-y-3">
          <p>
            You may terminate your account at any time directly through <strong className="text-[var(--dm-text)]">Settings &gt; Account &gt; Delete Account</strong>.
          </p>
          <p>
            Upon executing account deletion, our backend initiates an immediate cryptographic wipe of your user credentials, workspaces, document records, audit trails, and physical files stored in S3/MinIO buckets. This action is irreversible.
          </p>
        </div>
      ),
    },
    {
      id: "governing-law",
      num: "10",
      title: "Governing Law & Dispute Resolution",
      content: (
        <div className="space-y-3">
          <p>
            These Terms of Service are governed by and construed in accordance with the laws of the Republic of India, including the Information Technology Act, 2000, and the Digital Personal Data Protection (DPDP) Act, 2023.
          </p>
          <p>
            Any disputes arising out of or related to these Terms shall be subject to the exclusive jurisdiction of the competent courts situated in <strong className="text-[var(--dm-text)]">Chennai, Tamil Nadu, India</strong>.
          </p>
        </div>
      ),
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />
      <main className="flex-1 dm-grid-bg">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 py-12 sm:py-16 space-y-10">
          <Breadcrumbs items={[{ label: "Home", href: "/" }, { label: "Terms of Service" }]} />

          {/* Header */}
          <div className="space-y-4 max-w-3xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/25 bg-indigo-500/10 text-indigo-400 text-xs font-medium">
              <Scale className="h-3.5 w-3.5" />
              <span>User Agreement &amp; Operating Terms</span>
            </div>
            <h1 className="text-3xl sm:text-5xl font-bold tracking-tight text-[var(--dm-text)]">
              Terms of Service
            </h1>
            <p className="text-sm sm:text-base text-[var(--dm-muted)] leading-relaxed">
              Transparent, fair, and legally binding terms governing your usage of DocuMind AI document
              conversion, target compression, OCR, and private document workspaces.
            </p>
            <p className="text-xs text-[var(--dm-muted)] font-mono">
              Last updated: {lastUpdated} • Version 2.4.0
            </p>
          </div>

          {/* Key Principles at a Glance */}
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {keyPoints.map((item) => {
              const Icon = item.icon;
              return (
                <div
                  key={item.title}
                  className="p-5 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-card)]/70 backdrop-blur-xs space-y-2.5 shadow-xs"
                >
                  <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-400">
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
                  Table of Contents
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
                <p className="font-semibold text-[var(--dm-text)]">Have questions?</p>
                <p className="text-[11px] text-[var(--dm-muted)]">
                  Reach our legal compliance team directly at:
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
                    <span className="font-mono text-xs px-2 py-0.5 rounded-md bg-[var(--dm-subtle)] border border-[var(--dm-border)] text-[var(--dm-accent)] font-semibold">
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

              {/* Legal Entity & Contact Footer Box */}
              <div className="p-6 sm:p-8 rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-subtle)]/70 space-y-4">
                <div className="flex items-center gap-2">
                  <Building className="h-4 w-4 text-[var(--dm-accent)]" />
                  <h3 className="text-sm font-semibold text-[var(--dm-text)]">
                    Legal Identity &amp; Contact Details
                  </h3>
                </div>
                <div className="text-xs text-[var(--dm-muted)] space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-[var(--dm-text)]">{BUSINESS_INFO.legalName}</p>
                  <p>{BUSINESS_INFO.address.streetAddress}</p>
                  <p>
                    {BUSINESS_INFO.address.addressLocality}, {BUSINESS_INFO.address.addressRegion} - {BUSINESS_INFO.address.postalCode}, {BUSINESS_INFO.address.addressCountry}
                  </p>
                  <p>
                    Inquiries &amp; Notices:{" "}
                    <a href={`mailto:${BUSINESS_INFO.email}`} className="text-[var(--dm-accent)] hover:underline">
                      {BUSINESS_INFO.email}
                    </a>{" "}
                    • Phone: {BUSINESS_INFO.telephone}
                  </p>
                </div>
              </div>
            </div>
          </div>

          {/* Navigation Links */}
          <div className="pt-6 border-t border-[var(--dm-border)] flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--dm-muted)]">
            <div className="flex flex-wrap gap-4">
              <Link href="/privacy" className="hover:text-[var(--dm-text)] underline underline-offset-4">
                Privacy Policy (DPDP &amp; GDPR)
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
