import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Heart, Loader2 } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useWishlist } from "@/lib/wishlist";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";
import { useNavigate } from "@tanstack/react-router";

export const Route = createFileRoute("/wishlist")({
  head: () => ({ meta: [{ title: "Wishlist — FoundOurMarket™" }] }),
  component: WishlistPage,
});

function WishlistPage() {
  const { user, loading } = useAuth();
  const { slugs, loading: wlLoading } = useWishlist();
  const { products, loading: pLoading } = useProducts();
  const nav = useNavigate();

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  if (loading || !user || wlLoading || pLoading) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  const items = products.filter((p) => slugs.has(p.slug));

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Saved</p>
      <h1 className="text-3xl md:text-5xl font-display font-semibold mb-12">Your Wishlist</h1>
      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Heart className="size-5 text-muted-foreground" />
          </div>
          <p className="text-sm text-muted-foreground mb-6">Nothing saved yet. Tap the heart on anything you love.</p>
          <Link to="/" className="inline-block bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold">Browse</Link>
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4 md:gap-6">
          {items.map((p) => <ProductCard key={p.slug} product={p} />)}
        </div>
      )}
    </div>
  );
}
