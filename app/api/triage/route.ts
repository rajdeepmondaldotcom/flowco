import { NextRequest, NextResponse } from "next/server";
import { allowModelCall, RATE_LIMIT_MESSAGE } from "@/lib/limits";
import { getExpense } from "@/lib/store";
import { isMockMode, triageExpense } from "@/lib/triage";

// Opus + vision + adaptive thinking can take a while per case.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  let id: unknown;
  try {
    ({ id } = await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid request body — expected JSON" }, { status: 400 });
  }
  if (typeof id !== "string" || !id) {
    return NextResponse.json({ error: "An expense id is required" }, { status: 400 });
  }
  const expense = await getExpense(id);
  if (!expense) {
    return NextResponse.json({ error: `Unknown expense ${id}` }, { status: 404 });
  }
  if (!isMockMode() && !(await allowModelCall("triage"))) {
    return NextResponse.json({ error: RATE_LIMIT_MESSAGE }, { status: 429 });
  }
  try {
    const updated = await triageExpense(expense);
    return NextResponse.json({ expense: updated });
  } catch (err) {
    console.error(`[api] triage failed:`, err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Try again in a moment." },
      { status: 500 }
    );
  }
}
