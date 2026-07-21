import { Link } from "@tanstack/react-router";
import { Scale, Check, ArrowRight, X, Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { StarRating } from "@/components/site/StarRating";
import { Price } from "@/components/site/Price";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * PDP — Product Comparison v2.0.
 *
 * Premium, minimal comparison entry point. Lives on the PDP only (Compare
 * is removed from every other surface). Horizontal snap carousel of 4–8
 * similar products; each card is compact (image, name, price, rating,
 * count, compare toggle). A sticky floating CTA appears once at least one
 * product is selected, opening a lightweight preview dialog that lists
 * the selection + comparison categories before deep-linking to `/compare`.
 *
 * Storage, tray, and `/compare` page are unchanged.
 */
export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max, clear } = useCompare();
  const [previewOpen, setPreviewOpen] = useState(false);

  const suggestions = useMemo<Product[]>(() => {
    if (!products.length) return [];
    const pool = products.filter(
      (p) =>
        p.slug !== currentProduct.slug &&
        p.status !== "archived" &&
        p.inStock !== false,
    );
    const sameCat = pool.filter((p) => p.category === currentProduct.category);
    const rest = pool.filter((p) => p.category !== currentProduct.category);
    return [...sameCat, ...rest].slice(0, 8);
  }, [products, currentProduct.slug, currentProduct.category]);

  if (suggestions.length === 0) return null;

  const selectedCount = slugs.length;
  const canCompare = selectedCount >= 2;
  const selectedProducts = slugs
    .map((s) => products.find((p) => p.slug === s))
    .filter((p): p is Product => Boolean(p));

  const handleToggle = (slug: string) => {
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  const openPreview = () => {
    if (!canCompare) {
      toast.message("Select at least 2 products to compare");
      return;
    }
    setPreviewOpen(true);
  };

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
      data-pdp-compare
    >
      {/* Header — matches PDP editorial rhythm */}
      <div className="mb-6 sm:mb-8 flex items-start gap-3.5">
        <span
          aria-hidden
          className="mt-1.5 h-6 w-[3px] rounded-full bg-accent shrink-0"
        />
        <div className="min-w-0">
          <h2 className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-foreground leading-tight inline-flex items-center gap-2">
            <Scale className="size-[18px] text-accent" aria-hidden />
            Product Comparison
          </h2>
          <p className="mt-1 text-[13px] text-muted-foreground/80 leading-relaxed">
            Compare this product with similar products.
          </p>
        </div>
      </div>

      {/* Horizontal carousel — mobile first, edge padded */}
      <div className="-mx-4 sm:mx-0">
        <ul
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 sm:px-0 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollPaddingLeft: "1rem",
            overscrollBehaviorX: "contain",
          }}
        >
          {suggestions.map((p) => {
            const active = has(p.slug);
            const price = priceOf(p);
            return (
              <li
                key={p.slug}
                className={`snap-start shrink-0 w-[62%] min-[420px]:w-[46%] sm:w-[240px] rounded-[20px] border transition-all duration-200 overflow-hidden bg-white/[0.02] ${
                  active
                    ? "border-accent/70 ring-1 ring-accent/40"
                    : "border-white/[0.08] hover:border-white/20"
                }`}
              >
                <Link
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  className="block aspect-square bg-black/30 overflow-hidden"
                >
                  {p.image && (
                    <img
                      src={resolveImage(p.image)}
                      alt={p.name}
                      loading="lazy"
                      decoding="async"
                      className="w-full h-full object-cover"
                    />
                  )}
                </Link>

                <div className="p-3">
                  <Link
                    to="/products/$slug"
                    params={{ slug: p.slug }}
                    className="block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.5em] hover:text-accent transition-colors"
                  >
                    {p.name}
                  </Link>

                  <div className="mt-2">
                    <Price value={price} variant="current" className="text-[15px]" />
                  </div>

                  <div className="mt-1.5">
                    <StarRating
                      rating={Number(p.rating || 0)}
                      count={Number(p.reviews || 0)}
                      starClassName="size-3"
                      textClassName="text-[11px]"
                    />
                  </div>

                  <button
                    onClick={() => handleToggle(p.slug)}
                    aria-pressed={active}
                    className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 active:scale-95 ${
                      active
                        ? "bg-accent text-accent-foreground"
                        : "bg-white/[0.05] text-white/85 hover:bg-white/[0.1] border border-white/[0.08]"
                    }`}
                  >
                    {active ? (
                      <>
                        <Check className="size-3.5" aria-hidden /> Added
                      </>
                    ) : (
                      <>
                        <Plus className="size-3.5" aria-hidden /> Compare
                      </>
                    )}
                  </button>
                </div>
              </li>
            );
          })}
          <div aria-hidden className="shrink-0 w-1" />
        </ul>
      </div>

      {/* Sticky floating CTA — only when 1+ selected */}
      {selectedCount > 0 && (
        <div
          data-floating-control
          className="fixed left-1/2 -translate-x-1/2 z-40 w-[min(94vw,520px)] bottom-[calc(var(--floating-bottom-offset,1rem)+4.5rem)] sm:bottom-6 animate-fade-in"
        >
          <button
            onClick={openPreview}
            disabled={!canCompare}
            className={`w-full flex items-center justify-between gap-3 rounded-full px-5 py-3.5 shadow-2xl border transition-all duration-200 ${
              canCompare
                ? "bg-accent text-accent-foreground border-accent/60 hover:brightness-110 active:scale-[0.98]"
                : "bg-card/95 backdrop-blur-xl text-white/70 border-white/[0.08]"
            }`}
          >
            <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest">
              <Scale className="size-4" aria-hidden />
              Compare Selected ({selectedCount}/{max})
            </span>
            <ArrowRight className="size-4" aria-hidden />
          </button>
        </div>
      )}

      {/* Smart preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md rounded-[20px] border-white/[0.08] bg-card/95 backdrop-blur-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
            <DialogTitle className="text-[15px] font-semibold inline-flex items-center gap-2">
              <Scale className="size-4 text-accent" aria-hidden />
              Comparison Preview
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-5">
            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Comparing
              </p>
              <ul className="space-y-1.5">
                {selectedProducts.map((p) => (
                  <li
                    key={p.slug}
                    className="flex items-center gap-2.5 text-[13px] text-white/90"
                  >
                    <span className="size-1 rounded-full bg-accent shrink-0" />
                    <span className="line-clamp-1 flex-1">{p.name}</span>
                    <button
                      onClick={() => toggle(p.slug)}
                      aria-label={`Remove ${p.name}`}
                      className="size-5 grid place-items-center rounded-full text-white/40 hover:text-accent hover:bg-white/[0.06] transition-colors"
                    >
                      <X className="size-3" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                Categories compared
              </p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {[
                  "Price",
                  "Rating",
                  "Reviews",
                  "Specifications",
                  "Features",
                  "Shipping",
                  "Warranty",
                ].map((c) => (
                  <li
                    key={c}
                    className="flex items-center gap-1.5 text-[12px] text-white/80"
                  >
                    <Check className="size-3.5 text-emerald-400" aria-hidden />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-5 pb-5 pt-2 flex items-center gap-2">
            <button
              onClick={() => {
                clear();
                setPreviewOpen(false);
              }}
              className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Clear
            </button>
            <Link
              to="/compare"
              onClick={() => setPreviewOpen(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-3 text-[12px] font-bold uppercase tracking-widest hover:brightness-110 transition-all"
            >
              Continue to Comparison
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
    </section>
  );
}
