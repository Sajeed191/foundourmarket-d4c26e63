import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame, ArrowRight } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useProducts } from "@/lib/use-products";
import { Price } from "@/components/site/Price";
import { useRegion } from "@/lib/region";
import { AdminProductOverlay } from "@/components/admin/AdminProductOverlay";
import { ProductImage } from "@/components/site/ProductImage";

type FlashSale = {
  id: string;
  name: string;
  discount_percent: number;
  product_slugs: string[];
  ends_at: string | null;
};

function useCountdown(target: string | null, disabled = false) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!target || disabled) return;
    const id = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(id);
  }, [target, disabled]);
  if (!target) return null;
  const diff = Math.max(0, new Date(target).getTime() - now);
  const h = Math.floor(diff / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  return { h, m, s, ended: diff === 0 };
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

export function FlashSaleStrip() {
  const [sale, setSale] = useState<FlashSale | null>(null);
  const { products } = useProducts();
  const { priceOf } = useRegion();
  
  const countdown = useCountdown(sale?.ends_at ?? null, false);

  useEffect(() => {
    let active = true;
    supabase
      .from("flash_sales")
      .select("id,name,discount_percent,product_slugs,ends_at")
      .eq("active", true)
      .lte("starts_at", new Date().toISOString())
      .order("starts_at", { ascending: false })
      .limit(1)
      .maybeSingle()
      .then(({ data }) => {
        if (active && data) setSale(data as FlashSale);
      });
    return () => {
      active = false;
    };
  }, []);

  if (!sale) return null;
  if (countdown?.ended) return null;

  const items = products
    .filter((p) => sale.product_slugs.includes(p.slug))
    .slice(0, 8);
  if (items.length === 0) return null;

  return (
    <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-7xl mx-auto">
      <div className="relative rounded-3xl overflow-hidden border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-4 sm:p-6">
        {(
          <div
            aria-hidden
            className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-40"
            style={{ background: "var(--gradient-ember)" }}
          />
        )}
        <div className="relative flex items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-2 min-w-0">
            <div className={`size-9 grid place-items-center rounded-xl bg-accent text-accent-foreground shadow-[var(--shadow-ember)] shrink-0 animate-flame-pulse`}>
              <Flame className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Flash Sale</p>
              <h3 className="text-sm sm:text-base font-display font-semibold truncate">{sale.name}</h3>
            </div>
          </div>
          {countdown && (
            <div className="flex items-center gap-1 font-mono text-xs sm:text-sm tabular-nums">
              {[pad(countdown.h), pad(countdown.m), pad(countdown.s)].map((v, i) => (
                <span key={i} className="px-1.5 py-1 rounded-md bg-black/60 ring-1 ring-accent/30 text-accent">
                  {v}
                </span>
              ))}
            </div>
          )}
        </div>

        <div className="relative flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          {items.map((p) => {
            const left = p.stockQuantity - (p.lowStockThreshold ?? 0);
            const showOnlyLeft = p.stockQuantity > 0 && p.stockQuantity <= 15;
            const regionPrice = priceOf(p);
            const salePrice = regionPrice * (1 - sale.discount_percent / 100);
            return (
              <AdminProductOverlay
                key={p.id ?? p.slug}
                product={p}
                className="snap-start shrink-0 w-[42%] xs:w-[38%] sm:w-[26%] lg:w-[20%]"
              >
                <Link
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  className="block group"
                >
                  <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                    <ProductImage
                      src={p.image}
                      alt={p.name}
                      sizes="(min-width: 1024px) 20vw, (min-width: 640px) 26vw, 42vw"
                      className="w-full h-full object-cover"
                    />
                    {/* Discount percentage badge removed sitewide per design decision. */}
                  </div>
                  <p className="mt-2 text-[11px] font-medium truncate">{p.name}</p>
                  <div className="flex items-baseline gap-1.5">
                    <Price value={salePrice} className="text-xs font-display font-semibold text-accent tabular-nums" />
                    <Price value={regionPrice} variant="compare" className="text-[10px]" />
                  </div>
                  {showOnlyLeft && (
                    <p className="text-[9px] font-mono uppercase tracking-wider text-accent/90 mt-0.5">
                      Only {p.stockQuantity} left
                    </p>
                  )}
                </Link>
              </AdminProductOverlay>
            );
          })}
        </div>

        <Link
          to="/search"
          className="relative mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-accent"
        >
          Shop all deals <ArrowRight className="size-3" />
        </Link>
      </div>
    </section>
  );
}
