// Render docs/showcase.html → docs/FlowCo-Approvals-Triage-Showcase.pdf
// Run: node scripts/render-showcase-pdf.mjs
import { chromium } from "playwright";
import { fileURLToPath, pathToFileURL } from "url";
import path from "path";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const htmlPath = path.join(root, "docs", "showcase.html");
const outPath = path.join(root, "docs", "FlowCo-Approvals-Triage-Showcase.pdf");

const browser = await chromium.launch();
const page = await browser.newPage();
await page.emulateMedia({ media: "print" });
await page.goto(pathToFileURL(htmlPath).href, { waitUntil: "networkidle" });
// give images a beat to decode
await page.waitForTimeout(800);
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log("wrote", outPath);
