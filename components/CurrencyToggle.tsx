"use client";

import { useDisplayCurrency } from "./DisplayCurrency";

// A segmented USD / INR control. The whole console reads in the chosen currency.
export default function CurrencyToggle() {
  const { ccy, setCcy } = useDisplayCurrency();
  return (
    <div
      className="flex shrink-0 items-center overflow-hidden rounded-md border border-line-strong text-[12px] font-semibold"
      role="group"
      aria-label="Display currency"
      title="Show all amounts in USD or INR"
    >
      {(["USD", "INR"] as const).map((c) => (
        <button
          key={c}
          onClick={() => setCcy(c)}
          aria-pressed={ccy === c}
          className={`px-2 py-1.5 text-[11px] transition sm:px-2.5 sm:text-[12px] ${
            ccy === c ? "bg-accent text-white" : "text-ink-soft hover:bg-paper"
          }`}
        >
          {c}
        </button>
      ))}
    </div>
  );
}
