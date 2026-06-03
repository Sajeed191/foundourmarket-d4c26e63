import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync, existsSync } from "node:fs";
import { join } from "node:path";

/**
 * Link validation guard for legal pages.
 *
 * Ensures every legal link (Privacy, Terms, Refund/Return) points to its
 * canonical, instantly-rendered route — never to the lazy CMS `/pages/$slug`
 * route (which can flash a blank/loading or "not found" state for guests).
 *
 * If this test fails, a broken or non-canonical legal link was introduced and
 * the build/CI should block deployment.
 */

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
  (f) => !f.endsWith("routeTree.gen.ts") && !f.endsWith(".test.ts"),
);

describe("legal link validation", () => {
  it("canonical legal route files exist", () => {
    for (const file of Object.values(CANONICAL_LEGAL_ROUTES)) {
      expect(existsSync(join(ROUTES_DIR, file)), `Missing legal route: ${file}`).toBe(true);
    }
  });

  it("no legal link points to the lazy CMS /pages/$slug route", () => {
    const offenders: string[] = [];
    const badPattern = /slug:\s*["'](privacy|terms|returns|refund)["']/;
    for (const file of SRC_FILES) {
      const content = readFileSync(file, "utf8");
      if (badPattern.test(content)) offenders.push(file);
    }
    expect(offenders, `Legal links must use canonical routes, not /pages/$slug: ${offenders.join(", ")}`).toEqual([]);
  });

  it("canonical legal pages declare a canonical URL", () => {
    for (const file of Object.values(CANONICAL_LEGAL_ROUTES)) {
      const content = readFileSync(join(ROUTES_DIR, file), "utf8");
      expect(content.includes('rel: "canonical"'), `${file} is missing a canonical URL`).toBe(true);
    }
  });
});
