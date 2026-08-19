"use client";

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";
import { cn } from "@/lib/cn";

type ToastTone = "neutro" | "entrada" | "alerta";

type Toast = {
  id: number;
  message: string;
  tone: ToastTone;
};

type ToastContextValue = {
  notify: (message: string, tone?: ToastTone) => void;
};

const TONE_CLASS: Record<ToastTone, string> = {
  neutro: "bg-linha-forte",
  entrada: "bg-entrada-fill",
  alerta: "bg-alerta-fill",
};

const DISMISS_AFTER_MS = 4000;

const ToastContext = createContext<ToastContextValue | null>(null);

export function useToast(): ToastContextValue {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast precisa estar dentro de <ToastProvider>.");
  return context;
}

type ToastProviderProps = {
  children: ReactNode;
};

export function ToastProvider({ children }: ToastProviderProps) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const notify = useCallback((message: string, tone: ToastTone = "neutro") => {
    const id = Date.now() + Math.random();
    setToasts((current) => [...current, { id, message, tone }]);
    window.setTimeout(
      () => setToasts((current) => current.filter((toast) => toast.id !== id)),
      DISMISS_AFTER_MS,
    );
  }, []);

  const value = useMemo(() => ({ notify }), [notify]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div
        role="status"
        aria-live="polite"
        className="pointer-events-none fixed inset-x-4 bottom-4 z-50 flex flex-col items-stretch gap-2 sm:right-6 sm:left-auto sm:w-80"
      >
        {toasts.map((toast) => (
          <div
            key={toast.id}
            className="border-linha bg-superficie-alta shadow-elevado pointer-events-auto flex overflow-hidden rounded-md border"
          >
            <span aria-hidden className={cn("w-1 shrink-0", TONE_CLASS[toast.tone])} />
            <p className="px-4 py-3 text-sm">{toast.message}</p>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
