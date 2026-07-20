// Rich inline product card for AI Shopping. Reuses existing cart/wishlist
// hooks — no duplicate business logic. Quick actions: View, Add to Cart,
// Wishlist. Buy Now = add + navigate to /cart.
import { useCallback, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Star, ShoppingBag, Heart, Zap, Check } from "lucide-react";
import { useCartActions, readLineQty } from "@/lib/cart";
import { useWishlistActions } from "@/lib/wishlist";
import { toast } from "sonner";
import type { AiProductRef } from "@/lib/ai-shopping/types";

function formatInr(v: number | null): string {
  if (v == null) return "";
  return `₹${Math.round(v).toLocaleString("en-IN")}`;
}

export function AiProductCard({ product }: { product: AiProductRef }) {
  const { add } = useCartActions();
  const { toggle } = useWishlistActions();
  const navigate = useNavigate();
  const [busy, setBusy] = useState<"cart" | "buy" | "wish" | null>(null);
  const [added, setAdded] = useState(false);
  const [saved, setSaved] = useState(false);

  const hasCompare =
    product.compare_price_inr &&
    product.price_inr &&
    product.compare_price_inr > product.price_inr;
  const discount = hasCompare && product.compare_price_inr && product.price_inr
    ? Math.round(((product.compare_price_inr - product.price_inr) / product.compare_price_inr) * 100)
    : 0;

  const handleCart = useCallback(async () => {
    if (busy) return;
    setBusy("cart");
    try {
      const inCart = readLineQty(product.slug) > 0;
      if (!inCart) await add(product.slug, 1);
      setAdded(true);
      toast.success("Added to cart");
      window.setTimeout(() => setAdded(false), 1600);
    } catch {
      toast.error("Couldn't add to cart");
    } finally {
      setBusy(null);
    }
  }, [add, busy, product.slug]);

  const handleBuy = useCallback(async () => {
    if (busy) return;
    setBusy("buy");
    try {
      const inCart = readLineQty(product.slug) > 0;
      if (!inCart) await add(product.slug, 1);
      void navigate({ to: "/cart" });
    } catch {
      toast.error("Couldn't start checkout");
    } finally {
      setBusy(null);
    }
  }, [add, busy, navigate, product.slug]);

  const handleWish = useCallback(async () => {
    if (busy) return;
    setBusy("wish");
    try {
      await toggle(product.slug);
      setSaved((s) => !s);
    } finally {
      setBusy(null);
    }
  }, [busy, product.slug, toggle]);

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl transition-all hover:border-primary/50">
      <Link
        to="/products/$slug"
        params={{ slug: product.slug }}
        className="group flex gap-3 p-2.5"
        aria-label={`View ${product.name}`}
      >
        <div className="relative h-20 w-20 shrink-0 overflow-hidden rounded-xl bg-secondary/60">
          {product.image ? (
            <img
              src={product.image}
              alt={product.name}
              loading="lazy"
              className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.04]"
            />
          ) : null}
          {discount > 0 && (
            <span className="absolute left-1 top-1 rounded-full bg-primary px-1.5 py-0.5 text-[9px] font-semibold text-primary-foreground">
              -{discount}%
            </span>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="line-clamp-2 text-[13px] font-medium leading-snug text-foreground">
            {product.name}
          </p>
          {product.tagline && (
            <p className="mt-0.5 line-clamp-1 text-[11px] text-muted-foreground">
              {product.tagline}
            </p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
            {product.price_inr != null && (
              <span className="text-[13px] font-semibold text-foreground">
                {formatInr(product.price_inr)}
              </span>
            )}
            {hasCompare && (
              <span className="text-[11px] text-muted-foreground line-through">
                {formatInr(product.compare_price_inr)}
              </span>
            )}
            {product.rating != null && (
              <span className="ml-auto inline-flex items-center gap-0.5 text-[11px] text-amber-400">
                <Star className="h-3 w-3 fill-current" aria-hidden />
                {product.rating.toFixed(1)}
              </span>
            )}
          </div>
        </div>
      </Link>

      <div className="flex items-center gap-1.5 border-t border-border/50 bg-background/40 px-2 py-1.5">
        <button
          type="button"
          onClick={handleCart}
          disabled={busy !== null}
          aria-label={`Add ${product.name} to cart`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-secondary/70 px-2.5 py-1.5 text-[11px] font-medium text-foreground transition-colors hover:bg-secondary active:scale-[0.98] disabled:opacity-60"
        >
          {added ? <Check className="h-3.5 w-3.5" aria-hidden /> : <ShoppingBag className="h-3.5 w-3.5" aria-hidden />}
          {added ? "Added" : "Add"}
        </button>
        <button
          type="button"
          onClick={handleBuy}
          disabled={busy !== null}
          aria-label={`Buy ${product.name} now`}
          className="inline-flex min-h-11 flex-1 items-center justify-center gap-1.5 rounded-xl bg-gradient-to-br from-primary to-primary/85 px-2.5 py-1.5 text-[11px] font-semibold text-primary-foreground shadow-[var(--shadow-ember)] transition-transform active:scale-[0.98] disabled:opacity-60"
        >
          <Zap className="h-3.5 w-3.5" aria-hidden />
          Buy now
        </button>
        <button
          type="button"
          onClick={handleWish}
          disabled={busy !== null}
          aria-label={saved ? `Remove ${product.name} from wishlist` : `Save ${product.name} to wishlist`}
          aria-pressed={saved}
          className="inline-flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-secondary/70 text-foreground transition-colors hover:bg-secondary active:scale-[0.94] disabled:opacity-60"
        >
          <Heart className={`h-3.5 w-3.5 ${saved ? "fill-primary text-primary" : ""}`} aria-hidden />
        </button>
      </div>
    </div>
  );
}
