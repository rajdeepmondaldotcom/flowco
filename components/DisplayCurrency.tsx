"use client";

import { createContext, useCallback, useContext, useEffect, useState } from "react";
import { fmtDisplay, type DisplayCurrency } from "@/lib/currency";

// A viewer-chosen display currency (USD or INR) so the whole console reads in
// one currency. The underlying data is always USD; this only changes display.
type Ctx = { ccy: DisplayCurrency; setCcy: (c: DisplayCurrency) => void; toggle: () => void };
const CurrencyContext = createContext<Ctx>({ ccy: "USD", setCcy: () => {}, toggle: () => {} });

const KEY = "flowco-display-ccy";

export function DisplayCurrencyProvider({ children }: { children: React.ReactNode }) {
  const [ccy, setCcyState] = useState<DisplayCurrency>("USD");

  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY);
      if (saved === "USD" || saved === "INR") setCcyState(saved);
    } catch {}
  }, []);

  const setCcy = useCallback((c: DisplayCurrency) => {
    setCcyState(c);
    try {
      localStorage.setItem(KEY, c);
    } catch {}
  }, []);

  const toggle = useCallback(() => setCcy(ccy === "USD" ? "INR" : "USD"), [ccy, setCcy]);

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
