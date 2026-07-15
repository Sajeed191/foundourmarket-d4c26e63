#!/usr/bin/env node
/**
 * Build Summary — Phase 2 / Phase 3 (Build Observability + Budgets)
 *
 * Walks emitted client assets, computes route + shared chunk metrics
 * (raw + gzip + brotli), evaluates per-budget compliance, and archives
 * a JSON snapshot for regression diffing.
 *
 * Contract: pure observability. Never mutates build output.
 * Non-blocking by default. Set BUILD_BUDGETS=strict to exit non-zero
 * on any Critical budget violation.
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync, brotliCompressSync, constants as zlibConst } from "node:zlib";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, "dist", "client", "assets");
const SNAPSHOT_DIR = join(ROOT, ".build-snapshots");
const SUMMARY_PATH = join(ROOT, "dist", "build-summary.json");

// ── Budgets (gzip bytes; SSR seconds; heap MB) ─────────────────────
// Warning at target, Critical at target * 1.25. Tune here.
const KB = 1024;
const BUDGETS = {
  largestRouteGz:      { target: 300 * KB, label: "Largest Route" },
  largestSharedGz:     { target: 250 * KB, label: "Largest Shared Chunk" },
  customerInitialGz:   { target: 200 * KB, label: "Initial Customer Bundle" },
  vendorInitialGz:     { target: 250 * KB, label: "Vendor Initial Bundle" },
  adminInitialGz:      { target: 350 * KB, label: "Admin Initial Bundle" },
  ssrBuildTimeSec:     { target: 60,       label: "SSR Build Time" },
};

// ── Helpers ────────────────────────────────────────────────────────
function walk(dir) {
  if (!existsSync(dir)) return [];
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    const s = statSync(p);
    if (s.isDirectory()) out.push(...walk(p));
    else out.push({ path: p, size: s.size });
  }
  return out;
}

function fmt(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function classify(file) {
  const base = file.split("/").pop() ?? "";
  const isJs = base.endsWith(".js");
  const isCss = base.endsWith(".css");
  const stem = base.replace(/-[A-Za-z0-9_]{6,}\.(js|css)$/, "");
  const routeLike = /^(admin|vendor|account|category|products|checkout|orders|blog|pages|api|auth|signup|signin|login|deals|wishlist|compare|recently)/.test(stem)
    || /route|page|index/.test(stem);
  const scope = /^admin/.test(stem) ? "admin"
    : /^vendor/.test(stem) ? "vendor"
    : routeLike ? "customer"
    : "shared";
  return { base, isJs, isCss, stem, routeLike, scope };
}

function evalBudget(value, { target, label }) {
  if (value == null) return { label, value: null, target, status: "Skip" };
  const status = value <= target ? "OK"
    : value <= target * 1.25 ? "Warning"
    : "Critical";
  return { label, value, target, status };
}

function healthScore(budgets) {
  // Simple weighted rubric — every OK = full weight, Warning = half, Critical = 0.
  const weights = {
    largestRouteGz: 20,
    largestSharedGz: 20,
    customerInitialGz: 20,
    vendorInitialGz: 10,
    adminInitialGz: 10,
    ssrBuildTimeSec: 10,
    heapTrend: 10,
  };
  let earned = 0, possible = 0;
  for (const [k, w] of Object.entries(weights)) {
    const b = budgets[k];
    if (!b || b.status === "Skip") continue;
    possible += w;
    if (b.status === "OK") earned += w;
    else if (b.status === "Warning") earned += w / 2;
  }
  if (possible === 0) return { score: null, band: "Unknown" };
  const score = Math.round((earned / possible) * 100);
  const band = score >= 90 ? "Good" : score >= 70 ? "Fair" : score >= 50 ? "Poor" : "Critical";
  return { score, band };
}

// ── Main ───────────────────────────────────────────────────────────
function main() {
  const files = walk(CLIENT_DIR);
  if (files.length === 0) {
    console.warn("[build-summary] No client assets found — skipping.");
    return;
  }

  const rows = files.map((f) => {
    const rel = relative(CLIENT_DIR, f.path).replaceAll("\\", "/");
    const cls = classify(rel);
    let gzip = 0, brotli = 0;
    if (cls.isJs || cls.isCss) {
      const buf = readFileSync(f.path);
      gzip = gzipSync(buf).length;
      brotli = brotliCompressSync(buf, {
        params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 },
      }).length;
    }
    return { file: rel, size: f.size, gzip, brotli, ...cls };
  });

  const jsRows = rows.filter((r) => r.isJs);
  const totalJs = jsRows.reduce((a, b) => a + b.size, 0);
  const totalJsGz = jsRows.reduce((a, b) => a + b.gzip, 0);
  const totalJsBr = jsRows.reduce((a, b) => a + b.brotli, 0);
  const totalCss = rows.filter((r) => r.isCss).reduce((a, b) => a + b.size, 0);

  const routeChunks = jsRows.filter((r) => r.routeLike).sort((a, b) => b.gzip - a.gzip);
  const sharedChunks = jsRows.filter((r) => !r.routeLike).sort((a, b) => b.gzip - a.gzip);

  const largestRoute = routeChunks[0];
  const largestShared = sharedChunks[0];

  // Initial bundle per scope = the entry-ish shared chunks + the largest
  // route of that scope. This is a conservative approximation; refine when
  // we start splitting.
  const sharedInitialGz = sharedChunks.slice(0, 3).reduce((a, b) => a + b.gzip, 0);
  const scopeInitial = (scope) => {
    const top = routeChunks.find((r) => r.scope === scope);
    return top ? sharedInitialGz + top.gzip : null;
  };

  // Heap + build time (best effort — Vite doesn't expose SSR time here).
  const heapMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const ssrBuildTimeSec = process.env.SSR_BUILD_TIME_SEC
    ? Number(process.env.SSR_BUILD_TIME_SEC)
    : null;

  // Heap trend vs previous snapshot (>20% growth → Warning).
  const prev = latestSnapshot();
  let heapTrend = { label: "Peak Heap Trend", value: heapMb, target: null, status: "OK" };
  if (prev?.peakHeapMb) {
    const growth = (heapMb - prev.peakHeapMb) / prev.peakHeapMb;
    heapTrend = {
      label: "Peak Heap Trend",
      value: heapMb,
      previous: prev.peakHeapMb,
      growthPct: +(growth * 100).toFixed(1),
      target: null,
      status: growth > 0.2 ? "Warning" : "OK",
    };
  }

  const budgets = {
    largestRouteGz:    evalBudget(largestRoute?.gzip ?? null, BUDGETS.largestRouteGz),
    largestSharedGz:   evalBudget(largestShared?.gzip ?? null, BUDGETS.largestSharedGz),
    customerInitialGz: evalBudget(scopeInitial("customer"), BUDGETS.customerInitialGz),
    vendorInitialGz:   evalBudget(scopeInitial("vendor"), BUDGETS.vendorInitialGz),
    adminInitialGz:    evalBudget(scopeInitial("admin"), BUDGETS.adminInitialGz),
    ssrBuildTimeSec:   evalBudget(ssrBuildTimeSec, BUDGETS.ssrBuildTimeSec),
    heapTrend,
  };

  const health = healthScore(budgets);

  const anyCritical = Object.values(budgets).some((b) => b.status === "Critical");
  const anyWarning = Object.values(budgets).some((b) => b.status === "Warning");
  const status = anyCritical ? "Critical" : anyWarning ? "Warning" : "OK";

  const snapshot = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || process.env.COMMIT_SHA || null,
    totals: { js: totalJs, jsGz: totalJsGz, jsBr: totalJsBr, css: totalCss, files: rows.length },
    largestRoute: largestRoute && { name: largestRoute.stem, file: largestRoute.file, size: largestRoute.size, gzip: largestRoute.gzip, brotli: largestRoute.brotli },
    largestSharedChunk: largestShared && { name: largestShared.stem, file: largestShared.file, size: largestShared.size, gzip: largestShared.gzip, brotli: largestShared.brotli },
    routes: routeChunks.map((r) => ({ name: r.stem, scope: r.scope, size: r.size, gzip: r.gzip, brotli: r.brotli })),
    shared: sharedChunks.map((r) => ({ name: r.stem, size: r.size, gzip: r.gzip, brotli: r.brotli })),
    budgets,
    health,
    peakHeapMb: heapMb,
    ssrBuildTimeSec,
    status,
  };

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const stamp = snapshot.timestamp.replace(/[:.]/g, "-");
  writeFileSync(join(SNAPSHOT_DIR, `${stamp}.json`), JSON.stringify(snapshot, null, 2));
  writeFileSync(SUMMARY_PATH, JSON.stringify(snapshot, null, 2));

  // ── Console report ───────────────────────────────────────────────
  const icon = (s) => s === "OK" ? "✓" : s === "Warning" ? "⚠" : s === "Critical" ? "✗" : "·";
  const line = (l, v) => `  ${l.padEnd(24)} ${v}`;

  console.log("\n─── Build Summary ─────────────────────────────");
  console.log(line("Total JS", `${fmt(totalJs)}  (${fmt(totalJsGz)} gz · ${fmt(totalJsBr)} br)`));
  console.log(line("Total CSS", fmt(totalCss)));
  console.log(line("Largest Route", largestRoute ? `${largestRoute.stem}  (${fmt(largestRoute.gzip)} gz)` : "—"));
  console.log(line("Largest Shared", largestShared ? `${largestShared.stem}  (${fmt(largestShared.gzip)} gz)` : "—"));
  console.log(line("Peak Heap (RSS)", `${heapMb} MB`));

  console.log("\n  Budgets:");
  for (const b of Object.values(budgets)) {
    const val = b.value == null ? "—"
      : b.target && typeof b.value === "number" && b.target > 10_000
        ? `${fmt(b.value)} / ${fmt(b.target)} gz`
        : b.target
          ? `${b.value} / ${b.target}`
          : `${b.value}`;
    console.log(`    ${icon(b.status)}  ${b.label.padEnd(24)} ${val}`);
  }

  console.log("\n  Build Health:");
  console.log(`    ${health.score ?? "—"} / 100    ${health.band}`);

  console.log("\n  Top 5 routes (gzip):");
  routeChunks.slice(0, 5).forEach((r) => console.log(`    ${fmt(r.gzip).padStart(9)}  ${r.stem}`));
  console.log("\n  Top 5 shared (gzip):");
  sharedChunks.slice(0, 5).forEach((r) => console.log(`    ${fmt(r.gzip).padStart(9)}  ${r.stem}`));
  console.log(`\n  Report:   dist/build-report.html`);
  console.log(`  Snapshot: .build-snapshots/${stamp}.json`);
  console.log(`  Status:   ${status}`);
  console.log("───────────────────────────────────────────────\n");

  if (process.env.BUILD_BUDGETS === "strict" && anyCritical) {
    console.error("BUILD_BUDGETS=strict and one or more budgets are Critical.");
    process.exit(1);
  }
}

function latestSnapshot() {
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(SNAPSHOT_DIR, files[files.length - 1]), "utf8")); }
  catch { return null; }
}

main();
