"use client";

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
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
  const [deleting, setDeleting] = useState(false);

  const trashQuery = useQuery({
    queryKey: ["documents-trash"],
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?trashed=true", { ensureGuest: true });
      return res.data ?? [];
    },
  });

  const restore = async (id: string) => {
    await apiRequest(`/documents/${id}/restore`, { method: "POST" });
    await queryClient.invalidateQueries({ queryKey: ["documents-trash"] });
    await queryClient.invalidateQueries({ queryKey: ["documents"] });
    pushToast({ title: "Document restored", variant: "success" });
  };

  const hardDelete = async (id: string) => {
    await apiRequest(`/documents/${id}?permanent=true`, { method: "DELETE" });
    await queryClient.invalidateQueries({ queryKey: ["documents-trash"] });
    pushToast({ title: "Permanently deleted", variant: "info" });
  };

  const items = trashQuery.data ?? [];

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-rose-500/15 border border-rose-500/25 flex items-center justify-center text-rose-400 shrink-0">
            <Trash2 className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Trash (30-Day Recovery)</h1>
            <p className="text-sm text-[var(--dm-muted)] mt-0.5">
              Deleted files can be restored within 30 days before permanent cleanup.
            </p>
          </div>
        </div>

        {trashQuery.isLoading ? (
          <div className="dm-card p-6 text-sm text-[var(--dm-muted)]">Loading trash...</div>
        ) : items.length === 0 ? (
          <div className="dm-card p-12 text-center space-y-2">
            <Trash2 className="h-7 w-7 text-[var(--dm-muted)] mx-auto" />
            <p className="text-sm font-medium">Trash is empty</p>
            <p className="text-xs text-[var(--dm-muted)]">
              Soft-deleted documents will appear here for 30 days.
            </p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((doc) => (
              <div
                key={doc.id}
                className="dm-card p-4 flex flex-wrap items-center justify-between gap-4 hover:border-[var(--dm-border-strong)] transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold truncate">{doc.name}</p>
                  <p className="text-xs font-mono text-[var(--dm-muted)] mt-0.5">
                    {formatBytes(doc.size_bytes)}
                  </p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => restore(doc.id)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-emerald-500/40 font-medium transition-colors"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setPendingDelete({ id: doc.id, name: doc.name })}
                    className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-red-500/30 bg-red-500/10 text-red-400 hover:bg-red-500/15 font-medium transition-colors"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    <span>Delete forever</span>
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <ConfirmDialog
        open={pendingDelete !== null}
        title={`Are you sure you want to permanently delete "${pendingDelete?.name ?? ""}"?`}
        description="This file will be permanently removed from Trash and storage. This action cannot be undone."
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
    </AppShell>
  );
}
