import { Link } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useRotationNonce } from "@/lib/use-rotation-nonce";
import { fairPagedSlice } from "@/lib/fair-rotation";
import {
  useHomepageCollectionRules,
  type HomepageCollectionKey,
} from "@/lib/site-rules";
import { productInHomepageCollection, useBadgeCatalog } from "@/lib/use-product-badges";
import { ProductCard } from "@/components/site/ProductCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import type { BadgeKey } from "@/lib/badges";
import type { Product } from "@/lib/products";

export type CollectionSort = "trending" | "newest" | "best_sellers";

/** Which stored badge keys make a product eligible for a given rail. */
const BADGE_MAP: Record<HomepageCollectionKey, BadgeKey[]> = {
  flash_deals: ["flash_deal", "hot_deal"],
  trending: ["trending"],
  best_sellers: ["bestseller"],
  new_arrivals: ["new"],
  featured: [],
};

/**
 * Full collection page for a homepage rail's "View All" destination. Reads the
 * admin-editable display limit + rotation interval from Site Rules and slices
 * the eligible product queue via the fair-rotation engine so every product
 * gets exposure before repeats.
 */
export function ProductCollection({
  eyebrow,
  title,
  description,
  icon: Icon,
  sort,
  filterFlag,
  collectionKey,
  forceBadge,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: LucideIcon;
  sort: CollectionSort;
  /**
   * @deprecated Legacy flag-based filter — retained only for backward compatibility.
   * New callers must use `collectionKey` so eligibility flows through Site Rules +
   * live badge assignments. Slated for removal after all rails migrate.
   */
  filterFlag?: "trending" | "bestseller" | "flashDeal" | "featured";
  /** Site-Rules collection key — drives eligibility (via badge assignments) + limit. */
  collectionKey?: HomepageCollectionKey;
  /**
   * When set, each card shows ONLY this section's badge (e.g. Trending page →
   * Trending badge only), hiding any other badges the product qualifies for.
   */
  forceBadge?: BadgeKey | null;
}) {
  const { products, loading } = useProducts();
  const { map: badgeAssignments } = useBadgeCatalog();
  const rules = useHomepageCollectionRules();
  const rotationNonce = useRotationNonce();
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const items = useMemo(() => {
    let eligible: Product[];
    if (collectionKey) {
      const badgeKeys = BADGE_MAP[collectionKey];
      eligible = products.filter((p) =>
        productInHomepageCollection(p.slug, badgeAssignments.get(p.slug), badgeKeys),
      );
    } else if (filterFlag) {
      eligible = products.filter((p) => Boolean(p[filterFlag]));
    } else {
      eligible = products.slice();
    }
    if (sort === "newest") {
      eligible = [...eligible].sort((a, b) => (b.createdAt ?? "").localeCompare(a.createdAt ?? ""));
    }
    const limit = collectionKey ? rules.limits[collectionKey] : eligible.length;
    const sliced = fairPagedSlice(
      eligible,
      limit,
      nowMs,
      rules.rotationHours,
      rotationNonce,
      collectionKey ?? filterFlag ?? "collection",
    );
    if (import.meta.env.DEV && typeof window !== "undefined") {
      const visible = sliced.length;
      const hiddenByLimit = Math.max(0, eligible.length - limit);
      const hiddenByRotation = Math.max(0, eligible.length - visible - hiddenByLimit);
      // eslint-disable-next-line no-console
      console.info(
        `[Collection · ${collectionKey ?? filterFlag ?? "collection"}] eligible=${eligible.length} | visible=${visible} | hiddenByRotation=${hiddenByRotation} | hiddenByLimit=${hiddenByLimit} | limit=${limit}`,
      );
      if (eligible.length <= limit && visible !== eligible.length) {
        // eslint-disable-next-line no-console
        console.warn(
          `[Collection · ${collectionKey ?? "collection"}] expected all ${eligible.length} eligible products visible, got ${visible}`,
        );
      }
    }
    return sliced;
  }, [products, badgeAssignments, filterFlag, collectionKey, sort, rules, rotationNonce, nowMs]);


  const getProductKey = useCallback((p: Product) => p.id ?? p.slug, []);
  const renderProduct = useCallback(
    (p: Product, i: number) => <ProductCard product={p} compact forceBadge={forceBadge} priority={i < 4} />,
    [forceBadge],
  );

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 mobile-page-clearance md:pb-16">
      <Link
        to="/"
        className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground mb-5"
      >
        <ArrowLeft className="size-3.5" /> Back to home
      </Link>

      {/* Banner */}
      <header data-product-card-frame className="relative mb-8 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div
          aria-hidden
          className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2 flex items-center gap-2">
            <Icon className="size-3" /> {eyebrow}
          </p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight">{title}</h1>
          <p className="text-muted-foreground mt-2 text-sm max-w-lg">{description}</p>
        </div>
      </header>

      {loading ? (
        <div className="py-24 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-muted-foreground" />
        </div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products available yet. Check back soon.</p>
        </div>
      ) : (
        <VirtualizedProductGrid
          items={items}
          cols={{ base: 2, sm: 3, lg: 4 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
          getKey={getProductKey}
          getImageSrc={(p) => p.image}
          renderItem={renderProduct}
        />
      )}
    </div>
  );
}
