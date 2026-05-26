import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { Heart, Loader2, ShoppingBag, Trash2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useProducts } from "@/lib/use-products";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — FoundOurMarket™" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const { user, loading } = useAuth();
  const { slugs, toggle, loading: wlLoading } = useWishlist();
  const { products, loading: pLoading } = useProducts();
  const { add } = useCart();
  const { format } = useRegion();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  if (loading || !user || wlLoading || pLoading) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const items = products.filter((p) => slugs.has(p.slug));

  const addAll = () => {
    items.filter((p) => p.in_stock).forEach((p) => add(p.slug, 1));
  };

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Saved · {items.length}</p>
      <div className="flex flex-wrap items-end justify-between gap-4 mb-12">
        <h1 className="text-3xl md:text-5xl font-display font-semibold">Your Wishlist</h1>
        {items.length > 0 && (
          <button
            onClick={addAll}
            className="bg-accent text-accent-foreground font-bold px-5 py-3 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all inline-flex items-center gap-2"
          >
            <ShoppingBag className="size-3.5" /> Add all to cart
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Heart className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">Nothing saved yet. Tap the heart on anything you love.</p>
          <Link to="/" className="inline-block bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold">Browse</Link>
        </div>
      ) : (
        <ul className="divide-y divide-border border border-border rounded-2xl overflow-hidden bg-card">
          {items.map((p) => (
            <li key={p.slug} className="flex items-center gap-4 p-4 sm:p-5">
              <Link to="/products/$slug" params={{ slug: p.slug }} className="shrink-0">
                <img src={p.image} alt={p.name} loading="lazy" className="size-20 sm:size-24 rounded-xl object-cover bg-black/40" />
              </Link>
              <div className="flex-1 min-w-0">
                <Link to="/products/$slug" params={{ slug: p.slug }} className="block">
                  <h3 className="font-medium text-sm sm:text-base truncate">{p.name}</h3>
                  <p className="text-xs text-muted-foreground truncate">{p.tagline}</p>
                </Link>
                <div className="mt-2 flex items-center gap-3">
                  <span className="font-mono text-sm text-accent">{format(p.price)}</span>
                  {!p.in_stock && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Out of stock</span>
                  )}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => add(p.slug, 1)}
                  disabled={!p.in_stock}
                  className="hidden sm:inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                >
                  <ShoppingBag className="size-3.5" /> Add
                </button>
                <button
                  onClick={() => add(p.slug, 1)}
                  disabled={!p.in_stock}
                  aria-label="Add to cart"
                  className="sm:hidden size-10 grid place-items-center bg-accent text-accent-foreground rounded-full disabled:opacity-40"
                >
                  <ShoppingBag className="size-4" />
                </button>
                <button
                  onClick={() => toggle(p.slug)}
                  aria-label="Remove from wishlist"
                  className="size-10 grid place-items-center border border-border rounded-full text-muted-foreground hover:text-accent hover:border-accent/40 transition-colors"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
