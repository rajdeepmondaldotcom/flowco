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
  ["EXP-1024", "personal-item"], // in-room movie deducted
  ["EXP-1023", "category"], // steakhouse filed as travel
  ["EXP-1022", "duplicate-true"], // true double-submission
  ["EXP-1027", "split-evasive"], // cap-avoidance split
  ["EXP-1014", "duplicate-legit"], // legit split (the contrast)
  ["EXP-1026", "illegible"], // model admits it can't read the total
  ["EXP-1029", "fx-overclaim"], // GBP receipt, inflated USD claim
  ["EXP-1030", "date"], // receipt date != claimed date
  ["EXP-1031", "tip"], // double gratuity
  ["EXP-1025", "pdf"], // PDF invoice, clean clear
  ["EXP-1018", "missing-receipt"], // no receipt over $25
  ["EXP-1008", "failure-fix"], // handwritten-tip gray zone (the fixed failure case)
  ["EXP-1017", "cost-center"], // wrong GL code
];

async function newCtx(browser, theme, height = 1000) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height }, deviceScaleFactor: 2 });
  await ctx.addInitScript((t) => {
    try {
      localStorage.setItem("flowco-theme", t);
    } catch (e) {}
  }, theme);
  return ctx;
}

async function dismissOnboarding(page) {
  // If the first-run banner is up, close it so the queue is clean.
  const x = page.locator('button[aria-label="Dismiss"], button:has-text("×")').first();
  try {
    if (await x.isVisible({ timeout: 500 })) await x.click();
  } catch (e) {}
}

const browser = await chromium.launch();

// ---- Queue hero, light + dark ----
for (const theme of ["light", "dark"]) {
  const ctx = await newCtx(browser, theme, 1000);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
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
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await dismissOnboarding(page);
  // scroll to the NEEDS YOUR REVIEW heading
  const h = page.locator('text=NEEDS YOUR REVIEW').first();
  try {
    await h.scrollIntoViewIfNeeded();
    await page.waitForTimeout(500);
  } catch (e) {}
  await page.screenshot({ path: path.join(outDir, `queue-review-lane.png`) });
  console.log("wrote queue-review-lane.png");
  await ctx.close();
}

// ---- Each case evidence panel (light), cropped to the drawer ----
{
  const ctx = await newCtx(browser, "light", 1280);
  const page = await ctx.newPage();
  await page.goto(BASE, { waitUntil: "networkidle" });
  await page.waitForTimeout(1000);
  await dismissOnboarding(page);
  for (const [id, label] of CASES) {
    try {
      const row = page.locator(`button:has-text("${id}")`).first();
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
