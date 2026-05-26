import { createFileRoute, Link } from "@tanstack/react-router";
import { Minus, Plus, X, ArrowRight, ShoppingBag } from "lucide-react";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { RelatedProducts } from "@/components/site/RelatedProducts";

export const Route = createFileRoute("/cart")({
  head: () => ({ meta: [{ title: "Cart — FoundOurMarket™" }] }),
  component: CartPage,
});

function CartPage() {
  const { detailed, setQty, remove, subtotalUSD, count } = useCart();
  const { format, region } = useRegion();
  const shipping = subtotalUSD > 50 ? 0 : 9.99;
  const tax = subtotalUSD * 0.08;
  const total = subtotalUSD + shipping + tax;

  if (count === 0) {
    return (
      <div className="max-w-3xl mx-auto px-6 py-32 text-center">
        <div className="size-16 mx-auto mb-6 grid place-items-center rounded-full bg-card border border-border">
          <ShoppingBag className="size-6 text-muted-foreground" />
        </div>
        <h1 className="text-3xl font-display mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">Add a few things you love.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-widest font-bold">
          Browse Products <ArrowRight className="size-3.5" />
        </Link>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <h1 className="text-3xl md:text-5xl font-display font-semibold mb-12">Your Cart</h1>
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-12">
        <div className="lg:col-span-2 space-y-4">
          {detailed.map((item) => (
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
                <div className="flex items-center justify-between mt-auto pt-3">
                  <div className="flex items-center border border-border rounded-full">
                    <button onClick={() => setQty(item.slug, item.qty - 1)} aria-label="Decrease" className="size-9 grid place-items-center hover:text-accent">
                      <Minus className="size-3" />
                    </button>
                    <span className="w-8 text-center text-xs font-mono">{item.qty}</span>
                    <button onClick={() => setQty(item.slug, item.qty + 1)} aria-label="Increase" className="size-9 grid place-items-center hover:text-accent">
                      <Plus className="size-3" />
                    </button>
                  </div>
                  <span className="font-mono text-sm text-accent">{format(item.product.price * item.qty)}</span>
                </div>
              </div>
            </div>
          ))}
        </div>

        <aside className="lg:col-span-1">
          <div className="bg-card border border-border rounded-2xl p-6 sticky top-24">
            <h2 className="text-lg font-medium mb-6">Order Summary</h2>
            <dl className="space-y-3 text-sm">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{format(subtotalUSD)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="font-mono">{shipping === 0 ? "Free" : format(shipping)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tax (est.)</dt><dd className="font-mono">{format(tax)}</dd></div>
              <div className="border-t border-border pt-3 flex justify-between text-base"><dt className="font-medium">Total</dt><dd className="font-mono text-accent">{format(total)}</dd></div>
            </dl>
            <input
              placeholder="Promo code"
              className="w-full mt-6 bg-black/40 border border-border rounded-full px-4 py-2.5 text-xs focus:outline-none focus:ring-1 focus:ring-accent"
            />
            <Link to="/checkout" className="w-full mt-4 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all inline-flex items-center justify-center">
              Secure Checkout
            </Link>
            <p className="text-[10px] text-muted-foreground text-center mt-4 font-mono uppercase tracking-widest">
              {region === "IN" ? "Razorpay · UPI · Cards" : "Stripe · PayPal · International cards"}
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
    </div>
  );
}
