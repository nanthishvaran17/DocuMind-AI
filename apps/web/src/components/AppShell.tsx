"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeftRight,
  Bot,
  Camera,
  CheckCircle2,
  Clock,
  FileText,
  FolderOpen,
  HardDrive,
  Image as ImageIcon,
  Languages,
  Layers,
  LogOut,
  MessageSquareText,
  Minimize2,
  Moon,
  ScanText,
  Search,
  Settings,
  ShieldCheck,
  Sun,
  Trash2,
  XCircle,
} from "lucide-react";
import type { DocumentItem, JobRecord, UserPreferences } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { usePreferencesStore } from "@/stores/preferences-store";
import { apiRequest } from "@/lib/api";

const CommandPalette = dynamic(
  () => import("@/components/CommandPalette").then((m) => m.CommandPalette),
  { ssr: false }
);

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { t, locale, setLocale } = useT();
  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const token = useAuthStore((s) => s.accessToken);
  const clearSession = useAuthStore((s) => s.clearSession);
  const density = usePreferencesStore((s) => s.density);
  const hydratedFromServer = usePreferencesStore((s) => s.hydratedFromServer);
  const hydrateFromServer = usePreferencesStore((s) => s.hydrateFromServer);
  const [jobsOpen, setJobsOpen] = useState(false);

  useEffect(() => {
    if (!user || isGuest || !token || hydratedFromServer) return;
    let cancelled = false;
    apiRequest<UserPreferences>("/users/me/preferences")
      .then((res) => {
        if (!cancelled && res.data) {
          hydrateFromServer(res.data);
          if (res.data.theme) setTheme(res.data.theme);
        }
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [user, isGuest, token, hydratedFromServer, hydrateFromServer, setTheme]);

  interface NavItem {
    href: string;
    label: string;
    icon: typeof FolderOpen;
    exact?: boolean;
    badge?: string;
  }

  const navSections: { label: string; items: NavItem[] }[] = [
    {
      label: "Workspace",
      items: [
        { href: "/app", label: t.app.library, icon: FolderOpen, exact: true, badge: "All" },
        { href: "/app/intelligence", label: t.app.intelligence, icon: MessageSquareText, badge: "RAG" },
        { href: "/app/workflows", label: t.app.workflows, icon: Bot, badge: "Agent" },
      ],
    },
    {
      label: "Student & PDF Studio",
      items: [
        { href: "/app/tools/compress", label: t.tools.compress, icon: Minimize2, badge: "KB" },
        { href: "/app/tools/convert", label: t.tools.convert, icon: ArrowLeftRight, badge: "DOCX" },
        { href: "/app/tools/ocr", label: t.tools.ocr, icon: ScanText, badge: "EN+TA" },
        { href: "/app/tools/photo-resizer", label: t.tools.photo, icon: ImageIcon, badge: "DPI" },
        { href: "/app/tools/scan", label: t.tools.scan, icon: Camera, badge: "Cam" },
        { href: "/app/tools/pdf", label: t.tools.merge, icon: Layers, badge: "PDF" },
      ],
    },
    {
      label: "Vault",
      items: [
        { href: "/app/trash", label: t.app.trash, icon: Trash2, badge: "" },
        { href: "/app/settings", label: t.app.settings, icon: Settings, badge: "" },
      ],
    },
  ];

  const allNavItems = navSections.flatMap((s) => s.items);

  const summaryDocsQuery = useQuery({
    queryKey: ["documents", null, ""],
    enabled: Boolean(token),
    staleTime: 45_000,
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?limit=50");
      return res.data ?? [];
    },
  });

  const jobsQuery = useQuery({
    queryKey: ["dashboard-jobs", Boolean(token)],
    enabled: Boolean(token),
    staleTime: 25_000,
    queryFn: async () => {
      const res = await apiRequest<JobRecord[]>("/jobs");
      return res.data ?? [];
    },
    select: (rows) => rows.slice(0, 6),
  });

  const totalUsedBytes = (summaryDocsQuery.data ?? []).reduce((sum, d) => sum + d.size_bytes, 0);
  const quotaBytes = 500 * 1024 * 1024;
  const usedPct = Math.min(100, Math.max(totalUsedBytes > 0 ? 3 : 0, (totalUsedBytes / quotaBytes) * 100));
  const recentJobs = jobsQuery.data ?? [];
  const runningJobsCount = recentJobs.filter(
    (j) => j.status === "queued" || j.status === "running"
  ).length;

  const currentRouteTitle =
    allNavItems.find((item) =>
      item.exact ? pathname === item.href : pathname.startsWith(item.href)
    )?.label || "Document Studio";

  const handleLogout = async () => {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch {
      // ignore
    }
    usePreferencesStore.getState().resetPreferences();
    clearSession();
    router.push("/login");
  };

  return (
    <div className="min-h-screen flex flex-col md:flex-row pb-16 md:pb-0 bg-[var(--dm-bg)]">
      <CommandPalette />

      {/* Desktop Left Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-[var(--dm-border)] bg-[var(--dm-surface)] shrink-0">
        <div className="h-14 px-4 border-b border-[var(--dm-border)] flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5 group">
            <span className="relative h-8 w-8 rounded-xl bg-gradient-to-br from-indigo-500 via-violet-500 to-purple-600 flex items-center justify-center text-white shadow-sm shadow-indigo-500/30">
              <FileText className="h-4 w-4" />
            </span>
            <div className="leading-tight">
              <span className="font-semibold text-sm tracking-tight block">{t.brand}</span>
              <span className="text-[10px] font-mono text-[var(--dm-muted)] block">
                Workspace v1
              </span>
            </div>
          </Link>
        </div>

        <nav className="flex-1 p-3 space-y-5 overflow-y-auto">
          {navSections.map((section) => (
            <div key={section.label} className="space-y-1">
              <p className="px-3 pb-1 text-[10px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                {section.label}
              </p>
              {section.items.map((item) => {
                const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
                const Icon = item.icon;
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={`relative flex items-center justify-between gap-2.5 px-3 py-2 rounded-lg text-[13px] transition-colors ${
                      active
                        ? "text-indigo-600 dark:text-indigo-300 font-medium"
                        : "text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)]"
                    }`}
                  >
                    {active && (
                      <motion.span
                        layoutId="sidebar-active-pill"
                        transition={{ duration: 0.18, ease: "easeOut" }}
                        className="absolute inset-0 rounded-lg bg-indigo-500/12 border border-indigo-500/25"
                      />
                    )}
                    <span className="relative flex items-center gap-2.5 min-w-0">
                      <Icon
                        className={`h-4 w-4 shrink-0 ${
                          active ? "text-indigo-500 dark:text-indigo-400" : ""
                        }`}
                      />
                      <span className="truncate">{item.label}</span>
                    </span>
                    {item.badge && (
                      <span className="relative text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--dm-bg)] border border-[var(--dm-border)] text-[var(--dm-muted)]">
                        {item.badge}
                      </span>
                    )}
                  </Link>
                );
              })}
            </div>
          ))}
        </nav>

        {/* Bottom Storage + Account Footer */}
        <div className="p-3 border-t border-[var(--dm-border)] space-y-2.5 text-xs">
          <div className="p-3 rounded-xl bg-[var(--dm-bg)] border border-[var(--dm-border)] space-y-2">
            <div className="flex items-center justify-between text-[11px]">
              <span className="inline-flex items-center gap-1.5 font-medium">
                <HardDrive className="h-3.5 w-3.5 text-indigo-400" />
                <span>Vault Usage</span>
              </span>
              <span className="font-mono text-[var(--dm-muted)]">{formatBytes(totalUsedBytes)}</span>
            </div>
            <div className="h-1.5 w-full rounded-full bg-[var(--dm-border)] overflow-hidden">
              <div
                className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                style={{ width: `${usedPct}%` }}
              />
            </div>
            <p className="text-[10px] text-[var(--dm-muted)] flex items-center gap-1">
              <ShieldCheck className="h-3 w-3 text-emerald-500 shrink-0" />
              <span>Originals immutable • Encrypted at rest</span>
            </p>
          </div>

          <div className="px-2.5 py-2 rounded-lg bg-[var(--dm-subtle)] border border-[var(--dm-border)] flex items-center gap-2.5">
            <span className="h-7 w-7 rounded-full bg-gradient-to-br from-indigo-500 to-violet-500 text-white font-semibold text-[11px] flex items-center justify-center shrink-0">
              {user ? user.full_name.slice(0, 2).toUpperCase() : isGuest ? "GS" : "?"}
            </span>
            <div className="min-w-0 flex-1">
              <p className="font-medium truncate">
                {user ? user.full_name : isGuest ? "Guest Mode (1h)" : "Anonymous"}
              </p>
              <p className="text-[11px] text-[var(--dm-muted)] truncate">
                {user ? user.email : "No signup needed for tools"}
              </p>
            </div>
          </div>

          {user ? (
            <button
              type="button"
              onClick={handleLogout}
              className="w-full flex items-center justify-center gap-2 px-3 py-1.5 rounded-lg border border-[var(--dm-border)] text-[var(--dm-muted)] hover:text-red-500 hover:border-red-500/30 hover:bg-red-500/10 transition-colors"
            >
              <LogOut className="h-3.5 w-3.5" />
              <span>Sign out</span>
            </button>
          ) : (
            <Link
              href="/login"
              className="w-full flex items-center justify-center py-2 rounded-lg dm-primary-btn font-medium"
            >
              Sign in / Save work
            </Link>
          )}
        </div>
      </aside>

      {/* Main Content */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-14 border-b border-[var(--dm-border)] bg-[var(--dm-glass)] backdrop-blur-xl px-4 sm:px-6 flex items-center justify-between gap-3 sticky top-0 z-30">
          <div className="flex items-center gap-2.5 min-w-0">
            <Link href="/" className="flex md:hidden items-center gap-2 font-semibold text-sm">
              <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500 to-violet-500 flex items-center justify-center text-white">
                <FileText className="h-3.5 w-3.5" />
              </span>
              <span>DocuMind</span>
            </Link>
            <div className="hidden md:flex items-center gap-2 text-xs">
              <span className="text-[var(--dm-muted)]">Studio</span>
              <span className="text-[var(--dm-border-strong)]">/</span>
              <span className="font-semibold text-[var(--dm-text)]">{currentRouteTitle}</span>
            </div>
          </div>

          <button
            type="button"
            onClick={() =>
              window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true }))
            }
            className="hidden sm:flex items-center gap-3 px-3 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs text-[var(--dm-muted)] hover:border-indigo-500/40 hover:text-[var(--dm-text)] w-72 lg:w-80 justify-between transition-colors shadow-sm"
          >
            <span className="flex items-center gap-2 truncate">
              <Search className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
              <span className="truncate">Quick jump to files &amp; tools...</span>
            </span>
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] shrink-0">
              Ctrl K
            </kbd>
          </button>

          <div className="flex items-center gap-2 relative">
            {/* Live Pipeline Activity Popover */}
            <div className="relative">
              <button
                type="button"
                onClick={() => setJobsOpen((o) => !o)}
                className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs font-medium hover:bg-[var(--dm-elevated)] transition-colors"
                aria-label="Recent jobs activity"
              >
                <Activity
                  className={`h-3.5 w-3.5 ${
                    runningJobsCount > 0 ? "text-indigo-400 animate-pulse" : "text-emerald-500"
                  }`}
                />
                <span className="hidden lg:inline">Jobs</span>
                {recentJobs.length > 0 && (
                  <span className="font-mono text-[10px] px-1.5 py-0.2 rounded-full bg-[var(--dm-bg)] border border-[var(--dm-border)]">
                    {recentJobs.length}
                  </span>
                )}
              </button>

              {jobsOpen && (
                <div className="absolute right-0 mt-2 w-80 dm-elevated p-3 space-y-2 z-50">
                  <div className="flex items-center justify-between pb-1 border-b border-[var(--dm-border)]">
                    <span className="text-xs font-semibold">Recent Pipeline Jobs</span>
                    <button
                      type="button"
                      onClick={() => setJobsOpen(false)}
                      className="text-[11px] text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                    >
                      Close
                    </button>
                  </div>
                  {recentJobs.length === 0 ? (
                    <p className="text-xs text-[var(--dm-muted)] py-3 text-center">
                      No recent jobs yet.
                    </p>
                  ) : (
                    <div className="space-y-1.5 max-h-64 overflow-y-auto">
                      {recentJobs.map((j) => (
                        <button
                          key={j.id}
                          type="button"
                          onClick={() => {
                            setJobsOpen(false);
                            if (
                              j.job_type === "convert" &&
                              j.status === "completed" &&
                              j.result_meta?.quality_report_id
                            ) {
                              router.push(`/app/conversions/${j.id}`);
                            } else if (j.output_document_id) {
                              router.push(`/app/workspace/${j.output_document_id}`);
                            }
                          }}
                          className="w-full text-left p-2 rounded-lg hover:bg-[var(--dm-subtle)] border border-transparent hover:border-[var(--dm-border)] transition-colors flex items-center justify-between gap-2 text-xs"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {j.status === "completed" ? (
                              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
                            ) : j.status === "failed" ? (
                              <XCircle className="h-3.5 w-3.5 text-red-500 shrink-0" />
                            ) : (
                              <Clock className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                            )}
                            <span className="truncate font-medium capitalize">
                              {j.job_type.replace("_", " ")}
                            </span>
                          </div>
                          <span className="font-mono text-[10px] text-[var(--dm-muted)] shrink-0">
                            {j.status}
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>

            <button
              type="button"
              onClick={() => setLocale(locale === "en" ? "ta" : "en")}
              className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs font-medium hover:bg-[var(--dm-elevated)] transition-colors"
            >
              <Languages className="h-3.5 w-3.5 text-indigo-400" />
              <span>{locale === "en" ? "தமிழ்" : "EN"}</span>
            </button>
            <button
              type="button"
              onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
              className="p-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-elevated)] transition-colors"
              aria-label="Toggle theme"
            >
              <Sun className="h-4 w-4 hidden dark:block text-amber-400" />
              <Moon className="h-4 w-4 block dark:hidden text-indigo-500" />
            </button>
          </div>
        </header>

        <main
          className={`flex-1 max-w-7xl w-full mx-auto ${
            density === "compact" ? "p-3 sm:p-4 lg:p-5" : "p-4 sm:p-6 lg:p-8"
          }`}
        >
          {children}
        </main>
      </div>

      {/* Mobile Bottom Tab Bar */}
      <nav className="md:hidden fixed bottom-0 inset-x-0 z-40 h-16 border-t border-[var(--dm-border)] bg-[var(--dm-surface)]/95 backdrop-blur-md grid grid-cols-5">
        {allNavItems.slice(0, 5).map((item) => {
          const active = item.exact ? pathname === item.href : pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex flex-col items-center justify-center gap-1 text-[10px] ${
                active ? "text-indigo-500 dark:text-indigo-400 font-medium" : "text-[var(--dm-muted)]"
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
