import { useMemo, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Plus, Check, Sparkles, Heart, History } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/products";

/** Minimal product card used inside the wishlist recommendation rails. */
function MiniCard({ product }: { product: Product }) {
  const { format, priceOf } = useRegion();
  const { add, items } = useCart();
  const inCart = items.some((i) => i.slug === product.slug);

  return (
    <div className="group card-premium overflow-hidden p-2 flex flex-col">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
        <div className="relative aspect-square rounded-lg overflow-hidden bg-black/40 mb-2">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            decoding="async"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
          {!product.inStock && (
            <span className="absolute top-1.5 left-1.5 rounded-full bg-background/80 backdrop-blur px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
              Sold out
            </span>
          )}
        </div>
        <h4 className="text-[11px] font-medium line-clamp-1 group-hover:text-accent transition-colors">
          {product.name}
        </h4>
      </Link>
      <div className="mt-1.5 flex items-center justify-between gap-1.5">
        <p className="font-display font-semibold text-xs tabular-nums leading-none">
          {format(priceOf(product))}
        </p>
        <button
          onClick={(e) => {
            e.preventDefault();
            if (product.inStock) add(product.slug);
          }}
          disabled={!product.inStock}
          aria-label={`Add ${product.name} to cart`}
          className="shrink-0 grid place-items-center size-7 rounded-full bg-accent text-accent-foreground transition-all hover:brightness-110 active:scale-90 shadow-[var(--shadow-ember)] disabled:opacity-40"
        >
          {inCart ? <Check className="size-3.5" /> : <Plus className="size-3.5" />}
        </button>
      </div>
    </div>
  );
}

function Rail({
  eyebrow,
  title,
  icon,
  products,
}: {
  eyebrow: string;
  title: string;
  icon: React.ReactNode;
  products: Product[];
}) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  function scroll(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    el.scrollBy({ left: el.clientWidth * 0.85 * dir, behavior: "smooth" });
  }

  if (products.length === 0) return null;

  return (
    <section className="mt-8">
      <div className="flex items-end justify-between gap-4 mb-4">
        <div>
          <div className="flex items-center gap-2 text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1.5">
            {icon}
            <span>{eyebrow}</span>
          </div>
          <h2 className="text-lg sm:text-2xl font-display tracking-tight">{title}</h2>
        </div>
        <div className="hidden sm:flex items-center gap-2">
          <button
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-2.5 sm:gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 scroll-smooth"
        style={{ scrollbarWidth: "none", scrollPaddingLeft: "1rem" }}
      >
        {products.map((p) => (
          <div
            key={p.slug}
            className="snap-start shrink-0 w-[38%] xs:w-[34%] sm:w-[24%] md:w-[18%] lg:w-[15%] last:mr-4 sm:last:mr-0"
          >
            <MiniCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}

/**
 * AI-style recommendation rails for the wishlist page.
 * Computes "Based On Wishlist", "You May Also Like" and "Recently Viewed"
 * from category affinity, price range and browsing history.
 * Each rail hides itself when it has no products.
 */
export function WishlistRecommendations({ wishlistSlugs }: { wishlistSlugs: string[] }) {
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const { slugs: recentSlugs } = useRecentlyViewed();

  const saved = useMemo(
    () => products.filter((p) => wishlistSlugs.includes(p.slug)),
    [products, wishlistSlugs],
  );

  // Affinity model from wishlist behaviour: category weight + price band.
  const model = useMemo(() => {
    const catWeight: Record<string, number> = {};
    let priceSum = 0;
    for (const p of saved) {
      catWeight[p.category] = (catWeight[p.category] ?? 0) + 1;
      priceSum += priceOf(p);
    }
    const avgPrice = saved.length ? priceSum / saved.length : 0;
    return { catWeight, avgPrice };
  }, [saved, priceOf]);

  const exclude = useMemo(() => new Set(wishlistSlugs), [wishlistSlugs]);

  // Based on wishlist — same categories, closest price, in stock first.
  const basedOn = useMemo(() => {
    if (saved.length === 0) return [];
    return products
      .filter((p) => !exclude.has(p.slug) && model.catWeight[p.category])
      .map((p) => {
        const catScore = (model.catWeight[p.category] ?? 0) * 3;
        const priceGap = Math.abs(priceOf(p) - model.avgPrice);
        const priceScore = model.avgPrice ? Math.max(0, 5 - priceGap / model.avgPrice) : 0;
        const stockScore = p.inStock ? 1 : 0;
        return { p, score: catScore + priceScore + stockScore + p.rating * 0.4 };
      })
      .sort((a, b) => b.score - a.score)
      .slice(0, 12)
      .map((x) => x.p);
  }, [products, saved.length, model, exclude, priceOf]);

  // You may also like — top rated / popular outside wishlist & not already shown.
  const youMayLike = useMemo(() => {
    const shown = new Set([...exclude, ...basedOn.map((p) => p.slug)]);
    return products
      .filter((p) => !shown.has(p.slug) && p.inStock)
      .sort(
        (a, b) =>
          b.rating * 2 + (b.soldCount ?? 0) / 50 - (a.rating * 2 + (a.soldCount ?? 0) / 50),
      )
      .slice(0, 12);
  }, [products, exclude, basedOn]);

  const recentlyViewed = useMemo(() => {
    const map = new Map(products.map((p) => [p.slug, p]));
    return recentSlugs
      .filter((s) => !exclude.has(s))
      .map((s) => map.get(s))
      .filter(Boolean)
      .slice(0, 12) as Product[];
  }, [products, recentSlugs, exclude]);

  if (
    basedOn.length === 0 &&
    youMayLike.length === 0 &&
    recentlyViewed.length === 0
  )
    return null;

  return (
    <div className="mt-12 pt-6 border-t border-border/60">
      <Rail
        eyebrow="Picked for you"
        title="Based On Your Wishlist"
        icon={<Heart className="size-3" />}
        products={basedOn}
      />
      <Rail
        eyebrow="Discover"
        title="You May Also Like"
        icon={<Sparkles className="size-3" />}
        products={youMayLike}
      />
      <Rail
        eyebrow="Continue browsing"
        title="Recently Viewed"
        icon={<History className="size-3" />}
        products={recentlyViewed}
      />
    </div>
  );
}
