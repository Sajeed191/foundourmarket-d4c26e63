// v1.4 Explainable AI — provenance badge + "Compare at a glance" block.
import { useMemo } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, Eye, Search, ShoppingBag, Heart, Home, Globe, Package } from "lucide-react";
import type { AiCompare, AiSource, AiProductRef } from "@/lib/ai-shopping/types";

const SOURCE_META: Record<AiSource, { label: string; Icon: typeof Eye }> = {
  pdp:         { label: "From this product",       Icon: Eye },
  category:    { label: "From this category",      Icon: Package },
  search:      { label: "From your search",        Icon: Search },
  cart:        { label: "Based on your cart",      Icon: ShoppingBag },
  wishlist:    { label: "From your wishlist",      Icon: Heart },
  home:        { label: "From today's collections", Icon: Home },
  marketplace: { label: "From the marketplace",    Icon: Globe },
};

export function AiSourceBadge({ source }: { source: AiSource }) {
  const meta = SOURCE_META[source] ?? SOURCE_META.marketplace;
  const { Icon } = meta;
  return (
    <div
      className="mt-2 inline-flex items-center gap-1.5 rounded-full border border-border/50 bg-card/50 px-2.5 py-1 text-[10px] font-medium uppercase tracking-wider text-muted-foreground backdrop-blur-xl"
      role="note"
      aria-label={`Recommendation source: ${meta.label}`}
    >
      <Icon className="h-3 w-3 text-primary/80" aria-hidden />
      <span>{meta.label}</span>
    </div>
  );
}

export function AiCompareBlock({
  compare,
  products,
}: {
  compare: AiCompare;
  products: AiProductRef[];
}) {
  const bySlug = useMemo(() => {
    const m = new Map<string, AiProductRef>();
    for (const p of products) m.set(p.slug, p);
    return m;
  }, [products]);

  const rows = compare.rows.filter((r) => bySlug.has(r.slug));
  if (rows.length < 2) return null;

  return (
    <section
      className="mt-3 overflow-hidden rounded-2xl border border-border/60 bg-card/60 backdrop-blur-xl"
      aria-label="Compare at a glance"
    >
      <header className="flex items-center gap-1.5 border-b border-border/50 px-3 py-2">
        <Sparkles className="h-3 w-3 text-primary" aria-hidden />
        <p className="text-[11px] font-semibold uppercase tracking-wider text-foreground/80">
          {compare.title ?? "Compare at a glance"}
        </p>
      </header>
      <ul className="divide-y divide-border/40">
        {rows.map((r) => {
          const p = bySlug.get(r.slug)!;
          return (
            <li key={r.slug} className="px-3 py-2.5">
              <Link
                to="/products/$slug"
                params={{ slug: r.slug }}
                className="group flex items-start gap-2.5"
              >
                <div className="min-w-0 flex-1">
                  <p className="line-clamp-1 text-[12px] font-semibold text-foreground group-hover:text-primary">
                    {p.name}
                  </p>
                  <p className="mt-0.5 line-clamp-2 text-[11px] leading-snug text-muted-foreground">
                    {r.verdict}
                  </p>
                </div>
                {r.highlight && (
                  <span className="shrink-0 rounded-full bg-primary/12 px-2 py-0.5 text-[10px] font-medium text-primary">
                    {r.highlight}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
