"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { Policy, TriagedExpense } from "@/lib/types";
import { flagsFor, fmtDate, fmtMoney, StatusChip } from "./badges";
import CaseDetail from "./CaseDetail";

const TRIAGE_CONCURRENCY = 3;

export default function TriageApp() {
  const [expenses, setExpenses] = useState<TriagedExpense[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triaging, setTriaging] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/expenses");
    const data = await res.json();
    setExpenses(data.expenses);
    setPolicy(data.policy);
    setMockMode(data.mockMode);
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const updateExpense = (updated: TriagedExpense) =>
    setExpenses((prev) => prev.map((e) => (e.id === updated.id ? updated : e)));

  const triageOne = useCallback(async (id: string) => {
    setTriaging((prev) => new Set(prev).add(id));
    try {
      // one retry for transient dev-server hiccups on long requests
      for (let attempt = 0; ; attempt++) {
        try {
          const res = await fetch("/api/triage", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ id }),
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error ?? `Triage failed for ${id}`);
          updateExpense(data.expense);
          return;
        } catch (err) {
          if (attempt >= 1) throw err;
        }
      }
    } finally {
      setTriaging((prev) => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
    }
  }, []);

  const runTriage = useCallback(async () => {
    setRunning(true);
    setError(null);
    const queue = expenses.filter((e) => e.status === "pending").map((e) => e.id);
    const workers = Array.from({ length: TRIAGE_CONCURRENCY }, async () => {
      while (queue.length > 0) {
        const id = queue.shift();
        if (!id) break;
        try {
          await triageOne(id);
        } catch (err) {
          setError(err instanceof Error ? err.message : String(err));
        }
      }
    });
    await Promise.all(workers);
    await refresh(); // re-sync with the server in case any response was lost
    setRunning(false);
  }, [expenses, triageOne, refresh]);

  const act = useCallback(
    async (id: string, action: "approve" | "reject" | "request_info", message?: string) => {
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error ?? "Action failed");
        return;
      }
      updateExpense(data.expense);
    },
    []
  );

  const resetDemo = useCallback(async () => {
    await fetch("/api/reset", { method: "POST" });
    setSelectedId(null);
    setError(null);
    await refresh();
  }, [refresh]);

  const lanes = useMemo(() => {
    const untriaged = expenses.filter((e) => e.status === "pending");
    const clear = expenses.filter((e) => e.status === "triaged" && e.aiVerdict?.verdict === "clear");
    const review = expenses.filter(
      (e) => e.status === "triaged" && e.aiVerdict?.verdict === "needs_human"
    );
    const resolved = expenses.filter((e) =>
      ["approved", "rejected", "info_requested"].includes(e.status)
    );
    return { untriaged, clear, review, resolved };
  }, [expenses]);

  const approveAllClear = useCallback(async () => {
    setBulkApproving(true);
    for (const e of lanes.clear) {
      await act(e.id, "approve");
    }
    setBulkApproving(false);
  }, [lanes.clear, act]);

  const selected = expenses.find((e) => e.id === selectedId) ?? null;
  const pendingCount = lanes.untriaged.length;

  return (
    <div className="flex-1">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold tracking-tight">FlowCo</span>
            <span className="text-sm text-ink-soft">Approvals Triage</span>
            {mockMode && (
              <span className="chip bg-danger-soft text-danger">mock mode — set ANTHROPIC_API_KEY</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <a href="/submit" className="mr-2 text-sm text-accent underline">
              Employee submit
            </a>
            <button
              onClick={resetDemo}
              className="rounded border border-line-strong px-3 py-1.5 text-sm text-ink-soft hover:bg-paper"
            >
              Reset
            </button>
            <button
              onClick={runTriage}
              disabled={running || pendingCount === 0}
              className="rounded bg-accent px-4 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {running
                ? `Triaging… ${expenses.length - pendingCount}/${expenses.length}`
                : pendingCount > 0
                  ? `Run assistant triage (${pendingCount})`
                  : "Queue triaged"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 rounded border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            {error}
            <button className="ml-3 underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}

        <div className="mb-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Awaiting triage" value={lanes.untriaged.length} />
          <Stat label="Ready to clear" value={lanes.clear.length} tone="clear" />
          <Stat label="Needs your review" value={lanes.review.length} tone="flag" />
          <Stat label="Resolved" value={lanes.resolved.length} />
        </div>

        {lanes.clear.length > 0 && (
          <Lane
            title="Ready to clear"
            subtitle="Every check passed and the assistant found nothing to question — clear the lane in one click."
            tone="clear"
            action={
              <button
                onClick={approveAllClear}
                disabled={bulkApproving}
                className="rounded bg-clear px-3 py-1.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {bulkApproving ? "Approving…" : `Approve all (${lanes.clear.length})`}
              </button>
            }
          >
            {lanes.clear.map((e) => (
              <Row key={e.id} expense={e} tone="clear" onSelect={setSelectedId} />
            ))}
          </Lane>
        )}

        {lanes.review.length > 0 && (
          <Lane
            title="Needs your review"
            subtitle="The assistant did the digging but couldn't resolve these — evidence is assembled inside."
            tone="flag"
          >
            {lanes.review.map((e) => (
              <Row key={e.id} expense={e} tone="flag" onSelect={setSelectedId} />
            ))}
          </Lane>
        )}

        {lanes.untriaged.length > 0 && (
          <Lane
            title="Awaiting triage"
            subtitle="Submitted expenses the assistant hasn't investigated yet."
            tone="neutral"
          >
            {lanes.untriaged.map((e) => (
              <Row
                key={e.id}
                expense={e}
                tone="neutral"
                onSelect={setSelectedId}
                busy={triaging.has(e.id)}
              />
            ))}
          </Lane>
        )}

        {lanes.resolved.length > 0 && (
          <Lane title="Resolved" subtitle="Decisions made this session — full audit trail inside." tone="neutral">
            {lanes.resolved.map((e) => (
              <Row key={e.id} expense={e} tone="neutral" onSelect={setSelectedId} />
            ))}
          </Lane>
        )}
      </main>

      <footer className="mx-auto max-w-6xl px-6 pb-8 text-xs text-ink-faint">
        Prototype for the Netchex Applied AI exercise — design notes, architecture, and the honest
        &ldquo;where the model got it wrong&rdquo; story are in{" "}
        <a
          href="https://github.com/rajdeepmondaldotcom/flowco"
          target="_blank"
          rel="noreferrer"
          className="text-accent underline"
        >
          the repo
        </a>
        .
      </footer>

      {selected && policy && (
        <CaseDetail
          key={selected.id}
          expense={selected}
          all={expenses}
          policy={policy}
          onClose={() => setSelectedId(null)}
          onAction={act}
        />
      )}
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: "clear" | "flag" }) {
  const color = tone === "clear" ? "text-clear" : tone === "flag" ? "text-flag" : "text-ink";
  return (
    <div className="rounded-md border border-line bg-surface px-4 py-3">
      <div className={`figure text-2xl font-semibold ${color}`}>{value}</div>
      <div className="mt-0.5 text-xs font-medium uppercase tracking-wide text-ink-faint">{label}</div>
    </div>
  );
}

function Lane({
  title,
  subtitle,
  tone,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "clear" | "flag" | "neutral";
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  const titleColor = tone === "clear" ? "text-clear" : tone === "flag" ? "text-flag" : "text-ink";
  return (
    <section className="mb-8">
      <div className="mb-2 flex items-end justify-between gap-4">
        <div>
          <h2 className={`text-sm font-bold uppercase tracking-wider ${titleColor}`}>{title}</h2>
          <p className="text-xs text-ink-faint">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="overflow-x-auto rounded-md border border-line bg-surface">
        <div className="min-w-[760px]">{children}</div>
      </div>
    </section>
  );
}

function Row({
  expense,
  tone,
  onSelect,
  busy,
}: {
  expense: TriagedExpense;
  tone: "clear" | "flag" | "neutral";
  onSelect: (id: string) => void;
  busy?: boolean;
}) {
  const railColor =
    tone === "clear" ? "bg-clear" : tone === "flag" ? "bg-flag" : "bg-line-strong";
  const flags = flagsFor(expense);
  return (
    <button
      onClick={() => onSelect(expense.id)}
      className={`row-in flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left last:border-b-0 hover:bg-paper ${busy ? "pulse-soft" : ""}`}
    >
      <span className={`lane-rail ${railColor}`} />
      <span className="figure w-20 shrink-0 text-xs text-ink-faint">{expense.id}</span>
      <span className="w-36 shrink-0 truncate text-sm font-medium">{expense.employee.name}</span>
      <span className="hidden w-40 shrink-0 truncate text-sm text-ink-soft md:block">
        {expense.merchant}
      </span>
      <span className="chip bg-neutral-chip text-ink-soft shrink-0">{expense.category}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">
        {busy
          ? "assistant is investigating…"
          : expense.aiVerdict?.summary ?? expense.purpose}
      </span>
      <span className="hidden shrink-0 gap-1 lg:flex">
        {flags.slice(0, 2).map((f) => (
          <span key={f} className="chip bg-flag-soft text-flag">
            {f}
          </span>
        ))}
      </span>
      <span className="figure w-14 shrink-0 text-right text-xs text-ink-faint">
        {fmtDate(expense.transactionDate)}
      </span>
      <span className="figure w-20 shrink-0 text-right text-sm font-semibold">
        {fmtMoney(expense.total, expense.currency)}
      </span>
      <span className="w-24 shrink-0 text-right">
        <StatusChip status={expense.status} />
      </span>
    </button>
  );
}
