import { useEffect, useState, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Link } from "@tanstack/react-router";
import { toast } from "sonner";
import {
  Megaphone, X, TrendingUp, DollarSign, Boxes, Users, Sparkles, Zap, Target,
  Gauge, Heart, Activity, Loader2, Plus, Minus, Play, Pause, Star, Flame,
  Rocket, ArrowUpRight, ArrowDownRight, Minus as Flat, ExternalLink, BadgePercent,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { Product } from "@/lib/products";
import {
  fetchProductMarketing, addProductToCampaign, removeProductFromCampaign,
  createProductCampaign, launchProductPromotion, pauseProductPromotion,
  createProductFlashSale, setProductFeatured, SCORE_LABELS,
  type ProductMarketing, type ProductCampaignRow, type ProductScores,
} from "@/lib/product-marketing";
import { fmtCurrency, fmtNum, pct, STATUS_COLOR, type Campaign } from "@/lib/marketing-automation";
import { supabase } from "@/integrations/supabase/client";

type Tab = "overview" | "campaigns" | "actions";

const TREND_ICON = { up: ArrowUpRight, down: ArrowDownRight, flat: Flat } as const;

export function ProductMarketingPanel({ product, onClose }: { product: Product; onClose: () => void }) {
  const [data, setData] = useState<ProductMarketing | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<Tab>("overview");
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const d = await fetchProductMarketing(product.slug);
      setData(d);
    } catch (e) {
      toast.error("Failed to load marketing data", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setLoading(false);
    }
  }, [product.slug]);

  useEffect(() => { void load(); }, [load]);

  // realtime: campaign changes update the product panel automatically
  useEffect(() => {
    const ch = supabase
      .channel(`product-marketing-${product.slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "marketing_campaigns" }, () => void load())
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_sales" }, () => void load())
      .subscribe();
    return () => { void supabase.removeChannel(ch); };
  }, [product.slug, load]);

  const run = useCallback(async (key: string, fn: () => Promise<{ error?: string }>, ok: string) => {
    setBusy(key);
    try {
      const res = await fn();
      if (res.error) toast.error("Action failed", { description: res.error });
      else { toast.success(ok); await load(); }
    } finally {
      setBusy(null);
    }
  }, [load]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl"
        >
          {/* header */}
          <div className="flex items-center justify-between border-b border-white/10 p-4">
            <div className="flex items-center gap-2.5">
              <span className="grid size-9 place-items-center rounded-xl border border-accent/30 bg-accent/10 text-accent">
                <Megaphone className="size-4" />
              </span>
              <div>
                <h2 className="font-display text-sm font-semibold leading-tight">Marketing Command Center</h2>
                <p className="truncate max-w-[220px] text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  {product.name}
                </p>
              </div>
            </div>
            <button onClick={onClose} className="grid size-8 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground">
              <X className="size-4" />
            </button>
          </div>

          {/* tabs */}
          <div className="flex gap-1 border-b border-white/10 px-3 py-2">
            {(["overview", "campaigns", "actions"] as Tab[]).map((t) => (
              <button
                key={t}
                onClick={() => setTab(t)}
                className={cn(
                  "flex-1 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition",
                  tab === t ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-4">
            {loading || !data ? (
              <div className="grid h-40 place-items-center text-muted-foreground">
                <Loader2 className="size-6 animate-spin" />
              </div>
            ) : (
              <>
                {tab === "overview" && <Overview data={data} />}
                {tab === "campaigns" && <Campaigns data={data} run={run} busy={busy} slug={product.slug} />}
                {tab === "actions" && (
                  <Actions data={data} product={product} run={run} busy={busy} reload={load} />
                )}
              </>
            )}
          </div>

          <div className="border-t border-white/10 p-3">
            <Link
              to="/admin-marketing-automation"
              className="flex items-center justify-center gap-1.5 rounded-xl border border-white/10 py-2 text-xs text-muted-foreground hover:text-foreground"
            >
              Open Marketing Hub <ExternalLink className="size-3.5" />
            </Link>
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

/* ----------------------------------------------------------------- overview */

function Overview({ data }: { data: ProductMarketing }) {
  const f = data.financials;
  const a = data.analytics;
  return (
    <div className="space-y-5">
      {/* financial */}
      <Section title="Financial" icon={DollarSign}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Revenue" value={fmtCurrency(f.revenue, data.region)} trend={f.revenueTrend} />
          <Stat label="Profit" value={fmtCurrency(f.profit, data.region)} trend={f.profitTrend} />
          <Stat label="Margin" value={pct(f.margin)} />
          <Stat label="Campaign Contribution" value={pct(a.contributionPct)} />
          <Stat label="Orders" value={fmtNum(f.orders)} />
          <Stat label="Units Sold" value={fmtNum(f.units)} />
        </div>
      </Section>

      {/* scores */}
      <Section title="Product Intelligence" icon={Activity}>
        <div className="grid grid-cols-2 gap-2">
          {SCORE_LABELS.map(({ key, label }) => (
            <ScoreBar key={key} label={label} value={data.scores[key as keyof ProductScores]} ic={SCORE_ICON[key]} />
          ))}
        </div>
      </Section>

      {/* campaign analytics */}
      <Section title="Campaign Analytics" icon={Target}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Campaign Revenue" value={fmtCurrency(a.campaignRevenue, data.region)} />
          <Stat label="Campaign Profit" value={fmtCurrency(a.campaignProfit, data.region)} />
          <Stat label="Campaign Orders" value={fmtNum(a.campaignOrders)} />
          <Stat label="Conversions" value={fmtNum(a.campaignConversions)} />
          <Stat label="Campaign ROI" value={`${a.campaignRoi.toFixed(2)}×`} />
          <Stat label="Avg Performance" value={`${a.avgPerformance.toFixed(2)}×`} />
        </div>
        {a.topCampaign && (
          <p className="mt-2 text-[11px] text-muted-foreground">
            <span className="text-emerald-400">Top:</span> {a.topCampaign.campaign.name}
            {a.worstCampaign && a.worstCampaign.campaign.id !== a.topCampaign.campaign.id && (
              <> · <span className="text-amber-400">Worst:</span> {a.worstCampaign.campaign.name}</>
            )}
          </p>
        )}
      </Section>

      {/* inventory link */}
      <Section title="Inventory Intelligence" icon={Boxes}>
        <div className="grid grid-cols-3 gap-2">
          <Stat label="Stock" value={fmtNum(data.inventory.stock)} />
          <Stat label="Reserved" value={fmtNum(data.inventory.reserved)} />
          <Stat label="Status" value={data.inventory.stockStatus} />
        </div>
        <div className={cn("mt-2 rounded-xl border p-2.5 text-[11px]", RISK_TONE[data.inventory.risk])}>
          <span className="font-semibold uppercase tracking-wide">Recommended:</span> {data.inventory.recommendedAction}
        </div>
      </Section>

      {/* customer link */}
      <Section title="Customer Intelligence" icon={Users}>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="VIP Buyers" value={fmtNum(data.customers.vip)} />
          <Stat label="Repeat Buyers" value={fmtNum(data.customers.repeat)} />
          <Stat label="Loyal Buyers" value={fmtNum(data.customers.loyal)} />
          <Stat label="High-Value Buyers" value={fmtNum(data.customers.highValue)} />
        </div>
        {data.customers.distribution.length > 0 && (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {data.customers.distribution.map((d) => (
              <span key={d.segment} className="rounded-full bg-muted/40 px-2 py-0.5 text-[10px] text-muted-foreground ring-1 ring-border">
                {d.segment}: {d.count}
              </span>
            ))}
          </div>
        )}
      </Section>
    </div>
  );
}

/* ---------------------------------------------------------------- campaigns */

function Campaigns({ data, run, busy, slug }: {
  data: ProductMarketing; slug: string;
  run: (k: string, fn: () => Promise<{ error?: string }>, ok: string) => Promise<void>;
  busy: string | null;
}) {
  return (
    <div className="space-y-5">
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-accent">Active Campaigns</h3>
        {data.active.length === 0 ? (
          <Empty>No active campaigns feature this product yet.</Empty>
        ) : (
          <div className="space-y-2">
            {data.active.map((r) => (
              <CampaignCard key={r.campaign.id} row={r} region={data.region} slug={slug} run={run} busy={busy} live />
            ))}
          </div>
        )}
      </div>
      <div>
        <h3 className="mb-2 text-xs font-semibold uppercase tracking-widest text-muted-foreground">Campaign History</h3>
        {data.history.length === 0 ? (
          <Empty>No completed campaigns yet.</Empty>
        ) : (
          <div className="space-y-2">
            {data.history.map((r) => (
              <CampaignCard key={r.campaign.id} row={r} region={data.region} slug={slug} run={run} busy={busy} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

const RATING_TONE: Record<ProductCampaignRow["rating"], string> = {
  excellent: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/30",
  good: "text-sky-300 bg-sky-400/10 ring-sky-400/30",
  average: "text-amber-300 bg-amber-400/10 ring-amber-400/30",
  poor: "text-rose-300 bg-rose-400/10 ring-rose-400/30",
  "n/a": "text-muted-foreground bg-muted/40 ring-border",
};

function CampaignCard({ row, region, slug, run, busy, live }: {
  row: ProductCampaignRow; region: ProductMarketing["region"]; slug: string; live?: boolean;
  run: (k: string, fn: () => Promise<{ error?: string }>, ok: string) => Promise<void>;
  busy: string | null;
}) {
  const c = row.campaign;
  const m = row.attributed;
  const date = (s: string | null) => (s ? new Date(s).toLocaleDateString() : "—");
  return (
    <div className="rounded-2xl border border-white/10 bg-card/40 p-3">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{c.name}</p>
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
            {c.campaign_type} · {c.region}
          </p>
        </div>
        <span className={cn("shrink-0 rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", STATUS_COLOR[c.status])}>
          {c.status}
        </span>
      </div>
      <div className="mt-2 grid grid-cols-3 gap-1.5 text-[11px]">
        <MiniStat label="Revenue" value={fmtCurrency(m.revenue, region)} />
        <MiniStat label="Profit" value={fmtCurrency(m.profit, region)} />
        <MiniStat label="Orders" value={fmtNum(m.orders)} />
        <MiniStat label="Conv" value={fmtNum(m.conversions)} />
        <MiniStat label="ROI" value={`${row.roi.toFixed(2)}×`} />
        <MiniStat label="Dates" value={`${date(c.launched_at ?? c.scheduled_at)}`} />
      </div>
      <div className="mt-2 flex items-center justify-between">
        <span className={cn("rounded-full px-2 py-0.5 text-[10px] font-medium ring-1", RATING_TONE[row.rating])}>
          {row.rating}
        </span>
        <div className="flex gap-1.5">
          {live && c.status === "active" && (
            <IconBtn label="Pause" busy={busy === `pause-${c.id}`} onClick={() => run(`pause-${c.id}`, () => pauseProductPromotion(row), "Promotion paused")}>
              <Pause className="size-3.5" />
            </IconBtn>
          )}
          {live && c.status !== "active" && c.status !== "completed" && (
            <IconBtn label="Launch" busy={busy === `launch-${c.id}`} onClick={() => run(`launch-${c.id}`, () => launchProductPromotion(row), "Promotion launched")}>
              <Play className="size-3.5" />
            </IconBtn>
          )}
          <IconBtn label="Remove" busy={busy === `rm-${c.id}`} onClick={() => run(`rm-${c.id}`, () => removeProductFromCampaign(c, slug), "Removed from campaign")}>
            <Minus className="size-3.5" />
          </IconBtn>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ actions */

function Actions({ data, product, run, busy, reload }: {
  data: ProductMarketing; product: Product;
  run: (k: string, fn: () => Promise<{ error?: string }>, ok: string) => Promise<void>;
  busy: string | null; reload: () => Promise<void>;
}) {
  const [pick, setPick] = useState("");
  const featuringIds = new Set([...data.active, ...data.history].map((r) => r.campaign.id));
  const available = data.allCampaigns.filter((c) => !featuringIds.has(c.id));

  const makeCampaign = (templateKey: string, label: string, launch = false) =>
    run(`tpl-${templateKey}`, () => createProductCampaign({
      slug: product.slug, productName: product.name, templateKey, launch,
    }), `${label} created`);

  return (
    <div className="space-y-5">
      <Section title="Quick Actions" icon={Zap}>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn icon={Rocket} label="Launch Promotion" busy={busy === "tpl-schedule_promo"} onClick={() => makeCampaign("schedule_promo", "Promotion", true)} />
          <ActionBtn icon={Plus} label="Create Campaign" busy={busy === "tpl-recommended"} onClick={() => makeCampaign("recommended", "Campaign")} />
          <ActionBtn icon={Star} label="Feature Product" active={data.featured} busy={busy === "feature"} onClick={() => run("feature", () => setProductFeatured(product.slug, !data.featured), data.featured ? "Unfeatured" : "Featured product")} />
          <ActionBtn icon={Flame} label="Create Flash Sale" busy={busy === "flash"} onClick={() => run("flash", () => createProductFlashSale({ slug: product.slug, productName: product.name, discountPercent: 20, durationHours: 24 }), "Flash sale created")} />
          <ActionBtn icon={BadgePercent} label="Clearance Campaign" busy={busy === "tpl-clearance"} onClick={() => makeCampaign("clearance", "Clearance campaign", true)} />
          <ActionBtn icon={Sparkles} label="New Arrival Campaign" busy={busy === "tpl-new_arrivals"} onClick={() => makeCampaign("new_arrivals", "New arrival campaign", true)} />
          <ActionBtn icon={Users} label="VIP Campaign" busy={busy === "tpl-vip_rewards"} onClick={() => makeCampaign("vip_rewards", "VIP campaign", true)} />
          <ActionBtn icon={TrendingUp} label="Trending Campaign" busy={busy === "tpl-trending"} onClick={() => makeCampaign("trending", "Trending campaign", true)} />
        </div>
      </Section>

      <Section title="Add To Existing Campaign" icon={Plus}>
        {available.length === 0 ? (
          <Empty>No other campaigns available.</Empty>
        ) : (
          <div className="flex gap-2">
            <select
              value={pick}
              onChange={(e) => setPick(e.target.value)}
              className="flex-1 rounded-xl border border-white/10 bg-card/40 px-3 py-2 text-sm"
            >
              <option value="">Select campaign…</option>
              {available.map((c) => (
                <option key={c.id} value={c.id}>{c.name}</option>
              ))}
            </select>
            <Button
              size="sm"
              disabled={!pick || busy === "add"}
              onClick={() => {
                const c = available.find((x) => x.id === pick);
                if (c) run("add", () => addProductToCampaign(c, product.slug), "Added to campaign").then(() => setPick(""));
              }}
            >
              {busy === "add" ? <Loader2 className="size-4 animate-spin" /> : "Add"}
            </Button>
          </div>
        )}
      </Section>

      <Section title="Storefront Integration" icon={Sparkles}>
        <div className="grid grid-cols-2 gap-2">
          <ActionBtn icon={Star} label="Feature On Homepage" active={data.featured} busy={busy === "feature2"} onClick={() => run("feature2", () => setProductFeatured(product.slug, true), "Featured on homepage")} />
          <ActionBtn icon={Sparkles} label="Featured Collection" busy={busy === "tpl-best_sellers"} onClick={() => makeCampaign("best_sellers", "Featured collection", true)} />
          <ActionBtn icon={TrendingUp} label="Trending Collection" busy={busy === "tpl-trending2"} onClick={() => run("tpl-trending2", () => createProductCampaign({ slug: product.slug, productName: product.name, templateKey: "trending", launch: true }), "Added to trending")} />
          <ActionBtn icon={Sparkles} label="New Arrivals" busy={busy === "tpl-new_arrivals2"} onClick={() => run("tpl-new_arrivals2", () => createProductCampaign({ slug: product.slug, productName: product.name, templateKey: "new_arrivals", launch: true }), "Added to new arrivals")} />
          <ActionBtn icon={Flame} label="Flash Sale" busy={busy === "flash2"} onClick={() => run("flash2", () => createProductFlashSale({ slug: product.slug, productName: product.name, discountPercent: 25, durationHours: 48 }), "Added to flash sale")} />
          <ActionBtn icon={Megaphone} label="Banner Campaign" busy={busy === "tpl-seasonal"} onClick={() => makeCampaign("seasonal", "Banner campaign", true)} />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------------------------------------ atoms */

const SCORE_ICON: Record<string, typeof Gauge> = {
  trending: TrendingUp, marketing: Megaphone, conversion: Target,
  profit: DollarSign, velocity: Gauge, customerInterest: Heart,
};

const RISK_TONE: Record<ProductMarketing["inventory"]["risk"], string> = {
  critical: "border-rose-400/30 bg-rose-400/10 text-rose-200",
  low: "border-amber-400/30 bg-amber-400/10 text-amber-200",
  healthy: "border-emerald-400/30 bg-emerald-400/10 text-emerald-200",
  overstock: "border-sky-400/30 bg-sky-400/10 text-sky-200",
  dead: "border-muted bg-muted/30 text-muted-foreground",
};

function Section({ title, icon: Icon, children }: { title: string; icon: typeof Gauge; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="mb-2 flex items-center gap-1.5 text-xs font-semibold uppercase tracking-widest text-accent">
        <Icon className="size-3.5" /> {title}
      </h3>
      {children}
    </div>
  );
}

function Stat({ label, value, trend }: { label: string; value: string; trend?: "up" | "down" | "flat" }) {
  const T = trend ? TREND_ICON[trend] : null;
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-2.5">
      <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="flex items-center gap-1 text-sm font-semibold">
        {value}
        {T && <T className={cn("size-3.5", trend === "up" ? "text-emerald-400" : trend === "down" ? "text-rose-400" : "text-muted-foreground")} />}
      </p>
    </div>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="text-[9px] uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="font-medium">{value}</p>
    </div>
  );
}

function ScoreBar({ label, value, ic: Icon }: { label: string; value: number; ic: typeof Gauge }) {
  const tone = value >= 70 ? "bg-emerald-400" : value >= 40 ? "bg-amber-400" : "bg-rose-400";
  return (
    <div className="rounded-xl border border-white/10 bg-card/40 p-2.5">
      <div className="flex items-center justify-between">
        <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          <Icon className="size-3" /> {label}
        </span>
        <span className="text-xs font-semibold">{value}</span>
      </div>
      <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted/40">
        <div className={cn("h-full rounded-full", tone)} style={{ width: `${value}%` }} />
      </div>
    </div>
  );
}

function ActionBtn({ icon: Icon, label, onClick, busy, active }: {
  icon: typeof Gauge; label: string; onClick: () => void; busy?: boolean; active?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      className={cn(
        "flex items-center gap-2 rounded-xl border p-2.5 text-left text-xs font-medium transition disabled:opacity-50",
        active ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 bg-card/40 hover:border-accent/30 hover:text-foreground",
      )}
    >
      {busy ? <Loader2 className="size-4 shrink-0 animate-spin" /> : <Icon className="size-4 shrink-0" />}
      <span className="leading-tight">{label}</span>
    </button>
  );
}

function IconBtn({ children, label, onClick, busy }: { children: React.ReactNode; label: string; onClick: () => void; busy?: boolean }) {
  return (
    <button
      onClick={onClick}
      disabled={busy}
      title={label}
      aria-label={label}
      className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground transition hover:text-foreground disabled:opacity-50"
    >
      {busy ? <Loader2 className="size-3.5 animate-spin" /> : children}
    </button>
  );
}

function Empty({ children }: { children: React.ReactNode }) {
  return <p className="rounded-xl border border-dashed border-white/10 p-3 text-center text-xs text-muted-foreground">{children}</p>;
}
