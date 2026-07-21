import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Heart, Truck, RotateCcw, Minus, Plus,
  Share2, Play,
  ShoppingCart, Zap, Check, Loader2, Lock,
} from "lucide-react";
import { useState, useEffect, useMemo, useRef, useCallback, lazy, Suspense } from "react";

import { supabase } from "@/integrations/supabase/client";
import { useProduct, invalidateProducts, refreshProducts } from "@/lib/use-products";
import { openShare, toPreviewImage } from "@/lib/share";
import { useAllCategories } from "@/lib/use-categories";
import { useRegion } from "@/lib/region";
import { useCart } from "@/lib/cart";
import { useBuyNow } from "@/lib/use-buy-now";
import { useLayoutMetrics } from "@/lib/layout-metrics";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";

import { ProductReviews } from "@/components/site/ProductReviews";
import { ProductQA } from "@/components/site/ProductQA";
import { StarRating } from "@/components/site/StarRating";
import { PDPCompareSection } from "@/components/site/PDPCompareSection";
import { useWishlist } from "@/lib/wishlist";
import { fetchProductImages, fetchProductVariants, fetchProduct, discountPercent, type ProductImage, type ProductVariant } from "@/lib/products";
import { fetchPublicColorGalleries, type VariantImage } from "@/lib/variant-images";
import { useResolvedProductBadges } from "@/lib/use-product-badges";
import { ProductBadge, ProductBadgeAnchor } from "@/components/ui/ProductBadge";
import { recordEvent, fetchFBT, fetchAlsoViewed } from "@/lib/personalization";
import { recordViewedPrice } from "@/lib/viewed-prices";
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
import { RevealOnScroll } from "@/components/site/RevealOnScroll";
import { formatSold } from "@/lib/format-sold";
import { toast } from "sonner";
import { usePublishShoppingContext } from "@/lib/ai-shopping/shopping-context";

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

  // ── AI Shopping Context (v1.3) ──────────────────────────────────────────
  const currentVariant = variants.find((v) => v.id === variantId) ?? null;
  usePublishShoppingContext(
    () => {
      if (!product) return null;
      const specs = product.specifications && typeof product.specifications === "object"
        ? Object.entries(product.specifications as Record<string, string>)
            .slice(0, 6)
            .map(([k, v]) => `${k}: ${v}`)
        : [];
      return {
        page: "product",
        route: `/products/${product.slug}`,
        product: {
          slug: product.slug,
          name: product.name,
          price_inr: product.priceInr,
          compare_price_inr: product.comparePriceInr,
          category: product.category,
          brand: product.brand,
          in_stock: product.inStock,
          variant: currentVariant?.name ?? null,
          rating: product.rating,
          reviews: product.reviews,
          key_specs: specs,
        },
      };
    },
    [product?.slug, product?.priceInr, product?.inStock, currentVariant?.id],
  );


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
  const assignedPdpBadges = useResolvedProductBadges(product.slug);
  const heroBadges: { key: string; label: string; emoji?: string; className: string }[] = [
    ...assignedPdpBadges.map((b) => ({
      key: b.badgeKey,
      label: b.label,
      emoji: b.emoji,
      className: "",
    })),
    ...(lowStock
      ? [{ key: "lowstock", label: `Only ${effectiveStock} left`, emoji: "⚠️", className: "bg-destructive/90 text-destructive-foreground" }]
      : []),
  ];



  // The sticky purchase dock must never mount until the whole page is ready:
  // product + variants + images loaded, main image decoded, and currency
  // resolved. Combined with the scroll gate this prevents overlap, layout
  // shift and currency flicker after a refresh.
  // Hide the customer purchase dock whenever an admin is inside the inline
  // editor — they're managing the product, not shopping.
  const showPurchaseDock = dataReady && mobileDockVisible && !editorOpen;

  // Publish the Buy Now dock's presence to the floating-widgets stack so the
  // Live Chat orb automatically lifts above it — never overlaps the sticky
  // purchase bar. Value is dock height + inline gap; 0 when the dock is
  // absent. No layout reads, no scroll dependency.
  useEffect(() => {
    let cancelled = false;
    void import("@/lib/floating-stack").then(({ setBuyBarLift }) => {
      if (cancelled) return;
      // Dock CSS: --product-dock-height ≈ 5rem (80px) + 16px breathing room.
      setBuyBarLift(showPurchaseDock ? 96 : 0);
    });
    return () => {
      cancelled = true;
      void import("@/lib/floating-stack").then(({ setBuyBarLift }) => {
        setBuyBarLift(0);
      });
    };
  }, [showPurchaseDock]);


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

  // Subtle highlight chips derived from real product data — no fabricated claims.
  const highlightChips: string[] = (() => {
    const out: string[] = [];
    if (unitShipping <= 0) out.push("Free Shipping");
    if (product.returnEligible) out.push(`${product.returnWindowDays}-Day Returns`);
    if (assignedPdpBadges.some((b) => b.badgeKey === "best_seller")) out.push("Best Seller");
    if (product.brand) out.push(product.brand);
    out.push("Secure Payment");
    return out.slice(0, 6);
  })();
  void highlightChips;

  // Stock availability — real inventory only. No "Genuine/Authentic" claims.
  const stockBadge = isOOS
    ? { tone: "muted" as const, label: "Currently unavailable", sub: "Out of stock" }
    : lowStock
      ? { tone: "warn" as const, label: `Only ${effectiveStock} left`, sub: "Ships in 24 hours" }
      : { tone: "ok" as const, label: "In Stock", sub: "Ready to ship" };

  return (
    <>
      <div data-product-page data-product-phase="final" className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 pt-3 sm:pt-6 product-page-clearance sm:pb-24 lg:pb-16">
        {/* Breadcrumb removed for v5.1 — gallery leads the page. */}


        <div data-product-hero className="grid grid-cols-1 lg:grid-cols-2 gap-8 lg:gap-16">
          {/* ─────── Gallery — edge-to-edge on mobile, no card ─────── */}
          <div className="lg:sticky lg:top-24 lg:self-start -mx-4 sm:mx-0 rounded-none">
            <div
              data-product-image
              onTouchStart={(e) => { (e.currentTarget as unknown as { _sx: number })._sx = e.touches[0].clientX; }}
              onTouchEnd={(e) => {
                const start = (e.currentTarget as unknown as { _sx?: number })._sx;
                if (start == null || galleryMedia.length < 2) return;
                const dx = e.changedTouches[0].clientX - start;
                if (Math.abs(dx) < 40) return;
                const next = dx < 0 ? activeImg + 1 : activeImg - 1;
                setActiveImg(Math.max(0, Math.min(galleryMedia.length - 1, next)));
              }}
              className="relative w-full aspect-[4/5] sm:aspect-square overflow-hidden bg-white/[0.02] group touch-pan-y !rounded-none"
              style={{ borderRadius: 0 }}
            >

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
                        const el = e.currentTarget;
                        const primary = product.image ? galleryDisplaySrc(product.image) : "";
                        if (primary && el.src !== primary) el.src = primary;
                        else if (product.image && el.src !== product.image) el.src = product.image;
                      }}
                      className="absolute inset-0 w-full h-full object-cover cursor-zoom-in transition-transform duration-700 group-hover:scale-[1.02] !rounded-none"
                      style={{ borderRadius: 0 }}
                    />
                  );
                })()
              )}

              {/* Single canonical badge — top-left, no chrome around it */}
              {heroBadges[0] && (
                <div className="absolute top-4 left-4 z-10">
                  <ProductBadge label={heroBadges[0].label} />
                </div>
              )}

              {/* Floating wishlist + share — minimalist glass pills */}
              <div className="absolute top-4 right-4 z-10 flex flex-col gap-2">
                <WishlistHeartButton
                  active={inWishlist(product.slug)}
                  onToggle={() => toggleWishlist(product.slug)}
                />
                <button
                  onClick={handleShare}
                  aria-label="Share"
                  className="size-11 grid place-items-center rounded-full bg-black/35 backdrop-blur-md border border-white/10 text-white/85 hover:text-accent transition-all active:scale-90"
                >
                  <Share2 className="size-[18px]" />
                </button>
              </div>


              {/* Sold-out chip */}
              {isOOS && (
                <span className="absolute top-16 left-4 z-10 inline-flex items-center gap-1.5 rounded-full bg-black/60 backdrop-blur px-2.5 py-1 text-[10px] font-medium uppercase tracking-widest text-white/90">
                  <span className="size-1.5 rounded-full bg-accent animate-pulse" />
                  Sold out
                </span>
              )}

              {/* Image indicator — dots + "1/N" counter */}
              {galleryMedia.length > 1 && (
                <div className="absolute bottom-4 left-1/2 -translate-x-1/2 z-10 flex items-center gap-2 rounded-full bg-black/40 backdrop-blur-md px-3 py-1.5">
                  <div className="flex items-center gap-1.5">
                    {galleryMedia.slice(0, 6).map((m, i) => (
                      <button
                        key={m.id}
                        onClick={() => setActiveImg(i)}
                        aria-label={`View image ${i + 1}`}
                        className={`h-1.5 rounded-full transition-all duration-200 ${i === activeImg ? "w-5 bg-white" : "w-1.5 bg-white/40 hover:bg-white/70"}`}
                      />
                    ))}
                  </div>
                  <span className="text-[10px] font-mono text-white/80 tabular-nums pl-1 border-l border-white/20">
                    {activeImg + 1}/{galleryMedia.length}
                  </span>
                </div>
              )}


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

            {/* Desktop thumbnail strip only — mobile uses dots */}
            {galleryMedia.length > 1 && (
              <div
                ref={thumbStripRef}
                className="hidden sm:flex mt-3 gap-2 overflow-x-auto scrollbar-hide"
                style={{ scrollbarWidth: "none" }}
              >
                {galleryMedia.map((item, i) => (
                  <button
                    key={item.id}
                    data-thumb-index={i}
                    onClick={() => setActiveImg(i)}
                    aria-label={item.kind === "video" ? "Play video" : `View image ${i + 1}`}
                    aria-current={i === activeImg}
                    className={`relative size-16 shrink-0 rounded-sm overflow-hidden transition-all duration-200 active:scale-95 bg-white/[0.03] ${i === activeImg ? "ring-2 ring-accent opacity-100" : "opacity-55 hover:opacity-100"}`}
                  >
                    {item.kind === "video" ? (
                      item.poster ? (
                        <>
                          <img src={item.poster} alt={item.alt || "video"} className="w-full h-full object-cover" loading="lazy" decoding="async" />
                          <span className="absolute inset-0 grid place-items-center bg-black/25">
                            <Play className="size-4 text-white fill-white/90" />
                          </span>
                        </>
                      ) : (
                        <div className="w-full h-full bg-black grid place-items-center">
                          <Play className="size-5 text-white/80" />
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

          {/* ─────── Info column — clean vertical stack, no cards ─────── */}
          <div data-product-info className="mt-2 lg:mt-0 motion-safe:animate-in motion-safe:fade-in duration-200">
            {/* Badge (desktop; on mobile it lives on the image) */}
            {heroBadges[0] && (
              <div className="mb-3 hidden lg:block">
                <ProductBadge label={heroBadges[0].label} />
              </div>
            )}

            {/* Brand — small muted eyebrow */}
            {product.brand && (
              <p className="mb-2 text-[11px] font-mono uppercase tracking-[0.22em] text-muted-foreground/80">
                {product.brand}
              </p>
            )}

            {/* Title — 24px mobile / 32px desktop, semibold, 2 lines max */}
            <h1 className={`text-[24px] sm:text-[28px] lg:text-[32px] font-semibold tracking-tight leading-[1.2] text-balance ${titleExpanded ? "" : "line-clamp-2"}`}>
              {product.name}
            </h1>
            {product.name.length > 70 && (
              <button
                onClick={() => setTitleExpanded((v) => !v)}
                className="mt-1.5 text-[12px] text-muted-foreground hover:text-foreground transition-colors"
                aria-expanded={titleExpanded}
              >
                {titleExpanded ? "Show less" : "Show more"}
              </button>
            )}

            {/* Rating • Reviews • Sold */}
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-muted-foreground">
              <StarRating
                rating={product.rating}
                count={0}
                showValue={product.reviews > 0}
                starClassName="size-4"
                textClassName="text-[13px] font-medium text-foreground"
              />
              {product.reviews > 0 && (
                <a href="#reviews" className="hover:text-foreground transition-colors">
                  {product.reviews.toLocaleString()} {product.reviews === 1 ? "review" : "reviews"}
                </a>
              )}
              {socialProof && socialProof.sold > 0 && (
                <>
                  <span aria-hidden className="text-muted-foreground/40">•</span>
                  <span>{formatSold(socialProof.sold)} sold</span>
                </>
              )}
            </div>

            {isAdmin && (
              <Suspense fallback={null}>
                <AdminProductPanel product={product} onOpenChange={setEditorOpen} />
              </Suspense>
            )}

            {/* Variants — pill selectors */}
            {variants.length > 0 && (
              <div className="mt-6">
                <VariantSelector variants={variants} selectedId={variantId} onSelect={setVariantId} />
              </div>
            )}

            {/* Price hierarchy — largest visual block after the image */}
            <div className="mt-7">
              {currencyReady ? (
                <>
                  <div className="flex items-baseline gap-3 flex-wrap">
                    <span className="fom-price-current text-[36px] sm:text-[40px] font-semibold tracking-tight leading-none text-accent">
                      {format(effectivePrice)}
                    </span>
                    {originalPrice && originalPrice > effectivePrice && (
                      <>
                        <span className="fom-price-compare text-[15px] line-through text-muted-foreground/60">
                          {format(originalPrice)}
                        </span>
                        {discountPct && (
                          <span className="inline-flex items-center rounded-md bg-accent/15 px-2 py-0.5 text-[12px] font-bold uppercase tracking-wide text-accent">
                            {discountPct}% OFF
                          </span>
                        )}
                      </>
                    )}
                  </div>
                  {originalPrice && originalPrice > effectivePrice && (
                    <p className="mt-2 text-[13px] text-emerald-300/90">
                      You save <span className="font-semibold">{format(originalPrice - effectivePrice)}</span>
                    </p>
                  )}
                </>
              ) : (
                <div className="h-10 w-44 rounded-lg bg-white/[0.05] animate-pulse" />
              )}
            </div>

            {/* Premium chip row — stock + service chips, horizontally scrollable */}
            <div
              className="mt-5 -mx-4 sm:mx-0 flex gap-2 overflow-x-auto px-4 sm:px-0 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
              role="list"
              aria-label="Product highlights"
            >
              {/* Stock chip — always first, tone-aware */}
              <span
                role="listitem"
                className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] font-medium whitespace-nowrap ${
                  stockBadge.tone === "ok"
                    ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-300"
                    : stockBadge.tone === "warn"
                      ? "border-accent/30 bg-accent/10 text-accent"
                      : "border-border bg-white/[0.03] text-muted-foreground"
                }`}
              >
                <span className="relative inline-flex size-2">
                  {stockBadge.tone === "ok" && (
                    <span className="absolute inset-0 rounded-full bg-emerald-400/70 animate-ping motion-reduce:hidden" />
                  )}
                  <span
                    className={`relative inline-flex size-2 rounded-full ${
                      stockBadge.tone === "ok"
                        ? "bg-emerald-400"
                        : stockBadge.tone === "warn"
                          ? "bg-accent"
                          : "bg-muted-foreground/60"
                    }`}
                  />
                </span>
                {stockBadge.label}
              </span>

              {/* Ships / delivery estimate — real data only */}
              {!isOOS && deliveryWindow && (
                <span role="listitem" className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-foreground/85 whitespace-nowrap">
                  <Truck className="size-3.5" strokeWidth={2} />
                  {deliveryWindow}
                </span>
              )}
              {/* Free delivery — only when shipping is actually free */}
              {unitShipping <= 0 && (
                <span role="listitem" className="shrink-0 inline-flex items-center rounded-full border border-border bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-foreground/85 whitespace-nowrap">
                  Free Delivery
                </span>
              )}
              {/* Easy Returns — only if eligible */}
              {product.returnEligible && (
                <span role="listitem" className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-foreground/85 whitespace-nowrap">
                  <RotateCcw className="size-3.5" strokeWidth={2} />
                  {product.returnWindowDays}-Day Returns
                </span>
              )}
              <span role="listitem" className="shrink-0 inline-flex items-center gap-1.5 rounded-full border border-border bg-white/[0.03] px-3 py-1.5 text-[12px] font-medium text-foreground/85 whitespace-nowrap">
                <Lock className="size-3.5" strokeWidth={2} />
                Secure Checkout
              </span>
            </div>


            {/* Purchase bar v5 — Add to Cart morphs into [-] qty [+] after first tap;
                reverts to Add to Cart when qty hits 0. Buy Now stays as the primary CTA. */}
            <div ref={inlinePurchaseRef} className="mt-6 flex items-stretch gap-2.5">
              <div className="flex-1 relative h-[52px]">
                {showQtySelector ? (
                  <div
                    key="qty"
                    className="absolute inset-0 inline-flex items-center justify-between rounded-full border border-accent/40 bg-background px-1 animate-in fade-in zoom-in-95 duration-200 ease-out"
                  >
                    <button
                      onClick={decCartQty}
                      aria-label={cartQty <= 1 ? "Remove from cart" : "Decrease quantity"}
                      className="grid size-11 place-items-center rounded-full text-foreground/80 transition-colors hover:text-accent active:scale-90"
                    >
                      <Minus className="size-4" />
                    </button>
                    <span aria-live="polite" className="flex-1 text-center font-mono text-[15px] font-semibold tabular-nums text-foreground">
                      {Math.max(1, cartQty)}
                      <span className="ml-1.5 text-[11px] font-normal text-muted-foreground uppercase tracking-widest">in cart</span>
                    </span>
                    <button
                      onClick={incCartQty}
                      aria-label="Increase quantity"
                      className="grid size-11 place-items-center rounded-full text-foreground/80 transition-colors hover:text-accent active:scale-90"
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
                    className="absolute inset-0 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-transparent text-foreground text-[14px] font-semibold transition-all duration-200 ease-out hover:border-accent/60 hover:bg-accent/5 active:scale-[0.98] disabled:opacity-60 animate-in fade-in zoom-in-95"
                  >
                    {isOOS ? "Notify Me"
                      : addState === "loading" ? (<><Loader2 className="size-4 animate-spin" /> Adding…</>)
                      : addState === "success" ? (<><Check className="size-4" strokeWidth={3} /> Added</>)
                      : (<><ShoppingCart className="size-4" strokeWidth={2.25} /> Add to Cart</>)}
                  </button>
                )}
              </div>
              <Link
                to="/cart"
                onClick={handleBuyNow}
                aria-disabled={isOOS}
                aria-label={isOOS ? "Out of stock" : "Buy now"}
                className={`flex-1 h-[52px] inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground text-[14px] font-bold transition-all active:scale-[0.98] shadow-[var(--shadow-ember)] ${isOOS ? "pointer-events-none opacity-50" : ""}`}
              >
                {isOOS ? "Out of stock"
                  : buyState === "loading" ? (<><Loader2 className="size-4 animate-spin" /> Preparing…</>)
                  : (<><Zap className="size-4" strokeWidth={2.5} /> Buy Now</>)}
              </Link>
            </div>

            {/* Delivery & trust — premium glass card. Only real, data-backed rows. */}
            <div
              className="mt-8 rounded-2xl border border-white/10 p-4 sm:p-5"
              style={{
                background:
                  "linear-gradient(135deg, oklch(1 0 0 / 0.05), oklch(1 0 0 / 0.015))",
                backdropFilter: "blur(20px) saturate(140%)",
                WebkitBackdropFilter: "blur(20px) saturate(140%)",
              }}
            >
              <ul className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3.5">
                {[
                  deliveryWindow && !isOOS
                    ? { icon: Truck, label: "Estimated Delivery", value: deliveryWindow, accent: true }
                    : null,
                  {
                    icon: Truck,
                    label: unitShipping <= 0 ? "Free Shipping" : "Shipping",
                    value: unitShipping <= 0 ? "On this order" : `From ${format(unitShipping)}`,
                  },
                  product.returnEligible
                    ? { icon: RotateCcw, label: "Easy Returns", value: `${product.returnWindowDays}-day window` }
                    : null,
                  { icon: Lock, label: "Secure Checkout", value: "Encrypted payment" },
                ]
                  .filter((r): r is { icon: typeof Truck; label: string; value: string; accent?: boolean } => !!r)
                  .map((row, i) => {
                    const Icon = row.icon;
                    return (
                      <li key={i} className="flex items-start gap-3">
                        <span
                          className={`grid size-9 shrink-0 place-items-center rounded-xl border ${
                            row.accent
                              ? "border-accent/30 bg-accent/10 text-accent"
                              : "border-white/10 bg-white/[0.03] text-muted-foreground"
                          }`}
                        >
                          <Icon className="size-[16px]" strokeWidth={1.75} />
                        </span>
                        <div className="min-w-0 leading-tight">
                          <p className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground/70">
                            {row.label}
                          </p>
                          <p className="mt-0.5 text-[13.5px] font-medium text-foreground/90 truncate">
                            {row.value}
                          </p>
                        </div>
                      </li>
                    );
                  })}
              </ul>
            </div>

            {/* Product Overview — description component owns its own subsection titles */}
            <section className="mt-16">
              <PdpSectionHeading title="Product Overview" subtitle="Everything you need to know" />
              <ProductDescription description={product.description} />
              {product.features?.length > 0 && (
                <ul className="mt-6 space-y-2.5">
                  {product.features.map((feat: string, i: number) => (
                    <li key={i} className="flex items-start gap-2.5 text-[15px] text-muted-foreground leading-relaxed">
                      <span className="mt-2 size-1.5 shrink-0 rounded-full bg-accent" />
                      <span>{feat}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* Specifications — grouped accordion, one open at a time. */}
            {product.specifications && Object.keys(product.specifications).length > 0 && (
              <section className="mt-16">
                <PdpSectionHeading title="Specifications" subtitle="Grouped for easy scanning" />
                <SpecificationsAccordion specs={product.specifications as Record<string, string>} />
              </section>
            )}


            <div data-product-sticky-threshold aria-hidden className="h-px w-full" />
          </div>
        </div>
      </div>

      

      {/* Intelligent PDP recommendations — every rail flows through the
          centralized engine (scored, reason-tagged, diversity-passed) and is
          deferred until near the viewport so core product info paints first. */}
      <ProductLayoutDiagnostics phase="final" />

      {(fbtProducts.length > 0 && fbtSlugs.length > 0) && (
        <LazyMount minHeight={200} rootMargin="600px" className="mt-4">
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
        </LazyMount>
      )}

      <PDPCompareSection currentProduct={product} />





      <LazyMount minHeight={160} rootMargin="400px" className="scroll-mt-24" id="reviews">
        <div data-product-reviews className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
          <PdpSectionHeading title="Customer Reviews" subtitle="Real feedback from real shoppers" />
          <ProductReviews productSlug={product.slug} onAggregateChange={invalidateProducts} />
        </div>
      </LazyMount>
      <LazyMount minHeight={160} rootMargin="400px" className="scroll-mt-24" id="questions">
        <div data-product-questions className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20">
          <PdpSectionHeading title="Questions & Answers" subtitle="Ask anything about this product" />
          <ProductQA productSlug={product.slug} />
        </div>
      </LazyMount>


      {/* Sticky mobile purchase dock — compact: Price + Add to Cart + Buy Now. */}
      {showPurchaseDock && (
      <div ref={layoutMetrics.setCtaElement} data-app-cta data-product-cta data-floating-control className="sm:hidden fixed inset-x-0 z-[var(--z-floating-controls)] h-[var(--product-dock-height)] px-3 motion-safe:animate-in motion-safe:fade-in motion-safe:slide-in-from-bottom-2 duration-300 ease-out will-change-transform" style={{ bottom: "var(--product-dock-bottom)", transform: navHidden ? "translateY(calc(var(--product-dock-bottom) - var(--mobile-safe-bottom)))" : "translateY(0)", transition: "transform 200ms ease-out" }}>
        <div className="flex h-full items-center gap-2 rounded-[24px] border border-white/10 px-3" style={{ background: "linear-gradient(135deg, oklch(1 0 0 / 0.07), oklch(1 0 0 / 0.02))", backdropFilter: "blur(32px) saturate(160%)", WebkitBackdropFilter: "blur(32px) saturate(160%)", boxShadow: "0 24px 60px -18px oklch(0 0 0 / 0.9)" }}>
          <div className="flex flex-col justify-center leading-none min-w-0 pr-1">
            {currencyReady ? (
              <>
                <span className="fom-price-current text-[17px] font-display whitespace-nowrap leading-tight">{format(effectivePrice * Math.max(1, cartQty))}</span>
                {originalPrice && originalPrice > effectivePrice && (
                  <span className="text-[11px] font-mono line-through text-muted-foreground/70 leading-tight">{format(originalPrice * Math.max(1, cartQty))}</span>
                )}
              </>
            ) : (
              <span aria-hidden className="h-4 w-14 rounded bg-white/[0.08] animate-pulse" />
            )}
          </div>
          <div className="flex-1 relative min-h-[48px]">
            {showQtySelector ? (
              <div
                key="qty-sticky"
                className="absolute inset-0 inline-flex items-center justify-between rounded-2xl border border-accent/40 bg-background px-1 animate-in fade-in zoom-in-95 duration-200 ease-out"
              >
                <button
                  onClick={decCartQty}
                  aria-label={cartQty <= 1 ? "Remove from cart" : "Decrease quantity"}
                  className="grid size-10 place-items-center rounded-xl text-foreground/80 active:scale-90"
                >
                  <Minus className="size-4" />
                </button>
                <span aria-live="polite" className="flex-1 text-center font-mono text-[14px] font-semibold tabular-nums text-foreground">
                  {Math.max(1, cartQty)}
                </span>
                <button
                  onClick={incCartQty}
                  aria-label="Increase quantity"
                  className="grid size-10 place-items-center rounded-xl text-foreground/80 active:scale-90"
                >
                  <Plus className="size-4" />
                </button>
              </div>
            ) : (
              <button
                key="add-sticky"
                onClick={handleAdd}
                disabled={isOOS}
                className="absolute inset-0 inline-flex items-center justify-center gap-1.5 rounded-2xl border border-border bg-transparent text-foreground font-semibold text-[13px] transition-all duration-200 ease-out active:scale-[0.97] disabled:opacity-40 animate-in fade-in zoom-in-95"
                aria-label={isOOS ? "Notify me" : "Add to cart"}
              >
                <ShoppingCart className="size-4" strokeWidth={2.5} />
                <span>Add</span>
              </button>
            )}
          </div>
          <Link
            to="/cart"
            onClick={handleBuyNow}
            aria-disabled={isOOS}
            className={`flex-1 grid place-items-center min-h-[48px] bg-accent text-accent-foreground font-bold rounded-2xl text-[13px] uppercase tracking-widest transition-all active:scale-95 shadow-[var(--shadow-ember)] ${isOOS ? "pointer-events-none opacity-50" : ""}`}
          >
            {isOOS ? "Notify Me" : "Buy Now"}
          </Link>
        </div>
      </div>

      )}


    </>
  );
}

function PdpSectionHeading({ title, subtitle, eyebrow }: { title: string; subtitle?: string; eyebrow?: string }) {
  return (
    <RevealOnScroll className="mb-8 sm:mb-10 flex items-start gap-3.5">
      <span aria-hidden className="mt-1.5 h-6 w-[3px] rounded-full bg-accent shrink-0" />
      <div className="min-w-0">
        {eyebrow && (
          <p className="mb-1 text-[10px] font-mono uppercase tracking-[0.22em] text-accent/80">
            {eyebrow}
          </p>
        )}
        <h2 className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-foreground leading-tight">{title}</h2>
        {subtitle && (
          <p className="mt-1 text-[13px] text-muted-foreground/80 leading-relaxed">{subtitle}</p>
        )}
      </div>
    </RevealOnScroll>
  );
}

/**
 * Phase 4 polish — wishlist heart.
 * Fill + pop + soft ripple + best-effort haptic. GPU-only, no confetti.
 */
function WishlistHeartButton({ active, onToggle }: { active: boolean; onToggle: () => void }) {
  const [pulse, setPulse] = useState(0);
  const handleClick = () => {
    // Best-effort haptic (Android Chrome / some in-app browsers). No-op elsewhere.
    try { navigator.vibrate?.(active ? 8 : [10, 20, 12]); } catch { /* no-op */ }
    setPulse((n) => n + 1);
    onToggle();
  };
  return (
    <button
      onClick={handleClick}
      aria-label={active ? "Remove from wishlist" : "Add to wishlist"}
      aria-pressed={active}
      className={`relative size-11 grid place-items-center rounded-full backdrop-blur-md border transition-colors duration-200 active:scale-90 overflow-visible ${
        active ? "bg-accent/15 border-accent/40 text-accent" : "bg-black/35 border-white/10 text-white/85 hover:text-accent"
      }`}
    >
      {pulse > 0 && active && (
        <span
          key={pulse}
          aria-hidden
          className="pointer-events-none absolute inset-0 rounded-full bg-accent/40 animate-heart-ripple"
        />
      )}
      <Heart
        key={`icon-${pulse}-${active}`}
        className={`size-[18px] transition-colors duration-200 ${active ? "fill-accent animate-heart-pop" : ""}`}
      />
    </button>
  );
}




/** Heuristic groups for a flat spec map. Order matters: first match wins. */
const SPEC_GROUP_ORDER = [
  "Display",
  "Performance",
  "Camera",
  "Battery",
  "Connectivity",
  "Audio",
  "Build & Design",
  "Dimensions & Weight",
  "Package Contents",
  "Warranty",
  "General",
] as const;

const SPEC_GROUP_PATTERNS: Array<{ group: (typeof SPEC_GROUP_ORDER)[number]; test: RegExp }> = [
  { group: "Display", test: /display|screen|resolution|refresh|panel|nits|hdr|ppi/i },
  { group: "Performance", test: /processor|chipset|cpu|gpu|ram|memory|storage|os|android|ios|benchmark/i },
  { group: "Camera", test: /camera|lens|megapixel|aperture|video|zoom|selfie/i },
  { group: "Battery", test: /battery|charging|charger|mah|watt|wattage|power/i },
  { group: "Connectivity", test: /wi[- ]?fi|bluetooth|nfc|5g|4g|lte|sim|port|usb|hdmi|jack|network|gps|band/i },
  { group: "Audio", test: /audio|speaker|microphone|mic|dolby|codec|driver|sound/i },
  { group: "Build & Design", test: /material|build|design|finish|colou?r|frame|glass|rating|ip[0-9]+|water|dust/i },
  { group: "Dimensions & Weight", test: /dimension|height|width|depth|thickness|weight|size/i },
  { group: "Package Contents", test: /package|box|in the box|contents|includes|accessor/i },
  { group: "Warranty", test: /warranty|guarantee/i },
];

function groupSpecs(specs: Record<string, string>) {
  const bucket = new Map<string, Array<[string, string]>>();
  for (const [k, v] of Object.entries(specs)) {
    if (v == null || String(v).trim() === "") continue;
    const match = SPEC_GROUP_PATTERNS.find((p) => p.test.test(k));
    const g = match?.group ?? "General";
    if (!bucket.has(g)) bucket.set(g, []);
    bucket.get(g)!.push([k, String(v)]);
  }
  return SPEC_GROUP_ORDER
    .filter((g) => bucket.has(g))
    .map((g) => ({ group: g, entries: bucket.get(g)! }));
}

function SpecificationsAccordion({ specs }: { specs: Record<string, string> }) {
  const groups = useMemo(() => groupSpecs(specs), [specs]);
  // Open the first group by default so users see structure immediately.
  const [openGroup, setOpenGroup] = useState<string | null>(groups[0]?.group ?? null);
  if (groups.length === 0) return null;
  return (
    <div className="rounded-2xl border border-white/10 overflow-hidden">
      {groups.map(({ group, entries }, i) => {
        const isOpen = openGroup === group;
        const panelId = `spec-panel-${i}`;
        const btnId = `spec-trigger-${i}`;
        return (
          <div key={group} className={i > 0 ? "border-t border-white/10" : ""}>
            <button
              id={btnId}
              type="button"
              aria-expanded={isOpen}
              aria-controls={panelId}
              onClick={() => setOpenGroup(isOpen ? null : group)}
              className="w-full flex items-center justify-between gap-4 px-4 sm:px-5 py-4 text-left transition-colors hover:bg-white/[0.02] focus-visible:outline-none focus-visible:bg-white/[0.03]"
            >
              <span className="flex items-center gap-3 min-w-0">
                <span className="text-[10px] font-mono uppercase tracking-[0.18em] text-muted-foreground/70 tabular-nums">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="text-[14.5px] font-medium text-foreground/95 truncate">{group}</span>
                <span className="text-[11px] text-muted-foreground/70">
                  {entries.length}
                </span>
              </span>
              <span
                className={`grid size-6 place-items-center rounded-full border border-white/10 text-muted-foreground transition-transform duration-200 ${isOpen ? "rotate-45 border-accent/40 text-accent" : ""}`}
                aria-hidden
              >
                <Plus className="size-3" />
              </span>
            </button>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              className={`grid transition-[grid-template-rows,opacity] duration-300 ease-out ${isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"}`}
            >
              <div className="overflow-hidden">
                <dl className="divide-y divide-white/[0.06] px-4 sm:px-5 pb-4">
                  {entries.map(([k, v]) => (
                    <div key={k} className="grid grid-cols-[40%_60%] gap-4 py-3 text-[13.5px]">
                      <dt className="text-muted-foreground/90">{k}</dt>
                      <dd className="text-foreground/95 break-words">{v}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            </div>
          </div>
        );
      })}
    </div>
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


