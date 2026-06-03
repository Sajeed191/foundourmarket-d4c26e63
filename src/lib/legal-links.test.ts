/**
 * Dependency-free legal-link validation script.
 * Run with:  bun run src/lib/legal-links.test.ts
 * (No test framework is installed; this uses plain assertions and exits non-zero on failure.)
 *
 * Ensures every legal link (Privacy, Terms, Refund/Return) points to its
 * canonical, instantly-rendered route — never to the lazy CMS `/pages/$slug`
 * route (which can flash a blank/loading or "not found" state for guests).
 * If this fails, a broken or non-canonical legal link was introduced and
 * deployment should be blocked.
 */
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

const ROUTES_DIR = join(process.cwd(), "src", "routes");

// Canonical legal routes that MUST exist as real route files.
const CANONICAL_LEGAL_ROUTES: Record<string, string> = {
  privacy: "privacy.tsx",
  terms: "terms.tsx",
  returns: "returns.tsx",
};

function walk(dir: string): string[] {
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) out.push(...walk(full));
    else if (/\.(tsx?|jsx?)$/.test(entry)) out.push(full);
  }
  return out;
}

const SRC_FILES = walk(join(process.cwd(), "src")).filter(
  (f) => !f.endsWith("routeTree.gen.ts") && !f.endsWith("legal-links.test.ts"),
);

let passed = 0;
const failures: string[] = [];

function check(label: string, condition: boolean) {
  if (condition) {
    passed++;
  } else {
    failures.push(label);
  }
}

// 1. Canonical legal route files exist.
for (const [, file] of Object.entries(CANONICAL_LEGAL_ROUTES)) {
  check(`canonical legal route exists: ${file}`, existsSync(join(ROUTES_DIR, file)));
}

// 2. No legal link points to the lazy CMS /pages/$slug route.
const badPattern = /slug:\s*["'](privacy|terms|returns|refund)["']/;
for (const file of SRC_FILES) {
  const content = readFileSync(file, "utf8");
  check(`no CMS legal link in ${file}`, !badPattern.test(content));
}

// 3. Canonical legal pages declare a canonical URL.
for (const file of Object.values(CANONICAL_LEGAL_ROUTES)) {
  const content = readFileSync(join(ROUTES_DIR, file), "utf8");
  check(`${file} declares canonical URL`, content.includes('rel: "canonical"'));
}

if (failures.length > 0) {
  console.error(`❌ Legal link validation failed (${failures.length}):`);
  for (const f of failures) console.error(`   - ${f}`);
  process.exit(1);
}

console.log(`✅ Legal link validation passed (${passed} checks).`);
