import {
  AlertOctagon, AlertTriangle, Info, Bell, Package, Boxes, RotateCcw,
  CreditCard, MessageSquare, LifeBuoy, Star, type LucideIcon,
} from "lucide-react";

/* ────────────────────────────── Types ────────────────────────────── */

export type AdminNotification = {
  id: string;
  user_id: string;
  type: string;
  title: string;
  body: string | null;
  link: string | null;
  data: Record<string, unknown> | null;
  read_at: string | null;
  archived_at: string | null;
  priority: string;
  created_at: string;
};

export type Priority = "critical" | "important" | "normal" | "informational";

export const PRIORITY_ORDER: Priority[] = ["critical", "important", "normal", "informational"];
const PRIORITY_RANK: Record<Priority, number> = { critical: 0, important: 1, normal: 2, informational: 3 };

export function priorityOf(n: Pick<AdminNotification, "priority">): Priority {
  const p = (n.priority || "normal").toLowerCase();
  if (p === "critical") return "critical";
  if (p === "important" || p === "high") return "important";
  if (p === "informational" || p === "info" || p === "low") return "informational";
  return "normal";
}

export const PRIORITY_META: Record<
  Priority,
  { label: string; Icon: LucideIcon; tone: string; ring: string; dot: string; bar: string }
> = {
  critical: {
    label: "Critical", Icon: AlertOctagon,
    tone: "text-rose-300 border-rose-500/50 bg-rose-500/15",
    ring: "border-rose-500/40", dot: "bg-rose-500", bar: "bg-rose-500",
  },
  important: {
    label: "Important", Icon: AlertTriangle,
    tone: "text-amber-300 border-amber-500/50 bg-amber-500/15",
    ring: "border-amber-500/30", dot: "bg-amber-400", bar: "bg-amber-400",
  },
  normal: {
    label: "Normal", Icon: Bell,
    tone: "text-sky-300 border-sky-500/40 bg-sky-500/10",
    ring: "border-border", dot: "bg-sky-400", bar: "bg-sky-400/70",
  },
  informational: {
    label: "Info", Icon: Info,
    tone: "text-muted-foreground border-border bg-white/5",
    ring: "border-border", dot: "bg-muted-foreground", bar: "bg-muted-foreground/50",
  },
};

/* Sort: priority first, then most recent */
export function sortByPriority(a: AdminNotification, b: AdminNotification) {
  const d = PRIORITY_RANK[priorityOf(a)] - PRIORITY_RANK[priorityOf(b)];
  if (d !== 0) return d;
  return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
}

/* ──────────────────────── Operational categories ──────────────────────── */

export type OpsCategory = "orders" | "payments" | "inventory" | "customers" | "reviews" | "support" | "cms" | "system";

export const OPS_META: Record<OpsCategory, { label: string; Icon: LucideIcon; tone: string }> = {
  orders: { label: "Orders", Icon: Package, tone: "text-sky-400" },
  payments: { label: "Payments", Icon: CreditCard, tone: "text-accent" },
  inventory: { label: "Inventory", Icon: Boxes, tone: "text-emerald-400" },
  customers: { label: "Customers", Icon: LifeBuoy, tone: "text-violet-400" },
  reviews: { label: "Reviews & Q&A", Icon: Star, tone: "text-yellow-400" },
  support: { label: "Support", Icon: MessageSquare, tone: "text-pink-400" },
  cms: { label: "CMS & Media", Icon: RotateCcw, tone: "text-cyan-400" },
  system: { label: "System", Icon: AlertOctagon, tone: "text-rose-400" },
};

export const OPS_ORDER: OpsCategory[] = [
  "orders", "payments", "inventory", "customers", "reviews", "support", "cms", "system",
];

export function opsCategoryOf(n: Pick<AdminNotification, "type">): OpsCategory {
  const t = (n.type || "").toLowerCase();
  if (t.includes("order")) return "orders";
  if (t.includes("payment") || t.includes("refund") || t.includes("charge") || t.includes("razorpay")) return "payments";
  if (t.includes("stock") || t.includes("inventory")) return "inventory";
  if (t.includes("customer") || t.includes("signup") || t.includes("vip")) return "customers";
  if (t.includes("review") || t.includes("question")) return "reviews";
  if (t.includes("support") || t.includes("ticket") || t === "return") return "support";
  if (t.includes("banner") || t.includes("announcement") || t.includes("cms") || t.includes("media") || t.includes("homepage")) return "cms";
  if (t.includes("system") || t.includes("webhook") || t.includes("email") || t.includes("storage") || t.includes("job") || t.includes("database") || t.includes("security")) return "system";
  return "system";
}

/* ──────────────────────── Actionable resolver ──────────────────────── */

export type NotifAction = { label: string; to: string };

export function actionFor(n: AdminNotification): NotifAction | null {
  const t = (n.type || "").toLowerCase();
  const data = n.data ?? {};
  if (t.includes("low_stock") || t.includes("stock") || t.includes("inventory"))
    return { label: "Restock product", to: "/admin-inventory" };
  if (t === "question" || t.includes("question"))
    return { label: "Reply", to: n.link || "/admin-products" };
  if (t.includes("refund"))
    return { label: "Review refund", to: "/admin-payments" };
  if (t === "return" || t.includes("return"))
    return { label: "Open return", to: "/admin-returns" };
  if (t.includes("support") || t.includes("ticket"))
    return { label: "Open ticket", to: "/admin-support" };
  if (t.includes("payment") || t.includes("razorpay") || t.includes("charge"))
    return { label: "View transaction", to: "/admin-payments" };
  if (t.includes("order")) {
    const id = data.order_id as string | undefined;
    return { label: "View order", to: id ? `/admin/orders/${id}` : "/admin?tab=orders" };
  }
  if (t.includes("review"))
    return { label: "View review", to: n.link || "/admin-products" };
  if (t.includes("customer"))
    return { label: "View customer", to: "/admin-customers" };
  if (t.includes("email"))
    return { label: "Email health", to: "/admin-email-health" };
  if (n.link) return { label: "Open", to: n.link };
  return null;
}

/* ──────────────────────── Preferences ──────────────────────── */

export type PrefMode = "all" | "critical" | "orders" | "inventory" | "support" | "marketing" | "system";

export const PREF_MODES: { value: PrefMode; label: string; hint: string }[] = [
  { value: "all", label: "Receive all", hint: "Every operational event" },
  { value: "critical", label: "Critical only", hint: "Only critical-priority alerts" },
  { value: "orders", label: "Orders only", hint: "New, high-value & failed orders" },
  { value: "inventory", label: "Inventory only", hint: "Low & out-of-stock alerts" },
  { value: "support", label: "Support only", hint: "Tickets, reviews & questions" },
  { value: "marketing", label: "Marketing only", hint: "Promotions & campaigns" },
  { value: "system", label: "System only", hint: "Webhooks, email & platform" },
];

/* Whether a notification passes the chosen preference mode (client-side view filter) */
export function passesPref(n: AdminNotification, mode: PrefMode): boolean {
  if (mode === "all") return true;
  if (mode === "critical") return priorityOf(n) === "critical";
  const cat = opsCategoryOf(n);
  if (mode === "orders") return cat === "orders";
  if (mode === "inventory") return cat === "inventory";
  if (mode === "support") return cat === "support" || cat === "reviews" || cat === "customers";
  if (mode === "marketing") return cat === "cms";
  if (mode === "system") return cat === "system" || cat === "payments";
  return true;
}
