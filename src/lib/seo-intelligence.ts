/**
 * SEO Intelligence engine (P2-C) — client-safe types + pure compute.
 *
 * All inputs are real rows produced by the service_role-only RPC
 * `svc_seo_intelligence` and the live sitemap / broken-link / Search Console
 * checks performed server-side. This module contains NO data fetching and NO
 * simulated metrics — only derivation (scores, opportunities, summaries, CSV).
 */

// ---------------- Raw shapes (mirror svc_seo_intelligence) ----------------

export type SeoEntityType = "product" | "category" | "page" | "post";

export interface SeoAuditRow {
  type: SeoEntityType;
  id: string;
  slug: string;
  title: string | null;
  url: string;
  meta_title: string | null;
  meta_desc: string | null;
  score: number;
  issues: string[];
}

export interface SeoAudit {
  rows: SeoAuditRow[];
  avg_score: number;
  total: number;
  perfect: number;
  by_type: Record<string, number>;
}

export interface MetadataSummary {
  missing_title: number;
  missing_description: number;
  missing_keywords: number;
  missing_image: number;
  title_issues: number;
  description_issues: number;
}

export interface KeywordRow {
  keyword: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
  expected_ctr?: number;
}

export interface PageRow {
  page: string;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface SearchConsole {
  available: boolean;
  snapshot_date?: string;
  totals?: { clicks: number; impressions: number; ctr: number; position: number; keywords: number };
  top_keywords?: KeywordRow[];
  striking_distance?: KeywordRow[];
  ctr_opportunities?: KeywordRow[];
  top_pages?: PageRow[];
  indexed_pages?: number;
}

export interface RevenuePage { page: string; revenue: number; orders: number }
export interface RevenueKeyword { keyword: string; clicks: number; est_revenue: number }

export interface SeoRaw {
  generated_at: string;
  since: string;
  audit: SeoAudit;
  metadata_summary: MetadataSummary;
  search_console: SearchConsole;
  revenue_pages: RevenuePage[];
  revenue_keywords: RevenueKeyword[];
}

// ---- Live health checks (server route results) ----

export interface SitemapHealth {
  ok: boolean;
  url: string;
  url_count: number;
  fetched_ok: number;
  broken: { url: string; status: number | string }[];
  checked: number;
  error?: string;
}

export interface SeoBundle {
  intelligence: SeoRaw;
  sitemap: SitemapHealth | null;
}

// ---------------- Opportunities engine ----------------

export type OppSeverity = "high" | "medium" | "low";
export interface SeoOpportunity {
  id: string;
  severity: OppSeverity;
  title: string;
  detail: string;
  metric?: string;
  cta?: { label: string; to: string };
}

export function detectOpportunities(raw: SeoRaw, sitemap: SitemapHealth | null): SeoOpportunity[] {
  const out: SeoOpportunity[] = [];
  const m = raw.metadata_summary;

  if (m.missing_title > 0)
    out.push({
      id: "missing-title",
      severity: "high",
      title: `${m.missing_title} pages missing a title tag`,
      detail: "Titles are the single biggest on-page ranking and CTR lever. Add a unique 15–60 char title to each.",
      metric: `${m.missing_title} entities`,
    });
  if (m.missing_description > 0)
    out.push({
      id: "missing-desc",
      severity: "high",
      title: `${m.missing_description} pages missing a meta description`,
      detail: "Missing descriptions let Google auto-generate snippets, hurting CTR. Write a 70–160 char summary.",
      metric: `${m.missing_description} entities`,
    });
  if (m.missing_keywords > 0)
    out.push({
      id: "missing-kw",
      severity: "low",
      title: `${m.missing_keywords} products without target keywords`,
      detail: "Define focus keywords so content and metadata can be optimised against real demand.",
      metric: `${m.missing_keywords} products`,
    });
  if (m.missing_image > 0)
    out.push({
      id: "missing-img",
      severity: "medium",
      title: `${m.missing_image} pages without a social/OG image`,
      detail: "Pages without an image get plain, low-engagement previews when shared.",
      metric: `${m.missing_image} entities`,
    });

  const sc = raw.search_console;
  if (sc.available) {
    const striking = sc.striking_distance ?? [];
    if (striking.length > 0) {
      const top = striking[0];
      out.push({
        id: "striking",
        severity: "high",
        title: `${striking.length} keywords in striking distance (pos 4–20)`,
        detail: `Small content & link improvements can push these onto page 1. Biggest: “${top.keyword}” at position ${top.position} with ${top.impressions.toLocaleString()} impressions.`,
        metric: `${striking.length} keywords`,
      });
    }
    const ctrOpp = sc.ctr_opportunities ?? [];
    if (ctrOpp.length > 0) {
      const lost = ctrOpp.reduce((s, k) => s + Math.max(0, (k.expected_ctr ?? 0) - k.ctr) * k.impressions, 0);
      out.push({
        id: "ctr",
        severity: "medium",
        title: `${ctrOpp.length} keywords with below-expected CTR`,
        detail: `Rewriting titles/descriptions to match intent could recover ~${Math.round(lost).toLocaleString()} clicks/mo. These rank well but under-convert impressions.`,
        metric: `~${Math.round(lost).toLocaleString()} clicks`,
      });
    }
  } else {
    out.push({
      id: "connect-gsc",
      severity: "medium",
      title: "Search Console not connected",
      detail: "Connect Google Search Console to unlock keyword rankings, CTR optimisation and index coverage.",
    });
  }

  if (sitemap) {
    if (!sitemap.ok && sitemap.error)
      out.push({ id: "sitemap-err", severity: "high", title: "Sitemap is unreachable", detail: sitemap.error, metric: sitemap.url });
    if (sitemap.broken.length > 0)
      out.push({
        id: "broken-links",
        severity: "high",
        title: `${sitemap.broken.length} broken URLs in sitemap`,
        detail: "Broken pages waste crawl budget and lose rankings. Fix or remove them from the sitemap.",
        metric: `${sitemap.broken.length} / ${sitemap.checked} checked`,
      });
  }

  const sev = { high: 0, medium: 1, low: 2 };
  return out.sort((a, b) => sev[a.severity] - sev[b.severity]);
}

// ---------------- Executive summary ----------------

export interface SeoExecutive {
  health_score: number; // 0-100
  grade: string;
  organic_clicks: number;
  organic_impressions: number;
  avg_ctr: number;
  avg_position: number;
  organic_revenue: number;
  indexed_pages: number;
  metadata_completion: number; // 0-1
  headline: string;
  highlights: string[];
}

export function buildExecutive(raw: SeoRaw, opps: SeoOpportunity[]): SeoExecutive {
  const sc = raw.search_console;
  const totals = sc.totals ?? { clicks: 0, impressions: 0, ctr: 0, position: 0, keywords: 0 };
  const organicRevenue = raw.revenue_pages.reduce((s, p) => s + p.revenue, 0);
  const metaCompletion = raw.audit.total > 0 ? raw.audit.perfect / raw.audit.total : 0;

  // Composite health: 60% metadata quality, 25% CTR/position health, 15% no critical issues.
  const metaScore = raw.audit.avg_score; // already 0-100
  const posScore = sc.available && totals.position > 0 ? Math.max(0, 100 - (totals.position - 1) * 8) : 50;
  const critical = opps.filter((o) => o.severity === "high").length;
  const issuePenalty = Math.min(100, critical * 12);
  const health = Math.round(metaScore * 0.6 + posScore * 0.25 + Math.max(0, 100 - issuePenalty) * 0.15);

  const grade = health >= 90 ? "A" : health >= 80 ? "B" : health >= 70 ? "C" : health >= 55 ? "D" : "F";

  const highlights: string[] = [];
  highlights.push(`${raw.audit.perfect}/${raw.audit.total} pages have complete metadata (${Math.round(metaCompletion * 100)}%).`);
  if (sc.available)
    highlights.push(`${totals.clicks.toLocaleString()} organic clicks from ${totals.impressions.toLocaleString()} impressions at avg position ${totals.position}.`);
  if (organicRevenue > 0)
    highlights.push(`$${Math.round(organicRevenue).toLocaleString()} revenue attributed to organic landing pages.`);
  if (opps[0]) highlights.push(`Top opportunity: ${opps[0].title}.`);

  const headline =
    health >= 80
      ? "SEO foundations are strong — focus on rankings and CTR to compound organic growth."
      : health >= 60
        ? "SEO is solid but has clear, high-ROI gaps to close before scaling traffic."
        : "SEO needs attention — fix metadata and crawl issues to unlock organic growth.";

  return {
    health_score: health,
    grade,
    organic_clicks: totals.clicks,
    organic_impressions: totals.impressions,
    avg_ctr: totals.ctr,
    avg_position: totals.position,
    organic_revenue: organicRevenue,
    indexed_pages: sc.indexed_pages ?? 0,
    metadata_completion: metaCompletion,
    headline,
    highlights,
  };
}

// ---------------- Formatting helpers ----------------

export const fmtInt = (n: number) => new Intl.NumberFormat().format(Math.round(n || 0));
export const fmtPct = (n: number) => `${((n || 0) * 100).toFixed(1)}%`;
export const fmtMoney = (n: number) => "$" + new Intl.NumberFormat(undefined, { maximumFractionDigits: 0 }).format(Math.round(n || 0));
export const fmtPos = (n: number) => (n ? n.toFixed(1) : "—");

const ISSUE_LABEL: Record<string, string> = {
  missing_title: "Missing title",
  title_too_short: "Title too short",
  title_too_long: "Title too long",
  missing_description: "Missing description",
  description_too_short: "Description too short",
  description_too_long: "Description too long",
  missing_keywords: "No keywords",
  missing_image: "No image",
};
export const issueLabel = (i: string) => ISSUE_LABEL[i] ?? i;

export const entityEditPath: Record<SeoEntityType, (slug: string, id: string) => string> = {
  product: (_s, id) => `/admin-products?edit=${id}`,
  category: (_s, id) => `/admin-categories?edit=${id}`,
  page: (slug) => `/admin-cms?page=${slug}`,
  post: (slug) => `/admin-cms?post=${slug}`,
};

// ---------------- CSV exports ----------------

function csv(rows: (string | number)[][]): string {
  return rows
    .map((r) => r.map((c) => `"${String(c ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

export function auditToCsv(rows: SeoAuditRow[]): string {
  return csv([
    ["Type", "Title", "URL", "Score", "Issues"],
    ...rows.map((r) => [r.type, r.title ?? r.slug, r.url, r.score, r.issues.map(issueLabel).join("; ")]),
  ]);
}

export function keywordsToCsv(rows: KeywordRow[]): string {
  return csv([
    ["Keyword", "Clicks", "Impressions", "CTR", "Position"],
    ...rows.map((r) => [r.keyword, r.clicks, r.impressions, fmtPct(r.ctr), r.position]),
  ]);
}

export function revenueKeywordsToCsv(rows: RevenueKeyword[]): string {
  return csv([
    ["Keyword", "Organic clicks", "Attributed revenue"],
    ...rows.map((r) => [r.keyword, r.clicks, r.est_revenue]),
  ]);
}
