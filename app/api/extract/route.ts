import { NextRequest, NextResponse } from "next/server";
import { extractDraft } from "@/lib/extract";
import { allowModelCall, RATE_LIMIT_MESSAGE } from "@/lib/limits";
import { isMockMode } from "@/lib/triage";

export const maxDuration = 120;

const MAX_DESCRIPTION_CHARS = 2000;
const MAX_FILE_BASE64_CHARS = 14_000_000; // ~10MB (photo or PDF)
const ALLOWED_MEDIA = ["image/png", "image/jpeg", "application/pdf"] as const;

export async function POST(request: NextRequest) {
  if (isMockMode()) {
    return NextResponse.json(
      { error: "Conversational submit needs a live model — set ANTHROPIC_API_KEY in .env.local" },
      { status: 400 }
    );
  }
  let body;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body — expected JSON" }, { status: 400 });
  }
  const description = body.description;
  // Accept the new fileBase64/fileMediaType, and the legacy imageBase64/imageMediaType.
  const fileBase64 = body.fileBase64 ?? body.imageBase64 ?? null;
  const fileMediaType = body.fileMediaType ?? body.imageMediaType ?? null;
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "Describe the expense first" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json({ error: "That description is a bit long — keep it under 2,000 characters" }, { status: 400 });
  }
  if (fileBase64 && fileMediaType && !ALLOWED_MEDIA.includes(fileMediaType)) {
    return NextResponse.json({ error: "Attach a photo (PNG/JPG) or a PDF receipt" }, { status: 400 });
  }
  if (fileBase64 && fileBase64.length > MAX_FILE_BASE64_CHARS) {
    return NextResponse.json({ error: "Receipt file is too large — keep it under ~10MB" }, { status: 400 });
  }
  if (!(await allowModelCall("extract"))) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  try {
    const draft = await extractDraft(description, fileBase64, fileMediaType);
    return NextResponse.json({ draft });
  } catch (err) {
    console.error(`[api] extract failed:`, err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Try again in a moment." },
      { status: 500 }
    );
  }
}
