"use client";

import Link from "next/link";
import { useState } from "react";
import { Camera, Download, Loader2, Trash2 } from "lucide-react";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob } from "@/lib/api";

interface ScanResult {
  document_id: string;
  name: string;
  page_count: number;
  size_bytes: number;
}

export default function CameraScanPage() {
  const { pushToast } = useToast();
  const [files, setFiles] = useState<File[]>([]);
  const [enhanceMode, setEnhanceMode] = useState<"document" | "grayscale" | "original">("document");
  const [outputName, setOutputName] = useState("scanned_notes.pdf");
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState<ScanResult | null>(null);

  const addFiles = (incoming: FileList | null) => {
    if (!incoming) return;
    setFiles((prev) => [...prev, ...Array.from(incoming)].slice(0, 30));
  };

  const handleScan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (files.length === 0) return;
    setRunning(true);
    try {
      const fd = new FormData();
      files.forEach((f) => fd.append("files", f));
      fd.append("enhance_mode", enhanceMode);
      fd.append("output_name", outputName);

      const res = await apiRequest<ScanResult>("/tools/scan", {
        method: "POST",
        body: fd,
        ensureGuest: true,
      });
      setResult(res.data!);
      pushToast({ title: "Scanned PDF created", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Scan failed",
        description: err instanceof Error ? err.message : "Could not generate PDF.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
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
      <div className="max-w-3xl mx-auto space-y-6">
        <PrivacyBadge />
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Camera className="h-5 w-5 text-sky-400" />
            <span>Camera Scan to PDF</span>
          </h1>
          <p className="text-sm text-[var(--dm-muted)] mt-1">
            Capture notes or lab sheets directly from your phone camera and combine them into an enhanced PDF.
          </p>
        </div>

        <form onSubmit={handleScan} className="dm-card p-6 space-y-5">
          <div className="flex flex-wrap gap-3">
            <label className="dm-primary-btn px-4 py-2 text-xs font-medium cursor-pointer inline-flex items-center gap-2">
              <Camera className="h-4 w-4" />
              <span>Capture / Select Photos</span>
              <input
                type="file"
                accept="image/png,image/jpeg"
                capture="environment"
                multiple
                onChange={(e) => addFiles(e.target.files)}
                className="hidden"
              />
            </label>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              className="rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-1.5 text-xs flex-1 min-w-[180px]"
              placeholder="Output filename"
            />
          </div>

          <div className="flex flex-wrap gap-2 text-xs">
            {(["document", "grayscale", "original"] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setEnhanceMode(m)}
                className={`px-3 py-1.5 rounded-lg border capitalize ${
                  enhanceMode === m ? "border-indigo-500 bg-indigo-500/15" : "border-[var(--dm-border)]"
                }`}
              >
                {m} mode
              </button>
            ))}
          </div>

          {files.length > 0 && (
            <ul className="space-y-1.5 text-xs">
              {files.map((f, idx) => (
                <li
                  key={`${f.name}-${idx}`}
                  className="dm-elevated px-3 py-2 flex items-center justify-between"
                >
                  <span className="truncate">
                    Page {idx + 1}: {f.name} ({formatBytes(f.size)})
                  </span>
                  <button
                    type="button"
                    onClick={() => setFiles((p) => p.filter((_, i) => i !== idx))}
                    className="text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </li>
              ))}
            </ul>
          )}

          <button
            type="submit"
            disabled={files.length === 0 || running}
            className="dm-primary-btn px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Build Multi-Page PDF ({files.length} pages)</span>
          </button>
        </form>

        {result && (
          <div className="dm-card p-5 flex flex-wrap items-center justify-between gap-3">
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
                className="px-4 py-2 text-xs rounded-lg border border-[var(--dm-border)]"
              >
                Open Workspace
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
