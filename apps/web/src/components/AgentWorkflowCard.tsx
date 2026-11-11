"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { motion } from "framer-motion";
import {
  ArrowRight,
  Bot,
  CheckCircle2,
  ChevronRight,
  Clock,
  ExternalLink,
  Loader2,
  Play,
  SkipForward,
  StepForward,
  Terminal,
  XCircle,
} from "lucide-react";
import type { AgentCommandPlan, AgentPlanStep, DocumentItem } from "@documind/types";
import { API_BASE, apiRequest, ensureAuthSession, pollOrStreamJob } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useToast } from "@/components/providers";
import { usePreferencesStore } from "@/stores/preferences-store";

interface AgentWorkflowCardProps {
  docs: DocumentItem[];
  initialPlan?: AgentCommandPlan | null;
  onRunUpdated?: (plan: AgentCommandPlan) => void;
}

const WORKFLOW_CHIPS = [
  "Compress to 200 KB and add page numbers",
  "Remove page 1, watermark CONFIDENTIAL, add page numbers, and compress to 200 KB",
  "Convert to docx and summarize key points",
  "Convert to md",
  "Summarize this document",
];

function stepBadgeClass(status?: string) {
  switch (status) {
    case "completed":
      return "bg-emerald-500/15 text-emerald-500 border-emerald-500/30";
    case "running":
      return "bg-indigo-500/15 text-indigo-400 border-indigo-500/30";
    case "skipped":
    case "rejected":
      return "bg-slate-500/15 text-[var(--dm-muted)] border-[var(--dm-border)]";
    case "failed":
      return "bg-red-500/15 text-red-400 border-red-500/30";
    default:
      return "bg-amber-500/15 text-amber-500 border-amber-500/30";
  }
}

export function AgentWorkflowCard({
  docs,
  initialPlan = null,
  onRunUpdated,
}: AgentWorkflowCardProps) {
  const { t } = useT();
  const { pushToast } = useToast();
  const queryClient = useQueryClient();

  const [commandText, setCommandText] = useState("");
  const [selectedDocId, setSelectedDocId] = useState<string>("");
  const [extraDocIds, setExtraDocIds] = useState<string[]>([]);
  const [plan, setPlan] = useState<AgentCommandPlan | null>(initialPlan);
  const [planning, setPlanning] = useState(false);
  const [approving, setApproving] = useState(false);
  const [stepApprovals, setStepApprovals] = useState<Record<number, boolean>>({});
  const [stepOverrides, setStepOverrides] = useState<Record<number, Record<string, unknown>>>({});
  const defaultShowLog = usePreferencesStore((s) => s.agent_show_execution_log);
  const [showLog, setShowLog] = useState(defaultShowLog);

  useEffect(() => {
    if (initialPlan) {
      setPlan(initialPlan);
      const initApprovals: Record<number, boolean> = {};
      for (const s of initialPlan.steps) {
        initApprovals[s.step_no] = s.approval_status !== "skipped" && s.approval_status !== "rejected";
      }
      setStepApprovals(initApprovals);
    }
  }, [initialPlan]);

  useEffect(() => {
    if (!selectedDocId && docs.length > 0) {
      const preferred = docs.find((d) => d.mime_type === "application/pdf") || docs[0];
      setSelectedDocId(preferred.id);
    }
  }, [docs, selectedDocId]);

  // Live SSE inspection when a run is executing
  const activeRunId = plan?.run_id;
  const activeRunStatus = plan?.status;

  useEffect(() => {
    if (!activeRunId || activeRunStatus !== "running") return;
    let cancelled = false;
    const runId = activeRunId;

    async function watchRun() {
      try {
        const token = await ensureAuthSession();
        const res = await fetch(`${API_BASE}/ai/agent/runs/${runId}/events`, {
          headers: { Authorization: `Bearer ${token}` },
          credentials: "include",
        });
        if (!res.ok || !res.body) return;
        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buf = "";
        while (!cancelled) {
          const { done, value } = await reader.read();
          if (done) break;
          buf += decoder.decode(value, { stream: true });
          const events = buf.split("\n\n");
          buf = events.pop() || "";
          for (const chunk of events) {
            const line = chunk.split("\n").find((l) => l.startsWith("data: "));
            if (!line) continue;
            const ev = JSON.parse(line.slice(6)) as Partial<AgentCommandPlan>;
            if (cancelled) return;
            setPlan((prev) => {
              if (!prev) return prev;
              const next: AgentCommandPlan = {
                ...prev,
                status: ev.status ?? prev.status,
                current_step_no: ev.current_step_no ?? prev.current_step_no,
                summary: ev.summary ?? prev.summary,
                steps: ev.steps ?? prev.steps,
                execution_log: ev.execution_log ?? prev.execution_log,
              };
              onRunUpdated?.(next);
              return next;
            });
            if (
              ev.status === "completed" ||
              ev.status === "failed" ||
              ev.status === "cancelled" ||
              ev.status === "awaiting_approval"
            ) {
              await queryClient.invalidateQueries({ queryKey: ["documents"] });
              await queryClient.invalidateQueries({ queryKey: ["dashboard-jobs"] });
              await queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
              if (ev.status === "completed") {
                pushToast({
                  title: "Workflow completed",
                  description: ev.summary || "All approved steps finished.",
                  variant: "success",
                });
              }
            }
          }
        }
      } catch {
        // fallback handled by polling if needed
      }
    }

    watchRun();
    return () => {
      cancelled = true;
    };
  }, [activeRunId, activeRunStatus, queryClient, pushToast, onRunUpdated]);

  const handlePlan = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!commandText.trim()) return;
    setPlanning(true);
    setPlan(null);
    setStepOverrides({});
    try {
      const targetIds = [selectedDocId, ...extraDocIds].filter(Boolean);
      const res = await apiRequest<AgentCommandPlan>("/ai/agent/command", {
        method: "POST",
        ensureGuest: true,
        body: JSON.stringify({
          command: commandText.trim(),
          document_id: targetIds[0] || undefined,
          document_ids: targetIds.length > 1 ? targetIds : undefined,
        }),
      });
      if (res.data) {
        setPlan(res.data);
        const initApprovals: Record<number, boolean> = {};
        for (const s of res.data.steps) {
          initApprovals[s.step_no] = true;
        }
        setStepApprovals(initApprovals);
        onRunUpdated?.(res.data);
      }
    } catch (err) {
      pushToast({
        title: "Workflow planner failed",
        description: err instanceof Error ? err.message : "Upload or select a document first.",
        variant: "error",
      });
    } finally {
      setPlanning(false);
    }
  };

  const handleApprove = async (approve: boolean, mode: "all" | "next_step" = "all") => {
    if (!plan) return;
    setApproving(true);
    try {
      const res = await apiRequest<AgentCommandPlan>(`/ai/agent/runs/${plan.run_id}/approve`, {
        method: "POST",
        body: JSON.stringify({
          approve,
          mode,
          step_approvals: approve ? stepApprovals : undefined,
          step_overrides: approve && Object.keys(stepOverrides).length > 0 ? stepOverrides : undefined,
        }),
      });
      if (!approve) {
        setPlan(null);
        pushToast({ title: "Workflow cancelled", variant: "info" });
        return;
      }
      if (res.data) {
        setPlan(res.data);
        onRunUpdated?.(res.data);
        // Also wait on single job if needed and refresh run details
        if (res.data.job_id && res.data.steps.length === 1) {
          await pollOrStreamJob(res.data.job_id, () => undefined);
          const refreshed = await apiRequest<AgentCommandPlan>(`/ai/agent/runs/${plan.run_id}`);
          if (refreshed.data) {
            setPlan(refreshed.data);
            onRunUpdated?.(refreshed.data);
          }
          await queryClient.invalidateQueries({ queryKey: ["documents"] });
          await queryClient.invalidateQueries({ queryKey: ["dashboard-jobs"] });
          await queryClient.invalidateQueries({ queryKey: ["agent-runs"] });
        }
      }
    } catch (err) {
      pushToast({
        title: "Approval failed",
        description: err instanceof Error ? err.message : "Could not execute workflow.",
        variant: "error",
      });
    } finally {
      setApproving(false);
    }
  };

  const toggleExtraDoc = (id: string) => {
    setExtraDocIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  const updateOverride = (stepNo: number, key: string, value: unknown) => {
    setStepOverrides((prev) => ({
      ...prev,
      [stepNo]: { ...(prev[stepNo] || {}), [key]: value },
    }));
  };

  const renderParamEditor = (step: AgentPlanStep) => {
    if (step.execution_status && step.execution_status !== "pending") return null;
    const overrides = stepOverrides[step.step_no] || {};
    if (step.tool_name === "compress_pdf") {
      const val = Number(overrides.target_kb ?? step.params.target_kb ?? 200);
      return (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--dm-muted)]">
          <span>Target KB:</span>
          <input
            type="number"
            min={10}
            value={val}
            onChange={(e) => updateOverride(step.step_no, "target_kb", Number(e.target.value) || 200)}
            className="dm-input w-20 px-2 py-0.5 font-mono text-[11px]"
          />
        </label>
      );
    }
    if (step.tool_name === "watermark") {
      const val = String(overrides.text ?? step.params.text ?? "CONFIDENTIAL");
      return (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--dm-muted)]">
          <span>Text:</span>
          <input
            type="text"
            value={val}
            onChange={(e) => updateOverride(step.step_no, "text", e.target.value)}
            className="dm-input w-36 px-2 py-0.5 text-[11px]"
          />
        </label>
      );
    }
    if (step.tool_name === "convert_document") {
      const val = String(overrides.target_format ?? step.params.target_format ?? "pdf");
      return (
        <label className="inline-flex items-center gap-1.5 text-[11px] text-[var(--dm-muted)]">
          <span>Format:</span>
          <select
            value={val}
            onChange={(e) => updateOverride(step.step_no, "target_format", e.target.value)}
            className="dm-input px-2 py-0.5 text-[11px] uppercase font-mono"
          >
            {["pdf", "docx", "xlsx", "pptx", "md"].map((fmt) => (
              <option key={fmt} value={fmt}>
                {fmt.toUpperCase()}
              </option>
            ))}
          </select>
        </label>
      );
    }
    return null;
  };

  return (
    <section className="dm-card p-5 sm:p-6 space-y-4 relative overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="h-7 w-7 rounded-lg bg-gradient-to-br from-indigo-500/20 to-violet-500/20 border border-indigo-500/30 flex items-center justify-center">
            <Terminal className="h-3.5 w-3.5 text-indigo-500 dark:text-indigo-300" />
          </span>
          <div>
            <h2 className="text-sm font-semibold leading-none">
              Tell me what you want (Multi-Step Agent)
            </h2>
            <p className="text-[11px] text-[var(--dm-muted)] mt-1">
              Chain PDF tools, format conversions &amp; RAG summaries with granular step approvals
            </p>
          </div>
        </div>
        {docs.length > 0 && (
          <select
            value={selectedDocId}
            onChange={(e) => setSelectedDocId(e.target.value)}
            aria-label="Primary target document"
            className="dm-input text-xs px-2.5 py-1.5 max-w-[230px] font-medium"
          >
            {docs.map((d) => (
              <option key={d.id} value={d.id}>
                {d.name} (v{d.current_version_no})
              </option>
            ))}
          </select>
        )}
      </div>

      {docs.length > 1 && (
        <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
          <span className="text-[var(--dm-muted)]">Include extra docs (for merge):</span>
          {docs
            .filter((d) => d.id !== selectedDocId && d.mime_type === "application/pdf")
            .slice(0, 4)
            .map((d) => {
              const active = extraDocIds.includes(d.id);
              return (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggleExtraDoc(d.id)}
                  className={`px-2 py-0.5 rounded-full border transition-colors ${
                    active
                      ? "bg-indigo-500/15 border-indigo-500/40 text-indigo-400"
                      : "border-[var(--dm-border)] text-[var(--dm-muted)] hover:border-indigo-500/30"
                  }`}
                >
                  + {d.name}
                </button>
              );
            })}
        </div>
      )}

      <form onSubmit={handlePlan} className="flex flex-col sm:flex-row gap-2.5">
        <input
          type="text"
          value={commandText}
          onChange={(e) => setCommandText(e.target.value)}
          placeholder={t.app.commandPlaceholder}
          className="dm-input flex-1 px-3.5 py-2.5 text-sm"
        />
        <button
          type="submit"
          disabled={planning || !commandText.trim()}
          className="dm-primary-btn px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50 shrink-0"
        >
          {planning ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowRight className="h-4 w-4" />}
          <span>{t.app.runCommand}</span>
        </button>
      </form>

      <div className="flex flex-wrap items-center gap-1.5">
        <span className="text-[11px] text-[var(--dm-muted)] mr-1">Try chained:</span>
        {WORKFLOW_CHIPS.map((chip) => (
          <button
            key={chip}
            type="button"
            onClick={() => setCommandText(chip)}
            className="text-[11px] px-2.5 py-1 rounded-full border border-[var(--dm-border)] bg-[var(--dm-bg)] text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:border-indigo-500/40 transition-colors text-left"
          >
            {chip}
          </button>
        ))}
      </div>

      {plan && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.18 }}
          className="dm-elevated p-4 space-y-3.5 border-indigo-500/35"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 min-w-0">
              <Bot className="h-4 w-4 text-indigo-400 shrink-0" />
              <p className="text-sm font-medium truncate">{plan.summary}</p>
            </div>
            <div className="flex items-center gap-2">
              {plan.execution_log && plan.execution_log.length > 0 && (
                <button
                  type="button"
                  onClick={() => setShowLog((v) => !v)}
                  className="text-[11px] font-mono px-2 py-0.5 rounded border border-[var(--dm-border)] text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                >
                  {showLog ? "Hide Log" : `Log (${plan.execution_log.length})`}
                </button>
              )}
              <span
                className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded-full border shrink-0 ${stepBadgeClass(
                  plan.status
                )}`}
              >
                {plan.status.replace("_", " ")}
              </span>
            </div>
          </div>

          {plan.steps.length > 0 && (
            <div className="space-y-2">
              {plan.steps.map((s) => {
                const isPending = !s.execution_status || s.execution_status === "pending";
                const checked = stepApprovals[s.step_no] ?? true;
                return (
                  <div
                    key={s.step_no}
                    className={`rounded-xl border p-3 space-y-2 transition-colors ${
                      s.execution_status === "running"
                        ? "border-indigo-500/60 bg-indigo-500/8"
                        : "border-[var(--dm-border)] bg-[var(--dm-surface)]"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="h-5 w-5 rounded-full bg-indigo-500/15 text-indigo-400 font-mono text-[11px] flex items-center justify-center shrink-0">
                          {s.step_no}
                        </span>
                        <span className="font-mono text-[11px] px-1.5 py-0.5 rounded bg-[var(--dm-subtle)] border border-[var(--dm-border)]">
                          {s.tool_name}
                        </span>
                        <span className="text-xs font-medium truncate">{s.description}</span>
                      </div>

                      <div className="flex items-center gap-2">
                        {plan.status === "awaiting_approval" && isPending && (
                          <button
                            type="button"
                            onClick={() =>
                              setStepApprovals((prev) => ({
                                ...prev,
                                [s.step_no]: !checked,
                              }))
                            }
                            className={`text-[11px] px-2.5 py-0.5 rounded-full border inline-flex items-center gap-1 transition-colors ${
                              checked
                                ? "bg-emerald-500/15 border-emerald-500/35 text-emerald-500"
                                : "bg-[var(--dm-subtle)] border-[var(--dm-border)] text-[var(--dm-muted)]"
                            }`}
                          >
                            {checked ? (
                              <>
                                <CheckCircle2 className="h-3 w-3" />
                                <span>Approved</span>
                              </>
                            ) : (
                              <>
                                <SkipForward className="h-3 w-3" />
                                <span>Skip</span>
                              </>
                            )}
                          </button>
                        )}
                        {s.execution_status === "running" && (
                          <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                        )}
                        {s.execution_status === "completed" && (
                          <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                        )}
                        {s.execution_status === "failed" && (
                          <XCircle className="h-3.5 w-3.5 text-red-400" />
                        )}
                        {s.execution_status === "skipped" && (
                          <Clock className="h-3.5 w-3.5 text-[var(--dm-muted)]" />
                        )}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-2 pl-7">
                      {renderParamEditor(s)}
                      {s.output_document_id && s.execution_status === "completed" && (
                        <Link
                          href={`/app/workspace/${s.output_document_id}`}
                          className="text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1"
                        >
                          <span>Open Output</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>

                    {s.output_preview && (
                      <div className="ml-7 p-2.5 rounded-lg bg-[var(--dm-bg)] border border-[var(--dm-border)] text-[11px] text-[var(--dm-text)] whitespace-pre-wrap">
                        {s.output_preview}
                      </div>
                    )}
                    {s.error && (
                      <p className="ml-7 text-[11px] text-red-400">Error: {s.error}</p>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {showLog && plan.execution_log && plan.execution_log.length > 0 && (
            <div className="rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] p-3 space-y-1.5 max-h-40 overflow-y-auto font-mono text-[11px]">
              {plan.execution_log.map((entry, idx) => (
                <div key={idx} className="flex items-start gap-2 text-[var(--dm-muted)]">
                  <ChevronRight className="h-3 w-3 mt-0.5 text-indigo-400 shrink-0" />
                  <span>
                    {entry.step_no ? `[Step ${entry.step_no}] ` : ""}
                    {entry.message}
                  </span>
                </div>
              ))}
            </div>
          )}

          {plan.status === "awaiting_approval" && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <button
                type="button"
                disabled={approving}
                onClick={() => handleApprove(true, "all")}
                className="dm-primary-btn px-3.5 py-1.5 text-xs font-medium inline-flex items-center gap-1.5"
              >
                {approving ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Play className="h-3.5 w-3.5" />
                )}
                <span>{t.app.approveAction}</span>
              </button>
              {plan.steps.filter((s) => !s.execution_status || s.execution_status === "pending")
                .length > 1 && (
                <button
                  type="button"
                  disabled={approving}
                  onClick={() => handleApprove(true, "next_step")}
                  className="px-3.5 py-1.5 text-xs rounded-lg border border-indigo-500/40 bg-indigo-500/10 text-indigo-400 hover:bg-indigo-500/20 inline-flex items-center gap-1.5"
                >
                  <StepForward className="h-3.5 w-3.5" />
                  <span>Run Next Step Only</span>
                </button>
              )}
              <button
                type="button"
                disabled={approving}
                onClick={() => handleApprove(false)}
                className="px-3.5 py-1.5 text-xs rounded-lg border border-[var(--dm-border)] hover:bg-[var(--dm-surface)]"
              >
                {t.app.cancel}
              </button>
            </div>
          )}
        </motion.div>
      )}
    </section>
  );
}
