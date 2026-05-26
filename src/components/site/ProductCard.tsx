import { Link } from "@tanstack/react-router";
import { Heart, Star } from "lucide-react";
import type { Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";

export function ProductCard({ product }: { product: Product }) {
  const { format } = useRegion();
  const { add } = useCart();
  const { has, toggle } = useWishlist();
  const saved = has(product.slug);
  return (
    <div className="group bg-card border border-border rounded-2xl p-4 hover:border-accent/40 transition-all duration-500 hover:-translate-y-1">
      <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
        <div className="relative aspect-square mb-5 rounded-xl overflow-hidden bg-black/40">
          <img
            src={product.image}
            alt={product.name}
            loading="lazy"
            width={800}
            height={800}
            className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
          />
          <div className="absolute top-3 left-3 flex flex-col gap-1.5 items-start">
            {product.featured && (
              <span className="bg-foreground text-background text-[10px] font-bold font-mono px-2 py-1 rounded-full uppercase tracking-widest">
                Featured
              </span>
            )}
            {product.discount && (
              <span className="bg-accent text-accent-foreground text-[10px] font-bold font-mono px-2 py-1 rounded-full">
                −{product.discount}% Sale
              </span>
            )}
          </div>
          <button
            onClick={(e) => { e.preventDefault(); toggle(product.slug); }}
            aria-label={saved ? "Remove from wishlist" : "Add to wishlist"}
            className={`absolute top-3 right-3 size-9 grid place-items-center bg-black/50 backdrop-blur-md rounded-full transition-colors ${saved ? "text-accent" : "text-white/70 hover:text-accent"}`}
          >
            <Heart className={`size-4 ${saved ? "fill-accent" : ""}`} />
          </button>
        </div>
      </Link>
      <div className="flex justify-between items-start gap-2">
        <div className="min-w-0">
          <Link to="/products/$slug" params={{ slug: product.slug }} className="block">
            <h4 className="font-medium text-sm truncate">{product.name}</h4>
            <p className="text-xs text-muted-foreground">{product.tagline}</p>
          </Link>
        </div>
        <p className="font-mono text-sm text-accent shrink-0">{format(product.price)}</p>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="flex items-center gap-1 text-[10px] font-mono text-muted-foreground">
          <Star className="size-3 fill-accent text-accent" />
          {product.rating} <span className="opacity-50">({product.reviews})</span>
        </div>
        <button
          onClick={() => add(product.slug)}
          className="text-[10px] font-mono uppercase tracking-widest text-accent hover:text-foreground transition-colors"
        >
          Add +
        </button>
      </div>
    </div>
  );
}
