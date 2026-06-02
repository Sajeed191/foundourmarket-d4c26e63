import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useAllCategories } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { supabase } from "@/integrations/supabase/client";

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

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 sm:gap-4">
        {mains.map((cat) => {
          const subs = subsByParent(cat.id);
          const subCount = subs.reduce((n, s) => n + (counts[s.slug] ?? 0), 0);
          const total = (counts[cat.slug] ?? 0) + subCount;
          return (
            <div key={cat.slug} className="product-card-glass p-4 sm:p-5">
              <Link
                to="/category/$slug"
                params={{ slug: cat.slug }}
                onClick={() => void supabase.rpc("track_category_event", { _id: cat.id, _event: "click" })}
                className="group flex items-center justify-between gap-3"
              >
                <div className="min-w-0">
                  <h3 className="text-base sm:text-lg font-semibold tracking-tight truncate group-hover:text-accent transition-colors">{cat.name}</h3>
                  <p className="text-[10px] text-muted-foreground font-mono uppercase tracking-widest mt-0.5">{total} items</p>
                </div>
                <span className="shrink-0 grid size-9 place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/25 group-hover:bg-accent group-hover:text-accent-foreground transition-colors">
                  <ArrowRight className="size-4" />
                </span>
              </Link>

              {subs.length > 0 && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {subs.map((s) => (
                    <Link
                      key={s.slug}
                      to="/category/$main/$sub"
                      params={{ main: cat.slug, sub: s.slug }}
                      className="inline-flex items-center gap-1 rounded-full bg-white/[0.06] ring-1 ring-white/10 px-3 py-1.5 text-[11px] font-medium text-foreground/90 hover:bg-accent/15 hover:text-accent hover:ring-accent/30 transition-colors"
                    >
                      {s.name}
                      <span className="text-[9px] font-mono text-muted-foreground">{counts[s.slug] ?? 0}</span>
                    </Link>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
