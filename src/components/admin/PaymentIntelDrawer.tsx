import { useCallback, useEffect, useState, type ReactNode } from "react";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  X, Copy, Check, Download, ExternalLink, MapPin, Loader2, ShieldAlert,
  CreditCard, User, Truck, RotateCcw, LifeBuoy, Package, RefreshCw, MessageSquarePlus,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { fetchOrderDetail, type OrderDetail } from "@/lib/order-operations";
import { getPaymentFraudFn, createPaymentTicketFn, type FraudIntel } from "@/lib/payment-center.functions";
import { createRazorpayRefund } from "@/lib/razorpay.functions";
import { safeExternalUrl } from "@/lib/safe-redirect";
import type { PaymentRow } from "@/lib/payment-center.functions";

const money = (v: number | null | undefined, c = "INR") =>
  new Intl.NumberFormat(c === "USD" ? "en-US" : "en-IN", {
    style: "currency", currency: c || "INR", maximumFractionDigits: 2,
  }).format(Number(v) || 0);
const when = (s?: string | null) =>
  s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—";

function Field({ label, value, mono, copyable }: { label: string; value?: string | null; mono?: boolean; copyable?: boolean }) {
  const [copied, setCopied] = useState(false);
  const v = value && String(value).trim() ? String(value) : "—";
  return (
    <div className="flex items-start justify-between gap-3 py-1.5 border-b border-white/5 last:border-0">
      <span className="text-[11px] uppercase tracking-wider text-muted-foreground shrink-0">{label}</span>
      <span className={`text-xs text-right break-all ${mono ? "font-mono" : ""} flex items-center gap-1.5`}>
        {v}
        {copyable && v !== "—" && (
          <button
            onClick={() => { navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1200); }}
            className="text-muted-foreground hover:text-accent shrink-0"
            aria-label={`Copy ${label}`}
          >
            {copied ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3" />}
          </button>
        )}
      </span>
    </div>
  );
}

function Section({ icon: Icon, title, children }: { icon: typeof User; title: string; children: ReactNode }) {
  return (
    <div className="glass border border-white/10 rounded-2xl p-4">
      <div className="flex items-center gap-2 mb-2">
        <Icon className="size-4 text-accent" />
        <h3 className="text-sm font-semibold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

export function PaymentIntelDrawer({ payment, onClose }: { payment: PaymentRow | null; onClose: () => void }) {
  const [detail, setDetail] = useState<OrderDetail | null>(null);
  const [fraud, setFraud] = useState<FraudIntel | null>(null);
  const [loading, setLoading] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const fraudFn = useServerFn(getPaymentFraudFn);
  const refundFn = useServerFn(createRazorpayRefund);
  const ticketFn = useServerFn(createPaymentTicketFn);

  const orderId = payment?.order_id ?? null;

  const load = useCallback(async () => {
    if (!orderId) return;
    setLoading(true);
    setMsg(null);
    try {
      const [d, f] = await Promise.all([
        fetchOrderDetail(orderId),
        fraudFn({ data: { orderId, userId: payment?.user_id ?? null, email: payment?.customer_email ?? null } }),
      ]);
      setDetail(d);
      setFraud(f as FraudIntel);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load payment intelligence.");
    } finally {
      setLoading(false);
    }
  }, [orderId, payment?.user_id, payment?.customer_email, fraudFn]);

  useEffect(() => {
    setDetail(null); setFraud(null);
    if (orderId) load();
  }, [orderId, load]);

  // Realtime: refresh drawer when this order's records change.
  useEffect(() => {
    if (!orderId) return;
    const ch = supabase
      .channel(`pay-drawer-${orderId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `order_id=eq.${orderId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `order_id=eq.${orderId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "refunds", filter: `order_id=eq.${orderId}` }, load)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `order_id=eq.${orderId}` }, load)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [orderId, load]);

  async function doRefund() {
    if (!detail?.payment?.id) { setMsg("No refundable payment on this order."); return; }
    setBusy("refund"); setMsg(null);
    try {
      await refundFn({ data: { paymentId: detail.payment.id, reason: "admin_initiated" } });
      setMsg("Refund initiated.");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Refund failed."); }
    finally { setBusy(null); }
  }

  async function doInvoice() {
    if (!orderId) return;
    setBusy("invoice");
    try { const ok = await (await import("@/lib/invoice")).downloadInvoice(orderId); if (!ok) setMsg("Invoice unavailable for this order."); }
    finally { setBusy(null); }
  }

  async function doTicket() {
    if (!orderId) return;
    setBusy("ticket"); setMsg(null);
    try {
      await ticketFn({ data: { orderId, subject: `Payment follow-up — order ${orderId.slice(0, 8)}`, category: "payment", priority: "high" } });
      setMsg("Support ticket created.");
      load();
    } catch (e) { setMsg(e instanceof Error ? e.message : "Could not create ticket."); }
    finally { setBusy(null); }
  }

  const addr = detail?.addresses?.find((a) => a.is_default_shipping) ?? detail?.addresses?.[0] ?? null;
  const billing = detail?.addresses?.find((a) => a.is_default_billing) ?? addr;
  const ship = detail?.shipments?.[0] ?? null;
  const latestEvent = ship?.events?.[0] ?? null;
  const openTickets = detail?.tickets?.filter((t) => t.status !== "resolved" && t.status !== "closed").length ?? 0;
  const resolvedTickets = detail?.tickets?.filter((t) => t.status === "resolved" || t.status === "closed").length ?? 0;
  const cur = payment?.currency ?? detail?.order.currency ?? "INR";
  const mapsLink = addr
    ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(
        [addr.line1, addr.line2, addr.city, addr.state, addr.postal, addr.country].filter(Boolean).join(", "),
      )}`
    : null;

  const fullAddr = (a: typeof addr) =>
    a ? [a.full_name, a.line1, a.line2, a.landmark, a.city, a.state, a.postal, a.country].filter(Boolean).join(", ") : "—";

  return (
    <AnimatePresence>
      {payment && (
        <>
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}
          />
          <motion.aside
            initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
            transition={{ type: "spring", damping: 30, stiffness: 300 }}
            className="fixed right-0 top-0 z-50 h-full w-full max-w-xl bg-background border-l border-white/10 flex flex-col"
          >
            <div className="flex items-center justify-between gap-3 p-4 border-b border-white/10 shrink-0">
              <div className="min-w-0">
                <p className="text-sm font-semibold truncate">{payment.customer_name || payment.customer_email || "Customer"}</p>
                <p className="text-[11px] font-mono text-muted-foreground truncate">Order {payment.order_id?.slice(0, 8)} · {money(payment.amount, cur)}</p>
              </div>
              <button onClick={onClose} className="rounded-full border border-white/10 p-2 hover:bg-white/5"><X className="size-4" /></button>
            </div>

            {/* Actions */}
            <div className="flex flex-wrap gap-2 p-3 border-b border-white/10 shrink-0">
              <button onClick={doInvoice} disabled={busy === "invoice"} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-50">
                {busy === "invoice" ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />} Invoice
              </button>
              <button onClick={doRefund} disabled={busy === "refund"} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-50">
                {busy === "refund" ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCcw className="size-3.5" />} Refund
              </button>
              <button onClick={doTicket} disabled={busy === "ticket"} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] hover:bg-white/5 disabled:opacity-50">
                {busy === "ticket" ? <Loader2 className="size-3.5 animate-spin" /> : <MessageSquarePlus className="size-3.5" />} Ticket
              </button>
              <a href={`/admin-orders-ops?order=${payment.order_id}`} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] hover:bg-white/5">
                <ExternalLink className="size-3.5" /> Order
              </a>
              <button onClick={load} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[11px] hover:bg-white/5">
                <RefreshCw className="size-3.5" /> Refresh
              </button>
            </div>

            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              {msg && <p className="text-xs text-accent">{msg}</p>}
              {loading && !detail && (
                <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>
              )}

              {detail && (
                <>
                  {/* 1. Payment Intelligence */}
                  <Section icon={CreditCard} title="Payment Intelligence">
                    <Field label="Payment ID" value={detail.payment?.id} mono copyable />
                    <Field label="Transaction ID" value={detail.payment?.transaction_id} mono copyable />
                    <Field label="Razorpay Payment" value={detail.payment?.razorpay_payment_id} mono copyable />
                    <Field label="Razorpay Order" value={detail.payment?.razorpay_order_id} mono copyable />
                    <Field label="Method" value={detail.payment?.method ?? detail.order.payment_method} />
                    <Field label="Gateway Status" value={detail.payment?.status} />
                    <Field label="Fee" value={money(detail.payment?.fee, cur)} />
                    <Field label="Gateway Tax" value={money(detail.payment?.gateway_tax, cur)} />
                    <Field label="Net Amount" value={money((Number(detail.payment?.amount) || 0) - (Number(detail.payment?.fee) || 0) - (Number(detail.payment?.gateway_tax) || 0), cur)} />
                  </Section>

                  {/* 2. Customer Intelligence */}
                  <Section icon={User} title="Customer Intelligence">
                    <Field label="Name" value={detail.profile?.full_name} />
                    <Field label="Phone" value={detail.profile?.phone} copyable />
                    <Field label="Alt Phone" value={detail.profile?.alt_phone} copyable />
                    <Field label="Email" value={detail.order.contact_email} copyable />
                    <Field label="Country" value={detail.profile?.country} />
                    <Field label="Total Orders" value={String(detail.lifetime?.orders ?? 0)} />
                    <Field label="Lifetime Spend" value={money(detail.lifetime?.spend, cur)} />
                    <Field label="Failed Payments" value={String(fraud?.failed_payments ?? 0)} />
                    <Field label="Refunds (this order)" value={String(detail.refunds?.length ?? 0)} />
                  </Section>

                  {/* 3. Address Intelligence */}
                  <Section icon={MapPin} title="Address Intelligence">
                    <Field label="Shipping" value={fullAddr(addr)} copyable />
                    <Field label="Billing" value={fullAddr(billing)} copyable />
                    <Field label="City" value={addr?.city} />
                    <Field label="State" value={addr?.state} />
                    <Field label="Country" value={addr?.country} />
                    <Field label="PIN" value={addr?.postal} copyable />
                    {mapsLink && (
                      <a href={mapsLink} target="_blank" rel="noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-accent hover:underline">
                        <MapPin className="size-3.5" /> Open in Google Maps
                      </a>
                    )}
                  </Section>

                  {/* 4. Order Intelligence */}
                  <Section icon={Package} title="Order Intelligence">
                    <div className="space-y-2 mb-3">
                      {detail.items?.map((it, i) => (
                        <div key={i} className="flex items-center gap-2">
                          {it.image
                            ? <img loading="lazy" decoding="async" src={it.image} alt={it.name ?? ""} className="size-9 rounded-lg object-cover border border-white/10" onError={(e) => { (e.currentTarget as HTMLImageElement).style.display = "none"; }} />
                            : <div className="size-9 rounded-lg bg-white/5 grid place-items-center"><Package className="size-4 text-muted-foreground" /></div>}
                          <div className="min-w-0 flex-1">
                            <p className="text-xs truncate">{it.name}</p>
                            <p className="text-[10px] text-muted-foreground">×{it.quantity} · {money(it.unit_price, cur)}</p>
                          </div>
                          <span className="text-xs font-mono">{money(it.line_total, cur)}</span>
                        </div>
                      ))}
                    </div>
                    <Field label="Subtotal" value={money(detail.order.subtotal, cur)} />
                    <Field label="Discount" value={money(detail.order.discount, cur)} />
                    <Field label="Tax" value={money(detail.order.tax, cur)} />
                    <Field label="Shipping" value={money(detail.order.shipping, cur)} />
                    <Field label="Order Total" value={money(detail.order.total, cur)} />
                  </Section>

                  {/* 5. Shipment Intelligence */}
                  <Section icon={Truck} title="Shipment Intelligence">
                    <Field label="Courier" value={ship?.carrier} />
                    <Field label="Tracking #" value={ship?.tracking_number} mono copyable />
                    <Field label="Status" value={ship?.status} />
                    <Field label="ETA" value={when(ship?.estimated_delivery)} />
                    <Field label="Shipped" value={when(ship?.shipped_at)} />
                    <Field label="Delivered" value={when(ship?.delivered_at)} />
                    <Field label="Latest Event" value={latestEvent ? `${latestEvent.status ?? ""} — ${latestEvent.description ?? ""}` : "—"} />
                    {safeExternalUrl(ship?.tracking_url) && (
                      <a href={safeExternalUrl(ship?.tracking_url)!} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 text-[11px] text-accent hover:underline">
                        <ExternalLink className="size-3.5" /> Track shipment
                      </a>
                    )}
                    {ship?.events && ship.events.length > 0 && (
                      <ol className="mt-3 space-y-1.5 border-l border-white/10 pl-3">
                        {ship.events.slice(0, 6).map((ev) => (
                          <li key={ev.id} className="text-[11px]">
                            <span className="text-foreground">{ev.status ?? ev.description}</span>
                            <span className="text-muted-foreground"> · {when(ev.occurred_at)}</span>
                          </li>
                        ))}
                      </ol>
                    )}
                  </Section>

                  {/* 6. Refund Intelligence */}
                  <Section icon={RotateCcw} title="Refund Intelligence">
                    {detail.refunds && detail.refunds.length > 0 ? (
                      detail.refunds.map((r) => (
                        <div key={r.id} className="py-1.5 border-b border-white/5 last:border-0">
                          <div className="flex items-center justify-between">
                            <span className="text-xs">{money(r.amount, r.currency ?? cur)}</span>
                            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">{r.status}</span>
                          </div>
                          <p className="text-[10px] text-muted-foreground">{r.reason ?? "—"} · {when(r.created_at)}</p>
                        </div>
                      ))
                    ) : <p className="text-xs text-muted-foreground">No refunds on this order.</p>}
                  </Section>

                  {/* 7. Support Intelligence */}
                  <Section icon={LifeBuoy} title="Support Intelligence">
                    <div className="flex gap-4 mb-2">
                      <span className="text-xs">Open: <b className="text-amber-400">{openTickets}</b></span>
                      <span className="text-xs">Resolved: <b className="text-emerald-400">{resolvedTickets}</b></span>
                    </div>
                    {detail.tickets && detail.tickets.length > 0 ? (
                      detail.tickets.slice(0, 5).map((t) => (
                        <div key={t.id} className="py-1.5 border-b border-white/5 last:border-0">
                          <p className="text-xs truncate">{t.subject}</p>
                          <p className="text-[10px] text-muted-foreground">{t.status} · {t.priority} · {when(t.created_at)}</p>
                        </div>
                      ))
                    ) : <p className="text-xs text-muted-foreground">No tickets for this order.</p>}
                  </Section>

                  {/* 8. Fraud Intelligence */}
                  <Section icon={ShieldAlert} title="Fraud Intelligence">
                    <div className="flex items-center gap-3 mb-2">
                      <div className={`text-2xl font-bold ${fraud && fraud.level === "high" ? "text-destructive" : fraud && fraud.level === "medium" ? "text-amber-400" : "text-emerald-400"}`}>
                        {fraud?.score ?? 0}
                      </div>
                      <div className="text-[11px] uppercase tracking-wider text-muted-foreground">
                        Risk: {fraud?.level ?? "low"} · Chargeback: {fraud?.chargeback_risk ?? "low"}
                      </div>
                    </div>
                    <Field label="Failed Attempts" value={String(fraud?.failed_payments ?? 0)} />
                    <Field label="Payment Attempts" value={String(fraud?.total_attempts ?? 0)} />
                    <Field label="Open Alerts" value={String(fraud?.open_alerts ?? 0)} />
                    {fraud?.alerts && fraud.alerts.length > 0 && (
                      <div className="mt-2 space-y-1.5">
                        {fraud.alerts.slice(0, 5).map((a) => (
                          <div key={a.id} className="py-1 border-b border-white/5 last:border-0">
                            <p className="text-xs">{a.title ?? a.fraud_type}</p>
                            <p className="text-[10px] text-muted-foreground">{a.severity} · {a.status} · {when(a.created_at)}</p>
                          </div>
                        ))}
                      </div>
                    )}
                  </Section>
                </>
              )}
            </div>
          </motion.aside>
        </>
      )}
    </AnimatePresence>
  );
}
