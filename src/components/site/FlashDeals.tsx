import { useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Flame } from "lucide-react";
import { motion } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Price } from "@/components/site/Price";

type DealProduct = {
  slug: string;
  name: string;
  image: string | null;
  price: number;
  in_stock: boolean;
  stock_quantity: number;
  status: string;
};

type FlashDeal = {
  id: string;
  flash_price: number;
  start_at: string;
  end_at: string;
  priority: number;
  created_at: string;
  product: DealProduct | null;
};

function useNow(intervalMs = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), intervalMs);
    return () => clearInterval(id);
  }, [intervalMs]);
  return now;
}

function pad(n: number) {
  return n.toString().padStart(2, "0");
}

function Countdown({ end, now }: { end: string; now: number }) {
  const diff = Math.max(0, new Date(end).getTime() - now);
  const d = Math.floor(diff / 86_400_000);
  const h = Math.floor((diff % 86_400_000) / 3_600_000);
  const m = Math.floor((diff % 3_600_000) / 60_000);
  const s = Math.floor((diff % 60_000) / 1000);
  const cells: [string, string][] = [
    [pad(d), "D"],
    [pad(h), "H"],
    [pad(m), "M"],
    [pad(s), "S"],
  ];
  return (
    <div className="flex items-center gap-1 font-mono text-[10px] tabular-nums">
      {cells.map(([v, label], i) => (
        <span key={i} className="flex flex-col items-center">
          <span className="px-1.5 py-0.5 rounded-md bg-black/60 ring-1 ring-accent/30 text-accent">{v}</span>
          <span className="text-[8px] text-muted-foreground mt-0.5">{label}</span>
        </span>
      ))}
    </div>
  );
}

export function FlashDeals() {
  const [deals, setDeals] = useState<FlashDeal[] | null>(null);
  const now = useNow();

  function fetchDeals() {
    supabase
      .from("flash_deals")
      .select(
        "id,flash_price,start_at,end_at,priority,created_at,product:products(slug,name,image,price,in_stock,stock_quantity,status)",
      )
      .then(({ data }) => {
        setDeals(((data as unknown as FlashDeal[]) ?? []).filter((d) => d.product && d.product.status === "published"));
      });
  }

  useEffect(() => {
    fetchDeals();
    const ch = supabase
      .channel("rt-flash-deals")
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_deals" }, fetchDeals)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  // Client-side guard: only show deals whose window is live right now, sorted
  // by priority, then highest discount, then newest. Timer-expired deals drop
  // out automatically as `now` ticks forward.
  const live = useMemo(() => {
    if (!deals) return [];
    return deals
      .filter((d) => {
        const startOk = new Date(d.start_at).getTime() <= now;
        const endOk = new Date(d.end_at).getTime() > now;
        return startOk && endOk;
      })
      .sort((a, b) => {
        if (b.priority !== a.priority) return b.priority - a.priority;
        const da = a.product ? (a.product.price - a.flash_price) / a.product.price : 0;
        const db = b.product ? (b.product.price - b.flash_price) / b.product.price : 0;
        if (db !== da) return db - da;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [deals, now]);

  // Don't render anything until the first fetch resolves (avoids flash of empty).
  if (deals === null) return null;

  return (
    <section className="px-4 sm:px-6 py-8 sm:py-10 max-w-7xl mx-auto">
      <div className="relative rounded-3xl overflow-hidden border border-accent/30 bg-gradient-to-br from-accent/10 via-card to-card p-4 sm:p-6">
        <div
          aria-hidden
          className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-40"
          style={{ background: "var(--gradient-ember)" }}
        />
        <div className="relative flex items-center gap-2 mb-4">
          <motion.div
            animate={{ scale: [1, 1.12, 1] }}
            transition={{ duration: 1.4, repeat: Infinity }}
            className="size-9 grid place-items-center rounded-xl bg-accent text-accent-foreground shadow-[var(--shadow-ember)] shrink-0"
          >
            <Flame className="size-4" />
          </motion.div>
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Flash Deals</p>
            <h3 className="text-sm sm:text-base font-display font-semibold truncate">Limited-time prices</h3>
          </div>
        </div>

        {live.length === 0 ? (
          <p className="relative py-8 text-center text-sm font-mono uppercase tracking-widest text-muted-foreground">
            No Flash Deals Available Right Now
          </p>
        ) : (
          <div className="relative flex gap-2.5 overflow-x-auto snap-x snap-mandatory pb-2 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {live.map((d) => {
              const p = d.product!;
              const off = p.price > 0 ? Math.round(((p.price - d.flash_price) / p.price) * 100) : 0;
              const showOnlyLeft = p.stock_quantity > 0 && p.stock_quantity <= 15;
              return (
                <Link
                  key={d.id}
                  to="/products/$slug"
                  params={{ slug: p.slug }}
                  className="snap-start shrink-0 w-[42%] xs:w-[38%] sm:w-[26%] lg:w-[20%] block group"
                >
                  <div className="relative aspect-[4/5] rounded-2xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                    {p.image && (
                      <img
                        src={p.image}
                        alt={p.name}
                        loading="lazy"
                        className="w-full h-full object-cover group-active:scale-105 transition-transform"
                      />
                    )}
                    {off > 0 && (
                      <span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full bg-accent text-black text-[9px] font-bold font-mono px-2 py-0.5 shadow-[var(--shadow-ember)]">
                        -{off}%
                      </span>
                    )}
                    <div className="absolute bottom-1.5 left-1.5 right-1.5">
                      <Countdown end={d.end_at} now={now} />
                    </div>
                  </div>
                  <p className="mt-2 text-[11px] font-medium truncate">{p.name}</p>
                  <div className="flex items-baseline gap-1.5">
                    <Price value={d.flash_price} className="text-xs font-display font-semibold text-accent tabular-nums" />
                    <Price value={p.price} className="text-[10px] font-mono line-through text-muted-foreground tabular-nums" />
                  </div>
                  {showOnlyLeft && (
                    <p className="text-[9px] font-mono uppercase tracking-wider text-accent/90 mt-0.5">
                      Only {p.stock_quantity} left
                    </p>
                  )}
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}
