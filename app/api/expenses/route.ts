import { NextResponse } from "next/server";
import { isMockMode } from "@/lib/triage";
import { getPolicy, listExpenses } from "@/lib/store";

export async function GET() {
  try {
    return NextResponse.json({
      expenses: await listExpenses(),
      policy: getPolicy(),
      mockMode: isMockMode(),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
