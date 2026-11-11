"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  ArrowLeft,
  ArrowLeftRight,
  ChevronLeft,
  ChevronRight,
  Download,
  FileText,
  History,
  Layers,
  Loader2,
  Lock,
  Minimize2,
  RotateCw,
  ScanText,
  Stamp,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { DocumentDetailOut, JobRecord } from "@documind/types";
import { COMPRESS_TARGET_PRESETS, formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { PdfViewer } from "@/components/PdfViewer";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, fetchAuthorizedBlob, pollOrStreamJob } from "@/lib/api";

interface HistoryEntry {
  id: string;
  action: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export default function WorkspacePage() {
  const params = useParams<{ id: string }>();
  const docId = params.id;
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

  const [currentPage, setCurrentPage] = useState(1);
  const [zoom, setZoom] = useState(1.1);
  const [activeVersionNo, setActiveVersionNo] = useState<number | null>(null);
  const [rightTab, setRightTab] = useState<"tools" | "versions" | "history">("tools");
  const [activeJob, setActiveJob] = useState<Partial<JobRecord> | null>(null);
  const [thumbUrls, setThumbUrls] = useState<Record<number, string>>({});
  const [nonPdfImageUrl, setNonPdfImageUrl] = useState<string | null>(null);
  const [nonPdfText, setNonPdfText] = useState<string | null>(null);
  const [nonPdfLoading, setNonPdfLoading] = useState(false);
  const [pdfPageCount, setPdfPageCount] = useState<number | null>(null);

  // Tool inputs
  const [customKb, setCustomKb] = useState("200");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [pdfPassword, setPdfPassword] = useState("");
  const [pageListSpec, setPageListSpec] = useState("1");
  const [pendingDeletePages, setPendingDeletePages] = useState<number[] | null>(null);

  const docQuery = useQuery({
    queryKey: ["document", docId, activeVersionNo],
    queryFn: async () => {
      const qs = activeVersionNo ? `?version_no=${activeVersionNo}` : "";
      const res = await apiRequest<DocumentDetailOut>(`/documents/${docId}${qs}`, {
        ensureGuest: true,
      });
      return res.data!;
    },
  });

  const historyQuery = useQuery({
    queryKey: ["document-history", docId],
    enabled: rightTab === "history",
    queryFn: async () => {
      const res = await apiRequest<HistoryEntry[]>(`/documents/${docId}/history`);
      return res.data ?? [];
    },
  });

  const doc = docQuery.data;
  const effectiveVersion = activeVersionNo ?? doc?.current_version_no ?? 1;
  const totalPages = pdfPageCount ?? doc?.page_count ?? 1;

  useEffect(() => {
    const revoked: string[] = [];
    let cancelled = false;
    async function loadThumbs() {
      if (!doc || !doc.pages.length) return;
      const next: Record<number, string> = {};
      for (const p of doc.pages.slice(0, 20)) {
        if (!p.thumbnail_url) continue;
        try {
          const cleanPath = p.thumbnail_url.replace(/^\/api\/v1/, "");
          const blob = await fetchAuthorizedBlob(cleanPath);
          if (cancelled) return;
          const url = URL.createObjectURL(blob);
          revoked.push(url);
          next[p.page_no] = url;
        } catch {
          // skip failed thumbnail
        }
      }
      if (!cancelled) setThumbUrls(next);
    }
    loadThumbs();
    return () => {
      cancelled = true;
      revoked.forEach((u) => URL.revokeObjectURL(u));
    };
  }, [doc]);

  useEffect(() => {
    let revokedUrl: string | null = null;
    let cancelled = false;
    async function loadNonPdfPreview() {
      if (!doc || doc.mime_type === "application/pdf") {
        setNonPdfImageUrl(null);
        setNonPdfText(null);
        return;
      }
      if (!doc.mime_type.startsWith("image/") && doc.mime_type !== "text/plain") {
        setNonPdfImageUrl(null);
        setNonPdfText(null);
        return;
      }
      setNonPdfLoading(true);
      try {
        const blob = await fetchAuthorizedBlob(
          `/documents/${doc.id}/download?v=${effectiveVersion}`
        );
        if (cancelled) return;
        if (doc.mime_type.startsWith("image/")) {
          const url = URL.createObjectURL(blob);
          revokedUrl = url;
          setNonPdfImageUrl(url);
          setNonPdfText(null);
        } else {
          const txt = await blob.text();
          if (!cancelled) {
            setNonPdfText(txt);
            setNonPdfImageUrl(null);
          }
        }
      } catch {
        if (!cancelled) {
          setNonPdfImageUrl(null);
          setNonPdfText(null);
        }
      } finally {
        if (!cancelled) setNonPdfLoading(false);
      }
    }
    loadNonPdfPreview();
    return () => {
      cancelled = true;
      if (revokedUrl) URL.revokeObjectURL(revokedUrl);
    };
  }, [doc, effectiveVersion]);

  const runToolJob = async (endpoint: string, body: Record<string, unknown>, label: string) => {
    try {
      setActiveJob({ status: "queued", progress: 5, stage_message: `Starting ${label}...` });
      const res = await apiRequest<JobRecord>(endpoint, {
        method: "POST",
        body: JSON.stringify(body),
      });
      const job = res.data!;
      const done = await pollOrStreamJob(job.id, (prog) => setActiveJob(prog));
      setActiveJob(done);
      if (done.status === "completed") {
        setActiveVersionNo(null);
        await queryClient.invalidateQueries({ queryKey: ["document", docId] });
        await queryClient.invalidateQueries({ queryKey: ["document-history", docId] });
        if (done.output_document_id && done.output_document_id !== docId) {
          pushToast({
            title: `${label} complete`,
            description: "Created new output document.",
            variant: "success",
          });
        } else {
          pushToast({
            title: `${label} complete`,
            description: done.result_meta?.warning
              ? String(done.result_meta.warning)
              : "Saved as a new immutable version.",
            variant: "success",
          });
        }
      } else {
        pushToast({
          title: `${label} failed`,
          description: String(done.error_detail?.message || "Operation failed"),
          variant: "error",
        });
      }
    } catch (err) {
      setActiveJob(null);
      pushToast({
        title: `${label} failed`,
        description: err instanceof Error ? err.message : "Error executing tool.",
        variant: "error",
      });
    }
  };

  const downloadVersion = async (vNo: number) => {
    if (!doc) return;
    const blob = await fetchAuthorizedBlob(`/documents/${doc.id}/download?v=${vNo}`);
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = doc.name;
    a.click();
    URL.revokeObjectURL(url);
  };

  const deleteNow = async () => {
    await apiRequest(`/documents/${docId}?permanent=true`, { method: "DELETE" });
    pushToast({ title: "Document permanently deleted", variant: "info" });
    router.push("/app");
  };

  if (docQuery.isLoading) {
    return (
      <AppShell>
        <div className="flex flex-col items-center justify-center h-[70vh] gap-3 text-sm text-[var(--dm-muted)]">
          <Loader2 className="h-6 w-6 animate-spin text-indigo-400" />
          <span>Opening Document Studio...</span>
        </div>
      </AppShell>
    );
  }

  if (docQuery.isError || !doc) {
    return (
      <AppShell>
        <div className="dm-card p-8 text-center space-y-3">
          <p className="text-sm font-medium text-red-400">Could not load document workspace.</p>
          <button
            type="button"
            onClick={() => router.push("/app")}
            className="px-4 py-2 text-xs rounded-xl border border-[var(--dm-border)] hover:bg-[var(--dm-subtle)]"
          >
            Back to Library
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-3.5">
        <PrivacyBadge expiresAt={doc.expires_at} onDeleteNow={deleteNow} />

        {/* Studio Top Toolbar */}
        <div className="dm-card px-4 py-3 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <Link
              href="/app"
              className="p-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-[var(--dm-border-strong)] transition-colors shrink-0"
              title="Back to Library"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div className="h-9 w-9 rounded-xl bg-indigo-500/15 border border-indigo-500/25 flex items-center justify-center text-indigo-500 dark:text-indigo-400 shrink-0">
              <FileText className="h-4 w-4" />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-semibold truncate">{doc.name}</h1>
              <div className="flex items-center gap-2 text-[11px] text-[var(--dm-muted)] font-mono mt-0.5">
                <span className="px-1.5 py-0.2 rounded bg-indigo-500/10 text-indigo-500 dark:text-indigo-300 border border-indigo-500/20">
                  v{effectiveVersion} / v{doc.current_version_no}
                </span>
                <span>•</span>
                <span>{formatBytes(doc.size_bytes)}</span>
              </div>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Page Stepper */}
            <div className="inline-flex items-center rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
                disabled={currentPage <= 1}
                className="p-1.5 rounded-lg hover:bg-[var(--dm-surface)] disabled:opacity-40 transition-colors"
                aria-label="Previous page"
              >
                <ChevronLeft className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-mono px-2.5">
                {currentPage} / {totalPages}
              </span>
              <button
                type="button"
                onClick={() => setCurrentPage((p) => Math.min(totalPages, p + 1))}
                disabled={currentPage >= totalPages}
                className="p-1.5 rounded-lg hover:bg-[var(--dm-surface)] disabled:opacity-40 transition-colors"
                aria-label="Next page"
              >
                <ChevronRight className="h-3.5 w-3.5" />
              </button>
            </div>

            {/* Zoom Controls */}
            <div className="inline-flex items-center rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] p-0.5">
              <button
                type="button"
                onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
                className="p-1.5 rounded-lg hover:bg-[var(--dm-surface)] transition-colors"
                aria-label="Zoom out"
              >
                <ZoomOut className="h-3.5 w-3.5" />
              </button>
              <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
              <button
                type="button"
                onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
                className="p-1.5 rounded-lg hover:bg-[var(--dm-surface)] transition-colors"
                aria-label="Zoom in"
              >
                <ZoomIn className="h-3.5 w-3.5" />
              </button>
            </div>

            <button
              type="button"
              disabled={doc.mime_type !== "application/pdf"}
              onClick={() =>
                runToolJob(
                  "/tools/pdf/pages",
                  { document_id: doc.id, action: "rotate", angle: 90, pages: [currentPage] },
                  "Rotate Page"
                )
              }
              className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-[var(--dm-border-strong)] disabled:opacity-40 transition-colors"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Rotate 90°</span>
            </button>

            <button
              type="button"
              onClick={() => downloadVersion(effectiveVersion)}
              className="dm-primary-btn inline-flex items-center gap-1.5 px-3.5 py-2 text-xs font-medium"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export v{effectiveVersion}</span>
            </button>
          </div>
        </div>

        {/* 3-Pane Resizable Studio */}
        <div className="dm-card overflow-hidden h-[70vh] min-h-[540px]">
          <PanelGroup direction="horizontal">
            {/* Left Rail: Page Thumbnails */}
            <Panel defaultSize={18} minSize={12} maxSize={30} className="hidden md:block">
              <div className="h-full overflow-y-auto p-3 border-r border-[var(--dm-border)] bg-[var(--dm-surface)] space-y-2.5">
                <p className="text-[10px] font-semibold text-[var(--dm-muted)] uppercase tracking-wider px-1">
                  Pages ({doc.pages.length || 1})
                </p>
                {doc.pages.length === 0 ? (
                  nonPdfImageUrl ? (
                    <div className="w-full rounded-xl p-1.5 border border-indigo-500 bg-indigo-500/10">
                      <img
                        src={nonPdfImageUrl}
                        alt={doc.name}
                        className="w-full rounded-lg border border-[var(--dm-border)] bg-white"
                      />
                      <span className="block text-center text-[11px] font-mono mt-1.5 text-[var(--dm-muted)]">
                        Image 1
                      </span>
                    </div>
                  ) : (
                    <p className="text-xs text-[var(--dm-muted)] px-1">
                      No thumbnails (locked or non-PDF).
                    </p>
                  )
                ) : (
                  doc.pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCurrentPage(p.page_no)}
                      className={`w-full rounded-xl p-1.5 border text-left transition-all ${currentPage === p.page_no
                        ? "border-indigo-500 bg-indigo-500/10 shadow-sm"
                        : "border-[var(--dm-border)] hover:border-indigo-500/40"
                        }`}
                    >
                      {thumbUrls[p.page_no] ? (
                        <img
                          src={thumbUrls[p.page_no]}
                          alt={`Page ${p.page_no}`}
                          className="w-full rounded-lg border border-[var(--dm-border)] bg-white"
                        />
                      ) : (
                        <div className="h-24 rounded-lg bg-[var(--dm-subtle)] flex items-center justify-center text-xs text-[var(--dm-muted)]">
                          Page {p.page_no}
                        </div>
                      )}
                      <span className="block text-center text-[11px] font-mono mt-1.5 text-[var(--dm-muted)]">
                        Page {p.page_no}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="hidden md:block w-1 bg-[var(--dm-border)] hover:bg-indigo-500 transition-colors" />

            {/* Center Canvas: Studio Viewer */}
            <Panel defaultSize={54} minSize={35}>
              <div className="h-full dm-dot-bg bg-[var(--dm-bg)]">
                {doc.mime_type === "application/pdf" ? (
                  <PdfViewer
                    documentId={doc.id}
                    versionNo={effectiveVersion}
                    currentPage={currentPage}
                    zoom={zoom}
                    onPageCount={(cnt) => setPdfPageCount(cnt)}
                  />
                ) : nonPdfLoading ? (
                  <div className="flex items-center justify-center gap-2 h-full text-sm text-[var(--dm-muted)]">
                    <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                    <span>Loading preview...</span>
                  </div>
                ) : nonPdfImageUrl ? (
                  <div className="h-full w-full overflow-auto flex items-center justify-center p-6">
                    <img
                      src={nonPdfImageUrl}
                      alt={doc.name}
                      style={{ transform: `scale(${zoom})`, transformOrigin: "center center" }}
                      className="max-w-full max-h-full rounded-xl border border-[var(--dm-border)] shadow-2xl transition-transform"
                    />
                  </div>
                ) : nonPdfText !== null ? (
                  <div className="h-full w-full overflow-auto p-6">
                    <pre className="dm-elevated p-5 text-xs sm:text-sm font-mono whitespace-pre-wrap leading-relaxed">
                      {nonPdfText}
                    </pre>
                  </div>
                ) : (
                  <div className="flex items-center justify-center h-full px-6 text-center text-sm text-[var(--dm-muted)]">
                    Previewing Office files directly in browser arrives with Phase 2 conversion. Use Export to download.
                  </div>
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-[var(--dm-border)] hover:bg-indigo-500 transition-colors" />

            {/* Right Rail: Inspector */}
            <Panel defaultSize={28} minSize={20} maxSize={42}>
              <div className="h-full flex flex-col border-l border-[var(--dm-border)] bg-[var(--dm-surface)]">
                <div className="p-2 border-b border-[var(--dm-border)]">
                  <div className="grid grid-cols-3 p-1 rounded-xl bg-[var(--dm-subtle)] border border-[var(--dm-border)] text-xs font-medium">
                    {(["tools", "versions", "history"] as const).map((tab) => (
                      <button
                        key={tab}
                        type="button"
                        onClick={() => setRightTab(tab)}
                        className={`py-1.5 rounded-lg capitalize transition-all ${rightTab === tab
                          ? "bg-[var(--dm-surface)] text-indigo-500 dark:text-indigo-300 shadow-xs font-semibold"
                          : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                          }`}
                      >
                        {tab}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 space-y-3.5 text-xs">
                  {rightTab === "tools" && doc.mime_type !== "application/pdf" && (
                    <div className="dm-elevated p-4 space-y-3">
                      <p className="font-semibold text-[var(--dm-text)]">
                        Non-PDF Document ({doc.mime_type})
                      </p>
                      <p className="text-[var(--dm-muted)] leading-relaxed">
                        PDF toolkit actions (Compress, Page Numbers, Rotate, Delete, Protect/Unlock) only operate on PDF files.
                      </p>
                      <div className="flex flex-col gap-2 pt-1">
                        <Link
                          href={`/app/tools/convert?doc=${doc.id}`}
                          className="dm-primary-btn px-3 py-2 text-center font-medium inline-flex items-center justify-center gap-1.5"
                        >
                          <ArrowLeftRight className="h-3.5 w-3.5" />
                          <span>Convert Format (to PDF / Word / CSV)</span>
                        </Link>
                        {doc.mime_type.startsWith("image/") && (
                          <>
                            <Link
                              href={`/app/tools/ocr?doc=${doc.id}`}
                              className="px-3 py-2 rounded-xl border border-[var(--dm-border)] text-center hover:border-indigo-500 inline-flex items-center justify-center gap-1.5"
                            >
                              <ScanText className="h-3.5 w-3.5 text-amber-400" />
                              <span>Run OCR (EN + தமிழ்)</span>
                            </Link>
                            <Link
                              href="/app/tools/photo-resizer"
                              className="px-3 py-2 rounded-xl border border-[var(--dm-border)] text-center hover:border-indigo-500"
                            >
                              Open Photo &amp; Sign Resizer
                            </Link>
                          </>
                        )}
                        <Link
                          href="/app/tools/scan"
                          className="px-3 py-2 rounded-xl border border-[var(--dm-border)] text-center hover:border-indigo-500"
                        >
                          Convert Images to PDF
                        </Link>
                      </div>
                    </div>
                  )}

                  {rightTab === "tools" && doc.mime_type === "application/pdf" && (
                    <>
                      {/* Format Conversion & OCR Quick Actions */}
                      <div className="p-3.5 rounded-xl border border-indigo-500/25 bg-indigo-500/5 space-y-2">
                        <div className="flex items-center justify-between font-semibold">
                          <span className="inline-flex items-center gap-1.5">
                            <ArrowLeftRight className="h-3.5 w-3.5 text-sky-400" />
                            <span>Convert &amp; OCR Studio</span>
                          </span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          <Link
                            href={`/app/tools/convert?doc=${doc.id}&target=docx`}
                            className="px-2.5 py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500 text-center font-medium"
                          >
                            PDF → Word
                          </Link>
                          <Link
                            href={`/app/tools/convert?doc=${doc.id}&target=xlsx`}
                            className="px-2.5 py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500 text-center font-medium"
                          >
                            PDF → Excel
                          </Link>
                        </div>
                        <Link
                          href={`/app/tools/ocr?doc=${doc.id}`}
                          className="w-full px-2.5 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-amber-500 flex items-center justify-center gap-1.5 font-medium"
                        >
                          <ScanText className="h-3.5 w-3.5 text-amber-400" />
                          <span>Make Searchable PDF (OCR)</span>
                        </Link>
                      </div>
                      {/* Compress to KB */}
                      <div className="p-3.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] space-y-2.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <Minimize2 className="h-3.5 w-3.5 text-indigo-400" />
                          <span>Compress to Target KB</span>
                        </div>
                        <div className="grid grid-cols-2 gap-1.5">
                          {COMPRESS_TARGET_PRESETS.map((preset) => (
                            <button
                              key={preset.id}
                              type="button"
                              onClick={() =>
                                runToolJob(
                                  "/tools/compress-to-size",
                                  { document_id: doc.id, target_kb: preset.targetKb },
                                  preset.label
                                )
                              }
                              className="px-2.5 py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500 text-left font-medium transition-colors"
                            >
                              {preset.label}
                            </button>
                          ))}
                        </div>
                        <div className="flex gap-1.5 pt-1">
                          <input
                            type="number"
                            value={customKb}
                            onChange={(e) => setCustomKb(e.target.value)}
                            min={10}
                            className="dm-input w-24 px-2.5 py-1.5 font-mono"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              runToolJob(
                                "/tools/compress-to-size",
                                { document_id: doc.id, target_kb: Number(customKb) || 200 },
                                `Compress to ${customKb} KB`
                              )
                            }
                            className="flex-1 dm-primary-btn py-1.5 font-medium"
                          >
                            Apply KB
                          </button>
                        </div>
                      </div>

                      {/* Page numbers & Watermark */}
                      <div className="p-3.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] space-y-2.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <Stamp className="h-3.5 w-3.5 text-violet-400" />
                          <span>Watermark &amp; Page Numbers</span>
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="Watermark text"
                            className="dm-input flex-1 px-2.5 py-1.5"
                          />
                          <button
                            type="button"
                            onClick={() =>
                              runToolJob(
                                "/tools/pdf/watermark",
                                { document_id: doc.id, text: watermarkText },
                                "Watermark"
                              )
                            }
                            className="px-3 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500 font-medium"
                          >
                            Stamp
                          </button>
                        </div>
                        <button
                          type="button"
                          onClick={() =>
                            runToolJob(
                              "/tools/pdf/page-numbers",
                              { document_id: doc.id, position: "bottom-center" },
                              "Page Numbers"
                            )
                          }
                          className="w-full py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500 font-medium transition-colors"
                        >
                          Add Page Numbers (Bottom Center)
                        </button>
                      </div>

                      {/* Reorder / Extract / Delete Pages */}
                      <div className="p-3.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] space-y-2.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <Layers className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Reorder, Extract or Delete Pages</span>
                        </div>
                        <input
                          type="text"
                          value={pageListSpec}
                          onChange={(e) => setPageListSpec(e.target.value)}
                          placeholder="Page list e.g. 2,1,3"
                          className="dm-input w-full px-2.5 py-1.5 font-mono"
                        />
                        <div className="grid grid-cols-3 gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const pages = pageListSpec
                                .split(",")
                                .map((n) => parseInt(n.trim(), 10))
                                .filter((n) => !Number.isNaN(n));
                              runToolJob(
                                "/tools/pdf/pages",
                                { document_id: doc.id, action: "extract", pages },
                                "Extract Pages"
                              );
                            }}
                            className="py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500 font-medium"
                          >
                            Extract
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const pages = pageListSpec
                                .split(",")
                                .map((n) => parseInt(n.trim(), 10))
                                .filter((n) => !Number.isNaN(n));
                              runToolJob(
                                "/tools/pdf/pages",
                                { document_id: doc.id, action: "reorder", pages },
                                "Reorder Pages"
                              );
                            }}
                            className="py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-emerald-500 font-medium"
                          >
                            Reorder
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const pages = pageListSpec
                                .split(",")
                                .map((n) => parseInt(n.trim(), 10))
                                .filter((n) => !Number.isNaN(n));
                              if (pages.length > 0) {
                                setPendingDeletePages(pages);
                              }
                            }}
                            className="py-2 rounded-lg border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 inline-flex items-center justify-center gap-1 font-medium"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete</span>
                          </button>
                        </div>
                      </div>

                      {/* Protect / Unlock */}
                      <div className="p-3.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] space-y-2.5">
                        <div className="flex items-center gap-2 font-semibold">
                          <Lock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Password Protect / Unlock</span>
                        </div>
                        <input
                          type="password"
                          value={pdfPassword}
                          onChange={(e) => setPdfPassword(e.target.value)}
                          placeholder="Enter PDF password"
                          className="dm-input w-full px-2.5 py-1.5"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
                          <button
                            type="button"
                            disabled={!pdfPassword}
                            onClick={() =>
                              runToolJob(
                                "/tools/pdf/protect",
                                { document_id: doc.id, password: pdfPassword },
                                "Protect PDF"
                              )
                            }
                            className="py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] disabled:opacity-40 inline-flex items-center justify-center gap-1 font-medium hover:border-indigo-500"
                          >
                            <Lock className="h-3 w-3" />
                            <span>Protect</span>
                          </button>
                          <button
                            type="button"
                            disabled={!pdfPassword}
                            onClick={() =>
                              runToolJob(
                                "/tools/pdf/unlock",
                                { document_id: doc.id, password: pdfPassword },
                                "Unlock PDF"
                              )
                            }
                            className="py-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] disabled:opacity-40 inline-flex items-center justify-center gap-1 font-medium hover:border-indigo-500"
                          >
                            <Unlock className="h-3 w-3" />
                            <span>Unlock</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {rightTab === "versions" && (
                    <div className="space-y-2.5">
                      {doc.versions.map((v) => {
                        const isActive = effectiveVersion === v.version_no;
                        return (
                          <div
                            key={v.id}
                            className={`p-3.5 rounded-xl border space-y-2 transition-colors ${isActive
                              ? "border-indigo-500 bg-indigo-500/10"
                              : "border-[var(--dm-border)] bg-[var(--dm-subtle)]"
                              }`}
                          >
                            <div className="flex items-center justify-between">
                              <span className="font-mono font-semibold flex items-center gap-1.5">
                                v{v.version_no}
                                {v.version_no === 1 && (
                                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/15 text-emerald-400">
                                    Original
                                  </span>
                                )}
                              </span>
                              <span className="text-[11px] px-2 py-0.5 rounded-full border border-[var(--dm-border)] text-[var(--dm-muted)]">
                                {v.operation_type || "upload"}
                              </span>
                            </div>
                            <p className="font-mono text-[11px] text-[var(--dm-muted)]">
                              {formatBytes(v.size_bytes)} • {v.page_count ?? "?"} pages
                            </p>
                            <div className="flex items-center gap-3 pt-1">
                              <button
                                type="button"
                                onClick={() => setActiveVersionNo(v.version_no)}
                                className="text-indigo-500 dark:text-indigo-300 hover:underline font-medium"
                              >
                                {isActive ? "Previewing" : "Preview"}
                              </button>
                              <button
                                type="button"
                                onClick={() => downloadVersion(v.version_no)}
                                className="text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                              >
                                Download
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}

                  {rightTab === "history" && (
                    <div className="space-y-2">
                      {historyQuery.isLoading ? (
                        <p className="text-[var(--dm-muted)]">Loading audit trail...</p>
                      ) : (historyQuery.data ?? []).length === 0 ? (
                        <p className="text-[var(--dm-muted)]">No audit events recorded yet.</p>
                      ) : (
                        (historyQuery.data ?? []).map((h) => (
                          <div
                            key={h.id}
                            className="p-3 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] space-y-1"
                          >
                            <div className="flex items-center gap-1.5 font-medium">
                              <History className="h-3.5 w-3.5 text-indigo-400" />
                              <span>{h.action}</span>
                            </div>
                            <p className="text-[11px] text-[var(--dm-muted)] font-mono">
                              {new Date(h.created_at).toLocaleString()}
                            </p>
                          </div>
                        ))
                      )}
                    </div>
                  )}
                </div>
              </div>
            </Panel>
          </PanelGroup>
        </div>

        {/* Bottom Status Bar */}
        <div className="dm-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-3 text-xs text-[var(--dm-muted)]">
          <span className="flex items-center gap-2">
            <span className="h-2 w-2 rounded-full bg-emerald-500" />
            Page {currentPage} of {totalPages} • Original v1 preserved
          </span>
          {activeJob ? (
            <div className="flex items-center gap-3 font-mono">
              {(activeJob.status === "running" || activeJob.status === "queued") && (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              )}
              <span>
                {activeJob.stage_message || activeJob.status} ({activeJob.progress ?? 0}%)
              </span>
              <div className="w-24 h-1.5 rounded-full bg-[var(--dm-subtle)] overflow-hidden">
                <div
                  className="h-full bg-indigo-500 transition-all"
                  style={{ width: `${activeJob.progress ?? 0}%` }}
                />
              </div>
            </div>
          ) : (
            <span className="font-mono">Studio Ready</span>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={pendingDeletePages !== null}
        title={`Are you sure you want to delete page(s) ${pendingDeletePages?.join(", ") ?? ""}?`}
        description={`A new version of "${doc.name}" will be created with the selected page(s) removed (original v1 stays preserved).`}
        confirmLabel="Yes, Delete Pages"
        onCancel={() => setPendingDeletePages(null)}
        onConfirm={() => {
          if (!pendingDeletePages) return;
          const pagesToDelete = pendingDeletePages;
          setPendingDeletePages(null);
          void runToolJob(
            "/tools/pdf/pages",
            { document_id: doc.id, action: "delete", pages: pagesToDelete },
            "Delete Pages"
          );
        }}
      />
    </AppShell>
  );
}
