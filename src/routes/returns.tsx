import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useMutation } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Search, Loader2, CheckCircle2, XCircle, Clock,
  Sparkles, ShieldCheck, MessageCircle, Mail, HelpCircle, Package,
  Timer, Bot, Wrench, BadgeCheck, Lock,
  LifeBuoy, ArrowRight, Repeat, Store, Truck, CreditCard, ShieldHalf,
} from "lucide-react";
import { motion, AnimatePresence, useMotionValue, useSpring, useTransform } from "framer-motion";
import { trackOrder } from "@/lib/track-order.functions";
import { useRegion } from "@/lib/region";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { ReturnCenterSections } from "@/components/site/ReturnCenterSections";
import { PolicyCrossLinks } from "@/components/site/PolicyLinks";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

export const Route = createFileRoute("/returns")({
  head: () => ({
    meta: [
      { title: "Return Eligibility Center — FoundOurMarket™" },
      { name: "description", content: "Check return eligibility, request exchanges, and access AI-powered post-purchase support. 4-day return window on selected products." },
      { property: "og:title", content: "Return Eligibility Center — FoundOurMarket™" },
      { property: "og:description", content: "Premium intelligent return management — transparent, trustworthy, AI-assisted." },
      { property: "og:url", content: "https://foundourmarket.com/returns" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/returns" }],
  }),
  component: ReturnsPage,
});

const TRUST = [
  { icon: ShieldCheck, label: "Buyer Protection" },
  { icon: Lock, label: "Secure Refunds" },
  { icon: BadgeCheck, label: "Verified Sellers" },
  { icon: Wrench, label: "Warranty Support" },
  { icon: CreditCard, label: "Protected Checkout" },
  { icon: ShieldHalf, label: "Exchange Guarantee" },
];

const POLICY_NOTES = [
  "FoundOurMarket operates on a replacement-first policy — eligible items are replaced rather than refunded.",
  "Eligible products may be returned within 4 days of successful delivery.",
  "You can request a replacement if the product is defective, damaged, the wrong item, or doesn't fit.",
  "Refunds are issued only when a replacement is unavailable, and all refund requests are subject to review and approval.",
];

const SUPPORT_OPTIONS = [
  { icon: Wrench, title: "Warranty Claim", desc: "Manufacturer-backed coverage" },
  { icon: Repeat, title: "Replacement", desc: "Get a like-for-like swap" },
  { icon: Store, title: "Seller Assistance", desc: "Talk directly to the seller" },
  { icon: ShieldCheck, title: "Damage Protection", desc: "Covered shipments only" },
];

// Deterministic per-slug categorization → richer eligibility states
type ProductPolicy = "eligible" | "exchange_only" | "seller_approval" | "warranty_only" | "non_returnable";

function classifyProduct(slug: string): ProductPolicy {
  if (!slug) return "non_returnable";
  const lower = slug.toLowerCase();
  if (/(intimate|hygiene|cosmetic|food|consumable|gift-card|digital|custom|personalized|clearance|final-sale)/.test(lower)) return "non_returnable";
  if (/(electronic|appliance|tv|laptop|phone|camera|watch|audio|speaker|headphone)/.test(lower)) return "warranty_only";
  let h = 0;
  for (let i = 0; i < lower.length; i++) h = (h * 31 + lower.charCodeAt(i)) >>> 0;
  const bucket = h % 10;
  if (bucket < 6) return "eligible";
  if (bucket < 8) return "exchange_only";
  return "seller_approval";
}

type EligibilityStatus =
  | { kind: "eligible"; hoursLeft: number }
  | { kind: "expired" }
  | { kind: "exchange_only" }
  | { kind: "seller_approval" }
  | { kind: "warranty_only" }
  | { kind: "non_returnable" }
  | { kind: "not_delivered" };

function computeEligibility(productSlug: string, deliveredAt: Date | null): EligibilityStatus {
  const policy = classifyProduct(productSlug);
  if (policy === "non_returnable") return { kind: "non_returnable" };
  if (policy === "warranty_only") return { kind: "warranty_only" };
  if (policy === "exchange_only") return { kind: "exchange_only" };
  if (policy === "seller_approval") return { kind: "seller_approval" };
  if (!deliveredAt) return { kind: "not_delivered" };
  const hoursElapsed = (Date.now() - deliveredAt.getTime()) / 36e5;
  const hoursLeft = 96 - hoursElapsed;
  if (hoursLeft <= 0) return { kind: "expired" };
  return { kind: "eligible", hoursLeft };
}

function sellerFromSlug(slug: string): string {
  const names = ["Aether Studio", "Nordic Atelier", "Maison Cinq", "Lume & Co.", "Atelier Nord", "Verde Market", "Kintsugi Lab", "Helio Goods"];
  let h = 0;
  for (let i = 0; i < (slug || "x").length; i++) h = (h * 31 + slug.charCodeAt(i)) >>> 0;
  return names[h % names.length];
}

function ReturnsPage() {
  const track = useServerFn(trackOrder);
  const { format } = useRegion();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");
  const { slugs: recentSlugs } = useRecentlyViewed();

  const m = useMutation({
    mutationFn: (vars: { orderId: string; email: string }) => track({ data: vars }),
  });

  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim() || !email.trim()) return;
    m.mutate({ orderId: orderId.trim(), email: email.trim() });
  };

  const order = m.data?.found ? m.data.order : null;
  const items = m.data?.found ? m.data.items : [];
  const deliveredAt = order?.status === "delivered" ? new Date(order.updated_at) : null;

  return (
    <div className="relative min-h-screen overflow-hidden" style={{ background: "#050816" }}>
      {/* Cinematic atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute inset-0" style={{
          background: "radial-gradient(70% 55% at 50% -5%, rgba(255,122,0,0.22), transparent 70%), radial-gradient(45% 45% at 92% 28%, rgba(255,159,67,0.12), transparent 70%), radial-gradient(55% 55% at 8% 82%, rgba(255,122,0,0.10), transparent 70%)"
        }} />
        <div className="absolute inset-0 opacity-[0.035]" style={{
          backgroundImage: "linear-gradient(rgba(255,255,255,.6) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,.6) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }} />
        {/* Vignette */}
        <div className="absolute inset-0" style={{ background: "radial-gradient(120% 80% at 50% 50%, transparent 60%, rgba(0,0,0,0.55) 100%)" }} />
        <Particles />
      </div>

      <div className="container-page max-w-5xl py-10 sm:py-16 px-4 sm:px-6">
        {/* Header */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>
          <div className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">
            <Sparkles className="size-3" />
            <span>Return Eligibility Center</span>
          </div>
          <h1 className="text-fluid-3xl font-display font-semibold tracking-tight text-white">
            Premium return management,<br className="hidden sm:block" />
            <span className="text-accent">made transparent.</span>
          </h1>
          <p className="text-sm sm:text-base text-white/60 mt-3 max-w-xl">
            Look up your order to check eligibility, view your live return window, and access exchange, warranty and seller support — all in one intelligent place.
          </p>
        </motion.div>

        {/* Trust strip */}
        <motion.div
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}
          className="flex gap-2 sm:gap-3 mt-6 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1"
        >
          {TRUST.map(({ icon: Icon, label }) => (
            <div key={label} className="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 ring-1 ring-white/10 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.03)" }}>
              <Icon className="size-3.5 text-accent" />
              <span className="text-[11px] font-medium text-white/80 whitespace-nowrap">{label}</span>
            </div>
          ))}
        </motion.div>

        {/* Lookup card */}
        <motion.form
          onSubmit={onSubmit}
          initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.15 }}
          className="relative mt-8 rounded-3xl p-5 sm:p-7 ring-1 ring-white/10 backdrop-blur-xl"
          style={{ background: "rgba(255,255,255,0.03)", boxShadow: "0 30px 80px -30px rgba(255,122,0,0.3)" }}
        >
          <div className="absolute -inset-px rounded-3xl pointer-events-none opacity-70" style={{
            background: "linear-gradient(135deg, rgba(255,122,0,0.22), transparent 40%, rgba(255,159,67,0.14))",
            WebkitMask: "linear-gradient(#000, #000) content-box, linear-gradient(#000, #000)",
            WebkitMaskComposite: "xor", padding: 1,
          }} />
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Check eligibility</p>
          <div className="grid grid-cols-1 sm:grid-cols-[1.2fr_1fr_auto] gap-2.5">
            <div className="relative">
              <Package className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input
                value={orderId} onChange={(e) => setOrderId(e.target.value)}
                placeholder="Order ID"
                className="w-full h-12 pl-9 pr-3 rounded-xl bg-black/40 ring-1 ring-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-accent/60 transition"
              />
            </div>
            <div className="relative">
              <Mail className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input
                value={email} onChange={(e) => setEmail(e.target.value)}
                placeholder="Order email"
                type="email"
                className="w-full h-12 pl-9 pr-3 rounded-xl bg-black/40 ring-1 ring-white/10 text-sm text-white placeholder:text-white/30 focus:outline-none focus:ring-accent/60 transition"
              />
            </div>
            <MagneticButton type="submit" disabled={m.isPending}>
              {m.isPending ? <Loader2 className="size-4 animate-spin" /> : <Search className="size-4" />}
              <span>Check</span>
            </MagneticButton>
          </div>
          <p className="text-[11px] text-white/40 mt-3 font-mono">4-day return window · Selected products only</p>
        </motion.form>

        {/* Results */}
        <AnimatePresence mode="wait">
          {m.isPending && (
            <motion.div key="loading" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="mt-8 space-y-3">
              {[0, 1, 2].map((i) => (
                <Shimmer key={i} />
              ))}
            </motion.div>
          )}

          {m.data && !m.data.found && (
            <motion.div
              key="notfound"
              initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-8 rounded-3xl p-8 sm:p-10 text-center ring-1 ring-white/10 backdrop-blur-xl"
              style={{ background: "rgba(255,255,255,0.03)" }}
            >
              <div className="mx-auto size-14 grid place-items-center rounded-full bg-accent/10 ring-1 ring-accent/30 mb-4">
                <HelpCircle className="size-6 text-accent" />
              </div>
              <h2 className="text-lg font-semibold text-white">We couldn't match that order</h2>
              <p className="text-sm text-white/60 mt-1.5 max-w-md mx-auto">
                Double-check your Order ID and the email used at checkout. Our support team can help if it still doesn't show up.
              </p>
              <div className="flex flex-wrap justify-center gap-2 mt-5">
                <Link to="/help" className="rounded-full px-4 py-2 text-xs font-medium text-white ring-1 ring-white/15 hover:bg-white/5 transition">Contact Support</Link>
                <Link to="/" className="rounded-full px-4 py-2 text-xs font-medium text-black hover:brightness-110 transition" style={{ background: "linear-gradient(135deg,#FF7A00,#FF9F43)" }}>Continue Shopping</Link>
              </div>
            </motion.div>
          )}

          {order && m.data?.found && (
            <motion.div
              key="results"
              initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              transition={{ duration: 0.4 }}
              className="mt-8 space-y-5"
            >
              {/* Order summary */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="relative rounded-3xl p-5 sm:p-6 ring-1 ring-white/10 backdrop-blur-xl overflow-hidden"
                style={{ background: "linear-gradient(135deg, rgba(255,122,0,0.06), rgba(255,255,255,0.03))" }}
              >
                <div className="flex items-start justify-between flex-wrap gap-4">
                  <div className="min-w-0">
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">Order</p>
                    <p className="text-base font-semibold text-white mt-1 font-mono">#{order.id.slice(0, 8).toUpperCase()}</p>
                    <div className="flex items-center gap-2 mt-2">
                      <Truck className="size-3.5 text-accent" />
                      <p className="text-xs text-white/60">
                        {order.status === "delivered" ? `Delivered · ${new Date(order.updated_at).toLocaleDateString()}` : `Status · ${order.status}`}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40">Total</p>
                    <p className="text-base font-semibold text-white mt-1 font-mono">{format(Number(order.total))}</p>
                    <p className="text-[11px] text-white/40 mt-1">{items.length} item{items.length === 1 ? "" : "s"}</p>
                  </div>
                </div>
              </motion.div>

              {/* Per-item eligibility */}
              <div className="space-y-3">
                {items.map((it, idx) => {
                  const status = computeEligibility(it.product_slug, deliveredAt);
                  return (
                    <EligibilityCard key={idx} item={it} status={status} delay={idx * 0.06} />
                  );
                })}
              </div>

              {/* AI Assistant */}
              <motion.div
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
                className="relative rounded-3xl p-5 sm:p-6 ring-1 ring-accent/20 backdrop-blur-xl overflow-hidden"
                style={{ background: "linear-gradient(135deg, rgba(255,122,0,0.10), rgba(255,255,255,0.03))" }}
              >
                <div className="relative flex items-start gap-4">
                  <div className="shrink-0 relative">
                    <div className="size-11 grid place-items-center rounded-2xl bg-accent/15 ring-1 ring-accent/30">
                      <Bot className="size-5 text-accent" />
                    </div>
                    <span className="absolute -top-0.5 -right-0.5 size-2.5 rounded-full bg-emerald-400 ring-2 ring-[#050816] animate-pulse" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold text-white">AI Support Assistant</p>
                      <span className="text-[9px] font-mono uppercase tracking-[0.2em] px-1.5 py-0.5 rounded-full bg-accent/20 text-accent">Live</span>
                    </div>
                    <p className="text-xs text-white/60 mt-1">
                      I can check exchange eligibility, warranty support, or seller protection options for any item above.
                    </p>
                    <div className="flex flex-wrap gap-2 mt-3">
                      {["Check exchange options", "Warranty status", "Talk to seller", "Replacement quote"].map((s) => (
                        <button key={s} className="text-[11px] rounded-full px-3 py-1.5 ring-1 ring-white/15 text-white/85 hover:bg-white/5 hover:ring-accent/40 active:scale-95 transition">
                          {s}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              </motion.div>

              {/* Alternative support */}
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 mb-3 px-1">Other support options</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                  {SUPPORT_OPTIONS.map(({ icon: Icon, title, desc }) => (
                    <button key={title} className="text-left rounded-2xl p-4 ring-1 ring-white/10 backdrop-blur-md hover:ring-accent/40 hover:bg-white/[0.04] active:scale-[0.98] transition group" style={{ background: "rgba(255,255,255,0.03)" }}>
                      <Icon className="size-4 text-accent mb-2 group-hover:scale-110 transition-transform" />
                      <p className="text-xs font-semibold text-white">{title}</p>
                      <p className="text-[10px] text-white/50 mt-0.5">{desc}</p>
                    </button>
                  ))}
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Policy explanation (always visible) */}
        <motion.section
          initial={{ opacity: 0, y: 10 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }} transition={{ duration: 0.5 }}
          className="mt-10 rounded-3xl p-5 sm:p-7 ring-1 ring-white/10 backdrop-blur-xl"
          style={{ background: "rgba(255,255,255,0.03)" }}
        >
          <div className="flex items-center gap-2 mb-4">
            <ShieldCheck className="size-4 text-accent" />
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Return Policy</p>
          </div>
          <ul className="space-y-3">
            {POLICY_NOTES.map((n, i) => (
              <li key={n} className="flex gap-3 text-sm text-white/75">
                <CheckCircle2 className="size-4 text-accent shrink-0 mt-0.5" />
                <span>{n}</span>
                {i < POLICY_NOTES.length - 1 && null}
              </li>
            ))}
          </ul>
        </motion.section>

        {/* Smart actions */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 mt-6">
          {[
            { to: "/help", label: "Contact Support", icon: MessageCircle },
            { to: "/help", label: "Request Exchange", icon: Repeat },
            { to: "/help", label: "Chat with Seller", icon: Store },
            { to: "/help", label: "Return Policy", icon: ShieldCheck },
            { to: "/", label: "Continue Shopping", icon: ArrowRight },
          ].map(({ to, label, icon: Icon }) => (
            <Link key={label} to={to} className="rounded-2xl px-3 py-3 text-xs font-medium text-white/90 ring-1 ring-white/10 hover:ring-accent/40 hover:bg-white/[0.04] active:scale-[0.98] transition inline-flex items-center justify-center gap-2 text-center" style={{ background: "rgba(255,255,255,0.03)" }}>
              <Icon className="size-3.5 text-accent" />
              <span className="truncate">{label}</span>
            </Link>
          ))}
        </div>

        {/* World-class return center sections */}
        <ReturnCenterSections />

        {/* Interconnected policy network */}
        <div className="mt-12">
          <PolicyCrossLinks
            title="Related policies"
            keys={["refund", "shipping", "buyerProtection", "terms", "privacy", "contact"]}
            variant="dark"
          />
        </div>


        {/* Recommendations */}
        {recentSlugs.length > 0 && (
          <div className="mt-10">
            <RecommendationStrip
              title="Recommended for you"
              subtitle="AI-picked alternatives based on your activity"
              slugs={recentSlugs.slice(0, 8)}
            />
          </div>
        )}
      </div>
    </div>
  );
}

type Item = { name: string; product_slug: string; image: string | null; quantity: number; unit_price: number; line_total: number };

function EligibilityCard({ item, status, delay }: { item: Item; status: EligibilityStatus; delay: number }) {
  const seller = sellerFromSlug(item.product_slug);
  const badge = useMemo(() => {
    switch (status.kind) {
      case "eligible": return { label: "Return Eligible", icon: CheckCircle2, color: "#22c55e", bg: "rgba(34,197,94,0.12)", ring: "rgba(34,197,94,0.35)" };
      case "expired": return { label: "Window Expired", icon: Clock, color: "#FF9F43", bg: "rgba(255,159,67,0.12)", ring: "rgba(255,159,67,0.35)" };
      case "exchange_only": return { label: "Exchange Only", icon: Repeat, color: "#60a5fa", bg: "rgba(96,165,250,0.12)", ring: "rgba(96,165,250,0.35)" };
      case "seller_approval": return { label: "Seller Approval", icon: Store, color: "#a78bfa", bg: "rgba(167,139,250,0.12)", ring: "rgba(167,139,250,0.35)" };
      case "warranty_only": return { label: "Warranty Support", icon: Wrench, color: "#FF7A00", bg: "rgba(255,122,0,0.12)", ring: "rgba(255,122,0,0.35)" };
      case "non_returnable": return { label: "Non-Returnable", icon: XCircle, color: "#ef4444", bg: "rgba(239,68,68,0.12)", ring: "rgba(239,68,68,0.35)" };
      case "not_delivered": return { label: "Awaiting Delivery", icon: Timer, color: "#FF7A00", bg: "rgba(255,122,0,0.12)", ring: "rgba(255,122,0,0.35)" };
    }
  }, [status]);
  const Icon = badge.icon;

  return (
    <motion.div
      initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay, ease: [0.22, 1, 0.36, 1] }}
      className="relative rounded-3xl p-4 sm:p-5 ring-1 ring-white/10 backdrop-blur-xl overflow-hidden"
      style={{ background: "rgba(255,255,255,0.03)" }}
    >
      <div className="relative flex gap-4">
        <div className="shrink-0 size-20 sm:size-24 rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10 relative">
          {item.image ? (
            <img decoding="async" src={item.image} alt={item.name} className="w-full h-full object-cover" loading="lazy" />
          ) : (
            <div className="w-full h-full grid place-items-center"><Package className="size-6 text-white/30" /></div>
          )}
          <div className="absolute inset-0 ring-1 ring-inset ring-white/5 rounded-2xl pointer-events-none" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-sm sm:text-base font-semibold text-white truncate">{item.name}</p>
              <div className="flex items-center gap-1.5 mt-1">
                <Store className="size-3 text-white/40" />
                <p className="text-[11px] text-white/60 truncate">{seller}</p>
                <span className="inline-flex items-center gap-0.5 text-[9px] font-mono uppercase tracking-wider text-accent">
                  <BadgeCheck className="size-2.5" />Verified
                </span>
              </div>
              <p className="text-[11px] text-white/40 font-mono mt-1">Qty {item.quantity}</p>
            </div>
            <div className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 ring-1 shrink-0" style={{ background: badge.bg, borderColor: badge.ring, color: badge.color, boxShadow: `0 0 20px -8px ${badge.color}` }}>
              <Icon className="size-3" />
              <span className="text-[10px] font-mono uppercase tracking-wider">{badge.label}</span>
            </div>
          </div>

          {/* Status-specific content */}
          <div className="mt-3">
            {status.kind === "eligible" && <CountdownRing hoursLeft={status.hoursLeft} />}
            {status.kind === "expired" && (
              <p className="text-xs text-white/55">Return period ended. You may still qualify for warranty or seller assistance below.</p>
            )}
            {status.kind === "exchange_only" && (
              <p className="text-xs text-white/55">This item supports a like-for-like exchange instead of a refund.</p>
            )}
            {status.kind === "seller_approval" && (
              <p className="text-xs text-white/55">Return must be approved by the seller. Average response time is under 24 hours.</p>
            )}
            {status.kind === "warranty_only" && (
              <p className="text-xs text-white/55">Covered by manufacturer warranty — eligible for repair, replacement, or service.</p>
            )}
            {status.kind === "non_returnable" && (
              <p className="text-xs text-white/55">Seller does not allow returns for this category. Warranty options may still apply.</p>
            )}
            {status.kind === "not_delivered" && (
              <p className="text-xs text-white/55">Return window opens automatically once the item is marked delivered.</p>
            )}
          </div>

          {/* Action row */}
          <div className="flex flex-wrap gap-2 mt-4">
            {status.kind === "eligible" && (
              <Link to="/account/returns" className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-semibold text-black hover:brightness-110 active:scale-95 transition" style={{ background: "linear-gradient(135deg,#FF7A00,#FF9F43)", boxShadow: "0 8px 24px -10px rgba(255,122,0,0.7)" }}>
                Start return <ArrowRight className="size-3" />
              </Link>
            )}
            {(status.kind === "exchange_only" || status.kind === "eligible") && (
              <button className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white/85 ring-1 ring-white/15 hover:bg-white/5 hover:ring-accent/40 active:scale-95 transition">
                <Repeat className="size-3 text-accent" /> Request exchange
              </button>
            )}
            {status.kind === "warranty_only" && (
              <button className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white/85 ring-1 ring-white/15 hover:bg-white/5 hover:ring-accent/40 active:scale-95 transition">
                <Wrench className="size-3 text-accent" /> File warranty claim
              </button>
            )}
            <button className="inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-[11px] font-medium text-white/85 ring-1 ring-white/15 hover:bg-white/5 hover:ring-accent/40 active:scale-95 transition">
              <Store className="size-3 text-accent" /> Chat with seller
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}

function CountdownRing({ hoursLeft }: { hoursLeft: number }) {
  const [startedAt] = useState(Date.now());
  const [now, setNow] = useState(Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, []);
  const elapsedH = (now - startedAt) / 36e5;
  const remaining = Math.max(0, hoursLeft - elapsedH);
  const days = Math.floor(remaining / 24);
  const hrs = Math.floor(remaining % 24);
  const mins = Math.floor((remaining * 60) % 60);
  const secs = Math.floor((remaining * 3600) % 60);
  const pct = Math.min(1, Math.max(0, remaining / 96));
  const urgent = remaining < 24;
  const critical = remaining < 6;

  const size = 60, stroke = 4, r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const color = critical ? "#ef4444" : urgent ? "#FF7A00" : "#FF9F43";

  return (
    <div className="flex items-center gap-3">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className={urgent ? "animate-pulse" : ""}>
          <circle cx={size/2} cy={size/2} r={r} stroke="rgba(255,255,255,0.08)" strokeWidth={stroke} fill="none" />
          <motion.circle
            cx={size/2} cy={size/2} r={r}
            stroke={color}
            strokeWidth={stroke} fill="none" strokeLinecap="round"
            strokeDasharray={c}
            initial={{ strokeDashoffset: c }}
            animate={{ strokeDashoffset: c * (1 - pct) }}
            transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
            transform={`rotate(-90 ${size/2} ${size/2})`}
            style={{ filter: `drop-shadow(0 0 8px ${color}99)` }}
          />
        </svg>
        <div className="absolute inset-0 grid place-items-center">
          <Timer className="size-4 text-accent" />
        </div>
      </div>
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-white/40">Return closes in</p>
        <p className="text-sm font-semibold text-white font-mono tabular-nums">
          {days > 0 ? `${days}d ${hrs}h ${mins}m` : urgent ? `${hrs}h ${String(mins).padStart(2,"0")}m ${String(secs).padStart(2,"0")}s` : `${hrs}h ${String(mins).padStart(2,"0")}m`}
          {urgent && <span className="ml-2 text-[10px] uppercase tracking-wider" style={{ color }}>{critical ? "Critical" : "Urgent"}</span>}
        </p>
      </div>
    </div>
  );
}

function Shimmer() {
  return (
    <div className="relative h-28 rounded-2xl ring-1 ring-white/5 overflow-hidden" style={{ background: "rgba(255,255,255,0.03)" }}>
      <motion.div
        className="absolute inset-y-0 -left-1/2 w-1/2"
        style={{ background: "linear-gradient(90deg, transparent, rgba(255,255,255,0.06), transparent)" }}
        animate={{ x: ["0%", "400%"] }}
        transition={{ duration: 1.6, repeat: Infinity, ease: "linear" }}
      />
    </div>
  );
}

function MagneticButton({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) {
  const ref = useRef<HTMLButtonElement>(null);
  const mx = useMotionValue(0); const my = useMotionValue(0);
  const sx = useSpring(mx, { stiffness: 220, damping: 18 });
  const sy = useSpring(my, { stiffness: 220, damping: 18 });
  const x = useTransform(sx, (v) => `${v}px`);
  const y = useTransform(sy, (v) => `${v}px`);

  return (
    <motion.button
      ref={ref}
      onMouseMove={(e) => {
        const r = ref.current?.getBoundingClientRect(); if (!r) return;
        mx.set((e.clientX - (r.left + r.width / 2)) * 0.25);
        my.set((e.clientY - (r.top + r.height / 2)) * 0.25);
      }}
      onMouseLeave={() => { mx.set(0); my.set(0); }}
      whileTap={{ scale: 0.96 }}
      style={{ x, y, background: "linear-gradient(135deg, #FF7A00, #FF9F43)", boxShadow: "0 14px 36px -12px rgba(255,122,0,0.65)" }}
      className="h-12 px-5 rounded-xl font-semibold text-sm text-black inline-flex items-center justify-center gap-2 disabled:opacity-60 hover:brightness-110 transition"
      {...(props as any)}
    >
      {children}
    </motion.button>
  );
}

function Particles() {
  const dots = useMemo(() => Array.from({ length: 18 }, (_, i) => ({
    id: i,
    left: `${(i * 53) % 100}%`,
    top: `${(i * 37) % 100}%`,
    size: 1 + ((i * 7) % 3),
    delay: (i % 6) * 0.6,
    duration: 8 + (i % 5),
  })), []);
  return (
    <div className="absolute inset-0 overflow-hidden">
      {dots.map((d) => (
        <motion.span
          key={d.id}
          className="absolute rounded-full"
          style={{
            left: d.left, top: d.top, width: d.size, height: d.size,
            background: "rgba(255,159,67,0.55)",
            boxShadow: "0 0 8px rgba(255,122,0,0.6)",
          }}
          animate={{ y: [-10, 10, -10], opacity: [0.2, 0.7, 0.2] }}
          transition={{ duration: d.duration, repeat: Infinity, delay: d.delay, ease: "easeInOut" }}
        />
      ))}
    </div>
  );
}
