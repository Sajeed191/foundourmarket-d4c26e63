import { Link, useNavigate } from "@tanstack/react-router";
import { Scale, Check, ArrowRight, Plus, Star, Package, X } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";

/**
 * PDP — Product Comparison v3.0 (Amazon/Flipkart style, inline section).
 *
 * No sticky bars, no floating CTAs. The comparison lives entirely inside
 * the PDP as another content section:
 *   1) Section header
 *   2) Current product (pinned, always selected)
 *   3) Horizontal carousel of similar products (Select ↔ ✓ Selected)
 *   4) Inline comparison preview table (updates live)
 *   5) One inline "Compare Products →" button at the bottom
 *
 * Reuses the existing compare store (useCompare) and /compare page unchanged.
 */

type ChipKind = "bestseller" | "hot" | "flash" | "trending" | "new" | "featured";

function pickChip(p: Product): { kind: ChipKind; label: string; cls: string } | null {
  if (p.bestseller) return { kind: "bestseller", label: "Best Seller", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  if (p.flashDeal) return { kind: "flash", label: "Flash Deal", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  if (p.hotDeal) return { kind: "hot", label: "Hot Deal", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" };
  if (p.trending) return { kind: "trending", label: "Trending", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
  if (p.newArrival) return { kind: "new", label: "New Arrival", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  if (p.featured) return { kind: "featured", label: "Featured", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" };
  return null;
}

const PREVIEW_ATTRIBUTES = [
  "Price",
  "Rating",
  "Reviews",
  "Specifications",
  "Warranty",
  "Shipping",
] as const;

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max, remove, clear } = useCompare();
  const navigate = useNavigate();

  const currentSlug = currentProduct.slug;

  // Similarity ranked: brand → productType → category overlap.
  const suggestions = useMemo<Product[]>(() => {
    if (!products.length) return [];
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));

    return products
      .filter(
        (p) =>
          p.slug !== cur.slug &&
          p.status !== "archived" &&
          p.inStock !== false,
      )
      .map((p) => {
        let score = 0;
        if (cur.brand && p.brand && p.brand === cur.brand) score += 3;
        if (cur.productType && p.productType && p.productType === cur.productType) score += 2;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        if (pCats.some((c) => curCats.has(c))) score += 1;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
  }, [products, currentProduct]);

  // Always keep current PDP product in the compare store.
  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  // Auto-prune unavailable selections (except the current product).
  useEffect(() => {
    if (!products.length || slugs.length === 0) return;
    slugs.forEach((s) => {
      if (s === currentSlug) return;
      const p = products.find((x) => x.slug === s);
      if (!p || p.status === "archived" || p.inStock === false) remove(s);
    });
  }, [products, slugs, remove, currentSlug]);

  const selectedCount = slugs.length;
  const otherSelected = selectedCount - (has(currentSlug) ? 1 : 0);
  const canCompare = selectedCount >= 2;

  const selectedProducts = useMemo(
    () =>
      slugs
        .map((s) =>
          s === currentSlug ? currentProduct : products.find((p) => p.slug === s),
        )
        .filter((p): p is Product => Boolean(p)),
    [slugs, products, currentSlug, currentProduct],
  );

  const handleToggle = (slug: string) => {
    if (slug === currentSlug) return;
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  // Empty state — no similar products yet.
  if (suggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
        data-pdp-compare
      >
        <SectionHeader />
        <div className="mt-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-6 py-10 sm:py-14 flex flex-col items-center text-center">
          <div className="size-12 rounded-full bg-white/[0.04] border border-white/[0.06] grid place-items-center mb-4">
            <Package className="size-5 text-white/50" aria-hidden />
          </div>
          <p className="text-[14px] text-white/85 max-w-sm leading-relaxed">
            No similar products are available for comparison yet.
          </p>
          <p className="mt-1.5 text-[12px] text-white/50 max-w-sm leading-relaxed">
            We'll automatically suggest comparable products as the catalog grows.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
      data-pdp-compare
    >
      <SectionHeader />

      {/* Carousel */}
      <div className="mt-6 -mx-4 sm:mx-0 overflow-hidden">
        <ul
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 sm:px-0 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollPaddingLeft: "1rem",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Pinned current-product card */}
          <li className="snap-start shrink-0 w-[62%] min-[420px]:w-[46%] sm:w-[240px]">
            <CardShell active pinned>
              <CardMedia product={currentProduct} />
              <div className="p-3">
                <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest text-amber-300">
                  Current Product
                </div>
                <p className="mt-1.5 block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.5em]">
                  {currentProduct.name}
                </p>
                <StatsRow product={currentProduct} price={priceOf(currentProduct)} />
                <div className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-200 border border-amber-500/40 cursor-default">
                  <Check className="size-3.5" aria-hidden /> Locked In
                </div>
              </div>
            </CardShell>
          </li>

          {suggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            const chip = pickChip(p);
            return (
              <li
                key={p.slug}
                className="snap-start shrink-0 w-[62%] min-[420px]:w-[46%] sm:w-[240px]"
              >
                <CardShell active={active}>
                  <CardMedia product={p} chip={chip} />
                  <div className="p-3">
                    <Link
                      to="/products/$slug"
                      params={{ slug: p.slug }}
                      className="block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.5em] hover:text-accent transition-colors"
                    >
                      {p.name}
                    </Link>
                    <StatsRow product={p} price={priceOf(p)} />
                    <button
                      onClick={() => handleToggle(p.slug)}
                      aria-pressed={active}
                      disabled={disabled}
                      className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? "bg-accent text-accent-foreground"
                          : "bg-white/[0.05] text-white/85 hover:bg-white/[0.1] border border-white/[0.08]"
                      }`}
                    >
                      {active ? (
                        <>
                          <Check className="size-3.5" aria-hidden /> Selected
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" aria-hidden /> Select
                        </>
                      )}
                    </button>
                  </div>
                </CardShell>
              </li>
            );
          })}
          <div aria-hidden className="shrink-0 w-1" />
        </ul>
      </div>

      {/* Inline preview + inline CTA */}
      {canCompare ? (
        <div className="mt-6 rounded-[20px] border border-white/[0.08] bg-white/[0.02] overflow-hidden animate-fade-in">
          {/* Selected chips */}
          <div className="px-4 sm:px-5 pt-4 pb-3 border-b border-white/[0.06]">
            <div className="flex items-center justify-between mb-2.5">
              <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">
                Selected Products · {selectedCount} of {max}
              </p>
              {otherSelected > 0 && (
                <button
                  onClick={() => {
                    clear();
                    toggle(currentSlug);
                  }}
                  className="text-[10px] font-mono uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
                >
                  Reset
                </button>
              )}
            </div>
            <ul className="flex flex-wrap gap-1.5">
              {selectedProducts.map((p) => {
                const isCurrent = p.slug === currentSlug;
                return (
                  <li
                    key={p.slug}
                    className={`inline-flex items-center gap-1.5 rounded-full pl-2 pr-1 py-1 text-[11px] border transition-all duration-200 ${
                      isCurrent
                        ? "bg-amber-500/15 border-amber-500/40 text-amber-200"
                        : "bg-white/[0.04] border-white/[0.08] text-white/85"
                    }`}
                  >
                    <Check className="size-3" aria-hidden />
                    <span className="max-w-[140px] sm:max-w-[200px] truncate">{p.name}</span>
                    {!isCurrent && (
                      <button
                        onClick={() => toggle(p.slug)}
                        aria-label={`Remove ${p.name}`}
                        className="size-4 grid place-items-center rounded-full bg-white/[0.06] hover:bg-white/[0.14] text-white/70 hover:text-white transition-colors"
                      >
                        <X className="size-2.5" />
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Preview attributes */}
          <div className="px-4 sm:px-5 py-4">
            <p className="text-[10px] font-mono uppercase tracking-widest text-white/50 mb-2.5">
              You'll compare
            </p>
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-x-4 gap-y-2">
              {PREVIEW_ATTRIBUTES.map((c) => (
                <li key={c} className="flex items-center gap-1.5 text-[12px] text-white/80">
                  <Check className="size-3.5 text-emerald-400 shrink-0" aria-hidden />
                  {c}
                </li>
              ))}
            </ul>
          </div>

          {/* Inline CTA */}
          <div className="px-4 sm:px-5 pb-4 pt-1">
            <button
              onClick={() => navigate({ to: "/compare" })}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-3 text-[12px] font-bold uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all duration-200"
            >
              Compare {selectedCount} Products
              <ArrowRight className="size-4" aria-hidden />
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-6 rounded-[20px] border border-dashed border-white/[0.08] bg-white/[0.015] px-5 py-6 text-center animate-fade-in">
          <p className="text-[13px] text-white/70">
            Select one or more similar products to compare.
          </p>
          <p className="mt-1 text-[11.5px] text-white/45">
            Your comparison preview will appear here.
          </p>
        </div>
      )}
    </section>
  );
}

function SectionHeader() {
  return (
    <div className="flex items-start gap-3.5">
      <span aria-hidden className="mt-1.5 h-6 w-[3px] rounded-full bg-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <h2 className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-foreground leading-tight inline-flex items-center gap-2">
          <Scale className="size-[18px] text-accent" aria-hidden />
          Product Comparison
        </h2>
        <p className="mt-1 text-[13px] text-muted-foreground/85 leading-relaxed">
          Compare this product with similar alternatives.
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground/60 leading-relaxed">
          Ranked by brand, product type, category, and similar specifications.
        </p>
      </div>
    </div>
  );
}

function CardShell({
  active,
  pinned,
  children,
}: {
  active?: boolean;
  pinned?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[20px] border overflow-hidden bg-white/[0.02] transition-all duration-200 ease-out h-full ${
        pinned
          ? "border-amber-500/40 ring-1 ring-amber-500/25"
          : active
            ? "border-accent/70 ring-1 ring-accent/40"
            : "border-white/[0.08] hover:border-white/20 sm:hover:-translate-y-0.5 active:scale-[0.99]"
      }`}
    >
      {children}
    </div>
  );
}

function CardMedia({
  product,
  chip,
}: {
  product: Product;
  chip?: { label: string; cls: string } | null;
}) {
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      className="relative block aspect-square bg-black/30 overflow-hidden"
    >
      {product.image && (
        <img
          src={resolveImage(product.image)}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      )}
      {chip && (
        <span
          className={`absolute top-2 left-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest backdrop-blur ${chip.cls}`}
        >
          {chip.label}
        </span>
      )}
    </Link>
  );
}

function StatsRow({ product, price }: { product: Product; price: number }) {
  return (
    <div className="mt-2 flex items-center gap-2.5 text-[11px] text-white/70 tabular-nums">
      <span className="inline-flex items-center gap-0.5">
        <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
        <span className="font-medium text-white/90">{Number(product.rating || 0).toFixed(1)}</span>
      </span>
      <span className="text-white/50">({Number(product.reviews || 0)})</span>
      <span className="ml-auto">
        <Price value={price} variant="current" className="text-[13px]" />
      </span>
    </div>
  );
}
