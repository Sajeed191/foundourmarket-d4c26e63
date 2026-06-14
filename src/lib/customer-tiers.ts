/**
 * Pure, dependency-free helpers for Customer 360° Intelligence:
 * tier classification, health scoring, segment matching and avatar fallbacks.
 * All logic is derived from real customer metrics — no mock data.
 */

export type TierKey = "new" | "regular" | "premium" | "vip" | "elite";

export type TierMeta = {
  key: TierKey;
  label: string;
  emoji: string;
  /** Tailwind classes for the badge (uses semantic tokens / tonal utilities). */
  className: string;
  dot: string;
};

export const TIERS: Record<TierKey, TierMeta> = {
  new: {
    key: "new",
    label: "New",
    emoji: "🟢",
    className: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    dot: "bg-emerald-400",
  },
  regular: {
    key: "regular",
    label: "Regular",
    emoji: "🔵",
    className: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    dot: "bg-sky-400",
  },
  premium: {
    key: "premium",
    label: "Premium",
    emoji: "🟣",
    className: "text-violet-400 border-violet-500/30 bg-violet-500/10",
    dot: "bg-violet-400",
  },
  vip: {
    key: "vip",
    label: "VIP",
    emoji: "🟠",
    className: "text-accent border-accent/40 bg-accent/10",
    dot: "bg-accent",
  },
  elite: {
    key: "elite",
    label: "Elite",
    emoji: "👑",
    className: "text-amber-300 border-amber-400/40 bg-amber-400/10",
    dot: "bg-amber-300",
  },
};

/**
 * Compute a customer tier from real lifetime metrics.
 * Thresholds tuned for an INR storefront (lifetime revenue in rupees).
 */
export function computeTier(orders: number, revenue: number): TierMeta {
  if (orders >= 20 || revenue >= 200000) return TIERS.elite;
  if (orders >= 10 || revenue >= 75000) return TIERS.vip;
  if (orders >= 5 || revenue >= 25000) return TIERS.premium;
  if (orders >= 2 || revenue >= 5000) return TIERS.regular;
  return TIERS.new;
}

export type HealthInput = {
  totalOrders: number;
  lifetimeRevenue: number;
  refundCount: number;
  openTickets: number;
  riskScore: number;
  lastActive: string | null;
};

export type HealthResult = {
  /** 0-100 — higher is healthier. */
  score: number;
  level: "excellent" | "good" | "fair" | "at-risk";
  label: string;
  className: string;
};

/**
 * Customer health score combining purchase frequency, monetary value,
 * refund pressure, support load, fraud risk and recency.
 */
export function computeHealth(i: HealthInput): HealthResult {
  let score = 40;

  // Purchase frequency & loyalty
  score += Math.min(25, i.totalOrders * 4);
  // Monetary value
  score += Math.min(20, i.lifetimeRevenue / 5000);
  // Recency (active in last 30 / 90 days)
  if (i.lastActive) {
    const days = (Date.now() - new Date(i.lastActive).getTime()) / 86400000;
    if (days <= 30) score += 15;
    else if (days <= 90) score += 6;
    else if (days > 180) score -= 12;
  } else {
    score -= 10;
  }
  // Penalties
  score -= i.refundCount * 6;
  score -= i.openTickets * 5;
  score -= Math.min(30, i.riskScore * 0.4);

  score = Math.max(0, Math.min(100, Math.round(score)));

  if (score >= 75)
    return { score, level: "excellent", label: "Excellent", className: "text-emerald-400" };
  if (score >= 55)
    return { score, level: "good", label: "Good", className: "text-sky-400" };
  if (score >= 35)
    return { score, level: "fair", label: "Fair", className: "text-amber-400" };
  return { score, level: "at-risk", label: "At Risk", className: "text-destructive" };
}

export function riskLevel(score: number): { label: string; className: string } {
  if (score >= 70) return { label: "High Risk", className: "text-destructive border-destructive/30 bg-destructive/10" };
  if (score >= 35) return { label: "Medium Risk", className: "text-amber-400 border-amber-500/30 bg-amber-500/10" };
  return { label: "Low Risk", className: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" };
}

export type SegmentKey =
  | "all"
  | "vip"
  | "returning"
  | "new"
  | "high_value"
  | "active"
  | "at_risk";

export const SEGMENTS: { key: SegmentKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "vip", label: "VIP" },
  { key: "returning", label: "Returning" },
  { key: "new", label: "New" },
  { key: "high_value", label: "High Value" },
  { key: "active", label: "Active" },
  { key: "at_risk", label: "At Risk" },
];

export type SegmentInput = {
  totalOrders: number;
  lifetimeRevenue: number;
  riskScore: number;
  lastActive: string | null;
  tier: TierKey;
  health: number;
};

function isActive(lastActive: string | null) {
  if (!lastActive) return false;
  return Date.now() - new Date(lastActive).getTime() <= 30 * 86400000;
}

export function matchesSegment(seg: SegmentKey, i: SegmentInput): boolean {
  switch (seg) {
    case "all":
      return true;
    case "vip":
      return i.tier === "vip" || i.tier === "elite";
    case "returning":
      return i.totalOrders >= 2;
    case "new":
      return i.totalOrders <= 1;
    case "high_value":
      return i.lifetimeRevenue >= 25000;
    case "active":
      return isActive(i.lastActive);
    case "at_risk":
      return i.riskScore >= 35 || i.health < 35;
    default:
      return true;
  }
}

export { isActive };

/** Stable initials for fallback avatars. */
export function initialsOf(name?: string | null, email?: string | null): string {
  const src = (name || email || "?").trim();
  if (!src) return "?";
  const parts = src.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return src.slice(0, 2).toUpperCase();
}
