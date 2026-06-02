import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";
import { titleizeSlug } from "@/lib/category-path";
import { Loader2 } from "lucide-react";

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

  const items = useMemo(
    () => products.filter((p) => p.category === sub),
    [products, sub],
  );

  useEffect(() => {
    if (cat?.id) void supabase.rpc("track_category_event", { _id: cat.id, _event: "view" });
  }, [cat?.id]);

  // If the slug isn't actually a subcategory of `main`, send to the flat page so
  // the URL stays correct (no broken nested URLs, zero SEO loss).
  if (!catsLoading && cat && parent && cat.parent_id !== parent.id) {
    return <Navigate to="/category/$slug" params={{ slug: sub }} replace />;
  }

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 mobile-page-clearance md:pb-16">
      <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
        <Link to="/" className="hover:text-foreground">Shop</Link>
        <span className="mx-2">/</span>
        <Link to="/category/$slug" params={{ slug: main }} className="hover:text-foreground">{parent?.name ?? titleizeSlug(main)}</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{cat?.name ?? titleizeSlug(sub)}</span>
      </nav>

      <header className="relative mb-8 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
        {cat?.banner_image && (
          <img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">{parent?.name ?? titleizeSlug(main)}</p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight capitalize">{cat?.name ?? titleizeSlug(sub)}</h1>
          {cat?.description && <p className="text-muted-foreground mt-2 text-sm max-w-2xl">{cat.description}</p>}
          <p className="text-muted-foreground mt-2 text-sm">{items.length} product{items.length === 1 ? "" : "s"}</p>
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
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {items.map((p) => (<ProductCard key={p.slug} product={p} />))}
        </div>
      )}
    </div>
  );
}

