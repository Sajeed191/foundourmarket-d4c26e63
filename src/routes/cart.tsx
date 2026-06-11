import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Minus, Plus, X, ArrowRight, ShoppingBag, Bookmark, RotateCcw, Heart,
  Truck, ShieldCheck, ChevronDown, Lock, MapPin, Clock,
  AlertTriangle, CheckCircle2, Loader2, Undo2, Sparkles, Share2, Star,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { openShare } from "@/lib/share";
import { refreshProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { RelatedProducts } from "@/components/site/RelatedProducts";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { estimateShipping } from "@/lib/cart.functions";

export const Route = createFileRoute("/cart")({
  head: () => ({
    meta: [
      { title: "Your Cart — FoundOurMarket™" },
      { name: "description", content: "Review the items in your FoundOurMarket cart, adjust quantities, and proceed to secure checkout for worldwide delivery." },
      { property: "og:title", content: "Your Cart — FoundOurMarket™" },
      { property: "og:description", content: "Review the items in your FoundOurMarket cart and check out securely." },
      { property: "og:url", content: "https://foundourmarket.com/cart" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/cart" }],
  }),
  component: CartPage,
});

// Auto-applied campaign discount (backend-ready, silent — no manual coupon UI).
type AutoPromo = { label: string; discount: number } | null;
type ShipState = {
  city: string | null; state: string | null; minDays: number; maxDays: number;
  etaIso: string; shippingUsd: number; codAvailable: boolean; expressAvailable: boolean;
} | null;

function unitPricing(sale: number, compareAt?: number | null, discount?: number) {
  const original =
    compareAt != null && compareAt > sale
      ? compareAt
      : discount && discount > 0
        ? sale / (1 - discount / 100)
        : sale;
  return { sale, original, save: Math.max(0, original - sale), discount: discount ?? 0 };
}

function shareProduct(slug: string, name: string, image?: string) {
  if (typeof window === "undefined") return;
  openShare({ title: name, url: `${window.location.origin}/products/${slug}`, image });
}

function CartPage() {
  const {
    detailed, savedDetailed, setQty, remove, removeSaved, saveForLater, moveToCart,
    moveToWishlist, undoRemove, lastRemoved, subtotalUSD, count,
  } = useCart();
  const { format, priceOf, compareOf, shippingFeeOf, currencyReady } = useRegion();

  const [promo] = useState<AutoPromo>(null);
  const [ship, setShip] = useState<ShipState>(null);

  // Pull the latest admin pricing/shipping when the cart opens.
  useEffect(() => { refreshProducts(); }, []);




  const savings = useMemo(
    () => detailed.reduce((s, i) => s + unitPricing(priceOf(i.product), compareOf(i.product), i.product.discount).save * i.qty, 0),
    [detailed, priceOf, compareOf],
  );

  const discount = promo?.discount ?? 0;
  // Admin-defined per-product shipping fees (fee × qty) drive the cart total,
  // matching what is charged at payment.
  const shipping = useMemo(
    () => detailed.reduce((s, i) => s + shippingFeeOf(i.product) * i.qty, 0),
    [detailed, shippingFeeOf],
  );
  const total = Math.max(0, subtotalUSD + shipping - discount);
  const totalSavings = savings + discount;

  // ---- Empty cart ----
  if (count === 0 && savedDetailed.length === 0) {
    return (
      <div className="max-w-3xl mx-auto px-4 sm:px-6 py-20 sm:py-28 mobile-page-clearance md:pb-28 text-center">
        <motion.div
          initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
          className="relative size-24 mx-auto mb-8 grid place-items-center rounded-3xl bg-card border border-border overflow-hidden"
        >
          <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_30%,hsl(var(--accent)/0.25),transparent_70%)]" />
          <ShoppingBag className="size-9 text-accent relative" />
        </motion.div>
        <h1 className="text-2xl sm:text-3xl font-display mb-3">Your cart is empty</h1>
        <p className="text-muted-foreground mb-8">Discover something you'll love — curated from around the world.</p>
        <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
          Browse Products <ArrowRight className="size-3.5" />
        </Link>
        <div className="mt-12 text-left">
          <RecentlyViewed limit={8} />
        </div>
        <div className="mt-6 text-left">
          <RelatedProducts title="Trending now" eyebrow="You might like" limit={8} />
        </div>
      </div>
    );
  }

  // Currency-safe gate: never paint cart prices until the region/currency is
  // resolved, so Indian shoppers never flash USD (and vice versa).
  if (!currencyReady) {
    return (
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12 pb-8 lg:pb-16">
        <div className="mb-8 h-9 w-44 animate-pulse rounded-lg bg-white/10" />
        <div className="grid gap-4">
          {Array.from({ length: Math.min(count || 3, 4) }).map((_, i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.06]" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-6 sm:py-12 pb-8 lg:pb-16">
      {/* Bottom safe-area clearance for the fixed checkout dock lives on the
          shared footer, so the content ends ~32px above the footer with no gap. */}
      {/* Header */}
      <div className="mb-6 sm:mb-8">
        <div className="flex items-end justify-between gap-4 flex-wrap">
          <div>
            <h1 className="text-fluid-2xl font-display font-semibold">Your Cart</h1>
            <p className="text-sm text-muted-foreground mt-1">
              {count} {count === 1 ? "item" : "items"} · Subtotal <span className="text-foreground font-mono">{format(subtotalUSD)}</span>
              {savings > 0 && <span className="text-accent"> · You save {format(savings)}</span>}
            </p>
          </div>
        </div>
      </div>


      {/* Undo remove banner */}
      <AnimatePresence>
        {lastRemoved && (
          <motion.div
            initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="mb-4 flex items-center justify-between gap-3 rounded-xl border border-border bg-card px-4 py-3"
          >
            <span className="text-sm text-muted-foreground">Item removed from cart.</span>
            <button onClick={() => undoRemove()} className="inline-flex items-center gap-1.5 text-xs uppercase tracking-widest font-bold text-accent hover:brightness-110">
              <Undo2 className="size-3.5" /> Undo
            </button>
          </motion.div>
        )}
      </AnimatePresence>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 lg:gap-10">
        <div className="lg:col-span-2 space-y-3">
          {detailed.length === 0 ? (
            <div className="bg-card border border-border rounded-2xl p-10 text-center">
              <p className="text-sm text-muted-foreground mb-4">Cart is empty. You have items saved for later below.</p>
              <Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-widest font-bold">
                Browse Products <ArrowRight className="size-3.5" />
              </Link>
            </div>
          ) : (
            <AnimatePresence initial={false}>
              {detailed.map((item) => {
                const pr = unitPricing(priceOf(item.product), compareOf(item.product), item.product.discount);
                const stock = item.product.stockQuantity ?? 0;
                const low = item.product.inStock && stock > 0 && stock <= (item.product.lowStockThreshold ?? 5);
                const out = !item.product.inStock || stock <= 0;
                const atMax = item.qty >= stock && stock > 0;
                return (
                  <motion.div
                    key={item.slug}
                    layout
                    initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, x: -40, transition: { duration: 0.2 } }}
                    className="flex gap-3 sm:gap-4 p-3 sm:p-4 bg-card border border-border rounded-2xl"
                  >
                    <Link to="/products/$slug" params={{ slug: item.slug }} className="relative size-24 sm:size-28 shrink-0 rounded-xl overflow-hidden bg-black/40">
                      <img src={item.product.image} alt={item.product.name} loading="lazy" className="w-full h-full object-cover" />
                      {pr.discount > 0 && (
                        <span className="absolute top-1 left-1 text-[9px] font-bold px-1.5 py-0.5 rounded-md bg-accent text-accent-foreground">-{Math.round(pr.discount)}%</span>
                      )}
                    </Link>

                    <div className="flex-1 min-w-0 flex flex-col">
                      <div className="flex justify-between gap-3">
                        <div className="min-w-0">
                          <Link to="/products/$slug" params={{ slug: item.slug }} className="font-medium hover:text-accent transition-colors line-clamp-1">
                            {item.product.name}
                          </Link>
                          <p className="text-xs text-muted-foreground line-clamp-1">{item.product.tagline}</p>
                          {item.product.rating > 0 && (
                            <div className="mt-1 flex items-center gap-1 text-[11px]">
                              <Star className="size-3 fill-accent text-accent" />
                              <span className="font-medium">{item.product.rating.toFixed(1)}</span>
                              {item.product.reviews > 0 && (
                                <span className="text-muted-foreground">({item.product.reviews})</span>
                              )}
                            </div>
                          )}
                          <div className="mt-1 flex items-center gap-2 text-[11px]">
                            {out ? (
                              <span className="text-destructive inline-flex items-center gap-1"><AlertTriangle className="size-3" /> Out of stock</span>
                            ) : low ? (
                              <span className="text-accent inline-flex items-center gap-1"><AlertTriangle className="size-3" /> Only {stock} left</span>
                            ) : (
                              <span className="text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="size-3" /> In stock</span>
                            )}
                            <span className="text-muted-foreground inline-flex items-center gap-1"><Truck className="size-3" /> 4–6 days</span>
                          </div>
                        </div>
                        <button onClick={() => remove(item.slug)} aria-label="Remove" className="text-muted-foreground hover:text-destructive shrink-0 h-fit">
                          <X className="size-4" />
                        </button>
                      </div>

                      <div className="flex items-end justify-between mt-auto pt-3 gap-3">
                        <div className="flex items-center border border-border rounded-full">
                          <button onClick={() => setQty(item.slug, item.qty - 1)} aria-label="Decrease" className="size-9 grid place-items-center hover:text-accent active:scale-90 transition-transform">
                            <Minus className="size-3" />
                          </button>
                          <motion.span key={item.qty} initial={{ scale: 1.3 }} animate={{ scale: 1 }} className="w-8 text-center text-xs font-mono">{item.qty}</motion.span>
                          <button
                            onClick={() => { if (atMax) { toast.error(`Only ${stock} in stock`); return; } setQty(item.slug, item.qty + 1); }}
                            aria-label="Increase"
                            disabled={atMax}
                            className="size-9 grid place-items-center hover:text-accent active:scale-90 transition-transform disabled:opacity-40"
                          >
                            <Plus className="size-3" />
                          </button>
                        </div>
                        <div className="text-right">
                          {pr.original > pr.sale && (
                            <span className="block text-[11px] text-muted-foreground line-through font-mono">{format(pr.original * item.qty)}</span>
                          )}
                          <span className="font-mono text-sm text-accent">{format(pr.sale * item.qty)}</span>
                          {pr.save > 0 && (
                            <span className="block text-[10px] font-semibold text-accent">You save {format(pr.save * item.qty)}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center gap-4 mt-2.5">
                        <button onClick={() => saveForLater(item.slug)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5">
                          <Bookmark className="size-3" /> Save
                        </button>
                        <button onClick={() => { moveToWishlist(item.slug); toast.success("Moved to wishlist"); }} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5">
                          <Heart className="size-3" /> Wishlist
                        </button>
                        <button onClick={() => shareProduct(item.slug, item.product.name, item.product.image)} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5">
                          <Share2 className="size-3" /> Share
                        </button>
                      </div>
                    </div>
                  </motion.div>
                );
              })}
            </AnimatePresence>
          )}

          {/* Saved for later */}
          {savedDetailed.length > 0 && (
            <section className="pt-6">
              <h2 className="text-sm uppercase tracking-widest font-medium mb-4 text-muted-foreground">
                Saved for later · {savedDetailed.length}
              </h2>
              <div className="space-y-3">
                {savedDetailed.map((item) => (
                  <div key={item.slug} className="flex gap-4 p-3 bg-card/60 border border-border rounded-2xl items-center">
                    <Link to="/products/$slug" params={{ slug: item.slug }} className="size-16 shrink-0 rounded-lg overflow-hidden bg-black/40">
                      <img src={item.product.image} alt={item.product.name} loading="lazy" className="w-full h-full object-cover" />
                    </Link>
                    <div className="flex-1 min-w-0">
                      <Link to="/products/$slug" params={{ slug: item.slug }} className="text-sm font-medium hover:text-accent transition-colors truncate block">
                        {item.product.name}
                      </Link>
                      <p className="text-xs text-muted-foreground">{format(priceOf(item.product))} · qty {item.qty}</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => moveToCart(item.slug)} className="text-[10px] uppercase tracking-widest font-bold bg-accent text-accent-foreground px-3 py-2 rounded-full inline-flex items-center gap-1.5 hover:brightness-110">
                        <RotateCcw className="size-3" /> Move to cart
                      </button>
                      <button onClick={() => removeSaved(item.slug)} aria-label="Remove" className="text-muted-foreground hover:text-destructive">
                        <X className="size-4" />
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          )}
        </div>

        {/* Order summary */}
        <aside className="lg:col-span-1">
          <div className="lg:sticky lg:top-24 space-y-4">
            <ShippingBox subtotalUSD={subtotalUSD} ship={ship} setShip={setShip} format={format} />


            <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
              <h2 className="text-lg font-medium mb-5">Order Summary</h2>

              {/* Total savings highlight */}
              {totalSavings > 0 && (
                <motion.div
                  initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }}
                  className="mb-4 flex items-center justify-between rounded-xl border border-accent/30 bg-accent/10 px-3.5 py-2.5"
                >
                  <span className="text-xs font-medium inline-flex items-center gap-1.5 text-accent">
                    <Sparkles className="size-3.5" /> Total savings
                  </span>
                  <span className="font-mono text-sm font-semibold text-accent">{format(totalSavings)}</span>
                </motion.div>
              )}

              <dl className="space-y-3 text-sm">
                <Row label="Subtotal" value={format(subtotalUSD)} />
                {savings > 0 && <Row label="Item savings" value={`−${format(savings)}`} accent />}
                {discount > 0 && (
                  <Row label={promo?.label ?? "Discount applied"} value={`−${format(discount)}`} accent />
                )}
                <Row label="Shipping" value={shipping === 0 ? "Free" : format(shipping)} />
                {ship?.etaIso && (
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <dt className="inline-flex items-center gap-1"><Clock className="size-3" /> Est. delivery</dt>
                    <dd>{new Date(ship.etaIso).toLocaleDateString(undefined, { month: "short", day: "numeric" })}</dd>
                  </div>
                )}
                <div className="border-t border-border pt-3 flex justify-between items-baseline text-base">
                  <dt className="font-medium">Total</dt>
                  <motion.dd key={total} initial={{ scale: 1.08 }} animate={{ scale: 1 }} className="font-mono text-accent">{format(total)}</motion.dd>
                </div>
              </dl>

              <Link
                to="/checkout"
                className={`group w-full mt-5 bg-accent text-accent-foreground font-bold py-3.5 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all inline-flex items-center justify-center gap-2 shadow-[0_0_20px_hsl(var(--accent)/0.35)] ${count === 0 ? "pointer-events-none opacity-50" : ""}`}
              >
                <Lock className="size-3.5" /> Secure Checkout
                <ArrowRight className="size-3.5 group-hover:translate-x-0.5 transition-transform" />
              </Link>

              {/* Razorpay trust badge */}
              <div className="mt-3.5 flex items-center justify-center gap-1.5 text-[10px] text-muted-foreground">
                <ShieldCheck className="size-3.5 text-accent" />
                <span>Secured by <span className="text-foreground font-medium">Razorpay</span> · 256-bit encrypted</span>
              </div>

              <div className="mt-4 grid grid-cols-3 gap-2 text-[9px] text-muted-foreground uppercase tracking-widest text-center">
                <span className="inline-flex flex-col items-center gap-1"><ShieldCheck className="size-4 text-accent" /> Secure</span>
                <span className="inline-flex flex-col items-center gap-1"><Truck className="size-4 text-accent" /> Tracked</span>
                <span className="inline-flex flex-col items-center gap-1"><RotateCcw className="size-4 text-accent" /> Easy returns</span>
              </div>

              <p className="mt-4 pt-4 border-t border-border text-[11px] leading-relaxed text-muted-foreground">
                Free 4-day returns on eligible items. Refunds processed to your original payment method within 3–5 business days.
              </p>
            </div>

          </div>
        </aside>
      </div>

      <div className="mt-4">
        <RelatedProducts excludeSlugs={detailed.map((i) => i.slug)} title="Recommended For You" eyebrow="Customers also bought" limit={8} />
      </div>
      <div className="border-t border-border/50 mt-2">
        <RecentlyViewed excludeSlug={detailed[0]?.slug} limit={8} />
      </div>


      {/* Sticky mobile checkout dock — compact bar that floats ~12px above the
          bottom nav, respecting the device safe area. */}
      {count > 0 && (
        <div
          className="lg:hidden fixed inset-x-0 z-40 px-3 pointer-events-none"
          style={{ bottom: "calc(var(--app-bottom-nav-height) + 0.75rem)" }}
        >
          <div
            className="pointer-events-auto rounded-2xl p-1 pl-4 flex items-center gap-3 border border-white/10 shadow-[0_24px_60px_-18px_oklch(0_0_0/0.9),0_0_28px_-14px_hsl(var(--accent)/0.45)]"
            style={{
              background: "linear-gradient(135deg, oklch(1 0 0 / 0.07), oklch(1 0 0 / 0.02))",
              backdropFilter: "blur(32px) saturate(160%)",
              WebkitBackdropFilter: "blur(32px) saturate(160%)",
            }}
          >
            <div className="flex-1 min-w-0 leading-none">
              <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/80">Total · {count} {count === 1 ? "item" : "items"}</p>
              <motion.p key={total} initial={{ scale: 1.06 }} animate={{ scale: 1 }} className="font-mono text-[15px] text-accent leading-tight truncate mt-0.5">{format(total)}</motion.p>
            </div>
            <Link to="/checkout" className="shrink-0 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-xl text-[11px] uppercase tracking-widest inline-flex items-center gap-2 whitespace-nowrap transition-all active:scale-95 shadow-[0_0_20px_hsl(var(--accent)/0.5)]">
              <Lock className="size-3.5" /> Checkout
            </Link>
          </div>
        </div>
      )}

    </div>
  );
}

function Row({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex justify-between">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`font-mono ${accent ? "text-accent" : ""}`}>{value}</dd>
    </div>
  );
}



function ShippingBox({
  subtotalUSD, ship, setShip, format,
}: {
  subtotalUSD: number;
  ship: ShipState;
  setShip: (s: ShipState) => void;
  format: (n: number) => string;
}) {
  const estimate = useServerFn(estimateShipping);
  const [pincode, setPincode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  async function submit() {
    if (!/^\d{6}$/.test(pincode)) { setError("Enter a valid 6-digit PIN code"); return; }
    setBusy(true); setError(null);
    try {
      const res = await estimate({ data: { pincode, subtotal: subtotalUSD } });
      if (res.ok) setShip(res);
      else { setError(res.reason); setShip(null); }
    } catch {
      setError("Could not estimate delivery. Try again.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <button onClick={() => setOpen((o) => !o)} className="w-full flex items-center justify-between text-sm font-medium">
        <span className="inline-flex items-center gap-2"><MapPin className="size-4 text-accent" /> Delivery estimate</span>
        <ChevronDown className={`size-4 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
            <div className="pt-3 flex gap-2">
              <input
                value={pincode} onChange={(e) => setPincode(e.target.value.replace(/\D/g, "").slice(0, 6))}
                inputMode="numeric" placeholder="6-digit PIN code"
                className="flex-1 bg-background border border-border rounded-lg px-3 py-2 text-sm tracking-wider focus:outline-none focus:ring-1 focus:ring-accent"
              />
              <button onClick={submit} disabled={busy} className="px-4 rounded-lg bg-accent text-accent-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-40 inline-flex items-center gap-1.5">
                {busy ? <Loader2 className="size-3.5 animate-spin" /> : "Check"}
              </button>
            </div>
            {error && <p className="text-xs text-destructive mt-2">{error}</p>}
            {ship && (
              <div className="mt-3 rounded-xl border border-border bg-background/60 p-3 text-xs space-y-1.5">
                <p className="inline-flex items-center gap-1.5"><MapPin className="size-3 text-accent" /> {ship.city}, {ship.state}</p>
                <p className="inline-flex items-center gap-1.5"><Clock className="size-3 text-accent" /> Delivery in {ship.minDays}–{ship.maxDays} days</p>
                <p className="inline-flex items-center gap-1.5"><Truck className="size-3 text-accent" /> {ship.shippingUsd === 0 ? "Free shipping" : `Shipping ${format(ship.shippingUsd)}`}</p>
                <div className="flex gap-2 pt-1">
                  {ship.codAvailable && <span className="text-[10px] uppercase tracking-widest border border-border rounded-full px-2 py-0.5">COD available</span>}
                  {ship.expressAvailable && <span className="text-[10px] uppercase tracking-widest border border-accent/40 text-accent rounded-full px-2 py-0.5">Express eligible</span>}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
