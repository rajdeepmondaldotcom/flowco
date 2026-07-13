# FlowCo · Approvals Triage

Prototype for the Netchex Applied AI take-home. One thing, built deeply: **an AI-assisted triage queue for expense approvals** — the assistant does the investigation, the human makes the decision.

**Live demo:** https://flowco-two.vercel.app — click **Run assistant triage** and watch the queue sort itself; open **EXP-1008** for the case the assistant can't resolve on its own. (`/submit` is the optional employee side.) The demo resets to seed data via the **Reset** button.

## The product idea in one paragraph

Today FlowCo's approver does archaeology on every flagged expense: squint at a receipt, cross-reference a policy doc, search a spreadsheet for duplicates, email the employee, wait, re-review. The AI's job here is **not to approve or reject** — it's to compress "digging" into "deciding." Every expense arrives with the investigation already done: receipt read (including handwritten tips), policy math computed, duplicates compared, and a drafted message to the employee when something's missing. Clean cases pool in a one-click lane; ambiguous cases arrive with the evidence laid out and an explicit list of *what the assistant could not resolve*.

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
              │                              detection, amount limits, receipt
              │                              presence, currency (pure code)
              │
              ├─ lib/triage.ts ───────────── Claude (claude-opus-4-8): reads the
              │                              receipt image, reconciles it against
              │                              the claim, explains, drafts messages.
              │                              Output is schema-constrained
              │                              (structured outputs + zod).
              │
              └─ routing guardrail ────────── code, not vibes: any failed/warned
                                             check, model uncertainty, or receipt
                                             mismatch ⇒ needs_human. The model can
                                             tighten routing, never loosen it.
```

### Design decisions worth noticing

1. **Deterministic code for money, LLM for judgment.** Policy-cap math, duplicate candidate detection, and amount limits are pure functions. The model never does arithmetic on money — it reads receipts, reconciles, explains, and drafts.
2. **The model cannot approve its way past a failed check.** The guardrail in `lib/triage.ts` only lets the model make routing *stricter*. Auto-clear requires every deterministic check to pass *and* the model to be confident *and* the receipt to reconcile.
3. **"What the assistant couldn't resolve" is a first-class output field.** The schema forces the model to enumerate its own uncertainty instead of papering over it — that list is the heart of the triage UI.
4. **Every AI action is audited.** The verdict, engine, model, and rationale land in an audit trail on each expense.
5. **The employee side reuses the same engine.** One extraction+reconciliation engine, two surfaces (approver triage, conversational submit).

### Deliberately not built

Auth, real email/Slack sends, payroll integration, editable policy, persistence, mobile. Receipt images are synthetic (generated with Playwright — see `scripts/generate-receipts.mjs`), including the deliberately tricky ones: a handwritten tip that changes the total, a EUR hotel folio, and a same-day identical-fare Uber pair.

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
