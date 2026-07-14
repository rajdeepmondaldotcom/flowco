import { NextRequest, NextResponse } from "next/server";
import { chatTurn, type ChatMessage } from "@/lib/chat";
import { allowModelCall, RATE_LIMIT_MESSAGE } from "@/lib/limits";
import { isMockMode } from "@/lib/triage";

export const maxDuration = 60;

const MAX_MESSAGES = 40;
const MAX_MESSAGE_CHARS = 2000;
const MAX_FILE_BASE64_CHARS = 14_000_000; // ~10MB (photo or PDF)
const ALLOWED_MEDIA = ["image/png", "image/jpeg", "application/pdf"] as const;

function parseMessages(raw: unknown): ChatMessage[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > MAX_MESSAGES) return null;
  const messages: ChatMessage[] = [];
  for (const m of raw) {
    if (!m || typeof m !== "object") return null;
    const { role, content } = m as { role?: unknown; content?: unknown };
    if (role !== "user" && role !== "assistant") return null;
    if (typeof content !== "string" || content.trim().length === 0) return null;
    if (content.length > MAX_MESSAGE_CHARS) return null;
    messages.push({ role, content });
  }
  return messages;
}

export async function POST(request: NextRequest) {
  if (isMockMode()) {
    return NextResponse.json(
      { error: "Chat needs a live model — set ANTHROPIC_API_KEY in .env.local" },
      { status: 400 }
    );
  }
  const body = await request.json();
  const messages = parseMessages(body.messages);
  const fileBase64 = body.fileBase64 ?? null;
  const fileMediaType = body.fileMediaType ?? null;
  if (!messages) {
    return NextResponse.json(
      { error: "Send the conversation as messages: [{role, content}] (each under 2,000 characters)" },
      { status: 400 }
    );
  }
  if (messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "The last message must be from the employee" }, { status: 400 });
  }
  if (fileBase64 && fileMediaType && !ALLOWED_MEDIA.includes(fileMediaType)) {
    return NextResponse.json({ error: "Attach a photo (PNG/JPG) or a PDF receipt" }, { status: 400 });
  }
  if (fileBase64 && fileBase64.length > MAX_FILE_BASE64_CHARS) {
    return NextResponse.json({ error: "Receipt file is too large — keep it under ~10MB" }, { status: 400 });
  }
  if (!(await allowModelCall("chat"))) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  try {
    const turn = await chatTurn(messages, fileBase64, fileMediaType);
    return NextResponse.json(turn);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
