import { supabase } from "@/integrations/supabase/client";

/**
 * Unified Admin Command Center search.
 *
 * Searches across every major admin entity using indexed `ilike` queries
 * (DB-backed, scales to large catalogs) and returns normalized, grouped
 * results. Every entity query is permission-protected at the database layer
 * via RLS — this module only adds a UX gate so staff never see actions they
 * cannot execute.
 */

export type CommandGroup =
  | "Products"
  | "Orders"
  | "Customers"
  | "Content"
  | "Marketing"
  | "Inventory"
  | "Support"
  | "System";

export type SearchResult = {
  id: string;
  group: CommandGroup;
  /** lucide icon name resolved by the UI */
  icon: string;
  title: string;
  subtitle?: string;
  /** route to navigate to on select */
  to: string;
  /** extra context for contextual quick actions */
  meta?: Record<string, unknown>;
  keywords?: string;
};

export type Role =
  | "admin"
  | "super_admin"
  | "manager"
  | "support"
  | "fulfillment"
  | "warehouse_staff"
  | "editor";

function hasAny(roles: Set<Role>, allowed: Role[]) {
  return allowed.some((r) => roles.has(r));
}

/** Lightweight Levenshtein for typo tolerance / ranking. */
export function editDistance(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length;
  const n = b.length;
  if (!m) return n;
  if (!n) return m;
  const dp = Array.from({ length: m + 1 }, (_, i) => [i, ...new Array(n).fill(0)]);
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      dp[i][j] = Math.min(dp[i - 1][j] + 1, dp[i][j - 1] + 1, dp[i - 1][j - 1] + cost);
    }
  }
  return dp[m][n];
}

/** Fuzzy score: lower is better. Supports partial + typo tolerant matching. */
export function fuzzyScore(query: string, target: string): number {
  if (!query) return 0;
  const q = query.toLowerCase().trim();
  const t = (target ?? "").toLowerCase();
  if (!t) return 999;
  if (t.includes(q)) return t.startsWith(q) ? 0 : 1;
  // token partial match
  const tokens = q.split(/\s+/);
  if (tokens.every((tok) => t.includes(tok))) return 2;
  // typo tolerance against the closest word
  const words = t.split(/\s+/);
  let best = 999;
  for (const w of words) {
    const d = editDistance(q, w);
    if (d <= Math.max(1, Math.floor(q.length / 4))) best = Math.min(best, 3 + d);
  }
  return best;
}

/** Synonym expansion for smart search. */
const SYNONYMS: Record<string, string[]> = {
  refund: ["refund", "return", "rma"],
  shipping: ["shipping", "shipment", "delivery", "fulfillment"],
  stock: ["stock", "inventory", "quantity"],
  customer: ["customer", "user", "buyer"],
  promo: ["promo", "promotion", "discount", "coupon", "sale"],
  banner: ["banner", "hero"],
  post: ["post", "blog", "article"],
};

export function expandSynonyms(q: string): string[] {
  const lower = q.toLowerCase().trim();
  for (const [, list] of Object.entries(SYNONYMS)) {
    if (list.some((s) => lower.includes(s))) {
      return Array.from(new Set([lower, ...list]));
    }
  }
  return [lower];
}

const STAFF: Role[] = ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff", "editor"];

type Searcher = {
  group: CommandGroup;
  roles: Role[];
  run: (q: string) => Promise<SearchResult[]>;
};

const SEARCHERS: Searcher[] = [
  {
    group: "Products",
    roles: STAFF,
    run: async (q) => {
      const { data } = await supabase
        .from("products")
        .select("slug,name,status,stock_quantity,price_inr")
        .ilike("name", `%${q}%`)
        .limit(8);
      return (data ?? []).map((p) => ({
        id: `product-${p.slug}`,
        group: "Products" as const,
        icon: "Package",
        title: p.name,
        subtitle: `${p.status} · ${p.stock_quantity ?? 0} in stock`,
        to: `/admin-products?focus=${encodeURIComponent(p.slug)}`,
        meta: { slug: p.slug, status: p.status, kind: "product" },
        keywords: p.slug,
      }));
    },
  },
  {
    group: "Inventory",
    roles: ["admin", "super_admin", "manager", "warehouse_staff"],
    run: async (q) => {
      const { data } = await supabase
        .from("products")
        .select("slug,name,stock_quantity,low_stock_threshold")
        .ilike("name", `%${q}%`)
        .order("stock_quantity", { ascending: true })
        .limit(5);
      return (data ?? [])
        .filter((p) => (p.stock_quantity ?? 0) <= (p.low_stock_threshold ?? 5))
        .map((p) => ({
          id: `inv-${p.slug}`,
          group: "Inventory" as const,
          icon: "Boxes",
          title: p.name,
          subtitle: `Low stock · ${p.stock_quantity ?? 0} left`,
          to: `/admin-inventory?focus=${encodeURIComponent(p.slug)}`,
          meta: { slug: p.slug, kind: "inventory" },
        }));
    },
  },
  {
    group: "Orders",
    roles: ["admin", "super_admin", "manager", "support", "fulfillment", "warehouse_staff"],
    run: async (q) => {
      let query = supabase
        .from("orders")
        .select("id,contact_email,status,fulfillment_status,total,created_at")
        .order("created_at", { ascending: false })
        .limit(8);
      // match by order id prefix or contact email
      query = q.includes("@")
        ? query.ilike("contact_email", `%${q}%`)
        : query.ilike("id", `${q}%`);
      const { data } = await query;
      return (data ?? []).map((o) => ({
        id: `order-${o.id}`,
        group: "Orders" as const,
        icon: "ShoppingBag",
        title: `Order ${String(o.id).slice(0, 8)}`,
        subtitle: `${o.contact_email ?? ""} · ${o.fulfillment_status ?? o.status}`,
        to: `/admin-shipments?order=${o.id}`,
        meta: { id: o.id, kind: "order" },
      }));
    },
  },
  {
    group: "Customers",
    roles: ["admin", "super_admin", "manager", "support"],
    run: async (q) => {
      const { data } = await supabase
        .from("profiles")
        .select("id,full_name,phone,country")
        .ilike("full_name", `%${q}%`)
        .limit(6);
      return (data ?? []).map((c) => ({
        id: `customer-${c.id}`,
        group: "Customers" as const,
        icon: "Users",
        title: c.full_name || "Unnamed customer",
        subtitle: [c.phone, c.country].filter(Boolean).join(" · "),
        to: `/admin-customers?id=${c.id}`,
        meta: { id: c.id, kind: "customer" },
      }));
    },
  },
  {
    group: "Support",
    roles: ["admin", "super_admin", "manager", "support"],
    run: async (q) => {
      const { data } = await supabase
        .from("support_tickets")
        .select("id,subject,status,priority")
        .ilike("subject", `%${q}%`)
        .limit(6);
      return (data ?? []).map((t) => ({
        id: `ticket-${t.id}`,
        group: "Support" as const,
        icon: "LifeBuoy",
        title: t.subject || "Support ticket",
        subtitle: `${t.status} · ${t.priority}`,
        to: `/admin-support?ticket=${t.id}`,
        meta: { id: t.id, status: t.status, kind: "ticket" },
      }));
    },
  },
  {
    group: "Content",
    roles: ["admin", "super_admin", "manager", "editor"],
    run: async (q) => {
      const [banners, announcements, pages, posts, blocks] = await Promise.all([
        supabase.from("banners").select("id,title,status").ilike("title", `%${q}%`).limit(4),
        supabase.from("announcements").select("id,message,active").ilike("message", `%${q}%`).limit(3),
        supabase.from("cms_pages").select("id,title,slug,published").ilike("title", `%${q}%`).limit(3),
        supabase.from("cms_posts").select("id,title,slug").ilike("title", `%${q}%`).limit(3),
        supabase.from("storefront_blocks").select("id,type,status").ilike("type", `%${q}%`).limit(3),
      ]);
      const out: SearchResult[] = [];
      (banners.data ?? []).forEach((b) =>
        out.push({ id: `banner-${b.id}`, group: "Content", icon: "Image", title: b.title, subtitle: `Banner · ${b.status}`, to: "/admin-cms", meta: { id: b.id, kind: "banner" } }),
      );
      (announcements.data ?? []).forEach((a) =>
        out.push({ id: `ann-${a.id}`, group: "Content", icon: "Megaphone", title: a.message, subtitle: `Announcement · ${a.active ? "active" : "inactive"}`, to: "/admin-marketing", meta: { id: a.id, kind: "announcement" } }),
      );
      (pages.data ?? []).forEach((p) =>
        out.push({ id: `page-${p.id}`, group: "Content", icon: "FileText", title: p.title, subtitle: `Page · ${p.published ? "published" : "draft"}`, to: "/admin-cms", meta: { id: p.id, kind: "page" } }),
      );
      (posts.data ?? []).forEach((p) =>
        out.push({ id: `post-${p.id}`, group: "Content", icon: "FileText", title: p.title, subtitle: "Blog post", to: "/admin-cms", meta: { id: p.id, kind: "post" } }),
      );
      (blocks.data ?? []).forEach((b) =>
        out.push({ id: `block-${b.id}`, group: "Content", icon: "LayoutTemplate", title: b.type, subtitle: `Block · ${b.status}`, to: "/builder", meta: { id: b.id, kind: "block" } }),
      );
      return out;
    },
  },
  {
    group: "Marketing",
    roles: ["admin", "super_admin", "manager", "editor"],
    run: async (q) => {
      const [promos, flash] = await Promise.all([
        supabase.from("promo_codes").select("id,code").ilike("code", `%${q}%`).limit(4),
        supabase.from("flash_sales").select("id,name,active").ilike("name", `%${q}%`).limit(4),
      ]);
      const out: SearchResult[] = [];
      (promos.data ?? []).forEach((p) =>
        out.push({ id: `promo-${p.id}`, group: "Marketing", icon: "Tag", title: p.code, subtitle: "Promo code", to: "/admin-marketing", meta: { id: p.id, kind: "promo" } }),
      );
      (flash.data ?? []).forEach((f) =>
        out.push({ id: `flash-${f.id}`, group: "Marketing", icon: "Zap", title: f.name, subtitle: `Flash sale · ${f.active ? "live" : "off"}`, to: "/admin-marketing", meta: { id: f.id, kind: "flash" } }),
      );
      return out;
    },
  },
];

export async function searchAll(rawQuery: string, roles: Set<Role>): Promise<SearchResult[]> {
  const q = rawQuery.trim();
  if (q.length < 2) return [];
  const allowed = SEARCHERS.filter((s) => hasAny(roles, s.roles));
  const settled = await Promise.allSettled(allowed.map((s) => s.run(q)));
  const results = settled.flatMap((r) => (r.status === "fulfilled" ? r.value : []));
  // rank with fuzzy score so partial / typo matches still surface usefully
  return results
    .map((r) => ({ r, score: Math.min(fuzzyScore(q, r.title), fuzzyScore(q, r.keywords ?? "")) }))
    .sort((a, b) => a.score - b.score)
    .map((x) => x.r);
}
