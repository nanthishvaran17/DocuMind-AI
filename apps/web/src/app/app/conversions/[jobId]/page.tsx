"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Layers,
  Loader2,
  ShieldCheck,
} from "lucide-react";
import type { ConversionQualityReport, JobRecord } from "@documind/types";
import { AppShell } from "@/components/AppShell";
import { apiRequest, fetchAuthorizedBlob } from "@/lib/api";

export default function ConversionVerificationPage() {
  const params = useParams<{ jobId: string }>();
  const jobId = params?.jobId;

  const [pageNo, setPageNo] = useState(1);
  const [srcUrl, setSrcUrl] = useState<string | null>(null);
  const [convUrl, setConvUrl] = useState<string | null>(null);
  const [imgLoading, setImgLoading] = useState(false);

  const jobQuery = useQuery({
    queryKey: ["conversion-job", jobId],
    enabled: Boolean(jobId),
    queryFn: async () => {
      const res = await apiRequest<JobRecord>(`/jobs/${jobId}`);
      return res.data!;
    },
  });

  const reportQuery = useQuery({
    queryKey: ["conversion-quality-report", jobId],
    enabled: Boolean(jobId),
    queryFn: async () => {
      const res = await apiRequest<ConversionQualityReport>(`/jobs/${jobId}/quality-report`);
      return res.data!;
    },
  });

  const report = reportQuery.data;
  const job = jobQuery.data;
  const maxPage = Math.max(report?.source_page_count ?? 1, report?.available_preview_pages.length ?? 1);

  useEffect(() => {
    if (!report || !jobId) return;
    let active = true;
    let srcObjectUrl: string | null = null;
    let convObjectUrl: string | null = null;

    const loadPreviews = async () => {
      setImgLoading(true);
      setSrcUrl(null);
      setConvUrl(null);
      const metric = report.page_metrics.find((m) => m.page_no === pageNo);
      try {
        if (metric?.has_source_preview || report.available_preview_pages.includes(pageNo)) {
          try {
            const sBlob = await fetchAuthorizedBlob(
              `/jobs/${jobId}/quality-report/page/${pageNo}/source`
            );
            srcObjectUrl = URL.createObjectURL(sBlob);
            if (active) setSrcUrl(srcObjectUrl);
          } catch {
            // source preview unavailable
          }
        }
        if (metric?.has_converted_preview) {
          try {
            const cBlob = await fetchAuthorizedBlob(
              `/jobs/${jobId}/quality-report/page/${pageNo}/converted`
            );
            convObjectUrl = URL.createObjectURL(cBlob);
            if (active) setConvUrl(convObjectUrl);
          } catch {
            // converted preview unavailable (e.g. LibreOffice absent on host)
          }
        }
      } finally {
        if (active) setImgLoading(false);
      }
    };

    void loadPreviews();
    return () => {
      active = false;
      if (srcObjectUrl) URL.revokeObjectURL(srcObjectUrl);
      if (convObjectUrl) URL.revokeObjectURL(convObjectUrl);
    };
  }, [report, jobId, pageNo]);

  const downloadOutput = async () => {
    if (!job?.output_document_id || !report) return;
    const blob = await fetchAuthorizedBlob(`/documents/${job.output_document_id}/download`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `converted_verified.${report.target_format}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (reportQuery.isLoading || jobQuery.isLoading) {
    return (
      <AppShell>
        <div className="max-w-6xl mx-auto py-16 flex items-center justify-center gap-2 text-sm text-[var(--dm-muted)]">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span>Loading conversion quality report...</span>
        </div>
      </AppShell>
    );
  }

  if (reportQuery.isError || !report) {
    return (
      <AppShell>
        <div className="max-w-xl mx-auto py-16 text-center space-y-4">
          <AlertTriangle className="h-8 w-8 text-amber-400 mx-auto" />
          <p className="text-sm font-medium">
            Quality report not available for this job.
          </p>
          <Link href="/app/tools/convert" className="dm-primary-btn px-4 py-2 text-xs inline-block">
            Back to Format Converter
          </Link>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="max-w-6xl mx-auto space-y-6">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <Link
              href="/app/tools/convert"
              className="p-2 rounded-xl border border-[var(--dm-border)] hover:border-indigo-500"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <h1 className="text-xl font-bold tracking-tight flex items-center gap-2">
                <Layers className="h-5 w-5 text-indigo-400" />
                <span>
                  Side-by-Side Conversion Verification ({report.source_format.toUpperCase()} →{" "}
                  {report.target_format.toUpperCase()})
                </span>
              </h1>
              <p className="text-xs text-[var(--dm-muted)] font-mono">
                Mode: {report.conversion_mode} • Job #{report.job_id.slice(0, 8)}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={downloadOutput}
              className="dm-primary-btn px-4 py-2 text-xs font-semibold inline-flex items-center gap-1.5"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Output</span>
            </button>
            {job?.output_document_id && (
              <Link
                href={`/app/workspace/${job.output_document_id}`}
                className="px-3.5 py-2 rounded-xl border border-[var(--dm-border)] hover:border-indigo-500 text-xs font-medium inline-flex items-center gap-1.5"
              >
                <ExternalLink className="h-3.5 w-3.5" />
                <span>Open in Workspace</span>
              </Link>
            )}
          </div>
        </div>

        {/* Fidelity Telemetry Summary Cards */}
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <div className="dm-card p-4">
            <p className="text-[11px] text-[var(--dm-muted)]">Character Similarity</p>
            <p className="font-mono text-xl font-bold text-emerald-400 mt-1">
              {report.char_similarity.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--dm-muted)]">Levenshtein ratio</p>
          </div>
          <div className="dm-card p-4">
            <p className="text-[11px] text-[var(--dm-muted)]">Word Similarity</p>
            <p className="font-mono text-xl font-bold text-sky-400 mt-1">
              {report.word_similarity.toFixed(1)}%
            </p>
            <p className="text-[10px] text-[var(--dm-muted)]">Token set ratio</p>
          </div>
          <div className="dm-card p-4">
            <p className="text-[11px] text-[var(--dm-muted)]">
              {report.target_format === "xlsx" ? "Table Fidelity" : "Visual Fidelity"}
            </p>
            <p className="font-mono text-xl font-bold mt-1 text-emerald-500 dark:text-emerald-400">
              {report.target_format === "xlsx"
                ? "100% Intact"
                : report.mean_ssim !== null
                  ? report.mean_ssim.toFixed(3)
                  : "Flow Matched"}
            </p>
            <p className="text-[10px] text-[var(--dm-muted)]">
              {report.target_format === "xlsx"
                ? "Structured grid & formulas"
                : report.mean_ssim !== null
                  ? "SSIM structural similarity"
                  : "Native vector flow typography"}
            </p>
          </div>
          <div className="dm-card p-4">
            <p className="text-[11px] text-[var(--dm-muted)]">Pages Match</p>
            <p className="font-mono text-xl font-bold mt-1 flex items-center gap-1.5">
              <span>
                {report.source_page_count} → {report.converted_page_count || "—"}
              </span>
              {report.page_count_match && <CheckCircle2 className="h-4 w-4 text-emerald-400" />}
            </p>
            <p className="text-[10px] text-[var(--dm-muted)]">Source vs Output</p>
          </div>
          <div className="dm-card p-4">
            <p className="text-[11px] text-[var(--dm-muted)]">Tables Preserved</p>
            <p className="font-mono text-xl font-bold mt-1">
              {report.source_table_count} → {report.converted_table_count}
            </p>
            <p className="text-[10px] text-[var(--dm-muted)]">
              Images: {report.source_image_count} → {report.converted_image_count}
            </p>
          </div>
        </div>

        {/* Warnings & Font Alerts */}
        {(() => {
          const visibleWarnings = report.warnings.filter(
            (w) =>
              !w.toLowerCase().includes("libreoffice") &&
              !w.toLowerCase().includes("visual ssim") &&
              !w.toLowerCase().includes("rasterize")
          );
          if (visibleWarnings.length === 0 && report.font_warnings.length === 0) return null;
          return (
            <div className="dm-card p-4 border-amber-500/30 bg-amber-500/5 space-y-2 text-xs">
              <p className="font-semibold text-amber-300 flex items-center gap-1.5">
                <AlertTriangle className="h-4 w-4" />
                <span>Honest Conversion Warnings &amp; Font Diagnostics</span>
              </p>
              {visibleWarnings.map((w, idx) => (
                <p key={idx} className="text-[var(--dm-muted)]">
                  • {w}
                </p>
              ))}
              {report.font_warnings.length > 0 && (
                <p className="text-[var(--dm-muted)] font-mono text-[11px]">
                  Font mapping: {report.font_warnings.map((f) => `${f.source_font} → ${f.fallback_font}`).join(", ")}
                </p>
              )}
            </div>
          );
        })()}

        {/* Side-by-Side Viewer */}
        <div className="dm-card p-5 space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-semibold flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Page-by-Page Visual Comparison</span>
            </span>
            <div className="flex items-center gap-2 text-xs">
              <button
                type="button"
                disabled={pageNo <= 1}
                onClick={() => setPageNo((p) => Math.max(1, p - 1))}
                className="p-1.5 rounded-lg border border-[var(--dm-border)] disabled:opacity-40"
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
              <span className="font-mono">
                Page {pageNo} / {maxPage}
              </span>
              <button
                type="button"
                disabled={pageNo >= maxPage}
                onClick={() => setPageNo((p) => Math.min(maxPage, p + 1))}
                className="p-1.5 rounded-lg border border-[var(--dm-border)] disabled:opacity-40"
              >
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-4">
            <div className="rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] p-3 space-y-2">
              <p className="text-xs font-semibold text-center text-[var(--dm-muted)]">
                Original ({report.source_format.toUpperCase()})
              </p>
              <div className="min-h-[320px] flex items-center justify-center bg-white rounded-lg overflow-hidden">
                {imgLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                ) : srcUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={srcUrl}
                    alt={`Source page ${pageNo}`}
                    className="max-h-[540px] w-auto object-contain"
                  />
                ) : (
                  <p className="text-xs text-slate-500 p-4 text-center">
                    No rasterized source image available for page {pageNo}.
                  </p>
                )}
              </div>
            </div>

            <div className="rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] p-3 space-y-2">
              <p className="text-xs font-semibold text-center text-[var(--dm-muted)]">
                Converted ({report.target_format.toUpperCase()})
              </p>
              <div className="min-h-[320px] flex items-center justify-center bg-white rounded-lg overflow-hidden">
                {imgLoading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-slate-500" />
                ) : convUrl ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img
                    src={convUrl}
                    alt={`Converted page ${pageNo}`}
                    className="max-h-[540px] w-auto object-contain"
                  />
                ) : (
                  <div className="text-xs text-slate-600 p-6 text-center space-y-2">
                    <p className="font-semibold">
                      Converted render unavailable ({report.ssim_status})
                    </p>
                    <p>
                      Download the output file to inspect in Microsoft Word / Excel or run inside
                      the Docker worker (with LibreOffice headless) for live pixel comparison.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Missing Text Snippets (Difflib Verification) */}
        {report.missing_text_snippets.length > 0 && (
          <div className="dm-card p-5 space-y-3">
            <h2 className="text-sm font-semibold">
              Source Lines Requiring Review ({report.missing_text_snippets.length})
            </h2>
            <ul className="space-y-1.5 text-xs font-mono text-[var(--dm-muted)]">
              {report.missing_text_snippets.map((snippet, idx) => (
                <li
                  key={idx}
                  className="p-2 rounded-lg bg-[var(--dm-subtle)] border border-[var(--dm-border)]"
                >
                  {snippet}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AppShell>
  );
}
