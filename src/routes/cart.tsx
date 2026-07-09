import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence, useAnimationControls } from "framer-motion";
import {
  Minus, Plus, X, ArrowRight, ShoppingBag, Bookmark, RotateCcw, Heart,
  Truck, ShieldCheck, ChevronDown, Lock, MapPin, Clock,
  AlertTriangle, CheckCircle2, Loader2, Undo2, Sparkles, Share2, Star, Check,
} from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { openShare } from "@/lib/share";
import { refreshProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { RelatedProducts } from "@/components/site/RelatedProducts";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { estimateShipping } from "@/lib/cart.functions";
import { CouponInput, type AppliedCoupon } from "@/components/site/CouponInput";

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

  const [promo, setPromo] = useState<AutoPromo>(null);
  const [ship, setShip] = useState<ShipState>(null);

  // Mirror the auto-hide Bottom Navigation's phase so the sticky checkout dock
  // slides flush to the screen bottom when the nav hides, and returns smoothly
  // when it reappears — the exact same single-source-of-truth pattern used by
  // the product page purchase dock. Transform + opacity only (GPU-accelerated).
  const [navHidden, setNavHidden] = useState(false);
  useEffect(() => {
    if (typeof MutationObserver === "undefined") return;
    let mo: MutationObserver | undefined;
    let raf = 0;
    const sync = () => {
      const nav = document.querySelector("[data-app-bottom-nav]");
      setNavHidden(nav?.getAttribute("data-phase") === "hidden");
    };
    const attach = () => {
      const nav = document.querySelector("[data-app-bottom-nav]");
      if (!nav) { raf = requestAnimationFrame(attach); return; }
      sync();
      mo = new MutationObserver(sync);
      mo.observe(nav, { attributes: true, attributeFilter: ["data-phase"] });
    };
    attach();
    window.addEventListener("pageshow", sync);
    document.addEventListener("visibilitychange", sync);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      mo?.disconnect();
      window.removeEventListener("pageshow", sync);
      document.removeEventListener("visibilitychange", sync);
    };
  }, []);

  // Single source of truth: when the main Order Summary card is visible (even
  // partially) the floating mini checkout bar must be hidden — never both at
  // once. IntersectionObserver only (no scroll polling / reflows).
  const summaryRef = useRef<HTMLDivElement | null>(null);
  const [summaryVisible, setSummaryVisible] = useState(true);
  useEffect(() => {
    const el = summaryRef.current;
    if (!el || typeof IntersectionObserver === "undefined") return;
    // Debounce rapid intersection changes (100ms) so fast scrolling can never
    // flip both checkout UIs on/off in quick succession (no flicker / race).
    let raf = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const io = new IntersectionObserver(
      ([entry]) => {
        const next = entry.isIntersecting;
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          raf = requestAnimationFrame(() => setSummaryVisible(next));
        }, 100);
      },
      { threshold: 0 },
    );
    io.observe(el);
    return () => {
      io.disconnect();
      if (timer) clearTimeout(timer);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

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


      {/* Premium auto-dismiss undo toast */}
      <UndoToast lastRemoved={lastRemoved} onUndo={undoRemove} />


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
                            <span className="fom-price-compare block text-[11px] font-mono">{format(pr.original * item.qty)}</span>
                          )}
                          <span className="fom-price-current block text-sm font-mono">{format(pr.sale * item.qty)}</span>
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

            {detailed.length > 0 && (
              <CouponInput
                items={detailed.map((i) => ({ slug: i.slug, qty: i.qty }))}
                format={format}
                onChange={(a: AppliedCoupon | null) =>
                  setPromo(
                    a
                      ? {
                          label: a.kind === "percent" ? `Coupon ${a.code} · ${a.value}% off` : `Coupon ${a.code}`,
                          discount: a.discount,
                        }
                      : null,
                  )
                }
              />
            )}



            <div ref={summaryRef} className="bg-card border border-border rounded-2xl p-5 sm:p-6">
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
                  <AnimatedAmount value={total} format={format} className="fom-price-current font-mono text-lg" />
                </div>
              </dl>

              <div className="mt-5">
                <CheckoutButton disabled={count === 0} label="Secure Checkout" />
              </div>

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


      {/* Sticky mobile checkout bar — premium glass-dark floating dock. One
          shared visibility state, GPU transform + opacity only (no
          backdrop-filter / heavy blur). Slides flush to the screen bottom when
          the Bottom Navigation hides and returns smoothly when it reappears. */}
      <AnimatePresence>
        {count > 0 && !summaryVisible && (
          <motion.div
            className="lg:hidden fixed inset-x-0 z-[var(--z-floating-controls)] px-3 pointer-events-none will-change-transform"
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 16 }}
            transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
            style={{ bottom: "var(--product-dock-bottom)" }}
          >
            <div
              className="will-change-transform"
              style={{
                transform: navHidden
                  ? "translateY(calc(var(--product-dock-bottom) - var(--mobile-safe-bottom)))"
                  : "translateY(0)",
                transition: "transform 220ms cubic-bezier(0.22,1,0.36,1)",
              }}
            >
              <div
                className="pointer-events-auto relative overflow-hidden rounded-[24px] px-4 py-3.5 flex items-center gap-4 border border-white/[0.08]"
                style={{
                  background: "linear-gradient(150deg, oklch(0.23 0.018 60 / 0.97), oklch(0.15 0.008 40 / 0.98))",
                  boxShadow: "0 14px 36px -22px oklch(0 0 0 / 0.7), inset 0 1px 0 oklch(1 0 0 / 0.05), 0 0 30px -22px hsl(var(--accent) / 0.5)",
                }}
              >
                {/* Very soft orange ambient glow — no blur filter. */}
                <span
                  aria-hidden
                  className="pointer-events-none absolute -top-10 -left-8 h-28 w-28 rounded-full opacity-30"
                  style={{ background: "radial-gradient(closest-side, hsl(var(--accent) / 0.35), transparent)" }}
                />

                <div className="flex-1 min-w-0 leading-none relative">
                  <AnimatedAmount value={total} format={format} className="fom-price-current font-mono text-[24px] leading-none tracking-tight" />
                  <div className="flex items-center gap-1.5 mt-2 flex-wrap">
                    {shipping === 0 && <StatusChip icon={Truck} tone="accent">Free shipping</StatusChip>}
                    {totalSavings > 0 && <SavingsPill value={totalSavings} format={format} />}
                  </div>
                  <p className="text-[9px] uppercase tracking-[0.14em] text-muted-foreground/60 mt-2">Secure Payment · Easy Returns</p>
                </div>

                <div className="shrink-0 w-[44%] max-w-[172px]">
                  <CheckoutButton disabled={count === 0} label="Checkout" compact />
                </div>
              </div>

            </div>
          </motion.div>
        )}
      </AnimatePresence>


    </div>
  );
}

/** Fire a short haptic pulse on supported devices (no-op elsewhere). */
function haptic(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* unsupported */
  }
}

/**
 * Premium auto-dismissing undo toast. Appears (fade + slide down) after an item
 * is removed, auto-hides after 4s with a shrinking progress indicator, and
 * updates in place when another item is removed before it dismisses (no
 * stacking). Tapping UNDO restores the item and dismisses immediately.
 * Fixed-position + GPU transform/opacity only — no layout shift, no page move.
 */
function UndoToast({
  lastRemoved,
  onUndo,
}: {
  lastRemoved: { slug: string; qty: number; at: number } | null;
  onUndo: () => void;
}) {
  const DURATION = 4000;
  const [visible, setVisible] = useState(false);
  const [progress, setProgress] = useState(1);
  const dismissedAt = useRef<number | null>(null);
  const rafRef = useRef(0);

  useEffect(() => {
    if (!lastRemoved || lastRemoved.at === dismissedAt.current) return;
    setVisible(true);
    const start = performance.now();
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / DURATION);
      setProgress(1 - t);
      if (t < 1) {
        rafRef.current = requestAnimationFrame(tick);
      } else {
        dismissedAt.current = lastRemoved.at;
        setVisible(false);
      }
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [lastRemoved?.at]);

  function handleUndo() {
    cancelAnimationFrame(rafRef.current);
    if (lastRemoved) dismissedAt.current = lastRemoved.at;
    setVisible(false);
    haptic(12);
    onUndo();
  }

  return (
    <AnimatePresence>
      {visible && lastRemoved && (
        <motion.div
          initial={{ opacity: 0, y: -14 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -14 }}
          transition={{ duration: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="fixed left-1/2 z-[var(--z-floating-controls)] w-[calc(100%-1.5rem)] max-w-sm -translate-x-1/2 will-change-transform"
          style={{ top: "calc(env(safe-area-inset-top, 0px) + 0.75rem)" }}
        >
          <div
            className="relative overflow-hidden rounded-2xl border border-white/[0.08] px-4 py-3"
            style={{
              background: "linear-gradient(150deg, oklch(0.23 0.018 60 / 0.98), oklch(0.15 0.008 40 / 0.98))",
              boxShadow: "0 16px 40px -20px oklch(0 0 0 / 0.85), inset 0 1px 0 oklch(1 0 0 / 0.05)",
            }}
          >
            <div className="flex items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 text-sm text-foreground/90">
                <span className="grid size-6 place-items-center rounded-full bg-white/[0.06]">
                  <X className="size-3 text-muted-foreground" />
                </span>
                Item removed
              </span>
              <button
                onClick={handleUndo}
                className="inline-flex items-center gap-1.5 rounded-full bg-accent/12 px-3 py-1.5 text-[11px] font-bold uppercase tracking-widest text-accent transition hover:brightness-110 active:scale-95"
              >
                <Undo2 className="size-3.5" /> Undo
              </button>
            </div>
            {/* Remaining-time progress indicator */}
            <span
              aria-hidden
              className="absolute bottom-0 left-0 h-[3px] rounded-full bg-accent/70 will-change-[width]"
              style={{ width: `${progress * 100}%` }}
            />
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}


/**
 * Smoothly count a currency value up/down when it changes (rAF-interpolated,
 * eased). Respects reduced-motion by snapping. GPU-free, no layout shift.
 */
function AnimatedAmount({
  value, format, className,
}: {
  value: number;
  format: (n: number) => string;
  className?: string;
}) {
  const [display, setDisplay] = useState(value);
  const fromRef = useRef(value);
  const rafRef = useRef(0);

  useEffect(() => {
    const from = fromRef.current;
    const to = value;
    if (from === to) return;
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      fromRef.current = to;
      setDisplay(to);
      return;
    }
    const start = performance.now();
    const dur = 420;
    cancelAnimationFrame(rafRef.current);
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / dur);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(from + (to - from) * eased);
      if (t < 1) rafRef.current = requestAnimationFrame(tick);
      else fromRef.current = to;
    };
    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [value]);

  return <span className={className}>{format(display)}</span>;
}

/** Green savings pill that softly pulses whenever the saved amount increases. */
function SavingsPill({ value, format }: { value: number; format: (n: number) => string }) {
  const controls = useAnimationControls();
  const prev = useRef(value);
  useEffect(() => {
    if (value > prev.current) {
      controls.start({ scale: [1, 1.14, 1], transition: { duration: 0.4, ease: "easeOut" } });
    }
    prev.current = value;
  }, [value, controls]);
  return (
    <motion.span
      animate={controls}
      className="inline-flex items-center rounded-full bg-emerald-500/12 px-2 py-0.5 text-[10px] font-semibold text-emerald-400 will-change-transform"
    >
      Save {format(value)}
    </motion.span>
  );
}

/** Compact status chip for shipping / coupon / delivery ETA. */
function StatusChip({
  icon: Icon, children, tone,
}: {
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
  tone?: "accent";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-medium uppercase tracking-wide ${
        tone === "accent"
          ? "bg-accent/12 text-accent"
          : "bg-white/[0.05] text-muted-foreground"
      }`}
    >
      <Icon className="size-2.5" /> {children}
    </span>
  );
}

/**
 * Premium checkout CTA matching the Product page Buy Now feel — hover brighten,
 * press scale, tap ripple, haptics, a brief loading spinner and a success check
 * before navigating. GPU transform/opacity only; no layout shift (fixed height,
 * content swapped). First appearance emits a one-shot glow.
 */
function CheckoutButton({ disabled, label, compact }: { disabled?: boolean; label: string; compact?: boolean }) {
  const navigate = useNavigate();
  const [phase, setPhase] = useState<"idle" | "loading" | "done">("idle");
  const [ripples, setRipples] = useState<{ id: number; x: number; y: number }[]>([]);

  function spawnRipple(e: React.PointerEvent<HTMLButtonElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const id = Date.now() + Math.random();
    setRipples((r) => [...r, { id, x: e.clientX - rect.left, y: e.clientY - rect.top }]);
    window.setTimeout(() => setRipples((r) => r.filter((x) => x.id !== id)), 620);
  }

  function go() {
    if (disabled || phase !== "idle") return;
    haptic(14);
    setPhase("loading");
    window.setTimeout(() => {
      setPhase("done");
      haptic(20);
      window.setTimeout(() => navigate({ to: "/checkout" }), 320);
    }, 420);
  }

  return (
    <button
      onPointerDown={spawnRipple}
      onClick={go}
      disabled={disabled}
      aria-label={label}
      className={`group relative w-full overflow-hidden bg-accent text-accent-foreground font-bold rounded-full uppercase tracking-widest transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-50 disabled:pointer-events-none shadow-[0_0_20px_hsl(var(--accent)/0.4)] ${compact ? "min-h-[48px] text-[11px] px-4" : "min-h-[54px] text-xs px-5"} inline-flex items-center justify-center gap-2 will-change-transform`}
    >
      {/* One-shot appearance glow ring. */}
      <motion.span
        aria-hidden
        initial={{ opacity: 0.6, scale: 0.9 }}
        animate={{ opacity: 0, scale: 1.15 }}
        transition={{ duration: 1.1, ease: "easeOut" }}
        className="pointer-events-none absolute inset-0 rounded-full"
        style={{ boxShadow: "0 0 26px 4px hsl(var(--accent) / 0.55)" }}
      />

      {/* Tap ripples. */}
      {ripples.map((r) => (
        <motion.span
          key={r.id}
          aria-hidden
          initial={{ opacity: 0.45, scale: 0 }}
          animate={{ opacity: 0, scale: 4 }}
          transition={{ duration: 0.6, ease: "easeOut" }}
          className="pointer-events-none absolute rounded-full bg-white/40"
          style={{ left: r.x - 40, top: r.y - 40, width: 80, height: 80 }}
        />
      ))}

      <AnimatePresence mode="wait" initial={false}>
        {phase === "loading" ? (
          <motion.span key="loading" initial={{ opacity: 0, scale: 0.85 }} animate={{ opacity: 1, scale: 1 }} exit={{ opacity: 0, scale: 0.85 }} className="relative inline-flex items-center gap-2">
            <Loader2 className="size-4 animate-spin" />
          </motion.span>
        ) : phase === "done" ? (
          <motion.span key="done" initial={{ opacity: 0, scale: 0.6 }} animate={{ opacity: 1, scale: 1 }} className="relative inline-flex items-center gap-2">
            <Check className="size-4" strokeWidth={3} />
          </motion.span>
        ) : (
          <motion.span key="idle" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="relative inline-flex items-center gap-2 whitespace-nowrap">
            <Lock className="size-3.5" /> {label}
            <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />
          </motion.span>
        )}
      </AnimatePresence>
    </button>
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
