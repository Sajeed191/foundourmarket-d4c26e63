import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  Gift,
  Tag,
  Loader2,
  Percent,
  Zap,
  Clock,
  ArrowRight,
  Sparkles,
  Flame,
  ShieldCheck,
  Truck,
  LayoutGrid,
  ArrowDownWideNarrow,
} from "lucide-react";
import { useFlashDeals } from "@/lib/use-flash-deals";
import { BrowseCard } from "@/components/site/BrowseCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import type { Product } from "@/lib/products";
import { buildBrowsePresentation, sortProductsForBrowse } from "@/lib/browse";
import { useHomepageCollectionRules } from "@/lib/site-rules";



export const Route = createFileRoute("/deals")({
  head: () => ({
    meta: [
      { title: "Deals & Promos — FoundOurMarket™" },
      { name: "description", content: "Discover the best deals and promotions on FoundOurMarket™. Limited-time offers, flash sales, and exclusive discounts." },
      { property: "og:title", content: "Deals & Promos — FoundOurMarket™" },
      { property: "og:description", content: "Discover the best deals and promotions on FoundOurMarket™. Limited-time offers, flash sales, and exclusive discounts." },
    ],
  }),
  component: DealsPage,
});

const ease = [0.16, 1, 0.3, 1] as const;
const fadeUp = {
  initial: { opacity: 0, y: 14 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.5, ease },
};

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

/** Counts down to the next midnight — a rolling daily "deal resets" timer. */
function useDailyCountdown() {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, []);
  const end = useMemo(() => {
    const d = new Date();
    d.setHours(24, 0, 0, 0);
    return d.getTime();
  }, []);
  const diff = Math.max(0, end - now);
  return {
    h: Math.floor(diff / 3_600_000),
    m: Math.floor((diff % 3_600_000) / 60_000),
    s: Math.floor((diff % 60_000) / 1000),
  };
}

type DealSort = "savings" | "ending" | "newest" | "rating";

function DealsPage() {
  // Single shared Flash Deal source — identical to the homepage Flash Deals
  // section, so any product shown there also appears here on the Offers /
  // Deals & Promotions page.
  const { items, loading } = useFlashDeals();
  const rules = useHomepageCollectionRules();

  const countdown = useDailyCountdown();
  const [activeCat, setActiveCat] = useState<string>("all");
  const [sort, setSort] = useState<DealSort>("savings");
  const sortRef = useRef<HTMLDivElement | null>(null);

  const dealProducts = useMemo(
    () => items
      .filter((i) => i.product.flashDeal || i.product.hotDeal)
      .map((i) => i.product),
    [items],
  );

  // Dev-only verification: eligible vs visible vs hidden by rotation / limit.
  useEffect(() => {
    if (!import.meta.env.DEV || loading) return;
    const cap = rules.limits.flash_deals;
    const visible = items.length;
    // eligible = items pool BEFORE the rotation slice — approximated via
    // items when eligible <= cap; else `visible` equals cap and rotation hides
    // the tail. useFlashDeals already logs its own eligible count.
    // eslint-disable-next-line no-console
    console.info(
      `[Deals · View All] visible=${visible} | cap(limit)=${cap} | category=${activeCat}`,
    );
    if (visible > cap) {
      // eslint-disable-next-line no-console
      console.warn("[Deals] visible exceeds Site Rules limit — check hook cap");
    }
  }, [items.length, rules.limits.flash_deals, activeCat, loading]);

  const topDiscount = dealProducts.reduce((max, p) => Math.max(max, p.discount ?? 0), 0);


  const categories = useMemo(() => {
    const map = new Map<string, number>();
    for (const p of dealProducts) {
      map.set(p.category, (map.get(p.category) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, 6);
  }, [dealProducts]);

  const filteredProducts = useMemo(
    () => (activeCat === "all" ? dealProducts : dealProducts.filter((p) => p.category === activeCat)),
    [dealProducts, activeCat]
  );

  // Browse Presentation Adapter — same adapter as /category, surface: "deals".
  const presentation = useMemo(
    () => buildBrowsePresentation({ products: filteredProducts, surface: "deals" }),
    [filteredProducts],
  );

  const visibleProducts = useMemo(() => {
    const base = sortProductsForBrowse(filteredProducts, presentation, "recommended");
    const arr = [...base];
    switch (sort) {
      case "savings":
        return arr.sort((a, b) => (b.discount ?? 0) - (a.discount ?? 0));
      case "newest":
        return arr.sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
      case "rating":
        return arr.sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0));
      case "ending":
      default:
        return arr;
    }
  }, [filteredProducts, presentation, sort]);

  const getProductKey = useCallback((p: Product) => p.id ?? p.slug, []);
  const renderProduct = useCallback(
    (p: Product, i: number) => (
      <BrowseCard
        product={p}
        presentation={presentation.get(p.id ?? p.slug)}
        priority={i < 4}
        forceBadge={p.flashDeal ? "flash_deal" : "hot_deal"}
      />
    ),
    [presentation],
  );


  if (loading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="min-h-screen pb-0 md:pb-24">
      {/* Ambient cinematic backdrop */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="orb animate-orb -top-[10%] left-[10%] size-[60vw] max-w-[520px]" style={{ background: "var(--gradient-ember)" }} />
        <div className="orb animate-orb [animation-delay:-8s] top-[30%] right-[5%] size-[50vw] max-w-[440px]" style={{ background: "var(--gradient-violet)" }} />
        {/* Subtle noise */}
        <div
          className="absolute inset-0 opacity-[0.03] mix-blend-overlay"
          style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='80' height='80'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")" }}
        />
      </div>

      <div className="container-page py-6 sm:py-10 lg:py-14 space-y-7 sm:space-y-10">
        {/* ── Hero promo banner ── */}
        <motion.header
          {...fadeUp}
          className="relative overflow-hidden rounded-[28px] sm:rounded-[32px] glass-strong px-5 py-7 sm:px-9 sm:py-11"
        >
          {/* layered lighting */}
          <div aria-hidden className="absolute inset-0 -z-10">
            <div className="absolute -top-32 -right-16 size-[440px] rounded-full opacity-60 animate-glow" style={{ background: "var(--gradient-ember)", filter: "blur(90px)" }} />
            <div className="absolute -bottom-40 -left-24 size-[400px] rounded-full opacity-50 animate-glow [animation-delay:-2s]" style={{ background: "var(--gradient-violet)", filter: "blur(100px)" }} />
            <div className="absolute inset-0 opacity-30" style={{ background: "var(--gradient-mesh)" }} />
          </div>

          {/* floating glow particles */}
          <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
            {[
              { l: "12%", t: "22%", s: 5, d: 0 },
              { l: "78%", t: "30%", s: 4, d: 1.2 },
              { l: "40%", t: "12%", s: 3, d: 0.6 },
              { l: "88%", t: "68%", s: 6, d: 1.8 },
              { l: "22%", t: "74%", s: 4, d: 0.9 },
            ].map((p) => (
              <motion.span
                key={`${p.l}-${p.t}`}
                className="absolute rounded-full bg-accent"
                style={{ left: p.l, top: p.t, width: p.s, height: p.s, boxShadow: "0 0 12px 2px var(--color-accent)" }}
                animate={{ y: [0, -16, 0], opacity: [0.25, 0.9, 0.25] }}
                transition={{ duration: 4 + p.d, repeat: Infinity, ease: "easeInOut", delay: p.d }}
              />
            ))}
          </div>

          <div className="relative flex flex-col gap-7 lg:flex-row lg:items-center lg:justify-between">
            <div className="max-w-xl">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-accent/15 border border-accent/25 px-3 py-1 text-[10px] font-mono uppercase tracking-[0.25em] text-accent">
                <Sparkles className="size-3" /> Limited Time
              </span>
              <h1 className="mt-4 font-display font-bold leading-[1.02] text-[2.4rem] sm:text-[3.25rem] tracking-tight">
                Deals & <span className="text-gradient-ember">Promos</span>
              </h1>
              <p className="mt-3 text-[15px] leading-relaxed text-muted-foreground max-w-md">
                Exclusive discounts and flash sales, curated for you. Grab them before the timer runs out.
              </p>

              {/* CTAs */}
              <div className="mt-6 flex flex-wrap items-center gap-3">
                <a
                  href="#deals-grid"
                  className="cta-primary group !px-5 !py-2.5 !text-sm active:scale-[0.97] transition-transform"
                >
                  <Flame className="size-4" /> Shop Deals
                  <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
                </a>
                <Link
                  to="/search"
                  className="inline-flex items-center gap-1.5 rounded-full border border-white/12 bg-white/[0.04] px-5 py-2.5 text-sm font-medium text-foreground/90 backdrop-blur-md transition-all hover:border-accent/40 hover:text-accent active:scale-[0.97]"
                >
                  Explore Offers
                </Link>
              </div>
            </div>

            {/* Discount + timer card */}
            {topDiscount > 0 && (
              <motion.div
                initial={{ scale: 0.9, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                transition={{ delay: 0.2, ease, duration: 0.5 }}
                className="relative shrink-0 w-full lg:w-auto rounded-3xl glass-strong p-5 sm:p-6 text-center"
              >
                <div className="flex items-center justify-center gap-3">
                  <span className="size-12 rounded-2xl bg-accent/15 text-accent grid place-items-center ring-1 ring-accent/30 shadow-[0_0_24px_-6px_var(--color-accent)]">
                    <Percent className="size-5" />
                  </span>
                  <div className="text-left">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Best deal today</p>
                    <p className="text-3xl font-display font-bold text-gradient-ember leading-none">Up to {topDiscount}%</p>
                  </div>
                </div>

                {/* Countdown */}
                <div className="mt-5 border-t border-white/10 pt-4">
                  <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground mb-2 flex items-center justify-center gap-1.5">
                    <Clock className="size-3 text-accent" /> Refreshes in
                  </p>
                  <div className="flex items-center justify-center gap-1.5 font-mono tabular-nums">
                    {[
                      { v: pad(countdown.h), l: "HRS" },
                      { v: pad(countdown.m), l: "MIN" },
                      { v: pad(countdown.s), l: "SEC" },
                    ].map((t, i) => (
                      <div key={t.l} className="flex items-center gap-1.5">
                        <div className="flex flex-col items-center">
                          <span className="grid place-items-center min-w-11 rounded-xl bg-black/50 ring-1 ring-accent/25 px-2 py-1.5 text-lg font-semibold text-accent">
                            {t.v}
                          </span>
                          <span className="mt-1 text-[8px] tracking-[0.2em] text-muted-foreground">{t.l}</span>
                        </div>
                        {i < 2 && <span className="text-accent/50 -mt-3 text-lg">:</span>}
                      </div>
                    ))}
                  </div>
                </div>
              </motion.div>
            )}
          </div>

          {/* Category chips */}
          {categories.length > 0 && (
            <div className="relative mt-7 -mx-1 flex gap-2 overflow-x-auto px-1 pb-1 scrollbar-hide">
              <CatChip
                label="All"
                count={dealProducts.length}
                active={activeCat === "all"}
                onClick={() => setActiveCat("all")}
                icon={<LayoutGrid className="size-3" />}
              />
              {categories.map(([cat, count]) => (
                <CatChip
                  key={cat}
                  label={cat}
                  count={count}
                  active={activeCat === cat}
                  onClick={() => setActiveCat(cat)}
                  icon={<Tag className="size-3" />}
                />
              ))}
            </div>
          )}
        </motion.header>

        {/* Trust strip */}
        <motion.div
          {...fadeUp}
          transition={{ ...fadeUp.transition, delay: 0.05 }}
          className="grid grid-cols-3 gap-2 sm:gap-3"
        >
          {[
            { icon: Truck, t: "Fast delivery", s: "2–5 days" },
            { icon: ShieldCheck, t: "Buyer protection", s: "Secure pay" },
            { icon: Zap, t: "Live pricing", s: "Updated now" },
          ].map((b) => (
            <div key={b.t} className="glass rounded-2xl px-3 py-3 flex flex-col items-center text-center gap-1">
              <b.icon className="size-4 text-accent" />
              <p className="text-[11px] sm:text-xs font-medium leading-tight">{b.t}</p>
              <p className="text-[9px] sm:text-[10px] text-muted-foreground">{b.s}</p>
            </div>
          ))}
        </motion.div>

        {/* Section heading */}
        {visibleProducts.length > 0 && (
          <motion.div
            {...fadeUp}
            transition={{ ...fadeUp.transition, delay: 0.08 }}
            id="deals-grid"
            className="flex items-end justify-between scroll-mt-20"
          >
            <div>
              <h2 className="text-lg sm:text-xl font-display font-semibold">Today's offers</h2>
              <p className="text-sm text-muted-foreground">
                <span className="text-foreground font-semibold">{visibleProducts.length}</span> active deal{visibleProducts.length === 1 ? "" : "s"}
                {activeCat !== "all" && <span> in {activeCat}</span>}
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
            </div>
          </motion.div>
        )}

        {/* Products grid */}
        {visibleProducts.length > 0 ? (
          <section data-product-card-frame>
            <VirtualizedProductGrid
              items={visibleProducts}
              cols={{ base: 2, lg: 4 }}
              className="grid grid-cols-2 lg:grid-cols-4 items-start gap-3 sm:gap-4"
              getKey={getProductKey}
              getImageSrc={(p) => p.image}
              renderItem={renderProduct}
            />
          </section>

        ) : (
          <EmptyDeals />
        )}
      </div>
    </div>
  );
}

function CatChip({
  label,
  count,
  active,
  onClick,
  icon,
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`group inline-flex shrink-0 items-center gap-1.5 rounded-full px-3.5 py-2 text-[12px] font-medium transition-all duration-300 active:scale-95 ${
        active
          ? "bg-accent text-accent-foreground border border-accent shadow-[var(--shadow-ember)]"
          : "bg-white/[0.05] border border-white/10 text-foreground/80 hover:border-accent/40 hover:text-accent hover:bg-accent/10"
      }`}
    >
      {icon}
      <span className="capitalize">{label}</span>
      <span className={`text-[10px] tabular-nums ${active ? "text-accent-foreground/70" : "text-muted-foreground"}`}>
        {count}
      </span>
    </button>
  );
}

function EmptyDeals() {
  return (
    <motion.div {...fadeUp} className="card-premium rounded-2xl border-dashed p-10 sm:p-14 flex flex-col items-center text-center relative overflow-hidden">
      <motion.div
        animate={{ y: [0, -6, 0] }}
        transition={{ duration: 3.2, repeat: Infinity, ease: "easeInOut" }}
        className="relative size-14 rounded-2xl bg-accent/10 text-accent grid place-items-center mb-4 ring-1 ring-accent/30 shadow-[0_0_20px_-6px_var(--color-accent)]"
      >
        <Gift className="size-6" />
      </motion.div>
      <p className="relative text-lg font-display font-semibold">No active deals</p>
      <p className="relative text-sm text-muted-foreground mt-2 max-w-sm">
        We're working on fresh promotions. Check back soon for exclusive discounts and flash sales.
      </p>
      <Link
        to="/search"
        className="relative mt-6 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition-all active:scale-95"
      >
        <Clock className="size-3.5" /> Browse all products
      </Link>
    </motion.div>
  );
}
