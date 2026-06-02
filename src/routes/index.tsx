import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import { Search, Shield, Headset, ArrowRight, Star, Sparkles, Award, Package, Globe2, Users, Zap, Flame, BadgeCheck, Pencil, RotateCcw, Lock, LayoutGrid } from "lucide-react";
import { useCategories, useAdminCategories, toggleCategoryVisible } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { useProductAdminEditing } from "@/lib/admin-overlay";
import { CategoryAdminSheet } from "@/components/admin/CategoryAdminSheet";
import { useHomepageSections, saveHomepageSection, toggleHomepageSection } from "@/lib/use-homepage-sections";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import { ProductCard } from "@/components/site/ProductCard";
import { LazyMount } from "@/components/site/LazyMount";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { FlashSaleStrip } from "@/components/site/FlashSaleStrip";
import { AnnouncementBar } from "@/components/site/AnnouncementBar";

import { NewsletterForm } from "@/components/site/NewsletterForm";
import { PromoBannerCarousel } from "@/components/site/PromoBannerCarousel";
import { ProductRail } from "@/components/site/ProductRail";
import { TestimonialsCarousel } from "@/components/site/TestimonialsCarousel";
import { useTestimonials } from "@/lib/use-testimonials";
import { SectionTracker } from "@/components/site/SectionTracker";

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

function AnimatedCounter({ to, suffix = "", duration = 2, decimals = 0 }: { to: number; suffix?: string; duration?: number; decimals?: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, margin: "-60px" });
  const mv = useMotionValue(0);
  const spring = useSpring(mv, { duration: duration * 1000, bounce: 0 });
  const display = useTransform(spring, (v) =>
    (decimals > 0 ? v.toFixed(decimals) : Math.round(v).toLocaleString()) + suffix
  );
  useEffect(() => { if (inView) mv.set(to); }, [inView, to, mv]);
  return <motion.span ref={ref}>{display}</motion.span>;
}

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoundOurMarket™ — Whatever You Need. All In One Place." },
      { name: "description", content: "Premium global marketplace. Curated electronics, fashion, home, fitness and more — delivered worldwide." },
      { property: "og:title", content: "FoundOurMarket™ — Premium Global Marketplace" },
      { property: "og:description", content: "Curated electronics, fashion, home, fitness and more — delivered worldwide with secure checkout." },
      { property: "og:url", content: "https://foundourmarket.com/" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/" }],
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

/* Mobile-only full-width "View All" pill shown under product carousels */
function MobileViewAll({ to, label = "View All" }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="sm:hidden mt-3 flex items-center justify-center gap-2 rounded-full glass border border-accent/25 py-3 text-[11px] font-mono uppercase tracking-widest text-accent active:scale-[0.98] transition-transform"
    >
      {label} <ArrowRight className="size-3.5" />
    </Link>
  );
}

/* LazyMount is shared across the homepage and product page. */





/* Conversion-focused tabbed product hub: collapses Trending / New Arrivals /
   Best Sellers / Featured into one compact section — only the active rail
   renders, cutting homepage height ~30-40% while keeping fast tab switching. */
type ProductTab = {
  key: string;
  eyebrow: string;
  title: string;
  icon?: React.ComponentType<{ className?: string }>;
  products: import("@/lib/products").Product[];
  active: boolean;
};

function TabbedProductHub({ tabs, isAdmin }: { tabs: ProductTab[]; isAdmin: boolean }) {
  const visible = tabs.filter((t) => t.products.length > 0 && (t.active || isAdmin));
  const [activeKey, setActiveKey] = useState(visible[0]?.key);
  if (visible.length === 0) return null;
  const current = visible.find((t) => t.key === activeKey) ?? visible[0];

  return (
    <SectionTracker sectionKey={current.key} className="px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto scroll-mt-24 block">
      {/* Tab bar — horizontally scrollable pill switcher */}
      <Reveal className="mb-4 sm:mb-6 flex items-center justify-between gap-3">
        <div className="-mx-1 flex gap-2 overflow-x-auto scrollbar-none px-1 py-1">
          {visible.map((t) => {
            const Icon = t.icon;
            const isActive = t.key === current.key;
            return (
              <button
                key={t.key}
                onClick={() => setActiveKey(t.key)}
                className={`inline-flex shrink-0 items-center gap-1.5 rounded-full border px-3.5 py-2 text-[11px] font-mono uppercase tracking-widest transition-all active:scale-95 ${
                  isActive
                    ? "border-accent/60 bg-accent/15 text-accent shadow-[var(--shadow-ember)]"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground hover:text-foreground hover:border-white/20"
                }`}
              >
                {Icon && <Icon className="size-3.5" />}
                {t.title}
                {!t.active && isAdmin && <span className="text-[8px] text-amber-400">(hidden)</span>}
              </button>
            );
          })}
        </div>
        <Link to="/search" className="hidden sm:inline-block shrink-0 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
          See All
        </Link>
      </Reveal>

      {isAdmin && (
        <div className="mb-3">
          <SectionHeader eyebrow={current.eyebrow} title={current.title} icon={current.icon} sectionKey={current.key} editable active={current.active} />
        </div>
      )}

      <LazyMount minHeight={260}>
        <ProductRail key={current.key} products={current.products} />
        <MobileViewAll to="/search" />
        <div className="hidden sm:grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 md:gap-6">
          {current.products.slice(0, 4).map((p, i) => (
            <Reveal key={p.slug} delay={i}><ProductCard product={p} /></Reveal>
          ))}
        </div>
      </LazyMount>
    </SectionTracker>
  );
}

function SectionHeader({ eyebrow, title, icon: Icon, href, hrefLabel = "View All", sectionKey, editable, active = true }: { eyebrow: string; title: string; icon?: React.ComponentType<{ className?: string }>; href?: string; hrefLabel?: string; sectionKey?: string; editable?: boolean; active?: boolean }) {
  const [editing, setEditing] = useState(false);
  const [draftEyebrow, setDraftEyebrow] = useState(eyebrow);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftActive, setDraftActive] = useState(active);
  const [saving, setSaving] = useState(false);

  function open() {
    setDraftEyebrow(eyebrow);
    setDraftTitle(title);
    setDraftActive(active);
    setEditing(true);
  }

  async function save() {
    if (!sectionKey) return;
    setSaving(true);
    try {
      await saveHomepageSection(sectionKey, {
        eyebrow: draftEyebrow.trim() || eyebrow,
        title: draftTitle.trim() || title,
        active: draftActive,
      });
      toast.success("Section updated");
      setEditing(false);
    } catch (e) {
      toast.error("Save failed", { description: e instanceof Error ? e.message : "Try again." });
    } finally {
      setSaving(false);
    }
  }

  return (
    <Reveal className="flex justify-between items-end mb-4 sm:mb-6 gap-4">
      <div className="min-w-0">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 flex items-center gap-2">
          {Icon && <Icon className="size-3" />} {eyebrow}
        </p>
        <div className="flex items-center gap-2">
          <h2 className="text-fluid-2xl font-display tracking-tight">{title}</h2>
          {editable && sectionKey && (
            <InlineActiveToggle
              active={active}
              label="Section"
              size="sm"
              onToggle={(next) => toggleHomepageSection(sectionKey, next)}
            />
          )}
          {editable && sectionKey && (
            <button
              onClick={open}
              aria-label="Edit section"
              className="grid size-7 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent transition-colors hover:bg-accent/20"
            >
              <Pencil className="size-3.5" />
            </button>
          )}
        </div>
      </div>
      {href && (
        <Link to={href} className="hidden sm:inline-block text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">
          {hrefLabel}
        </Link>
      )}

      {editing && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4" onClick={() => !saving && setEditing(false)}>
          <div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />
          <div
            onClick={(e) => e.stopPropagation()}
            className="relative z-10 w-full max-w-sm rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"
          >
            <p className="mb-4 flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.25em] text-accent">
              <Pencil className="size-3" /> Edit section
            </p>
            <label className="mb-3 block">
              <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Eyebrow</span>
              <input
                value={draftEyebrow}
                onChange={(e) => setDraftEyebrow(e.target.value)}
                className="w-full rounded-xl border border-border bg-card/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/55"
              />
            </label>
            <label className="mb-4 block">
              <span className="mb-1.5 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Title</span>
              <input
                value={draftTitle}
                onChange={(e) => setDraftTitle(e.target.value)}
                className="w-full rounded-xl border border-border bg-card/80 px-3 py-2.5 text-sm text-foreground outline-none focus:border-accent/55"
              />
            </label>
            <button
              type="button"
              onClick={() => setDraftActive((v) => !v)}
              className={`mb-5 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${draftActive ? "border-accent/50 bg-accent/15" : "border-border bg-card hover:border-accent/30"}`}
            >
              <span className="text-left">
                <span className="block text-xs font-medium text-foreground">Active on homepage</span>
                <span className="block text-[10px] text-muted-foreground">{draftActive ? "Visible to shoppers" : "Hidden from shoppers"}</span>
              </span>
              <span className={`relative h-5 w-9 shrink-0 rounded-full transition-colors ${draftActive ? "bg-accent" : "bg-white/15"}`} aria-hidden>
                <span className={`absolute top-0.5 size-4 rounded-full bg-white transition-transform ${draftActive ? "translate-x-[1.125rem]" : "translate-x-0.5"}`} />
              </span>
            </button>
            <div className="flex items-center gap-2">
              <button
                onClick={() => setEditing(false)}
                disabled={saving}
                className="rounded-xl border border-border px-3 py-2.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                className="ml-auto inline-flex items-center gap-2 rounded-xl bg-accent px-4 py-2.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-60"
              >
                {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                Save changes
              </button>
            </div>
          </div>
        </div>
      )}
    </Reveal>
  );
}

function Home() {
  const { products, loading: productsLoading } = useProducts();
  const { categories: publicCategories } = useCategories();
  const { sections } = useHomepageSections();

  const { canEdit: isProductAdmin } = useProductAdminEditing();
  const { categories: adminCategories } = useAdminCategories(isProductAdmin);
  // Admins see every category (incl. hidden) so they can toggle visibility inline.
  const categories = isProductAdmin ? adminCategories : publicCategories;
  const [editCats, setEditCats] = useState(false);

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

  const bestSellers = useMemo(
    () => [...products].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 8),
    [products]
  );

  const featured = useMemo(() => {
    const flagged = products.filter((p) => p.featured);
    return (flagged.length > 0 ? flagged : [...products].sort((a, b) => b.rating - a.rating)).slice(0, 8);
  }, [products]);


  const { items: testimonials } = useTestimonials();





  return (
    <>
      {/* Sticky announcement bar — homepage only */}
      <AnnouncementBar />

      {/* 1 · Cinematic Hero */}
      <section className="relative pt-5 sm:pt-10 md:pt-14 pb-5 sm:pb-9 md:pb-11 px-4 sm:px-6 overflow-hidden">
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
            <span className="sr-only">FoundOurMarket — Premium Global Marketplace. </span>
            <span aria-hidden="true">Whatever you need.</span>
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
            <Link to="/category/$slug" params={{ slug: "electronics" }} className="inline-flex items-center gap-2 px-6 sm:px-7 py-3 rounded-full bg-accent text-accent-foreground text-[11px] sm:text-xs uppercase tracking-widest font-semibold hover:brightness-110 hover:-translate-y-0.5 transition-all shadow-[var(--shadow-ember)]">
              Shop Now <ArrowRight className="size-3.5" />
            </Link>
            <a href="#categories" className="inline-flex items-center gap-2 px-6 sm:px-7 py-3 rounded-full glass text-[11px] sm:text-xs uppercase tracking-widest font-semibold hover:bg-white/10 transition-all">
              Browse Categories
            </a>
          </motion.div>

          {/* Floating live stats */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.55, duration: 0.8 }}
            className="mt-6 sm:mt-9 grid grid-cols-3 gap-2.5 sm:gap-4 max-w-3xl mx-auto"
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

      {/* Flash sale strip — high-intent conversion driver under the hero */}
      <section className="px-4 sm:px-6 pt-2">
        <FlashSaleStrip />
      </section>

      {/* 3 · Trust Bar — horizontal scroll premium glass cards */}
      <section className="cv-auto py-4 sm:py-7 max-w-7xl mx-auto">
        <div className="flex gap-3 sm:gap-4 overflow-x-auto no-scrollbar px-4 sm:px-6 snap-x snap-mandatory sm:grid sm:grid-cols-3 lg:grid-cols-6 sm:overflow-visible">
          {[
            { icon: Lock, title: "Secure Checkout", desc: "Bank-grade encryption." },
            { icon: Globe2, title: "Global Shipping", desc: "Delivery to 180+ countries." },
            { icon: Zap, title: "Fast Delivery", desc: "Express tracked dispatch." },
            { icon: RotateCcw, title: "Easy Returns", desc: "Hassle-free refunds." },
            { icon: Headset, title: "24/7 Support", desc: "Real humans, anytime." },
            { icon: BadgeCheck, title: "Verified Products", desc: "Hand-checked quality." },
          ].map((b, i) => (
            <Reveal key={b.title} delay={i} className="snap-start shrink-0 w-[44%] xs:w-[40%] sm:w-auto">
              <div className="group relative h-full glass glass-reflect rounded-2xl p-4 sm:p-5 overflow-hidden hover:border-accent/40 transition-colors">
                <div aria-hidden className="absolute -top-10 -right-10 size-28 rounded-full opacity-0 group-hover:opacity-60 blur-2xl transition-opacity" style={{ background: "var(--gradient-ember-soft)" }} />
                <div className="relative size-9 sm:size-10 grid place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20 mb-3 group-hover:scale-105 group-hover:shadow-[0_0_22px_-6px_var(--color-accent)] transition-all">
                  <b.icon className="size-4" />
                </div>
                <h4 className="relative text-xs sm:text-sm font-medium mb-1 whitespace-nowrap">{b.title}</h4>
                <p className="relative text-[11px] sm:text-xs text-muted-foreground leading-relaxed">{b.desc}</p>
              </div>
            </Reveal>
          ))}
        </div>
      </section>

      {/* Categories — premium interactive discovery */}
      <section id="categories" className="px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto scroll-mt-24">
        <div className="relative">
          <SectionHeader eyebrow="Browse" title="Featured Categories" href="/search" />
          {isProductAdmin && (
            <button
              onClick={() => setEditCats(true)}
              className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-md hover:bg-accent/15"
            >
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-3 md:grid-cols-5 gap-2 sm:gap-3">
          {(isProductAdmin ? categories.filter((c) => !c.parent_id) : categories.slice(0, 8)).map((cat, i) => (
            <Reveal key={cat.slug} delay={i} className="h-full">
              <div className="relative h-full">
              <Link
                to="/category/$slug"
                params={{ slug: cat.slug }}
                onClick={() => { void supabase.rpc("track_category_event", { _id: cat.id, _event: "click" }); }}
                className={`group product-card-glass relative block aspect-square overflow-hidden hover:-translate-y-1.5 ${isProductAdmin && !cat.homepage_visible ? "opacity-50" : ""}`}
              >
                {cat.image ? (
                  <img
                    src={cat.image}
                    alt={cat.name}
                    loading="lazy"
                    className="absolute inset-0 size-full object-cover opacity-70 transition-all duration-700 group-hover:scale-105 group-hover:opacity-90"
                  />
                ) : (
                  <div className="absolute inset-0 grid place-items-center text-6xl font-display font-bold text-white/[0.04] group-hover:text-accent/20 transition-colors">
                    {String(i + 1).padStart(2, "0")}
                  </div>
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-background/90 via-background/30 to-transparent" />
                <div className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--gradient-ember)" }} />
                <div className="pointer-events-none absolute inset-0 -translate-x-full group-hover:translate-x-full transition-transform duration-[1400ms] ease-out bg-gradient-to-r from-transparent via-white/[0.08] to-transparent skew-x-12" />
                {(cat.featured || cat.trending) && (
                  <div className="absolute right-2 top-2 z-10 flex gap-1">
                    {cat.featured && (
                      <span className="grid size-6 place-items-center rounded-full bg-background/70 text-accent backdrop-blur-md"><Star className="size-3" /></span>
                    )}
                    {cat.trending && (
                      <span className="grid size-6 place-items-center rounded-full bg-background/70 text-orange-400 backdrop-blur-md"><Flame className="size-3" /></span>
                    )}
                  </div>
                )}
                <div className="absolute inset-0 p-2 sm:p-3 flex flex-col justify-end z-10">
                  <h3 className="text-[12px] sm:text-sm font-semibold tracking-tight leading-tight line-clamp-1 group-hover:text-accent transition-colors">{cat.name}</h3>
                  <span className="mt-1 inline-flex w-fit items-center gap-1 rounded-full bg-white/10 px-1.5 py-0.5 text-[8px] sm:text-[10px] text-muted-foreground font-mono uppercase tracking-widest ring-1 ring-white/10">
                    {categoryCounts[cat.slug] ?? 0} items
                  </span>
                </div>
              </Link>
              {isProductAdmin && (
                <div className="absolute left-2 top-2 z-20">
                  <InlineActiveToggle
                    active={cat.homepage_visible}
                    label="Category"
                    size="sm"
                    onToggle={(next) => toggleCategoryVisible(cat.id, next)}
                  />
                </div>
              )}
              </div>
            </Reveal>
          ))}

          {!isProductAdmin && (
            <Reveal delay={6} className="h-full">
              <Link
                to="/categories"
                className="group product-card-glass relative flex h-full min-h-[140px] aspect-square flex-col items-center justify-center gap-3 overflow-hidden text-center hover:-translate-y-1.5"
              >
                <div aria-hidden className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity" style={{ background: "var(--gradient-ember)" }} />
                <div className="relative size-12 grid place-items-center rounded-2xl bg-accent/15 text-accent ring-1 ring-accent/30 group-hover:scale-110 group-hover:shadow-[0_0_28px_-6px_var(--color-accent)] transition-all">
                  <LayoutGrid className="size-5" />
                </div>
                <div className="relative">
                  <h3 className="text-base sm:text-lg font-medium">View All</h3>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5 inline-flex items-center gap-1">
                    Explore categories <ArrowRight className="size-3 transition-transform group-hover:translate-x-0.5" />
                  </p>
                </div>
              </Link>
            </Reveal>
          )}
        </div>
      </section>
      {isProductAdmin && editCats && (
        <CategoryAdminSheet onClose={() => setEditCats(false)} onChanged={() => {}} productCounts={categoryCounts} />
      )}


      <CinematicDivider />

      {/* 5 · Trending / New Arrivals / Best Sellers / Featured — tabbed hub */}
      {productsLoading ? (
        <section className="px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto">
          <ProductSkeletonGrid count={4} />
        </section>
      ) : (
        <TabbedProductHub
          isAdmin={isProductAdmin}
          tabs={[
            { key: "trending", eyebrow: sections.trending.eyebrow, title: sections.trending.title, icon: Flame, products: trending, active: sections.trending.active },
            { key: "new_arrivals", eyebrow: sections.new_arrivals.eyebrow, title: sections.new_arrivals.title, icon: Sparkles, products: newArrivals, active: sections.new_arrivals.active },
            { key: "best_sellers", eyebrow: sections.best_sellers.eyebrow, title: sections.best_sellers.title, icon: Award, products: bestSellers, active: sections.best_sellers.active },
            { key: "featured", eyebrow: sections.featured.eyebrow, title: sections.featured.title, icon: Star, products: featured, active: sections.featured.active },
          ]}
        />
      )}




      {/* 9 · Featured Collections */}
      <section className="cv-auto px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto">
        <LazyMount minHeight={220}>
          <PromoBannerCarousel types={["hero"]} maxItems={3} eyebrow="Featured Collections" />
        </LazyMount>
      </section>

      <CinematicDivider />

      {/* 10 · Social Proof — live engine + verified reviews */}
      <section className="px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto">
        <Reveal className="text-center mb-5 sm:mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent animate-glow" /> Live Marketplace
          </p>
          <h2 className="text-fluid-2xl font-display tracking-tight">Trusted by buyers worldwide</h2>
        </Reveal>


        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-5 mb-5 sm:mb-8">
          {[
            { icon: Users, value: 50000, suffix: "+", label: "Happy customers" },
            { icon: Package, value: 10000, suffix: "+", label: "Products available" },
            { icon: Globe2, value: 120, suffix: "+", label: "Countries served" },
            { icon: Star, value: 4.8, suffix: "★", label: "Average rating" },
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
                  <AnimatedCounter to={s.value} suffix={s.suffix} decimals={Number.isInteger(s.value) ? 0 : 1} />
                </div>
                <div className="relative text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-2">{s.label}</div>
              </div>
            </Reveal>
          ))}
        </div>

        {testimonials.length > 0 && (() => {
          return (
            <>
              {/* Mobile: compact swipeable carousel with dots + autorotate */}
              <TestimonialsCarousel items={testimonials} />

              {/* Desktop: compact grid */}
              <div className="hidden md:grid grid-cols-3 gap-5">
                {testimonials.map((t, i) => (
                  <Reveal key={t.name} delay={i}>
                    <figure className="group relative glass glass-reflect rounded-2xl p-5 h-full flex flex-col overflow-hidden hover:-translate-y-1 transition-transform duration-200">
                      <div className="flex gap-0.5 text-accent mb-2.5">
                        {Array.from({ length: 5 }).map((_, s) => <Star key={s} className="size-3.5 fill-current" />)}
                      </div>
                      <blockquote className="text-sm leading-relaxed text-pretty flex-1">"{t.quote}"</blockquote>
                      <figcaption className="mt-4 pt-3.5 border-t border-border flex items-center gap-3">
                        <span className="size-9 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 text-xs font-semibold">
                          {t.name.split(" ").map((p) => p[0]).slice(0, 2).join("")}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="text-sm font-medium truncate flex items-center gap-1.5">
                            {t.name}
                            <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-wide text-accent">
                              <BadgeCheck className="size-3" /> Verified
                            </span>
                          </div>
                          <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5 flex items-center gap-1">
                            <span aria-hidden>{t.flag}</span> {t.country}
                          </div>
                        </div>
                      </figcaption>
                    </figure>
                  </Reveal>
                ))}
              </div>
            </>
          );
        })()}

      </section>

      <CinematicDivider />

      {/* 11 · Join The Inner Circle */}
      <section className="px-4 sm:px-6 py-6 sm:py-9">
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
