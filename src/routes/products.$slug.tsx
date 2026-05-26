import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Heart, Truck, Shield, RotateCcw, Star, Minus, Plus, Loader2, Scale,
  ChevronDown, Share2, Sparkles, Package, Clock, CheckCircle2, Users, ShoppingBag as ShoppingBagIcon,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProduct, invalidateProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { RelatedProducts } from "@/components/site/RelatedProducts";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductQA } from "@/components/site/ProductQA";
import { useCompare } from "@/hooks/use-compare";
import { useWishlist } from "@/lib/wishlist";
import { fetchProductImages, fetchProductVariants, type ProductImage, type ProductVariant } from "@/lib/products";
import { recordEvent, fetchFBT, fetchAlsoViewed } from "@/lib/personalization";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { toast } from "sonner";

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
  const { has: inWishlist, toggle: toggleWishlist } = useWishlist();
  const [qty, setQty] = useState(1);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [activeImg, setActiveImg] = useState(0);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [fbtSlugs, setFbtSlugs] = useState<string[]>([]);
  const [alsoViewed, setAlsoViewed] = useState<string[]>([]);

  useEffect(() => {
    if (product) {
      record(product.slug);
      recordEvent({ type: "view", productSlug: product.slug, category: product.category });
      fetchFBT(product.slug, 4).then(setFbtSlugs);
      fetchAlsoViewed(product.slug, 6).then(setAlsoViewed);
    }
  }, [product?.slug, record]);

  useEffect(() => {
    if (!slug) return;
    let active = true;
    Promise.all([fetchProductImages(slug), fetchProductVariants(slug)]).then(([imgs, vars]) => {
      if (!active) return;
      setImages(imgs);
      setVariants(vars);
      setActiveImg(0);
      setVariantId(vars[0]?.id ?? null);
    });
    return () => { active = false; };
  }, [slug]);

  const deliveryWindow = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date();
    end.setDate(end.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }, []);

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

  const galleryImages = images.length > 0
    ? images
    : [{ id: "main", url: product.image, alt: product.name, sortOrder: 0 }];
  const activeImage = galleryImages[activeImg] ?? galleryImages[0];

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;
  const effectivePrice = selectedVariant?.priceOverride ?? product.price;
  const effectiveStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity;
  const effectiveSku = selectedVariant?.sku ?? product.sku;
  const lowStock = effectiveStock > 0 && effectiveStock <= product.lowStockThreshold;
  const isOOS = effectiveStock <= 0;
  const originalPrice = product.discount ? effectivePrice * (1 + product.discount / 100) : null;

  const handleAdd = () => {
    add(product.slug, qty);
    toast.success(`${product.name} added to cart`);
  };
  const handleShare = async () => {
    const url = typeof window !== "undefined" ? window.location.href : "";
    if (typeof navigator !== "undefined" && navigator.share) {
      try { await navigator.share({ title: product.name, text: product.tagline, url }); } catch { /* cancelled */ }
    } else if (typeof navigator !== "undefined" && navigator.clipboard) {
      await navigator.clipboard.writeText(url);
      toast.success("Link copied");
    }
  };

  return (
    <>
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 pb-24 lg:pb-16">
        {/* Breadcrumb */}
        <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-6 sm:mb-8 truncate">
          <Link to="/" className="hover:text-foreground">Shop</Link>
          <span className="mx-2">/</span>
          <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-foreground">{product.category}</Link>
          <span className="mx-2">/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 xl:gap-16">
          {/* Gallery */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
            className="lg:sticky lg:top-24 lg:self-start"
          >
            <div className="relative aspect-square bg-card rounded-2xl sm:rounded-3xl overflow-hidden border border-border group">
              <AnimatePresence mode="wait">
                <motion.img
                  key={activeImage?.id}
                  src={activeImage?.url || product.image}
                  alt={activeImage?.alt || product.name}
                  initial={{ opacity: 0, scale: 1.02 }}
                  animate={{ opacity: 1, scale: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.3 }}
                  className="absolute inset-0 w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                />
              </AnimatePresence>
              {/* badges */}
              <div className="absolute top-3 left-3 sm:top-4 sm:left-4 flex flex-col gap-2 items-start z-10">
                {product.featured && (
                  <span className="bg-foreground text-background text-[10px] font-bold font-mono px-2.5 py-1 rounded-full uppercase tracking-widest">Featured</span>
                )}
                {product.discount && (
                  <span className="bg-accent text-accent-foreground text-[10px] font-bold font-mono px-2.5 py-1 rounded-full">−{product.discount}% Sale</span>
                )}
                {lowStock && (
                  <span className="bg-destructive/90 text-destructive-foreground text-[10px] font-bold font-mono px-2.5 py-1 rounded-full uppercase tracking-widest">Only {effectiveStock} left</span>
                )}
              </div>
              <div className="absolute top-3 right-3 sm:top-4 sm:right-4 flex flex-col gap-2 z-10">
                <button
                  onClick={() => toggleWishlist(product.slug)}
                  aria-label="Wishlist"
                  className={`size-10 grid place-items-center bg-black/50 backdrop-blur-md rounded-full transition-colors ${inWishlist(product.slug) ? "text-accent" : "text-white/80 hover:text-accent"}`}
                >
                  <Heart className={`size-4 ${inWishlist(product.slug) ? "fill-accent" : ""}`} />
                </button>
                <button
                  onClick={handleShare}
                  aria-label="Share"
                  className="size-10 grid place-items-center bg-black/50 backdrop-blur-md rounded-full text-white/80 hover:text-accent transition-colors"
                >
                  <Share2 className="size-4" />
                </button>
              </div>
            </div>

            {galleryImages.length > 1 && (
              <div className="mt-3 sm:mt-4 grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3">
                {galleryImages.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImg(i)}
                    aria-label={`View image ${i + 1}`}
                    className={`aspect-square rounded-lg sm:rounded-xl overflow-hidden border transition-all bg-card ${i === activeImg ? "border-accent ring-1 ring-accent/40" : "border-border opacity-60 hover:opacity-100"}`}
                  >
                    <img src={img.url} alt={img.alt || ""} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}
          </motion.div>

          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">{product.tagline}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold tracking-tight mb-4 text-balance">{product.name}</h1>

            <div className="flex items-center gap-3 mb-6 flex-wrap">
              <div className="flex items-center gap-1">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Star key={i} className={`size-3.5 ${i < Math.round(product.rating) ? "fill-accent text-accent" : "text-muted-foreground"}`} />
                ))}
              </div>
              <span className="text-xs font-mono text-muted-foreground">{product.rating} · {product.reviews} reviews</span>
              <a href="#reviews" className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">See reviews →</a>
            </div>

            <div className="flex items-baseline gap-3 sm:gap-4 mb-4 flex-wrap">
              <span className="text-3xl sm:text-4xl font-mono text-accent">{format(effectivePrice)}</span>
              {originalPrice && (
                <span className="text-sm font-mono text-muted-foreground line-through">{format(originalPrice)}</span>
              )}
              {product.discount && (
                <span className="text-[10px] font-mono uppercase tracking-widest bg-accent/15 text-accent px-2 py-1 rounded-full">Save {product.discount}%</span>
              )}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-6 text-[10px] font-mono uppercase tracking-widest">
              {isOOS ? (
                <span className="px-2.5 py-1 rounded-full bg-muted text-muted-foreground">Out of stock</span>
              ) : lowStock ? (
                <span className="px-2.5 py-1 rounded-full bg-accent/15 text-accent flex items-center gap-1.5">
                  <span className="size-1.5 rounded-full bg-accent animate-pulse" /> Only {effectiveStock} left
                </span>
              ) : (
                <span className="px-2.5 py-1 rounded-full bg-accent/10 text-accent flex items-center gap-1.5">
                  <CheckCircle2 className="size-3" /> In stock
                </span>
              )}
              {effectiveSku && <span className="text-muted-foreground">SKU: {effectiveSku}</span>}
            </div>

            {/* Variants */}
            {variants.length > 0 && (
              <div className="mb-6">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Variant</p>
                <div className="flex flex-wrap gap-2">
                  {variants.map((v) => {
                    const sel = v.id === variantId;
                    const oos = v.stockQuantity <= 0;
                    return (
                      <button
                        key={v.id}
                        onClick={() => !oos && setVariantId(v.id)}
                        disabled={oos}
                        className={`px-4 py-2 rounded-full text-xs border transition-colors ${sel ? "border-accent text-accent bg-accent/10" : "border-border hover:border-accent/50"} disabled:opacity-40 disabled:cursor-not-allowed disabled:line-through`}
                      >
                        {v.name}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            <p className="text-muted-foreground leading-relaxed mb-6">{product.description}</p>

            {/* Delivery */}
            <div className="mb-6 rounded-2xl border border-border bg-card/50 p-4 flex items-start gap-3">
              <div className="size-9 rounded-full grid place-items-center bg-accent/10 text-accent shrink-0">
                <Truck className="size-4" />
              </div>
              <div className="min-w-0">
                <p className="text-sm font-medium">Free delivery</p>
                <p className="text-xs text-muted-foreground">Arrives <span className="text-foreground">{deliveryWindow}</span></p>
              </div>
              <Link to="/track" className="ml-auto text-[10px] font-mono uppercase tracking-widest text-accent hover:underline shrink-0">Track</Link>
            </div>

            {/* CTA row (desktop) */}
            <div className="hidden sm:flex items-center gap-3 mb-4">
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
                onClick={handleAdd}
                disabled={isOOS}
                className="flex-1 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
              >
                {isOOS ? "Out of stock" : "Add to Cart"}
              </button>
              <button
                aria-label="Compare"
                onClick={() => toggleCompare(product.slug)}
                disabled={!inCompare(product.slug) && compareFull}
                className={`size-12 grid place-items-center border rounded-full transition-colors disabled:opacity-40 ${inCompare(product.slug) ? "border-accent text-accent bg-accent/10" : "border-border hover:text-accent"}`}
              >
                <Scale className="size-4" />
              </button>
            </div>

            <Link
              to="/cart"
              onClick={() => add(product.slug, qty)}
              className="hidden sm:block text-center w-full bg-foreground text-background font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all mb-8"
            >
              Buy Now
            </Link>

            {/* Trust grid */}
            <div className="grid grid-cols-3 gap-3 sm:gap-4 pt-6 sm:pt-8 border-t border-border">
              {[
                { icon: Truck, label: "Free shipping over $50" },
                { icon: RotateCcw, label: "30-day returns" },
                { icon: Shield, label: "Secure checkout" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="text-center">
                  <Icon className="size-4 mx-auto mb-2 text-accent" />
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-relaxed">{label}</p>
                </div>
              ))}
            </div>

            {/* Specs */}
            <Accordion title="Specifications" icon={Package} defaultOpen>
              <dl className="grid grid-cols-2 gap-x-6 gap-y-3 text-sm">
                <SpecRow k="Category" v={product.category} />
                <SpecRow k="SKU" v={effectiveSku || "—"} />
                <SpecRow k="Rating" v={`${product.rating} / 5`} />
                <SpecRow k="Reviews" v={String(product.reviews)} />
                <SpecRow k="Availability" v={isOOS ? "Out of stock" : `${effectiveStock} in stock`} />
                <SpecRow k="Warranty" v="12 months" />
              </dl>
            </Accordion>

            <Accordion title="Shipping & returns" icon={Truck}>
              <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <li>• Free standard shipping on orders over $50.</li>
                <li>• Express delivery available at checkout (1–2 business days).</li>
                <li>• 30-day hassle-free returns — see <Link to="/account/returns" className="text-accent underline">returns policy</Link>.</li>
              </ul>
            </Accordion>

            <Accordion title="FAQ" icon={Sparkles}>
              <div className="space-y-4 text-sm">
                <Faq q="Is this item authentic?" a="Yes. Every product is sourced directly from the brand or a verified distributor." />
                <Faq q="What's the warranty?" a="A 12-month limited warranty covers manufacturing defects." />
                <Faq q="Can I cancel my order?" a="Yes — within 1 hour of placing your order, from your account." />
              </div>
            </Accordion>
          </motion.div>
        </div>
      </div>

      {/* Recommendations */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        {fbtSlugs.length > 0 && (
          <RecommendationStrip
            title="Frequently bought together"
            subtitle="Customers commonly purchase these in the same order"
            icon={<ShoppingBagIcon className="size-3" />}
            slugs={fbtSlugs}
          />
        )}
        {alsoViewed.length > 0 && (
          <RecommendationStrip
            title="Customers also viewed"
            icon={<Users className="size-3" />}
            slugs={alsoViewed}
          />
        )}
      </div>

      <div id="reviews">
        <ProductReviews productSlug={product.slug} onAggregateChange={invalidateProducts} />
      </div>
      <ProductQA productSlug={product.slug} />
      <RelatedProducts product={product} />
      <RecentlyViewed excludeSlug={product.slug} />

      {/* Sticky mobile CTA */}
      <div className="sm:hidden fixed bottom-16 inset-x-0 z-40 bg-background/95 backdrop-blur-xl border-t border-border px-4 py-3 pb-[calc(env(safe-area-inset-bottom)+0.75rem)]">
        <div className="flex items-center gap-2">
          <div className="flex items-center border border-border rounded-full">
            <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease" className="size-10 grid place-items-center">
              <Minus className="size-4" />
            </button>
            <span className="w-7 text-center font-mono text-sm">{qty}</span>
            <button onClick={() => setQty(qty + 1)} aria-label="Increase" className="size-10 grid place-items-center">
              <Plus className="size-4" />
            </button>
          </div>
          <button
            onClick={handleAdd}
            disabled={isOOS}
            className="flex-1 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest disabled:opacity-50"
          >
            {isOOS ? "Out of stock" : `Add — ${format(effectivePrice * qty)}`}
          </button>
        </div>
      </div>
    </>
  );
}

function SpecRow({ k, v }: { k: string; v: string }) {
  return (
    <>
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground self-center">{k}</dt>
      <dd className="text-foreground truncate">{v}</dd>
    </>
  );
}

function Accordion({ title, icon: Icon, defaultOpen = false, children }: { title: string; icon: typeof Package; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t border-border mt-6 pt-6">
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center justify-between w-full group"
        aria-expanded={open}
      >
        <span className="flex items-center gap-2 text-sm font-medium">
          <Icon className="size-4 text-accent" /> {title}
        </span>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform group-hover:text-accent ${open ? "rotate-180" : ""}`} />
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.25, ease: [0.16, 1, 0.3, 1] }}
            className="overflow-hidden"
          >
            <div className="pt-4">{children}</div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Faq({ q, a }: { q: string; a: string }) {
  return (
    <div>
      <p className="font-medium flex items-center gap-2"><Clock className="size-3.5 text-accent" /> {q}</p>
      <p className="text-muted-foreground mt-1 leading-relaxed">{a}</p>
    </div>
  );
}
