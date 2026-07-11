import { useEffect, useState } from "react";
import { fetchProductVariants, type ProductVariant } from "@/lib/products";
import { Loader2 } from "lucide-react";

/**
 * Inline switcher shown when a cart line's selected variant became unavailable.
 * Lazy-loads the product's current variants and lets the shopper pick an
 * in-stock alternative without removing the product from the cart.
 */
export function VariantSwitcher({
  slug,
  currentVariantId,
  onSwitch,
}: {
  slug: string;
  currentVariantId: string | null;
  onSwitch: (toVariantId: string) => void;
}) {
  const [variants, setVariants] = useState<ProductVariant[] | null>(null);

  useEffect(() => {
    let active = true;
    fetchProductVariants(slug).then((v) => {
      if (active) setVariants(v);
    });
    return () => {
      active = false;
    };
  }, [slug]);

  if (variants === null) {
    return (
      <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
        <Loader2 className="size-3 animate-spin" /> Loading options…
      </span>
    );
  }

  const available = variants.filter((v) => v.id !== currentVariantId && v.stockQuantity > 0);
  if (available.length === 0) {
    return <span className="text-[11px] text-muted-foreground">No other options available.</span>;
  }

  const label = (v: ProductVariant) => [v.color, v.size].filter(Boolean).join(" · ") || v.name;

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="text-[10px] uppercase tracking-widest text-muted-foreground">Switch to</span>
      {available.map((v) => (
        <button
          key={v.id}
          type="button"
          onClick={() => onSwitch(v.id)}
          className="min-h-8 rounded-full border border-accent/50 px-3 py-1 text-[11px] font-medium text-accent transition-colors hover:bg-accent/10 active:scale-95"
        >
          {label(v)}
        </button>
      ))}
    </div>
  );
}
