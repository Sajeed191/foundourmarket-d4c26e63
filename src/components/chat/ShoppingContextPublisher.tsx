// Route-level shopping-context publisher. Mounted once in __root; reads the
// current route, cart and wishlist via existing providers, and publishes an
// ambient shopping context for pages that don't need to publish rich
// page-specific detail themselves (home, cart, wishlist, /deals, orders list,
// fallback). Detail-heavy pages (product, category, search, single order)
// publish their own richer context via usePublishShoppingContext and take
// precedence — this component detects those paths and stays silent.
import { useMemo } from "react";
import { useRouterState } from "@tanstack/react-router";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useProducts } from "@/lib/use-products";
import {
  usePublishShoppingContext,
  type ShoppingCartItem,
  type ShoppingListItem,
  type ShoppingPage,
} from "@/lib/ai-shopping/shopping-context";

// Paths owned by page-level publishers — the ambient publisher stays silent.
function isOwnedByPagePublisher(path: string): boolean {
  if (path.startsWith("/products/")) return true;
  if (path.startsWith("/category/")) return true;
  if (path.startsWith("/search")) return true;
  if (path.startsWith("/orders/")) return true;
  return false;
}

function classify(path: string): ShoppingPage {
  if (path === "/" || path === "") return "home";
  if (path === "/cart") return "cart";
  if (path === "/wishlist") return "wishlist";
  if (path === "/account/orders" || path === "/deals") {
    return path === "/deals" ? "home" : "orders";
  }
  return "other";
}

export function ShoppingContextPublisher() {
  const path = useRouterState({ select: (s) => s.location.pathname });
  const { detailed } = useCart();
  const { slugs: wishlistSlugs } = useWishlist();
  const { products } = useProducts();

  const owned = isOwnedByPagePublisher(path);
  const page = classify(path);

  // Precompute cart snapshot (privacy-safe — no addresses, no payment info).
  const cartSnapshot = useMemo(() => {
    if (page !== "cart") return undefined;
    const items: ShoppingCartItem[] = detailed
      .filter((d) => !d.savedForLater)
      .slice(0, 20)
      .map((d) => ({
        slug: d.slug,
        name: d.product?.name ?? d.slug,
        price_inr: d.product?.price_inr ?? null,
        category: d.product?.category ?? null,
        quantity: d.qty,
        variant: d.variant?.name ?? null,
      }));
    const categories = Array.from(
      new Set(items.map((i) => i.category).filter((c): c is string => !!c)),
    ).slice(0, 8);
    const subtotal_inr = items.reduce(
      (sum, i) => (i.price_inr ? sum + i.price_inr * i.quantity : sum),
      0,
    );
    return {
      item_count: items.reduce((n, i) => n + i.quantity, 0),
      subtotal_inr: subtotal_inr || null,
      items,
      categories,
    };
  }, [page, detailed]);

  const wishlistSnapshot = useMemo(() => {
    if (page !== "wishlist") return undefined;
    const bySlug = new Map(products.map((p) => [p.slug, p]));
    const items: ShoppingListItem[] = Array.from(wishlistSlugs).slice(0, 24).map((slug) => {
      const p = bySlug.get(slug);
      return {
        slug,
        name: p?.name ?? slug,
        price_inr: p?.price_inr ?? null,
        category: p?.category ?? null,
      };
    });
    const prices = items.map((i) => i.price_inr ?? 0).filter((n) => n > 0);
    const categories = Array.from(
      new Set(items.map((i) => i.category).filter((c): c is string => !!c)),
    ).slice(0, 8);
    return {
      item_count: items.length,
      items,
      categories,
      min_price_inr: prices.length ? Math.min(...prices) : null,
      max_price_inr: prices.length ? Math.max(...prices) : null,
    };
  }, [page, wishlistSlugs, products]);

  const homeSnapshot = useMemo(() => {
    if (page !== "home") return undefined;
    return {
      visible_collections: [
        "flash-deals",
        "trending",
        "best-sellers",
        "new-arrivals",
        "recommended",
        "featured",
      ],
    };
  }, [page]);

  usePublishShoppingContext(
    () => {
      if (owned) return null;
      return {
        page,
        route: path,
        home: homeSnapshot,
        cart: cartSnapshot,
        wishlist: wishlistSnapshot,
      };
    },
    [owned, page, path, homeSnapshot, cartSnapshot, wishlistSnapshot],
  );

  return null;
}

export default ShoppingContextPublisher;
