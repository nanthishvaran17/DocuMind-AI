"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Command } from "cmdk";
import {
  Camera,
  FolderOpen,
  Image as ImageIcon,
  Layers,
  Languages,
  Minimize2,
  Moon,
  Search,
  Trash2,
} from "lucide-react";
import { useTheme } from "next-themes";
import { useT } from "@/lib/i18n";

export function CommandPalette() {
  const [open, setOpen] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useT();

  useEffect(() => {
    const down = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setOpen((prev) => !prev);
      }
    };
    window.addEventListener("keydown", down);
    return () => window.removeEventListener("keydown", down);
  }, []);

  if (!open) return null;

  const go = (href: string) => {
    setOpen(false);
    router.push(href);
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/60 backdrop-blur-xs flex items-start justify-center pt-24 px-4"
      onClick={() => setOpen(false)}
    >
      <div
        className="dm-elevated w-full max-w-lg overflow-hidden shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <Command className="w-full">
          <div className="flex items-center gap-2 border-b border-[var(--dm-border)] px-3.5 py-2.5">
            <Search className="h-4 w-4 text-[var(--dm-muted)]" />
            <Command.Input
              autoFocus
              placeholder="Jump to a tool, library, or setting... (Esc to close)"
              className="w-full bg-transparent text-sm outline-none placeholder:text-[var(--dm-muted)]"
            />
          </div>
          <Command.List className="max-h-72 overflow-y-auto p-2 text-sm">
            <Command.Empty className="py-6 text-center text-xs text-[var(--dm-muted)]">
              No matching command found.
            </Command.Empty>
            <Command.Group heading="Workspace" className="px-2 py-1 text-xs text-[var(--dm-muted)]">
              <Command.Item
                onSelect={() => go("/app")}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <FolderOpen className="h-4 w-4 text-indigo-400" />
                <span>Dashboard & Library</span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/trash")}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <Trash2 className="h-4 w-4 text-rose-400" />
                <span>Trash & 30-day Recovery</span>
              </Command.Item>
            </Command.Group>
            <Command.Group heading="PDF & Student Tools" className="px-2 py-1 text-xs text-[var(--dm-muted)]">
              <Command.Item
                onSelect={() => go("/app/tools/compress")}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <Minimize2 className="h-4 w-4 text-indigo-400" />
                <span>Compress PDF to Exact KB (100KB / 200KB)</span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/photo-resizer")}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <ImageIcon className="h-4 w-4 text-violet-400" />
                <span>Photo & Signature Resizer (Passport / GATE / UPSC)</span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/scan")}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <Camera className="h-4 w-4 text-sky-400" />
                <span>Camera Scan to PDF</span>
              </Command.Item>
              <Command.Item
                onSelect={() => go("/app/tools/pdf")}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <Layers className="h-4 w-4 text-emerald-400" />
                <span>Merge & Split PDFs</span>
              </Command.Item>
            </Command.Group>
            <Command.Group heading="Preferences" className="px-2 py-1 text-xs text-[var(--dm-muted)]">
              <Command.Item
                onSelect={() => {
                  setTheme(theme === "dark" ? "light" : "dark");
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <Moon className="h-4 w-4" />
                <span>Toggle Light / Dark Theme</span>
              </Command.Item>
              <Command.Item
                onSelect={() => {
                  setLocale(locale === "en" ? "ta" : "en");
                  setOpen(false);
                }}
                className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg cursor-pointer aria-selected:bg-indigo-500/15"
              >
                <Languages className="h-4 w-4" />
                <span>Switch UI Language (English / தமிழ்)</span>
              </Command.Item>
            </Command.Group>
          </Command.List>
        </Command>
      </div>
    </div>
  );
}
