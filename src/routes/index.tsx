import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Search, Shield, Truck, Headset, ArrowRight, Star, Sparkles, Award, Package, Globe2, Quote, Users, ShoppingBag, Zap } from "lucide-react";
import { useCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";

import { ProductCard } from "@/components/site/ProductCard";

import { NewsletterForm } from "@/components/site/NewsletterForm";
import { HomePersonalized } from "@/components/site/HomePersonalized";

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
      { title: "FoundOurMarket™ — Everything You Need. All In One Place." },
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

function Home() {
  const { products } = useProducts();
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

  const bestSellers = useMemo(
    () => [...products].sort((a, b) => (b.rating * b.reviews) - (a.rating * a.reviews)).slice(0, 4),
    [products]
  );

  const dealProducts = useMemo(
    () => products.filter((p) => (p.discount ?? 0) > 0).slice(0, 4),
    [products]
  );

  return (
    <>
      {/* Hero — cinematic */}
      <section className="relative pt-12 sm:pt-20 md:pt-28 pb-20 sm:pb-32 md:pb-40 px-4 sm:px-6 overflow-hidden">
        {/* Floating gradient orbs */}
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="orb animate-orb" style={{ width: 520, height: 520, top: "10%", left: "55%", background: "var(--gradient-ember)" }} />
          <div className="orb animate-orb" style={{ width: 460, height: 460, top: "30%", left: "10%", background: "var(--gradient-violet)", animationDelay: "-7s" }} />
          <div className="orb animate-orb" style={{ width: 380, height: 380, top: "65%", left: "70%", background: "radial-gradient(circle at 50% 50%, oklch(0.7 0.15 220 / 0.18), transparent 65%)", animationDelay: "-14s" }} />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            }}
          />
          {/* cinematic light sweep */}
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
            className="text-fluid-hero font-display font-semibold tracking-tight text-balance mb-6 sm:mb-8"
          >
            Everything you need.
            <br />
            <span className="text-gradient-ember">All in one place.</span>
          </motion.h1>

          <motion.p
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.15, duration: 0.7 }}
            className="text-fluid-base text-muted-foreground max-w-2xl mx-auto text-balance mb-10 sm:mb-12 px-2"
          >
            A premium independent marketplace sourcing top-quality products from across the world — delivered to your door with cinematic precision.
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
            className="mt-8 sm:mt-10 flex flex-wrap justify-center gap-3"
          >
            <Link to="/category/$slug" params={{ slug: "electronics" }} className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full bg-foreground text-background text-[11px] sm:text-xs uppercase tracking-widest font-semibold hover:brightness-110 hover:-translate-y-0.5 transition-all">
              Explore Products <ArrowRight className="size-3.5" />
            </Link>
            <a href="#categories" className="inline-flex items-center gap-2 px-5 sm:px-6 py-3 rounded-full glass text-[11px] sm:text-xs uppercase tracking-widest font-semibold hover:bg-white/10 transition-all">
              Shop Categories
            </a>
          </motion.div>

          {/* Live stats — floating layered cards */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.8 }}
            className="mt-14 sm:mt-20 grid grid-cols-3 gap-2.5 sm:gap-4 max-w-3xl mx-auto"
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
                className="glass-strong rounded-2xl px-3 sm:px-6 py-4 sm:py-6 text-left"
              >
                <div className="text-2xl sm:text-4xl font-display font-semibold tracking-tight text-gradient-ember">{s.value}</div>
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1.5">{s.label}</div>
                <div className="hidden sm:block text-[10px] text-muted-foreground/60 mt-0.5">{s.hint}</div>
              </motion.div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Trust Strip */}
      <section className="border-y border-border bg-white/[0.015] backdrop-blur-sm">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-8 grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
          {[
            { icon: Truck, label: "Worldwide Shipping" },
            { icon: Shield, label: "Secure Payments" },
            { icon: Star, label: "Curated Quality" },
            { icon: Headset, label: "24/7 Support" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex items-center gap-3 group">
              <div className="size-10 grid place-items-center rounded-xl bg-accent/10 text-accent shrink-0 group-hover:bg-accent/20 group-hover:scale-105 transition-all">
                <Icon className="size-4" />
              </div>
              <span className="text-[11px] sm:text-xs font-medium uppercase tracking-widest text-muted-foreground group-hover:text-foreground transition-colors">{label}</span>
            </div>
          ))}
        </div>
      </section>


      {/* Categories */}
      <section id="categories" className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
        <Reveal className="flex justify-between items-end mb-8 sm:mb-12 gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Browse</p>
            <h2 className="text-fluid-2xl font-display tracking-tight">Featured Categories</h2>
          </div>
          <Link to="/search" className="hidden sm:inline-block text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
            View All
          </Link>
        </Reveal>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
          {categories.map((cat, i) => (
            <Reveal key={cat.slug} delay={i} className="h-full">
              <Link
                to="/category/$slug"
                params={{ slug: cat.slug }}
                className="group relative block aspect-square bg-card border border-border rounded-2xl overflow-hidden hover:border-accent/40 transition-all hover:-translate-y-1"
              >
                <div className="absolute inset-0 grid place-items-center text-6xl font-display font-bold text-white/[0.04] group-hover:text-accent/20 transition-colors">
                  {String(i + 1).padStart(2, "0")}
                </div>
                <div
                  className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity"
                  style={{ background: "var(--gradient-ember)" }}
                />
                {/* shimmer sweep */}
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

      {/* Featured Products */}
      {products.some((p) => p.featured) && (
        <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
          <Reveal className="flex justify-between items-end mb-8 sm:mb-12 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Handpicked</p>
              <h2 className="text-fluid-2xl font-display tracking-tight">Featured Products</h2>
            </div>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {products.filter((p) => p.featured).slice(0, 4).map((p, i) => (
              <Reveal key={p.slug} delay={i}>
                <ProductCard product={p} />
              </Reveal>
            ))}
          </div>
        </section>
      )}

      {/* Editorial split */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 sm:gap-6">
          <Reveal>
            <Link to="/category/$slug" params={{ slug: "electronics" }} className="group relative block rounded-3xl overflow-hidden border border-border bg-card aspect-[4/5] sm:aspect-[5/6] md:aspect-[4/5]">
              <div className="absolute inset-0" style={{ background: "var(--gradient-ember)", opacity: 0.4 }} />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
              <div className="relative h-full flex flex-col justify-end p-6 sm:p-10">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Collection 01</p>
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-display tracking-tight mb-3">Modern Tech<br/>Essentials</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-5">Headphones, keyboards, lamps and gear engineered to elevate the everyday.</p>
                <span className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-accent group-hover:gap-3 transition-all">
                  Shop the edit <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          </Reveal>
          <Reveal delay={1}>
            <Link to="/category/$slug" params={{ slug: "fashion" }} className="group relative block rounded-3xl overflow-hidden border border-border bg-card aspect-[4/5] sm:aspect-[5/6] md:aspect-[4/5]">
              <div className="absolute inset-0 bg-gradient-to-br from-foreground/10 via-transparent to-accent/10" />
              <div className="absolute inset-0 bg-gradient-to-t from-background via-background/30 to-transparent" />
              <div className="relative h-full flex flex-col justify-end p-6 sm:p-10">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Collection 02</p>
                <h3 className="text-3xl sm:text-4xl md:text-5xl font-display tracking-tight mb-3">Quiet Luxury<br/>For Every Day</h3>
                <p className="text-sm text-muted-foreground max-w-sm mb-5">Fashion and accessories chosen for craft, material and longevity.</p>
                <span className="inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-accent group-hover:gap-3 transition-all">
                  Browse the drop <ArrowRight className="size-3.5" />
                </span>
              </div>
            </Link>
          </Reveal>
        </div>
      </section>

      {/* Best Sellers */}
      {bestSellers.length > 0 && (
        <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
          <Reveal className="flex justify-between items-end mb-8 sm:mb-12 gap-4">
            <div>
              <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
                <Award className="size-3" /> Top Rated
              </p>
              <h2 className="text-fluid-2xl font-display tracking-tight">Best Sellers</h2>
            </div>
            <Link to="/search" className="hidden sm:inline-block text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
              See All
            </Link>
          </Reveal>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
            {bestSellers.map((p, i) => (
              <Reveal key={p.slug} delay={i}><ProductCard product={p} /></Reveal>
            ))}
          </div>
        </section>
      )}

      {/* New Arrivals */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
        <Reveal className="flex justify-between items-end mb-8 sm:mb-12 gap-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
              <Sparkles className="size-3" /> Curated
            </p>
            <h2 className="text-fluid-2xl font-display tracking-tight">New Arrivals</h2>
          </div>
          <Link to="/search" className="text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
            View All
          </Link>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
          {products.filter((p) => !p.featured).slice(0, 8).map((p, i) => (
            <Reveal key={p.slug} delay={i % 4}><ProductCard product={p} /></Reveal>
          ))}
        </div>
      </section>

      {/* Deals strip */}
      {dealProducts.length > 0 && (
        <section className="px-4 sm:px-6 py-14 sm:py-20 max-w-7xl mx-auto">
          <Reveal className="rounded-3xl border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-6 sm:p-10">
            <div className="flex flex-wrap items-end justify-between gap-4 mb-6 sm:mb-8">
              <div>
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Limited Time</p>
                <h2 className="text-fluid-xl font-display tracking-tight">Save on Curator Picks</h2>
              </div>
              <Link to="/search" className="text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">All deals →</Link>
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
              {dealProducts.map((p) => <ProductCard key={p.slug} product={p} />)}
            </div>
          </Reveal>
        </section>
      )}

      <HomePersonalized />

      

      {/* Live Marketplace Stats */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
        <Reveal className="text-center mb-10 sm:mb-14">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent animate-glow" /> Live Marketplace
          </p>
          <h2 className="text-fluid-2xl font-display tracking-tight">A global engine, in motion.</h2>
        </Reveal>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5">
          {[
            { icon: Globe2, value: 180, suffix: "+", label: "Countries served" },
            { icon: Users, value: 48230, suffix: "", label: "Active shoppers" },
            { icon: Package, value: 2412, suffix: "", label: "Products available" },
            { icon: ShoppingBag, value: 17, suffix: "/min", label: "Orders right now" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i}>
              <div className="group relative glass-strong rounded-2xl p-5 sm:p-7 h-full overflow-hidden">
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
      </section>

      {/* Why Choose Us */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24 max-w-7xl mx-auto">
        <Reveal className="text-center mb-12 sm:mb-16">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Why FoundOurMarket</p>
          <h2 className="text-fluid-2xl font-display tracking-tight">Built for the modern buyer</h2>
        </Reveal>
        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 sm:gap-6">
          {[
            { icon: Shield, title: "Secure Payments", desc: "Bank-grade encryption on every transaction with trusted global gateways." },
            { icon: Globe2, title: "Worldwide Shipping", desc: "Fast, tracked delivery to 180+ countries from our global distribution hubs." },
            { icon: Award, title: "Trusted Sellers", desc: "Every supplier hand-verified. Only premium products make it to the marketplace." },
            { icon: Sparkles, title: "Premium Quality", desc: "Curated catalog — no filler, no fakes. Every item meets our quality bar." },
            { icon: Package, title: "Fast Delivery", desc: "Express options available. Most orders arrive within 5–10 business days." },
            { icon: Headset, title: "24/7 Support", desc: "Real humans, ready to help — anytime, anywhere in the world." },
          ].map((f, i) => (
            <Reveal key={f.title} delay={i % 3}>
              <div className="glass rounded-2xl p-6 sm:p-8 h-full hover:border-accent/40 transition-colors">
                <div className="size-10 rounded-xl bg-accent/10 text-accent grid place-items-center mb-4">
                  <f.icon className="size-5" />
                </div>
                <h4 className="text-base sm:text-lg font-medium mb-2 sm:mb-3">{f.title}</h4>
                <p className="text-sm text-muted-foreground leading-relaxed">{f.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Testimonials grid */}
      <section className="px-4 sm:px-6 py-16 sm:py-24 md:py-28">
        <Reveal className="max-w-3xl mx-auto text-center mb-12 sm:mb-16">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Loved Worldwide</p>
          <h2 className="text-fluid-2xl font-display tracking-tight">What buyers are saying</h2>
        </Reveal>
        <div className="max-w-6xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-4 sm:gap-6">
          {[
            { quote: "Completely redefined how I source premium goods. The quality of the marketplace is unmatched.", name: "Marcus Thorne", role: "Curator · London" },
            { quote: "Fast shipping, gorgeous packaging, and every item felt hand-picked just for me.", name: "Ayaka Mori", role: "Designer · Tokyo" },
            { quote: "Their support team is the best I've dealt with from any online store, full stop.", name: "Diego Alvarez", role: "Founder · Madrid" },
          ].map((t, i) => (
            <Reveal key={t.name} delay={i}>
              <figure className="glass rounded-2xl p-6 sm:p-8 h-full flex flex-col">
                <Quote className="size-5 text-accent mb-4 opacity-70" />
                <blockquote className="text-sm sm:text-base leading-relaxed text-pretty flex-1">"{t.quote}"</blockquote>
                <figcaption className="mt-6 pt-5 border-t border-border">
                  <div className="text-sm font-medium">{t.name}</div>
                  <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-1">{t.role}</div>
                </figcaption>
              </figure>
            </Reveal>
          ))}
        </div>
      </section>


      {/* Newsletter */}
      <section className="px-4 sm:px-6 py-14 sm:py-20 md:py-24">
        <Reveal className="max-w-3xl mx-auto bg-card border border-border p-6 sm:p-10 md:p-12 rounded-3xl text-center relative overflow-hidden">
          <div className="relative z-10">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Inner Circle</p>
            <h2 className="text-fluid-2xl font-display tracking-tight mb-4">Join the Inner Circle</h2>
            <p className="text-muted-foreground mb-8 text-pretty">
              Exclusive drops and curator insights — plus 10% off your first order.
            </p>
            <NewsletterForm source="homepage" />
          </div>
          <div
            aria-hidden
            className="absolute -bottom-24 -right-24 size-64 rounded-full"
            style={{ background: "var(--gradient-ember)", filter: "blur(60px)" }}
          />
        </Reveal>
      </section>
    </>
  );
}
