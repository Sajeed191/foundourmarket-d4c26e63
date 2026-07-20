// Shopping Context Engine — v1.3 Step 1
// A lightweight, event-driven store that lets pages publish the customer's
// current shopping context (page, product, category, search, cart, wishlist,
// order metadata). The AI Shopping Assistant reads this snapshot when the user
// sends a message so it already knows "where" the customer is — no extra
// backend calls, no polling, no DOM inspection.
//
// STRICT PRIVACY: only shopping-relevant fields. Never publish emails, phones,
// addresses, payment details, passwords, OTPs, or personal identifiers.

import { useEffect } from "react";

export type ShoppingPage =
  | "home"
  | "product"
  | "category"
  | "search"
  | "cart"
  | "wishlist"
  | "orders"
  | "order"
  | "other";

export type ShoppingProductContext = {
  slug: string;
  name: string;
  price_inr?: number | null;
  compare_price_inr?: number | null;
  category?: string | null;
  brand?: string | null;
  in_stock?: boolean;
  variant?: string | null;
  badge?: string | null;
  rating?: number | null;
  reviews?: number | null;
  key_specs?: string[]; // short bullet strings, already trimmed
};

export type ShoppingListItem = {
  slug: string;
  name: string;
  price_inr?: number | null;
  category?: string | null;
};

export type ShoppingCartItem = ShoppingListItem & {
  quantity: number;
  variant?: string | null;
};

export type ShoppingOrderMeta = {
  order_id: string;
  status?: string | null;
  shipment_status?: string | null;
  placed_at?: string | null;
};

export type ShoppingContext = {
  page: ShoppingPage;
  route?: string | null;
  updated_at: number;

  // page-scoped payloads (all optional)
  home?: {
    visible_collections?: string[]; // e.g. ["flash-deals","trending","new-arrivals"]
    featured_slugs?: string[];
  };
  product?: ShoppingProductContext;
  category?: {
    slug: string;
    name?: string | null;
    filters?: Record<string, string | number | boolean | string[]>;
    sort?: string | null;
    visible?: ShoppingListItem[];
  };
  search?: {
    query: string;
    filters?: Record<string, string | number | boolean | string[]>;
    sort?: string | null;
    visible?: ShoppingListItem[];
  };
  cart?: {
    item_count: number;
    subtotal_inr?: number | null;
    items?: ShoppingCartItem[];
    categories?: string[];
  };
  wishlist?: {
    item_count: number;
    items?: ShoppingListItem[];
    categories?: string[];
    min_price_inr?: number | null;
    max_price_inr?: number | null;
  };
  order?: ShoppingOrderMeta; // when viewing a single order
  orders?: { count: number; latest?: ShoppingOrderMeta[] }; // orders list
};

const DEFAULT: ShoppingContext = { page: "other", updated_at: 0 };

let current: ShoppingContext = DEFAULT;
const subs = new Set<(ctx: ShoppingContext) => void>();

/** Read the current snapshot. Cheap; no allocation beyond return. */
export function getShoppingContext(): ShoppingContext {
  return current;
}

/** Overwrite the entire context (page + payload). Old context is cleared. */
export function publishShoppingContext(next: Omit<ShoppingContext, "updated_at">): void {
  current = { ...next, updated_at: Date.now() };
  for (const s of subs) {
    try { s(current); } catch { /* ignore subscriber errors */ }
  }
}

/** Clear back to neutral. Call on unmount when no other page will publish. */
export function clearShoppingContext(): void {
  current = { ...DEFAULT, updated_at: Date.now() };
  for (const s of subs) {
    try { s(current); } catch { /* ignore */ }
  }
}

export function subscribeShoppingContext(cb: (ctx: ShoppingContext) => void): () => void {
  subs.add(cb);
  return () => { subs.delete(cb); };
}

/**
 * React helper: publish context on mount / when `deps` change, clear on unmount.
 * Pages call this ONCE with a memoized value. Never call it in a render loop.
 */
export function usePublishShoppingContext(
  build: () => Omit<ShoppingContext, "updated_at"> | null,
  deps: React.DependencyList,
): void {
  useEffect(() => {
    const next = build();
    if (!next) return;
    publishShoppingContext(next);
    return () => {
      // Only clear if this publisher is still the active one for its page —
      // avoid wiping the next page's context if it published during unmount.
      if (current.page === next.page) clearShoppingContext();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

/**
 * Build a compact, privacy-safe summary string the AI can consume in a
 * system-style message. Keeps the payload small (well under 1KB in normal use).
 */
export function summarizeShoppingContext(ctx: ShoppingContext): string {
  const parts: string[] = [];
  parts.push(`page=${ctx.page}`);
  if (ctx.route) parts.push(`route=${ctx.route}`);

  if (ctx.product) {
    const p = ctx.product;
    parts.push(
      `product{slug=${p.slug}; name="${p.name}"` +
        (p.price_inr != null ? `; price_inr=${p.price_inr}` : "") +
        (p.compare_price_inr != null ? `; compare_price_inr=${p.compare_price_inr}` : "") +
        (p.category ? `; category=${p.category}` : "") +
        (p.brand ? `; brand=${p.brand}` : "") +
        (p.variant ? `; variant=${p.variant}` : "") +
        (typeof p.in_stock === "boolean" ? `; in_stock=${p.in_stock}` : "") +
        (p.badge ? `; badge=${p.badge}` : "") +
        (p.rating != null ? `; rating=${p.rating}` : "") +
        (p.reviews != null ? `; reviews=${p.reviews}` : "") +
        (p.key_specs?.length ? `; specs=${JSON.stringify(p.key_specs.slice(0, 6))}` : "") +
        "}",
    );
  }
  if (ctx.category) {
    const c = ctx.category;
    parts.push(
      `category{slug=${c.slug}` +
        (c.name ? `; name="${c.name}"` : "") +
        (c.sort ? `; sort=${c.sort}` : "") +
        (c.filters ? `; filters=${JSON.stringify(c.filters)}` : "") +
        (c.visible?.length ? `; visible=${JSON.stringify(c.visible.slice(0, 12))}` : "") +
        "}",
    );
  }
  if (ctx.search) {
    const s = ctx.search;
    parts.push(
      `search{query="${s.query}"` +
        (s.sort ? `; sort=${s.sort}` : "") +
        (s.filters ? `; filters=${JSON.stringify(s.filters)}` : "") +
        (s.visible?.length ? `; visible=${JSON.stringify(s.visible.slice(0, 12))}` : "") +
        "}",
    );
  }
  if (ctx.cart) {
    const c = ctx.cart;
    parts.push(
      `cart{items=${c.item_count}` +
        (c.subtotal_inr != null ? `; subtotal_inr=${c.subtotal_inr}` : "") +
        (c.categories?.length ? `; categories=${JSON.stringify(c.categories)}` : "") +
        (c.items?.length ? `; entries=${JSON.stringify(c.items.slice(0, 12))}` : "") +
        "}",
    );
  }
  if (ctx.wishlist) {
    const w = ctx.wishlist;
    parts.push(
      `wishlist{items=${w.item_count}` +
        (w.categories?.length ? `; categories=${JSON.stringify(w.categories)}` : "") +
        (w.min_price_inr != null ? `; min_price_inr=${w.min_price_inr}` : "") +
        (w.max_price_inr != null ? `; max_price_inr=${w.max_price_inr}` : "") +
        (w.items?.length ? `; entries=${JSON.stringify(w.items.slice(0, 12))}` : "") +
        "}",
    );
  }
  if (ctx.home) {
    parts.push(`home{${JSON.stringify(ctx.home)}}`);
  }
  if (ctx.order) {
    parts.push(`order{${JSON.stringify(ctx.order)}}`);
  }
  if (ctx.orders) {
    parts.push(`orders{count=${ctx.orders.count}}`);
  }
  return parts.join(" | ");
}
