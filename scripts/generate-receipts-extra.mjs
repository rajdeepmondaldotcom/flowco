// Extra synthetic receipts for the edge-case seed expenses (cost center,
// over-$1000 hard review, over-$500 one-click). Run: node scripts/generate-receipts-extra.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "receipts");
mkdirSync(outDir, { recursive: true });

const baseCss = `
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin:0; padding:0; box-sizing:border-box; }
    body { background:#b8b2a8; display:flex; align-items:center; justify-content:center; padding:28px; min-height:100vh; }
    .card { width:480px; background:#fff; font-family:'Inter',sans-serif; color:#16181d; box-shadow:0 6px 24px rgba(0,0,0,.28); border-radius:6px; overflow:hidden; transform:rotate(var(--rot,0.4deg)); }
    .card .head { padding:22px 28px; color:#fff; }
    .card .body { padding:22px 28px 28px; }
    .card .row { display:flex; justify-content:space-between; padding:7px 0; font-size:14px; }
    .card .row.rule { border-top:1px solid #e3e5ea; margin-top:6px; padding-top:12px; }
    .card .muted { color:#667085; font-size:12.5px; }
    .card .total { font-weight:700; font-size:16px; }
  </style>`;

const receipts = [
  {
    id: "exp-1017",
    html: `<div class="card" style="--rot:-0.6deg">
      <div class="head" style="background:#5e6ad2"><div style="font-size:20px;font-weight:700">Linear</div><div style="opacity:.8;font-size:13px;margin-top:4px">Receipt LIN-2026-04471</div></div>
      <div class="body">
        <div class="row"><span class="muted">Billed to</span><span>james.okafor@flowco.com</span></div>
        <div class="row"><span class="muted">Date paid</span><span>July 2, 2026</span></div>
        <div class="row rule"><span>Linear — Standard, 1 seat (monthly)</span><span>$16.00</span></div>
        <div class="row"><span class="muted">Tax</span><span>$0.00</span></div>
        <div class="row rule total"><span>Amount paid</span><span>$16.00 USD</span></div>
        <div class="row"><span class="muted">Visa •••• 3391</span><span class="muted">07/02/2026</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1019",
    html: `<div class="card" style="--rot:0.5deg">
      <div class="head" style="background:#002244"><div style="font-size:20px;font-weight:700">UNITED</div><div style="opacity:.8;font-size:13px;margin-top:4px">eTicket Receipt — 016 2274839001</div></div>
      <div class="body">
        <div class="row"><span class="muted">Passenger</span><span>RODRIGUEZ/ELENA</span></div>
        <div class="row"><span class="muted">Itinerary</span><span>SFO ⇄ BER — Jul 20 / Jul 25, 2026</span></div>
        <div class="row"><span class="muted">Cabin</span><span>Economy (round trip, intl)</span></div>
        <div class="row rule"><span>Base fare</span><span>$1,058.00</span></div>
        <div class="row"><span>Taxes, fees &amp; carrier charges</span><span>$122.00</span></div>
        <div class="row rule total"><span>Total charged</span><span>$1,180.00 USD</span></div>
        <div class="row"><span class="muted">MC •••• 7742</span><span class="muted">07/06/2026</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1020",
    html: `<div class="card" style="--rot:-0.5deg">
      <div class="head" style="background:#0f766e"><div style="font-size:19px;font-weight:700">SaaStr Annual 2026</div><div style="opacity:.85;font-size:13px;margin-top:4px">Registration confirmation — #SA26-33418</div></div>
      <div class="body">
        <div class="row"><span class="muted">Attendee</span><span>James Okafor</span></div>
        <div class="row"><span class="muted">Date</span><span>July 6, 2026</span></div>
        <div class="row rule"><span>Full Conference Pass — Early Bird</span><span>$680.00</span></div>
        <div class="row"><span class="muted">Tax</span><span>$0.00</span></div>
        <div class="row rule total"><span>Total paid</span><span>$680.00 USD</span></div>
        <div class="row"><span class="muted">Amex •••• 2214</span><span class="muted">07/06/2026</span></div>
      </div>
    </div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 620, height: 720 }, deviceScaleFactor: 2 });
for (const r of receipts) {
  await page.setContent(`<!doctype html><html><head>${baseCss}</head><body>${r.html}</body></html>`, { waitUntil: "networkidle" });
  await page.locator(".card").first().screenshot({ path: path.join(outDir, `${r.id}.png`) });
  console.log(`wrote ${r.id}.png`);
}
await browser.close();
console.log("done");
