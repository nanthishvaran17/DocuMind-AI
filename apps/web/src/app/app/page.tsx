"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Camera,
  CheckCircle2,
  ExternalLink,
  FilePlus2,
  FileText,
  FolderPlus,
  Image as ImageIcon,
  Layers,
  Loader2,
  Minimize2,
  Search,
  Sparkles,
  Star,
  Trash2,
  UploadCloud,
} from "lucide-react";
import type { AgentCommandPlan, DocumentItem, FolderItem } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, ensureAuthSession, fetchAuthorizedBlob, pollOrStreamJob } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";

function createSamplePdfBlob(): Blob {
  // Minimal valid multi-line 1-page PDF generated client-side for onboarding tour
  const content =
    "BT /F1 18 Tf 56 760 Td (DocuMind AI - Sample Student Guide) Tj /F1 12 Tf 0 -30 Td (1. Try compressing this PDF to under 100 KB or 200 KB.) Tj 0 -22 Td (2. Add page numbers or a diagonal watermark.) Tj 0 -22 Td (3. Every edit creates a new version so v1 stays safe.) Tj ET";
  const objects = [
    "1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj\n",
    "2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj\n",
    "3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj\n",
    `4 0 obj << /Length ${content.length} >> stream\n${content}\nendstream endobj\n`,
    "5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj\n",
  ];
  let pdf = "%PDF-1.4\n";
  const offsets: number[] = [0];
  for (const obj of objects) {
    offsets.push(pdf.length);
    pdf += obj;
  }
  const xrefPos = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`;
  for (let i = 1; i <= objects.length; i += 1) {
    pdf += `${String(offsets[i]).padStart(10, "0")} 00000 n \n`;
  }
  pdf += `trailer << /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefPos}\n%%EOF\n`;
  return new Blob([pdf], { type: "application/pdf" });
}

export default function DashboardPage() {
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const isGuest = useAuthStore((s) => s.isGuest);
  const user = useAuthStore((s) => s.user);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);

  // One-box command hero state
  const [commandText, setCommandText] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [commandPlan, setCommandPlan] = useState<AgentCommandPlan | null>(null);
  const [planning, setPlanning] = useState(false);
  const [approving, setApproving] = useState(false);

  useEffect(() => {
    ensureAuthSession().catch(() => undefined);
  }, []);

  const docsQuery = useQuery({
    queryKey: ["documents", selectedFolder, searchQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (selectedFolder) params.set("folder_id", selectedFolder);
      if (searchQuery.trim()) params.set("q", searchQuery.trim());
      const res = await apiRequest<DocumentItem[]>(`/documents?${params.toString()}`, {
        ensureGuest: true,
      });
      return res.data ?? [];
    },
  });

  const foldersQuery = useQuery({
    queryKey: ["folders", user?.id],
    enabled: Boolean(user && !isGuest),
    queryFn: async () => {
      const res = await apiRequest<FolderItem[]>("/folders");
      return res.data ?? [];
    },
  });

  const docs = useMemo(() => docsQuery.data ?? [], [docsQuery.data]);
  useEffect(() => {
    if (!selectedDocId && docs.length > 0) {
      const firstPdf = docs.find((d) => d.mime_type === "application/pdf");
      if (firstPdf) setSelectedDocId(firstPdf.id);
    }
  }, [docs, selectedDocId]);

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading(true);
      try {
        await ensureAuthSession();
        let lastDoc: DocumentItem | null = null;
        for (const f of list) {
          const fd = new FormData();
          fd.append("file", f);
          if (selectedFolder && !isGuest) {
            fd.append("folder_id", selectedFolder);
          }
          const res = await apiRequest<DocumentItem>("/documents/upload", {
            method: "POST",
            body: fd,
            ensureGuest: true,
          });
          if (res.data) {
            lastDoc = res.data;
            if (res.data.is_duplicate) {
              pushToast({
                title: `Duplicate detected: ${res.data.name}`,
                description: "An identical SHA-256 file already exists in your library.",
                variant: "info",
              });
            }
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
        if (lastDoc) {
          setSelectedDocId(lastDoc.id);
          pushToast({ title: `Uploaded ${lastDoc.name}`, variant: "success" });
        }
      } catch (err) {
        pushToast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Could not upload file.",
          variant: "error",
        });
      } finally {
        setUploading(false);
      }
    },
    [selectedFolder, isGuest, queryClient, pushToast]
  );

  const loadSampleTour = async () => {
    const sampleFile = new File([createSamplePdfBlob()], "DocuMind_Sample_Guide.pdf", {
      type: "application/pdf",
    });
    await handleUploadFiles([sampleFile]);
  };

  const handlePlanCommand = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandText.trim()) return;
    setPlanning(true);
    setCommandPlan(null);
    try {
      const res = await apiRequest<AgentCommandPlan>("/ai/agent/command", {
        method: "POST",
        ensureGuest: true,
        body: JSON.stringify({
          command: commandText.trim(),
          document_id: selectedDocId || undefined,
        }),
      });
      if (res.data) setCommandPlan(res.data);
    } catch (err) {
      pushToast({
        title: "Command planner failed",
        description: err instanceof Error ? err.message : "Select a PDF first.",
        variant: "error",
      });
    } finally {
      setPlanning(false);
    }
  };

  const handleApprovePlan = async (approve: boolean) => {
    if (!commandPlan) return;
    setApproving(true);
    try {
      const res = await apiRequest<AgentCommandPlan>(`/ai/agent/runs/${commandPlan.run_id}/approve`, {
        method: "POST",
        body: JSON.stringify({ approve }),
      });
      if (!approve) {
        setCommandPlan(null);
        pushToast({ title: "Planned action cancelled", variant: "info" });
        return;
      }
      const jobId = res.data?.job_id;
      if (jobId) {
        const finalJob = await pollOrStreamJob(jobId, () => undefined);
        if (finalJob.status === "completed") {
          pushToast({
            title: "Action completed",
            description: "Created a new immutable document version.",
            variant: "success",
          });
          setCommandPlan(null);
          setCommandText("");
          await queryClient.invalidateQueries({ queryKey: ["documents"] });
        } else {
          pushToast({
            title: "Job failed",
            description: String(finalJob.error_detail?.message || "Processing error"),
            variant: "error",
          });
        }
      }
    } catch (err) {
      pushToast({
        title: "Approval failed",
        description: err instanceof Error ? err.message : "Unknown error",
        variant: "error",
      });
    } finally {
      setApproving(false);
    }
  };

  const handleDeleteDoc = async (docId: string, permanent = false) => {
    try {
      await apiRequest(`/documents/${docId}?permanent=${permanent}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      pushToast({
        title: permanent || isGuest ? "Document permanently deleted" : "Moved to Trash",
        variant: "info",
      });
    } catch (err) {
      pushToast({
        title: "Delete failed",
        description: err instanceof Error ? err.message : "Could not delete document.",
        variant: "error",
      });
    }
  };

  const handleDownload = async (doc: DocumentItem) => {
    try {
      const blob = await fetchAuthorizedBlob(`/documents/${doc.id}/download`);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = doc.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      pushToast({
        title: "Download failed",
        description: err instanceof Error ? err.message : "Error downloading file.",
        variant: "error",
      });
    }
  };

  const handleToggleFavorite = async (doc: DocumentItem) => {
    await apiRequest(`/documents/${doc.id}`, {
      method: "PATCH",
      body: JSON.stringify({ is_favorite: !doc.is_favorite }),
    });
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
  };

  const handleCreateFolder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newFolderName.trim()) return;
    setCreatingFolder(true);
    try {
      await apiRequest("/folders", {
        method: "POST",
        body: JSON.stringify({ name: newFolderName.trim() }),
      });
      setNewFolderName("");
      await queryClient.invalidateQueries({ queryKey: ["folders"] });
    } finally {
      setCreatingFolder(false);
    }
  };

  const quickTools = [
    {
      href: "/app/tools/compress",
      title: t.tools.compress,
      desc: t.tools.compressDesc,
      icon: Minimize2,
      accent: "text-indigo-400",
    },
    {
      href: "/app/tools/photo-resizer",
      title: t.tools.photo,
      desc: t.tools.photoDesc,
      icon: ImageIcon,
      accent: "text-violet-400",
    },
    {
      href: "/app/tools/scan",
      title: t.tools.scan,
      desc: t.tools.scanDesc,
      icon: Camera,
      accent: "text-sky-400",
    },
    {
      href: "/app/tools/pdf",
      title: t.tools.merge,
      desc: t.tools.mergeDesc,
      icon: Layers,
      accent: "text-emerald-400",
    },
  ];

  const totalUsedBytes = docs.reduce((acc, d) => acc + d.size_bytes, 0);

  return (
    <AppShell>
      <div className="space-y-6">
        {/* Privacy Status Banner */}
        <PrivacyBadge />

        {/* Hero One-Box Command Bar */}
        <section className="dm-card p-5 sm:p-6 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-sm font-semibold">
              <Sparkles className="h-4 w-4 text-indigo-400" />
              <span>Tell me what you want</span>
            </div>
            {docs.length > 0 && (
              <select
                value={selectedDocId}
                onChange={(e) => setSelectedDocId(e.target.value)}
                aria-label="Target PDF document"
                className="text-xs rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-2.5 py-1.5 max-w-xs"
              >
                {docs
                  .filter((d) => d.mime_type === "application/pdf")
                  .map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} (v{d.current_version_no})
                    </option>
                  ))}
              </select>
            )}
          </div>

          <form onSubmit={handlePlanCommand} className="flex flex-col sm:flex-row gap-2.5">
            <input
              type="text"
              value={commandText}
              onChange={(e) => setCommandText(e.target.value)}
              placeholder={t.app.commandPlaceholder}
              className="flex-1 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3.5 py-2.5 text-sm outline-none focus:border-indigo-500"
            />
            <button
              type="submit"
              disabled={planning || !commandText.trim()}
              className="dm-primary-btn px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
              <span>{t.app.runCommand}</span>
            </button>
          </form>

          {commandPlan && (
            <div className="dm-elevated p-4 space-y-3 border-indigo-500/30">
              <p className="text-sm font-medium">{commandPlan.summary}</p>
              {commandPlan.steps.length > 0 && (
                <ul className="space-y-1.5 text-xs text-[var(--dm-muted)]">
                  {commandPlan.steps.map((s) => (
                    <li key={s.step_no} className="flex items-center gap-2">
                      <CheckCircle2 className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                      <span>{s.description}</span>
                    </li>
                  ))}
                </ul>
              )}
              {commandPlan.status === "awaiting_approval" && (
                <div className="flex items-center gap-2 pt-1">
                  <button
                    type="button"
                    disabled={approving}
                    onClick={() => handleApprovePlan(true)}
                    className="dm-primary-btn px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
                  >
                    {approving && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                    <span>{t.app.approveAction}</span>
                  </button>
                  <button
                    type="button"
                    disabled={approving}
                    onClick={() => handleApprovePlan(false)}
                    className="px-3.5 py-1.5 text-xs rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-surface)]"
                  >
                    {t.app.cancel}
                  </button>
                </div>
              )}
            </div>
          )}
        </section>

        {/* 3-Click Quick Student Tools */}
        <section className="space-y-3">
          <h2 className="text-sm font-semibold text-[var(--dm-muted)]">{t.app.quickTools}</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
            {quickTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="dm-card p-4 hover:border-indigo-500/40 transition-all hover:-translate-y-0.5 space-y-2"
                >
                  <Icon className={`h-5 w-5 ${tool.accent}`} />
                  <h3 className="text-sm font-semibold">{tool.title}</h3>
                  <p className="text-xs text-[var(--dm-muted)]">{tool.desc}</p>
                </Link>
              );
            })}
          </div>
        </section>

        {/* Drag-and-Drop Upload Zone */}
        <motion.section
          onDragOver={(e) => {
            e.preventDefault();
            setDragging(true);
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setDragging(false);
            if (e.dataTransfer.files) handleUploadFiles(e.dataTransfer.files);
          }}
          className={`dm-card p-6 border-dashed transition-colors text-center space-y-3 ${
            dragging ? "border-indigo-500 bg-indigo-500/5" : ""
          }`}
        >
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.docx,.xlsx,.pptx,.txt,.png,.jpg,.jpeg"
            onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
            className="hidden"
          />
          <div className="mx-auto h-11 w-11 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center">
            {uploading ? (
              <Loader2 className="h-5 w-5 animate-spin text-indigo-400" />
            ) : (
              <UploadCloud className="h-5 w-5 text-indigo-400" />
            )}
          </div>
          <div>
            <p className="text-sm font-medium">{t.app.uploadDrop}</p>
            <p className="text-xs text-[var(--dm-muted)] mt-0.5">{t.app.uploadHint}</p>
          </div>
          <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
            <button
              type="button"
              disabled={uploading}
              onClick={() => fileInputRef.current?.click()}
              className="dm-primary-btn px-4 py-2 text-xs font-medium"
            >
              {uploading ? "Uploading & Scanning..." : "Choose Files"}
            </button>
            <button
              type="button"
              disabled={uploading}
              onClick={loadSampleTour}
              className="px-4 py-2 text-xs rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-elevated)] inline-flex items-center gap-1.5"
            >
              <FilePlus2 className="h-3.5 w-3.5 text-indigo-400" />
              <span>Load Sample PDF Tour</span>
            </button>
          </div>
        </motion.section>

        {/* Library + Folders + Search */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <h2 className="text-base font-semibold">{t.app.recentDocs}</h2>
              <span className="text-xs font-mono text-[var(--dm-muted)]">
                {docs.length} file(s) • {formatBytes(totalUsedBytes)}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[var(--dm-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.app.searchPlaceholder}
                  className="rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] pl-8 pr-3 py-1.5 text-xs outline-none focus:border-indigo-500"
                />
              </div>

              {user && !isGuest && (
                <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder..."
                    className="w-32 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] px-2.5 py-1.5 text-xs outline-none focus:border-indigo-500"
                  />
                  <button
                    type="submit"
                    disabled={creatingFolder || !newFolderName.trim()}
                    className="p-1.5 rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-elevated)] disabled:opacity-50"
                    title="Create folder"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {/* Folder Filter Pills */}
          {foldersQuery.data && foldersQuery.data.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedFolder(null)}
                className={`px-3 py-1 rounded-full text-xs border ${
                  selectedFolder === null
                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-400"
                    : "border-[var(--dm-border)] text-[var(--dm-muted)]"
                }`}
              >
                All Files
              </button>
              {foldersQuery.data.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFolder(f.id)}
                  className={`px-3 py-1 rounded-full text-xs border ${
                    selectedFolder === f.id
                      ? "border-indigo-500 bg-indigo-500/15 text-indigo-400"
                      : "border-[var(--dm-border)] text-[var(--dm-muted)]"
                  }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {/* States: Loading / Error / Empty / List */}
          {docsQuery.isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {[1, 2, 3].map((n) => (
                <div key={n} className="dm-card p-4 h-28 animate-pulse bg-[var(--dm-surface)]" />
              ))}
            </div>
          ) : docsQuery.isError ? (
            <div className="dm-card p-6 text-center text-sm text-red-400">
              Failed to load documents. Check that the API server is running and try again.
            </div>
          ) : docs.length === 0 ? (
            <div className="dm-card p-10 text-center space-y-2">
              <FileText className="h-8 w-8 text-[var(--dm-muted)] mx-auto" />
              <p className="text-sm font-medium">{t.app.emptyTitle}</p>
              <p className="text-xs text-[var(--dm-muted)]">{t.app.emptySubtitle}</p>
            </div>
          ) : (
            <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {docs.map((doc) => (
                <div
                  key={doc.id}
                  className="dm-card p-4 flex flex-col justify-between gap-3 hover:border-indigo-500/40 transition-colors"
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link
                        href={`/app/workspace/${doc.id}`}
                        className="text-sm font-medium hover:text-indigo-400 truncate block"
                      >
                        {doc.name}
                      </Link>
                      <div className="flex flex-wrap items-center gap-2 mt-1 text-xs text-[var(--dm-muted)] font-mono">
                        <span>{formatBytes(doc.size_bytes)}</span>
                        <span>•</span>
                        <span>v{doc.current_version_no}</span>
                        {doc.page_count !== null && (
                          <>
                            <span>•</span>
                            <span>{doc.page_count}p</span>
                          </>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleToggleFavorite(doc)}
                      aria-label="Toggle favorite"
                      className="p-1 text-[var(--dm-muted)] hover:text-amber-400"
                    >
                      <Star
                        className={`h-4 w-4 ${doc.is_favorite ? "fill-amber-400 text-amber-400" : ""}`}
                      />
                    </button>
                  </div>

                  <div className="flex items-center justify-between pt-2 border-t border-[var(--dm-border)] text-xs">
                    <button
                      type="button"
                      onClick={() => router.push(`/app/workspace/${doc.id}`)}
                      className="inline-flex items-center gap-1 text-indigo-400 hover:underline font-medium"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      <span>Open Workspace</span>
                    </button>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleDownload(doc)}
                        className="text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                      >
                        Download
                      </button>
                      <button
                        type="button"
                        onClick={() => handleDeleteDoc(doc.id, isGuest)}
                        className="text-red-400 hover:text-red-300"
                        title={isGuest ? "Delete now" : "Move to Trash"}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </AppShell>
  );
}
