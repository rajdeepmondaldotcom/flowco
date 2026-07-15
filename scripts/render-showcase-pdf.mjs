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
// Hard gate: every <img> must be fully loaded and decoded, or fail loudly.
// A print race here once shipped a PDF with a broken image icon.
const bad = await page.evaluate(async () => {
  const imgs = [...document.images];
  await Promise.all(
    imgs.map((img) =>
      img.complete ? Promise.resolve() : new Promise((res) => ((img.onload = res), (img.onerror = res)))
    )
  );
  await Promise.all(imgs.map((img) => img.decode().catch(() => null)));
  return imgs.filter((i) => !i.complete || i.naturalWidth === 0).map((i) => i.getAttribute("src"));
});
if (bad.length > 0) {
  console.error("IMAGES FAILED TO LOAD:", bad);
  process.exit(1);
}
await page.waitForTimeout(300);
await page.pdf({
  path: outPath,
  format: "A4",
  printBackground: true,
  preferCSSPageSize: true,
});
await browser.close();
console.log("wrote", outPath);
