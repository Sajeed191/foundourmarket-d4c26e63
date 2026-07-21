import { Link } from "@tanstack/react-router";
import { Scale, Check, ArrowRight, Plus, Star, Package, ChevronDown } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

import { useProducts } from "@/lib/use-products";
import { resolveImage, discountPercent, type Product } from "@/lib/products";
import { useRegion } from "@/lib/region";
import { useCompare } from "@/hooks/use-compare";
import { Price } from "@/components/site/Price";

/**
 * PDP — Product Comparison v3.1 (Amazon/Flipkart style, live inline table).
 *
 * No Compare CTA button anywhere. The comparison table updates live as the
 * shopper toggles similar products. The only navigation into `/compare` is a
 * subtle "View Full Comparison →" text link in the table header.
 *
 *   Section header
 *   ─────────────
 *   Carousel:  [Current Product] [Similar 1] [Similar 2] …
 *   Live comparison table (Price · Discount · Rating · Reviews · Availability · Shipping · Warranty)
 *   Inline "View all specifications" toggle → expands additional attribute rows
 *
 * Reuses the existing compare store and `/compare` page unchanged.
 */

type ChipKind = "bestseller" | "hot" | "flash" | "trending" | "new" | "featured";

function pickChip(p: Product): { kind: ChipKind; label: string; cls: string } | null {
  if (p.bestseller) return { kind: "bestseller", label: "Best Seller", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" };
  if (p.flashDeal) return { kind: "flash", label: "Flash Deal", cls: "bg-rose-500/15 text-rose-300 border-rose-500/30" };
  if (p.hotDeal) return { kind: "hot", label: "Hot Deal", cls: "bg-orange-500/15 text-orange-300 border-orange-500/30" };
  if (p.trending) return { kind: "trending", label: "Trending", cls: "bg-sky-500/15 text-sky-300 border-sky-500/30" };
  if (p.newArrival) return { kind: "new", label: "New Arrival", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" };
  if (p.featured) return { kind: "featured", label: "Featured", cls: "bg-violet-500/15 text-violet-300 border-violet-500/30" };
  return null;
}

export function PDPCompareSection({ currentProduct }: { currentProduct: Product }) {
  const { products } = useProducts();
  const { priceOf, compareOf, currency } = useRegion();
  const { slugs, toggle, has, isFull, max, remove } = useCompare();
  const [showAll, setShowAll] = useState(false);

  const currentSlug = currentProduct.slug;

  // Similarity ranked: brand → productType → category overlap.
  const suggestions = useMemo<Product[]>(() => {
    if (!products.length) return [];
    const cur = currentProduct;
    const curCats = new Set([cur.category, ...(cur.categories ?? [])].filter(Boolean));

    return products
      .filter(
        (p) =>
          p.slug !== cur.slug &&
          p.status !== "archived" &&
          p.inStock !== false,
      )
      .map((p) => {
        let score = 0;
        if (cur.brand && p.brand && p.brand === cur.brand) score += 3;
        if (cur.productType && p.productType && p.productType === cur.productType) score += 2;
        const pCats = [p.category, ...(p.categories ?? [])].filter(Boolean);
        if (pCats.some((c) => curCats.has(c))) score += 1;
        return { p, score };
      })
      .filter((x) => x.score > 0)
      .sort((a, b) => b.score - a.score)
      .slice(0, 8)
      .map((x) => x.p);
  }, [products, currentProduct]);

  // Always keep current PDP product in the compare store.
  useEffect(() => {
    if (!has(currentSlug)) toggle(currentSlug);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentSlug]);

  // Auto-prune unavailable selections (except the current product).
  useEffect(() => {
    if (!products.length || slugs.length === 0) return;
    slugs.forEach((s) => {
      if (s === currentSlug) return;
      const p = products.find((x) => x.slug === s);
      if (!p || p.status === "archived" || p.inStock === false) remove(s);
    });
  }, [products, slugs, remove, currentSlug]);

  const selectedProducts = useMemo(
    () =>
      slugs
        .map((s) =>
          s === currentSlug ? currentProduct : products.find((p) => p.slug === s),
        )
        .filter((p): p is Product => Boolean(p)),
    [slugs, products, currentSlug, currentProduct],
  );

  // Ensure current product is always first column.
  const tableProducts = useMemo(() => {
    const rest = selectedProducts.filter((p) => p.slug !== currentSlug);
    return [currentProduct, ...rest];
  }, [selectedProducts, currentProduct, currentSlug]);

  const handleToggle = (slug: string) => {
    if (slug === currentSlug) return;
    if (!has(slug) && isFull) {
      toast.message(`Maximum ${max} products`);
      return;
    }
    toggle(slug);
  };

  // Row builders — memoized for perf.
  const rows = useMemo(() => buildRows(tableProducts, { priceOf, compareOf, region }), [tableProducts, priceOf, compareOf, region]);
  const extraRows = useMemo(() => buildExtraRows(tableProducts), [tableProducts]);

  // Empty state — no similar products yet.
  if (suggestions.length === 0) {
    return (
      <section
        className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
        data-pdp-compare
      >
        <SectionHeader count={1} showLink={false} />
        <div className="mt-6 rounded-[20px] border border-white/[0.06] bg-white/[0.02] px-6 py-10 sm:py-14 flex flex-col items-center text-center">
          <div className="size-12 rounded-full bg-white/[0.04] border border-white/[0.06] grid place-items-center mb-4">
            <Package className="size-5 text-white/50" aria-hidden />
          </div>
          <p className="text-[14px] text-white/85 max-w-sm leading-relaxed">
            No similar products are available for comparison yet.
          </p>
          <p className="mt-1.5 text-[12px] text-white/50 max-w-sm leading-relaxed">
            We'll automatically suggest comparable products as the catalog grows.
          </p>
        </div>
      </section>
    );
  }

  return (
    <section
      className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 mt-20"
      data-pdp-compare
    >
      <SectionHeader count={tableProducts.length} showLink={tableProducts.length >= 2} />

      {/* Carousel */}
      <div className="mt-6 -mx-4 sm:mx-0 overflow-hidden">
        <ul
          className="flex overflow-x-auto snap-x snap-mandatory gap-3 px-4 sm:px-0 pb-3 [scrollbar-width:none] [-ms-overflow-style:none] [&::-webkit-scrollbar]:hidden"
          style={{
            scrollPaddingLeft: "1rem",
            overscrollBehaviorX: "contain",
            WebkitOverflowScrolling: "touch",
          }}
        >
          {/* Pinned current-product card */}
          <li className="snap-start shrink-0 w-[62%] min-[420px]:w-[46%] sm:w-[240px]">
            <CardShell active pinned>
              <CardMedia product={currentProduct} />
              <div className="p-3">
                <div className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 border border-amber-500/40 px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest text-amber-300">
                  Current Product
                </div>
                <p className="mt-1.5 block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.5em]">
                  {currentProduct.name}
                </p>
                <StatsRow product={currentProduct} price={priceOf(currentProduct)} />
                <div className="mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider bg-amber-500/20 text-amber-200 border border-amber-500/40 cursor-default">
                  <Check className="size-3.5" aria-hidden /> Locked In
                </div>
              </div>
            </CardShell>
          </li>

          {suggestions.map((p) => {
            const active = has(p.slug);
            const disabled = !active && isFull;
            const chip = pickChip(p);
            return (
              <li
                key={p.slug}
                className="snap-start shrink-0 w-[62%] min-[420px]:w-[46%] sm:w-[240px]"
              >
                <CardShell active={active}>
                  <CardMedia product={p} chip={chip} />
                  <div className="p-3">
                    <Link
                      to="/products/$slug"
                      params={{ slug: p.slug }}
                      className="block text-[13px] font-medium text-white/95 line-clamp-2 leading-snug min-h-[2.5em] hover:text-accent transition-colors"
                    >
                      {p.name}
                    </Link>
                    <StatsRow product={p} price={priceOf(p)} />
                    <button
                      onClick={() => handleToggle(p.slug)}
                      aria-pressed={active}
                      disabled={disabled}
                      className={`mt-3 w-full inline-flex items-center justify-center gap-1.5 rounded-full px-3 py-2 text-[11px] font-semibold uppercase tracking-wider transition-all duration-200 ease-out active:scale-95 disabled:opacity-40 disabled:cursor-not-allowed ${
                        active
                          ? "bg-accent text-accent-foreground"
                          : "bg-white/[0.05] text-white/85 hover:bg-white/[0.1] border border-white/[0.08]"
                      }`}
                    >
                      {active ? (
                        <>
                          <Check className="size-3.5" aria-hidden /> Selected
                        </>
                      ) : (
                        <>
                          <Plus className="size-3.5" aria-hidden /> Select
                        </>
                      )}
                    </button>
                  </div>
                </CardShell>
              </li>
            );
          })}
          <div aria-hidden className="shrink-0 w-1" />
        </ul>
      </div>

      {/* Live comparison table */}
      {tableProducts.length >= 2 ? (
        <div className="mt-6 rounded-[20px] border border-white/[0.08] bg-white/[0.02] overflow-hidden animate-fade-in">
          <div className="overflow-x-auto [scrollbar-width:thin]">
            <table className="w-full min-w-[560px] text-left border-collapse">
              <thead>
                <tr className="border-b border-white/[0.08]">
                  <th className="sticky left-0 z-10 bg-[#0d0d0f] px-4 py-3 text-[10px] font-mono uppercase tracking-widest text-white/40 w-[130px] min-w-[130px]">
                    Feature
                  </th>
                  {tableProducts.map((p) => {
                    const isCurrent = p.slug === currentSlug;
                    return (
                      <th
                        key={p.slug}
                        className="px-3 py-3 align-top min-w-[150px]"
                      >
                        <div className="flex flex-col gap-1.5">
                          {isCurrent && (
                            <span className="inline-flex self-start items-center rounded-full bg-amber-500/15 border border-amber-500/40 px-1.5 py-0.5 text-[9px] font-bold uppercase tracking-widest text-amber-300">
                              Current
                            </span>
                          )}
                          <Link
                            to="/products/$slug"
                            params={{ slug: p.slug }}
                            className="text-[12.5px] font-medium text-white/95 line-clamp-2 leading-snug hover:text-accent transition-colors"
                          >
                            {p.name}
                          </Link>
                        </div>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <TableRow key={row.label} row={row} />
                ))}
                {showAll && extraRows.map((row) => <TableRow key={row.label} row={row} />)}
              </tbody>
            </table>
          </div>

          {extraRows.length > 0 && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className="w-full flex items-center justify-center gap-1.5 px-4 py-3 text-[12px] font-medium text-white/70 hover:text-white border-t border-white/[0.06] hover:bg-white/[0.02] transition-colors"
            >
              {showAll ? "Hide specifications" : "View all specifications"}
              <ChevronDown
                className={`size-4 transition-transform duration-200 ${showAll ? "rotate-180" : ""}`}
                aria-hidden
              />
            </button>
          )}
        </div>
      ) : (
        <div className="mt-6 rounded-[20px] border border-dashed border-white/[0.08] bg-white/[0.015] px-5 py-6 text-center animate-fade-in">
          <p className="text-[13px] text-white/70">
            Select a similar product to see a live comparison.
          </p>
          <p className="mt-1 text-[11.5px] text-white/45">
            The comparison table updates automatically.
          </p>
        </div>
      )}
    </section>
  );
}

function SectionHeader({ count, showLink }: { count: number; showLink: boolean }) {
  return (
    <div className="flex items-start gap-3.5">
      <span aria-hidden className="mt-1.5 h-6 w-[3px] rounded-full bg-accent shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-[18px] sm:text-[20px] font-semibold tracking-tight text-foreground leading-tight inline-flex items-center gap-2">
            <Scale className="size-[18px] text-accent" aria-hidden />
            Product Comparison
          </h2>
          {showLink && (
            <Link
              to="/compare"
              className="shrink-0 inline-flex items-center gap-1 text-[12px] font-medium text-accent hover:brightness-125 transition-all pt-1"
            >
              View Full Comparison
              <ArrowRight className="size-3.5" aria-hidden />
            </Link>
          )}
        </div>
        <p className="mt-1 text-[13px] text-muted-foreground/85 leading-relaxed">
          {showLink
            ? `Showing ${count} product${count === 1 ? "" : "s"} — updates as you select.`
            : "Compare this product with similar alternatives."}
        </p>
        <p className="mt-1 text-[11.5px] text-muted-foreground/60 leading-relaxed">
          Ranked by brand, product type, and category.
        </p>
      </div>
    </div>
  );
}

function CardShell({
  active,
  pinned,
  children,
}: {
  active?: boolean;
  pinned?: boolean;
  children: React.ReactNode;
}) {
  return (
    <div
      className={`rounded-[20px] border overflow-hidden bg-white/[0.02] transition-all duration-200 ease-out h-full ${
        pinned
          ? "border-amber-500/40 ring-1 ring-amber-500/25"
          : active
            ? "border-accent/70 ring-1 ring-accent/40"
            : "border-white/[0.08] hover:border-white/20 sm:hover:-translate-y-0.5 active:scale-[0.99]"
      }`}
    >
      {children}
    </div>
  );
}

function CardMedia({
  product,
  chip,
}: {
  product: Product;
  chip?: { label: string; cls: string } | null;
}) {
  return (
    <Link
      to="/products/$slug"
      params={{ slug: product.slug }}
      className="relative block aspect-square bg-black/30 overflow-hidden"
    >
      {product.image && (
        <img
          src={resolveImage(product.image)}
          alt={product.name}
          loading="lazy"
          decoding="async"
          className="w-full h-full object-cover"
        />
      )}
      {chip && (
        <span
          className={`absolute top-2 left-2 inline-flex items-center rounded-full border px-2 py-0.5 text-[9.5px] font-bold uppercase tracking-widest backdrop-blur ${chip.cls}`}
        >
          {chip.label}
        </span>
      )}
    </Link>
  );
}

function StatsRow({ product, price }: { product: Product; price: number }) {
  return (
    <div className="mt-2 flex items-center gap-2.5 text-[11px] text-white/70 tabular-nums">
      <span className="inline-flex items-center gap-0.5">
        <Star className="size-3 fill-amber-400 text-amber-400" aria-hidden />
        <span className="font-medium text-white/90">{Number(product.rating || 0).toFixed(1)}</span>
      </span>
      <span className="text-white/50">({Number(product.reviews || 0)})</span>
      <span className="ml-auto">
        <Price value={price} variant="current" className="text-[13px]" />
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Table row model
// ---------------------------------------------------------------------------

type Cell = { key: string; node: React.ReactNode; highlight?: boolean };
type Row = { label: string; cells: Cell[] };

function TableRow({ row }: { row: Row }) {
  return (
    <tr className="border-b border-white/[0.05] last:border-b-0">
      <th
        scope="row"
        className="sticky left-0 z-10 bg-[#0d0d0f] px-4 py-3 text-[11px] font-medium text-white/55 align-top w-[130px] min-w-[130px]"
      >
        {row.label}
      </th>
      {row.cells.map((c) => (
        <td
          key={c.key}
          className={`px-3 py-3 align-top text-[12.5px] leading-snug ${c.highlight ? "text-emerald-300 font-semibold" : "text-white/90"}`}
        >
          {c.node}
        </td>
      ))}
    </tr>
  );
}

function buildRows(
  items: Product[],
  ctx: {
    priceOf: (p: Product) => number;
    compareOf: (p: Product) => number | null;
    region: { country: "IN" | "INT" } | { country: string };
  },
): Row[] {
  const isIN = (ctx.region as { country: string }).country === "IN";

  const prices = items.map((p) => ctx.priceOf(p));
  const minPrice = Math.min(...prices);
  const ratings = items.map((p) => Number(p.rating || 0));
  const maxRating = Math.max(...ratings);
  const reviews = items.map((p) => Number(p.reviews || 0));
  const maxReviews = Math.max(...reviews);
  const discounts = items.map((p) => {
    const cmp = ctx.compareOf(p);
    return discountPercent(cmp, ctx.priceOf(p)) ?? 0;
  });
  const maxDiscount = Math.max(...discounts);

  return [
    {
      label: "Price",
      cells: items.map((p, i) => ({
        key: p.slug,
        highlight: prices[i] === minPrice && items.length > 1,
        node: <Price value={prices[i]} variant="current" className="text-[13.5px]" />,
      })),
    },
    {
      label: "Discount",
      cells: items.map((p, i) => ({
        key: p.slug,
        highlight: discounts[i] > 0 && discounts[i] === maxDiscount && items.length > 1,
        node: discounts[i] > 0 ? `${discounts[i]}% off` : <span className="text-white/40">—</span>,
      })),
    },
    {
      label: "Rating",
      cells: items.map((p, i) => ({
        key: p.slug,
        highlight: ratings[i] > 0 && ratings[i] === maxRating && items.length > 1,
        node: (
          <span className="inline-flex items-center gap-1 tabular-nums">
            <Star className="size-3.5 fill-amber-400 text-amber-400" aria-hidden />
            {ratings[i].toFixed(1)}
          </span>
        ),
      })),
    },
    {
      label: "Reviews",
      cells: items.map((p, i) => ({
        key: p.slug,
        highlight: reviews[i] > 0 && reviews[i] === maxReviews && items.length > 1,
        node: <span className="tabular-nums">{reviews[i].toLocaleString()}</span>,
      })),
    },
    {
      label: "Availability",
      cells: items.map((p) => ({
        key: p.slug,
        node:
          p.inStock === false ? (
            <span className="text-rose-300">Out of stock</span>
          ) : (
            <span className="text-emerald-300">In stock</span>
          ),
      })),
    },
    {
      label: "Shipping",
      cells: items.map((p) => {
        const fee = isIN ? Number(p.shippingFeeInr || 0) : Number(p.shippingFeeUsd || 0);
        const label =
          fee <= 0
            ? "Free"
            : isIN
              ? `₹${fee.toLocaleString("en-IN")}`
              : `$${fee.toLocaleString("en-US")}`;
        return {
          key: p.slug,
          highlight: fee <= 0 && items.length > 1,
          node: label,
        };
      }),
    },
    {
      label: "Warranty",
      cells: items.map((p) => ({
        key: p.slug,
        node: p.warranty || <span className="text-white/40">—</span>,
      })),
    },
  ];
}

function buildExtraRows(items: Product[]): Row[] {
  const rows: Row[] = [];

  const push = (label: string, get: (p: Product) => React.ReactNode) => {
    const cells = items.map((p) => ({ key: p.slug, node: get(p) }));
    // Only include the row if at least one product has a meaningful value.
    const hasAny = cells.some((c) => c.node !== null && c.node !== undefined && c.node !== "");
    if (hasAny) rows.push({ label, cells });
  };

  push("Brand", (p) => p.brand || <span className="text-white/40">—</span>);
  push("Type", (p) => p.productType || <span className="text-white/40">—</span>);
  push("Category", (p) => p.category || <span className="text-white/40">—</span>);
  push("SKU", (p) => p.sku || <span className="text-white/40">—</span>);
  push("Returns", (p) =>
    p.returnEligible
      ? `${p.returnWindowDays ?? 7} days`
      : <span className="text-white/40">Not eligible</span>,
  );
  push("Replacement", (p) =>
    p.replacementEligible ? (
      <span className="text-emerald-300">Available</span>
    ) : (
      <span className="text-white/40">Not available</span>
    ),
  );
  push("International shipping", (p) =>
    p.internationalShipping ? (
      <span className="text-emerald-300">Yes</span>
    ) : (
      <span className="text-white/40">No</span>
    ),
  );

  return rows;
}
