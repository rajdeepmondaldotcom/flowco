import Anthropic from "@anthropic-ai/sdk";
import { getPolicy } from "./store";

// Conversational intake: short multi-turn chat that gathers the five facts an
// expense needs (purpose, merchant, amount + currency, date, category). This
// deliberately runs on a cheap fast model — the turns are small talk, not
// extraction. When the assistant has everything it ends its reply with the
// READY token; the route strips it and the client hands the transcript to the
// existing /api/extract engine, which owns all structured extraction and
// currency conversion. The chat model never fills a USD field itself.

const MODEL = process.env.CHAT_MODEL || "claude-sonnet-5";

export const READY_TOKEN = "[READY]";

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export interface ChatTurnResult {
  reply: string;
  readyToExtract: boolean;
}

type FileMediaType = "image/png" | "image/jpeg" | "application/pdf";

const SYSTEM_PROMPT = `You are FlowCo's expense intake assistant, chatting with an employee who wants to submit an expense. FlowCo is an India-based team: people usually pay in rupees (sometimes Singapore dollars on a trip, sometimes USD) and are reimbursed in US dollars.

Your only job is to gather five things through natural conversation:
1. Business purpose (what it was for)
2. Merchant (who was paid)
3. Amount actually paid, with its currency (INR, SGD, or USD)
4. Date (a relative date like "yesterday" is fine — do not make the employee compute it)
5. Category — infer it yourself from context when obvious (a team dinner is meals, a cab is travel, a Figma seat is software); only ask if genuinely ambiguous.

Rules:
- Ask AT MOST ONE question per turn. Pick the most important missing fact.
- Keep every reply to 1-2 short, friendly, businesslike sentences.
- Never ask for something the employee already told you, and never invent details they didn't give.
- If a receipt photo or PDF is attached, read it: any field clearly visible on the receipt counts as gathered — don't ask for it again. If the attachment is clearly not a receipt, say so and ask for a real one.
- Do NOT convert currencies and do NOT restate amounts in USD. Code handles conversion.
- If the employee asks something off-topic, answer in one sentence and steer back to the expense.
- When (and only when) all five facts are covered, confirm in one short sentence that you have everything, and end your reply with the exact token ${READY_TOKEN} — nothing after it.`;

// The client keeps a purely-visual greeting bubble that is never sent, but be
// defensive anyway: the Anthropic API requires the first message to be from the
// user, so drop any leading assistant turns and merge consecutive same-role
// turns.
function normalize(messages: ChatMessage[]): ChatMessage[] {
  const clean: ChatMessage[] = [];
  for (const m of messages) {
    if (clean.length === 0 && m.role === "assistant") continue;
    const last = clean[clean.length - 1];
    if (last && last.role === m.role) {
      clean[clean.length - 1] = { ...last, content: `${last.content}\n${m.content}` };
    } else {
      clean.push({ role: m.role, content: m.content });
    }
  }
  return clean;
}

export async function chatTurn(
  messages: ChatMessage[],
  fileBase64: string | null,
  fileMediaType: FileMediaType | null
): Promise<ChatTurnResult> {
  const client = new Anthropic();
  const policy = getPolicy();
  const clean = normalize(messages);
  if (clean.length === 0 || clean[clean.length - 1].role !== "user") {
    throw new Error("The conversation must end with an employee message");
  }

  const anthropicMessages: Anthropic.MessageParam[] = clean.map((m, i) => {
    // Attach the receipt to the latest employee turn so the assistant can read
    // it and skip questions the receipt already answers.
    if (i === clean.length - 1 && fileBase64 && fileMediaType) {
      const content: Exclude<Anthropic.MessageParam["content"], string> = [{ type: "text", text: m.content }];
      if (fileMediaType === "application/pdf") {
        content.push({ type: "text", text: "Receipt (PDF):" });
        content.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: fileBase64 } });
      } else {
        content.push({ type: "text", text: "Receipt photo:" });
        content.push({ type: "image", source: { type: "base64", media_type: fileMediaType, data: fileBase64 } });
      }
      return { role: m.role, content };
    }
    return { role: m.role, content: m.content };
  });

  const response = await client.messages.create({
    model: MODEL,
    max_tokens: 400,
    system: [
      SYSTEM_PROMPT,
      ``,
      `Today's date: ${new Date().toISOString().slice(0, 10)}`,
      `Expense categories: ${Object.keys(policy.categoryCaps).join(", ")}`,
    ].join("\n"),
    messages: anthropicMessages,
  });

  const text = response.content
    .filter((block): block is Anthropic.TextBlock => block.type === "text")
    .map((block) => block.text)
    .join("")
    .trim();
  if (!text) {
    throw new Error(`Model returned an empty reply (stop_reason: ${response.stop_reason})`);
  }

  const readyToExtract = text.includes(READY_TOKEN);
  const reply = text.replaceAll(READY_TOKEN, "").trim();
  return { reply: reply || "Got it — I have everything I need.", readyToExtract };
}
