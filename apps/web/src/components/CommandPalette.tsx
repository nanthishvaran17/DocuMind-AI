"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  ArrowLeftRight,
  Bot,
  Camera,
  FolderOpen,
  Image as ImageIcon,
  Languages,
  Layers,
  MessageSquareText,
  Minimize2,
  Moon,
  ScanText,
  Search,
  Settings,
  Sun,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useT } from "@/lib/i18n";
import { usePreferencesStore } from "@/stores/preferences-store";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useT();
  const keyboardShortcutsEnabled = usePreferencesStore((s) => s.keyboard_shortcuts_enabled);

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (!keyboardShortcutsEnabled) return;
        e.preventDefault();
        setOpen((prev) => !prev);
      } else if (e.key === "Escape") {
        setOpen(false);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, [keyboardShortcutsEnabled]);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  const itemClass =
    "flex items-center justify-between gap-3 px-3 py-2.5 rounded-xl cursor-pointer text-sm font-normal normal-case tracking-normal text-[var(--dm-text)] select-none transition-colors aria-selected:bg-indigo-50 dark:aria-selected:bg-indigo-500/15 aria-selected:text-indigo-700 dark:aria-selected:text-indigo-300 aria-selected:font-medium";

  const groupClass =
    "py-1.5 [&_[cmdk-group-heading]]:px-3 [&_[cmdk-group-heading]]:py-1.5 [&_[cmdk-group-heading]]:text-[10px] [&_[cmdk-group-heading]]:font-semibold [&_[cmdk-group-heading]]:uppercase [&_[cmdk-group-heading]]:tracking-wider [&_[cmdk-group-heading]]:text-[var(--dm-muted)]";

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-900/50 dark:bg-black/75 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4 animate-in fade-in duration-150"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl overflow-hidden rounded-2xl border border-[var(--dm-border)] bg-[var(--dm-surface)] shadow-2xl shadow-slate-950/20"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full">
          <div className="flex items-center gap-3 border-b border-[var(--dm-border)] px-4 py-3.5 bg-[var(--dm-surface)]">
            <Search className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Jump to any tool, workspace, or preference..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--dm-muted)] text-[var(--dm-text)] font-normal"
            />
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--dm-border)] bg-[var(--dm-subtle)] text-[var(--dm-muted)] shrink-0">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2 text-sm space-y-1">
            <Command.Empty className="py-8 text-center text-xs text-[var(--dm-muted)]">
              No matching command found.
            </Command.Empty>

            <Command.Group heading="Workspace" className={groupClass}>
              <Command.Item onSelect={() => go("/app")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <FolderOpen className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Dashboard &amp; Library</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)] px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">
                  /app
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/intelligence")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <MessageSquareText className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>AI Semantic Search &amp; Cited Q&amp;A</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                  pgvector
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/workflows")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <Bot className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Multi-Step Agent Workflows</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Chained
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/trash")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <Trash2 className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                  <span>Trash &amp; 30-day Recovery</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)] px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">
                  /trash
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/settings")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <Settings className="h-4 w-4 text-slate-600 dark:text-slate-400 shrink-0" />
                  <span>Account &amp; Preferences</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)] px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">
                  /settings
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="PDF &amp; Student Studio" className={groupClass}>
              <Command.Item onSelect={() => go("/app/tools/convert")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <ArrowLeftRight className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Format Converter (DOCX, XLSX, PPTX, MD)</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  PDF
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/tools/ocr")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <ScanText className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>OCR Searchable PDF (English + தமிழ்)</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  OCR
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/tools/compress")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <Minimize2 className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Compress PDF to Target KB</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-600 dark:text-indigo-400 border border-indigo-500/20">
                  100KB / 200KB
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/tools/photo-resizer")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <ImageIcon className="h-4 w-4 text-violet-600 dark:text-violet-400 shrink-0" />
                  <span>Photo &amp; Signature Resizer</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-600 dark:text-violet-400 border border-violet-500/20">
                  Govt Exams
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/tools/scan")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <Camera className="h-4 w-4 text-sky-600 dark:text-sky-400 shrink-0" />
                  <span>Camera Scan to PDF</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-600 dark:text-sky-400 border border-sky-500/20">
                  Mobile Cam
                </span>
              </Command.Item>
              <Command.Item onSelect={() => go("/app/tools/pdf")} className={itemClass}>
                <span className="flex items-center gap-2.5">
                  <Layers className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                  <span>Merge, Split &amp; Reorder PDFs</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                  Fast
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group heading="Preferences" className={groupClass}>
              <Command.Item
                onSelect={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2.5">
                  {theme === "dark" ? (
                    <Sun className="h-4 w-4 text-amber-500 shrink-0" />
                  ) : (
                    <Moon className="h-4 w-4 text-indigo-600 shrink-0" />
                  )}
                  <span>Toggle Light / Dark Theme</span>
                </span>
                <span className="text-[10px] font-mono text-[var(--dm-muted)] px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">
                  {theme === "dark" ? "Dark" : "Light"}
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  setLocale(locale === "en" ? "ta" : "en");
                  setOpen(false);
                }}
                className={itemClass}
              >
                <span className="flex items-center gap-2.5">
                  <Languages className="h-4 w-4 text-indigo-600 dark:text-indigo-400 shrink-0" />
                  <span>Switch UI Language (English / தமிழ்)</span>
                </span>
                <span className="text-[10px] font-mono text-[var(--dm-muted)] px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">
                  {locale === "en" ? "EN" : "தமிழ்"}
                </span>
              </Command.Item>
            </Command.Group>
          </Command.List>
          <div className="border-t border-[var(--dm-border)] px-4 py-2.5 flex items-center justify-between text-[11px] text-[var(--dm-muted)] bg-[var(--dm-subtle)]">
            <span>Navigate with ↑ ↓ arrows • ↵ to open</span>
            <span className="font-mono">DocuMind Studio</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
