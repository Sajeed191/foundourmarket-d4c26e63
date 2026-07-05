import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { fetchProducts, type Product } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";

/**
 * BINARY-ISOLATION HARNESS — Android Chrome scroll-corruption investigation.
 *
 * This is a deliberately STRIPPED clone of the Browse grid (the page that does
 * NOT reproduce the corruption). It keeps ONLY:
 *   - the route itself,
 *   - the same ProductCard component,
 *   - the same ProductImage (via ProductCard),
 *   - the same data source (fetchProducts → products_public view).
 *
 * Everything else is intentionally absent from THIS page's own render:
 *   - no VirtualizedProductGrid / TwoPhaseGrid (no observers, no rAF, no
 *     scroll-restore, no decode-gate, no window metrics),
 *   - no rails / recommendations / related products,
 *   - no page-level effects beyond the one data fetch,
 *   - no analytics, no page transitions, no dialogs/portals/overlays.
 *
 * NOTE: page-global chrome that lives in src/routes/__root.tsx (header, footer,
 * bottom nav, live chat, LayoutMetricsProvider, notifications) still wraps every
 * route and cannot be removed from a single leaf without refactoring __root.
 * Those are the FIRST features to add back in the isolation sequence (starting
 * with LayoutMetricsProvider) once this baseline is confirmed to render.
 *
 * Plain vertical CSS grid, normal document flow, no transforms — matches the
 * Browse grid layout classes exactly so the ONLY difference from Browse is the
 * removal of the surrounding runtime features.
 */
export const Route = createFileRoute("/runtime-isolation")({
  head: () => ({
    meta: [
      { title: "Runtime Isolation Harness" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: RuntimeIsolationPage,
});

function RuntimeIsolationPage() {
  const [products, setProducts] = useState<Product[]>([]);

  // The ONLY effect on this page: fetch the same data Browse uses, once.
  useEffect(() => {
    let active = true;
    fetchProducts(60).then((rows) => {
      if (active) setProducts(rows);
    });
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="mx-auto max-w-7xl px-4 py-8">
      <h1 className="mb-6 text-lg font-semibold text-white">Runtime Isolation ({products.length})</h1>
      <div data-product-grid className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
        {products.map((p) => (
          <div key={p.id ?? p.slug} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
            <ProductCard product={p} compact />
          </div>
        ))}
      </div>
    </div>
  );
}
