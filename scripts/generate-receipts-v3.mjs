// v3 synthetic receipts: an Indian-context team (Swiggy, Ola, Barbeque Nation,
// ITC, Farzi, Toit, Air India, SaaSBOOMi, Namma Yatri) plus the US SaaS the
// company runs on (Figma, Vercel, Linear, Notion) and a few intl trips
// (Berlin EUR, London GBP, Singapore SGD). Real photo/PDF receipts live
// alongside these and are not generated here.
// Run: node scripts/generate-receipts-v3.mjs
import { chromium } from "playwright";
import { mkdirSync } from "fs";
import { fileURLToPath } from "url";
import path from "path";

const outDir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "public", "receipts");
mkdirSync(outDir, { recursive: true });

const css = `
<link href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;700&family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { background:#b8b2a8; display:flex; align-items:center; justify-content:center; padding:34px; min-height:100vh; }
  .thermal { width:360px; background:#fdfcf7; padding:24px 22px 30px; font-family:'IBM Plex Mono',monospace; font-size:12.5px; color:#1c1b18; box-shadow:0 6px 24px rgba(0,0,0,.35); transform:rotate(var(--rot,0.4deg)); position:relative; }
  .thermal .c { text-align:center; }
  .thermal h1 { font-size:16px; font-weight:700; letter-spacing:.5px; text-transform:uppercase; }
  .thermal .sub { font-size:10.5px; color:#4a4740; margin-top:3px; line-height:1.4; }
  .thermal .rule { border-top:1.4px dashed #8d887c; margin:10px 0; }
  .thermal .row { display:flex; justify-content:space-between; margin:3.5px 0; gap:8px; }
  .thermal .row span:last-child { white-space:nowrap; }
  .thermal .tot { font-weight:700; font-size:14.5px; }
  .thermal .meta { font-size:10px; color:#4a4740; }
  .thermal .hand { font-family:'Bradley Hand','Comic Sans MS',cursive; }
  .card { width:480px; background:#fff; font-family:'Inter',sans-serif; color:#16181d; box-shadow:0 6px 24px rgba(0,0,0,.28); border-radius:8px; overflow:hidden; transform:rotate(var(--rot,0.3deg)); }
  .card .head { padding:20px 26px; color:#fff; display:flex; justify-content:space-between; align-items:center; }
  .card .body { padding:20px 26px 26px; }
  .card .row { display:flex; justify-content:space-between; padding:6px 0; font-size:13.5px; }
  .card .row.rule { border-top:1px solid #e3e5ea; margin-top:6px; padding-top:11px; }
  .card .muted { color:#667085; font-size:12px; }
  .card .tot { font-weight:700; font-size:15.5px; }
  .glare::after { content:""; position:absolute; inset:0; background:linear-gradient(118deg, rgba(255,255,255,.6) 0%, rgba(255,255,255,0) 34%, rgba(255,255,255,0) 62%, rgba(255,255,255,.5) 100%); pointer-events:none; }
  .faded { color:#8a877e; }
</style>`;

const rows = (items) => items.map(([n, a]) => `<div class="row"><span>${n}</span><span>${a}</span></div>`).join("");

// ---- Indian restaurant thermal bill (₹, 5% GST, optional service charge) ----
function indianResto({ name, loc, gstin, date, time, table, bill, items, sub, cgst, sgst, service, tip, total, card, footer, extraSub = "", rot = 0.4 }) {
  return `<div class="thermal" style="--rot:${rot}deg">
    <div class="c"><h1>${name}</h1><div class="sub">${loc}<br>GSTIN: ${gstin}</div></div>
    <div class="rule"></div>
    <div class="row meta"><span>${date}  ${time}</span><span>${table ? "TBL " + table : ""}</span></div>
    <div class="row meta"><span>Bill No: ${bill}</span><span></span></div>
    <div class="rule"></div>
    ${rows(items)}
    <div class="rule"></div>
    ${rows([["SUBTOTAL", "₹" + sub]].concat(cgst ? [["CGST 2.5%", "₹" + cgst], ["SGST 2.5%", "₹" + sgst]] : []).concat(service ? [["SERVICE CHARGE", "₹" + service]] : []))}
    ${extraSub}
    ${tip ? `<div class="row"><span>ADDED TIP</span><span class="hand" style="font-size:14px">+ ₹${tip}</span></div>` : ""}
    <div class="row tot"><span>TOTAL</span><span>₹${total}</span></div>
    <div class="rule"></div>
    <div class="c meta">${card}<br>${footer}</div>
  </div>`;
}

// ---- cab / auto receipt ----
function cab({ brand, sub, date, driver, from, to, fare, total, faded = false, rot = 0.4 }) {
  return `<div class="thermal ${faded ? "faded glare" : ""}" style="--rot:${rot}deg; ${faded ? "filter:blur(2.6px) contrast(.55) brightness(1.22) saturate(.6)" : ""}">
    <div class="c"><h1>${brand}</h1><div class="sub">${sub}</div></div>
    <div class="rule"></div>
    <div class="row meta"><span>${date}</span><span>${driver}</span></div>
    <div class="row meta"><span>FROM</span><span>${from}</span></div>
    <div class="row meta"><span>TO</span><span>${to}</span></div>
    <div class="rule"></div>
    ${rows(fare)}
    <div class="rule"></div>
    <div class="row tot"><span>TOTAL</span><span>${total}</span></div>
    <div class="rule"></div>
    <div class="c meta">PAID VIA UPI</div>
  </div>`;
}

// ---- SaaS invoice card ----
function saas({ brand, color, num, billed, date, line, sub, tax, total, method }) {
  return `<div class="card">
    <div class="head" style="background:${color}"><div style="font-size:19px;font-weight:700">${brand}</div><div style="opacity:.8;font-size:12px">Receipt ${num}</div></div>
    <div class="body">
      <div class="row"><span class="muted">Billed to</span><span>${billed}</span></div>
      <div class="row"><span class="muted">Date paid</span><span>${date}</span></div>
      <div class="row rule"><span>${line}</span><span>${sub}</span></div>
      <div class="row"><span class="muted">Tax</span><span>${tax}</span></div>
      <div class="row rule tot"><span>Amount paid</span><span>${total}</span></div>
      <div class="row"><span class="muted">${method}</span><span class="muted">${date}</span></div>
    </div>
  </div>`;
}

const R = {
  // ---------- clean lane ----------
  "exp-1001": indianResto({ name: "Swiggy", loc: "Order from Meghana Foods, Koramangala, Bengaluru", gstin: "29AAFCS1234R1Z5", date: "06/07/2026", time: "1:12 PM", table: "", bill: "SW-772104", items: [["Andhra Meals x4", "1,360"], ["Ragi Mudde x2", "180"], ["Filter Coffee x4", "240"]], sub: "1,780", cgst: "42.86", sgst: "42.86", total: "1,950", card: "Paid via Swiggy (UPI)", footer: "Team lunch, 4 people" }),
  "exp-1003": cab({ brand: "Ola", sub: "Mini  •  Bengaluru", date: "08/07/2026 10:22 AM", driver: "Trip 4471", from: "Indiranagar (office)", to: "UB City (client)", fare: [["Base + distance", "₹2,540"], ["GST 5%", "₹130"], ["Convenience", "₹60"]], total: "₹2,730" }),
  "exp-1005": indianResto({ name: "Third Wave Coffee", loc: "Indiranagar 100ft Rd, Bengaluru", gstin: "29AAGCT8842K1Z9", date: "07/07/2026", time: "11:05 AM", table: "9", bill: "TWC-33108", items: [["Cold Brew x3", "660"], ["Cortado x2", "360"], ["Choc Croissant x2", "160"]], sub: "1,180", cgst: "30", sgst: "30", total: "1,240", card: "HDFC **** 4471 — APPROVED", footer: "Content-sprint catch up" }),
  "exp-1002": saas({ brand: "Figma", color: "#1e1e1e", num: "FIG-2026-88213", billed: "ananya.iyer@flowco.com", date: "July 1, 2026", line: "Figma — Professional, 1 editor (monthly)", sub: "$45.00", tax: "$0.00", total: "$45.00 USD", method: "Visa •••• 8802" }),
  "exp-1004": saas({ brand: "▲ Vercel", color: "#000000", num: "VER-2026-51140", billed: "kavya.reddy@flowco.com", date: "July 2, 2026", line: "Vercel — Pro, 1 seat (monthly)", sub: "$20.00", tax: "$0.00", total: "$20.00 USD", method: "Visa •••• 3319" }),
  "exp-1017": saas({ brand: "Linear", color: "#5e6ad2", num: "LIN-2026-20447", billed: "rohan.gupta@flowco.com", date: "July 2, 2026", line: "Linear — Standard, 1 seat (monthly)", sub: "$16.00", tax: "$0.00", total: "$16.00 USD", method: "Amex •••• 2214" }),
  "exp-1021": saas({ brand: "Notion", color: "#000000", num: "NTN-2026-55210", billed: "ananya.iyer@flowco.com", date: "July 3, 2026", line: "Notion — Plus, 1 member (monthly)", sub: "$20.00", tax: "$0.00", total: "$20.00 USD", method: "Visa •••• 8802" }),
  "exp-1007": `<div class="card"><div class="head" style="background:#002244"><div style="font-size:18px;font-weight:700">United Airlines</div><div style="opacity:.8;font-size:12px">e-Receipt</div></div><div class="body">
    <div class="row"><span class="muted">Passenger</span><span>SHARMA / PRIYA</span></div>
    <div class="row"><span class="muted">Itinerary</span><span>SFO ⇄ AUS (round trip)</span></div>
    <div class="row"><span class="muted">Confirmation</span><span>K4T9QP</span></div>
    <div class="row rule"><span>Air transportation</span><span>$402.33</span></div>
    <div class="row"><span class="muted">Taxes &amp; fees</span><span>$35.67</span></div>
    <div class="row rule tot"><span>Total charged</span><span>$438.00 USD</span></div>
    <div class="row"><span class="muted">Visa •••• 6011</span><span class="muted">Jul 5, 2026</span></div></div></div>`,
  // ---------- needs review ----------
  "exp-1008": `<div class="thermal" style="--rot:-0.7deg"><div class="c"><h1>Harvest Table</h1><div class="sub">Farm-to-table • Austin, TX<br>07/08/2026  8:40 PM  TBL 5</div></div>
    <div class="rule"></div>${rows([["Wood-grilled trout", "31.00"], ["Harvest bowl", "18.00"], ["Iced tea x2", "9.00"], ["Cornbread", "6.00"]])}
    <div class="rule"></div>${rows([["SUBTOTAL", "64.00"], ["TAX 8.25%", "5.28"], ["Printed total", "76.20"]])}
    <div class="row"><span>Tip</span><span class="hand" style="font-size:15px">8.30</span></div>
    <div class="row tot"><span>TOTAL</span><span class="hand">$84.50</span></div>
    <div class="rule"></div><div class="c meta">VISA **** 6011 — APPROVED<br>Thank you</div></div>`,
  "exp-1009": indianResto({ name: "Farzi Cafe", loc: "UB City, Vittal Mallya Rd, Bengaluru", gstin: "29AAECF5521P1ZQ", date: "06/07/2026", time: "9:15 PM", table: "12", bill: "FZ-55231", items: [["Dal Chawal Arancini x2", "1,180"], ["Butter Chicken Bao x2", "1,760"], ["Galauti Kebab", "1,290"], ["Naan Basket x2", "980"], ["Fresh Lime Soda x4", "760"], ["Mango Kulfi x4", "1,200"]], sub: "16,020", cgst: "400.5", sgst: "400.5", service: "879", total: "17,700", card: "AMEX **** 1005 — APPROVED", footer: "4 guests — client closing dinner" }),
  "exp-1010": cab({ brand: "Ola", sub: "Prime Sedan  •  Bengaluru", date: "09/07/2026 7:05 AM", driver: "Trip 8841", from: "Indiranagar (office)", to: "Kempegowda Intl Airport (T2)", fare: [["Base + distance", "₹3,790"], ["Airport toll", "₹185"], ["GST 5%", "₹100"]], total: "₹4,075" }),
  "exp-1011": cab({ brand: "Ola", sub: "Prime Sedan  •  Bengaluru", date: "09/07/2026 2:20 PM", driver: "Trip 8862", from: "Kempegowda Intl Airport (T2)", to: "Indiranagar (office)", fare: [["Base + distance", "₹3,790"], ["Airport toll", "₹185"], ["GST 5%", "₹100"]], total: "₹4,075", rot: -0.6 }),
  "exp-1012": `<div class="card"><div class="head" style="background:#1c2b2a"><div style="font-size:17px;font-weight:700">The Oberoi, Bengaluru</div><div style="opacity:.85;font-size:12px">Guest Folio 5521</div></div><div class="body">
    <div class="row"><span class="muted">Guest</span><span>Ananya Iyer</span></div>
    <div class="row"><span class="muted">Stay</span><span>3 Jul – 4 Jul 2026 (1 night)</span></div>
    <div class="row rule"><span>Premier Room — 03/07</span><span>₹16,786</span></div>
    <div class="row"><span>GST 12%</span><span>₹2,014</span></div>
    <div class="row rule tot"><span>Balance (INR)</span><span>₹18,800</span></div>
    <div class="row"><span class="muted">HDFC •••• 4409</span><span class="muted">GSTIN 29AABCO...</span></div></div></div>`,
  "exp-1019": `<div class="card"><div class="head" style="background:#c8102e"><div style="font-size:18px;font-weight:700">Air India</div><div style="opacity:.85;font-size:12px">Tax Invoice</div></div><div class="body">
    <div class="row"><span class="muted">Passenger</span><span>REDDY / KAVYA</span></div>
    <div class="row"><span class="muted">Sector</span><span>BLR ⇄ SFO (round trip)</span></div>
    <div class="row"><span class="muted">PNR</span><span>QH7T2K</span></div>
    <div class="row rule"><span>Base fare</span><span>₹86,400</span></div>
    <div class="row"><span class="muted">Taxes, fees &amp; surcharge</span><span>₹11,900</span></div>
    <div class="row rule tot"><span>Total (INR)</span><span>₹98,300</span></div>
    <div class="row"><span class="muted">HDFC Credit •••• 4471</span><span class="muted">GSTIN 27AACCA...</span></div></div></div>`,
  "exp-1020": `<div class="card"><div class="head" style="background:#0f4c81"><div style="font-size:18px;font-weight:700">SaaSBOOMi Annual 2026</div><div style="opacity:.85;font-size:12px">Delegate Pass</div></div><div class="body">
    <div class="row"><span class="muted">Attendee</span><span>Rohan Gupta, FlowCo</span></div>
    <div class="row"><span class="muted">Event</span><span>SaaSBOOMi Annual, Bengaluru</span></div>
    <div class="row rule"><span>Full conference pass</span><span>₹57,672</span></div>
    <div class="row"><span class="muted">Early-bird discount</span><span>−₹5,000</span></div>
    <div class="row"><span>GST 18%</span><span>₹9,481</span></div>
    <div class="row rule tot"><span>Total (INR)</span><span>₹56,700</span></div>
    <div class="row"><span class="muted">Razorpay • UPI</span><span class="muted">Jul 1, 2026</span></div></div></div>`,
  "exp-1023": indianResto({ name: "AB's - Absolute Barbecues", loc: "Marathahalli, Bengaluru", gstin: "29AAFCA7781L1ZP", date: "06/07/2026", time: "8:30 PM", table: "22", bill: "ABS-88120", items: [["Non-Veg Buffet x3", "4,497"], ["Veg Buffet x1", "1,199"], ["Live Grill add-on x4", "2,196"], ["Mocktails x4", "1,000"], ["Kulfi Falooda x4", "796"]], sub: "13,957", cgst: "349", sgst: "349", service: "765", total: "15,420", card: "AMEX **** 1005 — APPROVED", footer: "Client dinner, filed under travel" }),
  "exp-1024": `<div class="card"><div class="head" style="background:#0b3d2e"><div style="font-size:17px;font-weight:700">ITC Gardenia</div><div style="opacity:.85;font-size:12px">Bengaluru • Guest Folio 4471</div></div><div class="body">
    <div class="row"><span class="muted">Guest</span><span>Kavya Reddy</span></div>
    <div class="row"><span class="muted">Stay</span><span>6 Jul – 7 Jul 2026 (1 night)</span></div>
    <div class="row rule"><span>Executive Room — 06/07</span><span>₹12,800</span></div>
    <div class="row"><span>In-room movie — pay-per-view</span><span>₹1,583</span></div>
    <div class="row"><span>GST 12% (room)</span><span>₹1,536</span></div>
    <div class="row"><span>Round off</span><span>₹15</span></div>
    <div class="row rule tot"><span>Balance (INR)</span><span>₹17,833</span></div>
    <div class="row"><span class="muted">HDFC •••• 4471</span><span class="muted">GSTIN 29AABC...</span></div></div></div>`,
  "exp-1026": cab({ brand: "Namma Yatri", sub: "Auto  •  Bengaluru", date: "07/07/2026 23:41", driver: "Auto 4471", from: "Indiranagar", to: "Kempegowda Airport", fare: [["Fare", "₹2,4?0"], ["Night 1.5x", "₹3??"], ["Toll", "₹1??"]], total: "₹2,8?5", faded: true, rot: -2.4 }),
  "exp-1027": indianResto({ name: "Barbeque Nation", loc: "Indiranagar, Bengaluru", gstin: "29AADCB2291M1ZR", date: "08/07/2026", time: "8:14 PM", table: "12", bill: "BN-1 OF 2", items: [["Buffet Non-Veg x4", "5,196"], ["Starters add-on", "1,304"], ["Soft drinks x2", "400"]], sub: "6,900", cgst: "172.50", sgst: "172.50", service: "585", total: "7,830", card: "AMEX **** 2214 — SPLIT CHECK", footer: "Table 12 — check 1 of 2" }),
  "exp-1028": indianResto({ name: "Barbeque Nation", loc: "Indiranagar, Bengaluru", gstin: "29AADCB2291M1ZR", date: "08/07/2026", time: "8:19 PM", table: "12", bill: "BN-2 OF 2", items: [["Buffet Non-Veg x4", "5,196"], ["Grilled Prawns add-on", "766"], ["Kulfi x2", "398"], ["Soft drinks x2", "400"]], sub: "6,760", cgst: "169", sgst: "169", service: "562", total: "7,660", card: "AMEX **** 2214 — SPLIT CHECK", footer: "Table 12 — check 2 of 2", rot: -1.1 }),
  "exp-1029": `<div class="card"><div class="head" style="background:#14243b"><div style="font-size:17px;font-weight:700">Hotel G Singapore</div><div style="opacity:.85;font-size:12px">Booking HG-88431</div></div><div class="body">
    <div class="row"><span class="muted">Guest</span><span>Arjun Nair</span></div>
    <div class="row"><span class="muted">Stay</span><span>9 Jul – 10 Jul 2026 (1 night)</span></div>
    <div class="row rule"><span>Good Room — 1 night</span><span>S$206.42</span></div>
    <div class="row"><span>GST 9%</span><span>S$18.58</span></div>
    <div class="row rule tot"><span>Total charged</span><span>S$225.00 SGD</span></div>
    <div class="row"><span class="muted">Visa •••• 5190</span><span class="muted">Amount in SGD</span></div></div></div>`,
  "exp-1030": indianResto({ name: "Truffles Cafe", loc: "St Marks Rd, Bengaluru", gstin: "29AAECT7789J1ZX", date: "02/07/2026", time: "12:38 PM", table: "7", bill: "TRF-40118", items: [["All-American Burger x2", "1,780"], ["Garlic Bread Supreme", "940"], ["Virgin Mojito x2", "700"], ["Loaded Nachos", "580"], ["Masala Chai x2", "240"], ["Brownie Sundae x2", "760"]], sub: "5,000", cgst: "125", sgst: "125", service: "420", total: "5,670", card: "VISA **** 4417 — APPROVED 02/07/2026", footer: "Client lunch" }),
  "exp-1031": indianResto({ name: "The Fatty Bao", loc: "Indiranagar, Bengaluru", gstin: "29AAECF3312H1ZK", date: "05/07/2026", time: "7:52 PM", table: "party of 4", bill: "FB-77120", items: [["Bao Basket x3", "2,010"], ["Ramen x2", "1,180"], ["Asian Greens", "540"], ["Edamame", "155"], ["Non-alc Sake Cooler x2", "760"]], sub: "4,645", cgst: "116", sgst: "116", service: "836", tip: "986", total: "6,700", card: "MC **** 3301 — APPROVED", footer: "18% service charge already included", extraSub: `<div class="row meta"><span>(18% service charge included above)</span><span></span></div>` }),
  "exp-1038": `<div class="thermal" style="--rot:0.5deg"><div class="c"><h1>Newton Food Centre</h1><div class="sub">Stall 31, Newton Circus, Singapore<br>30/06/2026  8:10 PM</div></div>
    <div class="rule"></div>${rows([["BBQ Stingray", "S$18.00"], ["Char Kway Teow", "S$8.00"], ["Satay x10", "S$12.00"], ["Sugarcane Juice x2", "S$6.00"], ["Chilli Crab (small)", "S$18.00"]])}
    <div class="rule"></div>${rows([["SUBTOTAL", "S$62.00"], ["GST incl.", "—"]])}
    <div class="row tot"><span>TOTAL</span><span>S$62.00</span></div>
    <div class="rule"></div><div class="c meta">PAID — DBS PayLah!<br>Terima Kasih</div></div>`,
};

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 680, height: 1000 }, deviceScaleFactor: 2 });
for (const [id, html] of Object.entries(R)) {
  await page.setContent(`<!doctype html><html><head>${css}</head><body>${html}</body></html>`, { waitUntil: "networkidle" });
  const el = page.locator(".card, .thermal").first();
  const box = await el.boundingBox();
  const pad = 26;
  await page.screenshot({
    path: path.join(outDir, `${id}.png`),
    clip: { x: Math.max(0, box.x - pad), y: Math.max(0, box.y - pad), width: box.width + pad * 2, height: box.height + pad * 2 },
  });
  console.log(`wrote ${id}.png`);
}
await browser.close();
console.log("done —", Object.keys(R).length, "receipts");
