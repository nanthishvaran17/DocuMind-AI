"use client";

import en from "../../messages/en.json";
import ta from "../../messages/ta.json";
import { useAuthStore } from "@/stores/auth-store";

const DICTIONARIES = { en, ta } as const;

export function useT() {
  const locale = useAuthStore((s) => s.locale);
  const setLocale = useAuthStore((s) => s.setLocale);
  return {
    locale,
    setLocale,
    t: DICTIONARIES[locale] ?? DICTIONARIES.en,
  };
}
