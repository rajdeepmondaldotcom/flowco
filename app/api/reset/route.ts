import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";

export async function POST() {
  try {
    await resetStore();
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
