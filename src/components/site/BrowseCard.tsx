/**
 * BrowseCard — Track A · Phase 2.1 (Badge System v2)
 *
 * Thin wrapper over ProductCard. Passes the browse presentation badges into
 * ProductCard so the single-badge priority ladder can pick the winner across
 * admin-assigned, engine-computed, and browse sources. Adds ONLY the
 * "Why?" progressive-disclosure affordance on top — never a second badge.
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
  const reason = presentation?.reason;
  const browseBadges = presentation?.badges;

  return (
    <div className="relative">
      <ProductCard
        product={product}
        priority={priority}
        highlight={highlight}
        browseBadges={browseBadges}
      />

      {reason && (
        <div className="pointer-events-none absolute right-2 bottom-2 z-[2]">
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
        </div>
      )}
    </div>
  );
}

export const BrowseCard = memo(BrowseCardImpl);
