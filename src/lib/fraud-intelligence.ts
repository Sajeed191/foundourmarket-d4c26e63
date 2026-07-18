import { supabase } from "@/integrations/supabase/client";
import { includeSeedInAnalytics } from "@/lib/seed-filter";

/**
 * Fraud & Security Intelligence Engine.
 *
 * Every signal is derived from REAL database records — profiles, orders,
 * payments, refunds, returns, promo_codes and analytics_events. No simulated
 * fraud is ever produced. Signals are deterministic and keyed so they can be
 * synced to the `fraud_alerts` table (realtime + audited + de-duplicated).
 */

const DAY = 86_400_000;
const now = () => Date.now();

export type FraudType =
  | "vpn_abuse"
  | "multi_account"
  | "fake_orders"
  | "cod_abuse"
  | "refund_abuse"
  | "coupon_abuse"
  | "suspicious_login"
  | "region_bypass";

export type Severity = "critical" | "high" | "medium" | "low";

export const SEVERITY_RANK: Record<Severity, number> = { critical: 0, high: 1, medium: 2, low: 3 };

export const FRAUD_META: Record<FraudType, { label: string; tone: string; dot: string }> = {
  vpn_abuse:        { label: "VPN / Proxy Abuse",       tone: "text-violet-300 border-violet-400/30 bg-violet-400/10", dot: "bg-violet-400" },
  multi_account:    { label: "Multiple Accounts",       tone: "text-amber-300 border-amber-400/30 bg-amber-400/10",   dot: "bg-amber-400" },
  fake_orders:      { label: "Fake Orders",             tone: "text-rose-300 border-rose-400/30 bg-rose-400/10",      dot: "bg-rose-400" },
  cod_abuse:        { label: "COD Abuse",               tone: "text-orange-300 border-orange-400/30 bg-orange-400/10", dot: "bg-orange-400" },
  refund_abuse:     { label: "Refund Abuse",            tone: "text-pink-300 border-pink-400/30 bg-pink-400/10",      dot: "bg-pink-400" },
  coupon_abuse:     { label: "Coupon Abuse",            tone: "text-teal-300 border-teal-400/30 bg-teal-400/10",      dot: "bg-teal-400" },
  suspicious_login: { label: "Suspicious Login",        tone: "text-sky-300 border-sky-400/30 bg-sky-400/10",         dot: "bg-sky-400" },
  region_bypass:    { label: "Region Bypass",           tone: "text-fuchsia-300 border-fuchsia-400/30 bg-fuchsia-400/10", dot: "bg-fuchsia-400" },
};

export const SEVERITY_META: Record<Severity, { label: string; tone: string }> = {
  critical: { label: "Critical", tone: "text-rose-300 border-rose-400/40 bg-rose-400/10" },
  high:     { label: "High",     tone: "text-amber-300 border-amber-400/40 bg-amber-400/10" },
  medium:   { label: "Medium",   tone: "text-accent border-accent/40 bg-accent/10" },
  low:      { label: "Low",      tone: "text-muted-foreground border-border bg-white/5" },
};

/* --------------------------------------------------------------- raw data */

export type FProfile = {
  id: string;
  full_name: string | null;
  phone: string | null;
  country: string | null;
  country_code: string | null;
  market_region: string | null;
  region_locked_at: string | null;
  created_at: string;
};

export type FOrder = {
  id: string;
  user_id: string | null;
  status: string;
  payment_status: string;
  payment_method: string | null;
  market_region: string | null;
  total: number | null;
  promo_code: string | null;
  contact_email: string | null;
  shipping_address: Record<string, unknown> | null;
  created_at: string;
};

export type FRefund = { order_id: string; amount: number | null; status: string };
export type FReturn = { user_id: string | null; status: string };
export type FEvent = { user_id: string | null; session_id: string | null; event: string; path: string | null; metadata: Record<string, unknown> | null; created_at: string };

export type FraudData = {
  profiles: FProfile[];
  orders: FOrder[];
  refunds: FRefund[];
  returns: FReturn[];
  events: FEvent[];
};

export async function fetchFraudData(): Promise<FraudData> {
  const includeSeed = await includeSeedInAnalytics();
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const seedFilter = (q: any) => (includeSeed ? q : q.eq("is_seeded", false));
  const since = new Date(now() - 90 * DAY).toISOString();

  const [profilesR, ordersR, refundsR, returnsR, eventsR] = await Promise.all([
    seedFilter(supabase.from("profiles").select("id,full_name,phone,country,country_code,market_region,region_locked_at,created_at").limit(20000)),
    seedFilter(supabase.from("orders").select("id,user_id,status,payment_status,payment_method,market_region,total,promo_code,contact_email,shipping_address,created_at").order("created_at", { ascending: false }).limit(50000)),
    supabase.from("refunds").select("order_id,amount,status").limit(50000),
    seedFilter(supabase.from("returns").select("user_id,status").limit(50000)),
    // Perf: capped from 80k → 10k. Fraud signals key on recency + patterns,
    // not exhaustive history; the 90-day window is preserved.
    seedFilter(supabase.from("analytics_events").select("user_id,session_id,event,path,metadata,created_at").gte("created_at", since).order("created_at", { ascending: false }).limit(10000)),
  ]);

  return {
    profiles: (profilesR.data as FProfile[]) ?? [],
    orders: (ordersR.data as FOrder[]) ?? [],
    refunds: (refundsR.data as FRefund[]) ?? [],
    returns: (returnsR.data as FReturn[]) ?? [],
    events: (eventsR.data as FEvent[]) ?? [],
  };
}

/* ----------------------------------------------------------------- signals */

export type FraudSignal = {
  /** deterministic, stable across reloads — used as DB signal_key */
  key: string;
  type: FraudType;
  severity: Severity;
  score: number; // 0..100 contribution
  subjectType: "customer" | "order" | "promo";
  subjectId: string;
  subjectLabel: string;
  title: string;
  detail: string;
  evidence: Record<string, unknown>;
};

const PAID = new Set(["paid", "captured", "succeeded", "completed"]);
const isPaid = (o: FOrder) =>
  PAID.has((o.payment_status ?? "").toLowerCase()) ||
  ["delivered", "shipped", "processing", "completed", "paid"].includes((o.status ?? "").toLowerCase());
const isCancelled = (o: FOrder) =>
  ["cancelled", "canceled", "failed", "expired", "voided"].includes((o.status ?? "").toLowerCase()) ||
  ["failed", "cancelled", "canceled", "expired"].includes((o.payment_status ?? "").toLowerCase());
const isCOD = (o: FOrder) => {
  const m = (o.payment_method ?? "").toLowerCase();
  return m.includes("cod") || m.includes("cash");
};

function sev(score: number): Severity {
  if (score >= 80) return "critical";
  if (score >= 55) return "high";
  if (score >= 30) return "medium";
  return "low";
}

function addrKey(a: Record<string, unknown> | null): string | null {
  if (!a) return null;
  const parts = ["line1", "address", "street", "pincode", "postal_code", "zip", "city"]
    .map((k) => String((a as Record<string, unknown>)[k] ?? "").trim().toLowerCase())
    .filter(Boolean);
  return parts.length ? parts.join("|") : null;
}

const nameFor = (p: FProfile | undefined, id: string) =>
  p?.full_name?.trim() || p?.phone || id.slice(0, 8);

/**
 * Build all fraud signals from real data. Deterministic & keyed.
 */
export function buildFraudSignals(data: FraudData): FraudSignal[] {
  const { profiles, orders, refunds, returns, events } = data;
  const out: FraudSignal[] = [];
  const profById = new Map(profiles.map((p) => [p.id, p]));

  const ordersByUser = new Map<string, FOrder[]>();
  for (const o of orders) {
    if (!o.user_id) continue;
    const arr = ordersByUser.get(o.user_id) ?? [];
    arr.push(o);
    ordersByUser.set(o.user_id, arr);
  }

  const refundByOrder = new Map(refunds.map((r) => [r.order_id, r]));
  const orderById = new Map(orders.map((o) => [o.id, o]));

  const returnsByUser = new Map<string, number>();
  for (const r of returns) {
    if (!r.user_id) continue;
    returnsByUser.set(r.user_id, (returnsByUser.get(r.user_id) ?? 0) + 1);
  }

  /* ---- 1. Multiple account creation: shared phone / shared address ---- */
  const phoneToUsers = new Map<string, Set<string>>();
  for (const p of profiles) {
    const ph = (p.phone ?? "").replace(/\D/g, "");
    if (ph.length >= 7) {
      const s = phoneToUsers.get(ph) ?? new Set();
      s.add(p.id);
      phoneToUsers.set(ph, s);
    }
  }
  const addrToUsers = new Map<string, Set<string>>();
  for (const o of orders) {
    if (!o.user_id) continue;
    const k = addrKey(o.shipping_address);
    if (!k) continue;
    const s = addrToUsers.get(k) ?? new Set();
    s.add(o.user_id);
    addrToUsers.set(k, s);
  }
  for (const [ph, users] of phoneToUsers) {
    if (users.size < 2) continue;
    const ids = [...users];
    const score = Math.min(100, 40 + users.size * 12);
    out.push({
      key: `multi_account:phone:${ph}`,
      type: "multi_account",
      severity: sev(score),
      score,
      subjectType: "customer",
      subjectId: ids[0],
      subjectLabel: nameFor(profById.get(ids[0]), ids[0]),
      title: `${users.size} accounts share one phone number`,
      detail: `The same phone number is linked to ${users.size} different accounts — a common signal for duplicate-account abuse.`,
      evidence: { phone_hash: ph, account_count: users.size, account_ids: ids.slice(0, 20) },
    });
  }
  for (const [k, users] of addrToUsers) {
    if (users.size < 3) continue;
    const ids = [...users];
    const score = Math.min(100, 35 + users.size * 10);
    out.push({
      key: `multi_account:addr:${k.slice(0, 40)}`,
      type: "multi_account",
      severity: sev(score),
      score,
      subjectType: "customer",
      subjectId: ids[0],
      subjectLabel: nameFor(profById.get(ids[0]), ids[0]),
      title: `${users.size} accounts ship to one address`,
      detail: `${users.size} accounts are sending orders to the same shipping address.`,
      evidence: { account_count: users.size, account_ids: ids.slice(0, 20) },
    });
  }

  /* ---- 2. Per-customer behavioural signals ---- */
  for (const [uid, uOrders] of ordersByUser) {
    const p = profById.get(uid);
    const label = nameFor(p, uid);
    const total = uOrders.length;
    const paid = uOrders.filter(isPaid).length;
    const cancelled = uOrders.filter(isCancelled).length;
    const cod = uOrders.filter(isCOD);
    const codCancelled = cod.filter(isCancelled).length;
    const refundsForUser = uOrders.filter((o) => {
      const r = refundByOrder.get(o.id);
      return r && (r.status ?? "").toLowerCase() !== "failed";
    }).length;
    const userReturns = returnsByUser.get(uid) ?? 0;
    const couponOrders = uOrders.filter((o) => (o.promo_code ?? "").trim()).length;

    /* Fake orders: many orders, almost none paid */
    if (total >= 4 && paid / total <= 0.2) {
      const score = Math.min(100, 45 + (total - paid) * 8);
      out.push({
        key: `fake_orders:${uid}`,
        type: "fake_orders",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: uid,
        subjectLabel: label,
        title: `${total - paid} of ${total} orders never completed`,
        detail: `This account places orders that are repeatedly abandoned, cancelled or never paid.`,
        evidence: { total_orders: total, paid, cancelled },
      });
    }

    /* COD abuse: repeated COD orders cancelled / returned */
    if (cod.length >= 3 && (codCancelled + userReturns) / cod.length >= 0.4) {
      const score = Math.min(100, 40 + (codCancelled + userReturns) * 9);
      out.push({
        key: `cod_abuse:${uid}`,
        type: "cod_abuse",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: uid,
        subjectLabel: label,
        title: `High COD failure rate (${codCancelled + userReturns}/${cod.length})`,
        detail: `Cash-on-delivery orders from this account are frequently refused, cancelled or returned.`,
        evidence: { cod_orders: cod.length, cod_cancelled: codCancelled, returns: userReturns },
      });
    }

    /* Refund abuse */
    if (paid >= 3 && refundsForUser / Math.max(1, paid) >= 0.5) {
      const score = Math.min(100, 35 + refundsForUser * 12);
      out.push({
        key: `refund_abuse:${uid}`,
        type: "refund_abuse",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: uid,
        subjectLabel: label,
        title: `${refundsForUser} refunds across ${paid} paid orders`,
        detail: `An unusually high share of this account's orders end in refunds.`,
        evidence: { paid_orders: paid, refunds: refundsForUser, returns: userReturns },
      });
    }

    /* Coupon abuse: heavy coupon usage by a single account */
    if (couponOrders >= 4 && couponOrders / total >= 0.7) {
      const score = Math.min(100, 30 + couponOrders * 7);
      out.push({
        key: `coupon_abuse:${uid}`,
        type: "coupon_abuse",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: uid,
        subjectLabel: label,
        title: `Coupon used on ${couponOrders} of ${total} orders`,
        detail: `This account relies on discount codes for nearly every order — possible coupon-stacking abuse.`,
        evidence: { coupon_orders: couponOrders, total_orders: total },
      });
    }

    /* Region bypass: locked to a region but ordering in another */
    if (p?.market_region) {
      const mismatched = uOrders.filter(
        (o) => o.market_region && o.market_region !== p.market_region,
      );
      if (mismatched.length >= 1 && p.region_locked_at) {
        const score = Math.min(100, 45 + mismatched.length * 10);
        out.push({
          key: `region_bypass:${uid}`,
          type: "region_bypass",
          severity: sev(score),
          score,
          subjectType: "customer",
          subjectId: uid,
          subjectLabel: label,
          title: `Ordering outside locked region (${mismatched.length}x)`,
          detail: `Account is locked to ${p.market_region} but placed orders in a different market region.`,
          evidence: { locked_region: p.market_region, mismatched: mismatched.length },
        });
      }
    }
  }

  /* ---- 3. Coupon abuse across accounts: same promo, many accounts ---- */
  const promoToUsers = new Map<string, Set<string>>();
  for (const o of orders) {
    const code = (o.promo_code ?? "").trim().toUpperCase();
    if (!code || !o.user_id) continue;
    const s = promoToUsers.get(code) ?? new Set();
    s.add(o.user_id);
    promoToUsers.set(code, s);
  }

  /* ---- 4. Suspicious login & VPN abuse from analytics_events ---- */
  // group events by user
  const sessionsByUser = new Map<string, Set<string>>();
  const regionsByUser = new Map<string, Set<string>>();
  const eventsByUser = new Map<string, number>();
  for (const e of events) {
    if (!e.user_id) continue;
    if (e.session_id) {
      const s = sessionsByUser.get(e.user_id) ?? new Set();
      s.add(e.session_id);
      sessionsByUser.set(e.user_id, s);
    }
    eventsByUser.set(e.user_id, (eventsByUser.get(e.user_id) ?? 0) + 1);
    const meta = e.metadata ?? {};
    const region = String(meta.country ?? meta.region ?? meta.geo ?? "").trim().toLowerCase();
    if (region) {
      const r = regionsByUser.get(e.user_id) ?? new Set();
      r.add(region);
      regionsByUser.set(e.user_id, r);
    }
    const vpn = meta.vpn === true || meta.proxy === true || String(meta.connection ?? "").toLowerCase().includes("vpn");
    if (vpn) {
      const p = profById.get(e.user_id);
      const score = 60;
      out.push({
        key: `vpn_abuse:${e.user_id}`,
        type: "vpn_abuse",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: e.user_id,
        subjectLabel: nameFor(p, e.user_id),
        title: `VPN / proxy connection detected`,
        detail: `Traffic from this account shows VPN or proxy characteristics, often used to mask location.`,
        evidence: { detected_at: e.created_at },
      });
    }
  }
  for (const [uid, sessions] of sessionsByUser) {
    if (sessions.size >= 8) {
      const p = profById.get(uid);
      const score = Math.min(100, 30 + sessions.size * 4);
      out.push({
        key: `suspicious_login:${uid}`,
        type: "suspicious_login",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: uid,
        subjectLabel: nameFor(p, uid),
        title: `${sessions.size} sessions from one account`,
        detail: `Unusually high number of distinct sessions — possible account sharing or credential abuse.`,
        evidence: { sessions: sessions.size },
      });
    }
  }
  for (const [uid, regions] of regionsByUser) {
    if (regions.size >= 3) {
      const p = profById.get(uid);
      const score = Math.min(100, 40 + regions.size * 8);
      out.push({
        key: `vpn_abuse:multi_region:${uid}`,
        type: "vpn_abuse",
        severity: sev(score),
        score,
        subjectType: "customer",
        subjectId: uid,
        subjectLabel: nameFor(p, uid),
        title: `Logins from ${regions.size} regions`,
        detail: `Account accessed from ${regions.size} distinct geographic regions — a common VPN / proxy abuse signal.`,
        evidence: { regions: [...regions].slice(0, 10) },
      });
    }
  }

  // sort by severity then score desc
  out.sort((a, b) => SEVERITY_RANK[a.severity] - SEVERITY_RANK[b.severity] || b.score - a.score);
  return out;
}

/* --------------------------------------------------------- risk profiles */

export type RiskProfile = {
  userId: string;
  label: string;
  region: string | null;
  riskScore: number; // 0..100
  severity: Severity;
  signals: FraudSignal[];
  types: FraudType[];
};

export function buildRiskProfiles(signals: FraudSignal[]): RiskProfile[] {
  const byUser = new Map<string, FraudSignal[]>();
  for (const s of signals) {
    if (s.subjectType !== "customer") continue;
    const arr = byUser.get(s.subjectId) ?? [];
    arr.push(s);
    byUser.set(s.subjectId, arr);
  }
  const profiles: RiskProfile[] = [];
  for (const [uid, sigs] of byUser) {
    // weighted: strongest signal + diminishing returns on the rest
    const sorted = [...sigs].sort((a, b) => b.score - a.score);
    let risk = sorted[0]?.score ?? 0;
    for (let i = 1; i < sorted.length; i++) risk += sorted[i].score * (0.35 / i);
    risk = Math.min(100, Math.round(risk));
    profiles.push({
      userId: uid,
      label: sigs[0].subjectLabel,
      region: null,
      riskScore: risk,
      severity: sev(risk),
      signals: sorted,
      types: [...new Set(sigs.map((s) => s.type))],
    });
  }
  profiles.sort((a, b) => b.riskScore - a.riskScore);
  return profiles;
}

/* --------------------------------------------------------------- summary */

export type FraudSummary = {
  totalSignals: number;
  critical: number;
  high: number;
  flaggedAccounts: number;
  byType: { type: FraudType; count: number; score: number }[];
  topRisk: RiskProfile[];
};

export function buildSummary(signals: FraudSignal[], profiles: RiskProfile[]): FraudSummary {
  const byTypeMap = new Map<FraudType, { count: number; score: number }>();
  for (const s of signals) {
    const e = byTypeMap.get(s.type) ?? { count: 0, score: 0 };
    e.count++;
    e.score += s.score;
    byTypeMap.set(s.type, e);
  }
  return {
    totalSignals: signals.length,
    critical: signals.filter((s) => s.severity === "critical").length,
    high: signals.filter((s) => s.severity === "high").length,
    flaggedAccounts: profiles.length,
    byType: [...byTypeMap.entries()]
      .map(([type, v]) => ({ type, count: v.count, score: Math.round(v.score / v.count) }))
      .sort((a, b) => b.count - a.count),
    topRisk: profiles.slice(0, 10),
  };
}

/* ------------------------------------------------- persistence / actions */

export type FraudAlertRow = {
  id: string;
  signal_key: string;
  fraud_type: string;
  severity: string;
  score: number;
  subject_type: string;
  subject_id: string | null;
  subject_label: string | null;
  title: string;
  detail: string | null;
  evidence: Record<string, unknown>;
  status: string;
  resolved_by: string | null;
  resolved_at: string | null;
  created_at: string;
  updated_at: string;
};

export type AccountLockRow = {
  id: string;
  user_id: string;
  locked: boolean;
  reason: string | null;
  severity: string;
  locked_by: string | null;
  unlocked_by: string | null;
  created_at: string;
  updated_at: string;
};

/**
 * Persist freshly computed signals into fraud_alerts (idempotent upsert by
 * signal_key). Only inserts/updates the security-relevant fields and never
 * overrides a human-set status on existing rows.
 */
export async function syncAlerts(signals: FraudSignal[], existing: FraudAlertRow[]): Promise<number> {
  const existingByKey = new Map(existing.map((a) => [a.signal_key, a]));
  const rows = signals.map((s) => {
    const prev = existingByKey.get(s.key);
    return {
      signal_key: s.key,
      fraud_type: s.type,
      severity: s.severity,
      score: s.score,
      subject_type: s.subjectType,
      subject_id: s.subjectId,
      subject_label: s.subjectLabel,
      title: s.title,
      detail: s.detail,
      evidence: s.evidence as never,
      // keep human-managed status; only re-open if previously auto and unchanged
      status: prev?.status ?? "open",
    };
  });
  if (!rows.length) return 0;
  const { error } = await supabase
    .from("fraud_alerts")
    .upsert(rows, { onConflict: "signal_key" });
  if (error) return 0;
  return rows.length;
}

export async function fetchAlerts(): Promise<FraudAlertRow[]> {
  const { data } = await supabase
    .from("fraud_alerts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(2000);
  return (data as FraudAlertRow[]) ?? [];
}

export async function fetchLocks(): Promise<AccountLockRow[]> {
  const { data } = await supabase.from("account_locks").select("*").limit(5000);
  return (data as AccountLockRow[]) ?? [];
}

async function logFraudAction(
  action: string,
  opts: { fraudType?: string; severity?: string; subjectType?: string; subjectId?: string; alertId?: string; metadata?: Record<string, unknown> } = {},
) {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("fraud_actions").insert({
    actor_id: auth.user?.id ?? null,
    action,
    fraud_type: opts.fraudType ?? null,
    severity: opts.severity ?? null,
    subject_type: opts.subjectType ?? null,
    subject_id: opts.subjectId ?? null,
    alert_id: opts.alertId ?? null,
    metadata: (opts.metadata ?? {}) as never,
  } as never);
}

export async function setAlertStatus(alert: FraudAlertRow, status: "open" | "reviewing" | "resolved" | "dismissed") {
  const { data: auth } = await supabase.auth.getUser();
  const resolved = status === "resolved" || status === "dismissed";
  await supabase
    .from("fraud_alerts")
    .update({
      status,
      resolved_by: resolved ? auth.user?.id ?? null : null,
      resolved_at: resolved ? new Date().toISOString() : null,
    })
    .eq("id", alert.id);
  await logFraudAction(`alert_${status}`, {
    fraudType: alert.fraud_type,
    severity: alert.severity,
    subjectType: alert.subject_type,
    subjectId: alert.subject_id ?? undefined,
    alertId: alert.id,
  });
}

export async function lockAccount(userId: string, label: string, reason: string, severity: Severity = "high") {
  const { data: auth } = await supabase.auth.getUser();
  await supabase.from("account_locks").upsert(
    {
      user_id: userId,
      locked: true,
      reason,
      severity,
      locked_by: auth.user?.id ?? null,
      unlocked_by: null,
    } as never,
    { onConflict: "user_id" },
  );
  await logFraudAction("account_locked", { severity, subjectType: "customer", subjectId: userId, metadata: { label, reason } });
}

export async function unlockAccount(userId: string, label: string) {
  const { data: auth } = await supabase.auth.getUser();
  await supabase
    .from("account_locks")
    .update({ locked: false, unlocked_by: auth.user?.id ?? null })
    .eq("user_id", userId);
  await logFraudAction("account_unlocked", { subjectType: "customer", subjectId: userId, metadata: { label } });
}

/* ----------------------------------------------------- executive report */

export type FraudReport = {
  generatedAt: string;
  windowDays: number;
  totalSignals: number;
  critical: number;
  high: number;
  flaggedAccounts: number;
  lockedAccounts: number;
  byType: { type: FraudType; label: string; count: number }[];
  topRisk: { label: string; riskScore: number; types: string }[];
};

export function buildReport(
  signals: FraudSignal[],
  profiles: RiskProfile[],
  locks: AccountLockRow[],
): FraudReport {
  const byTypeMap = new Map<FraudType, number>();
  for (const s of signals) byTypeMap.set(s.type, (byTypeMap.get(s.type) ?? 0) + 1);
  return {
    generatedAt: new Date().toISOString(),
    windowDays: 90,
    totalSignals: signals.length,
    critical: signals.filter((s) => s.severity === "critical").length,
    high: signals.filter((s) => s.severity === "high").length,
    flaggedAccounts: profiles.length,
    lockedAccounts: locks.filter((l) => l.locked).length,
    byType: [...byTypeMap.entries()]
      .map(([type, count]) => ({ type, label: FRAUD_META[type].label, count }))
      .sort((a, b) => b.count - a.count),
    topRisk: profiles.slice(0, 15).map((p) => ({
      label: p.label,
      riskScore: p.riskScore,
      types: p.types.map((t) => FRAUD_META[t].label).join(", "),
    })),
  };
}
