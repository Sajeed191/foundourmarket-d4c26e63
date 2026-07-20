import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Suspense, lazy, useEffect, useMemo, useState } from "react";

import {
  Search, ArrowRight, Star, Sparkles, Award, Package, Globe2, Flame,
  BadgeCheck, Pencil, Truck, ShieldCheck, Zap, Gift, LayoutGrid,
  Sofa, UtensilsCrossed, Gamepad2, Cpu, ToyBrick, PawPrint, Car, Shirt, Dumbbell,
  Watch, Headphones, Gem, Baby, Wrench, BookOpen,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useCategories, useAdminCategories, toggleCategoryVisible } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { useProductAdminEditing } from "@/lib/admin-overlay";
import { useOrderRotationSeed, seededShuffle } from "@/lib/rotation";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
const CategoryAdminSheet = lazy(() =>
  import("@/components/admin/CategoryAdminSheet").then((m) => ({ default: m.CategoryAdminSheet })),
);
import { useHomepageSections, saveHomepageSection, toggleHomepageSection } from "@/lib/use-homepage-sections";
import { hasAssignedCollectionBadge, useBadgeCatalog } from "@/lib/use-product-badges";
import { InlineActiveToggle } from "@/components/admin/InlineActiveToggle";
import { toast } from "sonner";
import { Loader2, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

import heroProductImg from "@/assets/hero-product.jpg";
import { ProductCard } from "@/components/site/ProductCard";
// TEMPORARY EXPERIMENT (Trending section only): reuse Browse's grid so cards
// mount incrementally in batches of 16 via IncrementalGrid instead of all at
// once. Remove this import when reverting the experiment.
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import { AdaptiveProductMedia } from "@/components/site/AdaptiveProductMedia";
import { useFlag } from "@/lib/use-debug-flag";
import { SearchButton } from "@/components/site/SearchButton";
import { SearchOverlay } from "@/components/site/SearchOverlay";
import { LazyMount } from "@/components/site/LazyMount";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";

// Below-the-fold: lazy so the code stays out of the initial homepage chunk.
const FlashDeals = lazy(() =>
  import("@/components/site/FlashDeals").then((m) => ({ default: m.FlashDeals })),
);
const TestimonialsCarousel = lazy(() =>
  import("@/components/site/TestimonialsCarousel").then((m) => ({ default: m.TestimonialsCarousel })),
);

import { TrustBadgesStrip } from "@/components/site/TrustBadgesStrip";
import { useTestimonials } from "@/lib/use-testimonials";
import { SectionTracker } from "@/components/site/SectionTracker";
import { useRenderDiagnostics } from "@/lib/startup-diagnostics";

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

function useScrolledOnce(active: boolean) {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    if (!active || scrolled) return;
    // Perf v3 — shared scroll bus (one window listener for the whole app).
    if (typeof window !== "undefined" && window.scrollY > 240) {
      setScrolled(true);
      return;
    }
    let off: (() => void) | undefined;
    import("@/lib/scroll-bus").then(({ onScroll }) => {
      off = onScroll((y) => {
        if (y > 240) {
          setScrolled(true);
          off?.();
        }
      });
    });
    return () => off?.();
  }, [active, scrolled]);
  return !active || scrolled;
}

import { Reveal } from "@/components/site/Reveal";


export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FoundOurMarket™ | Global Marketplace - Whatever You Need, All In One Place" },
      {
        name: "description",
        content:
          "FoundOurMarket™ is a global online marketplace offering electronics, home essentials, fitness products, pet supplies, automotive accessories, and more with worldwide delivery.",
      },
      { property: "og:title", content: "FoundOurMarket™ | Global Marketplace" },
      {
        property: "og:description",
        content:
          "FoundOurMarket™ is a global online marketplace offering electronics, home essentials, fitness products, pet supplies, automotive accessories, and more with worldwide delivery.",
      },
      { property: "og:site_name", content: "FoundOurMarket" },
      { property: "og:url", content: "https://foundourmarket.com/" },
      { name: "twitter:title", content: "FoundOurMarket™ | Global Marketplace" },
      {
        name: "twitter:description",
        content:
          "FoundOurMarket™ is a global online marketplace offering electronics, home essentials, fitness products, pet supplies, automotive accessories, and more with worldwide delivery.",
      },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/" }],
  }),
  component: Home,
});

import { PremiumSectionHeading, PremiumSectionDivider } from "@/components/site/PremiumSectionHeading";

/* Cinematic ambient divider — thin transparent→orange→transparent gradient */
function CinematicDivider() {
  return <PremiumSectionDivider />;
}

/* Section identity — editorial label, subtitle, ghost word, badge, alignment. */
const SECTION_EYEBROW: Record<string, string> = {
  categories: "Featured Collection",
  flash_deals: "Limited Offers",
  trending: "Popular This Week",
  new_arrivals: "Just Released",
  best_sellers: "Customer Favorites",
};

const SECTION_SUBTITLE: Record<string, string> = {
  categories: "Explore curated collections chosen for every lifestyle.",
  flash_deals: "Today's best prices from trusted sellers.",
  trending: "The pieces our community is loving right now.",
  new_arrivals: "Fresh finds, added to the collection this week.",
  best_sellers: "The most-loved pieces across the marketplace.",
};


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

/* Elegant empty-state messaging per home section — sections stay visible even
   when no products currently carry the required badge. */
const SECTION_EMPTY_COPY: Record<string, { title: string; message: string }> = {
  trending: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
  new_arrivals: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
  best_sellers: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
  featured: {
    title: "Coming Soon",
    message: "Products for this collection will appear here soon.",
  },
};

/* Premium "Coming Soon" placeholder — matches the marketplace aesthetic:
   soft neutral surface, subtle icon, large heading, minimal message. */
function SectionComingSoon({
  icon: Icon,
  title,
  message,
}: {
  icon?: LucideIcon;
  title: string;
  message: string;
}) {
  return (
    <div
      className="relative overflow-hidden rounded-3xl px-6 py-12 sm:py-14 text-center motion-safe:animate-fade-in"
      style={{
        background: "linear-gradient(160deg, oklch(0.16 0.006 60) 0%, oklch(0.18 0.008 60) 100%)",
        border: "1px solid rgba(255,255,255,0.06)",
      }}
    >
      <div
        aria-hidden
        className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 h-40 w-2/3 rounded-full blur-3xl opacity-20"
        style={{ background: "var(--gradient-ember)" }}
      />
      <div className="relative flex flex-col items-center gap-4">
        {Icon && (
          <div className="grid size-12 place-items-center rounded-2xl bg-white/[0.04] text-accent/90 ring-1 ring-white/10">
            <Icon className="size-5" strokeWidth={1.75} />
          </div>
        )}
        <h3 className="text-2xl sm:text-[26px] font-display font-semibold tracking-tight text-foreground">
          {title}
        </h3>
        <p className="max-w-sm text-[13.5px] leading-relaxed text-muted-foreground">
          {message}
        </p>
      </div>
    </div>
  );
}

/* Single product section (lazy-mounted). Shows exactly 4 products in a 2×2
   mobile grid (no carousel) with a full-width premium "View All" button.
   When no products carry the section's badge, an elegant "Coming Soon"
   placeholder renders instead of hiding the section. */
function ProductSection({
  sectionKey, eyebrow, title, icon, products, isAdmin, active, viewAllTo, prominent = false, minHeight = 260, limit = 4,
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
  limit?: number;
}) {
  // Only the admin-controlled active toggle hides the section. An empty product
  // list now shows an elegant "Coming Soon" message rather than disappearing.
  if (!active && !isAdmin) return null;
  const preview = products.slice(0, limit);
  const isEmpty = preview.length === 0;
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
  const emptyCopy = SECTION_EMPTY_COPY[sectionKey] ?? {
    title: "Coming Soon",
    message: "More products are on the way.",
  };
  return (
    <SectionTracker
      sectionKey={sectionKey}
      className={`px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24 block`}
    >
      <SectionHeader
        eyebrow={eyebrow}
        title={title}
        icon={icon}
        href={isEmpty ? undefined : viewAllTo}
        sectionKey={sectionKey}
        editable={isAdmin}
        active={active}
        prominent={prominent}
      />
      {isEmpty ? (
        <SectionComingSoon icon={icon} title={emptyCopy.title} message={emptyCopy.message} />
      ) : (
        <LazyMount minHeight={minHeight}>
          {sectionKey === "trending" ? (
            // TEMPORARY EXPERIMENT — Trending only. Same ProductCard, same DOM
            // wrapper (data-product-grid / data-product-card-frame), same CSS
            // classes, same data/sorting/limit. The ONLY change is *when* cards
            // mount: VirtualizedProductGrid → IncrementalGrid stages the initial
            // mount in batches of 16 (virtualizeThreshold={0} forces the batched
            // path), exactly as Browse (/search) does. No virtualization,
            // no unmounting, no pagination.
            <VirtualizedProductGrid
              items={preview}
              virtualizeThreshold={0}
              cols={{ base: 2, lg: 4 }}
              className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4"
              getKey={(p) => p.id ?? p.slug}
              getImageSrc={(p) => p.image}
              renderItem={(p) => (
                <ProductCard product={p} compact forceBadge={sectionBadge} />
              )}
            />
          ) : (
            <div data-product-grid className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
              {preview.map((p, i) => (
                <Reveal key={p.id ?? p.slug} delay={i} className="h-full" productCardFrame><ProductCard product={p} compact forceBadge={sectionBadge} /></Reveal>
              ))}
            </div>
          )}
          
        </LazyMount>

      )}
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

  const subtitle = sectionKey ? SECTION_SUBTITLE[sectionKey] : undefined;
  const eyebrowLabel = sectionKey ? SECTION_EYEBROW[sectionKey] : eyebrow;
  void eyebrow;

  return (
    <>
      <PremiumSectionHeading
        title={title}
        subtitle={subtitle}
        eyebrow={eyebrowLabel}
        href={href}
        hrefLabel={hrefLabel}
        right={
          editable && sectionKey ? (
            <div className="flex items-center gap-1.5">
              <InlineActiveToggle
                active={active}
                label="Section"
                size="sm"
                onToggle={(next) => toggleHomepageSection(sectionKey, next)}
              />
              <button
                onClick={open}
                aria-label="Edit section"
                className="grid size-8 shrink-0 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-white/70 transition-colors hover:border-accent/40 hover:text-accent"
              >
                <Pencil className="size-3.5" />
              </button>
            </div>
          ) : undefined
        }
      />
      {/* Silence unused-var warnings; prominent kept for API back-compat. */}
      {prominent || Icon ? null : null}

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
    </>
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
    setLimit(get());
    let off: (() => void) | undefined;
    import("@/lib/scroll-bus").then(({ onResize }) => {
      off = onResize(() => setLimit(get()));
    });
    return () => off?.();
  }, []);
  return limit;
}

function Home() {
  useRenderDiagnostics("Home");
  // Debug harness flags — isolate which homepage subsystem corrupts rendering.
  const ffCategoryGrid = useFlag("categoryGrid");
  const ffFlashDeals = useFlag("flashDeals");
  const ffProductGrid = useFlag("productGrid");
  const ffCarousels = useFlag("carousels");
  // Single responsive homepage for every device — no capability detection,
  // no homepage swapping. These constants keep the (now always-on) premium
  // path live; the dead branches that referenced GPU safe mode tree-shake away.
  const { products, loading: productsLoading } = useProducts();
  const { map: badgeAssignments, loading: badgesLoading } = useBadgeCatalog();
  const { categories: publicCategories } = useCategories();
  const { sections } = useHomepageSections();

  const { canEdit: isProductAdmin } = useProductAdminEditing();
  const { categories: adminCategories } = useAdminCategories(isProductAdmin);
  // Admins see every category (incl. hidden) so they can toggle visibility inline.
  const categories = isProductAdmin ? adminCategories : publicCategories;
  const [editCats, setEditCats] = useState(false);

  const nav = useNavigate();
  const { formatProduct } = useRegion();
  const [query, setQuery] = useState("");
  const [searchFocused, setSearchFocused] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searching, setSearching] = useState(false);
  const rotatingPlaceholder = useRotatingPlaceholder(!searchFocused && !query);

  // Debounced query drives the live product results (150–250ms per spec).
  const [debouncedQuery, setDebouncedQuery] = useState("");
  useEffect(() => {
    const t = setTimeout(() => setDebouncedQuery(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const goSearch = (q: string) => {
    setSearching(true);
    nav({ to: "/search", search: { q } });
  };

  const goProduct = (slug: string) => {
    setSearching(true);
    nav({ to: "/products/$slug", params: { slug } });
  };


  // Real, backend-driven product matches only — ranked by relevance.
  const productMatches = useMemo(() => {
    const q = debouncedQuery.toLowerCase();
    if (!q) return [] as typeof products;
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = products
      .filter((p) => !p.hideFromSearch && p.inStock !== false)
      .map((p) => {
        const name = p.name.toLowerCase();
        const hay = `${name} ${p.brand ?? ""} ${p.category} ${p.tagline ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (!hay.includes(t)) return { p, score: -1 };
          if (name.startsWith(t)) score += 4;
          else if (name.includes(t)) score += 3;
          else score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
    return scored;
  }, [debouncedQuery, products]);

  // Loading = user typed but the debounced query hasn't caught up yet.
  const searchPending = query.trim() !== "" && query.trim() !== debouncedQuery;



  const categoryCounts = useMemo(
    () => products.reduce<Record<string, number>>((acc, p) => {
      acc[p.category] = (acc[p.category] ?? 0) + 1;
      return acc;
    }, {}),
    [products]
  );

  const rotationSeed = useOrderRotationSeed();
  const rotationNonce = useRotationNonce();

  const curatedProductsLoading = productsLoading || badgesLoading;

  const trending = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => hasAssignedCollectionBadge(badgeAssignments.get(p.slug), ["trending"])),
        rotationSeed + rotationNonce,
      ).slice(0, 8),
    [products, badgeAssignments, rotationSeed, rotationNonce]
  );

  const newArrivals = useMemo(
    () =>
      products
        .filter((p) => hasAssignedCollectionBadge(badgeAssignments.get(p.slug), ["new"] ))
        .sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""))
        .slice(0, 8),
    [products, badgeAssignments]
  );

  const bestSellers = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => hasAssignedCollectionBadge(badgeAssignments.get(p.slug), ["bestseller"])),
        rotationSeed + rotationNonce + 1,
      ).slice(0, 8),
    [products, badgeAssignments, rotationSeed, rotationNonce]
  );

  const featured = useMemo(
    () =>
      seededShuffle(
        products.filter((p) => hasAssignedCollectionBadge(badgeAssignments.get(p.slug), ["featured"])),
        rotationSeed + rotationNonce + 2,
      ).slice(0, 8),
    [products, badgeAssignments, rotationSeed, rotationNonce]
  );


  const { items: testimonials } = useTestimonials();

  const categoryLimit = useCategoryLimit();
  const homeCategories = isProductAdmin
    ? categories.filter((c) => !c.parent_id)
    : categories.slice(0, categoryLimit);

  // Desktop hero uses a curated featured product image (see assets/hero-product).
  




  return (
    <>
      <SearchOverlay open={searchOpen} onClose={() => setSearchOpen(false)} query={query} onQueryChange={setQuery} />
      {/* Hero starts immediately below the main navigation (announcement bar removed). */}


      {/* 2 · Premium rotating product showcase hero */}
      <section
        className="relative z-30 px-3 sm:px-6 lg:px-10 pb-3 sm:pb-5"
        style={{
          background: "var(--gradient-hero)",
          // Pull the hero up so its own background fills the area behind the
          // floating top nav — no separate reserved band renders behind it.
          marginTop: "calc(-1 * var(--app-header-h, 4.75rem))",
          paddingTop: "calc(var(--app-header-h, 4.75rem) + 1rem)",
        }}
      >
        {/* full-bleed ambient layer — seamless navbar blend + soft orange glow,
            stretches edge-to-edge so there are never black side gaps */}
        <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 overflow-hidden">

          {/* (Top softener removed — the hero now owns the full area behind the
              nav pill, so there is no seam or band to blend.) */}
          {/* warm ambient orange lighting matching the accent */}
          <div className="absolute left-1/2 -top-[6%] -translate-x-1/2 h-[420px] w-[140%] opacity-70" style={{ background: "radial-gradient(ellipse at 50% 0%, oklch(0.74 0.19 49 / 0.16), transparent 60%)" }} />
        </div>
        <div className="relative z-10 mx-auto max-w-3xl px-1 pt-1 sm:pt-4 pb-2 text-center">
          <h1 className="font-display font-semibold tracking-[-0.02em] leading-[1.02] text-[clamp(2.6rem,11vw,4.5rem)]">
            <span className="block text-foreground">Whatever you need.</span>
            <span className="block bg-gradient-to-r from-foreground via-accent to-accent bg-clip-text text-transparent">
              All in one place.
            </span>
          </h1>
          <p className="mx-auto mt-5 max-w-xl text-[15px] sm:text-lg leading-relaxed text-muted-foreground">
            A premium independent marketplace, sourcing top-quality products from
            across the world — delivered with cinematic precision.
          </p>

          {/* ── search trigger — opens the full search destination ── */}
          <div className="relative z-10 mx-auto mt-8 max-w-2xl">
            <button
              type="button"
              onClick={() => setSearchOpen(true)}
              aria-label="Open search"
              className="group relative w-full rounded-full border border-white/10 shadow-[0_16px_40px_-20px_oklch(0_0_0/0.7)] transition-[border-color,box-shadow,transform] duration-300 hover:border-accent/40 active:scale-[0.995]"
              style={{ background: "oklch(0.19 0.008 60)" }}
            >
              <span className="absolute left-2 sm:left-2.5 top-1/2 -translate-y-1/2 grid size-10 sm:size-11 place-items-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors duration-300 group-hover:bg-accent/15 group-hover:text-accent">
                <Search className="size-[19px] sm:size-[21px]" />
              </span>
              <span className="flex h-14 sm:h-16 w-full items-center pl-14 sm:pl-16 pr-[120px] sm:pr-[140px] text-left text-base sm:text-[17px] font-medium tracking-[-0.01em] text-muted-foreground/65">
                {query.trim() || rotatingPlaceholder}
              </span>
              <span className="pointer-events-none absolute right-1.5 sm:right-2 top-1/2 -translate-y-1/2 inline-flex h-11 sm:h-12 items-center gap-1.5 rounded-full bg-accent px-5 sm:px-6 text-sm font-semibold uppercase tracking-[0.06em] text-accent-foreground shadow-[0_8px_24px_-8px_oklch(0.74_0.19_49/0.7)]">
                Search
              </span>
            </button>
          </div>



          {/* Primary actions */}
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <Link
              to="/search"
              search={{ q: "" }}
              className="inline-flex h-12 items-center justify-center rounded-full bg-accent px-8 text-sm font-semibold uppercase tracking-[0.08em] text-accent-foreground shadow-[0_10px_30px_-10px_oklch(0.74_0.19_49/0.7)] transition-transform duration-200 hover:scale-[1.03] active:scale-95"
            >
              Shop Now
            </Link>
            <a
              href="#categories"
              className="inline-flex h-12 items-center justify-center rounded-full glass-strong px-8 text-sm font-semibold uppercase tracking-[0.08em] text-foreground ring-1 ring-white/12 transition-colors duration-200 hover:ring-accent/40"
            >
              Browse Categories
            </a>
          </div>
        </div>






      </section>


      {/* Trust strip — compact, between hero and categories */}
      <TrustBadgesStrip />

      {/* 3 · Main Categories — premium 2-column marketplace grid */}
      <section id="categories" className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto scroll-mt-24">
        <div className="relative">
          <SectionHeader eyebrow="Browse" title="Main Categories" icon={LayoutGrid} href="/categories" sectionKey="categories" />
          {isProductAdmin && (
            <button
              onClick={() => setEditCats(true)}
              className="absolute right-0 top-0 inline-flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-md hover:bg-accent/15"
            >
              <Pencil className="size-3" /> Edit
            </button>
          )}
        </div>
        <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-4 items-start gap-3 sm:gap-4">
          {ffCategoryGrid && homeCategories.map((cat, i) => {
            const Icon = iconForCategory(cat.slug, cat.name);
            const hasImage = !!(cat.image || cat.mobile_image);
            return (
              <Reveal key={cat.slug} delay={i}>
                <div className="relative">
                  <Link
                    data-product-card-frame
                    to="/category/$slug"
                    params={{ slug: cat.slug }}
                    onClick={() => { void supabase.rpc("track_category_event", { _id: cat.id, _event: "click" }); }}
                    className={`group relative flex flex-col items-center gap-2.5 sm:gap-3 p-2.5 sm:p-4 text-center rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_8px_32px_-8px_oklch(0.74_0.19_49/0.45)] active:scale-[0.97] ${isProductAdmin && !cat.homepage_visible ? "opacity-50" : ""}`}
                  >

                    {/* Image above name — 1:1, premium rounded capsule.
                        Falls back to an icon inside a soft glass capsule. */}
                    <div className="relative w-full aspect-square overflow-hidden rounded-2xl border border-border bg-muted/60">
                      {hasImage ? (
                        <img
                          src={cat.mobile_image || cat.image || ""}
                          alt={cat.name}
                          loading="lazy"
                          decoding="async"
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
                    <div className="w-full pb-0.5">

                      <h3 className="text-[14px] sm:text-[16px] font-semibold tracking-tight leading-snug line-clamp-1 text-foreground group-hover:text-accent transition-colors">{cat.name}</h3>
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
            <Reveal delay={homeCategories.length}>
              <div className="relative">
                <Link
                  data-product-card-frame
                  to="/categories"
                  className="group relative flex h-full flex-col items-center gap-2.5 sm:gap-3 p-2.5 sm:p-4 text-center rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-all duration-300 hover:-translate-y-1 hover:border-accent/40 hover:shadow-[0_8px_32px_-8px_oklch(0.74_0.19_49/0.45)] active:scale-[0.97]"
                >

                  <div className="relative w-full aspect-[1/0.86] sm:aspect-[1/0.92] grid place-items-center overflow-hidden rounded-2xl border border-border bg-muted/60">
                    <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_50%_45%,oklch(0.74_0.19_49/0.18),transparent_65%)]" />
                    <span className="relative grid size-14 sm:size-16 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_28px_-6px_oklch(0.74_0.19_49/0.6)] transition-colors group-hover:bg-accent/20">
                      <ArrowRight className="size-6 sm:size-7 transition-transform duration-300 group-hover:translate-x-1" />
                    </span>
                  </div>

                  <div className="w-full pb-0.5">
                    <h3 className="text-[14px] sm:text-[16px] font-semibold tracking-tight leading-snug line-clamp-1 text-accent group-hover:text-accent transition-colors">Shop All Departments</h3>
                    <span className="block text-[10px] sm:text-[11px] text-muted-foreground font-medium tracking-wide mt-1">Browse everything</span>
                  </div>



                </Link>

              </div>
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

        <LazyMount minHeight={360}>
          {ffFlashDeals && (
            <Suspense fallback={null}><FlashDeals /></Suspense>
          )}
        </LazyMount>




      {/* 4-6 · Trending / New Arrivals / Best Sellers — separate lazy rails */}
      {ffProductGrid && (curatedProductsLoading ? (
        <section className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
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
            limit={4}
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
      ))}

      <CinematicDivider />

      {/* 7 · Social Proof — verified customer reviews */}
      <section className="px-4 sm:px-6 py-6 sm:py-8 max-w-7xl mx-auto">
        <Reveal className="text-center mb-4 sm:mb-6">
          <h2 className="text-fluid-2xl font-display tracking-tight">What our customers say</h2>
        </Reveal>


        {testimonials.length > 0 && (
          <LazyMount minHeight={240}>
            <>
              {/* Mobile: compact swipeable carousel with dots + autorotate */}
              {ffCarousels && (
                <Suspense fallback={null}><TestimonialsCarousel items={testimonials} /></Suspense>
              )}

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
