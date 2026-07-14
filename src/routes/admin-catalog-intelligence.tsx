import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { motion } from "framer-motion";
import {
  Loader2, Sparkles, RefreshCw, Gauge, Search, ShieldCheck, Image as ImageIcon,
  Boxes, Brain, Layers, Store, TrendingUp, ArrowRight, Package, CheckCircle2, Wand2,
} from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import {
  buildOptimizerReport,
  scoreProductCompleteness,
  type OptimizerProduct,
  type OptimizerReport,
  type ProductCompleteness,
} from "@/lib/catalog-intelligence";


export const Route = createFileRoute("/admin-catalog-intelligence")({
  head: () => ({
    meta: [
      { title: "Catalog Intelligence — FoundOurMarket™" },
      { name: "description", content: "Unified AI catalog intelligence: health, duplicates, SEO, images, variants, and vendor quality in one place." },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: CatalogIntelligencePage,
});

const COLS =
  "slug,name,description,image,seo_title,seo_description,meta_keywords,brand,category,price,price_usd,price_inr,compare_price_inr,video_url,status,stock_quantity,specifications,attributes,related_products";

const MODULES: { to: string; label: string; desc: string; icon: typeof Gauge }[] = [
  { to: "/admin-duplicate-intelligence", label: "Duplicate Intelligence", desc: "Relationships, fingerprints & merges", icon: ShieldCheck },
  { to: "/admin-marketplace-quality", label: "Catalog Health", desc: "SEO, schema & completeness audit", icon: Gauge },
  { to: "/admin-seo-intelligence", label: "SEO Intelligence 2.0", desc: "Schema, keywords & internal linking", icon: Search },
  { to: "/admin-recommendation-health", label: "Recommendation Intelligence", desc: "Engine performance & rules", icon: Brain },
  { to: "/admin-inventory-intelligence", label: "Inventory Intelligence", desc: "Stock, demand & restock signals", icon: Boxes },
  { to: "/admin-customer-intelligence", label: "Customer Intelligence", desc: "Segments, LTV & behaviour", icon: Store },
  { to: "/admin-products", label: "Products & Variants", desc: "Editor with live readiness scores", icon: Layers },
  { to: "/admin-search", label: "Search Intelligence", desc: "Queries, zero-results & synonyms", icon: TrendingUp },
];

const ISSUE_LABELS: Record<string, string> = {
  seo_title: "Missing SEO title",
  seo_desc: "Missing meta description",
  desc_none: "No description",
  desc_thin: "Thin description",
  img_none: "No images",
  img_few: "Too few images",
  specs_none: "No specifications",
  specs_few: "Incomplete specs",
  price: "Invalid price",
  dup: "Duplicate risk",
  thin_content: "Thin content (SEO)",
  keyword_stuffing: "Keyword stuffing",
  missing_title: "SEO title (SEO)",
  missing_description: "Meta description (SEO)",
};

function ring(v: number) {
  return v >= 85 ? "text-emerald-400" : v >= 60 ? "text-amber-400" : "text-destructive";
}

function CatalogIntelligencePage() {
  const [products, setProducts] = useState<OptimizerProduct[] | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  async function load() {
    setRefreshing(true);
    const { data } = await supabase
      .from("products")
      .select(COLS)
      .is("deleted_at", null)
      .order("sort_order", { ascending: true })
      .limit(20000);
    setProducts((data as unknown as OptimizerProduct[]) ?? []);
    setRefreshing(false);
  }

  useEffect(() => {
    logActivity("catalog_intelligence_open", "catalog_intelligence");
    load();
  }, []);

  const report: OptimizerReport | null = useMemo(
    () => (products ? buildOptimizerReport(products) : null),
    [products],
  );

  const topIssues = useMemo(
    () =>
      report
        ? Object.entries(report.issueCounts).sort((a, b) => b[1] - a[1]).slice(0, 8)
        : [],
    [report],
  );

  const completeness = useMemo(() => {
    if (!products) return null;
    const rows = products.map((p) => ({
      slug: p.slug,
      name: p.name,
      module: scoreProductCompleteness({
        slug: p.slug,
        name: p.name,
        description: p.description,
        seoTitle: p.seo_title,
        seoDescription: p.seo_description,
        metaKeywords: p.meta_keywords ?? null,
        imageCount: p.image ? 1 : 0,
        imageQuality: null,
        attributeCount: Object.values(p.attributes ?? {}).filter(Boolean).length,
        specCount: Object.keys(p.specifications ?? {}).length,
        variantCount: Object.values(p.attributes ?? {}).filter(Boolean).length,
      }),
    }));
    const avg = Math.round(rows.reduce((a, r) => a + r.module.score, 0) / (rows.length || 1));
    const needs = [...rows].sort((a, b) => a.module.score - b.module.score).slice(0, 6);
    return { rows, avg, needs };
  }, [products]);


  return (
    <AdminShell title="Catalog Intelligence">
      <div className="mx-auto max-w-6xl space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <span className="grid size-11 place-items-center rounded-2xl bg-accent/15 text-accent">
            <Sparkles className="size-5" />
          </span>
          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.25em] text-accent">Marketplace Intelligence</p>
            <h1 className="text-xl font-display font-semibold">Catalog Intelligence Platform</h1>
          </div>
          <button
            onClick={load}
            disabled={refreshing}
            className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-2 text-xs font-medium hover:text-foreground disabled:opacity-60"
          >
            {refreshing ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}
            Rescan
          </button>
        </div>

        {!report ? (
          <div className="grid place-items-center rounded-3xl border border-border/60 bg-card/40 p-16">
            <Loader2 className="size-6 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <>
            {/* Aggregate scores */}
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard label="Products" value={report.total} icon={Package} tone="text-foreground" />
              <StatCard label="Avg Catalog Health" value={`${report.avgHealth}%`} icon={Gauge} tone={ring(report.avgHealth)} />
              <StatCard label="Avg SEO Score" value={`${report.avgSeo}%`} icon={Search} tone={ring(report.avgSeo)} />
              <StatCard label="Need Attention" value={report.needsAttention.length} icon={ShieldCheck} tone="text-amber-400" />
            </div>

            {/* Module hub */}
            <div>
              <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Intelligence Modules</p>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {MODULES.map((m, i) => (
                  <motion.div
                    key={m.to}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.03 }}
                  >
                    <Link
                      to={m.to}
                      className="group flex h-full flex-col gap-2 rounded-2xl border border-border/60 bg-card/40 p-4 transition hover:border-accent/50"
                    >
                      <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent">
                        <m.icon className="size-4" />
                      </span>
                      <p className="text-sm font-semibold">{m.label}</p>
                      <p className="text-xs text-muted-foreground">{m.desc}</p>
                      <ArrowRight className="mt-auto size-4 text-muted-foreground transition group-hover:translate-x-0.5 group-hover:text-accent" />
                    </Link>
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Top issues + needs attention */}
            <div className="grid gap-4 lg:grid-cols-2">
              <div className="rounded-3xl border border-border/60 bg-card/40 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <TrendingUp className="size-4 text-accent" /> Marketplace optimization report
                </p>
                <p className="mb-3 text-[11px] text-muted-foreground">
                  Generated {new Date(report.generatedAt).toLocaleString()} · {report.total} products analysed
                </p>
                <ul className="space-y-2">
                  {topIssues.length === 0 && <li className="text-xs text-emerald-400">No systemic issues detected.</li>}
                  {topIssues.map(([key, count]) => (
                    <li key={key} className="flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">{ISSUE_LABELS[key] ?? key}</span>
                      <span className="font-mono font-semibold text-amber-400">{count}</span>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="rounded-3xl border border-border/60 bg-card/40 p-5">
                <p className="mb-3 flex items-center gap-2 text-sm font-semibold">
                  <ShieldCheck className="size-4 text-accent" /> Products needing attention
                </p>
                <ul className="space-y-1.5">
                  {report.needsAttention.slice(0, 10).map((r) => (
                    <li key={r.slug}>
                      <Link
                        to="/admin-product/$slug"
                        params={{ slug: r.slug }}
                        className="flex items-center justify-between gap-2 rounded-xl px-2 py-1.5 text-xs transition hover:bg-background/60"
                      >
                        <span className="truncate">{r.name}</span>
                        <span className="flex shrink-0 items-center gap-2">
                          <span className={ring(r.health)}>H {r.health}</span>
                          <span className={ring(r.seo)}>S {r.seo}</span>
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* Product Completeness Engine — Catalog Intelligence 2.0, Phase 1 */}
            {completeness && (
              <div className="rounded-3xl border border-border/60 bg-card/40 p-5">
                <div className="mb-4 flex items-start gap-3">
                  <span className="grid size-9 place-items-center rounded-xl bg-accent/10 text-accent">
                    <Wand2 className="size-4" />
                  </span>
                  <div className="flex-1">
                    <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-accent">Catalog Intelligence 2.0 · Phase 1</p>
                    <p className="text-sm font-semibold">Product Completeness Engine</p>
                    <p className="text-xs text-muted-foreground">
                      One recommendation per listing. Deterministic scoring across images, title, description, attributes, specifications, variants, SEO.
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Avg</p>
                    <p className={`font-display text-2xl font-semibold tabular-nums ${ring(completeness.avg)}`}>{completeness.avg}</p>
                  </div>
                </div>

                <p className="mb-2 text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Top listings to fix</p>
                <ul className="space-y-2">
                  {completeness.needs.map((r) => (
                    <CompletenessRow key={r.slug} slug={r.slug} name={r.name} module={r.module} />
                  ))}
                  {completeness.needs.length === 0 && (
                    <li className="flex items-center gap-2 text-xs text-emerald-400">
                      <CheckCircle2 className="size-4" /> All listings look complete.
                    </li>
                  )}
                </ul>
              </div>
            )}
          </>

        )}
      </div>
    </AdminShell>
  );
}

function StatCard({ label, value, icon: Icon, tone }: { label: string; value: string | number; icon: typeof Gauge; tone: string }) {
  return (
    <div className="rounded-2xl border border-border/60 bg-card/40 p-4">
      <div className="flex items-center gap-1.5 text-muted-foreground">
        <Icon className="size-3.5 text-accent" />
        <span className="text-[10px] font-mono uppercase tracking-[0.2em]">{label}</span>
      </div>
      <p className={`mt-2 font-display text-2xl font-semibold tabular-nums ${tone}`}>{value}</p>
    </div>
  );
}

const STATUS_DOT: Record<ProductCompleteness["status"], string> = {
  green: "bg-emerald-400",
  blue: "bg-sky-400",
  amber: "bg-amber-400",
  red: "bg-destructive",
};

function CompletenessRow({ slug, name, module: m }: { slug: string; name: string; module: ProductCompleteness }) {
  return (
    <li className="rounded-2xl border border-border/60 bg-background/40 p-3">
      <div className="flex items-center gap-3">
        <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[m.status]}`} aria-hidden />
        <div className="min-w-0 flex-1">
          <Link
            to="/admin-product/$slug"
            params={{ slug }}
            className="block truncate text-sm font-medium hover:text-accent"
          >
            {name}
          </Link>
          <p className="mt-0.5 truncate text-xs text-muted-foreground">{m.recommendation}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <span className={`font-mono text-xs tabular-nums ${
            m.score >= 85 ? "text-emerald-400" : m.score >= 60 ? "text-amber-400" : "text-destructive"
          }`}>
            {m.score}
          </span>
          {m.actionHref ? (
            <a
              href={m.actionHref}
              className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1 text-[11px] font-medium text-accent-foreground transition hover:opacity-90"
            >
              {m.action} <ArrowRight className="size-3" />
            </a>
          ) : null}
        </div>
      </div>
    </li>
  );
}

