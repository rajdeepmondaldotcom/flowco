# 5-minute recording script

> **Before recording, in order:**
>
> 1. Reset the deployed queue: `curl -X POST https://flowco-two.vercel.app/api/reset` (or click **Reset** in the app at https://flowco-two.vercel.app).
> 2. Dry run: click **Run assistant triage**, open **EXP-1013 (The Cape Goa)**, and write down the exact deduction and reimburse figures. They are model-derived and can shift a few cents between runs; expect about **−$11.9** deducted and about **$163.9** to reimburse. On camera, read the numbers you wrote down, not the ones in this script.
> 3. Reset again so the recording starts from the clean 38-case queue.
> 4. Copy the handwritten bill to the desktop so it is one drag away: `public/receipts/real-danya-handwritten.jpeg`.
> 5. Have `docs/failure-story/04-degraded-receipt-claim-85.00-GRAY-ZONE.md` open in a second tab. Close everything else.
>
> Target 4:45; they said 5 max. The two beats that matter most: **EXP-1013**, where the model finds alcohol code can't see, and the **failure story**. If time runs short, cut anywhere else.

## 0:00–0:25 · Why this slice

- "I built the approvals-triage story. The reason: one approver clears many expenses, and the cost isn't the approve click. It's the archaeology: squinting at receipts, cross-referencing a policy doc, hunting duplicates in a spreadsheet, emailing the employee and re-reviewing."
- "So the assistant's job in this prototype is *not* to approve or reject. It investigates, and the human decides. It compresses digging into deciding."

## 0:25–1:30 · Happy path

1. Show the queue: 38 submitted expenses, all awaiting triage.
2. Click **Run assistant triage**. Narrate while rows move: "For every expense, deterministic checks run in code: policy caps, duplicate detection, amount limits. Then Claude reads the actual receipt, reconciles it against the claim, and fills a schema-constrained verdict."
3. Point at the two lanes forming: "Eleven landed in *Ready to clear*, about a third; every check passed and the model found nothing to question. Two nuances worth pointing at: one cleared with **no receipt at all**, a $1.57 auto-rickshaw ride, because policy only requires receipts above $25; and one of the clean ones is a **PDF invoice**, not a photo. The same engine reads PDFs natively. The assistant knows the policy nuance instead of blindly flagging."
4. Open one clear case briefly, show the reconciliation (printed total = claimed total), then **Approve all (11)**. "Eleven decisions, one click, full audit trail."

## 1:30–2:40 · Real receipts, the cases only the model can crack (the point of the exercise)

"The clean lane was synthetic. The hard lane is real: actual receipts from a team offsite in Goa. Crumpled phone photos, in rupees, with local taxes. This is where a rules engine falls over and the model earns its place."

1. **The star: open EXP-1013, The Cape Goa (₹16,823 team dinner).** "Deterministic checks flag that it's over the meals cap and in a foreign currency. But watch the top." Point at the **reconciliation ledger**: Claimed **$175.80** → less non-reimbursable, about **−$11.9** → Reimburse about **$163.9** (read the exact live figures from your dry-run note). "The model read a real, angled rupee receipt, found one line, 'Goan Mudslide (Absolut)', recognized it as alcohol, which FlowCo policy says isn't reimbursable, added its *separate* 22% VAT (₹1,140.70 all in), and handed me the exact amount to pay. **Nothing in the structured expense data says 'alcohol'. The only way to catch this is to read the receipt.** That's the whole thesis on one screen: code does the math it can, the model does the judgment it can't." Scroll to the struck-through alcohol line and the FX sanity check.
2. **The duplicate story, the brief's "possible duplicate" told as a contrast.** "The deterministic check flags *eight* possible duplicates, four pairs, by employee + merchant + time. The model's real job isn't finding them. It's telling a genuine double-submission from a coincidence, which only reading the receipts can do."
   - **A real one: EXP-1021/1022, Notion.** "Same employee, same $20 seat, same day, and the *same receipt* attached twice. The model reads both, sees they're identical, and says it plainly: double-submission, approve one, reject the other. That's money FlowCo would otherwise pay twice."
   - **A false alarm: EXP-1014/1015, Artjuna (the real Goa receipts).** "Same table, same 14:07 timestamp, but consecutive bill numbers and *different items*. The model concludes it's a legitimate split of one big group breakfast, not a resubmission, and clears my suspicion in seconds." (This is the PDF's exact "possible duplicate → check the spreadsheet" case, automated, and it cuts *both* ways.)
3. One line on **EXP-1016, Padaria**: "And when everything checks out, it says so. Real messy receipt, the model recommends approve and flags only the one thing it genuinely can't verify, the INR rate. It's not flagging for the sake of flagging."
4. Show the pre-drafted employee message on one of them, edit a word, **Send & mark info requested**. "Five seconds, not a composed email."

## 2:40–3:25 · The employee side: chat, and a handwritten bill (the wow moment, ~40s on the read-back)

1. Open `/submit`. Point at the **Chat / Quick form** toggle: "Employees don't get seven screens. They can just talk to it."
2. In chat mode, drag in the handwritten bill from the desktop (repo file: `public/receipts/real-danya-handwritten.jpeg`) and type exactly: **"shop supplies, handwritten bill, about 5,200 rupees"**.
3. Narrate the read-back, pointing at each item as you say it: "This isn't a print-out. It's a fully handwritten Indian bill. The assistant reads **DANYA ENTERPRISES** off the letterhead, finds the **hand-circled total, ₹5,196**, and is honest about the digits it can't be sure of instead of bluffing. Then it converts: about **$54.30** at the reference rate."
4. Confirm the review card, **submit**, flip to the approver queue, and triage the new case: "Same engine on both sides, and it lands with the investigation already done."

## 3:25–4:30 · How I built it, and where the model got it wrong

- "Built with Claude Code on Next.js. The clean receipts are synthetic, generated with Playwright, including a deliberately degraded one: scrawled tip, no handwritten total, blurred."
- **The failure story** (show `docs/failure-story/`, probe 4 is the star):
  - "I expected the model to misread the handwriting. It didn't. Four out of four correct reads. Perception wasn't the weak point."
  - "Then I lied to it: same receipt, which supports $84.50, but the claim says $85.00. A fifty-cent overclaim, the exact gray zone triage exists for. Three identical runs of the naive version: it flagged it once and **approved it twice**, and the approving runs invented a policy, 'reimburse at the corrected amount', which isn't an action this product even has."
  - "So the real failure wasn't reading. It was that **a capable model given decision authority becomes an unpredictable decision-maker in exactly the ambiguous cases where the decision matters**. Plus the outputs drifted shape between runs, number vs string, approve vs approved, which breaks any queue built on top."
  - "Three changes fixed it. Routing became a code guardrail: any mismatch or failed check goes to a human, one hundred percent of the time, and the model can only make routing stricter. The recommendation is schema-constrained to actions that actually exist. And 'what I couldn't resolve' is a required output field, so uncertainty has somewhere to go other than being papered over. Same $85 case in the final build: routed to a human every time, with the fifty-cent delta called out and the clarification message pre-drafted." (Show EXP-1008, Harvest Table, if time.)
- "The split that matters: deterministic code for money math and routing, the model for reading, reconciling, explaining, drafting."
- Optional breadth line (only if asked): "Every flag reason the manual workflow names has both a deterministic check and a live case: wrong cost center, missing receipt, over $1,000, over cap, foreign currency. Plus the ones the model alone can judge: a meal filed as *travel* to dodge a cap, a personal in-room movie on a hotel folio, and a genuine double-submission. But the depth is in the alcohol case, so that's where I spent the time. Depth over breadth, as you asked."

## 4:30–5:00 · Close

- "What I'd measure: percent auto-cleared and time-to-decision, that's the value; re-review loop rate, do the drafted asks resolve in one round trip; and false-approve rate as the guardrail metric, because this lane only exists if it earns trust."
- "What I deliberately dropped, because depth beat breadth: auth, real email/Slack sends, a payroll write-back, and a mobile approver view. An approver works at a desk, and none of those change whether the triage judgment is *right*. I spent the time where the risk is: the receipt reading, the reconciliation ledger, and the routing guardrail. Knowing what not to build was half the job."
- "What I'd do next: a feedback loop from approver overrides back into the prompts, because every human override is a labeled training signal; real email/Slack sends behind the drafted messages; and a policy editor so Finance can change caps without a deploy."
- Bonus closing line: "It's deployed. The link's in the email. Try the queue yourself."
