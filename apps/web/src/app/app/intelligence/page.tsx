"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  BookOpen,
  CheckSquare,
  ExternalLink,
  FileSearch,
  Loader2,
  MessageSquare,
  RefreshCw,
  Search,
  Send,
  Square,
  Trash2,
} from "lucide-react";
import type {
  DocumentItem,
  QaAskResponse,
  QaThreadItem,
  SemanticSearchHit,
} from "@documind/types";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/providers";
import { apiRequest, ensureAuthSession } from "@/lib/api";
import { usePreferencesStore } from "@/stores/preferences-store";

export default function IntelligencePage() {
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const defaultSearchMode = usePreferencesStore((s) => s.default_search_mode);
  const defaultTopK = usePreferencesStore((s) => s.default_top_k);
  const aiResponseStyle = usePreferencesStore((s) => s.ai_response_style);
  const customInstructions = usePreferencesStore((s) => s.custom_instructions);
  const showCitationSnippets = usePreferencesStore((s) => s.show_citation_snippets);

  const [activeTab, setActiveTab] = useState<"qa" | "search">("qa");
  const [selectedDocIds, setSelectedDocIds] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchMode, setSearchMode] = useState<"hybrid" | "semantic" | "keyword">(defaultSearchMode);
  const [searching, setSearching] = useState(false);
  const [searchHits, setSearchHits] = useState<SemanticSearchHit[]>([]);

  const [activeThreadId, setActiveThreadId] = useState<string | null>(null);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [indexingDocId, setIndexingDocId] = useState<string | null>(null);

  useEffect(() => {
    ensureAuthSession().catch(() => undefined);
  }, []);

  const docsQuery = useQuery({
    queryKey: ["intelligence-docs"],
    queryFn: async () => {
      await ensureAuthSession();
      const res = await apiRequest<DocumentItem[]>("/documents?limit=100");
      return res.data ?? [];
    },
  });

  const threadsQuery = useQuery({
    queryKey: ["qa-threads"],
    queryFn: async () => {
      await ensureAuthSession();
      const res = await apiRequest<QaThreadItem[]>("/ai/qa/threads");
      return res.data ?? [];
    },
  });

  const threadDetailQuery = useQuery({
    queryKey: ["qa-thread-detail", activeThreadId],
    enabled: Boolean(activeThreadId),
    queryFn: async () => {
      const res = await apiRequest<QaThreadItem>(`/ai/qa/threads/${activeThreadId}`);
      return res.data ?? null;
    },
  });

  const docs = useMemo(
    () => (docsQuery.data ?? []).filter((d) => !d.mime_type.startsWith("image/")),
    [docsQuery.data]
  );

  const toggleDoc = (id: string) => {
    setSelectedDocIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleIndexDoc = async (docId: string) => {
    setIndexingDocId(docId);
    try {
      const res = await apiRequest<{ chunk_count: number }>(`/ai/documents/${docId}/index`, {
        method: "POST",
        body: JSON.stringify({ force: true }),
      });
      pushToast({
        title: "Document indexed",
        description: `Stored ${res.data?.chunk_count ?? 0} searchable chunks.`,
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: "Indexing failed",
        description: err instanceof Error ? err.message : "Could not extract document text.",
        variant: "error",
      });
    } finally {
      setIndexingDocId(null);
    }
  };

  const handleSemanticSearch = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!searchQuery.trim()) return;
    setSearching(true);
    try {
      const res = await apiRequest<SemanticSearchHit[]>("/ai/search", {
        method: "POST",
        body: JSON.stringify({
          query: searchQuery.trim(),
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          mode: searchMode,
          limit: 12,
        }),
      });
      setSearchHits(res.data ?? []);
    } catch (err) {
      pushToast({
        title: "Search failed",
        description: err instanceof Error ? err.message : "Search request failed.",
        variant: "error",
      });
    } finally {
      setSearching(false);
    }
  };

  const handleAsk = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!question.trim()) return;
    const text = question.trim();
    setAsking(true);
    try {
      const res = await apiRequest<QaAskResponse>("/ai/qa/ask", {
        method: "POST",
        body: JSON.stringify({
          question: text,
          document_ids: selectedDocIds.length > 0 ? selectedDocIds : undefined,
          thread_id: activeThreadId || undefined,
          top_k: defaultTopK,
          response_style: aiResponseStyle,
          custom_instructions: customInstructions || undefined,
        }),
      });
      if (res.data) {
        setQuestion("");
        setActiveThreadId(res.data.thread_id);
        await queryClient.invalidateQueries({ queryKey: ["qa-threads"] });
        await queryClient.invalidateQueries({ queryKey: ["qa-thread-detail", res.data.thread_id] });
      }
    } catch (err) {
      pushToast({
        title: "Q&A request failed",
        description: err instanceof Error ? err.message : "Could not generate an answer.",
        variant: "error",
      });
    } finally {
      setAsking(false);
    }
  };

  const handleDeleteThread = async (threadId: string) => {
    try {
      await apiRequest(`/ai/qa/threads/${threadId}`, { method: "DELETE" });
      if (activeThreadId === threadId) setActiveThreadId(null);
      await queryClient.invalidateQueries({ queryKey: ["qa-threads"] });
      pushToast({ title: "Conversation thread deleted", variant: "info" });
    } catch {
      pushToast({ title: "Could not delete thread", variant: "error" });
    }
  };

  const activeThread = threadDetailQuery.data;

  return (
    <AppShell>
      <div className="space-y-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <div className="inline-flex items-center gap-2 text-xs font-mono text-indigo-400">
              <FileSearch className="h-3.5 w-3.5" />
              <span>DOCUMENT INTELLIGENCE &amp; RAG</span>
            </div>
            <h1 className="text-2xl font-bold tracking-tight mt-1">
              Semantic Search &amp; Citation-Backed Q&amp;A
            </h1>
            <p className="text-sm text-[var(--dm-muted)] mt-1">
              Query across PDF, Word, Excel, PowerPoint, and Markdown files with pgvector embeddings and exact page citations.
            </p>
          </div>
          <div className="inline-flex rounded-xl border border-[var(--dm-border)] bg-[var(--dm-surface)] p-1 text-xs font-medium">
            <button
              type="button"
              onClick={() => setActiveTab("qa")}
              className={`px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors ${
                activeTab === "qa"
                  ? "bg-indigo-500/15 text-indigo-400 font-semibold"
                  : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
              }`}
            >
              <MessageSquare className="h-3.5 w-3.5" />
              <span>Cited Q&amp;A</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveTab("search")}
              className={`px-3.5 py-1.5 rounded-lg inline-flex items-center gap-1.5 transition-colors ${
                activeTab === "search"
                  ? "bg-indigo-500/15 text-indigo-400 font-semibold"
                  : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
              }`}
            >
              <FileSearch className="h-3.5 w-3.5" />
              <span>Semantic Search</span>
            </button>
          </div>
        </div>

        <div className="grid lg:grid-cols-12 gap-5 items-start">
          {/* Left Rail: Document Scope + Q&A History */}
          <aside className="lg:col-span-4 space-y-4">
            <section className="dm-card p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                  Document Scope ({selectedDocIds.length === 0 ? "All Docs" : `${selectedDocIds.length} Selected`})
                </h2>
                {selectedDocIds.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setSelectedDocIds([])}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    Reset to all
                  </button>
                )}
              </div>

              {docs.length === 0 ? (
                <p className="text-xs text-[var(--dm-muted)] py-3">
                  Upload PDF, DOCX, XLSX, PPTX, or MD files on the Dashboard first.
                </p>
              ) : (
                <div className="space-y-1.5 max-h-64 overflow-y-auto pr-1">
                  {docs.map((doc) => {
                    const checked = selectedDocIds.includes(doc.id);
                    return (
                      <div
                        key={doc.id}
                        className={`flex items-center justify-between gap-2 p-2 rounded-xl border text-xs transition-colors ${
                          checked
                            ? "border-indigo-500/50 bg-indigo-500/10"
                            : "border-[var(--dm-border)] bg-[var(--dm-bg)]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => toggleDoc(doc.id)}
                          className="flex items-center gap-2 min-w-0 flex-1 text-left"
                        >
                          {checked ? (
                            <CheckSquare className="h-3.5 w-3.5 text-indigo-400 shrink-0" />
                          ) : (
                            <Square className="h-3.5 w-3.5 text-[var(--dm-muted)] shrink-0" />
                          )}
                          <span className="truncate font-medium">{doc.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleIndexDoc(doc.id)}
                          disabled={indexingDocId === doc.id}
                          title="Re-index embeddings"
                          className="p-1 rounded-md text-[var(--dm-muted)] hover:text-indigo-400 hover:bg-[var(--dm-surface)] shrink-0"
                        >
                          <RefreshCw
                            className={`h-3 w-3 ${indexingDocId === doc.id ? "animate-spin" : ""}`}
                          />
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </section>

            {activeTab === "qa" && (
              <section className="dm-card p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h2 className="text-xs font-semibold uppercase tracking-wider text-[var(--dm-muted)]">
                    Q&amp;A Threads
                  </h2>
                  <button
                    type="button"
                    onClick={() => setActiveThreadId(null)}
                    className="text-[11px] text-indigo-400 hover:underline"
                  >
                    + New Thread
                  </button>
                </div>
                {(threadsQuery.data ?? []).length === 0 ? (
                  <p className="text-xs text-[var(--dm-muted)]">
                    Ask your first question to start a persistent cited thread.
                  </p>
                ) : (
                  <div className="space-y-1.5 max-h-60 overflow-y-auto pr-1">
                    {(threadsQuery.data ?? []).map((thread) => (
                      <div
                        key={thread.id}
                        className={`flex items-center justify-between gap-2 p-2.5 rounded-xl border text-xs ${
                          activeThreadId === thread.id
                            ? "border-indigo-500 bg-indigo-500/12"
                            : "border-[var(--dm-border)] bg-[var(--dm-bg)]"
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => setActiveThreadId(thread.id)}
                          className="text-left min-w-0 flex-1"
                        >
                          <p className="font-medium truncate">{thread.title}</p>
                          <p className="text-[10px] font-mono text-[var(--dm-muted)] mt-0.5">
                            {new Date(thread.updated_at).toLocaleDateString()}
                          </p>
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteThread(thread.id)}
                          aria-label="Delete thread"
                          className="p-1 text-[var(--dm-muted)] hover:text-red-400"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </aside>

          {/* Main Workspace */}
          <div className="lg:col-span-8 space-y-4">
            {activeTab === "qa" ? (
              <section className="dm-card p-5 space-y-4">
                <form onSubmit={handleAsk} className="space-y-3">
                  <label className="text-xs font-semibold flex items-center gap-1.5 text-[var(--dm-muted)]">
                    <BookOpen className="h-3.5 w-3.5 text-indigo-400" />
                    <span>Ask anything across your uploaded documents</span>
                  </label>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <input
                      type="text"
                      value={question}
                      onChange={(e) => setQuestion(e.target.value)}
                      placeholder="e.g. What are the key requirements, deadlines, or action items?"
                      className="dm-input flex-1 px-3.5 py-2.5 text-sm"
                    />
                    <button
                      type="submit"
                      disabled={asking || !question.trim()}
                      className="dm-primary-btn px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {asking ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : (
                        <Send className="h-4 w-4" />
                      )}
                      <span>Ask AI</span>
                    </button>
                  </div>
                </form>

                <div className="space-y-3 pt-2">
                  {threadDetailQuery.isLoading ? (
                    <div className="flex items-center gap-2 text-xs text-[var(--dm-muted)] py-6">
                      <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                      <span>Loading conversation...</span>
                    </div>
                  ) : !activeThread || !activeThread.messages?.length ? (
                    <div className="rounded-xl border border-dashed border-[var(--dm-border)] p-8 text-center text-xs text-[var(--dm-muted)]">
                      Answers include numbered inline citations <span className="font-mono">[1]</span>{" "}
                      with document name, page number, relevance score, and verbatim snippet preview.
                    </div>
                  ) : (
                    (activeThread.messages ?? []).map((msg) => (
                      <div
                        key={msg.id}
                        className={`p-4 rounded-xl border space-y-2.5 ${
                          msg.role === "user"
                            ? "border-[var(--dm-border)] bg-[var(--dm-bg)]"
                            : "border-indigo-500/30 bg-[var(--dm-subtle)]"
                        }`}
                      >
                        <div className="flex items-center justify-between text-[11px] font-mono text-[var(--dm-muted)]">
                          <span className="uppercase font-semibold">
                            {msg.role === "user" ? "You" : "DocuMind RAG"}
                          </span>
                          {msg.model_used && <span>{msg.model_used}</span>}
                        </div>
                        <p className="text-sm leading-relaxed whitespace-pre-wrap">{msg.content}</p>
                        {msg.citations.length > 0 && (
                          <div className="grid sm:grid-cols-2 gap-2 pt-1">
                            {msg.citations.map((cit) => (
                              <Link
                                key={cit.index}
                                href={`/app/workspace/${cit.document_id}`}
                                className="p-2.5 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-surface)] hover:border-indigo-500/50 transition-colors space-y-1 text-xs"
                              >
                                <div className="flex items-center justify-between gap-2 font-mono text-[10px] text-indigo-400">
                                  <span>
                                    [{cit.index}] {cit.document_name} (p.{cit.page_no ?? 1})
                                  </span>
                                  <span>{Math.round(cit.score * 100)}%</span>
                                </div>
                                {showCitationSnippets && (
                                  <p className="text-[11px] text-[var(--dm-muted)] line-clamp-2">
                                    {cit.snippet}
                                  </p>
                                )}
                              </Link>
                            ))}
                          </div>
                        )}
                      </div>
                    ))
                  )}
                </div>
              </section>
            ) : (
              <section className="dm-card p-5 space-y-4">
                <form onSubmit={handleSemanticSearch} className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-semibold text-[var(--dm-muted)]">
                      Retrieval Mode
                    </span>
                    <div className="inline-flex rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] p-0.5 text-[11px]">
                      {(["hybrid", "semantic", "keyword"] as const).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setSearchMode(m)}
                          className={`px-2.5 py-1 rounded-md capitalize ${
                            searchMode === m
                              ? "bg-indigo-500/15 text-indigo-400 font-semibold"
                              : "text-[var(--dm-muted)]"
                          }`}
                        >
                          {m}
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="flex flex-col sm:flex-row gap-2.5">
                    <div className="relative flex-1">
                      <Search className="h-4 w-4 text-[var(--dm-muted)] absolute left-3 top-1/2 -translate-y-1/2" />
                      <input
                        type="text"
                        value={searchQuery}
                        onChange={(e) => setSearchQuery(e.target.value)}
                        placeholder="Search by meaning, concept, or exact clause..."
                        className="dm-input w-full pl-9 pr-3 py-2.5 text-sm"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={searching || !searchQuery.trim()}
                      className="dm-primary-btn px-4 py-2.5 text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-50"
                    >
                      {searching && <Loader2 className="h-4 w-4 animate-spin" />}
                      <span>Search</span>
                    </button>
                  </div>
                </form>

                {searchHits.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-[var(--dm-border)] p-8 text-center text-xs text-[var(--dm-muted)]">
                    Enter a natural-language query to rank relevant sections across your workspace.
                  </div>
                ) : (
                  <div className="space-y-2.5">
                    {searchHits.map((hit) => (
                      <div
                        key={hit.chunk_id}
                        className="p-3.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] space-y-2"
                      >
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <div className="flex items-center gap-2 min-w-0">
                            <span className="font-semibold text-sm truncate">
                              {hit.document_name}
                            </span>
                            <span className="text-[10px] font-mono px-2 py-0.5 rounded-full border border-[var(--dm-border)] text-[var(--dm-muted)]">
                              Page {hit.page_no ?? 1}
                            </span>
                          </div>
                          <div className="flex items-center gap-2">
                            <span className="text-[11px] font-mono text-emerald-400">
                              Score {(hit.score * 100).toFixed(0)}%
                            </span>
                            <Link
                              href={`/app/workspace/${hit.document_id}`}
                              className="text-xs text-indigo-400 hover:underline inline-flex items-center gap-1"
                            >
                              <span>Open</span>
                              <ExternalLink className="h-3 w-3" />
                            </Link>
                          </div>
                        </div>
                        <p className="text-xs text-[var(--dm-muted)] leading-relaxed whitespace-pre-wrap">
                          {hit.snippet}
                        </p>
                      </div>
                    ))}
                  </div>
                )}
              </section>
            )}
          </div>
        </div>
      </div>
    </AppShell>
  );
}
