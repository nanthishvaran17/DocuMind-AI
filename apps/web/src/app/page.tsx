"use client";

import Link from "next/link";
import { useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  Check,
  ChevronDown,
  FileCheck2,
  FileText,
  GitBranch,
  Image as ImageIcon,
  Layers,
  Lock,
  Minimize2,
  ShieldCheck,
  Terminal,
  Zap,
} from "lucide-react";
import { Navbar } from "@/components/Navbar";
import { useT } from "@/lib/i18n";

export default function LandingPage() {
  const { t } = useT();
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  const features = [
    {
      icon: Minimize2,
      tag: "100KB / 200KB",
      accent: "from-indigo-500/20 to-indigo-500/5 text-indigo-500 dark:text-indigo-400 border-indigo-500/25",
      title: "Exact-KB Compression",
      desc: "Hit under 100 KB, 200 KB, 1 MB or 2 MB for scholarship and university portals with real before/after byte metrics.",
    },
    {
      icon: ImageIcon,
      tag: "300 DPI Ready",
      accent: "from-violet-500/20 to-violet-500/5 text-violet-500 dark:text-violet-400 border-violet-500/25",
      title: "Passport & Signature Resizer",
      desc: "One-click presets for Passport, GATE, UPSC, TNPSC and PAN with DPI metadata and background cleanup.",
    },
    {
      icon: Camera,
      tag: "Up to 30 pages",
      accent: "from-sky-500/20 to-sky-500/5 text-sky-500 dark:text-sky-400 border-sky-500/25",
      title: "Camera Scan to PDF",
      desc: "Snap lecture notes or lab records on mobile, auto-enhance contrast, and combine into a clean multi-page PDF.",
    },
    {
      icon: GitBranch,
      tag: "Non-destructive",
      accent: "from-emerald-500/20 to-emerald-500/5 text-emerald-500 dark:text-emerald-400 border-emerald-500/25",
      title: "Immutable Version History",
      desc: "Original uploads are never overwritten. Every merge, watermark, compression, or rotation creates v2, v3 with audit logs.",
    },
    {
      icon: Lock,
      tag: "AES-256 + AV",
      accent: "from-amber-500/20 to-amber-500/5 text-amber-500 dark:text-amber-400 border-amber-500/25",
      title: "Protect, Unlock & Sanitize",
      desc: "AES-256 PDF protection, strict password-only unlock, magic-byte validation, and automatic PDF JavaScript stripping.",
    },
    {
      icon: Terminal,
      tag: "Human-in-loop",
      accent: "from-rose-500/20 to-rose-500/5 text-rose-500 dark:text-rose-400 border-rose-500/25",
      title: "One-Box Command Bar",
      desc: "Type plain instructions like 'compress to 200 kb' or 'add page numbers' and approve the exact plan before execution.",
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
          <div className="absolute inset-0 dm-grid-bg pointer-events-none opacity-70" />
          <div className="relative max-w-7xl mx-auto px-4 sm:px-6 pt-14 sm:pt-20 pb-20">
            <motion.div
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.28, ease: "easeOut" }}
              className="max-w-3xl mx-auto text-center space-y-6"
            >
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full border border-indigo-500/30 bg-indigo-500/10 text-xs text-indigo-600 dark:text-indigo-300 font-medium backdrop-blur-sm">
                <span className="h-2 w-2 rounded-full bg-emerald-400 animate-pulse" />
                <ShieldCheck className="h-3.5 w-3.5" />
                <span>{t.hero.badge}</span>
              </div>

              <h1 className="text-4xl sm:text-5xl lg:text-[3.75rem] font-semibold tracking-tight leading-[1.06]">
                {t.hero.title.split(" ").slice(0, -3).join(" ")}{" "}
                <span className="dm-text-gradient">
                  {t.hero.title.split(" ").slice(-3).join(" ")}
                </span>
              </h1>

              <p className="text-base sm:text-lg text-[var(--dm-muted)] max-w-2xl mx-auto leading-relaxed">
                {t.hero.subtitle}
              </p>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/app"
                  className="dm-primary-btn inline-flex items-center gap-2 px-6 py-3 text-sm font-medium"
                >
                  <Zap className="h-4 w-4" />
                  <span>{t.hero.ctaGuest}</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>
                <Link
                  href="/register"
                  className="inline-flex items-center gap-2 px-6 py-3 text-sm font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-[var(--dm-border-strong)] transition-colors shadow-xs"
                >
                  <span>{t.hero.ctaSignup}</span>
                </Link>
              </div>

              <p className="text-xs text-[var(--dm-muted)] flex items-center justify-center gap-2">
                <Check className="h-3.5 w-3.5 text-emerald-500" />
                <span>{t.hero.trustNote}</span>
              </p>
            </motion.div>

            {/* Interactive Studio Showcase */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: 0.08, ease: "easeOut" }}
              className="mt-14 dm-elevated overflow-hidden border-[var(--dm-border-strong)]"
            >
              {/* Mock Window Bar */}
              <div className="px-4 sm:px-5 py-3 border-b border-[var(--dm-border)] bg-[var(--dm-subtle)] flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex items-center gap-1.5">
                    <span className="h-2.5 w-2.5 rounded-full bg-rose-500/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-amber-400/80" />
                    <span className="h-2.5 w-2.5 rounded-full bg-emerald-500/80" />
                  </div>
                  <div className="flex items-center gap-2 text-xs text-[var(--dm-muted)] font-mono">
                    <FileText className="h-3.5 w-3.5 text-indigo-400" />
                    <span>semester_5_assignment.pdf</span>
                    <span className="px-1.5 py-0.5 rounded bg-indigo-500/15 text-indigo-500 dark:text-indigo-300 text-[10px]">
                      v2 Compressed
                    </span>
                  </div>
                </div>
                <span className="text-xs px-2.5 py-1 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/25 font-mono font-medium">
                  1.42 MB → 184 KB • Target &lt; 200 KB met
                </span>
              </div>

              {/* 3-Pane Studio Showcase Body */}
              <div className="grid lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-[var(--dm-border)]">
                {/* Left Mini Rail */}
                <div className="lg:col-span-3 p-4 space-y-2.5 bg-[var(--dm-surface)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                    Version Timeline
                  </p>
                  <div className="p-2.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] flex items-center justify-between text-xs">
                    <div>
                      <p className="font-mono font-semibold">v1 Original</p>
                      <p className="text-[11px] text-[var(--dm-muted)]">1.42 MB • 5 pages</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full border border-[var(--dm-border)] text-[var(--dm-muted)]">
                      Safe
                    </span>
                  </div>
                  <div className="p-2.5 rounded-xl border border-indigo-500/40 bg-indigo-500/10 flex items-center justify-between text-xs">
                    <div>
                      <p className="font-mono font-semibold text-indigo-600 dark:text-indigo-300">
                        v2 Compressed
                      </p>
                      <p className="text-[11px] text-[var(--dm-muted)]">184 KB • -87% size</p>
                    </div>
                    <span className="text-[10px] px-2 py-0.5 rounded-full bg-indigo-500 text-white font-medium">
                      Active
                    </span>
                  </div>
                </div>

                {/* Center Canvas Preview */}
                <div className="lg:col-span-5 p-5 dm-dot-bg bg-[var(--dm-bg)] flex flex-col justify-between gap-4">
                  <div className="space-y-2">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium text-[var(--dm-muted)]">1. One-Box Command</span>
                      <span className="font-mono text-[10px] text-indigo-400">⌘K Ready</span>
                    </div>
                    <div className="rounded-xl border border-indigo-500/30 bg-[var(--dm-surface)] px-3.5 py-2.5 text-xs sm:text-sm font-mono flex items-center gap-2 shadow-sm">
                      <Terminal className="h-4 w-4 text-indigo-400 shrink-0" />
                      <span className="truncate">&ldquo;compress to 200 kb &amp; number pages&rdquo;</span>
                    </div>
                  </div>

                  <div className="rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] p-4 space-y-2.5">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-medium">Byte Compression Meter</span>
                      <span className="font-mono text-emerald-500 font-semibold">87.0% saved</span>
                    </div>
                    <div className="h-2 rounded-full bg-[var(--dm-subtle)] overflow-hidden">
                      <div className="h-full w-[87%] rounded-full bg-gradient-to-r from-indigo-500 via-violet-500 to-emerald-400" />
                    </div>
                    <p className="text-[11px] text-[var(--dm-muted)]">
                      5 / 5 pages verified • JavaScript stripped • SHA-256 checksum logged
                    </p>
                  </div>
                </div>

                {/* Right Preset Pills */}
                <div className="lg:col-span-4 p-4 space-y-3 bg-[var(--dm-surface)]">
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                    3-Click Portal Presets
                  </p>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {[
                      { k: "< 100 KB", v: "Scholarships" },
                      { k: "< 200 KB", v: "Govt Portals" },
                      { k: "413×531", v: "Passport Photo" },
                      { k: "350×350", v: "UPSC / TNPSC" },
                    ].map((pill) => (
                      <div
                        key={pill.k}
                        className="p-2.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)]"
                      >
                        <p className="font-mono font-semibold text-indigo-500 dark:text-indigo-300">
                          {pill.k}
                        </p>
                        <p className="text-[11px] text-[var(--dm-muted)] mt-0.5">{pill.v}</p>
                      </div>
                    ))}
                  </div>
                  <div className="pt-1 flex items-center gap-2 text-xs text-emerald-600 dark:text-emerald-400">
                    <FileCheck2 className="h-4 w-4 shrink-0" />
                    <span>Zero silent quality guesswork</span>
                  </div>
                </div>
              </div>
            </motion.div>

            {/* Metrics Bar */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-10">
              {metrics.map((m) => (
                <div key={m.label} className="dm-card px-4 py-4 text-center">
                  <p className="text-xl sm:text-2xl font-semibold font-mono dm-text-gradient">
                    {m.value}
                  </p>
                  <p className="text-xs text-[var(--dm-muted)] mt-1">{m.label}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* Bento Features */}
        <section id="features" className="py-20 border-b border-[var(--dm-border)] bg-[var(--dm-surface)]/50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                Capabilities
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold">
                Built for real student &amp; research workflows
              </h2>
              <p className="text-sm text-[var(--dm-muted)]">
                Every button triggers a real backend worker job with verifiable output—no mock percentages, no locked basic tools.
              </p>
            </div>
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4 mt-10">
              {features.map((f) => {
                const Icon = f.icon;
                return (
                  <div
                    key={f.title}
                    className="dm-card p-6 space-y-4 hover:border-indigo-500/40 hover:-translate-y-0.5 transition-all group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <div
                        className={`h-10 w-10 rounded-xl bg-gradient-to-br border flex items-center justify-center ${f.accent}`}
                      >
                        <Icon className="h-4.5 w-4.5" />
                      </div>
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border border-[var(--dm-border)] bg-[var(--dm-subtle)] text-[var(--dm-muted)]">
                        {f.tag}
                      </span>
                    </div>
                    <div>
                      <h3 className="text-base font-semibold group-hover:text-indigo-500 dark:group-hover:text-indigo-300 transition-colors">
                        {f.title}
                      </h3>
                      <p className="text-sm text-[var(--dm-muted)] mt-1.5 leading-relaxed">
                        {f.desc}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* How it works */}
        <section className="max-w-7xl mx-auto px-4 sm:px-6 py-20">
          <div className="max-w-2xl space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
              Workflow
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold">
              Three clicks from upload to submission
            </h2>
          </div>
          <div className="grid md:grid-cols-3 gap-5 mt-10">
            {steps.map((s) => (
              <div key={s.num} className="dm-card p-6 space-y-3 relative overflow-hidden">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-lg bg-indigo-500/15 border border-indigo-500/25 font-mono text-xs font-semibold text-indigo-500 dark:text-indigo-300">
                  {s.num}
                </span>
                <h3 className="text-lg font-semibold">{s.title}</h3>
                <p className="text-sm text-[var(--dm-muted)] leading-relaxed">{s.desc}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Transparent Pricing */}
        <section id="pricing" className="border-t border-[var(--dm-border)] bg-[var(--dm-surface)]/50 py-20">
          <div className="max-w-7xl mx-auto px-4 sm:px-6">
            <div className="max-w-2xl space-y-2">
              <span className="text-xs font-mono uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
                Pricing
              </span>
              <h2 className="text-2xl sm:text-3xl font-semibold">Free-first, honest pricing</h2>
              <p className="text-sm text-[var(--dm-muted)]">
                Core PDF tools never require a credit card and never slap watermarks on your exports.
              </p>
            </div>
            <div className="grid md:grid-cols-3 gap-6 mt-10">
              <div className="dm-card p-6 space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Free Forever</h3>
                    <p className="text-3xl font-semibold font-mono mt-2">$0</p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[var(--dm-muted)]">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Compress-to-KB &amp; Photo Resizer</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Merge, Split, Rotate, Watermark</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Guest Mode (1-hr auto-delete)</li>
                  </ul>
                </div>
                <Link
                  href="/app"
                  className="w-full py-2.5 text-center text-xs font-medium rounded-xl border border-[var(--dm-border)] hover:bg-[var(--dm-subtle)] transition-colors"
                >
                  Start in Guest Mode
                </Link>
              </div>

              <div className="dm-elevated p-6 space-y-5 border-indigo-500/50 relative flex flex-col justify-between">
                <span className="absolute -top-3 right-5 px-3 py-0.5 rounded-full text-[11px] font-medium bg-gradient-to-r from-indigo-500 to-violet-600 text-white shadow-sm">
                  Student Verified
                </span>
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Student (.edu / .ac.in)</h3>
                    <p className="text-3xl font-semibold font-mono mt-2 dm-text-gradient">Discounted</p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[var(--dm-muted)]">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Everything in Free + Higher Limits</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Exam Mode &amp; College Templates</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Tamil OCR &amp; Study Notes</li>
                  </ul>
                </div>
                <Link
                  href="/register"
                  className="w-full py-2.5 text-center text-xs font-medium dm-primary-btn"
                >
                  Create Student Account
                </Link>
              </div>

              <div className="dm-card p-6 space-y-5 flex flex-col justify-between">
                <div className="space-y-4">
                  <div>
                    <h3 className="text-lg font-semibold">Institution &amp; Teams</h3>
                    <p className="text-3xl font-semibold font-mono mt-2">Custom</p>
                  </div>
                  <ul className="space-y-2.5 text-sm text-[var(--dm-muted)]">
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Shared Department Workspaces</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Dedicated Workers &amp; SSO-ready</li>
                    <li className="flex items-center gap-2"><Check className="h-4 w-4 text-emerald-500 shrink-0" /> Admin Usage &amp; Audit Dashboards</li>
                  </ul>
                </div>
                <Link
                  href="/security"
                  className="w-full py-2.5 text-center text-xs font-medium rounded-xl border border-[var(--dm-border)] hover:bg-[var(--dm-subtle)] transition-colors"
                >
                  Inspect Security Architecture
                </Link>
              </div>
            </div>
          </div>
        </section>

        {/* FAQ */}
        <section className="max-w-3xl mx-auto px-4 sm:px-6 py-20 space-y-6">
          <div className="text-center space-y-2">
            <span className="text-xs font-mono uppercase tracking-wider text-indigo-500 dark:text-indigo-400">
              FAQ
            </span>
            <h2 className="text-2xl sm:text-3xl font-semibold">Honest answers, zero fine print</h2>
          </div>
          <div className="space-y-3">
            {faqs.map((item, idx) => {
              const isOpen = openFaq === idx;
              return (
                <div key={item.q} className="dm-card overflow-hidden">
                  <button
                    type="button"
                    onClick={() => setOpenFaq(isOpen ? null : idx)}
                    className="w-full px-5 py-4 text-left flex items-center justify-between gap-3 text-sm font-semibold hover:bg-[var(--dm-subtle)] transition-colors"
                  >
                    <span>{item.q}</span>
                    <ChevronDown
                      className={`h-4 w-4 text-[var(--dm-muted)] shrink-0 transition-transform ${
                        isOpen ? "rotate-180 text-indigo-400" : ""
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
      <footer className="border-t border-[var(--dm-border)] bg-[var(--dm-surface)] py-10">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 flex flex-col sm:flex-row items-center justify-between gap-4 text-xs text-[var(--dm-muted)]">
          <div className="flex items-center gap-2.5">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center text-white">
              <Layers className="h-3.5 w-3.5" />
            </span>
            <span className="font-semibold text-[var(--dm-text)]">{t.brand}</span>
            <span>• Privacy-first Document Studio</span>
          </div>
          <div className="flex flex-wrap items-center gap-5">
            <Link href="/app" className="hover:text-[var(--dm-text)]">Workspace</Link>
            <Link href="/app/tools/compress" className="hover:text-[var(--dm-text)]">Compress PDF</Link>
            <Link href="/security" className="hover:text-[var(--dm-text)]">Security</Link>
            <Link href="/privacy" className="hover:text-[var(--dm-text)]">Privacy</Link>
            <Link href="/terms" className="hover:text-[var(--dm-text)]">Terms</Link>
          </div>
        </div>
      </footer>
    </div>
  );
}
