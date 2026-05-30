/**
 * Server-only SEO helpers (P2-C).
 *
 * Performs live network work that cannot run in SQL:
 *   - sitemap fetch + broken-link HEAD checks
 *   - Google Search Console pulls via the Lovable connector gateway
 *
 * NEVER import from client code. Reads secrets from process.env at call time.
 */

const GATEWAY = "https://connector-gateway.lovable.dev/google_search_console";

export interface SitemapHealthResult {
  ok: boolean;
  url: string;
  url_count: number;
  fetched_ok: number;
  broken: { url: string; status: number | string }[];
  checked: number;
  error?: string;
}

/** Fetch the sitemap and HEAD-check up to `limit` URLs for broken links. */
export async function checkSitemap(siteUrl: string, limit = 40): Promise<SitemapHealthResult> {
  const base = siteUrl.replace(/\/+$/, "");
  const sitemapUrl = `${base}/sitemap.xml`;
  const result: SitemapHealthResult = {
    ok: false,
    url: sitemapUrl,
    url_count: 0,
    fetched_ok: 0,
    broken: [],
    checked: 0,
  };

  let xml: string;
  try {
    const res = await fetch(sitemapUrl, { headers: { "User-Agent": "FoundOurMarket-SEO/1.0" } });
    if (!res.ok) {
      result.error = `Sitemap returned HTTP ${res.status}`;
      return result;
    }
    xml = await res.text();
  } catch (e) {
    result.error = `Could not fetch sitemap: ${(e as Error).message}`;
    return result;
  }

  const locs = Array.from(xml.matchAll(/<loc>([^<]+)<\/loc>/g)).map((m) => m[1]!.trim());
  result.url_count = locs.length;
  result.ok = true;
  if (locs.length === 0) return result;

  // Sample evenly across the sitemap so checks bound runtime but stay representative.
  const step = Math.max(1, Math.ceil(locs.length / limit));
  const sample = locs.filter((_, i) => i % step === 0).slice(0, limit);

  await Promise.all(
    sample.map(async (url) => {
      result.checked++;
      try {
        let res = await fetch(url, { method: "HEAD", headers: { "User-Agent": "FoundOurMarket-SEO/1.0" }, redirect: "follow" });
        // Some hosts reject HEAD — retry with a ranged GET.
        if (res.status === 405 || res.status === 501) {
          res = await fetch(url, { method: "GET", headers: { "User-Agent": "FoundOurMarket-SEO/1.0", Range: "bytes=0-0" }, redirect: "follow" });
        }
        if (res.status >= 400) result.broken.push({ url, status: res.status });
        else result.fetched_ok++;
      } catch (e) {
        result.broken.push({ url, status: (e as Error).name || "network_error" });
      }
    }),
  );

  return result;
}

// ---------------- Google Search Console ----------------

export interface GscRow {
  dimension: "query" | "page";
  keyword: string | null;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
}

export interface GscSyncResult {
  connected: boolean;
  query_rows: GscRow[];
  page_rows: GscRow[];
  error?: string;
}

function gscHeaders() {
  const lovable = process.env.LOVABLE_API_KEY;
  const gsc = process.env.GOOGLE_SEARCH_CONSOLE_API_KEY;
  if (!lovable || !gsc) return null;
  return {
    Authorization: `Bearer ${lovable}`,
    "X-Connection-Api-Key": gsc,
    "Content-Type": "application/json",
  };
}

async function gscQuery(siteUrl: string, dimension: "query" | "page", startDate: string, endDate: string, headers: Record<string, string>): Promise<GscRow[]> {
  const encoded = encodeURIComponent(siteUrl.endsWith("/") ? siteUrl : `${siteUrl}/`);
  const res = await fetch(`${GATEWAY}/webmasters/v3/sites/${encoded}/searchAnalytics/query`, {
    method: "POST",
    headers,
    body: JSON.stringify({ startDate, endDate, dimensions: [dimension], rowLimit: 250 }),
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Search Console ${dimension} query failed: HTTP ${res.status} ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as { rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[] };
  return (json.rows ?? []).map((r) => ({
    dimension,
    keyword: dimension === "query" ? r.keys[0] ?? null : null,
    page: dimension === "page" ? r.keys[0] ?? null : null,
    clicks: Math.round(r.clicks ?? 0),
    impressions: Math.round(r.impressions ?? 0),
    ctr: Number((r.ctr ?? 0).toFixed(4)),
    position: Number((r.position ?? 0).toFixed(1)),
  }));
}

/** Pull the last `days` of Search Console data for both query & page dimensions. */
export async function fetchSearchConsole(siteUrl: string, days = 28): Promise<GscSyncResult> {
  const headers = gscHeaders();
  if (!headers) return { connected: false, query_rows: [], page_rows: [], error: "Search Console is not connected." };

  const end = new Date();
  const start = new Date(end.getTime() - days * 86400_000);
  const fmt = (d: Date) => d.toISOString().slice(0, 10);

  try {
    const [query_rows, page_rows] = await Promise.all([
      gscQuery(siteUrl, "query", fmt(start), fmt(end), headers),
      gscQuery(siteUrl, "page", fmt(start), fmt(end), headers),
    ]);
    return { connected: true, query_rows, page_rows };
  } catch (e) {
    return { connected: true, query_rows: [], page_rows: [], error: (e as Error).message };
  }
}
