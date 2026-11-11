"use client";

import Link from "next/link";
import { useState } from "react";
import { AlertTriangle, CheckCircle2, Download, Loader2, Minimize2, Upload } from "lucide-react";
import type { DocumentItem, JobRecord } from "@documind/types";
import { COMPRESS_TARGET_PRESETS, formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob, pollOrStreamJob } from "@/lib/api";

export default function CompressToolPage() {
  const { pushToast } = useToast();
  const [file, setFile] = useState<File | null>(null);
  const [targetKb, setTargetKb] = useState<number>(200);
  const [running, setRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [result, setResult] = useState<{
    docId: string;
    name: string;
    beforeBytes: number;
    afterBytes: number;
    savedPercent: number;
    targetMet: boolean;
    warning: string | null;
  } | null>(null);

  const runCompress = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!file) return;
    setRunning(true);
    setResult(null);
    setProgressMsg("Uploading & scanning PDF...");
    try {
      const fd = new FormData();
      fd.append("file", file);
      const up = await apiRequest<DocumentItem>("/documents/upload", {
        method: "POST",
        body: fd,
        ensureGuest: true,
      });
      const doc = up.data!;

      setProgressMsg(`Compressing toward ${targetKb} KB...`);
      const jobRes = await apiRequest<JobRecord>("/tools/compress-to-size", {
        method: "POST",
        body: JSON.stringify({ document_id: doc.id, target_kb: targetKb }),
      });
      const finalJob = await pollOrStreamJob(jobRes.data!.id, (p) => {
        if (p.stage_message) setProgressMsg(`${p.stage_message} (${p.progress ?? 0}%)`);
      });
      if (finalJob.status !== "completed") {
        throw new Error(String(finalJob.error_detail?.message || "Compression failed."));
      }

      const meta = finalJob.result_meta || {};
      setResult({
        docId: doc.id,
        name: doc.name,
        beforeBytes: Number(meta.before_bytes ?? doc.size_bytes),
        afterBytes: Number(meta.after_bytes ?? doc.size_bytes),
        savedPercent: Number(meta.saved_percent ?? 0),
        targetMet: Boolean(meta.target_met ?? true),
        warning: (meta.warning as string | null) ?? null,
      });
      pushToast({ title: "Compression finished", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Compression failed",
        description: err instanceof Error ? err.message : "Error compressing PDF",
        variant: "error",
      });
    } finally {
      setRunning(false);
      setProgressMsg(null);
    }
  };

  const downloadCompressed = async () => {
    if (!result) return;
    const blob = await fetchAuthorizedBlob(`/documents/${result.docId}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = result.name.replace(/\.pdf$/i, `_${targetKb}kb.pdf`);
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <AppShell>
      <div className="max-w-3xl mx-auto space-y-6">
        <PrivacyBadge />

        <div className="space-y-1">
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Minimize2 className="h-5 w-5 text-indigo-400" />
            <span>Compress PDF to Exact Size</span>
          </h1>
          <p className="text-sm text-[var(--dm-muted)]">
            Hit portal upload limits (100 KB, 200 KB, 1 MB, 2 MB) in 3 clicks. Original file stays intact as v1.
          </p>
        </div>

        <form onSubmit={runCompress} className="dm-card p-6 space-y-5">
          <label className="block border border-dashed border-[var(--dm-border)] rounded-xl p-6 text-center cursor-pointer hover:border-indigo-500/50 transition-colors">
            <input
              type="file"
              accept=".pdf,application/pdf"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
              className="hidden"
            />
            <Upload className="h-6 w-6 text-indigo-400 mx-auto mb-2" />
            <p className="text-sm font-medium">{file ? file.name : "Click to choose a PDF"}</p>
            {file && (
              <p className="text-xs font-mono text-[var(--dm-muted)] mt-1">
                Original size: {formatBytes(file.size)}
              </p>
            )}
          </label>

          <div className="space-y-2">
            <label className="text-xs font-medium text-[var(--dm-muted)]">Target Size Preset</label>
            <div className="grid sm:grid-cols-4 gap-2">
              {COMPRESS_TARGET_PRESETS.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setTargetKb(p.targetKb)}
                  className={`p-3 rounded-lg border text-left transition-colors ${
                    targetKb === p.targetKb
                      ? "border-indigo-500 bg-indigo-500/15"
                      : "border-[var(--dm-border)] hover:border-indigo-500/40"
                  }`}
                >
                  <p className="text-sm font-semibold">{p.label}</p>
                  <p className="text-[11px] text-[var(--dm-muted)] mt-0.5">{p.useCase}</p>
                </button>
              ))}
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <label className="text-xs text-[var(--dm-muted)]">Custom Target (KB):</label>
            <input
              type="number"
              min={10}
              max={51200}
              value={targetKb}
              onChange={(e) => setTargetKb(Number(e.target.value) || 200)}
              className="w-28 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-1.5 text-sm font-mono"
            />
            <button
              type="submit"
              disabled={!file || running}
              className="dm-primary-btn px-5 py-2 text-sm font-medium inline-flex items-center gap-2 ml-auto disabled:opacity-50"
            >
              {running && <Loader2 className="h-4 w-4 animate-spin" />}
              <span>{running ? progressMsg || "Processing..." : "Compress PDF"}</span>
            </button>
          </div>
        </form>

        {result && (
          <div className="dm-card p-6 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                {result.targetMet ? (
                  <CheckCircle2 className="h-5 w-5 text-emerald-500" />
                ) : (
                  <AlertTriangle className="h-5 w-5 text-amber-400" />
                )}
                <h2 className="text-base font-semibold">
                  {result.targetMet ? "Target size achieved" : "Compressed (closest achievable size)"}
                </h2>
              </div>
              <span className="font-mono text-xs px-2.5 py-1 rounded bg-emerald-500/10 text-emerald-400">
                -{result.savedPercent}%
              </span>
            </div>

            <div className="grid grid-cols-2 gap-3 text-sm">
              <div className="dm-elevated p-3">
                <p className="text-xs text-[var(--dm-muted)]">Before (v1)</p>
                <p className="font-mono font-semibold mt-0.5">{formatBytes(result.beforeBytes)}</p>
              </div>
              <div className="dm-elevated p-3">
                <p className="text-xs text-[var(--dm-muted)]">After (v2)</p>
                <p className="font-mono font-semibold mt-0.5 text-indigo-400">
                  {formatBytes(result.afterBytes)}
                </p>
              </div>
            </div>

            {result.warning && (
              <p className="text-xs text-amber-400 bg-amber-500/10 border border-amber-500/25 rounded-lg p-3">
                {result.warning}
              </p>
            )}

            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={downloadCompressed}
                className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <Download className="h-3.5 w-3.5" />
                <span>Download Compressed PDF</span>
              </button>
              <Link
                href={`/app/workspace/${result.docId}`}
                className="px-4 py-2 text-xs rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-elevated)]"
              >
                Inspect in Workspace
              </Link>
            </div>
          </div>
        )}
      </div>
    </AppShell>
  );
}
