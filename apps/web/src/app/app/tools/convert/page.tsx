"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowLeftRight,
  CheckCircle2,
  Download,
  ExternalLink,
  FileSpreadsheet,
  FileText,
  Layers,
  Loader2,
  ShieldCheck,
  Table2,
  Upload,
} from "lucide-react";
import type {
  ConversionQualityReport,
  ConversionTargetFormat,
  DocumentItem,
  DocxConversionMode,
  ExtractedTablesResult,
  JobRecord,
} from "@documind/types";
import { CONVERSION_TARGETS, formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob, pollOrStreamJob } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { usePreferencesStore } from "@/stores/preferences-store";

const FORMAT_LABELS: Record<ConversionTargetFormat, { label: string; desc: string }> = {
  docx: { label: "Word (.docx)", desc: "Editable paragraphs, grids & column widths" },
  xlsx: { label: "Excel (.xlsx)", desc: "Styled sheets, numeric types & print fit" },
  pdf: { label: "PDF (.pdf)", desc: "Immutable A4 / landscape print-ready layout" },
  pptx: { label: "PowerPoint (.pptx)", desc: "Widescreen 16:9 slide deck + speaker notes" },
  md: { label: "Markdown (.md)", desc: "Clean headings & GitHub-style tables" },
  txt: { label: "Plain Text (.txt)", desc: "Normalized UTF-8 text per page" },
  html: { label: "Web Page (.html)", desc: "Structured semantic HTML tables & prose" },
  csv: { label: "CSV Tables (.csv)", desc: "Detected PDF tables or spreadsheet rows" },
  json: { label: "JSON Data (.json)", desc: "Structured pages & cell coordinates" },
  png: { label: "PNG Pages", desc: "Crisp lossless page renders (.png / .zip)" },
  jpg: { label: "JPG Pages", desc: "Compact 90% quality page images" },
};

const DOCX_MODES: Array<{ id: DocxConversionMode; title: string; subtitle: string }> = [
  {
    id: "editable",
    title: "Exact Editable Word",
    subtitle: "Rebuilds headings, font sizes, colored table borders/fills & images.",
  },
  {
    id: "high_fidelity",
    title: "Hybrid Tight-Fit Layout",
    subtitle: "Compact spacing & strict page/table fidelity for dense forms.",
  },
  {
    id: "hybrid",
    title: "Text + Page Snapshot",
    subtitle: "Includes a full-width page render plus editable extracted tables.",
  },
];

function inferExtFromDoc(doc: DocumentItem | undefined): string {
  if (!doc) return "pdf";
  const dot = doc.name.lastIndexOf(".");
  if (dot >= 0) {
    const ext = doc.name.slice(dot + 1).toLowerCase();
    if (ext === "markdown") return "md";
    if (ext === "htm") return "html";
    if (ext === "jpeg") return "jpg";
    return ext;
  }
  if (doc.mime_type === "application/pdf") return "pdf";
  if (doc.mime_type.includes("wordprocessingml")) return "docx";
  if (doc.mime_type.includes("spreadsheetml")) return "xlsx";
  if (doc.mime_type.includes("presentationml")) return "pptx";
  return "txt";
}

function ConvertStudioContent() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("doc") || "";
  const initialTarget = (searchParams.get("target") || "") as ConversionTargetFormat | "";

  const token = useAuthStore((s) => s.accessToken);
  const defaultDocxMode = usePreferencesStore((s) => s.default_docx_mode);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [selectedDocId, setSelectedDocId] = useState<string>(initialDocId);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [targetFormat, setTargetFormat] = useState<ConversionTargetFormat>(
    initialTarget || "docx"
  );
  const [docxMode, setDocxMode] = useState<DocxConversionMode>(defaultDocxMode);
  const [pptxMode, setPptxMode] = useState<"hybrid" | "editable" | "visual">("hybrid");
  const [outputName, setOutputName] = useState<string>("");
  const [running, setRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<JobRecord | null>(null);
  const [qualityReport, setQualityReport] = useState<ConversionQualityReport | null>(null);
  const [tablePreview, setTablePreview] = useState<ExtractedTablesResult | null>(null);
  const [extractingTables, setExtractingTables] = useState(false);

  const docsQuery = useQuery({
    queryKey: ["convert-docs", Boolean(token)],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?limit=100");
      return res.data ?? [];
    },
  });

  const docs = useMemo(() => docsQuery.data ?? [], [docsQuery.data]);

  const activeDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId),
    [docs, selectedDocId]
  );

  const sourceExt = useMemo(() => {
    if (uploadFile) {
      const dot = uploadFile.name.lastIndexOf(".");
      const ext = dot >= 0 ? uploadFile.name.slice(dot + 1).toLowerCase() : "pdf";
      return ext === "markdown" ? "md" : ext === "htm" ? "html" : ext === "jpeg" ? "jpg" : ext;
    }
    return inferExtFromDoc(activeDoc);
  }, [uploadFile, activeDoc]);

  const availableTargets = useMemo(() => {
    return CONVERSION_TARGETS[sourceExt] ?? CONVERSION_TARGETS.pdf;
  }, [sourceExt]);

  useEffect(() => {
    if (availableTargets.length > 0 && !availableTargets.includes(targetFormat)) {
      setTargetFormat(availableTargets[0]);
    }
  }, [availableTargets, targetFormat]);

  useEffect(() => {
    if (!selectedDocId && docs.length > 0 && !uploadFile) {
      setSelectedDocId(docs[0].id);
    }
  }, [docs, selectedDocId, uploadFile]);

  const handleConvert = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCompletedJob(null);
    setQualityReport(null);
    setRunning(true);
    setProgressMsg("Preparing document...");

    try {
      let targetDocId = selectedDocId;
      if (uploadFile) {
        setProgressMsg("Uploading & malware-scanning file...");
        const fd = new FormData();
        fd.append("file", uploadFile);
        const upRes = await apiRequest<DocumentItem>("/documents/upload", {
          method: "POST",
          body: fd,
          ensureGuest: true,
        });
        targetDocId = upRes.data!.id;
        setSelectedDocId(targetDocId);
        setUploadFile(null);
        await queryClient.invalidateQueries({ queryKey: ["convert-docs"] });
      }

      if (!targetDocId) {
        throw new Error("Upload a file or select a document from your library first.");
      }

      setProgressMsg(`Converting ${sourceExt.toUpperCase()} -> ${targetFormat.toUpperCase()}...`);
      const jobRes = await apiRequest<JobRecord>("/tools/convert", {
        method: "POST",
        ensureGuest: true,
        body: JSON.stringify({
          document_id: targetDocId,
          target_format: targetFormat,
          mode: docxMode,
          pptx_mode: pptxMode,
          output_name: outputName.trim() || undefined,
        }),
      });

      const finalJob = await pollOrStreamJob(jobRes.data!.id, (p) => {
        if (p.stage_message) setProgressMsg(`${p.stage_message} (${p.progress ?? 0}%)`);
      });

      if (finalJob.status !== "completed") {
        throw new Error(String(finalJob.error_detail?.message || "Conversion failed."));
      }

      setCompletedJob(finalJob);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["convert-docs"] });

      try {
        const qRes = await apiRequest<ConversionQualityReport>(
          `/jobs/${finalJob.id}/quality-report`
        );
        if (qRes.data) setQualityReport(qRes.data);
      } catch {
        // Zipped multi-image exports do not record single quality reports
      }

      pushToast({
        title: `Converted to ${targetFormat.toUpperCase()}`,
        description: "Immutable new document saved to your library.",
        variant: "success",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Conversion failed.";
      setErrorMsg(msg);
      pushToast({ title: "Conversion failed", description: msg, variant: "error" });
    } finally {
      setRunning(false);
      setProgressMsg(null);
    }
  };

  const handlePreviewTables = async () => {
    if (!selectedDocId || sourceExt !== "pdf") return;
    setExtractingTables(true);
    setErrorMsg(null);
    try {
      const res = await apiRequest<ExtractedTablesResult>("/tools/extract-tables", {
        method: "POST",
        ensureGuest: true,
        body: JSON.stringify({ document_id: selectedDocId, output_format: "json" }),
      });
      setTablePreview(res.data ?? null);
    } catch (err) {
      setErrorMsg(err instanceof Error ? err.message : "Could not extract tables.");
    } finally {
      setExtractingTables(false);
    }
  };

  const downloadOutput = async () => {
    if (!completedJob?.output_document_id) return;
    const blob = await fetchAuthorizedBlob(
      `/documents/${completedJob.output_document_id}/download`
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = (outputName.trim() || activeDoc?.name || "converted").replace(/\.[^.]+$/, "");
    const pagesExported = Number(completedJob.result_meta?.pages_exported ?? 2);
    a.download =
      (targetFormat === "png" || targetFormat === "jpg") && pagesExported > 1
        ? `${base}_pages.zip`
        : `${base}.${targetFormat}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <Breadcrumbs
        items={[
          { label: "Home", href: "/" },
          { label: "Workspace", href: "/app" },
          { label: "Format Converter" },
        ]}
      />
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-sky-500/15 border border-sky-500/30 text-sky-400 flex items-center justify-center">
              <ArrowLeftRight className="h-5 w-5" />
            </span>
            <span>Bidirectional Format Studio</span>
          </h1>
          <p className="text-sm text-[var(--dm-muted)] mt-1">
            Convert PDF tables &amp; layouts into exact-fit Word / Excel, or export Word, Excel,
            PowerPoint, HTML &amp; Images back to clean PDF with objective fidelity scoring.
          </p>
        </div>
        <PrivacyBadge />
      </div>

      <form onSubmit={handleConvert} className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 dm-card p-6 space-y-5">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                1. Source Document
              </label>
              {activeDoc && !uploadFile && (
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--dm-subtle)] border border-[var(--dm-border)] text-[var(--dm-muted)]">
                  Detected: .{sourceExt.toUpperCase()} • {formatBytes(activeDoc.size_bytes)}
                </span>
              )}
            </div>

            {docs.length > 0 && (
              <select
                value={uploadFile ? "" : selectedDocId}
                onChange={(e) => {
                  setUploadFile(null);
                  setSelectedDocId(e.target.value);
                  setTablePreview(null);
                }}
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              >
                <option value="">-- Choose from library ({docs.length} files) --</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({formatBytes(d.size_bytes)})
                  </option>
                ))}
              </select>
            )}

            <label className="block border-2 border-dashed border-[var(--dm-border-strong)] hover:border-indigo-500/70 rounded-xl p-4 text-center cursor-pointer transition-colors bg-[var(--dm-subtle)]">
              <Upload className="h-5 w-5 mx-auto text-indigo-400 mb-1.5" />
              <p className="text-xs font-medium">
                {uploadFile
                  ? `Ready to upload: ${uploadFile.name} (${formatBytes(uploadFile.size)})`
                  : "Or drop / upload a PDF, DOCX, XLSX, PPTX, MD, TXT or image"}
              </p>
              <input
                type="file"
                accept=".pdf,.docx,.xlsx,.pptx,.md,.txt,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => {
                  const picked = e.target.files?.[0] || null;
                  setUploadFile(picked);
                  setTablePreview(null);
                }}
              />
            </label>
          </div>

          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
              2. Target Format ({sourceExt.toUpperCase()} → ?)
            </label>
            <div className="grid sm:grid-cols-3 gap-2">
              {availableTargets.map((fmt) => {
                const info = FORMAT_LABELS[fmt];
                const selected = targetFormat === fmt;
                return (
                  <button
                    key={fmt}
                    type="button"
                    onClick={() => setTargetFormat(fmt)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      selected
                        ? "border-indigo-500 bg-indigo-500/12 ring-1 ring-indigo-500/40"
                        : "border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-indigo-500/40"
                    }`}
                  >
                    <p className="text-xs font-semibold">{info?.label || fmt.toUpperCase()}</p>
                    <p className="text-[11px] text-[var(--dm-muted)] mt-0.5 line-clamp-2">
                      {info?.desc}
                    </p>
                  </button>
                );
              })}
            </div>
          </div>

          {sourceExt === "pdf" && targetFormat === "docx" && (
            <div className="space-y-2">
              <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                3. Word Fidelity Mode
              </label>
              <div className="grid sm:grid-cols-3 gap-2">
                {DOCX_MODES.map((m) => (
                  <button
                    key={m.id}
                    type="button"
                    onClick={() => setDocxMode(m.id)}
                    className={`p-3 rounded-xl border text-left transition-all ${
                      docxMode === m.id
                        ? "border-sky-500 bg-sky-500/12"
                        : "border-[var(--dm-border)] bg-[var(--dm-bg)] hover:border-sky-500/40"
                    }`}
                  >
                    <p className="text-xs font-semibold">{m.title}</p>
                    <p className="text-[11px] text-[var(--dm-muted)] mt-0.5">{m.subtitle}</p>
                  </button>
                ))}
              </div>
            </div>
          )}

          {sourceExt === "pdf" && targetFormat === "pptx" && (
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[var(--dm-muted)]">
                PDF → PPTX Fidelity Mode
              </label>
              <select
                value={pptxMode}
                onChange={(e) => setPptxMode(e.target.value as "hybrid" | "editable" | "visual")}
                className="dm-input w-full px-3.5 py-2 text-xs"
              >
                <option value="hybrid">Hybrid (Editable + Visual)</option>
                <option value="editable">Editable Text &amp; Tables</option>
                <option value="visual">Exact Visual Slides</option>
              </select>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-medium text-[var(--dm-muted)]">
              Optional Output Filename
            </label>
            <input
              type="text"
              value={outputName}
              onChange={(e) => setOutputName(e.target.value)}
              placeholder={`e.g. converted_output.${targetFormat}`}
              className="dm-input w-full px-3.5 py-2 text-sm"
            />
          </div>

          <div className="flex flex-wrap gap-2.5 pt-1">
            <button
              type="submit"
              disabled={running || (!selectedDocId && !uploadFile)}
              className="dm-primary-btn flex-1 px-5 py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {running ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  <span>{progressMsg || "Converting..."}</span>
                </>
              ) : (
                <>
                  <ArrowLeftRight className="h-4 w-4" />
                  <span>Convert to {targetFormat.toUpperCase()}</span>
                </>
              )}
            </button>

            {sourceExt === "pdf" && selectedDocId && !uploadFile && (
              <button
                type="button"
                onClick={handlePreviewTables}
                disabled={extractingTables}
                className="px-4 py-3 rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-emerald-500 text-xs font-semibold inline-flex items-center gap-1.5"
              >
                {extractingTables ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Table2 className="h-4 w-4 text-emerald-400" />
                )}
                <span>Inspect Tables</span>
              </button>
            )}
          </div>

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="dm-card p-5 space-y-3 text-xs">
            <div className="flex items-center gap-2 font-semibold text-sm">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>Honest Layout &amp; Accuracy Guarantee</span>
            </div>
            <ul className="space-y-2 text-[var(--dm-muted)] leading-relaxed">
              <li>• Originals stay completely untouched (v1 is never overwritten).</li>
              <li>
                • Complex multi-column layouts, custom embedded fonts, or handwritten scans may show
                font substitutions — every conversion records a verification report.
              </li>
              <li>
                • If your PDF is a scanned photo, run{" "}
                <Link href="/app/tools/ocr" className="text-indigo-400 underline">
                  OCR (EN + தமிழ்)
                </Link>{" "}
                first before converting to Word or Excel.
              </li>
            </ul>
          </div>

          {completedJob && (
            <div className="dm-card p-5 space-y-4 border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-emerald-400 font-semibold text-sm">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Conversion Complete</span>
                </div>
                <span className="text-[11px] font-mono text-[var(--dm-muted)]">
                  #{completedJob.id.slice(0, 8)}
                </span>
              </div>

              {qualityReport && (
                <div className="grid grid-cols-2 gap-2.5 text-xs">
                  <div className="p-3 rounded-xl bg-[var(--dm-surface)] border border-[var(--dm-border)]">
                    <p className="text-[11px] text-[var(--dm-muted)]">Text Match</p>
                    <p className="font-mono text-base font-bold text-emerald-400">
                      {qualityReport.char_similarity.toFixed(1)}%
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--dm-surface)] border border-[var(--dm-border)]">
                    <p className="text-[11px] text-[var(--dm-muted)]">Visual SSIM</p>
                    <p className="font-mono text-base font-bold">
                      {qualityReport.mean_ssim !== null
                        ? qualityReport.mean_ssim.toFixed(3)
                        : qualityReport.ssim_status === "libreoffice_unavailable"
                          ? "Host N/A"
                          : "Text target"}
                    </p>
                  </div>
                  <div className="p-3 rounded-xl bg-[var(--dm-surface)] border border-[var(--dm-border)] col-span-2 flex items-center justify-between">
                    <span className="text-[var(--dm-muted)]">Tables detected → preserved</span>
                    <span className="font-mono font-semibold">
                      {qualityReport.source_table_count} → {qualityReport.converted_table_count}
                    </span>
                  </div>
                </div>
              )}

              {qualityReport && qualityReport.warnings.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300 space-y-1">
                  {qualityReport.warnings.slice(0, 3).map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={downloadOutput}
                  className="dm-primary-btn w-full py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  <span>Download .{targetFormat.toUpperCase()}</span>
                </button>
                <div className="grid grid-cols-2 gap-2">
                  {qualityReport && (
                    <Link
                      href={`/app/conversions/${completedJob.id}`}
                      className="px-3 py-2 rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-500 text-xs font-medium inline-flex items-center justify-center gap-1.5"
                    >
                      <Layers className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Side-by-Side</span>
                    </Link>
                  )}
                  {completedJob.output_document_id && (
                    <Link
                      href={`/app/workspace/${completedJob.output_document_id}`}
                      className="px-3 py-2 rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-500 text-xs font-medium inline-flex items-center justify-center gap-1.5"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open File</span>
                    </Link>
                  )}
                </div>
              </div>
            </div>
          )}

          {!completedJob && (
            <div className="dm-card p-5 text-xs text-[var(--dm-muted)] space-y-2">
              <p className="font-semibold text-[var(--dm-text)] flex items-center gap-1.5">
                <FileSpreadsheet className="h-4 w-4 text-emerald-400" />
                <span>Table-to-Excel Engine</span>
              </p>
              <p>
                Detects both bordered grid PDFs and whitespace-aligned tables, automatically parsing
                numbers, decimals, percentages, and currency cells with auto column fit.
              </p>
            </div>
          )}
        </div>
      </form>

      {tablePreview && (
        <div className="dm-card p-6 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-base font-semibold flex items-center gap-2">
                <FileText className="h-4 w-4 text-emerald-400" />
                <span>Detected Tables Preview ({tablePreview.tables_count} found)</span>
              </h2>
              <p className="text-xs text-[var(--dm-muted)]">
                Verify extracted rows &amp; columns before exporting to Excel or Word.
              </p>
            </div>
            <button
              type="button"
              onClick={() => setTablePreview(null)}
              className="text-xs text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
            >
              Close
            </button>
          </div>

          {tablePreview.tables.length === 0 ? (
            <p className="text-xs text-[var(--dm-muted)]">
              No tabular structures detected in this PDF. Try OCR if it is a scanned page.
            </p>
          ) : (
            <div className="space-y-4">
              {tablePreview.tables.slice(0, 6).map((t, idx) => (
                <div
                  key={idx}
                  className="rounded-xl border border-[var(--dm-border)] overflow-hidden"
                >
                  <div className="px-3.5 py-2 bg-[var(--dm-subtle)] border-b border-[var(--dm-border)] flex items-center justify-between text-xs">
                    <span className="font-semibold">
                      Page {t.page_no} • Table #{t.table_index} ({t.detection_strategy})
                    </span>
                    <span className="font-mono text-[var(--dm-muted)]">
                      {t.rows_count} rows × {t.cols_count} cols
                    </span>
                  </div>
                  <div className="overflow-x-auto max-h-64">
                    <table className="w-full text-xs border-collapse">
                      <tbody>
                        {t.rows.slice(0, 15).map((row, rIdx) => (
                          <tr
                            key={rIdx}
                            className={
                              rIdx === 0
                                ? "bg-indigo-500/10 font-semibold"
                                : "border-t border-[var(--dm-border)]"
                            }
                          >
                            {row.map((cell, cIdx) => (
                              <td
                                key={cIdx}
                                className="px-3 py-1.5 border-r last:border-r-0 border-[var(--dm-border)] whitespace-nowrap"
                              >
                                {cell || "—"}
                              </td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function ConvertStudioPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="max-w-5xl mx-auto py-16 flex items-center justify-center gap-2 text-sm text-[var(--dm-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading Format Converter...</span>
          </div>
        }
      >
        <ConvertStudioContent />
      </Suspense>
    </AppShell>
  );
}
