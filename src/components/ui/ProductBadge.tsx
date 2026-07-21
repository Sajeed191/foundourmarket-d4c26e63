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

const BADGE_SHADOW = "0 2px 8px rgba(0,0,0,0.28)";
const BADGE_BACKDROP = "blur(10px) saturate(140%)";

/**
 * Canonical palette fallback (Badge System v3). Used when the Badge Manager
 * catalog row is missing OR its color fields are empty. Guarantees a bright,
 * opaque background with a contrasting label — the label is never dark-on-dark.
 * Keyed by normalized slug (letters only, lowercased).
 */
const CANONICAL_PALETTE: Record<string, { bg: string; fg: string; glow?: string }> = {
  flashdeal:   { bg: "#FF5A1F", fg: "#FFFFFF", glow: "#FF7A3D" },
  flashsale:   { bg: "#FF5A1F", fg: "#FFFFFF", glow: "#FF7A3D" },
  hotdeal:     { bg: "#E63946", fg: "#FFFFFF" },
  bestseller:  { bg: "#F5B301", fg: "#111111" },
  bestsellers: { bg: "#F5B301", fg: "#111111" },
  trending:    { bg: "#2563EB", fg: "#FFFFFF" },
  new:         { bg: "#10B981", fg: "#FFFFFF" },
  newarrival:  { bg: "#10B981", fg: "#FFFFFF" },
  newarrivals: { bg: "#10B981", fg: "#FFFFFF" },
  recommended: { bg: "#6366F1", fg: "#FFFFFF" },
  bestvalue:   { bg: "#8B5CF6", fg: "#FFFFFF" },
  popular:     { bg: "#0EA5A4", fg: "#FFFFFF" },
  popularchoice: { bg: "#0EA5A4", fg: "#FFFFFF" },
  featured:    { bg: "#C9A24A", fg: "#111111" },
};

const HARD_FALLBACK = { bg: "#1F2937", fg: "#FFFFFF" };

function normalizeKey(s: string): string {
  return s.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function paletteFor(label: string, badgeKey?: string): { bg: string; fg: string; glow?: string } {
  return (
    CANONICAL_PALETTE[normalizeKey(badgeKey ?? "")] ||
    CANONICAL_PALETTE[normalizeKey(label)] ||
    HARD_FALLBACK
  );
}

/** Canonical pill sizing/typography — identical on cards and PDP. */
export const PRODUCT_BADGE_PILL_CLASS =
  "inline-flex h-[24px] max-[400px]:h-[22px] sm:h-[26px] min-w-[64px] max-w-[110px] max-[400px]:max-w-[95px] w-fit items-center justify-center whitespace-nowrap rounded-full px-[10px] py-[4px] max-[400px]:px-[8px] max-[400px]:py-[3px] text-[11px] max-[400px]:text-[10px] font-semibold uppercase leading-none tracking-[0.4px] transition-[opacity,transform] animate-in fade-in slide-in-from-top-1 zoom-in-95 duration-150";

/** Match a Badge Manager row for the caller's label OR slug (case-insensitive, alias-tolerant). */
function findBadgeType(types: BadgeType[], label: string): BadgeType | undefined {
  const needle = normalizeKey(label);
  if (!needle) return undefined;
  return types.find(
    (t) =>
      normalizeKey(t.label) === needle ||
      normalizeKey(t.badgeKey) === needle,
  );
}

/**
 * Compose the final style. Any color absent from the DB row is filled from
 * the canonical v3 palette so text is NEVER dark-on-dark and background is
 * NEVER transparent. Opacity is locked to 1.
 */
function composeStyle(label: string, row: BadgeType | undefined): CSSProperties {
  const canonical = paletteFor(label, row?.badgeKey);
  const bg = row?.backgroundColor || row?.color || canonical.bg;
  const fg = row?.textColor || canonical.fg;
  const borderColor = row?.borderColor || bg;
  const glowColor = row?.glowColor || canonical.glow;
  const glow = glowColor
    ? `${BADGE_SHADOW}, 0 0 ${8 + (row?.shadowStrength || 0) * 4}px ${glowColor}55`
    : BADGE_SHADOW;
  // NOTE: We intentionally DO NOT set `backdrop-filter` inline. Runtime safe-mode
  // rules in styles.css use `[style*="backdrop-filter"]` selectors with
  // !important to neutralise blurred surfaces on low-end / render-safe /
  // degraded devices, and that would overwrite our badge background with the
  // app surface gray. The pill is fully opaque anyway. We ALSO expose the
  // resolved colors as `--badge-color`/`--badge-text` so the existing
  // color-lock rule (`[data-product-badge][style*="--badge-color"]…`) engages
  // as a second line of defence against any future overrides.
  return {
    ["--badge-color" as string]: bg,
    ["--badge-text" as string]: fg,
    backgroundColor: bg,
    color: fg,
    opacity: 1,
    border: `1px solid ${borderColor}`,
    boxShadow: glow,
    textShadow: "0 1px 1px rgba(0,0,0,0.18)",
    borderRadius: row?.radius ? row.radius * 4 : undefined,
    fontSize: row?.fontSize ? row.fontSize : undefined,
    fontWeight: row?.fontWeight ? row.fontWeight : 700,
    mixBlendMode: "normal",
    isolation: "isolate",
  } as CSSProperties;
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
  const composed = composeStyle(label, row);
  return (
    <Tag
      data-product-badge
      data-badge-key={row?.badgeKey ?? normalizeKey(label)}
      className={`${PRODUCT_BADGE_PILL_CLASS} ${animClass} ${className}`.trim()}
      style={{ ...composed, ...(style ?? {}) }}
      {...rest}
    >
      <span className="truncate" style={{ color: "inherit", opacity: 1 }}>{displayLabel}</span>
      {children}
    </Tag>
  );
}

export const ProductBadge = memo(ProductBadgeImpl);

/** Kept for callers that used the old helper — style now comes from the DB row. */
export function badgeStyle(label: string): CSSProperties {
  return composeStyle(label, undefined);
}

export function shortBadgeLabel(label: string): string {
  return label;
}

/** Absolute top-left anchor used identically on cards and the PDP gallery. */
export function ProductBadgeAnchor({ children }: { children: ReactNode }) {
  return <div className="absolute left-[10px] top-[10px] z-20 pointer-events-auto">{children}</div>;
}
