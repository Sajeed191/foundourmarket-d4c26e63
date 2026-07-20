import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { X, Check, Minus, ShoppingBag, Scale } from "lucide-react";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useProducts } from "@/lib/use-products";
import { resolveImage, fetchProductsBySlugs, type Product } from "@/lib/products";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare products — FoundOurMarket™" },
      { name: "description", content: "Compare up to 4 products side-by-side: price, rating, stock, and details." },
      { property: "og:title", content: "Compare products — FoundOurMarket™" },
      { property: "og:description", content: "Compare up to 4 products side-by-side." },
    ],
  }),
  component: ComparePage,
});

function ComparePage() {
  const { slugs, remove, clear } = useCompare();
  const { products, loading } = useProducts();
  const { add } = useCart();

  const items = slugs
    .map((s) => products.find((p) => p.slug === s))
    .filter((p): p is Product => Boolean(p));

  // Grid products use the lean CARD projection (no `description`); fetch the
  // blurbs for the compared set (max 4) on demand so the Description row fills in.
  const [descriptions, setDescriptions] = useState<Record<string, string>>({});
  useEffect(() => {
    const missing = items.filter((p) => !p.description && !(p.slug in descriptions)).map((p) => p.slug);
    if (missing.length === 0) return;
    let active = true;
    fetchProductsBySlugs(missing).then((full) => {
      if (!active) return;
      setDescriptions((prev) => {
        const next = { ...prev };
        for (const s of missing) next[s] = full.find((f) => f.slug === s)?.description ?? "";
        return next;
      });
    });
    return () => { active = false; };
  }, [items, descriptions]);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
            <Scale className="size-3" /> Side by side
          </p>
          <h1 className="text-3xl md:text-5xl font-display font-semibold">Compare products</h1>
        </div>
        {items.length > 0 && (
          <button onClick={clear} className="text-xs uppercase tracking-widest font-mono text-muted-foreground hover:text-accent transition-colors">
            Clear all
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-2xl p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Scale className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">Nothing to compare yet</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {loading ? "Loading catalog…" : "Add products from any product page to start comparing."}
          </p>
          <Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
            Browse shop
          </Link>
        </div>
      ) : (
        <div className="overflow-x-auto -mx-6 px-6">
          <table className="w-full min-w-[640px] border-separate border-spacing-x-3">
            <thead>
              <tr>
                <th className="w-36 align-bottom text-left text-[10px] font-mono uppercase tracking-widest text-muted-foreground pb-3"></th>
                {items.map((p) => (
                  <th key={p.id ?? p.slug} className="align-bottom text-left pb-3 min-w-[200px]">
                    <div className="relative bg-card border border-border rounded-2xl p-4">
                      <button
                        onClick={() => remove(p.slug)}
                        aria-label={`Remove ${p.name}`}
                        className="absolute top-2 right-2 size-7 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-accent transition-colors"
                      >
                        <X className="size-3.5" />
                      </button>
                      <Link to="/products/$slug" params={{ slug: p.slug }} className="block">
                        <div className="aspect-square rounded-xl overflow-hidden bg-background mb-3">
                          {p.image && <img loading="lazy" decoding="async" src={resolveImage(p.image)} alt={p.name} className="w-full h-full object-cover" />}
                        </div>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground capitalize">{p.category}</p>
                        <p className="text-sm font-medium leading-snug mt-1 line-clamp-2">{p.name}</p>
                      </Link>
                    </div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="text-sm">
              <Row label="Price">
                {items.map((p) => (
                  <Cell key={p.id ?? p.slug}>
                    {p.discount ? (
                      <div>
                        <span className="font-mono text-accent">${(p.price * (1 - p.discount / 100)).toFixed(2)}</span>
                        <span className="ml-2 text-muted-foreground font-mono text-xs line-through">${p.price.toFixed(2)}</span>
                      </div>
                    ) : (
                      <span className="font-mono text-accent">${p.price.toFixed(2)}</span>
                    )}
                  </Cell>
                ))}
              </Row>
              <Row label="Rating">
                {items.map((p) => (
                  <Cell key={p.id ?? p.slug}>
                    <StarRating
                      rating={p.rating}
                      count={p.reviews}
                      showValue={p.reviews > 0}
                      starClassName="size-3"
                      textClassName="text-xs font-mono"
                    />
                  </Cell>
                ))}
              </Row>
              <Row label="Stock">
                {items.map((p) => (
                  <Cell key={p.id ?? p.slug}>
                    {p.inStock ? (
                      <span className="inline-flex items-center gap-1 text-accent text-xs font-mono uppercase tracking-widest">
                        <Check className="size-3" /> In stock
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-mono uppercase tracking-widest">
                        <Minus className="size-3" /> Out
                      </span>
                    )}
                  </Cell>
                ))}
              </Row>
              <Row label="Featured">
                {items.map((p) => (
                  <Cell key={p.id ?? p.slug}>
                    {p.featured ? <Check className="size-4 text-accent" /> : <Minus className="size-4 text-muted-foreground" />}
                  </Cell>
                ))}
              </Row>
              <Row label="Tagline">
                {items.map((p) => (
                  <Cell key={p.id ?? p.slug}>
                    <p className="text-xs text-muted-foreground">{p.tagline || "—"}</p>
                  </Cell>
                ))}
              </Row>
              <Row label="Description">
                {items.map((p) => (
                  <Cell key={p.id ?? p.slug}>
                    <p className="text-xs text-muted-foreground line-clamp-6">{p.description || descriptions[p.slug] || "—"}</p>
                  </Cell>
                ))}
              </Row>
              <tr>
                <td className="py-4 align-top text-[10px] font-mono uppercase tracking-widest text-muted-foreground"></td>
                {items.map((p) => (
                  <td key={p.id ?? p.slug} className="py-4 align-top">
                    <button
                      onClick={() => p.inStock && add(p.slug, 1)}
                      disabled={!p.inStock}
                      className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="size-3.5" /> Add to cart
                    </button>
                  </td>
                ))}
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <tr>
      <td className="py-4 align-top text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-t border-border">
        {label}
      </td>
      {children}
    </tr>
  );
}

function Cell({ children }: { children: React.ReactNode }) {
  return <td className="py-4 align-top border-t border-border">{children}</td>;
}
