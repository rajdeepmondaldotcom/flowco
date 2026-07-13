import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import { z } from "zod";
import { getPolicy } from "./store";

const MODEL = process.env.TRIAGE_MODEL || "claude-opus-4-8";

// One conversational message + optional receipt photo → a filled expense draft.
// Same engine family as triage: schema-constrained output, honest about gaps.

const DraftSchema = z.object({
  merchant: z.string().nullable(),
  category: z.enum(["meals", "travel", "lodging", "software", "other"]).nullable(),
  receiptCurrency: z
    .string()
    .describe("3-letter currency on the receipt/described (e.g. USD, EUR, INR). Default USD if unstated."),
  transactionDate: z
    .string()
    .nullable()
    .describe("YYYY-MM-DD. Resolve relative dates like 'yesterday' using today's date given in the prompt."),
  amount: z.number().nullable().describe("Pre-tax amount"),
  tax: z.number().nullable(),
  tip: z.number().nullable(),
  total: z.number().nullable().describe("Total actually paid"),
  purpose: z.string().nullable().describe("Business purpose, cleaned up from the description"),
  project: z.string().nullable(),
  sourceNotes: z.string().describe("Which fields came from the receipt vs the description vs assumptions"),
  missing: z.array(z.string()).describe("What is still needed before this can be submitted cleanly"),
  followUpQuestion: z
    .string()
    .nullable()
    .describe("One short question to ask the employee if something important is missing; null if none"),
});

export type ExpenseDraft = z.infer<typeof DraftSchema>;

const SYSTEM_PROMPT = `You turn a FlowCo employee's conversational description of an expense (plus an optional receipt photo) into a structured expense draft.

Rules:
- Prefer the receipt for hard numbers; prefer the description for purpose and context. Note conflicts in sourceNotes instead of silently picking one.
- Never invent amounts, dates, or merchants. If it isn't in the description or on the receipt, leave it null and list it in "missing".
- If amount/tax/tip are not broken out, put the paid total in "total" and leave the others null.
- Resolve relative dates against today's date provided in the prompt.
- Keep purpose short and businesslike — it will be read by an approver.`;

export async function extractDraft(
  description: string,
  imageBase64: string | null,
  imageMediaType: "image/png" | "image/jpeg" | null
): Promise<ExpenseDraft> {
  const client = new Anthropic();
  const policy = getPolicy();

  const content: Exclude<Anthropic.MessageParam["content"], string> = [
    {
      type: "text",
      text: [
        `Today's date: ${new Date().toISOString().slice(0, 10)}`,
        `Expense categories: ${Object.keys(policy.categoryCaps).join(", ")}`,
        ``,
        `Employee's description:`,
        description,
      ].join("\n"),
    },
  ];
  if (imageBase64 && imageMediaType) {
    content.push({ type: "text", text: "Receipt photo:" });
    content.push({
      type: "image",
      source: { type: "base64", media_type: imageMediaType, data: imageBase64 },
    });
  }

  const response = await client.messages.parse({
    model: MODEL,
    max_tokens: 8000,
    thinking: { type: "adaptive" },
    output_config: { format: zodOutputFormat(DraftSchema) },
    system: SYSTEM_PROMPT,
    messages: [{ role: "user", content }],
  });

  if (!response.parsed_output) {
    throw new Error(`Model returned no parseable draft (stop_reason: ${response.stop_reason})`);
  }
  return response.parsed_output;
}
