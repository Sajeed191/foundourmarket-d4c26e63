import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Plus, ShoppingBag, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { LazyMount } from "./LazyMount";
import { recordImpression, recordClick } from "@/lib/recommendations/performance";
import type { Product } from "@/lib/products";

/**
 * Frequently Bought Together — the highest-converting PDP block.
 *
 * - Seed product is always included; companions are individually selectable.
 * - Live bundle total + savings recompute as selections change.
 * - Only in-stock, region-visible items can be bundled (stock-respecting).
 * - "Add bundle to cart" adds every selected item in one action.
 * Variant selection stays on the PDP itself; the bundle adds default variants.
 */
export function FrequentlyBoughtTogether({
  seed,
  companions,
}: {
  seed: Product;
  companions: Product[];
}) {
  const { add } = useCart();
  const { priceOf, format, market } = useRegion();
  const [busy, setBusy] = useState(false);

  const bundle = useMemo(
    () => [seed, ...companions.filter((p) => p.inStock)].slice(0, 4),
    [seed, companions],
  );

  // Selected slugs — seed selected by default, companions pre-checked.
  const [selected, setSelected] = useState<Set<string>>(
    () => new Set(bundle.map((p) => p.slug)),
  );

  const regionCompareOf = (p: Product): number => {
    const c = market === "india" ? p.comparePriceInr : p.comparePriceUsd;
    return typeof c === "number" && c > 0 ? c : 0;
  };

  const chosen = bundle.filter((p) => selected.has(p.slug));
  const total = chosen.reduce((s, p) => s + priceOf(p), 0);
  const compareTotal = chosen.reduce(
    (s, p) => s + Math.max(regionCompareOf(p), priceOf(p)),
    0,
  );
  const savings = Math.max(0, compareTotal - total);

  const impressed = useRef(false);
  useEffect(() => {
    if (impressed.current || companions.length === 0) return;
    impressed.current = true;
    recordImpression("frequently_bought_together");
  }, [companions.length]);

  if (companions.length === 0) return null;

  const toggle = (slug: string) => {
    if (slug === seed.slug) return; // seed always in the bundle
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(slug)) next.delete(slug);
      else next.add(slug);
      return next;
    });
  };

  const addBundle = async () => {
    if (chosen.length === 0) return;
    setBusy(true);
    recordClick("frequently_bought_together");
    try {
      for (const p of chosen) {
        if (!p.inStock) continue;
        await add(p.slug, 1, null);
      }
      toast.success(`Added ${chosen.length} item${chosen.length > 1 ? "s" : ""} to cart`);
    } catch {
      toast.error("Couldn't add the bundle. Please try again.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <LazyMount minHeight={200} className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
      <section
        className="py-6 sm:py-9"
        data-rec-source="frequently_bought_together"
        ref={(el) => {
          if (el) recordImpression("frequently_bought_together");
        }}
      >
        <div className="mb-4 sm:mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-1.5">
            Bundle &amp; Save
          </p>
          <h2 className="text-lg sm:text-2xl md:text-3xl font-display font-semibold tracking-tight">
            Frequently bought together
          </h2>
        </div>

        <div className="rounded-2xl glow-border bg-card/40 p-3 sm:p-5 flex flex-col lg:flex-row gap-4 lg:gap-6 lg:items-center">
          {/* Item thumbnails with + connectors */}
          <div className="flex items-center gap-2 sm:gap-3 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {bundle.map((p, i) => {
              const isSeed = p.slug === seed.slug;
              const on = selected.has(p.slug);
              return (
                <div key={p.slug} className="flex items-center gap-2 sm:gap-3 shrink-0">
                  {i > 0 && <Plus className="size-4 text-muted-foreground shrink-0" />}
                  <button
                    type="button"
                    onClick={() => toggle(p.slug)}
                    disabled={isSeed}
                    className="relative group"
                    aria-pressed={on}
                    aria-label={`${on ? "Remove" : "Add"} ${p.name}`}
                  >
                    <span
                      className={`absolute -top-1.5 -left-1.5 z-10 flex size-5 items-center justify-center rounded-full border transition-colors ${
                        on
                          ? "bg-accent border-accent text-accent-foreground"
                          : "bg-background border-border text-transparent"
                      }`}
                    >
                      <Check className="size-3" strokeWidth={3} />
                    </span>
                    <span
                      className={`block size-20 sm:size-24 rounded-xl overflow-hidden border transition-all ${
                        on ? "border-accent/60" : "border-border opacity-60"
                      }`}
                    >
                      <img
                        src={p.image ?? ""}
                        alt={p.name}
                        loading="lazy"
                        className="size-full object-cover"
                      />
                    </span>
                  </button>
                </div>
              );
            })}
          </div>

          {/* Price + CTA */}
          <div className="lg:ml-auto flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end gap-3 lg:min-w-[220px]">
            <div className="lg:text-right">
              <div className="flex items-baseline gap-2">
                <span className="text-xs text-muted-foreground">Total</span>
                <span className="text-xl sm:text-2xl font-display font-semibold">
                  {format(total)}
                </span>
              </div>
              {savings > 0 && (
                <p className="text-[11px] sm:text-xs text-emerald-500 font-medium mt-0.5">
                  You save {format(savings)}
                </p>
              )}
            </div>
            <button
              type="button"
              onClick={addBundle}
              disabled={busy || chosen.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-accent text-accent-foreground px-5 py-2.5 text-sm font-semibold hover:opacity-90 transition disabled:opacity-50 w-full sm:w-auto"
            >
              {busy ? <Loader2 className="size-4 animate-spin" /> : <ShoppingBag className="size-4" />}
              Add bundle to cart
            </button>
          </div>
        </div>

        {/* Line-item breakdown with checkboxes */}
        <ul className="mt-4 space-y-2">
          {bundle.map((p) => {
            const on = selected.has(p.slug);
            const isSeed = p.slug === seed.slug;
            return (
              <li key={p.slug} className="flex items-center gap-3 text-sm">
                <button
                  type="button"
                  onClick={() => toggle(p.slug)}
                  disabled={isSeed}
                  className={`flex size-5 shrink-0 items-center justify-center rounded border transition-colors ${
                    on ? "bg-accent border-accent text-accent-foreground" : "border-border"
                  } ${isSeed ? "opacity-70" : ""}`}
                  aria-pressed={on}
                >
                  {on && <Check className="size-3" strokeWidth={3} />}
                </button>
                <Link
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  className="flex-1 truncate hover:text-accent transition-colors"
                >
                  {isSeed && <span className="text-muted-foreground">This item: </span>}
                  {p.name}
                </Link>
                <span className="shrink-0 font-medium">{format(priceOf(p))}</span>
              </li>
            );
          })}
        </ul>
      </section>
    </LazyMount>
  );
}
