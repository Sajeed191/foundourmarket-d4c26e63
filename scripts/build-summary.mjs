#!/usr/bin/env node
/**
 * Build Summary — v2 (manifest-graph aware)
 *
 * Reads Vite's dist/client/.vite/manifest.json to walk the true chunk graph:
 *   - `imports`         → eager  (statically imported)
 *   - `dynamicImports`  → lazy   (import() at runtime)
 *
 * Computes:
 *   - Entry eager closure     (shared cost on every route)
 *   - Per-route eager closure (entry ∪ route static graph)
 *   - Async-only chunks       (never on any initial load — jspdf, maps, etc.)
 *
 * Budgets are evaluated against **eager** payload only. Async chunks are
 * reported separately so lazy work doesn't distort the health score.
 * Non-blocking by default. Set BUILD_BUDGETS=strict to fail on Critical.
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync, brotliCompressSync, constants as zlibConst } from "node:zlib";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, "dist", "client");
const MANIFEST_PATH = join(CLIENT_DIR, ".vite", "manifest.json");
const SNAPSHOT_DIR = join(ROOT, ".build-snapshots");
const SUMMARY_PATH = join(ROOT, "dist", "build-summary.json");

// ── Build System v1.1 budgets ──────────────────────────────────────
// Grounded in Snapshot 2026-07-15T08-36-54-333Z.json (canonical baseline).
// Only three payload budgets — each mapped to a clear owner:
//   entryEagerGz  → Platform architecture  (shared shell, changes rarely)
//   routeOnlyGz   → Feature teams          (per-route added weight)
//   largestRouteGz→ End-user worst case    (entry + biggest route-only)
// Async payload has no hard budget; it's tracked as a growth advisory
// (Warning if >10% growth between snapshots).
const KB = 1024;
const BUDGETS = {
  entryEagerGz:      { target: 360 * KB, label: "Entry Eager (shell)" },
  routeOnlyGz:       { target: 50 * KB,  label: "Worst Route-Only Weight" },
  largestRouteGz:    { target: 400 * KB, label: "Largest Route (initial)" },
  ssrBuildTimeSec:   { target: 60,       label: "SSR Build Time" },
};
const ASYNC_GROWTH_WARN_PCT = 10;


const fmt = (b) => b == null ? "—"
  : b < 1024 ? `${b} B`
  : b < 1024 * 1024 ? `${(b / 1024).toFixed(1)} KB`
  : `${(b / 1024 / 1024).toFixed(2)} MB`;

const scopeOf = (src) => !src ? "shared"
  : src.startsWith("src/routes/admin") ? "admin"
  : src.startsWith("src/routes/vendor") ? "vendor"
  : src.startsWith("src/routes/") ? "customer"
  : "shared";

const routeStem = (src) => src?.startsWith("src/routes/")
  ? src.replace(/^src\/routes\//, "").replace(/\?.*$/, "").replace(/\.[jt]sx?$/, "")
  : null;

function evalBudget(value, { target, label }) {
  if (value == null) return { label, value: null, target, status: "Skip" };
  const status = value <= target ? "OK" : value <= target * 1.25 ? "Warning" : "Critical";
  return { label, value, target, status };
}

function healthScore(budgets) {
  // v1.1 weights: user-experience weighted, not evenly spread.
  //   40% entry eager   — the shell every user pays
  //   30% route-only    — what feature teams control
  //   15% SSR time      — build ergonomics
  //   10% heap trend    — build reliability
  //    5% async growth  — advisory
  const w = {
    entryEagerGz: 40,
    routeOnlyGz: 30,
    ssrBuildTimeSec: 15,
    heapTrend: 10,
    asyncGrowth: 5,
  };
  let earned = 0, possible = 0;
  for (const [k, weight] of Object.entries(w)) {
    const b = budgets[k]; if (!b || b.status === "Skip") continue;
    possible += weight;
    if (b.status === "OK") earned += weight;
    else if (b.status === "Warning") earned += weight / 2;
  }
  if (!possible) return { score: null, band: "Unknown" };
  const score = Math.round((earned / possible) * 100);
  const band = score >= 90 ? "Good" : score >= 70 ? "Fair" : score >= 50 ? "Poor" : "Critical";
  return { score, band };
}


function latestSnapshot() {
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json")).sort();
  if (!files.length) return null;
  try { return JSON.parse(readFileSync(join(SNAPSHOT_DIR, files[files.length - 1]), "utf8")); }
  catch { return null; }
}

function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[build-summary] No manifest at ${relative(ROOT, MANIFEST_PATH)}. Set build.manifest=true in vite.config.ts.`);
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

  // Measure every JS chunk referenced in the manifest.
  const chunks = [];
  for (const [src, entry] of Object.entries(manifest)) {
    if (!entry.file?.endsWith(".js")) continue;
    const abs = join(CLIENT_DIR, entry.file);
    if (!existsSync(abs)) continue;
    const buf = readFileSync(abs);
    const size = {
      raw: buf.length,
      gzip: gzipSync(buf).length,
      brotli: brotliCompressSync(buf, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 } }).length,
    };
    let cssBytes = 0;
    for (const cssFile of entry.css ?? []) {
      const cssAbs = join(CLIENT_DIR, cssFile);
      if (existsSync(cssAbs)) cssBytes += statSync(cssAbs).size;
    }
    chunks.push({ ...entry, src, size, cssBytes });
  }
  const byFile = new Map(chunks.map((c) => [c.file, c]));

  const sumBytes = (fileSet) => {
    let raw = 0, gzip = 0, brotli = 0;
    for (const f of fileSet) {
      const c = byFile.get(f); if (!c) continue;
      raw += c.size.raw; gzip += c.size.gzip; brotli += c.size.brotli;
    }
    return { raw, gzip, brotli };
  };

  const eagerClosure = (startFiles) => {
    const seen = new Set(); const stack = [...startFiles];
    while (stack.length) {
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      const c = byFile.get(f); if (!c) continue;
      for (const imp of c.imports ?? []) stack.push(imp);
    }
    return seen;
  };

  // Entry chunk(s) — always eager, shared across every route.
  const entryChunks = chunks.filter((c) => c.isEntry);
  const entryFiles = entryChunks.map((c) => c.file);
  const entryEager = eagerClosure(entryFiles);
  const entryEagerBytes = sumBytes(entryEager);

  // Per-route closures.
  const routeChunks = chunks.filter((c) => c.src?.startsWith("src/routes/"));
  const routes = routeChunks.map((r) => {
    const eager = eagerClosure([r.file, ...entryFiles]);
    const routeOnly = new Set([...eager].filter((f) => !entryEager.has(f)));
    return {
      name: routeStem(r.src),
      src: r.src, file: r.file, scope: scopeOf(r.src),
      chunkSize: r.size, cssBytes: r.cssBytes,
      initialEager: sumBytes(eager),
      addedEager: sumBytes(routeOnly),
      dynamicImportCount: r.dynamicImports?.length ?? 0,
    };
  });

  // Async-only: chunks not reachable through any route's static graph.
  const anyEager = new Set(entryEager);
  for (const r of routeChunks) {
    for (const f of eagerClosure([r.file, ...entryFiles])) anyEager.add(f);
  }
  const asyncOnly = chunks.filter((c) => !anyEager.has(c.file))
    .sort((a, b) => b.size.gzip - a.size.gzip);
  const asyncOnlyGz = asyncOnly.reduce((a, c) => a + c.size.gzip, 0);

  // Shared eager = entry closure minus the entry chunks.
  const sharedEager = [...entryEager]
    .filter((f) => !entryFiles.includes(f))
    .map((f) => byFile.get(f))
    .filter(Boolean)
    .sort((a, b) => b.size.gzip - a.size.gzip);

  const totalJs = chunks.reduce((a, c) => a + c.size.raw, 0);
  const totalJsGz = chunks.reduce((a, c) => a + c.size.gzip, 0);
  const totalJsBr = chunks.reduce((a, c) => a + c.size.brotli, 0);
  const totalCss = chunks.reduce((a, c) => a + c.cssBytes, 0);

  routes.sort((a, b) => b.initialEager.gzip - a.initialEager.gzip);
  const largestRoute = routes[0];
  const largestShared = sharedEager[0];

  // Worst route-only weight — the actionable feature-team knob.
  const worstRouteOnly = routes.reduce((max, r) =>
    r.addedEager.gzip > (max?.addedEager.gzip ?? -1) ? r : max, null);

  const heapMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const ssrBuildTimeSec = process.env.SSR_BUILD_TIME_SEC ? Number(process.env.SSR_BUILD_TIME_SEC) : null;
  const prev = latestSnapshot();

  let heapTrend = { label: "Peak Heap Trend", value: heapMb, target: null, status: "OK" };
  if (prev?.peakHeapMb) {
    const growth = (heapMb - prev.peakHeapMb) / prev.peakHeapMb;
    heapTrend = { label: "Peak Heap Trend", value: heapMb, previous: prev.peakHeapMb,
      growthPct: +(growth * 100).toFixed(1), target: null,
      status: growth > 0.2 ? "Warning" : "OK" };
  }

  // Async payload — advisory only. Warns when it grows > ASYNC_GROWTH_WARN_PCT
  // between snapshots. No hard budget: lazy code doesn't affect first paint.
  let asyncGrowth = { label: "Async Payload Growth", value: asyncOnlyGz, previous: null,
    growthPct: null, target: null, status: "OK" };
  if (prev?.totals?.asyncOnlyGz) {
    const growthPct = +(((asyncOnlyGz - prev.totals.asyncOnlyGz) / prev.totals.asyncOnlyGz) * 100).toFixed(1);
    asyncGrowth = { label: "Async Payload Growth", value: asyncOnlyGz,
      previous: prev.totals.asyncOnlyGz, growthPct, target: null,
      status: growthPct > ASYNC_GROWTH_WARN_PCT ? "Warning" : "OK" };
  }

  const budgets = {
    entryEagerGz:    evalBudget(entryEagerBytes.gzip, BUDGETS.entryEagerGz),
    routeOnlyGz:     evalBudget(worstRouteOnly?.addedEager.gzip ?? null, BUDGETS.routeOnlyGz),
    largestRouteGz:  evalBudget(largestRoute?.initialEager.gzip ?? null, BUDGETS.largestRouteGz),
    ssrBuildTimeSec: evalBudget(ssrBuildTimeSec, BUDGETS.ssrBuildTimeSec),
    heapTrend,
    asyncGrowth,
  };


  const health = healthScore(budgets);
  const anyCritical = Object.values(budgets).some((b) => b.status === "Critical");
  const anyWarning = Object.values(budgets).some((b) => b.status === "Warning");
  const status = anyCritical ? "Critical" : anyWarning ? "Warning" : "OK";

  const snapshot = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || process.env.COMMIT_SHA || null,
    schema: 2,
    totals: {
      js: totalJs, jsGz: totalJsGz, jsBr: totalJsBr, css: totalCss,
      files: chunks.length,
      entryEagerGz: entryEagerBytes.gzip,
      asyncOnlyGz,
      asyncOnlyChunks: asyncOnly.length,
    },
    entry: { files: entryFiles, eagerBytes: entryEagerBytes, chunkCount: entryEager.size },
    largestRoute: largestRoute && {
      name: largestRoute.name, file: largestRoute.file, scope: largestRoute.scope,
      chunkGz: largestRoute.chunkSize.gzip,
      addedEagerGz: largestRoute.addedEager.gzip,
      initialEagerGz: largestRoute.initialEager.gzip,
    },
    largestSharedChunk: largestShared && {
      file: largestShared.file, gzip: largestShared.size.gzip, raw: largestShared.size.raw,
    },
    // Backwards-compat with v1 diff script: expose a `routes` array with a
    // `gzip` field that reflects the *initial eager* payload (the meaningful
    // metric) plus richer breakdown fields.
    routes: routes.map((r) => ({
      name: r.name, scope: r.scope,
      gzip: r.initialEager.gzip,       // ← used by build-diff.mjs
      chunkGz: r.chunkSize.gzip,
      addedEagerGz: r.addedEager.gzip,
      initialEagerGz: r.initialEager.gzip,
      cssBytes: r.cssBytes,
      dynamicImports: r.dynamicImportCount,
    })),
    shared: sharedEager.map((c) => ({ name: c.file, gzip: c.size.gzip, raw: c.size.raw })),
    sharedEager: sharedEager.map((c) => ({ file: c.file, gzip: c.size.gzip, raw: c.size.raw })),
    asyncOnly: asyncOnly.map((c) => ({ file: c.file, src: c.src, gzip: c.size.gzip, raw: c.size.raw })),
    budgets, health,
    peakHeapMb: heapMb, ssrBuildTimeSec, status,
  };

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const stamp = snapshot.timestamp.replace(/[:.]/g, "-");
  writeFileSync(join(SNAPSHOT_DIR, `${stamp}.json`), JSON.stringify(snapshot, null, 2));
  writeFileSync(SUMMARY_PATH, JSON.stringify(snapshot, null, 2));

  const icon = (s) => s === "OK" ? "✓" : s === "Warning" ? "⚠" : s === "Critical" ? "✗" : "·";
  const line = (l, v) => `  ${l.padEnd(24)} ${v}`;

  console.log("\n─── Build Summary (manifest graph) ────────────");
  console.log(line("Total JS", `${fmt(totalJs)}  (${fmt(totalJsGz)} gz · ${fmt(totalJsBr)} br)`));
  console.log(line("Entry eager (shared)", `${fmt(entryEagerBytes.gzip)} gz  · ${entryEager.size} chunks`));
  console.log(line("Async-only payload", `${fmt(asyncOnlyGz)} gz  · ${asyncOnly.length} chunks`));
  console.log(line("Total CSS", fmt(totalCss)));
  console.log(line("Largest Route", largestRoute
    ? `${largestRoute.name}  (${fmt(largestRoute.initialEager.gzip)} initial · +${fmt(largestRoute.addedEager.gzip)} route-only)`
    : "—"));
  console.log(line("Largest Shared Eager", largestShared ? `${largestShared.file}  (${fmt(largestShared.size.gzip)} gz)` : "—"));
  console.log(line("Peak Heap (RSS)", `${heapMb} MB`));

  console.log("\n  Budgets (eager-only — async chunks excluded):");
  for (const b of Object.values(budgets)) {
    const val = b.value == null ? "—"
      : b.target && typeof b.value === "number" && b.target > 10_000 ? `${fmt(b.value)} / ${fmt(b.target)} gz`
      : b.target ? `${b.value} / ${b.target}`
      : `${b.value}`;
    console.log(`    ${icon(b.status)}  ${b.label.padEnd(24)} ${val}`);
  }

  console.log("\n  Build Health:");
  console.log(`    ${health.score ?? "—"} / 100    ${health.band}`);

  console.log("\n  Top 5 routes by initial eager gzip:");
  routes.slice(0, 5).forEach((r) => console.log(
    `    ${fmt(r.initialEager.gzip).padStart(9)}  ${r.name.padEnd(40)} (+${fmt(r.addedEager.gzip)} route-only)`,
  ));

  console.log("\n  Top 5 shared eager chunks:");
  sharedEager.slice(0, 5).forEach((c) => console.log(`    ${fmt(c.size.gzip).padStart(9)}  ${c.file}`));

  console.log("\n  Top 5 async-only chunks (paid on demand):");
  asyncOnly.slice(0, 5).forEach((c) => console.log(
    `    ${fmt(c.size.gzip).padStart(9)}  ${c.file}${c.src ? `   [${c.src}]` : ""}`,
  ));

  console.log(`\n  Report:   dist/build-report.html`);
  console.log(`  Snapshot: .build-snapshots/${stamp}.json`);
  console.log(`  Status:   ${status}`);
  console.log("───────────────────────────────────────────────\n");

  if (process.env.BUILD_BUDGETS === "strict" && anyCritical) {
    console.error("BUILD_BUDGETS=strict and one or more budgets are Critical.");
    process.exit(1);
  }
}

main();
