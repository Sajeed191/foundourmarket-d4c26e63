import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Heart, Truck, Shield, RotateCcw, Star, Minus, Plus, Loader2, Scale,
  ChevronDown, Share2, Sparkles, Package, Clock, CheckCircle2, Users, ShoppingBag as ShoppingBagIcon, BadgeCheck,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { useProduct, invalidateProducts, refreshProducts } from "@/lib/use-products";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { RelatedProducts } from "@/components/site/RelatedProducts";

import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductQA } from "@/components/site/ProductQA";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useWishlist } from "@/lib/wishlist";
import { fetchProductImages, fetchProductVariants, fetchProduct, type ProductImage, type ProductVariant } from "@/lib/products";
import { recordEvent, fetchFBT, fetchAlsoViewed } from "@/lib/personalization";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { useIsProductAdmin } from "@/lib/use-admin";
import { AdminProductPanel } from "@/components/admin/AdminProductPanel";
import { AdminImageManager } from "@/components/admin/AdminImageManager";
import { ImageLightbox } from "@/components/site/ImageLightbox";
import { toast } from "sonner";

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const product = await fetchProduct(params.slug);
    return { product };
  },
  head: ({ params, loaderData }) => {
    const p = loaderData?.product;
    const url = `https://foundourmarket.com/products/${params.slug}`;
    const title = p ? `${p.name} — FoundOurMarket™` : `${params.slug} — FoundOurMarket™`;
    const description = p
      ? (p.description?.slice(0, 160) || `${p.name} — ${p.tagline}. Shop ${p.category} on FoundOurMarket with secure checkout and worldwide delivery.`)
      : "Shop premium products on FoundOurMarket with secure checkout and worldwide delivery.";
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      { property: "og:url", content: url },
    ];
    if (p?.image) {
      meta.push({ property: "og:image", content: p.image });
      meta.push({ name: "twitter:image", content: p.image });
    }
    const scripts = p
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "Product",
              name: p.name,
              image: p.image,
              description: p.description || p.tagline,
              category: p.category,
              sku: p.sku ?? undefined,
              offers: {
                "@type": "Offer",
                price: p.price,
                priceCurrency: "USD",
                availability: p.inStock
                  ? "https://schema.org/InStock"
                  : "https://schema.org/OutOfStock",
                url,
              },
            }),
          },
          {
            type: "application/ld+json",
            children: JSON.stringify({
              "@context": "https://schema.org",
              "@type": "BreadcrumbList",
              itemListElement: [
                { "@type": "ListItem", position: 1, name: "Shop", item: "https://foundourmarket.com/" },
                { "@type": "ListItem", position: 2, name: p.category, item: `https://foundourmarket.com/category/${p.category}` },
                { "@type": "ListItem", position: 3, name: p.name, item: url },
              ],
            }),
          },
        ]
      : [];
    return { meta, links: [{ rel: "canonical", href: url }], scripts };
  },
  component: ProductPage,
});

function ProductPage() {
  const { slug } = Route.useParams();
  const { product, loading } = useProduct(slug);
  const { format, priceOf, compareOf, shippingFeeOf } = useRegion();
  const { isProductAdmin: isAdmin } = useIsProductAdmin();
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
  const [lightboxOpen, setLightboxOpen] = useState(false);

  useEffect(() => {
    if (product) {
      record(product.slug);
      recordEvent({ type: "view", productSlug: product.slug, category: product.category });
      import("@/lib/visitor").then((m) => m.trackEvent("product_view", {
        productSlug: product.slug,
        metadata: { category: product.category, price: product.price },
      })).catch(() => {});
      fetchFBT(product.slug, 4).then(setFbtSlugs);
      fetchAlsoViewed(product.slug, 6).then(setAlsoViewed);
    }
  }, [product?.slug, record]);

  useEffect(() => {
    if (!product) return;
    const hash = window.location.hash?.replace("#", "");
    if (!hash) return;
    const t = setTimeout(() => {
      document.getElementById(hash)?.scrollIntoView({ behavior: "smooth", block: "start" });
    }, 300);
    return () => clearTimeout(t);
  }, [product?.slug]);

  // Pull the latest admin pricing/shipping when the product page opens.
  useEffect(() => { refreshProducts(); }, []);

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

  const galleryImages = (() => {
    const main = { id: "main", url: product.image, alt: product.name, sortOrder: -1 };
    const extras = images.filter((img) => img.url && img.url !== product.image);
    return [main, ...extras];
  })();
  const activeImage = galleryImages[activeImg] ?? galleryImages[0];

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;
  const basePrice = priceOf(product);
  const effectivePrice = selectedVariant?.priceOverride ?? basePrice;
  const effectiveStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity;
  const effectiveSku = selectedVariant?.sku ?? product.sku;
  const unitShipping = shippingFeeOf(product);
  const lowStock = effectiveStock > 0 && effectiveStock <= product.lowStockThreshold;
  const isOOS = effectiveStock <= 0;
  const originalPrice = compareOf(product) ?? (product.discount ? effectivePrice * (1 + product.discount / 100) : null);

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
      {/* Layered cinematic ambient lighting */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 size-[36rem] rounded-full opacity-50 animate-orb" style={{ background: "var(--gradient-ember-soft)", filter: "blur(110px)" }} />
        <div className="absolute top-1/3 -right-32 size-[34rem] rounded-full opacity-40 animate-orb" style={{ background: "var(--gradient-violet)", filter: "blur(120px)", animationDelay: "-8s" }} />
      </div>
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
            className="lg:sticky lg:top-28 lg:self-start"
          >
            <div className="relative">
              {/* Cinematic ambient backlight */}
              <div aria-hidden className="absolute -inset-10 -z-10 rounded-[3rem] opacity-70 animate-pulse" style={{ background: "var(--gradient-ember-soft)", filter: "blur(80px)" }} />
              <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.5), transparent 70%)", filter: "blur(50px)" }} />
              <div className="relative aspect-square card-premium rounded-3xl overflow-hidden group shadow-[0_40px_80px_-30px_oklch(0_0_0/0.7)]">
                <AnimatePresence mode="wait">
                  <motion.img
                    key={activeImage?.id}
                    src={activeImage?.url || product.image}
                    alt={activeImage?.alt || product.name}
                    onClick={() => setLightboxOpen(true)}
                    initial={{ opacity: 0, scale: 1.04 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0 }}
                    transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                    className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-[900ms] group-hover:scale-110"
                  />
                </AnimatePresence>
                {/* Tap-to-expand hint */}
                <span className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[9px] font-mono uppercase tracking-widest text-white/80 backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100">
                  Tap to view all
                </span>
                {/* premium glass overlay gradient */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
                {/* badges */}

                {/* badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2 items-start z-10">
                  {product.featured && (
                    <span className="backdrop-blur-md bg-white/10 border border-white/15 text-white text-[10px] font-semibold font-mono px-2.5 py-1 rounded-full tracking-wider">FEATURED</span>
                  )}
                  {product.discount && (
                    <span className="bg-accent text-accent-foreground text-[10px] font-bold font-mono px-2.5 py-1 rounded-full shadow-[var(--shadow-ember)]">−{product.discount}% SALE</span>
                  )}
                  {lowStock && (
                    <span className="bg-destructive/90 text-destructive-foreground text-[10px] font-bold font-mono px-2.5 py-1 rounded-full uppercase tracking-widest">Only {effectiveStock} left</span>
                  )}
                </div>
                {/* Floating stock pill — premium glass */}
                {isOOS && (
                  <div className="absolute top-4 right-16 z-10">
                    <span className="relative flex items-center gap-1.5 backdrop-blur-xl bg-accent/15 border border-accent/30 text-accent text-[10px] font-semibold font-mono px-2.5 py-1 rounded-full uppercase tracking-widest shadow-[0_8px_30px_-8px_oklch(0.74_0.19_49/0.6)]">
                      <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                      Sold out
                    </span>
                  </div>
                )}
                <div className="absolute top-4 right-4 flex flex-col gap-2 z-10">
                  <button
                    onClick={() => toggleWishlist(product.slug)}
                    aria-label="Wishlist"
                    className={`size-10 grid place-items-center backdrop-blur-md rounded-full border transition-all ${inWishlist(product.slug) ? "bg-accent/20 border-accent/50 text-accent" : "bg-black/40 border-white/10 text-white/80 hover:text-accent hover:border-accent/50"}`}
                  >
                    <Heart className={`size-4 ${inWishlist(product.slug) ? "fill-accent" : ""}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    aria-label="Share"
                    className="size-10 grid place-items-center backdrop-blur-md bg-black/40 border border-white/10 rounded-full text-white/80 hover:text-accent hover:border-accent/50 transition-all"
                  >
                    <Share2 className="size-4" />
                  </button>
                </div>
                {isAdmin && (
                  <AdminImageManager
                    product={product}
                    images={galleryImages.filter((g) => g.id !== "main")}
                    onChanged={setImages}
                  />
                )}
              </div>
            </div>


            {galleryImages.length > 1 && (
              <div className="mt-4 grid grid-cols-5 sm:grid-cols-6 gap-2 sm:gap-3">
                {galleryImages.map((img, i) => (
                  <button
                    key={img.id}
                    onClick={() => setActiveImg(i)}
                    aria-label={`View image ${i + 1}`}
                    className={`aspect-square rounded-xl overflow-hidden border transition-all bg-card ${i === activeImg ? "border-accent ring-2 ring-accent/30 shadow-[var(--shadow-ember)]" : "border-border opacity-60 hover:opacity-100 hover:border-accent/40"}`}
                  >
                    <img src={img.url} alt={img.alt || `${product.name} — view ${i + 1}`} className="w-full h-full object-cover" loading="lazy" />
                  </button>
                ))}
              </div>
            )}

            <ImageLightbox
              images={galleryImages}
              index={activeImg}
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              onIndexChange={setActiveImg}
              alt={product.name}
            />
          </motion.div>


          {/* Info */}
          <motion.div
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent/90 mb-2.5">{product.tagline}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold tracking-tight mb-3.5 text-balance leading-[1.12]">{product.name}</h1>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <StarRating rating={product.rating} starClassName="size-3.5" glow />

              <span className="text-xs font-mono text-muted-foreground/70">{product.rating} · {product.reviews} reviews</span>
              <a href="#reviews" className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">See reviews →</a>
            </div>

            {/* subtle gradient separator */}
            <div aria-hidden className="h-px w-full mb-4 bg-gradient-to-r from-border/0 via-border/70 to-border/0" />

            <div className="flex items-baseline gap-3 sm:gap-4 mb-4 flex-wrap">
              <span className="text-4xl sm:text-5xl font-display font-semibold tracking-tight text-gradient-ember tabular-nums">{format(effectivePrice)}</span>
              {originalPrice && (
                <span className="text-sm font-mono text-muted-foreground/60 line-through decoration-muted-foreground/40">{format(originalPrice)}</span>
              )}
              {product.discount && (
                <span className="animate-save text-[10px] font-mono font-bold uppercase tracking-widest bg-accent/15 text-accent px-2.5 py-1 rounded-full border border-accent/30">Save {product.discount}%</span>
              )}
            </div>

            {isAdmin && <AdminProductPanel product={product} />}

            {/* Trust indicators */}
            <div className="grid grid-cols-2 xs:grid-cols-4 gap-2 mb-5">
              {[
                { icon: Shield, label: "Secure Checkout" },
                { icon: Truck, label: "Global Shipping" },
                { icon: RotateCcw, label: product.returnEligible ? `${product.returnWindowDays}-Day Returns` : "No Returns" },
                { icon: BadgeCheck, label: "Trusted Seller" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="flex items-center gap-1.5 text-[9px] font-mono uppercase tracking-wider text-muted-foreground/80">
                  <Icon className="size-3 text-accent shrink-0" />
                  <span className="truncate">{label}</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center gap-2 mb-5 text-[10px] font-mono uppercase tracking-widest">

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
              {effectiveSku && <span className="text-muted-foreground/60">SKU: {effectiveSku}</span>}
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
                <p className="text-sm font-medium">{unitShipping <= 0 ? "Free delivery" : `Shipping ${format(unitShipping)}`}</p>
                <p className="text-xs text-muted-foreground">Arrives <span className="text-foreground">{deliveryWindow}</span></p>
              </div>
              <Link to="/track" className="ml-auto text-[10px] font-mono uppercase tracking-widest text-accent hover:underline shrink-0">Track</Link>
            </div>

            {/* CTA row (desktop) */}
            <div className="hidden sm:flex items-center gap-3 mb-3">
              <div className="flex items-center glass rounded-full">
                <button onClick={() => setQty(Math.max(1, qty - 1))} aria-label="Decrease" className="size-12 grid place-items-center hover:text-accent transition-colors">
                  <Minus className="size-4" />
                </button>
                <span className="w-10 text-center font-mono text-sm tabular-nums">{qty}</span>
                <button onClick={() => setQty(qty + 1)} aria-label="Increase" className="size-12 grid place-items-center hover:text-accent transition-colors">
                  <Plus className="size-4" />
                </button>
              </div>
              <button
                onClick={handleAdd}
                disabled={isOOS}
                className="flex-1 bg-accent text-accent-foreground font-semibold py-3.5 rounded-full text-xs uppercase tracking-widest hover:brightness-110 hover:-translate-y-0.5 transition-all disabled:opacity-50 disabled:hover:translate-y-0 shadow-[var(--shadow-ember)]"
              >
                {isOOS ? "Out of stock" : "Add to Cart"}
              </button>
              <button
                aria-label="Compare"
                onClick={() => toggleCompare(product.slug)}
                disabled={!inCompare(product.slug) && compareFull}
                className={`size-12 grid place-items-center glass rounded-full transition-all hover:-translate-y-0.5 disabled:opacity-40 ${inCompare(product.slug) ? "text-accent border-accent/40" : "hover:text-accent"}`}
              >
                <Scale className="size-4" />
              </button>
            </div>

            <Link
              to="/cart"
              onClick={() => add(product.slug, qty)}
              className="hidden sm:block text-center w-full glass-strong text-foreground font-semibold py-3.5 rounded-full text-xs uppercase tracking-widest hover:bg-white/10 hover:-translate-y-0.5 transition-all mb-8"
            >
              Buy Now
            </Link>

            {/* Trust grid */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-6 sm:pt-8 border-t border-border">
              {[
                { icon: Truck, label: unitShipping <= 0 ? "Free shipping" : `Shipping ${format(unitShipping)}` },
                { icon: RotateCcw, label: "7 Days Return" },
                { icon: Shield, label: "Secure checkout" },
              ].map(({ icon: Icon, label }) => (
                <div key={label} className="glass rounded-2xl p-3 sm:p-4 text-center">
                  <div className="size-8 mx-auto mb-2 rounded-lg bg-accent/10 text-accent grid place-items-center">
                    <Icon className="size-3.5" />
                  </div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
                </div>
              ))}
            </div>


            {/* Specs */}
            <Accordion title="Specifications" icon={Package} defaultOpen>
              <dl className="glass rounded-2xl px-4 sm:px-5 py-1 divide-y divide-border/50">
                <SpecRow k="Category" v={product.category} />
                <SpecRow k="SKU" v={effectiveSku || "—"} />
                <SpecRow k="Rating" v={`${product.rating} / 5`} />
                <SpecRow k="Reviews" v={String(product.reviews)} />
                <SpecRow k="Availability" v={isOOS ? "Out of stock" : `${effectiveStock} in stock`} />
                <SpecRow k="Warranty" v={product.warranty || "12 months"} />
              </dl>
            </Accordion>

            <Accordion title="Shipping & returns" icon={Truck}>
              <ul className="text-sm text-muted-foreground space-y-2 leading-relaxed">
                <li>• {unitShipping <= 0 ? "Free standard shipping on this product." : `Shipping for this product: ${format(unitShipping)} per unit.`}</li>
                <li>• Standard delivery takes 5–10 business days.</li>
                <li>• Selected-product returns — check <Link to="/returns" className="text-accent underline">return eligibility</Link>.</li>
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
      <div id="questions">
        <ProductQA productSlug={product.slug} />
      </div>
      <RelatedProducts product={product} />
      

      {/* Sticky mobile purchase dock */}
      <div className="sm:hidden fixed bottom-[calc(6.25rem+env(safe-area-inset-bottom))] inset-x-0 z-40 px-3">
        <div className="rounded-2xl p-1.5 flex items-center gap-1.5 border border-white/10 shadow-[0_24px_60px_-18px_oklch(0_0_0/0.9)]" style={{ background: "linear-gradient(135deg, oklch(1 0 0 / 0.07), oklch(1 0 0 / 0.02))", backdropFilter: "blur(32px) saturate(160%)", WebkitBackdropFilter: "blur(32px) saturate(160%)" }}>
          <button
            onClick={() => toggleWishlist(product.slug)}
            aria-label={inWishlist(product.slug) ? "Remove from wishlist" : "Add to wishlist"}
            className={`size-10 grid place-items-center rounded-xl border shrink-0 transition-all active:scale-90 ${inWishlist(product.slug) ? "bg-accent/20 border-accent/50 text-accent" : "bg-white/[0.03] border-white/10 text-white/60 hover:text-accent"}`}
          >
            <Heart className={`size-4 ${inWishlist(product.slug) ? "fill-accent" : ""}`} />
          </button>
          <div className="flex flex-col leading-none px-1 shrink-0">
            <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/70">Total</span>
            <span className="text-base font-display font-semibold tabular-nums text-gradient-ember">{format(effectivePrice * qty)}</span>
          </div>
          <button
            onClick={handleAdd}
            disabled={isOOS}
            className="w-10 shrink-0 grid place-items-center bg-white/[0.04] border border-white/10 text-white/70 rounded-xl py-2.5 transition-all active:scale-90 disabled:opacity-40 hover:text-accent"
            aria-label={isOOS ? "Notify me" : "Add to cart"}
          >
            <ShoppingBagIcon className="size-4" />
          </button>
          <Link
            to="/cart"
            onClick={() => !isOOS && add(product.slug, qty)}
            aria-disabled={isOOS}
            className={`flex-1 text-center bg-accent text-accent-foreground font-bold py-2.5 rounded-xl text-xs uppercase tracking-widest transition-all active:scale-95 shadow-[var(--shadow-ember)] ${isOOS ? "pointer-events-none opacity-50" : ""}`}
          >
            {isOOS ? "Notify Me" : "Buy Now"}
          </Link>
        </div>
      </div>


    </>
  );
}


function SpecRow({ k, v }: { k: string; v: string }) {
  return (
    <div className="flex items-center justify-between gap-4 py-2.5">
      <dt className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">{k}</dt>
      <dd className="text-sm font-medium text-foreground truncate text-right">{v}</dd>
    </div>
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
