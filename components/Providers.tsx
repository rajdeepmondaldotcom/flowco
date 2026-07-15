"use client";

import { ToastProvider } from "./Toast";
import { DisplayCurrencyProvider } from "./DisplayCurrency";

export default function Providers({ children }: { children: React.ReactNode }) {
  return (
    <DisplayCurrencyProvider>
      <ToastProvider>{children}</ToastProvider>
    </DisplayCurrencyProvider>
  );
}
