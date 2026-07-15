// Blue Tokai cafe bill for the honest-partial-claim case (EXP-1041): the
// receipt totals ₹1,680 but the employee deliberately claims half (₹840).
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "receipts");
mkdirSync(outDir, { recursive: true });

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#9c9488; display:flex; align-items:center; justify-content:center; padding:28px; min-height:100vh; }
  .thermal {
    width:340px; background:#faf7ef; padding:26px 24px 34px;
    font-family:'IBM Plex Mono',monospace; font-size:13px; color:#26251f;
    box-shadow:0 6px 24px rgba(0,0,0,.3);
    transform:rotate(1.4deg);
    filter:contrast(0.94) brightness(1.01);
  }
  .center { text-align:center; }
  h1 { font-size:16px; font-weight:700; letter-spacing:1px; }
  .sub { font-size:11px; color:#5a5548; margin-top:3px; }
  .rule { border-top:1.5px dashed #9a927f; margin:12px 0; }
  .row { display:flex; justify-content:space-between; margin:4px 0; }
  .total-row { font-weight:700; font-size:15px; }
  .meta { font-size:11px; color:#5a5548; }
</style></head><body>
<div class="thermal">
  <div class="center"><h1>BLUE TOKAI COFFEE</h1><div class="sub">Koramangala 5th Block, Bengaluru<br>GSTIN 29AABCB7712C1ZS<br>09/07/2026 16:42 &nbsp; BILL 4417 &nbsp; TBL 6</div></div>
  <div class="rule"></div>
  <div class="row"><span>CAPPUCCINO x2</span><span>420.00</span></div>
  <div class="row"><span>VIETNAMESE COLD BREW x2</span><span>640.00</span></div>
  <div class="row"><span>ALMOND CROISSANT x2</span><span>540.00</span></div>
  <div class="rule"></div>
  <div class="row"><span>SUBTOTAL</span><span>1,600.00</span></div>
  <div class="row"><span>GST 5%</span><span>80.00</span></div>
  <div class="row total-row"><span>TOTAL</span><span>&#8377;1,680.00</span></div>
  <div class="rule"></div>
  <div class="center meta">PAID VIA UPI — CUSTOMER COPY<br>THANK YOU, SEE YOU SOON</div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 620, height: 760 }, deviceScaleFactor: 1.4 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.locator(".thermal").screenshot({ path: path.join(outDir, "exp-1041.png") });
await browser.close();
console.log("wrote exp-1041.png");
