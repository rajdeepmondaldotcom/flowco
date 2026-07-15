"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";
import { fmtMoney } from "@/components/badges";
import { fmt } from "@/lib/currency";
import ThemeToggle from "@/components/ThemeToggle";
import { useToast } from "@/components/Toast";
import type { Employee } from "@/lib/types";
import type { ExpenseDraft } from "@/lib/extract";
import ChatMode, { type SubmitFile } from "./ChatMode";

const EXAMPLES = [
  "Team lunch on Swiggy after standup, about ₹1,900, receipt attached",
  "Ola from the office to the client meeting this morning, ₹2,730",
  "Figma seat for July, $45, billed to my card",
  "Dinner with a candidate at Toit last night, around ₹6,000, paid by card",
];

const EMPLOYEES: Employee[] = [
  { name: "Rajdeep Mondal", email: "rajdeep.mondal@flowco.com", department: "Engineering" },
  { name: "Priya Sharma", email: "priya.sharma@flowco.com", department: "Sales" },
  { name: "Ananya Iyer", email: "ananya.iyer@flowco.com", department: "Product" },
  { name: "Arjun Nair", email: "arjun.nair@flowco.com", department: "Customer Success" },
  { name: "Kavya Reddy", email: "kavya.reddy@flowco.com", department: "Engineering" },
  { name: "Shreyasi Das", email: "shreyasi.das@flowco.com", department: "Data Science" },
  { name: "Rohan Gupta", email: "rohan.gupta@flowco.com", department: "Marketing" },
];

type Phase = "compose" | "extracting" | "review" | "submitting" | "done";
type Mode = "chat" | "form";

export default function SubmitPage() {
  const [employee, setEmployee] = useState(EMPLOYEES[0]);
  const [mode, setMode] = useState<Mode>("form");
  const [chatKey, setChatKey] = useState(0);
  const [description, setDescription] = useState("");
  const [file, setFile] = useState<SubmitFile | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [phase, setPhase] = useState<Phase>("compose");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  const stepNo = phase === "done" ? 3 : phase === "review" || phase === "submitting" ? 2 : 1;

  const reset = () => {
    setDescription("");
    setFile(null);
    setDraft(null);
    setSubmittedId(null);
    setError(null);
    setPhase("compose");
    setChatKey((k) => k + 1); // fresh conversation next time
  };

  const onFile = (picked: File | undefined) => {
    if (!picked) return;
    const isPdf = picked.type === "application/pdf";
    const mediaType = isPdf ? "application/pdf" : picked.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setFile({
        base64: dataUrl.split(",")[1],
        mediaType,
        preview: isPdf ? null : dataUrl,
        name: picked.name,
      });
    };
    reader.onerror = () => {
      setError(`Couldn't read "${picked.name}" — try picking the file again.`);
    };
    reader.readAsDataURL(picked);
  };

  // Synchronous re-entry guard (same pattern as CaseDetail's actingRef):
  // React state updates are async, so a double-click can beat setPhase.
  const inFlightRef = useRef(false);

  const extract = async () => {
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("extracting");
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          fileBase64: file?.base64 ?? null,
          fileMediaType: file?.mediaType ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("compose");
    } finally {
      inFlightRef.current = false;
    }
  };

  const submit = async () => {
    if (!draft) return;
    if (inFlightRef.current) return;
    inFlightRef.current = true;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee,
          draft,
          fileBase64: file?.base64 ?? null,
          fileMediaType: file?.mediaType ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmittedId(data.expense.id);
      setPhase("done");
      toast({ title: `Submitted · ${data.expense.id}`, description: "It's in the approvals queue", tone: "success" });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("review");
    } finally {
      inFlightRef.current = false;
    }
  };

  return (
    <div className="desk-canvas flex-1">
      <header className="border-b border-line bg-surface/90 backdrop-blur">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-accent text-white shadow-sm">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M6 3h9l3 3v15H6z" />
                <path d="M9 8h6M9 12h6M9 16h3" strokeWidth="1.6" />
              </svg>
            </div>
            <div className="flex items-baseline gap-2">
              <span className="text-[15px] font-bold tracking-tight">FlowCo</span>
              <span className="hidden h-3 w-px bg-line-strong sm:block" />
              <span className="hidden text-[13px] text-ink-soft sm:block">Quick expense</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <Link href="/admin" className="rounded-md px-2.5 py-1.5 text-[13px] font-medium text-accent hover:bg-paper">
              Approver view →
            </Link>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-8">
        <Stepper current={stepNo} />

        {stepNo === 1 && (
          <ModeToggle
            mode={mode}
            onMode={(m) => {
              setMode(m);
              setError(null); // don't carry one mode's error banner into the other
            }}
            disabled={phase === "extracting"}
          />
        )}

        {error && (
          <div className="mb-4 rounded-lg border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {/* Chat stays mounted across phases so "Edit" returns to the same
            conversation; a new key after submit starts a fresh one. */}
        <div className={mode === "chat" && phase === "compose" ? "" : "hidden"}>
          <ChatMode
            key={chatKey}
            employees={EMPLOYEES}
            employee={employee}
            onEmployee={setEmployee}
            file={file}
            onFile={onFile}
            onClearFile={() => setFile(null)}
            onDraft={(d) => {
              setDraft(d);
              setError(null);
              setPhase("review");
            }}
          />
        </div>

        {mode === "form" && (phase === "compose" || phase === "extracting") && (
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <label className="mb-1 block text-xs font-medium text-ink-faint">You are</label>
            <select
              value={employee.email}
              onChange={(e) => setEmployee(EMPLOYEES.find((emp) => emp.email === e.target.value)!)}
              className="mb-4 w-full rounded border border-line px-3 py-2 text-sm"
            >
              {EMPLOYEES.map((emp) => (
                <option key={emp.email} value={emp.email}>
                  {emp.name} — {emp.department}
                </option>
              ))}
            </select>

            <label className="mb-1 block text-xs font-medium text-ink-faint">
              Describe it like you&apos;d tell a coworker
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Team lunch at Chipotle yesterday after the sprint review, $34.20 total, receipt attached"
              className="mb-2 w-full rounded-lg border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />

            {description.trim().length === 0 && (
              <div className="mb-4">
                <div className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-ink-faint">
                  Or start from an example
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {EXAMPLES.map((ex) => (
                    <button
                      key={ex}
                      onClick={() => setDescription(ex)}
                      className="rounded-full border border-line bg-surface px-2.5 py-1 text-left text-xs text-ink-soft transition hover:border-accent hover:text-accent"
                    >
                      {ex.length > 42 ? ex.slice(0, 42) + "…" : ex}
                    </button>
                  ))}
                </div>
              </div>
            )}

            <label className="mb-1 block text-xs font-medium text-ink-faint">
              Receipt photo or PDF (optional)
            </label>
            <input
              type="file"
              accept="image/png,image/jpeg,application/pdf"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="mb-3 block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
            />
            {file && file.preview && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={file.preview} alt="Receipt preview" className="mb-4 max-h-48 rounded border border-line" />
            )}
            {file && !file.preview && (
              <div className="mb-4 flex items-center gap-2 rounded-lg border border-line bg-paper px-3 py-2 text-sm">
                <span className="flex h-8 w-8 items-center justify-center rounded bg-danger-soft text-[10px] font-bold text-danger">
                  PDF
                </span>
                <span className="truncate text-ink-soft">{file.name}</span>
              </div>
            )}

            <button
              onClick={extract}
              disabled={phase === "extracting" || description.trim().length === 0}
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {phase === "extracting" ? "Assistant is reading…" : "Let the assistant fill it in"}
            </button>
            <p className="mt-2 text-center text-xs text-ink-faint">
              One sentence and a photo replace the seven-screen form.
            </p>
          </div>
        )}

        {(phase === "review" || phase === "submitting") && draft && (
          <div className="rounded-xl border border-line bg-surface p-5 shadow-sm">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-faint">
              Check what the assistant filled in
            </h2>
            {draft.receiptCurrency !== "USD" && draft.nativeTotal !== null && draft.total !== null && (
              <div className="mb-3 flex items-center justify-between gap-2 rounded-lg border border-accent/25 bg-accent-soft/50 px-3.5 py-2.5 text-sm">
                <span className="text-ink-soft">
                  Paid <span className="figure font-semibold text-ink">{fmt(draft.nativeTotal, draft.receiptCurrency)}</span>
                </span>
                <span className="text-accent" aria-hidden>
                  →
                </span>
                <span className="text-ink-soft">
                  Reimburse <span className="figure font-semibold text-ink">{fmtMoney(draft.total)}</span>
                </span>
              </div>
            )}
            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Merchant" value={draft.merchant ?? "—"} />
              <Field label="Category" value={draft.category ?? "—"} />
              <Field label="Date" value={draft.transactionDate ?? "—"} mono />
              <Field
                label={draft.receiptCurrency !== "USD" ? "Reimburse (USD)" : "Total"}
                value={draft.total !== null ? fmtMoney(draft.total) : "—"}
                mono
              />
              <Field label="Amount (USD)" value={draft.amount !== null ? fmtMoney(draft.amount) : "—"} mono />
              <Field label="Tax / tip (USD)" value={`${draft.tax !== null ? fmtMoney(draft.tax) : "—"} / ${draft.tip !== null ? fmtMoney(draft.tip) : "—"}`} mono />
            </div>
            <div className="mb-3 rounded bg-paper px-3 py-2 text-sm">
              <span className="text-xs text-ink-faint">Purpose </span>
              {draft.purpose ?? "—"}
            </div>
            <p className="mb-3 text-xs text-ink-faint">{draft.sourceNotes}</p>

            {draft.missing.length > 0 && (
              <div className="mb-3 border-l-2 border-flag bg-flag-soft/60 px-3 py-2 text-sm">
                <div className="text-xs font-bold uppercase tracking-wide text-flag">Still missing</div>
                <ul className="list-disc pl-4">
                  {draft.missing.map((m, i) => (
                    <li key={i}>{m}</li>
                  ))}
                </ul>
              </div>
            )}
            {draft.followUpQuestion && (
              <p className="mb-4 text-sm font-medium text-accent">{draft.followUpQuestion}</p>
            )}

            <div className="flex gap-2">
              <button
                onClick={submit}
                disabled={phase === "submitting"}
                className="flex-1 rounded bg-clear px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-50"
              >
                {phase === "submitting" ? "Submitting…" : "Looks right — submit"}
              </button>
              <button
                onClick={() => setPhase("compose")}
                className="rounded border border-line px-4 py-2.5 text-sm text-ink-soft hover:bg-paper"
              >
                Edit
              </button>
            </div>
          </div>
        )}

        {phase === "done" && (
          <div className="fade-in rounded-xl border border-line bg-surface p-8 text-center shadow-sm">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-clear-soft text-clear">
              <svg className="h-7 w-7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
            </div>
            <h2 className="text-lg font-bold">
              Sent to approvals · <span className="figure">{submittedId}</span>
            </h2>
            <p className="mx-auto mt-1 max-w-sm text-sm text-ink-soft">
              That&apos;s it — no seven screens. The assistant will read it, run the checks, and your approver only
              sees it if something needs a look.
            </p>
            <div className="mt-5 flex items-center justify-center gap-2">
              <button
                onClick={reset}
                className="rounded-md bg-accent px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:brightness-110"
              >
                Submit another
              </button>
              <Link
                href="/admin"
                className="rounded-md border border-line-strong px-4 py-2 text-sm font-medium text-ink-soft hover:bg-paper"
              >
                See the approver view →
              </Link>
            </div>
          </div>
        )}
      </main>
    </div>
  );
}

// Chat ↔ Quick form. Styled like the console's CurrencyToggle segmented control.
function ModeToggle({ mode, onMode, disabled }: { mode: Mode; onMode: (m: Mode) => void; disabled?: boolean }) {
  const options: { value: Mode; label: string; icon: ReactNode }[] = [
    {
      value: "chat",
      label: "Chat",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path
            d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      ),
    },
    {
      value: "form",
      label: "Quick form",
      icon: (
        <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M4 6h16M4 12h16M4 18h10" strokeLinecap="round" />
        </svg>
      ),
    },
  ];
  return (
    <div className="mb-4 flex justify-center">
      <div
        role="group"
        aria-label="How to submit"
        className="flex items-center overflow-hidden rounded-md border border-line-strong bg-surface text-[12px] font-semibold shadow-sm"
      >
        {options.map((o) => (
          <button
            key={o.value}
            onClick={() => onMode(o.value)}
            aria-pressed={mode === o.value}
            disabled={disabled}
            className={`flex items-center gap-1.5 px-3 py-1.5 transition disabled:opacity-50 ${
              mode === o.value ? "bg-accent text-white" : "text-ink-soft hover:bg-paper"
            }`}
          >
            {o.icon}
            {o.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function Stepper({ current }: { current: number }) {
  const steps = ["Describe", "Review", "Submitted"];
  return (
    <div className="mb-6 flex items-center">
      {steps.map((label, i) => {
        const n = i + 1;
        const done = n < current;
        const active = n === current;
        return (
          <div key={label} className="flex flex-1 items-center last:flex-none">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-[11px] font-semibold transition ${
                  done
                    ? "bg-clear text-white"
                    : active
                      ? "bg-accent text-white"
                      : "bg-neutral-chip text-ink-faint"
                }`}
              >
                {done ? (
                  <svg className="h-3.5 w-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3">
                    <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                ) : (
                  n
                )}
              </span>
              <span className={`text-xs font-medium ${active || done ? "text-ink" : "text-ink-faint"}`}>{label}</span>
            </div>
            {n < steps.length && (
              <span className={`mx-3 h-px flex-1 ${done ? "bg-clear" : "bg-line"}`} />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Field({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <div className="text-xs text-ink-faint">{label}</div>
      <div className={mono ? "figure text-[13px]" : ""}>{value}</div>
    </div>
  );
}
