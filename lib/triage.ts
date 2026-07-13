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
    extractedTotal: z.number().nullable().describe("Receipt total in the RECEIPT's own currency"),
    note: z.string().describe("Plain-English reconciliation of receipt vs claim"),
  }),
  nonReimbursable: z
    .object({
      items: z.array(
        z.object({
          description: z.string(),
          amount: z.number().describe("In the receipt's currency"),
        })
      ),
      subtotalExcluded: z.number().describe("Total to exclude INCLUDING tax on these items, receipt currency"),
      currency: z.string(),
      note: z.string(),
    })
    .nullable()
    .describe(
      "Line items policy says FlowCo won't reimburse (e.g. alcohol). Only you can find these — code cannot read the receipt. null if none."
    ),
  currencyReconciliation: z
    .object({
      receiptCurrency: z.string(),
      receiptTotal: z.number().nullable(),
      claimCurrency: z.string(),
      claimedTotal: z.number(),
      impliedRate: z.number().nullable().describe("claimedTotal divided by receiptTotal"),
      plausible: z.boolean().describe("Is the implied FX rate reasonable for these currencies and date?"),
      note: z.string(),
    })
    .nullable()
    .describe("Fill in ONLY when the receipt currency differs from the claim currency; otherwise null."),
  reimbursableAmount: z
    .object({
      value: z.number().describe("In the claim currency"),
      currency: z.string(),
      note: z.string().describe("How you derived it, e.g. claim minus excluded alcohol"),
    })
    .nullable()
    .describe("The amount you believe should actually be reimbursed, if it differs from the claimed total; else null."),
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
- Read the receipt image carefully. These are real photos — angled, shadowed, crumpled, sometimes in a foreign currency with local taxes (GST/VAT). Read line items, handwritten additions (tips, totals, signatures), and per-item vs total amounts. Report what is printed separately from what is handwritten.
- Deterministic checks (policy caps, duplicate detection, amount limits, currency mismatch) are computed in code and given to you. Explain and contextualize them — do not recompute or contradict the arithmetic.
- ALCOHOL AND OTHER NON-REIMBURSABLE ITEMS: This is your most important job — code cannot read the receipt, so only you can catch these. If the receipt lists alcohol (beer, wine, cocktails, spirits, a bar/liquor line), it is NOT reimbursable per FlowCo policy. Identify each such line, add any tax attributable to it, put them in "nonReimbursable", and compute the reimbursable remainder in "reimbursableAmount". Never clear an expense whose receipt contains alcohol — route it to a human with the exact amount to deduct.
- FOREIGN CURRENCY: When the receipt is in a different currency than the claim (claims are in USD), fill in "currencyReconciliation" — the receipt total in its own currency, the implied FX rate, and whether that rate is plausible for the date. You cannot verify the exact rate used, so say so and route to a human.
- Be explicit about what you could NOT resolve. Never paper over ambiguity — an honest "I can't verify X" is the most valuable thing you produce.
- Policy exceptions are the approver's call, not yours. FlowCo policy allows entertainment above the meals cap at the approver's discretion with a documented business purpose — when you see that pattern, lay out the evidence (per-person math if a group meal) and route to the human.
- COST CENTER / GL CODE: The deterministic checks tell you whether the claim is coded to the employee's own department cost center. If it's flagged as a possible mis-tag, note the expected vs. actual cost center and draft a one-line confirmation — this is the "wrong cost center" case from the manual workflow. Don't guess the correct code; ask.
- AMOUNT THRESHOLDS: Anything over $1,000 always requires manager review regardless of how clean it looks — say so plainly. Between the $500 one-click limit and $1,000, note that it's over the one-click threshold and needs a glance.
- Duplicate candidates always go to the human. Compare the records and say what distinguishes them — a re-submission of the same bill vs. a legitimate split of one large group bill (different items, consecutive bill numbers, same table/time) vs. two genuinely separate purchases. Give the approver the distinguishing evidence.
- When information is missing or ambiguous, draft a short, friendly, specific message to the employee asking for exactly what is needed — so the approver can send it in one click.
- Keep the summary tight: it is a queue row, not a report. If money must be deducted (alcohol, FX), lead the summary with the reimbursable amount.`;

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
  // If the model found money that must be deducted (alcohol, other
  // non-reimbursables), a human must confirm the reduced amount before pay.
  if (model.nonReimbursable && model.nonReimbursable.subtotalExcluded > 0.005) return "needs_human";
  // Foreign-currency claims can't be auto-cleared — the FX rate isn't verifiable in code.
  if (model.currencyReconciliation) return "needs_human";
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

  // A receipt that fails to load must never crash triage. Fall back to
  // metadata-only and tell the model so it routes to a human safely.
  let image: ReceiptImage | null = null;
  let receiptLoadError = false;
  if (expense.receiptUrl) {
    try {
      image = await loadReceiptImage(expense.receiptUrl);
    } catch {
      receiptLoadError = true;
    }
  }

  const content = buildUserContent(expense, checks, duplicates, image);
  if (receiptLoadError && Array.isArray(content)) {
    content.push({
      type: "text",
      text: "NOTE: A receipt is attached to this expense but its image could not be loaded right now. Triage on the metadata and checks only, treat the receipt as unverified, and route to a human so the receipt can be reviewed manually.",
    });
  }

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 16000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(VerdictSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
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
    nonReimbursable: null,
    currencyReconciliation: null,
    reimbursableAmount: null,
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
