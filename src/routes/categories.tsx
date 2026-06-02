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

/* Priority ordering — highest-value departments appear first. Anything not
   listed falls to the end, keeping its relative sort_order. */
const PRIORITY_ORDER = [
  "electronics",
  "home",
  "kitchen",
  "beauty",
  "fitness",
  "gaming",
  "toys",
  "pet",
  "vehicle",
  "accessories",
  "gadgets",
];

function priorityRank(cat: Category) {
  const hay = `${cat.slug} ${cat.name}`.toLowerCase();
  const idx = PRIORITY_ORDER.findIndex((k) => hay.includes(k));
  return idx === -1 ? PRIORITY_ORDER.length : idx;
}

/* Premium main-category (department) card — image-first, hierarchy-first.
   Fixed structure so every card shares the same height, ratio, and CTA
   position regardless of product counts. */
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
      {/* Large image — consistent ratio across all cards */}
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

      {/* Meta — flex-1 keeps the CTA pinned to the bottom on every card */}
      <div className="flex flex-1 flex-col gap-2.5 p-4 sm:p-5">
        <h2 className="line-clamp-1 text-base font-display font-semibold tracking-tight text-white transition-colors group-hover:text-accent sm:text-lg">
          {cat.name}
        </h2>

        {/* Stats — sentence case, easy to scan */}
        {total > 0 ? (
          <p className="text-xs text-muted-foreground sm:text-[13px]">
            📦 {total} {total === 1 ? "Product" : "Products"}
            <span className="mx-1.5 text-white/20">•</span>
            📂 {subCount} {subCount === 1 ? "Subcategory" : "Subcategories"}
          </p>
        ) : (
          <span className="inline-flex w-fit items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[11px] font-medium text-accent">
            🟠 Products Coming Soon
          </span>
        )}

        {/* Premium micro CTA — compact pill */}
        <span className="mt-auto inline-flex w-fit items-center gap-1.5 rounded-full border border-accent/40 bg-background/40 px-3 py-1.5 text-xs font-semibold text-accent backdrop-blur transition-colors group-hover:border-accent group-hover:bg-accent group-hover:text-accent-foreground">
          Browse {cat.name}
          <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />
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

  // Visible mains: drop placeholder/test categories that have no real products,
  // then order by priority (Electronics first), then by sort order.
  const visibleMains = useMemo(
    () =>
      mains
        .filter((cat) => !isPlaceholder(cat) || totalFor(cat) > 0)
        .sort((a, b) => {
          const ra = priorityRank(a);
          const rb = priorityRank(b);
          if (ra !== rb) return ra - rb;
          return a.sort_order - b.sort_order;
        }),
    [mains, counts], // eslint-disable-line react-hooks/exhaustive-deps
  );

  // Dynamic summary counts.
  const departmentCount = visibleMains.length;
  const subcategoryCount = useMemo(
    () => visibleMains.reduce((n, cat) => n + subsByParent(cat.id).length, 0),
    [visibleMains], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <section className="px-4 sm:px-6 pt-8 sm:pt-14 pb-8 max-w-7xl mx-auto">
      <div className="mb-8 sm:mb-12">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Browse</p>
        <h1 className="text-fluid-2xl font-display tracking-tight">Explore All Categories</h1>
        <p className="mt-2 text-sm font-medium text-white/80">
          {departmentCount} {departmentCount === 1 ? "Department" : "Departments"}
          <span className="mx-1.5 text-white/20">•</span>
          {subcategoryCount} {subcategoryCount === 1 ? "Subcategory" : "Subcategories"}
        </p>
        <p className="text-sm text-muted-foreground mt-2 max-w-lg">
          Every department in FoundOurMarket. Pick a category to discover its products and subcategories.
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
