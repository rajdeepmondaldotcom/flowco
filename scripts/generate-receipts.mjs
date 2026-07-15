// Generates synthetic receipt images for the seed expenses.
// Run: node scripts/generate-receipts.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "receipts");
mkdirSync(outDir, { recursive: true });

const baseCss = `
  <link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Caveat:wght@600&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { background: #b8b2a8; display: flex; align-items: center; justify-content: center; padding: 28px; min-height: 100vh; }
    .thermal {
      width: 340px; background: #fdfcf7; padding: 26px 24px 34px;
      font-family: 'IBM Plex Mono', monospace; font-size: 13px; color: #1c1b18;
      box-shadow: 0 6px 24px rgba(0,0,0,.35), 0 1px 3px rgba(0,0,0,.3);
      transform: rotate(var(--rot, 0.7deg));
    }
    .thermal .center { text-align: center; }
    .thermal h1 { font-size: 17px; font-weight: 700; letter-spacing: 1px; text-transform: uppercase; }
    .thermal .sub { font-size: 11px; color: #4a4740; margin-top: 3px; }
    .thermal .rule { border-top: 1.5px dashed #8d887c; margin: 12px 0; }
    .thermal .row { display: flex; justify-content: space-between; margin: 4px 0; }
    .thermal .total-row { font-weight: 700; font-size: 15px; }
    .thermal .meta { font-size: 11px; color: #4a4740; }
    .hand { font-family: 'Caveat', cursive; color: #1d3fa8; font-size: 24px; }
    .card {
      width: 480px; background: #ffffff; font-family: 'Inter', sans-serif; color: #16181d;
      box-shadow: 0 6px 24px rgba(0,0,0,.28); border-radius: 6px; overflow: hidden;
    }
    .card .head { padding: 22px 28px; color: #fff; }
    .card .body { padding: 22px 28px 28px; }
    .card .row { display: flex; justify-content: space-between; padding: 7px 0; font-size: 14px; }
    .card .row.rule { border-top: 1px solid #e3e5ea; margin-top: 6px; padding-top: 12px; }
    .card .muted { color: #667085; font-size: 12.5px; }
    .card .total { font-weight: 700; font-size: 16px; }
  </style>
`;

function thermalItems(items) {
  return items.map(([name, amt]) => `<div class="row"><span>${name}</span><span>${amt}</span></div>`).join("");
}

const receipts = [
  {
    id: "exp-1001",
    html: `<div class="thermal" style="--rot:-0.8deg">
      <div class="center"><h1>Chipotle</h1><div class="sub">Mexican Grill #2214<br>1450 Larimer St, Denver CO<br>07/06/2026 12:42 PM &nbsp; Order #384</div></div>
      <div class="rule"></div>
      ${thermalItems([["CHICKEN BURRITO", "11.10"], ["CHIPS & GUAC", "5.95"], ["FOUNTAIN DRINK LG", "4.50"]])}
      <div class="rule"></div>
      ${thermalItems([["SUBTOTAL", "21.55"], ["TAX 8.6%", "1.85"]])}
      <div class="row total-row"><span>TOTAL</span><span>$23.40</span></div>
      <div class="rule"></div>
      <div class="center meta">VISA **** 4417 — APPROVED<br>THANK YOU!</div>
    </div>`,
  },
  {
    id: "exp-1002",
    html: `<div class="card">
      <div class="head" style="background:#1e1e1e"><div style="font-size:20px;font-weight:700">Figma</div><div style="opacity:.75;font-size:13px;margin-top:4px">Receipt #FIG-2026-078412</div></div>
      <div class="body">
        <div class="row"><span class="muted">Billed to</span><span>ananya.iyer@flowco.com</span></div>
        <div class="row"><span class="muted">Date paid</span><span>July 1, 2026</span></div>
        <div class="row rule"><span>Figma Professional — 1 editor seat (monthly)</span><span>$45.00</span></div>
        <div class="row"><span class="muted">Tax</span><span>$0.00</span></div>
        <div class="row rule total"><span>Amount paid</span><span>$45.00 USD</span></div>
        <div class="row"><span class="muted">Payment method</span><span class="muted">Visa •••• 8802</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1003",
    html: `<div class="card">
      <div class="head" style="background:#000"><div style="font-size:20px;font-weight:700">Uber</div><div style="opacity:.8;font-size:13px;margin-top:4px">July 8, 2026 — Thanks for riding, Arjun</div></div>
      <div class="body">
        <div class="row"><span class="muted">2:12 PM</span><span>FlowCo HQ, 500 Howard St</span></div>
        <div class="row"><span class="muted">2:47 PM</span><span>Brightline, 1 Market Plaza</span></div>
        <div class="row rule"><span>Trip fare (UberX)</span><span>$27.90</span></div>
        <div class="row"><span>Booking fee</span><span>$1.96</span></div>
        <div class="row"><span>Taxes & surcharges</span><span>$2.89</span></div>
        <div class="row rule total"><span>Total</span><span>$32.75</span></div>
        <div class="row"><span class="muted">Amex •••• 1005</span><span class="muted">$32.75</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1004",
    html: `<div class="card">
      <div class="head" style="background:#123c6e"><div style="font-size:19px;font-weight:700">Hampton Inn — Austin Downtown</div><div style="opacity:.8;font-size:13px;margin-top:4px">Guest Folio — Conf #H8834921</div></div>
      <div class="body">
        <div class="row"><span class="muted">Guest</span><span>Kavya Reddy</span></div>
        <div class="row"><span class="muted">Stay</span><span>Jul 9 – Jul 10, 2026 (1 night)</span></div>
        <div class="row rule"><span>Room 412 — King, 07/09</span><span>$168.75</span></div>
        <div class="row"><span>State & occupancy tax</span><span>$20.25</span></div>
        <div class="row rule total"><span>Balance charged</span><span>$189.00</span></div>
        <div class="row"><span class="muted">MC •••• 3390</span><span class="muted">07/10/2026</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1005",
    html: `<div class="thermal" style="--rot:0.9deg">
      <div class="center"><h1>sweetgreen</h1><div class="sub">DTX — 240 Franklin St<br>07/07/2026 12:18 PM &nbsp; #A-77</div></div>
      <div class="rule"></div>
      ${thermalItems([["HARVEST BOWL", "16.25"], ["GUACAMOLE GREENS", "15.95"], ["CRISPY RICE BOWL", "16.45"], ["KALE CAESAR", "13.75"]])}
      <div class="rule"></div>
      ${thermalItems([["SUBTOTAL", "62.40"], ["TAX", "5.40"]])}
      <div class="row total-row"><span>TOTAL</span><span>$67.80</span></div>
      <div class="rule"></div>
      <div class="center meta">AMEX **** 2214 — APPROVED<br>ORDER FOR: ROHAN</div>
    </div>`,
  },
  {
    id: "exp-1007",
    html: `<div class="card">
      <div class="head" style="background:#003268"><div style="font-size:20px;font-weight:700">DELTA</div><div style="opacity:.8;font-size:13px;margin-top:4px">eTicket Receipt — 0067421889350</div></div>
      <div class="body">
        <div class="row"><span class="muted">Passenger</span><span>SHARMA/PRIYA</span></div>
        <div class="row"><span class="muted">Itinerary</span><span>SFO ⇄ DEN — Jul 5 / Jul 7, 2026</span></div>
        <div class="row rule"><span>Base fare (Main Cabin, round trip)</span><span>$398.14</span></div>
        <div class="row"><span>Taxes, fees & charges</span><span>$39.86</span></div>
        <div class="row rule total"><span>Total charged</span><span>$438.00 USD</span></div>
        <div class="row"><span class="muted">Visa •••• 4417</span><span class="muted">07/05/2026</span></div>
      </div>
    </div>`,
  },
  {
    // ⭐ Featured ambiguous receipt: printed total 76.20, handwritten tip 8.30 → 84.50 claimed
    id: "exp-1008",
    html: `<div class="thermal" style="--rot:-1.3deg">
      <div class="center"><h1>Harvest Table</h1><div class="sub">Farm to Fork — 88 Bay St<br>07/08/2026 8:31 PM &nbsp; TBL 14 &nbsp; SRV: Dee</div></div>
      <div class="rule"></div>
      ${thermalItems([["SEARED SALMON", "32.00"], ["ROASTED HALF CHICKEN", "28.00"], ["SPARKLING WATER", "6.00"], ["SIDE GREENS", "4.05"]])}
      <div class="rule"></div>
      ${thermalItems([["SUBTOTAL", "70.05"], ["TAX 8.78%", "6.15"]])}
      <div class="row total-row"><span>TOTAL</span><span>$76.20</span></div>
      <div class="rule"></div>
      <div class="row meta"><span>TIP</span><span class="hand" style="transform:rotate(-2deg);display:inline-block">8.30</span></div>
      <div class="row meta"><span>TOTAL</span><span class="hand" style="transform:rotate(-1.5deg);display:inline-block">84.50</span></div>
      <div class="row meta" style="margin-top:10px"><span>SIGN:</span><span class="hand" style="font-size:26px">M. Webb</span></div>
      <div class="rule"></div>
      <div class="center meta">VISA **** 7719 — CUSTOMER COPY</div>
    </div>`,
  },
  {
    id: "exp-1009",
    html: `<div class="thermal" style="--rot:0.6deg; width: 360px">
      <div class="center"><h1>The Capital Grille</h1><div class="sub">Denver — Larimer Square<br>07/06/2026 9:04 PM &nbsp; TBL 22 &nbsp; GUESTS: 4</div></div>
      <div class="rule"></div>
      ${thermalItems([["FILET MIGNON 10OZ", "44.00"], ["CEDAR PLANK SALMON", "38.00"], ["ROASTED CHICKEN", "29.00"], ["DRY AGED SIRLOIN", "36.00"], ["CALAMARI (SHARED)", "18.20"]])}
      <div class="rule"></div>
      ${thermalItems([["SUBTOTAL", "165.20"], ["TAX 8.6%", "14.20"], ["TIP (CARD)", "33.00"]])}
      <div class="row total-row"><span>TOTAL</span><span>$212.40</span></div>
      <div class="rule"></div>
      <div class="center meta">VISA **** 4417 — APPROVED<br>THANK YOU FOR DINING WITH US</div>
    </div>`,
  },
  {
    id: "exp-1010",
    html: `<div class="card">
      <div class="head" style="background:#000"><div style="font-size:20px;font-weight:700">Uber</div><div style="opacity:.8;font-size:13px;margin-top:4px">July 9, 2026 — Thanks for riding, Arjun</div></div>
      <div class="body">
        <div class="row"><span class="muted">8:05 AM</span><span>SFO Terminal 2</span></div>
        <div class="row"><span class="muted">8:41 AM</span><span>Brightline, 1 Market Plaza</span></div>
        <div class="row rule"><span>Trip fare (UberX)</span><span>$41.84</span></div>
        <div class="row"><span>Booking fee</span><span>$2.75</span></div>
        <div class="row"><span>Taxes & surcharges</span><span>$4.31</span></div>
        <div class="row rule total"><span>Total</span><span>$48.90</span></div>
        <div class="row"><span class="muted">Amex •••• 1005</span><span class="muted">$48.90</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1011",
    html: `<div class="card">
      <div class="head" style="background:#000"><div style="font-size:20px;font-weight:700">Uber</div><div style="opacity:.8;font-size:13px;margin-top:4px">July 9, 2026 — Thanks for riding, Arjun</div></div>
      <div class="body">
        <div class="row"><span class="muted">6:40 PM</span><span>Brightline, 1 Market Plaza</span></div>
        <div class="row"><span class="muted">7:22 PM</span><span>SFO Terminal 2</span></div>
        <div class="row rule"><span>Trip fare (UberX)</span><span>$41.84</span></div>
        <div class="row"><span>Booking fee</span><span>$2.75</span></div>
        <div class="row"><span>Taxes & surcharges</span><span>$4.31</span></div>
        <div class="row rule total"><span>Total</span><span>$48.90</span></div>
        <div class="row"><span class="muted">Amex •••• 1005</span><span class="muted">$48.90</span></div>
      </div>
    </div>`,
  },
  {
    id: "exp-1012",
    html: `<div class="card">
      <div class="head" style="background:#6b5b3e"><div style="font-size:19px;font-weight:700">Hotel Adlon Kempinski Berlin</div><div style="opacity:.85;font-size:13px;margin-top:4px">Rechnung / Guest Folio — Nr. 202607-4471</div></div>
      <div class="body">
        <div class="row"><span class="muted">Gast</span><span>Ananya Iyer</span></div>
        <div class="row"><span class="muted">Aufenthalt</span><span>02.07 – 03.07.2026 (1 Nacht)</span></div>
        <div class="row rule"><span>Deluxe Zimmer — 1 Nacht</span><span>€190.19</span></div>
        <div class="row"><span>City Tax Berlin</span><span>€13.31</span></div>
        <div class="row rule total"><span>Gesamtbetrag</span><span>€203.50 EUR</span></div>
        <div class="row"><span class="muted">Inkl. 7% MwSt. — Visa •••• 8802</span><span class="muted">03.07.2026</span></div>
      </div>
    </div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 620, height: 900 }, deviceScaleFactor: 2 });

for (const r of receipts) {
  await page.setContent(`<!doctype html><html><head>${baseCss}</head><body>${r.html}</body></html>`, {
    waitUntil: "networkidle",
  });
  const el = page.locator(".thermal, .card").first();
  await el.screenshot({ path: path.join(outDir, `${r.id}.png`) });
  console.log(`wrote ${r.id}.png`);
}

await browser.close();
console.log("done");
