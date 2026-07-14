import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { useState } from "react";
import { toast } from "sonner";
import { Loader2, Sparkles, Play, Wand2, ShieldCheck, XCircle } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { MarketplaceImageAssistant } from "@/components/admin/MarketplaceImageAssistant";
import { CATEGORY_FRAMING } from "@/lib/image-intelligence-types";
import type { ImageIntelligence, ImageRecommendation, IntelligenceMode } from "@/lib/image-intelligence-types";
import {
  analyzeProductImage,
  getIntelligenceSettings,
  listRecentIntelligenceJobs,
  normalizeProductImage,
  updateIntelligenceSettings,
} from "@/lib/image-intelligence.functions";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin-image-intelligence")({
  head: () => ({
    meta: [
      { title: "Image Intelligence — FoundOurMarket™ Admin" },
      { name: "description", content: "Analyze, score and recommend improvements to product imagery without ever modifying the product itself." },
    ],
  }),
  component: ImageIntelligencePage,
});

const MODES: Array<{ value: IntelligenceMode; label: string; desc: string }> = [
  { value: "off",                label: "Off",                  desc: "Engine disabled. No analysis on new uploads." },
  { value: "analyze_only",       label: "Analyze only",         desc: "Compute metrics silently. No recommendation surfaced to admins." },
  { value: "analyze_recommend",  label: "Analyze + recommend",  desc: "Compute metrics and show one prioritized recommendation. Default." },
  { value: "analyze_normalize",  label: "Analyze + normalize",  desc: "Also produce a reversible optimized WebP. Original is preserved." },
];

function ImageIntelligencePage() {
  const router = useRouter();
  const settingsFn = useServerFn(getIntelligenceSettings);
  const updateFn = useServerFn(updateIntelligenceSettings);
  const jobsFn = useServerFn(listRecentIntelligenceJobs);
  const analyzeFn = useServerFn(analyzeProductImage);
  const normalizeFn = useServerFn(normalizeProductImage);

  const settings = useQuery({ queryKey: ["intel-settings"], queryFn: () => settingsFn() });
  const jobs = useQuery({ queryKey: ["intel-jobs"], queryFn: () => jobsFn({ data: { limit: 50 } }) });

  const setMode = useMutation({
    mutationFn: (mode: IntelligenceMode) => updateFn({ data: { mode } }),
    onSuccess: () => { toast.success("Mode updated."); router.invalidate(); settings.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });
  const toggleAutoApply = useMutation({
    mutationFn: (v: boolean) => updateFn({ data: { auto_apply_safe: v } }),
    onSuccess: () => { toast.success("Auto-apply updated."); settings.refetch(); },
    onError: (e: Error) => toast.error(e.message),
  });

  const [testUrl, setTestUrl] = useState("");
  const [testCategory, setTestCategory] = useState("");
  const [testResult, setTestResult] = useState<{
    intelligence: ImageIntelligence | null;
    recommendation: ImageRecommendation | null;
  } | null>(null);
  const [normResult, setNormResult] = useState<{
    status: string; optimizedUrl?: string; actions?: Array<{ op: string; reason: string }>;
    checks?: Array<{ name: string; passed: boolean; detail: string }>; reason?: string;
  } | null>(null);

  const analyzing = useMutation({
    mutationFn: () => analyzeFn({ data: { imageUrl: testUrl, categorySlug: testCategory || undefined, persist: false } }),
    onSuccess: (res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setTestResult({ intelligence: res.intelligence, recommendation: res.recommendation });
      setNormResult(null);
      jobs.refetch();
      if (res.status === "failed") toast.error("Analysis failed — see result panel.");
      else toast.success(`Analyzed in ${res.durationMs}ms`);
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const normalizing = useMutation({
    mutationFn: () => normalizeFn({ data: { imageUrl: testUrl, categorySlug: testCategory || undefined } }),
    onSuccess: (res: any) => { // eslint-disable-line @typescript-eslint/no-explicit-any
      setNormResult(res);
      jobs.refetch();
      if (res.status === "succeeded") toast.success("Optimized image produced and passed quality gate.");
      else if (res.status === "rejected") toast.warning("Optimization rejected by quality gate — original kept.");
      else toast.error(res.reason ?? "Normalization failed.");
    },
    onError: (e: Error) => toast.error(e.message),
  });

  const currentMode = (settings.data?.mode ?? "analyze_recommend") as IntelligenceMode;
  const autoApply = Boolean(settings.data?.auto_apply_safe);
  const normalizeAllowed = currentMode === "analyze_normalize";

  return (
    <AdminShell
      title="Image Intelligence"
      subtitle="Deterministic analysis + safe normalization — originals immutable"
      allow={["admin", "super_admin", "manager"]}
    >
      <div className="space-y-6">
        {/* Safety contract banner */}
        <div className="rounded-2xl border border-emerald-500/20 bg-emerald-500/5 p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-emerald-300">Safety contract</p>
          <p className="mt-1 text-[13px] text-white/85">
            The original upload is <span className="font-semibold">immutable</span>. Every recommendation is
            <span className="font-semibold"> explainable</span> and <span className="font-semibold">reversible</span>.
            The AI reasons only about presentation — canvas, padding, background, alignment —
            <span className="font-semibold"> never about the product itself</span> (size, colors, logos, textures, printed text).
            Every optimization must pass a <span className="font-semibold">mandatory quality gate</span> before it replaces the display image.
          </p>
        </div>

        {/* Mode selector */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between gap-4">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Engine mode</p>
            <label className="flex items-center gap-2 text-[11px] text-white/70">
              <input
                type="checkbox"
                checked={autoApply}
                disabled={toggleAutoApply.isPending || !normalizeAllowed}
                onChange={(e) => toggleAutoApply.mutate(e.target.checked)}
                className="accent-accent"
              />
              Auto-apply optimizations that pass the quality gate
            </label>
          </div>
          <div className="mt-3 grid gap-2 md:grid-cols-2">
            {MODES.map((m) => {
              const active = currentMode === m.value;
              return (
                <button
                  key={m.value}
                  type="button"
                  disabled={setMode.isPending}
                  onClick={() => setMode.mutate(m.value)}
                  className={cn(
                    "text-left rounded-xl border p-3 transition",
                    active ? "border-accent/50 bg-accent/10" : "border-white/10 hover:border-white/20 bg-white/[0.02]",
                  )}
                >
                  <p className="text-sm font-medium text-white/95">{m.label}
                    {active && <span className="ml-2 text-[10px] font-mono uppercase tracking-widest text-accent">Active</span>}
                  </p>
                  <p className="mt-1 text-[11px] text-white/60">{m.desc}</p>
                </button>
              );
            })}
          </div>
        </section>

        {/* Analyze / normalize tester */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center gap-2">
            <Sparkles className="size-4 text-accent" />
            <p className="text-sm font-semibold text-white/95">Test the engine</p>
          </div>
          <p className="mt-1 text-[11px] text-white/60">
            Paste any product image URL from the catalog to see analysis and (in normalize mode) the deterministic optimization.
          </p>
          <div className="mt-3 grid gap-2 sm:grid-cols-[1fr,180px,auto,auto]">
            <input
              value={testUrl}
              onChange={(e) => setTestUrl(e.target.value)}
              placeholder="https://…/product.jpg"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
            <input
              value={testCategory}
              onChange={(e) => setTestCategory(e.target.value)}
              placeholder="Category (optional)"
              className="rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm outline-none focus:border-accent/40"
            />
            <button
              type="button"
              disabled={!testUrl || analyzing.isPending}
              onClick={() => analyzing.mutate()}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-accent-foreground transition hover:brightness-110 disabled:opacity-50"
            >
              {analyzing.isPending ? <Loader2 className="size-4 animate-spin" /> : <Play className="size-4" />}
              Analyze
            </button>
            <button
              type="button"
              disabled={!testUrl || normalizing.isPending || !normalizeAllowed}
              onClick={() => normalizing.mutate()}
              title={normalizeAllowed ? "Produce optimized WebP" : "Switch to Analyze + normalize mode first"}
              className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-white/90 transition hover:bg-white/[0.08] disabled:opacity-40"
            >
              {normalizing.isPending ? <Loader2 className="size-4 animate-spin" /> : <Wand2 className="size-4" />}
              Normalize
            </button>
          </div>
          {testResult && (
            <div className="mt-3">
              <MarketplaceImageAssistant
                intelligence={testResult.intelligence}
                recommendation={testResult.recommendation}
              />
            </div>
          )}
          {normResult && (
            <div className="mt-3 rounded-xl border border-white/10 bg-black/20 p-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">Original</p>
                  {testUrl && <img src={testUrl} alt="original" className="mt-1 h-48 w-full rounded-lg object-contain bg-black/40" />}
                </div>
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">
                    Optimized {normResult.status === "rejected" && <span className="text-amber-300">· rejected</span>}
                    {normResult.status === "succeeded" && <span className="text-emerald-300">· passed gate</span>}
                  </p>
                  {normResult.optimizedUrl
                    ? <img src={normResult.optimizedUrl} alt="optimized" className="mt-1 h-48 w-full rounded-lg object-contain bg-black/40" />
                    : <div className="mt-1 grid h-48 place-items-center rounded-lg bg-black/40 text-[11px] text-white/50">
                        {normResult.reason ?? "No optimized image produced."}
                      </div>}
                </div>
              </div>
              {normResult.actions && normResult.actions.length > 0 && (
                <div className="mt-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">Actions taken</p>
                  <ul className="mt-1 space-y-1 text-[11px] text-white/80">
                    {normResult.actions.map((a, i) => (
                      <li key={i}><span className="font-mono text-white/60">{a.op}</span> — {a.reason}</li>
                    ))}
                  </ul>
                </div>
              )}
              {normResult.checks && (
                <div className="mt-3">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/50">Quality gate</p>
                  <ul className="mt-1 grid gap-1 sm:grid-cols-2">
                    {normResult.checks.map((c) => (
                      <li key={c.name} className="flex items-start gap-1.5 text-[11px]">
                        {c.passed
                          ? <ShieldCheck className="mt-0.5 size-3 shrink-0 text-emerald-400" />
                          : <XCircle className="mt-0.5 size-3 shrink-0 text-rose-400" />}
                        <span className={c.passed ? "text-white/80" : "text-rose-200"}>
                          <span className="font-mono text-white/50">{c.name}</span> · {c.detail}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Category rules */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Category-aware framing</p>
          <div className="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {Object.values(CATEGORY_FRAMING).map((c) => (
              <div key={c.key} className="rounded-lg bg-white/[0.02] p-3">
                <p className="text-sm font-medium text-white/95">{c.label}</p>
                <p className="mt-0.5 text-[10px] font-mono uppercase tracking-widest text-white/40">
                  {Math.round(c.occupancyMin * 100)}–{Math.round(c.occupancyMax * 100)}% · min {c.minResolution}px
                </p>
                <p className="mt-1.5 text-[11px] text-white/70">{c.note}</p>
              </div>
            ))}
          </div>
        </section>

        {/* Recent jobs */}
        <section className="rounded-2xl border border-white/10 bg-white/[0.02] p-4">
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-muted-foreground">Recent analyses</p>
            <button onClick={() => jobs.refetch()} className="text-[10px] font-mono uppercase tracking-widest text-white/60 hover:text-white">
              Refresh
            </button>
          </div>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-[11px]">
              <thead className="text-white/50">
                <tr className="border-b border-white/5">
                  <th className="pb-2 pr-2 text-left font-mono uppercase tracking-widest">Score</th>
                  <th className="pb-2 pr-2 text-left font-mono uppercase tracking-widest">Product</th>
                  <th className="pb-2 pr-2 text-left font-mono uppercase tracking-widest">Category</th>
                  <th className="pb-2 pr-2 text-left font-mono uppercase tracking-widest">Recommendation</th>
                  <th className="pb-2 pr-2 text-left font-mono uppercase tracking-widest">Duration</th>
                  <th className="pb-2 pr-2 text-left font-mono uppercase tracking-widest">When</th>
                </tr>
              </thead>
              <tbody>
                {(jobs.data ?? []).map((j: any) => ( // eslint-disable-line @typescript-eslint/no-explicit-any
                  <tr key={j.id} className="border-b border-white/[0.03]">
                    <td className="py-1.5 pr-2 font-mono tabular-nums text-white/85">{j.health_score ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-white/70">{j.product_slug ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-white/70">{j.category_slug ?? "—"}</td>
                    <td className="py-1.5 pr-2 text-white/85">{j.recommendation?.headline ?? (j.status === "failed" ? "Analysis failed" : "—")}</td>
                    <td className="py-1.5 pr-2 font-mono tabular-nums text-white/60">{j.duration_ms ?? 0}ms</td>
                    <td className="py-1.5 pr-2 text-white/50">{new Date(j.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {jobs.data?.length === 0 && (
                  <tr><td colSpan={6} className="py-6 text-center text-white/50">No analyses yet. Use the tester above.</td></tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </AdminShell>
  );
}
