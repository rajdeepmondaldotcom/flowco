// Capture the employee conversational-submit flow for the showcase PDF:
// describe → review (extracted draft shown back) → submitted.
// Creates one throwaway expense; reset the demo afterward. Run after the app is up.
// Run: BASE=http://localhost:61574 node scripts/capture-submit.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const BASE = process.env.BASE || "http://localhost:61574";
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "showcase-assets");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1120, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("flowco-theme", "light");
  } catch (e) {}
});
const page = await ctx.newPage();
await page.goto(`${BASE}/submit`, { waitUntil: "networkidle" });
await page.waitForTimeout(900);

const sentence =
  "Client dinner with two Acme folks at Nopa last night, about $180 total, on my card — renewal talks";
const box = page.locator("textarea").first();
await box.click();
await box.fill(sentence);
await page.waitForTimeout(400);
await page.screenshot({ path: path.join(outDir, "submit-describe.png") });
console.log("wrote submit-describe.png");

// Submit for extraction
await page.locator('button:has-text("Let the assistant fill it in")').first().click();
// Wait for the review step
await page.waitForSelector('text=/CHECK WHAT THE ASSISTANT|Review|Looks right/i', { timeout: 60000 });
await page.waitForTimeout(1200);
await page.screenshot({ path: path.join(outDir, "submit-review.png") });
console.log("wrote submit-review.png");

// Confirm → submitted success
try {
  await page.locator('button:has-text("Looks right")').first().click();
  await page.waitForSelector('text=/Sent to approvals|no seven screens/i', { timeout: 30000 });
  await page.waitForTimeout(700);
  await page.screenshot({ path: path.join(outDir, "submit-success.png") });
  console.log("wrote submit-success.png");
} catch (e) {
  console.log("SKIP success shot:", e.message.split("\n")[0]);
}

await browser.close();
console.log("done");
