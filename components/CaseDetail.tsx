"use client";

import { useEffect, useState } from "react";
import type { Policy, TriagedExpense } from "@/lib/types";
import { CheckIcon, EngineChip, fmtDate, fmtDateTime, fmtMoney, StatusChip } from "./badges";

const CHECK_LABELS: Record<string, string> = {
  policyCap: "Policy cap",
  receiptPresence: "Receipt attached",
  duplicate: "Duplicate scan",
  amountLimit: "Amount limits",
  currency: "Currency",
};

export default function CaseDetail({
  expense,
  all,
  policy,
  onClose,
  onAction,
}: {
  expense: TriagedExpense;
  all: TriagedExpense[];
  policy: Policy;
  onClose: () => void;
  onAction: (id: string, action: "approve" | "reject" | "request_info", message?: string) => Promise<void>;
}) {
  const v = expense.aiVerdict;
  const [message, setMessage] = useState(v?.draftEmployeeMessage ?? "");
  const [acting, setActing] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const doAction = async (action: "approve" | "reject" | "request_info") => {
    setActing(action);
    await onAction(expense.id, action, action === "request_info" ? message : undefined);
    setActing(null);
  };

  const duplicates = (expense.checks?.duplicate.candidateIds ?? [])
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is TriagedExpense => Boolean(e));

  const actionable = expense.status === "triaged" || expense.status === "pending";
  const extraction = v?.receiptExtraction ?? null;
  const delta =
    v && v.receiptMatch.extractedTotal !== null
      ? expense.total - v.receiptMatch.extractedTotal
      : null;

  return (
    <div className="fixed inset-0 z-40">
      <div className="absolute inset-0 bg-ink/30" onClick={onClose} aria-hidden />
      <aside className="absolute inset-y-0 right-0 flex w-full max-w-3xl flex-col overflow-y-auto bg-surface shadow-2xl">
        {/* Header */}
        <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-surface px-6 py-4">
          <div className="flex items-center gap-3">
            <span className="figure text-sm text-ink-faint">{expense.id}</span>
            <span className="text-base font-semibold">{expense.employee.name}</span>
            <span className="text-xs text-ink-faint">{expense.employee.department}</span>
            <StatusChip status={expense.status} />
          </div>
          <button
            onClick={onClose}
            className="rounded border border-line px-2.5 py-1 text-sm text-ink-soft hover:bg-paper"
            aria-label="Close panel"
          >
            Esc
          </button>
        </div>

        <div className="flex-1 px-6 py-5">
          {/* Claim summary */}
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
              <Field label="Amount" value={fmtMoney(expense.amount)} mono />
              <Field label="Tax" value={fmtMoney(expense.tax)} mono />
              <Field label="Tip" value={fmtMoney(expense.tip)} mono />
              <Field label="Claimed total" value={fmtMoney(expense.total)} mono strong />
            </div>
          </div>

          {/* Receipt + reconciliation */}
          <div className="mb-5 grid gap-4 md:grid-cols-2">
            <div>
              <SectionTitle>Receipt</SectionTitle>
              {expense.receiptUrl ? (
                <a href={expense.receiptUrl} target="_blank" rel="noreferrer" title="Open full size">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={expense.receiptUrl}
                    alt={`Receipt for ${expense.id}`}
                    className="max-h-105 w-full rounded-md border border-line object-contain bg-paper"
                  />
                </a>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-strong text-sm text-ink-faint">
                  No receipt attached
                </div>
              )}
            </div>

            <div>
              <SectionTitle>Reconciliation</SectionTitle>
              {v ? (
                <div className="rounded-md border border-line">
                  <ReconRow label="Claimed total" value={fmtMoney(v.receiptMatch.claimedTotal)} />
                  {extraction && (
                    <>
                      <ReconRow
                        label="Printed on receipt"
                        value={extraction.printedTotal !== null ? fmtMoney(extraction.printedTotal) : "—"}
                      />
                      <ReconRow
                        label="Handwritten addition"
                        value={
                          extraction.handwrittenAdjustment !== null
                            ? fmtMoney(extraction.handwrittenAdjustment)
                            : "—"
                        }
                      />
                      <ReconRow
                        label="Assistant's read of paid total"
                        value={extraction.finalTotal !== null ? fmtMoney(extraction.finalTotal) : "—"}
                      />
                      {extraction.currency && extraction.currency !== expense.currency && (
                        <ReconRow label="Receipt currency" value={extraction.currency} alert />
                      )}
                    </>
                  )}
                  {delta !== null && Math.abs(delta) > 0.005 && (
                    <ReconRow label="Delta vs claim" value={fmtMoney(delta)} alert />
                  )}
                  <div
                    className={`flex items-center justify-between border-t border-line px-3 py-2 text-sm ${
                      v.receiptMatch.status === "match"
                        ? "bg-clear-soft text-clear"
                        : v.receiptMatch.status === "no_receipt"
                          ? "bg-neutral-chip text-ink-soft"
                          : v.receiptMatch.status === "mismatch"
                            ? "bg-danger-soft text-danger"
                            : "bg-flag-soft text-flag"
                    }`}
                  >
                    <span className="font-semibold uppercase tracking-wide text-xs">
                      {v.receiptMatch.status.replace("_", " ")}
                    </span>
                    {extraction && (
                      <span className="text-xs">receipt legibility: {extraction.legibilityConfidence}</span>
                    )}
                  </div>
                  <p className="px-3 py-2 text-xs text-ink-soft">{v.receiptMatch.note}</p>
                  {extraction?.lineNotes && (
                    <p className="border-t border-line px-3 py-2 text-xs text-ink-faint">
                      {extraction.lineNotes}
                    </p>
                  )}
                </div>
              ) : (
                <div className="flex h-40 items-center justify-center rounded-md border border-dashed border-line-strong text-sm text-ink-faint">
                  Run triage to reconcile
                </div>
              )}
            </div>
          </div>

          {/* Deterministic checks */}
          {expense.checks && (
            <>
              <SectionTitle>Checks (computed in code)</SectionTitle>
              <div className="mb-5 rounded-md border border-line">
                {Object.entries(expense.checks).map(([key, check]) => (
                  <div
                    key={key}
                    className="flex items-start gap-3 border-b border-line px-4 py-2 text-sm last:border-b-0"
                  >
                    <span className="w-4 text-center"><CheckIcon status={check.status} /></span>
                    <span className="w-32 shrink-0 font-medium">{CHECK_LABELS[key] ?? key}</span>
                    <span className="text-ink-soft">{check.note}</span>
                  </div>
                ))}
              </div>
            </>
          )}

          {/* Duplicate comparison */}
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
                        <td className="figure px-3 py-2 text-xs">{d.id}{d.id === expense.id ? " (this)" : ""}</td>
                        <td className="px-3 py-2">{d.purpose}</td>
                        <td className="figure px-3 py-2 text-xs">{fmtDate(d.transactionDate)}</td>
                        <td className="figure px-3 py-2 text-right">{fmtMoney(d.total)}</td>
                        <td className="px-3 py-2"><StatusChip status={d.status} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}

          {/* Assistant verdict */}
          {v && (
            <>
              <SectionTitle>Assistant verdict</SectionTitle>
              <div className="mb-5 rounded-md border border-line">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line bg-paper px-4 py-2.5">
                  <div className="flex items-center gap-2">
                    <span
                      className={`chip ${v.verdict === "clear" ? "bg-clear-soft text-clear" : "bg-flag-soft text-flag"}`}
                    >
                      {v.verdict === "clear" ? "ready to clear" : "needs human"}
                    </span>
                    <span className="chip bg-neutral-chip text-ink-soft">
                      recommends: {v.recommendedAction.replace("_", " ")}
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="figure text-xs text-ink-faint">
                      confidence {v.confidence.toFixed(2)}
                    </span>
                    <EngineChip engine={v.engine} model={v.model} />
                  </div>
                </div>
                <p className="px-4 py-3 text-sm">{v.summary}</p>
                {v.unresolved.length > 0 && (
                  <div className="mx-4 mb-3 border-l-2 border-flag bg-flag-soft/60 px-3 py-2">
                    <div className="mb-1 text-xs font-bold uppercase tracking-wide text-flag">
                      What the assistant couldn&apos;t resolve
                    </div>
                    <ul className="list-disc space-y-0.5 pl-4 text-sm text-ink">
                      {v.unresolved.map((u, i) => (
                        <li key={i}>{u}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <p className="border-t border-line px-4 py-2.5 text-xs text-ink-soft">
                  <span className="font-semibold">Why:</span> {v.rationale}
                </p>
              </div>
            </>
          )}

          {/* Actions */}
          {actionable && v && (
            <>
              <SectionTitle>Decision</SectionTitle>
              <div className="mb-5 rounded-md border border-line px-4 py-3">
                <div className="flex flex-wrap gap-2">
                  <button
                    onClick={() => doAction("approve")}
                    disabled={acting !== null}
                    className="rounded bg-clear px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {acting === "approve" ? "Approving…" : "Approve"}
                  </button>
                  <button
                    onClick={() => doAction("reject")}
                    disabled={acting !== null}
                    className="rounded border border-danger/40 px-4 py-1.5 text-sm font-semibold text-danger hover:bg-danger-soft disabled:opacity-50"
                  >
                    {acting === "reject" ? "Rejecting…" : "Reject"}
                  </button>
                </div>
                <div className="mt-4">
                  <div className="mb-1 text-xs font-medium text-ink-faint">
                    Ask {expense.employee.name.split(" ")[0]} — the assistant drafted this for you
                  </div>
                  <textarea
                    value={message}
                    onChange={(e) => setMessage(e.target.value)}
                    rows={3}
                    className="w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
                    placeholder="Message to the employee…"
                  />
                  <button
                    onClick={() => doAction("request_info")}
                    disabled={acting !== null || message.trim().length === 0}
                    className="mt-2 rounded bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
                  >
                    {acting === "request_info" ? "Sending…" : "Send & mark info requested"}
                  </button>
                </div>
              </div>
            </>
          )}

          {/* Audit trail */}
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

          <p className="figure pb-6 text-[10px] text-ink-faint">
            policy: caps {Object.entries(policy.categoryCaps).map(([k, v2]) => `${k} $${v2}`).join(" · ")} · receipts
            required over ${policy.receiptRequiredAbove} · one-click under ${policy.autoApproveLimit}
          </p>
        </div>
      </aside>
    </div>
  );
}

function SectionTitle({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="mb-1.5 text-xs font-bold uppercase tracking-wider text-ink-faint">{children}</h3>
  );
}

function Field({
  label,
  value,
  mono,
  strong,
}: {
  label: string;
  value: string;
  mono?: boolean;
  strong?: boolean;
}) {
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
