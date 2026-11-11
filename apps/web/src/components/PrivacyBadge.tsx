"use client";

import { ShieldCheck, Trash2, Clock } from "lucide-react";
import { formatRelativeExpiry } from "@documind/shared";
import { useAuthStore } from "@/stores/auth-store";
import { useT } from "@/lib/i18n";

interface PrivacyBadgeProps {
  documentId?: string;
  expiresAt?: string | null;
  onDeleteNow?: () => void;
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

  const expiryText = formatRelativeExpiry(expiresAt ?? (isGuest ? guestExpires : null));

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/5 px-3 py-2 text-xs">
      <div className="flex items-center gap-2 text-emerald-500 dark:text-emerald-400">
        <ShieldCheck className="h-4 w-4 shrink-0" />
        <span>{isGuest ? t.app.privacyGuest : t.app.privacySignedIn}</span>
        {expiryText && (
          <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 font-mono text-[11px]">
            <Clock className="h-3 w-3" />
            {expiryText}
          </span>
        )}
      </div>

      {onDeleteNow && (
        <button
          type="button"
          onClick={onDeleteNow}
          disabled={deleting}
          className="inline-flex items-center gap-1 rounded px-2 py-1 text-red-400 hover:bg-red-500/10 transition-colors disabled:opacity-50"
        >
          <Trash2 className="h-3.5 w-3.5" />
          <span>{deleting ? "Deleting..." : t.app.deleteNow}</span>
        </button>
      )}
    </div>
  );
}
