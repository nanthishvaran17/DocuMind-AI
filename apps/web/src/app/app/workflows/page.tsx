"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  Bot,
  CheckCircle2,
  Clock,
  ExternalLink,
  RefreshCw,
  ShieldAlert,
  XCircle,
} from "lucide-react";
import type { AgentCommandPlan, DocumentItem } from "@documind/types";
import { AgentWorkflowCard } from "@/components/AgentWorkflowCard";
import { AppShell } from "@/components/AppShell";
import { Breadcrumbs } from "@/components/Breadcrumbs";
import { apiRequest, ensureAuthSession } from "@/lib/api";

export default function WorkflowsPage() {
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);

  useEffect(() => {
    ensureAuthSession().catch(() => undefined);
  }, []);

  const docsQuery = useQuery({
    queryKey: ["workflows-docs"],
    queryFn: async () => {
      await ensureAuthSession();
      const res = await apiRequest<DocumentItem[]>("/documents?limit=100");
      return res.data ?? [];
    },
  });

  const runsQuery = useQuery({
    queryKey: ["agent-runs"],
    queryFn: async () => {
      await ensureAuthSession();
      const res = await apiRequest<AgentCommandPlan[]>("/ai/agent/runs?limit=25");
      return res.data ?? [];
    },
    refetchInterval: 4000,
  });

  const runs = runsQuery.data ?? [];
  const inspectedRun = runs.find((r) => r.run_id === selectedRunId) ?? runs[0] ?? null;

  return (
    <AppShell>
      <div className="space-y-6">
        <Breadcrumbs
          items={[
            { label: "Home", href: "/" },
            { label: "Workspace", href: "/app" },
            { label: "Workflows" },
          ]}
        />
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-fuchsia-400">
              <Bot className="h-3.5 w-3.5" />
              <span>PHASE 4 • MULTI-STEP AGENT WORKFLOWS</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">
              Chained Tool Workflows &amp; Granular Approvals
            </h1>
            <p className="text-sm text-[var(--dm-muted)] mt-1">
              Chain PDF operations, format conversions, summarization, and Q&amp;A with step-by-step inspection and parameter overrides.
            </p>
          </div>
          <button
            type="button"
            onClick={() => runsQuery.refetch()}
            className="px-3 py-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs font-medium inline-flex items-center gap-1.5 hover:border-indigo-500"
          >
            <RefreshCw className={`h-3.5 w-3.5 ${runsQuery.isFetching ? "animate-spin" : ""}`} />
            <span>Refresh Runs</span>
          </button>
        </div>

        <AgentWorkflowCard docs={docsQuery.data ?? []} />

        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* Run History List */}
          <section className="lg:col-span-5 dm-card p-4 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
              Workflow Run History ({runs.length})
            </h2>
            {runs.length === 0 ? (
              <p className="text-xs text-[var(--dm-muted)] py-4">
                No agent workflow runs yet. Plan a multi-step command above to inspect it here.
              </p>
            ) : (
              <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                {runs.map((run) => {
                  const active = inspectedRun?.run_id === run.run_id;
                  return (
                    <button
                      key={run.run_id}
                      type="button"
                      onClick={() => setSelectedRunId(run.run_id)}
                      className={`w-full text-left p-3 rounded-xl border space-y-1.5 transition-colors ${
                        active
                          ? "border-indigo-500 bg-indigo-500/10"
                          : "border-[var(--dm-border)] bg-[var(--dm-bg)] hover:border-indigo-500/40"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-xs font-medium line-clamp-1">
                          {run.command_text || run.summary}
                        </span>
                        <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--dm-border)] text-[var(--dm-muted)] shrink-0">
                          {run.status}
                        </span>
                      </div>
                      <p className="text-[11px] text-[var(--dm-muted)] truncate">{run.summary}</p>
                      <div className="flex items-center justify-between text-[10px] font-mono text-[var(--dm-muted)]">
                        <span>{run.steps.length} steps</span>
                        <span>step {run.current_step_no ?? 0}/{run.steps.length}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>

          {/* Selected Run Inspector */}
          <section className="lg:col-span-7 dm-card p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-sm font-semibold">Run Execution Inspector</h2>
              {inspectedRun && (
                <span className="text-[11px] font-mono text-[var(--dm-muted)]">
                  ID: {inspectedRun.run_id.slice(0, 8)}
                </span>
              )}
            </div>

            {!inspectedRun ? (
              <p className="text-xs text-[var(--dm-muted)]">
                Select a run on the left to inspect its step graph and execution telemetry.
              </p>
            ) : (
              <div className="space-y-4">
                <div className="p-3.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] space-y-1">
                  <p className="text-xs font-semibold">{inspectedRun.summary}</p>
                  {inspectedRun.command_text && (
                    <p className="text-[11px] font-mono text-[var(--dm-muted)]">
                      &ldquo;{inspectedRun.command_text}&rdquo;
                    </p>
                  )}
                </div>

                <div className="space-y-2">
                  {inspectedRun.steps.map((step) => (
                    <div
                      key={step.step_no}
                      className="p-3 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] flex items-start justify-between gap-3 text-xs"
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {step.execution_status === "completed" ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0 mt-0.5" />
                        ) : step.execution_status === "failed" ? (
                          <XCircle className="h-4 w-4 text-red-400 shrink-0 mt-0.5" />
                        ) : step.execution_status === "skipped" || step.approval_status === "rejected" ? (
                          <ShieldAlert className="h-4 w-4 text-amber-400 shrink-0 mt-0.5" />
                        ) : (
                          <Clock className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0 space-y-1">
                          <div className="flex flex-wrap items-center gap-1.5">
                            <span className="font-mono font-semibold">
                              Step {step.step_no} • {step.tool_name}
                            </span>
                            <span className="text-[10px] font-mono px-1.5 py-0.5 rounded bg-[var(--dm-surface)] border border-[var(--dm-border)] text-[var(--dm-muted)]">
                              {step.execution_status || "pending"}
                            </span>
                          </div>
                          <p className="text-[var(--dm-muted)]">{step.description}</p>
                          {(step.output_preview || step.error) && (
                            <p
                              className={`text-[11px] whitespace-pre-wrap ${
                                step.error ? "text-red-400" : "text-emerald-400"
                              }`}
                            >
                              {step.error || step.output_preview}
                            </p>
                          )}
                        </div>
                      </div>
                      {step.output_document_id && (
                        <Link
                          href={`/app/workspace/${step.output_document_id}`}
                          className="text-[11px] text-indigo-400 hover:underline inline-flex items-center gap-1 shrink-0"
                        >
                          <span>Open</span>
                          <ExternalLink className="h-3 w-3" />
                        </Link>
                      )}
                    </div>
                  ))}
                </div>

                {inspectedRun.execution_log && inspectedRun.execution_log.length > 0 && (
                  <div className="space-y-1.5">
                    <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                      Execution Log
                    </p>
                    <div className="p-3 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] space-y-1 max-h-44 overflow-y-auto font-mono text-[11px]">
                      {inspectedRun.execution_log.map((entry, idx) => (
                        <div key={idx} className="flex items-start gap-2 text-[var(--dm-muted)]">
                          <span className="text-indigo-400 shrink-0">[{entry.event}]</span>
                          <span>{entry.message}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </section>
        </div>
      </div>
    </AppShell>
  );
}
