# Where the model got it wrong — and what changed because of it

All outputs in this folder are verbatim `claude-opus-4-8` responses to `scripts/naive-probe.mjs` — the "before" version: one prompt, receipt image, "extract the total and decide, reply in JSON". No schema, no deterministic checks, no guardrail.

## What I expected to fail, didn't

I designed a trap: a receipt with a scrawled handwritten tip and no handwritten total (`exp-1008b.png`), expecting vision OCR to misread it. **The model beat it — 4/4 correct reads** (probe 3), and extraction stayed grounded in the image even when the prompt asserted a different claimed amount (probes 4–5). Perception was not the weak point.

## What actually failed

**Probe 4 is the story.** Receipt supports $84.50; employee claims $85.00 — a $0.50 gray-zone overclaim, exactly what triage exists to catch. Across three identical runs the naive version:

1. **Flipped its decision** — `flag_for_review` once, approve twice. Routing was a coin flip precisely in the gray zone.
2. **Invented authority** — the approving runs said "approve at $84.50 rather than the claimed $85.00": a partial-reimbursement action FlowCo doesn't have and the system can't execute. The model *detected* the mismatch, then decided its way past it.
3. **Drifted in shape** — across all probes: `extracted_total` flips number↔string, `matches_claim` flips boolean↔"uncertain", the decision vocabulary spans `approve/approved/flag_for_review/review/reject`, and everything arrives wrapped in markdown fences that break `JSON.parse`.

Meanwhile big mismatches (probe 5, +$5.20) were rejected consistently. The failure isn't at the extremes — it lives in the gray zone, which is the entire point of a triage product.

## What changed in the final design (each fix maps to a failure)

| Failure observed | Fix in the shipped engine |
|---|---|
| Gray-zone routing is a coin flip | **Routing is code, not a model choice** (`lib/triage.ts` guardrail): any receipt mismatch, failed/warned check, or sub-0.8 confidence ⇒ `needs_human`, 100% of the time. The model can tighten routing, never loosen it. |
| Model invents actions ("approve at the corrected amount") | `recommendedAction` is a **schema enum of actions that exist in the product** (approve / reject / request_info) — and it's a *recommendation*; the human holds the only approve button for flagged cases. |
| Output shape drifts run-to-run | **Structured outputs** (`output_config.format` + zod): the SDK validates every verdict against the schema; no fences, no type flips. |
| Uncertainty buried in prose | `unresolved: string[]` is a **required schema field** — the model must enumerate what it couldn't resolve, and the UI renders that list as the headline of every flagged case. |

Verified after the fix: the same $85.00-vs-$84.50 case (EXP-1008 in the app) routes to `needs_human` with `recommendedAction: request_info` and a drafted employee message, consistently.

## The lesson (for the recording)

The 2026 lesson wasn't "the model can't read receipts" — it reads them better than I do. It was: **a capable model given decision authority becomes an unpredictable decision-maker in exactly the ambiguous cases where the decision matters**. The engineering work of applied AI here isn't perception, it's *decision rights and output discipline*: code decides who decides, schemas decide what a verdict looks like, and the model does what it's uniquely good at — reading, reconciling, explaining, drafting.
