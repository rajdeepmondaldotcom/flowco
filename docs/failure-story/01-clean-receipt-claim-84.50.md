# Probe 1 — clean receipt (exp-1008.png), truthful claim $84.50

Prompt: `An employee claims $84.50 for this dinner expense (category: meals, policy cap: $100). Extract the receipt total and decide: should this be approved? Reply in JSON with keys: extracted_total, matches_claim, decision, reason.`

Model: claude-opus-4-8 · 3 runs · verbatim outputs

## Run 1
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approve",
  "reason": "The claimed amount of $84.50 matches the receipt's final total (including $8.30 tip on a $76.20 subtotal-with-tax), and it falls under the $100 meals policy cap."
}
```

## Run 2
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approved",
  "reason": "The claimed amount of $84.50 matches the receipt's final total (including $8.30 tip), and it falls within the $100 meals policy cap."
}
```

## Run 3
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approve",
  "reason": "The claimed amount of $84.50 matches the receipt's final total (including $8.30 tip on a $76.20 subtotal-plus-tax total). The amount falls within the $100 meals policy cap and is in the correct category."
}
```

**Observations:** extraction correct 3/3 (read the handwritten tip). But note `decision: "approve"` vs `"approved"` — vocabulary drifts across identical runs, and all outputs came wrapped in markdown fences (```json), which breaks a naive `JSON.parse`.
