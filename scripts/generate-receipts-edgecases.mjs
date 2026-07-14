// Edge-case receipts that each prove a distinct triage capability:
//  1026  a faded/blurry receipt the model must admit it can't fully read
//  1027  + 1028  two checks, same table, same card, minutes apart — one dinner
//        split into two sub-cap claims to dodge the $100 meals cap
//  1029  a London hotel folio in GBP where the USD claim implies an inflated rate
//  1030  a receipt dated four days before the claimed transaction date
//  1031  a bill with an 18% service charge already included AND a tip added on top
// Run: node scripts/generate-receipts-edgecases.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "receipts");
mkdirSync(outDir, { recursive: true });

const baseCss = `
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#b8b2a8; display:flex; align-items:center; justify-content:center; padding:34px; min-height:100vh; }
    .thermal { width:340px; background:#fdfcf7; padding:26px 24px 34px; font-family:'IBM Plex Mono',monospace; font-size:13px; color:#1c1b18; box-shadow:0 6px 24px rgba(0,0,0,.35); transform:rotate(var(--rot,0.5deg)); position:relative; }
    .thermal .center { text-align:center; }
    .thermal h1 { font-size:17px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    .thermal .sub { font-size:11px; color:#4a4740; margin-top:3px; }
    .thermal .rule { border-top:1.5px dashed #8d887c; margin:12px 0; }
    .thermal .row { display:flex; justify-content:space-between; margin:4px 0; }
    .thermal .total-row { font-weight:700; font-size:15px; }
    .thermal .meta { font-size:11px; color:#4a4740; }
    .thermal .hand { font-family:'Bradley Hand','Comic Sans MS',cursive; }
    .card { width:480px; background:#fff; font-family:'Inter',sans-serif; color:#16181d; box-shadow:0 6px 24px rgba(0,0,0,.28); border-radius:6px; overflow:hidden; transform:rotate(var(--rot,0.4deg)); }
    .card .head { padding:22px 28px; color:#fff; }
    .card .body { padding:22px 28px 28px; }
    .card .row { display:flex; justify-content:space-between; padding:7px 0; font-size:14px; }
    .card .row.rule { border-top:1px solid #e3e5ea; margin-top:6px; padding-top:12px; }
    .card .muted { color:#667085; font-size:12.5px; }
    .card .total { font-weight:700; font-size:16px; }
    /* glare + fade to simulate a bad phone photo of a thermal receipt */
    .glare::after { content:""; position:absolute; inset:0; background:linear-gradient(118deg, rgba(255,255,255,.62) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 62%, rgba(255,255,255,.5) 100%); pointer-events:none; }
    .faded { color:#8a877e; }
    .faded .total-row { color:#9b978d; }
  </style>`;

const tItems = (items) =>
  items.map(([n, a]) => `<div class="row"><span>${n}</span><span>${a}</span></div>`).join("");

const receipts = [
  {
    // 1026 — genuinely hard to read: faded thermal, blurred, glared, skewed.
    id: "exp-1026",
    clip: 380,
    html: `<div class="thermal faded glare" style="--rot:-2.4deg; filter:blur(1.35px) contrast(.72) brightness(1.14) saturate(.7)">
      <div class="center"><h1>Denver Yellow Cab</h1><div class="sub">Medallion 4471 &nbsp; 07/07/2026 23:41</div></div>
      <div class="rule"></div>
      ${tItems([["FARE", "28.—0"], ["AIRPORT SUR.", "3.5?"], ["GRATUITY", "3.??"]])}
      <div class="rule"></div>
      <div class="row total-row"><span>TOTAL</span><span>$3◼.◼◼</span></div>
      <div class="rule"></div>
      <div class="center meta">CARD **** 77?2 — APPR<br>THANK YOU / DRIVE SAFE</div>
    </div>`,
  },
  {
    // 1027 — evasive split, check A. Same table 12, same Amex, 8:14 PM.
    id: "exp-1027",
    clip: 420,
    html: `<div class="thermal" style="--rot:0.8deg; width:350px">
      <div class="center"><h1>Prime &amp; Provisions</h1><div class="sub">Steakhouse — Chicago<br>07/08/2026 &nbsp;8:14 PM &nbsp; TBL 12 &nbsp; SVR: Marcus</div></div>
      <div class="rule"></div>
      ${tItems([["FILET 8OZ", "46.00"], ["CAESAR (SPLIT)", "9.00"], ["TRUFFLE FRIES", "12.00"], ["ICED TEA x2", "8.00"]])}
      <div class="rule"></div>
      ${tItems([["SUBTOTAL", "75.00"], ["TAX 10.25%", "7.69"], ["TIP", "11.31"]])}
      <div class="row total-row"><span>CHECK 1 OF 2</span><span>$94.00</span></div>
      <div class="rule"></div>
      <div class="center meta">AMEX **** 2214 — APPROVED<br>SPLIT CHECK — TABLE 12</div>
    </div>`,
  },
  {
    // 1028 — evasive split, check B. SAME table 12, SAME Amex, 8:19 PM (5 min later).
    id: "exp-1028",
    clip: 420,
    html: `<div class="thermal" style="--rot:-1.1deg; width:350px">
      <div class="center"><h1>Prime &amp; Provisions</h1><div class="sub">Steakhouse — Chicago<br>07/08/2026 &nbsp;8:19 PM &nbsp; TBL 12 &nbsp; SVR: Marcus</div></div>
      <div class="rule"></div>
      ${tItems([["RIBEYE 12OZ", "52.00"], ["WEDGE SALAD", "11.00"], ["CREAMED SPINACH", "10.00"]])}
      <div class="rule"></div>
      ${tItems([["SUBTOTAL", "73.00"], ["TAX 10.25%", "7.48"], ["TIP", "11.52"]])}
      <div class="row total-row"><span>CHECK 2 OF 2</span><span>$92.00</span></div>
      <div class="rule"></div>
      <div class="center meta">AMEX **** 2214 — APPROVED<br>SPLIT CHECK — TABLE 12</div>
    </div>`,
  },
  {
    // 1029 — London hotel folio in GBP. £180.00; the USD claim ($245) implies ~1.36.
    id: "exp-1029",
    clip: 520,
    html: `<div class="card">
      <div class="head" style="background:#14243b"><div style="font-size:19px;font-weight:700">The Hoxton, Holborn</div><div style="opacity:.85;font-size:13px;margin-top:4px">Guest Folio — Booking HOX-2026-88431</div></div>
      <div class="body">
        <div class="row"><span class="muted">Guest</span><span>Arjun Nair</span></div>
        <div class="row"><span class="muted">Stay</span><span>9 Jul – 10 Jul 2026 (1 night)</span></div>
        <div class="row rule"><span>Roomy Room — 1 night, 09/07</span><span>£116.67</span></div>
        <div class="row"><span>VAT 20%</span><span>£23.33</span></div>
        <div class="row rule total"><span>Total charged</span><span>£140.00 GBP</span></div>
        <div class="row"><span class="muted">Visa •••• 5190</span><span class="muted">Amount in GBP</span></div>
      </div>
    </div>`,
  },
  {
    // 1030 — receipt clearly dated Jul 2; the claim says Jul 6.
    id: "exp-1030",
    clip: 400,
    html: `<div class="thermal" style="--rot:0.6deg; width:340px">
      <div class="center"><h1>Tender Greens</h1><div class="sub">Marina — San Francisco</div></div>
      <div class="rule"></div>
      <div class="row meta"><span>DATE</span><span>Thu 07/02/2026</span></div>
      <div class="row meta"><span>TIME</span><span>12:38 PM</span></div>
      <div class="rule"></div>
      ${tItems([["STEELHEAD PLATE", "17.50"], ["CHIPOTLE CHICKEN", "16.50"], ["BIG SALAD", "15.00"], ["SPARKLING x2", "7.00"], ["COOKIE x2", "6.00"]])}
      <div class="rule"></div>
      ${tItems([["SUBTOTAL", "62.00"], ["TAX", "6.00"]])}
      <div class="row total-row"><span>TOTAL</span><span>$68.00</span></div>
      <div class="rule"></div>
      <div class="center meta">VISA **** 4417 — APPROVED<br>07/02/2026 12:41 PM</div>
    </div>`,
  },
  {
    // 1031 — 18% service charge already included, PLUS a handwritten tip on top.
    id: "exp-1031",
    clip: 440,
    html: `<div class="thermal" style="--rot:-0.7deg; width:350px">
      <div class="center"><h1>Boka</h1><div class="sub">West Loop — Chicago<br>07/05/2026 7:52 PM &nbsp; PARTY OF 4</div></div>
      <div class="rule"></div>
      ${tItems([["SMALL PLATES x5", "44.00"], ["N/A COCKTAIL x2", "14.00"]])}
      <div class="rule"></div>
      ${tItems([["SUBTOTAL", "58.00"], ["SERVICE CHARGE 18%", "10.44"]])}
      <div class="row"><span>ADDED TIP</span><span class="hand" style="font-size:15px">+ 12.00</span></div>
      <div class="rule"></div>
      <div class="row total-row"><span>TOTAL</span><span class="hand">$80.44</span></div>
      <div class="rule"></div>
      <div class="center meta">18% SERVICE INCLUDED FOR PARTIES 4+<br>MC **** 3301 — APPROVED</div>
    </div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 680, height: 900 }, deviceScaleFactor: 2 });
for (const r of receipts) {
  await page.setContent(`<!doctype html><html><head>${baseCss}</head><body>${r.html}</body></html>`, {
    waitUntil: "networkidle",
  });
  // Screenshot the body region (with padding) so blur/glare/skew aren't clipped.
  const el = page.locator(".card, .thermal").first();
  const box = await el.boundingBox();
  const pad = 26;
  await page.screenshot({
    path: path.join(outDir, `${r.id}.png`),
    clip: {
      x: Math.max(0, box.x - pad),
      y: Math.max(0, box.y - pad),
      width: box.width + pad * 2,
      height: box.height + pad * 2,
    },
  });
  console.log(`wrote ${r.id}.png`);
}
await browser.close();
console.log("done");
