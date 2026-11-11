"use client";

import { create } from "zustand";
import { persist } from "zustand/middleware";
import type { AuthSession, Locale, User } from "@documind/types";

interface AuthState {
  accessToken: string | null;
  isGuest: boolean;
  guestExpiresAt: string | null;
  user: User | null;
  csrfToken: string | null;
  locale: Locale;
  setSession: (session: AuthSession) => void;
  setUser: (user: User | null) => void;
  setLocale: (locale: Locale) => void;
  clearSession: () => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      accessToken: null,
      isGuest: false,
      guestExpiresAt: null,
      user: null,
      csrfToken: null,
      locale: "en",
      setSession: (session) =>
        set({
          accessToken: session.access_token,
          isGuest: session.is_guest,
          guestExpiresAt: session.guest_expires_at,
          user: session.user,
          csrfToken: session.csrf_token,
        }),
      setUser: (user) => set({ user }),
      setLocale: (locale) => set({ locale }),
      clearSession: () =>
        set({
          accessToken: null,
          isGuest: false,
          guestExpiresAt: null,
          user: null,
          csrfToken: null,
        }),
    }),
    {
      name: "documind-auth",
    }
  )
);
