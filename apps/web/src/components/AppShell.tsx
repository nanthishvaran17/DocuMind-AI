"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import {
  Camera,
  FileText,
  FolderOpen,
  Image as ImageIcon,
  Languages,
  Layers,
  LogOut,
  Minimize2,
  Moon,
  Search,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { apiRequest } from "@/lib/api";
import { CommandPalette } from "@/components/CommandPalette";

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useT();
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const clearSession = useAuthStore((s) => s.clearSession);

  const navItems = [
    { href: "/app", label: t.app.library, icon: FolderOpen, exact: true },
    { href: "/app/tools/compress", label: t.tools.compress, icon: Minimize2 },
    { href: "/app/tools/photo-resizer", label: t.tools.photo, icon: ImageIcon },
    { href: "/app/tools/scan", label: t.tools.scan, icon: Camera },
    { href: "/app/tools/pdf", label: t.tools.merge, icon: Layers },
    { href: "/app/trash", label: t.app.trash, icon: Trash2 },
    { href: "/app/settings", label: t.app.settings, icon: Settings },
  ];

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    clearSession();
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row pb-16 md:pb-0">
      <CommandPalette />

      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:w-60 md:flex-col border-r border-[var(--dm-border)] bg-[var(--dm-surface)] shrink-0">
        <div className="h-14 px-4 border-b border-[var(--dm-border)] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
            <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
              <FileText className="h-3.5 w-3.5" />
            </span>
            <span>{t.brand}</span>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-1">
          {navItems.map((item) => {
            const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm transition-colors ${
                  active
                    ? "bg-indigo-500/15 text-indigo-400 font-medium"
                    : "text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:bg-[var(--dm-elevated)]"
                }`}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="truncate">{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="p-3 border-t border-[var(--dm-border)] space-y-2 text-xs">
          <div className="px-2 py-1.5 rounded-lg bg-[var(--dm-bg)] border border-[var(--dm-border)]">
            <p className="font-medium truncate">
              {user ? user.full_name : isGuest ? "Guest Session (1h)" : "Not signed in"}
            </p>
            <p className="text-[var(--dm-muted)] truncate">
              {user ? user.email : "No signup needed for tools"}
            </p>
          </div>
          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center gap-2 px-3 py-1.5 rounded-lg text-[var(--dm-muted)] hover:text-red-400 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="w-full flex items-center justify-center py-1.5 rounded-lg dm-primary-btn font-medium"
            >
              Sign in / Save work
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[var(--dm-border)] bg-[var(--dm-surface)]/80 backdrop-blur-md px-4 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2 md:hidden">
            <Link href="/" className="flex items-center gap-2 font-semibold text-sm">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span>DocuMind</span>
            </Link>
          </div>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
            }
            className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] text-xs text-[var(--dm-muted)] hover:text-[var(--dm-text)] w-64 justify-between"
          >
            <span className="flex items-center gap-2">
              <Search className="h-3.5 w-3.5" />
              <span>Quick jump...</span>
            </span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--dm-border)]">
              Ctrl K
            </kbd>
          </button>

          <div className="flex items-center gap-2 ml-auto">
            <button
              type="button"
              onClick={() => setLocale(locale === "en" ? "ta" : "en")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--dm-border)] text-xs font-medium hover:bg-[var(--dm-elevated)]"
            >
              <Languages className="h-3.5 w-3.5 text-indigo-400" />
              <span>{locale === "en" ? "தமிழ்" : "EN"}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-elevated)]"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 hidden dark:block" />
              <Moon className="h-4 w-4 block dark:hidden" />
            </button>
          </div>
        </header>

        <main className="flex-1 p-4 sm:p-6 max-w-7xl w-full mx-auto">{children}</main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-[var(--dm-border)] bg-[var(--dm-surface)]/95 backdrop-blur-md grid grid-cols-5">
        {navItems.slice(0, 5).map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] ${
                active ? "text-indigo-400 font-medium" : "text-[var(--dm-muted)]"
              }`}
            >
              <Icon className="h-4 w-4" />
              <span className="truncate max-w-[64px]">{item.label}</span>
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
