"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Check,
  ChevronDown,
  FileText,
  ShieldCheck,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useT } from "@/lib/i18n";

const DocuMindHeroDemo = dynamic(
  () => import("@/components/stageshow/DocuMindHeroDemo").then((m) => m.DocuMindHeroDemo),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="w-full min-h-[420px] sm:min-h-[480px] rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] animate-pulse"
      />
    ),
  }
);

const DocuMindBento = dynamic(
  () => import("@/components/stageshow/DocuMindBento").then((m) => m.DocuMindBento),
  {
    ssr: false,
    loading: () => (
      <div
        aria-hidden="true"
        className="w-full min-h-[520px] rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] animate-pulse"
      />
    ),
  }
);

export default function LandingPage() {
  const { t } = useT();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const steps = [
    {
      num: "01",
      title: "Drop a file or start in Guest Mode",
      desc: "No signup needed for core tools. Guest files auto-delete in 1 hour or instantly via 'Delete now'.",
    },
    {
      num: "02",
      title: "Pick a 3-click preset or type a command",
      desc: "Sensible defaults are pre-selected. Inspect the exact action plan and real size limits upfront.",
    },
    {
      num: "03",
      title: "Compare before/after & export",
      desc: "Verify page count, file size, and preview in PDF.js before downloading or saving a new version.",
    },
  ];

  const metrics = [
    { label: "Target Portal Precision", value: "< 100 KB" },
    { label: "Original File Overwrites", value: "0%" },
    { label: "PDF Encryption Standard", value: "AES-256" },
    { label: "Native Bilingual UI", value: "EN + தமிழ்" },
  ];

  const faqs = [
    {
      q: "Are my uploaded documents used to train AI models?",
      a: "No. Your documents stay private to your account or 1-hour guest session and are never used for model training.",
    },
    {
      q: "What happens if a PDF cannot be compressed under 100 KB?",
      a: "DocuMind AI never fakes metrics. It runs progressive stream and image optimization and honestly warns you if hitting the target requires splitting pages.",
    },
    {
      q: "Does DocuMind AI overwrite my original PDF when I edit or compress it?",
      a: "Never. Your original file stays untouched as v1. Every operation writes a new immutable version you can inspect or download anytime.",
    },
  ];

  return (
    <div className="min-h-screen flex flex-col bg-[var(--dm-bg)] dm-ambient-bg">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="relative overflow-hidden border-b border-[var(--dm-border)]">
          <div className="absolute inset-0 dm-grid-bg pointer-events-none opacity-60" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-16 sm:pt-24 pb-20">
            <motion.div
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="max-w-3xl mx-auto text-center space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs text-[var(--dm-muted)] font-medium shadow-xs">
                <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                <ShieldCheck className="h-3.5 w-3.5 text-slate-600 dark:text-slate-400" />
                <span className="text-[var(--dm-text)] font-medium">{t.hero.badge}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-semibold tracking-[-0.035em] leading-[1.08] text-[var(--dm-text)]">
                {t.hero.title.split(" ").slice(0, -3).join(" ")}{" "}
                <span className="dm-text-gradient">
                  {t.hero.title.split(" ").slice(-3).join(" ")}
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[var(--dm-muted)] max-w-2xl mx-auto leading-relaxed font-normal">
                {t.hero.subtitle}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/app"
                  className="dm-primary-btn inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-lg"
                >
                  <span>{t.hero.ctaGuest}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] hover:border-[var(--dm-border-strong)] transition-colors shadow-xs text-[var(--dm-text)]"
                >
                  <span>{t.hero.ctaSignup}</span>
                </Link>
              </div>

              <p className="text-xs text-[var(--dm-muted)] flex items-center justify-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-600 dark:text-emerald-400" />
                <span>{t.hero.trustNote}</span>
              </p>
            </motion.div>

            {/* Interactive Studio Showcase (stageshow) */}
            <motion.div
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.32, delay: 0.06, ease: "easeOut" }}
              className="mt-14"
            >
              <DocuMindHeroDemo />
            </motion.div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
              {metrics.map((m) => (
                <div key={m.label} className="dm-card px-4 py-4 text-center">
                  <p className="text-xl sm:text-2xl font-semibold font-mono tracking-tight text-[var(--dm-text)]">
                    {m.value}
                  </p>
                  <p className="text-xs text-[var(--dm-muted)] mt-1 font-medium">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bento Features */}
        <section id="features" className="py-20 border-b border-[var(--dm-border)] bg-[var(--dm-surface)]/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-mono font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Capabilities
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--dm-text)]">
                Built for real student &amp; research workflows
              </h2>
              <p className="text-sm text-[var(--dm-muted)] leading-relaxed">
                Every button triggers a real backend worker job with verifiable output—no mock percentages, no locked basic tools.
              </p>
            </div>
            <div className="mt-10">
              <DocuMindBento />
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="max-w-2xl space-y-2">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              Workflow
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--dm-text)]">
              Three clicks from upload to submission
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {steps.map((s) => (
              <div key={s.num} className="dm-card p-6 space-y-3 relative overflow-hidden">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-[var(--dm-subtle)] border border-[var(--dm-border)] font-mono text-xs font-semibold text-[var(--dm-text)]">
                  {s.num}
                </span>
                <h3 className="text-base font-semibold text-[var(--dm-text)]">{s.title}</h3>
                <p className="text-sm text-[var(--dm-muted)] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Transparent Pricing */}
        <section id="pricing" className="border-t border-[var(--dm-border)] bg-[var(--dm-surface)]/50 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-mono font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Pricing
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--dm-text)]">
                Free-first, honest pricing
              </h2>
              <p className="text-sm text-[var(--dm-muted)] leading-relaxed">
                Core PDF tools never require a credit card and never slap watermarks on your exports.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 mt-10">
              <div className="dm-card p-6 space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--dm-text)]">Free Forever</h3>
                    <p className="text-3xl font-semibold font-mono mt-2 text-[var(--dm-text)]">$0</p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[var(--dm-muted)]">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Compress-to-KB &amp; Photo Resizer</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Merge, Split, Rotate, Watermark</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Guest Mode (1-hr auto-delete)</li>
                  </ul>
                </div>
                <Link
                  href="/app"
                  className="w-full py-2.5 text-center text-xs font-medium rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] text-[var(--dm-text)] transition-colors shadow-xs"
                >
                  Start in Guest Mode
                </Link>
              </div>

              <div className="dm-elevated p-6 space-y-5 border-slate-400/60 dark:border-slate-600 relative flex flex-col justify-between ring-1 ring-slate-900/5 dark:ring-white/10">
                <span className="absolute -top-3 right-5 px-3 py-0.5 rounded-full text-[11px] font-medium bg-slate-900 text-white dark:bg-white dark:text-slate-900 shadow-xs">
                  Student Verified
                </span>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--dm-text)]">Student (.edu / .ac.in)</h3>
                    <p className="text-3xl font-semibold font-mono mt-2 text-[var(--dm-text)]">Discounted</p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[var(--dm-muted)]">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Everything in Free + Higher Limits</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Exam Mode &amp; College Templates</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Tamil OCR &amp; Study Notes</li>
                  </ul>
                </div>
                <Link
                  href="/register"
                  className="w-full py-2.5 text-center text-xs font-medium rounded-lg dm-primary-btn"
                >
                  Create Student Account
                </Link>
              </div>

              <div className="dm-card p-6 space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-base font-semibold text-[var(--dm-text)]">Institution &amp; Teams</h3>
                    <p className="text-3xl font-semibold font-mono mt-2 text-[var(--dm-text)]">Custom</p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[var(--dm-muted)]">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Shared Department Workspaces</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Dedicated Workers &amp; SSO-ready</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" /> Admin Usage &amp; Audit Dashboards</li>
                  </ul>
                </div>
                <Link
                  href="/security"
                  className="w-full py-2.5 text-center text-xs font-medium rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] text-[var(--dm-text)] transition-colors shadow-xs"
                >
                  Inspect Security Architecture
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 space-y-6">
          <script
            type="application/ld+json"
            dangerouslySetInnerHTML={{
              __html: JSON.stringify({
                "@context": "https://schema.org",
                "@type": "FAQPage",
                mainEntity: faqs.map((item) => ({
                  "@type": "Question",
                  name: item.q,
                  acceptedAnswer: {
                    "@type": "Answer",
                    text: item.a,
                  },
                })),
              }),
            }}
          />
          <div className="text-center space-y-2">
            <span className="text-xs font-mono font-medium uppercase tracking-wider text-slate-500 dark:text-slate-400">
              FAQ
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold tracking-tight text-[var(--dm-text)]">
              Honest answers, zero fine print
            </h2>
          </div>
          <div className="space-y-3">
            {faqs.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="dm-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-3 text-sm font-semibold hover:bg-[var(--dm-subtle)] transition-colors text-[var(--dm-text)]"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--dm-muted)] shrink-0 transition-transform ${
                        isOpen ? "rotate-180 text-[var(--dm-text)]" : ""
                      }`}
                    />
                  </button>
                  {isOpen && (
                    <div className="px-5 pb-4 text-sm text-[var(--dm-muted)] leading-relaxed border-t border-[var(--dm-border)] pt-3">
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      </main>

      {/* Footer */}
      <footer className="border-t border-[var(--dm-border)] bg-[var(--dm-surface)] py-12">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 space-y-8">
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8 text-xs">
            <div className="space-y-3">
              <div className="flex items-center gap-2.5">
                <span className="h-7 w-7 rounded-lg bg-slate-900 dark:bg-white flex items-center justify-center text-white dark:text-slate-900 shadow-xs">
                  <FileText className="h-3.5 w-3.5" />
                </span>
                <span className="font-semibold text-sm text-[var(--dm-text)]">{t.brand}</span>
              </div>
              <p className="text-[var(--dm-muted)] leading-relaxed">
                Privacy-first document and PDF studio with deterministic compression, OCR, and AI document intelligence.
              </p>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-semibold text-[var(--dm-text)] uppercase tracking-wider text-[11px]">
                Document Tools
              </h3>
              <ul className="space-y-2 text-[var(--dm-muted)]">
                <li><Link href="/app/tools/scan" className="hover:text-[var(--dm-text)] transition-colors">Auto Camera Scanner</Link></li>
                <li><Link href="/app/tools/compress" className="hover:text-[var(--dm-text)] transition-colors">PDF Compressor (&lt;100 KB)</Link></li>
                <li><Link href="/app/tools/photo-resizer" className="hover:text-[var(--dm-text)] transition-colors">Photo &amp; Exam Resizer</Link></li>
                <li><Link href="/app/tools/pdf" className="hover:text-[var(--dm-text)] transition-colors">PDF Page Workbench</Link></li>
                <li><Link href="/app/tools/convert" className="hover:text-[var(--dm-text)] transition-colors">Format Converter</Link></li>
                <li><Link href="/app/tools/ocr" className="hover:text-[var(--dm-text)] transition-colors">Multilingual OCR (EN + Tamil)</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-semibold text-[var(--dm-text)] uppercase tracking-wider text-[11px]">
                Studio &amp; AI
              </h3>
              <ul className="space-y-2 text-[var(--dm-muted)]">
                <li><Link href="/app" className="hover:text-[var(--dm-text)] transition-colors">Document Workspace</Link></li>
                <li><Link href="/app/intelligence" className="hover:text-[var(--dm-text)] transition-colors">AI Document Intelligence</Link></li>
                <li><Link href="/app/workflows" className="hover:text-[var(--dm-text)] transition-colors">Workflow Automation</Link></li>
                <li><Link href="/login" className="hover:text-[var(--dm-text)] transition-colors">Sign In</Link></li>
                <li><Link href="/register" className="hover:text-[var(--dm-text)] transition-colors">Create Free Account</Link></li>
              </ul>
            </div>

            <div className="space-y-2.5">
              <h3 className="font-semibold text-[var(--dm-text)] uppercase tracking-wider text-[11px]">
                Trust &amp; Legal
              </h3>
              <ul className="space-y-2 text-[var(--dm-muted)]">
                <li><Link href="/security" className="hover:text-[var(--dm-text)] transition-colors">Security Architecture</Link></li>
                <li><Link href="/privacy" className="hover:text-[var(--dm-text)] transition-colors">Privacy Policy</Link></li>
                <li><Link href="/terms" className="hover:text-[var(--dm-text)] transition-colors">Terms of Service</Link></li>
                <li><a href="/llms.txt" className="hover:text-[var(--dm-text)] transition-colors">AI Crawler Guide (llms.txt)</a></li>
              </ul>
            </div>
          </div>

          <div className="pt-6 border-t border-[var(--dm-border)] flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-[var(--dm-muted)]">
            <span>{t.brand} &bull; Privacy-first Document Studio</span>
            <span>Chennai, India &bull; Zero-training guarantee</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
