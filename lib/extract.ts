import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getPolicy } from "./store";
import { CURRENCY_SYMBOL, fmt, toUsd } from "./currency";

const MODEL = process.env.TRIAGE_MODEL || "claude-opus-4-8";

// One conversational message + optional receipt (photo OR PDF) -> a filled
// expense draft. The model reads amounts in the receipt's OWN currency; code
// converts them to USD, the reimbursement currency. The claim total is always
// USD, so an INR receipt never lands in the queue as if it were dollars.

const DraftSchema = z.object({
  merchant: z.string().nullable(),
  category: z.enum(["meals", "travel", "lodging", "software", "other"]).nullable(),
  receiptCurrency: z
    .enum(["USD", "INR", "SGD"])
    .describe(
      "The currency the amounts are actually in. '₹' or 'Rs' or 'rupees' or an Indian GST bill => INR. 'S$' or 'SGD' or Singapore => SGD. '$' or 'dollars' or a US receipt => USD. If genuinely unclear for an India-based employee, default INR."
    ),
  transactionDate: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD. Resolve relative dates like 'yesterday' using today's date given in the prompt."),
  nativeAmount: z.number().nullable().describe("Pre-tax amount, EXACTLY as written on the receipt, in receiptCurrency. Do NOT convert."),
  nativeTax: z.number().nullable().describe("Tax as written, in receiptCurrency. For an Indian bill, CGST + SGST combined."),
  nativeTip: z.number().nullable().describe("Tip or service charge as written, in receiptCurrency; null if none."),
  nativeTotal: z.number().nullable().describe("Grand total actually paid, EXACTLY as written, in receiptCurrency."),
  purpose: z.string().nullable().describe("Business purpose, cleaned up from the description"),
  project: z.string().nullable(),
  isReceipt: z.boolean().describe("True if the attached file is an actual receipt/invoice. False if it is not a receipt (a poster, a screenshot, a menu, a book) or is watermarked as a sample/test/not-valid-for-reimbursement."),
  sourceNotes: z.string().describe("Which fields came from the receipt vs the description vs assumptions, and the currency you read."),
  missing: z.array(z.string()).describe("What is still needed before this can be submitted cleanly"),
  followUpQuestion: z
    .string()
    .nullable()
    .describe("One short question to ask the employee if something important is missing; null if none"),
});

type ModelDraft = z.infer<typeof DraftSchema>;

// What the client gets back: native amounts for display + USD amounts (the claim).
export interface ExpenseDraft {
  merchant: string | null;
  category: "meals" | "travel" | "lodging" | "software" | "other" | null;
  receiptCurrency: string;
  transactionDate: string | null;
  // native (as paid, for display)
  nativeTotal: number | null;
  nativeAmount: number | null;
  nativeTax: number | null;
  nativeTip: number | null;
  // USD (the claim, converted)
  total: number | null;
  amount: number | null;
  tax: number | null;
  tip: number | null;
  isReceipt: boolean;
  purpose: string | null;
  project: string | null;
  sourceNotes: string;
  missing: string[];
  followUpQuestion: string | null;
}

const SYSTEM_PROMPT = `You turn a FlowCo employee's conversational description of an expense (plus an optional receipt photo or PDF) into a structured expense draft. FlowCo is an India-based team: people pay in rupees (sometimes Singapore dollars on a trip) and get reimbursed in US dollars.

Rules:
- CURRENCY IS CRITICAL. Read the amounts in the currency they are ACTUALLY in and report them in "native" fields without converting. A "₹1,395" or "Rs 1,395" Indian bill is 1395 INR, NOT 1395 dollars. Set receiptCurrency correctly (INR for a rupee/GST bill, SGD for Singapore dollars, USD for a US receipt). Code will convert to USD. NEVER put a rupee number into a dollar field.
- For an Indian GST bill, native tax is CGST + SGST combined; a "service charge" line is a tip.
- Prefer the receipt for hard numbers; prefer the description for purpose and context. Note conflicts in sourceNotes instead of silently picking one.
- Never invent amounts, dates, or merchants. If it isn't in the description or on the receipt, leave it null and list it in "missing".
- If only a grand total is legible, put it in nativeTotal and leave the parts null.
- HANDWRITTEN BILLS: A fully handwritten bill on a printed letterhead (shop name, GSTIN, "prices inclusive of taxes") is a real receipt — isReceipt=true. Take the merchant from the printed letterhead; read the handwritten date and total carefully. A hand-circled figure near "Total" is usually the amount actually paid — trust the circled figure for nativeTotal. Handwritten digits are easy to confuse (1 vs 7, 4 vs 9): if a digit is genuinely ambiguous or the line items don't clearly sum to the stated total, say so in sourceNotes and surface it in "missing" or followUpQuestion instead of presenting a clean itemized read.
- Resolve relative dates against today's date provided in the prompt.
- IS IT A RECEIPT? Set isReceipt=false if the attached file is not an actual receipt or invoice (a poster, a menu, a screenshot, a book, a random photo) or if it is watermarked as a SAMPLE / TEST / "not valid for expense claims". In that case add it to "missing" and ask for a valid receipt.
- Keep purpose short and businesslike. It will be read by an approver.`;

type FileMediaType = "image/png" | "image/jpeg" | "application/pdf";

export async function extractDraft(
  description: string,
  fileBase64: string | null,
  fileMediaType: FileMediaType | null
): Promise<ExpenseDraft> {
  const client = new Anthropic();
  const policy = getPolicy();

  const content: Exclude<Anthropic.MessageParam["content"], string> = [
    {
      type: "text",
      text: [
        `Today's date: ${new Date().toISOString().slice(0, 10)}`,
        `Expense categories: ${Object.keys(policy.categoryCaps).join(", ")}`,
        `Reference rates to USD (for your awareness; code does the conversion): 1 INR = ${policy.fxToUsd.INR} USD, 1 SGD = ${policy.fxToUsd.SGD} USD.`,
        ``,
        `Employee's description:`,
        description,
      ].join("\n"),
    },
  ];
  if (fileBase64 && fileMediaType) {
    if (fileMediaType === "application/pdf") {
      content.push({ type: "text", text: "Receipt (PDF):" });
      content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } });
    } else {
      content.push({ type: "text", text: "Receipt photo:" });
      content.push({ type: "image", source: { type: "base64", media_type: fileMediaType, data: fileBase64 } });
    }
  }

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(DraftSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  const m = response.parsed_output;
  if (!m) {
    throw new Error(`Model returned no parseable draft (stop_reason: ${response.stop_reason})`);
  }
  return toDraft(m);
}

// Convert the model's native amounts to USD (the claim currency) in code.
function toDraft(m: ModelDraft): ExpenseDraft {
  const ccy = m.receiptCurrency;
  const conv = (n: number | null) => (n === null ? null : toUsd(n, ccy));
  const total = conv(m.nativeTotal);
  const draft: ExpenseDraft = {
    merchant: m.merchant,
    category: m.category,
    receiptCurrency: ccy,
    transactionDate: m.transactionDate,
    nativeTotal: m.nativeTotal,
    nativeAmount: m.nativeAmount,
    nativeTax: m.nativeTax,
    nativeTip: m.nativeTip,
    total,
    amount: conv(m.nativeAmount),
    tax: conv(m.nativeTax),
    tip: conv(m.nativeTip),
    isReceipt: m.isReceipt,
    purpose: m.purpose,
    project: m.project,
    sourceNotes: m.sourceNotes,
    missing: m.missing,
    followUpQuestion: m.followUpQuestion,
  };
  // Make the conversion legible in the source notes.
  if (ccy !== "USD" && m.nativeTotal !== null && total !== null) {
    const sym = CURRENCY_SYMBOL[ccy] ?? `${ccy} `;
    draft.sourceNotes =
      `Converted ${sym}${m.nativeTotal.toLocaleString(ccy === "INR" ? "en-IN" : "en-US")} to ${fmt(total, "USD")} at the reference rate. ` +
      draft.sourceNotes;
  }
  return draft;
}
