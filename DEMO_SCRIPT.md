# 5-minute recording script

> Before recording: open https://flowco-two.vercel.app (or `npm run dev` locally), click **Reset**. Have `docs/failure-story/04-...GRAY-ZONE.md` open in a second tab. Close everything else. Target 4:45 — they said 5 max. Bonus closing line: "it's deployed — the link's in the email, try the queue yourself." The single most important beat is **EXP-1013 (The Cape Goa)** — the real receipt where the model finds alcohol code can't see. Lead with it if you only have time for one.

## 0:00–0:30 — Why this slice

- "I built the approvals-triage story. The reason: one approver clears many expenses, and the cost isn't the approve click — it's the archaeology: squinting at receipts, cross-referencing a policy doc, hunting duplicates in a spreadsheet, emailing the employee and re-reviewing."
- "So the assistant's job in this prototype is *not* to approve or reject. It investigates, and the human decides. It compresses digging into deciding."

## 0:30–2:00 — Happy path

1. Show the queue: 12 submitted expenses, all awaiting triage.
2. Click **Run assistant triage**. Narrate while rows move: "For every expense: deterministic checks run in code — policy caps, duplicate detection, amount limits. Then Claude reads the actual receipt image, reconciles it against the claim, and fills a schema-constrained verdict."
3. Point at the two lanes forming: "Seven landed in *Ready to clear* — every check passed and the model found nothing to question. Note the one with **no receipt at all** that still cleared: parking under $25, and policy says receipts are only required above $25. The assistant knows the policy nuance instead of blindly flagging."
4. Open one clear case briefly — show the reconciliation (printed total = claimed total) — then **Approve all (7)**. "Seven decisions, one click, full audit trail."

## 2:00–3:30 — Real receipts, the cases only the model can crack (the point of the exercise)

"The clean lane was synthetic. The hard lane is real — these are actual receipts from a team offsite in Goa: crumpled phone photos, in rupees, with local taxes. This is where a rules engine falls over and the model earns its place."

1. **The star — open EXP-1013, The Cape Goa (₹16,823 team dinner).** "Deterministic checks flag it's over the meals cap and in a foreign currency — but watch the top." Point at the **reconciliation ledger**: Claimed **$201.50** → less non-reimbursable **−$13.66** → **Reimburse $187.84**. "The model read a real, angled rupee receipt, found one line — 'Goan Mudslide (Absolut)' — recognized it as alcohol, which FlowCo policy says isn't reimbursable, added its *separate* 22% VAT, and handed me the exact amount to pay. **Nothing in the structured expense data says 'alcohol' — the only way to catch this is to read the receipt.** That's the whole thesis in one screen: code does the math it can, the model does the judgment it can't." Scroll to show the struck-through alcohol line and the FX sanity-check.
2. **The duplicate — open EXP-1014/1015, Artjuna.** "Same employee, same restaurant, same day — flagged as a possible duplicate. But the model compared the two bills: consecutive bill numbers, same 14:07 table, *different items*. It concludes this is a legit split of one big group breakfast, not a double-submission, and lays out that evidence so I decide in seconds." (This is the PDF's exact 'possible duplicate → check the spreadsheet' case, automated.)
3. **The honest one — EXP-1016, Padaria.** "Real messy receipt, and the model recommends *approve* — it says everything checks out and flags only the one thing it genuinely can't verify: the exact INR→USD rate. It's not flagging for the sake of flagging."
4. Show the pre-drafted employee message on one of them, edit a word, **Send & mark info requested**. "Five seconds, not a composed email."
5. If time: **EXP-1008 — Harvest Table** (the synthetic failure-story case): "$0.50 overclaim on a handwritten tip — the case that broke my first version. Now it routes correctly every time. That's the fix, live."

## 3:30–4:30 — How I built it + where the model got it wrong

- "Built with Claude Code on Next.js; the receipts are synthetic — generated with Playwright, including a deliberately degraded one: scrawled tip, no handwritten total, blurred."
- **The failure story** (show `docs/failure-story/` — probe 4 is the star):
  - "I expected the model to misread the handwriting. It didn't — four out of four correct reads. Perception wasn't the weak point."
  - "Then I lied to it: same receipt, which supports $84.50, but the claim says $85.00 — a fifty-cent overclaim, the exact gray zone triage exists for. Three identical runs of the naive version: it flagged it once and **approved it twice** — and the approving runs invented a policy, 'reimburse at the corrected amount', which isn't an action this product even has."
  - "So the real failure wasn't reading — it was that **a capable model given decision authority becomes an unpredictable decision-maker in exactly the ambiguous cases where the decision matters**. Plus the outputs drifted shape between runs — number vs string, approve vs approved — which breaks any queue built on top."
  - "Three changes fixed it: routing became a code guardrail — any mismatch or failed check goes to a human, one hundred percent of the time, the model can only make routing stricter; the recommendation is schema-constrained to actions that actually exist; and 'what I couldn't resolve' is a required output field, so uncertainty has somewhere to go other than being papered over. Same $85 case in the final build — routed to a human every time, with the fifty-cent delta called out and the clarification message pre-drafted." (Show EXP-1008 again if time.)
- "The split that matters: deterministic code for money math and routing, the model for reading, reconciling, explaining, drafting."
- Optional breadth line (only if asked): "Every flag reason the manual workflow names — wrong cost center, missing receipt, over-$1,000, duplicates, over-cap, foreign currency — has both a deterministic check and a case you can watch it handle. But the depth is in the alcohol case, so that's where I spent the time."

## 4:30–5:00 — Close

- "What I'd measure: percent auto-cleared and time-to-decision — that's the value; re-review loop rate — do the drafted asks resolve in one round trip; and false-approve rate as the guardrail metric, because this lane only exists if it earns trust."
- Optional 10s if time allows: flash `/submit` — "same engine, employee side: one sentence and a photo instead of seven screens."
- "What I'd do next: real receipt photos (crumpled, skewed — synthetic ones are too clean), and a feedback loop from approver overrides back into the prompts."
