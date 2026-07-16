import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Heart, Truck, Shield, RotateCcw, Minus, Plus, Scale,
  ChevronDown, Share2, Sparkles, Package, Clock, CheckCircle2, Users, ShoppingBag as ShoppingBagIcon, Play, Layers, Info,
  ShoppingCart, Zap, Check, Loader2, Lock,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useProduct, invalidateProducts, refreshProducts } from "@/lib/use-products";
import { openShare, toPreviewImage } from "@/lib/share";
import { useAllCategories } from "@/lib/use-categories";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useBuyNow } from "@/lib/use-buy-now";
import { useLayoutMetrics } from "@/lib/layout-metrics";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { RelatedProducts } from "@/components/site/RelatedProducts";

import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductQA } from "@/components/site/ProductQA";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useWishlist } from "@/lib/wishlist";
import { fetchProductImages, fetchProductVariants, fetchProduct, discountPercent, type ProductImage, type ProductVariant } from "@/lib/products";
import { fetchPublicColorGalleries, type VariantImage } from "@/lib/variant-images";
import { computeBadges, DEFAULT_BADGE_SETTINGS } from "@/lib/badges";
import { ProductBadge, ProductBadgeAnchor } from "@/components/ui/ProductBadge";
import { fetchActiveFaqs, type ProductFaq } from "@/lib/product-faqs";
import { recordEvent, fetchFBT, fetchAlsoViewed } from "@/lib/personalization";
import { recordViewedPrice } from "@/lib/viewed-prices";
import { RecommendationStrip } from "@/components/site/RecommendationStrip";
import { RecommendedForYou } from "@/components/site/RecommendedForYou";
import { RecentlyViewed } from "@/components/site/RecentlyViewed";
import { PDPRecommendations } from "@/components/site/PDPRecommendations";
const PDPRelationshipSections = lazy(() =>
  import("@/components/site/PDPRelationshipSections").then((m) => ({
    default: m.PDPRelationshipSections,
  })),
);
import { fetchProductsBySlugs, type Product } from "@/lib/products";
import { useIsProductAdmin } from "@/lib/use-admin";
// Admin-only editors: lazy so customers never download the heavy admin graph
// (framer-motion menus, server-fn clients) on a product page. Gated by isAdmin.
const AdminProductPanel = lazy(() =>
  import("@/components/admin/AdminProductPanel").then((m) => ({ default: m.AdminProductPanel })),
);
const AdminImageManager = lazy(() =>
  import("@/components/admin/AdminImageManager").then((m) => ({ default: m.AdminImageManager })),
);
import { ImageLightbox, type LightboxMedia } from "@/components/site/ImageLightbox";
import { resizedStorageImage } from "@/lib/storage-image";
import { VariantSelector } from "@/components/site/VariantSelector";
import { LazyMount } from "@/components/site/LazyMount";
import { ProductDescription } from "@/components/site/ProductDescription";
import { ProductInfoPanel } from "@/components/site/ProductInfoPanel";
import { TrustGuarantee } from "@/components/site/ProductTrustBlocks";
import { formatSold } from "@/lib/format-sold";
import { SellerTrustCard, ProductComparison } from "@/components/site/ProductSellerTrust";
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
    // Prefer stored, auto-generated SEO fields; never overwrite — only fall back.
    const title = p
      ? (p.seoTitle?.trim() || `Buy ${p.name} Online | FoundOurMarket™`)
      : `FoundOurMarket™ | Premium Global Marketplace`;
    const description = p
      ? (p.seoDescription?.trim()
          || p.description?.slice(0, 160)
          || `${p.name} — ${p.tagline}. Shop ${p.category} on FoundOurMarket with secure checkout and worldwide delivery.`)
      : "Shop premium products on FoundOurMarket with secure checkout and worldwide delivery.";
    const imageAlt = p ? `${p.name} — Product Image` : "Product Image";
    const keywords = p?.metaKeywords?.length ? p.metaKeywords.join(", ") : undefined;
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      ...(keywords ? [{ name: "keywords", content: keywords }] : []),
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "product" },
      { property: "og:url", content: url },
      { property: "og:site_name", content: "FoundOurMarket" },
      { name: "twitter:title", content: title },
      { name: "twitter:description", content: description },
      { name: "twitter:card", content: "summary_large_image" },
    ];
    if (p?.image) {
      const previewImage = toPreviewImage(p.image);
      meta.push({ property: "og:image", content: previewImage });
      meta.push({ property: "og:image:alt", content: imageAlt });
      meta.push({ property: "og:image:width", content: "800" });
      meta.push({ name: "twitter:image", content: previewImage });
      meta.push({ name: "twitter:image:alt", content: imageAlt });
    }
    const hasRating = !!p && Number(p.reviews) > 0 && Number(p.rating) > 0;
    const productLd: Record<string, unknown> | null = p
      ? {
          "@context": "https://schema.org",
          "@type": "Product",
          name: p.name,
          image: p.image ? [p.image] : undefined,
          description: p.seoDescription || p.description || p.tagline,
          category: p.category,
          sku: p.sku ?? undefined,
          mpn: p.sku ?? undefined,
          brand: { "@type": "Brand", name: p.brand?.trim() || "FoundOurMarket" },
          url,
          offers: {
            "@type": "Offer",
            // Stable, crawler-facing USD offer — matches the Merchant feed
            // (price_usd). Never region-dynamic, to avoid unstable schema.
            price: p.priceUsd ?? p.price,
            priceCurrency: "USD",
            availability: p.inStock
              ? "https://schema.org/InStock"
              : "https://schema.org/OutOfStock",
            url,
            seller: { "@type": "Organization", name: "FoundOurMarket" },
          },
          ...(hasRating
            ? {
                aggregateRating: {
                  "@type": "AggregateRating",
                  ratingValue: Number(p.rating).toFixed(1),
                  reviewCount: p.reviews,
                  bestRating: 5,
                  worstRating: 1,
                },
              }
            : {}),
        }
      : null;
    const scripts = p
      ? [
          {
            type: "application/ld+json",
            children: JSON.stringify(productLd),
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
  const { format, priceOf, compareOf, shippingFeeOf, currencyReady, market } = useRegion();
  const { isProductAdmin: isAdmin } = useIsProductAdmin();
  // True while an admin has the full inline product editor open — used to hide
  // customer purchase UI (sticky Buy Now dock) so staff aren't shown a shopping
  // bar while editing. Customers never reach this state.
  const [editorOpen, setEditorOpen] = useState(false);
  const { add, items: cartItems, setQty: cartSetQty, remove: cartRemove } = useCart();
  const buyNow = useBuyNow();
  const { record } = useRecentlyViewed();
  const { has: inCompare, toggle: toggleCompare, isFull: compareFull } = useCompare();
  const { has: inWishlist, toggle: toggleWishlist } = useWishlist();
  
  // Purchase-button UI states (visual only — underlying cart/buy-now logic unchanged).
  const [addState, setAddState] = useState<"idle" | "loading" | "success">("idle");
  const [buyState, setBuyState] = useState<"idle" | "loading">("idle");
  const addTimers = useRef<ReturnType<typeof setTimeout>[]>([]);
  useEffect(() => () => addTimers.current.forEach(clearTimeout), []);
  const [images, setImages] = useState<ProductImage[]>([]);
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  // Per-colour galleries, keyed by lowercased colour name. Empty when the
  // product has no colour galleries (falls back to the default gallery).
  const [colorGalleries, setColorGalleries] = useState<Record<string, VariantImage[]>>({});
  const [activeImg, setActiveImg] = useState(0);
  // Natural aspect ratio (w/h) of the currently displayed image. Drives the
  // main media container so it sizes to the image itself — no cropping and no
  // unused blank space — while a sensible fallback reserves height (no CLS).
  const [mediaAspect, setMediaAspect] = useState<number | null>(null);
  const thumbStripRef = useRef<HTMLDivElement>(null);
  const [variantId, setVariantId] = useState<string | null>(null);
  const [fbtSlugs, setFbtSlugs] = useState<string[]>([]);
  const [alsoViewed, setAlsoViewed] = useState<string[]>([]);
  const [fbtProducts, setFbtProducts] = useState<Product[]>([]);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  // True once images + variants have resolved from the server.
  const [dataReady, setDataReady] = useState(false);
  const [mobileDockVisible, setMobileDockVisible] = useState(false);
  // True while the auto-hide Bottom Navigation is in its hidden phase. Used to
  // slide the sticky purchase dock flush to the screen bottom (no empty gap).
  const [navHidden, setNavHidden] = useState(false);
  // The inline purchase card — the sticky dock is the exact inverse of this
  // element's viewport visibility (only one purchase section shows at a time).
  const inlinePurchaseRef = useRef<HTMLDivElement>(null);
  const [titleExpanded, setTitleExpanded] = useState(false);
  const [showAllBadges, setShowAllBadges] = useState(false);
  // Single-open accordion group for the detail sections below the fold.
  const [openSection, setOpenSection] = useState<string | null>("specs");
  const toggleSection = (id: string) => setOpenSection((cur) => (cur === id ? null : id));
  // Premium Information Hub — one tabbed card for Delivery / Offers / Seller / Warranty.
  const [infoTab, setInfoTab] = useState<"delivery" | "offers" | "seller" | "warranty">("delivery");




  useEffect(() => {
    layoutMetrics.setExpectedCtaHeight(64);
    return () => layoutMetrics.setExpectedCtaHeight(0);
  }, [layoutMetrics.setExpectedCtaHeight]);

  useEffect(() => {
    if (product) {
      record(product.slug);
      recordViewedPrice(product.slug, priceOf(product), market, product.inStock);
      recordEvent({ type: "view", productSlug: product.slug, category: product.category });
      import("@/lib/visitor").then((m) => m.trackEvent("product_view", {
        productSlug: product.slug,
        metadata: { category: product.category, price: product.price },
      })).catch(() => {});
      import("@/lib/ga4").then((m) => m.ga4ViewItem({
        item_id: product.sku || product.slug,
        item_name: product.name,
        price: priceOf(product),
        item_category: product.category ?? undefined,
        item_brand: product.brand ?? undefined,
      }, market === "india" ? "INR" : "USD")).catch(() => {});
      fetchFBT(product.slug, 4).then((slugs) => {
        setFbtSlugs(slugs);
        if (slugs.length) fetchProductsBySlugs(slugs).then(setFbtProducts).catch(() => {});
        else setFbtProducts([]);
      });
      fetchAlsoViewed(product.slug, 8).then(setAlsoViewed);
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
    Promise.all([
      fetchProductImages(slug),
      fetchProductVariants(slug),
      fetchPublicColorGalleries(slug),
    ]).then(([imgs, vars, galleries]) => {
      if (!active) return;
      setImages(imgs);
      setVariants(vars);
      setColorGalleries(galleries);
      setActiveImg(0);
      // Initial selection honours the admin's default variant colour, then
      // falls back to the first active variant (already sorted by sort_order).
      const defColor = product?.defaultVariantColor?.trim().toLowerCase() ?? null;
      const initial =
        (defColor && vars.find((v) => (v.color ?? "").trim().toLowerCase() === defColor)) ||
        vars[0] ||
        null;
      setVariantId(initial?.id ?? null);
      setDataReady(true);
    }).catch(() => { if (active) setDataReady(true); });
    return () => { active = false; window.clearTimeout(fallback); };
  }, [slug]);

  // Computed on the client only. Rendering a date range during SSR causes a
  // hydration mismatch whenever the server and client evaluate `new Date()` on
  // different sides of a day/timezone boundary, so we defer to after mount.
  const [deliveryWindow, setDeliveryWindow] = useState("");
  useEffect(() => {
    const start = new Date();
    start.setDate(start.getDate() + 3);
    const end = new Date();
    end.setDate(end.getDate() + 6);
    const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
    setDeliveryWindow(`${start.toLocaleDateString(undefined, opts)} – ${end.toLocaleDateString(undefined, opts)}`);
  }, []);


  // Real activity from the products table (total views / units sold). No
  // fabricated "today/this week" numbers — only show what we actually track.
  const socialProof = useMemo(() => {
    if (!product) return null;
    return {
      views: product.viewsCount ?? 0,
      sold: product.soldCount ?? 0,
    };
  }, [product?.slug]);

  useEffect(() => {
    // ── Single source of truth for sticky-dock visibility ──────────────────
    // The dock is the exact inverse of the inline purchase card's presence:
    // it shows ONLY once the card has fully scrolled ABOVE the viewport, and
    // hides the moment any part of the card re-enters. All triggers funnel into
    // one rAF-batched `recompute` so the state can never get stuck stale.
    const el = inlinePurchaseRef.current;
    if (!el) {
      setMobileDockVisible(false);
      return;
    }

    let raf = 0;
    const recompute = () => {
      raf = 0;
      const rect = el.getBoundingClientRect();
      // Fully above the viewport → the main purchase section is behind us.
      setMobileDockVisible(rect.bottom <= 0);
    };
    // Coalesce every trigger into a single frame — cancels any pending update
    // first so overlapping events never run competing state commits.
    const schedule = () => {
      if (raf) return;
      raf = requestAnimationFrame(recompute);
    };

    // Primary signal: IntersectionObserver reacts to scroll + reflow with no
    // continuous scroll math.
    let io: IntersectionObserver | undefined;
    if (typeof IntersectionObserver !== "undefined") {
      io = new IntersectionObserver(schedule, { threshold: [0] });
      io.observe(el);
    }
    // Secondary re-sync sources IO can miss: bfcache back/forward restore, tab
    // visibility restore, resize/orientation, mobile keyboard open/close.
    window.addEventListener("resize", schedule, { passive: true });
    window.addEventListener("orientationchange", schedule, { passive: true });
    window.addEventListener("pageshow", schedule);
    document.addEventListener("visibilitychange", schedule);
    schedule();

    return () => {
      if (raf) cancelAnimationFrame(raf);
      io?.disconnect();
      window.removeEventListener("resize", schedule);
      window.removeEventListener("orientationchange", schedule);
      window.removeEventListener("pageshow", schedule);
      document.removeEventListener("visibilitychange", schedule);
    };
  }, [product?.slug, dataReady]);

  useEffect(() => {
    // Track the auto-hide Bottom Navigation's phase via a cheap attribute
    // observer (fires only on state change — no scroll listeners here). The nav
    // may not be mounted yet (hydration gate / admin mode), so we retry until it
    // exists, then re-sync on restore events so the dock can never freeze at the
    // wrong bottom offset.
    if (typeof MutationObserver === "undefined") return;
    let mo: MutationObserver | undefined;
    let raf = 0;
    const sync = () => {
      const nav = document.querySelector("[data-app-bottom-nav]");
      setNavHidden(nav?.getAttribute("data-phase") === "hidden");
    };
    const attach = () => {
      const nav = document.querySelector("[data-app-bottom-nav]");
      if (!nav) {
        raf = requestAnimationFrame(attach);
        return;
      }
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

  // Colour currently selected (drives which gallery is shown).
  const selectedColorKey =
    variants.find((v) => v.id === variantId)?.color?.trim().toLowerCase() ?? null;
  const activeColorGallery = selectedColorKey ? colorGalleries[selectedColorKey] ?? null : null;

  const galleryMedia = (() => {
    const items: LightboxMedia[] = [];
    if (product.videoUrl) {
      items.push({ id: "video", url: product.videoUrl, alt: `${product.name} — video`, sortOrder: -2, kind: "video" });
    }
    // When the selected colour has its own gallery, show ONLY that colour's
    // media (images + videos, no media from other colours). Otherwise fall back
    // to the product's default gallery so the gallery is never broken/empty.
    if (activeColorGallery && activeColorGallery.length > 0) {
      activeColorGallery.forEach((img, i) => {
        items.push({
          id: `variant-${img.id}`,
          url: img.url,
          alt: `${product.name} — ${selectedColorKey} ${i + 1}`,
          sortOrder: i,
          kind: img.mediaType,
          poster: img.posterUrl,
        });
      });
      return items;
    }
    const main: LightboxMedia = { id: "main", url: product.image, alt: product.name, sortOrder: -1, kind: "image" };
    const extras: LightboxMedia[] = images
      .filter((img) => img.url && img.url !== product.image)
      .map((img) => ({ ...img, kind: "image" as const }));
    items.push(main, ...extras);
    return items;
  })();
  const galleryImages = galleryMedia.filter((m) => m.kind !== "video");
  const activeMedia = galleryMedia[activeImg] ?? galleryMedia[0];


  // Serve device-appropriate, format-negotiated variants instead of the
  // full-resolution originals. Storage URLs are rewritten to the on-the-fly
  // transform endpoint (AVIF/WebP via Accept header, GPU-unsafe pinned to WebP);
  // non-storage URLs pass through untouched. No change to ordering or design.
  const galleryDisplaySrc = useCallback((url: string) => resizedStorageImage(url, 1280, 72), []);
  const thumbDisplaySrc = useCallback((url: string) => resizedStorageImage(url, 160, 60), []);

  // Prefetch only the immediately adjacent gallery images (next + previous), and
  // never on constrained devices — limits concurrent decodes / memory pressure.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (document.documentElement.dataset.gpuUnsafe === "true") return;
    const mem = (navigator as unknown as { deviceMemory?: number }).deviceMemory;
    if (typeof mem === "number" && mem <= 4) return;
    const neighbours = [galleryMedia[activeImg + 1], galleryMedia[activeImg - 1]];
    const imgs = neighbours
      .filter((m) => m && m.kind !== "video" && m.url)
      .map((m) => {
        const im = new Image();
        im.decoding = "async";
        im.src = galleryDisplaySrc(m!.url);
        return im;
      });
    return () => imgs.forEach((im) => (im.src = ""));
  }, [activeImg, galleryMedia, galleryDisplaySrc]);

  // Keep the selected thumbnail fully visible within the scroll strip.
  useEffect(() => {
    const el = thumbStripRef.current?.querySelector<HTMLElement>(`[data-thumb-index="${activeImg}"]`);
    el?.scrollIntoView({ behavior: "smooth", inline: "nearest", block: "nearest" });
  }, [activeImg]);

  // Measure the natural aspect of the visible image so the main media container
  // sizes to the image itself (no crop, no blank). Uses a decode/Image() probe
  // which fires reliably even for browser-cached images (unlike a JSX onLoad).
  const activeUrl = activeMedia?.kind === "video" ? null : (activeMedia?.url || product.image);
  useEffect(() => {
    // Keep the previous aspect until the next image resolves so the container
    // never briefly falls back to a mismatched box (which would letterbox).
    if (!activeUrl || typeof window === "undefined") return;
    let active = true;
    const probe = new Image();
    const apply = () => {
      if (active && probe.naturalWidth > 0 && probe.naturalHeight > 0) {
        setMediaAspect(probe.naturalWidth / probe.naturalHeight);
      }
    };
    probe.onload = apply;
    probe.src = resizedStorageImage(activeUrl, 96, 40);
    if (probe.complete) apply();
    return () => { active = false; };
  }, [activeUrl]);
  // Phase A: gallery uses a FIXED premium viewport (mobile 340 / tablet 380 /
  // desktop 480). Source aspect ratio no longer drives the container, so
  // switching images cannot shift price/CTA/reviews. Images render with
  // object-contain inside the reserved box — never stretched, never cropped.
  // `mediaAspect` is preserved as telemetry only.
  void mediaAspect;

  // The lightbox now renders videos too, so it receives the full media list and
  // shares the same active index as the inline gallery.
  const lightboxIndex = activeImg;
  const handleLightboxIndexChange = (i: number) => setActiveImg(i);

  const selectedVariant = variants.find((v) => v.id === variantId) ?? null;
  const basePrice = priceOf(product);
  const effectivePrice = selectedVariant?.priceOverride ?? basePrice;
  const effectiveStock = selectedVariant ? selectedVariant.stockQuantity : product.stockQuantity;
  const effectiveSku = selectedVariant?.sku ?? product.sku;
  // Colour change → swap galleries: reset to the new colour's first image.
  // Changing only the size keeps the same colour key, so the gallery (and the
  // active image) is preserved — no reload of images.
  const hasColorGallery = !!(activeColorGallery && activeColorGallery.length > 0);
  useEffect(() => {
    if (hasColorGallery) {
      setActiveImg(product.videoUrl ? 1 : 0);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedColorKey, hasColorGallery]);
  // When a colour has no gallery but the selected variant has a single image,
  // jump the default gallery to it (legacy single-image behaviour).
  const variantImg = selectedVariant?.imageUrl ?? null;
  useEffect(() => {
    if (hasColorGallery || !variantImg) return;
    const idx = galleryMedia.findIndex((m) => m.url === variantImg);
    if (idx >= 0) setActiveImg(idx);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [variantImg, hasColorGallery]);
  const unitShipping = shippingFeeOf(product);
  const lowStock = effectiveStock > 0 && effectiveStock <= product.lowStockThreshold;
  const isOOS = effectiveStock <= 0;
  // Live cart quantity for this product — drives the "quantity selector replaces
  // Add to Cart" flow. The selector is shown ONLY after a successful add
  // animation completes (addState back to idle) and the item is in the cart.
  const cartQty = cartItems.find((i) => i.slug === product.slug && (i.variantId ?? null) === (variantId ?? null) && !i.savedForLater)?.qty ?? 0;
  const showQtySelector = addState === "idle" && cartQty > 0;
  const incCartQty = () => cartSetQty(product.slug, cartQty + 1, variantId);
  const decCartQty = () => (cartQty <= 1 ? cartRemove(product.slug, variantId) : cartSetQty(product.slug, cartQty - 1, variantId));
  // Products with variants require a valid selection before purchase.
  const requiresVariant = variants.length > 0;
  const missingVariant = requiresVariant && !variantId;
  const originalPrice = compareOf(product) ?? (product.discount ? effectivePrice * (1 + product.discount / 100) : null);
  const discountPct = discountPercent(effectivePrice, originalPrice);

  // Unified hero badge list — merchandising badges plus the sale/low-stock
  // pills, in priority order. The gallery renders at most 2 and collapses the
  // rest into a single "+N" pill so badges never overlap or clip.
  const heroBadges: { key: string; label: string; emoji?: string; className: string }[] = [
    ...computeBadges(product, DEFAULT_BADGE_SETTINGS, 4).map((b) => ({
      key: b.key,
      label: b.label,
      emoji: b.emoji,
      className: b.className,
    })),
    ...(lowStock
      ? [{ key: "lowstock", label: `Only ${effectiveStock} left`, emoji: "⚠️", className: "bg-destructive/90 text-destructive-foreground" }]
      : []),
  ];
  const visibleBadges = showAllBadges ? heroBadges : heroBadges.slice(0, 2);
  const hiddenBadgeCount = heroBadges.length - visibleBadges.length;



  // The sticky purchase dock must never mount until the whole page is ready:
  // product + variants + images loaded, main image decoded, and currency
  // resolved. Combined with the scroll gate this prevents overlap, layout
  // shift and currency flicker after a refresh.
  // Hide the customer purchase dock whenever an admin is inside the inline
  // editor — they're managing the product, not shopping.
  const showPurchaseDock = dataReady && mobileDockVisible && !editorOpen;

  const handleAdd = () => {
    if (addState !== "idle") return;
    if (missingVariant) { toast.error("Please select an option first"); return; }
    // Adds a single unit of the selected variant (variantId is null for
    // products without variants — identical to the previous behavior).
    add(product.slug, 1, variantId);
    // Visual progression: Adding… → ✓ Added (held ~1s) → quantity selector.
    setAddState("loading");
    addTimers.current.push(
      setTimeout(() => setAddState("success"), 400),
      setTimeout(() => setAddState("idle"), 1400),
    );
  };
  // Buy Now uses the single centralized handler (see useBuyNow): it purchases
  // EXACTLY the selected `qty`, SETS the line rather than accumulating (so it is
  // idempotent across repeat clicks, Back navigation, and refresh), and is
  // guarded by a shared double-tap lock. `navigate: false` lets the wrapping
  // <Link to="/cart"> own routing so the page's existing markup is unchanged.
  const handleBuyNow = () => {
    if (missingVariant) { toast.error("Please select an option first"); return; }
    buyNow(product, { qty: Math.max(1, cartQty), disabled: isOOS, navigate: false, variantId });
    if (isOOS) return;
    // Brief "Preparing…" affordance while routing to checkout proceeds.
    setBuyState("loading");
    addTimers.current.push(setTimeout(() => setBuyState("idle"), 1200));
  };
  const handleShare = () => {
    if (typeof window === "undefined") return;
    openShare({ title: product.name, text: product.tagline, url: window.location.href, image: product.image });
  };

  return (
    <>
      {/* Layered cinematic ambient lighting */}
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-32 -left-24 size-[36rem] rounded-full opacity-50 animate-orb" style={{ background: "var(--gradient-ember-soft)", filter: "blur(110px)" }} />
        <div className="absolute top-1/3 -right-32 size-[34rem] rounded-full opacity-40 animate-orb" style={{ background: "var(--gradient-violet)", filter: "blur(120px)", animationDelay: "-8s" }} />
      </div>
      <div data-product-page data-product-phase="final" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 product-page-clearance sm:pb-24 lg:pb-16">
        {/* Breadcrumb: Home → Main → Sub → Product */}
        <nav aria-label="Breadcrumb" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-3 sm:mb-8 truncate">
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


        <div data-product-hero className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 lg:gap-12 xl:gap-16">
          {/* Gallery — plain div (no motion wrapper). A motion.div with
              initial opacity:0 previously hid the ENTIRE gallery container
              on devices with Reduced Motion or Android GPU Safe Mode, where
              the framer-motion tween never advances past initial. Thumbnails
              still rendered (they live outside this wrapper), which matched
              the reported symptom: thumbs visible, main viewport blank. */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative">
              {/* Cinematic ambient backlight */}
              <div aria-hidden className="absolute -inset-10 -z-10 rounded-[3rem] opacity-70 animate-pulse" style={{ background: "var(--gradient-ember-soft)", filter: "blur(80px)" }} />
              <div aria-hidden className="absolute left-1/2 top-1/2 -z-10 size-2/3 -translate-x-1/2 -translate-y-1/2 rounded-full opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.5), transparent 70%)", filter: "blur(50px)" }} />
              <div
                data-product-image
                className="relative mx-auto w-full aspect-square sm:h-[520px] lg:h-[620px] card-premium rounded-2xl sm:rounded-3xl overflow-hidden group border border-white/10 shadow-[0_30px_60px_-28px_oklch(0_0_0/0.7)]"
              >
                {/* Main media — plain <img>/<video>, always opacity:1.
                    Previously wrapped in AnimatePresence + motion.img with
                    initial opacity:0. On Android GPU Safe Mode (which strips
                    transitions/transforms globally) and under reduced-motion,
                    the framer-motion tween could fail to advance, leaving the
                    image stuck at opacity 0 — container visible, thumbnails
                    working, main image invisible. Removing the animation
                    guarantees the gallery never blanks; `key` still forces a
                    clean remount when the user switches media. */}
                {activeMedia?.kind === "video" ? (
                  <video
                    key={activeMedia.id}
                    src={activeMedia.url}
                    poster={activeMedia.poster ?? undefined}
                    controls
                    autoPlay
                    muted
                    playsInline
                    preload="metadata"
                    onClick={(e) => e.stopPropagation()}
                    className="absolute inset-0 w-full h-full object-contain bg-black"
                  />
                ) : (
                  (() => {
                    // Guaranteed-non-empty src: normalized → original → product.image.
                    const rawUrl = activeMedia?.url || product.image || "";
                    const displaySrc = rawUrl ? galleryDisplaySrc(rawUrl) : "";
                    return (
                      <img
                        key={activeMedia?.id ?? "fallback"}
                        src={displaySrc || rawUrl || product.image}
                        alt={activeMedia?.alt || product.name}
                        loading="eager"
                        decoding="async"
                        onClick={() => setLightboxOpen(true)}
                        onError={(e) => {
                          // Self-healing: fall back to the primary product image,
                          // then to the raw original, never a broken icon.
                          const el = e.currentTarget;
                          const primary = product.image ? galleryDisplaySrc(product.image) : "";
                          if (primary && el.src !== primary) {
                            el.src = primary;
                          } else if (product.image && el.src !== product.image) {
                            el.src = product.image;
                          }
                        }}
                        className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-[900ms] group-hover:scale-105"
                      />
                    );
                  })()
                )}
                {/* Tap-to-expand hint */}
                <span className="pointer-events-none absolute bottom-4 left-1/2 z-10 -translate-x-1/2 rounded-full border border-white/15 bg-black/40 px-3 py-1 text-[9px] font-mono uppercase tracking-widest text-white/80 backdrop-blur-md opacity-0 transition-opacity group-hover:opacity-100">
                  Tap to view all
                </span>
                {/* Media counter */}
                {galleryMedia.length > 1 && (
                  <span className="pointer-events-none absolute bottom-4 right-4 z-10 rounded-full border border-white/15 bg-black/50 px-2.5 py-1 text-[10px] font-mono tabular-nums text-white/90 backdrop-blur-md">
                    {activeImg + 1}/{galleryMedia.length}
                  </span>
                )}
                {/* premium glass overlay gradient */}
                <div aria-hidden className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/30 via-transparent to-white/5" />
                {/* Single canonical badge — same component as Product Cards. */}
                {heroBadges[0] && (
                  <ProductBadgeAnchor>
                    <ProductBadge label={heroBadges[0].label} />
                  </ProductBadgeAnchor>
                )}



                {/* Floating stock pill — premium glass */}
                {isOOS && (
                  <div className="absolute top-4 right-16 z-10">
                    <span className="relative flex items-center gap-1.5 backdrop-blur-xl bg-accent/15 border border-accent/30 text-accent text-[10px] font-semibold font-mono px-2.5 py-1 rounded-full uppercase tracking-widest shadow-[0_8px_30px_-8px_oklch(0.74_0.19_49/0.6)]">
                      <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                      Sold out
                    </span>
                  </div>
                )}
                <div className="absolute top-3.5 right-3.5 flex flex-col gap-2 z-10">
                  <button
                    onClick={() => toggleWishlist(product.slug)}
                    aria-label="Wishlist"
                    className={`size-12 grid place-items-center backdrop-blur-md rounded-full border shadow-lg shadow-black/30 transition-all active:scale-90 ${inWishlist(product.slug) ? "bg-accent/20 border-accent/50 text-accent" : "bg-black/40 border-white/10 text-white/80 hover:text-accent hover:border-accent/50"}`}
                  >
                    <Heart className={`size-4 ${inWishlist(product.slug) ? "fill-accent" : ""}`} />
                  </button>
                  <button
                    onClick={handleShare}
                    aria-label="Share"
                    className="size-12 grid place-items-center backdrop-blur-md bg-black/40 border border-white/10 rounded-full text-white/80 shadow-lg shadow-black/30 hover:text-accent hover:border-accent/50 transition-all active:scale-90"
                  >
                    <Share2 className="size-4" />
                  </button>
                </div>

                {isAdmin && (
                  <Suspense fallback={null}>
                    <AdminImageManager
                      product={product}
                      images={galleryImages.filter((g) => g.id !== "main")}
                      onChanged={setImages}
                    />
                  </Suspense>
                )}
              </div>
            </div>


            {galleryMedia.length > 1 && (
              <div
                ref={thumbStripRef}
                className="mt-2.5 flex justify-between sm:justify-start gap-2.5 overflow-x-auto scrollbar-hide px-4 py-1 scroll-smooth snap-x"
                style={{ scrollbarWidth: "none", scrollPaddingLeft: "1rem", scrollPaddingRight: "1rem" }}
              >
                {galleryMedia.map((item, i) => (
                  <button
                    key={item.id}
                    data-thumb-index={i}
                    onClick={() => setActiveImg(i)}
                    aria-label={item.kind === "video" ? "Play video" : `View image ${i + 1}`}
                    aria-current={i === activeImg}
                    className={`relative size-16 sm:size-[72px] shrink-0 snap-start rounded-2xl overflow-hidden border-2 transition-[border-color,box-shadow,opacity] active:scale-95 bg-card ${i === activeImg ? "border-accent/80 shadow-[0_6px_20px_-6px_oklch(0.74_0.19_49/0.6)]" : "border-white/10 opacity-55 hover:opacity-100 hover:border-accent/40"}`}
                  >
                    {item.kind === "video" ? (
                      item.poster ? (
                        <>
                          <img src={item.poster} alt={item.alt || "video"} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          <span className="absolute inset-0 grid place-items-center bg-black/25">
                            <Play className="size-5 text-white fill-white/90" />
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full bg-black grid place-items-center">
                          <Play className="size-6 text-white/80" />
                        </div>
                      )
                    ) : (
                      <img src={thumbDisplaySrc(item.url)} alt={item.alt || `${product.name} — view ${i + 1}`} className="w-full h-full object-cover" loading="lazy" decoding="async" onError={(e) => { if (e.currentTarget.src !== item.url) e.currentTarget.src = item.url; }} />
                    )}

                  </button>
                ))}
              </div>
            )}




            <ImageLightbox
              images={galleryMedia}
              index={lightboxIndex}
              open={lightboxOpen}
              onClose={() => setLightboxOpen(false)}
              onIndexChange={handleLightboxIndexChange}
              alt={product.name}
            />
          </div>


          {/* Info */}
          <motion.div
            data-product-info
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: 0.05, ease: [0.16, 1, 0.3, 1] }}
          >
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent/90 mb-1.5 mt-4 lg:mt-0">{product.tagline}</p>
            <h1 className={`text-[1.35rem] sm:text-4xl lg:text-5xl font-display font-semibold tracking-tight mb-1 text-balance leading-[1.22] sm:leading-[1.12] ${titleExpanded ? "" : "line-clamp-3"}`}>{product.name}</h1>
            {product.name.length > 70 && (
              <button
                onClick={() => setTitleExpanded((v) => !v)}
                className="mb-2.5 text-[11px] font-mono uppercase tracking-widest text-accent hover:underline"
                aria-expanded={titleExpanded}
              >
                {titleExpanded ? "Read less" : "Read more"}
              </button>
            )}


            <div className="flex items-center gap-3 mb-3 flex-wrap">
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
            {product.reviews > 0 && product.ratingSource && product.ratingSource !== "customer_reviews" && (
              <p className="-mt-2 mb-4 text-[11px] text-muted-foreground/70">Based on customer and imported reviews</p>
            )}

            {/* subtle gradient separator */}
            <div aria-hidden className="h-px w-full mb-3 bg-gradient-to-r from-border/0 via-border/70 to-border/0" />


            {/* Premium animated price block */}
            {currencyReady ? (
              <motion.div
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
                className="mb-3"
              >
                <div className="flex items-baseline gap-3 sm:gap-4 flex-wrap">
                  <span className="fom-price-current text-4xl sm:text-5xl font-display tracking-tight">{format(effectivePrice)}</span>
                  {originalPrice && originalPrice > effectivePrice && (
                    <span className="fom-price-compare text-base font-mono">{format(originalPrice)}</span>
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

            {/* Real activity strip — only rendered when we have genuine data */}
            {socialProof && (socialProof.sold > 0 || socialProof.views > 0) && (
              <div className="mb-3 flex flex-wrap items-center gap-2 text-[10px] font-mono uppercase tracking-widest">
                {socialProof.sold > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-muted-foreground/90">
                    <ShoppingBagIcon className="size-3 text-accent" /> {formatSold(socialProof.sold)} sold
                  </span>
                )}
                {socialProof.views > 0 && (
                  <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-2.5 py-1 text-muted-foreground/90">
                    <Users className="size-3 text-accent" /> {formatSold(socialProof.views)} views
                  </span>
                )}
              </div>
            )}

            {isAdmin && (
              <Suspense fallback={null}>
                <AdminProductPanel product={product} onOpenChange={setEditorOpen} />
              </Suspense>
            )}



            <div className="flex flex-wrap items-center gap-2 mb-4 text-[10px] font-mono uppercase tracking-widest">

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
              
            </div>

            {/* Variants — fully dynamic, data-driven, adaptive selector */}
            {variants.length > 0 && (
              <VariantSelector variants={variants} selectedId={variantId} onSelect={setVariantId} />
            )}

            {/* Premium purchase panel — unique FoundOurMarket design.
                Compact glass card: two-button CTA row (Add to Cart morphs into a
                quantity selector after a successful add) + trust strip at the
                base. GPU-friendly (no backdrop blur). */}
            <div ref={inlinePurchaseRef} className="mb-4 rounded-[20px] border border-white/10 bg-card/60 p-3 shadow-[0_8px_24px_-16px_rgba(0,0,0,0.6)] sm:p-3.5">
              {/* CTA row — Add to Cart (morphs into quantity selector) + Buy Now */}
              <div className="grid grid-cols-2 gap-2.5">

                {showQtySelector ? (
                  <div
                    key="qty"
                    role="group"
                    aria-label="Quantity in cart"
                    className="inline-flex h-[54px] items-center justify-between rounded-2xl border border-accent/40 bg-white/[0.03] px-1 motion-safe:animate-in motion-safe:fade-in motion-safe:zoom-in-95 duration-200 will-change-transform"
                  >
                    <button
                      onClick={decCartQty}
                      aria-label={cartQty <= 1 ? "Remove from cart" : "Decrease quantity"}
                      className="grid size-11 place-items-center rounded-xl text-foreground/80 transition-colors hover:text-accent active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span aria-live="polite" className="min-w-8 text-center font-mono text-sm font-semibold tabular-nums">{cartQty}</span>
                    <button
                      onClick={incCartQty}
                      aria-label="Increase quantity"
                      className="grid size-11 place-items-center rounded-xl text-foreground/80 transition-colors hover:text-accent active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
                    >
                      <Plus className="size-4" />
                    </button>
                  </div>
                ) : (
                  <button
                    key="add"
                    onClick={handleAdd}
                    disabled={isOOS || addState !== "idle"}
                    aria-label={isOOS ? "Notify me when available" : "Add to cart"}
                    className="inline-flex h-[54px] items-center justify-center gap-2 rounded-2xl bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] px-3 text-sm font-bold text-black shadow-[var(--shadow-ember)] transition-transform active:scale-[0.97] disabled:opacity-60 motion-safe:animate-in motion-safe:fade-in duration-200 will-change-transform focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-card"
                  >
                    {isOOS ? (
                      "Notify Me"
                    ) : addState === "loading" ? (
                      <><Loader2 className="size-4 animate-spin" /> Adding…</>
                    ) : addState === "success" ? (
                      <span className="inline-flex items-center gap-2 motion-safe:animate-in motion-safe:zoom-in-75 duration-200"><Check className="size-4" strokeWidth={3} /> Added</span>
                    ) : (
                      <><ShoppingCart className="size-4" strokeWidth={2.5} /> Add to Cart</>
                    )}
                  </button>
                )}
                <Link
                  to="/cart"
                  onClick={handleBuyNow}
                  aria-disabled={isOOS}
                  aria-label={isOOS ? "Out of stock" : "Buy now"}
                  className={`inline-flex h-[54px] items-center justify-center gap-2 rounded-2xl border border-accent/60 bg-white/[0.04] px-3 text-sm font-bold text-foreground transition-all hover:border-accent hover:bg-accent/10 active:scale-[0.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent ${isOOS ? "pointer-events-none opacity-50" : ""}`}
                >
                  {isOOS ? (
                    "Out of stock"
                  ) : buyState === "loading" ? (
                    <><Loader2 className="size-4 animate-spin text-accent" /> Preparing…</>
                  ) : (
                    <><Zap className="size-4 text-accent" strokeWidth={2.5} /> Buy Now</>
                  )}
                </Link>
              </div>


              {/* Trust strip */}
              <div className="mt-3 flex items-center gap-3 overflow-x-auto pt-2.5 text-[11px] text-muted-foreground [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="inline-flex shrink-0 items-center gap-1.5"><Truck className="size-3.5 text-accent/80" /> Free Delivery</span>
                <span aria-hidden className="h-3 w-px shrink-0 bg-white/10" />
                <span className="inline-flex shrink-0 items-center gap-1.5"><Lock className="size-3.5 text-accent/80" /> Secure Checkout</span>
                <span aria-hidden className="h-3 w-px shrink-0 bg-white/10" />
                <span className="inline-flex shrink-0 items-center gap-1.5"><RotateCcw className="size-3.5 text-accent/80" /> Easy Returns</span>
              </div>
            </div>

            {/* Premium Information Hub — one tabbed card replacing the separate
                Delivery, Offers, Seller and Warranty sections. */}
            <div className="mb-4 rounded-2xl border border-border bg-card/50 overflow-hidden">
              <div role="tablist" aria-label="Product information" className="flex border-b border-border/60">
                {([
                  { id: "delivery", label: "Delivery", icon: Truck },
                  { id: "offers", label: "Offers", icon: Sparkles },
                  { id: "seller", label: "Seller", icon: Users },
                  { id: "warranty", label: "Warranty", icon: Shield },
                ] as const).map((t) => (
                  <button
                    key={t.id}
                    role="tab"
                    aria-selected={infoTab === t.id}
                    onClick={() => setInfoTab(t.id)}
                    className={`flex-1 min-h-11 flex items-center justify-center gap-1.5 px-1 py-2.5 text-[11px] font-mono uppercase tracking-widest transition-colors ${infoTab === t.id ? "text-accent border-b-2 border-accent bg-accent/[0.06]" : "text-muted-foreground hover:text-foreground"}`}
                  >
                    <t.icon className="hidden sm:block size-3.5 shrink-0" />
                    <span>{t.label}</span>

                  </button>
                ))}
              </div>
              <div className="p-4 min-h-[7.5rem]">
                {infoTab === "delivery" && (
                  <div className="space-y-3">
                    <div className="flex items-start gap-3">
                      <div className="size-9 rounded-full grid place-items-center bg-accent/10 text-accent shrink-0">
                        <Truck className="size-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-medium">{unitShipping <= 0 ? "Free delivery" : `Shipping ${format(unitShipping)}`}</p>
                        <p className="text-xs text-muted-foreground">{deliveryWindow ? <>Arrives <span className="text-foreground">{deliveryWindow}</span> · 5–10 business days</> : "Arrives in 5–10 business days"}</p>
                      </div>
                      <Link to="/track" className="ml-auto text-[10px] font-mono uppercase tracking-widest text-accent hover:underline shrink-0">Track</Link>
                    </div>
                    <Link to="/returns" className="flex items-center gap-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <RotateCcw className="size-4 text-accent shrink-0" />
                      {product.returnEligible ? `${product.returnWindowDays}-day easy returns` : "No returns on this item"}
                    </Link>
                  </div>
                )}
                {infoTab === "offers" && (
                  <div className="space-y-2.5 text-sm">
                    {discountPct && originalPrice ? (
                      <>
                        <p className="inline-flex items-center gap-1.5 font-mono font-semibold uppercase tracking-widest text-accent text-xs">
                          <Sparkles className="size-3.5" /> Save {format(originalPrice - effectivePrice)} ({discountPct}% off)
                        </p>
                        <p className="text-xs text-muted-foreground">Limited-time price. No coupon required — discount applied at checkout.</p>
                      </>
                    ) : (
                      <p className="text-xs text-muted-foreground">No active offers right now. Secure checkout with buyer protection on every order.</p>
                    )}
                  </div>
                )}
                {infoTab === "seller" && <SellerTrustCard product={product} />}
                {infoTab === "warranty" && (
                  <div className="space-y-2.5 text-sm">
                    <Link to="/buyer-protection" className="flex items-center gap-2.5 text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors">
                      <Shield className="size-4 text-accent shrink-0" /> Buyer Protection on every order
                    </Link>
                    <p className="text-xs text-muted-foreground">{product.returnEligible ? `Covered by a ${product.returnWindowDays}-day return window and full refund support.` : "Full refund support if your item doesn't arrive as described."}</p>
                  </div>
                )}
              </div>
            </div>


            {/* Product Highlights */}
            {product.features?.length > 0 && (
              <ProductInfoPanel title="Highlights" icon={Sparkles}>
                <ul className="space-y-2.5">
                  {product.features.map((feat: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-sm text-muted-foreground leading-relaxed">
                      <span className="mt-1.5 size-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              </ProductInfoPanel>
            )}

            <div className="mb-4">
              <ProductDescription description={product.description} />
            </div>

            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <Accordion title="Specifications" icon={Layers} open={openSection === "specs"} onToggle={() => toggleSection("specs")}>
                <dl className="divide-y divide-border/60">
                  {Object.entries(product.specifications as Record<string, string>).map(([k, v]) => (
                    <div key={k} className="flex gap-4 py-2.5 text-sm">
                      <dt className="w-1/3 shrink-0 text-muted-foreground">{k}</dt>
                      <dd className="flex-1 text-foreground">{v}</dd>
                    </div>
                  ))}
                </dl>
              </Accordion>
            )}

            {product.attributes && Object.keys(product.attributes).length > 0 && (
              <Accordion title="Details" icon={Info} open={openSection === "details"} onToggle={() => toggleSection("details")}>
                <div className="flex flex-wrap gap-2">
                  {Object.entries(product.attributes as Record<string, string>).map(([k, v]) => (
                    <span key={k} className="inline-flex items-center gap-1.5 rounded-full border border-border bg-background/50 px-3 py-1 text-xs">
                      <span className="text-muted-foreground">{k}:</span>
                      <span className="text-foreground">{v}</span>
                    </span>
                  ))}
                </div>
              </Accordion>
            )}



            <div data-product-sticky-threshold aria-hidden className="h-px w-full" />




            <Accordion title="FAQ" icon={Sparkles} open={openSection === "faq"} onToggle={() => toggleSection("faq")}>
              <ProductFaqList slug={product.slug} />
            </Accordion>


          </motion.div>
        </div>
      </div>

      {/* Intelligent PDP recommendations — every rail flows through the
          centralized engine (scored, reason-tagged, diversity-passed) and is
          deferred until near the viewport so core product info paints first. */}
      <ProductLayoutDiagnostics phase="final" />

      {(fbtProducts.length > 0 && fbtSlugs.length > 0) && (
        <Suspense fallback={null}>
          <PDPRelationshipSections
            hydratedProducts={fbtProducts}
            frequentlyBoughtTogetherIds={fbtSlugs}
            allowedSections={[
              "frequently_bought_together",
              "compatible",
              "accessories",
              "bundle",
              "alternatives",
              "replacement",
            ]}
          />
        </Suspense>
      )}

      <LazyMount minHeight={120} className="scroll-mt-24" id="reviews">
        <div data-product-reviews>
          <ProductReviews productSlug={product.slug} onAggregateChange={invalidateProducts} />
        </div>
      </LazyMount>
      <LazyMount minHeight={120} className="scroll-mt-24" id="questions">
        <div data-product-questions>
          <ProductQA productSlug={product.slug} />
        </div>
      </LazyMount>

      <PDPRecommendations
        product={product}
        alsoBoughtSlugs={alsoViewed}
      />

      <LazyMount minHeight={160}>
        <RecommendedForYou excludeSlug={product.slug} />
      </LazyMount>
      <LazyMount minHeight={160}>
        <RecentlyViewed excludeSlug={product.slug} />
      </LazyMount>
      <LazyMount minHeight={160}>
        <ProductComparison product={product} />
      </LazyMount>

      <LazyMount minHeight={120}>
        <TrustGuarantee />
      </LazyMount>
      

      {/* Sticky mobile purchase dock — only mounts once the page is fully
          initialized and the user has scrolled past the hero. */}
      {showPurchaseDock && (
      <div ref={layoutMetrics.setCtaElement} data-app-cta data-product-cta data-floating-control className="sm:hidden fixed inset-x-0 z-[var(--z-floating-controls)] h-[var(--product-dock-height)] px-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-300 ease-out will-change-transform" style={{ bottom: "var(--product-dock-bottom)", transform: navHidden ? "translateY(calc(var(--product-dock-bottom) - var(--mobile-safe-bottom)))" : "translateY(0)", transition: "transform 200ms ease-out", transitionDuration: "200ms" }}>
        <div className="flex h-full items-center gap-2.5 rounded-[24px] border border-white/10 px-3" style={{ background: "linear-gradient(135deg, oklch(1 0 0 / 0.07), oklch(1 0 0 / 0.02))", backdropFilter: "blur(32px) saturate(160%)", WebkitBackdropFilter: "blur(32px) saturate(160%)", boxShadow: "0 24px 60px -18px oklch(0 0 0 / 0.9)" }}>
          <button
            onClick={() => toggleWishlist(product.slug)}
            aria-label={inWishlist(product.slug) ? "Remove from wishlist" : "Add to wishlist"}
            className={`size-12 grid place-items-center rounded-full border shrink-0 transition-all active:scale-90 ${inWishlist(product.slug) ? "bg-accent/20 border-accent/50 text-accent" : "bg-white/[0.03] border-white/10 text-white/60 hover:text-accent"}`}
          >
            <Heart className={`size-[18px] ${inWishlist(product.slug) ? "fill-accent" : ""}`} />
          </button>
          <img
            src={thumbDisplaySrc(activeMedia?.url || product.image)}
            alt=""
            aria-hidden
            className="size-12 shrink-0 rounded-xl object-cover border border-white/10"
          />
          <div className="flex flex-col justify-center leading-none min-w-0 shrink">
            <span className="text-[8px] font-mono uppercase tracking-widest text-muted-foreground/70">Total</span>
            {currencyReady ? (
              <span className="flex items-baseline gap-1.5">
                <span className="fom-price-current text-base font-display whitespace-nowrap">{format(effectivePrice * Math.max(1, cartQty))}</span>
              </span>
            ) : (
              <span aria-hidden className="mt-0.5 h-4 w-14 rounded bg-white/[0.08] animate-pulse" />
            )}
          </div>

          <button
            onClick={handleAdd}
            disabled={isOOS}
            className="size-12 shrink-0 grid place-items-center bg-white/[0.04] border border-white/10 text-white/70 rounded-full transition-all active:scale-90 disabled:opacity-40 hover:text-accent"
            aria-label={isOOS ? "Notify me" : "Add to cart"}
          >
            <ShoppingBagIcon className="size-[18px]" />
          </button>
          <Link
            to="/cart"
            onClick={handleBuyNow}
            aria-disabled={isOOS}
            className={`flex-1 grid place-items-center min-h-[52px] bg-accent text-accent-foreground font-bold rounded-2xl text-xs uppercase tracking-widest transition-all active:scale-95 shadow-[var(--shadow-ember)] ${isOOS ? "pointer-events-none opacity-50" : ""}`}
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
    <div data-product-page data-product-phase="loading" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-4 sm:pt-8 product-page-clearance sm:pb-24 lg:pb-16" aria-busy="true">
      <ProductLayoutDiagnostics phase="loading" />
      <div className="mb-3 sm:mb-6 h-3 w-44 rounded-full bg-white/[0.05] animate-pulse" />
      <div data-product-hero className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-8 lg:gap-12 xl:gap-16">
        <div className="space-y-3">
          <div data-product-image className="aspect-[4/3] sm:aspect-square max-h-[58svh] sm:max-h-none rounded-2xl sm:rounded-3xl border border-border bg-white/[0.04] animate-pulse" />
          <div className="grid grid-cols-6 gap-2 sm:gap-2.5">
            {Array.from({ length: 6 }).map((_, i) => (
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
      <div className="flex h-full items-center gap-2.5 rounded-[24px] border border-white/10 bg-white/[0.04] px-3 backdrop-blur-2xl">
        <div className="size-12 shrink-0 rounded-full bg-white/[0.05] animate-pulse" />
        <div className="size-12 shrink-0 rounded-xl bg-white/[0.05] animate-pulse" />
        <div className="h-8 w-16 shrink-0 rounded-lg bg-white/[0.05] animate-pulse" />
        <div className="size-12 shrink-0 rounded-full bg-white/[0.05] animate-pulse" />
        <div className="h-[52px] flex-1 rounded-2xl bg-accent/20 animate-pulse" />
      </div>
    </div>
    </>
  );
}



function Accordion({
  title,
  icon: Icon,
  defaultOpen = false,
  children,
  open: openProp,
  onToggle,
}: {
  title: string;
  icon: typeof Package;
  defaultOpen?: boolean;
  children: React.ReactNode;
  /** When provided, the accordion is controlled (used for single-open groups). */
  open?: boolean;
  onToggle?: () => void;
}) {
  const [openState, setOpen] = useState(defaultOpen);
  const open = openProp !== undefined ? openProp : openState;
  const toggle = () => (onToggle ? onToggle() : setOpen((v) => !v));
  return (
    <div className="border-t border-border mt-4 pt-4">
      <button
        onClick={toggle}
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

