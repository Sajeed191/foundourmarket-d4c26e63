import { createFileRoute, Link, Navigate } from "@tanstack/react-router";
import { useEffect, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAllCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";
import { Loader2, ArrowRight } from "lucide-react";

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

  // If this is a main category, gather its subcategories. Products shown are
  // those mapped to this category OR any of its subcategories (zero loss).
  const subs = cat ? subsByParent(cat.id) : [];
  const childSlugs = useMemo(() => subs.map((s) => s.slug), [subs]);
  const items = useMemo(
    () => products.filter((p) => p.category === slug || childSlugs.includes(p.category)),
    [products, slug, childSlugs],
  );

  useEffect(() => {
    if (cat?.id) void supabase.rpc("track_category_event", { _id: cat.id, _event: "view" });
  }, [cat?.id]);

  const parent = cat?.parent_id ? categories.find((c) => c.id === cat.parent_id) : null;

  // Old flat URL for a subcategory → redirect to the nested /category/main/sub.
  if (!catsLoading && cat && parent) {
    return <Navigate to="/category/$main/$sub" params={{ main: parent.slug, sub: cat.slug }} replace />;
  }


  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 mobile-page-clearance md:pb-16">
      <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
        <Link to="/" className="hover:text-foreground">Shop</Link>
        <span className="mx-2">/</span>
        {parent && (
          <>
            <Link to="/category/$slug" params={{ slug: parent.slug }} className="hover:text-foreground">{parent.name}</Link>
            <span className="mx-2">/</span>
          </>
        )}
        <span className="text-foreground">{cat?.name ?? slug}</span>
      </nav>

      {/* Banner */}
      <header className="relative mb-8 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
        {cat?.banner_image && (
          <img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Category</p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight capitalize">{cat?.name ?? slug}</h1>
          <p className="text-muted-foreground mt-2 text-sm">{items.length} product{items.length === 1 ? "" : "s"}</p>
        </div>
      </header>

      {/* Subcategories first */}
      {subs.length > 0 && (
        <div className="mb-8">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Shop by subcategory</p>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5 sm:gap-3">
            {subs.map((s) => (
              <Link
                key={s.slug}
                to="/category/$slug"
                params={{ slug: s.slug }}
                className="group product-card-glass relative flex aspect-square flex-col overflow-hidden p-0 hover:-translate-y-0.5 transition-transform"
              >
                <div className="absolute inset-0">
                  {s.image || s.mobile_image ? (
                    <img
                      src={s.mobile_image || s.image || ""}
                      alt={s.name}
                      loading="lazy"
                      className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
                    />
                  ) : (
                    <div className="size-full bg-accent/10" />
                  )}
                  <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/85 via-black/25 to-transparent" />
                </div>
                <div className="relative z-10 mt-auto flex items-center justify-between gap-2 p-2.5">
                  <span className="text-sm font-semibold tracking-tight truncate text-white group-hover:text-accent transition-colors">{s.name}</span>
                  <ArrowRight className="size-4 shrink-0 text-white/80 group-hover:text-accent group-hover:translate-x-0.5 transition" />
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* Products */}
      {loading ? (
        <div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-20 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products in this category yet. Check back soon.</p>
          <Link to="/" className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">
            Browse all
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
