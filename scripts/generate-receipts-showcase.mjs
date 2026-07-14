// Showcase receipts: true double-submission (Notion), a meal mis-filed as
// travel (steakhouse), a personal item on a hotel folio (in-room movie), and a
// real PDF invoice (Canva) to exercise "Photo or PDF upload".
// Run: node scripts/generate-receipts-showcase.mjs
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
    body { background:#b8b2a8; display:flex; align-items:center; justify-content:center; padding:28px; min-height:100vh; }
    .thermal { width:340px; background:#fdfcf7; padding:26px 24px 34px; font-family:'IBM Plex Mono',monospace; font-size:13px; color:#1c1b18; box-shadow:0 6px 24px rgba(0,0,0,.35); transform:rotate(var(--rot,0.5deg)); }
    .thermal .center { text-align:center; }
    .thermal h1 { font-size:17px; font-weight:700; letter-spacing:1px; text-transform:uppercase; }
    .thermal .sub { font-size:11px; color:#4a4740; margin-top:3px; }
    .thermal .rule { border-top:1.5px dashed #8d887c; margin:12px 0; }
    .thermal .row { display:flex; justify-content:space-between; margin:4px 0; }
    .thermal .total-row { font-weight:700; font-size:15px; }
    .thermal .meta { font-size:11px; color:#4a4740; }
    .card { width:480px; background:#fff; font-family:'Inter',sans-serif; color:#16181d; box-shadow:0 6px 24px rgba(0,0,0,.28); border-radius:6px; overflow:hidden; transform:rotate(var(--rot,0.4deg)); }
    .card .head { padding:22px 28px; color:#fff; }
    .card .body { padding:22px 28px 28px; }
    .card .row { display:flex; justify-content:space-between; padding:7px 0; font-size:14px; }
    .card .row.rule { border-top:1px solid #e3e5ea; margin-top:6px; padding-top:12px; }
    .card .muted { color:#667085; font-size:12.5px; }
    .card .total { font-weight:700; font-size:16px; }
  </style>`;

function tItems(items) {
  return items.map(([n, a]) => `<div class="row"><span>${n}</span><span>${a}</span></div>`).join("");
}

const pngReceipts = [
  {
    // shared by EXP-1021 and EXP-1022 — same invoice number = double-submission
    id: "exp-1021",
    html: `<div class="card">
      <div class="head" style="background:#000"><div style="font-size:20px;font-weight:700">Notion</div><div style="opacity:.75;font-size:13px;margin-top:4px">Receipt #NTN-2026-55210</div></div>
      <div class="body">
        <div class="row"><span class="muted">Billed to</span><span>ananya.iyer@flowco.com</span></div>
        <div class="row"><span class="muted">Date paid</span><span>July 3, 2026</span></div>
        <div class="row rule"><span>Notion — Plus, 1 member (monthly)</span><span>$20.00</span></div>
        <div class="row"><span class="muted">Tax</span><span>$0.00</span></div>
        <div class="row rule total"><span>Amount paid</span><span>$20.00 USD</span></div>
        <div class="row"><span class="muted">Visa •••• 8802</span><span class="muted">07/03/2026</span></div>
      </div>
    </div>`,
  },
  {
    // steakhouse dinner — clearly a MEAL, filed as "travel"
    id: "exp-1023",
    html: `<div class="thermal" style="--rot:-0.9deg; width:360px">
      <div class="center"><h1>Fogo de Chão</h1><div class="sub">Brazilian Steakhouse — Denver<br>07/06/2026 8:12 PM &nbsp; TBL 9 &nbsp; GUESTS: 3</div></div>
      <div class="rule"></div>
      ${tItems([["FULL CHURRASCO x3", "119.85"], ["PÃO DE QUEIJO", "9.00"], ["SPARKLING WATER x3", "18.00"], ["ESPRESSO x2", "9.00"]])}
      <div class="rule"></div>
      ${tItems([["SUBTOTAL", "155.85"], ["TAX 8.6%", "13.40"], ["TIP (10%)", "15.75"]])}
      <div class="row total-row"><span>TOTAL</span><span>$185.00</span></div>
      <div class="rule"></div>
      <div class="center meta">AMEX **** 1005 — APPROVED<br>THANK YOU FOR DINING WITH US</div>
    </div>`,
  },
  {
    // hotel folio with a PERSONAL in-room movie line
    id: "exp-1024",
    html: `<div class="card">
      <div class="head" style="background:#7a1f2b"><div style="font-size:19px;font-weight:700">Marriott — Denver City Center</div><div style="opacity:.85;font-size:13px;margin-top:4px">Guest Folio — Conf #M2261184</div></div>
      <div class="body">
        <div class="row"><span class="muted">Guest</span><span>Kavya Reddy</span></div>
        <div class="row"><span class="muted">Stay</span><span>Jul 6 – Jul 7, 2026 (1 night)</span></div>
        <div class="row rule"><span>Room 1408 — King, 07/06</span><span>$178.00</span></div>
        <div class="row"><span>In-Room Movie — "Dune: Part Three"</span><span>$18.99</span></div>
        <div class="row"><span>State &amp; occupancy tax</span><span>$17.01</span></div>
        <div class="row rule total"><span>Balance charged</span><span>$214.00</span></div>
        <div class="row"><span class="muted">MC •••• 7742</span><span class="muted">07/07/2026</span></div>
      </div>
    </div>`,
  },
];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 640, height: 820 }, deviceScaleFactor: 2 });
for (const r of pngReceipts) {
  await page.setContent(`<!doctype html><html><head>${baseCss}</head><body>${r.html}</body></html>`, { waitUntil: "networkidle" });
  await page.locator(".card, .thermal").first().screenshot({ path: path.join(outDir, `${r.id}.png`) });
  console.log(`wrote ${r.id}.png`);
}

// ---- exp-1025.pdf — a real PDF invoice (Canva) ----
const invoiceHtml = `<!doctype html><html><head>
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
  * { margin:0; padding:0; box-sizing:border-box; }
  body { font-family:'Inter',sans-serif; color:#16181d; padding:56px 60px; }
  .brand { font-size:26px; font-weight:700; color:#00c4cc; }
  .muted { color:#667085; }
  h2 { font-size:13px; letter-spacing:.08em; text-transform:uppercase; color:#8a93a0; margin-bottom:8px; }
  .grid { display:flex; justify-content:space-between; margin:28px 0; font-size:14px; }
  table { width:100%; border-collapse:collapse; margin-top:12px; font-size:14px; }
  th, td { text-align:left; padding:12px 0; border-bottom:1px solid #e3e5ea; }
  th { font-size:12px; letter-spacing:.05em; text-transform:uppercase; color:#8a93a0; }
  td.r, th.r { text-align:right; }
  .totals { margin-top:20px; margin-left:auto; width:260px; font-size:14px; }
  .totals .row { display:flex; justify-content:space-between; padding:6px 0; }
  .totals .grand { font-weight:700; font-size:17px; border-top:2px solid #16181d; padding-top:10px; margin-top:6px; }
  .foot { margin-top:48px; font-size:12px; color:#8a93a0; }
</style></head><body>
  <div style="display:flex; justify-content:space-between; align-items:flex-start">
    <div class="brand">Canva</div>
    <div style="text-align:right"><div style="font-size:20px;font-weight:700">Invoice</div><div class="muted">CANVA-INV-2026-40881</div></div>
  </div>
  <div class="grid">
    <div><h2>Billed to</h2>Rohan Gupta<br><span class="muted">rohan.gupta@flowco.com</span><br><span class="muted">FlowCo, Inc.</span></div>
    <div style="text-align:right"><h2>Invoice details</h2>Issued: July 4, 2026<br><span class="muted">Paid: July 4, 2026</span><br><span class="muted">Method: Amex •••• 2214</span></div>
  </div>
  <table>
    <thead><tr><th>Description</th><th class="r">Qty</th><th class="r">Amount</th></tr></thead>
    <tbody>
      <tr><td>Canva for Teams — annual plan<br><span class="muted">Brand kit, templates, and approvals for the marketing team</span></td><td class="r">1</td><td class="r">$120.00</td></tr>
    </tbody>
  </table>
  <div class="totals">
    <div class="row"><span class="muted">Subtotal</span><span>$120.00</span></div>
    <div class="row"><span class="muted">Tax</span><span>$0.00</span></div>
    <div class="row grand"><span>Total paid</span><span>$120.00 USD</span></div>
  </div>
  <div class="foot">Thank you for your business. This invoice was paid in full on July 4, 2026.</div>
</body></html>`;
await page.setContent(invoiceHtml, { waitUntil: "networkidle" });
await page.pdf({ path: path.join(outDir, "exp-1025.pdf"), format: "A4", printBackground: true });
console.log("wrote exp-1025.pdf");

await browser.close();
console.log("done");
