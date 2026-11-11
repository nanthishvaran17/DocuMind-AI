"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  Activity,
  ArrowLeftRight,
  ArrowUpRight,
  Bot,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  Clock,
  Download,
  ExternalLink,
  FilePlus2,
  FileSearch,
  FileText,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  Layers,
  LayoutGrid,
  List as ListIcon,
  Loader2,
  Minimize2,
  Pencil,
  ScanText,
  Search,
  Star,
  Trash2,
  UploadCloud,
  X,
  XCircle,
} from "lucide-react";
import type { DocumentItem, FolderItem, JobRecord } from "@documind/types";
import { formatBytes, formatRelativeExpiry } from "@documind/shared";
import { AgentWorkflowCard } from "@/components/AgentWorkflowCard";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import {
  FileFormatIcon,
  detectFileFormat,
  getFileFormatMeta,
} from "@/components/FileFormatIcon";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, ensureAuthSession, fetchAuthorizedBlob } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";
import { usePreferencesStore } from "@/stores/preferences-store";

function createSamplePdfBlob(): Blob {
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

function getFileTypeBadge(mime: string, name: string) {
  const meta = getFileFormatMeta(mime, name);
  return {
    label: meta.label,
    format: meta.format,
    bg: meta.badgeBg,
    chip: meta.chipClass,
    brandColor: meta.brandColor,
  };
}

function formatFriendlyActivity(job: JobRecord): string {
  if (job.status === "completed") return "Completed successfully";
  if (job.status === "failed") {
    const raw = (job.stage_message || "").trim();
    if (!raw || raw.includes("must be") || raw.includes("ValidationError")) {
      return "Needs adjustment — open tool to retry";
    }
    return raw.replace(/^Failed:\s*/i, "");
  }
  return job.stage_message || "Processing...";
}

export default function DashboardPage() {
  const { t } = useT();
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const isGuest = useAuthStore((s) => s.isGuest);
  const user = useAuthStore((s) => s.user);
  const accessToken = useAuthStore((s) => s.accessToken);
  const confirmBeforeDelete = usePreferencesStore((s) => s.confirm_before_delete);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [dragging, setDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [showAiStudio, setShowAiStudio] = useState(false);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [filterKind, setFilterKind] = useState<"all" | "pdf" | "office" | "images" | "starred">("all");
  const [viewMode, setViewMode] = useState<"grid" | "list">("grid");
  const [newFolderName, setNewFolderName] = useState("");
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [editingDocId, setEditingDocId] = useState<string | null>(null);
  const [editingDocName, setEditingDocName] = useState("");

  useEffect(() => {
    ensureAuthSession().catch(() => undefined);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(searchQuery.trim());
    }, 200);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  const docsQuery = useQuery({
    queryKey: ["documents", selectedFolder, debouncedQuery],
    queryFn: async () => {
      const params = new URLSearchParams();
      params.set("limit", "50");
      if (selectedFolder) params.set("folder_id", selectedFolder);
      if (debouncedQuery) params.set("q", debouncedQuery);
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

  const jobsQuery = useQuery({
    queryKey: ["dashboard-jobs", Boolean(accessToken)],
    enabled: Boolean(accessToken),
    queryFn: async () => {
      const res = await apiRequest<JobRecord[]>("/jobs");
      return res.data ?? [];
    },
  });

  const docs = useMemo(() => docsQuery.data ?? [], [docsQuery.data]);
  const pdfDocs = useMemo(
    () =>
      docs.filter(
        (d) => d.mime_type === "application/pdf" || d.name.toLowerCase().endsWith(".pdf")
      ),
    [docs]
  );
  const officeDocs = useMemo(
    () =>
      docs.filter((d) => {
        const fmt = detectFileFormat(d.mime_type, d.name);
        return fmt === "xlsx" || fmt === "docx" || fmt === "pptx" || fmt === "csv";
      }),
    [docs]
  );
  const imageDocs = useMemo(
    () =>
      docs.filter(
        (d) =>
          d.mime_type.startsWith("image/") ||
          /\.(png|jpe?g|webp|gif|svg)$/i.test(d.name)
      ),
    [docs]
  );
  const jobs = useMemo(() => jobsQuery.data ?? [], [jobsQuery.data]);

  const filteredDocs = useMemo(() => {
    if (filterKind === "pdf") return pdfDocs;
    if (filterKind === "office") return officeDocs;
    if (filterKind === "images") return imageDocs;
    if (filterKind === "starred") return docs.filter((d) => d.is_favorite);
    return docs;
  }, [docs, filterKind, pdfDocs, officeDocs, imageDocs]);

  const uploadChunkedFile = useCallback(
    async (f: File, folderId: string | null): Promise<DocumentItem | null> => {
      const CHUNK_BYTES = 5 * 1024 * 1024;
      const totalChunks = Math.max(1, Math.ceil(f.size / CHUNK_BYTES));
      const initFd = new FormData();
      initFd.append("filename", f.name);
      initFd.append("total_chunks", String(totalChunks));
      if (folderId) {
        initFd.append("folder_id", folderId);
      }
      const initRes = await apiRequest<{ upload_id: string }>("/documents/upload/init", {
        method: "POST",
        body: initFd,
        ensureGuest: true,
      });
      const uploadId = initRes.data?.upload_id;
      if (!uploadId) {
        throw new Error("Chunked upload initialization failed.");
      }
      for (let i = 0; i < totalChunks; i += 1) {
        const start = i * CHUNK_BYTES;
        const slice = f.slice(start, Math.min(f.size, start + CHUNK_BYTES));
        const chunkFd = new FormData();
        chunkFd.append("chunk_index", String(i));
        chunkFd.append("chunk", slice, `${f.name}.part${i}`);
        await apiRequest(`/documents/upload/${uploadId}/chunk`, {
          method: "POST",
          body: chunkFd,
        });
      }
      const completeRes = await apiRequest<DocumentItem>(`/documents/upload/${uploadId}/complete`, {
        method: "POST",
      });
      return completeRes.data ?? null;
    },
    []
  );

  const handleUploadFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = Array.from(files);
      if (list.length === 0) return;
      setUploading(true);
      try {
        await ensureAuthSession();
        let lastDoc: DocumentItem | null = null;
        const folderForUpload = selectedFolder && !isGuest ? selectedFolder : null;
        for (const f of list) {
          let uploaded: DocumentItem | null = null;
          if (f.size > 5 * 1024 * 1024) {
            uploaded = await uploadChunkedFile(f, folderForUpload);
          } else {
            const fd = new FormData();
            fd.append("file", f);
            if (folderForUpload) {
              fd.append("folder_id", folderForUpload);
            }
            const res = await apiRequest<DocumentItem>("/documents/upload", {
              method: "POST",
              body: fd,
              ensureGuest: true,
            });
            uploaded = res.data ?? null;
          }
          if (uploaded) {
            lastDoc = uploaded;
            if (uploaded.is_duplicate) {
              pushToast({
                title: `Duplicate detected: ${uploaded.name}`,
                description: "An identical SHA-256 file already exists in your library.",
                variant: "info",
              });
            }
          }
        }
        await queryClient.invalidateQueries({ queryKey: ["documents"] });
        await queryClient.invalidateQueries({ queryKey: ["shell-docs-summary"] });
        if (lastDoc) {
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
    [selectedFolder, isGuest, queryClient, pushToast, uploadChunkedFile]
  );

  const loadSampleTour = async () => {
    const sampleFile = new File([createSamplePdfBlob()], "DocuMind_Sample_Guide.pdf", {
      type: "application/pdf",
    });
    await handleUploadFiles([sampleFile]);
  };

  const [pendingDeleteDoc, setPendingDeleteDoc] = useState<{
    id: string;
    name: string;
    permanent: boolean;
  } | null>(null);
  const [deletingDoc, setDeletingDoc] = useState(false);

  const handleDeleteDoc = async (docId: string, permanent: boolean) => {
    try {
      await apiRequest(`/documents/${docId}?permanent=${permanent}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["shell-docs-summary"] });
      pushToast({
        title: permanent ? "Permanently deleted" : "Moved to trash (30-day recovery)",
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
    const qk = ["documents", selectedFolder, debouncedQuery];
    const prev = queryClient.getQueryData<DocumentItem[]>(qk);
    if (prev) {
      queryClient.setQueryData<DocumentItem[]>(
        qk,
        prev.map((d) => (d.id === doc.id ? { ...d, is_favorite: !d.is_favorite } : d))
      );
    }
    try {
      await apiRequest(`/documents/${doc.id}`, {
        method: "PATCH",
        body: JSON.stringify({ is_favorite: !doc.is_favorite }),
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
    } catch {
      if (prev) queryClient.setQueryData(qk, prev);
      pushToast({ title: "Could not update favorite", variant: "error" });
    }
  };

  const handleRenameDoc = async (docId: string) => {
    const trimmed = editingDocName.trim();
    if (!trimmed) {
      setEditingDocId(null);
      return;
    }
    const qk = ["documents", selectedFolder, debouncedQuery];
    const prev = queryClient.getQueryData<DocumentItem[]>(qk);
    if (prev) {
      queryClient.setQueryData<DocumentItem[]>(
        qk,
        prev.map((d) => (d.id === docId ? { ...d, name: trimmed } : d))
      );
    }
    setEditingDocId(null);
    try {
      await apiRequest(`/documents/${docId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: trimmed }),
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      await queryClient.invalidateQueries({ queryKey: ["shell-docs-summary"] });
      pushToast({ title: "Document renamed", variant: "success" });
    } catch (err) {
      if (prev) queryClient.setQueryData(qk, prev);
      pushToast({
        title: "Rename failed",
        description: err instanceof Error ? err.message : "Could not rename document.",
        variant: "error",
      });
    }
  };

  const handleMoveDocFolder = async (docId: string, folderId: string | null) => {
    try {
      await apiRequest(`/documents/${docId}`, {
        method: "PATCH",
        body: JSON.stringify({ folder_id: folderId }),
      });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      pushToast({ title: folderId ? "Moved to folder" : "Moved to Root", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Move failed",
        description: err instanceof Error ? err.message : "Could not move document.",
        variant: "error",
      });
    }
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
      tag: "< 100 KB / 2 MB",
      icon: Minimize2,
      iconBg: "bg-indigo-600 text-white shadow-sm shadow-indigo-500/30",
      tagCls: "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30",
    },
    {
      href: "/app/tools/scan",
      title: t.tools.scan,
      desc: t.tools.scanDesc,
      tag: "Auto-Capture",
      icon: Camera,
      iconBg: "bg-cyan-600 text-white shadow-sm shadow-cyan-500/30",
      tagCls: "bg-cyan-50 text-cyan-800 border-cyan-200 dark:bg-cyan-500/15 dark:text-cyan-300 dark:border-cyan-500/30",
    },
    {
      href: "/app/tools/photo-resizer",
      title: t.tools.photo,
      desc: t.tools.photoDesc,
      tag: "300 DPI • GATE / PAN",
      icon: ImageIcon,
      iconBg: "bg-violet-600 text-white shadow-sm shadow-violet-500/30",
      tagCls: "bg-violet-50 text-violet-700 border-violet-200 dark:bg-violet-500/15 dark:text-violet-300 dark:border-violet-500/30",
    },
    {
      href: "/app/tools/convert",
      title: t.tools.convert,
      desc: t.tools.convertDesc,
      tag: "DOCX • XLSX • PPTX",
      icon: ArrowLeftRight,
      iconBg: "bg-sky-600 text-white shadow-sm shadow-sky-500/30",
      tagCls: "bg-sky-50 text-sky-700 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30",
    },
    {
      href: "/app/tools/ocr",
      title: t.tools.ocr,
      desc: t.tools.ocrDesc,
      tag: "English + தமிழ்",
      icon: ScanText,
      iconBg: "bg-amber-500 text-white shadow-sm shadow-amber-500/30",
      tagCls: "bg-amber-50 text-amber-800 border-amber-200 dark:bg-amber-500/15 dark:text-amber-300 dark:border-amber-500/30",
    },
    {
      href: "/app/tools/pdf",
      title: t.tools.merge,
      desc: t.tools.mergeDesc,
      tag: "Immutable v2+",
      icon: Layers,
      iconBg: "bg-emerald-600 text-white shadow-sm shadow-emerald-500/30",
      tagCls: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30",
    },
    {
      href: "/app/intelligence",
      title: t.app.intelligence,
      desc: "Semantic index search, document summaries & cited Q&A.",
      tag: "AI Search & Q&A",
      icon: FileSearch,
      iconBg: "bg-blue-600 text-white shadow-sm shadow-blue-500/30",
      tagCls: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-500/15 dark:text-blue-300 dark:border-blue-500/30",
    },
    {
      href: "/app/workflows",
      title: t.app.workflows,
      desc: "Run chained document tasks with step-by-step approval.",
      tag: "Automation",
      icon: Bot,
      iconBg: "bg-fuchsia-600 text-white shadow-sm shadow-fuchsia-500/30",
      tagCls: "bg-fuchsia-50 text-fuchsia-700 border-fuchsia-200 dark:bg-fuchsia-500/15 dark:text-fuchsia-300 dark:border-fuchsia-500/30",
    },
  ];

  const totalUsedBytes = docs.reduce((acc, d) => acc + d.size_bytes, 0);
  const pdfBytes = pdfDocs.reduce((acc, d) => acc + d.size_bytes, 0);
  const imgBytes = imageDocs.reduce((acc, d) => acc + d.size_bytes, 0);
  const otherBytes = Math.max(0, totalUsedBytes - pdfBytes - imgBytes);
  const completedJobsCount = jobs.filter((j) => j.status === "completed").length;

  return (
    <AppShell>
      <div className="space-y-7">
        {/* Top Workspace Header + Integrated Telemetry */}
        <section className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-2 border-b border-[var(--dm-border)]">
          <div className="space-y-0.5">
            <h1 className="text-xl sm:text-2xl font-bold tracking-tight text-[var(--dm-text)] flex items-center gap-2.5">
              <span>Document Workspace</span>
              <span className="text-[11px] font-mono font-medium px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                {user ? user.full_name : "Guest Vault"}
              </span>
            </h1>
            <p className="text-xs text-[var(--dm-muted)]">
              Upload once &mdash; originals remain untouched as <span className="font-mono font-semibold text-[var(--dm-text)]">v1</span> on every edit.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <div className="inline-flex items-center gap-3 text-xs px-3.5 py-1.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] text-[var(--dm-muted)] font-medium shadow-2xs">
              <span className="flex items-center gap-1.5 text-[var(--dm-text)] font-semibold">
                <FileText className="h-3.5 w-3.5 text-indigo-500" />
                <span className="font-mono">{docs.length}</span> files
              </span>
              <span className="h-3 w-px bg-[var(--dm-border)]" />
              <span className="flex items-center gap-1.5">
                <HardDrive className="h-3.5 w-3.5 text-violet-500" />
                <span className="font-mono font-semibold text-[var(--dm-text)]">{formatBytes(totalUsedBytes)}</span>
              </span>
              <span className="h-3 w-px bg-[var(--dm-border)]" />
              <span className="flex items-center gap-1.5">
                <Activity className="h-3.5 w-3.5 text-emerald-500" />
                <span className="font-mono font-semibold text-[var(--dm-text)]">{completedJobsCount}</span> runs
              </span>
            </div>
            <PrivacyBadge />
          </div>
        </section>

        {/* Upload Dropzone & Activity Row (User-Friendly First Screen) */}
        <div className="grid lg:grid-cols-12 gap-5 items-stretch">
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
            className={`lg:col-span-7 dm-card p-6 sm:p-7 border-2 border-dashed transition-all text-center space-y-4 flex flex-col justify-center bg-gradient-to-br from-white via-white to-indigo-50/70 dark:from-[var(--dm-surface)] dark:via-[var(--dm-surface)] dark:to-indigo-950/20 ${
              dragging
                ? "border-indigo-600 bg-indigo-50 dark:bg-indigo-500/15 scale-[1.005]"
                : "border-indigo-300 dark:border-indigo-500/40 hover:border-indigo-500"
            }`}
          >
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept=".pdf,.docx,.xlsx,.pptx,.txt,.md,.markdown,.png,.jpg,.jpeg"
              onChange={(e) => e.target.files && handleUploadFiles(e.target.files)}
              className="hidden"
            />
            <div className="mx-auto h-14 w-14 rounded-2xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white flex items-center justify-center shadow-lg shadow-indigo-500/30">
              {uploading ? (
                <Loader2 className="h-6 w-6 animate-spin" />
              ) : (
                <UploadCloud className="h-6 w-6" />
              )}
            </div>
            <div className="space-y-1">
              <p className="text-base font-semibold text-[var(--dm-text)]">{t.app.uploadDrop}</p>
              <p className="text-xs text-[var(--dm-muted)]">{t.app.uploadHint}</p>
            </div>
            <div className="flex flex-wrap items-center justify-center gap-1.5 text-[10px] font-mono font-semibold">
              {["PDF", "PNG", "JPG", "DOCX", "XLSX", "PPTX", "MD", "TXT"].map((ext) => (
                <span
                  key={ext}
                  className="px-2.5 py-0.5 rounded-md bg-white dark:bg-slate-800 border border-[var(--dm-border)] text-[var(--dm-text)] shadow-2xs"
                >
                  {ext}
                </span>
              ))}
            </div>
            <div className="flex flex-wrap items-center justify-center gap-2.5 pt-1">
              <button
                type="button"
                disabled={uploading}
                onClick={() => fileInputRef.current?.click()}
                className="dm-primary-btn px-5 py-2.5 text-xs font-semibold inline-flex items-center gap-2"
              >
                <UploadCloud className="h-4 w-4" />
                <span>{uploading ? "Uploading & Scanning..." : "Choose Files"}</span>
              </button>
              <Link
                href="/app/tools/scan"
                className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-cyan-300 bg-cyan-50 text-cyan-800 hover:bg-cyan-100 dark:border-cyan-500/30 dark:bg-cyan-500/15 dark:text-cyan-200 inline-flex items-center gap-1.5 transition-colors"
              >
                <Camera className="h-3.5 w-3.5" />
                <span>Auto Camera Scan</span>
              </Link>
              <button
                type="button"
                disabled={uploading}
                onClick={loadSampleTour}
                className="px-4 py-2.5 text-xs font-semibold rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] text-[var(--dm-text)] hover:border-indigo-500 inline-flex items-center gap-1.5 transition-colors"
              >
                <FilePlus2 className="h-3.5 w-3.5 text-indigo-600 dark:text-indigo-400" />
                <span>Load Sample PDF</span>
              </button>
            </div>
          </motion.section>

          {/* Right 5 cols: Vault Breakdown & Clean Recent Activity */}
          <div className="lg:col-span-5 flex flex-col gap-5">
            <section className="dm-card p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--dm-text)]">
                  <HardDrive className="h-4 w-4 text-indigo-600 dark:text-indigo-400" />
                  <span>Vault Storage</span>
                </h2>
                <span className="font-mono text-xs font-semibold text-indigo-700 dark:text-indigo-300 bg-indigo-50 dark:bg-indigo-500/15 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-500/30">
                  {formatBytes(totalUsedBytes)} / 500 MB
                </span>
              </div>

              <div className="h-3 w-full rounded-full bg-slate-100 dark:bg-slate-800 border border-[var(--dm-border)] overflow-hidden flex">
                {totalUsedBytes > 0 && (
                  <>
                    <div
                      className="h-full bg-indigo-600 transition-all"
                      style={{ width: `${(pdfBytes / totalUsedBytes) * 100}%` }}
                      title={`PDFs: ${formatBytes(pdfBytes)}`}
                    />
                    <div
                      className="h-full bg-emerald-500 transition-all"
                      style={{ width: `${(imgBytes / totalUsedBytes) * 100}%` }}
                      title={`Images: ${formatBytes(imgBytes)}`}
                    />
                    <div
                      className="h-full bg-amber-500 transition-all"
                      style={{ width: `${(otherBytes / totalUsedBytes) * 100}%` }}
                      title={`Other: ${formatBytes(otherBytes)}`}
                    />
                  </>
                )}
              </div>

              <div className="grid grid-cols-3 gap-2 text-xs">
                <div className="p-2.5 rounded-xl bg-indigo-50/70 dark:bg-indigo-500/10 border border-indigo-200 dark:border-indigo-500/25">
                  <div className="flex items-center gap-1.5 text-indigo-800 dark:text-indigo-300 text-[11px] font-semibold">
                    <span className="h-2 w-2 rounded-full bg-indigo-600" />
                    <span>PDFs</span>
                  </div>
                  <p className="font-mono font-bold mt-1 text-[var(--dm-text)]">{pdfDocs.length} • {formatBytes(pdfBytes)}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-emerald-50/70 dark:bg-emerald-500/10 border border-emerald-200 dark:border-emerald-500/25">
                  <div className="flex items-center gap-1.5 text-emerald-800 dark:text-emerald-300 text-[11px] font-semibold">
                    <span className="h-2 w-2 rounded-full bg-emerald-500" />
                    <span>Images</span>
                  </div>
                  <p className="font-mono font-bold mt-1 text-[var(--dm-text)]">{imageDocs.length} • {formatBytes(imgBytes)}</p>
                </div>
                <div className="p-2.5 rounded-xl bg-amber-50/70 dark:bg-amber-500/10 border border-amber-200 dark:border-amber-500/25">
                  <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-300 text-[11px] font-semibold">
                    <span className="h-2 w-2 rounded-full bg-amber-500" />
                    <span>Other</span>
                  </div>
                  <p className="font-mono font-bold mt-1 text-[var(--dm-text)]">
                    {docs.length - pdfDocs.length - imageDocs.length} • {formatBytes(otherBytes)}
                  </p>
                </div>
              </div>
            </section>

            <section className="dm-card p-5 space-y-3 flex-1 flex flex-col">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold flex items-center gap-2 text-[var(--dm-text)]">
                  <Activity className="h-4 w-4 text-emerald-600 dark:text-emerald-400" />
                  <span>Recent Activity</span>
                </h2>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30">
                  <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
                  Live
                </span>
              </div>

              {jobs.length === 0 ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center py-6 px-4 rounded-xl border border-dashed border-[var(--dm-border)] bg-[var(--dm-subtle)]">
                  <Activity className="h-6 w-6 text-indigo-500 mb-2" />
                  <p className="text-xs font-semibold text-[var(--dm-text)]">No tool runs yet</p>
                  <p className="text-[11px] text-[var(--dm-muted)] mt-1">
                    Compress, scan, convert, or resize a file to track results here.
                  </p>
                </div>
              ) : (
                <div className="space-y-2 overflow-y-auto max-h-56 pr-1">
                  {jobs.slice(0, 6).map((job) => {
                    const beforeBytes = Number(job.result_meta?.before_bytes || 0);
                    const afterBytes = Number(job.result_meta?.after_bytes || 0);
                    return (
                      <button
                        key={job.id}
                        type="button"
                        onClick={() => {
                          if (job.output_document_id) {
                            router.push(`/app/workspace/${job.output_document_id}`);
                          }
                        }}
                        className="w-full text-left p-2.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:bg-white dark:hover:bg-slate-800/80 hover:border-indigo-400 transition-colors flex items-center justify-between gap-2 text-xs"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          {job.status === "completed" ? (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                          ) : job.status === "failed" ? (
                            <XCircle className="h-4 w-4 text-rose-600 dark:text-rose-400 shrink-0" />
                          ) : (
                            <Clock className="h-4 w-4 text-indigo-600 dark:text-indigo-400 animate-pulse shrink-0" />
                          )}
                          <div className="min-w-0">
                            <p className="font-semibold capitalize truncate text-[var(--dm-text)]">
                              {job.job_type.replace("_", " ")}
                            </p>
                            <p className="text-[11px] text-[var(--dm-muted)] truncate">
                              {formatFriendlyActivity(job)}
                            </p>
                          </div>
                        </div>
                        {beforeBytes > 0 && afterBytes > 0 ? (
                          <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30 shrink-0">
                            {formatBytes(beforeBytes)} → {formatBytes(afterBytes)}
                          </span>
                        ) : (
                          <span
                            className={`font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full border shrink-0 ${
                              job.status === "completed"
                                ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-500/15 dark:text-emerald-300 dark:border-emerald-500/30"
                                : job.status === "failed"
                                  ? "bg-rose-50 text-rose-700 border-rose-200 dark:bg-rose-500/15 dark:text-rose-300 dark:border-rose-500/30"
                                  : "bg-indigo-50 text-indigo-700 border-indigo-200 dark:bg-indigo-500/15 dark:text-indigo-300 dark:border-indigo-500/30"
                            }`}
                          >
                            {job.status === "completed"
                              ? "Done"
                              : job.status === "failed"
                                ? "Needs retry"
                                : job.status}
                          </span>
                        )}
                      </button>
                    );
                  })}
                </div>
              )}
            </section>
          </div>
        </div>

        {/* 3-Click Quick Student Tools */}
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-[var(--dm-text)]">{t.app.quickTools}</h2>
            <span className="text-xs font-medium text-[var(--dm-muted)]">No signup required • Originals preserved</span>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
            {quickTools.map((tool) => {
              const Icon = tool.icon;
              return (
                <Link
                  key={tool.href}
                  href={tool.href}
                  className="group dm-card dm-card-interactive p-4 flex flex-col justify-between gap-3.5 hover:bg-gradient-to-b hover:from-white hover:to-indigo-50/40 dark:hover:to-indigo-950/20"
                >
                  <div className="flex items-start justify-between gap-2">
                    <span
                      className={`h-10 w-10 rounded-xl flex items-center justify-center ${tool.iconBg}`}
                    >
                      <Icon className="h-4.5 w-4.5" />
                    </span>
                    <span className={`text-[10px] font-mono font-semibold px-2.5 py-0.5 rounded-full border ${tool.tagCls}`}>
                      {tool.tag}
                    </span>
                  </div>
                  <div className="space-y-1">
                    <h3 className="text-sm font-semibold text-[var(--dm-text)] flex items-center justify-between">
                      <span>{tool.title}</span>
                      <ArrowUpRight className="h-4 w-4 text-[var(--dm-muted)] group-hover:text-indigo-600 dark:group-hover:text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                    </h3>
                    <p className="text-xs text-[var(--dm-muted)] leading-relaxed">{tool.desc}</p>
                  </div>
                </Link>
              );
            })}
          </div>
        </section>

        {/* AI Multi-Step Workflow Studio (Collapsible Progressive Disclosure) */}
        <section className="dm-card overflow-hidden transition-all border-[var(--dm-border)]">
          <button
            type="button"
            onClick={() => setShowAiStudio((prev) => !prev)}
            className="w-full px-5 py-3.5 flex items-center justify-between bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] transition-colors text-left"
          >
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-500 dark:text-indigo-400 flex items-center justify-center shrink-0">
                <Bot className="h-4 w-4" />
              </span>
              <div>
                <p className="text-sm font-semibold text-[var(--dm-text)] flex items-center gap-2">
                  <span>AI Agent Workflow Studio</span>
                  <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-500/15 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30">
                    Multi-Step
                  </span>
                </p>
                <p className="text-xs text-[var(--dm-muted)]">
                  Chained document tasks (e.g. compress &rarr; watermark &rarr; convert to Word)
                </p>
              </div>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-indigo-600 dark:text-indigo-400">
                {showAiStudio ? "Hide Studio" : "Open Studio"}
              </span>
              <ChevronDown
                className={`h-4 w-4 text-[var(--dm-muted)] transition-transform duration-200 ${
                  showAiStudio ? "rotate-180" : ""
                }`}
              />
            </div>
          </button>
          {showAiStudio && (
            <div className="border-t border-[var(--dm-border)] p-4 sm:p-5 bg-[var(--dm-bg)]">
              <AgentWorkflowCard docs={docs} />
            </div>
          )}
        </section>

        {/* Library + Filters + Grid/List */}
        <section className="space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="text-base font-bold text-[var(--dm-text)]">{t.app.recentDocs}</h2>
              <div className="inline-flex rounded-xl border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] p-1 text-xs shadow-2xs">
                {(
                  [
                    { id: "all", label: `All (${docs.length})` },
                    { id: "pdf", label: `PDF (${pdfDocs.length})` },
                    { id: "office", label: `Office (${officeDocs.length})` },
                    { id: "images", label: `Images (${imageDocs.length})` },
                    { id: "starred", label: "Starred" },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setFilterKind(tab.id)}
                    className={`px-3 py-1.5 rounded-lg font-semibold transition-all ${
                      filterKind === tab.id
                        ? "bg-indigo-600 text-white shadow-xs"
                        : "text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)]"
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="h-3.5 w-3.5 text-[var(--dm-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="search"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder={t.app.searchPlaceholder}
                  className="dm-input pl-8 pr-3 py-1.5 text-xs"
                />
              </div>

              <div className="inline-flex rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] p-0.5">
                <button
                  type="button"
                  onClick={() => setViewMode("grid")}
                  aria-label="Grid view"
                  className={`p-1.5 rounded-md ${viewMode === "grid" ? "bg-[var(--dm-subtle)] text-indigo-400" : "text-[var(--dm-muted)]"
                    }`}
                >
                  <LayoutGrid className="h-3.5 w-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode("list")}
                  aria-label="List view"
                  className={`p-1.5 rounded-md ${viewMode === "list" ? "bg-[var(--dm-subtle)] text-indigo-400" : "text-[var(--dm-muted)]"
                    }`}
                >
                  <ListIcon className="h-3.5 w-3.5" />
                </button>
              </div>

              {user && !isGuest && (
                <form onSubmit={handleCreateFolder} className="flex items-center gap-1.5">
                  <input
                    type="text"
                    value={newFolderName}
                    onChange={(e) => setNewFolderName(e.target.value)}
                    placeholder="New folder..."
                    className="dm-input w-32 px-2.5 py-1.5 text-xs"
                  />
                  <button
                    type="submit"
                    disabled={creatingFolder || !newFolderName.trim()}
                    className="p-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-elevated)] disabled:opacity-50"
                    title="Create folder"
                  >
                    <FolderPlus className="h-4 w-4" />
                  </button>
                </form>
              )}
            </div>
          </div>

          {foldersQuery.data && foldersQuery.data.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSelectedFolder(null)}
                className={`px-3 py-1 rounded-full text-xs border ${selectedFolder === null
                    ? "border-indigo-500 bg-indigo-500/15 text-indigo-400"
                    : "border-[var(--dm-border)] text-[var(--dm-muted)]"
                  }`}
              >
                All Folders
              </button>
              {foldersQuery.data.map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setSelectedFolder(f.id)}
                  className={`px-3 py-1 rounded-full text-xs border ${selectedFolder === f.id
                      ? "border-indigo-500 bg-indigo-500/15 text-indigo-400"
                      : "border-[var(--dm-border)] text-[var(--dm-muted)]"
                    }`}
                >
                  {f.name}
                </button>
              ))}
            </div>
          )}

          {docsQuery.isLoading ? (
            <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
              {[1, 2, 3].map((n) => (
                <div key={n} className="dm-card p-5 h-32 animate-pulse" />
              ))}
            </div>
          ) : docsQuery.isError ? (
            <div className="dm-card p-6 text-center text-sm text-red-400">
              Failed to load documents. Check that the API server is running and try again.
            </div>
          ) : filteredDocs.length === 0 ? (
            <div className="dm-card p-12 text-center space-y-2">
              <FileText className="h-8 w-8 text-[var(--dm-muted)] mx-auto" />
              <p className="text-sm font-medium">{t.app.emptyTitle}</p>
              <p className="text-xs text-[var(--dm-muted)]">{t.app.emptySubtitle}</p>
            </div>
          ) : (
            <div
              className={
                viewMode === "grid"
                  ? "grid sm:grid-cols-2 lg:grid-cols-3 gap-3.5"
                  : "space-y-2.5"
              }
            >
              {filteredDocs.map((doc, idx) => {
                const badge = getFileTypeBadge(doc.mime_type, doc.name);
                const expiry = formatRelativeExpiry(doc.expires_at);
                return (
                  <motion.div
                    key={doc.id}
                    initial={{ opacity: 0, y: 6 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.16, delay: Math.min(idx * 0.03, 0.25) }}
                    className={`dm-card dm-card-interactive p-4 ${viewMode === "list"
                        ? "flex flex-wrap items-center justify-between gap-3"
                        : "flex flex-col justify-between gap-3.5"
                      }`}
                  >
                    <div className="flex items-start justify-between gap-3 min-w-0 flex-1">
                      <div className="flex items-start gap-3 min-w-0">
                        <span className="h-9 w-9 rounded-xl flex items-center justify-center shrink-0 drop-shadow-sm">
                          <FileFormatIcon
                            mime={doc.mime_type}
                            filename={doc.name}
                            className="h-9 w-9"
                          />
                        </span>
                        <div className="min-w-0 flex-1">
                          {editingDocId === doc.id ? (
                            <div className="flex items-center gap-1">
                              <input
                                type="text"
                                value={editingDocName}
                                onChange={(e) => setEditingDocName(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") handleRenameDoc(doc.id);
                                  if (e.key === "Escape") setEditingDocId(null);
                                }}
                                autoFocus
                                className="dm-input px-2 py-1 text-xs w-full min-w-0"
                              />
                              <button
                                type="button"
                                onClick={() => handleRenameDoc(doc.id)}
                                className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded"
                                title="Save name"
                              >
                                <Check className="h-3.5 w-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => setEditingDocId(null)}
                                className="p-1 text-[var(--dm-muted)] hover:text-[var(--dm-text)] rounded"
                                title="Cancel"
                              >
                                <X className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-1.5 min-w-0">
                              <Link
                                href={`/app/workspace/${doc.id}`}
                                className="text-sm font-medium hover:text-indigo-500 dark:hover:text-indigo-300 truncate block"
                              >
                                {doc.name}
                              </Link>
                              <button
                                type="button"
                                onClick={() => {
                                  setEditingDocId(doc.id);
                                  setEditingDocName(doc.name);
                                }}
                                className="p-0.5 text-[var(--dm-muted)] hover:text-[var(--dm-text)] shrink-0"
                                title="Rename document"
                                aria-label="Rename document"
                              >
                                <Pencil className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5 text-[11px] font-mono">
                            <span className={`px-2 py-0.5 rounded-md font-semibold border ${badge.chip}`}>
                              {badge.label}
                            </span>
                            <span className="font-semibold text-[var(--dm-text)]">{formatBytes(doc.size_bytes)}</span>
                            <span className="text-[var(--dm-muted)]">•</span>
                            <span className="text-[var(--dm-muted)]">v{doc.current_version_no}</span>
                            {doc.page_count !== null && (
                              <>
                                <span className="text-[var(--dm-muted)]">•</span>
                                <span className="text-[var(--dm-muted)]">{doc.page_count}p</span>
                              </>
                            )}
                            {expiry && (
                              <>
                                <span className="text-[var(--dm-muted)]">•</span>
                                <span className="px-2 py-0.5 rounded bg-emerald-50 dark:bg-emerald-500/15 border border-emerald-200 dark:border-emerald-500/30 text-emerald-700 dark:text-emerald-300 font-medium">
                                  {expiry}
                                </span>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                      <button
                        type="button"
                        onClick={() => handleToggleFavorite(doc)}
                        aria-label="Toggle favorite"
                        className="p-1 text-[var(--dm-muted)] hover:text-amber-500 shrink-0"
                      >
                        <Star
                          className={`h-4.5 w-4.5 ${doc.is_favorite ? "fill-amber-400 text-amber-500" : ""}`}
                        />
                      </button>
                    </div>

                    <div
                      className={`flex items-center justify-between gap-3 text-xs ${viewMode === "grid" ? "pt-3 border-t border-[var(--dm-border)]" : ""
                        }`}
                    >
                      <button
                        type="button"
                        onClick={() => router.push(`/app/workspace/${doc.id}`)}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-50 dark:bg-indigo-500/15 text-indigo-700 dark:text-indigo-300 border border-indigo-200 dark:border-indigo-500/30 hover:bg-indigo-100 dark:hover:bg-indigo-500/25 font-semibold transition-colors"
                      >
                        <ExternalLink className="h-3.5 w-3.5" />
                        <span>Open Studio</span>
                      </button>

                      <div className="flex items-center gap-2">
                        {!isGuest && foldersQuery.data && foldersQuery.data.length > 0 && (
                          <select
                            aria-label="Move to folder"
                            value={doc.folder_id ?? ""}
                            onChange={(e) => handleMoveDocFolder(doc.id, e.target.value || null)}
                            className="dm-input px-2 py-1 text-[11px] max-w-[100px] font-medium"
                          >
                            <option value="">Root</option>
                            {foldersQuery.data.map((f) => (
                              <option key={f.id} value={f.id}>
                                {f.name}
                              </option>
                            ))}
                          </select>
                        )}
                        {doc.mime_type === "application/pdf" && (
                          <Link
                            href="/app/tools/compress"
                            className="px-2.5 py-1 rounded-lg border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-500 text-[var(--dm-muted)] hover:text-[var(--dm-text)] font-semibold transition-colors"
                          >
                            Compress
                          </Link>
                        )}
                        <button
                          type="button"
                          onClick={() => handleDownload(doc)}
                          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-500 text-[var(--dm-muted)] hover:text-[var(--dm-text)] font-semibold transition-colors"
                        >
                          <Download className="h-3.5 w-3.5" />
                          <span>Export</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            if (!confirmBeforeDelete && !isGuest) {
                              handleDeleteDoc(doc.id, false);
                              return;
                            }
                            setPendingDeleteDoc({
                              id: doc.id,
                              name: doc.name,
                              permanent: isGuest,
                            });
                          }}
                          className="p-1 rounded text-red-400 hover:bg-red-500/10 transition-colors"
                          title={isGuest ? "Delete now" : "Move to Trash"}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </div>
          )}
        </section>
      </div>

      <ConfirmDialog
        open={pendingDeleteDoc !== null}
        title={
          pendingDeleteDoc?.permanent
            ? `Are you sure you want to permanently delete "${pendingDeleteDoc.name}"?`
            : `Are you sure you want to move "${pendingDeleteDoc?.name ?? ""}" to Trash?`
        }
        description={
          pendingDeleteDoc?.permanent
            ? "Guest files are permanently deleted immediately and cannot be recovered."
            : "The file will be moved to Trash where you can restore it for 30 days."
        }
        confirmLabel={pendingDeleteDoc?.permanent ? "Yes, Delete Permanently" : "Yes, Move to Trash"}
        variant={pendingDeleteDoc?.permanent ? "danger" : "warning"}
        loading={deletingDoc}
        onCancel={() => setPendingDeleteDoc(null)}
        onConfirm={async () => {
          if (!pendingDeleteDoc) return;
          setDeletingDoc(true);
          try {
            await handleDeleteDoc(pendingDeleteDoc.id, pendingDeleteDoc.permanent);
            setPendingDeleteDoc(null);
          } finally {
            setDeletingDoc(false);
          }
        }}
      />
    </AppShell>
  );
}
