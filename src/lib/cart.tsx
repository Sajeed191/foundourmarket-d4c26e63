import { createContext, useContext, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Product, type CartVariant, fetchVariantsByIds } from "./products";
import { useProducts } from "./use-products";
import { useAuth } from "./auth";
import { useRegion } from "./region";
import { buildVisibleMap } from "./product-availability";
import { runWhenIdle } from "./idle";
import { resilientInsert, resilientUpdate } from "./infra/supabase-resilient";

// A cart line is identified by product slug AND variant id. `variantId` is null
// for products without variants (every product today) — in that case all logic
// below reduces to the original slug-only behavior for full backward compat.
type CartItem = { slug: string; qty: number; savedForLater?: boolean; variantId?: string | null };
type DetailedItem = CartItem & {
  product: Product;
  /** Current resolved variant (null for non-variant lines). */
  variant: CartVariant | null;
  /** Region unit price actually charged for this line. */
  unitPrice: number;
  /** True when a selected variant is inactive/unavailable or out of stock. */
  unavailable: boolean;
};
type RemovedItem = { slug: string; qty: number; at: number; variantId: string | null };

type Ctx = {
  items: CartItem[];
  add: (slug: string, qty?: number, variantId?: string | null) => Promise<void>;
  remove: (slug: string, variantId?: string | null) => Promise<void>;
  removeSaved: (slug: string, variantId?: string | null) => Promise<void>;
  setQty: (slug: string, qty: number, variantId?: string | null) => Promise<void>;
  /** Switch a line to a different variant of the same product (keeps qty). */
  switchVariant: (slug: string, fromVariantId: string | null, toVariantId: string) => Promise<void>;
  clear: () => Promise<void>;
  saveForLater: (slug: string, variantId?: string | null) => Promise<void>;
  moveToCart: (slug: string, variantId?: string | null) => Promise<void>;
  moveToWishlist: (slug: string, variantId?: string | null) => Promise<void>;
  undoRemove: () => Promise<void>;
  lastRemoved: RemovedItem | null;
  count: number;
  detailed: DetailedItem[];
  savedDetailed: DetailedItem[];
  subtotalUSD: number;
  loading: boolean;
  /** True once the cart has been loaded for the current auth state. */
  hydrated: boolean;
};

const CartContext = createContext<Ctx | null>(null);
const LS_KEY = "cart";

const nv = (v?: string | null) => v ?? null;
const lineKey = (slug: string, variantId?: string | null) => `${slug}::${variantId ?? ""}`;
const sameLine = (i: CartItem, slug: string, variantId?: string | null) =>
  i.slug === slug && nv(i.variantId) === nv(variantId);

// Reactive per-slug quantity (summed across variants) — powers on-card steppers.
const cartQtyListeners = new Set<() => void>();
let cartQtySnapshot = new Map<string, number>();
// Non-reactive per-line quantity — powers Buy Now idempotency per variant.
let lineQtySnapshot = new Map<string, number>();
let cartActionsSnapshot: Pick<Ctx, "add" | "setQty"> = {
  add: async () => {},
  setQty: async () => {},
};

function publishCartQty(items: DetailedItem[]) {
  const next = new Map<string, number>();
  const lines = new Map<string, number>();
  for (const item of items) {
    if (item.savedForLater) continue;
    next.set(item.slug, (next.get(item.slug) ?? 0) + item.qty);
    lines.set(lineKey(item.slug, item.variantId), item.qty);
  }
  lineQtySnapshot = lines;
  let changed = next.size !== cartQtySnapshot.size;
  if (!changed) {
    for (const [slug, qty] of next) {
      if (cartQtySnapshot.get(slug) !== qty) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  cartQtySnapshot = next;
  cartQtyListeners.forEach((listener) => listener());
}

function subscribeCartQty(listener: () => void) {
  cartQtyListeners.add(listener);
  return () => cartQtyListeners.delete(listener);
}

function readLS(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
    if (!Array.isArray(raw)) return [];
    // Tolerate the legacy shape (no variantId) — treat as a null-variant line.
    return raw.map((r: any) => ({
      slug: r.slug,
      qty: r.qty,
      savedForLater: !!r.savedForLater,
      variantId: r.variantId ?? null,
    }));
  } catch {
    return [];
  }
}
function writeLS(items: CartItem[]) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(items));
}

// Apply a variant filter to a supabase query builder (null => IS NULL).
function withVariant(q: any, variantId?: string | null): any {
  return variantId ? q.eq("variant_id", variantId) : q.is("variant_id", null);
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { products } = useProducts();
  const { priceOf, market } = useRegion();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadedFor, setLoadedFor] = useState<string | null | undefined>(undefined);
  const [lastRemoved, setLastRemoved] = useState<RemovedItem | null>(null);
  const [variantsById, setVariantsById] = useState<Record<string, CartVariant>>({});
  const mergedRef = useRef(false);

  // Load LS on first mount (guests)
  useEffect(() => {
    if (!user) {
      setItems(readLS());
      setCartId(null);
      mergedRef.current = false;
      setLoadedFor(null);
    }
  }, [user]);

  // When user signs in: ensure cart row, merge guest items, load server items
  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      const { data: existing } = await supabase
        .from("carts")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      let id = existing?.id as string | undefined;
      if (!id) {
        const { data: created } = await supabase
          .from("carts")
          .insert({ user_id: user.id })
          .select("id")
          .single();
        id = created?.id;
      }
      if (!id || cancelled) {
        setLoading(false);
        return;
      }
      setCartId(id);

      // Merge guest LS into server cart (one-time per session)
      if (!mergedRef.current) {
        mergedRef.current = true;
        const guest = readLS();
        if (guest.length) {
          for (const g of guest) {
            const { data: row } = await withVariant(
              supabase
                .from("cart_items")
                .select("id,quantity")
                .eq("cart_id", id)
                .eq("product_slug", g.slug),
              g.variantId,
            ).maybeSingle();
            if (row) {
              await supabase
                .from("cart_items")
                .update({ quantity: row.quantity + g.qty })
                .eq("id", row.id);
            } else {
              await supabase
                .from("cart_items")
                .insert({ cart_id: id, product_slug: g.slug, quantity: g.qty, variant_id: g.variantId ?? null });
            }
          }
          writeLS([]);
        }
      }

      const { data: rows } = await supabase
        .from("cart_items")
        .select("product_slug,quantity,saved_for_later,variant_id")
        .eq("cart_id", id);
      if (!cancelled) {
        setItems(
          (rows ?? []).map((r) => ({
            slug: r.product_slug,
            qty: r.quantity,
            savedForLater: !!r.saved_for_later,
            variantId: r.variant_id ?? null,
          })),
        );
        setLoading(false);
        setLoadedFor(user.id);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // Realtime sync: keep cart in sync across devices/tabs for logged-in users
  useEffect(() => {
    if (!user || !cartId) return;
    const channel = supabase
      .channel(`rt-cart-${cartId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "cart_items", filter: `cart_id=eq.${cartId}` },
        async () => {
          const { data: rows } = await supabase
            .from("cart_items")
            .select("product_slug,quantity,saved_for_later,variant_id")
            .eq("cart_id", cartId);
          setItems(
            (rows ?? []).map((r) => ({
              slug: r.product_slug,
              qty: r.quantity,
              savedForLater: !!r.saved_for_later,
              variantId: r.variant_id ?? null,
            })),
          );
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, cartId]);

  // Persist guests to LS
  useEffect(() => {
    if (!user) writeLS(items);
  }, [items, user]);

  // Resolve current variant details for every variant in the cart. Runs only
  // when the set of variant ids changes (not on qty changes) — zero cost for
  // carts without variants, one query otherwise.
  const variantIdsKey = useMemo(
    () => [...new Set(items.map((i) => i.variantId).filter(Boolean) as string[])].sort().join(","),
    [items],
  );
  useEffect(() => {
    const ids = variantIdsKey ? variantIdsKey.split(",") : [];
    if (ids.length === 0) {
      setVariantsById((prev) => (Object.keys(prev).length ? {} : prev));
      return;
    }
    let cancelled = false;
    fetchVariantsByIds(ids).then((map) => {
      if (!cancelled) setVariantsById(map);
    });
    return () => {
      cancelled = true;
    };
  }, [variantIdsKey]);

  const add = async (slug: string, qty = 1, variantId: string | null = null) => {
    const product = products.find((p) => p.slug === slug);
    // Non-critical analytics/personalization must not run before the optimistic
    // cart update paints — defer them to idle time so the tap feels instant (INP).
    runWhenIdle(() => {
      import("@/lib/checkout-logger").then((m) => m.logCheckout("add_to_cart", { slug, qty, variantId })).catch(() => {});
      import("@/lib/personalization").then((m) => m.recordEvent({ type: "add_to_cart", productSlug: slug })).catch(() => {});
      import("@/lib/visitor").then((m) => m.trackEvent("add_to_cart", { productSlug: slug, value: qty })).catch(() => {});
      import("@/lib/recommendations/performance").then((m) => m.attributeStage("add_to_cart")).catch(() => {});
      if (product) {
        import("@/lib/ga4").then((m) => m.ga4AddToCart({
          item_id: product.sku || product.slug,
          item_name: product.name,
          price: priceOf(product),
          quantity: qty,
          item_category: product.category ?? undefined,
          item_brand: product.brand ?? undefined,
        }, market === "india" ? "INR" : "USD")).catch(() => {});
      }
    });
    if (user && cartId) {
      const existing = items.find((i) => sameLine(i, slug, variantId) && !i.savedForLater);
      const newQty = (existing?.qty ?? 0) + qty;
      setItems((p) =>
        existing
          ? p.map((i) => (sameLine(i, slug, variantId) && !i.savedForLater ? { ...i, qty: newQty } : i))
          : [...p, { slug, qty, savedForLater: false, variantId }],
      );
      const { data: row } = await withVariant(
        supabase
          .from("cart_items")
          .select("id")
          .eq("cart_id", cartId)
          .eq("product_slug", slug)
          .eq("saved_for_later", false),
        variantId,
      ).maybeSingle();
      if (row) {
        await resilientUpdate("cart.update", "cart_items", { id: row.id }, { quantity: newQty });
      } else {
        await resilientInsert(
          "cart.add",
          "cart_items",
          { cart_id: cartId, product_slug: slug, quantity: qty, saved_for_later: false, variant_id: variantId },
          `cart.add:${cartId}:${slug}:${variantId ?? ""}`,
        );
      }
    } else {
      setItems((prev) => {
        const f = prev.find((i) => sameLine(i, slug, variantId) && !i.savedForLater);
        return f
          ? prev.map((i) => (sameLine(i, slug, variantId) && !i.savedForLater ? { ...i, qty: i.qty + qty } : i))
          : [...prev, { slug, qty, variantId }];
      });
    }
  };

  const remove = async (slug: string, variantId: string | null = null) => {
    const existing = items.find((i) => sameLine(i, slug, variantId) && !i.savedForLater);
    if (existing) setLastRemoved({ slug, qty: existing.qty, at: Date.now(), variantId });
    setItems((p) => p.filter((i) => !(sameLine(i, slug, variantId) && !i.savedForLater)));
    if (user && cartId) {
      await withVariant(
        supabase
          .from("cart_items")
          .delete()
          .eq("cart_id", cartId)
          .eq("product_slug", slug)
          .eq("saved_for_later", false),
        variantId,
      );
    }
  };

  const removeSaved = async (slug: string, variantId: string | null = null) => {
    setItems((p) => p.filter((i) => !(sameLine(i, slug, variantId) && i.savedForLater)));
    if (user && cartId) {
      await withVariant(
        supabase
          .from("cart_items")
          .delete()
          .eq("cart_id", cartId)
          .eq("product_slug", slug)
          .eq("saved_for_later", true),
        variantId,
      );
    }
  };

  const undoRemove = async () => {
    if (!lastRemoved) return;
    const { slug, qty, variantId } = lastRemoved;
    setLastRemoved(null);
    await add(slug, qty, variantId);
  };

  const moveToWishlist = async (slug: string, variantId: string | null = null) => {
    if (user) {
      const { data: existing } = await supabase
        .from("wishlist")
        .select("id")
        .eq("user_id", user.id)
        .eq("product_slug", slug)
        .maybeSingle();
      if (!existing) {
        await supabase.from("wishlist").insert({ user_id: user.id, product_slug: slug });
      }
    }
    await remove(slug, variantId);
  };

  const setQty = async (slug: string, qty: number, variantId: string | null = null) => {
    if (qty <= 0) return remove(slug, variantId);
    setItems((p) => p.map((i) => (sameLine(i, slug, variantId) && !i.savedForLater ? { ...i, qty } : i)));
    if (user && cartId) {
      await withVariant(
        supabase
          .from("cart_items")
          .update({ quantity: qty })
          .eq("cart_id", cartId)
          .eq("product_slug", slug)
          .eq("saved_for_later", false),
        variantId,
      );
    }
  };

  // Move a line to a different variant, merging into an existing line if the
  // target variant already sits in the cart.
  const switchVariant = async (slug: string, fromVariantId: string | null, toVariantId: string) => {
    if (nv(fromVariantId) === toVariantId) return;
    const src = items.find((i) => sameLine(i, slug, fromVariantId) && !i.savedForLater);
    if (!src) return;
    const qty = src.qty;
    await remove(slug, fromVariantId);
    await add(slug, qty, toVariantId);
  };

  const clear = async () => {
    setItems((p) => p.filter((i) => i.savedForLater));
    if (user && cartId) {
      await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("saved_for_later", false);
    } else {
      writeLS([]);
    }
  };

  const saveForLater = async (slug: string, variantId: string | null = null) => {
    setItems((p) => p.map((i) => (sameLine(i, slug, variantId) && !i.savedForLater ? { ...i, savedForLater: true } : i)));
    if (user && cartId) {
      await withVariant(
        supabase
          .from("cart_items")
          .update({ saved_for_later: true })
          .eq("cart_id", cartId)
          .eq("product_slug", slug)
          .eq("saved_for_later", false),
        variantId,
      );
    }
  };

  const moveToCart = async (slug: string, variantId: string | null = null) => {
    setItems((p) => p.map((i) => (sameLine(i, slug, variantId) && i.savedForLater ? { ...i, savedForLater: false } : i)));
    if (user && cartId) {
      await withVariant(
        supabase
          .from("cart_items")
          .update({ saved_for_later: false })
          .eq("cart_id", cartId)
          .eq("product_slug", slug)
          .eq("saved_for_later", true),
        variantId,
      );
    }
  };

  // Only currently-visible/active products contribute to the cart the user
  // sees, the totals and the badge count.
  const visibleMap = useMemo(() => buildVisibleMap(products, market), [products, market]);

  const toDetailed = (list: CartItem[]): DetailedItem[] =>
    list
      .map((i) => {
        const product = visibleMap.get(i.slug);
        if (!product) return null;
        const variant = i.variantId ? variantsById[i.variantId] ?? null : null;
        // A variant line is unavailable when the variant no longer resolves
        // (inactive / deleted) or has no stock. Non-variant lines are never
        // flagged here (product-level availability handled elsewhere).
        const unavailable = i.variantId ? !variant || variant.stockQuantity <= 0 : false;
        const unitPrice = variant?.priceOverride ?? priceOf(product);
        return { ...i, product, variant, unitPrice, unavailable } as DetailedItem;
      })
      .filter(Boolean) as DetailedItem[];

  const active = items.filter((i) => !i.savedForLater);
  const saved = items.filter((i) => i.savedForLater);
  const detailed = toDetailed(active);
  const savedDetailed = toDetailed(saved);

  const subtotalUSD = detailed.reduce((s, i) => s + i.unitPrice * i.qty, 0);
  const count = detailed.reduce((s, i) => s + i.qty, 0);
  const hydrated = loadedFor === (user?.id ?? null);

  useEffect(() => {
    publishCartQty(detailed);
  }, [detailed]);

  useEffect(() => {
    cartActionsSnapshot = { add, setQty };
  });

  return (
    <CartContext.Provider
      value={{
        items: active,
        add,
        remove,
        removeSaved,
        setQty,
        switchVariant,
        clear,
        saveForLater,
        moveToCart,
        moveToWishlist,
        undoRemove,
        lastRemoved,
        count,
        detailed,
        savedDetailed,
        subtotalUSD,
        loading,
        hydrated,
      }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}

export function useCartQty(slug: string) {
  return useSyncExternalStore(
    subscribeCartQty,
    () => cartQtySnapshot.get(slug) ?? 0,
    () => 0,
  );
}

/**
 * Non-reactive read of the current persisted cart quantity for a slug (summed
 * across variants). Used by the centralized Buy Now handler.
 */
export function readCartQty(slug: string): number {
  return cartQtySnapshot.get(slug) ?? 0;
}

/** Non-reactive per-line quantity (slug + variant). */
export function readLineQty(slug: string, variantId?: string | null): number {
  return lineQtySnapshot.get(lineKey(slug, variantId)) ?? 0;
}

export function useCartActions() {
  return useMemo(
    () => ({
      add: (slug: string, qty?: number, variantId?: string | null) => cartActionsSnapshot.add(slug, qty, variantId),
      setQty: (slug: string, qty: number, variantId?: string | null) => cartActionsSnapshot.setQty(slug, qty, variantId),
    }),
    [],
  );
}
