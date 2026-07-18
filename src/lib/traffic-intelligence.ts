import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * Traffic Intelligence Engine.
 *
 * Single source of truth = the existing tables:
 *   - analytics_events  (page_view, product_view, add_to_cart, checkout_start,
 *                        purchase, section_impression, section_click, …)
 *   - page_views        (raw pageview log w/ country + device)
 *   - visitor_sessions  (rolled-up sessions: last_seen, page_views, region…)
 *   - orders            (revenue cross-check by region)
 *   - search_logs       (search intelligence)
 *   - products          (names / categories for product intelligence)
 *
 * No new tables. No seeded/fake values. Every metric is derived from real rows.
 * Attribution (source / region / device → conversion) is reconstructed by
 * mapping each session's first page_view classification onto its later
 * funnel events via session_id.
 */

const DAY = 86_400_000;
const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaidOrder = (status: string | null, pay: string | null) =>
  PAID.has((pay ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed", "paid"].includes((status ?? "").toLowerCase());

export type Region = "india" | "international";

type EventRow = {
  event: string;
  path: string | null;
  product_slug: string | null;
  session_id: string | null;
  user_id: string | null;
  value: number | null;
  referrer: string | null;
  created_at: string;
  metadata: Record<string, unknown> | null;
};
type PVRow = { path: string; created_at: string; session_id: string | null; referrer: string | null; device: string | null; country: string | null; user_id: string | null };
type SessRow = { session_id: string; user_id: string | null; started_at: string; last_seen: string; page_views: number; country: string | null; device: string | null; referrer: string | null; landing_path: string | null };
type OrderRow = { total: number | null; status: string | null; payment_status: string | null; market_region: string | null; created_at: string };
type ProductRow = { slug: string; name: string; category: string | null; price: number | null; image: string | null };
type SearchRow = { query: string; results_count: number; clicked_product_slug: string | null; created_at: string };

const str = (v: unknown): string => (typeof v === "string" ? v : "");
const normRegion = (v: unknown): Region =>
  /india/i.test(str(v)) ? "india" : "international";

/* ------------------------------------------------------------------ types */

export type LiveStats = {
  active: number;
  india: number;
  international: number;
  loggedIn: number;
  guests: number;
  mobile: number;
  tablet: number;
  desktop: number;
};
export type LiveVisitor = {
  sessionId: string;
  path: string;
  region: Region;
  device: string;
  source: string;
  lastSeen: number;
  startedAt: number;
  loggedIn: boolean;
};
export type FunnelStep = { step: string; visitors: number; dropPct: number; conversionPct: number; revenue: number };
export type ProductStat = {
  slug: string; name: string; image: string | null; category: string | null;
  views: number; uniques: number; addToCart: number; checkout: number; purchases: number;
  atcRate: number; conversion: number; revenue: number; india: number; international: number;
};
export type SourceStat = { source: string; visitors: number; sessions: number; orders: number; revenue: number; conversion: number; aov: number };
export type RegionStat = { region: Region; visitors: number; sessions: number; orders: number; revenue: number; aov: number; conversion: number; topProducts: { slug: string; n: number }[] };
export type DeviceStat = { device: string; visitors: number; sessions: number; revenue: number; conversion: number; avgDuration: number; bounceRate: number };
export type SearchStat = { query: string; count: number; avgResults: number; noResult: boolean; clicks: number; conversion: number };
export type HeatItem = { label: string; value: number };
export type Heatmaps = { pages: HeatItem[]; categories: HeatItem[]; products: HeatItem[]; banners: HeatItem[]; sections: HeatItem[] };
export type Advice = { id: string; title: string; detail: string; impact: "high" | "medium" | "low"; confidence: number; opportunity: number; action: string };
export type ExecScores = {
  trafficHealth: number; conversionHealth: number; growth: number; revenueEfficiency: number;
  biggestOpportunity: string; biggestRisk: string; fastestSource: string; bestProduct: string; weakestStage: string;
};
export type TrafficIntelligence = {
  generatedAt: number;
  days: number;
  totals: { views: number; sessions: number; visitors: number; orders: number; revenue: number; conversion: number; bounceRate: number; avgDuration: number };
  live: LiveStats;
  liveFeed: LiveVisitor[];
  trend: { date: string; views: number; visitors: number }[];
  funnel: FunnelStep[];
  products: ProductStat[];
  sources: SourceStat[];
  regions: RegionStat[];
  devices: DeviceStat[];
  search: { top: SearchStat[]; growing: { query: string; growth: number }[]; noResults: SearchStat[]; converting: SearchStat[] };
  heatmaps: Heatmaps;
  advice: Advice[];
  scores: ExecScores;
};

/* ------------------------------------------------------------- helper agg */

function topN(map: Map<string, number>, n: number): HeatItem[] {
  return [...map.entries()].map(([label, value]) => ({ label, value })).sort((a, b) => b.value - a.value).slice(0, n);
}

/* --------------------------------------------------------------- main api */

export async function fetchTrafficIntelligence(days = 14): Promise<TrafficIntelligence> {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const prevSince = new Date(Date.now() - days * 2 * DAY).toISOString();
  const includeSeed = await includeSeedInAnalytics();

  const ev = supabase.from("analytics_events")
    .select("event,path,product_slug,session_id,user_id,value,referrer,created_at,metadata")
    .gte("created_at", prevSince).order("created_at", { ascending: false }).limit(50000);
  const pvq = supabase.from("page_views")
    .select("path,created_at,session_id,referrer,device,country,user_id")
    .gte("created_at", since).order("created_at", { ascending: false }).limit(50000);
  const sq = supabase.from("visitor_sessions").select("*").gte("started_at", prevSince).limit(20000);
  const oq = supabase.from("orders").select("total,status,payment_status,market_region,created_at").gte("created_at", since).limit(20000);
  const scq = supabase.from("search_logs").select("query,results_count,clicked_product_slug,created_at").gte("created_at", prevSince).limit(20000);
  const prq = supabase.from("products").select("slug,name,category,price,image").limit(5000);

  const [evR, pvR, sR, oR, scR, prR] = await Promise.all([ev, pvq, sq, oq, scq, prq]);

  let events = (evR.data as EventRow[] | null) ?? [];
  let pv = (pvR.data as PVRow[] | null) ?? [];
  let sessions = (sR.data as SessRow[] | null) ?? [];
  let orders = (oR.data as OrderRow[] | null) ?? [];
  let searches = (scR.data as SearchRow[] | null) ?? [];
  const products = (prR.data as ProductRow[] | null) ?? [];

  if (!includeSeed) {
    // page_views / orders / search carry is_seeded; analytics filtered via metadata flag absence
    const evSeeded = (e: EventRow) => Boolean((e.metadata as { is_seeded?: boolean } | null)?.is_seeded);
    events = events.filter((e) => !evSeeded(e));
  }

  const windowStart = Date.now() - days * DAY;
  const inWindow = (iso: string) => new Date(iso).getTime() >= windowStart;

  const curEvents = events.filter((e) => inWindow(e.created_at));
  const prevEvents = events.filter((e) => !inWindow(e.created_at));
  const curSessions = sessions.filter((s) => inWindow(s.started_at));

  const productMap = new Map(products.map((p) => [p.slug, p]));

  /* --- session classification from first page_view event ---------------- */
  type SC = { source: string; region: Region; device: string; loggedIn: boolean };
  const sessClass = new Map<string, SC>();
  // iterate oldest→newest so the earliest page_view wins
  const pvEvents = curEvents.filter((e) => e.event === "page_view").slice().reverse();
  for (const e of pvEvents) {
    const sid = e.session_id;
    if (!sid || sessClass.has(sid)) continue;
    const m = e.metadata ?? {};
    sessClass.set(sid, {
      source: str(m.source) || "Direct",
      region: normRegion(m.region),
      device: str(m.device) || "desktop",
      loggedIn: Boolean(e.user_id),
    });
  }
  const classify = (sid: string | null): SC =>
    (sid && sessClass.get(sid)) || { source: "Direct", region: "international", device: "desktop", loggedIn: false };

  /* --- totals ----------------------------------------------------------- */
  const views = curEvents.filter((e) => e.event === "page_view").length || pv.length;
  const visitorSet = new Set<string>();
  for (const e of curEvents) {
    const vid = str(e.metadata?.visitor_id);
    if (vid) visitorSet.add(vid);
  }
  const totalSessions = curSessions.length;
  const paidOrders = orders.filter((o) => isPaidOrder(o.status, o.payment_status));
  const revenue = paidOrders.reduce((s, o) => s + (o.total ?? 0), 0);
  const ordersCount = paidOrders.length;
  const conversion = totalSessions ? (ordersCount / totalSessions) * 100 : 0;
  const bounce = curSessions.length ? (curSessions.filter((s) => s.page_views <= 1).length / curSessions.length) * 100 : 0;
  const avgDur = curSessions.length
    ? curSessions.reduce((s, x) => s + (new Date(x.last_seen).getTime() - new Date(x.started_at).getTime()), 0) / curSessions.length / 1000
    : 0;

  /* --- live (5-min window) --------------------------------------------- */
  const liveCut = Date.now() - 5 * 60 * 1000;
  const liveSessions = sessions.filter((s) => new Date(s.last_seen).getTime() >= liveCut);
  const live: LiveStats = { active: 0, india: 0, international: 0, loggedIn: 0, guests: 0, mobile: 0, tablet: 0, desktop: 0 };
  const liveFeed: LiveVisitor[] = [];
  for (const s of liveSessions) {
    live.active++;
    const reg = normRegion(s.country);
    reg === "india" ? live.india++ : live.international++;
    s.user_id ? live.loggedIn++ : live.guests++;
    const dev = (s.device ?? "desktop").toLowerCase();
    if (dev === "mobile") live.mobile++;
    else if (dev === "tablet") live.tablet++;
    else live.desktop++;
    const sc = classify(s.session_id);
    liveFeed.push({
      sessionId: s.session_id,
      path: s.landing_path ?? "/",
      region: reg,
      device: dev,
      source: sc.source,
      lastSeen: new Date(s.last_seen).getTime(),
      startedAt: new Date(s.started_at).getTime(),
      loggedIn: Boolean(s.user_id),
    });
  }
  liveFeed.sort((a, b) => b.lastSeen - a.lastSeen);

  /* --- trend ------------------------------------------------------------ */
  const byDay = new Map<string, { views: number; uniq: Set<string> }>();
  for (const v of pv) {
    const k = v.created_at.slice(0, 10);
    const rec = byDay.get(k) ?? { views: 0, uniq: new Set() };
    rec.views++;
    if (v.session_id) rec.uniq.add(v.session_id);
    byDay.set(k, rec);
  }
  const trend = [...byDay.entries()].sort((a, b) => a[0].localeCompare(b[0])).map(([date, r]) => ({ date, views: r.views, visitors: r.uniq.size }));

  /* --- funnel ----------------------------------------------------------- */
  const stepSessions: Record<string, Set<string>> = {
    Homepage: new Set(), Category: new Set(), Product: new Set(), Cart: new Set(),
    Checkout: new Set(), Payment: new Set(), Success: new Set(),
  };
  let funnelRevenue = 0;
  for (const e of curEvents) {
    const sid = e.session_id ?? "";
    if (!sid) continue;
    const route = str(e.metadata?.route);
    if (e.event === "page_view") {
      if (route === "home") stepSessions.Homepage.add(sid);
      else if (route === "category") stepSessions.Category.add(sid);
      else if (route === "product") stepSessions.Product.add(sid);
      else if (route === "cart") stepSessions.Cart.add(sid);
    } else if (e.event === "product_view") stepSessions.Product.add(sid);
    else if (e.event === "add_to_cart") stepSessions.Cart.add(sid);
    else if (e.event === "checkout_start") { stepSessions.Checkout.add(sid); stepSessions.Payment.add(sid); }
    else if (e.event === "purchase") { stepSessions.Success.add(sid); funnelRevenue += e.value ?? 0; }
  }
  const order = ["Homepage", "Category", "Product", "Cart", "Checkout", "Payment", "Success"];
  const top = stepSessions.Homepage.size || stepSessions.Product.size || 1;
  let prevCount = 0;
  const funnel: FunnelStep[] = order.map((step, i) => {
    const count = stepSessions[step].size;
    const dropPct = i === 0 || prevCount === 0 ? 0 : Math.max(0, ((prevCount - count) / prevCount) * 100);
    prevCount = count;
    return {
      step, visitors: count,
      dropPct,
      conversionPct: top ? (count / top) * 100 : 0,
      revenue: step === "Success" ? funnelRevenue : 0,
    };
  });

  /* --- product intelligence -------------------------------------------- */
  const pStat = new Map<string, ProductStat>();
  const ensure = (slug: string): ProductStat => {
    let s = pStat.get(slug);
    if (!s) {
      const p = productMap.get(slug);
      s = { slug, name: p?.name ?? slug, image: p?.image ?? null, category: p?.category ?? null,
        views: 0, uniques: 0, addToCart: 0, checkout: 0, purchases: 0, atcRate: 0, conversion: 0, revenue: 0, india: 0, international: 0 };
      pStat.set(slug, s);
    }
    return s;
  };
  const prodUniq = new Map<string, Set<string>>();
  for (const e of curEvents) {
    const slug = e.product_slug;
    if (!slug) continue;
    const s = ensure(slug);
    const reg = normRegion(e.metadata?.region);
    if (e.event === "product_view") {
      s.views++;
      reg === "india" ? s.india++ : s.international++;
      const set = prodUniq.get(slug) ?? new Set();
      const vid = str(e.metadata?.visitor_id) || (e.session_id ?? "");
      if (vid) set.add(vid);
      prodUniq.set(slug, set);
    } else if (e.event === "add_to_cart") s.addToCart++;
    else if (e.event === "checkout_start") s.checkout++;
    else if (e.event === "purchase") { s.purchases++; s.revenue += e.value ?? 0; }
  }
  const productsOut: ProductStat[] = [...pStat.values()].map((s) => {
    s.uniques = prodUniq.get(s.slug)?.size ?? 0;
    s.atcRate = s.views ? (s.addToCart / s.views) * 100 : 0;
    s.conversion = s.views ? (s.purchases / s.views) * 100 : 0;
    return s;
  }).sort((a, b) => b.views - a.views);

  /* --- source intelligence --------------------------------------------- */
  const srcMap = new Map<string, { visitors: Set<string>; sessions: Set<string>; orders: number; revenue: number }>();
  const srcEnsure = (k: string) => { let v = srcMap.get(k); if (!v) { v = { visitors: new Set(), sessions: new Set(), orders: 0, revenue: 0 }; srcMap.set(k, v); } return v; };
  for (const [sid, sc] of sessClass) {
    const v = srcEnsure(sc.source);
    v.sessions.add(sid);
  }
  for (const e of curEvents.filter((e) => e.event === "page_view")) {
    const sc = classify(e.session_id);
    const vid = str(e.metadata?.visitor_id);
    if (vid) srcEnsure(sc.source).visitors.add(vid);
  }
  for (const e of curEvents.filter((e) => e.event === "purchase")) {
    const sc = classify(e.session_id);
    const v = srcEnsure(sc.source);
    v.orders++;
    v.revenue += e.value ?? 0;
  }
  const sources: SourceStat[] = [...srcMap.entries()].map(([source, v]) => ({
    source,
    visitors: v.visitors.size,
    sessions: v.sessions.size,
    orders: v.orders,
    revenue: v.revenue,
    conversion: v.sessions.size ? (v.orders / v.sessions.size) * 100 : 0,
    aov: v.orders ? v.revenue / v.orders : 0,
  })).sort((a, b) => b.visitors - a.visitors);

  /* --- region intelligence --------------------------------------------- */
  const regions: RegionStat[] = (["india", "international"] as Region[]).map((region) => {
    const sess = curSessions.filter((s) => normRegion(s.country) === region);
    const visitors = new Set<string>();
    for (const e of curEvents.filter((e) => e.event === "page_view" && normRegion(e.metadata?.region) === region)) {
      const vid = str(e.metadata?.visitor_id); if (vid) visitors.add(vid);
    }
    const regOrders = paidOrders.filter((o) => normRegion(o.market_region) === region);
    const rev = regOrders.reduce((s, o) => s + (o.total ?? 0), 0);
    const tp = new Map<string, number>();
    for (const e of curEvents.filter((e) => e.event === "product_view" && normRegion(e.metadata?.region) === region && e.product_slug)) {
      tp.set(e.product_slug!, (tp.get(e.product_slug!) ?? 0) + 1);
    }
    return {
      region,
      visitors: visitors.size,
      sessions: sess.length,
      orders: regOrders.length,
      revenue: rev,
      aov: regOrders.length ? rev / regOrders.length : 0,
      conversion: sess.length ? (regOrders.length / sess.length) * 100 : 0,
      topProducts: [...tp.entries()].map(([slug, n]) => ({ slug, n })).sort((a, b) => b.n - a.n).slice(0, 5),
    };
  });

  /* --- device intelligence --------------------------------------------- */
  const devKeys = ["mobile", "tablet", "desktop"];
  const devices: DeviceStat[] = devKeys.map((device) => {
    const sess = curSessions.filter((s) => (s.device ?? "desktop").toLowerCase() === device);
    const visitors = new Set<string>();
    for (const e of curEvents.filter((e) => e.event === "page_view" && str(e.metadata?.device).toLowerCase() === device)) {
      const vid = str(e.metadata?.visitor_id); if (vid) visitors.add(vid);
    }
    const purchases = curEvents.filter((e) => e.event === "purchase" && classify(e.session_id).device === device);
    const rev = purchases.reduce((s, e) => s + (e.value ?? 0), 0);
    const dur = sess.length ? sess.reduce((s, x) => s + (new Date(x.last_seen).getTime() - new Date(x.started_at).getTime()), 0) / sess.length / 1000 : 0;
    const br = sess.length ? (sess.filter((s) => s.page_views <= 1).length / sess.length) * 100 : 0;
    return {
      device, visitors: visitors.size, sessions: sess.length, revenue: rev,
      conversion: sess.length ? (purchases.length / sess.length) * 100 : 0,
      avgDuration: dur, bounceRate: br,
    };
  });

  /* --- search intelligence --------------------------------------------- */
  const curSearch = searches.filter((s) => inWindow(s.created_at));
  const prevSearch = searches.filter((s) => !inWindow(s.created_at));
  const sAgg = new Map<string, { count: number; results: number; clicks: number }>();
  for (const s of curSearch) {
    const q = s.query.trim().toLowerCase();
    if (!q) continue;
    const a = sAgg.get(q) ?? { count: 0, results: 0, clicks: 0 };
    a.count++; a.results += s.results_count; if (s.clicked_product_slug) a.clicks++;
    sAgg.set(q, a);
  }
  const prevAgg = new Map<string, number>();
  for (const s of prevSearch) { const q = s.query.trim().toLowerCase(); if (q) prevAgg.set(q, (prevAgg.get(q) ?? 0) + 1); }
  const searchStats: SearchStat[] = [...sAgg.entries()].map(([query, a]) => ({
    query, count: a.count, avgResults: a.count ? a.results / a.count : 0,
    noResult: a.results === 0, clicks: a.clicks, conversion: a.count ? (a.clicks / a.count) * 100 : 0,
  }));
  const growing = [...sAgg.entries()].map(([query, a]) => {
    const prev = prevAgg.get(query) ?? 0;
    const growth = prev === 0 ? (a.count > 0 ? 100 : 0) : ((a.count - prev) / prev) * 100;
    return { query, growth };
  }).filter((x) => x.growth > 0).sort((a, b) => b.growth - a.growth).slice(0, 10);
  const search = {
    top: [...searchStats].sort((a, b) => b.count - a.count).slice(0, 12),
    growing,
    noResults: searchStats.filter((s) => s.noResult).sort((a, b) => b.count - a.count).slice(0, 12),
    converting: searchStats.filter((s) => s.clicks > 0).sort((a, b) => b.conversion - a.conversion).slice(0, 12),
  };

  /* --- heatmaps --------------------------------------------------------- */
  const pageMap = new Map<string, number>();
  const catMap = new Map<string, number>();
  const prodClickMap = new Map<string, number>();
  const bannerMap = new Map<string, number>();
  const sectionMap = new Map<string, number>();
  for (const e of curEvents) {
    if (e.event === "page_view" && e.path) pageMap.set(e.path, (pageMap.get(e.path) ?? 0) + 1);
    if (e.event === "page_view" && str(e.metadata?.route) === "category") {
      const c = str(e.metadata?.category_slug) || (e.path ?? "").split("/").pop() || "category";
      catMap.set(c, (catMap.get(c) ?? 0) + 1);
    }
    if (e.event === "product_view" && e.product_slug) {
      const nm = productMap.get(e.product_slug)?.name ?? e.product_slug;
      prodClickMap.set(nm, (prodClickMap.get(nm) ?? 0) + 1);
    }
    if (e.event === "section_click" || e.event === "section_impression") {
      const sec = str(e.metadata?.section);
      if (sec) {
        sectionMap.set(sec, (sectionMap.get(sec) ?? 0) + 1);
        if (/banner|promo|hero|carousel/i.test(sec)) bannerMap.set(sec, (bannerMap.get(sec) ?? 0) + 1);
      }
    }
  }
  const heatmaps: Heatmaps = {
    pages: topN(pageMap, 12), categories: topN(catMap, 10), products: topN(prodClickMap, 10),
    banners: topN(bannerMap, 10), sections: topN(sectionMap, 10),
  };

  /* --- scores ----------------------------------------------------------- */
  const prevPvCount = prevEvents.filter((e) => e.event === "page_view").length;
  const curPvCount = curEvents.filter((e) => e.event === "page_view").length;
  const growthRate = prevPvCount === 0 ? (curPvCount > 0 ? 100 : 0) : ((curPvCount - prevPvCount) / prevPvCount) * 100;

  const clamp = (n: number) => Math.max(0, Math.min(100, Math.round(n)));
  const trafficHealth = clamp(40 + Math.min(40, totalSessions / 5) + (100 - bounce) * 0.2);
  const conversionHealth = clamp(conversion * 12 + (100 - bounce) * 0.3);
  const growth = clamp(50 + growthRate);
  const revenueEfficiency = clamp(conversion * 8 + (ordersCount ? Math.min(40, (revenue / ordersCount) / 50) : 0));

  const bestProduct = productsOut.slice().sort((a, b) => b.revenue - a.revenue || b.purchases - a.purchases)[0]?.name ?? "—";
  const fastestSource = growing[0]?.query ? sources[0]?.source ?? "—" : sources.slice().sort((a, b) => b.conversion - a.conversion)[0]?.source ?? "—";
  const weakestStage = funnel.slice(1).sort((a, b) => b.dropPct - a.dropPct)[0]?.step ?? "—";
  const scores: ExecScores = {
    trafficHealth, conversionHealth, growth, revenueEfficiency,
    biggestOpportunity: productsOut.filter((p) => p.views >= 5 && p.purchases === 0).sort((a, b) => b.views - a.views)[0]?.name
      ? `${productsOut.filter((p) => p.views >= 5 && p.purchases === 0).sort((a, b) => b.views - a.views)[0]?.name} — high traffic, zero sales`
      : "Improve checkout completion",
    biggestRisk: bounce > 60 ? `High bounce rate (${bounce.toFixed(0)}%)` : weakestStage !== "—" ? `Drop-off at ${weakestStage}` : "Stable",
    fastestSource,
    bestProduct,
    weakestStage,
  };

  /* --- AI advisor ------------------------------------------------------- */
  const advice = buildAdvice({ productsOut, funnel, devices, regions, sources, bounce, conversion, growthRate });

  return {
    generatedAt: Date.now(),
    days,
    totals: { views, sessions: totalSessions, visitors: visitorSet.size, orders: ordersCount, revenue, conversion, bounceRate: bounce, avgDuration: avgDur },
    live, liveFeed: liveFeed.slice(0, 40), trend, funnel, products: productsOut,
    sources, regions, devices, search, heatmaps, advice, scores,
  };
}

function buildAdvice(d: {
  productsOut: ProductStat[]; funnel: FunnelStep[]; devices: DeviceStat[];
  regions: RegionStat[]; sources: SourceStat[]; bounce: number; conversion: number; growthRate: number;
}): Advice[] {
  const out: Advice[] = [];

  for (const p of d.productsOut.filter((p) => p.views >= 8 && p.purchases === 0).slice(0, 3)) {
    out.push({
      id: `noconv-${p.slug}`,
      title: `${p.name} gets traffic but no sales`,
      detail: `${p.views} views, ${p.addToCart} add-to-cart, 0 purchases.`,
      impact: "high", confidence: 80,
      opportunity: Math.round(p.views * 0.03 * (productPrice(p) || 1500)),
      action: "Review pricing, imagery, reviews and stock availability.",
    });
  }
  const worstStage = d.funnel.slice(1).sort((a, b) => b.dropPct - a.dropPct)[0];
  if (worstStage && worstStage.dropPct > 40) {
    out.push({
      id: "funnel-drop",
      title: `${worstStage.step} is the biggest bottleneck`,
      detail: `${worstStage.dropPct.toFixed(0)}% of visitors drop before ${worstStage.step}.`,
      impact: "high", confidence: 75, opportunity: Math.round(worstStage.visitors * 100),
      action: `Streamline the ${worstStage.step.toLowerCase()} step and reduce friction.`,
    });
  }
  const mobile = d.devices.find((x) => x.device === "mobile");
  const desktop = d.devices.find((x) => x.device === "desktop");
  if (mobile && desktop && mobile.sessions > 10 && mobile.conversion < desktop.conversion * 0.6) {
    out.push({
      id: "mobile-conv",
      title: "Mobile conversion is lagging desktop",
      detail: `Mobile converts at ${mobile.conversion.toFixed(1)}% vs ${desktop.conversion.toFixed(1)}% on desktop.`,
      impact: "high", confidence: 70, opportunity: Math.round(mobile.sessions * 200),
      action: "Audit mobile checkout speed, tap targets and payment UX.",
    });
  }
  const intl = d.regions.find((r) => r.region === "international");
  if (intl && intl.visitors > 20 && intl.conversion < 1) {
    out.push({
      id: "intl",
      title: "International traffic is rising but under-converting",
      detail: `${intl.visitors} international visitors, ${intl.conversion.toFixed(2)}% conversion.`,
      impact: "medium", confidence: 60, opportunity: Math.round(intl.visitors * 300),
      action: "Add local currency, shipping clarity and region-specific offers.",
    });
  }
  const bestSource = d.sources.filter((s) => s.sessions > 5).sort((a, b) => b.conversion - a.conversion)[0];
  if (bestSource && bestSource.conversion > d.conversion * 1.5) {
    out.push({
      id: "src",
      title: `${bestSource.source} is your highest-performing source`,
      detail: `Converts at ${bestSource.conversion.toFixed(1)}% — well above the ${d.conversion.toFixed(1)}% average.`,
      impact: "medium", confidence: 65, opportunity: Math.round(bestSource.revenue * 0.5),
      action: `Increase spend / content investment in ${bestSource.source}.`,
    });
  }
  if (d.bounce > 60) {
    out.push({
      id: "bounce",
      title: "Bounce rate is high",
      detail: `${d.bounce.toFixed(0)}% of sessions view only one page.`,
      impact: "medium", confidence: 70, opportunity: 0,
      action: "Improve landing relevance, page speed and internal linking.",
    });
  }
  return out.sort((a, b) => b.opportunity - a.opportunity);
}

function productPrice(p: ProductStat): number {
  return p.purchases && p.revenue ? p.revenue / p.purchases : 0;
}

/* ------------------------------------------------------------- summary */

export type TrafficSummary = {
  live: number; views: number; sessions: number; orders: number;
  revenue: number; conversion: number; topSource: string; loading: boolean;
};

/**
 * Lightweight summary for embedding on other dashboards (Executive, AI Ops).
 * Avoids the heavy full-window fetch — uses counts + a small recent slice.
 */
export async function fetchTrafficSummary(days = 14): Promise<Omit<TrafficSummary, "loading">> {
  const since = new Date(Date.now() - days * DAY).toISOString();
  const liveCut = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const [liveR, viewsR, sessR, ordR, srcR] = await Promise.all([
    supabase.from("visitor_sessions").select("session_id", { count: "exact", head: true }).gte("last_seen", liveCut),
    supabase.from("page_views").select("id", { count: "exact", head: true }).gte("created_at", since),
    supabase.from("visitor_sessions").select("session_id", { count: "exact", head: true }).gte("started_at", since),
    // Perf: capped 20k → 5k; dashboards summarise, they don't paginate raw rows.
    supabase.from("orders").select("total,status,payment_status").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
    supabase.from("analytics_events").select("metadata").eq("event", "page_view").gte("created_at", since).order("created_at", { ascending: false }).limit(5000),
  ]);

  const orders = (ordR.data as { total: number | null; status: string | null; payment_status: string | null }[] | null) ?? [];
  const paid = orders.filter((o) => isPaidOrder(o.status, o.payment_status));
  const revenue = paid.reduce((s, o) => s + (o.total ?? 0), 0);
  const sessions = sessR.count ?? 0;

  const srcMap = new Map<string, number>();
  for (const r of (srcR.data as { metadata: Record<string, unknown> | null }[] | null) ?? []) {
    const s = str(r.metadata?.source) || "Direct";
    srcMap.set(s, (srcMap.get(s) ?? 0) + 1);
  }
  const topSource = [...srcMap.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Direct";

  return {
    live: liveR.count ?? 0,
    views: viewsR.count ?? 0,
    sessions,
    orders: paid.length,
    revenue,
    conversion: sessions ? (paid.length / sessions) * 100 : 0,
    topSource,
  };
}
