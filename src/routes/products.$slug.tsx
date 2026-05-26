import { createFileRoute, Link } from "@tanstack/react-router";
import { Heart, Truck, Shield, RotateCcw, Star, Minus, Plus, Loader2, Scale } from "lucide-react";
import { useState, useEffect } from "react";
import { useProduct, invalidateProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { RelatedProducts } from "@/components/site/RelatedProducts";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductQA } from "@/components/site/ProductQA";
import { useCompare } from "@/hooks/use-compare";



export const Route = createFileRoute("/products/$slug")({
  head: ({ params }) => ({
    meta: [{ title: `${params.slug} — FoundOurMarket™` }],
  }),
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { product, loading } = useProduct(slug);
  const { format } = useRegion();
  const { add } = useCart();
  const { record } = useRecentlyViewed();
  const { has: inCompare, toggle: toggleCompare, isFull: compareFull } = useCompare();
  const [qty, setQty] = useState(1);

  useEffect(() => {
    if (product) record(product.slug);
  }, [product?.slug, record]);


  if (loading) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!product) {
    return (
      <div className="py-32 text-center">
        <h1 className="text-3xl font-display mb-4">Product not found</h1>
        <Link to="/" className="text-accent underline">Back to shop</Link>
      </div>
    );
  }

  return (
    <>
      <div className="max-w-7xl mx-auto px-6 py-12">
        <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-8">
          <Link to="/" className="hover:text-foreground">Shop</Link>
          <span className="mx-2">/</span>
          <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-foreground">{product.category}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-12">
          <div className="space-y-4">
            <div className="aspect-square bg-card rounded-3xl overflow-hidden border border-border">
              <img src={product.image} alt={product.name} className="w-full h-full object-cover" />
            </div>
            <div className="grid grid-cols-4 gap-3">
              {[0, 1, 2, 3].map((i) => (
                <div key={i} className={`aspect-square rounded-xl overflow-hidden border ${i === 0 ? "border-accent" : "border-border opacity-50 hover:opacity-100 transition-opacity"} bg-card cursor-pointer`}>
                  <img src={product.image} alt="" className="w-full h-full object-cover" />
                </div>
              ))}
            </div>
          </div>

          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">{product.tagline}</p>
            <h1 className="text-4xl md:text-5xl font-display font-semibold tracking-tight mb-4">{product.name}</h1>
            <div className="flex items-center gap-3 mb-6">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`size-3.5 ${i < Math.round(product.rating) ? "fill-accent text-accent" : "text-muted-foreground"}`} />
                ))}
              </div>
              <span className="text-xs font-mono text-muted-foreground">{product.rating} · {product.reviews} reviews</span>
            </div>

            <div className="flex items-baseline gap-4 mb-8">
              <span className="text-4xl font-mono text-accent">{format(product.price)}</span>
              {product.discount && (
                <span className="text-sm font-mono text-muted-foreground line-through">{format(product.price * (1 + product.discount / 100))}</span>
              )}
            </div>

            <p className="text-muted-foreground leading-relaxed mb-8">{product.description}</p>

            <div className="flex items-center gap-3 mb-4">
              <div className="flex items-center border border-border rounded-full">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease" className="size-12 grid place-items-center hover:text-accent transition-colors">
                  <Minus className="size-4" />
                </button>
                <span className="w-10 text-center font-mono text-sm">{qty}</span>
                <button onClick={() => setQty(qty + 1)} aria-label="Increase" className="size-12 grid place-items-center hover:text-accent transition-colors">
                  <Plus className="size-4" />
                </button>
              </div>
              <button
                onClick={() => add(product.slug, qty)}
                className="flex-1 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all"
              >
                Add to Cart
              </button>
              <button aria-label="Wishlist" className="size-12 grid place-items-center border border-border rounded-full hover:text-accent transition-colors">
                <Heart className="size-4" />
              </button>
            </div>

            <Link
              to="/cart"
              onClick={() => add(product.slug, qty)}
              className="block text-center w-full bg-foreground text-background font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all mb-8"
            >
              Buy Now
            </Link>

            <div className="grid grid-cols-3 gap-4 pt-8 border-t border-border">
              {[
                { icon: Truck, label: "Free shipping over $50" },
                { icon: RotateCcw, label: "30-day returns" },
                { icon: Shield, label: "Secure checkout" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="text-center">
                  <Icon className="size-4 mx-auto mb-2 text-accent" />
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <ProductReviews productSlug={product.slug} onAggregateChange={invalidateProducts} />

      <ProductQA productSlug={product.slug} />

      <RelatedProducts product={product} />

      <RecentlyViewed excludeSlug={product.slug} />
    </>
  );
}

