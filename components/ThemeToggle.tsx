"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";

function resolvedIsDark(t: Theme): boolean {
  if (t === "dark") return true;
  if (t === "light") return false;
  return typeof window !== "undefined" && window.matchMedia("(prefers-color-scheme: dark)").matches;
}

export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("system");
  const [dark, setDark] = useState(false);

  useEffect(() => {
    const saved = (localStorage.getItem("flowco-theme") as Theme) || "system";
    setTheme(saved);
    setDark(resolvedIsDark(saved));
    apply(saved);
  }, []);

  const apply = (t: Theme) => {
    const root = document.documentElement;
    if (t === "system") root.removeAttribute("data-theme");
    else root.setAttribute("data-theme", t);
  };

  const toggle = () => {
    const next: Theme = resolvedIsDark(theme) ? "light" : "dark";
    setTheme(next);
    setDark(next === "dark");
    localStorage.setItem("flowco-theme", next);
    apply(next);
  };

  return (
    <button
      onClick={toggle}
      className="flex h-8 w-8 items-center justify-center rounded-md border border-line text-ink-soft transition hover:bg-paper"
      aria-label="Toggle light/dark theme"
      title="Toggle theme"
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
