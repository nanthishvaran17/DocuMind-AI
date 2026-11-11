"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { UserPreferences } from "@documind/types";

export const DEFAULT_USER_PREFERENCES: UserPreferences = {
  theme: "dark",
  density: "comfortable",
  ai_response_style: "balanced",
  custom_instructions: "",
  default_search_mode: "hybrid",
  default_top_k: 6,
  show_citation_snippets: true,
  auto_index_uploads: true,
  agent_show_execution_log: false,
  default_compress_kb: 200,
  default_ocr_lang: "eng",
  default_docx_mode: "editable",
  default_photo_preset: "passport_india",
  confirm_before_delete: true,
  keyboard_shortcuts_enabled: true,
  analytics_opt_out: false,
};

interface PreferencesState extends UserPreferences {
  hydratedFromServer: boolean;
  updatePreferences: (patch: Partial<UserPreferences>) => void;
  hydrateFromServer: (prefs: Partial<UserPreferences>) => void;
  resetPreferences: () => void;
}

export const usePreferencesStore = create<PreferencesState>()(
  persist(
    (set) => ({
      ...DEFAULT_USER_PREFERENCES,
      hydratedFromServer: false,
      updatePreferences: (patch) => set((state) => ({ ...state, ...patch })),
      hydrateFromServer: (prefs) =>
        set((state) => ({
          ...state,
          ...prefs,
          hydratedFromServer: true,
        })),
      resetPreferences: () =>
        set({
          ...DEFAULT_USER_PREFERENCES,
          hydratedFromServer: false,
        }),
    }),
    {
      name: "documind-preferences",
      partialize: (state) => ({
        theme: state.theme,
        density: state.density,
        ai_response_style: state.ai_response_style,
        custom_instructions: state.custom_instructions,
        default_search_mode: state.default_search_mode,
        default_top_k: state.default_top_k,
        show_citation_snippets: state.show_citation_snippets,
        auto_index_uploads: state.auto_index_uploads,
        agent_show_execution_log: state.agent_show_execution_log,
        default_compress_kb: state.default_compress_kb,
        default_ocr_lang: state.default_ocr_lang,
        default_docx_mode: state.default_docx_mode,
        default_photo_preset: state.default_photo_preset,
        confirm_before_delete: state.confirm_before_delete,
        keyboard_shortcuts_enabled: state.keyboard_shortcuts_enabled,
        analytics_opt_out: state.analytics_opt_out,
      }),
    }
  )
);
