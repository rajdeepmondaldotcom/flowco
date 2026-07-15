# Probe 5 — degraded receipt (exp-1008b.png), implausible claim $89.70

Same receipt (supports $84.50); claim inflated by $5.20 — outside the gray zone.

Prompt: `An employee claims $89.70 for this dinner expense (category: meals, policy cap: $100). Extract the receipt total and decide: should this be approved? Reply in JSON with keys: extracted_total, matches_claim, decision, reason.`

Model: claude-opus-4-8 · 2 runs · verbatim outputs

## Run 1
```json
{
  "extracted_total": 84.50,
  "matches_claim": false,
  "decision": "reject",
  "reason": "The receipt printed total is $76.20 and the handwritten tip is $8.30, making the actual charged amount $84.50. The employee claimed $89.70, which does not match the receipt. Although $89.70 is under the $100 policy cap, the claimed amount exceeds the documented total by $5.20, so the claim should be corrected to $84.50 or rejected pending clarification."
}
```

## Run 2
```json
{
  "extracted_total": 84.50,
  "matches_claim": false,
  "decision": "reject",
  "reason": "The receipt printed total is $76.20, and adding the handwritten tip of $8.30 yields a final total of $84.50. The employee's claim of $89.70 does not match either figure ($76.20 or $84.50). Although the claimed amount is under the $100 policy cap, it exceeds the actual amount paid by $5.20, so the claim should be corrected to $84.50 before approval."
}
```

**Observations:** big mismatches are handled consistently (reject, 2/2) — and extraction stayed anchored to the image ($84.50) even when the claim asserted a different number. The failure isn't at the extremes; it lives in the gray zone (see probe 4).
