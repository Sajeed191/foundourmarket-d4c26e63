/**
 * BrowseCard — Track A · Phase 2.1
 *
 * Thin wrapper over the frozen ProductCard. Adds ONLY:
 *   - up to 2 approved browse badges as small inline chips
 *   - a single "Why?" progressive-disclosure affordance
 *
 * Does NOT modify ProductCard, layout, virtualization, images, or SEO.
 * The wrapper participates in normal grid flow; the extras are absolutely
 * positioned inside the card frame so grid metrics and CLS are unchanged.
 */
import { memo } from "react";
import { Info } from "lucide-react";
import { ProductCard } from "@/components/site/ProductCard";
import type { Product } from "@/lib/products";
import type { BrowsePresentation } from "@/lib/browse";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

type BrowseCardProps = {
  product: Product;
  presentation?: BrowsePresentation;
  priority?: boolean;
  highlight?: string;
};

function BrowseCardImpl({ product, presentation, priority, highlight }: BrowseCardProps) {
  const badges = presentation?.badges ?? [];
  const reason = presentation?.reason;

  return (
    <div className="relative">
      <ProductCard product={product} priority={priority} highlight={highlight} />


      {(badges.length > 0 || reason) && (
        <div className="pointer-events-none absolute inset-x-0 bottom-0 z-[2] flex items-end justify-between gap-2 p-2 sm:p-2.5">
          {badges.length > 0 ? (
            <div className="pointer-events-auto flex flex-wrap gap-1.5">
              {badges.map((b) => (
                <span
                  key={b}
                  className="rounded-full border border-accent/30 bg-background/70 px-2 py-0.5 text-[10px] font-medium uppercase tracking-wider text-foreground/80 backdrop-blur"
                >
                  {b}
                </span>
              ))}
            </div>
          ) : (
            <span aria-hidden />
          )}

          {reason && (
            <Popover>
              <PopoverTrigger asChild>
                <button
                  type="button"
                  aria-label="Why you're seeing this"
                  className="pointer-events-auto grid size-7 place-items-center rounded-full border border-border/60 bg-background/70 text-muted-foreground backdrop-blur transition-colors hover:text-accent"
                  onClick={(e) => e.stopPropagation()}
                >
                  <Info className="size-3.5" />
                </button>
              </PopoverTrigger>
              <PopoverContent
                side="top"
                align="end"
                className="w-64 text-xs leading-relaxed"
                onClick={(e) => e.stopPropagation()}
              >
                <p className="font-mono text-[10px] uppercase tracking-widest text-accent mb-1.5">
                  Why you're seeing this
                </p>
                <p className="text-foreground/90">{reason}</p>
              </PopoverContent>
            </Popover>
          )}
        </div>
      )}
    </div>
  );
}

export const BrowseCard = memo(BrowseCardImpl);
