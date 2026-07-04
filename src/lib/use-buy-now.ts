import { useCallback, useRef } from "react";
import { useNavigate } from "@tanstack/react-router";
import type { Product } from "./products";
import { useCartActions, readCartQty } from "./cart";

/**
 * The single, centralized Buy Now implementation for the entire app.
 *
 * Every Buy Now entry point (product cards, quick view, wishlist, recently
 * viewed, product details) MUST use this hook — there is intentionally no
 * other Buy Now handler in the codebase.
 *
 * Semantics (idempotent, quantity-exact):
 *  - Purchases EXACTLY the requested `qty` (default 1).
 *  - SETS the cart line to that qty when the product is already in the cart,
 *    otherwise ADDS it. It never accumulates a stale persisted quantity, so
 *    repeated clicks, Back navigation, and refresh can never inflate the count.
 *  - A short per-instance ref lock (700ms) swallows rapid double-taps so a
 *    single burst of taps cannot fire duplicate writes/checkout navigations.
 *  - Routes to /cart after the write settles (unless `navigate: false`, which
 *    lets a wrapping <Link> own the navigation instead).
 *
 * This is purely presentation/flow logic: Add to Cart still accumulates, and
 * analytics, inventory validation, coupons, taxes, shipping, and checkout are
 * untouched — they run on the /cart and checkout screens exactly as before.
 */
export type BuyNowOptions = {
  /** Exact quantity to purchase. Defaults to 1. */
  qty?: number;
  /** Force-disable (e.g. richer out-of-stock logic on the product page). */
  disabled?: boolean;
  /** When false, skip internal routing (a wrapping <Link> handles it). */
  navigate?: boolean;
};

export function useBuyNow() {
  const { add, setQty } = useCartActions();
  const navigate = useNavigate();
  const lock = useRef(false);

  return useCallback(
    (product: Product, options: BuyNowOptions = {}) => {
      const { qty = 1, disabled = false, navigate: doNavigate = true } = options;
      if (disabled || !product.inStock || lock.current) return;
      lock.current = true;
      window.setTimeout(() => {
        lock.current = false;
      }, 700);
      const inCart = readCartQty(product.slug) > 0;
      const promise = inCart ? setQty(product.slug, qty) : add(product.slug, qty);
      void Promise.resolve(promise).finally(() => {
        if (doNavigate) void navigate({ to: "/cart" });
      });
    },
    [add, setQty, navigate],
  );
}
