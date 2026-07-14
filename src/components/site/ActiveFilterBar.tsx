import { X, DollarSign, LayoutGrid, Star, Store, Palette, CheckCircle2, Tag, Globe, Ruler, Truck } from "lucide-react";
import type { ComponentType, SVGProps } from "react";
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

/**
 * Chip accent tone. Each maps to a muted, premium color band in the styles below.
 * Keep this set closed so the visual language stays consistent.
 */
type Tone = "orange" | "gold" | "amber" | "slate" | "green" | "red" | "sky";

type Chip = {
  key: string;
  label: string;
  tone: Tone;
  Icon: ComponentType<SVGProps<SVGSVGElement>>;
  swatch?: string; // for color chips: css color value for the dot
  onClear: () => void;
};

function csv(v?: string): string[] {
  return (v ?? "").split(",").map((x) => x.trim()).filter(Boolean);
}

// Tailwind-friendly tone styles. Muted, premium — never neon.
const TONE_STYLES: Record<Tone, { text: string; ring: string; bg: string; iconBg: string }> = {
  orange: {
    text: "text-accent",
    ring: "ring-accent/25",
    bg: "bg-gradient-to-b from-accent/10 to-accent/[0.03]",
    iconBg: "bg-accent/15 text-accent",
  },
  gold: {
    text: "text-amber-300",
    ring: "ring-amber-400/25",
    bg: "bg-gradient-to-b from-amber-400/10 to-amber-400/[0.03]",
    iconBg: "bg-amber-400/15 text-amber-300",
  },
  amber: {
    text: "text-amber-200",
    ring: "ring-amber-300/20",
    bg: "bg-gradient-to-b from-amber-300/8 to-amber-300/[0.02]",
    iconBg: "bg-amber-300/10 text-amber-200",
  },
  slate: {
    text: "text-slate-200",
    ring: "ring-slate-400/20",
    bg: "bg-gradient-to-b from-slate-400/10 to-slate-400/[0.03]",
    iconBg: "bg-slate-400/15 text-slate-200",
  },
  green: {
    text: "text-emerald-300",
    ring: "ring-emerald-400/25",
    bg: "bg-gradient-to-b from-emerald-400/10 to-emerald-400/[0.03]",
    iconBg: "bg-emerald-400/15 text-emerald-300",
  },
  red: {
    text: "text-rose-300",
    ring: "ring-rose-400/25",
    bg: "bg-gradient-to-b from-rose-400/10 to-rose-400/[0.03]",
    iconBg: "bg-rose-400/15 text-rose-300",
  },
  sky: {
    text: "text-sky-300",
    ring: "ring-sky-400/25",
    bg: "bg-gradient-to-b from-sky-400/10 to-sky-400/[0.03]",
    iconBg: "bg-sky-400/15 text-sky-300",
  },
};

/**
 * Premium Active Filter summary. Renders a single glass container with a soft
 * ambient edge glow, a compact header ("Active Filters • N Filters Applied"),
 * a horizontally-scrolling row of capsule chips carrying intelligent icons and
 * tonal accents by dimension, and a ghost/pill Clear-All action.
 *
 * Pure presentation — filter state, URL sync, and query updates all remain in
 * the parent (search route). Removing a chip calls the same `onChange` patches
 * used elsewhere so behavior is identical to the previous chip bar.
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
    chips.push({
      key: "sub",
      label: c?.name ?? filters.sub,
      tone: "amber",
      Icon: LayoutGrid,
      onClear: () => onChange({ sub: undefined }),
    });
  } else if (filters.cat) {
    const c = allCategories.find((x) => x.slug === filters.cat);
    chips.push({
      key: "cat",
      label: c?.name ?? filters.cat,
      tone: "amber",
      Icon: LayoutGrid,
      onClear: () => onChange({ cat: undefined }),
    });
  }

  for (const b of csv(filters.brand)) {
    chips.push({
      key: `brand-${b}`,
      label: b,
      tone: "slate",
      Icon: Store,
      onClear: () => onChange({ brand: csv(filters.brand).filter((x) => x !== b).join(",") || undefined }),
    });
  }
  for (const c of csv(filters.color)) {
    chips.push({
      key: `color-${c}`,
      label: c,
      tone: "slate",
      Icon: Palette,
      swatch: c.toLowerCase(),
      onClear: () => onChange({ color: csv(filters.color).filter((x) => x !== c).join(",") || undefined }),
    });
  }
  for (const s of csv(filters.size)) {
    chips.push({
      key: `size-${s}`,
      label: `Size ${s}`,
      tone: "slate",
      Icon: Ruler,
      onClear: () => onChange({ size: csv(filters.size).filter((x) => x !== s).join(",") || undefined }),
    });
  }

  if (filters.min != null || filters.max != null) {
    const lo = filters.min ?? 0;
    const hi = filters.max ?? priceMax;
    chips.push({
      key: "price",
      label: `${fmt(lo)} – ${fmt(hi)}${hi >= priceMax ? "+" : ""}`,
      tone: "orange",
      Icon: DollarSign,
      onClear: () => onChange({ min: undefined, max: undefined }),
    });
  }
  if (filters.rating != null) {
    chips.push({
      key: "rating",
      label: `${filters.rating}★ & Up`,
      tone: "gold",
      Icon: Star,
      onClear: () => onChange({ rating: undefined }),
    });
  }
  if (filters.stock) {
    chips.push({
      key: "stock",
      label: STOCK_LABELS[filters.stock] ?? filters.stock,
      tone: "green",
      Icon: CheckCircle2,
      onClear: () => onChange({ stock: undefined }),
    });
  }
  for (const k of ["free", "cod", "sale", "flash", "hot", "newx", "feat"] as const) {
    if (filters[k] === "1") {
      const isShipping = k === "free" || k === "cod";
      chips.push({
        key: k,
        label: OFFER_LABELS[k],
        tone: isShipping ? "green" : "red",
        Icon: isShipping ? Truck : Tag,
        onClear: () => onChange({ [k]: undefined } as Partial<Filters>),
      });
    }
  }
  if (filters.dmin != null) {
    chips.push({
      key: "dmin",
      label: `${filters.dmin}%+ off`,
      tone: "red",
      Icon: Tag,
      onClear: () => onChange({ dmin: undefined }),
    });
  }

  if (chips.length === 0) return null;

  const count = chips.length;

  return (
    <div
      className={`${className ?? ""}`}
      role="region"
      aria-label="Active filters"
    >
      <div className="relative">
        <div
          aria-hidden
          className="pointer-events-none absolute -inset-px rounded-2xl bg-gradient-to-r from-accent/15 via-transparent to-accent/10 opacity-50 blur-[4px]"
        />
        <div
          className="relative rounded-2xl border border-white/[0.06] bg-[linear-gradient(180deg,rgba(20,20,24,0.75),rgba(10,10,12,0.85))] px-3 py-2 shadow-[0_6px_24px_-14px_rgba(0,0,0,0.6),inset_0_1px_0_rgba(255,255,255,0.03)]"
        >
          <div className="flex items-center gap-2">
            <span className="shrink-0 text-[10px] font-bold uppercase tracking-[0.14em] text-foreground/80">
              Active
            </span>
            <div
              className="flex flex-1 min-w-0 items-center gap-1.5 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden py-0.5"
            >
              {chips.map((chip) => {
                const t = TONE_STYLES[chip.tone];
                const { Icon } = chip;
                return (
                  <div
                    key={chip.key}
                    className={`group snap-start shrink-0 inline-flex h-8 items-center gap-1.5 rounded-full pl-1.5 pr-0.5 ring-1 ${t.ring} ${t.bg} transition-all duration-200 will-change-transform animate-[fmChipIn_220ms_cubic-bezier(0.2,0.8,0.2,1)_both]`}
                  >
                    <span className={`grid size-5 place-items-center rounded-full ${t.iconBg}`}>
                      {chip.swatch ? (
                        <span
                          aria-hidden
                          className="size-2.5 rounded-full ring-1 ring-white/20"
                          style={{ background: chip.swatch }}
                        />
                      ) : (
                        <Icon className="size-3" strokeWidth={2.25} />
                      )}
                    </span>
                    <span className={`text-[11.5px] font-semibold ${t.text} max-w-[8rem] truncate`}>
                      {chip.label}
                    </span>
                    <button
                      onClick={chip.onClear}
                      aria-label={`Remove filter ${chip.label}`}
                      className="grid size-6 place-items-center rounded-full text-foreground/60 transition-all duration-150 hover:bg-white/10 hover:text-foreground active:scale-90"
                    >
                      <X className="size-3" strokeWidth={2.5} />
                    </button>
                  </div>
                );
              })}
            </div>
            <button
              onClick={onClear}
              className="shrink-0 inline-flex h-8 items-center rounded-full border border-accent/40 bg-transparent px-2.5 text-[10.5px] font-semibold uppercase tracking-wider text-accent transition-all duration-200 hover:bg-accent/10 hover:border-accent/60 active:scale-[0.96]"
              aria-label="Clear all filters"
            >
              Clear
            </button>
          </div>
        </div>



      <style>{`
        @keyframes fmChipIn {
          0% { opacity: 0; transform: translate3d(0, 8px, 0) scale(0.96); }
          100% { opacity: 1; transform: translate3d(0, 0, 0) scale(1); }
        }
        @media (prefers-reduced-motion: reduce) {
          [class*="fmChipIn"] { animation: none !important; }
        }
      `}</style>
    </div>
  );
}
