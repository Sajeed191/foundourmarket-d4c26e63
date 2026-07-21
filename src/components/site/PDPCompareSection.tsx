import { Link } from "@tanstack/react-router";
import { Scale, Check, ArrowRight, X, Plus, Star, Package } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

/**
 * PDP — Product Comparison v2.2 (premium polish).
 *
 * The current PDP product is pinned as the first, non-deselectable card
 * ("CURRENT PRODUCT" amber chip) and auto-added to the global compare
 * store on mount. Similar products (brand → productType → category) fill
 * a horizontal snap carousel with a compact stat row and a single
 * highest-priority merchandising chip. Live "N of 4" indicator, sticky
 * CTA with animated enable state, and a "Ready to Compare" preview
 * dialog. All state routes through `useCompare` so the tray and /compare
 * page keep working unchanged.
 */

type ChipKind = "bestseller" | "hot" | "flash" | "trending" | "new" | "featured";

function pickChip(p: Product): { kind: ChipKind; label: string; cls: string } | null {
  // Highest-priority merchandising chip only.
  if (p.bestseller) return { kind: "bestseller", label: "Best Seller", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  if (p.flashDeal) return { kind: "flash", label: "Flash Deal", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  if (p.hotDeal) return { kind: "hot", label: "Hot Deal", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" };
  if (p.trending) return { kind: "trending", label: "Trending", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
  if (p.newArrival) return { kind: "new", label: "New Arrival", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  if (p.featured) return { kind: "featured", label: "Featured", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" };
  return null;
}

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs, toggle, has, isFull, max, remove, clear } = useCompare();
  const [previewOpen, setPreviewOpen] = useState(false);

  const currentSlug = currentProduct.slug;

  // Similarity ranked and memoized. Excludes the current product; only
  // includes truly similar items (brand / productType / category overlap).
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

  // Ensure the current PDP product is always in the compare store, and
  // is placed at the front conceptually. It cannot be deselected.
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

  const selectedCount = slugs.length; // includes current
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
    if (slug === currentSlug) return; // never deselect current
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  const openPreview = () => {
    if (!canCompare) return;
    setPreviewOpen(true);
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

      {/* Live selection indicator */}
      <div className="mt-5 flex items-center justify-between">
        <div className="flex items-baseline gap-2">
          <span className="text-[10px] font-mono uppercase tracking-widest text-white/50">
            Selected
          </span>
          <span className="text-[13px] font-semibold text-white/90 tabular-nums transition-all duration-200">
            {selectedCount} of {max} products
          </span>
        </div>
        {otherSelected > 0 && (
          <button
            onClick={() => {
              // clear everything then re-add current
              clear();
              toggle(currentSlug);
            }}
            className="text-[11px] font-mono uppercase tracking-widest text-white/40 hover:text-white/80 transition-colors"
          >
            Reset
          </button>
        )}
      </div>

      {/* Carousel */}
      <div className="mt-3 -mx-4 sm:mx-0 overflow-hidden">
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

      {/* Sticky CTA */}
      <div
        data-floating-control
        className="fixed left-1/2 -translate-x-1/2 z-40 w-[min(94vw,520px)] bottom-[calc(var(--floating-bottom-offset,1rem)+4.5rem)] sm:bottom-6 animate-fade-in"
        style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
      >
        <button
          onClick={openPreview}
          disabled={!canCompare}
          className={`w-full flex items-center justify-between gap-3 rounded-full px-5 py-3.5 shadow-2xl border transition-all duration-200 ease-out ${
            canCompare
              ? "bg-accent text-accent-foreground border-accent/60 hover:brightness-110 active:scale-[0.98] animate-scale-in"
              : "bg-card/95 backdrop-blur-xl text-white/70 border-white/[0.08] cursor-not-allowed"
          }`}
        >
          <span className="inline-flex items-center gap-2 text-[12px] font-bold uppercase tracking-widest">
            <Scale className="size-4" aria-hidden />
            {canCompare
              ? `Compare ${selectedCount} Products`
              : "Select at least 2 products"}
          </span>
          <ArrowRight
            className={`size-4 transition-opacity duration-200 ${canCompare ? "opacity-100" : "opacity-40"}`}
            aria-hidden
          />
        </button>
      </div>

      {/* Preview dialog */}
      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-md rounded-[20px] border-white/[0.08] bg-card/95 backdrop-blur-xl p-0 overflow-hidden">
          <DialogHeader className="px-5 pt-5 pb-3 border-b border-white/[0.06]">
            <DialogTitle className="text-[15px] font-semibold inline-flex items-center gap-2">
              <Scale className="size-4 text-accent" aria-hidden />
              Ready to Compare
            </DialogTitle>
          </DialogHeader>

          <div className="px-5 py-4 space-y-5">
            {/* Thumbnails row */}
            <div className="flex items-center gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {selectedProducts.map((p) => (
                <div key={p.slug} className="relative shrink-0">
                  <div className="size-14 rounded-xl overflow-hidden border border-white/[0.08] bg-black/30">
                    {p.image && (
                      <img
                        src={resolveImage(p.image)}
                        alt={p.name}
                        loading="lazy"
                        decoding="async"
                        className="w-full h-full object-cover"
                      />
                    )}
                  </div>
                  {p.slug !== currentSlug && (
                    <button
                      onClick={() => toggle(p.slug)}
                      aria-label={`Remove ${p.name}`}
                      className="absolute -top-1.5 -right-1.5 size-4 grid place-items-center rounded-full bg-background border border-border text-muted-foreground hover:text-accent transition-colors"
                    >
                      <X className="size-2.5" />
                    </button>
                  )}
                </div>
              ))}
            </div>

            <div>
              <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                You'll compare
              </p>
              <ul className="grid grid-cols-2 gap-x-3 gap-y-1.5">
                {["Price", "Rating", "Reviews", "Specifications", "Features", "Shipping", "Warranty"].map((c) => (
                  <li key={c} className="flex items-center gap-1.5 text-[12px] text-white/80">
                    <Check className="size-3.5 text-emerald-400" aria-hidden />
                    {c}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="px-5 pb-5 pt-2 flex items-center gap-2">
            <button
              onClick={() => setPreviewOpen(false)}
              className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-3 py-2"
            >
              Cancel
            </button>
            <Link
              to="/compare"
              onClick={() => setPreviewOpen(false)}
              className="flex-1 inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-3 text-[12px] font-bold uppercase tracking-widest hover:brightness-110 transition-all duration-200"
            >
              Continue
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          </div>
        </DialogContent>
      </Dialog>
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
          Compare this product with similar alternatives to help you make the best buying decision.
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground/60 leading-relaxed">
          Products are chosen based on brand, category, product type, and similar specifications.
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
