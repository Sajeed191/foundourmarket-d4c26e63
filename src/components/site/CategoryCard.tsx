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
};

/**
 * Image-first category card: large image on top, title + product count below.
 * Subtle premium border, minimal glow, equal height across the grid.
 * Falls back to a glass icon capsule only when no real/AI image exists.
 */
export function CategoryCard({
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
  const Icon = iconForCategory(category.slug, category.name);
  const img = category.mobile_image || category.image || "";

  return (
    <Link
      to={to as never}
      params={params as never}
      onClick={() => void supabase.rpc("track_category_event", { _id: category.id, _event: "click" })}
      className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-accent/40 hover:shadow-[var(--shadow-card)]"
    >
      {/* Large image on top — consistent square ratio */}
      <div className="relative aspect-square w-full overflow-hidden bg-muted/60">dun
        {img ? (
          <img
            src={img}
            alt={category.name}
            loading="lazy"
            className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"
          />
        ) : (
          <div className="grid size-full place-items-center">
            <span className="grid size-11 sm:size-14 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_24px_-10px_oklch(0.74_0.19_49/0.5)] transition-colors group-hover:bg-accent/20">
              <Icon className="size-5 sm:size-6" />
            </span>
          </div>
        )}
      </div>

      {/* Title + product count below */}
      <div className="flex flex-1 flex-col items-center justify-center gap-0.5 px-2.5 py-3 text-center sm:py-3.5">
        <h3 className="line-clamp-1 text-[13px] font-semibold leading-snug tracking-tight text-white transition-colors group-hover:text-accent sm:text-[15px]">
          {category.name}
        </h3>
        {count > 0 && (
          <span className="block text-[10px] font-medium tracking-wide text-muted-foreground sm:text-[11px]">
            {count} {count === 1 ? "Product" : "Products"}
          </span>
        )}
      </div>
    </Link>
  );
}
