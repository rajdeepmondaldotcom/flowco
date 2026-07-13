"use client";

import Link from "next/link";
import { useState } from "react";
import { fmtMoney } from "@/components/badges";
import type { Employee } from "@/lib/types";
import type { ExpenseDraft } from "@/lib/extract";

const EMPLOYEES: Employee[] = [
  { name: "Priya Sharma", email: "priya.sharma@flowco.com", department: "Sales" },
  { name: "Dana Kim", email: "dana.kim@flowco.com", department: "Product" },
  { name: "Marcus Webb", email: "marcus.webb@flowco.com", department: "Customer Success" },
  { name: "Elena Rodriguez", email: "elena.rodriguez@flowco.com", department: "Engineering" },
  { name: "James Okafor", email: "james.okafor@flowco.com", department: "Marketing" },
];

type Phase = "compose" | "extracting" | "review" | "submitting" | "done";

export default function SubmitPage() {
  const [employee, setEmployee] = useState(EMPLOYEES[2]);
  const [description, setDescription] = useState("");
  const [image, setImage] = useState<{ base64: string; mediaType: "image/png" | "image/jpeg"; preview: string } | null>(null);
  const [draft, setDraft] = useState<ExpenseDraft | null>(null);
  const [phase, setPhase] = useState<Phase>("compose");
  const [submittedId, setSubmittedId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const onFile = (file: File | undefined) => {
    if (!file) return;
    const mediaType = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      setImage({ base64: dataUrl.split(",")[1], mediaType, preview: dataUrl });
    };
    reader.readAsDataURL(file);
  };

  const extract = async () => {
    setPhase("extracting");
    setError(null);
    try {
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setPhase("review");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("compose");
    }
  };

  const submit = async () => {
    if (!draft) return;
    setPhase("submitting");
    setError(null);
    try {
      const res = await fetch("/api/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          employee,
          draft,
          imageBase64: image?.base64 ?? null,
          imageMediaType: image?.mediaType ?? null,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setSubmittedId(data.expense.id);
      setPhase("done");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("review");
    }
  };

  return (
    <div className="flex-1">
      <header className="border-b border-line bg-surface">
        <div className="mx-auto flex max-w-xl items-center justify-between px-6 py-4">
          <div className="flex items-baseline gap-3">
            <span className="text-lg font-bold tracking-tight">FlowCo</span>
            <span className="text-sm text-ink-soft">Quick expense</span>
          </div>
          <Link href="/" className="text-sm text-accent underline">
            Approver view →
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-xl px-6 py-8">
        {error && (
          <div className="mb-4 rounded border border-danger/30 bg-danger-soft px-4 py-2 text-sm text-danger">
            {error}
          </div>
        )}

        {(phase === "compose" || phase === "extracting") && (
          <div className="rounded-md border border-line bg-surface p-5">
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
              className="mb-4 w-full rounded border border-line px-3 py-2 text-sm focus:border-accent focus:outline-none"
            />

            <label className="mb-1 block text-xs font-medium text-ink-faint">Receipt photo (optional)</label>
            <input
              type="file"
              accept="image/png,image/jpeg"
              onChange={(e) => onFile(e.target.files?.[0])}
              className="mb-3 block w-full text-sm text-ink-soft file:mr-3 file:rounded file:border-0 file:bg-accent-soft file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-accent"
            />
            {image && (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={image.preview} alt="Receipt preview" className="mb-4 max-h-48 rounded border border-line" />
            )}

            <button
              onClick={extract}
              disabled={phase === "extracting" || description.trim().length === 0}
              className="w-full rounded bg-accent px-4 py-2.5 text-sm font-semibold text-white hover:opacity-90 disabled:opacity-40"
            >
              {phase === "extracting" ? "Assistant is reading…" : "Let the assistant fill it in"}
            </button>
            <p className="mt-2 text-center text-xs text-ink-faint">
              One sentence + a photo replaces the seven-screen form.
            </p>
          </div>
        )}

        {(phase === "review" || phase === "submitting") && draft && (
          <div className="rounded-md border border-line bg-surface p-5">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-ink-faint">
              Check what the assistant filled in
            </h2>
            <div className="mb-4 grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <Field label="Merchant" value={draft.merchant ?? "—"} />
              <Field label="Category" value={draft.category ?? "—"} />
              <Field label="Date" value={draft.transactionDate ?? "—"} mono />
              <Field label="Total" value={draft.total !== null ? fmtMoney(draft.total) : "—"} mono />
              <Field label="Amount" value={draft.amount !== null ? fmtMoney(draft.amount) : "—"} mono />
              <Field label="Tax / tip" value={`${draft.tax !== null ? fmtMoney(draft.tax) : "—"} / ${draft.tip !== null ? fmtMoney(draft.tip) : "—"}`} mono />
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
          <div className="rounded-md border border-line bg-surface p-6 text-center">
            <div className="mb-1 text-2xl">✓</div>
            <h2 className="mb-1 text-base font-semibold">
              Submitted — <span className="figure">{submittedId}</span>
            </h2>
            <p className="mb-4 text-sm text-ink-soft">
              It&apos;s in the approvals queue and will be triaged with everything else.
            </p>
            <Link href="/" className="text-sm font-medium text-accent underline">
              See it in the approver view →
            </Link>
          </div>
        )}
      </main>
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
