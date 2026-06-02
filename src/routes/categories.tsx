import { createFileRoute } from "@tanstack/react-router";
import { useMemo } from "react";
import { useAllCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { CategoryCard } from "@/components/site/CategoryCard";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "All Categories — FoundOurMarket™" },
      { name: "description", content: "Browse every category on FoundOurMarket — home, kitchen, gaming, electronics, beauty, toys, pet & vehicle accessories, delivered worldwide." },
      { property: "og:title", content: "All Categories — FoundOurMarket™" },
      { property: "og:description", content: "Browse every category on FoundOurMarket — curated products delivered worldwide." },
    ],
  }),
  component: CategoriesPage,
});

function CategoriesPage() {
  const { mains, subsByParent } = useAllCategories();
  const { products } = useProducts();

  const counts = useMemo(
    () =>
      products.reduce<Record<string, number>>((acc, p) => {
        acc[p.category] = (acc[p.category] ?? 0) + 1;
        return acc;
      }, {}),
    [products],
  );

  return (
    <section className="px-4 sm:px-6 py-8 sm:py-14 max-w-7xl mx-auto mobile-page-clearance">
      <div className="mb-7 sm:mb-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Browse</p>
        <h1 className="text-fluid-2xl font-display tracking-tight">All Categories</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Explore everything FoundOurMarket has to offer — organised by main category and subcategory.
        </p>
      </div>

      <div className="space-y-8 sm:space-y-12">
        {mains.map((cat) => {
          const subs = subsByParent(cat.id);
          const subCount = subs.reduce((n, s) => n + (counts[s.slug] ?? 0), 0);
          const total = (counts[cat.slug] ?? 0) + subCount;
          return (
            <div key={cat.slug} className="space-y-3 sm:space-y-4">
              <h2 className="text-sm sm:text-base font-display font-semibold tracking-tight text-white/90">
                {cat.name}
                <span className="ml-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {total} items
                </span>
              </h2>
              {/* Image-first card grid — 3-col mobile, equal height */}
              <div className="grid grid-cols-3 md:grid-cols-5 gap-2.5 sm:gap-4">
                <CategoryCard
                  category={cat}
                  count={total}
                  to="/category/$slug"
                  params={{ slug: cat.slug }}
                />
                {subs.map((s) => (
                  <CategoryCard
                    key={s.slug}
                    category={s}
                    count={counts[s.slug] ?? 0}
                    to="/category/$main/$sub"
                    params={{ main: cat.slug, sub: s.slug }}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
