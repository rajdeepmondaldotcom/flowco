# HANDOFF — FlowCo Approvals Triage

> Read this first. It is the single doc that lets a fresh Claude (or a human) pick
> up this project on another machine and continue without the prior chat history.
> For the *product* rationale and design writeup, read [`README.md`](README.md).
> For the failure story, read [`docs/failure-story/`](docs/failure-story/).

Last updated: **2026-07-14** · Branch: `main` · Repo: `git@github.com:rajdeepmondaldotcom/flowco.git`

---

## 0. TL;DR — continue in five minutes

You are on a new machine. The project folder is here. Do this:

```bash
npm install                       # deps (folder copy may include node_modules; install anyway)
npx playwright install chromium   # only if you'll regenerate receipts/screenshots/PDF
# .env.local holds the secrets (see §4). If you COPIED the folder it's already here.
# If you CLONED from git it is NOT (gitignored) — recreate it from §4.
npm run dev                       # http://localhost:3000
```

- `/` is the approver console (the product). Click **Run assistant triage**, watch the queue sort.
- `/submit` is the optional employee side (one sentence + a receipt photo/PDF → filled draft).
- Deployed prod: **https://flowco-two.vercel.app** (Vercel project `flowco`).

Without Supabase env vars the app runs **in-memory** (zero setup, same seed). With them it uses
Supabase (what prod does). See §5.

If there is no `ANTHROPIC_API_KEY`, the app still runs in labeled **mock mode** (deterministic
checks route the queue; no receipts are read).

---

## 1. What this is

A take-home for **Netchex** ("Applied AI Product Leader"). One thing, built deeply:
an **AI-assisted triage queue for expense approvals** at a fictional SaaS company, FlowCo.

The thesis: the AI does not approve or reject. It **compresses "digging" into "deciding."**
Every expense arrives with the investigation already done — receipt read (including alcohol
lines and handwritten tips), policy math computed, foreign currency converted, duplicates
compared, and a drafted message when something is missing. Clean cases pool in a one-click
lane; ambiguous cases arrive with the evidence laid out and an explicit list of *what the
assistant could not resolve*. **The human decides.**

FlowCo is modeled as an **India-based team**: people pay in **rupees** (some in **SGD** on a
Singapore trip) and are reimbursed in **USD**, so the assistant auto-converts every foreign
receipt and shows the local amount next to the converted dollars.

Deliverables: the working prototype + a short recording. The recording's spine is the
**failure story** (where a naive version got it wrong, and the guardrail that fixes it).

---

## 2. Current state (what works)

- **38 seed cases** in [`data/expenses.json`](data/expenses.json). A triage run clears ~11 and
  routes ~27 to a human. Currency mix: **26 INR, 10 USD, 2 SGD**.
- Deployed on **Vercel prod** (`flowco-two.vercel.app`), backed by **Supabase**.
- Everything in the brief is covered and screenshotted in the PDF (§10): alcohol-line
  deduction, FX conversion, not-a-receipt detection, mis-categorization, cap-avoidance split,
  true duplicate vs legit split, personal item on a folio, illegible total, over-claim,
  date mismatch, PDF-not-photo, missing receipt, over-cap / over-$500 / over-$1000.
- **Currency is correct end-to-end** (this was the big bug that got fixed): the claim `total`
  is **always USD**; foreign receipts are read in their native currency and converted **in code**,
  never by the model. A `₹` receipt can never land in the queue as if it were dollars. A header
  **USD / INR toggle** flips every amount in the console.
- `/submit` accepts **photo or PDF**, shows the native→USD conversion in the review step, and
  drops into the approver queue.
- **Fully mobile responsive** (queue rows, metrics, case panel, submit).

### FX rates — read this
Live mid-market reference rates set on **2026-07-14** (source: web search that day):

| | 1 USD = | `FX_TO_USD` |
|---|---|---|
| INR | ~95.7 | `0.01045` |
| SGD | ~1.294 | `0.7728` |

Single source of truth: [`lib/currency.ts`](lib/currency.ts) `FX_TO_USD`, mirrored in
[`data/policy.json`](data/policy.json) `fxToUsd`. The seed's USD totals were **repriced** to
these rates on 2026-07-14 (receipt images are unchanged — they show native amounts, and
`nativeAmount = totalUSD / rate` round-trips).

> ⚠️ **The committed showcase PDF is one rate behind.**
> `docs/FlowCo-Approvals-Triage-Showcase.pdf` and its screenshots were last rendered at the
> **prior** hand-set rate (85.5 INR / 1.28 SGD), so its dollar amounts are ~11% higher than the
> live app now shows. The *live app* and the *seed* are current; only the PDF lags. To bring it
> current, regenerate it (§10) — that re-runs the model on all 38 receipts, so budget ~15 min
> and re-check the caption numbers. Nothing else depends on the PDF.

---

## 3. Run it locally

```bash
npm run dev      # dev server, http://localhost:3000 (see .claude/launch.json)
npm run build    # production build + typecheck (do this before every commit)
npm run start    # serve the production build
npm run lint     # eslint
```

Requires **Node 20+** (Next 16). Local dev defaults to the **in-memory** store unless Supabase
env vars are present — see the caveat in §5 about `.env.local` making local dev hit *shared prod*
Supabase.

---

## 4. Secrets & environment

Three secrets make everything work. They live in **`.env.local`** (gitignored, so it only
travels if you *copied* the folder, not if you *cloned* it):

| Var | What | Where to get it if missing |
|---|---|---|
| `ANTHROPIC_API_KEY` | Claude API (model: `claude-opus-4-8`) | console.anthropic.com → API keys. **Rotate it** (see §13). |
| `SUPABASE_URL` | `https://mjgedufhemlfwtqvxbet.supabase.co` | Supabase dashboard → project `flowco` → Settings → API |
| `SUPABASE_SERVICE_ROLE_KEY` | server-side service role (bypasses RLS) | same page → `service_role` secret. **Never ships to the client.** |

Also present, not strictly required to run: `SUPABASE_DB_PASSWORD` (Supabase CLI / migrations),
`VERCEL_OIDC_TOKEN` (auto-written by `vercel`).

[`.env.example`](.env.example) documents the shape. To recreate `.env.local` on a fresh clone,
copy the values from the **Vercel project's Environment Variables** (they are already set in prod)
or from Supabase/Anthropic dashboards.

Optional overrides: `TRIAGE_MODEL` (default `claude-opus-4-8`), `MOCK_TRIAGE=1` (force mock mode).

---

## 5. Infrastructure

### GitHub
`git@github.com:rajdeepmondaldotcom/flowco.git`, default branch `main`. Push normally; Vercel is
**not** wired to auto-deploy from GitHub — deploys are manual via the Vercel CLI (§9).

### Vercel
- Project **`flowco`** (`projectId prj_vImH9TB8QHI6TWgqp6kf29QHRA8j`, org `team_rybBD0pZCAKABVMggulRH0NY`),
  linked via [`.vercel/project.json`](.vercel/project.json).
- Prod URL: **https://flowco-two.vercel.app**.
- Deploy: `vercel --prod` (needs the Vercel CLI logged in as the project owner).
- `next.config.ts` sets `outputFileTracingIncludes` so `/api/triage` can read the seeded
  receipt images from `public/receipts/**` inside the serverless function. Model routes set
  `maxDuration = 120` (Opus + vision + thinking is a 10–30s call).

### Supabase
- Project **`flowco`**, ref **`mjgedufhemlfwtqvxbet`**, org `wszhavvduzzkmindwqge`.
- Schema: [`supabase/migrations/20260713120000_init.sql`](supabase/migrations/20260713120000_init.sql).
  - `public.expenses` — `id text pk`, `data jsonb`, `updated_at`. One row per expense; the whole
    `TriagedExpense` (claim + checks + aiVerdict + audit) is stored in `data`.
  - `public.counters` — hourly rate-limit counters (`key`, `value`, `window_start`).
  - `public.bump_counter(counter_key, max_per_hour)` — atomic bump-and-check RPC; the model
    routes call it as a **cost guardrail** on the public URL (caps model calls/hour). Returns a
    friendly 429 when spent.
  - Storage bucket **`receipts`** (public) — where `/submit` uploads land.
  - RLS is ON for both tables; all access is server-side via the **service-role key**.
- The store abstraction is [`lib/store.ts`](lib/store.ts): `isSupabaseMode()` picks Supabase vs
  in-memory by env. It **auto-seeds** the `expenses` table from `data/expenses.json` on first read
  when empty. `resetStore()` deletes all rows and re-seeds.

> ⚠️ **Shared-backend caveat.** Because `.env.local` contains the Supabase vars, `npm run dev`
> locally talks to the **same Supabase project as prod**. Triaging locally mutates prod state and
> burns the hourly caps. To develop against the in-memory store instead, blank the Supabase vars
> for that run:
> ```bash
> SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= npm run dev
> ```
> (Command-line env wins over `.env.local` in Next, so `isSupabaseMode()` sees empty strings and
> falls back to memory.) Use this when re-capturing screenshots (§10) so you don't touch prod.

---

## 6. Architecture (one screen)

```
data/expenses.json ─► lib/store.ts (Supabase | in-memory) ─► /api/* ─► components/*
data/policy.json
                     ┌─ lib/checks.ts ── deterministic (pure code): policy caps, duplicate
                     │                    detection, amount limits ($500/$1000), receipt
                     │                    presence, cost-center match, currency mismatch
                     │
                     ├─ lib/triage.ts ── Claude (claude-opus-4-8): reads the receipt image/PDF,
                     │                    finds alcohol / non-reimbursable / personal lines,
                     │                    reconciles FX and claim, explains, drafts the ask.
                     │                    Output is schema-constrained (structured outputs + zod).
                     │
                     └─ routing guardrail ─ code, not vibes: any failed/warned check, model
                                            uncertainty, receipt mismatch, alcohol found, low
                                            legibility, or unverifiable FX ⇒ needs_human. The
                                            model can make routing STRICTER, never looser.
```

Design decisions (the "why") are in README §Architecture. The two that matter most:
1. **Deterministic code for money/metadata, LLM for judgment.** The model never does arithmetic
   the code can do. A "no alcohol" check is *impossible* in code (nothing structured says what was
   ordered) — so it's the model's job, and the guardrail refuses to auto-clear any receipt where
   the model found alcohol.
2. **The model cannot approve its way past a failed check.** Auto-clear requires every check to
   pass AND the model confident AND receipt reconciled AND no non-reimbursable items AND no
   unverifiable FX. This is the fix for the original failure story.

---

## 7. Repo map (the files that matter)

```
app/
  page.tsx                approver console (renders TriageApp)
  submit/page.tsx         employee conversational submit (photo OR pdf)
  api/
    triage/route.ts       run the model on a case (maxDuration 120, hourly cap)
    extract/route.ts      /submit: extract a draft from text + file (image or PDF)
    submit/route.ts       /submit: persist a new EXP-2xxx, store the receipt file
    action/route.ts       approve / request-info / reject / undo (audited)
    expenses/route.ts     list/get expenses
    reset/route.ts        reset the queue to the 38-case seed
components/
  TriageApp.tsx           the queue (lanes, metrics, rows, header, reset modal)
  CaseDetail.tsx          the evidence drawer + reconciliation ledger + decision bar
  badges.tsx              status/flag chips; foreignAmount()/nativeReceiptAmount()
  CurrencyToggle.tsx      USD/INR segmented control
  DisplayCurrency.tsx     React context + useMoney() hook for the display currency
  Providers.tsx           DisplayCurrency + Toast providers
  ThemeToggle.tsx, Toast.tsx
lib/
  currency.ts             ★ single source of truth for FX + formatting
  checks.ts               deterministic policy checks
  triage.ts               the model call + schema + routing guardrail
  extract.ts              /submit extraction (native→USD in code) + not-a-receipt
  limits.ts               hourly caps
  store.ts                Supabase | in-memory store
  types.ts                Expense / TriagedExpense / Policy
data/expenses.json        ★ 38-case seed (USD totals repriced 2026-07-14)
data/policy.json          ★ caps, limits, fxToUsd, reimbursement rules
public/receipts/          seeded receipt images (synthetic PNGs + real photos/PDFs)
scripts/                  receipt generators + screenshot capture + PDF render (§9)
docs/                     showcase.html, the PDF, failure-story/
supabase/migrations/      the schema
.claude/launch.json       dev server config for the preview pane
```

---

## 8. Data & currency details

- **Claim `total` is always USD.** Foreign cases also carry `receiptCurrency` (INR/SGD). The
  native amount shown in the UI is back-computed: `fromUsd(total, receiptCurrency)`.
- **Reprice when rates change.** Change `FX_TO_USD` in `lib/currency.ts` AND `fxToUsd` in
  `data/policy.json`, then rescale the foreign USD totals in `data/expenses.json` by
  `newRate/oldRate` (skip USD cases and **EXP-1029**, a deliberate SGD over-claim whose USD total
  is the employee's inflated claim, not a conversion). Receipt images don't change.
- **Notable cases to keep intact:**
  - `EXP-1013` The Cape Goa — real ₹ receipt with an alcohol line; the signature demo.
  - `EXP-1029` Hotel G Singapore — S$225 receipt claimed as $235 (over-claim). **Do not reprice.**
  - `EXP-1037` conference poster — `not_a_receipt` (junk detection).
  - `EXP-1021/1022` Notion — a true double-submission.
  - `EXP-1014/1015` Artjuna — a *legit* split (the contrast to a cap-avoidance split at 1027/1028).
- `EXP-1033` (personal Amazon book) currently auto-clears at its tiny converted value (~$3.69)
  rather than being flagged personal — a known minor inconsistency; the poster is the strong
  junk case. Not chased.

---

## 9. Common commands

```bash
# Dev / build
npm run dev
npm run build            # ALWAYS before committing (typecheck)

# Deploy (manual)
vercel --prod            # deploy current code to flowco-two.vercel.app

# Reset the prod queue to the 38-case seed (after a demo)
curl -X POST https://flowco-two.vercel.app/api/reset
#   local:  curl -X POST http://localhost:3000/api/reset

# Regenerate the synthetic receipt images (Playwright)
node scripts/generate-receipts.mjs           # base set
node scripts/generate-receipts-v3.mjs         # v3 India-context set (Oberoi, Hotel G, etc.)
node scripts/generate-receipts-edgecases.mjs
node scripts/generate-receipts-extra.mjs
node scripts/generate-receipts-showcase.mjs
node scripts/generate-degraded-receipt.mjs

# Regenerate the showcase PDF (§10)
```

---

## 10. The showcase PDF — how to regenerate

The PDF is **hand-written prose in "NTJ voice" with ZERO em dashes** (a hard rule: it must not
read as AI-generated). Source is [`docs/showcase.html`](docs/showcase.html); screenshots live in
`docs/showcase-assets/`; output is `docs/FlowCo-Approvals-Triage-Showcase.pdf`.

To regenerate at the **current** FX rate (needed to clear the ⚠️ in §2):

```bash
# 1. Run a local server against the IN-MEMORY store so you don't touch prod:
SUPABASE_URL= SUPABASE_SERVICE_ROLE_KEY= npm run dev    # note the port

# 2. Trigger a triage run on the queue (click "Run assistant triage" in the UI at that port,
#    or hit the triage endpoint for each pending case). This re-reads all 38 receipts with
#    Opus — a few minutes and some API spend.

# 3. Capture screenshots (assumes the app is already triaged):
BASE=http://localhost:PORT node scripts/capture-showcase.mjs
BASE=http://localhost:PORT node scripts/capture-submit.mjs

# 4. Update the dollar figures in docs/showcase.html to match the fresh screenshots
#    (rate sentence, the FX examples, and any per-case reimburse numbers in captions).

# 5. Render:
node scripts/render-showcase-pdf.mjs
```

Because triage is model-driven, re-verify the caption numbers against the new run before shipping.

---

## 11. Gotchas (things that will bite you)

1. **`AGENTS.md` says the Next.js is different.** Next 16 here has breaking changes vs older
   training data. When writing App-Router / API-route / config code, check
   `node_modules/next/dist/docs/` and heed deprecations before assuming an API.
2. **Structured-output grammar limit.** The triage schema must stay **flat**. Deeply nested or
   heavily `.nullable()` zod schemas blow the structured-output grammar size and the triage call
   fails. If you extend the schema, keep it shallow.
3. **Shared Supabase in local dev** — see §5. Blank the Supabase env vars to work in-memory.
4. **Currency invariant** — the claim `total` is USD, always. Never let the model write a native
   amount into a USD field. Conversion happens in `lib/currency.ts`, in code.
5. **Guardrail only tightens.** Any change to `lib/triage.ts` routing must preserve the rule that
   the model can make routing stricter but never auto-clear past a failed check.
6. **PDF: no em dashes, no AI tells.** If you touch `docs/showcase.html`, keep the voice and the
   zero-em-dash rule.
7. **SF Pro fonts** are subset into `app/fonts/*.woff2`. Fine for a private prototype; swap for a
   licensed webfont (e.g. Inter) before making the repo public. One line in `app/layout.tsx`.
8. **Receipt files on Vercel** — if you add seeded receipts, keep them under `public/receipts/`
   so `outputFileTracingIncludes` bundles them into the lambda.

---

## 12. Open items / possible next steps

- Regenerate the showcase PDF at the current rate (§2 ⚠️, §10). The only stale artifact.
- Optionally make `EXP-1033` (personal Amazon book) flag as personal instead of auto-clearing.
- Record the ~5-min walkthrough (the failure story is the spine).
- Nothing is broken or half-done. The live app + seed + code are current and consistent.

---

## 13. Security note (do this)

The `ANTHROPIC_API_KEY` was shared in chat during development and is live in `.env.local` and the
Vercel prod env. **Rotate it** at console.anthropic.com before final submission, and update it in
`.env.local` and Vercel. Never commit any secret — `.env*` is gitignored; keep it that way.
