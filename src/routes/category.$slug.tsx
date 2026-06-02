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

  // Main category page = subcategory chooser. Products are NOT shown here.
  const subs = cat ? subsByParent(cat.id) : [];
  const childSlugs = useMemo(() => subs.map((s) => s.slug), [subs]);

  // Product count for the whole department (own + all subcategories).
  const totalCount = useMemo(
    () => products.filter((p) => p.category === slug || childSlugs.includes(p.category)).length,
    [products, slug, childSlugs],
  );

  // Per-subcategory product counts.
  const countBySlug = useMemo(() => {
    const m: Record<string, number> = {};
    for (const p of products) m[p.category] = (m[p.category] ?? 0) + 1;
    return m;
  }, [products]);

  // Direct products of this main category (only used as a fallback when there
  // are no subcategories — never lose products).
  const ownItems = useMemo(
    () => products.filter((p) => p.category === slug),
    [products, slug],
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
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8 sm:py-12 mobile-page-clearance md:pb-12">
      <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-5">
        <Link to="/" className="hover:text-foreground">Home</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{cat?.name ?? slug}</span>
      </nav>

      {/* Hero banner */}
      <header className="relative mb-10 overflow-hidden rounded-3xl product-card-glass p-6 sm:p-10">
        <div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />
        {cat?.banner_image && (
          <img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />
        )}
        <div className="relative">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Department</p>
          <h1 className="text-3xl sm:text-5xl font-display font-semibold tracking-tight capitalize">{cat?.name ?? slug}</h1>
          <div className="mt-3 flex flex-wrap items-center gap-2">
            <span className="rounded-full border border-accent/30 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">
              {totalCount} Product{totalCount === 1 ? "" : "s"}
            </span>
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
          {/* Subcategory chooser — NO products on this page */}
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-4">Shop by subcategory</p>
          <div className="grid grid-cols-2 lg:grid-cols-3 gap-3.5 sm:gap-5">
            {subs.map((s) => {
              const count = countBySlug[s.slug] ?? 0;
              return (
                <Link
                  key={s.slug}
                  to="/category/$main/$sub"
                  params={{ main: slug, sub: s.slug }}
                  className="group product-card-glass relative flex flex-col overflow-hidden rounded-3xl p-0 transition-[transform,box-shadow] duration-300 will-change-transform hover:scale-[1.02] hover:shadow-[0_18px_50px_-12px_color-mix(in_oklab,var(--accent)_55%,transparent)]"
                >
                  <div className="relative aspect-[4/3] w-full overflow-hidden">
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
                    <div aria-hidden className="absolute inset-0 bg-gradient-to-t from-black/70 via-black/10 to-transparent" />
                  </div>
                  <div className="flex items-center justify-between gap-2 p-3.5 sm:p-4">
                    <div className="min-w-0">
                      <h3 className="truncate text-sm sm:text-base font-semibold tracking-tight group-hover:text-accent transition-colors">{s.name}</h3>
                      <p className="mt-0.5 text-xs text-muted-foreground">{count} Product{count === 1 ? "" : "s"}</p>
                    </div>
                    <span className="grid size-9 shrink-0 place-items-center rounded-full border border-accent/30 bg-background/40 text-accent transition group-hover:bg-accent group-hover:text-accent-foreground group-hover:translate-x-0.5">
                      <ArrowRight className="size-4" />
                    </span>
                  </div>
                </Link>
              );
            })}
          </div>

          {/* Large CTA row */}
          <div className="mt-10 grid gap-2.5 sm:grid-cols-2">
            {subs.map((s) => (
              <Link
                key={s.slug}
                to="/category/$main/$sub"
                params={{ main: slug, sub: s.slug }}
                className="group flex items-center justify-between rounded-2xl border border-border/60 bg-background/30 px-4 py-3.5 text-sm font-medium backdrop-blur transition hover:border-accent/50 hover:bg-accent/10"
              >
                <span className="truncate">Explore {s.name}</span>
                <ArrowRight className="size-4 shrink-0 text-accent transition group-hover:translate-x-0.5" />
              </Link>
            ))}
          </div>
        </>
      ) : ownItems.length > 0 ? (
        // Fallback: a main category with no subcategories still shows its products.
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {ownItems.map((p) => (<ProductCard key={p.slug} product={p} />))}
        </div>
      ) : (
        <div className="py-20 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">Nothing here yet. Check back soon.</p>
          <Link to="/categories" className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">
            Explore all categories
          </Link>
        </div>
      )}
    </div>
  );
}
