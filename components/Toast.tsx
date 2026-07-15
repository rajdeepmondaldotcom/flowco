"use client";

import { createContext, useCallback, useContext, useRef, useState } from "react";

type Tone = "default" | "success" | "danger" | "flag";

export interface ToastOptions {
  title: string;
  description?: string;
  tone?: Tone;
  duration?: number; // ms; 0 = sticky
  action?: { label: string; onClick: () => void };
}

interface ToastItem extends ToastOptions {
  id: number;
}

const ToastCtx = createContext<(o: ToastOptions) => void>(() => {});

export function useToast() {
  return useContext(ToastCtx);
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const idRef = useRef(0);
  const timers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());

  const dismiss = useCallback((id: number) => {
    setItems((prev) => prev.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) clearTimeout(t);
    timers.current.delete(id);
  }, []);

  const toast = useCallback(
    (o: ToastOptions) => {
      const id = ++idRef.current;
      setItems((prev) => [...prev.slice(-3), { ...o, id }]);
      const duration = o.duration ?? 6000;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration)
        );
      }
    },
    [dismiss]
  );

  return (
    <ToastCtx.Provider value={toast}>
      {children}
      <div
        className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex flex-col items-center gap-2 px-4 pb-6"
        role="region"
        aria-live="polite"
        aria-label="Notifications"
      >
        {items.map((t) => (
          <ToastCard key={t.id} item={t} onDismiss={() => dismiss(t.id)} />
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

function ToastCard({ item, onDismiss }: { item: ToastItem; onDismiss: () => void }) {
  const accent =
    item.tone === "success"
      ? "text-clear"
      : item.tone === "danger"
        ? "text-danger"
        : item.tone === "flag"
          ? "text-flag"
          : "text-accent";
  const dot =
    item.tone === "success"
      ? "bg-clear"
      : item.tone === "danger"
        ? "bg-danger"
        : item.tone === "flag"
          ? "bg-flag"
          : "bg-accent";
  return (
    <div
      className="toast-in shadow-float pointer-events-auto flex w-full max-w-md items-center gap-3 rounded-xl border border-line bg-surface px-4 py-3"
      role="status"
    >
      <span className={`h-2 w-2 shrink-0 rounded-full ${dot}`} />
      <div className="min-w-0 flex-1">
        <div className={`text-sm font-semibold ${accent}`}>{item.title}</div>
        {item.description && <div className="truncate text-xs text-ink-soft">{item.description}</div>}
      </div>
      {item.action && (
        <button
          onClick={() => {
            item.action!.onClick();
            onDismiss();
          }}
          className="shrink-0 rounded-md border border-line-strong px-2.5 py-1 text-xs font-semibold text-ink hover:bg-paper"
        >
          {item.action.label}
        </button>
      )}
      <button
        onClick={onDismiss}
        className="shrink-0 rounded p-1 text-ink-faint hover:text-ink"
        aria-label="Dismiss"
      >
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M6 6l12 12M18 6L6 18" />
        </svg>
      </button>
    </div>
  );
}
