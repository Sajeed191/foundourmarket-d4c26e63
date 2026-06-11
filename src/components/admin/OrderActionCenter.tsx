import { useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Boxes, Truck, CheckCircle2, RotateCcw, XCircle, Wallet, Bell,
  LifeBuoy, CreditCard, Loader2, ChevronDown, Send, MapPin,
} from "lucide-react";
import {
  markOrderStageFn, createShipmentFn, updateTrackingFn, resolveRefundFn,
  sendOrderNotificationFn, sendRetryPaymentLinkFn, openOrderTicketFn,
} from "@/lib/admin-order-actions.functions";
import { lifecycleStep } from "@/lib/order-lifecycle";

type Props = {
  orderId: string;
  hasCustomer: boolean;
  /** Current fulfilment stage — used to disable stages already reached (one-time marking). */
  currentStage?: string | null;
  onDone: () => void;
};

type Busy = string | null;

function Btn({ icon, label, onClick, busy, tone = "default", disabled, done }: {
  icon: React.ReactNode; label: string; onClick: () => void; busy?: boolean;
  tone?: "default" | "good" | "bad"; disabled?: boolean; done?: boolean;
}) {
  const cls = tone === "good" ? "border-emerald-400/30 text-emerald-400 hover:bg-emerald-400/10"
    : tone === "bad" ? "border-destructive/30 text-destructive hover:bg-destructive/10"
    : "border-border hover:border-accent/40 hover:bg-muted/40";
  return (
    <button onClick={onClick} disabled={busy || disabled}
      className={`inline-flex items-center justify-center gap-1.5 text-[11px] px-2.5 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : done ? <CheckCircle2 className="size-3.5" /> : icon}{label}
    </button>
  );
}

export function OrderActionCenter({ orderId, hasCustomer, onDone }: Props) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<Busy>(null);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // form state
  const [carrier, setCarrier] = useState("");
  const [tracking, setTracking] = useState("");
  const [trackingUrl, setTrackingUrl] = useState("");
  const [eta, setEta] = useState("");
  const [refundAmt, setRefundAmt] = useState("");
  const [notifyTitle, setNotifyTitle] = useState("");
  const [notifyBody, setNotifyBody] = useState("");
  const [ticketSubject, setTicketSubject] = useState("");

  const mark = useServerFn(markOrderStageFn);
  const createShip = useServerFn(createShipmentFn);
  const updTrack = useServerFn(updateTrackingFn);
  const resolveRefund = useServerFn(resolveRefundFn);
  const notify = useServerFn(sendOrderNotificationFn);
  const retry = useServerFn(sendRetryPaymentLinkFn);
  const openTicket = useServerFn(openOrderTicketFn);

  const run = async (key: string, fn: () => Promise<unknown>, ok: string) => {
    setBusy(key); setMsg(null);
    try {
      await fn();
      setMsg({ ok: true, text: ok });
      onDone();
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : "Action failed" });
    } finally {
      setBusy(null);
    }
  };

  const field = "w-full px-2.5 py-1.5 text-[11px] rounded-lg border border-border bg-background outline-none focus:border-accent/40";

  return (
    <div className="rounded-xl border border-accent/30 bg-accent/[0.03]">
      <button onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-3 py-2.5">
        <span className="text-[10px] uppercase tracking-widest text-accent flex items-center gap-1.5">
          <Boxes className="size-3" /> Admin Action Center
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      {open && (
        <div className="px-3 pb-3 space-y-3">
          {msg && (
            <p className={`text-[11px] rounded-lg px-2.5 py-1.5 ${msg.ok ? "bg-emerald-400/10 text-emerald-400" : "bg-destructive/10 text-destructive"}`}>
              {msg.text}
            </p>
          )}

          {/* Fulfilment stage */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Fulfilment</p>
            <div className="grid grid-cols-2 gap-1.5">
              <Btn icon={<Boxes className="size-3.5" />} label="Mark Packed" busy={busy === "packed"}
                onClick={() => run("packed", () => mark({ data: { orderId, stage: "packed" } }), "Marked packed")} />
              <Btn icon={<Truck className="size-3.5" />} label="Mark Shipped" busy={busy === "shipped"}
                onClick={() => run("shipped", () => mark({ data: { orderId, stage: "shipped" } }), "Marked shipped")} />
              <Btn icon={<CheckCircle2 className="size-3.5" />} label="Mark Delivered" tone="good" busy={busy === "delivered"}
                onClick={() => run("delivered", () => mark({ data: { orderId, stage: "delivered" } }), "Marked delivered")} />
              <Btn icon={<XCircle className="size-3.5" />} label="Cancel Order" tone="bad" busy={busy === "cancelled"}
                onClick={() => run("cancelled", () => mark({ data: { orderId, stage: "cancelled" } }), "Order cancelled")} />
            </div>
          </div>

          {/* Shipment / tracking */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Shipment & Tracking</p>
            <div className="space-y-1.5">
              <input className={field} placeholder="Courier (e.g. Delhivery, DHL)" value={carrier} onChange={(e) => setCarrier(e.target.value)} />
              <div className="grid grid-cols-2 gap-1.5">
                <input className={field} placeholder="Tracking number" value={tracking} onChange={(e) => setTracking(e.target.value)} />
                <input className={field} placeholder="ETA (YYYY-MM-DD)" value={eta} onChange={(e) => setEta(e.target.value)} />
              </div>
              <input className={field} placeholder="Tracking URL (optional)" value={trackingUrl} onChange={(e) => setTrackingUrl(e.target.value)} />
              <div className="grid grid-cols-2 gap-1.5">
                <Btn icon={<Truck className="size-3.5" />} label="Create Shipment" busy={busy === "create_ship"}
                  onClick={() => run("create_ship", () => createShip({ data: { orderId, carrier, trackingNumber: tracking || undefined, trackingUrl: trackingUrl || undefined, estimatedDelivery: eta || undefined } }), "Shipment created")} />
                <Btn icon={<MapPin className="size-3.5" />} label="Update Tracking" busy={busy === "upd_track"}
                  onClick={() => run("upd_track", () => updTrack({ data: { orderId, carrier, trackingNumber: tracking || undefined, trackingUrl: trackingUrl || undefined } }), "Tracking updated")} />
              </div>
            </div>
          </div>

          {/* Refunds */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Refunds (manager+)</p>
            <input className={`${field} mb-1.5`} placeholder="Amount (blank = full order total)" inputMode="decimal" value={refundAmt} onChange={(e) => setRefundAmt(e.target.value)} />
            <div className="grid grid-cols-2 gap-1.5">
              <Btn icon={<Wallet className="size-3.5" />} label="Approve Refund" tone="good" busy={busy === "ref_ok"}
                onClick={() => run("ref_ok", () => resolveRefund({ data: { orderId, decision: "approved", amount: refundAmt ? Number(refundAmt) : undefined } }), "Refund approved")} />
              <Btn icon={<RotateCcw className="size-3.5" />} label="Reject Refund" tone="bad" busy={busy === "ref_no"}
                onClick={() => run("ref_no", () => resolveRefund({ data: { orderId, decision: "rejected" } }), "Refund rejected")} />
            </div>
          </div>

          {/* Customer comms */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Customer Communication</p>
            <div className="space-y-1.5">
              <input className={field} placeholder="Notification title" value={notifyTitle} onChange={(e) => setNotifyTitle(e.target.value)} />
              <textarea className={`${field} resize-none`} rows={2} placeholder="Message body (optional)" value={notifyBody} onChange={(e) => setNotifyBody(e.target.value)} />
              <Btn icon={<Bell className="size-3.5" />} label="Send Notification" busy={busy === "notify"}
                onClick={() => run("notify", () => notify({ data: { orderId, title: notifyTitle, body: notifyBody || undefined } }), "Notification sent")} />
              <Btn icon={<CreditCard className="size-3.5" />} label="Send Payment Retry Link" busy={busy === "retry"}
                onClick={() => run("retry", () => retry({ data: { orderId } }), "Retry link sent")} />
            </div>
          </div>

          {/* Support ticket */}
          <div>
            <p className="text-[9px] uppercase tracking-widest text-muted-foreground mb-1.5">Support</p>
            <input className={`${field} mb-1.5`} placeholder="Ticket subject" value={ticketSubject} onChange={(e) => setTicketSubject(e.target.value)} />
            <Btn icon={<LifeBuoy className="size-3.5" />} label="Open Support Ticket" busy={busy === "ticket"}
              onClick={() => run("ticket", () => openTicket({ data: { orderId, subject: ticketSubject } }), "Ticket opened")} />
          </div>

          {!hasCustomer && (
            <p className="text-[10px] text-muted-foreground flex items-center gap-1">
              <Send className="size-3" /> Guest order — customer notifications & tickets are disabled.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
