import { Link, useRouterState } from "@tanstack/react-router";
import { X, ArrowRight, Scale } from "lucide-react";
import { useCompare } from "@/hooks/use-compare";
import { useProducts } from "@/lib/use-products";
import { resolveImage } from "@/lib/products";

export function CompareTray() {
  const { slugs, remove, clear } = useCompare();
  const { products } = useProducts();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  if (slugs.length === 0 || pathname === "/compare") return null;

  const items = slugs
    .map((s) => products.find((p) => p.slug === s))
    .filter((p): p is NonNullable<typeof p> => Boolean(p));

  return (
    <div data-floating-control className="fixed left-1/2 z-[var(--z-floating-controls)] w-[min(94vw,720px)] -translate-x-1/2 bottom-[var(--floating-bottom-offset)] md:bottom-4">
      <div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-3">
        <div className="hidden sm:flex items-center gap-2 px-2 text-muted-foreground shrink-0">
          <Scale className="size-4" />
          <span className="text-[10px] font-mono uppercase tracking-widest">Compare</span>
        </div>
        <ul className="flex gap-2 flex-1 min-w-0 overflow-x-auto scrollbar-hide">
          {items.map((p) => (
            <li key={p.id ?? p.slug} className="relative shrink-0 group">
              <div className="size-12 rounded-lg overflow-hidden bg-background border border-border">
                {p.image && <img loading="lazy" decoding="async" src={resolveImage(p.image)} alt={p.name} className="w-full h-full object-cover" />}
              </div>
              <button
                onClick={() => remove(p.slug)}
                aria-label={`Remove ${p.name}`}
                className="absolute -top-1.5 -right-1.5 size-4 grid place-items-center rounded-full bg-background border border-border text-muted-foreground hover:text-accent hover:border-accent transition-colors"
              >
                <X className="size-2.5" />
              </button>
            </li>
          ))}
          {Array.from({ length: Math.max(0, 2 - items.length) }).map((_, i) => (
            <li key={`ph-${i}`} className="size-12 rounded-lg border border-dashed border-border/60 shrink-0" />
          ))}
        </ul>
        <button
          onClick={clear}
          className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-2 shrink-0"
        >
          Clear
        </button>
        <Link
          to="/compare"
          className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all shrink-0"
        >
          Compare<ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
