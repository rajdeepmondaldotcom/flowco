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

// Which flag types apply to a triaged expense — drives the badges in the review lane.
export function flagsFor(e: TriagedExpense): string[] {
  const flags: string[] = [];
  if (!e.checks || !e.aiVerdict) return flags;
  if (e.checks.policyCap.status === "fail") flags.push("policy exception");
  if (e.checks.duplicate.status === "warn") flags.push("possible duplicate");
  if (e.checks.receiptPresence.status === "fail") flags.push("missing receipt");
  if (e.checks.currency.status === "warn") flags.push("currency mismatch");
  if (
    e.aiVerdict.engine !== "mock" &&
    (e.aiVerdict.receiptMatch.status === "mismatch" || e.aiVerdict.receiptMatch.status === "uncertain")
  )
    flags.push("ambiguous receipt");
  if (flags.length === 0 && e.aiVerdict.confidence < 0.8) flags.push("low confidence");
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
