"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  variant?: "danger" | "warning";
  loading?: boolean;
  requireConfirmText?: string;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Yes, Delete",
  cancelLabel = "Cancel",
  variant = "danger",
  loading = false,
  requireConfirmText,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const [typedText, setTypedText] = useState("");

  useEffect(() => {
    if (!open) {
      setTypedText("");
      return;
    }
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !loading) {
        onCancel();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, loading, onCancel]);

  if (!open) return null;

  const isDanger = variant === "danger";
  const textMatched =
    !requireConfirmText ||
    typedText.trim().toUpperCase() === requireConfirmText.trim().toUpperCase();

  return (
    <div
      className="fixed inset-0 z-50 bg-slate-950/75 backdrop-blur-sm flex items-center justify-center p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="confirm-dialog-title"
      onClick={() => {
        if (!loading) onCancel();
      }}
    >
      <div
        className="dm-card max-w-md w-full p-5 space-y-4 shadow-2xl border border-[var(--dm-border-strong)]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <div
              className={`h-10 w-10 rounded-xl flex items-center justify-center shrink-0 border ${
                isDanger
                  ? "bg-red-500/15 border-red-500/30 text-red-500 dark:text-red-400"
                  : "bg-amber-500/15 border-amber-500/30 text-amber-500 dark:text-amber-400"
              }`}
            >
              <AlertTriangle className="h-5 w-5" />
            </div>
            <div className="space-y-1">
              <h3 id="confirm-dialog-title" className="text-sm font-semibold text-[var(--dm-text)]">
                {title}
              </h3>
              <p className="text-xs text-[var(--dm-muted)] leading-relaxed">{description}</p>
            </div>
          </div>
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="p-1.5 rounded-lg text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] disabled:opacity-40"
            aria-label="Close confirmation dialog"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {requireConfirmText && (
          <div className="space-y-1.5">
            <p className="text-xs text-red-400 font-medium">
              Type <span className="font-mono font-bold">{requireConfirmText}</span> below to confirm:
            </p>
            <input
              type="text"
              value={typedText}
              onChange={(e) => setTypedText(e.target.value)}
              placeholder={requireConfirmText}
              className="dm-input w-full px-3 py-2 text-sm font-mono"
              autoFocus
            />
          </div>
        )}

        <div className="flex items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={loading}
            onClick={onCancel}
            className="px-4 py-2 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-subtle)] hover:border-[var(--dm-border-strong)] disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={loading || !textMatched}
            onClick={() => void onConfirm()}
            className={`px-4 py-2 text-xs font-semibold rounded-xl text-white inline-flex items-center gap-1.5 disabled:opacity-50 transition-colors ${
              isDanger
                ? "bg-red-600 hover:bg-red-500"
                : "bg-amber-600 hover:bg-amber-500"
            }`}
          >
            {loading && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
            <span>{confirmLabel}</span>
          </button>
        </div>
      </div>
    </div>
  );
}
