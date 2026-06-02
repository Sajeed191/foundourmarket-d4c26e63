import { motion } from "framer-motion";
import {
  Check, ShieldCheck, Lock, Truck, RotateCcw, Sparkles,
  Eye, ShoppingBag, Flame,
} from "lucide-react";

const reveal = {
  initial: { opacity: 0, y: 16 },
  whileInView: { opacity: 1, y: 0 },
  viewport: { once: true, margin: "-60px" },
  transition: { duration: 0.5, ease: [0.16, 1, 0.3, 1] as const },
};

/** "Why customers love this" — checkmark highlight cards. */
export function ProductHighlights({ highlights }: { highlights?: string[] }) {
  const items = highlights && highlights.length > 0
    ? highlights
    : [
        "Premium build & materials",
        "Backed by buyer protection",
        "Fast, tracked global delivery",
        "Easy returns & replacements",
        "Verified genuine product",
        "Loved by thousands worldwide",
      ];
  return (
    <motion.section {...reveal} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16">
      <h2 className="text-xl sm:text-2xl font-display font-semibold tracking-tight mb-1">Why customers love this</h2>
      <p className="text-xs font-mono uppercase tracking-widest text-muted-foreground mb-5">The details that make it worth it</p>
      <div className="grid grid-cols-1 xs:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((h) => (
          <div key={h} className="flex items-center gap-3 glass rounded-2xl p-4 min-h-[44px]">
            <span className="size-8 shrink-0 grid place-items-center rounded-full bg-accent/10 text-accent">
              <Check className="size-4" />
            </span>
            <span className="text-sm font-medium leading-snug">{h}</span>
          </div>
        ))}
      </div>
    </motion.section>
  );
}

/** Live activity / social-proof badges. */
export function LiveActivity({ viewers, addedToCart, purchases }: { viewers: number; addedToCart: number; purchases: number }) {
  const rows = [
    { icon: Eye, text: `${viewers} people viewed this product today` },
    { icon: ShoppingBag, text: `${addedToCart} people added it to cart` },
    { icon: Flame, text: `${purchases} purchases in the last 24 hours` },
  ];
  return (
    <div className="space-y-2">
      {rows.map(({ icon: Icon, text }) => (
        <div key={text} className="flex items-center gap-2.5 rounded-full border border-accent/20 bg-accent/[0.06] px-3 py-1.5">
          <span className="relative flex size-2 shrink-0">
            <span className="absolute inline-flex h-full w-full rounded-full bg-accent/60 animate-ping" />
            <span className="relative inline-flex size-2 rounded-full bg-accent" />
          </span>
          <Icon className="size-3.5 text-accent shrink-0" />
          <span className="text-[11px] sm:text-xs font-medium text-foreground/90">{text}</span>
        </div>
      ))}
    </div>
  );
}

/** Large premium buyer-trust guarantee section. */
export function TrustGuarantee() {
  const pillars = [
    { icon: ShieldCheck, title: "Buyer Protection", desc: "Full coverage on every order, end to end." },
    { icon: Lock, title: "Secure Payments", desc: "256-bit SSL encrypted checkout." },
    { icon: Truck, title: "Fast Delivery", desc: "Tracked worldwide shipping." },
    { icon: RotateCcw, title: "Easy Returns", desc: "Hassle-free returns & replacements." },
  ];
  return (
    <motion.section {...reveal} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 mt-12 sm:mt-16 mb-4">
      <div className="relative overflow-hidden rounded-3xl border border-white/10 p-6 sm:p-10" style={{ background: "linear-gradient(135deg, oklch(0.18 0.02 49 / 0.6), oklch(0.12 0.01 264 / 0.6))" }}>
        <div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(90px)" }} />
        <div className="relative">
          <p className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent mb-2">
            <Sparkles className="size-3.5" /> Shop with total confidence
          </p>
          <h2 className="text-2xl sm:text-3xl font-display font-semibold tracking-tight mb-6">Our promise to every customer</h2>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
            {pillars.map(({ icon: Icon, title, desc }) => (
              <div key={title} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4 sm:p-5">
                <span className="size-10 grid place-items-center rounded-xl bg-accent/10 text-accent mb-3">
                  <Icon className="size-5" />
                </span>
                <p className="text-sm font-semibold mb-1">{title}</p>
                <p className="text-xs text-muted-foreground leading-relaxed">{desc}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </motion.section>
  );
}
