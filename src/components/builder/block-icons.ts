import {
  Sparkles, GalleryHorizontal, Megaphone, Star, PackagePlus, Flame, Zap,
  Quote, ShieldCheck, LayoutGrid, Newspaper, Code, Minus, HelpCircle, Mail,
  type LucideIcon,
} from "lucide-react";
import type { BlockType } from "@/lib/use-storefront-blocks";

/** Maps the string icon names in BLOCK_TYPE_META to real lucide components. */
export const BLOCK_ICON: Record<BlockType, LucideIcon> = {
  hero: Sparkles,
  banner_carousel: GalleryHorizontal,
  announcement_bar: Megaphone,
  featured_products: Star,
  new_arrivals: PackagePlus,
  trending_products: Flame,
  flash_sales: Zap,
  testimonials: Quote,
  trust: ShieldCheck,
  category_showcase: LayoutGrid,
  blog: Newspaper,
  custom_html: Code,
  spacer: Minus,
  faq: HelpCircle,
  newsletter: Mail,
};
