"use client";

import { useParams, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Panel, PanelGroup, PanelResizeHandle } from "react-resizable-panels";
import {
  ChevronLeft,
  ChevronRight,
  Download,
  History,
  Layers,
  Loader2,
  Lock,
  Minimize2,
  RotateCw,
  Stamp,
  Trash2,
  Unlock,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import type { DocumentDetailOut, JobRecord } from "@documind/types";
import { COMPRESS_TARGET_PRESETS, formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
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

  // Tool inputs
  const [customKb, setCustomKb] = useState("200");
  const [watermarkText, setWatermarkText] = useState("CONFIDENTIAL");
  const [pdfPassword, setPdfPassword] = useState("");
  const [pageListSpec, setPageListSpec] = useState("1");

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

  // Load authorized PNG thumbnails for left rail
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
        <div className="flex items-center justify-center h-[70vh] gap-2 text-sm text-[var(--dm-muted)]">
          <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
          <span>Loading workspace...</span>
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
            className="px-4 py-2 text-xs rounded-lg border border-[var(--dm-border)]"
          >
            Back to Library
          </button>
        </div>
      </AppShell>
    );
  }

  return (
    <AppShell>
      <div className="space-y-3">
        <PrivacyBadge expiresAt={doc.expires_at} onDeleteNow={deleteNow} />

        {/* Top Toolbar */}
        <div className="dm-card px-4 py-2.5 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-sm font-semibold truncate">{doc.name}</h1>
            <p className="text-xs text-[var(--dm-muted)] font-mono">
              Version v{effectiveVersion} (of {doc.current_version_no}) • {formatBytes(doc.size_bytes)}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.max(1, p - 1))}
              disabled={currentPage <= 1}
              className="p-1.5 rounded border border-[var(--dm-border)] disabled:opacity-40"
              aria-label="Previous page"
            >
              <ChevronLeft className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono px-2">
              {currentPage} / {doc.page_count || 1}
            </span>
            <button
              type="button"
              onClick={() => setCurrentPage((p) => Math.min(doc.page_count || 1, p + 1))}
              disabled={currentPage >= (doc.page_count || 1)}
              className="p-1.5 rounded border border-[var(--dm-border)] disabled:opacity-40"
              aria-label="Next page"
            >
              <ChevronRight className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() => setZoom((z) => Math.max(0.5, Number((z - 0.15).toFixed(2))))}
              className="p-1.5 rounded border border-[var(--dm-border)] ml-2"
              aria-label="Zoom out"
            >
              <ZoomOut className="h-4 w-4" />
            </button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <button
              type="button"
              onClick={() => setZoom((z) => Math.min(2.4, Number((z + 0.15).toFixed(2))))}
              className="p-1.5 rounded border border-[var(--dm-border)]"
              aria-label="Zoom in"
            >
              <ZoomIn className="h-4 w-4" />
            </button>

            <button
              type="button"
              onClick={() =>
                runToolJob(
                  "/tools/pdf/pages",
                  { document_id: doc.id, action: "rotate", angle: 90, pages: [currentPage] },
                  "Rotate Page"
                )
              }
              className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs rounded border border-[var(--dm-border)] hover:bg-[var(--dm-elevated)] ml-2"
            >
              <RotateCw className="h-3.5 w-3.5" />
              <span>Rotate 90°</span>
            </button>

            <button
              type="button"
              onClick={() => downloadVersion(effectiveVersion)}
              className="dm-primary-btn inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium ml-1"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Export v{effectiveVersion}</span>
            </button>
          </div>
        </div>

        {/* 3-Pane Resizable Workspace */}
        <div className="dm-card overflow-hidden h-[70vh] min-h-[520px]">
          <PanelGroup direction="horizontal">
            {/* Left Rail: Page Thumbnails */}
            <Panel defaultSize={18} minSize={12} maxSize={30} className="hidden md:block">
              <div className="h-full overflow-y-auto p-3 border-r border-[var(--dm-border)] space-y-2.5">
                <p className="text-xs font-semibold text-[var(--dm-muted)] uppercase">Pages</p>
                {doc.pages.length === 0 ? (
                  <p className="text-xs text-[var(--dm-muted)]">No thumbnails (locked or non-PDF).</p>
                ) : (
                  doc.pages.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => setCurrentPage(p.page_no)}
                      className={`w-full rounded-lg p-1.5 border text-left transition-colors ${
                        currentPage === p.page_no
                          ? "border-indigo-500 bg-indigo-500/10"
                          : "border-[var(--dm-border)] hover:border-indigo-500/40"
                      }`}
                    >
                      {thumbUrls[p.page_no] ? (
                        <img
                          src={thumbUrls[p.page_no]}
                          alt={`Page ${p.page_no}`}
                          className="w-full rounded border border-[var(--dm-border)] bg-white"
                        />
                      ) : (
                        <div className="h-24 rounded bg-[var(--dm-bg)] flex items-center justify-center text-xs text-[var(--dm-muted)]">
                          Page {p.page_no}
                        </div>
                      )}
                      <span className="block text-center text-[11px] font-mono mt-1 text-[var(--dm-muted)]">
                        Page {p.page_no}
                      </span>
                    </button>
                  ))
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="hidden md:block w-1 bg-[var(--dm-border)] hover:bg-indigo-500 transition-colors" />

            {/* Center Canvas: PDF.js Viewer */}
            <Panel defaultSize={54} minSize={35}>
              <div className="h-full bg-[var(--dm-bg)]">
                {doc.mime_type === "application/pdf" ? (
                  <PdfViewer
                    documentId={doc.id}
                    versionNo={effectiveVersion}
                    currentPage={currentPage}
                    zoom={zoom}
                  />
                ) : (
                  <div className="flex items-center justify-center h-full text-sm text-[var(--dm-muted)]">
                    Previewing non-PDF files directly in browser arrives with Phase 2 conversion. Use Export to download.
                  </div>
                )}
              </div>
            </Panel>

            <PanelResizeHandle className="w-1 bg-[var(--dm-border)] hover:bg-indigo-500 transition-colors" />

            {/* Right Rail: Tools / Versions / History */}
            <Panel defaultSize={28} minSize={20} maxSize={42}>
              <div className="h-full flex flex-col border-l border-[var(--dm-border)]">
                <div className="grid grid-cols-3 border-b border-[var(--dm-border)] text-xs font-medium">
                  {(["tools", "versions", "history"] as const).map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      onClick={() => setRightTab(tab)}
                      className={`py-2.5 capitalize border-b-2 transition-colors ${
                        rightTab === tab
                          ? "border-indigo-500 text-indigo-400"
                          : "border-transparent text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </div>

                <div className="flex-1 overflow-y-auto p-3.5 space-y-4 text-xs">
                  {rightTab === "tools" && (
                    <>
                      {/* Compress to KB */}
                      <div className="dm-elevated p-3 space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold">
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
                              className="px-2 py-1.5 rounded border border-[var(--dm-border)] hover:border-indigo-500 text-left"
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
                            className="w-24 rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2 py-1 font-mono"
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
                            className="flex-1 dm-primary-btn py-1 font-medium"
                          >
                            Apply KB
                          </button>
                        </div>
                      </div>

                      {/* Page numbers & Watermark */}
                      <div className="dm-elevated p-3 space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Stamp className="h-3.5 w-3.5 text-violet-400" />
                          <span>Watermark & Page Numbers</span>
                        </div>
                        <div className="flex gap-1.5">
                          <input
                            type="text"
                            value={watermarkText}
                            onChange={(e) => setWatermarkText(e.target.value)}
                            placeholder="Watermark text"
                            className="flex-1 rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2 py-1"
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
                            className="px-2.5 py-1 rounded border border-[var(--dm-border)] hover:bg-[var(--dm-surface)]"
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
                          className="w-full py-1.5 rounded border border-[var(--dm-border)] hover:bg-[var(--dm-surface)]"
                        >
                          Add Page Numbers (Bottom Center)
                        </button>
                      </div>

                      {/* Delete / Extract Pages */}
                      <div className="dm-elevated p-3 space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Layers className="h-3.5 w-3.5 text-emerald-400" />
                          <span>Delete or Extract Pages</span>
                        </div>
                        <input
                          type="text"
                          value={pageListSpec}
                          onChange={(e) => setPageListSpec(e.target.value)}
                          placeholder="Comma pages e.g. 1,3"
                          className="w-full rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2 py-1 font-mono"
                        />
                        <div className="grid grid-cols-2 gap-1.5">
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
                            className="py-1.5 rounded border border-[var(--dm-border)] hover:bg-[var(--dm-surface)]"
                          >
                            Extract to New PDF
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
                                { document_id: doc.id, action: "delete", pages },
                                "Delete Pages"
                              );
                            }}
                            className="py-1.5 rounded border border-red-500/30 text-red-400 hover:bg-red-500/10 inline-flex items-center justify-center gap-1"
                          >
                            <Trash2 className="h-3 w-3" />
                            <span>Delete Pages</span>
                          </button>
                        </div>
                      </div>

                      {/* Protect / Unlock */}
                      <div className="dm-elevated p-3 space-y-2">
                        <div className="flex items-center gap-1.5 font-semibold">
                          <Lock className="h-3.5 w-3.5 text-amber-400" />
                          <span>Password Protect / Unlock</span>
                        </div>
                        <input
                          type="password"
                          value={pdfPassword}
                          onChange={(e) => setPdfPassword(e.target.value)}
                          placeholder="Enter PDF password"
                          className="w-full rounded border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2 py-1"
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
                            className="py-1.5 rounded border border-[var(--dm-border)] disabled:opacity-40 inline-flex items-center justify-center gap-1"
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
                            className="py-1.5 rounded border border-[var(--dm-border)] disabled:opacity-40 inline-flex items-center justify-center gap-1"
                          >
                            <Unlock className="h-3 w-3" />
                            <span>Unlock</span>
                          </button>
                        </div>
                      </div>
                    </>
                  )}

                  {rightTab === "versions" && (
                    <div className="space-y-2">
                      {doc.versions.map((v) => (
                        <div
                          key={v.id}
                          className={`dm-elevated p-3 space-y-1.5 ${
                            effectiveVersion === v.version_no ? "border-indigo-500" : ""
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-mono font-semibold">v{v.version_no}</span>
                            <span className="text-[var(--dm-muted)]">{v.operation_type || "upload"}</span>
                          </div>
                          <p className="font-mono text-[11px] text-[var(--dm-muted)]">
                            {formatBytes(v.size_bytes)} • {v.page_count ?? "?"} pages
                          </p>
                          <div className="flex items-center gap-2 pt-1">
                            <button
                              type="button"
                              onClick={() => setActiveVersionNo(v.version_no)}
                              className="text-indigo-400 hover:underline"
                            >
                              Preview
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
                      ))}
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
                          <div key={h.id} className="dm-elevated p-2.5 space-y-1">
                            <div className="flex items-center gap-1.5 font-medium">
                              <History className="h-3 w-3 text-indigo-400" />
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
        <div className="dm-card px-4 py-2 flex flex-wrap items-center justify-between gap-2 text-xs text-[var(--dm-muted)]">
          <span>
            Page {currentPage} of {doc.page_count || 1} • Original v1 preserved
          </span>
          {activeJob ? (
            <div className="flex items-center gap-2 font-mono">
              {activeJob.status === "running" || activeJob.status === "queued" ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
              ) : null}
              <span>
                {activeJob.stage_message || activeJob.status} ({activeJob.progress ?? 0}%)
              </span>
            </div>
          ) : (
            <span>Ready</span>
          )}
        </div>
      </div>
    </AppShell>
  );
}
