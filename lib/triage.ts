import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { readFile } from "fs/promises";
import path from "path";
import { z } from "zod";
import { checksRequireHuman, runChecks } from "./checks";
import { getPolicy, listExpenses, putExpense } from "./store";
import type { DeterministicChecks, TriagedExpense, TriageVerdict } from "./types";

const MODEL = process.env.TRIAGE_MODEL || "claude-opus-4-8";
const CONFIDENCE_FLOOR = 0.8;

// ---- Schema the model must fill in (validated by the SDK) ----

const VerdictSchema = z.object({
  verdict: z.enum(["clear", "needs_human"]),
  confidence: z.number().describe("Your confidence in the recommendation, 0 to 1"),
  receiptExtraction: z
    .object({
      merchant: z.string().nullable(),
      date: z.string().nullable().describe("Transaction date on the receipt, YYYY-MM-DD"),
      currency: z.string().nullable().describe("Currency shown on the receipt, e.g. USD, EUR"),
      printedTotal: z.number().nullable().describe("The machine-printed total on the receipt"),
      handwrittenAdjustment: z
        .number()
        .nullable()
        .describe("Any handwritten addition such as a tip; null if none"),
      finalTotal: z.number().nullable().describe("Your best read of what was actually paid"),
      lineNotes: z.string().describe("Anything odd or noteworthy you saw on the receipt"),
      legibilityConfidence: z.enum(["high", "medium", "low"]),
    })
    .nullable()
    .describe("What the receipt image actually shows; null if there is no receipt"),
  receiptMatch: z.object({
    status: z.enum(["match", "mismatch", "uncertain", "no_receipt"]),
    claimedTotal: z.number(),
    extractedTotal: z.number().nullable(),
    note: z.string().describe("Plain-English reconciliation of receipt vs claim"),
  }),
  summary: z.string().describe("1-2 sentence case summary for the queue view"),
  unresolved: z
    .array(z.string())
    .describe("Specifically what you could NOT resolve on your own; empty if nothing"),
  recommendedAction: z.enum(["approve", "reject", "request_info"]),
  rationale: z.string().describe("Why you recommend this action"),
  draftEmployeeMessage: z
    .string()
    .nullable()
    .describe("A ready-to-send message to the employee if info is needed; null otherwise"),
});

type ModelVerdict = z.infer<typeof VerdictSchema>;

// ---- Prompts ----

const SYSTEM_PROMPT = `You are the expense-triage assistant for FlowCo's internal Approvals team.

Your job is NOT to approve or reject expenses. Your job is to do the investigation so a human approver can decide in seconds instead of minutes. The approver sees your output next to the receipt image and the deterministic check results.

Rules:
- Read the receipt image carefully, including handwritten additions (tips, totals, signatures). Report what is printed separately from what is handwritten.
- Deterministic checks (policy caps, duplicate detection, amount limits) are computed in code and given to you. Explain and contextualize them — do not recompute or contradict the arithmetic.
- Be explicit about what you could NOT resolve. Never paper over ambiguity — an honest "I can't verify X" is the most valuable thing you produce.
- Policy exceptions are the approver's call, not yours. FlowCo policy allows client entertainment above the meals cap at the approver's discretion with a documented business purpose — when you see that pattern, lay out the evidence and route to the human.
- Duplicate candidates always go to the human. Compare the two records and say what distinguishes them (times, routes, receipts) so the human can decide fast.
- When information is missing or ambiguous, draft a short, friendly, specific message to the employee asking for exactly what is needed — so the approver can send it in one click.
- Keep the summary tight: it is a queue row, not a report.`;

function buildUserContent(
  expense: TriagedExpense,
  checks: DeterministicChecks,
  duplicates: TriagedExpense[],
  image: ReceiptImage | null
): Anthropic.MessageParam["content"] {
  const policy = getPolicy();
  const content: Exclude<Anthropic.MessageParam["content"], string> = [];

  content.push({
    type: "text",
    text: [
      `## FlowCo expense policy`,
      JSON.stringify(policy, null, 2),
      ``,
      `## Expense claim ${expense.id}`,
      JSON.stringify(
        {
          id: expense.id,
          employee: expense.employee,
          purpose: expense.purpose,
          project: expense.project,
          category: expense.category,
          merchant: expense.merchant,
          transactionDate: expense.transactionDate,
          claim: {
            currency: expense.currency,
            amount: expense.amount,
            tax: expense.tax,
            tip: expense.tip,
            total: expense.total,
          },
          costCenter: expense.costCenter,
          submittedAt: expense.submittedAt,
          hasReceipt: expense.receiptUrl !== null,
        },
        null,
        2
      ),
      ``,
      `## Deterministic check results (computed in code — trust these)`,
      JSON.stringify(checks, null, 2),
    ].join("\n"),
  });

  if (duplicates.length > 0) {
    content.push({
      type: "text",
      text: [
        `## Duplicate candidate records (full details for comparison)`,
        JSON.stringify(
          duplicates.map((d) => ({
            id: d.id,
            purpose: d.purpose,
            merchant: d.merchant,
            transactionDate: d.transactionDate,
            total: d.total,
            submittedAt: d.submittedAt,
            status: d.status,
            hasReceipt: d.receiptUrl !== null,
          })),
          null,
          2
        ),
      ].join("\n"),
    });
  }

  if (image) {
    content.push({ type: "text", text: `## Receipt image (attached below)` });
    content.push({
      type: "image",
      source: { type: "base64", media_type: image.mediaType, data: image.data },
    });
  } else {
    content.push({ type: "text", text: `## Receipt\nNo receipt was attached to this expense.` });
  }

  content.push({
    type: "text",
    text: `Triage this expense. Fill in the structured verdict.`,
  });

  return content;
}

// ---- The routing guardrail (code, not vibes) ----
// The model's verdict can only make routing stricter, never looser.

function applyGuardrail(checks: DeterministicChecks, model: ModelVerdict): "clear" | "needs_human" {
  if (checksRequireHuman(checks)) return "needs_human";
  if (model.verdict === "needs_human") return "needs_human";
  if (model.confidence < CONFIDENCE_FLOOR) return "needs_human";
  if (model.receiptMatch.status === "mismatch" || model.receiptMatch.status === "uncertain")
    return "needs_human";
  return "clear";
}

// ---- Engines ----

type ReceiptImage = { data: string; mediaType: "image/png" | "image/jpeg" };

// Seeded receipts are local files under public/; uploaded receipts live in
// Supabase Storage behind an https URL. Handle both.
async function loadReceiptImage(receiptUrl: string | null): Promise<ReceiptImage | null> {
  if (!receiptUrl) return null;
  const mediaType = /\.jpe?g($|\?)/i.test(receiptUrl) ? "image/jpeg" : "image/png";
  if (/^https?:\/\//.test(receiptUrl)) {
    const res = await fetch(receiptUrl);
    if (!res.ok) throw new Error(`Could not fetch receipt (${res.status}) from ${receiptUrl}`);
    return { data: Buffer.from(await res.arrayBuffer()).toString("base64"), mediaType };
  }
  const buf = await readFile(path.join(process.cwd(), "public", receiptUrl));
  return { data: buf.toString("base64"), mediaType };
}

async function claudeVerdict(
  expense: TriagedExpense,
  checks: DeterministicChecks,
  duplicates: TriagedExpense[]
): Promise<TriageVerdict> {
  const client = new Anthropic();
  const image = await loadReceiptImage(expense.receiptUrl);

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(VerdictSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content: buildUserContent(expense, checks, duplicates, image) }],
  });

  const parsed = response.parsed_output;
  if (!parsed) {
    throw new Error(`Model returned no parseable verdict for ${expense.id} (stop_reason: ${response.stop_reason})`);
  }

  return {
    ...parsed,
    verdict: applyGuardrail(checks, parsed),
    engine: "claude",
    model: MODEL,
    triagedAt: new Date().toISOString(),
  };
}

// Mock engine: deterministic checks only, templated language. Used for UI dev
// without an API key (MOCK_TRIAGE=1) — clearly labeled in the UI.
function mockVerdict(expense: TriagedExpense, checks: DeterministicChecks): TriageVerdict {
  const problems = Object.values(checks).filter((c) => c.status !== "pass").map((c) => c.note);
  const needsHuman = checksRequireHuman(checks);
  return {
    verdict: needsHuman ? "needs_human" : "clear",
    confidence: needsHuman ? 0.5 : 0.9,
    receiptExtraction: null,
    receiptMatch: {
      status: expense.receiptUrl ? "uncertain" : "no_receipt",
      claimedTotal: expense.total,
      extractedTotal: null,
      note: "Mock engine: receipt not read (no model call).",
    },
    summary: needsHuman
      ? `Flagged by deterministic checks: ${problems.join("; ")}`
      : `All deterministic checks pass. ${expense.merchant}, $${expense.total.toFixed(2)}, ${expense.category}.`,
    unresolved: problems,
    recommendedAction: needsHuman ? "request_info" : "approve",
    rationale: needsHuman
      ? "One or more deterministic checks flagged this expense."
      : "All deterministic checks pass and the amount is under the one-click limit.",
    draftEmployeeMessage: needsHuman
      ? `Hi ${expense.employee.name.split(" ")[0]}, quick question about your ${expense.merchant} expense (${expense.id}) — ${problems[0] ?? "we need a bit more detail"}. Could you clarify? Thanks!`
      : null,
    engine: "mock",
    triagedAt: new Date().toISOString(),
  };
}

// ---- Public API ----

export async function triageExpense(expense: TriagedExpense): Promise<TriagedExpense> {
  const policy = getPolicy();
  const all = await listExpenses();
  const checks = runChecks(expense, all, policy);
  const duplicates = checks.duplicate.candidateIds
    .map((id) => all.find((e) => e.id === id))
    .filter((e): e is TriagedExpense => Boolean(e));

  const useMock = process.env.MOCK_TRIAGE === "1" || !hasAnthropicCredentials();
  const aiVerdict = useMock
    ? mockVerdict(expense, checks)
    : await claudeVerdict(expense, checks, duplicates);

  expense.checks = checks;
  expense.aiVerdict = aiVerdict;
  if (expense.status === "pending") expense.status = "triaged";
  expense.audit.push({
    at: new Date().toISOString(),
    actor: "assistant",
    action: aiVerdict.verdict === "clear" ? "marked clear" : "routed to human",
    detail: `${aiVerdict.engine === "mock" ? "[mock] " : ""}${aiVerdict.summary}`,
  });
  await putExpense(expense);
  return expense;
}

function hasAnthropicCredentials(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

export function isMockMode(): boolean {
  return process.env.MOCK_TRIAGE === "1" || !hasAnthropicCredentials();
}
