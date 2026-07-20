import { useState } from "react";
import {
  User, Mail, Phone, MapPin, Check, X, Package, ImageOff, Images,
  CalendarClock, ShieldCheck, ShieldX, Receipt, Truck, CreditCard,
  Wallet, RotateCcw, Clock, ChevronDown, Repeat, AlertTriangle,
} from "lucide-react";
import type { AdminReturnRow } from "@/lib/returns-admin.functions";
import type { Product } from "@/lib/products";
import { ImageLightbox } from "@/components/site/ImageLightbox";

const RETURN_STATUSES = ["requested", "approved", "received", "completed", "rejected"] as const;
const REFUND_STATUSES = ["pending", "issued", "failed"] as const;
const REPLACEMENT_STATUSES = ["pending", "approved", "processing", "shipped", "delivered"] as const;

const STATUS_TONE: Record<string, string> = {
  requested: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  approved: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  received: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  completed: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  rejected: "text-rose-400 border-rose-400/30 bg-rose-400/10",
};

/** Unified compact tracker: Requested → Approved → Processing → Shipped → Delivered. */
const COMPACT_STEPS = ["Requested", "Approved", "Processing", "Shipped", "Delivered"] as const;

function compactIndex(r: AdminReturnRow): number {
  if (r.status === "rejected") return -1;
  if (r.resolution_type === "refund") {
    if (r.refund_status === "issued" || r.status === "completed") return 4;
    if (r.status === "received") return 2;
    if (r.status === "approved") return 1;
    return 0;
  }
  if (r.replacement_status === "delivered") return 4;
  if (r.replacement_status === "shipped") return 3;
  if (r.replacement_status === "processing" || r.status === "received") return 2;
  if (r.replacement_status === "approved" || r.status === "approved") return 1;
  if (r.status === "completed") return 4;
  return 0;
}

function fmtMoney(amount: number | null | undefined, currency: string | null | undefined) {
  if (amount == null) return "—";
  const cur = (currency || "USD").toUpperCase();
  try {
    return new Intl.NumberFormat(cur === "INR" ? "en-IN" : "en-US", {
      style: "currency",
      currency: cur,
      maximumFractionDigits: 2,
    }).format(amount);
  } catch {
    return `${cur} ${amount.toFixed(2)}`;
  }
}

function fmtDate(d: string | null | undefined) {
  if (!d) return "—";
  return new Date(d).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

function daysBetween(a: string | null | undefined, b: string | null | undefined) {
  if (!a || !b) return null;
  const ms = new Date(b).getTime() - new Date(a).getTime();
  if (Number.isNaN(ms)) return null;
  return Math.max(0, Math.round(ms / 86_400_000));
}

export function ReturnAdminCard({
  r,
  products,
  onUpdate,
}: {
  r: AdminReturnRow;
  products: Map<string, Product>;
  onUpdate: (id: string, patch: Record<string, unknown>) => void;
}) {
  const [lightbox, setLightbox] = useState<number | null>(null);
  const [customerOpen, setCustomerOpen] = useState(false);
  const [orderOpen, setOrderOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const photos = (r.photo_urls ?? []).filter(Boolean);

  const resolution = r.resolution_type === "refund" ? "refund" : "replacement";
  const activeIdx = compactIndex(r);

  // Return Intelligence values
  const deliveredAt = r.order.fulfilled_at;
  const daysSinceDelivery = daysBetween(deliveredAt, r.created_at);
  const firstProduct = products.get(r.return_items[0]?.product_slug ?? "");
  const eligible = firstProduct ? firstProduct.returnEligible : null;
  const windowDays = firstProduct?.returnWindowDays ?? null;
  const withinWindow =
    daysSinceDelivery != null && windowDays != null ? daysSinceDelivery <= windowDays : null;

  const isApproved = ["approved", "received", "completed"].includes(r.status);
  // Refund is only eligible when the request is approved, the product qualifies,
  // it's within the return window, and admin has chosen refund (replacement unavailable).
  const refundEligible =
    resolution === "refund" && isApproved && eligible !== false && withinWindow !== false;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] text-muted-foreground break-words">
            Return #{r.id.slice(0, 8)} · Order #{r.order_id.slice(0, 8)}
          </p>
          <p className="text-sm mt-1 font-medium break-words">{r.reason}</p>
          {r.notes && <p className="text-xs text-muted-foreground mt-1 break-words">{r.notes}</p>}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_TONE[r.status] ?? "text-muted-foreground border-border"}`}>
            {r.status}
          </span>
        </div>
      </div>

      {/* Compact progress tracker */}
      {r.status !== "rejected" ? (
        <div className="rounded-xl border border-border/60 bg-background/40 p-3">
          <div className="flex items-center">
            {COMPACT_STEPS.map((label, i) => {
              const done = i <= activeIdx;
              const current = i === activeIdx;
              return (
                <div key={label} className="flex items-center flex-1 last:flex-none">
                  <div className="flex flex-col items-center gap-1.5 shrink-0">
                    <div
                      className={`grid place-items-center size-6 rounded-full border text-[10px] transition-colors ${
                        done
                          ? "bg-accent/20 border-accent text-accent"
                          : "bg-background border-border text-muted-foreground"
                      } ${current ? "ring-2 ring-accent/40" : ""}`}
                    >
                      {done ? <Check className="size-3" /> : i + 1}
                    </div>
                    <span className={`text-[8px] sm:text-[9px] font-mono uppercase tracking-wide text-center leading-tight w-11 sm:w-14 ${current ? "text-accent font-semibold" : done ? "text-foreground" : "text-muted-foreground"}`}>
                      {label}
                    </span>
                  </div>
                  {i < COMPACT_STEPS.length - 1 && (
                    <div className={`h-px flex-1 mx-0.5 mb-4 ${i < activeIdx ? "bg-accent" : "bg-border"}`} />
                  )}
                </div>
              );
            })}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-400">
          <ShieldX className="size-4 shrink-0" /> This return was rejected.
        </div>
      )}

      <div className="grid lg:grid-cols-2 gap-4">
        {/* Product Preview */}
        <section className="rounded-xl border border-border/60 bg-background/40 p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <Package className="size-3.5 text-accent" /> Product Preview
          </p>
          <div className="space-y-3">
            {r.return_items.map((item) => {
              const p = products.get(item.product_slug);
              return (
                <div key={item.id} className="flex items-start gap-3">
                  <div className="size-14 rounded-lg overflow-hidden bg-muted/30 border border-border/60 shrink-0 grid place-items-center">
                    {p?.image ? (
                      <img decoding="async" src={p.image} alt={p.name} className="size-full object-cover" loading="lazy" />
                    ) : (
                      <ImageOff className="size-5 text-muted-foreground" />
                    )}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium line-clamp-2 break-words">{p?.name ?? item.product_slug}</p>
                    {/* Metadata stacks vertically on mobile */}
                    <div className="mt-1 flex flex-col gap-0.5 text-[11px] text-muted-foreground font-mono">
                      <span className="truncate">SKU: {p?.sku || "—"}</span>
                      <span>Qty: {item.quantity}</span>
                      <span className="font-semibold text-foreground">{p ? fmtMoney(p.price, r.order.currency) : "—"}</span>
                    </div>
                    {item.reason && <p className="text-[11px] text-muted-foreground mt-1 break-words">{item.reason}</p>}
                  </div>
                </div>
              );
            })}
          </div>
        </section>

        {/* Return Intelligence */}
        <section className="rounded-xl border border-border/60 bg-background/40 p-3">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2 flex items-center gap-1.5">
            <ShieldCheck className="size-3.5 text-accent" /> Return Intelligence
          </p>
          <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs">
            <div>
              <dt className="text-muted-foreground flex items-center gap-1"><RotateCcw className="size-3" /> Reason</dt>
              <dd className="font-medium mt-0.5 break-words">{r.reason}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1"><CalendarClock className="size-3" /> Requested</dt>
              <dd className="font-medium mt-0.5">{fmtDate(r.created_at)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1"><Clock className="size-3" /> Days Since Delivery</dt>
              <dd className="font-medium mt-0.5">{daysSinceDelivery != null ? `${daysSinceDelivery}d` : "—"}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground flex items-center gap-1"><Wallet className="size-3" /> Refund Status</dt>
              <dd className="font-medium mt-0.5 capitalize">{r.refund_status}</dd>
            </div>
            <div className="sm:col-span-2">
              <dt className="text-muted-foreground">Eligibility</dt>
              <dd className="mt-1">
                {eligible == null ? (
                  <span className="text-muted-foreground">Unknown</span>
                ) : eligible ? (
                  <span className={`inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${withinWindow === false ? "text-amber-400 border-amber-400/30 bg-amber-400/10" : "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"}`}>
                    <ShieldCheck className="size-3" />
                    {withinWindow === false ? `Eligible · window passed (${windowDays}d)` : `Eligible${windowDays != null ? ` · ${windowDays}d window` : ""}`}
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border text-rose-400 border-rose-400/30 bg-rose-400/10">
                    <ShieldX className="size-3" /> Not eligible
                  </span>
                )}
              </dd>
            </div>
          </dl>
        </section>

        {/* Original Order Summary (collapsible) */}
        <section className="rounded-xl border border-border/60 bg-background/40 p-3">
          <button
            type="button"
            onClick={() => setOrderOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left"
            aria-expanded={orderOpen}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Receipt className="size-3.5 text-accent" /> Original Order
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <span className="font-mono">#{r.order_id.slice(0, 8)}</span>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${orderOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {orderOpen && (
            <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-4 gap-y-3 text-xs mt-3 pt-3 border-t border-border/40">
              <div>
                <dt className="text-muted-foreground">Order ID</dt>
                <dd className="font-mono font-medium mt-0.5">#{r.order_id.slice(0, 8)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground flex items-center gap-1"><Receipt className="size-3" /> Order Total</dt>
                <dd className="font-semibold mt-0.5">{fmtMoney(r.order.total, r.order.currency)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground flex items-center gap-1"><CreditCard className="size-3" /> Payment</dt>
                <dd className="font-medium mt-0.5 capitalize">{r.order.payment_status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground flex items-center gap-1"><Truck className="size-3" /> Delivery</dt>
                <dd className="font-medium mt-0.5 capitalize">{r.order.fulfillment_status ?? r.order.order_status ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Delivery Date</dt>
                <dd className="font-medium mt-0.5">{fmtDate(r.order.fulfilled_at)}</dd>
              </div>
              <div>
                <dt className="text-muted-foreground">Order Date</dt>
                <dd className="font-medium mt-0.5">{fmtDate(r.order.created_at)}</dd>
              </div>
            </dl>
          )}
        </section>

        {/* Customer (collapsible) */}
        <section className="rounded-xl border border-border/60 bg-background/40 p-3">
          <button
            type="button"
            onClick={() => setCustomerOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left"
            aria-expanded={customerOpen}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <User className="size-3.5 text-accent" /> Requested By
            </span>
            <span className="flex items-center gap-2 text-xs text-muted-foreground min-w-0">
              <span className="truncate max-w-[120px] sm:max-w-none">{r.customer.name ?? "—"}</span>
              <ChevronDown className={`size-4 shrink-0 transition-transform ${customerOpen ? "rotate-180" : ""}`} />
            </span>
          </button>
          {customerOpen && (
            <div className="grid gap-2.5 text-xs mt-3 pt-3 border-t border-border/40">
              <span className="flex items-center gap-2"><User className="size-3.5 text-accent shrink-0" /><span className="break-words">{r.customer.name ?? "—"}</span></span>
              <a href={r.customer.phone ? `tel:${r.customer.phone}` : undefined} className="flex items-center gap-2 min-h-[24px] hover:text-accent"><Phone className="size-3.5 text-accent shrink-0" /><span className="break-words">{r.customer.phone ?? "—"}</span></a>
              <a href={r.customer.email ? `mailto:${r.customer.email}` : undefined} className="flex items-center gap-2 min-w-0 hover:text-accent">
                <Mail className="size-3.5 text-accent shrink-0" /><span className="break-all">{r.customer.email ?? "—"}</span>
              </a>
              <span className="flex items-start gap-2"><MapPin className="size-3.5 text-accent shrink-0 mt-0.5" /><span className="break-words whitespace-pre-line">{r.customer.address ?? "—"}</span></span>
            </div>
          )}
        </section>
      </div>

      {/* Customer Evidence (collapsible) */}
      {photos.length > 0 && (
        <section className="rounded-xl border border-border/60 bg-background/40 p-3">
          <button
            type="button"
            onClick={() => setEvidenceOpen((v) => !v)}
            className="w-full flex items-center justify-between gap-2 min-h-[44px] text-left"
            aria-expanded={evidenceOpen}
          >
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground flex items-center gap-1.5">
              <Images className="size-3.5 text-accent" /> Evidence Gallery ({photos.length})
            </span>
            <ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />
          </button>
          {evidenceOpen && (
            <>
              <div className="grid grid-cols-4 sm:grid-cols-6 gap-2 mt-3 pt-3 border-t border-border/40">
                {photos.map((url, i) => (
                  <button
                    key={url + i}
                    onClick={() => setLightbox(i)}
                    className="aspect-square rounded-lg overflow-hidden border border-border/60 hover:ring-2 hover:ring-accent/50 transition-all"
                  >
                    <img decoding="async" src={url} alt={`Evidence ${i + 1}`} className="size-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
              <ImageLightbox
                images={photos.map((url, i) => ({ id: `${url}-${i}`, url, alt: `Evidence ${i + 1}`, sortOrder: i }))}
                index={lightbox ?? 0}
                open={lightbox != null}
                onIndexChange={setLightbox}
                onClose={() => setLightbox(null)}
                alt="Return evidence"
              />
            </>
          )}
        </section>
      )}

      {/* Resolution method (replacement-first) */}
      <section className="rounded-xl border border-border/60 bg-background/40 p-3">
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 flex items-center gap-1.5">
          <Repeat className="size-3.5 text-accent" /> Resolution Controls
        </p>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            onClick={() => onUpdate(r.id, { resolution_type: "replacement" })}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${
              resolution === "replacement"
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-background text-muted-foreground hover:border-accent/40"
            }`}
          >
            <Repeat className="size-3.5" /> Replacement
          </button>
          <button
            type="button"
            onClick={() => onUpdate(r.id, { resolution_type: "refund" })}
            className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${
              resolution === "refund"
                ? "border-amber-400 bg-amber-400/15 text-amber-400"
                : "border-border bg-background text-muted-foreground hover:border-amber-400/40"
            }`}
          >
            <Wallet className="size-3.5" /> Refund
          </button>
        </div>

        {resolution === "replacement" ? (
          <div className="mt-3">
            <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              Replacement Status
            </label>
            <select
              value={r.replacement_status}
              onChange={(e) => onUpdate(r.id, { replacement_status: e.target.value })}
              className="mt-1.5 w-full bg-background border border-border rounded-md px-3 py-2 min-h-[44px] text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent"
            >
              {REPLACEMENT_STATUSES.map((s) => (
                <option key={s} value={s}>replacement: {s}</option>
              ))}
            </select>
          </div>
        ) : (
          <div className="mt-3 space-y-2.5">
            <div className="flex items-start gap-2 rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-400">
              <AlertTriangle className="size-3.5 shrink-0 mt-0.5" />
              <span>Refunds should only be used when replacement is unavailable.</span>
            </div>
            <div className="flex items-center justify-between gap-2 text-xs">
              <span className="text-muted-foreground font-mono uppercase tracking-wider">Refund Eligible</span>
              <span className={`inline-flex items-center gap-1 text-[11px] font-mono uppercase tracking-wider px-2 py-1 rounded-full border ${
                refundEligible
                  ? "text-emerald-400 border-emerald-400/30 bg-emerald-400/10"
                  : "text-rose-400 border-rose-400/30 bg-rose-400/10"
              }`}>
                {refundEligible ? <ShieldCheck className="size-3" /> : <ShieldX className="size-3" />}
                {refundEligible ? "Yes" : "No"}
              </span>
            </div>
          </div>
        )}
      </section>

      <div className="sticky bottom-0 -mx-4 sm:-mx-6 -mb-4 sm:-mb-6 px-4 sm:px-6 pt-3 pb-4 bg-gradient-to-t from-background via-background/95 to-transparent backdrop-blur-sm border-t border-border/40">
        {r.status === "requested" && (
          <div className="flex flex-wrap gap-2 mb-2">
            <button
              onClick={() => onUpdate(r.id, { status: "approved" })}
              className="flex-1 min-w-[120px] min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 px-3 py-2.5 text-[11px] font-mono uppercase tracking-widest hover:bg-emerald-400/20 transition-colors"
            >
              <Check className="size-3.5" /> Approve
            </button>
            <button
              onClick={() => onUpdate(r.id, { status: "rejected" })}
              className="flex-1 min-w-[120px] min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-400 px-3 py-2.5 text-[11px] font-mono uppercase tracking-widest hover:bg-rose-400/20 transition-colors"
            >
              <X className="size-3.5" /> Reject
            </button>
          </div>
        )}
        <div className={`grid grid-cols-1 gap-2 ${resolution === "refund" ? "sm:grid-cols-3" : ""}`}>
          <select
            value={r.status}
            onChange={(e) => onUpdate(r.id, { status: e.target.value })}
            className="bg-background border border-border rounded-md px-3 py-2 min-h-[44px] text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent"
          >
            {RETURN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          {resolution === "refund" && (
            <>
              <input
                type="number"
                step="0.01"
                defaultValue={r.refund_amount}
                placeholder="Refund"
                onBlur={(e) => Number(e.target.value) !== Number(r.refund_amount) && onUpdate(r.id, { refund_amount: Number(e.target.value) })}
                className="bg-background border border-border rounded-md px-3 py-2 min-h-[44px] text-xs focus:outline-none focus:border-accent font-mono"
              />
              <select
                value={r.refund_status}
                onChange={(e) => onUpdate(r.id, { refund_status: e.target.value })}
                className="bg-background border border-border rounded-md px-3 py-2 min-h-[44px] text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent"
              >
                {REFUND_STATUSES.map((s) => <option key={s} value={s}>refund: {s}</option>)}
              </select>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
