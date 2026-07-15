// Capture the employee conversational-submit flow for the showcase PDF:
// describe (INR sentence) -> review (native ₹ -> converted USD shown back) -> submitted.
// Creates one throwaway expense; reset the demo afterward.
// Run: BASE=http://localhost:PORT node scripts/capture-submit.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const BASE = process.env.BASE || "http://localhost:3000";
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "showcase-assets");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1120, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("flowco-theme", "light");
  } catch {}
});
const page = await ctx.newPage();
await page.goto(`${BASE}/submit`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("textarea:visible", { timeout: 60000 });
await page.waitForTimeout(900);

// An INR sentence, so the review shows the rupee amount converting to USD.
const sentence = "Team dinner on Swiggy with the eng team last night, about ₹6,400 total, receipt attached";
const box = page.locator("textarea:visible").first();
// A fill that lands before React hydrates never reaches state. Prove hydration first:
// click an example chip until its onClick visibly updates the textarea, then fill.
const chip = page.locator('button:has-text("Team lunch on Swiggy")').first();
for (let i = 0; i < 20; i++) {
  await chip.click();
  await page.waitForTimeout(500);
  if ((await box.inputValue()).length > 0) break;
}
await box.fill(sentence);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, "submit-describe.png") });
console.log("wrote submit-describe.png");

// Submit for extraction, then wait for the REVIEW card (the compose card is gone).
await page.locator('button:has-text("Let the assistant fill it in")').first().click();
await page.waitForSelector("text=/Check what the assistant filled in/i", { timeout: 90000 });
await page.waitForSelector('button:has-text("Looks right")', { timeout: 90000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, "submit-review.png") });
console.log("wrote submit-review.png");

try {
  await page.locator('button:has-text("Looks right")').first().click();
  await page.waitForSelector("text=/Sent to approvals|no seven screens/i", { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, "submit-success.png") });
  console.log("wrote submit-success.png");
} catch (e) {
  console.log("SKIP success shot:", e.message.split("\n")[0]);
}

await browser.close();
console.log("done");
