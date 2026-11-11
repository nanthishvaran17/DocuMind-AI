"use client";

import { useState } from "react";
import { Download, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { formatBytes, PHOTO_RESIZE_PRESETS } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences-store";

interface ResizeResponse {
  document_id: string;
  name: string;
  download_url: string;
  preview_url: string;
  metrics: {
    before_bytes: number;
    after_bytes: number;
    width_px: number;
    height_px: number;
    dpi: number;
    format: string;
    target_kb: number;
    target_met: boolean;
    warning: string | null;
  };
}

export default function PhotoResizerPage() {
  const { pushToast } = useToast();
  const defaultPhotoPreset = usePreferencesStore((s) => s.default_photo_preset);
  const initialPreset =
    PHOTO_RESIZE_PRESETS.find((p) => p.id === defaultPhotoPreset) ?? PHOTO_RESIZE_PRESETS[0];
  const [file, setFile] = useState<File | null>(null);
  const [presetId, setPresetId] = useState<string>(initialPreset.id);
  const [widthPx, setWidthPx] = useState<number>(initialPreset.widthPx);
  const [heightPx, setHeightPx] = useState<number>(initialPreset.heightPx);
  const [dpi, setDpi] = useState<number>(initialPreset.dpi);
  const [maxKb, setMaxKb] = useState<number>(initialPreset.maxKb);
  const [enhanceBg, setEnhanceBg] = useState(false);
  const [running, setRunning] = useState(false);
  const [output, setOutput] = useState<{
    data: ResizeResponse;
    previewBlobUrl: string;
  } | null>(null);

  const selectPreset = (id: string) => {
    setPresetId(id);
    const p = PHOTO_RESIZE_PRESETS.find((x) => x.id === id);
    if (!p) return;
    setWidthPx(p.widthPx);
    setHeightPx(p.heightPx);
    setDpi(p.dpi);
    setMaxKb(p.maxKb);
    setEnhanceBg(id.includes("signature"));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setRunning(true);
    try {
      const fd = new FormData();
      fd.append("file", file);
      fd.append("width_px", String(widthPx));
      fd.append("height_px", String(heightPx));
      fd.append("dpi", String(dpi));
      fd.append("max_kb", String(maxKb));
      fd.append("output_format", "JPEG");
      fd.append("enhance_background", String(enhanceBg));

      const res = await apiRequest<ResizeResponse>("/tools/image-resize", {
        method: "POST",
        body: fd,
        ensureGuest: true,
      });
      const data = res.data!;
      const blob = await fetchAuthorizedBlob(`/documents/${data.document_id}/preview`);
      const previewBlobUrl = URL.createObjectURL(blob);
      setOutput({ data, previewBlobUrl });
      pushToast({ title: "Photo resized to spec", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Resize failed",
        description: err instanceof Error ? err.message : "Could not resize image.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  };

  const downloadOutput = async () => {
    if (!output) return;
    const blob = await fetchAuthorizedBlob(`/documents/${output.data.document_id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = output.data.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Workspace", href: "/app" },
            { label: "Photo & Signature Resizer" },
          ]}
        />
        <PrivacyBadge />
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-violet-500/15 border border-violet-500/25 flex items-center justify-center text-violet-500 dark:text-violet-400 shrink-0">
            <ImageIcon className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Student Photo &amp; Signature Resizer</h1>
            <p className="text-sm text-[var(--dm-muted)] mt-0.5">
              Exact pixel, DPI & KB matching for Passport, GATE, JEE, UPSC, TNPSC, and scholarship portals.
            </p>
          </div>
        </div>

        <form onSubmit={handleSubmit} className="dm-card p-6 space-y-6">
          <label className="block border-2 border-dashed border-[var(--dm-border)] rounded-2xl p-7 text-center cursor-pointer hover:border-violet-500/60 hover:bg-violet-500/5 transition-all">
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-violet-600 to-indigo-600 text-white flex items-center justify-center mx-auto mb-3 shadow-md shadow-violet-500/25">
              <Upload className="h-5 w-5" />
            </div>
            <p className="text-sm font-bold text-[var(--dm-text)]">
              {file ? file.name : "Upload JPG or PNG photo / signature"}
            </p>
            {file && (
              <p className="text-xs font-mono text-violet-400 mt-1">{formatBytes(file.size)}</p>
            )}
          </label>

          <div className="space-y-2.5">
            <p className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
              Exam &amp; Portal Presets
            </p>
            <div className="grid sm:grid-cols-3 gap-2.5">
              {PHOTO_RESIZE_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => selectPreset(p.id)}
                  className={`p-3.5 rounded-xl border text-left text-xs transition-all ${
                    presetId === p.id
                      ? "border-violet-600 bg-violet-50 text-violet-950 dark:bg-violet-500/20 dark:text-white dark:border-violet-400 ring-2 ring-violet-500/20 shadow-xs"
                      : "border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-violet-400 hover:bg-violet-50/30"
                  }`}
                >
                  <p className="font-bold text-[var(--dm-text)]">{p.label}</p>
                  <p className="font-mono text-violet-700 dark:text-violet-300 font-semibold mt-1">
                    {p.widthPx}×{p.heightPx}px • ≤{p.maxKb}KB
                  </p>
                </button>
              ))}
            </div>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1.5">
              <span className="text-[var(--dm-text)] font-semibold">Width (px)</span>
              <input
                type="number"
                value={widthPx}
                onChange={(e) => setWidthPx(Number(e.target.value))}
                className="dm-input w-full px-3 py-2 font-mono"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[var(--dm-text)] font-semibold">Height (px)</span>
              <input
                type="number"
                value={heightPx}
                onChange={(e) => setHeightPx(Number(e.target.value))}
                className="dm-input w-full px-3 py-2 font-mono"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[var(--dm-text)] font-semibold">DPI</span>
              <input
                type="number"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="dm-input w-full px-3 py-2 font-mono"
              />
            </label>
            <label className="space-y-1.5">
              <span className="text-[var(--dm-text)] font-semibold">Max KB</span>
              <input
                type="number"
                value={maxKb}
                onChange={(e) => setMaxKb(Number(e.target.value))}
                className="dm-input w-full px-3 py-2 font-mono"
              />
            </label>
          </div>

          <label className="flex items-center gap-2.5 text-xs p-3.5 rounded-xl border border-[var(--dm-border-strong)] bg-white dark:bg-[var(--dm-surface)] text-[var(--dm-text)] font-semibold cursor-pointer shadow-2xs">
            <input
              type="checkbox"
              checked={enhanceBg}
              onChange={(e) => setEnhanceBg(e.target.checked)}
              className="rounded accent-violet-600 h-4 w-4"
            />
            <span>Signature paper cleanup (boost ink contrast &amp; whiten background)</span>
          </label>

          <button
            type="submit"
            disabled={!file || running}
            className="dm-primary-btn px-5 py-2.5 text-sm font-medium inline-flex items-center gap-2 disabled:opacity-50"
          >
            {running && <Loader2 className="h-4 w-4 animate-spin" />}
            <span>Resize Photo</span>
          </button>
        </form>

        {output && (
          <div className="dm-elevated p-6 flex flex-col sm:flex-row items-center gap-6">
            <img
              src={output.previewBlobUrl}
              alt="Resized result"
              className="w-36 h-auto rounded-xl border border-[var(--dm-border)] bg-white shadow-md"
            />
            <div className="flex-1 space-y-2.5 text-xs">
              <span className="inline-block px-2.5 py-0.5 rounded-full bg-emerald-500/15 text-emerald-500 dark:text-emerald-300 font-medium">
                Spec Verified
              </span>
              <p className="text-base font-semibold">Output Ready</p>
              <p className="font-mono text-[var(--dm-muted)]">
                Dimensions: {output.data.metrics.width_px}×{output.data.metrics.height_px}px @ {output.data.metrics.dpi} DPI
              </p>
              <p className="font-mono text-[var(--dm-muted)]">
                Before: {formatBytes(output.data.metrics.before_bytes)} → After:{" "}
                <span className="text-indigo-500 dark:text-indigo-300 font-semibold">
                  {formatBytes(output.data.metrics.after_bytes)}
                </span>
              </p>
              <button
                type="button"
                onClick={downloadOutput}
                className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5 mt-1"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download {output.data.metrics.format}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
