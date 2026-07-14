// Single source of truth for currency. FlowCo reimburses in USD; people pay in
// their local currency (INR for the India team, SGD on a Singapore trip). Every
// receipt is converted to USD at these reference rates, and the claim `total`
// on an Expense is ALWAYS in USD. This module is client-safe (no server deps)
// so the API, the triage engine, and the UI all use the same numbers.
//
// Rates are the live mid-market reference rates as of 2026-07-14. Keep them in
// sync with data/policy.json fxToUsd. Our use case is USD, INR, SGD. When these
// change, update policy.json to match and reprice data/expenses.json (the seed
// USD totals are derived from the receipts' native amounts at these rates).

export const FX_TO_USD: Record<string, number> = {
  USD: 1,
  INR: 0.01045, // 1 USD ≈ 95.7 INR
  SGD: 0.7728, // 1 USD ≈ 1.294 SGD
};

export const CURRENCY_SYMBOL: Record<string, string> = {
  USD: "$",
  INR: "₹",
  SGD: "S$",
};

// Currencies we let a viewer switch the whole console into.
export const DISPLAY_CURRENCIES = ["USD", "INR"] as const;
export type DisplayCurrency = (typeof DISPLAY_CURRENCIES)[number];

export function isKnownCurrency(code: string): boolean {
  return code in FX_TO_USD;
}

// Convert an amount in `from` currency to USD.
export function toUsd(amount: number, from: string): number {
  const r = FX_TO_USD[from];
  if (r === undefined) return amount; // unknown currency: assume already USD
  return Math.round(amount * r * 1e6) / 1e6;
}

// Convert a USD amount into another currency (for display toggles).
export function fromUsd(usd: number, to: string): number {
  const r = FX_TO_USD[to];
  if (r === undefined || r === 0) return usd;
  return usd / r;
}

// Round a currency amount to its natural number of decimals (INR shows whole
// rupees once it's more than a few; USD/SGD show cents).
function round(amount: number, code: string): number {
  if (code === "INR") return amount >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  return Math.round(amount * 100) / 100;
}

// Format an amount that is already in `code` currency, e.g. fmt(1950,"INR") -> "₹1,950".
export function fmt(amount: number, code = "USD"): string {
  const sym = CURRENCY_SYMBOL[code] ?? `${code} `;
  const rounded = round(amount, code);
  const locale = code === "INR" ? "en-IN" : "en-US";
  const decimals = code === "INR" && rounded >= 100 ? 0 : 2;
  return sym + rounded.toLocaleString(locale, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
}

// Format a USD amount shown in the viewer's chosen display currency.
export function fmtDisplay(usd: number, display: string): string {
  if (display === "USD") return fmt(usd, "USD");
  return fmt(fromUsd(usd, display), display);
}
