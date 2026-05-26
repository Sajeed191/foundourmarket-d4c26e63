import { createFileRoute, Link } from "@tanstack/react-router";
import { CATEGORIES, getProductsByCategory } from "@/lib/products";
import { ProductCard } from "@/components/site/ProductCard";

export const Route = createFileRoute("/category/$slug")({
  loader: ({ params }) => {
    const cat = CATEGORIES.find((c) => c.slug === params.slug);
    const products = getProductsByCategory(params.slug);
    return { cat, products, slug: params.slug };
  },
  head: ({ loaderData }) => ({
    meta: [
      { title: `${loaderData?.cat?.name ?? "Category"} — FoundOurMarket™` },
      { name: "description", content: `Shop ${loaderData?.cat?.name ?? "premium products"} curated from the global marketplace.` },
    ],
  }),
  component: CategoryPage,
});

function CategoryPage() {
  const { cat, products, slug } = Route.useLoaderData();
  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <nav className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-6">
        <Link to="/" className="hover:text-foreground">Shop</Link>
        <span className="mx-2">/</span>
        <span className="text-foreground">{cat?.name ?? slug}</span>
      </nav>
      <header className="mb-12">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Category</p>
        <h1 className="text-4xl md:text-6xl font-display font-semibold tracking-tight capitalize">{cat?.name ?? slug}</h1>
        <p className="text-muted-foreground mt-3">{products.length} product{products.length === 1 ? "" : "s"}</p>
      </header>

      {products.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products in this category yet. Check back soon.</p>
          <Link to="/" className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">
            Browse all
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {products.map((p) => (<ProductCard key={p.slug} product={p} />))}
        </div>
      )}
    </div>
  );
}
