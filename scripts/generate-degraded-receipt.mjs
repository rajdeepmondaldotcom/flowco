// A realistically-degraded variant of the Harvest Table receipt: scrawled tip,
// no handwritten total, slight blur/low contrast — like a real photo of a real
// receipt. Used to probe where receipt-reading actually breaks.
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "receipts");
mkdirSync(outDir, { recursive: true });

const html = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Homemade+Apple&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#a89f92; display:flex; align-items:center; justify-content:center; padding:28px; min-height:100vh; }
  .thermal {
    width:340px; background:#f6f3ea; padding:26px 24px 34px;
    font-family:'IBM Plex Mono',monospace; font-size:13px; color:#2a2925;
    box-shadow:0 6px 24px rgba(0,0,0,.35);
    transform:rotate(-2.2deg) skewY(0.6deg);
    filter:blur(0.55px) contrast(0.82) brightness(1.03);
  }
  .center { text-align:center; }
  h1 { font-size:17px; font-weight:700; letter-spacing:1px; }
  .sub { font-size:11px; color:#57534a; margin-top:3px; }
  .rule { border-top:1.5px dashed #948d7e; margin:12px 0; }
  .row { display:flex; justify-content:space-between; margin:4px 0; }
  .total-row { font-weight:700; font-size:15px; }
  .meta { font-size:11px; color:#57534a; }
  .hand { font-family:'Homemade Apple',cursive; color:#3a4d9c; font-size:19px; filter:blur(0.3px); }
</style></head><body>
<div class="thermal">
  <div class="center"><h1>HARVEST TABLE</h1><div class="sub">Farm to Fork — 88 Bay St<br>07/08/2026 8:31 PM &nbsp; TBL 14 &nbsp; SRV: Dee</div></div>
  <div class="rule"></div>
  <div class="row"><span>SEARED SALMON</span><span>32.00</span></div>
  <div class="row"><span>ROASTED HALF CHICKEN</span><span>28.00</span></div>
  <div class="row"><span>SPARKLING WATER</span><span>6.00</span></div>
  <div class="row"><span>SIDE GREENS</span><span>4.05</span></div>
  <div class="rule"></div>
  <div class="row"><span>SUBTOTAL</span><span>70.05</span></div>
  <div class="row"><span>TAX 8.78%</span><span>6.15</span></div>
  <div class="row total-row"><span>TOTAL</span><span>$76.20</span></div>
  <div class="rule"></div>
  <div class="row meta" style="align-items:baseline"><span>TIP</span><span class="hand" style="transform:rotate(-4deg) translateY(2px);display:inline-block">8.30</span></div>
  <div class="row meta" style="align-items:baseline; margin-top:8px"><span>TOTAL</span><span></span></div>
  <div class="row meta" style="margin-top:6px; align-items:baseline"><span>SIGN:</span><span class="hand" style="font-size:21px">M Webb</span></div>
  <div class="rule"></div>
  <div class="center meta">VISA **** 7719 — CUSTOMER COPY</div>
</div>
</body></html>`;

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: 1.4 });
await page.setContent(html, { waitUntil: "networkidle" });
await page.locator(".thermal").screenshot({ path: path.join(outDir, "exp-1008b.png") });
await browser.close();
console.log("wrote exp-1008b.png");
