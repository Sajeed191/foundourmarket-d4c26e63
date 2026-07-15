#!/usr/bin/env node
/**
 * Build Summary — Phase 2 (Build Observability)
 *
 * Post-build script that walks the emitted client/SSR assets, computes
 * route-level and shared-chunk metrics, and archives a JSON snapshot
 * alongside a human-readable summary. Complements
 * `dist/build-report.html` (rollup-plugin-visualizer) with numbers you
 * can diff between commits.
 *
 * Contract: pure observability. No mutation of build output. Safe to
 * run or skip without affecting the shipped bundle.
 */
import { readdirSync, statSync, mkdirSync, writeFileSync, existsSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOT = process.cwd();
const CLIENT_DIR = join(ROOT, "dist", "client", "assets");
const SNAPSHOT_DIR = join(ROOT, ".build-snapshots");
const SUMMARY_PATH = join(ROOT, "dist", "build-summary.json");

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

// Route chunk naming pattern from tanstack router + Vite:
// e.g. assets/admin-catalog-intelligence-XyZ.js
function classify(file) {
  const base = file.split("/").pop() ?? "";
  const isJs = base.endsWith(".js");
  const isCss = base.endsWith(".css");
  const stem = base.replace(/-[A-Za-z0-9_]{6,}\.(js|css)$/, "");
  const routeLike = /^(admin|vendor|account|category|products|checkout|orders|blog|pages|api|auth|signup|signin|login)/.test(stem)
    || /route|page|index/.test(stem);
  return { base, isJs, isCss, stem, routeLike };
}

function main() {
  const files = walk(CLIENT_DIR);
  if (files.length === 0) {
    console.warn("[build-summary] No client assets found — skipping.");
    return;
  }

  const rows = files.map((f) => {
    const rel = relative(CLIENT_DIR, f.path).replaceAll("\\", "/");
    return { file: rel, size: f.size, ...classify(rel) };
  });

  const totalJs = rows.filter((r) => r.isJs).reduce((a, b) => a + b.size, 0);
  const totalCss = rows.filter((r) => r.isCss).reduce((a, b) => a + b.size, 0);

  const routeChunks = rows
    .filter((r) => r.isJs && r.routeLike)
    .sort((a, b) => b.size - a.size);
  const sharedChunks = rows
    .filter((r) => r.isJs && !r.routeLike)
    .sort((a, b) => b.size - a.size);

  const largestRoute = routeChunks[0];
  const largestShared = sharedChunks[0];

  const heapMb = Math.round((process.memoryUsage().rss / 1024 / 1024));

  const status = totalJs > 4 * 1024 * 1024 ? "Critical"
    : totalJs > 2.5 * 1024 * 1024 ? "Warning"
    : "OK";

  const snapshot = {
    timestamp: new Date().toISOString(),
    commit: process.env.GITHUB_SHA || process.env.COMMIT_SHA || null,
    totals: { js: totalJs, css: totalCss, files: rows.length },
    largestRoute: largestRoute
      ? { name: largestRoute.stem, file: largestRoute.file, size: largestRoute.size }
      : null,
    largestSharedChunk: largestShared
      ? { name: largestShared.stem, file: largestShared.file, size: largestShared.size }
      : null,
    topRoutes: routeChunks.slice(0, 10).map((r) => ({ name: r.stem, size: r.size })),
    topShared: sharedChunks.slice(0, 10).map((r) => ({ name: r.stem, size: r.size })),
    peakHeapMb: heapMb,
    status,
  };

  mkdirSync(SNAPSHOT_DIR, { recursive: true });
  const stamp = snapshot.timestamp.replace(/[:.]/g, "-");
  writeFileSync(join(SNAPSHOT_DIR, `${stamp}.json`), JSON.stringify(snapshot, null, 2));
  writeFileSync(SUMMARY_PATH, JSON.stringify(snapshot, null, 2));

  // Human-readable table
  const line = (l, v) => `  ${l.padEnd(22)} ${v}`;
  console.log("\n─── Build Summary ─────────────────────────────");
  console.log(line("Total JS", fmt(totalJs)));
  console.log(line("Total CSS", fmt(totalCss)));
  console.log(line("Largest Route", largestRoute ? `${largestRoute.stem}  (${fmt(largestRoute.size)})` : "—"));
  console.log(line("Largest Shared Chunk", largestShared ? `${largestShared.stem}  (${fmt(largestShared.size)})` : "—"));
  console.log(line("Peak Heap (RSS)", `${heapMb} MB`));
  console.log(line("Status", status));
  console.log("\n  Top 5 routes:");
  routeChunks.slice(0, 5).forEach((r) => console.log(`    ${fmt(r.size).padStart(9)}  ${r.stem}`));
  console.log("\n  Top 5 shared:");
  sharedChunks.slice(0, 5).forEach((r) => console.log(`    ${fmt(r.size).padStart(9)}  ${r.stem}`));
  console.log(`\n  Report:   dist/build-report.html`);
  console.log(`  Snapshot: .build-snapshots/${stamp}.json`);
  console.log("───────────────────────────────────────────────\n");
}

main();
