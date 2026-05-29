import {
  Sparkles,
  Truck,
  ShieldCheck,
  Flame,
  Globe2,
  Tag,
  Rocket,
  AlertTriangle,
  Gift,
  Clock,
  Percent,
  Megaphone,
} from "lucide-react";

/** Stable icon keys persisted in the announcements table. */
export const ANNOUNCEMENT_ICONS: Record<string, typeof Sparkles> = {
  sparkles: Sparkles,
  truck: Truck,
  shield: ShieldCheck,
  flame: Flame,
  globe: Globe2,
  tag: Tag,
  rocket: Rocket,
  alert: AlertTriangle,
  gift: Gift,
  clock: Clock,
  percent: Percent,
  megaphone: Megaphone,
};

export const ANNOUNCEMENT_ICON_KEYS = Object.keys(ANNOUNCEMENT_ICONS);

export function AnnouncementIcon({
  icon,
  className,
}: {
  icon: string | null | undefined;
  className?: string;
}) {
  const Icon = ANNOUNCEMENT_ICONS[icon ?? "sparkles"] ?? Sparkles;
  return <Icon className={className} />;
}

/** Announcement type → accent tint for urgency styling. */
export const ANNOUNCEMENT_TYPES = ["info", "sale", "shipping", "launch", "urgent"] as const;
export type AnnouncementType = (typeof ANNOUNCEMENT_TYPES)[number];
