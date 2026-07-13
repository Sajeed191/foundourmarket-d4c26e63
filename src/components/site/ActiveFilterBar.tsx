import { X } from "lucide-react";
import type { Category } from "@/lib/use-categories";
import type { Filters } from "@/lib/search-filters";

const OFFER_LABELS: Record<string, string> = {
  free: "Free Shipping",
  cod: "Cash on Delivery",
  sale: "On Sale",
  newx: "New Arrival",
  feat: "Featured",
  flash: "Flash Deal",
  hot: "Hot Deal",
};

const STOCK_LABELS: Record<string, string> = {
  in: "In Stock",
  out: "Out of Stock",
  pre: "Pre-order",
};

type Chip = { key: string; label: string; onClear: () => void };

function csv(v?: string): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

/**
 * Sticky applied-filter bar. Always-visible row of removable chips so shoppers
 * never lose sight of what's active, plus a Clear All action. Each chip removes
 * only its own dimension.
 */
export function ActiveFilterBar({
  filters,
  allCategories,
  fmt,
  priceMax,
  onChange,
  onClear,
  className,
}: {
  filters: Filters;
  allCategories: Category[];
  fmt: (usd: number) => string;
  priceMax: number;
  onChange: (patch: Partial<Filters>) => void;
  onClear: () => void;
  className?: string;
}) {
  const chips: Chip[] = [];

  if (filters.sub) {
    const c = allCategories.find((x) => x.slug === filters.sub);
    chips.push({ key: "sub", label: c?.name ?? filters.sub, onClear: () => onChange({ sub: undefined }) });
  } else if (filters.cat) {
    const c = allCategories.find((x) => x.slug === filters.cat);
    chips.push({ key: "cat", label: c?.name ?? filters.cat, onClear: () => onChange({ cat: undefined }) });
  }

  for (const b of csv(filters.brand)) {
    chips.push({
      key: `brand-${b}`,
      label: b,
      onClear: () => onChange({ brand: csv(filters.brand).filter((x) => x !== b).join(",") || undefined }),
    });
  }
  for (const c of csv(filters.color)) {
    chips.push({
      key: `color-${c}`,
      label: c,
      onClear: () => onChange({ color: csv(filters.color).filter((x) => x !== c).join(",") || undefined }),
    });
  }
  for (const s of csv(filters.size)) {
    chips.push({
      key: `size-${s}`,
      label: `Size ${s}`,
      onClear: () => onChange({ size: csv(filters.size).filter((x) => x !== s).join(",") || undefined }),
    });
  }

  if (filters.min != null || filters.max != null) {
    const lo = filters.min ?? 0;
    const hi = filters.max ?? priceMax;
    chips.push({
      key: "price",
      label: `${fmt(lo)} – ${fmt(hi)}${hi >= priceMax ? "+" : ""}`,
      onClear: () => onChange({ min: undefined, max: undefined }),
    });
  }
  if (filters.rating != null) {
    chips.push({ key: "rating", label: `${filters.rating}★ & Up`, onClear: () => onChange({ rating: undefined }) });
  }
  if (filters.stock) {
    chips.push({ key: "stock", label: STOCK_LABELS[filters.stock] ?? filters.stock, onClear: () => onChange({ stock: undefined }) });
  }
  for (const k of ["free", "cod", "sale", "flash", "hot", "newx", "feat"] as const) {
    if (filters[k] === "1") {
      chips.push({ key: k, label: OFFER_LABELS[k], onClear: () => onChange({ [k]: undefined } as Partial<Filters>) });
    }
  }
  if (filters.dmin != null) {
    chips.push({ key: "dmin", label: `${filters.dmin}%+ off`, onClear: () => onChange({ dmin: undefined }) });
  }

  if (chips.length === 0) return null;

  return (
    <div
      className={`sticky top-0 z-30 -mx-4 border-b border-white/10 bg-background/85 px-4 py-2.5 backdrop-blur-xl sm:mx-0 sm:rounded-2xl sm:border sm:px-3 ${className ?? ""}`}
      role="region"
      aria-label="Active filters"
    >
      <div className="flex items-center gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {chips.map((chip) => (
          <button
            key={chip.key}
            onClick={chip.onClear}
            aria-label={`Remove filter ${chip.label}`}
            className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent/15 pl-3 pr-2 py-1.5 text-xs font-medium text-accent ring-1 ring-accent/30 transition-all active:scale-95"
          >
            {chip.label}
            <X className="size-3.5" />
          </button>
        ))}
        <button
          onClick={onClear}
          className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-accent"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}
