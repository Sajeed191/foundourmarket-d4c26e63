import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Package, Search, Loader2, CheckCircle2, Truck, Clock, XCircle,
  Sparkles, ShieldCheck, MapPin, Radio, MessageCircle, Mail, HelpCircle,
  PackageCheck, PackageOpen, Send, Zap, ChevronRight, Navigation, Timer,
  Activity, Wind,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { trackOrder } from "@/lib/track-order.functions";
import { useRegion } from "@/lib/region";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";

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
  { key: "pending", label: "Ordered", icon: PackageOpen, hint: "We received your order" },
  { key: "paid", label: "Packed", icon: PackageCheck, hint: "Carefully packed & sealed" },
  { key: "shipped", label: "Shipped", icon: Send, hint: "On the way to you" },
  { key: "out_for_delivery", label: "Out for delivery", icon: Truck, hint: "Driver near your area" },
  { key: "delivered", label: "Delivered", icon: CheckCircle2, hint: "Enjoy your order" },
] as const;

const TRUST = [
  { icon: ShieldCheck, label: "Secure Tracking" },
  { icon: ShieldCheck, label: "Buyer Protection" },
  { icon: Radio, label: "Live Updates" },
  { icon: MessageCircle, label: "24/7 Support" },
];

const AI_INSIGHTS = [
  { icon: Zap, text: "Your package may arrive earlier than expected." },
  { icon: MapPin, text: "Driver is currently near your delivery zone." },
  { icon: Sparkles, text: "High delivery success rate in your region." },
];

const RECENT_KEY = "fom_recent_tracked";

function TrackPage() {
  const track = useServerFn(trackOrder);
  const { format } = useRegion();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const [recent, setRecent] = useState<{ orderId: string; email: string }[]>([]);

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
      }
    },
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    m.mutate({ orderId: orderId.trim(), email: email.trim() });
  };

  const result = m.data;
  const currentStatusIdx = result?.found
    ? Math.max(0, STATUSES.findIndex((s) => s.key === result.order.status))
    : -1;
  const cancelled = result?.found && result.order.status === "cancelled";

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
              <div aria-hidden className="absolute -top-20 -right-20 w-60 h-60 rounded-full blur-3xl opacity-30"
                style={{ background: "radial-gradient(circle, var(--color-accent), transparent 70%)" }} />

              <div className="flex items-start justify-between gap-3 mb-5 relative">
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Order</p>
                  <p className="font-mono text-sm break-all">{result.order.id}</p>
                </div>
                <div className="text-right shrink-0">
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Placed</p>
                  <p className="font-mono text-sm">{new Date(result.order.created_at).toLocaleDateString()}</p>
                </div>
              </div>

              {result.items[0]?.image && (
                <div className="flex items-center gap-3 mb-5 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/5">
                  <img src={result.items[0].image} alt="" className="size-14 rounded-xl object-cover ring-1 ring-white/10" />
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
              ) : (
                <Timeline currentIdx={currentStatusIdx} />
              )}
            </motion.div>

            {/* Carrier + ETA Countdown */}
            {!cancelled && (
              <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                <CarrierEta orderId={result.order.id} progress={currentStatusIdx} />
              </motion.div>
            )}

            {/* Live Delivery Map */}
            {!cancelled && currentStatusIdx >= 2 && (
              <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                <LiveMap progress={currentStatusIdx} />
              </motion.div>
            )}

            {/* Live activity feed */}
            {!cancelled && (
              <motion.div variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}>
                <LiveFeed />
              </motion.div>
            )}



            {/* AI Insights */}
            {!cancelled && (
              <motion.div
                variants={{ hidden: { opacity: 0, y: 14 }, show: { opacity: 1, y: 0 } }}
                className="relative glass-strong rounded-3xl p-5 ring-1 ring-white/10 overflow-hidden"
              >
                <div className="flex items-center gap-2 mb-4">
                  <div className="size-7 rounded-full grid place-items-center bg-accent/15 text-accent">
                    <Sparkles className="size-3.5" />
                  </div>
                  <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">AI Delivery Insights</p>
                </div>
                <ul className="space-y-2.5">
                  {AI_INSIGHTS.map(({ icon: Icon, text }, i) => (
                    <motion.li
                      key={text}
                      initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }}
                      transition={{ delay: 0.1 + i * 0.1 }}
                      className="flex items-start gap-3 p-3 rounded-2xl bg-white/[0.03] ring-1 ring-white/5"
                    >
                      <Icon className="size-4 text-accent mt-0.5 shrink-0" />
                      <span className="text-xs sm:text-sm text-foreground/90">{text}</span>
                    </motion.li>
                  ))}
                </ul>
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
                    {it.image && <img src={it.image} alt="" className="size-12 rounded-xl object-cover ring-1 ring-white/10" />}
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
        {result?.found && !cancelled && (
          <motion.div
            initial={{ opacity: 0, y: 12 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}
            className="mt-10"
          >
            <div className="flex items-center gap-2 mb-3 px-1">
              <Sparkles className="size-3.5 text-accent" />
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">You may also love</p>
            </div>
            <RecommendationStrip slug="recommended" title="" />
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
      <ol className="relative grid grid-cols-5 gap-1">
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
