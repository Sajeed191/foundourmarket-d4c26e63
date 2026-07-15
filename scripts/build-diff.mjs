#!/usr/bin/env node
/**
 * Build Diff — compare the two most recent snapshots and print a
 * regression / improvement report. Runs read-only against
 * .build-snapshots/*.json — never mutates build output.
 *
 * Usage:
 *   bun run build:diff                 # latest vs previous
 *   node scripts/build-diff.mjs A B    # explicit snapshot files
 */
import { readdirSync, readFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const DIR = join(process.cwd(), ".build-snapshots");

function fmt(bytes) {
  const sign = bytes < 0 ? "-" : bytes > 0 ? "+" : " ";
  const abs = Math.abs(bytes);
  const v = abs < 1024 ? `${abs} B`
    : abs < 1024 * 1024 ? `${(abs / 1024).toFixed(1)} KB`
    : `${(abs / 1024 / 1024).toFixed(2)} MB`;
  return `${sign}${v}`;
}

function pct(a, b) {
  if (!b) return "—";
  return `${(((a - b) / b) * 100).toFixed(1)}%`;
}

function loadPair() {
  const cli = process.argv.slice(2);
  if (cli.length === 2) {
    return [JSON.parse(readFileSync(cli[0], "utf8")), JSON.parse(readFileSync(cli[1], "utf8"))];
  }
  if (!existsSync(DIR)) { console.error("No .build-snapshots/ yet — run a production build first."); process.exit(0); }
  const files = readdirSync(DIR).filter((f) => f.endsWith(".json")).sort();
  if (files.length < 2) { console.log("Need ≥2 snapshots to diff. Run another build."); process.exit(0); }
  const [prev, curr] = [files[files.length - 2], files[files.length - 1]];
  return [
    JSON.parse(readFileSync(join(DIR, curr), "utf8")),
    JSON.parse(readFileSync(join(DIR, prev), "utf8")),
    curr, prev,
  ];
}

function index(list, key = "name") {
  const m = new Map();
  for (const r of list ?? []) m.set(r[key], r);
  return m;
}

function main() {
  const [curr, prev, currName, prevName] = loadPair();

  console.log("\n─── Build Diff ────────────────────────────────");
  console.log(`  Previous: ${prevName ?? prev.timestamp}`);
  console.log(`  Current:  ${currName ?? curr.timestamp}`);

  // Totals
  const dJs   = curr.totals.js   - prev.totals.js;
  const dJsGz = (curr.totals.jsGz ?? 0) - (prev.totals.jsGz ?? 0);
  const dJsBr = (curr.totals.jsBr ?? 0) - (prev.totals.jsBr ?? 0);
  console.log("\n  Totals (JS):");
  console.log(`    raw:    ${fmt(dJs)}   (${pct(curr.totals.js, prev.totals.js)})`);
  console.log(`    gzip:   ${fmt(dJsGz)}   (${pct(curr.totals.jsGz, prev.totals.jsGz)})`);
  console.log(`    brotli: ${fmt(dJsBr)}   (${pct(curr.totals.jsBr, prev.totals.jsBr)})`);

  // Route diffs
  const prevRoutes = index(prev.routes);
  const currRoutes = index(curr.routes);
  const routeDeltas = [];
  for (const [name, r] of currRoutes) {
    const p = prevRoutes.get(name);
    if (!p) routeDeltas.push({ name, delta: r.gzip, kind: "new", gz: r.gzip });
    else routeDeltas.push({ name, delta: r.gzip - p.gzip, kind: "changed", gz: r.gzip });
  }
  for (const [name, p] of prevRoutes) {
    if (!currRoutes.has(name)) routeDeltas.push({ name, delta: -p.gzip, kind: "removed", gz: 0 });
  }
  const regressions = routeDeltas.filter((d) => d.delta > 0 && d.kind !== "removed").sort((a, b) => b.delta - a.delta);
  const improvements = routeDeltas.filter((d) => d.delta < 0 && d.kind !== "new").sort((a, b) => a.delta - b.delta);
  const added = routeDeltas.filter((d) => d.kind === "new");
  const removed = routeDeltas.filter((d) => d.kind === "removed");

  console.log("\n  Top 5 routes by growth (gzip):");
  if (regressions.length === 0) console.log("    (none)");
  regressions.slice(0, 5).forEach((r) => console.log(`    ${fmt(r.delta).padStart(10)}  ${r.name}`));

  console.log("\n  Top 5 routes by reduction (gzip):");
  if (improvements.length === 0) console.log("    (none)");
  improvements.slice(0, 5).forEach((r) => console.log(`    ${fmt(r.delta).padStart(10)}  ${r.name}`));

  const biggestGain = improvements[0];
  const biggestReg = regressions[0];
  console.log("\n  Highlights:");
  console.log(`    Largest improvement: ${biggestGain ? `${biggestGain.name} (${fmt(biggestGain.delta)})` : "—"}`);
  console.log(`    Largest regression:  ${biggestReg ? `${biggestReg.name} (${fmt(biggestReg.delta)})` : "—"}`);

  // Shared chunks
  const prevShared = index(prev.shared);
  const currShared = index(curr.shared);
  const sharedGrowth = [];
  for (const [name, r] of currShared) {
    const p = prevShared.get(name);
    const delta = p ? r.gzip - p.gzip : r.gzip;
    if (delta !== 0) sharedGrowth.push({ name, delta, kind: p ? "changed" : "new" });
  }
  for (const [name, p] of prevShared) {
    if (!currShared.has(name)) sharedGrowth.push({ name, delta: -p.gzip, kind: "removed" });
  }
  sharedGrowth.sort((a, b) => Math.abs(b.delta) - Math.abs(a.delta));
  console.log("\n  Shared chunk changes (top 5):");
  if (sharedGrowth.length === 0) console.log("    (none)");
  sharedGrowth.slice(0, 5).forEach((s) => console.log(`    ${fmt(s.delta).padStart(10)}  [${s.kind}] ${s.name}`));

  console.log("\n  New route chunks:     " + (added.length ? added.map((r) => r.name).join(", ") : "—"));
  console.log("  Removed route chunks: " + (removed.length ? removed.map((r) => r.name).join(", ") : "—"));

  // Health
  const dScore = (curr.health?.score ?? 0) - (prev.health?.score ?? 0);
  console.log(`\n  Health: ${prev.health?.score ?? "—"} → ${curr.health?.score ?? "—"}  (${dScore >= 0 ? "+" : ""}${dScore})`);
  console.log("───────────────────────────────────────────────\n");
}

main();
