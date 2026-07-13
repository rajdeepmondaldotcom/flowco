"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Policy, TriagedExpense } from "@/lib/types";
import { flagsFor, fmtDate, fmtMoney, StatusChip } from "./badges";
import CaseDetail from "./CaseDetail";
import ThemeToggle from "./ThemeToggle";

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
  const [cursor, setCursor] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const res = await fetch("/api/expenses");
    const data = await res.json();
    if (data.error) {
      setError(data.error);
      return;
    }
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
    await refresh();
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

  // Value metrics — the leverage story, in numbers.
  const metrics = useMemo(() => {
    const triaged = expenses.filter((e) => e.aiVerdict);
    const clearCount = expenses.filter((e) => e.aiVerdict?.verdict === "clear").length;
    const recovered = expenses.reduce((sum, e) => {
      const r = e.aiVerdict?.reimbursableAmount;
      if (r && e.total - r.value > 0.005) return sum + (e.total - r.value);
      return sum;
    }, 0);
    return {
      triagedCount: triaged.length,
      clearPct: triaged.length ? Math.round((clearCount / triaged.length) * 100) : 0,
      recovered,
    };
  }, [expenses]);

  const approveAllClear = useCallback(async () => {
    setBulkApproving(true);
    for (const e of lanes.clear) {
      await act(e.id, "approve");
    }
    setBulkApproving(false);
  }, [lanes.clear, act]);

  // Flat visible order for keyboard nav
  const visibleOrder = useMemo(
    () => [...lanes.clear, ...lanes.review, ...lanes.untriaged, ...lanes.resolved].map((e) => e.id),
    [lanes]
  );

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (selectedId) return; // panel handles its own keys
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j" || e.key === "ArrowDown") {
        e.preventDefault();
        setCursor((c) => {
          const i = visibleOrder.indexOf(c ?? "");
          return visibleOrder[Math.min(visibleOrder.length - 1, i + 1)] ?? visibleOrder[0] ?? null;
        });
      } else if (e.key === "k" || e.key === "ArrowUp") {
        e.preventDefault();
        setCursor((c) => {
          const i = visibleOrder.indexOf(c ?? "");
          return visibleOrder[Math.max(0, i - 1)] ?? visibleOrder[0] ?? null;
        });
      } else if ((e.key === "Enter" || e.key === "o") && cursor) {
        e.preventDefault();
        setSelectedId(cursor);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedId, cursor, visibleOrder]);

  const selected = expenses.find((e) => e.id === selectedId) ?? null;
  const pendingCount = lanes.untriaged.length;

  return (
    <div className="desk-canvas flex-1">
      <header className="sticky top-0 z-30 border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-3">
          <div className="flex items-center gap-3">
            <LedgerMark />
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold tracking-tight">FlowCo</span>
              <span className="hidden h-3 w-px bg-line-strong sm:block" />
              <span className="hidden text-[13px] text-ink-soft sm:block">Approvals Triage</span>
            </div>
            {mockMode && (
              <span className="chip bg-danger-soft text-danger">mock — set ANTHROPIC_API_KEY</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <a
              href="/submit"
              className="hidden rounded-md px-2.5 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-paper sm:block"
            >
              Employee submit
            </a>
            <button
              onClick={resetDemo}
              className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-soft transition hover:bg-paper"
            >
              Reset
            </button>
            <button
              onClick={runTriage}
              disabled={running || pendingCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
            >
              {running && <Spinner />}
              {running
                ? `Triaging ${metrics.triagedCount}/${expenses.length}`
                : pendingCount > 0
                  ? `Run assistant triage · ${pendingCount}`
                  : "Queue triaged"}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            <span>{error}</span>
            <button className="underline" onClick={() => setError(null)}>
              dismiss
            </button>
          </div>
        )}

        {/* Value metrics — the leverage story */}
        <div className="mb-7 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface shadow-sm md:grid-cols-4">
          <Metric label="Awaiting triage" value={String(lanes.untriaged.length)} />
          <Metric
            label="Ready to clear"
            value={String(lanes.clear.length)}
            sub={metrics.triagedCount ? `${metrics.clearPct}% auto-cleared` : undefined}
            tone="clear"
            divide
          />
          <Metric label="Needs your review" value={String(lanes.review.length)} tone="flag" divide />
          <Metric
            label="Recovered by the assistant"
            value={fmtMoney(metrics.recovered, "USD")}
            sub="caught non-reimbursable"
            tone="accent"
            divide
          />
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
                className="inline-flex items-center gap-2 rounded-md bg-clear px-3.5 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
              >
                {bulkApproving && <Spinner />}
                {bulkApproving ? "Approving…" : `Approve all · ${lanes.clear.length}`}
              </button>
            }
          >
            {lanes.clear.map((e, i) => (
              <Row key={e.id} expense={e} tone="clear" index={i} cursor={cursor} onSelect={setSelectedId} />
            ))}
          </Lane>
        )}

        {lanes.review.length > 0 && (
          <Lane
            title="Needs your review"
            subtitle="The assistant did the digging but couldn't resolve these — the evidence is assembled inside."
            tone="flag"
          >
            {lanes.review.map((e, i) => (
              <Row key={e.id} expense={e} tone="flag" index={i} cursor={cursor} onSelect={setSelectedId} />
            ))}
          </Lane>
        )}

        {lanes.untriaged.length > 0 && (
          <Lane
            title="Awaiting triage"
            subtitle="Submitted expenses the assistant hasn't investigated yet."
            tone="neutral"
          >
            {lanes.untriaged.map((e, i) => (
              <Row
                key={e.id}
                expense={e}
                tone="neutral"
                index={i}
                cursor={cursor}
                onSelect={setSelectedId}
                busy={triaging.has(e.id)}
              />
            ))}
          </Lane>
        )}

        {lanes.resolved.length > 0 && (
          <Lane title="Resolved" subtitle="Decisions made this session — full audit trail inside." tone="neutral">
            {lanes.resolved.map((e, i) => (
              <Row key={e.id} expense={e} tone="neutral" index={i} cursor={cursor} onSelect={setSelectedId} />
            ))}
          </Lane>
        )}

        <footer className="flex items-center justify-between gap-4 pb-8 pt-2 text-xs text-ink-faint">
          <span>
            <kbd className="mono rounded border border-line px-1">j</kbd>{" "}
            <kbd className="mono rounded border border-line px-1">k</kbd> to move ·{" "}
            <kbd className="mono rounded border border-line px-1">↵</kbd> to open
          </span>
          <span>
            Netchex Applied AI exercise ·{" "}
            <a
              href="https://github.com/rajdeepmondaldotcom/flowco"
              target="_blank"
              rel="noreferrer"
              className="text-accent underline"
            >
              repo
            </a>
          </span>
        </footer>
      </main>

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

function LedgerMark() {
  return (
    <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
      <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
        <path d="M6 3h9l3 3v15H6z" />
        <path d="M9 8h6M9 12h6M9 16h3" strokeWidth="1.6" />
      </svg>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-3.5 w-3.5 animate-spin" viewBox="0 0 24 24" fill="none">
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="3" opacity="0.25" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

function Metric({
  label,
  value,
  sub,
  tone,
  divide,
}: {
  label: string;
  value: string;
  sub?: string;
  tone?: "clear" | "flag" | "accent";
  divide?: boolean;
}) {
  const color =
    tone === "clear" ? "text-clear" : tone === "flag" ? "text-flag" : tone === "accent" ? "text-accent" : "text-ink";
  return (
    <div className={`px-5 py-4 ${divide ? "border-t border-line md:border-l md:border-t-0" : ""}`}>
      <div className={`figure display text-[27px] font-semibold leading-none ${color}`}>{value}</div>
      <div className="mt-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">{label}</div>
      {sub && <div className="mt-0.5 text-[11px] text-ink-faint">{sub}</div>}
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
  const dot = tone === "clear" ? "bg-clear" : tone === "flag" ? "bg-flag" : "bg-line-strong";
  const titleColor = tone === "clear" ? "text-clear" : tone === "flag" ? "text-flag" : "text-ink";
  return (
    <section className="mb-7">
      <div className="mb-2.5 flex items-end justify-between gap-4">
        <div className="flex items-start gap-2.5">
          <span className={`mt-1.5 h-2 w-2 rounded-full ${dot}`} />
          <div>
            <h2 className={`text-[13px] font-bold uppercase tracking-wider ${titleColor}`}>{title}</h2>
            <p className="text-xs text-ink-faint">{subtitle}</p>
          </div>
        </div>
        {action}
      </div>
      <div className="overflow-x-auto rounded-xl border border-line bg-surface shadow-sm">
        <div className="min-w-[760px]">{children}</div>
      </div>
    </section>
  );
}

function Row({
  expense,
  tone,
  index,
  cursor,
  onSelect,
  busy,
}: {
  expense: TriagedExpense;
  tone: "clear" | "flag" | "neutral";
  index: number;
  cursor: string | null;
  onSelect: (id: string) => void;
  busy?: boolean;
}) {
  const ref = useRef<HTMLButtonElement>(null);
  const active = cursor === expense.id;
  useEffect(() => {
    if (active) ref.current?.scrollIntoView({ block: "nearest" });
  }, [active]);

  const railColor = tone === "clear" ? "bg-clear" : tone === "flag" ? "bg-flag" : "bg-line-strong";
  const flags = flagsFor(expense);
  return (
    <button
      ref={ref}
      onClick={() => onSelect(expense.id)}
      style={{ animationDelay: `${Math.min(index * 22, 200)}ms` }}
      className={`row-in flex w-full items-center gap-3 border-b border-line px-3 py-2.5 text-left transition last:border-b-0 hover:bg-paper ${
        active ? "bg-paper ring-1 ring-inset ring-accent/40" : ""
      } ${busy ? "reconciling" : ""}`}
    >
      <span className={`lane-rail ${railColor}`} />
      <span className="figure w-[74px] shrink-0 text-xs text-ink-faint">{expense.id}</span>
      <span className="w-32 shrink-0 truncate text-sm font-medium">{expense.employee.name}</span>
      <span className="hidden w-36 shrink-0 truncate text-sm text-ink-soft md:block">{expense.merchant}</span>
      <span className="chip shrink-0 bg-neutral-chip text-ink-soft">{expense.category}</span>
      <span className="min-w-0 flex-1 truncate text-xs text-ink-faint">
        {busy ? "assistant is investigating…" : expense.aiVerdict?.summary ?? expense.purpose}
      </span>
      <span className="hidden shrink-0 gap-1 lg:flex">
        {flags.slice(0, 2).map((f) => (
          <span key={f} className="chip bg-flag-soft text-flag">
            {f}
          </span>
        ))}
      </span>
      <span className="figure w-12 shrink-0 text-right text-xs text-ink-faint">{fmtDate(expense.transactionDate)}</span>
      <span className="figure w-20 shrink-0 text-right text-sm font-semibold">
        {fmtMoney(expense.total, expense.currency)}
      </span>
      <span className="w-24 shrink-0 text-right">
        <StatusChip status={expense.status} />
      </span>
    </button>
  );
}
