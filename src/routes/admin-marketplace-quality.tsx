import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, ShieldCheck, Search, Boxes, Code2, Sparkles, Wrench, RefreshCw,
  AlertOctagon, TriangleAlert, Info, Gauge, Activity,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { supabase } from "@/integrations/supabase/client";
import { resolveImage } from "@/lib/products";
import {
  auditMarketplace, ISSUE_META, CATEGORY_META,
  type QualityProduct, type QualityImage, type QualityReport,
  type IssueKey, type IssueCategory, type Severity,
} from "@/lib/marketplace-quality";

export const Route = createFileRoute("/admin-marketplace-quality")({
  head: () => ({
    meta: [
      { title: "Marketplace Quality — FoundOurMarket™" },
      { name: "description", content: "SEO quality audit, structured-data validation, and product completeness monitoring at marketplace scale." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: MarketplaceQualityPage,
});

const PRODUCT_COLS =
  "slug,name,description,image,seo_title,seo_description,meta_keywords,brand,category,product_type,price,price_usd,price_inr,video_url,status,sku,related_products,cross_sell_products,upsell_products";

const SEV_STYLE: Record<Severity, { chip: string; dot: string; icon: typeof AlertOctagon }> = {
  critical: { chip: "border-destructive/30 bg-destructive/10 text-destructive", dot: "bg-destructive", icon: AlertOctagon },
  warning: { chip: "border-amber-400/30 bg-amber-400/10 text-amber-400", dot: "bg-amber-400", icon: TriangleAlert },
  info: { chip: "border-sky-400/30 bg-sky-400/10 text-sky-400", dot: "bg-sky-400", icon: Info },
};

const CAT_ICON: Record<IssueCategory, typeof Search> = { seo: Search, schema: Code2, product: Boxes };

function ScoreRing({ value, label, icon: Icon }: { value: number; label: string; icon: typeof Gauge }) {
  const tone = value >= 85 ? "text-emerald-400" : value >= 60 ? "text-amber-400" : "text-destructive";
  const ring = value >= 85 ? "oklch(0.7 0.17 160)" : value >= 60 ? "oklch(0.8 0.16 80)" : "oklch(0.64 0.22 25)";
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}
      className="card-premium rounded-2xl p-5 flex items-center gap-4"
    >
      <div className="relative size-16 shrink-0 grid place-items-center">
        <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
          <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/20" />
          <circle cx="18" cy="18" r="15.5" fill="none" stroke={ring} strokeWidth="3" strokeLinecap="round"
            strokeDasharray={`${(value / 100) * 97.4} 97.4`} />
        </svg>
        <span className={`absolute text-sm font-display font-semibold tabular-nums ${tone}`}>{value}</span>
      </div>
      <div className="min-w-0">
        <div className="flex items-center gap-1.5 text-muted-foreground">
          <Icon className="size-3.5 text-accent" />
          <span className="text-[10px] font-mono uppercase tracking-[0.22em]">{label}</span>
        </div>
        <p className="text-xs text-muted-foreground/80 mt-1">{value >= 85 ? "Healthy" : value >= 60 ? "Needs attention" : "At risk"}</p>
      </div>
    </motion.div>
  );
}

function MarketplaceQualityPage() {
  const [products, setProducts] = useState<QualityProduct[] | null>(null);
  const [images, setImages] = useState<QualityImage[] | null>(null);
  const [cat, setCat] = useState<IssueCategory | "all">("all");
  const [issueFilter, setIssueFilter] = useState<IssueKey | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const [{ data: prods }, { data: imgs }] = await Promise.all([
      supabase.from("products").select(PRODUCT_COLS).order("sort_order", { ascending: true }).limit(20000),
      supabase.from("product_images").select("product_slug,url,alt").limit(50000),
    ]);
    setProducts((prods as QualityProduct[]) ?? []);
    setImages((imgs as QualityImage[]) ?? []);
    setRefreshing(false);
  }

  useEffect(() => { logActivity("marketplace_quality_open", "marketplace_quality"); load(); }, []);

  const report: QualityReport | null = useMemo(
    () => (products && images ? auditMarketplace(products, images) : null),
    [products, images],
  );

  const visibleIssues = useMemo(() => {
    const keys = (Object.keys(ISSUE_META) as IssueKey[]).filter(
      (k) => cat === "all" || ISSUE_META[k].category === cat,
    );
    return keys.sort((a, b) => (report?.counts[b] ?? 0) - (report?.counts[a] ?? 0));
  }, [cat, report]);

  const filteredProducts = useMemo(() => {
    if (!report) return [];
    return report.audited.filter((a) => {
      if (a.issues.length === 0) return false;
      if (issueFilter) return a.issues.includes(issueFilter);
      if (cat !== "all") return a.issues.some((i) => ISSUE_META[i].category === cat);
      return true;
    });
  }, [report, cat, issueFilter]);

  return (
    <AdminShell
      title="Marketplace Quality"
      subtitle="Audit SEO quality, structured data & product completeness at scale — monitoring only, never overwriting auto-generated metadata."
      allow={["admin", "super_admin", "manager", "editor"]}
      actions={
        <button
          onClick={load}
          disabled={refreshing}
          className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest glass rounded-full px-4 py-2 text-accent ring-1 ring-inset ring-accent/30 disabled:opacity-50"
        >
          <RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Re-scan
        </button>
      }
    >
      {!report ? (
        <div className="min-h-[40vh] grid place-items-center">
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="size-5 animate-spin text-accent" />
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Auditing catalog…</p>
          </div>
        </div>
      ) : (
        <>
          {/* Health rings */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 mb-6">
            <ScoreRing value={report.scores.catalogHealth} label="Catalog Health" icon={Gauge} />
            <ScoreRing value={report.scores.seoCompleteness} label="SEO Completeness" icon={Search} />
            <ScoreRing value={report.scores.schemaQuality} label="Schema Quality" icon={Code2} />
            <ScoreRing value={report.scores.productCompleteness} label="Product Completeness" icon={Boxes} />
            <ScoreRing value={report.scores.contentQuality} label="Content Quality" icon={Sparkles} />
          </div>

          {/* Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Live products" value={report.total} icon={<Boxes className="size-4" />} />
            <KpiCard label="Flagged products" value={report.flagged} icon={<ShieldCheck className="size-4" />} />
            <KpiCard label="Total issues" value={Object.values(report.counts).reduce((a, b) => a + b, 0)} icon={<Activity className="size-4" />} />
            <KpiCard
              label="Clean rate"
              value={`${report.total ? Math.round(((report.total - report.flagged) / report.total) * 100) : 100}%`}
              icon={<Gauge className="size-4" />}
            />
          </div>

          {/* Category tabs */}
          <div className="flex flex-wrap items-center gap-1.5 mb-4">
            <button
              onClick={() => { setCat("all"); setIssueFilter(null); }}
              className={`text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border ${cat === "all" ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:bg-white/5"}`}
            >
              All dimensions
            </button>
            {(Object.keys(CATEGORY_META) as IssueCategory[]).map((c) => {
              const Icon = CAT_ICON[c];
              return (
                <button
                  key={c}
                  onClick={() => { setCat(c); setIssueFilter(null); }}
                  className={`inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest px-3 py-1.5 rounded-full border ${cat === c ? "border-accent bg-accent/10 text-accent" : "border-border text-muted-foreground hover:bg-white/5"}`}
                >
                  <Icon className="size-3" /> {CATEGORY_META[c].label}
                  <span className="opacity-60">({report.byCategory[c]})</span>
                </button>
              );
            })}
          </div>

          {/* Issue breakdown grid */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            {visibleIssues.map((k) => {
              const m = ISSUE_META[k];
              const sev = SEV_STYLE[m.severity];
              const active = issueFilter === k;
              const count = report.counts[k];
              return (
                <button
                  key={k}
                  onClick={() => setIssueFilter(active ? null : k)}
                  className={`text-left card-premium rounded-2xl p-4 transition-colors ${active ? "border-accent/60 ring-1 ring-accent/30" : "hover:border-accent/30"} ${count === 0 ? "opacity-50" : ""}`}
                >
                  <div className="flex items-center justify-between mb-2">
                    <span className={`inline-flex items-center gap-1 text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${sev.chip}`}>
                      <sev.icon className="size-2.5" /> {m.severity}
                    </span>
                    <span className="text-xl font-display font-semibold tabular-nums">{count}</span>
                  </div>
                  <p className="text-xs font-medium leading-tight">{m.label}</p>
                  <p className="text-[10px] text-muted-foreground mt-1 leading-snug line-clamp-2">{m.hint}</p>
                </button>
              );
            })}
          </div>

          {/* Flagged products list */}
          <div className="card-premium rounded-2xl overflow-hidden">
            <div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2 sticky top-0 bg-card/80 backdrop-blur z-10">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <ShieldCheck className="size-4 text-accent" /> {filteredProducts.length} flagged
                {issueFilter && <span className="text-[10px] font-mono uppercase tracking-widest text-accent">· {ISSUE_META[issueFilter].label}</span>}
              </h2>
              {issueFilter && (
                <button onClick={() => setIssueFilter(null)} className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">Clear filter</button>
              )}
            </div>
            <ul className="divide-y divide-border/40">
              {filteredProducts.slice(0, 200).map((a) => {
                const tone = a.score >= 70 ? "text-amber-400" : "text-destructive";
                return (
                  <li key={a.product.slug} className="px-4 py-3 flex items-center gap-3">
                    <div className="size-11 rounded-lg bg-muted overflow-hidden shrink-0 grid place-items-center">
                      {a.product.image
                        ? <img src={resolveImage(a.product.image)} alt={a.product.name ?? ""} className="size-full object-cover" loading="lazy" />
                        : <AlertOctagon className="size-4 text-destructive" />}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-xs truncate">{a.product.name || <span className="text-destructive">Untitled product</span>}</p>
                        <span className={`text-[9px] font-mono tabular-nums ${tone}`}>{a.score}</span>
                      </div>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {a.issues.map((i) => {
                          const m = ISSUE_META[i];
                          const sev = SEV_STYLE[m.severity];
                          return (
                            <span key={i} className={`text-[8px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border ${sev.chip}`}>
                              {m.label}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                    <Link
                      to="/admin-product/$slug/seo"
                      params={{ slug: a.product.slug }}
                      className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent hover:underline shrink-0"
                    >
                      <Wrench className="size-2.5" /> Review
                    </Link>
                  </li>
                );
              })}
              {filteredProducts.length === 0 && (
                <li className="px-5 py-12 text-center text-xs text-muted-foreground">No issues in this view. Catalog quality is healthy.</li>
              )}
            </ul>
            {filteredProducts.length > 200 && (
              <div className="px-5 py-3 text-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-t border-border/40">
                Showing first 200 of {filteredProducts.length}
              </div>
            )}
          </div>
        </>
      )}
    </AdminShell>
  );
}
