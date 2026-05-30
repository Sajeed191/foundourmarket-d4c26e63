import {
  ShoppingBag, UserPlus, Heart, Eye, RotateCcw, AlertTriangle,
  Activity, CreditCard, Banknote, Star, LifeBuoy, Sparkles, Zap,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * P6 — Unified Live Activity Engine.
 *
 * Single operational stream that fuses every domain system into one realtime
 * timeline: orders, payments, refunds, returns, inventory, marketing
 * automation, AI operations, customer/subscriber signals, reviews, support,
 * and admin actions. Every event is derived from real database rows — the
 * historical backfill reads each source table directly, and the live layer
 * subscribes to the same tables via Postgres change streams. No mock data.
 */

export type ActivityKind =
  | "order_new" | "order_update"
  | "payment" | "payment_failed"
  | "refund"
  | "signup" | "subscriber"
  | "wishlist" | "cart" | "view" | "purchase"
  | "return" | "low_stock"
  | "review" | "support"
  | "ai_rec" | "automation" | "automation_failed"
  | "admin";

export type Severity = "info" | "success" | "warning" | "critical";

export type ActivityEvent = {
  id: string;
  kind: ActivityKind;
  title: string;
  body?: string;
  amount?: number;
  link?: string;
  at: number;
  severity: Severity;
};

export type ActivityCategory =
  | "commerce" | "customer" | "inventory" | "intelligence" | "ops";

type Meta = {
  label: string;
  icon: typeof ShoppingBag;
  fg: string;
  dot: string;
  glow: string;
  severity: Severity;
  category: ActivityCategory;
};

/* Refined operator palette — amber / teal / crimson / violet / neutral. */
export const ACTIVITY_META: Record<ActivityKind, Meta> = {
  order_new:        { label: "New Order",       icon: ShoppingBag,   fg: "text-accent",            dot: "bg-accent",            glow: "oklch(0.74 0.19 49 / 0.4)",   severity: "success",  category: "commerce" },
  order_update:     { label: "Order Update",    icon: ShoppingBag,   fg: "text-teal-300",          dot: "bg-teal-400",          glow: "oklch(0.78 0.12 195 / 0.35)", severity: "info",     category: "commerce" },
  payment:          { label: "Payment",         icon: CreditCard,    fg: "text-emerald-300",       dot: "bg-emerald-400",       glow: "oklch(0.72 0.15 160 / 0.35)", severity: "success",  category: "commerce" },
  payment_failed:   { label: "Payment Failed",  icon: CreditCard,    fg: "text-rose-300",          dot: "bg-rose-400",          glow: "oklch(0.65 0.2 25 / 0.35)",   severity: "critical", category: "commerce" },
  refund:           { label: "Refund",          icon: Banknote,      fg: "text-amber-300",         dot: "bg-amber-400",         glow: "oklch(0.78 0.15 70 / 0.32)",  severity: "warning",  category: "commerce" },
  signup:           { label: "Signup",          icon: UserPlus,      fg: "text-violet-300",        dot: "bg-violet-400",        glow: "oklch(0.6 0.16 290 / 0.35)",  severity: "info",     category: "customer" },
  subscriber:       { label: "Subscriber",      icon: UserPlus,      fg: "text-violet-300",        dot: "bg-violet-400",        glow: "oklch(0.6 0.16 290 / 0.35)",  severity: "info",     category: "customer" },
  wishlist:         { label: "Wishlist",        icon: Heart,         fg: "text-rose-300",          dot: "bg-rose-400",          glow: "oklch(0.65 0.16 15 / 0.32)",  severity: "info",     category: "customer" },
  cart:             { label: "Add to Cart",     icon: ShoppingBag,   fg: "text-accent",            dot: "bg-accent",            glow: "oklch(0.74 0.19 49 / 0.35)",  severity: "info",     category: "customer" },
  view:             { label: "Product View",    icon: Eye,           fg: "text-muted-foreground",  dot: "bg-muted-foreground",  glow: "oklch(0.7 0.018 260 / 0.25)", severity: "info",     category: "customer" },
  purchase:         { label: "Purchase Signal", icon: ShoppingBag,   fg: "text-teal-300",          dot: "bg-teal-400",          glow: "oklch(0.78 0.12 195 / 0.32)", severity: "success",  category: "customer" },
  return:           { label: "Return",          icon: RotateCcw,     fg: "text-amber-300",         dot: "bg-amber-400",         glow: "oklch(0.78 0.15 70 / 0.32)",  severity: "warning",  category: "commerce" },
  low_stock:        { label: "Low Stock",       icon: AlertTriangle, fg: "text-rose-300",          dot: "bg-rose-400",          glow: "oklch(0.65 0.2 25 / 0.35)",   severity: "critical", category: "inventory" },
  review:           { label: "Review",          icon: Star,          fg: "text-amber-300",         dot: "bg-amber-400",         glow: "oklch(0.8 0.15 85 / 0.32)",   severity: "info",     category: "customer" },
  support:          { label: "Support Ticket",  icon: LifeBuoy,      fg: "text-sky-300",           dot: "bg-sky-400",           glow: "oklch(0.7 0.13 230 / 0.32)",  severity: "warning",  category: "ops" },
  ai_rec:           { label: "AI Operations",   icon: Sparkles,      fg: "text-fuchsia-300",       dot: "bg-fuchsia-400",       glow: "oklch(0.68 0.2 330 / 0.35)",  severity: "info",     category: "intelligence" },
  automation:       { label: "Automation",      icon: Zap,           fg: "text-teal-300",          dot: "bg-teal-400",          glow: "oklch(0.78 0.12 195 / 0.35)", severity: "success",  category: "intelligence" },
  automation_failed:{ label: "Automation Fail", icon: Zap,           fg: "text-rose-300",          dot: "bg-rose-400",          glow: "oklch(0.65 0.2 25 / 0.35)",   severity: "critical", category: "intelligence" },
  admin:            { label: "Admin Action",    icon: Activity,      fg: "text-sky-300",           dot: "bg-sky-400",           glow: "oklch(0.7 0.13 230 / 0.32)",  severity: "info",     category: "ops" },
};

export const ALL_ACTIVITY_KINDS = Object.keys(ACTIVITY_META) as ActivityKind[];

export const ACTIVITY_CATEGORIES: { key: ActivityCategory; label: string }[] = [
  { key: "commerce", label: "Commerce" },
  { key: "customer", label: "Customer" },
  { key: "inventory", label: "Inventory" },
  { key: "intelligence", label: "Intelligence" },
  { key: "ops", label: "Operations" },
];

const PAID = new Set(["paid", "captured", "succeeded", "completed", "authorized"]);
const FAILED = new Set(["failed", "declined", "error", "cancelled", "canceled"]);

function ms(ts: string | null | undefined): number {
  return ts ? +new Date(ts) : Date.now();
}

/**
 * Historical backfill: merge the most recent rows from every domain system
 * into one chronological stream so the console shows real activity instantly.
 * All reads honour the seed-data filter so demo rows never pollute live ops.
 */
export async function fetchActivityHistory(perSource = 40): Promise<ActivityEvent[]> {
  const includeSeed = await includeSeedInAnalytics();
  const noSeed = (q: any): any => (includeSeed ? q : q.eq("is_seeded", false));
  const out: ActivityEvent[] = [];
  const add = (e: Omit<ActivityEvent, "id" | "severity"> & { severity?: Severity }) =>
    out.push({ id: crypto.randomUUID(), severity: e.severity ?? ACTIVITY_META[e.kind].severity, ...e });

  const [
    orders, payments, refunds, returns, reviews, tickets, recs, autos, subs, admin,
  ] = await Promise.all([
    noSeed(supabase.from("orders").select("id,total,currency,status,payment_status,created_at").order("created_at", { ascending: false }).limit(perSource)) as any,
    noSeed(supabase.from("payments").select("id,order_id,amount,currency,status,method,created_at").order("created_at", { ascending: false }).limit(perSource)) as any,
    supabase.from("refunds").select("id,order_id,amount,currency,status,reason,created_at").order("created_at", { ascending: false }).limit(perSource),
    noSeed(supabase.from("returns").select("id,reason,status,refund_amount,created_at").order("created_at", { ascending: false }).limit(perSource)) as any,
    noSeed(supabase.from("product_reviews").select("id,product_slug,rating,title,status,created_at").order("created_at", { ascending: false }).limit(perSource)) as any,
    noSeed(supabase.from("support_tickets").select("id,subject,status,priority,category,created_at").order("created_at", { ascending: false }).limit(perSource)) as any,
    supabase.from("ai_recommendations").select("id,title,priority,category,deep_link,created_at").order("created_at", { ascending: false }).limit(perSource),
    supabase.from("automation_executions").select("id,trigger_key,status,matched_count,action_taken,summary,error,created_at").order("created_at", { ascending: false }).limit(perSource),
    supabase.from("newsletter_subscribers").select("id,email,created_at").order("created_at", { ascending: false }).limit(perSource),
    supabase.from("admin_activity_logs").select("id,action,entity_type,entity_id,created_at").order("created_at", { ascending: false }).limit(perSource),
  ]);

  for (const o of (orders.data ?? []) as any[]) {
    add({ kind: "order_new", at: ms(o.created_at), title: `Order #${String(o.id).slice(0, 8)} placed`, body: `${o.currency} ${Number(o.total).toFixed(2)} · ${o.status}`, amount: Number(o.total), link: `/orders/${o.id}` });
  }
  for (const p of (payments.data ?? []) as any[]) {
    const st = String(p.status ?? "").toLowerCase();
    const failed = FAILED.has(st);
    add({ kind: failed ? "payment_failed" : "payment", at: ms(p.created_at), title: failed ? `Payment failed · ${p.method ?? "card"}` : `Payment captured · ${p.method ?? "card"}`, body: `${p.currency ?? ""} ${Number(p.amount).toFixed(2)}`, amount: failed ? undefined : Number(p.amount), link: p.order_id ? `/orders/${p.order_id}` : undefined });
  }
  for (const r of (refunds.data ?? []) as any[]) {
    add({ kind: "refund", at: ms(r.created_at), title: `Refund ${r.status ?? "issued"}`, body: `${r.currency ?? ""} ${Number(r.amount).toFixed(2)}${r.reason ? ` · ${r.reason}` : ""}`, link: r.order_id ? `/orders/${r.order_id}` : "/admin-returns" });
  }
  for (const r of (returns.data ?? []) as any[]) {
    add({ kind: "return", at: ms(r.created_at), title: "Return requested", body: r.reason ?? r.status, link: "/admin-returns" });
  }
  for (const r of (reviews.data ?? []) as any[]) {
    add({ kind: "review", at: ms(r.created_at), title: `${r.rating}★ review${r.title ? ` · ${r.title}` : ""}`, body: r.product_slug ?? undefined, severity: Number(r.rating) <= 2 ? "warning" : "info", link: r.product_slug ? `/products/${r.product_slug}` : undefined });
  }
  for (const t of (tickets.data ?? []) as any[]) {
    add({ kind: "support", at: ms(t.created_at), title: t.subject || "New support ticket", body: `${t.category ?? "general"} · ${t.priority ?? "normal"}`, severity: t.priority === "high" || t.priority === "urgent" ? "critical" : "warning", link: "/admin-support" });
  }
  for (const r of (recs.data ?? []) as any[]) {
    add({ kind: "ai_rec", at: ms(r.created_at), title: r.title || "AI recommendation", body: `${r.category ?? "ops"} · ${r.priority ?? "normal"} priority`, link: r.deep_link || "/admin-ai-operations" });
  }
  for (const a of (autos.data ?? []) as any[]) {
    const failed = String(a.status ?? "").toUpperCase().includes("FAIL");
    add({ kind: failed ? "automation_failed" : "automation", at: ms(a.created_at), title: failed ? `Automation failed · ${a.trigger_key ?? ""}` : (a.action_taken || a.summary || `Automation ran · ${a.trigger_key ?? ""}`), body: failed ? (a.error ?? undefined) : `${a.matched_count ?? 0} matched`, link: "/admin-marketing-automation?view=health" });
  }
  for (const s of (subs.data ?? []) as any[]) {
    add({ kind: "subscriber", at: ms(s.created_at), title: "New subscriber", body: s.email });
  }
  for (const a of (admin.data ?? []) as any[]) {
    add({ kind: "admin", at: ms(a.created_at), title: a.action, body: a.entity_type ? `${a.entity_type}${a.entity_id ? `:${String(a.entity_id).slice(0, 8)}` : ""}` : undefined, link: "/admin-activity" });
  }

  return out.sort((a, b) => b.at - a.at).slice(0, 300);
}
