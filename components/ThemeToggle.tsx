"use client";

import { useCallback, useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";

const KEY = "flowco-theme";
const THEME_EVENT = "flowco-theme-change";

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "dark" || saved === "light" || saved === "system") return saved;
  } catch {}
  return "system";
}

function resolvedIsDark(t: Theme): boolean {
  if (t === "dark") return true;
  if (t === "light") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

// The theme lives outside React (localStorage + the data-theme attribute set by
// the no-flash script in layout.tsx), so it's read via useSyncExternalStore:
// server snapshot renders the default, the client snapshot takes over on mount.
function subscribe(onChange: () => void): () => void {
  const mql = window.matchMedia("(prefers-color-scheme: dark)");
  mql.addEventListener("change", onChange);
  window.addEventListener(THEME_EVENT, onChange);
  return () => {
    mql.removeEventListener("change", onChange);
    window.removeEventListener(THEME_EVENT, onChange);
  };
}

function apply(t: Theme) {
  const root = document.documentElement;
  if (t === "system") root.removeAttribute("data-theme");
  else root.setAttribute("data-theme", t);
}

export default function ThemeToggle() {
  const dark = useSyncExternalStore(
    subscribe,
    () => resolvedIsDark(readTheme()),
    () => false
  );

  const toggle = useCallback(() => {
    const next: Theme = dark ? "light" : "dark";
    try {
      localStorage.setItem(KEY, next);
    } catch {}
    apply(next);
    window.dispatchEvent(new Event(THEME_EVENT));
  }, [dark]);

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-soft transition hover:bg-paper"
      aria-label={dark ? "Switch to light theme" : "Switch to dark theme"}
      title={dark ? "Switch to light theme" : "Switch to dark theme"}
    >
      {dark ? (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <circle cx="12" cy="12" r="4" />
          <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
        </svg>
      ) : (
        <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      )}
    </button>
  );
}
