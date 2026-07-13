# 5-minute recording script

> Before recording: open https://flowco-two.vercel.app (or `npm run dev` locally), click **Reset**. Have `docs/failure-story/04-...GRAY-ZONE.md` open in a second tab. Close everything else. Target 4:45 — they said 5 max. Bonus closing line: "it's deployed — the link's in the email, try the queue yourself."

## 0:00–0:30 — Why this slice

- "I built the approvals-triage story. The reason: one approver clears many expenses, and the cost isn't the approve click — it's the archaeology: squinting at receipts, cross-referencing a policy doc, hunting duplicates in a spreadsheet, emailing the employee and re-reviewing."
- "So the assistant's job in this prototype is *not* to approve or reject. It investigates, and the human decides. It compresses digging into deciding."

## 0:30–2:00 — Happy path

1. Show the queue: 12 submitted expenses, all awaiting triage.
2. Click **Run assistant triage**. Narrate while rows move: "For every expense: deterministic checks run in code — policy caps, duplicate detection, amount limits. Then Claude reads the actual receipt image, reconciles it against the claim, and fills a schema-constrained verdict."
3. Point at the two lanes forming: "Seven landed in *Ready to clear* — every check passed and the model found nothing to question. Note the one with **no receipt at all** that still cleared: parking under $25, and policy says receipts are only required above $25. The assistant knows the policy nuance instead of blindly flagging."
4. Open one clear case briefly — show the reconciliation (printed total = claimed total) — then **Approve all (7)**. "Seven decisions, one click, full audit trail."

## 2:00–3:30 — The case the assistant can't resolve (the point of the exercise)

1. Open **EXP-1008 — Harvest Table**. "Claimed $85.00. Every deterministic check passes — this is under the cap, receipt attached, no duplicates. A rules engine clears it. But look at what the model did with the receipt."
2. Point at the reconciliation card: printed total **$76.20**, scrawled handwritten tip it reads as **$8.30**, its read of what was paid **$84.50**, delta **$0.50** in red. "It read the handwriting off a blurry receipt, did the reconciliation, and caught a fifty-cent overclaim no deterministic check could see — then routed it to me instead of deciding, and told me *specifically* what it couldn't resolve: is that scrawl an $8.30 tip or the $8.80 the employee claims?"
3. Show "What the assistant couldn't resolve" list + the pre-drafted employee message. Edit one word, click **Send & mark info requested**. "Requesting info costs me five seconds, not a composed email."
4. Quickly show the other flag types in the lane: the $212 client dinner over the meals cap ("policy explicitly makes exceptions the approver's discretion — the AI lays out per-person math and the business purpose, then hands me the call"), and the identical Uber pair ("same employee, same fare, same day — deterministic detection flags it, the model compares the receipts and points out the different trip times; duplicates never auto-clear").

## 3:30–4:30 — How I built it + where the model got it wrong

- "Built with Claude Code on Next.js; the receipts are synthetic — generated with Playwright, including a deliberately degraded one: scrawled tip, no handwritten total, blurred."
- **The failure story** (show `docs/failure-story/` — probe 4 is the star):
  - "I expected the model to misread the handwriting. It didn't — four out of four correct reads. Perception wasn't the weak point."
  - "Then I lied to it: same receipt, which supports $84.50, but the claim says $85.00 — a fifty-cent overclaim, the exact gray zone triage exists for. Three identical runs of the naive version: it flagged it once and **approved it twice** — and the approving runs invented a policy, 'reimburse at the corrected amount', which isn't an action this product even has."
  - "So the real failure wasn't reading — it was that **a capable model given decision authority becomes an unpredictable decision-maker in exactly the ambiguous cases where the decision matters**. Plus the outputs drifted shape between runs — number vs string, approve vs approved — which breaks any queue built on top."
  - "Three changes fixed it: routing became a code guardrail — any mismatch or failed check goes to a human, one hundred percent of the time, the model can only make routing stricter; the recommendation is schema-constrained to actions that actually exist; and 'what I couldn't resolve' is a required output field, so uncertainty has somewhere to go other than being papered over. Same $85 case in the final build — routed to a human every time, with the fifty-cent delta called out and the clarification message pre-drafted." (Show EXP-1008 again if time.)
- "The split that matters: deterministic code for money math and routing, the model for reading, reconciling, explaining, drafting."

## 4:30–5:00 — Close

- "What I'd measure: percent auto-cleared and time-to-decision — that's the value; re-review loop rate — do the drafted asks resolve in one round trip; and false-approve rate as the guardrail metric, because this lane only exists if it earns trust."
- Optional 10s if time allows: flash `/submit` — "same engine, employee side: one sentence and a photo instead of seven screens."
- "What I'd do next: real receipt photos (crumpled, skewed — synthetic ones are too clean), and a feedback loop from approver overrides back into the prompts."
