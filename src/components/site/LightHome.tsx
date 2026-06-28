import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, Package } from "lucide-react";
import type { Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";
import { useFlashDeals } from "@/lib/use-flash-deals";
import { TrustBadgesStrip } from "@/components/site/TrustBadgesStrip";

/**
 * LightHome — the lightweight fallback homepage rendered on constrained
 * devices (low-end / Android GPU Safe Mode / Ultra Low-End / render=safe /
 * reduced-motion / save-data / ≤4GB RAM / ≤4 cores).
 *
 * Deliberately uses ONLY simple HTML + CSS:
 *   - no Framer Motion, no Reveal animations, no HeroCarousel
 *   - no transforms / translate / scale / rotate, no will-change
 *   - no backdrop-filter, no blur(), no heavy shadows / gradients
 *   - no virtualization, no canvas / WebGL, no content-visibility / contain:paint
 *   - eager, synchronously-decoded <img> (src only)
 *
 * Business logic (search, navigation, cart/wishlist via ProductCard, product
 * loading) is identical to the premium homepage — only the presentation is
 * simplified. Data is passed in as props from the route so nothing is fetched
 * twice.
 */
export interface LightHomeCategory {
  id: string;
  slug: string;
  name: string;
  image?: string | null;
  mobile_image?: string | null;
}

export function LightHome({
  categories,
  categoryCounts,
  trending,
  newArrivals,
  bestSellers,
  productsLoading,
}: {
  categories: LightHomeCategory[];
  categoryCounts: Record<string, number>;
  trending: Product[];
  newArrivals: Product[];
  bestSellers: Product[];
  productsLoading: boolean;
}) {
  const nav = useNavigate();
  const [query, setQuery] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    nav({ to: "/search", search: { q: query } });
  };

  return (
    <main className="bg-background text-foreground">
      {/* Hero — static heading + simple search */}
      <section className="px-4 pt-6 pb-5 max-w-3xl mx-auto text-center">
        <h1 className="text-2xl font-display tracking-tight">
          FoundOurMarket™
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Everything You Need — All in One Place 🌍
        </p>

        <form onSubmit={submit} className="mt-4 flex items-stretch gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-5 text-muted-foreground" />
            <input
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search products..."
              aria-label="Search products"
              className="w-full h-12 rounded-xl border border-border bg-card pl-10 pr-3 text-base outline-none focus:border-accent"
            />
          </div>
          <button
            type="submit"
            className="h-12 px-5 rounded-xl bg-accent text-accent-foreground text-sm font-semibold active:opacity-80"
          >
            Search
          </button>
        </form>
      </section>

      <TrustBadgesStrip />

      {/* Categories — plain tiles */}
      {categories.length > 0 && (
        <section id="categories" className="px-4 py-6 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-lg font-display tracking-tight">Categories</h2>
            <Link to="/categories" className="text-xs font-semibold text-accent">
              View all
            </Link>
          </div>
          <div className="grid grid-cols-3 sm:grid-cols-4 lg:grid-cols-6 gap-3">
            {categories.map((cat) => {
              const img = cat.mobile_image || cat.image || "";
              return (
                <Link
                  key={cat.slug}
                  to="/category/$slug"
                  params={{ slug: cat.slug }}
                  className="flex flex-col items-center gap-2 rounded-xl border border-border bg-card p-2 text-center active:opacity-80"
                >
                  <div className="w-full aspect-square overflow-hidden rounded-lg border border-border bg-muted grid place-items-center">
                    {img ? (
                      <img
                        src={img}
                        alt={cat.name}
                        loading="eager"
                        decoding="sync"
                        className="size-full object-cover"
                      />
                    ) : (
                      <Package className="size-6 text-accent" />
                    )}
                  </div>
                  <span className="text-xs font-medium leading-tight line-clamp-1 w-full">
                    {cat.name}
                  </span>
                </Link>
              );
            })}
          </div>
        </section>
      )}

      <LightFlashDeals />

      <LightProductGrid title="Trending" products={trending} viewAllTo="/products/trending" loading={productsLoading} />
      <LightProductGrid title="New Arrivals" products={newArrivals} viewAllTo="/products/new-arrivals" loading={productsLoading} />
      <LightProductGrid title="Best Sellers" products={bestSellers} viewAllTo="/products/best-sellers" loading={productsLoading} />
    </main>
  );
}

function LightFlashDeals() {
  const { items, loading } = useFlashDeals();
  if (loading || items.length === 0) return null;
  const products = items.slice(0, 6).map((i) => i.product);
  return <LightProductGrid title="Flash Deals" products={products} viewAllTo="/offers" loading={false} />;
}

function LightProductGrid({
  title,
  products,
  viewAllTo,
  loading,
}: {
  title: string;
  products: Product[];
  viewAllTo: string;
  loading: boolean;
}) {
  if (!loading && products.length === 0) return null;
  return (
    <section className="px-4 py-5 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-lg font-display tracking-tight">{title}</h2>
        <Link to={viewAllTo} className="text-xs font-semibold text-accent">
          View all
        </Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {products.slice(0, 8).map((p) => (
          <ProductCard key={p.id ?? p.slug} product={p} compact />
        ))}
      </div>
    </section>
  );
}
