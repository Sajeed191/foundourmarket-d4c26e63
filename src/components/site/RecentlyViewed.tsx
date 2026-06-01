import { useRef, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, X, Plus, Check } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import type { Product } from "@/lib/products";

type Props = {
  /** Optional slug to exclude (e.g. current product on product page). */
  excludeSlug?: string;
  /** Heading text. */
  title?: string;
  /** Eyebrow label above heading. */
  eyebrow?: string;
  /** Subtitle beneath the heading. */
  subtitle?: string;
  /** Target number of items shown. */
  limit?: number;
};

/** Minimal recently-viewed card — image, name, price and add button only. */
function MiniCard({ product }: { product: Product }) {
  const { format, priceOf } = useRegion();
  const { add, items } = useCart();
  const [justAdded, setJustAdded] = useState(false);
  const inCart = items.some((i) => i.slug === product.slug);

  return (
    <div className="group card-premium overflow-hidden p-2.5 flex flex-col">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
        <div className="relative aspect-square rounded-xl overflow-hidden bg-black/40 mb-2.5">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            className="w-full h-full object-cover transition-transform duration-500 group-hover:scale-[1.04]"
          />
        </div>
        <h4 className="text-xs sm:text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">{product.name}</h4>
      </Link>
      <div className="mt-2 flex items-center justify-between gap-2">
        <p className="font-display font-semibold text-sm tabular-nums leading-none">{format(priceOf(product))}</p>
        <button
          onClick={(e) => {
            e.preventDefault();
            add(product.slug);
            setJustAdded(true);
            window.setTimeout(() => setJustAdded(false), 900);
          }}
          aria-label={`Add ${product.name} to cart`}
          className={`shrink-0 grid place-items-center size-8 rounded-full bg-accent text-accent-foreground transition-all hover:brightness-110 active:scale-90 shadow-[var(--shadow-ember)] ${justAdded ? "animate-[save-pulse_0.6s_ease-out]" : ""}`}
        >
          {justAdded || inCart ? <Check className="size-4" /> : <Plus className="size-4" />}
        </button>
      </div>
    </div>
  );
}

export function RecentlyViewed({
  excludeSlug,
  title = "Recently Viewed",
  eyebrow = "Continue Browsing",
  subtitle = "Continue where you left off",
  limit = 10,
}: Props) {
  const { products, loading } = useProducts();
  const { slugs, clear } = useRecentlyViewed();
  const scrollerRef = useRef<HTMLDivElement>(null);

  const items = useMemo(() => {
    const active = excludeSlug ? slugs.filter((s) => s !== excludeSlug) : slugs;
    const map = new Map(products.map((p) => [p.slug, p]));
    return active.map((s) => map.get(s)).filter(Boolean).slice(0, limit) as Product[];
  }, [products, slugs, excludeSlug, limit]);

  function scroll(dir: -1 | 1) {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = el.clientWidth * 0.85;
    el.scrollBy({ left: amount * dir, behavior: "smooth" });
  }

  if (loading || items.length === 0) return null;

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-10">
      <div className="flex items-end justify-between gap-4 mb-5">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">{eyebrow}</p>
          <h2 className="text-xl sm:text-2xl font-display tracking-tight">{title}</h2>
          <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={clear}
            aria-label="Clear history"
            className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
          >
            <X className="size-3" /> Clear
          </button>
          <button
            onClick={() => scroll(-1)}
            aria-label="Scroll left"
            className="hidden sm:grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            onClick={() => scroll(1)}
            aria-label="Scroll right"
            className="hidden sm:grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="flex gap-2.5 sm:gap-3 overflow-x-auto snap-x snap-mandatory scrollbar-hide -mx-4 sm:mx-0 px-4 sm:px-0 pb-2 scroll-smooth"
        style={{ scrollbarWidth: "none", scrollPaddingLeft: "1rem", scrollPaddingRight: "1rem" }}
      >
        {items.map((p) => (
          <div
            key={p.slug}
            className="snap-start shrink-0 w-[44%] xs:w-[40%] sm:w-[28%] md:w-[22%] lg:w-[18%] last:mr-4 sm:last:mr-0"
          >
            <MiniCard product={p} />
          </div>
        ))}
      </div>
    </section>
  );
}
