/**
 * Shipment export & packing engine for the FoundOurMarket admin
 * Shipment Command Center.
 *
 * Produces:
 *  - Branded Packing Slip PDF (logo, order, customer, address, line items with
 *    SKU + qty, courier info, packing notes, QR code, date)
 *  - Shipment Details PDF (single or bulk summary table)
 *  - Shipment exports in CSV and Excel (SpreadsheetML .xls — dependency-free,
 *    opens natively in Excel / Google Sheets / Numbers)
 *
 * Pure presentation + client-side file generation. No schema changes.
 */
import jsPDF from "jspdf";
import QRCode from "qrcode";
import { supabase } from "@/integrations/supabase/client";
import { courierLabel, buildTrackingUrl } from "@/lib/courier";

const BRAND = "FoundOurMarket™";
const TAGLINE = "Whatever you need. All in one place.";

const accent: [number, number, number] = [234, 88, 12];
const ink: [number, number, number] = [17, 17, 20];
const muted: [number, number, number] = [120, 120, 130];

export type PackAddress = {
  full_name?: string; name?: string; phone?: string; line1?: string; line2?: string;
  city?: string; state?: string; region?: string; postal?: string; postal_code?: string; country?: string;
} | null;

export type PackItem = { name: string; quantity: number; sku: string; product_slug: string | null };

export type PackingData = {
  orderId: string;
  createdAt: string;
  currency: string | null;
  total: number;
  contactEmail: string | null;
  address: PackAddress;
  items: PackItem[];
  carrier: string | null;
  trackingNumber: string | null;
  trackingUrl: string | null;
  estimatedDelivery: string | null;
  status: string | null;
  notes: string | null;
};

const fmtAddr = (a: PackAddress): string[] => {
  if (!a) return ["—"];
  return [
    a.full_name || a.name || "",
    a.line1 || "",
    a.line2 || "",
    [a.city, a.state || a.region, a.postal || a.postal_code].filter(Boolean).join(", "),
    a.country || "",
  ].filter(Boolean);
};

const money = (currency: string | null, v: number) => {
  const n = Number(v) || 0;
  return (currency?.toUpperCase() === "USD" ? "$" : "Rs. ") + Math.round(n).toLocaleString(currency === "USD" ? "en-US" : "en-IN");
};

const shortId = (id: string) => id.slice(0, 8).toUpperCase();

/**
 * Load everything a packing slip needs for one order: line items with resolved
 * SKUs plus the latest shipment row (courier + tracking).
 */
export async function fetchPackingData(orderId: string): Promise<PackingData | null> {
  const [{ data: order }, { data: ship }] = await Promise.all([
    supabase
      .from("orders")
      .select("id,created_at,currency,total,contact_email,carrier,tracking_number,shipping_address,fulfillment_status,order_items(name,quantity,product_slug)")
      .eq("id", orderId)
      .maybeSingle(),
    supabase
      .from("shipments")
      .select("carrier,tracking_number,tracking_url,estimated_delivery,status,notes")
      .eq("order_id", orderId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
  ]);
  if (!order) return null;

  const o = order as {
    id: string; created_at: string; currency: string | null; total: number;
    contact_email: string | null; carrier: string | null; tracking_number: string | null;
    shipping_address: PackAddress; fulfillment_status: string | null;
    order_items: { name: string; quantity: number; product_slug: string | null }[];
  };
  const s = ship as {
    carrier: string | null; tracking_number: string | null; tracking_url: string | null;
    estimated_delivery: string | null; status: string | null; notes: string | null;
  } | null;

  const slugs = [...new Set((o.order_items ?? []).map((i) => i.product_slug).filter(Boolean) as string[])];
  const skuBySlug = new Map<string, string>();
  if (slugs.length) {
    const { data: prods } = await supabase.from("products").select("slug,sku").in("slug", slugs);
    for (const p of (prods as { slug: string; sku: string | null }[]) ?? []) {
      if (p.sku) skuBySlug.set(p.slug, p.sku);
    }
  }

  return {
    orderId: o.id,
    createdAt: o.created_at,
    currency: o.currency,
    total: o.total,
    contactEmail: o.contact_email,
    address: o.shipping_address,
    items: (o.order_items ?? []).map((i) => ({
      name: i.name,
      quantity: i.quantity,
      product_slug: i.product_slug,
      sku: (i.product_slug && skuBySlug.get(i.product_slug)) || i.product_slug || "—",
    })),
    carrier: s?.carrier ?? o.carrier,
    trackingNumber: s?.tracking_number ?? o.tracking_number,
    trackingUrl: s?.tracking_url ?? null,
    estimatedDelivery: s?.estimated_delivery ?? null,
    status: s?.status ?? o.fulfillment_status,
    notes: s?.notes ?? null,
  };
}

/** Build & download a branded Packing Slip PDF for one order. */
export async function generatePackingSlipPdf(d: PackingData) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 56;

  // QR encodes the public tracking URL when available, else the order id.
  const qrPayload =
    buildTrackingUrl({ carrier: d.carrier, trackingNumber: d.trackingNumber, trackingUrl: d.trackingUrl }) ||
    `FOM-ORDER:${d.orderId}`;
  let qrDataUrl = "";
  try {
    qrDataUrl = await QRCode.toDataURL(qrPayload, { margin: 0, width: 220, errorCorrectionLevel: "M" });
  } catch {
    /* QR is best-effort */
  }

  // Header
  doc.setFont("helvetica", "bold"); doc.setFontSize(20); doc.setTextColor(...ink);
  doc.text(BRAND, M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text(TAGLINE, M, y + 16);

  doc.setFont("helvetica", "bold"); doc.setFontSize(22); doc.setTextColor(...accent);
  doc.text("PACKING SLIP", W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text(`Order #${shortId(d.orderId)}`, W - M, y + 16, { align: "right" });
  doc.text(new Date(d.createdAt).toLocaleString(), W - M, y + 30, { align: "right" });

  y += 56;
  doc.setDrawColor(...accent); doc.setLineWidth(2); doc.line(M, y, W - M, y);
  y += 26;

  // Ship-to + QR
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("SHIP TO", M, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
  let ay = y + 16;
  for (const line of fmtAddr(d.address)) { doc.text(line, M, ay); ay += 14; }
  if (d.address?.phone) { doc.text(`Phone: ${d.address.phone}`, M, ay); ay += 14; }
  if (d.contactEmail) { doc.text(d.contactEmail, M, ay); ay += 14; }

  if (qrDataUrl) {
    doc.addImage(qrDataUrl, "PNG", W - M - 96, y - 4, 96, 96);
    doc.setFontSize(7); doc.setTextColor(...muted);
    doc.text("Scan to track", W - M - 48, y + 102, { align: "center" });
  }

  // Courier / tracking meta
  let py = y + 16;
  const metaX = W / 2 + 30;
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("SHIPMENT", metaX, y);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
  const meta = [
    `Courier: ${courierLabel(d.carrier) ?? "Unassigned"}`,
    `Tracking: ${d.trackingNumber ?? "—"}`,
    `Status: ${(d.status ?? "pending").replace(/_/g, " ")}`,
    d.estimatedDelivery ? `ETA: ${new Date(d.estimatedDelivery).toLocaleDateString()}` : null,
  ].filter(Boolean) as string[];
  for (const line of meta) { doc.text(line, metaX, py); py += 14; }

  y = Math.max(ay, py, qrDataUrl ? y + 110 : 0) + 14;

  // Items table
  const colSku = M + 8;
  const colQty = W - M - 8;
  doc.setFillColor(245, 245, 247); doc.rect(M, y - 12, W - M * 2, 22, "F");
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("PRODUCT", M + 8, y + 3);
  doc.text("SKU", W - M - 150, y + 3);
  doc.text("QTY", colQty, y + 3, { align: "right" });
  y += 26;

  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
  let totalUnits = 0;
  for (const it of d.items) {
    totalUnits += it.quantity || 0;
    const nameLines = doc.splitTextToSize(it.name, W - M - 150 - colSku - 8);
    doc.text(nameLines, colSku, y);
    doc.setFontSize(8); doc.setTextColor(...muted);
    doc.text(doc.splitTextToSize(it.sku, 130), W - M - 150, y);
    doc.setFontSize(10); doc.setTextColor(...ink);
    doc.text(String(it.quantity), colQty, y, { align: "right" });
    y += Math.max(16, nameLines.length * 13 + 4);
    doc.setDrawColor(235, 235, 238); doc.setLineWidth(0.5); doc.line(M, y - 8, W - M, y - 8);
    if (y > doc.internal.pageSize.getHeight() - 120) { doc.addPage(); y = 56; }
  }

  y += 8;
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...ink);
  doc.text(`Total units: ${totalUnits}`, W - M, y, { align: "right" });
  y += 24;

  // Packing notes
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("PACKING NOTES", M, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(...ink);
  const notes = d.notes?.trim() || "Handle with care. Verify item count & SKUs before sealing the package.";
  for (const line of doc.splitTextToSize(notes, W - M * 2)) { doc.text(line, M, y); y += 14; }

  // Footer
  const fy = doc.internal.pageSize.getHeight() - 40;
  doc.setDrawColor(235, 235, 238); doc.setLineWidth(0.5); doc.line(M, fy - 14, W - M, fy - 14);
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted);
  doc.text(`${BRAND} · Packing slip generated ${new Date().toLocaleString()}`, M, fy);

  doc.save(`FoundOurMarket-PackingSlip-${shortId(d.orderId)}.pdf`);
}

/** Fetch + generate a packing slip in one call. Returns false if not loadable. */
export async function downloadPackingSlip(orderId: string): Promise<boolean> {
  const data = await fetchPackingData(orderId);
  if (!data) return false;
  await generatePackingSlipPdf(data);
  return true;
}

// ── Shipment detail rows (shared by CSV / Excel / PDF exports) ─────────────────

export type ShipmentExportRow = {
  orderId: string;
  trackingNumber: string;
  courier: string;
  status: string;
  customer: string;
  email: string;
  phone: string;
  city: string;
  state: string;
  total: number;
  currency: string | null;
  units: number;
  estimatedDelivery: string | null;
  shippedAt: string | null;
  deliveredAt: string | null;
  createdAt: string | null;
};

const EXPORT_HEADERS = [
  "Order ID", "Tracking Number", "Courier", "Status", "Customer", "Email", "Phone",
  "City", "State", "Order Total", "Units", "Est. Delivery", "Shipped At", "Delivered At", "Created At",
];

const rowValues = (r: ShipmentExportRow): string[] => [
  shortId(r.orderId), r.trackingNumber || "—", r.courier || "Unassigned",
  r.status.replace(/_/g, " "), r.customer || "Guest", r.email || "—", r.phone || "—",
  r.city || "—", r.state || "—", money(r.currency, r.total), String(r.units),
  r.estimatedDelivery ? new Date(r.estimatedDelivery).toLocaleDateString() : "—",
  r.shippedAt ? new Date(r.shippedAt).toLocaleString() : "—",
  r.deliveredAt ? new Date(r.deliveredAt).toLocaleString() : "—",
  r.createdAt ? new Date(r.createdAt).toLocaleString() : "—",
];

function triggerDownload(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const stamp = () => new Date().toISOString().slice(0, 10);

export function exportShipmentsCsv(rows: ShipmentExportRow[]) {
  const esc = (v: string) => `"${v.replace(/"/g, '""')}"`;
  const csv = [EXPORT_HEADERS.map(esc).join(",")]
    .concat(rows.map((r) => rowValues(r).map(esc).join(",")))
    .join("\n");
  triggerDownload(new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" }), `FoundOurMarket-Shipments-${stamp()}.csv`);
}

/** Excel export via SpreadsheetML (.xls) — no dependency, opens natively. */
export function exportShipmentsExcel(rows: ShipmentExportRow[]) {
  const esc = (v: string) =>
    v.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  const cell = (v: string) => `<Cell><Data ss:Type="String">${esc(v)}</Data></Cell>`;
  const headerRow = `<Row>${EXPORT_HEADERS.map(cell).join("")}</Row>`;
  const bodyRows = rows.map((r) => `<Row>${rowValues(r).map(cell).join("")}</Row>`).join("");
  const xml =
    `<?xml version="1.0"?>\n<?mso-application progid="Excel.Sheet"?>\n` +
    `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
    `<Worksheet ss:Name="Shipments"><Table>${headerRow}${bodyRows}</Table></Worksheet></Workbook>`;
  triggerDownload(new Blob([xml], { type: "application/vnd.ms-excel" }), `FoundOurMarket-Shipments-${stamp()}.xls`);
}

/** Shipment Details PDF — single shipment summary, or a bulk table. */
export function exportShipmentsPdf(rows: ShipmentExportRow[]) {
  const doc = new jsPDF({ unit: "pt", format: "a4", orientation: "landscape" });
  const W = doc.internal.pageSize.getWidth();
  const H = doc.internal.pageSize.getHeight();
  const M = 36;
  let y = 48;

  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...ink);
  doc.text(BRAND, M, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(...accent);
  doc.text("SHIPMENT DETAILS", W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...muted);
  doc.text(`${rows.length} shipment(s) · ${new Date().toLocaleString()}`, W - M, y + 14, { align: "right" });
  y += 30;
  doc.setDrawColor(...accent); doc.setLineWidth(1.5); doc.line(M, y, W - M, y); y += 18;

  const cols = ["Order", "Tracking", "Courier", "Status", "Customer", "City", "Total", "Units", "ETA"];
  const widths = [70, 110, 80, 90, 120, 80, 70, 40, 70];
  const xs: number[] = [];
  let cx = M;
  for (const w of widths) { xs.push(cx); cx += w; }

  const drawHead = () => {
    doc.setFillColor(245, 245, 247); doc.rect(M, y - 11, W - M * 2, 20, "F");
    doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...muted);
    cols.forEach((c, i) => doc.text(c, xs[i] + 4, y + 2));
    y += 22;
  };
  drawHead();
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...ink);

  for (const r of rows) {
    const cells = [
      shortId(r.orderId), r.trackingNumber || "—", r.courier || "—",
      r.status.replace(/_/g, " "), r.customer || "Guest", r.city || "—",
      money(r.currency, r.total), String(r.units),
      r.estimatedDelivery ? new Date(r.estimatedDelivery).toLocaleDateString() : "—",
    ];
    cells.forEach((c, i) => {
      const lines = doc.splitTextToSize(c, widths[i] - 6);
      doc.text(lines[0] ?? "", xs[i] + 4, y);
    });
    y += 16;
    doc.setDrawColor(235, 235, 238); doc.setLineWidth(0.4); doc.line(M, y - 6, W - M, y - 6);
    if (y > H - 40) { doc.addPage(); y = 48; drawHead(); doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(...ink); }
  }

  doc.save(`FoundOurMarket-ShipmentDetails-${stamp()}.pdf`);
}

/** Compact 4x6 shipping label PDF (courier, address, tracking + QR). */
export async function generateShippingLabelPdf(d: PackingData) {
  const doc = new jsPDF({ unit: "pt", format: [288, 432] }); // 4x6 inches
  const W = doc.internal.pageSize.getWidth();
  const M = 18;
  let y = 30;

  doc.setFont("helvetica", "bold"); doc.setFontSize(13); doc.setTextColor(...ink);
  doc.text(BRAND, M, y);
  doc.setFont("helvetica", "bold"); doc.setFontSize(11); doc.setTextColor(...accent);
  doc.text((courierLabel(d.carrier) ?? "UNASSIGNED").toUpperCase(), W - M, y, { align: "right" });
  y += 12;
  doc.setDrawColor(...ink); doc.setLineWidth(1); doc.line(M, y, W - M, y); y += 20;

  doc.setFont("helvetica", "bold"); doc.setFontSize(8); doc.setTextColor(...muted);
  doc.text("DELIVER TO", M, y); y += 14;
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...ink);
  for (const line of fmtAddr(d.address)) { doc.text(line, M, y); y += 15; }
  if (d.address?.phone) { doc.text(`Ph: ${d.address.phone}`, M, y); y += 15; }

  y += 8;
  doc.setDrawColor(220, 220, 224); doc.setLineWidth(0.5); doc.line(M, y, W - M, y); y += 18;

  let qr = "";
  const payload = buildTrackingUrl({ carrier: d.carrier, trackingNumber: d.trackingNumber, trackingUrl: d.trackingUrl }) || `FOM-ORDER:${d.orderId}`;
  try { qr = await QRCode.toDataURL(payload, { margin: 0, width: 220 }); } catch { /* best effort */ }
  if (qr) doc.addImage(qr, "PNG", M, y, 96, 96);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("ORDER", M + 110, y + 14);
  doc.setFont("helvetica", "bold"); doc.setFontSize(12); doc.setTextColor(...ink);
  doc.text(`#${shortId(d.orderId)}`, M + 110, y + 30);
  doc.setFont("helvetica", "bold"); doc.setFontSize(9); doc.setTextColor(...muted);
  doc.text("TRACKING", M + 110, y + 52);
  doc.setFont("helvetica", "normal"); doc.setFontSize(11); doc.setTextColor(...ink);
  doc.text(doc.splitTextToSize(d.trackingNumber ?? "—", W - M - (M + 110)), M + 110, y + 68);

  doc.save(`FoundOurMarket-Label-${shortId(d.orderId)}.pdf`);
}

export async function downloadShippingLabel(orderId: string): Promise<boolean> {
  const data = await fetchPackingData(orderId);
  if (!data) return false;
  await generateShippingLabelPdf(data);
  return true;
}
