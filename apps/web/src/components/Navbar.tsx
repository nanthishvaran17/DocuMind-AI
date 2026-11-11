"use client";

import Link from "next/link";
import { useTheme } from "next-themes";
import { FileText, Languages, Moon, Sun } from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";

export function Navbar() {
  const { t, locale, setLocale } = useT();
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((s) => s.user);

  return (
    <header className="sticky top-0 z-40 border-b border-[var(--dm-border)] bg-[var(--dm-bg)]/85 backdrop-blur-md">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between gap-4">
        <Link href="/" className="flex items-center gap-2.5 font-semibold text-base">
          <span className="h-8 w-8 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
            <FileText className="h-4 w-4" />
          </span>
          <span>{t.brand}</span>
        </Link>

        <nav className="hidden md:flex items-center gap-6 text-sm text-[var(--dm-muted)]">
          <a href="#features" className="hover:text-[var(--dm-text)] transition-colors">
            {t.nav.features}
          </a>
          <Link href="/app/tools/compress" className="hover:text-[var(--dm-text)] transition-colors">
            {t.nav.tools}
          </Link>
          <a href="#pricing" className="hover:text-[var(--dm-text)] transition-colors">
            {t.nav.pricing}
          </a>
          <Link href="/security" className="hover:text-[var(--dm-text)] transition-colors">
            {t.nav.security}
          </Link>
          <Link href="/privacy" className="hover:text-[var(--dm-text)] transition-colors">
            {t.nav.privacy}
          </Link>
        </nav>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={() => setLocale(locale === "en" ? "ta" : "en")}
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--dm-border)] text-xs font-medium hover:bg-[var(--dm-surface)] transition-colors"
            title="Switch language (English / Tamil)"
          >
            <Languages className="h-3.5 w-3.5 text-indigo-400" />
            <span>{locale === "en" ? "தமிழ்" : "EN"}</span>
          </button>

          <button
            type="button"
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="p-2 rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-surface)] transition-colors"
            aria-label="Toggle theme"
          >
            <Sun className="h-4 w-4 hidden dark:block" />
            <Moon className="h-4 w-4 block dark:hidden" />
          </button>

          {!user && (
            <Link
              href="/login"
              className="hidden sm:inline-flex px-3 py-1.5 text-sm rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-surface)] transition-colors"
            >
              {t.nav.login}
            </Link>
          )}
          <Link href="/app" className="dm-primary-btn px-3.5 py-1.5 text-sm font-medium">
            {t.nav.getStarted}
          </Link>
        </div>
      </div>
    </header>
  );
}
