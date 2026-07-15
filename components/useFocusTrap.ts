"use client";

import { useEffect, useRef } from "react";

const FOCUSABLE_SELECTOR = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "textarea:not([disabled])",
  "select:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(", ");

/**
 * Hand-rolled focus trap for modal dialogs and drawers (no dependencies).
 *
 * While `active` is true and the returned ref is attached:
 * - focus moves into the dialog on open (first focusable, or the container
 *   itself when `initialFocus` is "container" — give it tabIndex={-1});
 * - Tab / Shift+Tab cycle inside the dialog;
 * - on close/unmount, focus returns to the element focused before opening.
 *
 * Escape handling stays with each dialog's own keyboard logic.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean = true,
  initialFocus: "first" | "container" = "first"
) {
  const ref = useRef<T | null>(null);

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;

    const focusables = () =>
      Array.from(node.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
        (el) => el.offsetParent !== null
      );

    if (initialFocus === "container") node.focus();
    else (focusables()[0] ?? node).focus();

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Tab") return;
      const els = focusables();
      if (els.length === 0) {
        e.preventDefault();
        node.focus();
        return;
      }
      const current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      const inside = current !== null && node.contains(current);
      const first = els[0];
      const last = els[els.length - 1];
      if (e.shiftKey) {
        if (!inside || current === first || current === node) {
          e.preventDefault();
          last.focus();
        }
      } else if (!inside || current === last) {
        e.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("keydown", onKeyDown, true);
      previous?.focus();
    };
  }, [active, initialFocus]);

  return ref;
}
