# FlowCo · Approvals Triage

Built for the Netchex Applied AI take-home. One idea, built deep: **an AI assistant for expense approvals** that does the digging while a person makes the call.

**Live demo:** https://flowco-two.vercel.app. Pick **Admin**. Click **Run assistant triage**. Watch the queue sort itself. Then open **EXP-1013 (The Cape Goa)**. It is a real dinner receipt for ₹16,823. The helper finds one drink on it. Policy says drinks are not paid back. So it takes the drink off, adds its tax, and shows the exact amount to pay. (`/submit` is the employee side: chat or a quick form.) **Reset demo** puts all 41 cases back. Anyone can run it fresh.

FlowCo is an India team in this demo. People pay in rupees, some in Singapore dollars. They get paid back in US dollars. So the helper **converts every foreign receipt** at a set rate and shows both amounts side by side. It also catches files that **are not receipts at all**, like a poster or a personal book, and it never makes up a number.

**📄 The walkthrough (PDF):** [`docs/FlowCo-Approvals-Triage-Showcase.pdf`](docs/FlowCo-Approvals-Triage-Showcase.pdf). Seventeen pages. It maps every rule in the brief to a live, screenshotted case. It also tells the story of where the model failed. To rebuild it: `node scripts/capture-showcase.mjs && node scripts/render-showcase-pdf.mjs`.

## The idea in one paragraph

Today a FlowCo approver digs through every flagged expense by hand: squint at a receipt, check a policy doc, search a spreadsheet for doubles, email the employee, wait, check again. The AI here does **not** approve or reject. It does the digging first. Each expense arrives with the work done: receipt read (even drinks and handwritten tips), policy math done, foreign money converted, doubles compared, and a note to the employee already drafted. Clean cases pool in a one-click lane. Unclear cases arrive with the proof laid out, plus a list of *what the helper could not settle*.

## Real receipts, real edge cases

The hard cases in the demo are **real receipts**. Bent, shadowed phone photos from a team trip to Goa. In rupees, with local tax. Each one hits a case that plain rules can never catch:

| Case | Receipt | Why only a model can catch it |
|---|---|---|
| **The Cape Goa** (EXP-1013) | ₹16,823 team dinner | One drink line hides on it: "Goan Mudslide (Absolut)", ₹935 plus its own 22% tax. **No data field says "drink."** Only reading the receipt finds it. The helper takes off ₹1,140.70 and shows the pay amount: about **$163.88**. |
| **Artjuna** (EXP-1014/1015) | Two receipts, same minute | Same cafe, same time, same waiter, different items. It is one big group meal **split in two**, not a double charge. The helper reads both and says so. |
| **Padaria** (EXP-1016) | ₹1,080 bakery run | Clean and clear. The helper says approve, and flags nothing. It does not flag just to look busy. |

There is a fourth real one: a **fully handwritten receipt** (Danya Enterprises, Bangalore, with ₹5,196 circled by hand). It sits in the queue as EXP-1040, and you can also upload it at `/submit`. The helper reads the shop name off the printed header. It reads the circled total from the handwriting. It names the digits it is not sure of instead of guessing. Then it converts: about $54.30.

Clean, everyday receipts clear on their own. The hard ones get the full workup and go to a person. That split is the product.

## Every stop reason in the brief, covered

The brief lists what makes an approver stop and dig. Each reason is now a check in code **and** a live case you can open:

| Stop reason from the brief | Check (code) | Live case |
|---|---|---|
| Amount over the policy cap | `policyCap` | EXP-1009: a client dinner over the meals cap |
| Receipt does not match the claim | model reads the receipt | EXP-1008: the fifty-cent gray zone |
| Missing receipt | `receiptPresence` | EXP-1018: $55 lunch, no receipt (needed over $25) |
| Wrong cost center / GL code | `costCenter` | EXP-1017: Marketing spend coded to Engineering |
| Over $1,000: manager review | `amountLimit` | EXP-1019: a $1,027 flight |
| Over $500: no one-click | `amountLimit` | EXP-1020: a $593 conference pass |
| Possible double | `duplicate` | EXP-1010/1011: two real cab rides. EXP-1021/1022: a true double charge; the helper says reject one |
| Policy exception (judgment) | cap check + model | EXP-1013: the drink dinner |
| Unclear receipt | model (vision) | EXP-1008 and the real Goa receipts |
| Foreign money | `currency` + model | 31 of the 41 receipts; rates set in `data/policy.json` |
| **Wrong category to dodge a cap** | model | EXP-1023: a $161 dinner filed as "travel" (cap $500) not "meals" (cap $100) |
| **Personal item on a receipt** | model (vision) | EXP-1024: a hotel receipt hiding a ₹1,583 movie; the helper takes it off, pay $169.82 |
| **Receipt is a PDF, not a photo** | model (document) | EXP-1025: a real PDF invoice, read as a file; EXP-1037: a real S$436 receipt PDF |
| **Receipt too blurry to trust** | model + code floor | EXP-1026: a faded cab receipt; the helper refuses to guess; code makes it ask for a clear photo |
| **One dinner split to dodge a cap** | `duplicate` + model | EXP-1027/1028: one $162 dinner as two checks, 5 minutes apart |
| **Foreign over-claim** | `currency` + model | EXP-1029: an S$225 hotel claimed as $235; the math does not survive; $61.12 named |
| **Receipt date does not match** | model + guardrail | EXP-1030: receipt says Jul 2, claim says Jul 6 |
| **Tip on top of a service charge** | model (vision) | EXP-1031: 18% service already in, tip added anyway |
| **Handwritten receipt** | model (vision) | EXP-1040: reads it, clears it at $54.30 |
| **Honest half of a shared receipt** | model + code | EXP-1041: she claims her half of ₹1,680; the helper does the math and clears it |
| **File is not a receipt at all** | model (vision) | EXP-1039: a $95 print claim with a research poster attached; the helper refuses to invent a number |
| Clean and under limits | all checks pass | EXP-1001 to 1007 and more: the one-click lane |

Many of these are things plain rules can never judge: a wrong category, a personal item, a true double versus an honest split, a blurry total, a file that is not a receipt. The model reads the paper and thinks about intent. The queue holds **41 cases**; a run clears about a third, and the rest go to a person.

Two parts worth naming. **Money conversion:** foreign receipts convert at set rates (1 USD is about ₹95.7 and about S$1.29, set on 2026-07-14). The conversion shows on every case as a note, not a block. An over-claim still gets caught, because the receipt is read in its own money and the claim's math is checked against the rate. **Junk detection:** when the upload is a poster, a book, or a screenshot, the model says what the file really is and refuses to make up a number.

The employee side (`/submit`) folds the seven-screen form into one sentence plus a photo. The same engine reads it, fills every field, shows the draft back to confirm, picks the cost center, and drops it into the queue. A **Chat / Quick form** toggle adds a talking path: the chat asks for what is missing, one question at a time, then the same review card confirms it all.

## How one triage call works, start to finish

This is the whole path for one case, in order. It all lives in `lib/` and `app/api/triage/route.ts`.

1. **The claim loads** from the store. An expense is plain data: person, shop, category, date, amounts, cost center, a receipt link. The claim total is **always in US dollars**. Code enforces that. A rupee receipt can never enter the queue posing as dollars.
2. **Checks run in code. No model yet** (`lib/checks.ts`). Category caps. The $500 one-click line and the $1,000 manager line. Double candidates by person, shop, and a 3-day window. Receipt required over $25. Cost center against the team's GL map. Money: a known rate converts in code and is a note on the case, not a block. Only an unknown currency stops for help.
3. **The receipt loads** (`loadReceiptSource` in `lib/triage.ts`). Files are read on the server and encoded. Photos go to the model as images. PDFs go as documents, read as real files. If a file fails to load, triage does not crash. The case is marked unread and goes to a person. Code forces that.
4. **One Opus call does the judgment.** `claude-opus-4-8` gets the claim, every check result, the double candidates, and the receipt itself. Its job is everything code cannot do: read the lines, spot drinks and personal items, match the receipt to the claim *in the receipt's own money*, compare the doubles, judge the category, rate how clear the paper is, and draft the note to the employee.
5. **The answer is locked to a schema.** The reply must fit a strict shape (a Zod schema): what was read, match or not, items to take off with amounts, the money math with the claim's own rate, a confidence score, a *required* list of what it could not settle, and advice limited to actions that exist. No free text posing as data. The shape stays flat on purpose; deep shapes break the output grammar.
6. **Code routes the case** (`applyGuardrail`). Any failed check, any doubt from the model, confidence under 0.8, a hard-to-read receipt, a mismatch or junk file, an over-claim past one cent, anything to take off, money math that does not survive, or a category or date question: each one sends the case to a person. The model can make routing stricter, never looser. Two extra floors: a blurry receipt also forces the advice to "request info," with the resubmit note drafted, and code owns the over-claim line, not the model.
7. **The verdict is saved and shown.** The whole case (claim, checks, verdict, audit trail) is one record. The drawer shows it as proof: the advice first, the math when money comes off, the receipt next to what was read from it, every check, the unsettled list, the drafted note. Approve, reject, ask for info, undo. Every action lands in the audit log with a time.

On speed, honestly: one Opus call with vision takes 10 to 30 seconds. The queue runs cases side by side and fills the lanes as they land. Model routes get a 120-second budget and hourly caps.

## The three engines

| Engine | Model | Job | Why this one |
|---|---|---|---|
| **Triage** (`lib/triage.ts`) | `claude-opus-4-8` | Read the receipt, match it, judge it, draft the note | Reading the receipt is the whole game; a missed drink is money paid wrong, so it gets the strongest reader |
| **Extract** (`lib/extract.ts`) | `claude-opus-4-8` | Turn a sentence (or a chat) plus a photo into a draft expense | Same reading job from the other side. One engine means one set of habits to test |
| **Chat** (`lib/chat.ts`) | `claude-sonnet-5` | Talk with the employee, one question per turn | Chat turns need speed, not deep vision. It costs far less. When it has everything, it hands the chat to the Opus extract path. One path makes every draft |
| **Mock** (in `triage.ts`) | none | Route the queue on checks alone, clearly labeled | Test the code, the store, and the UI with zero spend. Also the no-key mode for anyone who clones the repo |

Model names are settings, not structure. `TRIAGE_MODEL` and `CHAT_MODEL` override them.

## The API

| Route | What it does |
|---|---|
| `POST /api/triage` | Run checks plus the Opus verdict on one case (120s budget, hourly cap) |
| `POST /api/extract` | Employee side: sentence or chat, plus a file, in; draft expense out |
| `POST /api/chat` | One Sonnet chat turn; replies, and signals when it has everything |
| `POST /api/submit` | Save a new `EXP-2xxx`, store the receipt file, check every field |
| `POST /api/action` | approve / reject / request_info / revert; allowed list only; audited |
| `GET /api/expenses` | List the queue (also flags mock mode) |
| `POST /api/reset` | Put the 41-case seed back (public on purpose; the demo resets) |

## Data and store

One table (or one map, locally): `expenses`. One row per case, with the whole case as one JSON record. A prototype with a moving shape needs honest records more than a fancy schema. `lib/store.ts` picks Supabase when keys are set, memory when not. It seeds itself from `data/expenses.json` on first read. `data/policy.json` holds caps, limits, pay rules, and the money rates, with `lib/currency.ts` as the one converter. Supabase also holds a counter table for the hourly caps and a public bucket for uploaded receipts.

## Repo map

```
app/
  page.tsx              the door: Who are you? Admin / Employee
  admin/page.tsx        the approver console (TriageApp)
  submit/page.tsx       the employee side: Chat / Quick form, review card, submit
  submit/ChatMode.tsx   the chat surface
  api/                  the seven routes above
components/
  TriageApp.tsx         queue, lanes, metrics, the run button, keyboard flow
  CaseDetail.tsx        the proof drawer: math, receipt vs read, checks, actions
  badges.tsx            flag chips with plain-words tooltips
  DisplayCurrency.tsx   USD/INR display toggle
lib/                    see the map above
data/                   the 41-case seed + the policy file
public/receipts/        seeded receipts: made ones (scripted) + real photos and PDFs
scripts/                receipt makers, screenshot capture, PDF render, the naive probe
docs/                   the PDF, its HTML source, and the failure story
supabase/migrations/    the database shape
```

## Run it

```bash
npm install
cp .env.example .env.local   # add your ANTHROPIC_API_KEY
npm run dev
```

- `/`: the door. Admin or Employee.
- `/admin`: the approver queue. Click **Run assistant triage**.
- `/submit`: the employee side. One sentence plus a photo, or chat.

No API key? The app still runs, in a clearly labeled **mock mode**. Checks still route the queue. No receipts are read. **Reset** puts the seed back any time.

## How it is built

```
data/expenses.json ──► lib/store.ts (Supabase | memory, picked by env) ──► /api/* ──► two surfaces
data/policy.json         │                                                          /admin  /submit
                         ├─ lib/checks.ts    policy math, pure code
                         ├─ lib/triage.ts    the Opus call, the schema, the guardrail
                         ├─ lib/extract.ts   employee-side draft reading (Opus)
                         ├─ lib/chat.ts      the chat (Sonnet)
                         ├─ lib/currency.ts  one place for money rates
                         ├─ lib/limits.ts    hourly caps on model routes
                         └─ lib/costCenters.ts  team → GL code map, one place
```

### Choices worth noticing

1. **Code does the money math. The model does the judgment.** Caps, limits, doubles, conversion: pure functions. The model never does math code can do. It reads receipts, finds drinks and personal items, matches money, explains, drafts. The clearest proof: **no code can check "no drinks."** Nothing in the data says what was ordered. Only reading the receipt can. So that is the model's job, and the guardrail refuses to clear any receipt where it found one.
2. **The model cannot approve past a failed check.** The guardrail in `lib/triage.ts` only lets the model make routing stricter. To clear, every check must pass, the model must be sure, the receipt must match, nothing to take off, and the money math must survive. (This is the fix for the failure story. See `docs/failure-story/`.)
3. **"What I could not settle" is a required field.** The schema forces the model to name its own doubt instead of hiding it. That list is the heart of the review screen.
4. **The math box is the signature.** When money comes off, the panel shows a ledger: claimed, minus items, pay this. The approver sees the final number, not just a flag.
5. **Every action is audited**, and **both sides share one engine**: one reader, two doors.

### Known limits, named

These are written down instead of hidden:

- **No lock on same-time edits.** Last write wins. Two approvers deciding the same case at the same second would keep only one decision. The action route refuses replays (a decided case cannot be decided again), which closes the common path. True locking needs a version column. Fine for one approver; first fix for a team.
- **New IDs are read-then-write.** Two submits in the same instant could clash. A database sequence fixes it.
- **Prompt injection is reduced, not gone.** The model reads text people wrote and receipts people made. The prompt now treats any "instruction" inside a receipt as a fraud sign to report, and routing can only tighten. But a truly hostile receipt stays the weak spot of any vision system. In production: a second cheap check pass and human sampling of the clear lane.
- **No login, on purpose.** The demo is public and resets in one click. Every route checks input, caps size, and rate-limits. Login is table stakes for production and beside the point here.

### Left out on purpose

Login, real email or Slack sends, payroll hookup, an editable policy screen, and a mobile queue table (the approver works at a desk; the employee side is phone-first, and the case view reads fine on a phone). The clean receipts are made by scripts (`scripts/generate-receipts*.mjs`), including one made blurry on purpose. The hard receipts are **real photos**.

### The look: "The Reconciliation Desk"

The screen is a calm money desk, not a loud dashboard. Slate-navy ink, a teal accent, warm paper, a faint desk grid. Type is **SF Pro**, with **even-width digits** for every amount (the treatment Apple uses in Wallet and Stocks). A monospace face marks GL codes and key hints only. The signature piece is the **math ledger** in the proof panel (claimed → minus items → pay). Also: full **dark mode**, a tactile **APPROVED stamp**, a **"$ caught"** headline metric, keyboard flow (`j`/`k`/`↵`), and motion that respects reduced-motion settings.

**Built to not make you think:**

- **First run**: a banner with one clear button and a 3-step "how it works". Example prompts on the employee form. A `?` overlay lists every key.
- **Approver flow**: open a case, decide from a **pinned action bar**, and auto-advance to the next case. `a` approve, `r` reject. Clear the whole lane without the mouse.
- **Live status**: skeleton rows, a run progress bar, a shimmer on rows being read, a count-up on "$ caught".
- **Undo everything**: every decision raises a toast with **Undo**. Real revert, audited. Errors offer **Retry**.
- **Find fast**: search, flag chips with counts and plain-words tooltips, lane badges. Each row leads with the one-line verdict.
- **A real ending**: an "all caught up" state with the session tally, and a warm "sent" screen on submit.

> **Font note:** the SF Pro web fonts are subset into `app/fonts/*.woff2`. Apple's license limits web embedding to Apple-platform apps. Fine for this private prototype. Swap in Inter (one line in `app/layout.tsx`) before any public release.

### How Vercel and Supabase are used

The deployed demo swaps the memory store for **Supabase** (Postgres for case state, Storage for uploaded receipts), because serverless functions forget everything between calls. Env keys pick the store, so `npm run dev` with no keys still works. Three things a public AI demo needs that localhost does not:

- **Spend caps**: hourly caps on model calls, counted by one atomic SQL function. A public URL cannot burn the key. A friendly 429 when spent.
- **Time budgets sized for vision**: `maxDuration = 120` on model routes. Opus with a receipt and thinking takes 10 to 30 seconds.
- **Receipt files packed into the function**: `outputFileTracingIncludes` ships the seeded receipts to the server so triage can read them in production.

Env keys: `ANTHROPIC_API_KEY`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`. Database shape in `supabase/migrations/`.

### What I would measure in production

- **% cleared on its own** and **time to decision**, because that pair is the value.
- **One-round-trip rate**: whether the drafted ask ends the email ping-pong.
- **False-approve rate**, above all. This is payroll money, and the one-click lane earns trust or it does not.
- **Read-vs-claim disagreement rate** as a drift alarm.
