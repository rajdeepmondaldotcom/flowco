# FlowCo · Approvals Triage

Prototype for the Netchex Applied AI take-home. One thing, built deeply: **an AI-assisted triage queue for expense approvals** — the assistant does the investigation, the human makes the decision.

**Live demo:** https://flowco-two.vercel.app — click **Run assistant triage** and watch the queue sort itself. Open **EXP-1013 (The Cape Goa)** for the showpiece: a real ₹16,823 team-dinner receipt where the assistant finds an alcohol line policy says isn't reimbursable, deducts it plus its VAT, and hands the approver the exact reimbursable amount. (`/submit` is the optional employee side.) The demo resets to seed data via the **Reset** button.

## The product idea in one paragraph

Today FlowCo's approver does archaeology on every flagged expense: squint at a receipt, cross-reference a policy doc, search a spreadsheet for duplicates, email the employee, wait, re-review. The AI's job here is **not to approve or reject** — it's to compress "digging" into "deciding." Every expense arrives with the investigation already done: receipt read (including handwritten tips and alcohol lines), policy math computed, foreign currency reconciled, duplicates compared, and a drafted message to the employee when something's missing. Clean cases pool in a one-click lane; ambiguous cases arrive with the evidence laid out and an explicit list of *what the assistant could not resolve*.

## Real receipts, real edge cases

The hard cases in the demo are **real receipts** — crumpled, shadowed phone photos from an actual team offsite in Goa, in rupees with local GST/VAT. They are what convinced me the model earns its place, because each one hits a triage category a rules engine cannot:

| Case | Receipt | Why only the model can catch it |
|---|---|---|
| **The Cape Goa** (EXP-1013) | ₹16,823 team dinner | Contains one alcohol line ("Goan Mudslide (Absolut)", ₹935 + its own 22% VAT). **No structured field says "alcohol"** — only reading the receipt reveals it. The assistant deducts ₹1,140.70 and reports the reimbursable **$187.84**. |
| **Artjuna** (EXP-1014/1015) | Two consecutive bills | Same table, same 14:07 timestamp, same cashier, different items — a legitimate **split of one big group breakfast**, not a double-submission. The assistant compares them and says so. |
| **Padaria** (EXP-1016) | ₹1,080 bakery pickup | Clean and itemized; the assistant recommends approve and flags only the one thing code can't verify — the **INR→USD rate**. |

The clean domestic (USD) receipts auto-clear; the real foreign receipts with alcohol/splits get the full investigation and route to a human. That split is the product.

## Every flag reason in the PDF, covered

The PDF's manual workflow lists exactly what makes an approver stop and dig. Each one is now a deterministic check **and** a seed case you can watch the assistant handle:

| PDF flag reason | Check (code) | Seed case that exercises it |
|---|---|---|
| Amount vs. policy cap not enforced | `policyCap` | EXP-1009 Capital Grille over meals cap |
| Receipt doesn't match claimed amount | model reconciliation | EXP-1008 handwritten-tip mismatch |
| Missing receipt | `receiptPresence` | EXP-1018 $63 lunch, no receipt (required over $25) |
| Wrong cost center / GL code | `costCenter` (dept→GL map) | EXP-1017 Marketing expense coded to Engineering |
| Over $1,000 → always manager review | `amountLimit` | EXP-1019 $1,180 international flight |
| Over $500 → beyond one-click | `amountLimit` | EXP-1020 $680 conference pass |
| Possible duplicate → check past submissions | `duplicate` | EXP-1010/1011 Uber round-trip (legit); EXP-1014/1015 split bill (legit); **EXP-1021/1022 Notion — a true double-submission the model recommends rejecting** |
| Policy exception (discretion) | `policyCap` + model | EXP-1013 alcohol dinner; EXP-1009 client dinner |
| Ambiguous receipt | model (vision) | EXP-1008; the real Goa receipts |
| Foreign currency | `currency` + model FX | EXP-1012 EUR; EXP-1013–1016 INR |
| **Wrong category (to dodge a cap)** | model | EXP-1023 — a $185 steakhouse dinner filed as "travel" (cap $500) instead of "meals" (cap $100) |
| **Personal item on a receipt** | model (vision) | EXP-1024 — a hotel folio with a $18.99 in-room movie the model deducts (reimburse $195.01) |
| **Receipt is a PDF, not a photo** | model (document) | EXP-1025 — a real Canva `.pdf` invoice the model reads and clears |
| Under $500 & everything matches → one-click | all checks pass | EXP-1001–1007 auto-clear lane |

Three of these — mis-categorization, a personal line item, and a **true** double-submission (vs. a legitimate split or round trip) — are things a rules engine cannot judge; the model reads the receipt and reasons about intent. And the PDF invoice case exercises the exact words "Photo or **PDF** upload" from the employee form: images go to the model as image blocks, PDFs as native document blocks.

The employee side (`/submit`) collapses the seven-screen form into one sentence + a photo: the same engine reads it, fills every field including **currency**, shows the extracted draft back to confirm (the PDF's "OCR'd amount shown back"), auto-picks the cost center, and drops it into the approver's queue.

## Running it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

- `/` — approver view: the triage queue. Click **Run assistant triage**.
- `/submit` — (optional employee side) describe an expense in one sentence + a receipt photo; the same engine fills the seven screens' worth of fields.

Without an API key the app runs in clearly-labeled **mock mode**: deterministic checks still run and route the queue, but no receipts are read. Reset the demo any time with the **Reset** button.

## Architecture

```
data/expenses.json  ──►  in-memory store (no DB, on purpose)
data/policy.json           │
                           ▼
              ┌─ lib/checks.ts ───────────── deterministic: policy caps, duplicate
              │                              detection, amount limits ($500/$1,000),
              │                              receipt presence, cost-center match,
              │                              currency (pure code)
              │
              ├─ lib/triage.ts ───────────── Claude (claude-opus-4-8): reads the
              │                              receipt image, finds alcohol/non-
              │                              reimbursable lines, reconciles FX and
              │                              claim, explains, drafts messages.
              │                              Output is schema-constrained
              │                              (structured outputs + zod).
              │
              └─ routing guardrail ────────── code, not vibes: any failed/warned
                                             check, model uncertainty, receipt
                                             mismatch, alcohol found, or foreign
                                             currency ⇒ needs_human. The model can
                                             tighten routing, never loosen it.
```
(Store is Supabase in the deployed demo, in-memory locally — chosen by env vars.)

### Design decisions worth noticing

1. **Deterministic code for money and metadata, LLM for judgment.** Policy-cap math, duplicate candidate detection, amount limits, and currency-mismatch flags are pure functions. The model never does arithmetic the code can do — it reads receipts, finds alcohol/non-reimbursable lines, reconciles foreign currency, explains, and drafts. The clearest proof: **a "no alcohol" check is impossible in code** (nothing in the structured claim says what was ordered), so it's entirely the model's job — and the routing guardrail refuses to auto-clear any receipt where the model found alcohol.
2. **The model cannot approve its way past a failed check.** The guardrail in `lib/triage.ts` only lets the model make routing *stricter*. Auto-clear requires every deterministic check to pass, the model to be confident, the receipt to reconcile, no non-reimbursable items, and no unverifiable FX. (This is the fix for the original failure story — see `docs/failure-story/`.)
3. **"What the assistant couldn't resolve" is a first-class output field.** The schema forces the model to enumerate its own uncertainty instead of papering over it — that list is the heart of the triage UI.
4. **Line-item reconciliation is the signature.** When money must come off (alcohol, FX), the evidence panel shows a ledger — Claimed → deductions → Reimburse — so the approver sees the reduced amount, not just a flag.
5. **Every AI action is audited**, and the **employee side reuses the same engine** — one extraction+reconciliation engine, two surfaces (approver triage, conversational submit).

### Deliberately not built

Auth, real email/Slack sends, payroll integration, editable policy, mobile. The clean domestic receipts are synthetic (generated with Playwright — `scripts/generate-receipts.mjs`), including the deliberately tricky handwritten-tip case and a same-day identical-fare Uber pair. The hard cases use **real** receipt photos.

### Design — "The Reconciliation Desk"

The interface is designed as a calm, precise financial console rather than generic SaaS: Netchex-native slate-navy ink with a teal accent and a warm paper canvas with a faint desk-grid. Typography is **Apple SF Pro** — SF Pro Text for the UI, SF Pro Display for headings and hero numbers, with **tabular numerals** for every amount (the treatment Apple uses in Wallet, Stocks, and Numbers); a monospace is kept only for literal GL codes and key hints. The signature element is the **reconciliation ledger** in the evidence panel — Claimed → deductions → Reimburse — so the approver sees the reduced number, not just a flag. Details: a full **dark mode** (no-flash, respects system, manual toggle), a tactile **APPROVED stamp** on decisions, a **"$ recovered"** headline metric (money the assistant caught that shouldn't be reimbursed), keyboard navigation (`j`/`k`/`↵`), and motion that respects `prefers-reduced-motion`. The visual direction was developed with **Claude Design** (claude.ai/design) against a written brief and implemented here.

**Designed to not make you think.** The whole app is built against the Laws of UX and Nielsen's heuristics, corner to corner:

- **Onboarding & recognition** — a first-run banner with one clear CTA and a 3-step "how it works"; example prompts on the employee form; a `?` keyboard-shortcut overlay. Nobody needs a manual (Paradox of the Active User, Recognition-over-Recall).
- **Flow for the approver** — open a case, decide with a **sticky always-reachable Approve/Request-info/Reject bar** (Fitts), and **auto-advance to the next case**; `a`/`r` to decide, `←/→` and `j/k` to move. Clear the whole review lane without touching the mouse.
- **System status** — skeleton rows on load, a live triage progress bar, per-row "investigating…" shimmer, and a count-up on the "$ recovered" metric (Doherty <400ms feel).
- **User control & recovery** — every decision raises a toast with **Undo** (real revert, audited); errors offer **Retry**; resolved cases can be moved back to review (Nielsen #3/#9, Peak-End).
- **Findability without overwhelm** — search + flag-filter chips with counts and tooltips, lane count badges; the queue leads with the assistant's one-line rationale so the eye lands on the decision, not the chrome (Hick, Von Restorff).
- **A satisfying end** — an "all caught up" inbox-zero state with the session's tally; a warm "sent to approvals" success on submit (Peak-End, Zeigarnik).

> **Font licensing note:** the SF Pro web fonts are subset to `app/fonts/*.woff2`. Apple's SF fonts are free to use in UI design but their license restricts web-embedding to Apple-platform apps — fine for this private prototype, but before making the repo public or shipping to real users, swap SF Pro for a licensed web equivalent (e.g. Inter, or an Apple-licensed webfont). One-line change in `app/layout.tsx`.

### Deployment notes (Vercel + Supabase)

The deployed demo swaps the in-memory store for **Supabase** (Postgres for expense state, Storage for uploaded receipts) because Vercel lambdas are stateless — the backend is chosen by env vars, so `npm run dev` with no Supabase config still works in-memory. Three things a public AI demo needs that localhost doesn't:

- **Cost guardrails** — global hourly caps on model calls (atomic SQL counter, `bump_counter`), so an unattended public URL can't burn the API budget. Friendly 429 when the budget is spent.
- **Timeouts sized for vision calls** — `maxDuration = 120` on the model routes; Opus reading a receipt with thinking enabled is a 10–30s call.
- **Receipt files traced into the lambda** — `outputFileTracingIncludes` so seeded receipt images are readable server-side on Vercel.

Env vars: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Schema in `supabase/migrations/`.

### What I'd measure in production

- **% auto-cleared** (leverage) and **time-to-decision** (the point of the product)
- **Re-review loop rate** — how often "request info" resolves in one round-trip because the drafted ask was specific
- **False-approve rate** as the guardrail metric — this is payroll money; the auto-clear lane earns trust or it doesn't
- Receipt-extraction disagreement rate (model vs claim) as a drift signal
