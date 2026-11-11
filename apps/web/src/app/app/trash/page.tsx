"use client";

import { useQuery, useQueryClient } from "@tanstack/react-query";
import { RotateCcw, Trash2 } from "lucide-react";
import type { DocumentItem } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/providers";
import { apiRequest } from "@/lib/api";

export default function TrashPage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();

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
      <div className="max-w-4xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-semibold">Trash (30-Day Recovery)</h1>
          <p className="text-sm text-[var(--dm-muted)] mt-1">
            Deleted files can be restored within 30 days before permanent cleanup.
          </p>
        </div>

        {trashQuery.isLoading ? (
          <div className="dm-card p-6 text-sm text-[var(--dm-muted)]">Loading trash...</div>
        ) : items.length === 0 ? (
          <div className="dm-card p-10 text-center text-sm text-[var(--dm-muted)]">
            Trash is empty.
          </div>
        ) : (
          <div className="space-y-2.5">
            {items.map((doc) => (
              <div key={doc.id} className="dm-card p-4 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{doc.name}</p>
                  <p className="text-xs font-mono text-[var(--dm-muted)]">{formatBytes(doc.size_bytes)}</p>
                </div>
                <div className="flex items-center gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => restore(doc.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-elevated)]"
                  >
                    <RotateCcw className="h-3.5 w-3.5 text-emerald-400" />
                    <span>Restore</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => hardDelete(doc.id)}
                    className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg border border-red-500/30 text-red-400 hover:bg-red-500/10"
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
    </AppShell>
  );
}
