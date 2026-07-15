import type { CheckStatus, TriagedExpense } from "@/lib/types";
import { fmt, fromUsd, isKnownCurrency } from "@/lib/currency";

export const fmtMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

// A malformed date string must never crash a render: show it raw instead.
export const fmtDate = (iso: string) => {
  const d = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(d);
};

export const fmtDateTime = (iso: string) => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(d);
};

// Plain-English tooltip for each flag — recognition over recall.
export const FLAG_EXPLAIN: Record<string, string> = {
  alcohol: "The receipt has a drink on it. Policy does not pay for drinks. The assistant took it off the total.",
  "personal item": "The receipt has a personal item on it. The assistant took it off the total.",
  "wrong category": "The category does not fit the shop. It may be picked to slip under a lower cap.",
  "over cap": "The amount is over this category's cap.",
  "over $1,000": "Anything over $1,000 always goes to a manager.",
  "possible duplicate": "Same person, same shop, close in time. It could be a double charge or a split receipt.",
  "missing receipt": "No receipt attached. One is required over $25.",
  "wrong cost center": "Coded to a cost center that does not match the person's team.",
  "foreign currency": "The receipt is in foreign money, converted to dollars at the set rate. A clean conversion does not stop a case. Bad math does.",
  "ambiguous receipt": "The receipt and the claim do not quite match.",
  "not a receipt": "The file is not a receipt at all. A poster, a screenshot, or a random file. The assistant refused to make up a number.",
  "date mismatch": "The date on the receipt does not match the claim. Worth a look.",
  "needs a look": "The assistant found a judgment call a person should confirm. Its reason is inside.",
  "low confidence": "The assistant was not sure enough to clear this on its own.",
};

// The receipt's amount in its own currency, for any currency (₹1,950, S$225, $45).
export function nativeReceiptAmount(e: { total: number; receiptCurrency: string }): string {
  const ccy = isKnownCurrency(e.receiptCurrency) ? e.receiptCurrency : "USD";
  return fmt(fromUsd(e.total, ccy), ccy);
}

const ALCOHOL_RE = /alcohol|wine|beer|cocktail|spirit|liquor|\bbar\b|mudslide|vodka|whisk|\brum\b|\bgin\b|tequila/i;

// Which flag types apply to a triaged expense — drives the badges in the review lane.
export function flagsFor(e: TriagedExpense): string[] {
  const flags: string[] = [];
  if (!e.checks || !e.aiVerdict) return flags;
  const v = e.aiVerdict;
  if (v.engine !== "mock" && v.nonReimbursable && v.nonReimbursable.subtotalExcluded > 0.005) {
    const txt = v.nonReimbursable.items.map((i) => i.description).join(" ") + " " + v.nonReimbursable.note;
    flags.push(ALCOHOL_RE.test(txt) ? "alcohol" : "personal item");
  }
  if (v.engine !== "mock" && v.categoryLooksWrong) flags.push("wrong category");
  if (e.checks.policyCap.status === "fail") flags.push("over cap");
  if (e.checks.amountLimit.status === "fail") flags.push("over $1,000");
  if (e.checks.duplicate.status === "warn") flags.push("possible duplicate");
  if (e.checks.receiptPresence.status === "fail") flags.push("missing receipt");
  if (e.checks.costCenter.status === "warn") flags.push("wrong cost center");
  if (e.checks.currency.status === "warn") flags.push("foreign currency");
  if (v.engine !== "mock" && v.receiptMatch.status === "not_a_receipt") flags.push("not a receipt");
  if (
    v.engine !== "mock" &&
    (v.receiptMatch.status === "mismatch" || v.receiptMatch.status === "uncertain")
  )
    flags.push("ambiguous receipt");
  if (v.engine !== "mock" && v.dateNote.trim()) flags.push("date mismatch");
  // Catch-all so every routed-to-human row carries at least one chip: if the
  // model sent it to a human for a judgment call no specific flag captured
  // (e.g. a double gratuity), surface that rather than showing a bare row.
  if (flags.length === 0) {
    if (v.confidence < 0.8) flags.push("low confidence");
    else if (v.verdict === "needs_human") flags.push("needs a look");
  }
  return flags;
}

export function StatusChip({ status }: { status: TriagedExpense["status"] }) {
  const styles: Record<string, { label: string; cls: string }> = {
    pending: { label: "Awaiting triage", cls: "bg-neutral-chip text-ink-soft" },
    triaged: { label: "Triaged", cls: "bg-accent-soft text-accent" },
    approved: { label: "Approved", cls: "bg-clear-soft text-clear" },
    rejected: { label: "Rejected", cls: "bg-danger-soft text-danger" },
    info_requested: { label: "Info requested", cls: "bg-flag-soft text-flag" },
  };
  const s = styles[status];
  return <span className={`chip ${s.cls}`}>{s.label}</span>;
}

export function FlagChip({ label }: { label: string }) {
  return <span className="chip bg-flag-soft text-flag">{label}</span>;
}

export function EngineChip({ engine, model }: { engine: "claude" | "mock"; model?: string }) {
  return engine === "mock" ? (
    <span className="chip bg-danger-soft text-danger">MOCK — checks only, no model</span>
  ) : (
    <span className="chip bg-accent-soft text-accent figure">{model ?? "claude"}</span>
  );
}

export function CheckIcon({ status }: { status: CheckStatus }) {
  if (status === "pass")
    return <span className="text-clear font-semibold" aria-label="pass">✓</span>;
  if (status === "warn")
    return <span className="text-flag font-semibold" aria-label="warning">▲</span>;
  if (status === "fail")
    return <span className="text-danger font-semibold" aria-label="fail">✕</span>;
  return <span className="text-ink-faint" aria-label="skipped">—</span>;
}
