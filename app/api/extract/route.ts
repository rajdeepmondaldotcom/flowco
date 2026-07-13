import { NextRequest, NextResponse } from "next/server";
import { extractDraft } from "@/lib/extract";
import { allowModelCall, RATE_LIMIT_MESSAGE } from "@/lib/limits";
import { isMockMode } from "@/lib/triage";

export const maxDuration = 120;

const MAX_DESCRIPTION_CHARS = 2000;
const MAX_IMAGE_BASE64_CHARS = 7_000_000; // ~5MB image

export async function POST(request: NextRequest) {
  if (isMockMode()) {
    return NextResponse.json(
      { error: "Conversational submit needs a live model — set ANTHROPIC_API_KEY in .env.local" },
      { status: 400 }
    );
  }
  const { description, imageBase64, imageMediaType } = await request.json();
  if (!description || typeof description !== "string") {
    return NextResponse.json({ error: "Describe the expense first" }, { status: 400 });
  }
  if (description.length > MAX_DESCRIPTION_CHARS) {
    return NextResponse.json({ error: "That description is a bit long — keep it under 2,000 characters" }, { status: 400 });
  }
  if (imageBase64 && imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return NextResponse.json({ error: "Receipt photo is too large — keep it under ~5MB" }, { status: 400 });
  }
  if (!(await allowModelCall("extract"))) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  try {
    const draft = await extractDraft(description, imageBase64 ?? null, imageMediaType ?? null);
    return NextResponse.json({ draft });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
