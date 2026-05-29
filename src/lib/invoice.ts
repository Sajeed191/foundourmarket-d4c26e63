import jsPDF from "jspdf";
import { supabase } from "@/integrations/supabase/client";

type InvoiceItem = {
  name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
};

type InvoiceOrder = {
  id: string;
  status: string;
  subtotal: number;
  discount: number;
  shipping: number;
  tax: number;
  total: number;
  currency: string;
  promo_code: string | null;
  contact_email: string | null;
  payment_method: string | null;
  shipping_address: {
    name?: string;
    line1?: string;
    line2?: string;
    city?: string;
    region?: string;
    postal_code?: string;
    country?: string;
  } | null;
  created_at: string;
  order_items: InvoiceItem[];
};

const BRAND = "FoundOurMarket™";
const TAGLINE = "Whatever you need. All in one place.";

function money(currency: string, v: number) {
  const n = Number(v) || 0;
  if (currency?.toUpperCase() === "INR") return `Rs. ${Math.round(n).toLocaleString("en-IN")}`;
  return `${currency} ${n.toFixed(2)}`;
}

/** Fetch the full order (items + address) for invoice generation. */
export async function fetchInvoiceOrder(orderId: string): Promise<InvoiceOrder | null> {
  const { data } = await supabase
    .from("orders")
    .select(
      "id,status,subtotal,discount,shipping,tax,total,currency,promo_code,contact_email,payment_method,shipping_address,created_at,order_items(name,quantity,unit_price,line_total)"
    )
    .eq("id", orderId)
    .maybeSingle();
  return (data as InvoiceOrder) ?? null;
}

/** Build and trigger download of a branded PDF invoice for an order. */
export function generateInvoicePdf(order: InvoiceOrder) {
  const doc = new jsPDF({ unit: "pt", format: "a4" });
  const W = doc.internal.pageSize.getWidth();
  const M = 48;
  let y = 56;

  const accent: [number, number, number] = [234, 88, 12]; // orange
  const ink: [number, number, number] = [17, 17, 20];
  const muted: [number, number, number] = [120, 120, 130];

  // Header
  doc.setFont("helvetica", "bold");
  doc.setFontSize(20);
  doc.setTextColor(...ink);
  doc.text(BRAND, M, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(TAGLINE, M, y + 16);

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(...accent);
  doc.text("INVOICE", W - M, y, { align: "right" });
  doc.setFont("helvetica", "normal");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text(`#${order.id.slice(0, 8).toUpperCase()}`, W - M, y + 16, { align: "right" });
  doc.text(new Date(order.created_at).toLocaleString(), W - M, y + 30, { align: "right" });

  y += 56;
  doc.setDrawColor(...accent);
  doc.setLineWidth(2);
  doc.line(M, y, W - M, y);
  y += 28;

  // Bill to + payment meta
  const addr = order.shipping_address;
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("BILL TO", M, y);
  doc.text("PAYMENT", W / 2, y);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ink);

  let ay = y + 16;
  const billLines = [
    addr?.name,
    addr?.line1,
    addr?.line2,
    [addr?.city, addr?.region, addr?.postal_code].filter(Boolean).join(", "),
    addr?.country,
    order.contact_email,
  ].filter(Boolean) as string[];
  billLines.forEach((line) => {
    doc.text(line, M, ay);
    ay += 14;
  });

  let py = y + 16;
  const payLines = [
    `Method: ${order.payment_method === "cod" ? "Cash on Delivery" : "Razorpay"}`,
    `Status: ${order.status}`,
    order.promo_code ? `Promo: ${order.promo_code}` : null,
  ].filter(Boolean) as string[];
  payLines.forEach((line) => {
    doc.text(line, W / 2, py);
    py += 14;
  });

  y = Math.max(ay, py) + 18;

  // Items table header
  const colQty = W - M - 200;
  const colPrice = W - M - 110;
  const colTotal = W - M;
  doc.setFillColor(245, 245, 247);
  doc.rect(M, y - 12, W - M * 2, 22, "F");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(9);
  doc.setTextColor(...muted);
  doc.text("ITEM", M + 8, y + 3);
  doc.text("QTY", colQty, y + 3, { align: "right" });
  doc.text("PRICE", colPrice, y + 3, { align: "right" });
  doc.text("TOTAL", colTotal - 8, y + 3, { align: "right" });
  y += 26;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(10);
  doc.setTextColor(...ink);
  order.order_items.forEach((it) => {
    const nameLines = doc.splitTextToSize(it.name, colQty - M - 24);
    doc.text(nameLines, M + 8, y);
    doc.text(String(it.quantity), colQty, y, { align: "right" });
    doc.text(money(order.currency, it.unit_price), colPrice, y, { align: "right" });
    doc.text(money(order.currency, it.line_total), colTotal - 8, y, { align: "right" });
    y += Math.max(16, nameLines.length * 13 + 4);
    doc.setDrawColor(235, 235, 238);
    doc.setLineWidth(0.5);
    doc.line(M, y - 8, W - M, y - 8);
  });

  // Totals
  y += 10;
  const labelX = W - M - 150;
  const valX = W - M;
  const totalRow = (label: string, value: string, bold = false) => {
    doc.setFont("helvetica", bold ? "bold" : "normal");
    doc.setFontSize(bold ? 12 : 10);
    doc.setTextColor(...(bold ? ink : muted));
    doc.text(label, labelX, y);
    doc.setTextColor(...(bold ? accent : ink));
    doc.text(value, valX, y, { align: "right" });
    y += bold ? 22 : 16;
  };
  totalRow("Subtotal", money(order.currency, order.subtotal));
  if (Number(order.discount) > 0) totalRow("Discount", `- ${money(order.currency, order.discount)}`);
  totalRow("Shipping", Number(order.shipping) > 0 ? money(order.currency, order.shipping) : "Free");
  totalRow("Tax", money(order.currency, order.tax));
  y += 4;
  doc.setDrawColor(...ink);
  doc.setLineWidth(1);
  doc.line(labelX, y - 6, valX, y - 6);
  y += 8;
  totalRow("Total", money(order.currency, order.total), true);

  // Footer
  const fy = doc.internal.pageSize.getHeight() - 50;
  doc.setDrawColor(235, 235, 238);
  doc.setLineWidth(0.5);
  doc.line(M, fy - 16, W - M, fy - 16);
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...muted);
  doc.text("Thank you for shopping with FoundOurMarket™.", M, fy);
  doc.text("This is a computer-generated invoice and does not require a signature.", M, fy + 12);

  doc.save(`FoundOurMarket-Invoice-${order.id.slice(0, 8).toUpperCase()}.pdf`);
}

/** Convenience: fetch then generate. Returns false if the order can't be loaded. */
export async function downloadInvoice(orderId: string): Promise<boolean> {
  const order = await fetchInvoiceOrder(orderId);
  if (!order) return false;
  generateInvoicePdf(order);
  return true;
}
