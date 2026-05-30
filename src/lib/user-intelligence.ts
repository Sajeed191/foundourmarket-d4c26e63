import { supabase } from "@/integrations/supabase/client";

/**
 * User & Staff Intelligence Engine.
 *
 * 100% database-backed. All rows come from the role-gated SECURITY DEFINER
 * RPC `admin_user_directory`, which aggregates real data from auth.users,
 * profiles, user_roles, orders, refunds, product_reviews, product_questions,
 * wishlist, support_tickets, admin_activity_logs and visitor_sessions.
 *
 * No demo users. No fake activity. Scoring & segmentation are derived
 * deterministically from the real aggregates below.
 */

const DAY = 86_400_000;
const now = () => Date.now();
const ms = (s: string | null) => (s ? +new Date(s) : null);

export type StaffRole = "super_admin" | "admin" | "manager" | "editor" | "support" | "fulfillment" | "warehouse_staff";
export const STAFF_ROLES: StaffRole[] = ["super_admin", "admin", "manager", "editor", "support", "fulfillment", "warehouse_staff"];

export type RawUser = {
  id: string;
  email: string | null;
  full_name: string | null;
  avatar_url: string | null;
  phone: string | null;
  country: string | null;
  market_region: string | null;
  profile_created_at: string | null;
  auth_created_at: string | null;
  last_sign_in_at: string | null;
  roles: string[];
  orders_count: number;
  revenue: number;
  promo_count: number;
  first_order_at: string | null;
  last_order_at: string | null;
  refund_amount: number;
  reviews: number;
  questions: number;
  wishlist: number;
  tickets: number;
  open_tickets: number;
  assigned_tickets: number;
  resolved_tickets: number;
  activity_count: number;
  last_admin_action: string | null;
  session_country_count: number;
  session_device_count: number;
  total_page_views: number;
  last_seen: string | null;
  device: string | null;
  referrer: string | null;
  landing_path: string | null;
  current_path: string | null;
  last_event: string | null;
  last_event_at: string | null;
};

export type OnlineStatus = "online" | "recent" | "offline";
export type Region = "india" | "international";

export type CustomerSegment =
  | "VIP Customer" | "High Value" | "At Risk" | "New Customer"
  | "Returning Customer" | "Customer" | "Lead";

export type UserIntel = {
  id: string;
  name: string;
  email: string | null;
  avatar: string | null;
  phone: string | null;
  region: Region;
  country: string | null;
  roles: string[];
  isStaff: boolean;
  primaryRole: string;
  joinedAt: string | null;
  lastSignInAt: string | null;
  accountAgeDays: number;
  // activity
  lastActivityAt: number | null;
  lastActivityMs: number | null; // ms since last activity
  onlineStatus: OnlineStatus;
  currentPath: string | null;
  device: string | null;
  source: string;
  pageViews: number;
  // business
  ordersCount: number;
  revenue: number;
  aov: number;
  ltv: number;
  refundAmount: number;
  refundRate: number;
  promoCount: number;
  recencyDays: number | null;
  // engagement
  reviews: number;
  questions: number;
  wishlist: number;
  tickets: number;
  openTickets: number;
  // staff
  assignedTickets: number;
  resolvedTickets: number;
  resolutionRate: number;
  activityCount: number;
  lastAdminAction: number | null;
  // scoring (0..100)
  healthScore: number;
  loyaltyScore: number;
  churnRisk: number;
  engagementScore: number;
  vipScore: number;
  frequencyPerMonth: number;
  segment: CustomerSegment;
  tags: string[];
  // security signals
  multiCountry: boolean;
  multiDevice: boolean;
};

/* ---------------- source classification ---------------- */
function classifySource(referrer: string | null): string {
  const r = (referrer ?? "").toLowerCase();
  if (!r) return "Direct";
  if (r.includes("google")) return "Google";
  if (r.includes("facebook") || r.includes("instagram") || r.includes("meta") || r.includes("fb.")) return "Meta";
  if (r.includes("tiktok")) return "TikTok";
  if (r.includes("youtube")) return "YouTube";
  if (r.includes("bing")) return "Bing";
  if (r.includes("twitter") || r.includes("t.co") || r.includes("x.com")) return "X / Twitter";
  if (r.includes("whatsapp")) return "WhatsApp";
  if (r.includes("mail") || r.includes("email")) return "Email";
  return "Referral";
}

function clamp(n: number, lo = 0, hi = 100) { return Math.max(lo, Math.min(hi, n)); }

export function buildUserIntel(rows: RawUser[]): UserIntel[] {
  const buyers = rows.filter((r) => r.orders_count > 0);
  const spends = buyers.map((b) => b.revenue).sort((a, b) => a - b);
  const vipCut = spends.length ? spends[Math.floor(spends.length * 0.95)] ?? Infinity : Infinity;
  const highCut = spends.length ? spends[Math.floor(spends.length * 0.8)] ?? Infinity : Infinity;

  return rows.map((r) => {
    const isStaff = r.roles.some((x) => STAFF_ROLES.includes(x as StaffRole));
    const primaryRole = STAFF_ROLES.find((sr) => r.roles.includes(sr)) ?? (r.orders_count > 0 ? "customer" : "lead");

    const joined = r.profile_created_at ?? r.auth_created_at;
    const accountAgeDays = joined ? Math.max(1, Math.floor((now() - +new Date(joined)) / DAY)) : 1;

    const lastTs = Math.max(ms(r.last_event_at) ?? 0, ms(r.last_seen) ?? 0, ms(r.last_sign_in_at) ?? 0, ms(r.last_admin_action) ?? 0);
    const lastActivityAt = lastTs > 0 ? lastTs : null;
    const lastActivityMs = lastActivityAt ? now() - lastActivityAt : null;
    const onlineStatus: OnlineStatus =
      lastActivityMs == null ? "offline"
        : lastActivityMs < 5 * 60_000 ? "online"
        : lastActivityMs < 30 * 60_000 ? "recent" : "offline";

    const aov = r.orders_count ? r.revenue / r.orders_count : 0;
    const ltv = r.revenue - r.refund_amount;
    const refundRate = r.revenue > 0 ? Math.min(1, r.refund_amount / r.revenue) : 0;
    const recencyDays = r.last_order_at ? Math.floor((now() - +new Date(r.last_order_at)) / DAY) : null;
    const frequencyPerMonth = r.orders_count / Math.max(1, accountAgeDays / 30);

    // engagement 0..100
    const engagementScore = clamp(
      Math.min(30, r.total_page_views * 0.5) +
      Math.min(20, r.reviews * 5) +
      Math.min(15, r.questions * 5) +
      Math.min(15, r.wishlist * 3) +
      (onlineStatus === "online" ? 20 : onlineStatus === "recent" ? 10 : 0),
    );

    // loyalty 0..100
    const loyaltyScore = clamp(
      Math.min(40, r.orders_count * 8) +
      Math.min(20, frequencyPerMonth * 20) +
      Math.min(20, (r.reviews + r.questions) * 4) +
      (recencyDays != null && recencyDays <= 60 ? 20 : recencyDays != null && recencyDays <= 120 ? 10 : 0),
    );

    // churn risk 0..100
    let churnRisk: number;
    if (r.orders_count > 0) {
      churnRisk = clamp(
        Math.min(45, ((recencyDays ?? 999) / 120) * 45) +
        (frequencyPerMonth < 0.3 ? 15 : 0) +
        refundRate * 25 +
        (onlineStatus === "offline" ? 15 : 0),
      );
    } else {
      churnRisk = accountAgeDays > 60 ? 75 : 45;
    }

    // vip 0..100
    const vipScore = clamp(
      Math.min(60, (r.revenue / Math.max(1, vipCut)) * 60) +
      Math.min(20, r.orders_count * 4) +
      Math.min(20, loyaltyScore * 0.2),
    );

    // health 0..100 — blends value, loyalty, engagement, inverse churn
    const healthScore = clamp(
      loyaltyScore * 0.3 + engagementScore * 0.25 + (100 - churnRisk) * 0.25 + Math.min(100, vipScore) * 0.2,
    );

    const region: Region = (r.market_region ?? "").toLowerCase() === "international" ? "international" : "india";

    // segment
    let segment: CustomerSegment;
    if (r.orders_count === 0) segment = "Lead";
    else if (r.revenue >= vipCut) segment = "VIP Customer";
    else if (r.revenue >= highCut) segment = "High Value";
    else if (churnRisk >= 65) segment = "At Risk";
    else if (r.orders_count >= 2) segment = "Returning Customer";
    else if (accountAgeDays <= 30) segment = "New Customer";
    else segment = "Customer";

    const tags: string[] = [];
    if (segment === "VIP Customer") tags.push("VIP");
    if (r.revenue >= highCut && segment !== "VIP Customer") tags.push("High Value");
    if (churnRisk >= 65 && r.orders_count > 0) tags.push("At Risk");
    if (refundRate >= 0.3 && r.refund_amount > 0) tags.push("Refund Heavy");
    if (r.tickets >= 5) tags.push("Support Heavy");
    if (accountAgeDays <= 30 && r.orders_count > 0) tags.push("New");
    if (r.orders_count >= 2) tags.push("Returning");

    const resolutionRate = r.assigned_tickets ? r.resolved_tickets / r.assigned_tickets : 0;

    return {
      id: r.id,
      name: r.full_name || r.email?.split("@")[0] || "Unnamed user",
      email: r.email,
      avatar: r.avatar_url,
      phone: r.phone,
      region,
      country: r.country,
      roles: r.roles,
      isStaff,
      primaryRole,
      joinedAt: joined,
      lastSignInAt: r.last_sign_in_at,
      accountAgeDays,
      lastActivityAt,
      lastActivityMs,
      onlineStatus,
      currentPath: r.current_path,
      device: r.device,
      source: classifySource(r.referrer),
      pageViews: r.total_page_views,
      ordersCount: r.orders_count,
      revenue: r.revenue,
      aov,
      ltv,
      refundAmount: r.refund_amount,
      refundRate,
      promoCount: r.promo_count,
      recencyDays,
      reviews: r.reviews,
      questions: r.questions,
      wishlist: r.wishlist,
      tickets: r.tickets,
      openTickets: r.open_tickets,
      assignedTickets: r.assigned_tickets,
      resolvedTickets: r.resolved_tickets,
      resolutionRate,
      activityCount: r.activity_count,
      lastAdminAction: ms(r.last_admin_action),
      healthScore: Math.round(healthScore),
      loyaltyScore: Math.round(loyaltyScore),
      churnRisk: Math.round(churnRisk),
      engagementScore: Math.round(engagementScore),
      vipScore: Math.round(vipScore),
      frequencyPerMonth,
      segment,
      tags,
      multiCountry: r.session_country_count > 1,
      multiDevice: r.session_device_count > 2,
    };
  });
}

/* ---------------- aggregates ---------------- */

export type UserSummary = {
  total: number;
  online: number;
  recent: number;
  active7d: number;
  inactive30d: number;
  customers: number;
  leads: number;
  staff: number;
  admins: number;
  managers: number;
  support: number;
  vip: number;
  highValue: number;
  atRisk: number;
  newCustomers: number;
  returning: number;
  totalRevenue: number;
  revenueVip: number;
  revenueHigh: number;
  revenueOther: number;
};

export function summarize(rows: UserIntel[]): UserSummary {
  const active7 = (r: UserIntel) => r.lastActivityMs != null && r.lastActivityMs <= 7 * DAY;
  return {
    total: rows.length,
    online: rows.filter((r) => r.onlineStatus === "online").length,
    recent: rows.filter((r) => r.onlineStatus === "recent").length,
    active7d: rows.filter(active7).length,
    inactive30d: rows.filter((r) => r.lastActivityMs == null || r.lastActivityMs > 30 * DAY).length,
    customers: rows.filter((r) => r.ordersCount > 0).length,
    leads: rows.filter((r) => r.ordersCount === 0 && !r.isStaff).length,
    staff: rows.filter((r) => r.isStaff).length,
    admins: rows.filter((r) => r.roles.includes("admin") || r.roles.includes("super_admin")).length,
    managers: rows.filter((r) => r.roles.includes("manager")).length,
    support: rows.filter((r) => r.roles.includes("support")).length,
    vip: rows.filter((r) => r.segment === "VIP Customer").length,
    highValue: rows.filter((r) => r.segment === "High Value").length,
    atRisk: rows.filter((r) => r.tags.includes("At Risk")).length,
    newCustomers: rows.filter((r) => r.segment === "New Customer").length,
    returning: rows.filter((r) => r.ordersCount >= 2).length,
    totalRevenue: rows.reduce((s, r) => s + r.revenue, 0),
    revenueVip: rows.filter((r) => r.segment === "VIP Customer").reduce((s, r) => s + r.revenue, 0),
    revenueHigh: rows.filter((r) => r.segment === "High Value").reduce((s, r) => s + r.revenue, 0),
    revenueOther: rows.filter((r) => r.segment !== "VIP Customer" && r.segment !== "High Value").reduce((s, r) => s + r.revenue, 0),
  };
}

export type InactivityBucket = { label: string; days: number; users: UserIntel[] };
export function inactivityBuckets(rows: UserIntel[]): InactivityBucket[] {
  const thresholds = [7, 30, 60, 90, 180, 365];
  return thresholds.map((days, i) => {
    const upper = thresholds[i + 1] ?? Infinity;
    const users = rows.filter((r) => {
      const d = r.lastActivityMs == null ? Infinity : r.lastActivityMs / DAY;
      return d >= days && d < upper;
    }).sort((a, b) => b.revenue - a.revenue);
    return { label: upper === Infinity ? `${days}d+` : `${days}–${upper}d`, days, users };
  });
}

export type RegionStat = { region: Region; users: number; revenue: number; orders: number };
export function regionStats(rows: UserIntel[]): RegionStat[] {
  const build = (region: Region): RegionStat => {
    const r = rows.filter((u) => u.region === region);
    return { region, users: r.length, revenue: r.reduce((s, u) => s + u.revenue, 0), orders: r.reduce((s, u) => s + u.ordersCount, 0) };
  };
  return [build("india"), build("international")];
}

export type CountryStat = { country: string; users: number; revenue: number };
export function countryStats(rows: UserIntel[]): CountryStat[] {
  const m = new Map<string, CountryStat>();
  rows.forEach((r) => {
    const c = r.country || "Unknown";
    const e = m.get(c) ?? { country: c, users: 0, revenue: 0 };
    e.users += 1; e.revenue += r.revenue; m.set(c, e);
  });
  return [...m.values()].sort((a, b) => b.users - a.users).slice(0, 12);
}

export type UserInsight = {
  id: string;
  kind: "vip" | "churn" | "reactivate" | "highvalue" | "fraud" | "support" | "refund";
  severity: "high" | "medium" | "low";
  title: string;
  detail: string;
  user: UserIntel;
};

export function buildInsights(rows: UserIntel[]): UserInsight[] {
  const out: UserInsight[] = [];
  for (const u of rows) {
    if (u.vipScore >= 70 && u.segment !== "VIP Customer" && u.ordersCount >= 2)
      out.push({ id: `vip-${u.id}`, kind: "vip", severity: "medium", title: `VIP opportunity — ${u.name}`, detail: `High spend & loyalty (VIP score ${u.vipScore}). Promote to VIP tier.`, user: u });
    if (u.churnRisk >= 70 && u.ordersCount > 0)
      out.push({ id: `churn-${u.id}`, kind: "churn", severity: u.segment === "VIP Customer" ? "high" : "medium", title: `Churn warning — ${u.name}`, detail: `Risk ${u.churnRisk}/100, ${u.recencyDays ?? "—"}d since last order.`, user: u });
    if (u.ordersCount > 0 && (u.lastActivityMs ?? Infinity) > 90 * DAY)
      out.push({ id: `react-${u.id}`, kind: "reactivate", severity: "low", title: `Reactivation — ${u.name}`, detail: `No activity in 90d+ but spent ₹${Math.round(u.revenue).toLocaleString("en-IN")}.`, user: u });
    if (u.segment === "High Value")
      out.push({ id: `hv-${u.id}`, kind: "highvalue", severity: "low", title: `High-value customer — ${u.name}`, detail: `Top 20% spender — prioritise experience.`, user: u });
    if (u.multiCountry && u.multiDevice)
      out.push({ id: `fraud-${u.id}`, kind: "fraud", severity: "high", title: `Fraud signal — ${u.name}`, detail: `Logins across multiple countries & devices.`, user: u });
    if (u.tickets >= 5)
      out.push({ id: `sup-${u.id}`, kind: "support", severity: "medium", title: `Support-heavy — ${u.name}`, detail: `${u.tickets} tickets (${u.openTickets} open).`, user: u });
    if (u.refundRate >= 0.4 && u.refundAmount > 0)
      out.push({ id: `ref-${u.id}`, kind: "refund", severity: "medium", title: `Refund-heavy — ${u.name}`, detail: `Refund rate ${(u.refundRate * 100).toFixed(0)}%.`, user: u });
  }
  const rank = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => rank[a.severity] - rank[b.severity]).slice(0, 60);
}

/* ---------------- fetch ---------------- */
export type UserIntelligence = {
  generatedAt: number;
  users: UserIntel[];
  staff: UserIntel[];
  summary: UserSummary;
  insights: UserInsight[];
};

export async function fetchUserIntelligence(): Promise<UserIntelligence> {
  const { getUserDirectoryFn } = await import("@/lib/admin-ops.functions");
  const data = await getUserDirectoryFn();
  const payload = data as { generated_at: string; users: RawUser[] };
  const all = buildUserIntel(payload?.users ?? []);
  return {
    generatedAt: payload?.generated_at ? +new Date(payload.generated_at) : Date.now(),
    users: all,
    staff: all.filter((u) => u.isStaff),
    summary: summarize(all),
    insights: buildInsights(all),
  };
}

/* ---------------- formatting ---------------- */
export function fmtMoney(n: number, region: Region = "india"): string {
  return new Intl.NumberFormat(region === "international" ? "en-US" : "en-IN", {
    style: "currency", currency: region === "international" ? "USD" : "INR", maximumFractionDigits: 0,
  }).format(n || 0);
}

export function timeAgo(ms: number | null): string {
  if (ms == null) return "never";
  const s = Math.max(0, Math.round(ms / 1000));
  if (s < 60) return `${s}s ago`;
  if (s < 3600) return `${Math.round(s / 60)}m ago`;
  if (s < 86400) return `${Math.round(s / 3600)}h ago`;
  return `${Math.round(s / 86400)}d ago`;
}

export const ROLE_LABEL: Record<string, string> = {
  super_admin: "Super Admin", admin: "Admin", manager: "Manager", editor: "Editor",
  support: "Support", fulfillment: "Fulfillment", warehouse_staff: "Warehouse",
  customer: "Customer", lead: "Lead",
};

export function scoreColor(n: number): string {
  if (n >= 70) return "text-emerald-400";
  if (n >= 40) return "text-amber-400";
  return "text-destructive";
}
