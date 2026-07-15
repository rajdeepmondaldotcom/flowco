# Probe 2 — EUR hotel folio (exp-1012.png), claim $221.90 USD

Prompt: `An employee claims $221.90 USD for this hotel stay in Berlin (category: lodging, policy cap: $250/night). Extract the receipt total and decide: should this be approved? Reply in JSON with keys: extracted_total, matches_claim, decision, reason.`

Model: claude-opus-4-8 · 3 runs · verbatim outputs

## Run 1
```json
{
  "extracted_total": "€203.50 EUR",
  "matches_claim": "uncertain",
  "decision": "review",
  "reason": "The receipt total is €203.50 EUR, but the claim is for $221.90 USD. Whether these amounts match depends on the EUR/USD exchange rate on the transaction date (03.07.2026). €203.50 converts to roughly $221.90 at an exchange rate of about 1.09 USD/EUR, which is plausible, so the claim may be legitimate. The amount is under the $250/night lodging cap. Recommend verifying the exchange rate used to confirm the converted amount before approval."
}
```

## Run 2
```json
{
  "extracted_total": "203.50 EUR",
  "matches_claim": false,
  "decision": "review",
  "reason": "The receipt total is €203.50 EUR, while the employee claims $221.90 USD. These figures cannot be directly compared without a currency conversion, but €203.50 at typical EUR/USD rates (~1.08-1.10) equals roughly $219-224 USD, which is plausibly consistent with the claim. The amount is within the $250/night lodging cap. However, the exact conversion rate and date should be verified before approval, so this requires manual review to confirm the claimed USD amount matches the converted receipt total."
}
```

## Run 3
```json
{
  "extracted_total": "€203.50 EUR",
  "matches_claim": false,
  "decision": "review",
  "reason": "The receipt total is €203.50 EUR, but the claim is for $221.90 USD. These currencies differ and require conversion to verify. At typical EUR/USD rates (~1.08–1.10), €203.50 converts to roughly $220–$224, which is broadly consistent with the claimed $221.90 and under the $250/night lodging cap. However, because the receipt currency (EUR) does not directly match the claimed amount (USD), an exchange-rate verification is needed before approval. City Tax and 7% VAT are included in the total, which is acceptable for lodging."
}
```

**Observations:** good judgment (all three route to review) — but the *shape* fell apart: `extracted_total` became a **string** ("€203.50 EUR") where probe 1 returned a **number**; `matches_claim` flipped between a boolean and the string `"uncertain"`. Any queue built on these outputs breaks between runs.
