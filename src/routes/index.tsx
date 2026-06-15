import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import {
  Search, ArrowRight, Star, Sparkles, Award, Package, Globe2, Flame,
  BadgeCheck, Pencil, Truck, ShieldCheck, TrendingUp,
  Sofa, UtensilsCrossed, Gamepad2, Cpu, ToyBrick, PawPrint, Car, Shirt, Dumbbell,
  Watch, Headphones, Gem, Baby, Wrench, BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCategories, useAdminCategories, toggleCategoryVisible } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { useProductAdminEditing } from "@/lib/admin-overlay";
import { useOrderRotationSeed, seededShuffle } from "@/lib/rotation";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
const CategoryAdminSheet = lazy(() =>
  import("@/components/admin/CategoryAdminSheet").then((m) => ({ default: m.CategoryAdminSheet })),
);
import { useHomepageSections, saveHomepageSection, toggleHomepageSection } from "@/lib/use-homepage-sections";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import heroProductImg from "@/assets/hero-product.jpg";
import { ProductCard } from "@/components/site/ProductCard";
import { LazyMount } from "@/components/site/LazyMount";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { AnnouncementBar } from "@/components/site/AnnouncementBar";
import { FlashDeals } from "@/components/site/FlashDeals";
import { TrustBadgesStrip } from "@/components/site/TrustBadgesStrip";
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

import { Reveal } from "@/components/site/Reveal";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoundOurMarket™ — Whatever You Need. All In One Place." },
      { name: "description", content: "Premium global marketplace. Curated electronics, home, fitness and more — delivered worldwide." },
      { property: "og:title", content: "FoundOurMarket™ — Premium Global Marketplace" },
      { property: "og:description", content: "Curated electronics, home, fitness and more — delivered worldwide with secure checkout." },
      { property: "og:url", content: "https://foundourmarket.com/" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/" }],
  }),
  component: Home,
});

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
  { match: ["cloth", "apparel", "wear"], icon: Shirt },
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
  // Section-specific badge: inside a dedicated section, each card shows only
  // that section's badge.
  const sectionBadge =
    sectionKey === "trending"
      ? "trending"
      : sectionKey === "best_sellers"
        ? "bestseller"
        : sectionKey === "new_arrivals"
          ? "new"
          : null;
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
            <Reveal key={p.slug} delay={i}><ProductCard product={p} compact forceBadge={sectionBadge} /></Reveal>
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
 * (mobile 5, tablet 7, desktop 7+1 shop-all = 4 + 4) instead of hiding cards with CSS.
 * SSR-safe: reads the real width on mount and updates on resize.
 */
function useCategoryLimit() {
  const get = () => {
    if (typeof window === "undefined") return 7;
    const w = window.innerWidth;
    if (w >= 1024) return 7;   // desktop: 4 + 3 categories, shop-all card fills 8th slot
    if (w >= 768) return 7;    // tablet: 4 + 3 categories
    return 5;                  // mobile: 2 rows of 2 + 1 shop-all
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

  const rotationSeed = useOrderRotationSeed();
  const rotationNonce = useRotationNonce();

  const trending = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => p.trending),
        rotationSeed + rotationNonce,
      ).slice(0, 8),
    [products, rotationSeed, rotationNonce]
  );

  const newArrivals = useMemo(
    () => [...products].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? "")).slice(0, 8),
    [products]
  );

  const bestSellers = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => p.bestseller),
        rotationSeed + rotationNonce + 1,
      ).slice(0, 8),
    [products, rotationSeed, rotationNonce]
  );

  const { items: testimonials } = useTestimonials();

  const categoryLimit = useCategoryLimit();
  const homeCategories = isProductAdmin
    ? categories.filter((c) => !c.parent_id)
    : categories.slice(0, categoryLimit);

  // Desktop hero uses a curated featured product image (see assets/hero-product).
  const trendingChips = ["Wireless earbuds", "Smart watch", "Linen shirt", "Ceramic mug", "Air fryer"];


  return (
    <>
      {/* Sticky announcement bar — homepage only */}
      <AnnouncementBar />

      {/* 2 · Cinematic Hero */}
      <section className="relative pt-5 sm:pt-10 md:pt-14 lg:pt-20 pb-5 sm:pb-9 md:pb-11 lg:pb-20 px-4 sm:px-6 lg:px-10 overflow-hidden" style={{ background: "var(--gradient-hero)" }}>
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
          {/* Desktop-only cinematic ambient depth */}
          <div
            className="hidden lg:block absolute inset-0"
            style={{
              background:
                "radial-gradient(60% 50% at 78% 35%, oklch(0.74 0.19 49 / 0.10), transparent 70%), radial-gradient(50% 50% at 12% 70%, oklch(0.74 0.19 49 / 0.06), transparent 70%)",
            }}
          />
          <div
            className="hidden lg:block absolute inset-0 opacity-[0.025] mix-blend-soft-light"
            style={{
              backgroundImage:
                "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='160' height='160'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='3'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
            }}
          />
        </div>


        <div className="max-w-5xl lg:max-w-[1480px] mx-auto relative z-10 lg:grid lg:grid-cols-[1fr_minmax(0,1.05fr)] lg:gap-20 xl:gap-24 lg:items-start text-center lg:text-left">
          {/* LEFT — headline, search, CTAs, stats */}
          <div className="lg:max-w-[640px]">
            <div
              className="hero-rise inline-flex items-center gap-2 mb-6 px-3 py-1.5 rounded-full glass text-[11px] font-mono uppercase tracking-[0.2em] text-muted-foreground"
            >
              <span className="size-1.5 rounded-full bg-accent animate-glow" />
              Live · 180+ countries · 2.4k products
            </div>

            <h1
              className="hero-rise-h1 text-fluid-hero lg:text-[clamp(3rem,1vw+3rem,4.5rem)] lg:leading-[1.02] lg:tracking-[-0.03em] font-display font-semibold tracking-tight text-balance mb-5 sm:mb-7"
            >
              <span className="sr-only">FoundOurMarket — Premium Global Marketplace. </span>
              <span aria-hidden="true">Whatever you need.</span>
              <br />
              <span className="text-gradient-ember">All in one place.</span>
            </h1>

            <p
              className="hero-rise hero-rise-1 text-fluid-base text-muted-foreground max-w-xl mx-auto lg:mx-0 text-balance mb-7 sm:mb-9 px-2 lg:px-0"
            >
              A premium independent marketplace, sourcing top-quality products from across the world — delivered with cinematic precision.
            </p>

            {/* Search — primary action, premium glass, flagship desktop height */}
            <form
              className="hero-rise hero-rise-2 max-w-2xl mx-auto lg:mx-0 relative group"
              onSubmit={(e) => { e.preventDefault(); nav({ to: "/search", search: { q: query } }); }}
            >
              <div className={`relative glass-strong rounded-full ring-1 transition-all duration-300 lg:shadow-[inset_0_1px_0_oklch(1_0_0/0.06)] ${searchFocused ? "ring-accent/35 lg:shadow-[0_0_0_3px_oklch(0.74_0.19_49/0.08),var(--shadow-float)]" : "ring-white/10 lg:shadow-[var(--shadow-float)]"}`}>
                <Search className={`absolute left-5 sm:left-6 top-1/2 -translate-y-1/2 size-5 transition-colors ${searchFocused ? "text-accent" : "text-muted-foreground"}`} />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  placeholder={rotatingPlaceholder}
                  aria-label="Search products"
                  className="w-full min-h-[56px] lg:min-h-[64px] bg-transparent rounded-full pl-12 sm:pl-14 pr-28 sm:pr-36 py-4 text-base sm:text-lg focus:outline-none placeholder:text-muted-foreground/60"
                />
                <button type="submit" className="absolute right-1.5 sm:right-2 lg:right-2.5 top-1/2 -translate-y-1/2 bg-accent text-accent-foreground font-semibold px-5 sm:px-7 py-3 lg:py-3.5 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all shadow-[var(--shadow-ember)]">
                  Search
                </button>
              </div>
              {/* Trending chips — desktop only */}
              <div className="hidden lg:flex flex-wrap items-center gap-2 mt-4">
                <span className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground/70 mr-1">Trending</span>
                {trendingChips.map((c) => (
                  <Link
                    key={c}
                    to="/search"
                    search={{ q: c }}
                    className="rounded-full glass px-3.5 py-1.5 text-xs text-muted-foreground ring-1 ring-white/10 hover:text-foreground hover:ring-accent/40 transition-all"
                  >
                    {c}
                  </Link>
                ))}
              </div>
            </form>

            {/* Primary hero CTAs */}
            <div
              className="hero-rise hero-rise-3 mt-5 sm:mt-7 lg:mt-9 flex flex-wrap items-center justify-center lg:justify-start gap-3"
            >
              <Link
                to="/categories"
                className="inline-flex items-center justify-center gap-2 h-12 lg:h-14 px-7 lg:px-9 rounded-full bg-accent text-accent-foreground text-xs lg:text-[13px] font-semibold uppercase tracking-widest hover:brightness-110 hover:-translate-y-0.5 active:scale-[0.98] transition-all shadow-[var(--shadow-ember)] lg:shadow-[0_0_40px_-6px_oklch(0.74_0.19_49/0.6),var(--shadow-ember)]"
              >
                Shop Now <ArrowRight className="hidden lg:block size-4" />
              </Link>
              <Link
                to="/categories"
                className="inline-flex items-center justify-center gap-2 h-12 lg:h-14 px-7 lg:px-9 rounded-full glass-strong ring-1 ring-white/15 text-xs lg:text-[13px] font-semibold uppercase tracking-widest hover:ring-accent/40 hover:-translate-y-0.5 hover:text-foreground active:scale-[0.98] transition-all"
              >
                Browse Categories
              </Link>
            </div>

            {/* Trust pillars — honest value props, no fabricated statistics */}
            <div
              className="hero-rise hero-rise-4 mt-6 sm:mt-9 lg:mt-12 grid grid-cols-3 gap-2.5 sm:gap-4 max-w-3xl mx-auto lg:mx-0 lg:max-w-none"
            >
              {[
                { value: "Global", label: "Shipping", hint: "Worldwide delivery" },
                { value: "Secure", label: "Checkout", hint: "256-bit encrypted" },
                { value: "Easy", label: "Returns", hint: "Hassle-free process" },
              ].map((s) => (
                <div
                  key={s.label}
                  className="glass-strong rounded-2xl px-3 sm:px-6 py-4 sm:py-6 lg:py-7 text-left transition-all duration-300 lg:hover:-translate-y-1 lg:hover:ring-1 lg:hover:ring-accent/30 lg:hover:shadow-[0_18px_50px_-18px_oklch(0.74_0.19_49/0.4)]"
                >
                  <div className="text-2xl sm:text-4xl font-display font-semibold tracking-tight text-gradient-ember">{s.value}</div>
                  <div className="text-[10px] sm:text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-1.5">{s.label}</div>
                  <div className="hidden sm:block text-[10px] text-muted-foreground/60 mt-0.5">{s.hint}</div>
                </div>
              ))}
            </div>
          </div>

          {/* RIGHT — cinematic featured showcase (desktop only) */}
          <div aria-hidden className="hidden lg:block relative h-[580px] xl:h-[640px] lg:mt-6">
            {/* ambient cinematic depth */}
            <div className="absolute inset-0 -z-10">
              <div className="orb animate-orb" style={{ width: 600, height: 600, top: "2%", left: "12%", background: "var(--gradient-ember)" }} />
              <div
                className="absolute inset-0"
                style={{ background: "radial-gradient(46% 40% at 58% 44%, oklch(0.74 0.19 49 / 0.16), transparent 72%)" }}
              />
              {/* layered blurred glow bloom behind product */}
              <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[380px] rounded-full blur-3xl opacity-60" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.22), transparent 70%)" }} />
            </div>

            {/* extremely subtle floating particles */}
            <div className="pointer-events-none absolute inset-0 -z-[5]">
              {[
                { top: "12%", left: "22%", d: "-0.5s" },
                { top: "30%", left: "82%", d: "-2.2s" },
                { top: "68%", left: "16%", d: "-3.4s" },
                { top: "80%", left: "74%", d: "-1.4s" },
                { top: "48%", left: "92%", d: "-4.1s" },
              ].map((p, i) => (
                <span key={i} className="absolute size-1 rounded-full bg-accent/40 blur-[1px] animate-float-soft" style={{ top: p.top, left: p.left, animationDelay: p.d }} />
              ))}
            </div>

            {/* ONE large featured hero product card */}
            <div className="absolute left-1/2 top-1/2 z-10 w-[80%] max-w-[440px] -translate-x-1/2 -translate-y-1/2 animate-float-soft">
              <div className="group relative overflow-hidden rounded-[2rem] glass-strong ring-1 ring-white/12 shadow-[var(--shadow-float),0_0_100px_-24px_oklch(0.74_0.19_49/0.6)]">
                {/* soft top sheen */}
                <div className="pointer-events-none absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/40 to-transparent" />
                <div className="relative aspect-[4/5] overflow-hidden">
                  <img
                    src={heroProductImg}
                    alt=""
                    loading="lazy"
                    width={832}
                    height={1024}
                    className="size-full object-cover [transition:transform_1100ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-[1.06]"
                  />
                  <div className="absolute inset-0 bg-gradient-to-t from-background via-background/20 to-transparent" />
                  {/* edge glow ring */}
                  <div className="pointer-events-none absolute inset-0 rounded-[2rem] ring-1 ring-inset ring-accent/15" />
                  {/* featured tag */}
                  <div className="absolute left-4 top-4 inline-flex items-center gap-1.5 rounded-full glass-strong ring-1 ring-accent/30 px-3 py-1.5">
                    <Sparkles className="size-3.5 text-accent" />
                    <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-foreground">Featured</span>
                  </div>
                  {/* product info */}
                  <div className="absolute inset-x-0 bottom-0 p-6">
                    <p className="text-lg font-display font-semibold tracking-tight text-foreground line-clamp-2">
                      Pro Wireless Headphones
                    </p>
                    <div className="mt-2 flex items-center gap-3">
                      <span className="inline-flex items-center gap-1 text-[12px] text-accent">
                        <Star className="size-3.5 fill-accent" /> 4.9
                      </span>
                      <span className="text-[12px] text-muted-foreground">Curated worldwide</span>
                    </div>
                  </div>
                </div>
              </div>
            </div>

            {/* floating premium UI cards — art-directed composition */}
            {/* TOP CENTER — live orders */}
            <div className="absolute z-20 top-1 left-1/2 -translate-x-1/2 inline-flex items-center gap-2 rounded-full glass-strong ring-1 ring-white/12 px-4 py-2 shadow-[var(--shadow-float)] animate-float" style={{ animationDelay: "-3.5s" }}>
              <span className="size-1.5 rounded-full bg-accent animate-glow" />
              <span className="text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground">142 live orders</span>
            </div>

            {/* TOP RIGHT — countries */}
            <div className="absolute z-20 top-12 right-0 animate-float-soft" style={{ animationDelay: "-1s" }}>
              <div className="flex items-center gap-2.5 rounded-2xl glass-strong ring-1 ring-white/12 px-4 py-3 shadow-[var(--shadow-float)]">
                <span className="grid place-items-center size-9 rounded-xl bg-accent/15 ring-1 ring-accent/25 text-accent"><Globe2 className="size-[18px]" /></span>
                <span><span className="block text-sm font-semibold text-foreground leading-none">180+</span><span className="block text-[10px] text-muted-foreground mt-1">Countries</span></span>
              </div>
            </div>

            {/* LEFT — products count */}
            <div className="absolute z-20 top-1/2 -translate-y-1/2 left-0 animate-float" style={{ animationDelay: "-2.5s" }}>
              <div className="flex items-center gap-2.5 rounded-2xl glass-strong ring-1 ring-white/12 px-4 py-3 shadow-[var(--shadow-float)]">
                <span className="grid place-items-center size-9 rounded-xl bg-accent/15 ring-1 ring-accent/25 text-accent"><Package className="size-[18px]" /></span>
                <span><span className="block text-sm font-semibold text-foreground leading-none">2.4k+</span><span className="block text-[10px] text-muted-foreground mt-1">Products</span></span>
              </div>
            </div>

            {/* BOTTOM RIGHT — trending now */}
            <div className="absolute z-20 bottom-10 right-0 animate-float-soft" style={{ animationDelay: "-4.5s" }}>
              <div className="flex items-center gap-2.5 rounded-2xl glass-strong ring-1 ring-accent/30 px-4 py-3 shadow-[0_0_44px_-12px_oklch(0.74_0.19_49/0.55)]">
                <span className="grid place-items-center size-9 rounded-xl bg-accent/15 ring-1 ring-accent/25 text-accent"><TrendingUp className="size-[18px]" /></span>
                <span><span className="block text-[12px] font-semibold text-foreground leading-none">Trending Now</span><span className="block text-[10px] text-muted-foreground mt-1">Updated daily</span></span>
              </div>
            </div>
          </div>
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
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 gap-3 sm:gap-4">
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
                    className={`group relative flex h-full flex-col items-center gap-2.5 sm:gap-3 p-2.5 sm:p-4 text-center rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_8px_32px_-8px_oklch(0.74_0.19_49/0.45)] active:scale-[0.97] ${isProductAdmin && !cat.homepage_visible ? "opacity-50" : ""}`}
                  >
                    {/* Image above name — 1:1, premium rounded capsule.
                        Falls back to an icon inside a soft glass capsule. */}
                    <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-border bg-muted/60">
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
                      <h3 className="text-[14px] sm:text-[16px] font-semibold tracking-tight leading-snug line-clamp-1 text-foreground group-hover:text-accent transition-colors">{cat.name}</h3>
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
        <Suspense fallback={null}>
          <CategoryAdminSheet onClose={() => setEditCats(false)} onChanged={() => {}} productCounts={categoryCounts} />
        </Suspense>
      )}

      <CinematicDivider />

      <FlashDeals />



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

      {/* 7 · Social Proof — verified customer reviews */}
      <section className="cv-auto px-4 sm:px-6 py-4 sm:py-7 max-w-7xl mx-auto">
        <Reveal className="text-center mb-4 sm:mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 inline-flex items-center gap-2">
            <span className="size-1.5 rounded-full bg-accent animate-glow" /> Customer Stories
          </p>
          <h2 className="text-fluid-2xl font-display tracking-tight">What our customers say</h2>
        </Reveal>


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

    </>
  );
}
