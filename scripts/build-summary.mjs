#!/usr/bin/env node
/**
 * Build Summary — Phase 2 / Phase 3 (Build Observability + Budgets)
 *
 * Reads Vite's manifest.json to walk the true chunk graph:
 *   - `imports`         → eager (statically imported)
 *   - `dynamicImports`  → lazy  (import() at runtime)
 *
 * From that graph we compute:
 *   - Eager set per entry (static-import closure from the entry chunk)
 *   - Eager set per route (entry eager ∪ route file's static-import closure)
 *   - Async-only set (chunks reachable only through dynamicImports — never
 *     part of any initial load)
 *
 * Contract: pure observability. Never mutates build output.
 * Non-blocking by default. Set BUILD_BUDGETS=strict to exit non-zero
 * on any Critical budget violation.
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { gzipSync, brotliCompressSync, constants as zlibConst } from "node:zlib";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, "dist", "client");
const ASSETS_DIR = join(CLIENT_DIR, "assets");
const MANIFEST_PATH = join(CLIENT_DIR, ".vite", "manifest.json");
const SNAPSHOT_DIR = join(ROOT, ".build-snapshots");
const SUMMARY_PATH = join(ROOT, "dist", "build-summary.json");

// ── Budgets (gzip bytes; SSR seconds; heap MB) ─────────────────────
const KB = 1024;
const BUDGETS = {
  largestRouteGz:    { target: 300 * KB, label: "Largest Route" },
  largestSharedGz:   { target: 250 * KB, label: "Largest Shared Chunk" },
  customerInitialGz: { target: 200 * KB, label: "Initial Customer Bundle" },
  vendorInitialGz:   { target: 250 * KB, label: "Vendor Initial Bundle" },
  adminInitialGz:    { target: 350 * KB, label: "Admin Initial Bundle" },
  ssrBuildTimeSec:   { target: 60,       label: "SSR Build Time" },
};

// ── Helpers ────────────────────────────────────────────────────────
function fmt(bytes) {
  if (bytes == null) return "—";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`;
}

function scopeOf(src) {
  // Classify a manifest entry by source path.
  if (!src) return "shared";
  if (src.startsWith("src/routes/admin")) return "admin";
  if (src.startsWith("src/routes/vendor")) return "vendor";
  if (src.startsWith("src/routes/")) return "customer";
  return "shared";
}

function routeStem(src) {
  // src/routes/admin-shipments.tsx → admin-shipments
  if (!src?.startsWith("src/routes/")) return null;
  return src.replace(/^src\/routes\//, "").replace(/\.[jt]sx?$/, "");
}

function evalBudget(value, { target, label }) {
  if (value == null) return { label, value: null, target, status: "Skip" };
  const status = value <= target ? "OK"
    : value <= target * 1.25 ? "Warning"
    : "Critical";
  return { label, value, target, status };
}

function healthScore(budgets) {
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

function latestSnapshot() {
  if (!existsSync(SNAPSHOT_DIR)) return null;
  const files = readdirSync(SNAPSHOT_DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length === 0) return null;
  try { return JSON.parse(readFileSync(join(SNAPSHOT_DIR, files[files.length - 1]), "utf8")); }
  catch { return null; }
}

// ── Main ───────────────────────────────────────────────────────────
function main() {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[build-summary] No manifest at ${relative(ROOT, MANIFEST_PATH)}. Enable build.manifest in vite.config.ts.`);
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));

  // Build an index: file (chunk path relative to dist/client) → entry
  const byFile = new Map();
  for (const [src, entry] of Object.entries(manifest)) {
    if (!entry.file) continue;
    byFile.set(entry.file, { ...entry, src });
  }

  // Measure sizes for every JS chunk referenced in the manifest.
  function sizeFor(chunk) {
    const abs = join(CLIENT_DIR, chunk.file);
    if (!existsSync(abs)) return { raw: 0, gzip: 0, brotli: 0 };
    const buf = readFileSync(abs);
    return {
      raw: buf.length,
      gzip: gzipSync(buf).length,
      brotli: brotliCompressSync(buf, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 } }).length,
    };
  }

  // Attach sizes and CSS to every chunk.
  const chunks = [];
  for (const entry of byFile.values()) {
    if (!entry.file.endsWith(".js")) continue;
    const size = sizeFor(entry);
    let cssSize = 0;
    for (const cssFile of entry.css ?? []) {
      const abs = join(CLIENT_DIR, cssFile);
      if (existsSync(abs)) cssSize += statSync(abs).size;
    }
    chunks.push({ ...entry, size, cssSize });
  }
  const byFileJs = new Map(chunks.map((c) => [c.file, c]));

  // Walk static-import closure from a starting set of chunks.
  function eagerClosure(startFiles) {
    const seen = new Set();
    const stack = [...startFiles];
    while (stack.length) {
      const f = stack.pop();
      if (!f || seen.has(f)) continue;
      seen.add(f);
      const c = byFileJs.get(f);
      if (!c) continue;
      for (const imp of c.imports ?? []) stack.push(imp);
    }
    return seen;
  }

  // Entry chunk(s) — always eager, shared across every route.
  const entryChunks = chunks.filter((c) => c.isEntry);
  const entryFiles = entryChunks.map((c) => c.file);
  const entryEager = eagerClosure(entryFiles);
  const entryEagerBytes = sumBytes(entryEager);

  // Route chunks — anything under src/routes/**
  const routeChunks = chunks.filter((c) => c.src?.startsWith("src/routes/"));
  const routes = routeChunks.map((r) => {
    const eager = eagerClosure([r.file, ...entryFiles]);
    const routeOnlyEager = new Set([...eager].filter((f) => !entryEager.has(f)));
    return {
      name: routeStem(r.src),
      src: r.src,
      file: r.file,
      scope: scopeOf(r.src),
      // Size of this route's own chunk (excluding entry + shared).
      chunkSize: r.size,
      cssSize: r.cssSize,
      // Full eager payload the user downloads to open this route.
      initialEager: sumBytes(eager),
      // Extra eager weight this route adds on top of the entry closure.
      addedEager: sumBytes(routeOnlyEager),
      dynamicImports: r.dynamicImports?.length ?? 0,
    };
  });

  // Async-only chunks — reachable only through dynamicImports (never eager
  // from any route). Compute by taking the union of every route's eager set
  // and diffing against all JS chunks.
  const anyEager = new Set(entryEager);
  for (const r of routeChunks) {
    for (const f of eagerClosure([r.file, ...entryFiles])) anyEager.add(f);
  }
  const asyncOnly = chunks.filter((c) => !anyEager.has(c.file));
  const totalAsyncGz = asyncOnly.reduce((a, c) => a + c.size.gzip, 0);

  // Shared eager chunks = entryEager minus the entry chunks themselves.
  const sharedEagerChunks = [...entryEager]
    .filter((f) => !entryFiles.includes(f))
    .map((f) => byFileJs.get(f))
    .filter(Boolean)
    .sort((a, b) => b.size.gzip - a.size.gzip);

  const totalJs = chunks.reduce((a, c) => a + c.size.raw, 0);
  const totalJsGz = chunks.reduce((a, c) => a + c.size.gzip, 0);
  const totalJsBr = chunks.reduce((a, c) => a + c.size.brotli, 0);
  const totalCss = chunks.reduce((a, c) => a + c.cssSize, 0);

  routes.sort((a, b) => b.initialEager.gzip - a.initialEager.gzip);
  const largestRoute = routes[0];
  const largestShared = sharedEagerChunks[0];

  const scopeInitial = (scope) => {
    const top = routes.find((r) => r.scope === scope);
    return top?.initialEager.gzip ?? null;
  };

  const heapMb = Math.round(process.memoryUsage().rss / 1024 / 1024);
  const ssrBuildTimeSec = process.env.SSR_BUILD_TIME_SEC ? Number(process.env.SSR_BUILD_TIME_SEC) : null;

  const prev = latestSnapshot();
  let heapTrend = { label: "Peak Heap Trend", value: heapMb, target: null, status: "OK" };
  if (prev?.peakHeapMb) {
    const growth = (heapMb - prev.peakHeapMb) / prev.peakHeapMb;
    heapTrend = {
      label: "Peak Heap Trend", value: heapMb, previous: prev.peakHeapMb,
      growthPct: +(growth * 100).toFixed(1), target: null,
      status: growth > 0.2 ? "Warning" : "OK",
    };
  }

  const budgets = {
    largestRouteGz:    evalBudget(largestRoute?.initialEager.gzip ?? null, BUDGETS.largestRouteGz),
    largestSharedGz:   evalBudget(largestShared?.size.gzip ?? null, BUDGETS.largestSharedGz),
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
    schema: 2, // v2: uses manifest graph
    totals: {
      js: totalJs, jsGz: totalJsGz, jsBr: totalJsBr,
      css: totalCss, files: chunks.length,
      entryEagerGz: entryEagerBytes.gzip,
      asyncOnlyGz: totalAsyncGz,
    },
    entry: {
      files: entryFiles,
      eagerBytes: entryEagerBytes,
      chunkCount: entryEager.size,
    },
    largestRoute: largestRoute && {
      name: largestRoute.name, file: largestRoute.file, scope: largestRoute.scope,
      chunkGz: largestRoute.chunkSize.gzip,
      addedEagerGz: largestRoute.addedEager.gzip,
      initialEagerGz: largestRoute.initialEager.gzip,
    },
    largestSharedChunk: largestShared && {
      file: largestShared.file, gzip: largestShared.size.gzip, raw: largestShared.size.raw,
    },
    routes: routes.map((r) => ({
      name: r.name, scope: r.scope,
      chunkGz: r.chunkSize.gzip, addedEagerGz: r.addedEager.gzip,
      initialEagerGz: r.initialEager.gzip, cssBytes: r.cssSize,
      dynamicImports: r.dynamicImports,
    })),
    sharedEager: sharedEagerChunks.map((c) => ({ file: c.file, gzip: c.size.gzip, raw: c.size.raw })),
    asyncOnly: asyncOnly
      .sort((a, b) => b.size.gzip - a.size.gzip)
      .map((c) => ({ file: c.file, src: c.src, gzip: c.size.gzip, raw: c.size.raw })),
    budgets, health,
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

  console.log("\n─── Build Summary (manifest graph) ────────────");
  console.log(line("Total JS", `${fmt(totalJs)}  (${fmt(totalJsGz)} gz · ${fmt(totalJsBr)} br)`));
  console.log(line("Entry eager (shared)", `${fmt(entryEagerBytes.gzip)} gz  across ${entryEager.size} chunks`));
  console.log(line("Async-only payload", `${fmt(totalAsyncGz)} gz  across ${asyncOnly.length} chunks`));
  console.log(line("Total CSS", fmt(totalCss)));
  console.log(line("Largest Route", largestRoute
    ? `${largestRoute.name}  (${fmt(largestRoute.initialEager.gzip)} initial gz, +${fmt(largestRoute.addedEager.gzip)} route-only)`
    : "—"));
  console.log(line("Largest Shared Eager", largestShared ? `${largestShared.file}  (${fmt(largestShared.size.gzip)} gz)` : "—"));
  console.log(line("Peak Heap (RSS)", `${heapMb} MB`));

  console.log("\n  Budgets (eager only — async chunks excluded):");
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

  console.log("\n  Top 5 routes by initial eager gzip:");
  routes.slice(0, 5).forEach((r) => console.log(
    `    ${fmt(r.initialEager.gzip).padStart(9)}  ${r.name.padEnd(40)} (+${fmt(r.addedEager.gzip)} route-only)`,
  ));

  console.log("\n  Top 5 shared eager chunks:");
  sharedEagerChunks.slice(0, 5).forEach((c) => console.log(`    ${fmt(c.size.gzip).padStart(9)}  ${c.file}`));

  console.log("\n  Top 5 async-only chunks (paid on demand):");
  asyncOnly.sort((a, b) => b.size.gzip - a.size.gzip).slice(0, 5).forEach((c) => console.log(
    `    ${fmt(c.size.gzip).padStart(9)}  ${c.file}   ${c.src ? `[${c.src}]` : ""}`,
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

function sumBytes(fileSet) {
  let raw = 0, gzip = 0, brotli = 0;
  for (const f of fileSet) {
    const c = byFileJsGlobal.get(f);
    if (!c) continue;
    raw += c.size.raw; gzip += c.size.gzip; brotli += c.size.brotli;
  }
  return { raw, gzip, brotli };
}

// small hack: expose byFileJs to sumBytes without threading it everywhere
let byFileJsGlobal = new Map();
const _origMain = main;
function wrappedMain() {
  // shim: rebuild byFileJsGlobal reference inside main() via closure below
  _origMain();
}
// simpler: re-implement sumBytes as closure inside main. Refactor:
(function run() {
  if (!existsSync(MANIFEST_PATH)) {
    console.warn(`[build-summary] No manifest at ${relative(ROOT, MANIFEST_PATH)}. Enable build.manifest in vite.config.ts.`);
    return;
  }
  const manifest = JSON.parse(readFileSync(MANIFEST_PATH, "utf8"));
  const byFile = new Map();
  for (const [src, entry] of Object.entries(manifest)) {
    if (!entry.file) continue;
    byFile.set(entry.file, { ...entry, src });
  }
  function sizeFor(chunk) {
    const abs = join(CLIENT_DIR, chunk.file);
    if (!existsSync(abs)) return { raw: 0, gzip: 0, brotli: 0 };
    const buf = readFileSync(abs);
    return {
      raw: buf.length,
      gzip: gzipSync(buf).length,
      brotli: brotliCompressSync(buf, { params: { [zlibConst.BROTLI_PARAM_QUALITY]: 5 } }).length,
    };
  }
  const chunks = [];
  for (const entry of byFile.values()) {
    if (!entry.file.endsWith(".js")) continue;
    const size = sizeFor(entry);
    let cssSize = 0;
    for (const cssFile of entry.css ?? []) {
      const abs = join(CLIENT_DIR, cssFile);
      if (existsSync(abs)) cssSize += statSync(abs).size;
    }
    chunks.push({ ...entry, size, cssSize });
  }
  byFileJsGlobal = new Map(chunks.map((c) => [c.file, c]));
  main();
})();
