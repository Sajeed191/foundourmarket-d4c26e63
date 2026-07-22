import { Link, useNavigate } from "@tanstack/react-router";
import { ArrowRight, Check, Loader2, Star, X } from "lucide-react";
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { toast } from "sonner";

import { ProductCard } from "@/components/site/ProductCard";
import { useProducts } from "@/lib/use-products";
import { type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Sheet, SheetContent } from "@/components/ui/sheet";

/**
 * PDP — Similar Products (v6.3)
 *
 * Premium native marketplace recommendation carousel. Pure UI + client-side
 * sorting/preview. No new API calls, no backend changes, no ranking-engine
 * changes. Reuses ProductCard, compare store, and existing similarity output.
 */

const VISIBLE_LIMIT = 12;
const VIEW_MORE_THRESHOLD = 8;

type SortKey = "best" | "price" | "rating" | "popular" | "new";

const SORT_TABS: { value: SortKey; label: string }[] = [
  { value: "best", label: "Best Match" },
  { value: "price", label: "Lower Price" },
  { value: "rating", label: "Top Rated" },
  { value: "popular", label: "Most Popular" },
  { value: "new", label: "New Arrivals" },
];

const SORT_STORAGE_KEY = "fom_pdp_similar_sort";

function readSort(): SortKey {
  if (typeof window === "undefined") return "best";
  try {
    const v = sessionStorage.getItem(SORT_STORAGE_KEY);
    if (v && SORT_TABS.some((t) => t.value === v)) return v as SortKey;
  } catch {
    /* noop */
  }
  return "best";
}

function writeSort(v: SortKey) {
  if (typeof window === "undefined") return;
  try {
    sessionStorage.setItem(SORT_STORAGE_KEY, v);
  } catch {
    /* noop */
  }
}

type Pill = { label: string; tone: "emerald" | "sky" | "amber" | "violet" | "neutral" };

function pillFor(p: Product, shipping: number): Pill | null {
  // Priority: Free Delivery > Fast Delivery > Limited Stock > Best Seller > New Arrival
  if (shipping === 0) return { label: "Free delivery", tone: "emerald" };
  if (p.fastSelling) return { label: "Fast delivery", tone: "sky" };
  if (
    p.inStock !== false &&
    p.stockQuantity > 0 &&
    p.lowStockThreshold > 0 &&
    p.stockQuantity <= p.lowStockThreshold
  ) {
    return { label: "Limited stock", tone: "amber" };
  }
  if (p.bestseller) return { label: "Best seller", tone: "violet" };
  if (p.newArrival) return { label: "New arrival", tone: "neutral" };
  return null;
}

// Quieter, near-neutral pill palette. Only Free Delivery keeps a subtle
// accent — everything else is neutral so a single card never dominates.
const pillClasses: Record<Pill["tone"], string> = {
  emerald: "text-emerald-300/85 bg-emerald-400/[0.06] border-emerald-400/15",
  sky: "text-white/65 bg-white/[0.035] border-white/10",
  amber: "text-white/65 bg-white/[0.035] border-white/10",
  violet: "text-white/65 bg-white/[0.035] border-white/10",
  neutral: "text-white/60 bg-white/[0.035] border-white/10",
};

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf, shippingFeeOf, format } = useRegion();
  const { slugs, toggle, has, isFull, max } = useCompare();
  const navigate = useNavigate();
  const [navigating, setNavigating] = useState(false);
  const [sort, setSort] = useState<SortKey>(() => readSort());
  const [preview, setPreview] = useState<Product | null>(null);

  const currentSlug = currentProduct.slug;
  const currentPrice = priceOf(currentProduct) || 0;

  // --- Similarity (unchanged algorithm) ---
  const suggestions = useMemo(() => {
    if (!products.length) return [] as Product[];
    const cur = currentProduct;
    const curCats = new Set(
      [cur.category, ...(cur.categories ?? [])].filter(Boolean),
    );

    return products
      .filter(
        (p) =>
          p.slug !== cur.slug &&
          p.status !== "archived" &&
          p.inStock !== false,
      )
      .map((p) => {
        let score = 0;
        if (cur.brand && p.brand && p.brand === cur.brand) score += 4;
        if (cur.productType && p.productType && p.productType === cur.productType) score += 3;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        if (pCats.some((c) => curCats.has(c))) score += 2;
        if (currentPrice > 0) {
          const diff = Math.abs((priceOf(p) || 0) - currentPrice) / currentPrice;
          if (diff <= 0.25) score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, VISIBLE_LIMIT)
      .map((x) => x.p);
  }, [products, currentProduct, currentPrice, priceOf]);

  // --- Client-side sort (reorders in place, no new fetch) ---
  const sortedSuggestions = useMemo(() => {
    if (suggestions.length === 0) return suggestions;
    const arr = suggestions.slice();
    switch (sort) {
      case "price":
        arr.sort((a, b) => (priceOf(a) || 0) - (priceOf(b) || 0));
        break;
      case "rating":
        arr.sort((a, b) => (b.rating || 0) - (a.rating || 0));
        break;
      case "popular":
        arr.sort(
          (a, b) =>
            (b.soldCount || 0) + (b.reviews || 0) - ((a.soldCount || 0) + (a.reviews || 0)),
        );
        break;
      case "new":
        arr.sort((a, b) => {
          const ta = a.createdAt ? new Date(a.createdAt).getTime() : 0;
          const tb = b.createdAt ? new Date(b.createdAt).getTime() : 0;
          return tb - ta;
        });
        break;
      case "best":
      default:
        // already ranked by score
        break;
    }
    return arr;
  }, [suggestions, sort, priceOf]);

  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  const selectedAlt = slugs.filter((s) => s !== currentSlug);
  const selectedNonCurrent = selectedAlt.length;
  const selectedCount = selectedNonCurrent + 1; // + current
  const canCompare = selectedNonCurrent >= 1 && selectedCount >= 2;

  // --- Smart Savings Summary ---
  const savings = useMemo(() => {
    if (selectedAlt.length === 0 || currentPrice <= 0) return 0;
    const prices = selectedAlt
      .map((s) => suggestions.find((p) => p.slug === s))
      .filter((p): p is Product => !!p)
      .map((p) => priceOf(p) || 0)
      .filter((n) => n > 0);
    if (prices.length === 0) return 0;
    const cheapest = Math.min(...prices);
    const diff = currentPrice - cheapest;
    // Hide when savings are negligible (< 2% of current price and < a meaningful floor).
    if (diff <= 0) return 0;
    if (diff / currentPrice < 0.02) return 0;
    return diff;
  }, [selectedAlt, suggestions, priceOf, currentPrice]);

  const handleToggle = useCallback(
    (slug: string) => {
      if (slug === currentSlug) return;
      if (!has(slug) && isFull) {
        toast.message(`Maximum ${max} products`);
        return;
      }
      toggle(slug);
    },
    [currentSlug, has, isFull, max, toggle],
  );

  const handleCompare = () => {
    if (!canCompare || navigating) return;
    setNavigating(true);
    navigate({ to: "/compare" });
  };

  const handleSort = (v: SortKey) => {
    setSort(v);
    writeSort(v);
  };

  const ctaLabel = canCompare
    ? `Compare ${selectedCount} Product${selectedCount === 1 ? "" : "s"}`
    : "Compare";

  if (products.length === 0) return null;

  // Empty state — no similar products
  if (suggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-28 sm:mt-32"
        aria-labelledby="pdp-ymal-heading"
      >
        <h2
          id="pdp-ymal-heading"
          className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight"
        >
          Similar Products
        </h2>
        <p className="mt-3 text-[13.5px] text-white/60">
          No similar products available right now.
        </p>
        <p className="mt-1 text-[12.5px] text-white/40">
          We&apos;ll recommend similar products as our catalog grows.
        </p>
      </section>
    );
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-28 sm:mt-32"
      data-pdp-compare
      aria-labelledby="pdp-ymal-heading"
    >
      <div className="mb-6 sm:mb-7">
        <h2
          id="pdp-ymal-heading"
          className="text-[20px] sm:text-[22px] font-semibold tracking-tight text-foreground leading-tight"
        >
          Similar Products
        </h2>
        <p className="mt-2 text-[13px] text-muted-foreground/75 leading-relaxed">
          Customers also viewed these alternatives
        </p>
      </div>

      {/* Sort tabs */}
      <div
        role="tablist"
        aria-label="Sort similar products"
        className="relative mb-5 -mx-4 sm:mx-0 overflow-x-auto [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
      >
        <div className="flex items-center gap-1 px-4 sm:px-0 min-w-max border-b border-white/[0.06]">
          {SORT_TABS.map((t) => {
            const active = sort === t.value;
            return (
              <button
                key={t.value}
                role="tab"
                aria-selected={active}
                onClick={() => handleSort(t.value)}
                className={`relative px-3 py-2.5 text-[12.5px] font-medium tracking-wide transition-colors duration-150 min-h-[44px] focus-visible:outline-none focus-visible:text-foreground ${
                  active ? "text-foreground" : "text-white/50 hover:text-white/80"
                }`}
              >
                {t.label}
                {active && (
                  <motion.span
                    layoutId="pdp-similar-sort-underline"
                    className="absolute left-2 right-2 -bottom-px h-[1.5px] bg-accent rounded-full"
                    transition={{ type: "spring", stiffness: 420, damping: 34 }}
                  />
                )}
              </button>
            );
          })}
        </div>
      </div>

      <div className="relative -mx-4 sm:mx-0">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 left-0 w-6 bg-gradient-to-r from-background to-transparent z-10"
        />
        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 right-0 w-6 bg-gradient-to-l from-background to-transparent z-10"
        />

        <ul
          className="flex overflow-x-auto gap-5 sm:gap-6 px-4 sm:px-1 pb-2 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          <li className="shrink-0 w-[38%] min-[420px]:w-[34%] sm:w-[190px]">
            <RailItem
              product={currentProduct}
              pinned
              pill={pillFor(currentProduct, shippingFeeOf(currentProduct))}
              onPreview={() => setPreview(currentProduct)}
            />
          </li>
          {sortedSuggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            return (
              <li
                key={p.slug}
                className="shrink-0 w-[38%] min-[420px]:w-[34%] sm:w-[190px]"
              >
                <RailItem
                  product={p}
                  active={active}
                  disabled={disabled}
                  pill={pillFor(p, shippingFeeOf(p))}
                  onToggle={() => handleToggle(p.slug)}
                  onPreview={() => setPreview(p)}
                />
              </li>
            );
          })}
          <div aria-hidden className="shrink-0 w-1" />
        </ul>
      </div>

      {sortedSuggestions.length >= VIEW_MORE_THRESHOLD && (
        <div className="mt-8 px-1">
          <Link
            to="/category/$slug"
            params={{ slug: currentProduct.category || "all" }}
            className="inline-flex items-center gap-1 text-[13px] text-white/60 hover:text-accent transition-colors duration-150"
          >
            View all similar products
            <ArrowRight className="size-3.5" aria-hidden />
          </Link>
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

      {savings > 0 && (
        <p className="mt-6 text-[12.5px] text-emerald-300/85 px-1">
          You could save {format(savings)} by choosing one of these alternatives.
        </p>
      )}

      <div className="mt-4 pt-6 border-t border-white/[0.06] flex items-center justify-between gap-3 px-1">
        <span className="text-[12.5px] text-white/55 tabular-nums">
          Selected: {selectedCount}
        </span>
        <button
          type="button"
          disabled={!canCompare || navigating}
          onClick={handleCompare}
          aria-label={
            canCompare
              ? `Compare ${selectedCount} selected products`
              : "Select at least one more product to compare"
          }
          className={`inline-flex items-center gap-1.5 rounded-full border px-4 py-2 text-[12.5px] font-medium tracking-wide transition-colors duration-150 ease-out min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 ${
            canCompare && !navigating
              ? "border-accent/70 text-accent hover:bg-accent/[0.06]"
              : "border-white/10 text-white/35 cursor-not-allowed"
          }`}
        >
          {navigating ? (
            <>
              <Loader2 className="size-3.5 animate-spin" aria-hidden />
              Opening
            </>
          ) : (
            <>
              {ctaLabel}
              <ArrowRight className="size-3.5" aria-hidden />
            </>
          )}
        </button>
      </div>

      <QuickPreviewSheet
        product={preview}
        onClose={() => setPreview(null)}
        pillClasses={pillClasses}
        pill={preview ? pillFor(preview, shippingFeeOf(preview)) : null}
        onToggle={(slug) => handleToggle(slug)}
        isSelected={preview ? preview.slug === currentSlug || has(preview.slug) : false}
        isPinned={preview ? preview.slug === currentSlug : false}
      />
    </section>
  );
}

type RailItemProps = {
  product: Product;
  active?: boolean;
  disabled?: boolean;
  pinned?: boolean;
  pill?: Pill | null;
  onToggle?: () => void;
  onPreview?: () => void;
};

function RailItemImpl({
  product,
  active,
  disabled,
  pinned,
  pill,
  onToggle,
  onPreview,
}: RailItemProps) {
  const isSelected = !!(pinned || active);
  return (
    <div className="flex h-full flex-col">
      {/* Reserved caption slot so cards align regardless of "Current" tag */}
      <div className="mb-1.5 h-[14px] px-0.5 flex items-center">
        {pinned && (
          <span className="text-[10px] font-medium uppercase tracking-widest text-white/40">
            Current
          </span>
        )}
      </div>

      <div
        className={`relative rounded-2xl border transition-colors duration-150 ${
          isSelected && !pinned ? "border-accent/60" : "border-transparent"
        }`}
      >
        <ProductCard product={product} compact hideBadges={pinned} />

        {/* Invisible tap-to-preview overlay covering only the image area */}
        {onPreview && (
          <button
            type="button"
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
              onPreview();
            }}
            aria-label={`Quick preview: ${product.name}`}
            className="absolute inset-x-0 top-0 aspect-square z-20 rounded-2xl focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
          />
        )}
      </div>

      {/* Reserved slot for a single metadata pill — never expands the card */}
      <div className="mt-2 h-[18px] px-0.5 flex items-center">
        {pill && (
          <span
            className={`inline-flex items-center rounded-full border px-1.5 py-[1px] text-[10px] font-medium tracking-wide ${pillClasses[pill.tone]}`}
          >
            {pill.label}
          </span>
        )}
      </div>

      <div className="mt-1 px-0.5">
        <button
          type="button"
          onClick={onToggle}
          aria-pressed={isSelected}
          aria-label={
            pinned
              ? `${product.name} is the current product`
              : isSelected
                ? `Remove ${product.name} from comparison`
                : `Add ${product.name} to comparison`
          }
          disabled={pinned || disabled}
          className="inline-flex items-center gap-1.5 py-1.5 pr-2 pl-0.5 text-[11px] font-medium text-white/70 disabled:cursor-not-allowed disabled:opacity-60 min-h-[44px] sm:min-h-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60 rounded-md"
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
  );
}

const RailItem = memo(RailItemImpl);

// ---------------- Quick Preview Bottom Sheet ----------------

function QuickPreviewSheet({
  product,
  onClose,
  pillClasses,
  pill,
  onToggle,
  isSelected,
  isPinned,
}: {
  product: Product | null;
  onClose: () => void;
  pillClasses: Record<Pill["tone"], string>;
  pill: Pill | null;
  onToggle: (slug: string) => void;
  isSelected: boolean;
  isPinned: boolean;
}) {
  const { priceOf, format } = useRegion();
  const scrollRef = useRef<number>(0);

  // Preserve carousel scroll position across open/close.
  useEffect(() => {
    if (product) {
      scrollRef.current = typeof window !== "undefined" ? window.scrollY : 0;
    } else if (typeof window !== "undefined" && scrollRef.current > 0) {
      window.scrollTo({ top: scrollRef.current });
    }
  }, [product]);

  if (!product) return null;

  const price = priceOf(product) || 0;
  const compareInr = product.comparePriceInr;
  const compareUsd = product.comparePriceUsd;
  const originalRaw =
    (compareInr && compareInr > price ? compareInr : null) ??
    (compareUsd && compareUsd > price ? compareUsd : null);

  const specEntries = Object.entries(product.specifications ?? {}).slice(0, 5);

  return (
    <Sheet open={!!product} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="p-0 border-t border-white/[0.06] rounded-t-2xl max-h-[88dvh] overflow-hidden"
      >
        <div className="mx-auto mt-2 h-1 w-10 rounded-full bg-white/15" aria-hidden />
        <div className="overflow-y-auto max-h-[calc(88dvh-1rem)] px-5 pb-6 pt-3">
          {/* Header row for close is handled by SheetContent's built-in X */}
          <div className="pointer-events-none absolute top-3 right-3 opacity-0">
            <X className="size-4" aria-hidden />
          </div>

          <div className="mt-1 rounded-xl overflow-hidden bg-white/[0.03] border border-white/[0.05]">
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="w-full aspect-square object-cover"
            />
          </div>

          <h3 className="mt-4 text-[15.5px] font-semibold tracking-tight text-foreground leading-snug">
            {product.name}
          </h3>

          {product.rating > 0 && (
            <div className="mt-1.5 flex items-center gap-1.5 text-[12px] text-white/60">
              <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
              <span className="tabular-nums">{product.rating.toFixed(1)}</span>
              <span className="text-white/40">·</span>
              <span className="tabular-nums">{product.reviews} reviews</span>
            </div>
          )}

          <div className="mt-3 flex items-baseline gap-2.5">
            <span className="text-[18px] font-semibold text-foreground tabular-nums">
              {format(price)}
            </span>
            {originalRaw && (
              <span className="text-[12.5px] text-white/40 line-through tabular-nums">
                {format(originalRaw)}
              </span>
            )}
          </div>

          {pill && (
            <div className="mt-2.5">
              <span
                className={`inline-flex items-center rounded-full border px-2 py-[2px] text-[10.5px] font-medium tracking-wide ${pillClasses[pill.tone]}`}
              >
                {pill.label}
              </span>
            </div>
          )}

          <p className="mt-3 text-[12.5px] text-white/60">
            {product.inStock !== false && product.stockQuantity > 0
              ? "In stock"
              : "Currently unavailable"}
          </p>

          {specEntries.length > 0 && (
            <dl className="mt-5 space-y-2 border-t border-white/[0.06] pt-4">
              {specEntries.map(([k, v]) => (
                <div
                  key={k}
                  className="flex items-start justify-between gap-4 text-[12.5px]"
                >
                  <dt className="text-white/50 shrink-0">{k}</dt>
                  <dd className="text-white/85 text-right">{v}</dd>
                </div>
              ))}
            </dl>
          )}

          <div className="mt-6 flex items-center gap-3">
            <button
              type="button"
              disabled={isPinned}
              onClick={() => onToggle(product.slug)}
              aria-pressed={isSelected}
              className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-3.5 py-2 text-[12.5px] text-white/80 hover:text-foreground hover:border-white/25 disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              <span
                aria-hidden
                className={`grid place-items-center size-3.5 rounded-[3.5px] border transition-colors ${
                  isSelected
                    ? "border-accent bg-accent text-accent-foreground"
                    : "border-white/25"
                }`}
              >
                {isSelected && <Check className="size-2.5" strokeWidth={3} />}
              </span>
              {isPinned ? "Current" : isSelected ? "Added" : "Compare"}
            </button>
            <Link
              to="/products/$slug"
              params={{ slug: product.slug }}
              onClick={onClose}
              className="ml-auto inline-flex items-center gap-1.5 rounded-full bg-accent text-accent-foreground px-4 py-2 text-[12.5px] font-medium min-h-[44px] shadow-[var(--shadow-ember)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
            >
              View product
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </div>
      </SheetContent>
    </Sheet>
  );
}
