import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { X, Check, Minus, ShoppingBag, Scale, Trophy, ChevronDown, ChevronUp } from "lucide-react";
import { StarRating } from "@/components/site/StarRating";
import { useCompare } from "@/hooks/use-compare";
import { useProducts } from "@/lib/use-products";
import { resolveImage, fetchProductsBySlugs, type Product } from "@/lib/products";
import { useCart } from "@/lib/cart";

export const Route = createFileRoute("/compare")({
  head: () => ({
    meta: [
      { title: "Compare products — FoundOurMarket™" },
      { name: "description", content: "Compare up to 4 products side-by-side: price, rating, specs, shipping, warranty." },
      { property: "og:title", content: "Compare products — FoundOurMarket™" },
      { property: "og:description", content: "Compare up to 4 products side-by-side." },
    ],
  }),
  component: ComparePage,
});

type SpecRow = {
  key: string;
  label: string;
  values: (string | number | null)[];
  /** Column index of the winning value, or null if no winner applies. */
  winnerIndex?: number | null;
  /** Label shown next to the winning column. */
  winnerLabel?: string;
};

type SpecGroup = { id: string; label: string; rows: SpecRow[] };

function normalize(v: string | number | null | undefined): string {
  if (v === null || v === undefined || v === "") return "—";
  if (typeof v === "number") return String(v);
  return v;
}

function hasDifference(row: SpecRow) {
  const vals = row.values.map((v) => normalize(v).toLowerCase());
  return new Set(vals).size > 1;
}

function buildGroups(items: Product[]): SpecGroup[] {
  const priceOf = (p: Product) => p.discount ? p.price * (1 - p.discount / 100) : p.price;

  const lowestPriceIdx = items.reduce((best, p, i) => (priceOf(p) < priceOf(items[best]) ? i : best), 0);
  const highestRatingIdx = items.reduce((best, p, i) => ((p.rating ?? 0) > (items[best].rating ?? 0) ? i : best), 0);
  const bestDiscountIdx = items.reduce((best, p, i) => ((p.discount ?? 0) > (items[best].discount ?? 0) ? i : best), 0);
  const mostReviewsIdx = items.reduce((best, p, i) => ((p.reviews ?? 0) > (items[best].reviews ?? 0) ? i : best), 0);

  const general: SpecRow[] = [
    {
      key: "price", label: "Price",
      values: items.map((p) => `$${priceOf(p).toFixed(2)}${p.discount ? ` (was $${p.price.toFixed(2)})` : ""}`),
      winnerIndex: items.length > 1 ? lowestPriceIdx : null, winnerLabel: "Lowest price",
    },
    {
      key: "discount", label: "Discount",
      values: items.map((p) => p.discount ? `${p.discount}%` : "—"),
      winnerIndex: items.length > 1 && (items[bestDiscountIdx].discount ?? 0) > 0 ? bestDiscountIdx : null,
      winnerLabel: "Best discount",
    },
    {
      key: "rating", label: "Rating",
      values: items.map((p) => p.reviews > 0 ? `${p.rating.toFixed(1)} (${p.reviews})` : "No reviews"),
      winnerIndex: items.length > 1 && (items[highestRatingIdx].reviews ?? 0) > 0 ? highestRatingIdx : null,
      winnerLabel: "Highest rating",
    },
    {
      key: "reviews", label: "Reviews",
      values: items.map((p) => p.reviews ?? 0),
      winnerIndex: items.length > 1 && (items[mostReviewsIdx].reviews ?? 0) > 0 ? mostReviewsIdx : null,
      winnerLabel: "Most reviews",
    },
    { key: "stock", label: "Stock", values: items.map((p) => p.inStock ? "In stock" : "Out of stock") },
    { key: "brand", label: "Brand", values: items.map((p) => p.brand ?? "—") },
    { key: "category", label: "Category", values: items.map((p) => p.category) },
    { key: "sku", label: "SKU", values: items.map((p) => p.sku ?? "—") },
  ];

  const shipping: SpecRow[] = [
    { key: "warranty", label: "Warranty", values: items.map((p) => p.warranty || "—") },
    { key: "shippingInr", label: "Shipping (INR)", values: items.map((p) => p.shippingFeeInr ? `₹${p.shippingFeeInr}` : "Free") },
    { key: "shippingUsd", label: "Shipping (USD)", values: items.map((p) => p.shippingFeeUsd ? `$${p.shippingFeeUsd}` : "Free") },
  ];

  // Collect all specification keys across items
  const specKeys = new Set<string>();
  const attrKeys = new Set<string>();
  items.forEach((p) => {
    Object.keys(p.specifications ?? {}).forEach((k) => specKeys.add(k));
    Object.keys(p.attributes ?? {}).forEach((k) => attrKeys.add(k));
  });
  const specRows: SpecRow[] = Array.from(specKeys).sort().map((k) => ({
    key: `spec:${k}`, label: k,
    values: items.map((p) => (p.specifications ?? {})[k] ?? "—"),
  }));
  const attrRows: SpecRow[] = Array.from(attrKeys).sort().map((k) => ({
    key: `attr:${k}`, label: k,
    values: items.map((p) => (p.attributes ?? {})[k] ?? "—"),
  }));

  const description: SpecRow[] = [
    { key: "tagline", label: "Tagline", values: items.map((p) => p.tagline || "—") },
    { key: "description", label: "Description", values: items.map((p) => p.description || "—") },
  ];

  const groups: SpecGroup[] = [
    { id: "general", label: "General", rows: general },
    { id: "shipping", label: "Shipping & Warranty", rows: shipping },
  ];
  if (specRows.length) groups.push({ id: "specifications", label: "Specifications", rows: specRows });
  if (attrRows.length) groups.push({ id: "attributes", label: "Attributes", rows: attrRows });
  groups.push({ id: "description", label: "Description", rows: description });
  return groups;
}

function ComparePage() {
  const { slugs, remove, clear } = useCompare();
  const { products, loading } = useProducts();
  const { add } = useCart();

  // Grid entries are lean — fetch full records so specifications/attributes fill in
  const [full, setFull] = useState<Record<string, Product>>({});
  useEffect(() => {
    const need = slugs.filter((s) => {
      const p = products.find((x) => x.slug === s);
      return p && (p.__lean || !p.description) && !full[s];
    });
    if (need.length === 0) return;
    let active = true;
    fetchProductsBySlugs(need).then((rows) => {
      if (!active) return;
      setFull((prev) => {
        const next = { ...prev };
        for (const r of rows) next[r.slug] = r;
        return next;
      });
    });
    return () => { active = false; };
  }, [slugs, products, full]);

  const items = useMemo(() =>
    slugs
      .map((s) => full[s] ?? products.find((p) => p.slug === s))
      .filter((p): p is Product => Boolean(p))
  , [slugs, products, full]);

  const groups = useMemo(() => items.length ? buildGroups(items) : [], [items]);

  const [open, setOpen] = useState<Record<string, boolean>>({ general: true, shipping: true, specifications: true, attributes: false, description: false });

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-16">
      <div className="mb-8 flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3 inline-flex items-center gap-2">
            <Scale className="size-3" /> Side by side
          </p>
          <h1 className="text-3xl md:text-5xl font-display font-semibold">Compare products</h1>
          <p className="mt-2 text-sm text-muted-foreground">Compare up to 4 items across price, ratings, and specifications.</p>
        </div>
        {items.length > 0 && (
          <button onClick={clear} className="text-xs uppercase tracking-widest font-mono text-muted-foreground hover:text-accent transition-colors">
            Clear all
          </button>
        )}
      </div>

      {items.length === 0 ? (
        <div className="bg-card border border-border rounded-[18px] p-12 text-center">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <Scale className="size-5 text-muted-foreground" />
          </div>
          <h2 className="text-xl font-medium mb-2">No products selected</h2>
          <p className="text-sm text-muted-foreground mb-6">
            {loading ? "Loading catalog…" : "Browse products and add up to four items for comparison."}
          </p>
          <Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
            Browse Products
          </Link>
        </div>
      ) : (
        <>
          {/* Product header — horizontal snap-scroll on mobile, grid on desktop */}
          <div className="-mx-4 sm:mx-0 px-4 sm:px-0 mb-6">
            <div className="flex sm:grid gap-3 sm:gap-4 overflow-x-auto snap-x snap-mandatory sm:overflow-visible scrollbar-hide" style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
              {items.map((p) => {
                const priceFinal = p.discount ? p.price * (1 - p.discount / 100) : p.price;
                return (
                  <div key={p.id ?? p.slug} className="snap-start shrink-0 sm:shrink w-[75vw] sm:w-auto bg-card border border-border rounded-[18px] p-4 relative">
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
                    <div className="mt-2">
                      <span className="font-mono text-accent">${priceFinal.toFixed(2)}</span>
                      {p.discount ? <span className="ml-2 text-muted-foreground font-mono text-xs line-through">${p.price.toFixed(2)}</span> : null}
                    </div>
                    <div className="mt-2">
                      <StarRating rating={p.rating} count={p.reviews} showValue={p.reviews > 0} starClassName="size-3" textClassName="text-xs font-mono" />
                    </div>
                    <button
                      onClick={() => p.inStock && add(p.slug, 1)}
                      disabled={!p.inStock}
                      className="mt-3 w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-3 py-2 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-40 disabled:cursor-not-allowed"
                    >
                      <ShoppingBag className="size-3.5" /> Add to cart
                    </button>
                  </div>
                );
              })}
              {Array.from({ length: Math.max(0, 2 - items.length) }).map((_, i) => (
                <div key={`ph-${i}`} className="snap-start shrink-0 sm:shrink w-[75vw] sm:w-auto rounded-[18px] border border-dashed border-border/60 grid place-items-center min-h-[280px] text-xs text-muted-foreground font-mono uppercase tracking-widest">
                  Add another
                </div>
              ))}
            </div>
          </div>

          {/* Grouped spec accordions */}
          <div className="space-y-3">
            {groups.map((g) => {
              const isOpen = open[g.id] ?? false;
              return (
                <div key={g.id} className="bg-card/60 border border-border rounded-[18px] overflow-hidden">
                  <button
                    onClick={() => setOpen((s) => ({ ...s, [g.id]: !isOpen }))}
                    className="w-full flex items-center justify-between px-4 sm:px-5 py-3.5 hover:bg-white/[0.02] transition"
                  >
                    <span className="text-sm font-display font-semibold">{g.label}</span>
                    <span className="text-muted-foreground">{isOpen ? <ChevronUp className="size-4" /> : <ChevronDown className="size-4" />}</span>
                  </button>
                  {isOpen && (
                    <div className="border-t border-border">
                      {g.rows.map((row) => {
                        const diff = hasDifference(row);
                        return (
                          <div
                            key={row.key}
                            className={`grid px-3 sm:px-5 py-3 gap-3 border-b border-border/60 last:border-b-0 ${diff ? "bg-amber-500/[0.04]" : ""}`}
                            style={{ gridTemplateColumns: `minmax(110px, 160px) repeat(${items.length}, minmax(0, 1fr))` }}
                          >
                            <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground self-start pt-0.5 sticky left-0 bg-inherit">
                              {row.label}
                            </div>
                            {row.values.map((val, i) => {
                              const winner = row.winnerIndex === i;
                              const str = normalize(val);
                              return (
                                <div key={i} className="text-sm text-foreground/90 min-w-0">
                                  {str === "In stock" ? (
                                    <span className="inline-flex items-center gap-1 text-accent text-xs font-mono uppercase tracking-widest"><Check className="size-3" /> In stock</span>
                                  ) : str === "Out of stock" ? (
                                    <span className="inline-flex items-center gap-1 text-muted-foreground text-xs font-mono uppercase tracking-widest"><Minus className="size-3" /> Out</span>
                                  ) : (
                                    <span className="break-words whitespace-pre-wrap">{str}</span>
                                  )}
                                  {winner && (
                                    <div className="mt-1 inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                                      <Trophy className="size-2.5" /> {row.winnerLabel}
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
