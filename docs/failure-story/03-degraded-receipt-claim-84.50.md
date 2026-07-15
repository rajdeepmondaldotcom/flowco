# Probe 3 — degraded receipt (exp-1008b.png: scrawled tip, no handwritten total, blurred), truthful claim $84.50

Prompt: `An employee claims $84.50 for this dinner expense (category: meals, policy cap: $100). Extract the receipt total and decide: should this be approved? Reply in JSON with keys: extracted_total, matches_claim, decision, reason.`

Model: claude-opus-4-8 · 4 runs · verbatim outputs

## Run 1
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approve",
  "reason": "The receipt total of $76.20 plus the handwritten tip of $8.30 equals $84.50, which matches the claimed amount exactly. This falls under the meals policy cap of $100, so the expense should be approved."
}
```

## Run 2
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approved",
  "reason": "The receipt total of $76.20 plus the handwritten tip of $8.30 equals $84.50, which matches the claimed amount and falls under the $100 meals policy cap."
}
```

## Run 3
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approve",
  "reason": "The receipt total is $76.20 plus a handwritten tip of $8.30, yielding a final total of $84.50. This matches the employee's claim of $84.50 exactly, falls within the meals policy cap of $100, and is properly documented with a signature (M. Webb) and VISA card ending in 7719."
}
```

## Run 4
```json
{
  "extracted_total": 84.50,
  "matches_claim": true,
  "decision": "approved",
  "reason": "The receipt total of $76.20 plus the handwritten tip of $8.30 equals $84.50, which matches the claimed amount and is under the $100 meals policy cap."
}
```

**Observations:** the handwriting trap failed to spring — 4/4 correct reads of a genuinely messy scrawl. Perception was not the weak point; Opus 4.8 is a better receipt reader than expected.
