"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Policy, TriagedExpense } from "@/lib/types";
import { FLAG_EXPLAIN, flagsFor, fmtDate, fmtMoney, StatusChip } from "./badges";
import CaseDetail from "./CaseDetail";
import ThemeToggle from "./ThemeToggle";
import { useToast } from "./Toast";

const TRIAGE_CONCURRENCY = 3;

export default function TriageApp() {
  const [expenses, setExpenses] = useState<TriagedExpense[]>([]);
  const [policy, setPolicy] = useState<Policy | null>(null);
  const [mockMode, setMockMode] = useState(false);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [triaging, setTriaging] = useState<Set<string>>(new Set());
  const [running, setRunning] = useState(false);
  const [bulkApproving, setBulkApproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [activeFilters, setActiveFilters] = useState<Set<string>>(new Set());
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const [onboardingClosed, setOnboardingClosed] = useState(false);
  const toast = useToast();

  const refresh = useCallback(async () => {
    try {
      const res = await fetch("/api/expenses");
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        return;
      }
      setExpenses(data.expenses);
      setPolicy(data.policy);
      setMockMode(data.mockMode);
    } finally {
      setLoading(false);
    }
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

  const revert = useCallback(async (id: string) => {
    const res = await fetch("/api/action", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, action: "revert" }),
    });
    const data = await res.json();
    if (res.ok) updateExpense(data.expense);
  }, []);

  const act = useCallback(
    async (id: string, action: "approve" | "reject" | "request_info", message?: string) => {
      const before = expenses.find((e) => e.id === id);
      const res = await fetch("/api/action", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ id, action, message }),
      });
      const data = await res.json();
      if (!res.ok) {
        toast({
          title: "Couldn't save that",
          description: data.error ?? "Please try again",
          tone: "danger",
          action: { label: "Retry", onClick: () => act(id, action, message) },
        });
        return;
      }
      updateExpense(data.expense);
      const label = action === "approve" ? "Approved" : action === "reject" ? "Rejected" : "Info requested";
      toast({
        title: `${label} · ${id}`,
        description: before ? `${before.employee.name} — ${before.merchant}` : undefined,
        tone: action === "approve" ? "success" : action === "reject" ? "danger" : "flag",
        action: { label: "Undo", onClick: () => revert(id) },
      });
    },
    [expenses, toast, revert]
  );

  const resetDemo = useCallback(async () => {
    setLoading(true);
    await fetch("/api/reset", { method: "POST" });
    setSelectedId(null);
    setError(null);
    setQuery("");
    setActiveFilters(new Set());
    setOnboardingClosed(false);
    await refresh();
    toast({ title: "Queue reset", description: "Back to a fresh set of submissions", tone: "default" });
  }, [refresh, toast]);

  // ---- filtering (search + flag chips) ----
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (q) {
        const hay = `${e.id} ${e.employee.name} ${e.merchant} ${e.category} ${e.purpose}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      if (activeFilters.size > 0) {
        const flags = new Set(flagsFor(e));
        for (const f of activeFilters) if (!flags.has(f)) return false;
      }
      return true;
    });
  }, [expenses, query, activeFilters]);

  const availableFilters = useMemo(() => {
    const counts = new Map<string, number>();
    for (const e of expenses) for (const f of flagsFor(e)) counts.set(f, (counts.get(f) ?? 0) + 1);
    return [...counts.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const lanes = useMemo(() => {
    const untriaged = filtered.filter((e) => e.status === "pending");
    const clear = filtered.filter((e) => e.status === "triaged" && e.aiVerdict?.verdict === "clear");
    const review = filtered.filter((e) => e.status === "triaged" && e.aiVerdict?.verdict === "needs_human");
    const resolved = filtered.filter((e) => ["approved", "rejected", "info_requested"].includes(e.status));
    return { untriaged, clear, review, resolved };
  }, [filtered]);

  const metrics = useMemo(() => {
    const triaged = expenses.filter((e) => e.aiVerdict);
    const clearCount = expenses.filter((e) => e.aiVerdict?.verdict === "clear").length;
    const recovered = expenses.reduce((sum, e) => {
      const r = e.aiVerdict?.reimbursableAmount;
      if (r && e.total - r.value > 0.005) return sum + (e.total - r.value);
      return sum;
    }, 0);
    const resolvedCount = expenses.filter((e) =>
      ["approved", "rejected", "info_requested"].includes(e.status)
    ).length;
    return {
      total: expenses.length,
      triagedCount: triaged.length,
      clearPct: triaged.length ? Math.round((clearCount / triaged.length) * 100) : 0,
      recovered,
      resolvedCount,
    };
  }, [expenses]);

  const approveAllClear = useCallback(async () => {
    setBulkApproving(true);
    const ids = lanes.clear.map((e) => e.id);
    for (const e of lanes.clear) await act(e.id, "approve");
    setBulkApproving(false);
    // Replace the per-item toasts with one clear summary + undo-all.
    if (ids.length > 1) {
      toast({
        title: `Approved ${ids.length} expenses`,
        description: "The whole clear lane",
        tone: "success",
        action: { label: "Undo all", onClick: () => ids.forEach((id) => revert(id)) },
      });
    }
  }, [lanes.clear, act, toast, revert]);

  const visibleOrder = useMemo(
    () => [...lanes.review, ...lanes.clear, ...lanes.untriaged, ...lanes.resolved].map((e) => e.id),
    [lanes]
  );

  // ---- keyboard ----
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "?") {
        e.preventDefault();
        setShowShortcuts((s) => !s);
        return;
      }
      if (showShortcuts && e.key === "Escape") {
        setShowShortcuts(false);
        return;
      }
      if (confirmingReset) {
        if (e.key === "Escape") setConfirmingReset(false);
        return; // the confirm dialog owns the keyboard while open
      }
      if (selectedId) return; // panel owns its keys
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
  }, [selectedId, cursor, visibleOrder, showShortcuts, confirmingReset]);

  const selected = expenses.find((e) => e.id === selectedId) ?? null;
  const pendingCount = expenses.filter((e) => e.status === "pending").length;
  const isFresh = !loading && metrics.total > 0 && metrics.triagedCount === 0 && metrics.resolvedCount === 0;
  const inboxZero =
    !loading &&
    metrics.total > 0 &&
    lanes.untriaged.length === 0 &&
    lanes.clear.length === 0 &&
    lanes.review.length === 0 &&
    !query &&
    activeFilters.size === 0;
  const anyResults = lanes.untriaged.length + lanes.clear.length + lanes.review.length + lanes.resolved.length > 0;
  const progress = running && metrics.total ? metrics.triagedCount / metrics.total : 0;

  const openAt = (id: string) => {
    setSelectedId(id);
    setCursor(id);
  };
  const selIndex = selected ? visibleOrder.indexOf(selected.id) : -1;
  const prevId = selIndex > 0 ? visibleOrder[selIndex - 1] : null;
  const nextId = selIndex >= 0 && selIndex < visibleOrder.length - 1 ? visibleOrder[selIndex + 1] : null;

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
            {mockMode && <span className="chip bg-danger-soft text-danger">mock — set ANTHROPIC_API_KEY</span>}
          </div>
          <div className="flex items-center gap-1.5">
            <button
              onClick={() => setShowShortcuts(true)}
              className="hidden h-8 w-8 items-center justify-center rounded-md border border-line text-ink-soft hover:bg-paper sm:flex"
              aria-label="Keyboard shortcuts"
              title="Keyboard shortcuts (?)"
            >
              <span className="mono text-xs">?</span>
            </button>
            <ThemeToggle />
            <a
              href="/submit"
              className="hidden rounded-md px-2.5 py-1.5 text-[13px] font-medium text-ink-soft hover:bg-paper sm:block"
            >
              Employee submit
            </a>
            <button
              onClick={() => setConfirmingReset(true)}
              title="Reset the demo to its starting state — all expenses back to un-triaged"
              className="rounded-md border border-line-strong px-3 py-1.5 text-[13px] font-medium text-ink-soft transition hover:bg-paper"
            >
              Reset demo
            </button>
            <button
              onClick={runTriage}
              disabled={running || pendingCount === 0}
              className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-1.5 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-40"
            >
              {running && <Spinner />}
              {running
                ? `Triaging ${metrics.triagedCount}/${metrics.total}`
                : pendingCount > 0
                  ? `Run assistant triage · ${pendingCount}`
                  : "Queue triaged"}
            </button>
          </div>
        </div>
        {/* live progress bar */}
        <div className="h-0.5 w-full bg-transparent">
          {running && (
            <div
              className="h-full bg-accent transition-all duration-500 ease-out"
              style={{ width: `${Math.max(4, progress * 100)}%` }}
            />
          )}
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-6 py-6">
        {error && (
          <div className="mb-4 flex items-center justify-between rounded-md border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            <span>{error}</span>
            <div className="flex items-center gap-3">
              <button className="font-medium underline" onClick={refresh}>
                retry
              </button>
              <button className="underline" onClick={() => setError(null)}>
                dismiss
              </button>
            </div>
          </div>
        )}

        {isFresh && !onboardingClosed && (
          <Onboarding
            count={pendingCount}
            running={running}
            onRun={runTriage}
            onClose={() => setOnboardingClosed(true)}
          />
        )}

        {/* Value metrics */}
        <div className="mb-5 grid grid-cols-2 overflow-hidden rounded-xl border border-line bg-surface shadow-sm md:grid-cols-4">
          <Metric label="Awaiting triage" value={loading ? "—" : String(lanes.untriaged.length)} />
          <Metric
            label="Ready to clear"
            value={loading ? "—" : String(lanes.clear.length)}
            sub={metrics.triagedCount ? `${metrics.clearPct}% auto-cleared` : undefined}
            tone="clear"
            divide
          />
          <Metric label="Needs your review" value={loading ? "—" : String(lanes.review.length)} tone="flag" divide />
          <Metric
            label="Recovered by the assistant"
            value={<CountUp value={metrics.recovered} />}
            sub="caught non-reimbursable"
            tone="accent"
            divide
          />
        </div>

        {/* Toolbar: search + filters */}
        {!loading && metrics.total > 0 && !inboxZero && (
          <Toolbar
            query={query}
            setQuery={setQuery}
            filters={availableFilters}
            active={activeFilters}
            toggle={(f) =>
              setActiveFilters((prev) => {
                const next = new Set(prev);
                if (next.has(f)) next.delete(f);
                else next.add(f);
                return next;
              })
            }
            clear={() => {
              setQuery("");
              setActiveFilters(new Set());
            }}
            showing={filtered.length}
            total={metrics.total}
          />
        )}

        {loading && <SkeletonLane />}

        {inboxZero && (
          <InboxZero
            resolved={metrics.resolvedCount}
            recovered={metrics.recovered}
            onReset={() => setConfirmingReset(true)}
          />
        )}

        {!loading && !inboxZero && (
          <>
            {lanes.clear.length > 0 && (
              <Lane
                title="Ready to clear"
                subtitle="Every check passed and the assistant found nothing to question — clear the lane in one click."
                tone="clear"
                count={lanes.clear.length}
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
                  <Row key={e.id} expense={e} tone="clear" index={i} cursor={cursor} onSelect={openAt} />
                ))}
              </Lane>
            )}

            {lanes.review.length > 0 && (
              <Lane
                title="Needs your review"
                subtitle="The assistant did the digging but couldn't resolve these — the evidence is assembled inside."
                tone="flag"
                count={lanes.review.length}
              >
                {lanes.review.map((e, i) => (
                  <Row key={e.id} expense={e} tone="flag" index={i} cursor={cursor} onSelect={openAt} />
                ))}
              </Lane>
            )}

            {lanes.untriaged.length > 0 && (
              <Lane
                title="Awaiting triage"
                subtitle="Submitted expenses the assistant hasn't investigated yet."
                tone="neutral"
                count={lanes.untriaged.length}
              >
                {lanes.untriaged.map((e, i) => (
                  <Row
                    key={e.id}
                    expense={e}
                    tone="neutral"
                    index={i}
                    cursor={cursor}
                    onSelect={openAt}
                    busy={triaging.has(e.id)}
                  />
                ))}
              </Lane>
            )}

            {lanes.resolved.length > 0 && (
              <Lane
                title="Resolved"
                subtitle="Decisions made this session — full audit trail inside."
                tone="neutral"
                count={lanes.resolved.length}
              >
                {lanes.resolved.map((e, i) => (
                  <Row key={e.id} expense={e} tone="neutral" index={i} cursor={cursor} onSelect={openAt} />
                ))}
              </Lane>
            )}

            {!anyResults && (query || activeFilters.size > 0) && (
              <NoResults
                onClear={() => {
                  setQuery("");
                  setActiveFilters(new Set());
                }}
              />
            )}
          </>
        )}

        <footer className="flex items-center justify-between gap-4 pb-8 pt-3 text-xs text-ink-faint">
          <button onClick={() => setShowShortcuts(true)} className="hover:text-ink-soft">
            <kbd className="mono rounded border border-line px-1">?</kbd> keyboard shortcuts
          </button>
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
          onRevert={revert}
          onNavigate={openAt}
          prevId={prevId}
          nextId={nextId}
          position={{ index: selIndex < 0 ? 0 : selIndex, total: visibleOrder.length }}
        />
      )}

      {showShortcuts && <ShortcutsOverlay onClose={() => setShowShortcuts(false)} />}

      {confirmingReset && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4" role="dialog" aria-modal="true">
          <div
            className="fade-in absolute inset-0 bg-ink/40 backdrop-blur-[1px]"
            onClick={() => setConfirmingReset(false)}
            aria-hidden
          />
          <div className="panel-in shadow-float relative w-full max-w-md rounded-2xl border border-line bg-surface p-6">
            <h3 className="display text-lg font-semibold text-ink">Reset the demo to the start?</h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-ink-soft">
              This returns the queue to its starting point — all{" "}
              <span className="figure font-semibold text-ink">{expenses.length}</span>{" "}expenses go
              back to freshly&#8209;submitted (un&#8209;triaged), and every approval, rejection, and info
              request is cleared. It&rsquo;s the clean slate to run a demo from the beginning.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                onClick={() => setConfirmingReset(false)}
                className="rounded-md border border-line-strong px-4 py-2 text-[13px] font-medium text-ink-soft transition hover:bg-paper"
              >
                Cancel
              </button>
              <button
                onClick={() => {
                  setConfirmingReset(false);
                  resetDemo();
                }}
                className="rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Reset to start
              </button>
            </div>
          </div>
        </div>
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

function CountUp({ value }: { value: number }) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const start = performance.now();
    const dur = 600;
    let raf = 0;
    const tick = (t: number) => {
      const p = Math.min(1, (t - start) / dur);
      const eased = 1 - Math.pow(1 - p, 3);
      setDisplay(from + (to - from) * eased);
      if (p < 1) raf = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);
  return <>{fmtMoney(display, "USD")}</>;
}

function Onboarding({
  count,
  running,
  onRun,
  onClose,
}: {
  count: number;
  running: boolean;
  onRun: () => void;
  onClose: () => void;
}) {
  return (
    <div className="fade-in mb-5 overflow-hidden rounded-xl border border-accent/25 bg-accent-soft/60">
      <div className="flex flex-col gap-4 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-white">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M13 2L3 14h7l-1 8 10-12h-7z" />
            </svg>
          </div>
          <div>
            <p className="text-sm font-semibold text-ink">
              {count} expenses are waiting. Let the assistant do the digging.
            </p>
            <p className="mt-0.5 text-xs text-ink-soft">
              It reads every receipt, runs the policy checks, and clears the clean ones — you only decide what it
              can&apos;t.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            onClick={onRun}
            disabled={running}
            className="inline-flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-[13px] font-semibold text-white shadow-sm transition hover:brightness-110 disabled:opacity-50"
          >
            {running ? <Spinner /> : null}
            {running ? "Working…" : "Run assistant triage"}
          </button>
          <button
            onClick={onClose}
            className="rounded-md p-1.5 text-ink-faint hover:text-ink"
            aria-label="Dismiss"
          >
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>
      <div className="grid grid-cols-1 border-t border-accent/15 text-xs text-ink-soft sm:grid-cols-3">
        <Step n="1" title="Assistant investigates" body="Reads the receipt, reconciles it, runs every policy check." />
        <Step n="2" title="Clean ones auto-clear" body="Under cap, receipt matches, nothing odd → one-click lane." divide />
        <Step n="3" title="You decide the rest" body="Ambiguous, over-cap, duplicate → evidence assembled for you." divide />
      </div>
    </div>
  );
}

function Step({ n, title, body, divide }: { n: string; title: string; body: string; divide?: boolean }) {
  return (
    <div className={`flex gap-2.5 px-5 py-3 ${divide ? "border-t border-accent/15 sm:border-l sm:border-t-0" : ""}`}>
      <span className="mono flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-accent/15 text-[11px] font-semibold text-accent">
        {n}
      </span>
      <div>
        <div className="font-semibold text-ink">{title}</div>
        <div className="mt-0.5">{body}</div>
      </div>
    </div>
  );
}

function Toolbar({
  query,
  setQuery,
  filters,
  active,
  toggle,
  clear,
  showing,
  total,
}: {
  query: string;
  setQuery: (s: string) => void;
  filters: [string, number][];
  active: Set<string>;
  toggle: (f: string) => void;
  clear: () => void;
  showing: number;
  total: number;
}) {
  const dirty = query.length > 0 || active.size > 0;
  return (
    <div className="mb-5 flex flex-col gap-3">
      <div className="flex items-center gap-3">
        <div className="relative flex-1">
          <svg
            className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-ink-faint"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="11" cy="11" r="7" />
            <path d="M21 21l-4.3-4.3" />
          </svg>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by employee, merchant, or ID…"
            className="w-full rounded-lg border border-line bg-surface py-2 pl-9 pr-3 text-sm placeholder:text-ink-faint focus:border-accent focus:outline-none"
          />
        </div>
        <span className="hidden shrink-0 text-xs text-ink-faint sm:block">
          {dirty ? `${showing} of ${total}` : `${total} expenses`}
        </span>
      </div>
      {filters.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {filters.map(([f, n]) => {
            const on = active.has(f);
            return (
              <button
                key={f}
                onClick={() => toggle(f)}
                title={FLAG_EXPLAIN[f]}
                className={`chip border transition ${
                  on
                    ? "border-flag bg-flag text-white"
                    : "border-line bg-surface text-ink-soft hover:border-line-strong"
                }`}
              >
                {f}
                <span className={`mono ${on ? "opacity-80" : "text-ink-faint"}`}>{n}</span>
              </button>
            );
          })}
          {dirty && (
            <button onClick={clear} className="chip text-ink-faint hover:text-ink">
              clear
            </button>
          )}
        </div>
      )}
    </div>
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
  value: React.ReactNode;
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
  count,
  action,
  children,
}: {
  title: string;
  subtitle: string;
  tone: "clear" | "flag" | "neutral";
  count: number;
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
            <h2 className={`flex items-center gap-2 text-[13px] font-bold uppercase tracking-wider ${titleColor}`}>
              {title}
              <span className="mono rounded-full bg-neutral-chip px-1.5 text-[11px] font-semibold text-ink-soft">
                {count}
              </span>
            </h2>
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
          <span key={f} className="chip bg-flag-soft text-flag" title={FLAG_EXPLAIN[f]}>
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

function SkeletonLane() {
  return (
    <div className="mb-7">
      <div className="mb-2.5 h-4 w-40 animate-pulse rounded bg-neutral-chip" />
      <div className="overflow-hidden rounded-xl border border-line bg-surface shadow-sm">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 border-b border-line px-3 py-3 last:border-b-0">
            <span className="h-4 w-16 animate-pulse rounded bg-neutral-chip" style={{ animationDelay: `${i * 80}ms` }} />
            <span className="h-4 w-28 animate-pulse rounded bg-neutral-chip" />
            <span className="h-4 flex-1 animate-pulse rounded bg-neutral-chip" />
            <span className="h-4 w-16 animate-pulse rounded bg-neutral-chip" />
          </div>
        ))}
      </div>
    </div>
  );
}

function InboxZero({
  resolved,
  recovered,
  onReset,
}: {
  resolved: number;
  recovered: number;
  onReset: () => void;
}) {
  return (
    <div className="fade-in flex flex-col items-center rounded-xl border border-line bg-surface px-6 py-16 text-center shadow-sm">
      <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clear-soft text-clear">
        <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      </div>
      <h2 className="text-lg font-bold">You&apos;re all caught up</h2>
      <p className="mt-1 max-w-md text-sm text-ink-soft">
        Every expense in the queue has a decision. You cleared{" "}
        <span className="font-semibold text-ink">{resolved}</span>
        {recovered > 0.005 && (
          <>
            {" "}
            and the assistant flagged{" "}
            <span className="figure font-semibold text-accent">{fmtMoney(recovered, "USD")}</span> of
            non-reimbursable spend
          </>
        )}
        .
      </p>
      <button
        onClick={onReset}
        className="mt-5 rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
      >
        Load a fresh queue
      </button>
    </div>
  );
}

function NoResults({ onClear }: { onClear: () => void }) {
  return (
    <div className="flex flex-col items-center rounded-xl border border-dashed border-line-strong px-6 py-12 text-center">
      <p className="text-sm font-medium text-ink">No expenses match your search</p>
      <button onClick={onClear} className="mt-2 text-sm text-accent underline">
        Clear filters
      </button>
    </div>
  );
}

function ShortcutsOverlay({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["j / ↓", "Move down the queue"],
    ["k / ↑", "Move up the queue"],
    ["↵ / o", "Open the highlighted case"],
    ["a", "Approve (in a case)"],
    ["r", "Reject (in a case)"],
    ["← / →", "Previous / next case"],
    ["Esc", "Close panel or dialog"],
    ["?", "Show this help"],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="fade-in absolute inset-0 bg-ink/40 backdrop-blur-[1px]" onClick={onClose} aria-hidden />
      <div className="panel-in shadow-float relative w-full max-w-sm rounded-2xl border border-line bg-surface p-5">
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-sm font-bold uppercase tracking-wider text-ink-faint">Keyboard shortcuts</h3>
          <button onClick={onClose} className="rounded p-1 text-ink-faint hover:text-ink" aria-label="Close">
            <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
        <div className="divide-y divide-line">
          {rows.map(([k, d]) => (
            <div key={k} className="flex items-center justify-between py-2 text-sm">
              <span className="text-ink-soft">{d}</span>
              <kbd className="mono rounded border border-line bg-paper px-1.5 py-0.5 text-xs">{k}</kbd>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
