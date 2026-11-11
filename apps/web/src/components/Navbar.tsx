"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { ArrowRight, FileText, Languages, Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";

export function Navbar() {
  const { t, locale, setLocale } = useT();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--dm-border)] bg-[var(--dm-glass)] backdrop-blur-xl">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 group">
          <span className="relative h-9 w-9 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center text-white shadow-md shadow-indigo-500/25 group-hover:scale-105 transition-transform">
            <FileText className="h-4 w-4" />
            <span className="absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full bg-emerald-400 border-2 border-[var(--dm-surface)]" />
          </span>
          <div className="flex flex-col leading-none">
            <span className="font-semibold text-[15px] tracking-tight flex items-center gap-1.5">
              {t.brand}
              <span className="hidden sm:inline-flex items-center text-[10px] font-mono uppercase px-1.5 py-0.5 rounded-full bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 border border-indigo-500/20">
                Studio
              </span>
            </span>
            <span className="text-[10px] text-[var(--dm-muted)] hidden sm:block mt-0.5">
              Privacy-first PDF &amp; Student Suite
            </span>
          </div>
        </Link>

        <nav className="hidden lg:flex items-center gap-1 px-1.5 py-1 rounded-full border border-[var(--dm-border)] bg-[var(--dm-surface)]/80 text-xs font-medium text-[var(--dm-muted)]">
          <a
            href="#features"
            className="px-3 py-1.5 rounded-full hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] transition-colors"
          >
            {t.nav.features}
          </a>
          <Link
            href="/app/tools/compress"
            className="px-3 py-1.5 rounded-full hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] transition-colors"
          >
            {t.nav.tools}
          </Link>
          <a
            href="#pricing"
            className="px-3 py-1.5 rounded-full hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] transition-colors"
          >
            {t.nav.pricing}
          </a>
          <Link
            href="/security"
            className="px-3 py-1.5 rounded-full hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] transition-colors"
          >
            {t.nav.security}
          </Link>
          <Link
            href="/privacy"
            className="px-3 py-1.5 rounded-full hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] transition-colors"
          >
            {t.nav.privacy}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "ta" : "en")}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs font-medium hover:border-[var(--dm-border-strong)] transition-colors"
            title="Switch language (English / Tamil)"
          >
            <Languages className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-400" />
            <span>{locale === "en" ? "தமிழ்" : "EN"}</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-[var(--dm-border-strong)] transition-colors"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 hidden dark:block text-amber-300" />
            <Moon className="h-4 w-4 block dark:hidden text-slate-700" />
          </button>

          {!user && (
            <Link
              href="/login"
              className="hidden sm:inline-flex px-3.5 py-1.5 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-[var(--dm-border-strong)] transition-colors"
            >
              {t.nav.login}
            </Link>
          )}
          <Link
            href="/app"
            className="dm-primary-btn inline-flex items-center gap-1.5 px-4 py-2 text-xs sm:text-sm font-medium"
          >
            <span>{t.nav.getStarted}</span>
            <ArrowRight className="h-3.5 w-3.5" />
          </Link>
        </div>
      </div>
    </header>
  );
}
