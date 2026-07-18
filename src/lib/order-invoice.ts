/**
 * Printable Invoice / Packing Slip generator for FoundOurMarket admin.
 *
 * Pure presentation: builds a self-contained, print-optimized A4 HTML document
 * and opens it in a new window with the print dialog. No business logic, no
 * data fetching, no schema changes — it only reads order data already loaded
 * in the admin Order Details view.
 */

export type InvoiceItem = {
  name: string | null;
  quantity: number;
  unit_price: number;
  line_total: number;
  variant_name?: string | null;
  variant_size?: string | null;
  variant_color?: string | null;
  variant_sku?: string | null;
};

export type InvoiceData = {
  orderId: string;
  createdAt: string;
  currency?: string | null;
  total: number;
  customerName?: string | null;
  customerEmail?: string | null;
  customerPhone?: string | null;
  paymentMethod?: string | null;
  paymentStatus?: string | null;
  recipient?: string | null;
  recipientPhone?: string | null;
  addressLines: string[];
  city?: string | null;
  state?: string | null;
  country?: string | null;
  pin?: string | null;
  items: InvoiceItem[];
};

const esc = (s: unknown) =>
  String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

function money(n: number | null | undefined, cur: string) {
  const v = Number(n ?? 0);
  if (cur === "INR") return `₹${v.toLocaleString("en-IN", { maximumFractionDigits: 2 })}`;
  return `${cur} ${v.toFixed(2)}`;
}

/** Readable invoice number e.g. FOM-2026-0A3F9C (year + short order ref). */
export function invoiceNumber(orderId: string, createdAt: string): string {
  const year = new Date(createdAt || Date.now()).getFullYear();
  const ref = orderId.replace(/[^a-zA-Z0-9]/g, "").slice(-6).toUpperCase().padStart(6, "0");
  return `FOM-${year}-${ref}`;
}

const isCod = (d: InvoiceData) =>
  (d.paymentMethod ?? "").toLowerCase().includes("cod") ||
  (d.paymentStatus ?? "").toLowerCase().includes("cod") ||
  (d.paymentMethod ?? "").toLowerCase().includes("cash");

export function buildInvoiceHTML(d: InvoiceData): string {
  const cur = d.currency ?? "INR";
  const invNo = invoiceNumber(d.orderId, d.createdAt);
  const orderDate = new Date(d.createdAt || Date.now()).toLocaleString("en-IN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
  const cod = isCod(d);
  const cashAmount = money(d.total, cur);
  const shortId = d.orderId.replace(/-/g, "").slice(0, 8);
  const trackingUrl = `https://foundourmarket.com/track?order=${encodeURIComponent(shortId)}`;
  const qrSrc = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&margin=0&data=${encodeURIComponent(
    trackingUrl,
  )}`;

  const rows = d.items
    .map(
      (it) => {
        const options = [it.variant_color, it.variant_size].filter(Boolean).join(" / ") || it.variant_name || "";
        const detail = [options, it.variant_sku ? `SKU: ${it.variant_sku}` : ""].filter(Boolean).join(" · ");
        return `
      <tr>
        <td class="prod">${esc(it.name)}${detail ? `<br/><span style="font-size:11px;color:#666">${esc(detail)}</span>` : ""}</td>
        <td class="num">${esc(it.quantity)}</td>
        <td class="num">${money(it.unit_price, cur)}</td>
        <td class="num">${money(it.line_total, cur)}</td>
      </tr>`;
      },
    )
    .join("");

  const addr = d.addressLines.filter(Boolean).map((l) => esc(l)).join("<br/>");

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>${esc(invNo)} · FoundOurMarket</title>
<style>
  * { box-sizing: border-box; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { margin: 0; padding: 0; background: #f4f4f5; color: #111; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif; }
  .sheet { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 16mm 14mm; }
  .toolbar { max-width: 210mm; margin: 12px auto 0; display: flex; gap: 8px; justify-content: flex-end; }
  .toolbar button { font: inherit; font-size: 13px; padding: 8px 16px; border-radius: 8px; border: 1px solid #d4d4d8; background: #111; color: #fff; cursor: pointer; }
  .toolbar button.ghost { background: #fff; color: #111; }
  h1,h2,h3,p { margin: 0; }
  .head { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #111; padding-bottom: 14px; }
  .brand { font-size: 24px; font-weight: 800; letter-spacing: -0.5px; }
  .brand small { display: block; font-size: 11px; font-weight: 500; color: #666; letter-spacing: 0.4px; margin-top: 2px; }
  .doc { text-align: right; }
  .doc .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; }
  .doc .inv { font-size: 16px; font-weight: 700; }
  .doc .meta { font-size: 12px; color: #444; margin-top: 4px; line-height: 1.5; }
  .grid { display: flex; gap: 18px; margin-top: 20px; }
  .grid .col { flex: 1; }
  .card { border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px; }
  .card h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }
  .card .line { font-size: 13px; line-height: 1.6; color: #222; }
  .card .name { font-size: 15px; font-weight: 700; }
  .qrbox { text-align: center; }
  .qrbox img { width: 96px; height: 96px; }
  .qrbox span { display: block; font-size: 10px; color: #888; margin-top: 4px; }
  table { width: 100%; border-collapse: collapse; margin-top: 22px; }
  thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; text-align: left; padding: 8px 10px; border-bottom: 2px solid #111; }
  thead th.num { text-align: right; }
  tbody td { font-size: 13px; padding: 10px; border-bottom: 1px solid #ececec; vertical-align: top; }
  td.num { text-align: right; white-space: nowrap; }
  td.prod { font-weight: 500; }
  .totals { display: flex; justify-content: flex-end; margin-top: 14px; }
  .totals .box { width: 260px; }
  .totals .row { display: flex; justify-content: space-between; font-size: 13px; padding: 6px 0; }
  .totals .grand { font-size: 18px; font-weight: 800; border-top: 2px solid #111; margin-top: 6px; padding-top: 10px; }
  .cashbar { margin-top: 16px; border: 2px dashed #111; border-radius: 10px; padding: 12px 16px; display: flex; justify-content: space-between; align-items: center; }
  .cashbar .k { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #555; }
  .cashbar .v { font-size: 22px; font-weight: 800; }
  .checklist { margin-top: 24px; border: 1px solid #e4e4e7; border-radius: 10px; padding: 14px; }
  .checklist h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 10px; }
  .checklist ul { list-style: none; margin: 0; padding: 0; display: flex; flex-wrap: wrap; gap: 10px 28px; }
  .checklist li { font-size: 13px; display: flex; align-items: center; gap: 8px; }
  .checklist .box { width: 16px; height: 16px; border: 1.5px solid #333; border-radius: 3px; display: inline-block; }
  .foot { margin-top: 28px; border-top: 1px solid #e4e4e7; padding-top: 14px; font-size: 11px; color: #666; line-height: 1.6; display: flex; justify-content: space-between; gap: 16px; }
  .foot .ret { font-weight: 600; color: #444; }

  /* ---- Packing slip (page 2) ---- */
  .slip { width: 210mm; min-height: 297mm; margin: 12px auto; background: #fff; padding: 24mm 18mm; text-align: center; page-break-before: always; }
  .slip .top { font-size: 14px; letter-spacing: 4px; font-weight: 700; }
  .slip .ps { font-size: 40px; font-weight: 900; letter-spacing: 2px; margin: 6px 0 30px; }
  .slip .big-label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-top: 26px; }
  .slip .big-val { font-size: 34px; font-weight: 800; margin-top: 4px; word-break: break-word; }
  .slip .cash { font-size: 46px; font-weight: 900; margin-top: 4px; }
  .slip .qr { margin-top: 34px; }
  .slip .qr img { width: 150px; height: 150px; }

  @media print {
    html, body { background: #fff; }
    .toolbar { display: none !important; }
    .sheet, .slip { margin: 0; box-shadow: none; }
  }
  @page { size: A4; margin: 0; }
</style>
</head>
<body>
  <div class="toolbar">
    <button onclick="window.print()">Print / Save PDF</button>
    <button class="ghost" onclick="window.close()">Close</button>
  </div>

  <!-- ===== INVOICE ===== -->
  <section class="sheet">
    <div class="head">
      <div>
        <div class="brand">FoundOurMarket<small>Everything You Need — All in One Place 🌍</small></div>
      </div>
      <div class="doc">
        <div class="label">Tax Invoice</div>
        <div class="inv">${esc(invNo)}</div>
        <div class="meta">Order ID: ${esc(d.orderId)}<br/>Order Date: ${esc(orderDate)}</div>
      </div>
    </div>

    <div class="grid">
      <div class="col card">
        <h3>Billed To</h3>
        <div class="line name">${esc(d.customerName ?? "—")}</div>
        <div class="line">${esc(d.customerPhone ?? "—")}</div>
        <div class="line">${esc(d.customerEmail ?? "—")}</div>
      </div>
      <div class="col card">
        <h3>Ship To</h3>
        <div class="line name">${esc(d.recipient ?? d.customerName ?? "—")}</div>
        ${d.recipientPhone ? `<div class="line">${esc(d.recipientPhone)}</div>` : ""}
        <div class="line">${addr || "—"}</div>
        <div class="line">${[d.city, d.state, d.country].filter(Boolean).map(esc).join(", ")}${
          d.pin ? ` — ${esc(d.pin)}` : ""
        }</div>
      </div>
      <div class="col card qrbox">
        <h3>Scan</h3>
        <img src="${qrSrc}" alt="Order QR" />
        <span>Order reference</span>
      </div>
    </div>

    <table>
      <thead>
        <tr>
          <th>Product</th>
          <th class="num">Qty</th>
          <th class="num">Price</th>
          <th class="num">Total</th>
        </tr>
      </thead>
      <tbody>${rows || `<tr><td colspan="4">No items</td></tr>`}</tbody>
    </table>

    <div class="totals">
      <div class="box">
        <div class="row"><span>Payment Method</span><span>${esc(d.paymentMethod ?? "—")}</span></div>
        <div class="row"><span>Payment Status</span><span>${esc(d.paymentStatus ?? "—")}</span></div>
        <div class="row grand"><span>${cod ? "Cash (COD)" : "Total Paid"}</span><span>${cashAmount}</span></div>
      </div>
    </div>

    <div class="cashbar">
      <span class="k">${cod ? "Collect Cash" : "Paid"}</span>
      <span class="v">${cashAmount}</span>
    </div>

    <div class="checklist">
      <h3>Packing Checklist</h3>
      <ul>
        <li><span class="box"></span> Product checked</li>
        <li><span class="box"></span> Quantity verified</li>
        <li><span class="box"></span> Package sealed</li>
        <li><span class="box"></span> Ready for shipping</li>
      </ul>
    </div>

    <div class="foot">
      <div>
        <strong>FoundOurMarket&#8482;</strong><br/>
        Support: support@foundourmarket.com
      </div>
      <div class="ret">Return requests must follow FoundOurMarket&#8482; return policy.</div>
    </div>
  </section>

  <!-- ===== PACKING SLIP ===== -->
  <section class="slip">
    <div class="top">FoundOurMarket&#8482;</div>
    <div class="ps">PACKING SLIP</div>

    <div class="big-label">Customer</div>
    <div class="big-val">${esc(d.recipient ?? d.customerName ?? "—")}</div>

    <div class="big-label">Cash</div>
    <div class="cash">${cashAmount}</div>

    <div class="big-label">Order ID</div>
    <div class="big-val">${esc(d.orderId)}</div>

    <div class="qr">
      <img src="${qrSrc}" alt="Order QR" />
    </div>
  </section>
</body>
</html>`;
}

/** Opens the printable invoice in a new window. */
export function openInvoice(data: InvoiceData) {
  const html = buildInvoiceHTML(data);
  const w = window.open("", "_blank", "noopener,noreferrer,width=900,height=1000");
  if (!w) {
    // Popup blocked — fall back to a downloadable HTML file.
    const blob = new Blob([html], { type: "text/html" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${invoiceNumber(data.orderId, data.createdAt)}.html`;
    a.click();
    URL.revokeObjectURL(url);
    return;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
}
