/**
 * ProductBadge — the single canonical marketing badge used across the entire
 * marketplace (Product Cards, PDP, category pages, search, deals, trending,
 * best sellers, new arrivals, related, FBT, bundles, wishlist, recently
 * viewed, recommended, vendor previews, etc.).
 *
 * There must be only one badge component. Every surface imports this. No
 * page-specific badge markup, no duplicated Tailwind classes, no inline
 * badge styling anywhere else.
 */
import { memo, type CSSProperties, type ReactNode } from "react";

const BADGE_SHADOW = "0 2px 8px rgba(0,0,0,0.18)";
const BADGE_BACKDROP = "blur(10px) saturate(140%)";
const BADGE_BORDER = "1px solid rgba(255,255,255,0.10)";

const BADGE_LABEL_SHORT: Record<string, string> = {
  "BEST SELLER": "BESTSELLER",
  "FLASH DEAL": "FLASH",
  "FLASH SALE": "FLASH",
  "HOT DEAL": "HOT",
  "BEST VALUE": "VALUE",
  "NEW ARRIVAL": "NEW",
  "POPULAR CHOICE": "POPULAR",
};

export function shortBadgeLabel(label: string): string {
  return BADGE_LABEL_SHORT[label.trim().toUpperCase()] ?? label;
}

type BadgePalette = { background: string; color: string; extraShadow?: string };
type BadgeStyle = CSSProperties & { "--badge-color": string; "--badge-text": string };

const BADGE_PALETTE: Record<string, BadgePalette> = {
  "FLASH DEAL": { background: "#FF7A00", color: "#111111", extraShadow: "0 0 20px rgba(255,122,0,0.40)" },
  "FLASH SALE": { background: "#FF7A00", color: "#111111", extraShadow: "0 0 20px rgba(255,122,0,0.40)" },
  "FLASH":      { background: "#FF7A00", color: "#111111", extraShadow: "0 0 20px rgba(255,122,0,0.40)" },
  "HOT DEAL":   { background: "#F97316", color: "#FFFFFF" },
  "HOT":        { background: "#F97316", color: "#FFFFFF" },
  "BEST SELLER":{ background: "#FBBF24", color: "#111111" },
  "BESTSELLER": { background: "#FBBF24", color: "#111111" },
  "TRENDING":   { background: "#2563EB", color: "#FFFFFF" },
  "NEW":        { background: "#10B981", color: "#FFFFFF" },
  "NEW ARRIVAL":{ background: "#10B981", color: "#FFFFFF" },
  "RECOMMENDED":{ background: "#4F46E5", color: "#FFFFFF" },
  "BEST VALUE": { background: "#7C3AED", color: "#FFFFFF" },
  "VALUE":      { background: "#7C3AED", color: "#FFFFFF" },
  "POPULAR":    { background: "#0891B2", color: "#FFFFFF" },
  "POPULAR CHOICE": { background: "#0891B2", color: "#FFFFFF" },
};

const BADGE_FALLBACK_PALETTE: BadgePalette = {
  background: "rgba(20,20,20,0.82)",
  color: "#FFFFFF",
};

function paletteFor(label: string): BadgePalette {
  return BADGE_PALETTE[label.trim().toUpperCase()] ?? BADGE_FALLBACK_PALETTE;
}

export function badgeStyle(label: string): BadgeStyle {
  const p = paletteFor(label);
  return {
    "--badge-color": p.background,
    "--badge-text": p.color,
    backgroundColor: "var(--badge-color)",
    color: "var(--badge-text)",
    backdropFilter: BADGE_BACKDROP,
    border: BADGE_BORDER,
    boxShadow: p.extraShadow ? `${BADGE_SHADOW}, ${p.extraShadow}` : BADGE_SHADOW,
  };
}

/** The canonical pill sizing/typography used by every badge in the app. */
export const PRODUCT_BADGE_PILL_CLASS =
  "inline-flex h-[24px] max-[400px]:h-[22px] sm:h-[26px] min-w-[64px] max-w-[110px] max-[400px]:max-w-[95px] w-fit items-center justify-center whitespace-nowrap rounded-full px-[10px] py-[4px] max-[400px]:px-[8px] max-[400px]:py-[3px] text-[11px] max-[400px]:text-[10px] font-semibold uppercase leading-none tracking-[0.4px] transition-[opacity,transform] animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-150";

type ProductBadgeProps = {
  label: string;
  className?: string;
  style?: CSSProperties;
  as?: "span" | "button";
  children?: ReactNode;
} & Record<string, unknown>;

function ProductBadgeImpl({ label, className = "", style, as = "span", children, ...rest }: ProductBadgeProps) {
  const Tag = as as "span";
  const short = shortBadgeLabel(label);
  return (
    <Tag
      data-product-badge
      className={`${PRODUCT_BADGE_PILL_CLASS} ${className}`}
      style={{ ...badgeStyle(label), ...(style ?? {}) }}
      {...rest}
    >
      <span className="truncate">{short}</span>
      {children}
    </Tag>
  );
}

export const ProductBadge = memo(ProductBadgeImpl);

/** Absolute top-left anchor used identically on cards and the PDP gallery. */
export function ProductBadgeAnchor({ children }: { children: ReactNode }) {
  return <div className="absolute left-[10px] top-[10px] z-10">{children}</div>;
}
