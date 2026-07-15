import { isSupabaseMode, supabase } from "./store";

// Cost guardrail for the public demo: global hourly caps on model calls so an
// unattended URL can't burn the API budget. Backed by an atomic SQL counter;
// fails open so a counter hiccup never bricks the demo.

const HOURLY_CAPS = {
  triage: 150, // ~12 full queue runs
  extract: 40,
  chat: 120, // conversational intake turns (cheap Sonnet calls, several per submission)
  submit: 60, // no model call, but each submit writes a row + a storage object
} as const;

export async function allowModelCall(kind: keyof typeof HOURLY_CAPS): Promise<boolean> {
  if (!isSupabaseMode()) return true; // local dev: unrestricted
  try {
    const { data, error } = await supabase().rpc("bump_counter", {
      counter_key: `model:${kind}`,
      max_per_hour: HOURLY_CAPS[kind],
    });
    if (error) {
      // Still fail open (a counter hiccup must not brick the demo), but leave
      // a trail: a permanently failing counter means the cap is silently off.
      console.error(`[limits] bump_counter failed for model:${kind}:`, error.message);
      return true;
    }
    return data === true;
  } catch (err) {
    console.error(`[limits] bump_counter threw for model:${kind}:`, err);
    return true;
  }
}

export const RATE_LIMIT_MESSAGE =
  "The demo's hourly AI budget is used up — try again in a bit. (The cap keeps a public URL from burning the key.)";
