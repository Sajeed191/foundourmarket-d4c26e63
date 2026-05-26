import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { type Product } from "./products";
import { useProducts } from "./use-products";
import { useAuth } from "./auth";

type CartItem = { slug: string; qty: number };
type Ctx = {
  items: CartItem[];
  add: (slug: string, qty?: number) => Promise<void>;
  remove: (slug: string) => Promise<void>;
  setQty: (slug: string, qty: number) => Promise<void>;
  clear: () => Promise<void>;
  count: number;
  detailed: (CartItem & { product: Product })[];
  subtotalUSD: number;
  loading: boolean;
};

const CartContext = createContext<Ctx | null>(null);
const LS_KEY = "cart";

function readLS(): CartItem[] {
  if (typeof window === "undefined") return [];
  try { return JSON.parse(localStorage.getItem(LS_KEY) ?? "[]"); } catch { return []; }
}
function writeLS(items: CartItem[]) {
  if (typeof window !== "undefined") localStorage.setItem(LS_KEY, JSON.stringify(items));
}

export function CartProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const { products } = useProducts();
  const [items, setItems] = useState<CartItem[]>([]);
  const [cartId, setCartId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
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
      // upsert cart row
      const { data: existing } = await supabase
        .from("carts").select("id").eq("user_id", user.id).maybeSingle();
      let id = existing?.id as string | undefined;
      if (!id) {
        const { data: created } = await supabase
          .from("carts").insert({ user_id: user.id }).select("id").single();
        id = created?.id;
      }
      if (!id || cancelled) { setLoading(false); return; }
      setCartId(id);

      // Merge guest LS into server cart (one-time per session)
      if (!mergedRef.current) {
        mergedRef.current = true;
        const guest = readLS();
        if (guest.length) {
          for (const g of guest) {
            const { data: row } = await supabase
              .from("cart_items").select("id,quantity")
              .eq("cart_id", id).eq("product_slug", g.slug).is("variant_id", null)
              .maybeSingle();
            if (row) {
              await supabase.from("cart_items").update({ quantity: row.quantity + g.qty }).eq("id", row.id);
            } else {
              await supabase.from("cart_items").insert({ cart_id: id, product_slug: g.slug, quantity: g.qty });
            }
          }
          writeLS([]);
        }
      }

      // Load server items
      const { data: rows } = await supabase
        .from("cart_items").select("product_slug,quantity").eq("cart_id", id);
      if (!cancelled) {
        setItems((rows ?? []).map((r) => ({ slug: r.product_slug, qty: r.quantity })));
        setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [user]);

  // Persist guests to LS
  useEffect(() => {
    if (!user) writeLS(items);
  }, [items, user]);

  const add = async (slug: string, qty = 1) => {
    if (user && cartId) {
      const existing = items.find((i) => i.slug === slug);
      const newQty = (existing?.qty ?? 0) + qty;
      setItems((p) => existing ? p.map((i) => i.slug === slug ? { ...i, qty: newQty } : i) : [...p, { slug, qty }]);
      const { data: row } = await supabase
        .from("cart_items").select("id").eq("cart_id", cartId)
        .eq("product_slug", slug).is("variant_id", null).maybeSingle();
      if (row) await supabase.from("cart_items").update({ quantity: newQty }).eq("id", row.id);
      else await supabase.from("cart_items").insert({ cart_id: cartId, product_slug: slug, quantity: qty });
    } else {
      setItems((prev) => {
        const f = prev.find((i) => i.slug === slug);
        return f ? prev.map((i) => i.slug === slug ? { ...i, qty: i.qty + qty } : i) : [...prev, { slug, qty }];
      });
    }
  };

  const remove = async (slug: string) => {
    setItems((p) => p.filter((i) => i.slug !== slug));
    if (user && cartId) {
      await supabase.from("cart_items").delete().eq("cart_id", cartId).eq("product_slug", slug);
    }
  };

  const setQty = async (slug: string, qty: number) => {
    if (qty <= 0) return remove(slug);
    setItems((p) => p.map((i) => i.slug === slug ? { ...i, qty } : i));
    if (user && cartId) {
      await supabase.from("cart_items").update({ quantity: qty })
        .eq("cart_id", cartId).eq("product_slug", slug);
    }
  };

  const clear = async () => {
    setItems([]);
    if (user && cartId) {
      await supabase.from("cart_items").delete().eq("cart_id", cartId);
    } else {
      writeLS([]);
    }
  };

  const detailed = items
    .map((i) => {
      const product = products.find((p) => p.slug === i.slug);
      return product ? { ...i, product } : null;
    })
    .filter(Boolean) as (CartItem & { product: Product })[];

  const subtotalUSD = detailed.reduce((s, i) => s + i.product.price * i.qty, 0);
  const count = items.reduce((s, i) => s + i.qty, 0);

  return (
    <CartContext.Provider value={{ items, add, remove, setQty, clear, count, detailed, subtotalUSD, loading }}>
      {children}
    </CartContext.Provider>
  );
}

export function useCart() {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error("useCart must be inside CartProvider");
  return ctx;
}
