import { createFileRoute, Link } from "@tanstack/react-router";
import { CATEGORIES } from "@/lib/products";
import { useProducts } from "@/lib/use-products";
import { ProductCard } from "@/components/site/ProductCard";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/category/$slug")({
  head: ({ params }) => {
    const cat = CATEGORIES.find((c) => c.slug === params.slug);
    return {
      meta: [
        { title: `${cat?.name ?? "Category"} — FoundOurMarket™` },
        { name: "description", content: `Shop ${cat?.name ?? "premium products"} curated from the global marketplace.` },
      ],
    };
  },
  component: CategoryPage,
});

function CategoryPage() {
  const { slug } = Route.useParams();
  const cat = CATEGORIES.find((c) => c.slug === slug);
  const { products, loading } = useProducts();
  const items = products.filter((p) => p.category === slug);

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
        <p className="text-muted-foreground mt-3">{items.length} product{items.length === 1 ? "" : "s"}</p>
      </header>

      {loading ? (
        <div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-24 text-center border border-dashed border-border rounded-2xl">
          <p className="text-muted-foreground">No products in this category yet. Check back soon.</p>
          <Link to="/" className="inline-block mt-6 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1">
            Browse all
          </Link>
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {items.map((p) => (<ProductCard key={p.slug} product={p} />))}
        </div>
      )}
    </div>
  );
}
