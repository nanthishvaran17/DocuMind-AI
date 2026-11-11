"use client";

import { useState } from "react";
import { Clock, ShieldCheck, Trash2 } from "lucide-react";
import { formatRelativeExpiry } from "@documind/shared";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";

interface PrivacyBadgeProps {
  documentId?: string;
  expiresAt?: string | null;
  onDeleteNow?: () => void | Promise<void>;
  deleting?: boolean;
}

export function PrivacyBadge({
  expiresAt,
  onDeleteNow,
  deleting = false,
}: PrivacyBadgeProps) {
  const isGuest = useAuthStore((s) => s.isGuest);
  const guestExpires = useAuthStore((s) => s.guestExpiresAt);
  const { t } = useT();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [internalDeleting, setInternalDeleting] = useState(false);

  const expiryText = formatRelativeExpiry(expiresAt ?? (isGuest ? guestExpires : null));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2.5 rounded-xl border border-emerald-500/25 bg-emerald-500/[0.06] px-3.5 py-2.5 text-xs shadow-sm">
      <div className="flex flex-wrap items-center gap-2.5 text-emerald-700 dark:text-emerald-300">
        <span className="relative flex h-2 w-2 shrink-0">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
          <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500" />
        </span>
        <ShieldCheck className="h-4 w-4 shrink-0 text-emerald-500" />
        <span className="font-medium">{isGuest ? t.app.privacyGuest : t.app.privacySignedIn}</span>
        {expiryText && (
          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 border border-emerald-500/25 px-2 py-0.5 font-mono text-[11px] font-medium">
            <Clock className="h-3 w-3" />
            {expiryText}
          </span>
        )}
      </div>

      {onDeleteNow && (
        <button
          type="button"
          onClick={() => setConfirmOpen(true)}
          disabled={deleting || internalDeleting}
          className="inline-flex items-center gap-1.5 rounded-lg border border-red-500/25 bg-red-500/10 px-2.5 py-1 font-medium text-red-500 dark:text-red-400 hover:bg-red-500/15 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{deleting || internalDeleting ? "Deleting..." : t.app.deleteNow}</span>
        </button>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="Are you sure you want to delete this document now?"
        description="This immediately and permanently deletes the file, its versions, and stored assets. This action cannot be undone."
        confirmLabel="Yes, Delete Permanently"
        loading={deleting || internalDeleting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={async () => {
          if (!onDeleteNow) return;
          setInternalDeleting(true);
          try {
            await onDeleteNow();
            setConfirmOpen(false);
          } finally {
            setInternalDeleting(false);
          }
        }}
      />
    </div>
  );
}
