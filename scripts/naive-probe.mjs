// The "before" for the failure story: a naive prompt with no schema, no
// deterministic checks, no guardrail — just "read the receipt and decide".
// Run a few times and save outputs; the wrong ones become recording material.
//
// Usage: ANTHROPIC_API_KEY=... node scripts/naive-probe.mjs [runs]
import Anthropic from "@anthropic-ai/sdk";
import { mkdirSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const here = path.dirname(fileURLToPath(import.meta.url));
const outDir = path.join(here, "..", "docs", "failure-story");
mkdirSync(outDir, { recursive: true });

// args: [receipt-basename] [runs] [claim description] [output-label]
const receipt = process.argv[2] ?? "exp-1008";
const runs = Number(process.argv[3] ?? 3);
const claim =
  process.argv[4] ??
  "An employee claims $84.50 for this dinner expense (category: meals, policy cap: $100).";
const label = process.argv[5] ?? receipt;

const image = readFileSync(path.join(here, "..", "public", "receipts", `${receipt}.png`)).toString("base64");
const client = new Anthropic();

const NAIVE_PROMPT = `${claim}
Extract the receipt total and decide: should this be approved? Reply in JSON with keys: extracted_total, matches_claim, decision, reason.`;

for (let i = 1; i <= runs; i++) {
  const res = await client.messages.create({
    model: process.env.TRIAGE_MODEL || "claude-opus-4-8",
    max_tokens: 2000,
    messages: [
      {
        role: "user",
        content: [
          { type: "image", source: { type: "base64", media_type: "image/png", data: image } },
          { type: "text", text: NAIVE_PROMPT },
        ],
      },
    ],
  });
  const text = res.content.filter((b) => b.type === "text").map((b) => b.text).join("\n");
  const file = path.join(outDir, `naive-${label}-run-${i}.txt`);
  writeFileSync(file, `${NAIVE_PROMPT}\n\n--- model (${res.model}) ---\n${text}\n`);
  console.log(`run ${i}:\n${text}\n${"-".repeat(60)}`);
}
console.log(`saved to ${outDir}`);
