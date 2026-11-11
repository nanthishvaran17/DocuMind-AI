"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Loader2, Scissors } from "lucide-react";
import type { DocumentItem, JobRecord } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { PrivacyBadge } from "@/components/PrivacyBadge";
import { useToast } from "@/components/providers";
import { apiRequest, pollOrStreamJob } from "@/lib/api";

export default function MergeSplitPage() {
  const { pushToast } = useToast();
  const queryClient = useQueryClient();
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [splitDocId, setSplitDocId] = useState("");
  const [everyN, setEveryN] = useState(1);
  const [running, setRunning] = useState(false);
  const [outputDocId, setOutputDocId] = useState<string | null>(null);

  const docsQuery = useQuery({
    queryKey: ["pdf-docs-list"],
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?limit=50", { ensureGuest: true });
      return (res.data ?? []).filter((d) => d.mime_type === "application/pdf");
    },
  });

  const pdfDocs = docsQuery.data ?? [];

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const handleMerge = async () => {
    if (selectedIds.length < 2) return;
    setRunning(true);
    try {
      const res = await apiRequest<JobRecord>("/tools/pdf/merge", {
        method: "POST",
        body: JSON.stringify({
          items: selectedIds.map((id) => ({ document_id: id })),
          output_name: "merged_study_pack.pdf",
        }),
      });
      const done = await pollOrStreamJob(res.data!.id, () => undefined);
      if (done.status === "completed" && done.output_document_id) {
        setOutputDocId(done.output_document_id);
        await queryClient.invalidateQueries({ queryKey: ["pdf-docs-list"] });
        pushToast({ title: "PDFs merged successfully", variant: "success" });
      }
    } catch (err) {
      pushToast({
        title: "Merge failed",
        description: err instanceof Error ? err.message : "Error merging PDFs.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  };

  const handleSplit = async () => {
    const target = splitDocId || pdfDocs[0]?.id;
    if (!target) return;
    setRunning(true);
    try {
      const res = await apiRequest<JobRecord>("/tools/pdf/split", {
        method: "POST",
        body: JSON.stringify({
          document_id: target,
          mode: "every_n",
          every_n: everyN,
        }),
      });
      const done = await pollOrStreamJob(res.data!.id, () => undefined);
      if (done.status === "completed" && done.output_document_id) {
        setOutputDocId(done.output_document_id);
        await queryClient.invalidateQueries({ queryKey: ["pdf-docs-list"] });
        pushToast({ title: "PDF split complete", variant: "success" });
      }
    } catch (err) {
      pushToast({
        title: "Split failed",
        description: err instanceof Error ? err.message : "Error splitting PDF.",
        variant: "error",
      });
    } finally {
      setRunning(false);
    }
  };

  return (
    <AppShell>
      <div className="max-w-4xl mx-auto space-y-6">
        <PrivacyBadge />
        <div>
          <h1 className="text-2xl font-semibold flex items-center gap-2">
            <Layers className="h-5 w-5 text-emerald-400" />
            <span>Merge & Split PDFs</span>
          </h1>
          <p className="text-sm text-[var(--dm-muted)] mt-1">
            Combine multiple PDFs from your library or split one PDF into separate parts.
          </p>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="dm-card p-5 space-y-4">
            <h2 className="text-base font-semibold">Merge PDFs (select 2+)</h2>
            {pdfDocs.length === 0 ? (
              <p className="text-xs text-[var(--dm-muted)]">
                Upload at least 2 PDFs on the <Link href="/app" className="text-indigo-400 underline">Dashboard</Link> first.
              </p>
            ) : (
              <div className="space-y-2 max-h-60 overflow-y-auto">
                {pdfDocs.map((d) => (
                  <label
                    key={d.id}
                    className="flex items-center justify-between gap-2 dm-elevated p-2.5 text-xs cursor-pointer"
                  >
                    <span className="flex items-center gap-2 truncate">
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(d.id)}
                        onChange={() => toggleSelect(d.id)}
                      />
                      <span className="truncate">{d.name}</span>
                    </span>
                    <span className="font-mono text-[var(--dm-muted)]">{formatBytes(d.size_bytes)}</span>
                  </label>
                ))}
              </div>
            )}
            <button
              type="button"
              disabled={selectedIds.length < 2 || running}
              onClick={handleMerge}
              className="dm-primary-btn w-full py-2 text-xs font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Merge Selected ({selectedIds.length})</span>
            </button>
          </div>

          <div className="dm-card p-5 space-y-4">
            <h2 className="text-base font-semibold flex items-center gap-2">
              <Scissors className="h-4 w-4 text-indigo-400" />
              <span>Split PDF</span>
            </h2>
            <select
              value={splitDocId || pdfDocs[0]?.id || ""}
              onChange={(e) => setSplitDocId(e.target.value)}
              className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-xs"
            >
              {pdfDocs.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name} ({d.page_count ?? "?"} pages)
                </option>
              ))}
            </select>
            <label className="block space-y-1 text-xs">
              <span className="text-[var(--dm-muted)]">Split every N pages</span>
              <input
                type="number"
                min={1}
                max={200}
                value={everyN}
                onChange={(e) => setEveryN(Number(e.target.value) || 1)}
                className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 font-mono"
              />
            </label>
            <button
              type="button"
              disabled={pdfDocs.length === 0 || running}
              onClick={handleSplit}
              className="dm-primary-btn w-full py-2 text-xs font-medium disabled:opacity-50"
            >
              Split PDF into Parts (ZIP)
            </button>
          </div>
        </div>

        {outputDocId && (
          <div className="dm-card p-4 flex items-center justify-between text-xs">
            <span>Output saved in your library.</span>
            <Link href={`/app/workspace/${outputDocId}`} className="text-indigo-400 font-medium underline">
              Open Output Document
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
