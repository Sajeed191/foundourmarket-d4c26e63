import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Heart, Truck, Shield, RotateCcw, Minus, Plus, Scale,
  ChevronDown, Share2, Sparkles, Package, Clock, CheckCircle2, Users, ShoppingBag as ShoppingBagIcon, BadgeCheck,
} from "lucide-react";
import { useState, useEffect, useMemo } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useProduct, invalidateProducts, refreshProducts } from "@/lib/use-products";
import { useAllCategories } from "@/lib/use-categories";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useLayoutMetrics } from "@/lib/layout-metrics";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { RelatedProducts } from "@/components/site/RelatedProducts";

import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductQA } from "@/components/site/ProductQA";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useWishlist } from "@/lib/wishlist";
import { fetchProductImages, fetchProductVariants, fetchProduct, discountPercent, type ProductImage, type ProductVariant } from "@/lib/products";
import { fetchActiveFaqs, type ProductFaq } from "@/lib/product-faqs";
import { recordEvent, fetchFBT, fetchAlsoViewed } from "@/lib/personalization";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { useIsProductAdmin } from "@/lib/use-admin";
import { AdminProductPanel } from "@/components/admin/AdminProductPanel";
import { AdminImageManager } from "@/components/admin/AdminImageManager";
import { ImageLightbox } from "@/components/site/ImageLightbox";
import { LazyMount } from "@/components/site/LazyMount";
import { ProductDescription } from "@/components/site/ProductDescription";
import { ProductHighlights, LiveActivity, TrustGuarantee } from "@/components/site/ProductTrustBlocks";
import { toast } from "sonner";

export const Route = createFileRoute("/products/$slug")({
  loader: async ({ params }) => {
    const product = await fetchProduct(params.slug);
    let crumbs: { name: string; href: string }[] = [];
    if (product?.category) {
      const { data: cat } = await supabase
        .from("categories")
        .select("id,slug,name,parent_id")
        .eq("slug", product.category)
        .maybeSingle();
      if (cat) {
        let parent: { slug: string; name: string } | null = null;
        if (cat.parent_id) {
          const { data: p } = await supabase
            .from("categories")
            .select("slug,name")
            .eq("id", cat.parent_id)
            .maybeSingle();
          parent = p ?? null;
        }
        if (parent) {
          crumbs = [
            { name: parent.name, href: `https://foundourmarket.com/category/${parent.slug}` },
            { name: cat.name, href: `https://foundourmarket.com/category/${parent.slug}/${cat.slug}` },
          ];
        } else {
          crumbs = [{ name: cat.name, href: `https://foundourmarket.com/category/${cat.slug}` }];
        }
      }
    }
    return { product, crumbs };
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
                ...(loaderData?.crumbs ?? []).map((c, i) => ({
                  "@type": "ListItem",
                  position: i + 2,
                  name: c.name,
                  item: c.href,
                })),
                { "@type": "ListItem", position: (loaderData?.crumbs?.length ?? 0) + 2, name: p.name, item: url },
              ],
            }),
          },
        ]
      : [];
    return { meta, links: [{ rel: "canonical", href: url }], scripts };
  },
  component: ProductPage,
});

let lastProductLayoutSnapshot: Record<string, number> | null = null;

function ProductPage() {
  const { slug } = Route.useParams();
  const { product: loadedProduct } = Route.useLoaderData();
  const { product: liveProduct, loading: liveLoading } = useProduct(slug);
  const product = liveProduct ?? loadedProduct;
  const loading = !product && liveLoading;
  const { categories: allCats } = useAllCategories();
  const breadcrumbCat = product ? allCats.find((c) => c.slug === product.category) ?? null : null;
  const breadcrumbParent = breadcrumbCat?.parent_id ? allCats.find((c) => c.id === breadcrumbCat.parent_id) ?? null : null;
  const layoutMetrics = useLayoutMetrics();
  const { format, priceOf, compareOf, shippingFeeOf, currencyReady } = useRegion();
  const { isProductAdmin: isAdmin } = useIsProductAdmin();
  // True while an admin has the full inline product editor open — used to hide
  // customer purchase UI (sticky Buy Now dock) so staff aren't shown a shopping
  // bar while editing. Customers never reach this state.
  const [editorOpen, setEditorOpen] = useState(false);
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
  // True once images + variants have resolved from the server.
  const [dataReady, setDataReady] = useState(false);
  const [mobileDockVisible, setMobileDockVisible] = useState(false);

  useEffect(() => {
    layoutMetrics.setExpectedCtaHeight(64);
    return () => layoutMetrics.setExpectedCtaHeight(0);
  }, [layoutMetrics.setExpectedCtaHeight]);

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
    const fallback = window.setTimeout(() => { if (active) setDataReady(true); }, 1200);
    setDataReady(false);
    Promise.all([fetchProductImages(slug), fetchProductVariants(slug)]).then(([imgs, vars]) => {
      if (!active) return;
      setImages(imgs);
      setVariants(vars);
      setActiveImg(0);
      setVariantId(vars[0]?.id ?? null);
      setDataReady(true);
    }).catch(() => { if (active) setDataReady(true); });
    return () => { active = false; window.clearTimeout(fallback); };
  }, [slug]);

  const deliveryWindow = useMemo(() => {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date();
    end.setDate(end.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
    return `${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`;
  }, []);

  // Deterministic social-proof numbers derived from the slug so they stay
  // stable across renders/hydration (no flicker, no SSR mismatch).
  const socialProof = useMemo(() => {
    if (!product) return null;
    const seed = product.slug.split("").reduce((a: number, c: string) => a + c.charCodeAt(0), 0);
    return {
      viewers: 12 + (seed % 40),
      sold: 5 + (seed % 24),
      addedToCart: 4 + (seed % 12),
      purchases: 2 + (seed % 6),
    };
  }, [product?.slug]);

  useEffect(() => {
    // Smart reveal: hide at the very top, reveal once the user scrolls past
    // the hero area (~200px), and keep it visible while they explore details,
    // reviews and FAQ. Scrolling up never hides it — only returning to the top.
    const REVEAL_AT = 200; // px scrolled down from top
    const HIDE_AT = 80;    // px — treated as "very top of page"
    let ticking = false;

    const evaluate = () => {
      ticking = false;
      const y = window.scrollY || document.documentElement.scrollTop || 0;
      setMobileDockVisible((prev) => {
        if (y <= HIDE_AT) return false;
        if (y >= REVEAL_AT) return true;
        return prev; // hysteresis zone — keep current state, no flicker
      });
    };

    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(evaluate);
    };

    evaluate();
    window.addEventListener("scroll", onScroll, { passive: true });
    window.addEventListener("resize", onScroll, { passive: true });
    window.visualViewport?.addEventListener("resize", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      window.removeEventListener("resize", onScroll);
      window.visualViewport?.removeEventListener("resize", onScroll);
    };
  }, [product?.slug]);

  if (loading) {
    return <ProductPageSkeleton />;
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
  const discountPct = discountPercent(effectivePrice, originalPrice);

  // The sticky purchase dock must never mount until the whole page is ready:
  // product + variants + images loaded, main image decoded, and currency
  // resolved. Combined with the scroll gate this prevents overlap, layout
  // shift and currency flicker after a refresh.
  // Hide the customer purchase dock whenever an admin is inside the inline
  // editor — they're managing the product, not shopping.
  const showPurchaseDock = dataReady && mobileDockVisible && !editorOpen;

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
      <div data-product-page data-product-phase="final" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 product-page-clearance sm:pb-24 lg:pb-16">
        {/* Breadcrumb: Home → Main → Sub → Product */}
        <nav aria-label="Breadcrumb" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-6 sm:mb-8 truncate">
          <Link to="/" className="hover:text-foreground">Shop</Link>
          {breadcrumbCat && breadcrumbParent && (
            <>
              <span className="mx-2">/</span>
              <Link to="/category/$slug" params={{ slug: breadcrumbParent.slug }} className="hover:text-foreground">{breadcrumbParent.name}</Link>
              <span className="mx-2">/</span>
              <Link to="/category/$main/$sub" params={{ main: breadcrumbParent.slug, sub: breadcrumbCat.slug }} className="hover:text-foreground">{breadcrumbCat.name}</Link>
            </>
          )}
          {breadcrumbCat && !breadcrumbParent && (
            <>
              <span className="mx-2">/</span>
              <Link to="/category/$slug" params={{ slug: breadcrumbCat.slug }} className="hover:text-foreground">{breadcrumbCat.name}</Link>
            </>
          )}
          {!breadcrumbCat && (
            <>
              <span className="mx-2">/</span>
              <Link to="/category/$slug" params={{ slug: product.category }} className="hover:text-foreground capitalize">{product.category}</Link>
            </>
          )}
          <span className="mx-2">/</span>
          <span className="text-foreground">{product.name}</span>
        </nav>


        <div data-product-hero className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 xl:gap-16">
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
              <div data-product-image className="relative aspect-square card-premium rounded-3xl overflow-hidden group shadow-[0_40px_80px_-30px_oklch(0_0_0/0.7)]">
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
                {/* Image counter (1/5) */}
                {galleryImages.length > 1 && (
                  <span className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-mono tabular-nums text-white/90 backdrop-blur-md">
                    {activeImg + 1}/{galleryImages.length}
                  </span>
                )}
                {/* premium glass overlay gradient */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
                {/* badges */}

                {/* badges */}
                <div className="absolute top-4 left-4 flex flex-col gap-2 items-start z-10">
                  {product.featured && (
                    <span className="backdrop-blur-md bg-white/10 border border-white/15 text-white text-[10px] font-semibold font-mono px-2.5 py-1 rounded-full tracking-wider">FEATURED</span>
                  )}
                  {discountPct && (
                    <span className="bg-accent text-accent-foreground text-[10px] font-bold font-mono px-2.5 py-1 rounded-full shadow-[var(--shadow-ember)]">−{discountPct}% SALE</span>
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
            data-product-info
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent/90 mb-2.5">{product.tagline}</p>
            <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display font-semibold tracking-tight mb-3.5 text-balance leading-[1.12]">{product.name}</h1>

            <div className="flex items-center gap-3 mb-4 flex-wrap">
              <StarRating
                rating={product.rating}
                count={product.reviews}
                showValue={product.reviews > 0}
                starClassName="size-3.5"
                textClassName="text-xs font-mono text-muted-foreground/70"
                glow
              />

              <a href="#reviews" className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">See reviews →</a>
            </div>

            {/* subtle gradient separator */}
            <div aria-hidden className="h-px w-full mb-4 bg-gradient-to-r from-border/0 via-border/70 to-border/0" />

            {/* Premium animated price block */}
            {currencyReady ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="mb-4"
              >
                <div className="flex items-baseline gap-3 sm:gap-4 flex-wrap">
                  <span className="text-4xl sm:text-5xl font-display font-semibold tracking-tight text-gradient-ember tabular-nums">{format(effectivePrice)}</span>
                  {originalPrice && originalPrice > effectivePrice && (
                    <span className="text-base font-mono text-muted-foreground/60 line-through decoration-muted-foreground/40">{format(originalPrice)}</span>
                  )}
                  {discountPct && (
                    <span className="animate-save text-[10px] font-mono font-bold uppercase tracking-widest bg-accent text-accent-foreground px-2.5 py-1 rounded-full shadow-[var(--shadow-ember)]">{discountPct}% OFF</span>
                  )}
                </div>
                {originalPrice && originalPrice > effectivePrice && (
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <p className="inline-flex items-center gap-1.5 text-xs font-mono font-semibold uppercase tracking-widest text-accent">
                      <Sparkles className="size-3.5" /> Save {format(originalPrice - effectivePrice)}
                    </p>
                    <span className="inline-flex items-center gap-1 rounded-full bg-destructive/15 border border-destructive/30 text-destructive px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-widest">
                      🔥 Limited Offer
                    </span>
                  </div>
                )}
              </motion.div>
            ) : (
              <div className="mb-4 space-y-2">
                <span aria-hidden className="block h-11 sm:h-12 w-40 rounded-xl bg-white/[0.06] animate-pulse" />
                <span aria-hidden className="block h-4 w-24 rounded bg-white/[0.05] animate-pulse" />
              </div>
            )}

            {/* Social proof / urgency strip */}
            {socialProof && (
              <div className="mb-5 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-muted-foreground/90">
                  <Users className="size-3 text-accent" /> {socialProof.viewers} viewing today
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-muted-foreground/90">
                  <ShoppingBagIcon className="size-3 text-accent" /> {socialProof.sold} sold this week
                </span>
                <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-accent">
                  <Sparkles className="size-3" /> Trending
                </span>
              </div>
            )}

            {/* Live activity badges */}
            {socialProof && (
              <div className="mb-5">
                <LiveActivity viewers={socialProof.viewers} addedToCart={socialProof.addedToCart} purchases={socialProof.purchases} />
              </div>
            )}

            {isAdmin && <AdminProductPanel product={product} onOpenChange={setEditorOpen} />}

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

            <div data-product-sticky-threshold aria-hidden className="h-px w-full" />

            {/* Trust grid — each links to its policy page */}
            <div className="grid grid-cols-3 gap-2 sm:gap-3 pt-6 sm:pt-8 border-t border-border">
              {[
                { icon: Truck, label: unitShipping <= 0 ? "Free shipping" : `Shipping ${format(unitShipping)}`, to: "/pages/shipping" },
                { icon: RotateCcw, label: product.returnEligible ? `${product.returnWindowDays} Days Return` : "No Returns", to: "/returns" },
                { icon: Shield, label: "Buyer Protection", to: "/buyer-protection" },
              ].map(({ icon: Icon, label, to }) => (
                <Link key={label} to={to as never} className="glass rounded-2xl p-3 sm:p-4 text-center hover:border-accent/40 transition-colors">
                  <div className="size-8 mx-auto mb-2 rounded-lg bg-accent/10 text-accent grid place-items-center">
                    <Icon className="size-3.5" />
                  </div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground leading-tight">{label}</p>
                </Link>
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
                {product.returnEligible ? (
                  <li>• Returns &amp; refunds accepted within {product.returnWindowDays} days of delivery — check <Link to="/returns" className="text-accent underline">return eligibility</Link>.</li>
                ) : (
                  <li>• This product is not eligible for returns or refunds.</li>
                )}
                {product.returnEligible && product.replacementEligible && (
                  <li>• Eligible for replacement within {product.returnWindowDays} days of delivery.</li>
                )}
              </ul>
            </Accordion>


            <Accordion title="FAQ" icon={Sparkles}>
              <ProductFaqList slug={product.slug} />
            </Accordion>

          </motion.div>
        </div>
      </div>

      {/* Recommendations — deferred until they near the viewport so the core
          product info paints first and below-the-fold work is progressive. */}
      <ProductLayoutDiagnostics phase="final" />
      <LazyMount minHeight={320} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div data-product-recommendations>
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
      </LazyMount>

      <LazyMount minHeight={352} className="scroll-mt-24" id="reviews">
        <div data-product-reviews>
          <ProductReviews productSlug={product.slug} onAggregateChange={invalidateProducts} />
        </div>
      </LazyMount>
      <LazyMount minHeight={192} className="scroll-mt-24" id="questions">
        <div data-product-questions>
          <ProductQA productSlug={product.slug} />
        </div>
      </LazyMount>
      <LazyMount minHeight={384}>
        <div data-product-related>
          <RelatedProducts product={product} />
        </div>
      </LazyMount>
      <LazyMount minHeight={260}>
        <ProductHighlights />
      </LazyMount>
      <LazyMount minHeight={260}>
        <TrustGuarantee />
      </LazyMount>
      <div aria-hidden className="sm:hidden h-[var(--product-page-bottom-clearance)]" />
      

      {/* Sticky mobile purchase dock — only mounts once the page is fully
          initialized and the user has scrolled past the hero. */}
      {showPurchaseDock && (
      <div ref={layoutMetrics.setCtaElement} data-app-cta data-product-cta data-floating-control className="sm:hidden fixed inset-x-0 z-[var(--z-floating-controls)] h-[var(--product-dock-height)] px-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-300" style={{ bottom: "var(--product-dock-bottom)" }}>
        <div className="flex h-full items-center gap-1.5 rounded-2xl border border-white/10 p-1.5 shadow-[0_24px_60px_-18px_oklch(0_0_0/0.9)]" style={{ background: "linear-gradient(135deg, oklch(1 0 0 / 0.07), oklch(1 0 0 / 0.02))", backdropFilter: "blur(32px) saturate(160%)", WebkitBackdropFilter: "blur(32px) saturate(160%)" }}>
          <button
            onClick={() => toggleWishlist(product.slug)}
            aria-label={inWishlist(product.slug) ? "Remove from wishlist" : "Add to wishlist"}
            className={`size-10 grid place-items-center rounded-xl border shrink-0 transition-all active:scale-90 ${inWishlist(product.slug) ? "bg-accent/20 border-accent/50 text-accent" : "bg-white/[0.03] border-white/10 text-white/60 hover:text-accent"}`}
          >
            <Heart className={`size-4 ${inWishlist(product.slug) ? "fill-accent" : ""}`} />
          </button>
          <div className="flex flex-col leading-none px-1 shrink-0">
            <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/70">Total</span>
            {currencyReady ? (
              <span className="text-base font-display font-semibold tabular-nums text-gradient-ember">{format(effectivePrice * qty)}</span>
            ) : (
              <span aria-hidden className="mt-0.5 h-4 w-14 rounded bg-white/[0.08] animate-pulse" />
            )}
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
      )}


    </>
  );
}


function ProductLayoutDiagnostics({ phase }: { phase: "loading" | "final" }) {
  useEffect(() => {
    if (!import.meta.env.DEV || typeof window === "undefined") return;
    const selectors = {
      pageHeight: "body",
      contentHeight: "[data-product-page]",
      heroHeight: "[data-product-hero]",
      imageHeight: "[data-product-image]",
      infoHeight: "[data-product-info]",
      ctaHeight: "[data-product-cta]",
      navHeight: "[data-app-bottom-nav]",
      reviewsHeight: "[data-product-reviews]",
      questionsHeight: "[data-product-questions]",
      relatedHeight: "[data-product-related]",
    } as const;
    const read = () =>
      Object.fromEntries(
        Object.entries(selectors).map(([key, selector]) => {
          const el = document.querySelector<HTMLElement>(selector);
          return [key, Math.round(el?.getBoundingClientRect().height ?? 0)];
        }),
      ) as Record<string, number>;
    const frame = requestAnimationFrame(() => {
      const current = read();
      const delta = lastProductLayoutSnapshot
        ? Object.fromEntries(Object.entries(current).map(([key, value]) => [key, value - (lastProductLayoutSnapshot?.[key] ?? 0)]))
        : null;
      console.debug(`[product-layout] ${phase}`, { ...current, delta });
      lastProductLayoutSnapshot = current;
    });
    return () => cancelAnimationFrame(frame);
  }, [phase]);

  return null;
}


function ProductPageSkeleton() {
  return (
    <>
    <div data-product-page data-product-phase="loading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-6 sm:pt-8 product-page-clearance sm:pb-24 lg:pb-16" aria-busy="true">
      <ProductLayoutDiagnostics phase="loading" />
      <div className="mb-6 h-3 w-44 rounded-full bg-white/[0.05] animate-pulse" />
      <div data-product-hero className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-12 xl:gap-16">
        <div className="space-y-4">
          <div data-product-image className="aspect-square rounded-3xl border border-border bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-5 gap-2 sm:grid-cols-6 sm:gap-3">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="aspect-square rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
        </div>
        <div data-product-info className="space-y-5 min-h-[65rem] lg:min-h-0">
          <div className="h-3 w-32 rounded-full bg-accent/20 animate-pulse" />
          <div className="h-11 w-4/5 rounded-2xl bg-white/[0.06] animate-pulse" />
          <div className="h-4 w-52 rounded-full bg-white/[0.05] animate-pulse" />
          <div className="h-px w-full bg-border/70" />
          <div className="h-12 w-44 rounded-2xl bg-white/[0.06] animate-pulse" />
          <div className="grid grid-cols-4 gap-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-8 rounded-xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
          <div className="h-20 rounded-2xl bg-white/[0.04] animate-pulse" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-11/12 rounded bg-white/[0.04] animate-pulse" />
            <div className="h-4 w-3/5 rounded bg-white/[0.04] animate-pulse" />
          </div>
          <div className="grid grid-cols-3 gap-2">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="h-24 rounded-2xl bg-white/[0.04] animate-pulse" />
            ))}
          </div>
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="border-t border-border pt-6">
              <div className="h-5 w-40 rounded bg-white/[0.05] animate-pulse" />
              <div className="mt-4 h-28 rounded-2xl bg-white/[0.04] animate-pulse" />
            </div>
          ))}
        </div>
      </div>
    </div>
    <div data-product-recommendations className="max-w-7xl mx-auto min-h-0 px-4 sm:min-h-[20rem] sm:px-6 lg:px-8" />
    <div data-product-reviews className="min-h-[27rem]" />
    <div data-product-questions className="min-h-[38rem]" />
    <div data-product-related className="min-h-[30rem]" />
    <div aria-hidden className="sm:hidden h-[var(--product-page-bottom-clearance)]" />
    <div data-product-cta data-floating-control className="sm:hidden fixed inset-x-0 z-[var(--z-floating-controls)] h-[var(--product-dock-height)] px-3" style={{ bottom: "var(--product-dock-bottom)" }}>
      <div className="flex h-full items-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] p-1.5 backdrop-blur-2xl">
        <div className="size-10 shrink-0 rounded-xl bg-white/[0.05] animate-pulse" />
        <div className="h-8 w-16 shrink-0 rounded-lg bg-white/[0.05] animate-pulse" />
        <div className="size-10 shrink-0 rounded-xl bg-white/[0.05] animate-pulse" />
        <div className="h-10 flex-1 rounded-xl bg-accent/20 animate-pulse" />
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
      <p className="text-muted-foreground mt-1 leading-relaxed whitespace-pre-wrap break-words">{a}</p>
    </div>
  );
}

function ProductFaqList({ slug }: { slug: string }) {
  const [faqs, setFaqs] = useState<ProductFaq[] | null>(null);
  const [error, setError] = useState(false);

  useEffect(() => {
    let active = true;
    setFaqs(null);
    setError(false);
    fetchActiveFaqs(slug)
      .then((data) => active && setFaqs(data))
      .catch(() => active && setError(true));
    return () => {
      active = false;
    };
  }, [slug]);

  if (error) {
    return <p className="text-sm text-muted-foreground">Couldn't load FAQs right now.</p>;
  }
  if (faqs === null) {
    return <p className="text-sm text-muted-foreground">Loading FAQs…</p>;
  }
  if (faqs.length === 0) {
    return <p className="text-sm text-muted-foreground">No FAQs available.</p>;
  }
  return (
    <div className="space-y-4 text-sm">
      {faqs.map((f) => (
        <Faq key={f.id} q={f.question} a={f.answer} />
      ))}
    </div>
  );
}

