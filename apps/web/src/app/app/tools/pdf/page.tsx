"use client";

import Link from "next/link";
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Loader2, Scissors } from "lucide-react";
import type { DocumentItem, JobRecord } from "@documind/types";
import { formatBytes } from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
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
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Workspace", href: "/app" },
            { label: "Merge & Split PDFs" },
          ]}
        />
        <PrivacyBadge />
        <div className="flex items-start gap-3.5">
          <div className="h-11 w-11 rounded-2xl bg-emerald-500/15 border border-emerald-500/25 flex items-center justify-center text-emerald-500 dark:text-emerald-400 shrink-0">
            <Layers className="h-5 w-5" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold">Merge &amp; Split PDFs</h1>
            <p className="text-sm text-[var(--dm-muted)] mt-0.5">
              Combine multiple PDFs from your library or split one PDF into separate parts non-destructively.
            </p>
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-4">
          <div className="dm-card p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-base font-semibold">Merge PDFs</h2>
                <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-[var(--dm-subtle)] border border-[var(--dm-border)] text-[var(--dm-muted)]">
                  Select 2+
                </span>
              </div>
              {pdfDocs.length === 0 ? (
                <p className="text-xs text-[var(--dm-muted)]">
                  Upload at least 2 PDFs on the{" "}
                  <Link href="/app" className="text-indigo-400 underline">
                    Dashboard
                  </Link>{" "}
                  first.
                </p>
              ) : (
                <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                  {pdfDocs.map((d) => {
                    const checked = selectedIds.includes(d.id);
                    return (
                      <label
                        key={d.id}
                        className={`flex items-center justify-between gap-2 p-3 rounded-xl border text-xs cursor-pointer transition-colors ${
                          checked
                            ? "border-indigo-600 bg-indigo-50 text-indigo-950 dark:bg-indigo-500/20 dark:text-white dark:border-indigo-400 ring-2 ring-indigo-500/20 shadow-2xs font-semibold"
                            : "border-[var(--dm-border-strong)] bg-[var(--dm-surface)] hover:border-indigo-400"
                        }`}
                      >
                        <span className="flex items-center gap-2.5 truncate">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={() => toggleSelect(d.id)}
                            className="accent-indigo-500"
                          />
                          <span className="truncate font-bold text-[var(--dm-text)]">{d.name}</span>
                        </span>
                        <span className="font-mono text-[var(--dm-muted)] shrink-0">
                          {formatBytes(d.size_bytes)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            </div>
            <button
              type="button"
              disabled={selectedIds.length < 2 || running}
              onClick={handleMerge}
              className="dm-primary-btn w-full py-2.5 text-xs font-semibold inline-flex items-center justify-center gap-2 disabled:opacity-50"
            >
              {running && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              <span>Merge Selected ({selectedIds.length})</span>
            </button>
          </div>

          <div className="dm-card p-5 space-y-4 flex flex-col justify-between">
            <div className="space-y-3">
              <h2 className="text-base font-semibold flex items-center gap-2">
                <Scissors className="h-4 w-4 text-indigo-400" />
                <span>Split PDF</span>
              </h2>
              <select
                value={splitDocId || pdfDocs[0]?.id || ""}
                onChange={(e) => setSplitDocId(e.target.value)}
                className="dm-input w-full px-3 py-2 text-xs"
              >
                {pdfDocs.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name} ({d.page_count ?? "?"} pages)
                  </option>
                ))}
              </select>
              <label className="block space-y-1.5 text-xs">
                <span className="text-[var(--dm-muted)] font-medium">Split every N pages</span>
                <input
                  type="number"
                  min={1}
                  max={200}
                  value={everyN}
                  onChange={(e) => setEveryN(Number(e.target.value) || 1)}
                  className="dm-input w-full px-3 py-2 font-mono"
                />
              </label>
            </div>
            <button
              type="button"
              disabled={pdfDocs.length === 0 || running}
              onClick={handleSplit}
              className="dm-primary-btn w-full py-2.5 text-xs font-medium disabled:opacity-50"
            >
              Split PDF into Parts (ZIP)
            </button>
          </div>
        </div>

        {outputDocId && (
          <div className="dm-elevated p-4 flex items-center justify-between text-xs">
            <span className="font-medium">Output saved safely in your library.</span>
            <Link
              href={`/app/workspace/${outputDocId}`}
              className="dm-primary-btn px-3.5 py-1.5 font-medium"
            >
              Open Output in Studio
            </Link>
          </div>
        )}
      </div>
    </AppShell>
  );
}
