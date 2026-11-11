"use client";

import { useState } from "react";
import { Download, Image as ImageIcon, Loader2, Upload } from "lucide-react";
import { formatBytes, PHOTO_RESIZE_PRESETS } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob } from "@/lib/api";

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
  const [file, setFile] = useState<File | null>(null);
  const [presetId, setPresetId] = useState<string>(PHOTO_RESIZE_PRESETS[0].id);
  const [widthPx, setWidthPx] = useState<number>(PHOTO_RESIZE_PRESETS[0].widthPx);
  const [heightPx, setHeightPx] = useState<number>(PHOTO_RESIZE_PRESETS[0].heightPx);
  const [dpi, setDpi] = useState<number>(PHOTO_RESIZE_PRESETS[0].dpi);
  const [maxKb, setMaxKb] = useState<number>(PHOTO_RESIZE_PRESETS[0].maxKb);
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
        <PrivacyBadge />
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <ImageIcon className="h-5 w-5 text-violet-400" />
            <span>Student Photo & Signature Resizer</span>
          </h1>
          <p className="text-sm text-[var(--dm-muted)] mt-1">
            Exact pixel, DPI, and KB sizing for Passport, GATE, JEE, UPSC, TNPSC, and scholarship portals.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="dm-card p-6 space-y-5">
          <label className="block border border-dashed border-[var(--dm-border)] rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500/50">
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Upload className="h-6 w-6 text-violet-400 mx-auto mb-2" />
            <p className="text-sm font-medium">{file ? file.name : "Upload JPG or PNG photo / signature"}</p>
            {file && <p className="text-xs font-mono text-[var(--dm-muted)] mt-1">{formatBytes(file.size)}</p>}
          </label>

          <div className="grid sm:grid-cols-3 gap-2">
            {PHOTO_RESIZE_PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => selectPreset(p.id)}
                className={`p-3 rounded-lg border text-left text-xs ${
                  presetId === p.id
                    ? "border-indigo-500 bg-indigo-500/15"
                    : "border-[var(--dm-border)]"
                }`}
              >
                <p className="font-semibold">{p.label}</p>
                <p className="font-mono text-[var(--dm-muted)] mt-1">
                  {p.widthPx}×{p.heightPx}px • ≤{p.maxKb}KB
                </p>
              </button>
            ))}
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs">
            <label className="space-y-1">
              <span className="text-[var(--dm-muted)]">Width (px)</span>
              <input
                type="number"
                value={widthPx}
                onChange={(e) => setWidthPx(Number(e.target.value))}
                className="w-full rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2.5 py-1.5 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[var(--dm-muted)]">Height (px)</span>
              <input
                type="number"
                value={heightPx}
                onChange={(e) => setHeightPx(Number(e.target.value))}
                className="w-full rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2.5 py-1.5 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[var(--dm-muted)]">DPI</span>
              <input
                type="number"
                value={dpi}
                onChange={(e) => setDpi(Number(e.target.value))}
                className="w-full rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2.5 py-1.5 font-mono"
              />
            </label>
            <label className="space-y-1">
              <span className="text-[var(--dm-muted)]">Max KB</span>
              <input
                type="number"
                value={maxKb}
                onChange={(e) => setMaxKb(Number(e.target.value))}
                className="w-full rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2.5 py-1.5 font-mono"
              />
            </label>
          </div>

          <label className="flex items-center gap-2 text-xs">
            <input
              type="checkbox"
              checked={enhanceBg}
              onChange={(e) => setEnhanceBg(e.target.checked)}
              className="rounded"
            />
            <span>Signature paper cleanup (boost ink contrast & whiten background)</span>
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
          <div className="dm-card p-6 flex flex-col sm:flex-row items-center gap-6">
            <img
              src={output.previewBlobUrl}
              alt="Resized result"
              className="w-36 h-auto rounded-lg border border-[var(--dm-border)] bg-white"
            />
            <div className="flex-1 space-y-2 text-xs">
              <p className="text-sm font-semibold">Output Ready</p>
              <p className="font-mono text-[var(--dm-muted)]">
                Dimensions: {output.data.metrics.width_px}×{output.data.metrics.height_px}px @ {output.data.metrics.dpi} DPI
              </p>
              <p className="font-mono text-[var(--dm-muted)]">
                Before: {formatBytes(output.data.metrics.before_bytes)} → After:{" "}
                <span className="text-indigo-400 font-semibold">
                  {formatBytes(output.data.metrics.after_bytes)}
                </span>
              </p>
              <button
                type="button"
                onClick={downloadOutput}
                className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5 mt-2"
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
