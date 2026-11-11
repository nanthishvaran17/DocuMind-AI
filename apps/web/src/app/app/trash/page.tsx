"use client";

import Link from "next/link";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  Clock,
  FileText,
  FolderOpen,
  Lock,
  PlusCircle,
  RotateCcw,
  ShieldCheck,
  Trash2,
} from "lucide-react";
import type { DocumentItem } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/providers";
import { apiRequest } from "@/lib/api";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [emptyTrashConfirm, setEmptyTrashConfirm] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [creatingDemo, setCreatingDemo] = useState(false);

  const trashQuery = useQuery({
    queryKey: ["documents-trash"],
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?trashed=true", { ensureGuest: true });
      return res.data ?? [];
    },
  });

  const restoreMutation = useMutation({
    mutationFn: async (id: string) => {
      await apiRequest(`/documents/${id}/restore`, { method: "POST" });
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["documents-trash"] });
      queryClient.invalidateQueries({ queryKey: ["documents"] });
      pushToast({ title: "Document restored to workspace", variant: "success" });
    },
    onError: () => {
      pushToast({ title: "Failed to restore document", variant: "error" });
    },
  });

  const hardDelete = async (id: string) => {
    await apiRequest(`/documents/${id}?permanent=true`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: ["documents-trash"] });
    pushToast({ title: "Permanently deleted", variant: "info" });
  };

  const emptyAllTrash = async () => {
    setDeleting(true);
    try {
      const docs = trashQuery.data ?? [];
      for (const d of docs) {
        await apiRequest(`/documents/${d.id}?permanent=true`, { method: "DELETE" });
      }
      await queryClient.invalidateQueries({ queryKey: ["documents-trash"] });
      pushToast({ title: "Trash completely emptied", variant: "success" });
      setEmptyTrashConfirm(false);
    } catch {
      pushToast({ title: "Could not empty all items", variant: "error" });
    } finally {
      setDeleting(false);
    }
  };

  const handleCreateDemoDoc = async () => {
    setCreatingDemo(true);
    try {
      // Create a small sample file
      const sampleContent = "%PDF-1.4\n1 0 obj\n<< /Type /Catalog /Pages 2 0 R >>\nendobj\n2 0 obj\n<< /Type /Pages /Kids [3 0 R] /Count 1 >>\nendobj\n3 0 obj\n<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] >>\nendobj\nxref\n0 4\n0000000000 65535 f \n0000000010 00000 n \n0000000060 00000 n \n0000000117 00000 n \ntrailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n193\n%%EOF";
      const blob = new Blob([sampleContent], { type: "application/pdf" });
      const formData = new FormData();
      formData.append("file", blob, `Demo_Study_Notes_${new Date().toLocaleTimeString().replace(/:/g, "-")}.pdf`);

      const uploadRes = await apiRequest<DocumentItem>("/documents", {
        method: "POST",
        body: formData,
        ensureGuest: true,
      });

      if (uploadRes.data?.id) {
        // Soft delete it immediately to move to trash
        await apiRequest(`/documents/${uploadRes.data.id}`, { method: "DELETE" });
        await queryClient.invalidateQueries({ queryKey: ["documents-trash"] });
        pushToast({
          title: "Demo document added to Trash",
          description: "You can now test 'Restore' or 'Delete forever'",
          variant: "success",
        });
      }
    } catch {
      pushToast({
        title: "Could not create demo file",
        description: "Please try uploading directly via workspace",
        variant: "error",
      });
    } finally {
      setCreatingDemo(false);
    }
  };

  const items = trashQuery.data ?? [];
  const totalTrashBytes = items.reduce((sum, item) => sum + (item.size_bytes || 0), 0);

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Navigation Breadcrumb / Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2 border-b border-[var(--dm-border)]">
          <div className="flex items-center gap-3">
            <Link
              href="/app"
              className="p-2 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] text-[var(--dm-muted)] hover:text-[var(--dm-text)] transition-colors shadow-xs"
              title="Return to Documents"
            >
              <ArrowLeft className="h-4 w-4" />
            </Link>
            <div>
              <div className="flex items-center gap-2">
                <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-[var(--dm-text)]">
                  Trash &amp; Recovery
                </h1>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700">
                  30-Day Window
                </span>
              </div>
              <p className="text-xs sm:text-sm text-[var(--dm-muted)] mt-0.5">
                Protected quarantine. Files can be restored to your workspace anytime before permanent purge.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {items.length > 0 && (
              <button
                type="button"
                onClick={() => setEmptyTrashConfirm(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 text-xs font-medium hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              >
                <Trash2 className="h-3.5 w-3.5" />
                <span>Empty Trash</span>
              </button>
            )}
            <Link
              href="/app"
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] text-xs font-medium text-[var(--dm-text)] transition-colors shadow-xs"
            >
              <FolderOpen className="h-3.5 w-3.5 text-slate-500" />
              <span>All Documents</span>
            </Link>
          </div>
        </div>

        {/* Content State */}
        {trashQuery.isLoading ? (
          <div className="dm-card p-12 text-center text-sm text-[var(--dm-muted)] space-y-3">
            <div className="h-8 w-8 rounded-full border-2 border-slate-300 dark:border-slate-700 border-t-slate-800 dark:border-t-slate-200 animate-spin mx-auto" />
            <p>Scanning quarantine storage...</p>
          </div>
        ) : items.length === 0 ? (
          <div className="space-y-6">
            {/* Rich Empty State Card */}
            <div className="dm-card p-8 sm:p-12 text-center space-y-5">
              <div className="h-14 w-14 rounded-2xl bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-500 dark:text-slate-400 mx-auto shadow-xs">
                <Trash2 className="h-6 w-6" />
              </div>

              <div className="max-w-md mx-auto space-y-2">
                <h2 className="text-lg font-semibold text-[var(--dm-text)]">
                  Trash is completely empty
                </h2>
                <p className="text-xs sm:text-sm text-[var(--dm-muted)] leading-relaxed">
                  No documents are currently soft-deleted. When you remove files from your workspace, they stay safely in this recovery vault for 30 days before permanent deletion.
                </p>
              </div>

              <div className="flex flex-wrap items-center justify-center gap-3 pt-2">
                <Link
                  href="/app"
                  className="dm-primary-btn inline-flex items-center gap-2 px-5 py-2.5 text-xs sm:text-sm font-medium rounded-lg"
                >
                  <FolderOpen className="h-4 w-4" />
                  <span>Go to Workspace</span>
                  <ArrowRight className="h-4 w-4" />
                </Link>

                <button
                  type="button"
                  disabled={creatingDemo}
                  onClick={handleCreateDemoDoc}
                  className="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-medium rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:bg-[var(--dm-subtle)] text-[var(--dm-text)] transition-colors shadow-xs disabled:opacity-50"
                >
                  <PlusCircle className="h-4 w-4 text-slate-500" />
                  <span>{creatingDemo ? "Creating..." : "Add Demo File to Test Trash"}</span>
                </button>
              </div>
            </div>

            {/* Architecture / Guarantee Bento Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="dm-card p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--dm-text)]">
                  <Clock className="h-4 w-4 text-blue-500" />
                  <span>30-Day Rollback</span>
                </div>
                <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
                  Accidentally deleted a college report or photo? Every version, checksum, and OCR index stays restorable with 1 click.
                </p>
              </div>

              <div className="dm-card p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--dm-text)]">
                  <Lock className="h-4 w-4 text-emerald-500" />
                  <span>Isolated Air-Gap</span>
                </div>
                <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
                  Quarantined files are automatically excluded from AI chat answers, vector embeddings, and search results.
                </p>
              </div>

              <div className="dm-card p-5 space-y-2.5">
                <div className="flex items-center gap-2 text-xs font-semibold text-[var(--dm-text)]">
                  <ShieldCheck className="h-4 w-4 text-indigo-500" />
                  <span>Crypto-Wipe on Clean</span>
                </div>
                <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
                  Clicking &quot;Delete forever&quot; executes an irreversible storage wipe and unlinks all encryption keys immediately.
                </p>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4">
            {/* Trash status banner */}
            <div className="flex items-center justify-between px-4 py-2.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-subtle)] text-xs">
              <span className="text-[var(--dm-muted)]">
                <strong className="text-[var(--dm-text)] font-semibold">{items.length}</strong> items in quarantine ({formatBytes(totalTrashBytes)})
              </span>
              <span className="text-[var(--dm-muted)] flex items-center gap-1.5">
                <Clock className="h-3.5 w-3.5" />
                <span>Auto-shreds after 30 days</span>
              </span>
            </div>

            {/* List of Trashed Items */}
            <div className="space-y-2.5">
              {items.map((doc) => (
                <div
                  key={doc.id}
                  className="dm-card p-4 flex flex-wrap items-center justify-between gap-4 hover:border-[var(--dm-border-strong)] transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="h-9 w-9 rounded-lg bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 flex items-center justify-center text-slate-600 dark:text-slate-300 shrink-0">
                      <FileText className="h-4 w-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-sm font-semibold truncate text-[var(--dm-text)]">{doc.name}</p>
                      <div className="flex items-center gap-2 text-xs font-mono text-[var(--dm-muted)] mt-0.5">
                        <span>{formatBytes(doc.size_bytes)}</span>
                        {doc.page_count && (
                          <>
                            <span>&bull;</span>
                            <span>{doc.page_count} pages</span>
                          </>
                        )}
                        <span>&bull;</span>
                        <span className="text-amber-600 dark:text-amber-400">In Trash</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 text-xs">
                    <button
                      type="button"
                      disabled={restoreMutation.isPending}
                      onClick={() => restoreMutation.mutate(doc.id)}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-emerald-300/60 dark:border-emerald-800/60 bg-emerald-50 dark:bg-emerald-950/20 text-emerald-700 dark:text-emerald-300 hover:bg-emerald-100 dark:hover:bg-emerald-900/30 font-medium transition-colors"
                    >
                      <RotateCcw className="h-3.5 w-3.5" />
                      <span>Restore</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setPendingDelete({ id: doc.id, name: doc.name })}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-red-200 dark:border-red-900/50 bg-red-50 dark:bg-red-950/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 font-medium transition-colors"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      <span>Delete forever</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Confirm Permanent Delete Modal */}
      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Permanently delete "${pendingDelete?.name ?? ""}"?`}
        description="This document will be permanently shredded from storage. All versions and OCR indices will be wiped immediately. This action cannot be undone."
        confirmLabel="Yes, Delete Forever"
        loading={deleting}
        onCancel={() => setPendingDelete(null)}
        onConfirm={async () => {
          if (!pendingDelete) return;
          setDeleting(true);
          try {
            await hardDelete(pendingDelete.id);
            setPendingDelete(null);
          } finally {
            setDeleting(false);
          }
        }}
      />

      {/* Confirm Empty All Trash Modal */}
      <ConfirmDialog
        open={emptyTrashConfirm}
        title="Empty all items in Trash?"
        description={`This will permanently wipe all ${items.length} quarantined documents. This action cannot be undone.`}
        confirmLabel="Empty All Trash"
        loading={deleting}
        onCancel={() => setEmptyTrashConfirm(false)}
        onConfirm={emptyAllTrash}
      />
    </AppShell>
  );
}
