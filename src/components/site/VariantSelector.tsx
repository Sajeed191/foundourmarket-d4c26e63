import { memo, useMemo } from "react";
import type { ProductVariant } from "@/lib/products";

/**
 * Fully data-driven, adaptive variant selector.
 *
 * There are NO hardcoded sizes, colors, counts, or limits anywhere. Everything
 * rendered is derived from the actual variants the admin created:
 *   - If variants carry structured `color` and/or `size`, those become axes
 *     (color = swatches, size = pills). A product can have one axis, both, or
 *     neither.
 *   - If variants carry neither (e.g. Storage / Material / Capacity / custom),
 *     the free-form `name` becomes a single "Option" axis of pills.
 *
 * Layout adapts to the number of options:
 *   - Few options   → larger, comfortably spaced controls.
 *   - Many options  → controls stay touch-sized but the row becomes a smooth
 *                     horizontal scroller so it never overflows or wraps into a
 *                     cramped grid; text never shrinks below legibility.
 *   - Medium counts → natural multi-row wrap.
 *
 * Selection resolves to a single variant id via `onSelect`, so the rest of the
 * product page (price, compare, SKU, stock, image, CTA state) reacts instantly.
 */

export type VariantSelectorProps = {
  variants: ProductVariant[];
  selectedId: string | null;
  onSelect: (id: string) => void;
};

type ColorOption = { value: string; hex: string | null; oos: boolean };
type TextOption = { value: string; oos: boolean };

// A value is only considered out of stock when EVERY variant carrying it is out
// of stock — so one OOS combination never disables an otherwise-available value.
function allOOS(vs: ProductVariant[]): boolean {
  return vs.length > 0 && vs.every((v) => v.stockQuantity <= 0);
}

function uniqueColors(variants: ProductVariant[]): ColorOption[] {
  const seen = new Map<string, ProductVariant[]>();
  for (const v of variants) {
    if (!v.color) continue;
    const arr = seen.get(v.color) ?? [];
    arr.push(v);
    seen.set(v.color, arr);
  }
  return [...seen.entries()].map(([value, vs]) => ({
    value,
    hex: vs.find((v) => v.colorHex)?.colorHex ?? null,
    oos: allOOS(vs),
  }));
}

function uniqueSizes(variants: ProductVariant[]): TextOption[] {
  const seen = new Map<string, ProductVariant[]>();
  for (const v of variants) {
    if (!v.size) continue;
    const arr = seen.get(v.size) ?? [];
    arr.push(v);
    seen.set(v.size, arr);
  }
  return [...seen.entries()].map(([value, vs]) => ({ value, oos: allOOS(vs) }));
}

/** Row that wraps for small counts and horizontally scrolls for large ones. */
function AdaptiveRow({
  count,
  children,
  label,
}: {
  count: number;
  children: React.ReactNode;
  label: string;
}) {
  const scroll = count > 8;
  return (
    <div
      role="group"
      aria-label={label}
      className={
        scroll
          ? "flex gap-2 overflow-x-auto pb-1.5 -mx-1 px-1 snap-x [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          : "flex flex-wrap gap-2"
      }
    >
      {children}
    </div>
  );
}

function Label({ text, value }: { text: string; value?: string | null }) {
  return (
    <p className="mb-2 flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
      <span>{text}</span>
      {value ? <span className="text-foreground/80 normal-case tracking-normal">{value}</span> : null}
    </p>
  );
}

function VariantSelectorImpl({ variants, selectedId, onSelect }: VariantSelectorProps) {
  const colors = useMemo(() => uniqueColors(variants), [variants]);
  const sizes = useMemo(() => uniqueSizes(variants), [variants]);

  const selected = variants.find((v) => v.id === selectedId) ?? null;
  const hasColor = colors.length > 0;
  const hasSize = sizes.length > 0;
  const structured = hasColor || hasSize;

  if (variants.length === 0) return null;

  // Pick the best variant for a desired (color, size) pair, preferring an exact
  // in-stock match, then any exact match, then the closest partial match, then
  // the first variant carrying the changed value.
  const resolve = (color: string | null, size: string | null): ProductVariant | null => {
    const matches = (v: ProductVariant) =>
      (color == null || v.color === color) && (size == null || v.size === size);
    const pool = variants.filter(matches);
    if (pool.length === 0) return null;
    return pool.find((v) => v.stockQuantity > 0) ?? pool[0];
  };

  const pickColor = (color: string) => {
    const v = resolve(color, hasSize ? selected?.size ?? null : null);
    if (v) onSelect(v.id);
  };
  const pickSize = (size: string) => {
    const v = resolve(hasColor ? selected?.color ?? null : null, size);
    if (v) onSelect(v.id);
  };

  // Free-form "name" axis for non-structured variants (Storage, Material, …).
  if (!structured) {
    const scroll = variants.length > 8;
    return (
      <div className="mb-4">
        <Label text="Option" value={selected?.name} />
        <AdaptiveRow count={variants.length} label="Options">
          {variants.map((v) => {
            const sel = v.id === selectedId;
            const oos = v.stockQuantity <= 0;
            return (
              <button
                key={v.id}
                type="button"
                onClick={() => !oos && onSelect(v.id)}
                disabled={oos}
                aria-pressed={sel}
                className={`min-h-11 rounded-full border px-4 py-2.5 text-xs font-medium leading-none transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ${
                  scroll ? "shrink-0 snap-start" : ""
                } ${sel ? "border-accent bg-accent/10 text-accent shadow-[var(--shadow-ember)] scale-[1.03]" : "border-border hover:border-accent/50"}`}
              >
                {v.name}
              </button>
            );
          })}
        </AdaptiveRow>
      </div>
    );
  }

  return (
    <div className="mb-4 space-y-4">
      {hasColor && (
        <div>
          <Label text="Color" value={selected?.color} />
          <AdaptiveRow count={colors.length} label="Colors">
            {colors.map((c) => {
              const sel = selected?.color === c.value;
              const big = colors.length <= 6;
              const dim = big ? "size-9" : "size-8";
              return (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => !c.oos && pickColor(c.value)}
                  disabled={c.oos}
                  aria-pressed={sel}
                  aria-label={c.value + (c.oos ? " (out of stock)" : "")}
                  title={c.value}
                  className={`relative grid shrink-0 snap-start place-items-center rounded-full transition-all active:scale-90 disabled:cursor-not-allowed ${
                    sel ? "ring-2 ring-accent ring-offset-2 ring-offset-background" : "ring-1 ring-white/15 hover:ring-accent/50"
                  }`}
                >
                  <span
                    className={`${dim} rounded-full ${c.oos ? "opacity-30" : ""}`}
                    style={{ background: c.hex ?? "var(--muted)" }}
                  />
                  {c.oos && (
                    <span className="pointer-events-none absolute inset-0 grid place-items-center">
                      <span className="h-px w-full rotate-45 bg-foreground/60" />
                    </span>
                  )}
                </button>
              );
            })}
          </AdaptiveRow>
        </div>
      )}

      {hasSize && (
        <div>
          <Label text="Size" value={selected?.size} />
          <AdaptiveRow count={sizes.length} label="Sizes">
            {sizes.map((s) => {
              const sel = selected?.size === s.value;
              const scroll = sizes.length > 8;
              return (
                <button
                  key={s.value}
                  type="button"
                  onClick={() => !s.oos && pickSize(s.value)}
                  disabled={s.oos}
                  aria-pressed={sel}
                  className={`grid min-h-11 min-w-11 place-items-center rounded-full border px-4 text-xs font-semibold uppercase leading-none tracking-wide transition-all duration-200 active:scale-95 disabled:cursor-not-allowed disabled:opacity-40 disabled:line-through ${
                    scroll ? "shrink-0 snap-start" : ""
                  } ${sel ? "border-accent bg-accent/10 text-accent shadow-[var(--shadow-ember)] scale-[1.03]" : "border-border hover:border-accent/50"}`}
                >
                  {s.value}
                </button>
              );
            })}
          </AdaptiveRow>
        </div>
      )}
    </div>
  );
}

export const VariantSelector = memo(VariantSelectorImpl);
