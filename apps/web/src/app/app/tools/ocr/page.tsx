"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  CheckCircle2,
  Copy,
  Download,
  ExternalLink,
  Languages,
  Loader2,
  ScanText,
  ShieldCheck,
  Upload,
} from "lucide-react";
import type { DocumentItem, JobRecord, OcrLanguage } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob, pollOrStreamJob } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";
import { usePreferencesStore } from "@/stores/preferences-store";

const OCR_LANGUAGES: Array<{ id: OcrLanguage; label: string; desc: string }> = [
  { id: "eng", label: "English (eng)", desc: "Textbooks, question papers, typed receipts" },
  { id: "tam", label: "தமிழ் / Tamil (tam)", desc: "Tamil circulars, notices & TNPSC notes" },
  {
    id: "eng+tam",
    label: "Bilingual (English + தமிழ்)",
    desc: "Mixed English headings & Tamil body paragraphs",
  },
];

function OcrStudioContent() {
  const searchParams = useSearchParams();
  const initialDocId = searchParams.get("doc") || "";

  const token = useAuthStore((s) => s.accessToken);
  const defaultOcrLang = usePreferencesStore((s) => s.default_ocr_lang);
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [selectedDocId, setSelectedDocId] = useState(initialDocId);
  const [uploadFile, setUploadFile] = useState<File | null>(null);
  const [language, setLanguage] = useState<OcrLanguage>(defaultOcrLang);
  const [forceOcr, setForceOcr] = useState(false);
  const [running, setRunning] = useState(false);
  const [progressMsg, setProgressMsg] = useState<string | null>(null);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [completedJob, setCompletedJob] = useState<JobRecord | null>(null);

  const docsQuery = useQuery({
    queryKey: ["ocr-docs", Boolean(token)],
    enabled: Boolean(token),
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?limit=100");
      return (res.data ?? []).filter(
        (d) => d.mime_type === "application/pdf" || d.mime_type.startsWith("image/")
      );
    },
  });

  const docs = useMemo(() => docsQuery.data ?? [], [docsQuery.data]);

  useEffect(() => {
    if (!selectedDocId && docs.length > 0 && !uploadFile) {
      setSelectedDocId(docs[0].id);
    }
  }, [docs, selectedDocId, uploadFile]);

  const activeDoc = useMemo(
    () => docs.find((d) => d.id === selectedDocId),
    [docs, selectedDocId]
  );

  const runOcr = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setCompletedJob(null);
    setRunning(true);
    setProgressMsg("Preparing document for OCR...");

    try {
      let targetDocId = selectedDocId;
      if (uploadFile) {
        setProgressMsg("Uploading & malware-scanning file...");
        const fd = new FormData();
        fd.append("file", uploadFile);
        const up = await apiRequest<DocumentItem>("/documents/upload", {
          method: "POST",
          body: fd,
          ensureGuest: true,
        });
        targetDocId = up.data!.id;
        setSelectedDocId(targetDocId);
        setUploadFile(null);
        await queryClient.invalidateQueries({ queryKey: ["ocr-docs"] });
      }

      if (!targetDocId) {
        throw new Error("Select a PDF/image or upload a file first.");
      }

      setProgressMsg(`Running ${language.toUpperCase()} OCR...`);
      const jobRes = await apiRequest<JobRecord>("/tools/ocr", {
        method: "POST",
        ensureGuest: true,
        body: JSON.stringify({
          document_id: targetDocId,
          language,
          force_ocr: forceOcr,
        }),
      });

      const finalJob = await pollOrStreamJob(jobRes.data!.id, (p) => {
        if (p.stage_message) setProgressMsg(`${p.stage_message} (${p.progress ?? 0}%)`);
      });

      if (finalJob.status !== "completed") {
        throw new Error(String(finalJob.error_detail?.message || "OCR processing failed."));
      }

      setCompletedJob(finalJob);
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      pushToast({
        title: "Searchable PDF created",
        description: "Invisible selectable text layer embedded non-destructively.",
        variant: "success",
      });
    } catch (err) {
      const msg = err instanceof Error ? err.message : "OCR failed.";
      setErrorMsg(msg);
      pushToast({ title: "OCR failed", description: msg, variant: "error" });
    } finally {
      setRunning(false);
      setProgressMsg(null);
    }
  };

  const downloadOcrPdf = async () => {
    if (!completedJob?.output_document_id) return;
    const blob = await fetchAuthorizedBlob(
      `/documents/${completedJob.output_document_id}/download`
    );
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    const base = (activeDoc?.name || "scanned").replace(/\.[^.]+$/, "");
    a.download = `${base}_searchable_ocr.pdf`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const meta = (completedJob?.result_meta || {}) as {
    pages_processed?: number;
    pages_ocr_applied?: number;
    engine_used?: string;
    language?: string;
    mean_confidence?: number | null;
    warnings?: string[];
    extracted_text_preview?: string;
    extracted_char_count?: number;
  };

  const copyExtractedText = async () => {
    if (!meta.extracted_text_preview) return;
    await navigator.clipboard.writeText(meta.extracted_text_preview);
    pushToast({ title: "Copied extracted text", variant: "success" });
  };

  return (
    <div className="max-w-5xl mx-auto space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <span className="h-9 w-9 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400 flex items-center justify-center">
              <ScanText className="h-5 w-5" />
            </span>
            <span>Searchable PDF &amp; OCR Studio</span>
          </h1>
          <p className="text-sm text-[var(--dm-muted)] mt-1">
            Extract selectable text from scanned PDFs and mobile photos in English and தமிழ், and
            create a searchable PDF ready for Word/Excel conversion or AI Q&amp;A.
          </p>
        </div>
        <PrivacyBadge />
      </div>

      <form onSubmit={runOcr} className="grid lg:grid-cols-5 gap-6">
        <div className="lg:col-span-3 dm-card p-6 space-y-5">
          <div className="space-y-3">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
              1. Scanned PDF or Image
            </label>

            {docs.length > 0 && (
              <select
                value={uploadFile ? "" : selectedDocId}
                onChange={(e) => {
                  setUploadFile(null);
                  setSelectedDocId(e.target.value);
                }}
                className="dm-input w-full px-3.5 py-2.5 text-sm"
              >
                <option value="">-- Choose PDF or image from library ({docs.length}) --</option>
                {docs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({formatBytes(d.size_bytes)})
                  </option>
                ))}
              </select>
            )}

            <label className="block border-2 border-dashed border-[var(--dm-border-strong)] hover:border-amber-500/70 rounded-xl p-4 text-center cursor-pointer transition-colors bg-[var(--dm-subtle)]">
              <Upload className="h-5 w-5 mx-auto text-amber-400 mb-1.5" />
              <p className="text-xs font-medium">
                {uploadFile
                  ? `Ready to upload: ${uploadFile.name} (${formatBytes(uploadFile.size)})`
                  : "Or upload a scanned PDF, PNG, or JPG"}
              </p>
              <input
                type="file"
                accept=".pdf,.png,.jpg,.jpeg"
                className="hidden"
                onChange={(e) => setUploadFile(e.target.files?.[0] || null)}
              />
            </label>
          </div>

          <div className="space-y-2.5">
            <label className="block text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
              2. Script &amp; Language Pack
            </label>
            <div className="grid sm:grid-cols-3 gap-2">
              {OCR_LANGUAGES.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setLanguage(item.id)}
                  className={`p-3 rounded-xl border text-left transition-all ${
                    language === item.id
                      ? "border-amber-500 bg-amber-500/12 ring-1 ring-amber-500/40"
                      : "border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-amber-500/40"
                  }`}
                >
                  <p className="text-xs font-semibold flex items-center gap-1.5">
                    <Languages className="h-3.5 w-3.5 text-amber-400" />
                    <span>{item.label}</span>
                  </p>
                  <p className="text-[11px] text-[var(--dm-muted)] mt-1">{item.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <label className="flex items-start gap-2.5 p-3 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] cursor-pointer text-xs">
            <input
              type="checkbox"
              checked={forceOcr}
              onChange={(e) => setForceOcr(e.target.checked)}
              className="mt-0.5 rounded"
            />
            <span>
              <span className="font-semibold block">Force OCR on all pages</span>
              <span className="text-[var(--dm-muted)]">
                By default, pages that already have selectable digital text skip image OCR to
                preserve crisp native text. Check this for broken custom font encodings.
              </span>
            </span>
          </label>

          <button
            type="submit"
            disabled={running || (!selectedDocId && !uploadFile)}
            className="dm-primary-btn w-full px-5 py-3 text-sm inline-flex items-center justify-center gap-2 disabled:opacity-50"
          >
            {running ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>{progressMsg || "Running OCR..."}</span>
              </>
            ) : (
              <>
                <ScanText className="h-4 w-4" />
                <span>Run OCR &amp; Build Searchable PDF</span>
              </>
            )}
          </button>

          {errorMsg && (
            <div className="p-3.5 rounded-xl border border-red-500/30 bg-red-500/10 text-xs text-red-400 flex items-start gap-2">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}
        </div>

        <div className="lg:col-span-2 space-y-4">
          <div className="dm-card p-5 space-y-2.5 text-xs">
            <p className="font-semibold text-sm flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-emerald-400" />
              <span>How Searchable OCR Works</span>
            </p>
            <p className="text-[var(--dm-muted)] leading-relaxed">
              Images stay visually identical while an aligned invisible text layer (PDF render mode
              3) is written behind recognized words so Ctrl+F search, copy-paste, and RAG indexing
              work cleanly.
            </p>
          </div>

          {completedJob && (
            <div className="dm-card p-5 space-y-4 border-emerald-500/30 bg-emerald-500/5">
              <div className="flex items-center justify-between text-emerald-400 font-semibold text-sm">
                <span className="flex items-center gap-2">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>OCR Complete</span>
                </span>
                <span className="text-[11px] font-mono text-[var(--dm-muted)]">
                  {meta.engine_used || "ocr"}
                </span>
              </div>

              <div className="grid grid-cols-2 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-[var(--dm-surface)] border border-[var(--dm-border)]">
                  <p className="text-[var(--dm-muted)]">Pages OCR&apos;d</p>
                  <p className="font-mono font-bold">
                    {meta.pages_ocr_applied ?? 0} / {meta.pages_processed ?? 0}
                  </p>
                </div>
                <div className="p-2.5 rounded-xl bg-[var(--dm-surface)] border border-[var(--dm-border)]">
                  <p className="text-[var(--dm-muted)]">Mean Confidence</p>
                  <p className="font-mono font-bold">
                    {meta.mean_confidence !== null && meta.mean_confidence !== undefined
                      ? `${meta.mean_confidence.toFixed(1)}%`
                      : "Digital skip"}
                  </p>
                </div>
              </div>

              {meta.warnings && meta.warnings.length > 0 && (
                <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-[11px] text-amber-300 space-y-1">
                  {meta.warnings.map((w, i) => (
                    <p key={i}>• {w}</p>
                  ))}
                </div>
              )}

              {meta.extracted_text_preview && (
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px] text-[var(--dm-muted)]">
                    <span>Extracted Text ({meta.extracted_char_count ?? 0} chars)</span>
                    <button
                      type="button"
                      onClick={copyExtractedText}
                      className="inline-flex items-center gap-1 text-indigo-400 hover:underline"
                    >
                      <Copy className="h-3 w-3" />
                      <span>Copy</span>
                    </button>
                  </div>
                  <pre className="p-3 rounded-xl bg-[var(--dm-surface)] border border-[var(--dm-border)] text-[11px] font-mono max-h-48 overflow-y-auto whitespace-pre-wrap">
                    {meta.extracted_text_preview}
                  </pre>
                </div>
              )}

              <div className="flex flex-col gap-2">
                <button
                  type="button"
                  onClick={downloadOcrPdf}
                  className="dm-primary-btn w-full py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-1.5"
                >
                  <Download className="h-4 w-4" />
                  <span>Download Searchable PDF</span>
                </button>
                {completedJob.output_document_id && (
                  <Link
                    href={`/app/workspace/${completedJob.output_document_id}`}
                    className="px-3 py-2 rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-500 text-xs font-medium inline-flex items-center justify-center gap-1.5"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    <span>Open Searchable PDF</span>
                  </Link>
                )}
              </div>
            </div>
          )}
        </div>
      </form>
    </div>
  );
}

export default function OcrToolPage() {
  return (
    <AppShell>
      <Suspense
        fallback={
          <div className="max-w-5xl mx-auto py-16 flex items-center justify-center gap-2 text-sm text-[var(--dm-muted)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            <span>Loading OCR Studio...</span>
          </div>
        }
      >
        <OcrStudioContent />
      </Suspense>
    </AppShell>
  );
}
