/**
 * Platform Docs — /admin-platform-docs
 *
 * Internal, admin-only architecture reference. Renders the same content
 * as docs/platform.md so the platform's rules are always one click away
 * from the surfaces that must obey them.
 *
 * Read-only. No new intelligence, no new contracts.
 */
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  ArrowLeft, Layers, ShieldCheck, GitBranch, Gauge, ListChecks, Rocket, BookOpen,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin-platform-docs")({
  head: () => ({
    meta: [
      { title: "Platform Docs — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Internal architecture reference — frozen layers, public contracts, freeze policy, extension rules, perf budgets and release checklist.",
      },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: PlatformDocsPage,
});

function Section({
  id,
  icon: Icon,
  title,
  children,
}: {
  id: string;
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-24 rounded-xl border bg-card/40 p-5">
      <h2 className="mb-3 flex items-center gap-2 text-base font-semibold">
        <Icon className="h-4 w-4 text-primary" />
        {title}
      </h2>
      <div className="prose prose-sm dark:prose-invert max-w-none text-sm leading-relaxed">
        {children}
      </div>
    </section>
  );
}

function PlatformDocsPage() {
  return (
    <AdminShell title="Platform Docs">
      <div className="mx-auto max-w-4xl space-y-6 p-4 sm:p-6">
        <div className="flex items-center gap-3">
          <Link
            to="/admin-executive"
            className="inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs text-muted-foreground hover:bg-accent"
          >
            <ArrowLeft className="h-3.5 w-3.5" /> Back
          </Link>
          <div>
            <h1 className="text-xl font-semibold tracking-tight">
              FoundOurMarket™ Platform v1.0 — Internal Reference
            </h1>
            <p className="text-sm text-muted-foreground">
              Production Ready · Intelligence + Operations layers frozen · Vendor / Customer / Growth tracks build on top.
            </p>
          </div>
        </div>

        {/* Table of contents */}
        <nav className="rounded-xl border bg-card/60 p-4 text-sm">
          <div className="mb-2 flex items-center gap-2 text-xs uppercase tracking-wider text-muted-foreground">
            <BookOpen className="h-3.5 w-3.5" /> Contents
          </div>
          <ol className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            <li><a href="#arch" className="hover:text-primary">1. Architecture Overview</a></li>
            <li><a href="#contracts" className="hover:text-primary">2. Public Contracts</a></li>
            <li><a href="#freeze" className="hover:text-primary">3. Version Manifest & Freeze</a></li>
            <li><a href="#add-module" className="hover:text-primary">4. Adding an Intelligence Module</a></li>
            <li><a href="#add-op" className="hover:text-primary">5. Adding an Operation Adapter</a></li>
            <li><a href="#perf" className="hover:text-primary">6. Performance Budgets</a></li>
            <li><a href="#release" className="hover:text-primary">7. Release Checklist</a></li>
            <li><a href="#tracks" className="hover:text-primary">8. Track Roadmap</a></li>
          </ol>
        </nav>

        <Section id="arch" icon={Layers} title="1. Architecture Overview">
          <pre className="overflow-x-auto rounded-md bg-muted p-3 text-[11px] leading-snug">
{`Experience Layer   ──►  Admin ✓   Vendor (next)   Customer (future)
                        │
Operations Layer   ──►  Smart Work Queue · Daily Digest · Bulk Ops · Recommendation Analytics
                        │  (pure aggregation, no new intelligence)
Intelligence Layer ──►  Marketplace Intelligence v3
                        ▼  Catalog Intelligence v2
                        ▼  Image Intelligence v3`}
          </pre>
          <p><strong>Upward-only rule.</strong> Higher layers consume lower-layer public contracts. Lower layers never import from higher layers. Operations never re-implements scoring, detection, or AI calls.</p>
          <p><strong>One recommendation, one action.</strong> Every surface exposes at most one prioritized recommendation with a single execute affordance. Confidence + reason + module id must always accompany the recommendation.</p>
        </Section>

        <Section id="contracts" icon={GitBranch} title="2. Public Contracts (versioned)">
          <p>Consumers must import ONLY these public shapes — never internal helpers.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground">
                <tr><th className="py-1 pr-2">Contract</th><th className="py-1 pr-2">Module</th><th className="py-1">Owner</th></tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {[
                  ["IntelligenceModule · Recommendation · MarketplaceReadiness", "src/lib/catalog-intelligence", "Catalog v2"],
                  ["VendorIntelligence · MarketplaceOptimization · TrustIntelligence", "src/lib/marketplace-intelligence", "Marketplace v3"],
                  ["MarketplaceHealth · LifecycleRecommendation", "src/lib/marketplace-intelligence", "Marketplace v3"],
                  ["RecommendationAnalytics · RecommendationHistory", "src/lib/marketplace-intelligence", "Marketplace v3"],
                  ["MarketplaceHealthListing", "src/lib/use-marketplace-health", "Read model"],
                  ["SmartQueues · WorkQueue · QueueItem", "src/lib/marketplace-operations", "Operations v1"],
                  ["BulkOperation · BulkOperationSpec", "src/lib/marketplace-operations/bulk-operations", "Operations v1"],
                  ["ENGINE_VERSION_MANIFEST", "src/lib/image-intelligence-versions", "Image v3"],
                ].map(([c, m, o]) => (
                  <tr key={c}><td className="py-1 pr-2 font-mono">{c}</td><td className="py-1 pr-2 font-mono text-muted-foreground">{m}</td><td className="py-1">{o}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Breaking a contract requires a version bump on the owning layer and a documented migration path. During Platform v1.0, only additive fields are permitted.</p>
        </Section>

        <Section id="freeze" icon={ShieldCheck} title="3. Version Manifest & Freeze Policy">
          <p><strong>Frozen layers (v1.0):</strong> Image Intelligence v3 · Catalog Intelligence v2 · Marketplace Intelligence v3 · Marketplace Health v1 · Marketplace Operations v1.</p>
          <p><strong>Allowed changes only:</strong></p>
          <ul>
            <li>Bug fixes · performance improvements · UX polish</li>
            <li>New bulk-operation adapters that reuse existing analyzers</li>
            <li>Additional queue filters / views</li>
            <li>Additive optional fields on public contracts</li>
          </ul>
          <p><strong>Forbidden without a formal unfreeze:</strong></p>
          <ul>
            <li>New scoring, detection, or AI calls inside Operations</li>
            <li>Renames or removals on public contract fields</li>
            <li>Cross-layer imports that violate the upward-only rule</li>
          </ul>
          <p>Every generated asset must remain reproducible from <code>(original input, engine manifest, category rules snapshot)</code>. Bump the manifest whenever behavior changes.</p>
        </Section>

        <Section id="add-module" icon={GitBranch} title="4. Adding a New Intelligence Module">
          <ol>
            <li>Pick the correct layer (image / catalog / marketplace). Never add to Operations.</li>
            <li>Implement <code>analyze&lt;X&gt;(...)</code> returning <code>IntelligenceModule</code>.</li>
            <li>Every recommendation MUST include: <code>module</code>, <code>action</code>, <code>impact</code>, <code>confidence</code>, <code>reason</code>.</li>
            <li>Register in the layer's public barrel so upstream aggregators pick it up automatically.</li>
            <li>Record a baseline in <Link to="/admin-recommendation-validation" className="text-primary hover:underline">/admin-recommendation-validation</Link>.</li>
            <li>Add a perf budget in <code>DEFAULT_BUDGETS</code>.</li>
            <li>Add a reliability assertion in <code>src/lib/reliability-lab/tests.ts</code>.</li>
          </ol>
          <p>If a new module requires any change to Operations code, the module boundary is wrong.</p>
        </Section>

        <Section id="add-op" icon={GitBranch} title="5. Adding a New Operation Adapter">
          <ol>
            <li>Add a <code>BulkOperationSpec</code> in <code>bulk-operations.ts</code>.</li>
            <li><code>spec.run</code> calls existing analyzers only — never introduces new detection / AI.</li>
            <li><code>spec.eligible</code> derives from public contract fields.</li>
            <li>Never mutate the source listing.</li>
            <li>Register in <code>BULK_OPERATION_ORDER</code>.</li>
            <li>Add a reliability check confirming idempotent re-runs.</li>
          </ol>
        </Section>

        <Section id="perf" icon={Gauge} title="6. Performance Budgets">
          <p>Sourced from <code>DEFAULT_BUDGETS</code>. Validated via <Link to="/admin-perf-harness" className="text-primary hover:underline">/admin-perf-harness</Link>.</p>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="text-left text-muted-foreground"><tr><th className="py-1 pr-2">Stage</th><th className="py-1">Budget (n = catalog size)</th></tr></thead>
              <tbody className="divide-y divide-border/60">
                {[
                  ["Product Editor (cold)", "25ms"],
                  ["Product Editor (warm)", "15ms"],
                  ["Listing analysis", "max(500ms, 1.5ms · n)"],
                  ["Vendor + Optimization + Trust", "max(200ms, 0.5ms · n)"],
                  ["Marketplace Health build", "max(150ms, 0.3ms · n)"],
                  ["Smart Queues build", "max(120ms, 0.25ms · n)"],
                  ["Recommendation Analytics build", "max(150ms, 0.3ms · n)"],
                ].map(([s, b]) => (
                  <tr key={s}><td className="py-1 pr-2">{s}</td><td className="py-1 font-mono">{b}</td></tr>
                ))}
              </tbody>
            </table>
          </div>
          <p>Exceeding budget at 10k is a release blocker. At 100k it is a warning.</p>
        </Section>

        <Section id="release" icon={ListChecks} title="7. Release Checklist">
          <ul className="list-none space-y-1 pl-0">
            <li>☐ <Link to="/admin-perf-harness" className="text-primary hover:underline">Perf harness</Link> — all stages ≤ budget at 1k and 10k.</li>
            <li>☐ <Link to="/admin-recommendation-validation" className="text-primary hover:underline">Recommendation validation</Link> — no regressions vs previous release.</li>
            <li>☐ <Link to="/admin-reliability-lab" className="text-primary hover:underline">Reliability lab</Link> — Stability ≥ 95 with all failure toggles ON.</li>
            <li>☐ No new higher-layer → lower-layer import.</li>
            <li>☐ No new analyzer call inside Operations that isn't a public contract.</li>
            <li>☐ Engine manifest bumped if analyzer / image behavior changed.</li>
            <li>☐ Changelog entry with the release-note format.</li>
          </ul>
        </Section>

        <Section id="tracks" icon={Rocket} title="8. Track Roadmap (post-v1.0)">
          <p>New tracks build ON TOP of frozen contracts. They must not require any change to Intelligence or Operations code.</p>
          <ul>
            <li><strong>Track A — Vendor Experience.</strong> Dashboard · Editor · Work Queue · Analytics · Publish Assistant. Reuses <code>MarketplaceReadiness</code>, <code>SmartQueues</code>, <code>RecommendationAnalytics</code> with a vendor filter.</li>
            <li><strong>Track B — Customer Experience.</strong> AI search, recommendations, smart browse, personalization.</li>
            <li><strong>Track C — Marketplace Growth.</strong> Promotions, campaigns, merchandising on top of Marketplace Health signals.</li>
            <li><strong>Track D — Platform.</strong> Observability, security, scalability, testing.</li>
          </ul>
        </Section>

        <p className="pt-2 text-center text-xs text-muted-foreground">
          Canonical text lives in <code>docs/platform.md</code>. If this page and code disagree, the rule wins.
        </p>
      </div>
    </AdminShell>
  );
}
