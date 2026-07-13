"use client";

import { useEffect, useRef, useState } from "react";
import type { Policy, TriagedExpense } from "@/lib/types";
import { CheckIcon, EngineChip, fmtDate, fmtDateTime, fmtMoney, StatusChip } from "./badges";

const CHECK_LABELS: Record<string, string> = {
  policyCap: "Policy cap",
  receiptPresence: "Receipt attached",
  duplicate: "Duplicate scan",
  amountLimit: "Amount limits",
  currency: "Currency",
  costCenter: "Cost center",
};

export default function CaseDetail({
  expense,
  all,
  policy,
  onClose,
  onAction,
  onRevert,
  onNavigate,
  prevId,
  nextId,
  position,
}: {
  expense: TriagedExpense;
  all: TriagedExpense[];
  policy: Policy;
  onClose: () => void;
  onAction: (id: string, action: "approve" | "reject" | "request_info", message?: string) => Promise<void>;
  onRevert: (id: string) => void;
  onNavigate: (id: string) => void;
  prevId: string | null;
  nextId: string | null;
  position: { index: number; total: number };
}) {
  const v = expense.aiVerdict;
  const [message, setMessage] = useState(v?.draftEmployeeMessage ?? "");
  const [acting, setActing] = useState<string | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);

  const actionable = expense.status === "triaged" || expense.status === "pending";
  const resolved =
    expense.status === "approved" || expense.status === "rejected" || expense.status === "info_requested";

  const advance = () => {
    if (nextId) onNavigate(nextId);
    else onClose();
  };

  const doAction = async (action: "approve" | "reject" | "request_info") => {
    if (acting) return;
    const target = nextId;
    setActing(action);
    await onAction(expense.id, action, action === "request_info" ? message : undefined);
    setActing(null);
    if (target) onNavigate(target);
    else onClose();
  };

  const requestInfo = () => {
    if (message.trim().length === 0) {
      composerRef.current?.focus();
      composerRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
      return;
    }
    doAction("request_info");
  };

  // keyboard: a/r act, ←/→ navigate, esc close
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      const typing = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
        return;
      }
      if (typing) return;
      if (e.key === "ArrowRight" && nextId) {
        e.preventDefault();
        onNavigate(nextId);
      } else if (e.key === "ArrowLeft" && prevId) {
        e.preventDefault();
        onNavigate(prevId);
      } else if (actionable && (e.key === "a" || e.key === "A")) {
        e.preventDefault();
        doAction("approve");
      } else if (actionable && (e.key === "r" || e.key === "R")) {
        e.preventDefault();
        doAction("reject");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [expense.id, nextId, prevId, actionable, message, acting]);

  const duplicates = (expense.checks?.duplicate.candidateIds ?? [])
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is TriagedExpense => Boolean(e));

  const extraction = v?.receiptExtraction ?? null;
  const nr = v?.nonReimbursable ?? null;
  const fx = v?.currencyReconciliation ?? null;
  const reimb = v?.reimbursableAmount ?? null;
  const claimCcy = expense.currency;
  const rcCcy = nr?.currency ?? fx?.receiptCurrency ?? expense.receiptCurrency;
  const sameCurrencyDelta =
    v && !fx && v.receiptMatch.extractedTotal !== null ? expense.total - v.receiptMatch.extractedTotal : null;
  const reduced = reimb && Math.abs(reimb.value - expense.total) > 0.005;

  const navBtn =
    "flex h-7 w-7 items-center justify-center rounded-md border border-line text-ink-soft transition hover:bg-paper disabled:opacity-30";

  return (
    <div className="fixed inset-0 z-40">
      <div className="fade-in absolute inset-0 bg-ink/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <aside className="panel-in absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col bg-surface shadow-2xl">
        {resolved && <DecisionStamp status={expense.status as "approved" | "rejected" | "info_requested"} />}

        {/* Header */}
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-line px-6 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span className="figure text-sm text-ink-faint">{expense.id}</span>
            <span className="truncate text-base font-semibold">{expense.employee.name}</span>
            <span className="hidden text-xs text-ink-faint sm:inline">{expense.employee.department}</span>
            <StatusChip status={expense.status} />
          </div>
          <div className="flex shrink-0 items-center gap-1.5">
            <span className="mono mr-1 hidden text-xs text-ink-faint sm:inline">
              {position.index + 1} / {position.total}
            </span>
            <button
              onClick={() => prevId && onNavigate(prevId)}
              disabled={!prevId}
              className={navBtn}
              aria-label="Previous case"
              title="Previous (←)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M15 18l-6-6 6-6" />
              </svg>
            </button>
            <button
              onClick={() => nextId && onNavigate(nextId)}
              disabled={!nextId}
              className={navBtn}
              aria-label="Next case"
              title="Next (→)"
            >
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M9 6l6 6-6 6" />
              </svg>
            </button>
            <button
              onClick={onClose}
              className="ml-1 rounded-md border border-line px-2.5 py-1 text-xs font-medium text-ink-soft hover:bg-paper"
              aria-label="Close panel"
            >
              Esc
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div ref={bodyRef} className="flex-1 overflow-y-auto px-6 py-5">
          {v && (
            <div
              className={`mb-5 rounded-lg border px-4 py-3 ${
                v.verdict === "clear" ? "border-clear/25 bg-clear-soft" : "border-flag/25 bg-flag-soft"
              }`}
            >
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <span className={`chip ${v.verdict === "clear" ? "bg-clear text-white" : "bg-flag text-white"}`}>
                    {v.verdict === "clear" ? "Ready to clear" : "Needs your review"}
                  </span>
                  <span className="text-sm font-medium text-ink">
                    Assistant recommends <span className="font-semibold">{v.recommendedAction.replace("_", " ")}</span>
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="figure text-xs text-ink-faint">confidence {v.confidence.toFixed(2)}</span>
                  <EngineChip engine={v.engine} model={v.model} />
                </div>
              </div>
              <p className="mt-2 text-sm leading-relaxed text-ink">{v.summary}</p>
            </div>
          )}

          {reduced && (
            <div className="mb-5 overflow-hidden rounded-lg border-2 border-ink/10">
              <div className="border-b border-line bg-ink px-4 py-2 text-xs font-bold uppercase tracking-widest text-paper">
                Reconciliation
              </div>
              <div className="px-4 py-3">
                <LedgerRow label="Claimed" value={fmtMoney(expense.total, claimCcy)} />
                {nr && nr.subtotalExcluded > 0.005 && (
                  <LedgerRow
                    label={`Less non-reimbursable (${fmtMoney(nr.subtotalExcluded, rcCcy)})`}
                    value={`− ${fmtMoney(expense.total - reimb!.value, claimCcy)}`}
                    strike
                  />
                )}
                <div className="my-1.5 border-t border-line-strong" />
                <div className="flex items-baseline justify-between">
                  <span className="text-sm font-semibold">Reimburse</span>
                  <span className="figure display text-[26px] font-bold text-clear">
                    {fmtMoney(reimb!.value, reimb!.currency)}
                  </span>
                </div>
                <p className="mt-1.5 text-xs leading-relaxed text-ink-soft">{reimb!.note}</p>
              </div>
            </div>
          )}

          <SectionTitle>Claim</SectionTitle>
          <div className="mb-5 rounded-md border border-line">
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 px-4 py-3 text-sm md:grid-cols-3">
              <Field label="Merchant" value={expense.merchant} />
              <Field label="Category" value={expense.category} />
              <Field label="Date" value={fmtDate(expense.transactionDate)} mono />
              <Field label="Project" value={expense.project} />
              <Field label="Cost center" value={expense.costCenter} mono />
              <Field label="Submitted" value={fmtDateTime(expense.submittedAt)} mono />
            </div>
            <div className="border-t border-line px-4 py-2.5">
              <div className="text-xs text-ink-faint">Purpose</div>
              <div className="text-sm">{expense.purpose}</div>
            </div>
            <div className="flex flex-wrap gap-x-8 gap-y-1 border-t border-line bg-paper px-4 py-2.5 text-sm">
              <Field label="Amount" value={fmtMoney(expense.amount, claimCcy)} mono />
              <Field label="Tax" value={fmtMoney(expense.tax, claimCcy)} mono />
              <Field label="Tip" value={fmtMoney(expense.tip, claimCcy)} mono />
              <Field label="Claimed total" value={fmtMoney(expense.total, claimCcy)} mono strong />
            </div>
          </div>

          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div>
              <SectionTitle>Receipt</SectionTitle>
              {expense.receiptUrl ? (
                <a href={expense.receiptUrl} target="_blank" rel="noreferrer" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={expense.receiptUrl}
                    alt={`Receipt for ${expense.id}`}
                    className="max-h-115 w-full rounded-md border border-line object-contain bg-paper"
                  />
                </a>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-strong text-sm text-ink-faint">
                  No receipt attached
                </div>
              )}
            </div>

            <div>
              <SectionTitle>What the assistant read</SectionTitle>
              {v ? (
                <div className="rounded-md border border-line">
                  {extraction ? (
                    <>
                      <ReconRow label="Merchant" value={extraction.merchant ?? "—"} />
                      <ReconRow
                        label="Receipt total"
                        value={v.receiptMatch.extractedTotal !== null ? fmtMoney(v.receiptMatch.extractedTotal, rcCcy) : "—"}
                      />
                      {extraction.handwrittenAdjustment !== null && (
                        <ReconRow label="Handwritten addition" value={fmtMoney(extraction.handwrittenAdjustment, rcCcy)} />
                      )}
                      {sameCurrencyDelta !== null && Math.abs(sameCurrencyDelta) > 0.005 && (
                        <ReconRow label="Delta vs claim" value={fmtMoney(sameCurrencyDelta, claimCcy)} alert />
                      )}
                    </>
                  ) : (
                    <ReconRow label="Receipt" value="not read" />
                  )}
                  <div
                    className={`flex items-center justify-between border-t border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                      v.receiptMatch.status === "match"
                        ? "bg-clear-soft text-clear"
                        : v.receiptMatch.status === "no_receipt"
                          ? "bg-neutral-chip text-ink-soft"
                          : v.receiptMatch.status === "mismatch"
                            ? "bg-danger-soft text-danger"
                            : "bg-flag-soft text-flag"
                    }`}
                  >
                    <span>{v.receiptMatch.status.replace("_", " ")}</span>
                    {extraction && <span>legibility: {extraction.legibilityConfidence}</span>}
                  </div>
                  <p className="px-3 py-2 text-xs text-ink-soft">{v.receiptMatch.note}</p>
                  {extraction?.lineNotes && (
                    <p className="border-t border-line px-3 py-2 text-xs text-ink-faint">{extraction.lineNotes}</p>
                  )}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-strong text-sm text-ink-faint">
                  Run triage to read the receipt
                </div>
              )}
            </div>
          </div>

          {nr && nr.items.length > 0 && (
            <>
              <SectionTitle>Non-reimbursable items · found by reading the receipt</SectionTitle>
              <div className="mb-5 rounded-md border border-danger/25 bg-danger-soft/40">
                {nr.items.map((it, i) => (
                  <div key={i} className="flex items-center justify-between border-b border-danger/15 px-4 py-2 text-sm last:border-b-0">
                    <span className="text-ink line-through decoration-danger/60">{it.description}</span>
                    <span className="figure text-danger">{fmtMoney(it.amount, nr.currency)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-danger/25 bg-danger-soft px-4 py-2 text-sm font-semibold">
                  <span className="text-danger">Excluded from reimbursement</span>
                  <span className="figure text-danger">{fmtMoney(nr.subtotalExcluded, nr.currency)}</span>
                </div>
                {nr.note && <p className="px-4 py-2 text-xs text-ink-soft">{nr.note}</p>}
              </div>
            </>
          )}

          {fx && (
            <>
              <SectionTitle>
                Currency · {fx.receiptCurrency} receipt vs {fx.claimCurrency} claim
              </SectionTitle>
              <div className="mb-5 rounded-md border border-line">
                <ReconRow
                  label={`Receipt total (${fx.receiptCurrency})`}
                  value={fx.receiptTotal !== null ? fmtMoney(fx.receiptTotal, fx.receiptCurrency) : "—"}
                />
                <ReconRow label={`Claimed (${fx.claimCurrency})`} value={fmtMoney(fx.claimedTotal, fx.claimCurrency)} />
                {fx.impliedRate !== null && (
                  <ReconRow
                    label="Implied rate"
                    value={fx.receiptCurrency === "INR" ? `${(1 / fx.impliedRate).toFixed(1)} INR / USD` : fx.impliedRate.toFixed(4)}
                  />
                )}
                <div
                  className={`border-t border-line px-3 py-2 text-xs font-semibold uppercase tracking-wide ${
                    fx.plausible ? "bg-flag-soft text-flag" : "bg-danger-soft text-danger"
                  }`}
                >
                  {fx.plausible ? "plausible — needs a human sanity-check" : "rate looks off"}
                </div>
                <p className="px-3 py-2 text-xs text-ink-soft">{fx.note}</p>
              </div>
            </>
          )}

          {expense.checks && (
            <>
              <SectionTitle>Checks (computed in code)</SectionTitle>
              <div className="mb-5 rounded-md border border-line">
                {Object.entries(expense.checks).map(([key, check]) => (
                  <div key={key} className="flex items-start gap-3 border-b border-line px-4 py-2 text-sm last:border-b-0">
                    <span className="w-4 pt-0.5 text-center">
                      <CheckIcon status={check.status} />
                    </span>
                    <span className="w-32 shrink-0 font-medium">{CHECK_LABELS[key] ?? key}</span>
                    <span className="text-ink-soft">{check.note}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {duplicates.length > 0 && (
            <>
              <SectionTitle>Duplicate comparison</SectionTitle>
              <div className="mb-5 overflow-x-auto rounded-md border border-line">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-line bg-paper text-left text-xs text-ink-faint">
                      <th className="px-3 py-2 font-medium">ID</th>
                      <th className="px-3 py-2 font-medium">Purpose</th>
                      <th className="px-3 py-2 font-medium">Date</th>
                      <th className="px-3 py-2 font-medium text-right">Total</th>
                      <th className="px-3 py-2 font-medium">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {[expense, ...duplicates].map((d) => (
                      <tr key={d.id} className={`border-b border-line last:border-b-0 ${d.id === expense.id ? "bg-accent-soft/40" : ""}`}>
                        <td className="figure px-3 py-2 text-xs">
                          {d.id}
                          {d.id === expense.id ? " (this)" : ""}
                        </td>
                        <td className="px-3 py-2">{d.purpose}</td>
                        <td className="figure px-3 py-2 text-xs">{fmtDate(d.transactionDate)}</td>
                        <td className="figure px-3 py-2 text-right">{fmtMoney(d.total, d.currency)}</td>
                        <td className="px-3 py-2">
                          <StatusChip status={d.status} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {v && v.unresolved.length > 0 && (
            <>
              <SectionTitle>What the assistant couldn&apos;t resolve</SectionTitle>
              <div className="mb-5 rounded-md border-l-2 border-flag bg-flag-soft/50 px-4 py-3">
                <ul className="list-disc space-y-1 pl-4 text-sm text-ink">
                  {v.unresolved.map((u, i) => (
                    <li key={i}>{u}</li>
                  ))}
                </ul>
                <p className="mt-2 border-t border-flag/20 pt-2 text-xs text-ink-soft">
                  <span className="font-semibold">Why this recommendation:</span> {v.rationale}
                </p>
              </div>
            </>
          )}

          {actionable && v && (
            <>
              <SectionTitle>Message to {expense.employee.name.split(" ")[0]}</SectionTitle>
              <div className="mb-5 rounded-md border border-line px-4 py-3">
                <div className="mb-1 text-xs text-ink-faint">
                  The assistant drafted this — edit it, then hit <span className="font-medium">Request info</span> below.
                </div>
                <textarea
                  ref={composerRef}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  rows={3}
                  className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                  placeholder="Message to the employee…"
                />
              </div>
            </>
          )}

          {expense.audit.length > 0 && (
            <>
              <SectionTitle>Audit trail</SectionTitle>
              <div className="mb-6 rounded-md border border-line">
                {expense.audit.map((entry, i) => (
                  <div key={i} className="flex items-baseline gap-3 border-b border-line px-4 py-2 text-xs last:border-b-0">
                    <span className="figure shrink-0 text-ink-faint">{fmtDateTime(entry.at)}</span>
                    <span className={`chip shrink-0 ${entry.actor === "assistant" ? "bg-accent-soft text-accent" : "bg-neutral-chip text-ink-soft"}`}>
                      {entry.actor}
                    </span>
                    <span className="font-medium">{entry.action}</span>
                    <span className="min-w-0 text-ink-soft">{entry.detail}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          <p className="mono pb-4 text-[10px] leading-relaxed text-ink-faint">
            policy: meals ${policy.categoryCaps.meals} · travel ${policy.categoryCaps.travel} · lodging $
            {policy.categoryCaps.lodging}/night · receipts required over ${policy.receiptRequiredAbove} · one-click under $
            {policy.autoApproveLimit} · alcohol not reimbursable
          </p>
        </div>

        {/* Sticky action bar — always reachable (Fitts's Law) */}
        {actionable && v && (
          <div className="flex shrink-0 items-center gap-2 border-t border-line bg-surface/95 px-6 py-3 backdrop-blur">
            <button
              onClick={() => doAction("approve")}
              disabled={acting !== null}
              className="inline-flex min-h-[40px] flex-1 items-center justify-center gap-2 rounded-lg bg-clear px-4 text-sm font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
            >
              {acting === "approve" ? "Approving…" : reduced ? `Approve ${fmtMoney(reimb!.value, reimb!.currency)}` : "Approve"}
              <kbd className="mono hidden rounded bg-white/20 px-1 text-[10px] sm:inline">a</kbd>
            </button>
            <button
              onClick={requestInfo}
              disabled={acting !== null}
              className="inline-flex min-h-[40px] items-center justify-center rounded-lg border border-accent/40 px-4 text-sm font-semibold text-accent transition hover:bg-accent-soft disabled:opacity-50"
            >
              {acting === "request_info" ? "Sending…" : "Request info"}
            </button>
            <button
              onClick={() => doAction("reject")}
              disabled={acting !== null}
              className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-lg border border-danger/40 px-4 text-sm font-semibold text-danger transition hover:bg-danger-soft disabled:opacity-50"
            >
              {acting === "reject" ? "Rejecting…" : "Reject"}
              <kbd className="mono hidden rounded border border-danger/30 px-1 text-[10px] sm:inline">r</kbd>
            </button>
          </div>
        )}

        {resolved && (
          <div className="flex shrink-0 items-center justify-between border-t border-line bg-surface px-6 py-3">
            <span className="text-sm text-ink-soft">
              Decided this session · <span className="font-medium text-ink">{expense.status.replace("_", " ")}</span>
            </span>
            <button
              onClick={() => onRevert(expense.id)}
              className="rounded-md border border-line-strong px-3 py-1.5 text-sm font-medium text-ink-soft hover:bg-paper"
            >
              Move back to review
            </button>
          </div>
        )}
      </aside>
    </div>
  );
}

function DecisionStamp({ status }: { status: "approved" | "rejected" | "info_requested" }) {
  const map = {
    approved: { label: "Approved", color: "var(--clear)" },
    rejected: { label: "Rejected", color: "var(--danger)" },
    info_requested: { label: "Info requested", color: "var(--flag)" },
  } as const;
  const s = map[status];
  return (
    <div className="pointer-events-none absolute right-8 top-14 z-20">
      <span
        className="stamp stamp-in"
        style={{ color: s.color, borderColor: `color-mix(in srgb, ${s.color} 55%, transparent)` }}
      >
        {s.label}
      </span>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-faint">{children}</h3>;
}

function Field({ label, value, mono, strong }: { label: string; value: string; mono?: boolean; strong?: boolean }) {
  return (
    <div>
      <span className="mr-2 text-xs text-ink-faint">{label}</span>
      <span className={`${mono ? "figure text-[13px]" : ""} ${strong ? "font-semibold" : ""}`}>{value}</span>
    </div>
  );
}

function ReconRow({ label, value, alert }: { label: string; value: string; alert?: boolean }) {
  return (
    <div className="flex items-center justify-between border-b border-line px-3 py-1.5 text-sm last:border-b-0">
      <span className="text-ink-soft">{label}</span>
      <span className={`figure ${alert ? "font-semibold text-danger" : ""}`}>{value}</span>
    </div>
  );
}

function LedgerRow({ label, value, strike }: { label: string; value: string; strike?: boolean }) {
  return (
    <div className="flex items-baseline justify-between py-0.5 text-sm">
      <span className="text-ink-soft">{label}</span>
      <span className={`figure ${strike ? "text-danger" : "text-ink"}`}>{value}</span>
    </div>
  );
}
