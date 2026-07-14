import type { CheckStatus, TriagedExpense } from "@/lib/types";

export const fmtMoney = (n: number, currency = "USD") =>
  new Intl.NumberFormat("en-US", { style: "currency", currency }).format(n);

export const fmtDate = (iso: string) =>
  new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", timeZone: "UTC" }).format(
    new Date(`${iso}T00:00:00Z`)
  );

export const fmtDateTime = (iso: string) =>
  new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(iso));

// Plain-English tooltip for each flag — recognition over recall.
export const FLAG_EXPLAIN: Record<string, string> = {
  alcohol: "The receipt lists alcohol, which policy says isn't reimbursable — the assistant deducted it.",
  "personal item": "The receipt includes a personal, non-business line the assistant deducted.",
  "wrong category": "The filed category doesn't fit the merchant — possibly to stay under a lower cap.",
  "over cap": "The amount exceeds this category's policy cap.",
  "over $1,000": "Anything over $1,000 always needs manager review.",
  "possible duplicate": "Same employee and merchant nearby in time — could be a re-submission or a split bill.",
  "missing receipt": "No receipt attached, and one is required over $25.",
  "wrong cost center": "Coded to a cost center that doesn't match the employee's department.",
  "foreign currency": "The receipt is in a foreign currency. The assistant auto-converted it to USD at the reference rate; a human confirms the rate before pay.",
  "ambiguous receipt": "The receipt didn't cleanly reconcile against the claim.",
  "not a receipt": "The uploaded file isn't a receipt at all — a poster, a screenshot, or a random file. The assistant refused to invent an amount.",
  "date mismatch": "The receipt's date doesn't match the claimed transaction date — worth confirming.",
  "needs a look": "The assistant found a judgment call it thinks a human should confirm — see its rationale.",
  "low confidence": "The assistant wasn't confident enough to clear this on its own.",
};

// Reference rates mirror data/policy.json fxToUsd — used to show the receipt's
// original local amount next to the converted USD claim.
const FX_TO_USD: Record<string, number> = {
  USD: 1, INR: 0.012, SGD: 0.741, GBP: 1.27, EUR: 1.08, AED: 0.272, JPY: 0.0064,
};
const FX_SYMBOL: Record<string, string> = {
  INR: "₹", SGD: "S$", GBP: "£", EUR: "€", AED: "AED ", JPY: "¥",
};

// The receipt's original foreign amount, derived from the USD claim at the
// reference rate (the totals in the seed are set from the local amount, so this
// reverses exactly). Returns null for USD receipts.
export function foreignAmount(e: { total: number; receiptCurrency: string }): string | null {
  if (!e.receiptCurrency || e.receiptCurrency === "USD") return null;
  const rate = FX_TO_USD[e.receiptCurrency];
  if (!rate) return null;
  const orig = e.total / rate;
  const sym = FX_SYMBOL[e.receiptCurrency] ?? `${e.receiptCurrency} `;
  const rounded = orig >= 100 ? Math.round(orig) : Math.round(orig * 100) / 100;
  return sym + rounded.toLocaleString("en-IN");
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
