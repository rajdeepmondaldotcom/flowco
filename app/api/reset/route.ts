import { NextResponse } from "next/server";
import { resetStore } from "@/lib/store";

export async function POST() {
  try {
    await resetStore();
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(`[api] reset failed:`, err);
    return NextResponse.json(
      { error: "Something went wrong on our side. Try again in a moment." },
      { status: 500 }
    );
  }
}
