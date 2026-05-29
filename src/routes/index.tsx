import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Search, Shield, Truck, Headset, ArrowRight, Star, Sparkles, Award, Package, Globe2, Quote, Users, ShoppingBag, Zap, Flame, BadgeCheck } from "lucide-react";
import { useCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";

import { ProductCard } from "@/components/site/ProductCard";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { FlashSaleStrip } from "@/components/site/FlashSaleStrip";
import { AnnouncementBar } from "@/components/site/AnnouncementBar";

import { NewsletterForm } from "@/components/site/NewsletterForm";
import { PromoBannerCarousel } from "@/components/site/PromoBannerCarousel";
import { ProductRail } from "@/components/site/ProductRail";

const PLACEHOLDERS = [
  "Search 2,400+ curated products...",
  "Try 'wireless headphones'...",
  "Discover 'linen shirt'...",
  "Find 'ceramic mug'...",
  "Explore 'smart watch'...",
];

function useRotatingPlaceholder(active: boolean) {
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    if (!active) return;
    const id = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 2800);
    return () => clearInterval(id);
  }, [active]);
  return PLACEHOLDERS[idx];
}

function AnimatedCounter({ to, suffix = "", duration = 2 }: { to: number; suffix?: string; duration?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (v) => Math.round(v).toLocaleString() + suffix);
  useEffect(() => { if (inView) mv.set(to); }, [inView, to, mv]);
  return <motion.span ref={ref}>{display}</motion.span>;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoundOurMarket™ — Whatever You Need. All In One Place." },
      { name: "description", content: "Premium global marketplace. Curated electronics, fashion, home, fitness and more — delivered worldwide." },
    ],
  }),
  component: Home,
});

const fadeUp = {
  hidden: { opacity: 0, y: 24 },
  show: (i: number = 0) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] as const },
  }),
};

function Reveal({ children, className, delay = 0 }: { children: React.ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      variants={fadeUp}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      custom={delay}
      className={className}
    >
      {children}
    </motion.div>
  );
}

/* Cinematic ambient divider — layered glow between sections */
function CinematicDivider() {
  return (
    <div aria-hidden className="relative h-px max-w-7xl mx-auto my-2 sm:my-4">
      <div className="absolute inset-x-6 sm:inset-x-12 top-0 h-px bg-gradient-to-r from-transparent via-white/12 to-transparent" />
      <div className="absolute left-1/2 -translate-x-1/2 -top-10 h-20 w-[60%] rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-ember-soft)" }} />
    </div>
  );
}

function SectionHeader({ eyebrow, title, icon: Icon, href, hrefLabel = "View All" }: { eyebrow: string; title: string; icon?: React.ComponentType<{ className?: string }>; href?: string; hrefLabel?: string }) {
  return (
    <Reveal className="flex justify-between items-end mb-5 sm:mb-8 gap-4">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
          {Icon && <Icon className="size-3" />} {eyebrow}
        </p>
        <h2 className="text-fluid-2xl font-display tracking-tight">{title}</h2>
      </div>
      {href && (
        <Link to={href} className="hidden sm:inline-block text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
          {hrefLabel}
        </Link>
      )}
    </Reveal>
  );
}

function Home() {
  const { products, loading: productsLoading } = useProducts();
  const { categories } = useCategories();

  const nav = useNavigate();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const rotatingPlaceholder = useRotatingPlaceholder(!searchFocused && !query);

  const categoryCounts = useMemo(
    () => products.reduce<Record<string, number>>((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + 1;
      return acc;
    }, {}),
    [products]
  );

  const trending = useMemo(
    () => [...products].sort((a, b) => (b.viewsCount ?? 0) - (a.viewsCount ?? 0)).slice(0, 8),
    [products]
  );

  const recommended = useMemo(
    () => [...products].sort((a, b) => (b.rating * b.reviews) - (a.rating * a.reviews)).slice(0, 8),
    [products]
  );

  const newArrivals = useMemo(
    () => [...products].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 8),
    [products]
  );

  return (
    <>
      {/* Sticky announcement bar — homepage only */}
      <AnnouncementBar />

      {/* 1 · Cinematic Hero */}
      <section className="relative pt-10 sm:pt-16 md:pt-24 pb-10 sm:pb-16 md:pb-20 px-4 sm:px-6 overflow-hidden">
        {/* Layered ambient mesh + orbs */}
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="orb animate-orb" style={{ width: 520, height: 520, top: "8%", left: "55%", background: "var(--gradient-ember)" }} />
          <div className="orb animate-orb" style={{ width: 460, height: 460, top: "28%", left: "8%", background: "var(--gradient-violet)", animationDelay: "-7s" }} />
          <div className="orb animate-orb" style={{ width: 380, height: 380, top: "62%", left: "70%", background: "radial-gradient(circle at 50% 50%, oklch(0.7 0.15 220 / 0.16), transparent 65%)", animationDelay: "-14s" }} />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            }}
          />
          <motion.div
            initial={{ x: "-30%", opacity: 0 }}
            animate={{ x: "130%", opacity: [0, 0.5, 0] }}
            transition={{ duration: 8, repeat: Infinity, repeatDelay: 6, ease: "easeInOut" }}
            className="absolute top-0 bottom-0 w-[40%] -skew-x-12 bg-gradient-to-r from-transparent via-white/[0.03] to-transparent pointer-events-none"
          />
        </div>

        <div className="max-w-5xl mx-auto text-center relative z-10">
          <motion.div
            initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full glass text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground"
          >
            <span className="size-1.5 rounded-full bg-accent animate-glow" />
            Live · 180+ countries · 2.4k products
          </motion.div>

          <motion.h1
            initial={{ opacity: 0, y: 24 }} animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.9, ease: [0.16, 1, 0.3, 1] }}
            className="text-fluid-hero font-display font-semibold tracking-tight text-balance mb-5 sm:mb-7"
          >
            Everything you need.
            <br />
            <span className="text-gradient-ember">All in one place.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }}
            className="text-fluid-base text-muted-foreground max-w-xl mx-auto text-balance mb-8 sm:mb-10 px-2"
          >
            A premium independent marketplace, sourcing top-quality products from across the world — delivered with cinematic precision.
          </motion.p>

          <motion.form
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }}
            onSubmit={(e) => { e.preventDefault(); nav({ to: "/search", search: { q: query } }); }}
            className="max-w-2xl mx-auto relative group"
          >
            <motion.div
              aria-hidden
              animate={{ opacity: searchFocused ? 1 : 0.35 }}
              transition={{ duration: 0.4 }}
              className="absolute -inset-1 rounded-full blur-xl"
              style={{ background: "conic-gradient(from 0deg, oklch(0.74 0.19 49 / 0.45), transparent 30%, oklch(0.55 0.18 290 / 0.35) 60%, transparent 80%, oklch(0.74 0.19 49 / 0.45))" }}
            />
            <div className="relative glass-strong rounded-full ring-1 ring-white/10">
              <Search className={`absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 size-4 transition-colors ${searchFocused ? "text-accent" : "text-muted-foreground"}`} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={rotatingPlaceholder}
                className="w-full bg-transparent rounded-full pl-12 sm:pl-14 pr-24 sm:pr-32 py-4 sm:py-5 text-sm sm:text-base focus:outline-none placeholder:text-muted-foreground/60 transition-[placeholder] duration-500"
              />
              <button type="submit" className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-semibold px-4 sm:px-6 py-2.5 sm:py-3 rounded-full text-[11px] sm:text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-[var(--shadow-ember)]">
                Search
              </button>
            </div>
          </motion.form>

          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.7 }}
            className="mt-7 sm:mt-9 flex flex-wrap justify-center gap-3"
          >
            <Link to="/category/$slug" params={{ slug: "electronics" }} className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-foreground text-background text-[11px] sm:text-xs uppercase tracking-widest font-semibold hover:brightness-110 hover:-translate-y-0.5 transition-all">
              Explore Products <ArrowRight className="size-3.5" />
            </Link>
            <a href="#categories" className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full glass text-[11px] sm:text-xs uppercase tracking-widest font-semibold hover:bg-white/10 transition-all">
              Shop Categories
            </a>
          </motion.div>

          {/* Floating live stats */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.8 }}
            className="mt-12 sm:mt-16 grid grid-cols-3 gap-2.5 sm:gap-4 max-w-3xl mx-auto"
          >
            {[
              { value: "180+", label: "Countries", hint: "Worldwide reach" },
              { value: "2.4k+", label: "Products", hint: "Curated daily" },
              { value: "98%", label: "Happy buyers", hint: "5-star average" },
            ].map((s, i) => (
              <motion.div
                key={s.label}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.7 + i * 0.08, duration: 0.6 }}
                whileHover={{ y: -4 }}
                className="glass-strong glass-reflect rounded-2xl px-3 sm:px-6 py-4 sm:py-6 text-left"
              >
                <div className="text-2xl sm:text-4xl font-display font-semibold tracking-tight text-gradient-ember">{s.value}</div>
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1.5">{s.label}</div>
                <div className="hidden sm:block text-[10px] text-muted-foreground/60 mt-0.5">{s.hint}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* 2 · Featured Collection Banner */}
      <section className="px-4 sm:px-6 pt-2 sm:pt-4">
        <PromoBannerCarousel types={["hero"]} maxItems={3} eyebrow="Featured Collection" />
        <FlashSaleStrip />
      </section>

      <CinematicDivider />

      {/* 3 · Trust & Benefits — compact premium glass cards */}
      <section className="px-4 sm:px-6 py-8 sm:py-12 max-w-7xl mx-auto">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {[
            { icon: Truck, title: "Worldwide Shipping", desc: "Tracked delivery to 180+ countries." },
            { icon: Shield, title: "Secure Payments", desc: "Bank-grade encryption on checkout." },
            { icon: Star, title: "Curated Quality", desc: "Hand-verified, premium-only catalog." },
            { icon: Headset, title: "24/7 Support", desc: "Real humans, ready anytime." },
          ].map((b, i) => (
            <Reveal key={b.title} delay={i}>
              <div className="group relative h-full glass glass-reflect rounded-2xl p-4 sm:p-5 overflow-hidden hover:border-accent/40 transition-colors">
                <div aria-hidden className="absolute -top-10 -right-10 size-28 rounded-full opacity-0 group-hover:opacity-60 blur-2xl transition-opacity" style={{ background: "var(--gradient-ember-soft)" }} />
                <div className="relative size-9 sm:size-10 grid place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 mb-3 group-hover:scale-105 group-hover:shadow-[0_0_22px_-6px_var(--color-accent)] transition-all">
                  <b.icon className="size-4" />
                </div>
                <h4 className="relative text-xs sm:text-sm font-medium mb-1">{b.title}</h4>
                <p className="relative text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Categories — premium interactive discovery */}
      <section id="categories" className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto scroll-mt-24">
        <SectionHeader eyebrow="Browse" title="Featured Categories" href="/search" />
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {categories.map((cat, i) => (
            <Reveal key={cat.slug} delay={i} className="h-full">
              <Link
                to="/category/$slug"
                params={{ slug: cat.slug }}
                className="group relative block aspect-square bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/50 transition-all hover:-translate-y-1.5 hover:shadow-[0_24px_60px_-24px_oklch(0.74_0.19_49_/_0.45)]"
              >
                <div className="absolute inset-0 grid place-items-center text-6xl font-display font-bold text-white/[0.04] group-hover:text-accent/20 transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--gradient-ember)" }} />
                <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1400ms] ease-out bg-gradient-to-r from-transparent via-white/[0.08] to-transparent skew-x-12" />
                <div className="absolute inset-0 p-4 sm:p-6 flex flex-col justify-end z-10">
                  <p className="font-mono text-[10px] text-accent mb-1">{String(i + 1).padStart(2, "0")}</p>
                  <h3 className="text-base sm:text-lg font-medium">{cat.name}</h3>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest">{categoryCounts[cat.slug] ?? 0} items</p>
                </div>
              </Link>
            </Reveal>
          ))}
        </div>
      </section>

      <CinematicDivider />

      {/* 4 · Trending Products [product section 1/3] */}
      {productsLoading ? (
        <section className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto">
          <ProductSkeletonGrid count={4} />
        </section>
      ) : trending.length > 0 && (
        <section className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto scroll-mt-24">
          <SectionHeader eyebrow="Hot Right Now" title="Trending Products" icon={Flame} href="/search" hrefLabel="See All" />
          <ProductRail products={trending} />
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {trending.slice(0, 4).map((p, i) => (
              <Reveal key={p.slug} delay={i}><ProductCard product={p} /></Reveal>
            ))}
          </div>
        </section>
      )}

      <CinematicDivider />

      {/* 5 · Why Shop With Us */}
      <section className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Why FoundOurMarket</p>
          <h2 className="text-fluid-2xl font-display tracking-tight">Built for the modern buyer</h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {[
            { icon: Shield, title: "Secure by default", desc: "Encrypted checkout with trusted global gateways." },
            { icon: Globe2, title: "Truly worldwide", desc: "Fast, tracked delivery from global hubs." },
            { icon: Award, title: "Verified sellers", desc: "Every supplier hand-vetted before listing." },
            { icon: Sparkles, title: "Premium only", desc: "No filler, no fakes — a curated catalog." },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i}>
              <div className="group relative h-full glass glass-reflect rounded-2xl p-5 sm:p-6 overflow-hidden hover:-translate-y-1 hover:border-accent/40 transition-all">
                <div aria-hidden className="absolute -top-12 -right-12 size-32 rounded-full opacity-0 group-hover:opacity-60 blur-2xl transition-opacity" style={{ background: "var(--gradient-ember-soft)" }} />
                <div className="relative size-10 rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 grid place-items-center mb-4 group-hover:shadow-[0_0_22px_-6px_var(--color-accent)] transition-all">
                  <f.icon className="size-5" />
                </div>
                <h4 className="relative text-sm sm:text-base font-medium mb-2">{f.title}</h4>
                <p className="relative text-xs sm:text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      <CinematicDivider />

      {/* 6 · Recommended Products [product section 2/3] */}
      {recommended.length > 0 && (
        <section className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto scroll-mt-24">
          <SectionHeader eyebrow="Curated For You" title="Recommended Products" icon={Award} href="/search" hrefLabel="See All" />
          <ProductRail products={recommended} />
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {recommended.slice(0, 4).map((p, i) => (
              <Reveal key={p.slug} delay={i}><ProductCard product={p} /></Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Mid-page campaign banner */}
      <section className="px-4 sm:px-6 py-2">
        <PromoBannerCarousel types={["promo"]} maxItems={2} aspectClassName="aspect-[16/6] sm:aspect-[21/7]" />
      </section>

      {/* 7 · New Arrivals [product section 3/3] */}
      {newArrivals.length > 0 && (
        <section className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto scroll-mt-24">
          <SectionHeader eyebrow="Just Landed" title="New Arrivals" icon={Sparkles} href="/search" />
          <ProductRail products={newArrivals} />
          <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {newArrivals.slice(0, 4).map((p, i) => (
              <Reveal key={p.slug} delay={i}><ProductCard product={p} /></Reveal>
            ))}
          </div>
        </section>
      )}

      <CinematicDivider />

      {/* 8 · Social Proof — live engine + verified reviews */}
      <section className="px-4 sm:px-6 py-10 sm:py-14 max-w-7xl mx-auto">
        <Reveal className="text-center mb-8 sm:mb-12">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent animate-glow" /> Live Marketplace
          </p>
          <h2 className="text-fluid-2xl font-display tracking-tight">Trusted by buyers worldwide</h2>
        </Reveal>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-8 sm:mb-12">
          {[
            { icon: Globe2, value: 180, suffix: "+", label: "Countries served" },
            { icon: Users, value: 48230, suffix: "", label: "Active shoppers" },
            { icon: Package, value: 2412, suffix: "", label: "Products available" },
            { icon: ShoppingBag, value: 17, suffix: "/min", label: "Orders right now" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i}>
              <div className="group relative glass-strong glass-reflect rounded-2xl p-5 sm:p-7 h-full overflow-hidden">
                <div aria-hidden className="absolute -top-12 -right-12 size-40 rounded-full opacity-40 group-hover:opacity-70 transition-opacity blur-2xl" style={{ background: "var(--gradient-ember-soft)" }} />
                <div className="relative flex items-center justify-between mb-5">
                  <div className="size-9 rounded-xl bg-accent/10 text-accent grid place-items-center ring-1 ring-accent/20">
                    <s.icon className="size-4" />
                  </div>
                  <Zap className="size-3.5 text-accent/60 animate-glow" />
                </div>
                <div className="relative text-3xl sm:text-4xl font-display font-semibold tracking-tight text-gradient-ember">
                  <AnimatedCounter to={s.value} suffix={s.suffix} />
                </div>
                <div className="relative text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-2">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>

        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 sm:gap-5">
          {[
            { quote: "Completely redefined how I source premium goods. The quality is unmatched.", name: "Marcus Thorne", role: "Curator · London" },
            { quote: "Fast shipping, gorgeous packaging, and every item felt hand-picked for me.", name: "Ayaka Mori", role: "Designer · Tokyo" },
            { quote: "The best support I've dealt with from any online store, full stop.", name: "Diego Alvarez", role: "Founder · Madrid" },
          ].map((t, i) => (
            <Reveal key={t.name} delay={i}>
              <figure className="group relative glass glass-reflect rounded-2xl p-6 sm:p-7 h-full flex flex-col overflow-hidden hover:-translate-y-1 transition-transform">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex gap-0.5 text-accent">
                    {Array.from({ length: 5 }).map((_, s) => <Star key={s} className="size-3.5 fill-current" />)}
                  </div>
                  <Quote className="size-5 text-accent opacity-60" />
                </div>
                <blockquote className="text-sm sm:text-base leading-relaxed text-pretty flex-1">"{t.quote}"</blockquote>
                <figcaption className="mt-6 pt-5 border-t border-border flex items-center justify-between gap-2">
                  <div>
                    <div className="text-sm font-medium">{t.name}</div>
                    <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{t.role}</div>
                  </div>
                  <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wide text-accent shrink-0">
                    <BadgeCheck className="size-3.5" /> Verified
                  </span>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>

      <CinematicDivider />

      {/* 9 · Join The Inner Circle */}
      <section className="px-4 sm:px-6 py-12 sm:py-16">
        <Reveal className="max-w-3xl mx-auto glass-strong glass-reflect p-7 sm:p-10 md:p-12 rounded-3xl text-center relative overflow-hidden">
          <div aria-hidden className="absolute -top-24 -left-24 size-64 rounded-full opacity-50 blur-3xl" style={{ background: "var(--gradient-violet)" }} />
          <div aria-hidden className="absolute -bottom-24 -right-24 size-64 rounded-full opacity-60 blur-3xl" style={{ background: "var(--gradient-ember)" }} />
          <div className="relative z-10">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
              <Sparkles className="size-3" /> Inner Circle
            </p>
            <h2 className="text-fluid-2xl font-display tracking-tight mb-3">Join the Inner Circle</h2>
            <p className="text-muted-foreground mb-7 text-pretty max-w-lg mx-auto">
              Exclusive drops and curator insights — plus 10% off your first order.
            </p>
            <NewsletterForm source="homepage" />
          </div>
        </Reveal>
      </section>
    </>
  );
}
