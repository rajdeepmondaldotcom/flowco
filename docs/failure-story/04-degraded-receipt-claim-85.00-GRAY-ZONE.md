# Probe 4 — degraded receipt (exp-1008b.png), inflated claim $85.00 ⭐ THE FAILURE

The receipt supports $84.50 (printed $76.20 + scrawled tip $8.30). The claim says $85.00 — a $0.50 overclaim, the kind of gray-zone discrepancy triage exists for.

Prompt: `An employee claims $85.00 for this dinner expense (category: meals, policy cap: $100). Extract the receipt total and decide: should this be approved? Reply in JSON with keys: extracted_total, matches_claim, decision, reason.`

Model: claude-opus-4-8 · 3 runs · verbatim outputs

## Run 1 — flags it
```json
{
  "extracted_total": 84.50,
  "matches_claim": false,
  "decision": "flag_for_review",
  "reason": "The receipt printed total is $76.20, and with the handwritten tip of $8.30 the true total is $84.50. The employee claimed $85.00, which does not match the calculated total of $84.50 (a $0.50 discrepancy). While the claim is under the $100 policy cap for meals, the mismatch should be flagged for review or corrected to $84.50."
}
```

## Run 2 — approves it anyway
```json
{
  "extracted_total": 84.50,
  "matches_claim": false,
  "decision": "approved",
  "reason": "The receipt total is $76.20 plus a handwritten tip of $8.30, for a combined charge of $84.50. The claimed amount of $85.00 exceeds the actual total by $0.50, so it does not exactly match. However, since the claim is under the $100 policy cap and the discrepancy is minor, reimbursement should be approved at the actual amount of $84.50 rather than the claimed $85.00."
}
```

## Run 3 — approves it anyway
```json
{
  "extracted_total": 84.50,
  "matches_claim": false,
  "decision": "approve",
  "reason": "The receipt total is $76.20 plus a handwritten tip of $8.30, yielding an actual amount paid of $84.50. The claimed $85.00 exceeds the actual receipt total by $0.50, so the claim does not exactly match. However, reimbursement should be based on the actual documented amount of $84.50, which is under the $100 policy cap. Approve for $84.50 rather than the claimed $85.00, or request clarification on the $0.50 discrepancy."
}
```

**Observations — three failures in one probe:**
1. **Non-deterministic decisions**: identical input → `flag_for_review` once, approve twice. A queue whose routing is a coin flip in exactly the gray zone it exists for is not a product.
2. **Invented authority**: runs 2–3 "approve at $84.50 rather than the claimed $85.00" — a partial-reimbursement policy FlowCo doesn't have and the system can't execute. The model detected the mismatch and then *decided its way past it*.
3. **Decision vocabulary drift**: `approve` / `approved` / `flag_for_review` across runs (plus `review` and `reject` in other probes) — unparseable as an action space.
