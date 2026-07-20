import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import {
  Package, Search, Loader2, CheckCircle2, Truck, XCircle,
  ShieldCheck, MapPin, Radio, MessageCircle, Mail, HelpCircle,
  PackageCheck, PackageOpen, Send, ChevronRight, Navigation,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trackOrder } from "@/lib/track-order.functions";
import { computeEta } from "@/lib/courier-sync.service";
import { useRegion } from "@/lib/region";
import { safeExternalUrl } from "@/lib/safe-redirect";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

export const Route = createFileRoute("/track")({
  head: () => ({
    meta: [
      { title: "Track Your Order — FoundOurMarket™" },
      { name: "description", content: "Real-time premium order tracking with AI delivery insights." },
      { property: "og:title", content: "Track Your Order — FoundOurMarket™" },
      { property: "og:description", content: "Real-time premium order tracking with AI delivery insights." },
    ],
  }),
  component: TrackPage,
});

const STATUSES = [
  { key: "pending", label: "Order Placed", icon: PackageOpen, hint: "We received your order" },
  { key: "packed", label: "Packed", icon: PackageCheck, hint: "Carefully packed & sealed" },
  { key: "shipped", label: "Shipped", icon: Send, hint: "Handed to courier" },
  { key: "in_transit", label: "In Transit", icon: Navigation, hint: "On the way to you" },
  { key: "out_for_delivery", label: "Out for delivery", icon: Truck, hint: "Driver near your area" },
  { key: "delivered", label: "Delivered", icon: CheckCircle2, hint: "Enjoy your order" },
] as const;

// Map a shipment status (or order status fallback) onto the 6-step tracker.
const SHIP_STEP: Record<string, number> = {
  pending: 0,
  paid: 1,
  packed: 1,
  shipped: 2,
  in_transit: 3,
  out_for_delivery: 4,
  delivered: 5,
};

// Human labels for every shipment lifecycle status.
const SHIP_LABEL: Record<string, string> = {
  pending: "Pending",
  packed: "Packed",
  shipped: "Shipped",
  in_transit: "In Transit",
  out_for_delivery: "Out for Delivery",
  delivered: "Delivered",
  returned: "Returned",
  cancelled: "Cancelled",
  failed_delivery: "Failed Delivery",
};

const TRUST = [
  { icon: ShieldCheck, label: "Secure Tracking" },
  { icon: ShieldCheck, label: "Buyer Protection" },
  { icon: Radio, label: "Live Updates" },
  { icon: MessageCircle, label: "24/7 Support" },
];

type ShipAddress = {
  full_name?: string; phone?: string; line1?: string; line2?: string;
  city?: string; state?: string; postal?: string; country?: string;
} | null;

const RECENT_KEY = "fom_recent_tracked";

function TrackPage() {
  const track = useServerFn(trackOrder);
  const { format } = useRegion();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [recent, setRecent] = useState<{ orderId: string; email: string }[]>([]);
  const [active, setActive] = useState<{ orderId: string; email: string } | null>(null);
  const [lastUpdated, setLastUpdated] = useState<number | null>(null);
  const [tick, setTick] = useState(0);
  const prevStatusRef = useRef<string | null>(null);
  const { slugs: recentSlugs } = useRecentlyViewed();

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch {}
  }, []);

  const m = useMutation({
    mutationFn: (vars: { orderId: string; email: string }) => track({ data: vars }),
    onSuccess: (data, vars) => {
      if (data?.found) {
        try {
          const next = [vars, ...recent.filter((r) => r.orderId !== vars.orderId)].slice(0, 4);
          localStorage.setItem(RECENT_KEY, JSON.stringify(next));
          setRecent(next);
        } catch {}
        setActive(vars);
        prevStatusRef.current = data.order.status;
        setLastUpdated(Date.now());
      } else {
        setActive(null);
        const reason = (data as { reason?: string })?.reason;
        if (reason === "email_mismatch") {
          toast.error("Email doesn't match", { description: "The email you entered doesn't match this order." });
        } else if (reason === "invalid_id") {
          toast.error("Invalid Order ID", { description: "Check the Order ID from your confirmation email." });
        } else {
          toast.error("Order not found", { description: "We couldn't find an order with those details." });
        }
      }
    },
  });

  // Prefill + auto-track when arriving from the Help Center Track card.
  useEffect(() => {
    try {
      const raw = sessionStorage.getItem("fom_track_prefill");
      if (!raw) return;
      sessionStorage.removeItem("fom_track_prefill");
      const { orderId: oid, email: eml } = JSON.parse(raw) as { orderId?: string; email?: string };
      if (oid) setOrderId(oid);
      if (eml) setEmail(eml);
      if (oid && eml) {
        setActive(null);
        prevStatusRef.current = null;
        m.mutate({ orderId: oid.trim(), email: eml.trim() });
      }
    } catch { /* ignore */ }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Prefill order ID from URL query param (e.g. scanned invoice QR).
  useEffect(() => {
    try {
      const params = new URLSearchParams(window.location.search);
      const oid = params.get("order");
      if (oid) {
        setOrderId(oid);
        // Scroll to form so user sees the pre-filled field.
        const form = document.querySelector("form");
        if (form) form.scrollIntoView({ behavior: "smooth", block: "center" });
      }
    } catch { /* ignore */ }
  }, []);

  // Real-time polling — refetch every 6s while a tracking session is active
  const liveQuery = useQuery({
    queryKey: ["track-live", active?.orderId, active?.email],
    queryFn: () => track({ data: active! }),
    enabled: !!active,
    refetchInterval: (q) => {
      const d = q.state.data;
      if (d?.found && (d.order.status === "delivered" || d.order.status === "cancelled")) return false;
      return 6000;
    },
    refetchIntervalInBackground: false,
    refetchOnWindowFocus: true,
    staleTime: 0,
  });

  // Detect status changes from the polling stream and notify
  useEffect(() => {
    const data = liveQuery.data;
    if (!data?.found) return;
    setLastUpdated(Date.now());
    const next = data.order.status;
    const prev = prevStatusRef.current;
    if (prev && prev !== next) {
      const labelEntry = STATUSES.find((s) => s.key === next);
      const label = labelEntry?.label ?? next;
      if (next === "cancelled") {
        toast.error("Order cancelled", { description: `Order #${data.order.id.slice(0, 8)} was cancelled.` });
      } else if (next === "delivered") {
        toast.success("Delivered!", { description: "Your order has arrived. Enjoy ✨" });
      } else {
        toast(`Status update: ${label}`, { description: labelEntry?.hint });
      }
    }
    prevStatusRef.current = next;
  }, [liveQuery.data]);

  // 1s ticker so the "updated Ns ago" badge stays fresh
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [active]);

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setActive(null);
    prevStatusRef.current = null;
    m.mutate({ orderId: orderId.trim(), email: email.trim() });
  };

  // Live data takes precedence over the initial mutation response
  const result = liveQuery.data ?? m.data;
  const secsAgo = lastUpdated ? Math.max(0, Math.floor((Date.now() - lastUpdated) / 1000)) : null;
  void tick; // keep dependency to re-render every second

  // Prefer the real shipment status, then the order's fulfillment status,
  // then the raw order status — so the tracker reflects warehouse updates.
  const liveStatus = result?.found
    ? (result.shipment?.status ?? result.order.fulfillment_status ?? result.order.status)
    : null;
  const currentStatusIdx = liveStatus
    ? (SHIP_STEP[liveStatus] ?? Math.max(0, STATUSES.findIndex((s) => s.key === liveStatus)))
    : -1;
  const cancelled =
    result?.found &&
    (result.shipment?.status === "cancelled" || result.order.status === "cancelled");
  const returned = result?.found && result.shipment?.status === "returned";
  const failed = result?.found && result.shipment?.status === "failed_delivery";

  return (
    <div className="relative min-h-screen pb-24">
      {/* Ambient cinematic background */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-3xl opacity-30"
          style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.5), transparent 60%)" }} />
        <div className="absolute top-1/3 -right-40 w-[420px] h-[420px] rounded-full blur-3xl opacity-20"
          style={{ background: "radial-gradient(circle, oklch(0.78 0.17 60 / 0.4), transparent 60%)" }} />
      </div>

      <div className="max-w-3xl mx-auto px-4 sm:px-6 pt-8 sm:pt-14">
        {/* Hero */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
          className="text-center mb-8"
        >
          <div className="inline-flex items-center gap-2 glass rounded-full px-3 py-1.5 ring-1 ring-white/10 mb-4">
            <span className="relative flex size-1.5">
              <span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />
              <span className="relative rounded-full bg-accent size-1.5" />
            </span>
            <span className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Live Tracking</span>
          </div>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight mb-2">Track your order</h1>
          <p className="text-sm text-muted-foreground max-w-md mx-auto">Real-time shipment intelligence — from our hands to yours.</p>
        </motion.div>

        {/* Form Card */}
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.05 }}
          className="relative glass-strong rounded-3xl p-5 sm:p-7 ring-1 ring-white/10 shadow-[var(--shadow-float)] space-y-4 overflow-hidden"
        >
          <div aria-hidden className="absolute inset-x-0 -top-px h-px bg-gradient-to-r from-transparent via-accent/60 to-transparent" />

          <Field label="Order ID" mono>
            <input
              value={orderId}
              onChange={(e) => setOrderId(e.target.value)}
              required minLength={6}
              placeholder="e.g. 8f3c2a1b-…"
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3.5 text-sm font-mono outline-none transition-all focus:border-accent/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-accent/20"
            />
          </Field>
          <Field label="Email used at checkout">
            <input
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              type="email" required
              placeholder="you@example.com"
              className="w-full bg-white/[0.03] border border-white/10 rounded-2xl px-4 py-3.5 text-sm outline-none transition-all focus:border-accent/60 focus:bg-white/[0.05] focus:ring-2 focus:ring-accent/20"
            />
          </Field>

          <motion.button
            type="submit"
            disabled={m.isPending}
            whileTap={{ scale: 0.97 }}
            className="relative w-full overflow-hidden bg-accent text-accent-foreground font-bold py-3.5 rounded-full text-xs uppercase tracking-[0.2em] disabled:opacity-60 inline-flex items-center justify-center gap-2 shadow-[0_10px_30px_-12px_var(--color-accent),0_0_0_1px_oklch(1_0_0/0.1)_inset] transition-transform"
          >
            {m.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Locating shipment…
              </>
            ) : (
              <>
                <Search className="size-4" />
                Track Order
              </>
            )}
            <span aria-hidden className="absolute inset-0 -translate-x-full hover:translate-x-full transition-transform duration-700 bg-gradient-to-r from-transparent via-white/25 to-transparent" />
          </motion.button>

          {/* Trust pills */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2">
            {TRUST.map(({ icon: Icon, label }) => (
              <div key={label} className="flex items-center gap-2 glass rounded-full px-3 py-2 ring-1 ring-white/5">
                <Icon className="size-3.5 text-accent shrink-0" />
                <span className="text-[10px] font-mono uppercase tracking-wider truncate">{label}</span>
              </div>
            ))}
          </div>
        </motion.form>

        {/* Recently tracked */}
        {!result && recent.length > 0 && (
          <div className="mt-8">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground mb-3 px-1">Recently tracked</p>
            <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {recent.map((r) => (
                <button
                  key={r.orderId}
                  onClick={() => { setOrderId(r.orderId); setEmail(r.email); m.mutate(r); }}
                  className="shrink-0 glass rounded-2xl px-4 py-3 ring-1 ring-white/10 text-left hover:bg-white/[0.05] transition-colors"
                >
                  <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Order</p>
                  <p className="text-xs font-mono truncate max-w-[180px]">{r.orderId}</p>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Error */}
        {m.isError && (
          <p className="mt-6 text-center text-sm text-destructive">Something went wrong. Please try again.</p>
        )}

        {/* Loading skeleton */}
        <AnimatePresence>
          {m.isPending && (
            <motion.div
              initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-8 glass-strong rounded-3xl p-6 ring-1 ring-white/10 space-y-5"
            >
              <Shimmer className="h-4 w-1/3" />
              <Shimmer className="h-3 w-1/2" />
              <div className="grid grid-cols-5 gap-2 pt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <div key={i} className="flex flex-col items-center gap-2">
                    <Shimmer className="size-10 rounded-full" />
                    <Shimmer className="h-2 w-10" />
                  </div>
                ))}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* No order */}
        {result && !result.found && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
            className="mt-8 glass-strong rounded-3xl p-8 ring-1 ring-white/10 text-center"
          >
            <div className="size-12 mx-auto rounded-full grid place-items-center bg-destructive/10 text-destructive mb-3">
              <XCircle className="size-6" />
            </div>
            <h3 className="font-display text-lg mb-1">No order found</h3>
            <p className="text-sm text-muted-foreground">Check that the order ID and email match exactly.</p>
          </motion.div>
        )}

        {/* Result */}
        {result?.found && (
          <motion.div
            initial="hidden" animate="show"
            variants={{ show: { transition: { staggerChildren: 0.08 } } }}
            className="mt-8 space-y-5"
          >
            {/* Order summary */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              className="relative glass-strong rounded-3xl p-5 sm:p-6 ring-1 ring-white/10 overflow-hidden"
            >

              <div className="flex items-start justify-between gap-3 mb-5 relative">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Order</p>
                  <p className="font-mono text-sm break-all">{result.order.id}</p>
                </div>
                <div className="text-right shrink-0">
                  {active && !cancelled ? (
                    <div className="inline-flex items-center gap-1.5 px-2 py-1 rounded-full bg-emerald-400/10 ring-1 ring-emerald-400/25 text-emerald-400">
                      <span className="relative flex size-1.5">
                        <span className={`absolute inset-0 rounded-full bg-emerald-400 ${liveQuery.isFetching ? "animate-ping" : "opacity-60"}`} />
                        <span className="relative rounded-full bg-emerald-400 size-1.5" />
                      </span>
                      <span className="text-[9px] font-mono uppercase tracking-widest">
                        {liveQuery.isFetching ? "Syncing" : secsAgo === null ? "Live" : `Live · ${secsAgo}s ago`}
                      </span>
                    </div>
                  ) : (
                    <>
                      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Placed</p>
                      <p className="font-mono text-sm">{new Date(result.order.created_at).toLocaleDateString()}</p>
                    </>
                  )}
                </div>
              </div>


              {result.items[0]?.image && (
                <div className="flex items-center gap-3 mb-5 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/5">
                  <img loading="lazy" decoding="async" src={result.items[0].image} alt={result.items[0].name} className="size-14 rounded-xl object-cover ring-1 ring-white/10" />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-medium truncate">{result.items[0].name}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {result.items.length} item{result.items.length > 1 ? "s" : ""} · {format(Number(result.order.total))}
                    </p>
                  </div>
                  <div className="inline-flex items-center gap-1 px-2 py-1 rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
                    <ShieldCheck className="size-3" />
                    <span className="text-[9px] font-mono uppercase tracking-wider">Protected</span>
                  </div>
                </div>
              )}

              {cancelled ? (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
                  <XCircle className="size-5 text-destructive" />
                  <span className="text-sm font-medium">This order was cancelled.</span>
                </div>
              ) : returned ? (
                <div className="flex items-center gap-3 p-4 bg-amber-500/10 border border-amber-500/30 rounded-2xl">
                  <Package className="size-5 text-amber-500" />
                  <span className="text-sm font-medium">This shipment was returned.</span>
                </div>
              ) : failed ? (
                <div className="flex items-center gap-3 p-4 bg-destructive/10 border border-destructive/30 rounded-2xl">
                  <XCircle className="size-5 text-destructive" />
                  <span className="text-sm font-medium">Delivery attempt failed — our team will retry shortly.</span>
                </div>
              ) : (
                <Timeline currentIdx={currentStatusIdx} />
              )}
            </motion.div>

            {/* Real shipment details: carrier, tracking number + link, ETA */}
            {result.shipment && (
              <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                <ShipmentDetails shipment={result.shipment} />
              </motion.div>
            )}

            {/* Real shipment event timeline */}
            {result.events.length > 0 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                <EventTimeline events={result.events} />
              </motion.div>
            )}

            {/* Delivery address (from the order) */}
            {result.order.shipping_address && (
              <motion.div
                variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                className="glass-strong rounded-3xl p-5 sm:p-6 ring-1 ring-white/10"
              >
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="size-4 text-accent" />
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Delivery address</p>
                </div>
                <DeliveryAddress address={result.order.shipping_address as ShipAddress} />
              </motion.div>
            )}


            {/* Items breakdown */}
            <motion.div
              variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
              className="glass-strong rounded-3xl p-5 sm:p-6 ring-1 ring-white/10"
            >
              <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent mb-4">Items</h3>
              <ul className="space-y-3">
                {result.items.map((it, i) => (
                  <li key={i} className="flex items-center gap-3">
                    {it.image && <img loading="lazy" decoding="async" src={it.image} alt={it.name} className="size-12 rounded-xl object-cover ring-1 ring-white/10" />}
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{it.name}</p>
                      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Qty {it.quantity}</p>
                    </div>
                    <p className="font-mono text-sm">{format(Number(it.line_total))}</p>
                  </li>
                ))}
              </ul>
              <div className="mt-5 pt-5 border-t border-white/10 space-y-1.5 text-sm">
                <Row label="Subtotal" value={format(Number(result.order.subtotal))} />
                {Number(result.order.discount) > 0 && <Row label="Discount" value={`− ${format(Number(result.order.discount))}`} />}
                <Row label="Shipping" value={format(Number(result.order.shipping))} />
                <Row label="Tax" value={format(Number(result.order.tax))} />
                <div className="flex justify-between pt-2 border-t border-white/10 font-bold">
                  <span>Total</span>
                  <span className="font-mono text-accent">{format(Number(result.order.total))}</span>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}

        {/* AI Shopping Intelligence */}
        {result?.found && !cancelled && recentSlugs.length > 0 && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="mt-2"
          >
            <RecommendationStrip
              title="You may also love"
              subtitle="AI picks based on your order"
              slugs={recentSlugs.slice(0, 8)}
            />
          </motion.div>
        )}



        {/* Support */}
        <motion.div
          initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
          className="mt-10"
        >
          <div className="flex items-end justify-between mb-3 px-1">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Need help?</p>
              <h3 className="font-display text-lg">Having trouble finding your order?</h3>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2.5">
            {[
              { icon: MessageCircle, label: "WhatsApp", hint: "Instant reply" },
              { icon: Radio, label: "Live chat", hint: "Online now" },
              { icon: Mail, label: "Email", hint: "< 1h response" },
              { icon: HelpCircle, label: "FAQ", hint: "Self-serve" },
            ].map(({ icon: Icon, label, hint }) => (
              <Link
                key={label} to="/help"
                className="group glass rounded-2xl p-3.5 ring-1 ring-white/10 flex items-center gap-3 hover:bg-white/[0.05] transition-colors"
              >
                <div className="size-9 rounded-xl grid place-items-center bg-accent/10 text-accent group-hover:bg-accent/20 transition-colors">
                  <Icon className="size-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-semibold truncate">{label}</p>
                  <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground truncate">{hint}</p>
                </div>
                <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
              </Link>
            ))}
          </div>
        </motion.div>
      </div>
    </div>
  );
}

function Field({ label, mono, children }: { label: string; mono?: boolean; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className={`text-[10px] uppercase tracking-[0.2em] text-muted-foreground ${mono ? "font-mono" : "font-mono"}`}>{label}</span>
      <div className="mt-2">{children}</div>
    </label>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between text-muted-foreground">
      <span>{label}</span>
      <span className="font-mono text-foreground">{value}</span>
    </div>
  );
}

function Shimmer({ className = "" }: { className?: string }) {
  return (
    <div className={`relative overflow-hidden rounded-md bg-white/[0.05] ${className}`}>
      <div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />
    </div>
  );
}

function Timeline({ currentIdx }: { currentIdx: number }) {
  const pct = useMemo(() => {
    if (currentIdx <= 0) return 0;
    return Math.min(100, (currentIdx / (STATUSES.length - 1)) * 100);
  }, [currentIdx]);

  return (
    <div className="relative">
      {/* Progress track */}
      <div className="absolute left-0 right-0 top-5 h-[2px] bg-white/10 rounded-full overflow-hidden">
        <motion.div
          initial={{ width: 0 }} animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full rounded-full"
          style={{ background: "linear-gradient(90deg, var(--color-accent), oklch(0.82 0.16 65))" }}
        />
      </div>
      <ol className="relative grid grid-cols-6 gap-1">
        {STATUSES.map((s, i) => {
          const done = i <= currentIdx;
          const active = i === currentIdx;
          const Icon = s.icon;
          return (
            <li key={s.key} className="flex flex-col items-center text-center">
              <motion.div
                initial={{ scale: 0.8, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.1 * i, type: "spring", stiffness: 320, damping: 22 }}
                className={`relative size-10 rounded-full grid place-items-center transition-colors ${
                  done
                    ? "bg-accent text-accent-foreground shadow-[0_0_18px_-2px_var(--color-accent)]"
                    : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/10"
                }`}
              >
                {active && (
                  <span aria-hidden className="absolute inset-0 rounded-full bg-accent/40 animate-ping" />
                )}
                <Icon className="size-4 relative" />
              </motion.div>
              <span className={`mt-2 text-[9px] sm:text-[10px] font-mono uppercase tracking-wider ${done ? "text-foreground" : "text-muted-foreground"}`}>
                {s.label}
              </span>
              {active && (
                <span className="mt-1 text-[9px] text-accent/90 leading-tight max-w-[80px]">{s.hint}</span>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}

function DeliveryAddress({ address }: { address: ShipAddress }) {
  if (!address) return null;
  const lines = [
    address.full_name,
    [address.line1, address.line2].filter(Boolean).join(", "),
    [address.city, address.state, address.postal].filter(Boolean).join(", "),
    address.country,
    address.phone ? `Phone: ${address.phone}` : null,
  ].filter(Boolean);
  return (
    <div className="space-y-0.5">
      {lines.map((l, i) => (
        <p key={i} className={`text-sm ${i === 0 ? "font-medium" : "text-muted-foreground"}`}>{l}</p>
      ))}
    </div>
  );
}



function Pill({ icon: Icon, label, hint }: { icon: typeof Truck; label: string; hint: string }) {
  return (
    <div className="glass rounded-2xl px-3 py-2.5 ring-1 ring-white/5">
      <div className="flex items-center gap-2">
        <Icon className="size-3.5 text-accent shrink-0" />
        <p className="text-[11px] font-semibold truncate">{label}</p>
      </div>
      <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">{hint}</p>
    </div>
  );
}

type ShipmentInfo = {
  id: string;
  status: string;
  carrier: string | null;
  carrierLabel: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  estimated_delivery: string | null;
  shipped_at: string | null;
  delivered_at: string | null;
  packed_at: string | null;
};

function ShipmentDetails({ shipment }: { shipment: ShipmentInfo }) {
  const eta = shipment.estimated_delivery
    ? new Date(shipment.estimated_delivery).toLocaleDateString(undefined, {
        weekday: "short", month: "short", day: "numeric",
      })
    : null;
  const etaState = computeEta({
    status: shipment.status,
    estimatedDelivery: shipment.estimated_delivery,
    actualDelivery: shipment.delivered_at,
  });
  const etaCls: Record<string, string> = {
    delivered: "border-emerald-400/30 bg-emerald-400/10 text-emerald-400",
    arriving_today: "border-violet-400/30 bg-violet-400/10 text-violet-400",
    on_schedule: "border-sky-400/30 bg-sky-400/10 text-sky-400",
    delayed: "border-destructive/30 bg-destructive/10 text-destructive",
    unknown: "border-border bg-muted/30 text-muted-foreground",
  };
  return (
    <div className="relative glass-strong rounded-3xl p-5 sm:p-6 ring-1 ring-white/10 overflow-hidden">
      <div className="flex items-center justify-between gap-3 mb-4">
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Shipment</p>
        <div className="flex items-center gap-1.5">
          <span className={`text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border ${etaCls[etaState.state]}`}>
            {etaState.label}
          </span>
          <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 rounded-full border border-accent/30 bg-accent/10 text-accent">
            {SHIP_LABEL[shipment.status] ?? shipment.status}
          </span>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Pill icon={Truck} label={shipment.carrierLabel ?? "Assigning…"} hint="Courier" />
        <Pill icon={Navigation} label={eta ?? "Calculating…"} hint="Est. delivery" />
      </div>
      {shipment.tracking_number && (
        <div className="mt-3 flex items-center justify-between gap-3 glass rounded-2xl px-4 py-3 ring-1 ring-white/5">
          <div className="min-w-0">
            <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Tracking #</p>
            <p className="text-sm font-mono truncate">{shipment.tracking_number}</p>
          </div>
          {safeExternalUrl(shipment.tracking_url) && (
            <a
              href={safeExternalUrl(shipment.tracking_url)!}
              target="_blank"
              rel="noopener noreferrer"
              className="shrink-0 inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-3 py-2 rounded-xl text-[10px] font-bold uppercase tracking-wider"
            >
              Track <ChevronRight className="size-3.5" />
            </a>
          )}
        </div>
      )}
    </div>
  );
}

type ShipEvent = {
  id: string;
  status: string;
  description: string | null;
  location: string | null;
  occurred_at: string | null;
  created_at: string;
};

function EventTimeline({ events }: { events: ShipEvent[] }) {
  const ordered = [...events].reverse(); // newest first
  return (
    <div className="relative glass-strong rounded-3xl p-5 sm:p-6 ring-1 ring-white/10">
      <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent mb-4">Shipment timeline</p>
      <ol className="relative space-y-4 before:absolute before:left-[7px] before:top-1 before:bottom-1 before:w-px before:bg-white/10">
        {ordered.map((e, i) => (
          <li key={e.id} className="relative pl-7">
            <span
              className={`absolute left-0 top-0.5 size-3.5 rounded-full ring-2 ring-background ${
                i === 0 ? "bg-accent" : "bg-white/30"
              }`}
            />
            <p className="text-sm font-medium">{SHIP_LABEL[e.status] ?? e.status}</p>
            {e.description && (
              <p className="text-xs text-muted-foreground">{e.description}</p>
            )}
            <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mt-0.5">
              {new Date(e.occurred_at ?? e.created_at).toLocaleString([], {
                month: "short", day: "numeric", hour: "numeric", minute: "2-digit",
              })}
              {e.location ? ` · ${e.location}` : ""}
            </p>
          </li>
        ))}
      </ol>
    </div>
  );
}

