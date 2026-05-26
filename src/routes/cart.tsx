import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, X, ArrowRight, ShoppingBag, Bookmark, RotateCcw } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { RelatedProducts } from "@/components/site/RelatedProducts";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — FoundOurMarket™" }] }),
  component: CartPage,
});

function CartPage() {
  const { detailed, savedDetailed, setQty, remove, saveForLater, moveToCart, subtotalUSD, count } = useCart();
  const { format } = useRegion();
  const shipping = subtotalUSD > 50 ? 0 : 9.99;
  const tax = subtotalUSD * 0.08;
  const total = subtotalUSD + shipping + tax;

  if (count === 0 && savedDetailed.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-32 text-center">
        <div className="size-16 mx-auto mb-6 grid place-items-center rounded-full bg-card border border-border">
          <ShoppingBag className="size-6 text-muted-foreground" />
        </div>
        <h1 className="text-2xl sm:text-3xl font-display mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">Add a few things you love.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-widest font-bold">
          Browse Products <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-16 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:pb-16">
      <h1 className="text-fluid-2xl font-display font-semibold mb-8 sm:mb-12">Your Cart</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-12">

        <div className="lg:col-span-2 space-y-4">
          {detailed.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted-foreground mb-4">Cart is empty. You have items saved for later below.</p>
              <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-widest font-bold">
                Browse Products <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            detailed.map((item) => (
              <div key={item.slug} className="flex gap-4 p-4 bg-card border border-border rounded-2xl">
                <Link to="/products/$slug" params={{ slug: item.slug }} className="size-24 sm:size-28 shrink-0 rounded-xl overflow-hidden bg-black/40">
                  <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                </Link>
                <div className="flex-1 min-w-0 flex flex-col">
                  <div className="flex justify-between gap-3">
                    <div className="min-w-0">
                      <Link to="/products/$slug" params={{ slug: item.slug }} className="font-medium hover:text-accent transition-colors">
                        {item.product.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{item.product.tagline}</p>
                    </div>
                    <button onClick={() => remove(item.slug)} aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                      <X className="size-4" />
                    </button>
                  </div>
                  <div className="flex items-center justify-between mt-auto pt-3 flex-wrap gap-3">
                    <div className="flex items-center border border-border rounded-full">
                      <button onClick={() => setQty(item.slug, item.qty - 1)} aria-label="Decrease" className="size-9 grid place-items-center hover:text-accent">
                        <Minus className="size-3" />
                      </button>
                      <span className="w-8 text-center text-xs font-mono">{item.qty}</span>
                      <button onClick={() => setQty(item.slug, item.qty + 1)} aria-label="Increase" className="size-9 grid place-items-center hover:text-accent">
                        <Plus className="size-3" />
                      </button>
                    </div>
                    <button
                      onClick={() => saveForLater(item.slug)}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5"
                    >
                      <Bookmark className="size-3" /> Save for later
                    </button>
                    <span className="font-mono text-sm text-accent">{format(item.product.price * item.qty)}</span>
                  </div>
                </div>
              </div>
            ))
          )}

          {savedDetailed.length > 0 && (
            <section className="pt-6">
              <h2 className="text-sm uppercase tracking-widest font-medium mb-4 text-muted-foreground">
                Saved for later · {savedDetailed.length}
              </h2>
              <div className="space-y-3">
                {savedDetailed.map((item) => (
                  <div key={item.slug} className="flex gap-4 p-3 bg-card/60 border border-border rounded-2xl items-center">
                    <Link to="/products/$slug" params={{ slug: item.slug }} className="size-16 shrink-0 rounded-lg overflow-hidden bg-black/40">
                      <img src={item.product.image} alt={item.product.name} className="w-full h-full object-cover" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link to="/products/$slug" params={{ slug: item.slug }} className="text-sm font-medium hover:text-accent transition-colors truncate block">
                        {item.product.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{format(item.product.price)} · qty {item.qty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        onClick={() => moveToCart(item.slug)}
                        className="text-[10px] uppercase tracking-widest font-bold bg-accent text-accent-foreground px-3 py-2 rounded-full inline-flex items-center gap-1.5 hover:brightness-110"
                      >
                        <RotateCcw className="size-3" /> Move to cart
                      </button>
                      <button onClick={() => remove(item.slug)} aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
            <h2 className="text-lg font-medium mb-6">Order Summary</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{format(subtotalUSD)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="font-mono">{shipping === 0 ? "Free" : format(shipping)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tax (est.)</dt><dd className="font-mono">{format(tax)}</dd></div>
              <div className="border-t border-border pt-3 flex justify-between text-base"><dt className="font-medium">Total</dt><dd className="font-mono text-accent">{format(total)}</dd></div>
            </dl>
            <Link
              to="/checkout"
              className={`w-full mt-6 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all inline-flex items-center justify-center ${count === 0 ? "pointer-events-none opacity-50" : ""}`}
            >
              Secure Checkout
            </Link>
            <p className="text-[10px] text-muted-foreground text-center mt-4 font-mono uppercase tracking-widest">
              Demo payments · No real charge
            </p>
          </div>
        </aside>
      </div>
      <RelatedProducts
        excludeSlugs={detailed.map((i) => i.slug)}
        title="Complete the look"
        eyebrow="You might also need"
        limit={8}
      />

      {/* Sticky mobile checkout bar */}
      {count > 0 && (
        <div className="lg:hidden fixed bottom-16 inset-x-0 z-30 bg-background/95 backdrop-blur-xl border-t border-border safe-bottom">
          <div className="px-4 py-3 flex items-center gap-3">
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Total</p>
              <p className="font-mono text-base text-accent leading-tight truncate">{format(total)}</p>
            </div>
            <Link to="/checkout" className="bg-accent text-accent-foreground font-bold px-5 py-3 rounded-full text-[11px] uppercase tracking-widest inline-flex items-center gap-2 whitespace-nowrap">
              Checkout <ArrowRight className="size-3.5" />
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

