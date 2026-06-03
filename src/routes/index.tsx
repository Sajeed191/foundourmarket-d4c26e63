import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, useInView, useMotionValue, useSpring, useTransform } from "framer-motion";
import {
  Search, ArrowRight, Star, Sparkles, Award, Package, Globe2, Users, Flame,
  BadgeCheck, Pencil,
  Sofa, UtensilsCrossed, Gamepad2, Cpu, ToyBrick, PawPrint, Car, Shirt, Dumbbell,
  Watch, Headphones, Gem, Baby, Wrench, BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
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
import { AnnouncementBar } from "@/components/site/AnnouncementBar";
import { TrustBadgesStrip } from "@/components/site/TrustBadgesStrip";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";

import { NewsletterForm } from "@/components/site/NewsletterForm";

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
    </div>
  );
}

/* Full-width premium "View All" button shown directly below each product section */
function ViewAllButton({ to, label = "View All" }: { to: string; label?: string }) {
  return (
    <Link
      to={to}
      className="mt-4 flex items-center justify-center gap-2 w-full rounded-2xl glass-strong border border-accent/30 py-3.5 text-[11px] font-mono font-semibold uppercase tracking-[0.25em] text-accent hover:bg-accent/10 active:scale-[0.99] transition-all"
    >
      {label} <ArrowRight className="size-3.5" />
    </Link>
  );
}

/* Premium category icon mapping — keyed by keyword in slug/name. */
const CATEGORY_ICON_RULES: { match: string[]; icon: LucideIcon }[] = [
  { match: ["kitchen"], icon: UtensilsCrossed },
  { match: ["home", "decor", "furnitur"], icon: Sofa },
  { match: ["gaming", "game"], icon: Gamepad2 },
  { match: ["electronic", "tech", "gadget"], icon: Cpu },
  { match: ["beauty", "cosmetic", "skin"], icon: Gem },
  { match: ["toy", "kids"], icon: ToyBrick },
  { match: ["pet", "animal"], icon: PawPrint },
  { match: ["vehicle", "car", "auto", "moto"], icon: Car },
  { match: ["fashion", "cloth", "apparel", "wear"], icon: Shirt },
  { match: ["fitness", "sport", "gym"], icon: Dumbbell },
  { match: ["watch", "accessor"], icon: Watch },
  { match: ["audio", "headphone", "sound"], icon: Headphones },
  { match: ["baby", "infant"], icon: Baby },
  { match: ["tool", "hardware", "diy"], icon: Wrench },
  { match: ["book", "stationery", "office"], icon: BookOpen },
];

function iconForCategory(slug: string, name: string): LucideIcon {
  const hay = `${slug} ${name}`.toLowerCase();
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.match.some((m) => hay.includes(m))) return rule.icon;
  }
  return Package;
}

/* Single product section (lazy-mounted). Shows exactly 4 products in a 2×2
   mobile grid (no carousel) with a full-width premium "View All" button. */
function ProductSection({
  sectionKey, eyebrow, title, icon, products, isAdmin, active, viewAllTo, prominent = false, minHeight = 260,
}: {
  sectionKey: string;
  eyebrow: string;
  title: string;
  icon?: LucideIcon;
  products: import("@/lib/products").Product[];
  isAdmin: boolean;
  active: boolean;
  viewAllTo: string;
  prominent?: boolean;
  minHeight?: number;
}) {
  if (products.length === 0 || (!active && !isAdmin)) return null;
  const preview = products.slice(0, 4);
  return (
    <SectionTracker
      sectionKey={sectionKey}
      className={`cv-auto px-4 sm:px-6 ${prominent ? "py-5 sm:py-8" : "py-4 sm:py-7"} max-w-7xl mx-auto scroll-mt-24 block`}
    >
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        icon={icon}
        href={viewAllTo}
        sectionKey={sectionKey}
        editable={isAdmin}
        active={active}
        prominent={prominent}
      />
      <LazyMount minHeight={minHeight}>
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
          {preview.map((p, i) => (
            <Reveal key={p.slug} delay={i}><ProductCard product={p} compact /></Reveal>
          ))}
        </div>
        <ViewAllButton to={viewAllTo} />
      </LazyMount>
    </SectionTracker>
  );
}


function SectionHeader({ eyebrow, title, icon: Icon, href, hrefLabel = "View All", sectionKey, editable, active = true, prominent = false }: { eyebrow: string; title: string; icon?: React.ComponentType<{ className?: string }>; href?: string; hrefLabel?: string; sectionKey?: string; editable?: boolean; active?: boolean; prominent?: boolean }) {
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
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-2">
          {Icon && <Icon className="size-3" />} {eyebrow}
        </p>
        <div className="flex items-center gap-2">
          <h2 className={`${prominent ? "text-fluid-3xl" : "text-fluid-2xl"} font-display tracking-tight`}>{title}</h2>
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

/**
 * Responsive category count — renders only the cards each breakpoint needs
 * (mobile 6, tablet 7, desktop 9) instead of hiding cards with CSS.
 * SSR-safe: reads the real width on mount and updates on resize.
 */
function useCategoryLimit() {
  const get = () => {
    if (typeof window === "undefined") return 9;
    const w = window.innerWidth;
    if (w >= 1024) return 9;
    if (w >= 768) return 7;
    return 5;
  };
  const [limit, setLimit] = useState(get);
  useEffect(() => {
    const onResize = () => setLimit(get());
    onResize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return limit;
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

  const newArrivals = useMemo(
    () => [...products].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 8),
    [products]
  );

  const bestSellers = useMemo(
    () => [...products].sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0)).slice(0, 8),
    [products]
  );

  const { items: testimonials } = useTestimonials();

  const categoryLimit = useCategoryLimit();
  const homeCategories = isProductAdmin
    ? categories.filter((c) => !c.parent_id)
    : categories.slice(0, categoryLimit);

  return (
    <>
      {/* Sticky announcement bar — homepage only */}
      <AnnouncementBar />

      {/* 2 · Cinematic Hero */}
      <section className="relative pt-5 sm:pt-10 md:pt-14 pb-5 sm:pb-9 md:pb-11 px-4 sm:px-6 overflow-hidden">
        {/* Layered ambient mesh + orbs */}
        <div aria-hidden className="absolute inset-0 -z-10 overflow-hidden">
          <div className="orb animate-orb" style={{ width: 520, height: 520, top: "8%", left: "55%", background: "var(--gradient-ember)" }} />
          <div className="orb animate-orb" style={{ width: 460, height: 460, top: "28%", left: "8%", background: "var(--gradient-violet)", animationDelay: "-7s" }} />
          <div
            className="absolute inset-0 opacity-[0.04]"
            style={{
              backgroundImage:
                "linear-gradient(oklch(1 0 0 / 0.6) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.6) 1px, transparent 1px)",
              backgroundSize: "64px 64px",
              maskImage: "radial-gradient(ellipse at center, black 30%, transparent 70%)",
            }}
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
            className="text-fluid-base text-muted-foreground max-w-xl mx-auto text-balance mb-7 sm:mb-9 px-2"
          >
            A premium independent marketplace, sourcing top-quality products from across the world — delivered with cinematic precision.
          </motion.p>

          {/* Search — primary action, premium glass, 52px+ height */}
          <motion.form
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.25, duration: 0.7 }}
            onSubmit={(e) => { e.preventDefault(); nav({ to: "/search", search: { q: query } }); }}
            className="max-w-2xl mx-auto relative group"
          >
            <div className={`relative glass-strong rounded-full ring-1 transition-colors ${searchFocused ? "ring-accent/50" : "ring-white/10"}`}>
              <Search className={`absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 size-5 transition-colors ${searchFocused ? "text-accent" : "text-muted-foreground"}`} />
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                placeholder={rotatingPlaceholder}
                aria-label="Search products"
                className="w-full min-h-[56px] bg-transparent rounded-full pl-12 sm:pl-14 pr-28 sm:pr-36 py-4 text-base sm:text-lg focus:outline-none placeholder:text-muted-foreground/60"
              />
              <button type="submit" className="absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-semibold px-5 sm:px-7 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-[var(--shadow-ember)]">
                Search
              </button>
            </div>
          </motion.form>

          {/* Primary hero CTAs */}
          <motion.div
            initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35, duration: 0.7 }}
            className="mt-5 sm:mt-7 flex flex-wrap items-center justify-center gap-3"
          >
            <Link
              to="/categories"
              className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full bg-accent text-accent-foreground text-xs font-semibold uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all shadow-[var(--shadow-ember)]"
            >
              Shop Now
            </Link>
            <Link
              to="/categories"
              className="inline-flex items-center justify-center gap-2 h-12 px-7 rounded-full glass-strong ring-1 ring-white/15 text-xs font-semibold uppercase tracking-widest hover:ring-accent/40 hover:text-foreground active:scale-[0.98] transition-all"
            >
              Browse Categories
            </Link>
          </motion.div>

          {/* Floating live stats */}
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.8 }}
            className="mt-6 sm:mt-9 grid grid-cols-3 gap-2.5 sm:gap-4 max-w-3xl mx-auto"
          >
            {[
              { value: "180+", label: "Countries", hint: "Worldwide reach" },
              { value: "2.4k+", label: "Products", hint: "Curated daily" },
              { value: "98%", label: "Happy buyers", hint: "5-star average" },
            ].map((s) => (
              <div
                key={s.label}
                className="glass-strong rounded-2xl px-3 sm:px-6 py-4 sm:py-6 text-left"
              >
                <div className="text-2xl sm:text-4xl font-display font-semibold tracking-tight text-gradient-ember">{s.value}</div>
                <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1.5">{s.label}</div>
                <div className="hidden sm:block text-[10px] text-muted-foreground/60 mt-0.5">{s.hint}</div>
              </div>
            ))}
          </motion.div>
        </div>
      </section>

      {/* Trust strip — compact, between hero and categories */}
      <TrustBadgesStrip />

      {/* 3 · Main Categories — premium 2-column marketplace grid */}
      <section id="categories" className="px-4 sm:px-6 py-5 sm:py-8 max-w-7xl mx-auto scroll-mt-24">
        <div className="relative">
          <SectionHeader eyebrow="Browse" title="Main Categories" href="/categories" />
          {isProductAdmin && (
            <button
              onClick={() => setEditCats(true)}
              className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-md hover:bg-accent/15"
            >
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-5 gap-3 sm:gap-4">
          {homeCategories.map((cat, i) => {
            const Icon = iconForCategory(cat.slug, cat.name);
            const hasImage = !!(cat.image || cat.mobile_image);
            return (
              <Reveal key={cat.slug} delay={i} className="h-full">
                <div className="relative h-full">
                  <Link
                    to="/category/$slug"
                    params={{ slug: cat.slug }}
                    onClick={() => { void supabase.rpc("track_category_event", { _id: cat.id, _event: "click" }); }}
                    className={`group relative flex h-full flex-col items-center gap-2.5 sm:gap-3 p-2.5 sm:p-4 text-center rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-sm shadow-[0_2px_12px_-4px_rgba(0,0,0,0.3)] transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_8px_32px_-8px_oklch(0.74_0.19_49/0.45)] active:scale-[0.97] ${isProductAdmin && !cat.homepage_visible ? "opacity-50" : ""}`}
                  >
                    {/* Image above name — 1:1, premium rounded capsule.
                        Falls back to an icon inside a soft glass capsule. */}
                    <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-white/[0.08] bg-white/[0.04]">
                      {hasImage ? (
                        <img
                          src={cat.mobile_image || cat.image || ""}
                          alt={cat.name}
                          loading="lazy"
                          className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                        />
                      ) : (
                        <div className="size-full grid place-items-center">
                          <span className="grid size-14 sm:size-16 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_28px_-6px_oklch(0.74_0.19_49/0.6)] transition-colors group-hover:bg-accent/20">
                            <Icon className="size-6 sm:size-7" />
                          </span>
                        </div>
                      )}
                    </div>
                    <div className="mt-auto w-full pb-0.5">
                      <h3 className="text-[14px] sm:text-[16px] font-semibold tracking-tight leading-snug line-clamp-1 text-white group-hover:text-accent transition-colors">{cat.name}</h3>
                      {(categoryCounts[cat.slug] ?? 0) > 0 && (
                        <span className="block text-[10px] sm:text-[11px] text-muted-foreground font-medium tracking-wide mt-1">
                          {categoryCounts[cat.slug]} {categoryCounts[cat.slug] === 1 ? "Product" : "Products"}
                        </span>
                      )}
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
            );
          })}

          {!isProductAdmin && (
            <Reveal delay={homeCategories.length} className="h-full">
              <Link
                to="/categories"
                className="group relative flex h-full flex-col items-center gap-2.5 sm:gap-3 p-2.5 sm:p-4 text-center rounded-2xl border border-accent/50 bg-gradient-to-br from-accent/20 via-accent/10 to-transparent shadow-[0_0_40px_-12px_oklch(0.74_0.19_49/0.7)] hover:-translate-y-1 hover:border-accent/70 hover:shadow-[0_0_50px_-10px_oklch(0.74_0.19_49/0.85)] active:scale-[0.97] transition-all duration-300"
              >
                <div className="relative w-full aspect-square grid place-items-center overflow-hidden rounded-2xl bg-accent/15 ring-1 ring-accent/40">
                  <span aria-hidden className="pointer-events-none absolute inset-0 opacity-60 blur-2xl bg-[radial-gradient(circle_at_center,oklch(0.74_0.19_49/0.6),transparent_70%)] transition-opacity duration-300 group-hover:opacity-100" />
                  <span className="relative grid size-14 sm:size-16 place-items-center rounded-full bg-accent text-accent-foreground shadow-[0_0_36px_-4px_oklch(0.74_0.19_49/0.9)] transition-transform duration-300 group-hover:scale-110">
                    <ArrowRight className="size-6 sm:size-7 transition-transform duration-300 group-hover:translate-x-1" />
                  </span>
                </div>
                <div className="mt-auto w-full pb-0.5">
                  <h3 className="text-[14px] sm:text-[16px] font-semibold tracking-tight leading-snug text-accent group-hover:text-accent transition-colors">Shop All Departments</h3>
                  <span className="block text-[10px] sm:text-[11px] text-accent/70 font-medium tracking-wide mt-1">
                    Explore the full marketplace
                  </span>
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

      {/* 4-6 · Trending / New Arrivals / Best Sellers — separate lazy rails */}
      {productsLoading ? (
        <section className="px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto">
          <ProductSkeletonGrid count={4} />
        </section>
      ) : (
        <>
          <ProductSection
            sectionKey="trending"
            eyebrow={sections.trending.eyebrow}
            title={sections.trending.title}
            icon={Flame}
            products={trending}
            isAdmin={isProductAdmin}
            active={sections.trending.active}
            viewAllTo="/products/trending"
            prominent
            minHeight={320}
          />
          <ProductSection
            sectionKey="new_arrivals"
            eyebrow={sections.new_arrivals.eyebrow}
            title={sections.new_arrivals.title}
            icon={Sparkles}
            products={newArrivals}
            isAdmin={isProductAdmin}
            active={sections.new_arrivals.active}
            viewAllTo="/products/new-arrivals"
          />
          <ProductSection
            sectionKey="best_sellers"
            eyebrow={sections.best_sellers.eyebrow}
            title={sections.best_sellers.title}
            icon={Award}
            products={bestSellers}
            isAdmin={isProductAdmin}
            active={sections.best_sellers.active}
            viewAllTo="/products/best-sellers"
          />
        </>
      )}

      <CinematicDivider />

      {/* 7 · Social Proof — compact metrics + verified reviews */}
      <section className="cv-auto px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto">
        <Reveal className="text-center mb-4 sm:mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent animate-glow" /> Live Marketplace
          </p>
          <h2 className="text-fluid-2xl font-display tracking-tight">Trusted by customers in 120+ countries</h2>
        </Reveal>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-2.5 sm:gap-4 mb-4 sm:mb-6">
          {[
            { icon: Users, value: 50000, suffix: "+", label: "Customers" },
            { icon: Package, value: 10000, suffix: "+", label: "Products" },
            { icon: Globe2, value: 120, suffix: "+", label: "Countries" },
            { icon: Star, value: 4.8, suffix: "★", label: "Rating" },
          ].map((s, i) => (
            <Reveal key={s.label} delay={i}>
              <div className="glass-strong rounded-2xl p-3.5 sm:p-5 h-full flex items-center gap-3">
                <div className="size-9 shrink-0 rounded-xl bg-accent/10 text-accent grid place-items-center ring-1 ring-accent/20">
                  <s.icon className="size-4" />
                </div>
                <div className="min-w-0">
                  <div className="text-xl sm:text-3xl font-display font-semibold tracking-tight text-gradient-ember leading-none">
                    <AnimatedCounter to={s.value} suffix={s.suffix} decimals={Number.isInteger(s.value) ? 0 : 1} />
                  </div>
                  <div className="text-[9px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1.5">{s.label}</div>
                </div>
              </div>
            </Reveal>
          ))}
        </div>

        {testimonials.length > 0 && (
          <LazyMount minHeight={240}>
            <>
              {/* Mobile: compact swipeable carousel with dots + autorotate */}
              <TestimonialsCarousel items={testimonials} />

              {/* Desktop: compact grid */}
              <div className="hidden md:grid grid-cols-3 gap-5">
                {testimonials.map((t, i) => (
                  <Reveal key={t.name} delay={i}>
                    <figure className="group relative glass rounded-2xl p-5 h-full flex flex-col overflow-hidden hover:-translate-y-1 transition-transform duration-200">
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
          </LazyMount>
        )}
      </section>

      <CinematicDivider />

      {/* 8 · Join The Inner Circle — compact */}
      <section className="px-4 sm:px-6 py-4 sm:py-6">
        <Reveal className="max-w-3xl mx-auto glass-strong p-5 sm:p-7 rounded-3xl text-center relative overflow-hidden">
          <div aria-hidden className="absolute -bottom-24 -right-24 size-56 rounded-full opacity-40 blur-3xl" style={{ background: "var(--gradient-ember)" }} />
          <div className="relative z-10">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 inline-flex items-center gap-2">
              <Sparkles className="size-3" /> Inner Circle
            </p>
            <h2 className="text-fluid-2xl font-display tracking-tight mb-2">Join the Inner Circle</h2>
            <p className="text-muted-foreground mb-5 text-pretty max-w-lg mx-auto text-sm">
              Exclusive drops and curator insights — plus 10% off your first order.
            </p>
            <NewsletterForm source="homepage" />
          </div>
        </Reveal>
      </section>
    </>
  );
}
