import { createFileRoute, Link } from "@tanstack/react-router";
import { useMemo } from "react";
import { ArrowRight } from "lucide-react";
import { useAllCategories, type Category } from "@/lib/use-categories";
import { useProducts } from "@/lib/use-products";
import { iconForCategory } from "@/components/site/CategoryCard";

export const Route = createFileRoute("/categories")({
  head: () => ({
    meta: [
      { title: "All Categories — FoundOurMarket™" },
      { name: "description", content: "Browse every department on FoundOurMarket — home, kitchen, gaming, electronics, beauty, toys, pet & vehicle accessories, delivered worldwide." },
      { property: "og:title", content: "All Categories — FoundOurMarket™" },
      { property: "og:description", content: "Browse every department on FoundOurMarket — curated products delivered worldwide." },
    ],
  }),
  component: CategoriesPage,
});

/* Placeholder/test category names that should never be shown to customers
   unless they actually contain real products. */
const PLACEHOLDER_NAMES = ["main", "default", "uncategorized", "test"];

function isPlaceholder(cat: Category) {
  const name = cat.name.trim().toLowerCase();
  const slug = cat.slug.trim().toLowerCase();
  return PLACEHOLDER_NAMES.includes(name) || PLACEHOLDER_NAMES.includes(slug);
}

/* Premium main-category (department) card — image-first, hierarchy-first.
   Shows image, name, product count, subcategory count, and a Browse CTA. */
function DepartmentCard({
  cat,
  total,
  subCount,
}: {
  cat: Category;
  total: number;
  subCount: number;
}) {
  const Icon = iconForCategory(cat.slug, cat.name);
  const img = cat.image || cat.mobile_image || "";

  return (
    <Link
      to="/category/$slug"
      params={{ slug: cat.slug }}
      className="group flex h-full flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-colors hover:border-accent/40"
      style={{ contentVisibility: "auto", containIntrinsicSize: "360px" }}
    >
      {/* Large image — ~65-70% of card height */}
      <div className="relative aspect-[5/4] w-full overflow-hidden bg-white/[0.04]">
        {img ? (
          <img
            src={img}
            alt={cat.name}
            loading="lazy"
            className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <span className="grid size-16 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25">
              <Icon className="size-8" />
            </span>
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-background/70 via-transparent to-transparent" />
      </div>

      {/* Meta */}
      <div className="flex flex-1 flex-col gap-3 p-4 sm:p-5">
        <div>
          <h2 className="line-clamp-1 text-base font-display font-semibold tracking-tight text-white transition-colors group-hover:text-accent sm:text-lg">
            {cat.name}
          </h2>
          <div className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-[11px] font-mono uppercase tracking-widest text-muted-foreground sm:text-xs">
            <span className="inline-flex items-center gap-1">
              📦 {total > 0 ? `${total} Products` : "Coming Soon"}
            </span>
            <span className="inline-flex items-center gap-1">📂 {subCount} Subcategories</span>
          </div>
        </div>

        <span className="mt-auto inline-flex items-center justify-between gap-1.5 rounded-xl bg-accent/10 px-3.5 py-2.5 text-sm font-semibold text-accent ring-1 ring-accent/20 transition-colors group-hover:bg-accent group-hover:text-accent-foreground">
          Browse {cat.name}
          <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" />
        </span>
      </div>
    </Link>
  );
}

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

  // Compute total (own + subcategory) product counts for each main category.
  const totalFor = (cat: Category) => {
    const subs = subsByParent(cat.id);
    const subTotal = subs.reduce((n, s) => n + (counts[s.slug] ?? 0), 0);
    return (counts[cat.slug] ?? 0) + subTotal;
  };

  // Visible mains: drop placeholder/test categories that have no real products.
  const visibleMains = useMemo(
    () => mains.filter((cat) => !isPlaceholder(cat) || totalFor(cat) > 0),
    [mains, counts], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <section className="px-4 sm:px-6 py-8 sm:py-14 max-w-7xl mx-auto mobile-page-clearance">
      <div className="mb-8 sm:mb-12">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Browse</p>
        <h1 className="text-fluid-2xl font-display tracking-tight">Explore All Categories</h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Every department on FoundOurMarket. Pick a category to discover its subcategories and products.
        </p>
      </div>

      {/* Department grid — main categories only */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 sm:gap-5">
        {visibleMains.map((cat) => (
          <DepartmentCard
            key={cat.slug}
            cat={cat}
            total={totalFor(cat)}
            subCount={subsByParent(cat.id).length}
          />
        ))}
      </div>
    </section>
  );
}
