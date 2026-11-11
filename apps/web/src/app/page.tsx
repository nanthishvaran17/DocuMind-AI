"use client";

import Link from "next/link";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  Check,
  FileCheck2,
  GitBranch,
  Image as ImageIcon,
  Lock,
  Minimize2,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useT } from "@/lib/i18n";

export default function LandingPage() {
  const { t } = useT();

  const features = [
    {
      icon: Minimize2,
      title: "Exact-KB Compression",
      desc: "Hit under 100 KB, 200 KB, 1 MB or 2 MB for scholarship and university portals with real before/after metrics.",
    },
    {
      icon: ImageIcon,
      title: "Passport & Signature Resizer",
      desc: "One-click presets for Passport, GATE, UPSC, TNPSC and PAN with DPI metadata and background cleanup.",
    },
    {
      icon: Camera,
      title: "Camera Scan to PDF",
      desc: "Snap lecture notes or lab records on mobile, auto-enhance contrast, and combine into a clean multi-page PDF.",
    },
    {
      icon: GitBranch,
      title: "Immutable Version History",
      desc: "Original uploads are never overwritten. Every merge, watermark, compression, or rotation creates v2, v3 with audit logs.",
    },
    {
      icon: Lock,
      title: "Protect, Unlock & Sanitize",
      desc: "AES-256 PDF protection, strict password-only unlock, magic-byte validation, and automatic PDF JavaScript stripping.",
    },
    {
      icon: Sparkles,
      title: "One-Box Command Bar",
      desc: "Type plain instructions like 'compress to 200 kb' or 'add page numbers' and approve the plan before execution.",
    },
  ];

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
    <div className="min-h-screen flex flex-col">
      <Navbar />

      <main className="flex-1">
        {/* Hero */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 pt-16 pb-20">
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.22, ease: "easeOut" }}
            className="max-w-3xl space-y-6"
          >
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-400 font-medium">
              <ShieldCheck className="h-3.5 w-3.5" />
              <span>{t.hero.badge}</span>
            </div>

            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-semibold tracking-tight leading-[1.08]">
              {t.hero.title}
            </h1>

            <p className="text-base sm:text-lg text-[var(--dm-muted)] max-w-2xl">
              {t.hero.subtitle}
            </p>

            <div className="flex flex-wrap items-center gap-3 pt-2">
              <Link
                href="/app"
                className="dm-primary-btn inline-flex items-center gap-2 px-5 py-3 text-sm font-medium"
              >
                <span>{t.hero.ctaGuest}</span>
                <ArrowRight className="h-4 w-4" />
              </Link>
              <Link
                href="/register"
                className="inline-flex items-center gap-2 px-5 py-3 text-sm font-medium rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-surface)] transition-colors"
              >
                <span>{t.hero.ctaSignup}</span>
              </Link>
            </div>

            <p className="text-xs text-[var(--dm-muted)] flex items-center gap-2">
              <Check className="h-3.5 w-3.5 text-emerald-500" />
              <span>{t.hero.trustNote}</span>
            </p>
          </motion.div>

          {/* Interactive Product Preview */}
          <div className="mt-12 dm-card p-5 sm:p-6">
            <div className="flex flex-wrap items-center justify-between gap-3 pb-4 border-b border-[var(--dm-border)]">
              <div className="flex items-center gap-2 text-xs text-[var(--dm-muted)] font-mono">
                <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" />
                <span>workspace / semester_5_assignment.pdf • v2 (Compressed)</span>
              </div>
              <span className="text-xs px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                1.42 MB → 184 KB (Target &lt; 200 KB met)
              </span>
            </div>
            <div className="grid md:grid-cols-3 gap-4 pt-5">
              <div className="dm-elevated p-4 space-y-2">
                <p className="text-xs font-medium text-[var(--dm-muted)]">1. Command Box</p>
                <p className="text-sm font-mono bg-[var(--dm-bg)] p-2.5 rounded border border-[var(--dm-border)]">
                  &ldquo;compress to 200 kb and add page numbers&rdquo;
                </p>
              </div>
              <div className="dm-elevated p-4 space-y-2">
                <p className="text-xs font-medium text-[var(--dm-muted)]">2. Honest Metrics</p>
                <p className="text-sm">
                  Real byte comparison, page count check (5/5), and quality warning when raster downsampling occurs.
                </p>
              </div>
              <div className="dm-elevated p-4 space-y-2">
                <p className="text-xs font-medium text-[var(--dm-muted)]">3. Immutable Versions</p>
                <p className="text-sm flex items-center gap-2">
                  <FileCheck2 className="h-4 w-4 text-indigo-400 shrink-0" />
                  <span>v1 Original preserved • v2 Export ready</span>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* Bento Features */}
        <section id="features" className="border-t border-[var(--dm-border)] bg-[var(--dm-surface)]/40 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-semibold">Built for real student & research workflows</h2>
            <p className="text-sm text-[var(--dm-muted)] mt-2 max-w-2xl">
              Every button triggers a real backend worker job with verifiable output—no mock percentages, no locked basic tools.
            </p>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div key={f.title} className="dm-card p-5 space-y-3 hover:border-indigo-500/40 transition-colors">
                    <div className="h-9 w-9 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
                      <Icon className="h-4 w-4 text-indigo-400" />
                    </div>
                    <h3 className="text-base font-semibold">{f.title}</h3>
                    <p className="text-sm text-[var(--dm-muted)]">{f.desc}</p>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <h2 className="text-2xl sm:text-3xl font-semibold">Three clicks from upload to submission</h2>
          <div className="grid md:grid-cols-3 gap-6 mt-10">
            {steps.map((s) => (
              <div key={s.num} className="dm-card p-6 space-y-2.5">
                <span className="font-mono text-xs text-indigo-400">{s.num}</span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-[var(--dm-muted)]">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Transparent Pricing */}
        <section id="pricing" className="border-t border-[var(--dm-border)] bg-[var(--dm-surface)]/40 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <h2 className="text-2xl sm:text-3xl font-semibold">Free-first, honest pricing</h2>
            <p className="text-sm text-[var(--dm-muted)] mt-2">
              Core PDF tools never require a credit card and never slap watermarks on your exports.
            </p>
            <div className="grid md:grid-cols-3 gap-6 mt-10">
              <div className="dm-card p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Free Forever</h3>
                  <p className="text-2xl font-semibold font-mono mt-1">$0</p>
                </div>
                <ul className="space-y-2 text-sm text-[var(--dm-muted)]">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Compress-to-KB & Photo Resizer</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Merge, Split, Rotate, Watermark</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Guest Mode (1-hr auto-delete)</li>
                </ul>
              </div>
              <div className="dm-card p-6 space-y-4 border-indigo-500/40">
                <div>
                  <h3 className="text-lg font-semibold">Student (.edu / .ac.in)</h3>
                  <p className="text-2xl font-semibold font-mono mt-1">Discounted</p>
                </div>
                <ul className="space-y-2 text-sm text-[var(--dm-muted)]">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Everything in Free + Higher Limits</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Exam Mode & College Templates (Phase 4–5)</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Tamil OCR & Study Notes (Phase 2–4)</li>
                </ul>
              </div>
              <div className="dm-card p-6 space-y-4">
                <div>
                  <h3 className="text-lg font-semibold">Institution & Teams</h3>
                  <p className="text-2xl font-semibold font-mono mt-1">Custom</p>
                </div>
                <ul className="space-y-2 text-sm text-[var(--dm-muted)]">
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Shared Department Workspaces</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Dedicated Workers & SSO-ready</li>
                  <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500" /> Admin Usage & Audit Dashboards</li>
                </ul>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-4xl mx-auto px-4 sm:px-6 py-20 space-y-6">
          <h2 className="text-2xl sm:text-3xl font-semibold">Frequently asked questions</h2>
          <div className="space-y-3">
            {faqs.map((item) => (
              <div key={item.q} className="dm-card p-5 space-y-1.5">
                <h3 className="text-base font-medium">{item.q}</h3>
                <p className="text-sm text-[var(--dm-muted)]">{item.a}</p>
              </div>
            ))}
          </div>
        </section>
      </main>

      <footer className="border-t border-[var(--dm-border)] py-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[var(--dm-muted)]">
          <span>DocuMind AI • Built with privacy & verifiable quality</span>
          <div className="flex items-center gap-5">
            <Link href="/privacy" className="hover:text-[var(--dm-text)]">Privacy Policy (DPDP & GDPR)</Link>
            <Link href="/terms" className="hover:text-[var(--dm-text)]">Terms</Link>
            <Link href="/security" className="hover:text-[var(--dm-text)]">Security</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
