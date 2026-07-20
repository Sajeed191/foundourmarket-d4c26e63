import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { BrowseCard } from "@/components/site/BrowseCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import type { Product } from "@/lib/products";
import { titleizeSlug } from "@/lib/category-path";
import { Loader2 } from "lucide-react";
import { buildBrowsePresentation, sortProductsForBrowse } from "@/lib/browse";
import { usePublishShoppingContext } from "@/lib/ai-shopping/shopping-context";

export const Route = createFileRoute("/category/$main/$sub")({
  head: ({ params }) => {
    const name = titleizeSlug(params.sub);
    const mainName = titleizeSlug(params.main);
    const title = `${name} — ${mainName} — FoundOurMarket™`;
    const description = `Shop ${name} in ${mainName}, curated from the global marketplace on FoundOurMarket™.`;
    const url = `https://foundourmarket.com/category/${params.main}/${params.sub}`;
    return {
      meta: [
        { title },
        { name: "description", content: description },
        { property: "og:title", content: title },
        { property: "og:description", content: description },
        { property: "og:type", content: "website" },
        { property: "og:url", content: url },
      ],
      links: [{ rel: "canonical", href: url }],
      scripts: [
        {
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: "Shop", item: "https://foundourmarket.com/" },
              { "@type": "ListItem", position: 2, name: mainName, item: `https://foundourmarket.com/category/${params.main}` },
              { "@type": "ListItem", position: 3, name, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: SubcategoryPage,
});

function SubcategoryPage() {
  const { main, sub } = Route.useParams();
  const { categories, loading: catsLoading } = useAllCategories();
  const { products, loading } = useProducts();

  const cat = categories.find((c) => c.slug === sub);
  const parent = categories.find((c) => c.slug === main);

  const rawItems = useMemo(
    () => products.filter((p) => p.category === sub || (p.categories ?? []).includes(sub)),
    [products, sub],
  );

  // Browse Presentation Adapter — pure composition over public contracts.
  // Drives default "Recommended" ordering, badges, and the "Why?" disclosure.
  const presentation = useMemo(
    () => buildBrowsePresentation({ products: rawItems, surface: "category" }),
    [rawItems],
  );
  const items = useMemo(
    () => sortProductsForBrowse(rawItems, presentation, "recommended"),
    [rawItems, presentation],
  );

  useEffect(() => {
    if (cat?.id) void supabase.rpc("track_category_event", { _id: cat.id, _event: "view" });
  }, [cat?.id]);

  usePublishShoppingContext(
    () => ({
      page: "category",
      route: `/category/${main}/${sub}`,
      category: {
        slug: sub,
        name: cat?.name ?? null,
        visible: items.slice(0, 12).map((p) => ({
          slug: p.slug,
          name: p.name,
          price_inr: p.priceInr ?? null,
          category: p.category ?? null,
        })),
      },
    }),
    [main, sub, cat?.name, items],
  );


  const getProductKey = useCallback((p: Product) => p.id ?? p.slug, []);
  const renderProduct = useCallback(
    (p: Product, i: number) => (
      <BrowseCard product={p} presentation={presentation.get(p.id ?? p.slug)} priority={i < 4} />
    ),
    [presentation],
  );

  // If the slug isn't actually a subcategory of `main`, send to the flat page so
  // the URL stays correct (no broken nested URLs, zero SEO loss).
  if (!catsLoading && cat && parent && cat.parent_id !== parent.id) {
    return <Navigate to="/category/$slug" params={{ slug: sub }} replace />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-2 sm:pt-12 sm:pb-0">
      <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
        <Link to="/" className="hover:text-foreground">Shop</Link>
        <span className="mx-2">/</span>
        <Link to="/category/$slug" params={{ slug: main }} className="hover:text-foreground">{parent?.name ?? titleizeSlug(main)}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{cat?.name ?? titleizeSlug(sub)}</span>
      </nav>

      <header data-product-card-frame className="relative mb-8 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
        {cat?.banner_image && (
          <img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">{parent?.name ?? titleizeSlug(main)}</p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight capitalize">{cat?.name ?? titleizeSlug(sub)}</h1>
          {cat?.description && <p className="text-muted-foreground mt-2 text-sm max-w-2xl">{cat.description}</p>}
        </div>
      </header>

      {loading ? (
        <div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products in this subcategory yet. Check back soon.</p>
          <Link to="/category/$slug" params={{ slug: main }} className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">
            Browse {parent?.name ?? titleizeSlug(main)}
          </Link>
        </div>
      ) : (
        <VirtualizedProductGrid
          items={items}
          cols={{ base: 2, sm: 3, lg: 4 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
          getKey={getProductKey}
          getImageSrc={(p) => p.image}
          renderItem={renderProduct}
        />

      )}
    </div>
  );
}

