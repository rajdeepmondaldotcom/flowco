"use client";

import { createContext, useCallback, useContext, useSyncExternalStore } from "react";
import { fmtDisplay, type DisplayCurrency } from "@/lib/currency";

// A viewer-chosen display currency (USD or INR) so the whole console reads in
// one currency. The underlying data is always USD; this only changes display.
type Ctx = { ccy: DisplayCurrency; setCcy: (c: DisplayCurrency) => void; toggle: () => void };
const CurrencyContext = createContext<Ctx>({ ccy: "USD", setCcy: () => {}, toggle: () => {} });

const KEY = "flowco-display-ccy";
const CCY_EVENT = "flowco-ccy-change";

// The preference lives in localStorage (an external store), so it's read via
// useSyncExternalStore: the server snapshot renders USD, the client snapshot
// takes over on mount — no setState-in-effect, no hydration mismatch.
function readCcy(): DisplayCurrency {
  try {
    const saved = localStorage.getItem(KEY);
    if (saved === "USD" || saved === "INR") return saved;
  } catch {}
  return "USD";
}

function subscribe(onChange: () => void): () => void {
  window.addEventListener(CCY_EVENT, onChange);
  return () => window.removeEventListener(CCY_EVENT, onChange);
}

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const ccy = useSyncExternalStore(subscribe, readCcy, () => "USD" as DisplayCurrency);

  const setCcy = useCallback((c: DisplayCurrency) => {
    try {
      localStorage.setItem(KEY, c);
    } catch {}
    window.dispatchEvent(new Event(CCY_EVENT));
  }, []);

  const toggle = useCallback(() => setCcy(readCcy() === "USD" ? "INR" : "USD"), [setCcy]);

  return <CurrencyContext.Provider value={{ ccy, setCcy, toggle }}>{children}</CurrencyContext.Provider>;
}

export function useDisplayCurrency() {
  return useContext(CurrencyContext);
}

// A formatter bound to the current display currency: money(usdAmount) -> string.
export function useMoney() {
  const { ccy } = useContext(CurrencyContext);
  return useCallback((usd: number) => fmtDisplay(usd, ccy), [ccy]);
}
