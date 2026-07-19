import { createContext, useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "./auth";
import { runWhenIdle } from "./idle";
import { resilientInsert, resilientDelete } from "./infra/supabase-resilient";

type Ctx = {
  slugs: Set<string>;
  has: (slug: string) => boolean;
  toggle: (slug: string) => Promise<void>;
  loading: boolean;
};

const WishlistContext = createContext<Ctx | null>(null);

const wishlistListeners = new Set<() => void>();
let wishlistSnapshot = new Set<string>();
let wishlistToggleSnapshot: (slug: string) => Promise<void> = async () => {};

function publishWishlist(slugs: Set<string>) {
  let changed = slugs.size !== wishlistSnapshot.size;
  if (!changed) {
    for (const slug of slugs) {
      if (!wishlistSnapshot.has(slug)) {
        changed = true;
        break;
      }
    }
  }
  if (!changed) return;
  wishlistSnapshot = new Set(slugs);
  wishlistListeners.forEach((listener) => listener());
}

function subscribeWishlist(listener: () => void) {
  wishlistListeners.add(listener);
  return () => wishlistListeners.delete(listener);
}

export function WishlistProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [slugs, setSlugs] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!user) {
      setSlugs(new Set());
      return;
    }
    setLoading(true);
    supabase
      .from("wishlist")
      .select("product_slug")
      .then(({ data }) => {
        setSlugs(new Set((data ?? []).map((r) => r.product_slug)));
        setLoading(false);
      });
  }, [user]);

  const toggle = useCallback(async (slug: string) => {
    if (!user) {
      window.location.href = "/auth";
      return;
    }
    const next = new Set(slugs);
    if (next.has(slug)) {
      next.delete(slug);
      setSlugs(next);
      await resilientDelete(
        "wishlist.remove",
        "wishlist",
        { user_id: user.id, product_slug: slug },
        `wishlist:${user.id}:${slug}`,
      );
    } else {
      next.add(slug);
      setSlugs(next);
      await resilientInsert(
        "wishlist.add",
        "wishlist",
        { user_id: user.id, product_slug: slug },
        `wishlist:${user.id}:${slug}`,
      );
      runWhenIdle(() => {
        import("@/lib/personalization").then((m) => m.recordEvent({ type: "wishlist", productSlug: slug })).catch(() => {});
        import("@/lib/recommendations/performance").then((m) => m.attributeStage("wishlist")).catch(() => {});
      });
    }
  }, [slugs, user]);

  const has = useCallback((s: string) => slugs.has(s), [slugs]);
  const ctxValue = useMemo(() => ({ slugs, has, toggle, loading }), [slugs, has, toggle, loading]);

  useEffect(() => {
    publishWishlist(slugs);
  }, [slugs]);

  useEffect(() => {
    wishlistToggleSnapshot = toggle;
  });

  return (
    <WishlistContext.Provider value={ctxValue}>
      {children}
    </WishlistContext.Provider>
  );
}

export function useWishlist() {
  const ctx = useContext(WishlistContext);
  if (!ctx) throw new Error("useWishlist must be inside WishlistProvider");
  return ctx;
}

export function useWishlistSaved(slug: string) {
  return useSyncExternalStore(
    subscribeWishlist,
    () => wishlistSnapshot.has(slug),
    () => false,
  );
}

export function useWishlistActions() {
  return useMemo(() => ({ toggle: (slug: string) => wishlistToggleSnapshot(slug) }), []);
}
