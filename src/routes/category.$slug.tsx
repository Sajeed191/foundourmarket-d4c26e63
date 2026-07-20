import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { BrowseCard } from "@/components/site/BrowseCard";
import { VirtualizedProductGrid } from "@/components/site/VirtualizedProductGrid";
import type { Product } from "@/lib/products";
import { Loader2, ArrowRight } from "lucide-react";
import { buildBrowsePresentation, sortProductsForBrowse } from "@/lib/browse";
import { usePublishShoppingContext } from "@/lib/ai-shopping/shopping-context";

function titleize(slug: string) {
  return slug.replace(/-/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
}

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => {
    const name = titleize(params.slug);
    const title = `${name} — FoundOurMarket™`;
    const description = `Shop ${name} curated from the global marketplace on FoundOurMarket™.`;
    const url = `https://foundourmarket.com/category/${params.slug}`;
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
              { "@type": "ListItem", position: 2, name, item: url },
            ],
          }),
        },
      ],
    };
  },
  component: CategoryPage,
});


function CategoryPage() {
  const { slug } = Route.useParams();
  const { categories, subsByParent, loading: catsLoading } = useAllCategories();
  const cat = categories.find((c) => c.slug === slug);
  const { products, loading } = useProducts();

  // Main category page = subcategory chooser. Products are NOT shown here.
  const subs = cat ? subsByParent(cat.id) : [];
  const childSlugs = useMemo(() => subs.map((s) => s.slug), [subs]);

  // Match a product to a category slug via its primary OR additional categories.
  const matches = (p: typeof products[number], s: string) =>
    p.category === s || (p.categories ?? []).includes(s);

  // Product count for the whole department (own + all subcategories).
  const totalCount = useMemo(
    () => products.filter((p) => matches(p, slug) || childSlugs.some((c) => matches(p, c))).length,
    [products, slug, childSlugs],
  );


  // Direct products of this main category (only used as a fallback when there
  // are no subcategories — never lose products).
  const ownItemsRaw = useMemo(
    () => products.filter((p) => matches(p, slug)),
    [products, slug],
  );

  // Browse Presentation Adapter — only exercised on the fallback grid.
  const presentation = useMemo(
    () => buildBrowsePresentation({ products: ownItemsRaw, surface: "category" }),
    [ownItemsRaw],
  );
  const ownItems = useMemo(
    () => sortProductsForBrowse(ownItemsRaw, presentation, "recommended"),
    [ownItemsRaw, presentation],
  );

  useEffect(() => {
    if (cat?.id) void supabase.rpc("track_category_event", { _id: cat.id, _event: "view" });
  }, [cat?.id]);

  // ── AI Shopping Context (v1.3) ──────────────────────────────────────────
  usePublishShoppingContext(
    () => ({
      page: "category",
      route: `/category/${slug}`,
      category: {
        slug,
        name: cat?.name ?? null,
        visible: ownItems.slice(0, 12).map((p) => ({
          slug: p.slug,
          name: p.name,
          price_inr: p.priceInr ?? null,
          category: p.category ?? null,
        })),
      },
    }),
    [slug, cat?.name, ownItems],
  );



  const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;
  const getProductKey = useCallback((p: Product) => p.id ?? p.slug, []);
  const renderProduct = useCallback(
    (p: Product, i: number) => (
      <BrowseCard product={p} presentation={presentation.get(p.id ?? p.slug)} priority={i < 4} />
    ),
    [presentation],
  );

  // Old flat URL for a subcategory → redirect to the nested /category/main/sub.
  if (!catsLoading && cat && parent) {
    return <Navigate to="/category/$main/$sub" params={{ main: parent.slug, sub: cat.slug }} replace />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 pt-8 pb-2 sm:pt-12 sm:pb-0">
      <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{cat?.name ?? slug}</span>
      </nav>

      {/* Hero banner */}
      <header data-product-card-frame className="relative mb-10 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
        {cat?.banner_image && (
          <img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Department</p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight capitalize">{cat?.name ?? slug}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            {subs.length > 0 && (
              <span className="rounded-full border border-accent/30 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
                {subs.length} {subs.length === 1 ? "Subcategory" : "Subcategories"}
              </span>
            )}
          </div>
        </div>
      </header>

      {catsLoading || loading ? (
        <div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : subs.length > 0 ? (
        <>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-4">Shop by subcategory</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
            {subs.map((s) => {
              return (
                <Link
                  key={s.slug}
                  data-product-card-frame
                  to="/category/$main/$sub"
                  params={{ main: slug, sub: s.slug }}
                  className="group product-card-glass relative flex flex-col overflow-hidden rounded-3xl p-0 transition-[box-shadow,border-color] duration-300 hover:shadow-[0_18px_50px_-12px_color-mix(in_oklab,var(--accent)_55%,transparent)]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
                    {s.image || s.mobile_image ? (
                      <img
                        src={s.mobile_image || s.image || ""}
                        alt={s.name}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    ) : (
                      <div className="size-full bg-accent/10" />
                    )}
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3.5 sm:p-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm sm:text-base font-semibold tracking-tight group-hover:text-accent transition-colors">{s.name}</h3>
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-background/40 text-accent transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>
        </>
      ) : ownItems.length > 0 ? (
        <VirtualizedProductGrid
          items={ownItems}
          cols={{ base: 2, sm: 3, lg: 4 }}
          className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"
          getKey={getProductKey}
          getImageSrc={(p) => p.image}
          renderItem={renderProduct}
        />

      ) : (
        <div className="py-20 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">Subcategories coming soon</p>
          <Link to="/categories" className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">
            Explore all categories
          </Link>
        </div>
      )}
    </div>
  );
}
