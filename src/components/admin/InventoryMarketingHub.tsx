import { useEffect, useMemo, useState, useCallback } from "react";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Megaphone, Loader2, Rocket, Boxes, Flame, Skull, Layers, Star, ArrowDownRight,
  TrendingUp, AlertTriangle, ShieldAlert, Sparkles, Zap, X, Gauge, Check, Ban,
  PackageX, BadgePercent, ChevronRight,
} from "lucide-react";
import type { ProductIntel } from "@/lib/inventory-intelligence";
import type { Campaign } from "@/lib/marketing-automation";
import { STATUS_COLOR } from "@/lib/marketing-automation";
import {
  buildOpportunityBuckets, buildInventoryRecommendations, buildInventoryMarketingAnalytics,
  scoreProduct, campaignsForSlug, fetchInventoryCampaigns, createInventoryCampaign,
  pauseInventoryPromotions, createInventoryFlashSale, featureInventoryProducts,
  rejectRecommendation, marginPct, fmt, REC_TONE,
  type OpportunityBucket, type OpportunityKind, type InventoryRecommendation,
} from "@/lib/inventory-marketing";
import { supabase } from "@/integrations/supabase/client";

const BUCKET_ICON: Record<OpportunityKind, React.ReactNode> = {
  out_of_stock: <PackageX className="size-4 text-destructive" />,
  back_in_stock: <Rocket className="size-4 text-emerald-400" />,
  low_stock: <AlertTriangle className="size-4 text-amber-400" />,
  dead: <Skull className="size-4 text-muted-foreground" />,
  overstock: <Layers className="size-4 text-amber-400" />,
  slow: <ArrowDownRight className="size-4 text-muted-foreground" />,
  fast: <Flame className="size-4 text-accent" />,
  bestseller: <Star className="size-4 text-emerald-400" />,
  high_margin: <TrendingUp className="size-4 text-emerald-400" />,
  high_return: <ShieldAlert className="size-4 text-destructive" />,
};

export function InventoryMarketingHub({ intel }: { intel: ProductIntel[] }) {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState<Set<string>>(new Set());
  const [focus, setFocus] = useState<ProductIntel | null>(null);

  const load = useCallback(async () => {
    setCampaigns(await fetchInventoryCampaigns());
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  // Realtime: when campaigns or flash sales change, recommendations refresh.
  useEffect(() => {
    const ch = supabase
      .channel("inventory-marketing-rt")
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_sales" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [load]);

  const buckets = useMemo(() => buildOpportunityBuckets(intel), [intel]);
  const recs = useMemo(
    () => buildInventoryRecommendations(intel, campaigns).filter((r) => !dismissed.has(r.id)),
    [intel, campaigns, dismissed],
  );
  const analytics = useMemo(() => buildInventoryMarketingAnalytics(intel, campaigns), [intel, campaigns]);

  const run = useCallback(async (key: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error("Action failed", { description: res.error });
      else { toast.success(ok); await load(); }
    } finally { setBusy(null); }
  }, [load]);

  const acceptRec = useCallback((rec: InventoryRecommendation, launch: boolean) => {
    const key = `rec-${rec.id}-${launch}`;
    if (rec.action === "feature") {
      void run(key, () => featureInventoryProducts(rec.slugs, true), `Featured ${rec.slugs.length} products`);
      return;
    }
    if (rec.action === "pause") {
      void run(key, async () => { await pauseInventoryPromotions(rec.slugs, campaigns); return {}; }, "Promotions paused");
      return;
    }
    if (rec.action === "bundle") {
      void run(key, () => createInventoryFlashSale({ slugs: rec.slugs, discountPercent: 15, durationHours: 72 }),
        "Bundle flash sale created");
      return;
    }
    void run(key, () => createInventoryCampaign({
      template: rec.template ?? "clearance", slugs: rec.slugs, recommendationId: rec.id, launch,
    }), launch ? "Campaign launched" : "Draft campaign created");
  }, [run, campaigns]);

  if (loading) {
    return (
      <section className="mb-6">
        <Header />
        <div className="card-premium rounded-2xl px-5 py-10 grid place-items-center">
          <Loader2 className="size-5 animate-spin text-accent" />
        </div>
      </section>
    );
  }

  return (
    <section className="mb-6">
      <Header />

      {/* Inventory marketing analytics */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3 mb-5">
        <Kpi label="Inventory revenue" value={fmt(analytics.inventoryRevenue)} />
        <Kpi label="Campaign revenue" value={fmt(analytics.campaignRevenue)} accent />
        <Kpi label="Promotion ROI" value={`${(analytics.promotionRoi * 100).toFixed(0)}%`} accent />
        <Kpi label="Inventory ROI" value={`${(analytics.inventoryRoi * 100).toFixed(0)}%`} />
        <Kpi label="Clearable capital" value={fmt(analytics.clearableCapital)} danger />
        <Kpi label="Stock to reduce" value={`${analytics.stockReductionUnits.toLocaleString()}u`} />
      </div>

      {/* Recommendations */}
      <div className="flex items-center gap-2 mb-3">
        <Sparkles className="size-4 text-accent" />
        <h3 className="text-sm font-medium">Marketing recommendations</h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {recs.length} opportunities</span>
      </div>
      {recs.length === 0 ? (
        <div className="card-premium rounded-2xl px-5 py-8 text-center text-xs text-muted-foreground mb-6">
          No inventory marketing opportunities right now — your catalogue is balanced.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 mb-6">
          {recs.map((r) => (
            <div key={r.id} className={`rounded-xl border px-4 py-3 ${REC_TONE[r.tone]}`}>
              <div className="flex items-start gap-2.5">
                <Rocket className="size-3.5 text-accent mt-0.5 shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium">{r.title}</p>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{r.detail}</p>
                  <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                    {r.action === "feature" || r.action === "pause" || r.action === "bundle" ? (
                      <ActBtn busy={busy === `rec-${r.id}-false`} onClick={() => acceptRec(r, false)} icon={<Check className="size-3" />}>
                        {r.action === "feature" ? "Feature now" : r.action === "pause" ? "Pause now" : "Create bundle"}
                      </ActBtn>
                    ) : (
                      <>
                        <ActBtn busy={busy === `rec-${r.id}-true`} primary onClick={() => acceptRec(r, true)} icon={<Zap className="size-3" />}>
                          Launch
                        </ActBtn>
                        <ActBtn busy={busy === `rec-${r.id}-false`} onClick={() => acceptRec(r, false)} icon={<Check className="size-3" />}>
                          Draft
                        </ActBtn>
                      </>
                    )}
                    <button
                      onClick={() => { rejectRecommendation(r); setDismissed((s) => new Set(s).add(r.id)); }}
                      className="inline-flex items-center gap-1 border border-border px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5 text-muted-foreground"
                    >
                      <Ban className="size-3" /> Dismiss
                    </button>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Opportunity buckets */}
      <div className="flex items-center gap-2 mb-3">
        <Boxes className="size-4 text-accent" />
        <h3 className="text-sm font-medium">Auto-detected opportunities</h3>
        <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· {buckets.length} segments</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
        {buckets.map((b) => (
          <BucketCard key={b.kind} b={b} busy={busy} onFocus={setFocus}
            onAction={() => {
              if (b.storefront === "feature" || b.storefront === "bestseller" || b.storefront === "trending") {
                void run(`bucket-${b.kind}`, () => featureInventoryProducts(b.products.map((p) => p.slug), true),
                  `Featured ${b.products.length} products`);
              } else if (b.storefront === "flash") {
                void run(`bucket-${b.kind}`, () => createInventoryFlashSale({
                  slugs: b.products.map((p) => p.slug), discountPercent: b.kind === "dead" ? 30 : 20, durationHours: 72,
                }), "Flash sale created");
              } else if (b.template) {
                void run(`bucket-${b.kind}`, () => createInventoryCampaign({
                  template: b.template!, slugs: b.products.map((p) => p.slug), launch: true,
                }), "Campaign launched");
              }
            }}
          />
        ))}
        {buckets.length === 0 && (
          <div className="card-premium rounded-2xl px-5 py-8 text-center text-xs text-muted-foreground col-span-full">
            No opportunity segments detected.
          </div>
        )}
      </div>

      {focus && <ProductPanel p={focus} campaigns={campaigns} onClose={() => setFocus(null)} />}
    </section>
  );
}

function Header() {
  return (
    <div className="flex items-center gap-2 mb-4">
      <Megaphone className="size-4 text-accent" />
      <h2 className="text-sm font-medium">Marketing Opportunities</h2>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">· convert inventory into revenue</span>
    </div>
  );
}

function Kpi({ label, value, accent, danger }: { label: string; value: string; accent?: boolean; danger?: boolean }) {
  return (
    <div className="card-premium rounded-2xl p-3.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className={`font-display text-lg ${accent ? "text-emerald-400" : danger ? "text-destructive" : ""}`}>{value}</p>
    </div>
  );
}

function ActBtn({ children, onClick, busy, primary, icon }: {
  children: React.ReactNode; onClick: () => void; busy?: boolean; primary?: boolean; icon?: React.ReactNode;
}) {
  return (
    <button
      disabled={busy}
      onClick={onClick}
      className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono disabled:opacity-50 ${
        primary ? "bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25" : "border border-border hover:bg-white/5"
      }`}
    >
      {busy ? <Loader2 className="size-3 animate-spin" /> : icon}
      {children}
    </button>
  );
}

function BucketCard({ b, busy, onAction, onFocus }: {
  b: OpportunityBucket; busy: string | null; onAction: () => void; onFocus: (p: ProductIntel) => void;
}) {
  const toneRing = b.tone === "danger" ? "ring-destructive/20" : b.tone === "warn" ? "ring-amber-400/20" : b.tone === "good" ? "ring-emerald-400/20" : "ring-border";
  const actionLabel = b.storefront === "flash" ? "Flash sale" :
    (b.storefront ? "Feature" : b.template ? "Launch campaign" : null);
  return (
    <div className={`card-premium rounded-2xl overflow-hidden ring-1 ${toneRing}`}>
      <div className="px-4 py-3 border-b border-border flex items-center gap-2">
        {BUCKET_ICON[b.kind]}
        <h4 className="text-sm font-medium flex-1">{b.label}</h4>
        <span className="text-[10px] font-mono text-muted-foreground">{b.products.length}</span>
      </div>
      <div className="px-4 py-2 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border/40">
        <span>Capital {fmt(b.capital)}</span>
        <span>Rev {fmt(b.revenue)}</span>
      </div>
      <ul className="divide-y divide-border/40 max-h-44 overflow-y-auto">
        {b.products.slice(0, 6).map((p) => (
          <li key={p.slug} className="px-4 py-2 flex items-center gap-2">
            <button onClick={() => onFocus(p)} className="min-w-0 flex-1 text-left">
              <span className="text-xs hover:text-accent block truncate">{p.name}</span>
              <span className="text-[10px] font-mono text-muted-foreground">
                {p.stock}u · {p.unitsSold} sold · {(marginPct(p) * 100).toFixed(0)}% margin
              </span>
            </button>
            <ChevronRight className="size-3.5 text-muted-foreground shrink-0" />
          </li>
        ))}
      </ul>
      {actionLabel && (
        <div className="px-4 py-2.5 border-t border-border">
          <ActBtn busy={busy === `bucket-${b.kind}`} primary onClick={onAction} icon={<Zap className="size-3" />}>
            {actionLabel} · {b.products.length}
          </ActBtn>
        </div>
      )}
    </div>
  );
}

/* --------------------------------------------- per-product marketing panel */

function ProductPanel({ p, campaigns, onClose }: { p: ProductIntel; campaigns: Campaign[]; onClose: () => void }) {
  const score = scoreProduct(p);
  const current = campaignsForSlug(p.slug, campaigns);
  const statusLabel = p.stock <= 0 ? "Out of stock" :
    p.classification === "low" ? "Low stock" :
    p.classification === "dead" ? "Dead inventory" :
    p.classification === "overstock" ? "Overstocked" :
    p.classification === "slow" ? "Slow moving" : "Healthy";

  const suggested: { label: string; tone: string }[] = [];
  if (p.stock <= 0 && p.avgDailySales > 0) suggested.push({ label: "Back-In-Stock Campaign", tone: "text-amber-400" });
  if (p.classification === "dead") suggested.push({ label: "Clearance Campaign", tone: "text-destructive" });
  if (p.classification === "overstock") suggested.push({ label: "Overstock / Bundle Campaign", tone: "text-amber-400" });
  if (p.classification === "healthy" && p.trend === "up") suggested.push({ label: "Fast Mover Spotlight", tone: "text-emerald-400" });
  if (marginPct(p) >= 0.45 && p.stock > 0) suggested.push({ label: "High-Margin Push", tone: "text-emerald-400" });
  if (p.returnRate >= 15) suggested.push({ label: "Reduce Spend (high returns)", tone: "text-destructive" });
  if (suggested.length === 0) suggested.push({ label: "Maintain current level", tone: "text-muted-foreground" });

  const scores: { key: keyof typeof score; label: string }[] = [
    { key: "promotion", label: "Promotion" }, { key: "clearance", label: "Clearance" },
    { key: "demand", label: "Demand" }, { key: "velocity", label: "Velocity" },
    { key: "risk", label: "Risk" }, { key: "margin", label: "Margin" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative w-full md:max-w-lg max-h-[88vh] overflow-y-auto card-premium rounded-t-3xl md:rounded-3xl border border-border p-5">
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">Inventory marketing</p>
            <h3 className="text-base font-medium truncate">{p.name}</h3>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-full hover:bg-white/5 shrink-0"><X className="size-4" /></button>
        </div>

        <div className="grid grid-cols-2 gap-3 mb-4">
          <Field label="Inventory status" value={statusLabel} />
          <Field label="On hand" value={`${p.stock} units (${p.available} avail)`} />
        </div>

        <div className="rounded-xl border border-border bg-white/[0.02] px-4 py-3 mb-4">
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">Marketing recommendation</p>
          <p className="text-xs">
            {p.classification === "dead" || p.classification === "overstock"
              ? "Clear or bundle to free up capital."
              : p.stock <= 0 ? "Capture demand with a back-in-stock waitlist."
              : p.trend === "up" ? "Promote aggressively — rising demand."
              : "Maintain steady promotion level."}
          </p>
        </div>

        {/* scores */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Inventory marketing score</p>
        <div className="grid grid-cols-3 gap-2 mb-4">
          {scores.map((s) => (
            <div key={s.key} className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
              <div className="flex items-center gap-1 mb-1.5"><Gauge className="size-3 text-accent" /><span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{s.label}</span></div>
              <p className="font-display text-lg leading-none">{score[s.key]}</p>
              <div className="mt-1.5 h-1 rounded-full bg-white/5 overflow-hidden">
                <div className="h-full rounded-full bg-gradient-to-r from-accent to-primary" style={{ width: `${score[s.key]}%` }} />
              </div>
            </div>
          ))}
        </div>

        {/* current campaigns */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Current campaigns</p>
        {current.length === 0 ? (
          <p className="text-xs text-muted-foreground mb-4">No active campaigns for this product.</p>
        ) : (
          <ul className="space-y-1.5 mb-4">
            {current.map((c) => (
              <li key={c.id} className="flex items-center gap-2 rounded-lg border border-border bg-white/[0.02] px-3 py-2">
                <span className="text-xs flex-1 truncate">{c.name}</span>
                <span className={`px-2 py-0.5 rounded-full text-[9px] font-mono uppercase tracking-widest ring-1 ${STATUS_COLOR[c.status]}`}>{c.status}</span>
              </li>
            ))}
          </ul>
        )}

        {/* suggested campaigns */}
        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Suggested campaigns</p>
        <div className="flex flex-wrap gap-1.5 mb-5">
          {suggested.map((s) => (
            <span key={s.label} className={`inline-flex items-center gap-1 rounded-full border border-border px-2.5 py-1 text-[10px] ${s.tone}`}>
              <BadgePercent className="size-3" /> {s.label}
            </span>
          ))}
        </div>

        <Link to="/products/$slug" params={{ slug: p.slug }}
          className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
          Open product page <ChevronRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-border bg-white/[0.02] px-3 py-2.5">
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1">{label}</p>
      <p className="text-xs font-medium">{value}</p>
    </div>
  );
}
