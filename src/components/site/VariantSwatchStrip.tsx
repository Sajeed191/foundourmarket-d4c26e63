import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, PointerEvent } from "react";
import { Check } from "lucide-react";
import type { Product } from "@/lib/products";
import type { VariantSummary } from "@/lib/variant-facets";
import {
  getCachedVariantSummary,
  loadVariantSummaries,
} from "@/lib/variant-swatch-cache";
import { runWhenIdle } from "@/lib/idle";

export type SwatchStockState = "in" | "low" | "out";

export type ColorOption = {
  name: string;
  hex: string | null;
  cover: string | null;
  stock: SwatchStockState;
  /** Min additive price adjustment among this colour's in-stock variants. */
  adjustment: number;
  /** Absolute price override (base currency) when the colour sets one. */
  override: number | null;
};

export type SwatchPreview = {
  index: number;
  option: ColorOption;
};

type Props = {
  product: Product;
  /** Fired when a colour is previewed (hover/tap) or cleared (null). */
  onPreview: (preview: SwatchPreview | null) => void;
  className?: string;
};

/** Aggregate a summary into ordered, deduped colour options with stock state. */
function toColorOptions(summary: VariantSummary): ColorOption[] {
  return summary.colors.map((name) => {
    const rows = summary.rows.filter((r) => (r.color ?? "").trim() === name);
    const totalStock = rows.reduce((n, r) => n + Math.max(0, r.stock), 0);
    const maxThreshold = rows.reduce((n, r) => Math.max(n, r.lowStockThreshold), 0);
    const cover = rows.find((r) => r.imageUrl)?.imageUrl ?? null;
    const inStockRows = rows.filter((r) => r.stock > 0);
    const pricingRows = inStockRows.length ? inStockRows : rows;
    const adjustment = pricingRows.reduce(
      (min, r) => Math.min(min, r.adjustment ?? 0),
      Infinity,
    );
    const overrideRow = pricingRows.find((r) => r.override != null);
    let stock: SwatchStockState = "out";
    if (totalStock > 0) stock = totalStock <= maxThreshold ? "low" : "in";
    return {
      name,
      hex: summary.colorHex[name] ?? null,
      cover,
      stock,
      adjustment: Number.isFinite(adjustment) ? adjustment : 0,
      override: overrideRow?.override ?? null,
    };
  });
}

const canHover =
  typeof window !== "undefined" &&
  typeof window.matchMedia === "function" &&
  window.matchMedia("(hover: hover) and (pointer: fine)").matches;

/** Fire a short haptic pulse on supported mobile devices. */
function haptic() {
  if (typeof navigator !== "undefined" && typeof navigator.vibrate === "function") {
    try {
      navigator.vibrate(8);
    } catch {
      /* ignore */
    }
  }
}

function SwatchStripImpl({ product, onPreview, className }: Props) {
  const slug = product.slug;
  const [summary, setSummary] = useState<VariantSummary | null | undefined>(() =>
    getCachedVariantSummary(slug),
  );
  const [active, setActive] = useState<number | null>(null);
  const [ripple, setRipple] = useState<{ key: number } | null>(null);
  const preloaded = useRef<Set<string>>(new Set());
  const previewToken = useRef(0);

  // Lazy, idle, deduplicated summary load. Never blocks first paint and never
  // downloads galleries — only the tiny facet summary. Skips when cached.
  useEffect(() => {
    if (summary !== undefined) return;
    let alive = true;
    runWhenIdle(() => {
      void loadVariantSummaries([slug]).then(() => {
        if (alive) setSummary(getCachedVariantSummary(slug) ?? null);
      });
    });
    return () => {
      alive = false;
    };
  }, [slug, summary]);

  const options = useMemo(
    () => (summary ? toColorOptions(summary) : []),
    [summary],
  );

  // Preload ONLY current / previous / next colour cover images. Rapidly
  // switching swatches bumps a token so stale decodes are ignored.
  const preload = useCallback(
    (index: number) => {
      previewToken.current += 1;
      const token = previewToken.current;
      const targets = [index - 1, index, index + 1]
        .filter((i) => i >= 0 && i < options.length)
        .map((i) => options[i]?.cover)
        .filter((u): u is string => !!u && !preloaded.current.has(u));
      for (const url of targets) {
        const img = new Image();
        img.decoding = "async";
        img.onload = () => {
          if (token !== previewToken.current) return; // stale switch — ignore
          preloaded.current.add(url);
        };
        img.src = url;
      }
    },
    [options],
  );

  const setPreview = useCallback(
    (index: number | null) => {
      setActive(index);
      if (index == null) {
        onPreview(null);
        return;
      }
      const option = options[index];
      if (!option) return;
      preload(index);
      onPreview({ index, option });
    },
    [onPreview, options, preload],
  );

  const handleEnter = useCallback(
    (index: number) => () => {
      if (canHover) setPreview(index);
    },
    [setPreview],
  );

  const handleLeave = useCallback(() => {
    if (canHover) setPreview(null);
  }, [setPreview]);

  const handleClick = useCallback(
    (index: number) => (e: MouseEvent<HTMLButtonElement>) => {
      // Never navigate to the product page from a swatch tap; just preview.
      e.preventDefault();
      e.stopPropagation();
      if (canHover) return; // hover already drives desktop preview
      if (active === index) {
        setPreview(null);
        return;
      }
      haptic();
      setPreview(index);
    },
    [active, setPreview],
  );

  const handlePointerDown = useCallback((e: PointerEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    setRipple({ key: Date.now() });
  }, []);

  if (!summary || options.length < 2) return null;

  const extra = options.length - Math.min(options.length, 6);

  return (
    <div
      className={`flex items-center gap-1.5 ${className ?? ""}`}
      role="group"
      aria-label={`Preview ${product.name} colours`}
      onMouseLeave={handleLeave}
    >
      {options.slice(0, 6).map((o, i) => {
        const isActive = active === i;
        const oos = o.stock === "out";
        return (
          <button
            key={o.name + i}
            type="button"
            onMouseEnter={handleEnter(i)}
            onClick={handleClick(i)}
            onPointerDown={handlePointerDown}
            aria-pressed={isActive}
            aria-label={`${o.name}${oos ? " (out of stock)" : ""}`}
            title={o.name}
            className={`relative grid size-6 shrink-0 place-items-center overflow-hidden rounded-full transition-transform duration-150 will-change-transform active:scale-90 ${
              isActive && !oos
                ? "scale-110 ring-2 ring-accent ring-offset-2 ring-offset-[#111111]"
                : isActive && oos
                  ? "ring-2 ring-muted-foreground/60 ring-offset-2 ring-offset-[#111111]"
                  : "ring-1 ring-white/15 hover:ring-accent/60"
            }`}
          >
            <span
              className={`size-full rounded-full ${oos ? "opacity-35" : ""}`}
              style={{ background: o.hex ?? "var(--muted)" }}
            />
            {isActive && !oos && (
              <Check
                className="pointer-events-none absolute size-3.5 text-white drop-shadow-[0_1px_2px_rgba(0,0,0,0.8)] motion-safe:animate-in motion-safe:zoom-in"
                strokeWidth={3}
              />
            )}
            {oos && (
              <span className="pointer-events-none absolute inset-0 grid place-items-center">
                <span className="h-px w-[130%] rotate-45 bg-foreground/70" />
              </span>
            )}
            {ripple && isActive && (
              <span
                key={ripple.key}
                className="pointer-events-none absolute inset-0 rounded-full bg-white/40 motion-safe:animate-[swatch-ripple_450ms_ease-out]"
              />
            )}
          </button>
        );
      })}
      {extra > 0 && (
        <span className="text-[11px] font-semibold tabular-nums text-muted-foreground">
          +{extra}
        </span>
      )}
    </div>
  );
}

export const VariantSwatchStrip = memo(SwatchStripImpl);
