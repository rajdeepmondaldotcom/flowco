// Capture crisp, retina screenshots of every capability for the showcase PDF.
// Assumes the app is already triaged (run the queue first). Writes to docs/showcase-assets/.
// Run: BASE=http://localhost:61574 node scripts/capture-showcase.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const BASE = process.env.BASE || "http://localhost:61574";
const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "docs", "showcase-assets");
mkdirSync(outDir, { recursive: true });

// Each capability → the case that proves it, in the order they appear in the doc.
const CASES = [
  ["EXP-1013", "alcohol"], // alcohol line deducted + FX + over-cap discretion (the signature)
  ["EXP-1024", "personal-item"], // ITC in-room movie deducted
  ["EXP-1026", "illegible"], // faded auto-rickshaw, low legibility -> human
  ["EXP-1019", "currency"], // Air India INR -> USD auto-conversion
  ["EXP-1023", "category"], // barbecue dinner filed as travel
  ["EXP-1027", "split-evasive"], // cap-avoidance split (Barbeque Nation)
  ["EXP-1031", "tip"], // double gratuity (Fatty Bao)
  ["EXP-1030", "date"], // receipt date != claimed date (Truffles)
  ["EXP-1022", "duplicate-true"], // true double-submission (Notion)
  ["EXP-1014", "duplicate-legit"], // legit split (Artjuna, the contrast)
  ["EXP-1039", "not-a-receipt"], // conference poster filed as a printing receipt, junk
  ["EXP-1037", "sgd-pdf-receipt"], // real 2D-TMDs registration receipt, SGD PDF
  ["EXP-1040", "handwritten-bill"], // real Danya handwritten bill in the queue
  ["EXP-1041", "partial-claim"], // honest half-claim of a shared bill
];

async function newCtx(browser, theme, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("flowco-theme", t);
    } catch {}
  }, theme);
  return ctx;
}

async function dismissOnboarding(page) {
  // If the first-run banner is up, close it so the queue is clean.
  const x = page.locator('button[aria-label="Dismiss"], button:has-text("×")').first();
  try {
    if (await x.isVisible({ timeout: 500 })) await x.click();
  } catch {}
}

const browser = await chromium.launch();

// ---- Queue hero, light + dark ----
for (const theme of ["light", "dark"]) {
  const ctx = await newCtx(browser, theme, 1000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1200);
  await dismissOnboarding(page);
  await page.waitForTimeout(400);
  await page.screenshot({ path: path.join(outDir, `queue-hero-${theme}.png`) });
  console.log(`wrote queue-hero-${theme}.png`);
  await ctx.close();
}

// ---- The "needs review" lane (light), scrolled so flagged rows + chips show ----
{
  const ctx = await newCtx(browser, "light", 1000);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await dismissOnboarding(page);
  // scroll to the NEEDS YOUR REVIEW heading
  const h = page.locator('text=NEEDS YOUR REVIEW').first();
  try {
    await h.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  } catch {}
  await page.screenshot({ path: path.join(outDir, `queue-review-lane.png`) });
  console.log("wrote queue-review-lane.png");
  await ctx.close();
}

// ---- Each case evidence panel (light), cropped to the drawer ----
{
  const ctx = await newCtx(browser, "light", 1280);
  const page = await ctx.newPage();
  await page.goto(`${BASE}/admin`, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await dismissOnboarding(page);
  for (const [id, label] of CASES) {
    try {
      // Target the row by its data attribute, not text: a row's summary can
      // MENTION another case's id (e.g. "duplicate of EXP-1022") and has-text
      // would click the wrong row.
      const row = page.locator(`[data-row-id="${id}"]`).first();
      await row.scrollIntoViewIfNeeded();
      await page.waitForTimeout(200);
      await row.click();
      await page.waitForSelector("aside", { timeout: 6000 });
      await page.waitForTimeout(900); // let stamp/motion settle
      const aside = page.locator("aside").first();
      await aside.screenshot({ path: path.join(outDir, `case-${label}.png`) });
      console.log(`wrote case-${label}.png (${id})`);
      await page.keyboard.press("Escape");
      await page.waitForTimeout(350);
    } catch (e) {
      console.log(`SKIP ${id} (${label}): ${e.message.split("\n")[0]}`);
    }
  }
  await ctx.close();
}

await browser.close();
console.log("done");
