import { isSupabaseMode, supabase } from "./store";

// Cost guardrail for the public demo: global hourly caps on model calls so an
// unattended URL can't burn the API budget. Backed by an atomic SQL counter;
// fails open so a counter hiccup never bricks the demo.

const HOURLY_CAPS = {
  triage: 150, // ~12 full queue runs
  extract: 40,
} as const;

export async function allowModelCall(kind: keyof typeof HOURLY_CAPS): Promise<boolean> {
  if (!isSupabaseMode()) return true; // local dev: unrestricted
  try {
    const { data, error } = await supabase().rpc("bump_counter", {
      counter_key: `model:${kind}`,
      max_per_hour: HOURLY_CAPS[kind],
    });
    if (error) return true;
    return data === true;
  } catch {
    return true;
  }
}

export const RATE_LIMIT_MESSAGE =
  "The demo's hourly model budget is used up — try again in a little while. (This cap protects the API key behind a public URL.)";
