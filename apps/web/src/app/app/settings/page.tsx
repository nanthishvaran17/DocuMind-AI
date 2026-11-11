"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";
import { useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  ArrowRight,
  Bot,
  Check,
  CheckCircle2,
  Clock,
  Database,
  Download,
  Eye,
  EyeOff,
  FileCog,
  GraduationCap,
  HardDrive,
  KeyRound,
  Keyboard,
  Languages,
  Laptop,
  Loader2,
  Lock,
  LogOut,
  Monitor,
  Moon,
  RotateCcw,
  ShieldAlert,
  ShieldCheck,
  SlidersHorizontal,
  Sun,
  Trash2,
  User as UserIcon,
} from "lucide-react";
import type {
  AiResponseStyle,
  DensityPreference,
  DocumentItem,
  DocxConversionMode,
  OcrLanguage,
  SearchModePreference,
  ThemePreference,
  User,
  UserPreferences,
  UserSessionItem,
} from "@documind/types";
import {
  COMPRESS_TARGET_PRESETS,
  PHOTO_RESIZE_PRESETS,
  formatBytes,
  formatRelativeExpiry,
} from "@documind/shared";
import { AppShell } from "@/components/AppShell";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { useToast } from "@/components/providers";
import { apiRequest, ensureAuthSession } from "@/lib/api";
import { useT } from "@/lib/i18n";
import { useAuthStore } from "@/stores/auth-store";
import {
  DEFAULT_USER_PREFERENCES,
  usePreferencesStore,
} from "@/stores/preferences-store";

type SettingsTabId =
  | "general"
  | "account"
  | "personalization"
  | "studio"
  | "data"
  | "security"
  | "shortcuts";

const SETTINGS_TABS: Array<{
  id: SettingsTabId;
  label: string;
  description: string;
  icon: typeof SlidersHorizontal;
}> = [
  {
    id: "general",
    label: "General",
    description: "Theme, language & layout",
    icon: SlidersHorizontal,
  },
  {
    id: "account",
    label: "Account",
    description: "Profile, plan & quota",
    icon: UserIcon,
  },
  {
    id: "personalization",
    label: "AI & Personalization",
    description: "Style, instructions & RAG",
    icon: Bot,
  },
  {
    id: "studio",
    label: "Studio & PDF Defaults",
    description: "Compression, OCR & presets",
    icon: FileCog,
  },
  {
    id: "data",
    label: "Data & Privacy",
    description: "Exports, history & controls",
    icon: Database,
  },
  {
    id: "security",
    label: "Security",
    description: "Password, sessions & delete",
    icon: ShieldCheck,
  },
  {
    id: "shortcuts",
    label: "Keyboard Shortcuts",
    description: "Quick navigation keys",
    icon: Keyboard,
  },
];

const INSTRUCTION_TEMPLATES = [
  {
    id: "exam_prep",
    label: "Exam Prep Bullet Points",
    text: "Summarize answers into crisp exam-ready bullet points, highlight formulas, definitions, and deadlines, and keep explanations easy to revise.",
  },
  {
    id: "bilingual_ta",
    label: "English + Tamil Clarifications",
    text: "Answer primarily in clear English, and include brief Tamil (தமிழ்) explanations for complex technical or legal terms when helpful.",
  },
  {
    id: "legal_clauses",
    label: "Clause & Risk Auditor",
    text: "Focus on exact obligations, dates, fees, exceptions, and ambiguous wording. Always reference page numbers and section headings.",
  },
  {
    id: "executive",
    label: "Executive Brief",
    text: "Lead with a 2-sentence conclusion followed by supporting evidence, metrics, and concrete action items.",
  },
];

const RESPONSE_STYLES: Array<{
  id: AiResponseStyle;
  label: string;
  hint: string;
}> = [
  { id: "balanced", label: "Balanced", hint: "Clear answers with supporting citations" },
  { id: "concise", label: "Concise", hint: "Short bullets and direct takeaways" },
  { id: "detailed", label: "Detailed", hint: "Thorough explanations with more passages" },
  { id: "academic", label: "Academic", hint: "Formal scholarly tone and synthesis" },
];

function SettingToggle({
  label,
  description,
  checked,
  onChange,
  disabled = false,
}: {
  label: string;
  description: string;
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 py-3.5 border-b border-[var(--dm-border)] last:border-b-0">
      <div className="space-y-0.5 min-w-0">
        <p className="text-sm font-medium leading-snug">{label}</p>
        <p className="text-xs text-[var(--dm-muted)] leading-relaxed">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full border transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500/40 disabled:opacity-50 ${
          checked
            ? "bg-indigo-600 border-indigo-500"
            : "bg-[var(--dm-bg)] border-[var(--dm-border-strong)]"
        }`}
      >
        <span
          className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform ${
            checked ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}

function summarizeUserAgent(ua: string | null): string {
  if (!ua) return "Unknown device";
  const browser = ua.includes("Edg/")
    ? "Microsoft Edge"
    : ua.includes("Chrome/")
      ? "Google Chrome"
      : ua.includes("Firefox/")
        ? "Mozilla Firefox"
        : ua.includes("Safari/")
          ? "Safari"
          : "Web Client";
  const os = ua.includes("Windows")
    ? "Windows"
    : ua.includes("Mac OS")
      ? "macOS"
      : ua.includes("Android")
        ? "Android"
        : ua.includes("iPhone") || ua.includes("iPad")
          ? "iOS"
          : ua.includes("Linux")
            ? "Linux"
            : "Device";
  return `${browser} on ${os}`;
}

export default function SettingsPage() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const { pushToast } = useToast();
  const { theme, setTheme } = useTheme();
  const { locale, setLocale } = useT();

  const user = useAuthStore((s) => s.user);
  const isGuest = useAuthStore((s) => s.isGuest);
  const guestExpiresAt = useAuthStore((s) => s.guestExpiresAt);
  const accessToken = useAuthStore((s) => s.accessToken);
  const setUser = useAuthStore((s) => s.setUser);
  const setAuthLocale = useAuthStore((s) => s.setLocale);
  const clearSession = useAuthStore((s) => s.clearSession);

  const prefs = usePreferencesStore();

  const [activeTab, setActiveTab] = useState<SettingsTabId>("general");
  const [syncingPrefs, setSyncingPrefs] = useState(false);

  // Account profile form
  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [localeChoice, setLocaleChoice] = useState<"en" | "ta">(user?.locale ?? locale);
  const [savingProfile, setSavingProfile] = useState(false);

  // Custom instructions draft
  const [instructionsDraft, setInstructionsDraft] = useState(prefs.custom_instructions);
  const [savingInstructions, setSavingInstructions] = useState(false);

  // Password form
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmNewPassword, setConfirmNewPassword] = useState("");
  const [showPasswords, setShowPasswords] = useState(false);
  const [changingPassword, setChangingPassword] = useState(false);

  // Data & Danger confirmations
  const [exportingData, setExportingData] = useState(false);
  const [settingsConfirm, setSettingsConfirm] = useState<
    | { type: "clear_chats" }
    | { type: "purge_files" }
    | { type: "reset_prefs" }
    | { type: "revoke_session"; sessionId: string; label: string }
    | { type: "revoke_others" }
    | { type: "delete_account" }
    | null
  >(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  useEffect(() => {
    if (user) {
      setFullName(user.full_name);
      setLocaleChoice(user.locale);
    }
  }, [user]);

  useEffect(() => {
    setInstructionsDraft(prefs.custom_instructions);
  }, [prefs.custom_instructions]);

  // Fetch workspace docs summary for Account / Data quota card
  const docsQuery = useQuery({
    queryKey: ["settings-docs-summary", Boolean(accessToken)],
    enabled: Boolean(accessToken),
    staleTime: 20_000,
    queryFn: async () => {
      const res = await apiRequest<DocumentItem[]>("/documents?limit=100");
      return res.data ?? [];
    },
  });

  // Fetch active sessions when signed in and viewing Security
  const sessionsQuery = useQuery({
    queryKey: ["settings-sessions", user?.id],
    enabled: Boolean(user && !isGuest && accessToken && activeTab === "security"),
    queryFn: async () => {
      const res = await apiRequest<UserSessionItem[]>("/users/me/sessions");
      return res.data ?? [];
    },
  });

  const totalUsedBytes = useMemo(
    () => (docsQuery.data ?? []).reduce((sum, d) => sum + d.size_bytes, 0),
    [docsQuery.data]
  );
  const quotaBytes = 500 * 1024 * 1024;
  const usedPct = Math.min(
    100,
    Math.max(totalUsedBytes > 0 ? 2 : 0, (totalUsedBytes / quotaBytes) * 100)
  );
  const guestExpiryLabel = formatRelativeExpiry(guestExpiresAt);

  const persistPreferencePatch = async (
    patch: Partial<UserPreferences>,
    toastMessage?: string
  ) => {
    prefs.updatePreferences(patch);
    if (patch.theme) {
      setTheme(patch.theme);
    }

    if (user && !isGuest) {
      setSyncingPrefs(true);
      try {
        await apiRequest<UserPreferences>("/users/me/preferences", {
          method: "PATCH",
          body: JSON.stringify(patch),
        });
        if (toastMessage) {
          pushToast({ title: toastMessage, variant: "success" });
        }
      } catch (err) {
        pushToast({
          title: "Saved locally, sync failed",
          description: err instanceof Error ? err.message : "Could not sync to server.",
          variant: "error",
        });
      } finally {
        setSyncingPrefs(false);
      }
    } else if (toastMessage) {
      pushToast({ title: toastMessage, variant: "success" });
    }
  };

  const handleLanguageChange = async (nextLocale: "en" | "ta") => {
    setLocaleChoice(nextLocale);
    setLocale(nextLocale);
    setAuthLocale(nextLocale);
    if (user && !isGuest) {
      try {
        const res = await apiRequest<User>("/users/me", {
          method: "PATCH",
          body: JSON.stringify({ locale: nextLocale }),
        });
        if (res.data) setUser(res.data);
      } catch {
        // local store already updated
      }
    }
    pushToast({
      title: nextLocale === "ta" ? "Language switched to Tamil" : "Language switched to English",
      variant: "success",
    });
  };

  const saveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim() || fullName.trim().length < 2) {
      pushToast({ title: "Full name must be at least 2 characters", variant: "error" });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await apiRequest<User>("/users/me", {
        method: "PATCH",
        body: JSON.stringify({ full_name: fullName.trim(), locale: localeChoice }),
      });
      if (res.data) {
        setUser(res.data);
        setAuthLocale(localeChoice);
        pushToast({ title: "Profile updated", variant: "success" });
      }
    } catch (err) {
      pushToast({
        title: "Update failed",
        description: err instanceof Error ? err.message : "Could not update profile.",
        variant: "error",
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const saveCustomInstructions = async (e: React.FormEvent) => {
    e.preventDefault();
    setSavingInstructions(true);
    try {
      await persistPreferencePatch(
        { custom_instructions: instructionsDraft.trim() },
        "AI personalization saved"
      );
    } finally {
      setSavingInstructions(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (newPassword.length < 8) {
      pushToast({ title: "New password must be at least 8 characters", variant: "error" });
      return;
    }
    if (newPassword !== confirmNewPassword) {
      pushToast({ title: "New passwords do not match", variant: "error" });
      return;
    }
    setChangingPassword(true);
    try {
      await apiRequest("/users/me/password", {
        method: "POST",
        body: JSON.stringify({
          current_password: currentPassword,
          new_password: newPassword,
        }),
      });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmNewPassword("");
      pushToast({ title: "Password updated successfully", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Password update failed",
        description: err instanceof Error ? err.message : "Verify your current password.",
        variant: "error",
      });
    } finally {
      setChangingPassword(false);
    }
  };

  const handleRevokeSession = async (sessionId: string) => {
    try {
      await apiRequest(`/users/me/sessions/${sessionId}`, { method: "DELETE" });
      await queryClient.invalidateQueries({ queryKey: ["settings-sessions"] });
      pushToast({ title: "Session revoked", variant: "info" });
    } catch (err) {
      pushToast({
        title: "Could not revoke session",
        description: err instanceof Error ? err.message : "Request failed.",
        variant: "error",
      });
    }
  };

  const handleRevokeOtherSessions = async () => {
    try {
      const res = await apiRequest<{ revoked_count: number }>("/users/me/sessions/revoke-others", {
        method: "POST",
      });
      await queryClient.invalidateQueries({ queryKey: ["settings-sessions"] });
      pushToast({
        title: `Signed out ${res.data?.revoked_count ?? 0} other session(s)`,
        variant: "success",
      });
    } catch (err) {
      pushToast({
        title: "Action failed",
        description: err instanceof Error ? err.message : "Could not revoke other sessions.",
        variant: "error",
      });
    }
  };

  const handleExportData = async () => {
    setExportingData(true);
    try {
      await ensureAuthSession();
      const res = await apiRequest<Record<string, unknown>>("/users/me/export");
      const payload = {
        ...res.data,
        local_preferences: {
          theme: prefs.theme,
          density: prefs.density,
          ai_response_style: prefs.ai_response_style,
          custom_instructions: prefs.custom_instructions,
          default_search_mode: prefs.default_search_mode,
          default_top_k: prefs.default_top_k,
          default_compress_kb: prefs.default_compress_kb,
          default_ocr_lang: prefs.default_ocr_lang,
          default_docx_mode: prefs.default_docx_mode,
          default_photo_preset: prefs.default_photo_preset,
        },
      };
      const blob = new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `documind-export-${new Date().toISOString().slice(0, 10)}.json`;
      a.click();
      URL.revokeObjectURL(url);
      pushToast({ title: "Workspace data exported", variant: "success" });
    } catch (err) {
      pushToast({
        title: "Export failed",
        description: err instanceof Error ? err.message : "Could not export workspace data.",
        variant: "error",
      });
    } finally {
      setExportingData(false);
    }
  };

  const handleClearQaHistory = async () => {
    try {
      await ensureAuthSession();
      const res = await apiRequest<{ deleted_threads: number }>("/users/me/qa-history", {
        method: "DELETE",
      });
      await queryClient.invalidateQueries({ queryKey: ["qa-threads"] });
      pushToast({
        title: `Cleared ${res.data?.deleted_threads ?? 0} Q&A thread(s)`,
        variant: "info",
      });
    } catch (err) {
      pushToast({
        title: "Failed to clear Q&A history",
        description: err instanceof Error ? err.message : "Request failed.",
        variant: "error",
      });
    }
  };

  const handlePurgeWorkspaceFiles = async () => {
    try {
      await ensureAuthSession();
      const res = await apiRequest<{ deleted_documents: number }>("/users/me/documents", {
        method: "DELETE",
      });
      await queryClient.invalidateQueries({ queryKey: ["settings-docs-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["shell-docs-summary"] });
      await queryClient.invalidateQueries({ queryKey: ["documents"] });
      pushToast({
        title: `Deleted ${res.data?.deleted_documents ?? 0} document(s)`,
        variant: "info",
      });
    } catch (err) {
      pushToast({
        title: "Failed to delete documents",
        description: err instanceof Error ? err.message : "Request failed.",
        variant: "error",
      });
    }
  };

  const handleResetPreferences = async () => {
    prefs.resetPreferences();
    setInstructionsDraft(DEFAULT_USER_PREFERENCES.custom_instructions);
    setTheme(DEFAULT_USER_PREFERENCES.theme);
    await persistPreferencePatch(DEFAULT_USER_PREFERENCES, "All preferences reset to defaults");
  };

  const handleDeleteAccount = async () => {
    try {
      await apiRequest("/users/me", { method: "DELETE" });
      clearSession();
      pushToast({ title: "Account and all stored documents deleted", variant: "info" });
      router.push("/");
    } catch (err) {
      pushToast({
        title: "Account deletion failed",
        description: err instanceof Error ? err.message : "Could not delete account.",
        variant: "error",
      });
    }
  };

  const currentThemeChoice: ThemePreference =
    theme === "light" || theme === "dark" || theme === "system" ? theme : prefs.theme;

  return (
    <AppShell>
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Page Header */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">Settings</h1>
            <p className="text-sm text-[var(--dm-muted)] mt-0.5">
              Customize appearance, AI personalization, PDF studio defaults, privacy, and security.
            </p>
          </div>
          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[var(--dm-border)] bg-[var(--dm-surface)] text-xs">
            {syncingPrefs ? (
              <>
                <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-400" />
                <span className="text-[var(--dm-muted)]">Syncing preferences...</span>
              </>
            ) : user && !isGuest ? (
              <>
                <CheckCircle2 className="h-3.5 w-3.5 text-emerald-500" />
                <span>Synced to {user.email}</span>
              </>
            ) : (
              <>
                <Clock className="h-3.5 w-3.5 text-amber-400" />
                <span className="text-[var(--dm-muted)]">
                  Saved in browser (Guest Mode)
                </span>
              </>
            )}
          </div>
        </div>

        {/* Mobile Horizontal Tabs */}
        <div className="lg:hidden flex items-center gap-1.5 overflow-x-auto pb-1">
          {SETTINGS_TABS.map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-medium whitespace-nowrap border transition-colors ${
                  active
                    ? "border-indigo-500/40 bg-indigo-500/12 text-indigo-500 dark:text-indigo-300"
                    : "border-[var(--dm-border)] bg-[var(--dm-surface)] text-[var(--dm-muted)]"
                }`}
              >
                <Icon className="h-3.5 w-3.5" />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {/* Main 2-Column Claude / ChatGPT Settings Layout */}
        <div className="grid lg:grid-cols-12 gap-6 items-start">
          {/* Left Category Sidebar */}
          <aside className="hidden lg:block lg:col-span-4 xl:col-span-3 dm-card p-2 space-y-1 sticky top-20">
            {SETTINGS_TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-colors ${
                    active
                      ? "bg-indigo-500/12 text-indigo-600 dark:text-indigo-300 border border-indigo-500/25"
                      : "text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:bg-[var(--dm-subtle)] border border-transparent"
                  }`}
                >
                  <Icon
                    className={`h-4 w-4 shrink-0 ${
                      active ? "text-indigo-500 dark:text-indigo-400" : ""
                    }`}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-medium leading-tight truncate">{tab.label}</p>
                    <p className="text-[11px] text-[var(--dm-muted)] truncate mt-0.5">
                      {tab.description}
                    </p>
                  </div>
                </button>
              );
            })}
          </aside>

          {/* Right Settings Detail Panel */}
          <div className="lg:col-span-8 xl:col-span-9 space-y-5">
            {/* GENERAL */}
            {activeTab === "general" && (
              <div className="space-y-5">
                <section className="dm-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Appearance</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Choose how DocuMind Studio looks on your device.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3">
                    {(
                      [
                        {
                          id: "light" as const,
                          label: "Light",
                          icon: Sun,
                          previewBg: "bg-slate-100",
                          previewCard: "bg-white border-slate-200",
                          previewBar: "bg-indigo-500",
                        },
                        {
                          id: "dark" as const,
                          label: "Dark",
                          icon: Moon,
                          previewBg: "bg-slate-950",
                          previewCard: "bg-slate-900 border-slate-800",
                          previewBar: "bg-indigo-400",
                        },
                        {
                          id: "system" as const,
                          label: "System",
                          icon: Monitor,
                          previewBg: "bg-gradient-to-r from-slate-100 to-slate-950",
                          previewCard: "bg-slate-800/80 border-slate-600",
                          previewBar: "bg-violet-400",
                        },
                      ] as const
                    ).map((opt) => {
                      const Icon = opt.icon;
                      const selected = currentThemeChoice === opt.id;
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => persistPreferencePatch({ theme: opt.id })}
                          className={`p-3 rounded-xl border text-left transition-all ${
                            selected
                              ? "border-indigo-500 ring-2 ring-indigo-500/20 bg-indigo-500/5"
                              : "border-[var(--dm-border)] bg-[var(--dm-bg)] hover:border-[var(--dm-border-strong)]"
                          }`}
                        >
                          <div
                            className={`h-16 rounded-lg p-2 border border-black/10 ${opt.previewBg} flex flex-col justify-between mb-2.5`}
                          >
                            <div className={`h-2 w-10 rounded-full ${opt.previewBar}`} />
                            <div className={`h-6 rounded border ${opt.previewCard}`} />
                          </div>
                          <div className="flex items-center justify-between">
                            <span className="inline-flex items-center gap-1.5 text-xs font-medium">
                              <Icon className="h-3.5 w-3.5 text-indigo-400" />
                              <span>{opt.label}</span>
                            </span>
                            {selected && <Check className="h-3.5 w-3.5 text-indigo-400" />}
                          </div>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="dm-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold flex items-center gap-2">
                      <Languages className="h-4 w-4 text-indigo-400" />
                      <span>Interface Language</span>
                    </h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Switch between English and Tamil across workspace labels and navigation.
                    </p>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      { code: "en" as const, title: "English", sub: "Default workspace UI" },
                      {
                        code: "ta" as const,
                        title: "தமிழ் (Tamil)",
                        sub: "Bilingual student & portal UI",
                      },
                    ].map((lang) => {
                      const active = locale === lang.code;
                      return (
                        <button
                          key={lang.code}
                          type="button"
                          onClick={() => handleLanguageChange(lang.code)}
                          className={`p-3.5 rounded-xl border text-left flex items-center justify-between transition-colors ${
                            active
                              ? "border-indigo-500 bg-indigo-500/10"
                              : "border-[var(--dm-border)] bg-[var(--dm-bg)] hover:border-[var(--dm-border-strong)]"
                          }`}
                        >
                          <div>
                            <p className="text-sm font-medium">{lang.title}</p>
                            <p className="text-xs text-[var(--dm-muted)] mt-0.5">{lang.sub}</p>
                          </div>
                          {active && <Check className="h-4 w-4 text-indigo-400 shrink-0" />}
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="dm-card p-6 space-y-3">
                  <div>
                    <h2 className="text-base font-semibold">Workspace Behavior</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Fine-tune layout density, confirmations, and keyboard navigation.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-[var(--dm-border)]">
                    <div>
                      <p className="text-sm font-medium">Layout Density</p>
                      <p className="text-xs text-[var(--dm-muted)]">
                        Compact fits more rows and controls on smaller screens.
                      </p>
                    </div>
                    <div className="inline-flex rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] p-1 text-xs">
                      {(["comfortable", "compact"] as DensityPreference[]).map((d) => (
                        <button
                          key={d}
                          type="button"
                          onClick={() => persistPreferencePatch({ density: d })}
                          className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                            prefs.density === d
                              ? "bg-indigo-500/15 text-indigo-500 dark:text-indigo-300"
                              : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                          }`}
                        >
                          {d}
                        </button>
                      ))}
                    </div>
                  </div>

                  <SettingToggle
                    label="Confirm before moving files to Trash"
                    description="Show a confirmation prompt before moving documents to Trash (permanent deletes always confirm)."
                    checked={prefs.confirm_before_delete}
                    onChange={(val) => persistPreferencePatch({ confirm_before_delete: val })}
                  />

                  <SettingToggle
                    label="Enable Ctrl+K Quick Jump Palette"
                    description="Open the global command palette from anywhere with Ctrl+K (or Cmd+K on Mac)."
                    checked={prefs.keyboard_shortcuts_enabled}
                    onChange={(val) =>
                      persistPreferencePatch({ keyboard_shortcuts_enabled: val })
                    }
                  />
                </section>
              </div>
            )}

            {/* ACCOUNT */}
            {activeTab === "account" && (
              <div className="space-y-5">
                {!user ? (
                  <section className="dm-card p-6 space-y-5">
                    <div className="flex flex-wrap items-start justify-between gap-4">
                      <div className="flex items-start gap-3.5">
                        <div className="h-12 w-12 rounded-2xl bg-amber-500/15 border border-amber-500/30 flex items-center justify-center text-amber-400 font-semibold text-sm shrink-0">
                          GS
                        </div>
                        <div>
                          <div className="flex items-center gap-2">
                            <h2 className="text-base font-semibold">Guest Mode Session</h2>
                            <span className="text-[11px] font-mono px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-400 border border-amber-500/30">
                              {guestExpiryLabel ? `Expires in ${guestExpiryLabel}` : "1h Auto-Delete"}
                            </span>
                          </div>
                          <p className="text-xs text-[var(--dm-muted)] mt-1 leading-relaxed max-w-xl">
                            You have full access to PDF tools, AI Search, and browser-saved preferences.
                            Sign in or create a free account to sync preferences across devices, create
                            persistent folders, and keep files beyond 1 hour.
                          </p>
                        </div>
                      </div>
                    </div>

                    <div className="grid sm:grid-cols-2 gap-3 p-4 rounded-xl bg-[var(--dm-bg)] border border-[var(--dm-border)] text-xs">
                      <div className="space-y-1">
                        <p className="text-[var(--dm-muted)]">Guest Documents</p>
                        <p className="text-sm font-semibold">
                          {(docsQuery.data ?? []).length} active file(s)
                        </p>
                      </div>
                      <div className="space-y-1">
                        <p className="text-[var(--dm-muted)]">Temporary Storage Used</p>
                        <p className="text-sm font-semibold">{formatBytes(totalUsedBytes)}</p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                      <Link
                        href="/register"
                        className="dm-primary-btn px-4 py-2.5 text-xs font-medium inline-flex items-center gap-2"
                      >
                        <span>Create Free Account</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                      <Link
                        href="/login"
                        className="px-4 py-2.5 text-xs font-medium rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] hover:bg-[var(--dm-subtle)] transition-colors"
                      >
                        Sign in to existing account
                      </Link>
                    </div>
                  </section>
                ) : (
                  <>
                    <section className="dm-card p-6 space-y-5">
                      <div className="flex flex-wrap items-center justify-between gap-4 pb-4 border-b border-[var(--dm-border)]">
                        <div className="flex items-center gap-3.5">
                          <div className="h-12 w-12 rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white font-semibold text-base flex items-center justify-center shrink-0">
                            {user.full_name.slice(0, 2).toUpperCase()}
                          </div>
                          <div>
                            <div className="flex flex-wrap items-center gap-2">
                              <h2 className="text-base font-semibold">{user.full_name}</h2>
                              <span className="text-[11px] font-mono uppercase px-2 py-0.5 rounded-full bg-indigo-500/15 text-indigo-400 border border-indigo-500/25">
                                {user.role}
                              </span>
                              {user.is_student_verified && (
                                <span className="inline-flex items-center gap-1 text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                  <GraduationCap className="h-3 w-3" />
                                  <span>Verified Student</span>
                                </span>
                              )}
                            </div>
                            <p className="text-xs text-[var(--dm-muted)] mt-0.5">{user.email}</p>
                          </div>
                        </div>

                        <div className="text-right text-xs text-[var(--dm-muted)]">
                          <p>
                            Email status:{" "}
                            <span
                              className={
                                user.email_verified_at ? "text-emerald-400 font-medium" : "text-amber-400"
                              }
                            >
                              {user.email_verified_at ? "Verified" : "Pending verification"}
                            </span>
                          </p>
                          <p className="mt-0.5">
                            Joined {new Date(user.created_at).toLocaleDateString()}
                          </p>
                        </div>
                      </div>

                      <form onSubmit={saveProfile} className="space-y-4">
                        <div className="grid sm:grid-cols-2 gap-4">
                          <div className="space-y-1.5 text-xs">
                            <label className="font-medium">Display Name</label>
                            <input
                              type="text"
                              value={fullName}
                              onChange={(e) => setFullName(e.target.value)}
                              className="dm-input w-full px-3.5 py-2.5 text-sm"
                              placeholder="Your full name"
                            />
                          </div>
                          <div className="space-y-1.5 text-xs">
                            <label className="font-medium">Account Language</label>
                            <select
                              value={localeChoice}
                              onChange={(e) => setLocaleChoice(e.target.value as "en" | "ta")}
                              className="dm-input w-full px-3.5 py-2.5 text-sm"
                            >
                              <option value="en">English</option>
                              <option value="ta">தமிழ் (Tamil)</option>
                            </select>
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={savingProfile}
                          className="dm-primary-btn px-5 py-2.5 text-xs font-medium inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {savingProfile && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          <span>{savingProfile ? "Saving..." : "Save Profile"}</span>
                        </button>
                      </form>
                    </section>

                    <section className="dm-card p-6 space-y-3">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                          <HardDrive className="h-4 w-4 text-indigo-400" />
                          <h3 className="text-sm font-semibold">Vault Storage Quota</h3>
                        </div>
                        <span className="text-xs font-mono text-[var(--dm-muted)]">
                          {formatBytes(totalUsedBytes)} / {formatBytes(quotaBytes)}
                        </span>
                      </div>
                      <div className="h-2 w-full rounded-full bg-[var(--dm-border)] overflow-hidden">
                        <div
                          className="h-full rounded-full bg-gradient-to-r from-indigo-500 to-violet-500 transition-all duration-300"
                          style={{ width: `${usedPct}%` }}
                        />
                      </div>
                      <p className="text-xs text-[var(--dm-muted)]">
                        {(docsQuery.data ?? []).length} active document(s) stored with immutable v1
                        versioning and encryption at rest.
                      </p>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* AI & PERSONALIZATION */}
            {activeTab === "personalization" && (
              <div className="space-y-5">
                <section className="dm-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Response Style</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Controls tone and depth in Cited Q&amp;A and Document Summaries.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-3">
                    {RESPONSE_STYLES.map((style) => {
                      const active = prefs.ai_response_style === style.id;
                      return (
                        <button
                          key={style.id}
                          type="button"
                          onClick={() =>
                            persistPreferencePatch(
                              { ai_response_style: style.id },
                              `Response style set to ${style.label}`
                            )
                          }
                          className={`p-3.5 rounded-xl border text-left transition-colors ${
                            active
                              ? "border-indigo-500 bg-indigo-500/10"
                              : "border-[var(--dm-border)] bg-[var(--dm-bg)] hover:border-[var(--dm-border-strong)]"
                          }`}
                        >
                          <div className="flex items-center justify-between">
                            <span className="text-sm font-medium">{style.label}</span>
                            {active && <Check className="h-4 w-4 text-indigo-400" />}
                          </div>
                          <p className="text-xs text-[var(--dm-muted)] mt-1">{style.hint}</p>
                        </button>
                      );
                    })}
                  </div>
                </section>

                <section className="dm-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Custom Instructions</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Tell DocuMind AI how to format answers, what role or exam you are preparing
                      for, or language preferences to apply across Q&amp;A and Summaries.
                    </p>
                  </div>

                  <div className="flex flex-wrap gap-2">
                    {INSTRUCTION_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.id}
                        type="button"
                        onClick={() => setInstructionsDraft(tpl.text)}
                        className="text-[11px] px-2.5 py-1 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] text-[var(--dm-muted)] hover:text-[var(--dm-text)] hover:border-indigo-500/40 transition-colors"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>

                  <form onSubmit={saveCustomInstructions} className="space-y-3">
                    <textarea
                      rows={4}
                      maxLength={1500}
                      value={instructionsDraft}
                      onChange={(e) => setInstructionsDraft(e.target.value)}
                      placeholder="Example: Always answer in bullet points, highlight formulas and deadlines, and keep Tamil terms clear when translating."
                      className="dm-input w-full px-3.5 py-2.5 text-sm leading-relaxed resize-y"
                    />
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-[11px] font-mono text-[var(--dm-muted)]">
                        {instructionsDraft.length} / 1500 characters
                      </span>
                      <div className="flex items-center gap-2">
                        {instructionsDraft && (
                          <button
                            type="button"
                            onClick={() => setInstructionsDraft("")}
                            className="px-3 py-2 text-xs rounded-xl border border-[var(--dm-border)] text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                          >
                            Clear
                          </button>
                        )}
                        <button
                          type="submit"
                          disabled={savingInstructions}
                          className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {savingInstructions && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          <span>Save Instructions</span>
                        </button>
                      </div>
                    </div>
                  </form>
                </section>

                <section className="dm-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Search, Citations &amp; Agent</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Configure retrieval behavior in AI Search &amp; Cited Q&amp;A.
                    </p>
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-3 py-2 border-b border-[var(--dm-border)]">
                    <div>
                      <p className="text-sm font-medium">Default Retrieval Mode</p>
                      <p className="text-xs text-[var(--dm-muted)]">
                        Hybrid combines pgvector semantic similarity with keyword matching.
                      </p>
                    </div>
                    <div className="inline-flex rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] p-1 text-xs">
                      {(["hybrid", "semantic", "keyword"] as SearchModePreference[]).map((mode) => (
                        <button
                          key={mode}
                          type="button"
                          onClick={() => persistPreferencePatch({ default_search_mode: mode })}
                          className={`px-3 py-1.5 rounded-lg capitalize font-medium transition-colors ${
                            prefs.default_search_mode === mode
                              ? "bg-indigo-500/15 text-indigo-500 dark:text-indigo-300"
                              : "text-[var(--dm-muted)] hover:text-[var(--dm-text)]"
                          }`}
                        >
                          {mode}
                        </button>
                      ))}
                    </div>
                  </div>

                  <div className="py-2 border-b border-[var(--dm-border)] space-y-2">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">Passages Retrieved per Question</p>
                        <p className="text-xs text-[var(--dm-muted)]">
                          Higher values include broader document context in citations.
                        </p>
                      </div>
                      <span className="text-xs font-mono px-2.5 py-1 rounded-lg bg-[var(--dm-bg)] border border-[var(--dm-border)]">
                        {prefs.default_top_k} chunks
                      </span>
                    </div>
                    <input
                      type="range"
                      min={2}
                      max={12}
                      step={1}
                      value={prefs.default_top_k}
                      onChange={(e) =>
                        persistPreferencePatch({ default_top_k: Number(e.target.value) })
                      }
                      className="w-full accent-indigo-500 cursor-pointer"
                    />
                  </div>

                  <SettingToggle
                    label="Show verbatim citation snippets"
                    description="Display excerpt previews inside citation cards below AI answers."
                    checked={prefs.show_citation_snippets}
                    onChange={(val) => persistPreferencePatch({ show_citation_snippets: val })}
                  />

                  <SettingToggle
                    label="Auto-index newly uploaded documents"
                    description="Automatically extract text chunks for semantic search when uploading."
                    checked={prefs.auto_index_uploads}
                    onChange={(val) => persistPreferencePatch({ auto_index_uploads: val })}
                  />

                  <SettingToggle
                    label="Expand Agent execution logs by default"
                    description="Show live step-by-step execution trace automatically in Agent Workflows."
                    checked={prefs.agent_show_execution_log}
                    onChange={(val) => persistPreferencePatch({ agent_show_execution_log: val })}
                  />
                </section>
              </div>
            )}

            {/* STUDIO & PDF DEFAULTS */}
            {activeTab === "studio" && (
              <div className="space-y-5">
                <section className="dm-card p-6 space-y-5">
                  <div>
                    <h2 className="text-base font-semibold">PDF &amp; Student Studio Defaults</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Pre-select your favorite portal limits, OCR language, and conversion mode
                      whenever you open a tool.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-2 gap-4">
                    <div className="space-y-1.5 text-xs">
                      <label className="font-medium">Default PDF Compression Target</label>
                      <select
                        value={prefs.default_compress_kb}
                        onChange={(e) =>
                          persistPreferencePatch(
                            { default_compress_kb: Number(e.target.value) },
                            "Default compression preset updated"
                          )
                        }
                        className="dm-input w-full px-3.5 py-2.5 text-sm"
                      >
                        {COMPRESS_TARGET_PRESETS.map((p) => (
                          <option key={p.id} value={p.targetKb}>
                            {p.label} — {p.useCase}
                          </option>
                        ))}
                      </select>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="font-medium">Default OCR Language</label>
                      <select
                        value={prefs.default_ocr_lang}
                        onChange={(e) =>
                          persistPreferencePatch(
                            { default_ocr_lang: e.target.value as OcrLanguage },
                            "Default OCR language updated"
                          )
                        }
                        className="dm-input w-full px-3.5 py-2.5 text-sm"
                      >
                        <option value="eng">English (eng)</option>
                        <option value="tam">Tamil / தமிழ் (tam)</option>
                        <option value="eng+tam">Bilingual English + Tamil (eng+tam)</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="font-medium">Default Word (.docx) Conversion Mode</label>
                      <select
                        value={prefs.default_docx_mode}
                        onChange={(e) =>
                          persistPreferencePatch(
                            { default_docx_mode: e.target.value as DocxConversionMode },
                            "Default conversion mode updated"
                          )
                        }
                        className="dm-input w-full px-3.5 py-2.5 text-sm"
                      >
                        <option value="editable">Exact Editable Word</option>
                        <option value="high_fidelity">Hybrid Tight-Fit Layout</option>
                        <option value="hybrid">Text + Page Snapshot</option>
                      </select>
                    </div>

                    <div className="space-y-1.5 text-xs">
                      <label className="font-medium">Default Photo &amp; Signature Preset</label>
                      <select
                        value={prefs.default_photo_preset}
                        onChange={(e) =>
                          persistPreferencePatch(
                            { default_photo_preset: e.target.value },
                            "Default photo preset updated"
                          )
                        }
                        className="dm-input w-full px-3.5 py-2.5 text-sm"
                      >
                        {PHOTO_RESIZE_PRESETS.map((p) => (
                          <option key={p.id} value={p.id}>
                            {p.label} (max {p.maxKb} KB)
                          </option>
                        ))}
                      </select>
                    </div>
                  </div>
                </section>
              </div>
            )}

            {/* DATA & PRIVACY */}
            {activeTab === "data" && (
              <div className="space-y-5">
                <section className="dm-card p-6 space-y-4">
                  <div>
                    <h2 className="text-base font-semibold">Privacy &amp; Model Controls</h2>
                    <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                      Control how your documents, Q&amp;A history, and preferences are handled.
                    </p>
                  </div>

                  <div className="grid sm:grid-cols-3 gap-3 text-xs">
                    <div className="p-3.5 rounded-xl bg-[var(--dm-bg)] border border-[var(--dm-border)] space-y-1">
                      <p className="font-semibold text-emerald-400">Zero Model Training</p>
                      <p className="text-[var(--dm-muted)] leading-relaxed">
                        Uploaded PDFs and Q&amp;A threads are never used to train foundation models.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[var(--dm-bg)] border border-[var(--dm-border)] space-y-1">
                      <p className="font-semibold text-indigo-400">Immutable Originals</p>
                      <p className="text-[var(--dm-muted)] leading-relaxed">
                        Every tool run creates version v2+ so your original v1 upload stays intact.
                      </p>
                    </div>
                    <div className="p-3.5 rounded-xl bg-[var(--dm-bg)] border border-[var(--dm-border)] space-y-1">
                      <p className="font-semibold text-violet-400">Auto-Retention</p>
                      <p className="text-[var(--dm-muted)] leading-relaxed">
                        Guest sessions auto-purge in 1 hour; signed-in Trash restores for 30 days.
                      </p>
                    </div>
                  </div>

                  <SettingToggle
                    label="Opt out of anonymous product usage metrics"
                    description="Disable non-essential client telemetry while keeping security and pipeline logs active."
                    checked={prefs.analytics_opt_out}
                    onChange={(val) => persistPreferencePatch({ analytics_opt_out: val })}
                  />
                </section>

                <section className="dm-card p-6 space-y-4">
                  <h2 className="text-base font-semibold">Data Controls</h2>

                  {/* Export Data */}
                  <div className="flex flex-wrap items-center justify-between gap-3 py-3 border-b border-[var(--dm-border)]">
                    <div>
                      <p className="text-sm font-medium">Export Workspace Data</p>
                      <p className="text-xs text-[var(--dm-muted)]">
                        Download a JSON archive of your profile, preferences, folders, document
                        index, and Q&amp;A threads.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={handleExportData}
                      disabled={exportingData}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] text-xs font-medium hover:bg-[var(--dm-subtle)] disabled:opacity-50"
                    >
                      {exportingData ? (
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      ) : (
                        <Download className="h-3.5 w-3.5 text-indigo-400" />
                      )}
                      <span>Export JSON</span>
                    </button>
                  </div>

                  {/* Clear Q&A History */}
                  <div className="py-3 border-b border-[var(--dm-border)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Clear All Q&amp;A Chat Threads</p>
                        <p className="text-xs text-[var(--dm-muted)]">
                          Permanently delete all conversation threads in AI Search &amp; Q&amp;A.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsConfirm({ type: "clear_chats" })}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-amber-500/40 text-amber-400 text-xs font-medium hover:bg-amber-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Clear Q&amp;A History</span>
                      </button>
                    </div>
                  </div>

                  {/* Purge All Workspace Files */}
                  <div className="py-3 border-b border-[var(--dm-border)]">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div>
                        <p className="text-sm font-medium">Purge All Workspace Files Now</p>
                        <p className="text-xs text-[var(--dm-muted)]">
                          Immediately remove all uploaded documents and generated versions from
                          storage.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setSettingsConfirm({ type: "purge_files" })}
                        className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-red-500/40 text-red-400 text-xs font-medium hover:bg-red-500/10"
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                        <span>Delete All Files</span>
                      </button>
                    </div>
                  </div>

                  {/* Reset Preferences */}
                  <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                    <div>
                      <p className="text-sm font-medium">Reset Preferences to Default</p>
                      <p className="text-xs text-[var(--dm-muted)]">
                        Restore theme, AI response style, custom instructions, and studio presets.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setSettingsConfirm({ type: "reset_prefs" })}
                      className="inline-flex items-center gap-2 px-3.5 py-2 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] text-xs font-medium hover:bg-[var(--dm-subtle)]"
                    >
                      <RotateCcw className="h-3.5 w-3.5 text-indigo-400" />
                      <span>Reset Defaults</span>
                    </button>
                  </div>
                </section>
              </div>
            )}

            {/* SECURITY */}
            {activeTab === "security" && (
              <div className="space-y-5">
                {!user ? (
                  <section className="dm-card p-6 space-y-3">
                    <div className="flex items-center gap-2 text-sm font-semibold">
                      <Lock className="h-4 w-4 text-indigo-400" />
                      <span>Account Security</span>
                    </div>
                    <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
                      Password management, multi-device session revocation, and permanent account
                      deletion are available when signed in with a DocuMind account.
                    </p>
                    <div className="pt-1">
                      <Link
                        href="/login"
                        className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-2"
                      >
                        <span>Sign in or Register</span>
                        <ArrowRight className="h-3.5 w-3.5" />
                      </Link>
                    </div>
                  </section>
                ) : (
                  <>
                    {/* Change Password */}
                    <section className="dm-card p-6 space-y-4">
                      <div className="flex items-center justify-between">
                        <div>
                          <h2 className="text-base font-semibold flex items-center gap-2">
                            <KeyRound className="h-4 w-4 text-indigo-400" />
                            <span>Change Password</span>
                          </h2>
                          <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                            Use at least 8 characters. Google OAuth-only accounts do not use a local
                            password.
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowPasswords((v) => !v)}
                          className="text-xs text-[var(--dm-muted)] hover:text-[var(--dm-text)] inline-flex items-center gap-1"
                        >
                          {showPasswords ? (
                            <EyeOff className="h-3.5 w-3.5" />
                          ) : (
                            <Eye className="h-3.5 w-3.5" />
                          )}
                          <span>{showPasswords ? "Hide" : "Show"}</span>
                        </button>
                      </div>

                      <form onSubmit={handleChangePassword} className="space-y-3">
                        <div className="grid sm:grid-cols-3 gap-3">
                          <div className="space-y-1 text-xs">
                            <label className="font-medium">Current Password</label>
                            <input
                              type={showPasswords ? "text" : "password"}
                              value={currentPassword}
                              onChange={(e) => setCurrentPassword(e.target.value)}
                              className="dm-input w-full px-3 py-2 text-sm"
                              required
                            />
                          </div>
                          <div className="space-y-1 text-xs">
                            <label className="font-medium">New Password</label>
                            <input
                              type={showPasswords ? "text" : "password"}
                              value={newPassword}
                              onChange={(e) => setNewPassword(e.target.value)}
                              minLength={8}
                              className="dm-input w-full px-3 py-2 text-sm"
                              required
                            />
                          </div>
                          <div className="space-y-1 text-xs">
                            <label className="font-medium">Confirm New Password</label>
                            <input
                              type={showPasswords ? "text" : "password"}
                              value={confirmNewPassword}
                              onChange={(e) => setConfirmNewPassword(e.target.value)}
                              minLength={8}
                              className="dm-input w-full px-3 py-2 text-sm"
                              required
                            />
                          </div>
                        </div>
                        <button
                          type="submit"
                          disabled={changingPassword}
                          className="dm-primary-btn px-4 py-2 text-xs font-medium inline-flex items-center gap-2 disabled:opacity-50"
                        >
                          {changingPassword && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                          <span>Update Password</span>
                        </button>
                      </form>
                    </section>

                    {/* Active Sessions */}
                    <section className="dm-card p-6 space-y-4">
                      <div className="flex flex-wrap items-center justify-between gap-3">
                        <div>
                          <h2 className="text-base font-semibold flex items-center gap-2">
                            <Laptop className="h-4 w-4 text-indigo-400" />
                            <span>Active Sessions</span>
                          </h2>
                          <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                            Manage browsers and devices currently signed into your account.
                          </p>
                        </div>
                        {(sessionsQuery.data ?? []).length > 1 && (
                          <button
                            type="button"
                            onClick={() => setSettingsConfirm({ type: "revoke_others" })}
                            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] text-xs font-medium hover:border-red-500/40 hover:text-red-400"
                          >
                            <LogOut className="h-3.5 w-3.5" />
                            <span>Sign out all other devices</span>
                          </button>
                        )}
                      </div>

                      {sessionsQuery.isLoading ? (
                        <div className="flex items-center gap-2 text-xs text-[var(--dm-muted)] py-3">
                          <Loader2 className="h-4 w-4 animate-spin text-indigo-400" />
                          <span>Loading active sessions...</span>
                        </div>
                      ) : (sessionsQuery.data ?? []).length === 0 ? (
                        <p className="text-xs text-[var(--dm-muted)]">No active sessions found.</p>
                      ) : (
                        <div className="space-y-2">
                          {(sessionsQuery.data ?? []).map((sess) => (
                            <div
                              key={sess.id}
                              className="flex flex-wrap items-center justify-between gap-3 p-3 rounded-xl border border-[var(--dm-border)] bg-[var(--dm-bg)] text-xs"
                            >
                              <div className="space-y-0.5 min-w-0">
                                <div className="flex items-center gap-2">
                                  <span className="font-medium">
                                    {summarizeUserAgent(sess.user_agent)}
                                  </span>
                                  {sess.is_current && (
                                    <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-400 border border-emerald-500/25">
                                      Current
                                    </span>
                                  )}
                                </div>
                                <p className="text-[11px] text-[var(--dm-muted)] font-mono">
                                  {sess.ip_address ? `IP ${sess.ip_address} • ` : ""}
                                  Signed in {new Date(sess.created_at).toLocaleDateString()} • Expires{" "}
                                  {new Date(sess.expires_at).toLocaleDateString()}
                                </p>
                              </div>
                              {!sess.is_current && (
                                <button
                                  type="button"
                                  onClick={() =>
                                    setSettingsConfirm({
                                      type: "revoke_session",
                                      sessionId: sess.id,
                                      label: summarizeUserAgent(sess.user_agent),
                                    })
                                  }
                                  className="px-3 py-1.5 rounded-lg border border-[var(--dm-border)] text-red-400 hover:bg-red-500/10"
                                >
                                  Revoke
                                </button>
                              )}
                            </div>
                          ))}
                        </div>
                      )}
                    </section>

                    {/* Danger Zone */}
                    <section className="dm-card p-6 border-red-500/30 bg-red-500/5 space-y-3">
                      <div className="flex items-center gap-2 text-red-400 text-sm font-semibold">
                        <ShieldAlert className="h-4 w-4" />
                        <span>Danger Zone (GDPR / DPDP Permanent Deletion)</span>
                      </div>
                      <p className="text-xs text-[var(--dm-muted)] leading-relaxed">
                        Permanently deletes your account, all uploaded documents, versions, Q&amp;A
                        threads, and thumbnails immediately. This cannot be undone.
                      </p>
                      <button
                        type="button"
                        onClick={() => setSettingsConfirm({ type: "delete_account" })}
                        className="px-4 py-2 text-xs font-medium rounded-xl border border-red-500/40 text-red-400 hover:bg-red-500/10"
                      >
                        Delete My Account
                      </button>
                    </section>
                  </>
                )}
              </div>
            )}

            {/* KEYBOARD SHORTCUTS */}
            {activeTab === "shortcuts" && (
              <section className="dm-card p-6 space-y-4">
                <div>
                  <h2 className="text-base font-semibold">Keyboard Shortcuts</h2>
                  <p className="text-xs text-[var(--dm-muted)] mt-0.5">
                    Navigate DocuMind Studio faster without leaving your keyboard.
                  </p>
                </div>

                <div className="divide-y divide-[var(--dm-border)] text-sm">
                  {[
                    {
                      action: "Open Quick Jump Command Palette",
                      keys: ["Ctrl", "K"],
                      note: "Cmd + K on macOS",
                    },
                    {
                      action: "Close Command Palette or Active Modal",
                      keys: ["Esc"],
                      note: "",
                    },
                    {
                      action: "Submit Q&A Question or Search Query",
                      keys: ["Enter"],
                      note: "Inside input bar",
                    },
                    {
                      action: "Navigate Command Palette Items",
                      keys: ["Up", "Down"],
                      note: "Arrow keys",
                    },
                  ].map((item) => (
                    <div
                      key={item.action}
                      className="flex flex-wrap items-center justify-between gap-3 py-3"
                    >
                      <div>
                        <p className="font-medium text-sm">{item.action}</p>
                        {item.note && (
                          <p className="text-xs text-[var(--dm-muted)]">{item.note}</p>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        {item.keys.map((k) => (
                          <kbd
                            key={k}
                            className="font-mono text-xs px-2 py-1 rounded-lg border border-[var(--dm-border)] bg-[var(--dm-bg)] text-[var(--dm-text)]"
                          >
                            {k}
                          </kbd>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            )}
          </div>
        </div>
      </div>

      <ConfirmDialog
        open={settingsConfirm !== null}
        title={
          settingsConfirm?.type === "clear_chats"
            ? "Are you sure you want to clear all Q&A chat threads?"
            : settingsConfirm?.type === "purge_files"
              ? "Are you sure you want to delete all workspace files?"
              : settingsConfirm?.type === "reset_prefs"
                ? "Are you sure you want to reset all preferences to default?"
                : settingsConfirm?.type === "revoke_session"
                  ? `Are you sure you want to revoke "${settingsConfirm.label}"?`
                  : settingsConfirm?.type === "revoke_others"
                    ? "Are you sure you want to sign out of all other devices?"
                    : "Are you sure you want to permanently delete your account?"
        }
        description={
          settingsConfirm?.type === "clear_chats"
            ? "All conversation threads and cited answers in AI Search & Q&A will be permanently deleted."
            : settingsConfirm?.type === "purge_files"
              ? "All uploaded documents, versions, and generated assets in your workspace will be permanently deleted immediately."
              : settingsConfirm?.type === "reset_prefs"
                ? "Your theme, AI response style, custom instructions, and studio defaults will be restored to factory settings."
                : settingsConfirm?.type === "revoke_session"
                  ? "This device will be signed out immediately and will need to sign in again."
                  : settingsConfirm?.type === "revoke_others"
                    ? "Every other signed-in browser and device will be logged out immediately."
                    : "Your account, all uploaded documents, versions, Q&A threads, and thumbnails will be permanently deleted immediately. This cannot be undone."
        }
        confirmLabel={
          settingsConfirm?.type === "clear_chats"
            ? "Yes, Clear Q&A History"
            : settingsConfirm?.type === "purge_files"
              ? "Yes, Delete All Files"
              : settingsConfirm?.type === "reset_prefs"
                ? "Yes, Reset Defaults"
                : settingsConfirm?.type === "revoke_session"
                  ? "Yes, Revoke Session"
                  : settingsConfirm?.type === "revoke_others"
                    ? "Yes, Sign Out Others"
                    : "Yes, Delete My Account"
        }
        variant={
          settingsConfirm?.type === "clear_chats" || settingsConfirm?.type === "reset_prefs"
            ? "warning"
            : "danger"
        }
        requireConfirmText={settingsConfirm?.type === "delete_account" ? "DELETE" : undefined}
        loading={confirmBusy}
        onCancel={() => setSettingsConfirm(null)}
        onConfirm={async () => {
          if (!settingsConfirm) return;
          setConfirmBusy(true);
          try {
            if (settingsConfirm.type === "clear_chats") {
              await handleClearQaHistory();
            } else if (settingsConfirm.type === "purge_files") {
              await handlePurgeWorkspaceFiles();
            } else if (settingsConfirm.type === "reset_prefs") {
              await handleResetPreferences();
            } else if (settingsConfirm.type === "revoke_session") {
              await handleRevokeSession(settingsConfirm.sessionId);
            } else if (settingsConfirm.type === "revoke_others") {
              await handleRevokeOtherSessions();
            } else if (settingsConfirm.type === "delete_account") {
              await handleDeleteAccount();
            }
            setSettingsConfirm(null);
          } finally {
            setConfirmBusy(false);
          }
        }}
      />
    </AppShell>
  );
}
