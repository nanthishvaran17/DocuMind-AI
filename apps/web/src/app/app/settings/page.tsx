"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { ShieldAlert } from "lucide-react";
import type { User } from "@documind/types";
import { AppShell } from "@/components/AppShell";
import { useToast } from "@/components/providers";
import { apiRequest } from "@/lib/api";
import { useAuthStore } from "@/stores/auth-store";

export default function SettingsPage() {
  const router = useRouter();
  const { pushToast } = useToast();
  const user = useAuthStore((s) => s.user);
  const setUser = useAuthStore((s) => s.setUser);
  const setLocale = useAuthStore((s) => s.setLocale);
  const clearSession = useAuthStore((s) => s.clearSession);

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [localeChoice, setLocaleChoice] = useState<"en" | "ta">(user?.locale ?? "en");
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      const res = await apiRequest<User>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName, locale: localeChoice }),
      });
      if (res.data) {
        setUser(res.data);
        setLocale(localeChoice);
        pushToast({ title: "Profile updated", variant: "success" });
      }
    } catch (err) {
      pushToast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Sign in to update profile.",
        variant: "error",
      });
    } finally {
      setSaving(false);
    }
  };

  const deleteAccount = async () => {
    await apiRequest("/users/me", { method: "DELETE" });
    clearSession();
    pushToast({ title: "Account and all stored documents deleted", variant: "info" });
    router.push("/");
  };

  return (
    <AppShell>
      <div className="max-w-2xl mx-auto space-y-6">
        <h1 className="text-2xl font-semibold">Account & Preferences</h1>

        {!user ? (
          <div className="dm-card p-6 text-sm text-[var(--dm-muted)]">
            You are currently using Guest Mode (1-hour auto-deletion). Sign in or create a free account to manage profile settings and persistent folders.
          </div>
        ) : (
          <>
            <form onSubmit={saveProfile} className="dm-card p-6 space-y-4">
              <div className="space-y-1 text-xs">
                <label className="font-medium">Full Name</label>
                <input
                  type="text"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-sm"
                />
              </div>
              <div className="space-y-1 text-xs">
                <label className="font-medium">UI Language</label>
                <select
                  value={localeChoice}
                  onChange={(e) => setLocaleChoice(e.target.value as "en" | "ta")}
                  className="w-full rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] px-3 py-2 text-sm"
                >
                  <option value="en">English</option>
                  <option value="ta">தமிழ் (Tamil)</option>
                </select>
              </div>
              <button type="submit" disabled={saving} className="dm-primary-btn px-4 py-2 text-xs font-medium">
                {saving ? "Saving..." : "Save Changes"}
              </button>
            </form>

            <div className="dm-card p-6 border-red-500/30 space-y-3">
              <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                <ShieldAlert className="h-4 w-4" />
                <span>Danger Zone (GDPR / DPDP Hard Delete)</span>
              </div>
              <p className="text-xs text-[var(--dm-muted)]">
                Permanently deletes your account, all uploaded documents, versions, and thumbnails immediately.
              </p>
              {!confirmDelete ? (
                <button
                  type="button"
                  onClick={() => setConfirmDelete(true)}
                  className="px-3.5 py-1.5 text-xs rounded-lg border border-red-500/40 text-red-400 hover:bg-red-500/10"
                >
                  Delete My Account
                </button>
              ) : (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={deleteAccount}
                    className="px-3.5 py-1.5 text-xs rounded-lg bg-red-600 text-white font-medium"
                  >
                    Confirm Permanent Deletion
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(false)}
                    className="px-3.5 py-1.5 text-xs rounded-lg border border-[var(--dm-border)]"
                  >
                    Cancel
                  </button>
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </AppShell>
  );
}
