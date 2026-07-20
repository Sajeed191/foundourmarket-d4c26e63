import { memo } from "react";
import { Link } from "@tanstack/react-router";
import {
  Package,
  UtensilsCrossed,
  Sofa,
  Gamepad2,
  Cpu,
  Gem,
  ToyBrick,
  PawPrint,
  Car,
  Shirt,
  Dumbbell,
  Watch,
  Headphones,
  Baby,
  Wrench,
  BookOpen,
  type LucideIcon,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getStorageResponsive } from "@/lib/storage-image";

/* Premium category icon mapping — keyed by keyword in slug/name. Used only as
   a visual fallback when a category has no real (or AI-generated) image. */
const CATEGORY_ICON_RULES: { match: string[]; icon: LucideIcon }[] = [
  { match: ["kitchen"], icon: UtensilsCrossed },
  { match: ["home", "decor", "furnitur"], icon: Sofa },
  { match: ["gaming", "game"], icon: Gamepad2 },
  { match: ["electronic", "tech", "gadget"], icon: Cpu },
  { match: ["beauty", "cosmetic", "skin"], icon: Gem },
  { match: ["toy", "kids"], icon: ToyBrick },
  { match: ["pet", "animal"], icon: PawPrint },
  { match: ["vehicle", "car", "auto", "moto"], icon: Car },
  { match: ["cloth", "apparel", "wear"], icon: Shirt },
  { match: ["fitness", "sport", "gym"], icon: Dumbbell },
  { match: ["watch", "accessor"], icon: Watch },
  { match: ["audio", "headphone", "sound"], icon: Headphones },
  { match: ["baby", "infant"], icon: Baby },
  { match: ["tool", "hardware", "diy"], icon: Wrench },
  { match: ["book", "stationery", "office"], icon: BookOpen },
];

export function iconForCategory(slug: string, name: string): LucideIcon {
  const hay = `${slug} ${name}`.toLowerCase();
  for (const rule of CATEGORY_ICON_RULES) {
    if (rule.match.some((m) => hay.includes(m))) return rule.icon;
  }
  return Package;
}

export type CategoryCardData = {
  id: string;
  slug: string;
  name: string;
  image: string | null;
  mobile_image: string | null;
  theme?: string | null;
};

/* Single visual contract defaults. Applied defensively before render so a
   category with missing data can never fall into a divergent layout branch. */
const DEFAULT_CATEGORY_IMAGE = "";
const DEFAULT_THEME = "standard";

/**
 * Image-first category card — enforces ONE visual contract for every category:
 *   CardShell → MediaWrapper (fixed 1:1) → Image (object-cover) →
 *   GradientOverlay (always present) → GlowRing (data-driven) → Label
 * There are no category-type branches; the only fork is the data-driven image
 * vs icon fallback (used when a category genuinely has no image).
 */
export function CategoryCardImpl({
  category,
  count,
  to,
  params,
}: {
  category: CategoryCardData;
  count: number;
  to: string;
  params: Record<string, string>;
}) {
  // Defensive normalization: guarantee a consistent shape for every card.
  const normalizedCategory = {
    ...category,
    image: category.image ?? DEFAULT_CATEGORY_IMAGE,
    mobile_image: category.mobile_image ?? DEFAULT_CATEGORY_IMAGE,
    theme: category.theme ?? DEFAULT_THEME,
    variant: "standard" as const,
  };

  const Icon = iconForCategory(normalizedCategory.slug, normalizedCategory.name);
  const img = normalizedCategory.mobile_image || normalizedCategory.image || "";
  // Serve a small resized variant instead of the full original (CLS-safe via
  // the fixed aspect-square container).
  const responsive = img ? getStorageResponsive(img, [200, 320, 480]) : null;
  // GlowRing is driven ONLY by data (does this category have products), never
  // by category type — keeps the contract identical across all categories.
  const hasGlow = count > 0;

  return (
    <Link
      to={to as never}
      params={params as never}
      onClick={() => void supabase.rpc("track_category_event", { _id: normalizedCategory.id, _event: "click" })}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-card)]"
    >
      {/* MediaWrapper — fixed 1:1 ratio for every card */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/60">
        {img ? (
          <img
            src={responsive?.src ?? img}
            srcSet={responsive?.srcset}
            sizes="(max-width: 640px) 45vw, 200px"
            alt={normalizedCategory.name}
            loading="lazy"
            decoding="async"
            className="absolute inset-0 size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
            style={{ objectFit: "cover", width: "100%", height: "100%" }}
          />
        ) : (
          <div className="grid size-full place-items-center">
            <span className="grid size-11 sm:size-14 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_24px_-10px_oklch(0.74_0.19_49/0.5)] transition-colors group-hover:bg-accent/20">
              <Icon className="size-5 sm:size-6" />
            </span>
          </div>
        )}

        {/* GradientOverlay — ALWAYS present, regardless of image/fallback */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 bg-gradient-to-t from-background/45 via-transparent to-transparent"
        />

        {/* GlowRing — data-driven only (has products), not category-specific */}
        {hasGlow && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-0 rounded-2xl ring-1 ring-inset ring-accent/0 transition-[box-shadow] duration-300 group-hover:ring-accent/25 group-hover:shadow-[inset_0_0_28px_-14px_oklch(0.74_0.19_49/0.8)]"
          />
        )}
      </div>

      {/* Label */}
      <div className="flex flex-1 flex-col items-center justify-start gap-0.5 px-2.5 pt-1.5 pb-2 text-center">
        <h3 className="line-clamp-1 text-[13px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-accent sm:text-[15px]">
          {normalizedCategory.name}
        </h3>
      </div>
    </Link>
  );
}

export const CategoryCard = memo(CategoryCardImpl, (a, b) =>
  a.count === b.count &&
  a.to === b.to &&
  a.category.id === b.category.id &&
  a.category.image === b.category.image &&
  a.category.mobile_image === b.category.mobile_image &&
  a.category.name === b.category.name &&
  a.category.slug === b.category.slug &&
  a.category.theme === b.category.theme &&
  a.params.slug === b.params.slug,
);
