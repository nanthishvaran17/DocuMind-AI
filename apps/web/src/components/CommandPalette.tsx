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
  Layers,
  Languages,
  MessageSquareText,
  Minimize2,
  Moon,
  ScanText,
  Search,
  Settings,
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

  return (
    <div
      className="fixed inset-0 z-50 bg-black/65 backdrop-blur-sm flex items-start justify-center pt-[14vh] px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="dm-elevated w-full max-w-xl overflow-hidden border-[var(--dm-border-strong)]"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full">
          <div className="flex items-center gap-3 border-b border-[var(--dm-border)] px-4 py-3">
            <Search className="h-4 w-4 text-indigo-400 shrink-0" />
            <Command.Input
              autoFocus
              placeholder="Jump to any tool, workspace, or preference..."
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--dm-muted)]"
            />
            <kbd className="font-mono text-[10px] px-1.5 py-0.5 rounded border border-[var(--dm-border)] text-[var(--dm-muted)]">
              ESC
            </kbd>
          </div>
          <Command.List className="max-h-80 overflow-y-auto p-2 text-sm space-y-1">
            <Command.Empty className="py-8 text-center text-xs text-[var(--dm-muted)]">
              No matching command found.
            </Command.Empty>

            <Command.Group
              heading="Workspace"
              className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]"
            >
              <Command.Item
                onSelect={() => go("/app")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <FolderOpen className="h-4 w-4 text-indigo-400" />
                  <span>Dashboard &amp; Library</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)]">/app</span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/intelligence")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <MessageSquareText className="h-4 w-4 text-violet-400" />
                  <span>AI Semantic Search &amp; Cited Q&amp;A</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
                  pgvector
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/workflows")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <Bot className="h-4 w-4 text-emerald-400" />
                  <span>Multi-Step Agent Workflows</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  Chained
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/trash")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <Trash2 className="h-4 w-4 text-rose-400" />
                  <span>Trash &amp; 30-day Recovery</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)]">/trash</span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/settings")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <Settings className="h-4 w-4 text-slate-400" />
                  <span>Account &amp; Preferences</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)]">/settings</span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="PDF & Student Studio"
              className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]"
            >
              <Command.Item
                onSelect={() => go("/app/tools/convert")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <ArrowLeftRight className="h-4 w-4 text-sky-400" />
                  <span>Format Converter (DOCX / XLSX / PPTX / MD)</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">
                  &lt;-&gt; PDF
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/ocr")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <ScanText className="h-4 w-4 text-emerald-400" />
                  <span>OCR Searchable PDF (English + தமிழ்)</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400">
                  OCR
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/compress")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <Minimize2 className="h-4 w-4 text-indigo-400" />
                  <span>Compress PDF to Exact KB</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-indigo-500/10 text-indigo-400">
                  100KB / 200KB
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/photo-resizer")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <ImageIcon className="h-4 w-4 text-violet-400" />
                  <span>Photo &amp; Signature Resizer</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-violet-500/10 text-violet-400">
                  GATE / UPSC
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/scan")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <Camera className="h-4 w-4 text-sky-400" />
                  <span>Camera Scan to PDF</span>
                </span>
                <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">
                  1–30 pages
                </span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/pdf")}
                className="flex items-center justify-between gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <span className="flex items-center gap-2.5">
                  <Layers className="h-4 w-4 text-emerald-400" />
                  <span>Merge &amp; Split PDFs</span>
                </span>
              </Command.Item>
            </Command.Group>

            <Command.Group
              heading="Preferences"
              className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]"
            >
              <Command.Item
                onSelect={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <Moon className="h-4 w-4 text-amber-400" />
                <span>Toggle Light / Dark Theme</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  setLocale(locale === "en" ? "ta" : "en");
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl cursor-pointer aria-selected:bg-indigo-500/15 aria-selected:text-indigo-400"
              >
                <Languages className="h-4 w-4 text-indigo-400" />
                <span>Switch UI Language (English / தமிழ்)</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
          <div className="border-t border-[var(--dm-border)] px-4 py-2 flex items-center justify-between text-[11px] text-[var(--dm-muted)] bg-[var(--dm-subtle)]">
            <span>Navigate with ↑ ↓ arrows • ↵ to open</span>
            <span className="font-mono">DocuMind Studio</span>
          </div>
        </Command>
      </div>
    </div>
  );
}
