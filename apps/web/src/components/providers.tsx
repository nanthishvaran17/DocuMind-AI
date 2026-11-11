"use client";

import React, { createContext, useContext, useEffect, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AlertCircle, CheckCircle2, Info, WifiOff, X } from "lucide-react";
import { useT } from "@/lib/i18n";

export interface ToastItem {
  id: string;
  title: string;
  description?: string;
  variant?: "success" | "error" | "info";
}

interface ToastContextValue {
  pushToast: (toast: Omit<ToastItem, "id">) => void;
}

const ToastContext = createContext<ToastContextValue>({ pushToast: () => undefined });

export function useToast() {
  return useContext(ToastContext);
}

export function Providers({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 15_000,
            retry: 1,
          },
        },
      })
  );
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const [isOffline, setIsOffline] = useState(false);
  const { t } = useT();

  const pushToast = (toast: Omit<ToastItem, "id">) => {
    const id = Math.random().toString(36).slice(2);
    setToasts((prev) => [...prev, { ...toast, id }]);
    setTimeout(() => {
      setToasts((prev) => prev.filter((item) => item.id !== id));
    }, 4500);
  };

  useEffect(() => {
    setIsOffline(!navigator.onLine);
    const goOffline = () => setIsOffline(true);
    const goOnline = () => setIsOffline(false);
    window.addEventListener("offline", goOffline);
    window.addEventListener("online", goOnline);

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
    return () => {
      window.removeEventListener("offline", goOffline);
      window.removeEventListener("online", goOnline);
    };
  }, []);

  return (
    <ThemeProvider attribute="class" defaultTheme="dark" enableSystem>
      <QueryClientProvider client={queryClient}>
        <ToastContext.Provider value={{ pushToast }}>
          {isOffline && (
            <div
              role="status"
              className="sticky top-0 z-50 flex items-center justify-center gap-2 bg-amber-500/15 border-b border-amber-500/30 px-4 py-2 text-xs text-amber-500 dark:text-amber-300 backdrop-blur-md"
            >
              <WifiOff className="h-3.5 w-3.5" />
              <span>{t.app.offlineBanner}</span>
            </div>
          )}
          {children}
          <div
            aria-live="polite"
            className="fixed bottom-20 md:bottom-5 right-4 z-50 flex flex-col gap-2.5 max-w-sm w-full pointer-events-none px-4 sm:px-0"
          >
            {toasts.map((item) => {
              const borderAccent =
                item.variant === "success"
                  ? "border-l-emerald-500"
                  : item.variant === "error"
                    ? "border-l-red-500"
                    : "border-l-indigo-500";
              return (
                <div
                  key={item.id}
                  className={`pointer-events-auto dm-elevated border-l-4 ${borderAccent} p-3.5 flex items-start gap-3 backdrop-blur-xl`}
                >
                  {item.variant === "success" && (
                    <CheckCircle2 className="h-4 w-4 text-emerald-500 shrink-0 mt-0.5" />
                  )}
                  {item.variant === "error" && (
                    <AlertCircle className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                  )}
                  {(!item.variant || item.variant === "info") && (
                    <Info className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium leading-snug">{item.title}</p>
                    {item.description && (
                      <p className="text-xs text-[var(--dm-muted)] mt-0.5 leading-relaxed">
                        {item.description}
                      </p>
                    )}
                  </div>
                  <button
                    type="button"
                    onClick={() => setToasts((p) => p.filter((x) => x.id !== item.id))}
                    className="text-[var(--dm-muted)] hover:text-[var(--dm-text)] p-0.5 rounded"
                    aria-label="Close notification"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              );
            })}
          </div>
        </ToastContext.Provider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}
