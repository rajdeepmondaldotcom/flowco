// Capture the chat-mode conversation and the handwritten-bill review card for the showcase PDF.
// Creates throwaway state in the in-memory store; reset the demo afterward.
// Run: BASE=http://localhost:PORT node scripts/capture-chat.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const BASE = process.env.BASE || "http://localhost:3000";
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const outDir = path.join(root, "docs", "showcase-assets");
mkdirSync(outDir, { recursive: true });

const browser = await chromium.launch();
const ctx = await browser.newContext({ viewport: { width: 1120, height: 1000 }, deviceScaleFactor: 2 });
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("flowco-theme", "light");
  } catch {}
});
const page = await ctx.newPage();

// ---- Shot 1: chat mode, a real multi-turn exchange ----
await page.goto(`${BASE}/submit`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("textarea:visible", { timeout: 60000 });

// Prove hydration before interacting: click the Chat toggle until the chat composer appears.
const chatToggle = page.locator('button:has-text("Chat")').first();
const chatBox = page.locator('textarea[placeholder="Describe the expense…"]');
for (let i = 0; i < 20; i++) {
  await chatToggle.click();
  await page.waitForTimeout(500);
  if (await chatBox.isVisible()) break;
}

async function say(text) {
  await chatBox.click();
  await chatBox.fill(text);
  await page.keyboard.press("Enter");
}

const turnCount = () => page.locator('[data-chat-role="assistant"], .chat-assistant, li, div').count();
await say("Auto from the office to the airport this morning, 480 rupees on my card");
// Wait for the assistant's reply (the send button re-enables when the turn is done).
await page.waitForTimeout(1500);
await page.waitForFunction(() => !document.querySelector('textarea[placeholder="Describe the expense…"]')?.disabled, null, { timeout: 90000 });
await page.waitForTimeout(800);
await say("It was for the Acme client kickoff, bill it to the Q3 Pipeline project");
await page.waitForTimeout(1500);
await page.waitForFunction(() => !document.querySelector('textarea[placeholder="Describe the expense…"]')?.disabled, null, { timeout: 90000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, "submit-chat.png") });
console.log("wrote submit-chat.png");
void turnCount;

// ---- Shot 2: quick form + the handwritten Danya bill -> review card ----
await page.goto(`${BASE}/submit`, { waitUntil: "domcontentloaded", timeout: 60000 });
await page.waitForSelector("textarea:visible", { timeout: 60000 });
const box = page.locator("textarea:visible").first();
const chip = page.locator('button:has-text("Team lunch on Swiggy")').first();
for (let i = 0; i < 20; i++) {
  await chip.click();
  await page.waitForTimeout(500);
  if ((await box.inputValue()).length > 0) break;
}
await box.fill("Shop supplies from a local store, handwritten bill, about 5,200 rupees");
await page.setInputFiles('input[type="file"]', path.join(root, "public", "receipts", "real-danya-handwritten.jpeg"));
await page.waitForTimeout(600);
await page.locator('button:has-text("Let the assistant fill it in")').first().click();
await page.waitForSelector("text=/Check what the assistant filled in/i", { timeout: 120000 });
await page.waitForSelector('button:has-text("Looks right")', { timeout: 120000 });
await page.waitForTimeout(1000);
await page.screenshot({ path: path.join(outDir, "submit-handwritten.png") });
console.log("wrote submit-handwritten.png");

await browser.close();
console.log("done");
