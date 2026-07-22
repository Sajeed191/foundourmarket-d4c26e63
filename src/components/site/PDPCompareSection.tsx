import { Link, useNavigate } from "@tanstack/react-router";
import { Check, Star, ArrowRight, SearchX, Sparkles } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { toast } from "sonner";


import { useProducts } from "@/lib/use-products";
import { resolveImage, discountPercent, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useWishlist } from "@/lib/wishlist";
import { useCart } from "@/lib/cart";
import { getShoppingContext } from "@/lib/ai-shopping/shopping-context";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";

/**
 * PDP — Compare Alternatives v5.3 (Intelligent Shopping Insights).
 *
 * UI unchanged from v5.2. Adds two intelligence layers on top of the
 * existing similarity algorithm — never overriding it:
 *
 * 1. Per-card "insight" chip — a single, data-backed reason to consider an
 *    alternative (Price > Rating > Reviews > Discount > Stock > Delivery).
 *    Only shown when the underlying delta is real and meaningful.
 * 2. Soft personalization re-ranking using existing on-device signals:
 *    recently viewed, wishlist, cart, and the AI Shopping Context snapshot.
 *    Adds at most PERSONALIZATION_CAP to the similarity score so that ties
 *    and near-ties surface products most relevant to the shopper's intent.
 *
 * Reuses existing storage, compare engine, `/compare` page, and shopping
 * context engine. Zero new API calls, zero schema changes.
 */

const VISIBLE_LIMIT = 8;
// Maximum personalization boost applied on top of the similarity score.
// Similarity max is 10 (4+3+2+1), so this can only reorder near-ties.
const PERSONALIZATION_CAP = 2;

type Insight = {
  label: string;
  tone: "emerald" | "amber" | "sky" | "violet";
} | null;

/** Detect a preferred brand from on-device signals (no PII, no network). */
function inferPreferredBrands(
  products: Product[],
  recentSlugs: string[],
  wishlistSlugs: Set<string>,
  cartSlugs: Set<string>,
): Set<string> {
  const counts = new Map<string, number>();
  const bump = (slug: string, weight: number) => {
    const p = products.find((x) => x.slug === slug);
    if (!p?.brand) return;
    counts.set(p.brand, (counts.get(p.brand) ?? 0) + weight);
  };
  cartSlugs.forEach((s) => bump(s, 3));
  wishlistSlugs.forEach((s) => bump(s, 2));
  recentSlugs.slice(0, 8).forEach((s) => bump(s, 1));
  const brands = new Set<string>();
  for (const [brand, count] of counts) {
    if (count >= 2) brands.add(brand);
  }
  return brands;
}

/** Choose the single highest-priority insight backed by real data. */
function deriveInsight(
  candidate: Product,
  current: Product,
  candidatePrice: number,
  currentPrice: number,
  candidateCompare: number | null,
  currentCompare: number | null,
  format: (v: number) => string,
): Insight {
  // 1. Price — cheaper by a non-trivial amount (>=1% and >=1 unit)
  if (
    currentPrice > 0 &&
    candidatePrice > 0 &&
    candidatePrice < currentPrice
  ) {
    const diff = currentPrice - candidatePrice;
    const pct = diff / currentPrice;
    if (diff >= 1 && pct >= 0.01) {
      return { label: `Save ${format(Math.round(diff))}`, tone: "emerald" };
    }
  }

  // 2. Rating — >= 0.3★ higher, both sides have a real rating
  const curRating = Number(current.rating || 0);
  const canRating = Number(candidate.rating || 0);
  if (curRating > 0 && canRating > 0 && canRating - curRating >= 0.3) {
    const delta = (canRating - curRating).toFixed(1);
    return { label: `${delta}★ Higher Rated`, tone: "amber" };
  }

  // 3. Reviews — "significantly more" (>=50 more AND >=2× current), both real
  const curReviews = Number(current.reviews || 0);
  const canReviews = Number(candidate.reviews || 0);
  if (canReviews >= 50 && canReviews >= curReviews * 2 && canReviews - curReviews >= 50) {
    const more = canReviews - curReviews;
    return { label: `${more.toLocaleString()} More Reviews`, tone: "sky" };
  }

  // 4. Discount — better discount by >=5 percentage points
  const curDisc = discountPercent(currentPrice, currentCompare) ?? 0;
  const canDisc = discountPercent(candidatePrice, candidateCompare) ?? 0;
  if (canDisc > 0 && canDisc - curDisc >= 5) {
    return { label: `${canDisc - curDisc}% Better Offer`, tone: "emerald" };
  }

  // 5. Stock — current is low, candidate is comfortably in stock
  const curLow =
    current.inStock !== false &&
    current.stockQuantity > 0 &&
    current.lowStockThreshold > 0 &&
    current.stockQuantity <= current.lowStockThreshold;
  const canHealthy =
    candidate.inStock !== false &&
    candidate.stockQuantity > (candidate.lowStockThreshold || 0);
  if (curLow && canHealthy) {
    return { label: "Ready to Ship", tone: "violet" };
  }

  // 6. Delivery — only when both sides expose a real shipping fee delta signal.
  // We do not have per-product ETA in the catalog; skip silently otherwise.
  return null;
}

type WinnerLabel =
  | "Best Value"
  | "Best Rated"
  | "Most Popular"
  | "Editor's Pick"
  | "Best Match";

/**
 * Pick a single strongest alternative across the visible carousel. Priority
 * follows the same evidence hierarchy as insights — cheaper + at least as
 * good rating > higher rating > significantly more reviews > personalization
 * favourite > default (top similarity).
 */
function pickWinner(
  candidates: Product[],
  current: Product,
  priceOf: (p: Product) => number,
  boostOf: (slug: string) => number,
): { slug: string; label: WinnerLabel } | null {
  if (candidates.length === 0) return null;
  const curPrice = priceOf(current) || 0;
  const curRating = Number(current.rating || 0);
  const curReviews = Number(current.reviews || 0);

  // Best Value — cheaper AND rating not lower
  const value = candidates
    .filter((p) => {
      const pp = priceOf(p) || 0;
      const rr = Number(p.rating || 0);
      return curPrice > 0 && pp > 0 && pp < curPrice * 0.98 && rr >= curRating - 0.1;
    })
    .sort((a, b) => (priceOf(a) || 0) - (priceOf(b) || 0))[0];
  if (value) return { slug: value.slug, label: "Best Value" };

  // Best Rated — meaningfully higher rating with real review count
  const rated = candidates
    .filter((p) => Number(p.rating || 0) - curRating >= 0.3 && Number(p.reviews || 0) >= 20)
    .sort((a, b) => Number(b.rating || 0) - Number(a.rating || 0))[0];
  if (rated) return { slug: rated.slug, label: "Best Rated" };

  // Most Popular — significantly more reviews
  const popular = candidates
    .filter(
      (p) =>
        Number(p.reviews || 0) >= 50 &&
        Number(p.reviews || 0) >= Math.max(curReviews * 2, curReviews + 50),
    )
    .sort((a, b) => Number(b.reviews || 0) - Number(a.reviews || 0))[0];
  if (popular) return { slug: popular.slug, label: "Most Popular" };

  // Editor's Pick — top personalization boost (from on-device + AI context)
  const boosted = [...candidates]
    .map((p) => ({ p, b: boostOf(p.slug) }))
    .filter((x) => x.b >= 1)
    .sort((a, b) => b.b - a.b)[0];
  if (boosted) return { slug: boosted.p.slug, label: "Editor's Pick" };

  // Default — top similarity (already sorted upstream)
  return { slug: candidates[0].slug, label: "Best Match" };
}

/** Short, factual one-liner. Never invented — only when data supports it. */
function deriveRecommendation(
  candidate: Product,
  current: Product,
  candidatePrice: number,
  currentPrice: number,
): string | null {
  const cRating = Number(candidate.rating || 0);
  const uRating = Number(current.rating || 0);
  const cReviews = Number(candidate.reviews || 0);
  const uReviews = Number(current.reviews || 0);

  const cheaper = currentPrice > 0 && candidatePrice > 0 && candidatePrice < currentPrice * 0.98;
  const similarPrice =
    currentPrice > 0 && candidatePrice > 0 &&
    Math.abs(candidatePrice - currentPrice) / currentPrice <= 0.1;

  if (cheaper && cRating >= uRating - 0.1) return "Better value for the money.";
  if (cRating - uRating >= 0.3 && similarPrice) return "Higher rating at a similar price.";
  if (cRating - uRating >= 0.3) return "Higher customer rating overall.";
  if (cReviews >= 50 && cReviews >= Math.max(uReviews * 2, uReviews + 50))
    return "Popular among similar buyers.";
  if (cheaper) return "More affordable alternative.";
  return null;
}


export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf, format } = useRegion();
  const { slugs, toggle, has, isFull, max, remove } = useCompare();
  const navigate = useNavigate();
  const [sheetOpen, setSheetOpen] = useState(false);

  // Personalization signals — all local, no network. Never override similarity.
  const { entries: recentEntries } = useRecentlyViewed();
  const { slugs: wishlistSet } = useWishlist();
  const { items: cartItems } = useCart();

  const currentSlug = currentProduct.slug;
  const currentPrice = priceOf(currentProduct) || 0;

  const rankedSuggestions = useMemo(() => {
    if (!products.length) return [] as Array<{ p: Product; score: number; boost: number }>;
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));
    const curPrice = currentPrice;

    // On-device personalization signals — read once per memo.
    const recentSlugs = recentEntries.map((e) => e.slug);
    const recentSet = new Set(recentSlugs);
    const wlSet = wishlistSet instanceof Set ? wishlistSet : new Set<string>();
    const cartSet = new Set(cartItems.map((i) => i.slug));
    const preferredBrands = inferPreferredBrands(products, recentSlugs, wlSet, cartSet);

    // Shopping-context signals (also feeds the AI Assistant). Soft only.
    const ctx = getShoppingContext();
    const ctxBrand = ctx.product?.brand ?? null;
    const ctxCategory = ctx.product?.category ?? null;
    const ctxPrice = ctx.product?.price_inr ?? null;
    const ctxCartCats = new Set(ctx.cart?.categories ?? []);
    const ctxWishlistCats = new Set(ctx.wishlist?.categories ?? []);

    return products
      .filter(
        (p) =>
          p.slug !== cur.slug &&
          p.status !== "archived" &&
          p.inStock !== false,
      )
      .map((p) => {
        // ---- Existing similarity score (unchanged) ----
        let score = 0;
        if (cur.brand && p.brand && p.brand === cur.brand) score += 4;
        if (cur.productType && p.productType && p.productType === cur.productType) score += 3;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        if (pCats.some((c) => curCats.has(c))) score += 2;
        if (curPrice > 0) {
          const diff = Math.abs((priceOf(p) || 0) - curPrice) / curPrice;
          if (diff <= 0.25) score += 1;
        }

        // ---- Personalization boost (capped, never overrides similarity) ----
        let boost = 0;
        if (recentSet.has(p.slug)) boost += 0.8;
        if (wlSet.has(p.slug)) boost += 0.6;
        if (p.brand && preferredBrands.has(p.brand)) boost += 0.5;
        if (p.category && ctxCartCats.has(p.category)) boost += 0.4;
        if (p.category && ctxWishlistCats.has(p.category)) boost += 0.3;

        // AI Shopping Context — soft signals from the active conversation.
        if (ctxBrand && p.brand && p.brand === ctxBrand) boost += 0.6;
        if (ctxCategory && p.category && p.category === ctxCategory) boost += 0.4;
        if (ctxPrice && ctxPrice > 0) {
          const pInr = p.priceInr ?? null;
          if (pInr && Math.abs(pInr - ctxPrice) / ctxPrice <= 0.3) boost += 0.3;
        }

        const cappedBoost = Math.min(boost, PERSONALIZATION_CAP);
        return { p, score: score + cappedBoost, boost: cappedBoost };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score);
  }, [products, currentProduct, currentPrice, priceOf, recentEntries, wishlistSet, cartItems]);

  const allSuggestions = useMemo(() => rankedSuggestions.map((x) => x.p), [rankedSuggestions]);

  const visibleSuggestions = useMemo(
    () => allSuggestions.slice(0, VISIBLE_LIMIT),
    [allSuggestions],
  );
  const hasMore = allSuggestions.length > VISIBLE_LIMIT;

  // Best-match winner (single label across the carousel). Data-backed only.
  const winner = useMemo(() => {
    if (visibleSuggestions.length === 0) return null;
    const boostBySlug = new Map(rankedSuggestions.map((x) => [x.p.slug, x.boost]));
    return pickWinner(
      visibleSuggestions,
      currentProduct,
      priceOf,
      (slug) => boostBySlug.get(slug) ?? 0,
    );
  }, [visibleSuggestions, rankedSuggestions, currentProduct, priceOf]);

  // Snapshot session-persisted selections at mount so the reminder only fires
  // when the customer arrives with a previous comparison already in progress.
  const initialSelectionRef = useRef<number | null>(null);
  useEffect(() => {
    if (initialSelectionRef.current === null) {
      initialSelectionRef.current = slugs.filter((s) => s !== currentSlug).length;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const hadPreviousSelection = (initialSelectionRef.current ?? 0) > 0;

  // Ensure current product is always part of the compare set on mount.
  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  // Prune archived / OOS stored selections (session persistence via existing store).
  useEffect(() => {
    if (!products.length || slugs.length === 0) return;
    slugs.forEach((s) => {
      if (s === currentSlug) return;
      const p = products.find((x) => x.slug === s);
      if (!p || p.status === "archived" || p.inStock === false) remove(s);
    });
  }, [products, slugs, remove, currentSlug]);

  const selectedNonCurrent = slugs.filter((s) => s !== currentSlug).length;
  const selectedCount = selectedNonCurrent + 1; // + current
  const canCompare = selectedCount >= 2;

  const handleToggle = (slug: string) => {
    if (slug === currentSlug) return;
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };


  // Empty state — hide comparison actions entirely.
  if (allSuggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
        data-pdp-compare
      >
        <div className="mb-5">
          <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground leading-tight">
            Compare Alternatives
          </h2>
        </div>
        <div className="rounded-[14px] border border-white/[0.07] px-6 py-10 flex flex-col items-center text-center">
          <div className="grid place-items-center size-11 rounded-full border border-white/10 text-white/50 mb-3">
            <SearchX className="size-5" aria-hidden />
          </div>
          <p className="text-[13px] font-medium text-white/85">
            No similar products available at the moment.
          </p>
          <p className="mt-1 text-[12px] text-white/50 max-w-xs leading-relaxed">
            We'll recommend comparable products as our catalog grows.
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
      <div className="mb-5">
        <h2 className="text-[19px] sm:text-[21px] font-semibold tracking-tight text-foreground leading-tight">
          Compare Alternatives
        </h2>
        <p className="mt-1 text-[12.5px] text-muted-foreground/75 leading-relaxed">
          See how this product compares with similar options.
        </p>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto gap-3 px-4 sm:px-1 pb-1 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <li className="shrink-0 w-[43%] min-[420px]:w-[36%] sm:w-[188px]">
            <CompareCard
              product={currentProduct}
              price={currentPrice}
              currentPrice={currentPrice}
                  currentProduct={currentProduct}
              pinned
            />
          </li>
          {visibleSuggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            const isWinner = winner?.slug === p.slug;
            return (
              <li
                key={p.slug}
                className="shrink-0 w-[43%] min-[420px]:w-[36%] sm:w-[188px]"
              >
                <CompareCard
                  product={p}
                  price={priceOf(p)}
                  currentPrice={currentPrice}
                  currentProduct={currentProduct}
                  active={active}
                  disabled={disabled}
                  onToggle={() => handleToggle(p.slug)}
                  winnerLabel={isWinner ? winner!.label : undefined}
                />
              </li>
            );
          })}

          <div aria-hidden className="shrink-0 w-1" />
        </ul>
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent"
        />
      </div>

      {hasMore && (
        <div className="mt-3 px-1">
          <button
            type="button"
            onClick={() => setSheetOpen(true)}
            className="inline-flex items-center gap-1 text-[12px] font-medium text-white/70 hover:text-accent transition-colors duration-150"
          >
            View all similar products
            <ArrowRight className="size-3.5" aria-hidden />
          </button>
        </div>
      )}

      {hadPreviousSelection && selectedNonCurrent > 0 && (
        <div className="mt-4 px-1 flex items-center gap-2 text-[12px] text-white/65">
          <Sparkles className="size-3.5 text-accent" aria-hidden />
          <span>Your previous comparison is ready.</span>
          <button
            type="button"
            onClick={() => canCompare && navigate({ to: "/compare" })}
            className="inline-flex items-center gap-0.5 font-medium text-accent hover:text-accent/85 transition-colors duration-150 min-h-[44px] sm:min-h-0"
            aria-label="Continue with your previous comparison"
          >
            Continue
            <ArrowRight className="size-3" aria-hidden />
          </button>
        </div>
      )}

      <div
        className="sr-only"
        role="status"
        aria-live="polite"
        aria-atomic="true"
      >
        {selectedNonCurrent === 0
          ? "No alternatives selected for comparison."
          : `${selectedCount} products selected for comparison.`}
      </div>

      <div className="mt-5 flex items-center justify-between gap-3 px-1">
        <p className="text-[12px] text-white/60 tabular-nums transition-colors duration-150">
          {selectedNonCurrent === 0 ? (
            <span className="text-white/60">Discover similar products</span>
          ) : (
            <>
              <span className="font-medium text-white/85">{selectedCount}</span> selected
            </>
          )}
        </p>
        <button
          type="button"
          disabled={!canCompare}
          onClick={() => canCompare && navigate({ to: "/compare" })}
          aria-label={canCompare ? `Compare ${selectedCount} selected products` : "Select at least one alternative to compare"}
          className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium tracking-wide transition-[color,border-color,background-color] duration-150 ease-out min-h-[44px] sm:min-h-0 ${
            canCompare
              ? "border-accent text-accent hover:bg-accent/[0.08]"
              : "border-white/10 text-white/35 cursor-not-allowed"
          }`}
        >
          Compare
          <ArrowRight className="size-3.5" aria-hidden />
        </button>
      </div>


      <Sheet open={sheetOpen} onOpenChange={setSheetOpen}>
        <SheetContent
          side="bottom"
          className="max-h-[85vh] rounded-t-2xl border-white/10 bg-background p-0 flex flex-col"
        >
          <SheetHeader className="px-5 pt-5 pb-3 text-left">
            <SheetTitle className="text-[16px] font-semibold tracking-tight">
              All similar products
            </SheetTitle>
            <SheetDescription className="text-[12.5px] text-white/55">
              {allSuggestions.length} alternatives to {currentProduct.name}
            </SheetDescription>
          </SheetHeader>
          <div className="flex-1 overflow-y-auto px-5 pb-6">
            <ul className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {allSuggestions.map((p) => {
                const active = has(p.slug);
                const disabled = !active && isFull;
                const isWinner = winner?.slug === p.slug;
                return (
                  <li key={p.slug}>
                    <CompareCard
                      product={p}
                      price={priceOf(p)}
                      currentPrice={currentPrice}
                      currentProduct={currentProduct}
                      active={active}
                      disabled={disabled}
                      onToggle={() => handleToggle(p.slug)}
                      winnerLabel={isWinner ? winner!.label : undefined}
                    />
                  </li>
                );
              })}

            </ul>
          </div>
          <div className="border-t border-white/10 px-5 py-3 flex items-center justify-between gap-3 bg-background">
            <p className="text-[12px] text-white/60 tabular-nums">
              {selectedNonCurrent === 0 ? (
                <span>Select to compare</span>
              ) : (
                <>
                  <span className="font-medium text-white/85">{selectedCount}</span> selected
                </>
              )}
            </p>
            <button
              type="button"
              disabled={!canCompare}
              onClick={() => {
                if (!canCompare) return;
                setSheetOpen(false);
                navigate({ to: "/compare" });
              }}
              className={`inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-[12px] font-medium tracking-wide transition-[color,border-color,background-color] duration-150 ease-out ${
                canCompare
                  ? "border-accent text-accent hover:bg-accent/[0.08]"
                  : "border-white/10 text-white/35 cursor-not-allowed"
              }`}
            >
              Compare
              <ArrowRight className="size-3.5" aria-hidden />
            </button>
          </div>
        </SheetContent>
      </Sheet>

      {/* Screen-reader-only currency formatter reference to keep tree stable */}
      <span className="sr-only" aria-hidden>{format(0)}</span>
    </section>
  );
}

function CompareCard({
  product,
  price,
  currentPrice,
  currentProduct,
  active,
  disabled,
  pinned,
  onToggle,
}: {
  product: Product;
  price: number;
  currentPrice: number;
  currentProduct?: Product;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  onToggle?: () => void;
}) {
  const { compareOf, format } = useRegion();
  const comparePrice = compareOf(product);
  const discount = discountPercent(price, comparePrice) ?? 0;
  const isSelected = !!(pinned || active);

  const insight: Insight =
    !pinned && currentProduct
      ? deriveInsight(
          product,
          currentProduct,
          price,
          currentPrice,
          comparePrice,
          compareOf(currentProduct),
          format,
        )
      : null;

  const insightToneClass =
    insight?.tone === "amber"
      ? "bg-amber-500/10 text-amber-300"
      : insight?.tone === "sky"
        ? "bg-sky-500/10 text-sky-300"
        : insight?.tone === "violet"
          ? "bg-violet-500/10 text-violet-300"
          : "bg-emerald-500/10 text-emerald-400";

  return (
    <div className="flex h-full flex-col">
      {pinned ? (
        <span className="mb-1.5 px-0.5 text-[10px] font-medium uppercase tracking-widest text-white/40">
          Current Product
        </span>
      ) : (
        <span aria-hidden className="mb-1.5 h-[14px]" />
      )}

      <div
        className={`flex flex-1 flex-col rounded-[14px] border overflow-hidden bg-transparent transition-[border-color] duration-150 ease-out ${
          isSelected ? "border-accent" : "border-white/[0.07] hover:border-white/15"
        }`}
      >
        <Link
          to="/products/$slug"
          params={{ slug: product.slug }}
          className="relative block bg-black/25 overflow-hidden"
          style={{ aspectRatio: "1 / 1" }}
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
        </Link>

        <div className="flex flex-1 flex-col p-3">
          <Link
            to="/products/$slug"
            params={{ slug: product.slug }}
            className="block text-[12.5px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.4em] hover:text-accent transition-colors"
          >
            {product.name}
          </Link>

          <div className="mt-2 flex items-center gap-1 text-[10.5px] text-white/55 tabular-nums">
            <Star className="size-2.5 fill-amber-400 text-amber-400" aria-hidden />
            <span className="font-medium text-white/85">{Number(product.rating || 0).toFixed(1)}</span>
            <span className="text-white/40">({Number(product.reviews || 0)})</span>
          </div>

          <div className="mt-1 flex items-baseline gap-1.5 flex-wrap">
            <Price value={price} variant="current" className="text-[13px]" />
            {comparePrice != null && comparePrice > price && (
              <>
                <Price
                  value={comparePrice}
                  variant="compare"
                  className="text-[10.5px] text-white/40 line-through"
                />
                {discount > 0 && (
                  <span className="text-[10.5px] font-semibold text-emerald-400 tabular-nums">
                    -{discount}%
                  </span>
                )}
              </>
            )}
          </div>

          {insight && (
            <div className="mt-1.5">
              <span
                className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold tabular-nums ${insightToneClass}`}
              >
                {insight.label}
              </span>
            </div>
          )}


          <div className="mt-auto pt-3">
            <button
              type="button"
              onClick={onToggle}
              aria-pressed={isSelected}
              disabled={pinned || disabled}
              className="inline-flex items-center gap-1.5 text-[11px] font-medium text-white/75 disabled:cursor-not-allowed disabled:opacity-70"
            >
              <span
                aria-hidden
                className={`grid place-items-center size-3.5 rounded-[3.5px] border transition-colors duration-150 ${
                  isSelected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/25 bg-transparent"
                }`}
              >
                {isSelected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              Compare
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
