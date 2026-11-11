"use client";

import Link from "next/link";
import { useCallback, useRef, useState } from "react";
import { Camera, CheckCircle2, Download, Loader2, ScanLine } from "lucide-react";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import {
  AutoDocScanner,
  exportPageForUpload,
  type ScannedPageItem,
} from "@/components/AutoDocScanner";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob } from "@/lib/api";
import type { EnhanceMode } from "@/lib/docScannerCv";

interface ScanResult {
  document_id: string;
  name: string;
  page_count: number;
  size_bytes: number;
}

export default function CameraScanPage() {
  const { pushToast } = useToast();
  const [pages, setPages] = useState<ScannedPageItem[]>([]);
  const [enhanceMode, setEnhanceMode] = useState<EnhanceMode>("document");
  const [outputName, setOutputName] = useState("scanned_notes.pdf");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);
  const pagesRef = useRef<ScannedPageItem[]>([]);

  const handlePagesChange = useCallback((nextPages: ScannedPageItem[]) => {
    pagesRef.current = nextPages;
    setPages(nextPages);
  }, []);

  const buildPdf = useCallback(async () => {
    const currentPages = pagesRef.current;
    if (currentPages.length === 0 || running) return;
    setRunning(true);
    try {
      const fd = new FormData();
      for (const page of currentPages) {
        const file = await exportPageForUpload(page);
        fd.append("files", file);
      }
      fd.append("enhance_mode", enhanceMode);
      fd.append("output_name", outputName);

      const res = await apiRequest<ScanResult>("/tools/scan", {
        method: "POST",
        body: fd,
        ensureGuest: true,
      });
      setResult(res.data!);
      pushToast({
        title: "Multi-page PDF saved",
        description: `${res.data!.page_count} page(s) combined into ${res.data!.name}.`,
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: "Scan failed",
        description: err instanceof Error ? err.message : "Could not generate PDF.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  }, [enhanceMode, outputName, pushToast, running]);

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    await buildPdf();
  };

  const downloadPdf = async () => {
    if (!result) return;
    const blob = await fetchAuthorizedBlob(`/documents/${result.document_id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <PrivacyBadge />
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-3.5">
            <div className="h-11 w-11 rounded-2xl bg-sky-500/15 border border-sky-500/25 flex items-center justify-center text-sky-500 dark:text-sky-400 shrink-0">
              <Camera className="h-5 w-5" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="text-2xl font-semibold">Auto Document Scanner</h1>
                <span className="px-2.5 py-0.5 rounded-full text-[11px] font-medium bg-emerald-500/15 text-emerald-600 dark:text-emerald-300 border border-emerald-500/25 inline-flex items-center gap-1">
                  <ScanLine className="h-3 w-3" />
                  Hands-Free Auto Capture
                </span>
              </div>
              <p className="text-sm text-[var(--dm-muted)] mt-0.5">
                Point your camera at a page — edges are detected, auto-captured when steady, and
                auto-saved each time you turn to the next page.
              </p>
            </div>
          </div>
        </div>

        <form onSubmit={handleScan} className="dm-card p-5 sm:p-6 space-y-5">
          <AutoDocScanner
            enhanceMode={enhanceMode}
            maxPages={30}
            onPagesChange={handlePagesChange}
            onBuildPdfRequested={() => void buildPdf()}
            buildingPdf={running}
          />

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2 border-t border-[var(--dm-border)]">
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                Enhancement Mode
              </p>
              <div className="flex flex-wrap gap-2 text-xs">
                {(["document", "grayscale", "original"] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setEnhanceMode(m)}
                    className={`px-3.5 py-2 rounded-xl border capitalize font-medium transition-colors ${
                      enhanceMode === m
                        ? "border-sky-500 bg-sky-500/15 text-sky-500 dark:text-sky-300"
                        : "border-[var(--dm-border)] bg-[var(--dm-subtle)] text-[var(--dm-muted)]"
                    }`}
                  >
                    {m} mode
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <label
                htmlFor="scan-output-name"
                className="block text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]"
              >
                Output PDF Filename
              </label>
              <input
                id="scan-output-name"
                type="text"
                value={outputName}
                onChange={(e) => setOutputName(e.target.value)}
                className="dm-input px-3.5 py-2 text-xs w-full font-mono"
                placeholder="scanned_notes.pdf"
              />
            </div>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-xs text-[var(--dm-muted)] flex items-center gap-1.5">
              <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500 shrink-0" />
              <span>
                Pages auto-save locally on every capture. Click Build PDF when all pages are ready.
              </span>
            </p>
            <button
              type="submit"
              disabled={pages.length === 0 || running}
              className="dm-primary-btn px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
            >
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>Build Multi-Page PDF ({pages.length} pages)</span>
            </button>
          </div>
        </form>

        {result && (
          <div className="dm-elevated p-5 flex flex-wrap items-center justify-between gap-3">
            <div className="text-xs space-y-1">
              <p className="text-sm font-semibold">{result.name}</p>
              <p className="font-mono text-[var(--dm-muted)]">
                {result.page_count} page(s) • {formatBytes(result.size_bytes)}
              </p>
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={downloadPdf}
                className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download PDF</span>
              </button>
              <Link
                href={`/app/workspace/${result.document_id}`}
                className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)]"
              >
                Open Studio
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
