import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Product } from "./products";
import { useProducts } from "./use-products";
import { useAuth } from "./auth";
import { useRegion } from "./region";

type CartItem = { slug: string; qty: number; savedForLater?: boolean };
type DetailedItem = CartItem & { product: Product };
type RemovedItem = { slug: string; qty: number; at: number };

type Ctx = {
  items: CartItem[];
  add: (slug: string, qty?: number) => Promise<void>;
  remove: (slug: string) => Promise<void>;
  setQty: (slug: string, qty: number) => Promise<void>;
  clear: () => Promise<void>;
  saveForLater: (slug: string) => Promise<void>;
  moveToCart: (slug: string) => Promise<void>;
  moveToWishlist: (slug: string) => Promise<void>;
  undoRemove: () => Promise<void>;
  lastRemoved: RemovedItem | null;
  count: number;
  detailed: DetailedItem[];
  savedDetailed: DetailedItem[];
  subtotalUSD: number;
  loading: boolean;
};

const CartContext = createContext<Ctx | null>(null);
const LS_KEY = "cart";

function readLS(): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function writeLS(items: CartItem[]) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { products } = useProducts();
  const { priceOf } = useRegion();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [lastRemoved, setLastRemoved] = useState<RemovedItem | null>(null);
  const mergedRef = useRef(false);

  // Load LS on first mount (guests)
  useEffect(() => {
    if (!user) {
      setItems(readLS());
      setCartId(null);
      mergedRef.current = false;
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
            const { data: row } = await supabase
              .from("cart_items")
              .select("id,quantity")
              .eq("cart_id", id)
              .eq("product_slug", g.slug)
              .is("variant_id", null)
              .maybeSingle();
            if (row) {
              await supabase
                .from("cart_items")
                .update({ quantity: row.quantity + g.qty })
                .eq("id", row.id);
            } else {
              await supabase
                .from("cart_items")
                .insert({ cart_id: id, product_slug: g.slug, quantity: g.qty });
            }
          }
          writeLS([]);
        }
      }

      const { data: rows } = await supabase
        .from("cart_items")
        .select("product_slug,quantity,saved_for_later")
        .eq("cart_id", id);
      if (!cancelled) {
        setItems(
          (rows ?? []).map((r) => ({
            slug: r.product_slug,
            qty: r.quantity,
            savedForLater: !!r.saved_for_later,
          })),
        );
        setLoading(false);
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
            .select("product_slug,quantity,saved_for_later")
            .eq("cart_id", cartId);
          setItems(
            (rows ?? []).map((r) => ({
              slug: r.product_slug,
              qty: r.quantity,
              savedForLater: !!r.saved_for_later,
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

  const add = async (slug: string, qty = 1) => {
    import("@/lib/personalization").then((m) => m.recordEvent({ type: "add_to_cart", productSlug: slug })).catch(() => {});
    if (user && cartId) {
      const existing = items.find((i) => i.slug === slug && !i.savedForLater);
      const newQty = (existing?.qty ?? 0) + qty;
      setItems((p) =>
        existing
          ? p.map((i) => (i.slug === slug && !i.savedForLater ? { ...i, qty: newQty } : i))
          : [...p, { slug, qty, savedForLater: false }],
      );
      const { data: row } = await supabase
        .from("cart_items")
        .select("id")
        .eq("cart_id", cartId)
        .eq("product_slug", slug)
        .eq("saved_for_later", false)
        .is("variant_id", null)
        .maybeSingle();
      if (row) await supabase.from("cart_items").update({ quantity: newQty }).eq("id", row.id);
      else
        await supabase
          .from("cart_items")
          .insert({ cart_id: cartId, product_slug: slug, quantity: qty, saved_for_later: false });
    } else {
      setItems((prev) => {
        const f = prev.find((i) => i.slug === slug);
        return f
          ? prev.map((i) => (i.slug === slug ? { ...i, qty: i.qty + qty } : i))
          : [...prev, { slug, qty }];
      });
    }
  };

  const remove = async (slug: string) => {
    const existing = items.find((i) => i.slug === slug && !i.savedForLater);
    if (existing) setLastRemoved({ slug, qty: existing.qty, at: Date.now() });
    setItems((p) => p.filter((i) => !(i.slug === slug && !i.savedForLater)));
    if (user && cartId) {
      await supabase
        .from("cart_items")
        .delete()
        .eq("cart_id", cartId)
        .eq("product_slug", slug)
        .eq("saved_for_later", false);
    }
  };

  const undoRemove = async () => {
    if (!lastRemoved) return;
    const { slug, qty } = lastRemoved;
    setLastRemoved(null);
    await add(slug, qty);
  };

  const moveToWishlist = async (slug: string) => {
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
    await remove(slug);
  };


  const setQty = async (slug: string, qty: number) => {
    if (qty <= 0) return remove(slug);
    setItems((p) => p.map((i) => (i.slug === slug && !i.savedForLater ? { ...i, qty } : i)));
    if (user && cartId) {
      await supabase
        .from("cart_items")
        .update({ quantity: qty })
        .eq("cart_id", cartId)
        .eq("product_slug", slug)
        .eq("saved_for_later", false);
    }
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

  const saveForLater = async (slug: string) => {
    setItems((p) => p.map((i) => (i.slug === slug && !i.savedForLater ? { ...i, savedForLater: true } : i)));
    if (user && cartId) {
      await supabase
        .from("cart_items")
        .update({ saved_for_later: true })
        .eq("cart_id", cartId)
        .eq("product_slug", slug)
        .eq("saved_for_later", false);
    }
  };

  const moveToCart = async (slug: string) => {
    setItems((p) => p.map((i) => (i.slug === slug && i.savedForLater ? { ...i, savedForLater: false } : i)));
    if (user && cartId) {
      await supabase
        .from("cart_items")
        .update({ saved_for_later: false })
        .eq("cart_id", cartId)
        .eq("product_slug", slug)
        .eq("saved_for_later", true);
    }
  };

  const toDetailed = (list: CartItem[]): DetailedItem[] =>
    list
      .map((i) => {
        const product = products.find((p) => p.slug === i.slug);
        return product ? { ...i, product } : null;
      })
      .filter(Boolean) as DetailedItem[];

  const active = items.filter((i) => !i.savedForLater);
  const saved = items.filter((i) => i.savedForLater);
  const detailed = toDetailed(active);
  const savedDetailed = toDetailed(saved);

  const subtotalUSD = detailed.reduce((s, i) => s + i.product.price * i.qty, 0);
  const count = active.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider
      value={{
        items: active,
        add,
        remove,
        setQty,
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
