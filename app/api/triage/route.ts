import { NextRequest, NextResponse } from "next/server";
import { allowModelCall, RATE_LIMIT_MESSAGE } from "@/lib/limits";
import { getExpense } from "@/lib/store";
import { isMockMode, triageExpense } from "@/lib/triage";

// Opus + vision + adaptive thinking can take a while per case.
export const maxDuration = 120;

export async function POST(request: NextRequest) {
  const { id } = await request.json();
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
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
