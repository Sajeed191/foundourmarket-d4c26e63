/**
 * ProductBadge — the single canonical marketing badge used across the entire
 * marketplace (Product Cards, PDP, category pages, search, deals, trending,
 * best sellers, new arrivals, related, FBT, bundles, wishlist, recently
 * viewed, recommended, vendor previews).
 *
 * There is only ONE badge component. Colors, priority, enablement, radius,
 * font, animation and label come from the Badge Manager (`badge_types` table)
 * — never from hardcoded constants in this file. Any admin change in Badge
 * Manager instantly propagates to every surface via realtime + snapshot.
 */
import { memo, useMemo, type CSSProperties, type ReactNode } from "react";
import { useBadgeCatalog, badgeAnimationClass, type BadgeType } from "@/lib/use-product-badges";

const BADGE_SHADOW = "0 2px 8px rgba(0,0,0,0.18)";
const BADGE_BACKDROP = "blur(10px) saturate(140%)";

/**
 * Absolute-minimum fallback used ONLY before the Badge Manager catalog has
 * hydrated on first paint. Never overrides a DB row.
 */
const FALLBACK: { background: string; color: string; border: string } = {
  background: "rgba(20,20,20,0.82)",
  color: "#ffffff",
  border: "1px solid rgba(255,255,255,0.10)",
};

/** Canonical pill sizing/typography — identical on cards and PDP. */
export const PRODUCT_BADGE_PILL_CLASS =
  "inline-flex h-[24px] max-[400px]:h-[22px] sm:h-[26px] min-w-[64px] max-w-[110px] max-[400px]:max-w-[95px] w-fit items-center justify-center whitespace-nowrap rounded-full px-[10px] py-[4px] max-[400px]:px-[8px] max-[400px]:py-[3px] text-[11px] max-[400px]:text-[10px] font-semibold uppercase leading-none tracking-[0.4px] transition-[opacity,transform] animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-150";

/** Match a Badge Manager row for the caller's label OR slug (case-insensitive). */
function findBadgeType(types: BadgeType[], label: string): BadgeType | undefined {
  const needle = label.trim().toLowerCase();
  return types.find(
    (t) =>
      t.label.trim().toLowerCase() === needle ||
      t.badgeKey.trim().toLowerCase() === needle ||
      t.badgeKey.replace(/[_-]/g, " ").trim().toLowerCase() === needle,
  );
}

function styleFromRow(row: BadgeType | undefined): CSSProperties {
  if (!row) {
    return {
      backgroundColor: FALLBACK.background,
      color: FALLBACK.color,
      backdropFilter: BADGE_BACKDROP,
      border: FALLBACK.border,
      boxShadow: BADGE_SHADOW,
    };
  }
  const bg = row.backgroundColor || row.color || FALLBACK.background;
  const fg = row.textColor || FALLBACK.color;
  const border = row.borderColor ? `1px solid ${row.borderColor}` : FALLBACK.border;
  const glow = row.glowColor
    ? `${BADGE_SHADOW}, 0 0 ${8 + (row.shadowStrength || 0) * 4}px ${row.glowColor}66`
    : BADGE_SHADOW;
  return {
    backgroundColor: bg,
    color: fg,
    backdropFilter: BADGE_BACKDROP,
    border,
    boxShadow: glow,
    borderRadius: row.radius ? row.radius * 4 : undefined,
    fontSize: row.fontSize ? row.fontSize : undefined,
    fontWeight: row.fontWeight ? row.fontWeight : undefined,
  };
}

type ProductBadgeProps = {
  /** Label OR slug (badge_key). Resolves to a Badge Manager row for styling. */
  label: string;
  className?: string;
  style?: CSSProperties;
  as?: "span" | "button";
  children?: ReactNode;
} & Record<string, unknown>;

function ProductBadgeImpl({ label, className = "", style, as = "span", children, ...rest }: ProductBadgeProps) {
  const { types } = useBadgeCatalog();
  const row = useMemo(() => findBadgeType(types, label), [types, label]);
  const Tag = as as "span";
  const displayLabel = (row?.label ?? label).toUpperCase();
  const animClass = row ? badgeAnimationClass(row.animation) : "";
  return (
    <Tag
      data-product-badge
      data-badge-key={row?.badgeKey ?? ""}
      className={`${PRODUCT_BADGE_PILL_CLASS} ${animClass} ${className}`.trim()}
      style={{ ...styleFromRow(row), ...(style ?? {}) }}
      {...rest}
    >
      <span className="truncate">{displayLabel}</span>
      {children}
    </Tag>
  );
}

export const ProductBadge = memo(ProductBadgeImpl);

/** Kept for callers that used the old helper — style now comes from the DB row. */
export function badgeStyle(_label: string): CSSProperties {
  return styleFromRow(undefined);
}

export function shortBadgeLabel(label: string): string {
  return label;
}

/** Absolute top-left anchor used identically on cards and the PDP gallery. */
export function ProductBadgeAnchor({ children }: { children: ReactNode }) {
  return <div className="absolute left-[10px] top-[10px] z-10">{children}</div>;
}
