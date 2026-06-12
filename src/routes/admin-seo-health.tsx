import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useState } from "react";
import {
  Loader2, Search, FileText, ImageIcon, Tag, Copy, CheckCircle2,
  Sparkles, RefreshCw, ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { adminSeoSummary, adminBulkGenerateSeo, adminBulkGenerateAltText } from "@/lib/admin-seo.functions";

export const Route = createFileRoute("/admin-seo-health")({
  head: () => ({ meta: [{ title: "Product SEO Health — Admin" }] }),
  component: SeoHealthPage,
});

type Summary = Awaited<ReturnType<typeof adminSeoSummary>>;

function SeoHealthPage() {
  const loadSummary = useServerFn(adminSeoSummary);
  const genSeo = useServerFn(adminBulkGenerateSeo);
  const genAlt = useServerFn(adminBulkGenerateAltText);

  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      setSummary(await loadSummary());
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to load SEO health.");
    } finally {
      setLoading(false);
    }
  }, [loadSummary]);

  useEffect(() => { refresh(); }, [refresh]);

  const runSeo = async () => {
    setBusy("seo");
    try {
      const r = await genSeo({ data: {} });
      toast.success(`SEO generated for ${r.updated} product${r.updated === 1 ? "" : "s"}.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk SEO generation failed.");
    } finally {
      setBusy(null);
    }
  };

  const runAlt = async () => {
    setBusy("alt");
    try {
      const r = await genAlt({ data: {} });
      toast.success(`Alt text added to ${r.updated} image${r.updated === 1 ? "" : "s"}.`);
      await refresh();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Bulk alt-text generation failed.");
    } finally {
      setBusy(null);
    }
  };

  const c = summary?.counts;

  return (
    <AdminShell
      title="Product SEO Health"
      subtitle="Marketplace-grade indexing readiness"
      allow={["admin", "super_admin", "manager", "editor"]}
    >
      {/* Coverage hero + actions */}
      <div className="flex flex-col sm:flex-row sm:items-center gap-4 mb-6">
        <div className="card-premium rounded-2xl px-5 py-4 flex items-center gap-4 flex-1">
          <div className="relative size-16 shrink-0">
            <svg viewBox="0 0 36 36" className="size-16 -rotate-90">
              <circle cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" className="text-muted/30" />
              <circle
                cx="18" cy="18" r="15.5" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round"
                className="text-accent"
                strokeDasharray={`${(summary?.coverage ?? 0) * 0.974} 100`}
              />
            </svg>
            <span className="absolute inset-0 grid place-items-center text-sm font-mono font-semibold">
              {summary?.coverage ?? 0}%
            </span>
          </div>
          <div>
            <p className="text-xs uppercase tracking-widest text-muted-foreground">SEO Coverage</p>
            <p className="text-sm text-muted-foreground mt-1">
              {c?.optimized ?? 0} of {summary?.total ?? 0} products fully optimized
            </p>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            onClick={runSeo}
            disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-xs font-medium text-accent-foreground disabled:opacity-50"
          >
            {busy === "seo" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
            Generate Missing SEO
          </button>
          <button
            onClick={runAlt}
            disabled={!!busy}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-medium disabled:opacity-50"
          >
            {busy === "alt" ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}
            Generate Alt Text
          </button>
          <button
            onClick={refresh}
            disabled={loading}
            className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-medium disabled:opacity-50"
          >
            <RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Validate
          </button>
        </div>
      </div>

      {loading && !summary ? (
        <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>
      ) : (
        <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 mb-6">
            <KpiCard label="Total products" value={summary?.total ?? 0} icon={<FileText className="size-4" />} />
            <KpiCard label="Fully optimized" value={c?.optimized ?? 0} icon={<CheckCircle2 className="size-4" />} />
            <KpiCard label="Missing SEO titles" value={c?.missingTitle ?? 0} icon={<FileText className="size-4" />} />
            <KpiCard label="Missing descriptions" value={c?.missingDesc ?? 0} icon={<FileText className="size-4" />} />
            <KpiCard label="Missing images" value={c?.missingImage ?? 0} icon={<ImageIcon className="size-4" />} />
            <KpiCard label="Missing alt text" value={c?.missingAltImages ?? 0} icon={<ImageIcon className="size-4" />} />
            <KpiCard label="Missing SKU" value={c?.missingSku ?? 0} icon={<Tag className="size-4" />} />
            <KpiCard label="Duplicate titles" value={c?.duplicateTitles ?? 0} icon={<Copy className="size-4" />} />
          </div>

          {/* Duplicate metadata review */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mb-6">
            <DuplicatePanel
              title="Duplicate SEO Titles"
              icon={<Copy className="size-4 text-orange-400" />}
              groups={summary?.duplicates.titles ?? []}
            />
            <DuplicatePanel
              title="Duplicate Meta Descriptions"
              icon={<Copy className="size-4 text-amber-400" />}
              groups={summary?.duplicates.descriptions ?? []}
            />
          </div>

          {/* Validation summary */}
          <div className="card-premium rounded-2xl p-5">
            <div className="flex items-center gap-2 mb-4">
              <ShieldCheck className="size-4 text-accent" />
              <h2 className="text-sm font-medium">Indexing Readiness</h2>
            </div>
            <ul className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
              <Check ok={(c?.missingTitle ?? 0) === 0} label="All products have SEO titles" />
              <Check ok={(c?.missingDesc ?? 0) === 0} label="All products have meta descriptions" />
              <Check ok={(c?.missingImage ?? 0) === 0} label="All products have a primary image" />
              <Check ok={(c?.missingAltImages ?? 0) === 0} label="All images have alt text" />
              <Check ok={(c?.missingSku ?? 0) === 0} label="All products have a SKU" />
              <Check ok={(c?.duplicateTitles ?? 0) === 0} label="No duplicate SEO titles" />
              <Check ok={(c?.duplicateDescriptions ?? 0) === 0} label="No duplicate meta descriptions" />
              <Check ok={(summary?.coverage ?? 0) >= 95} label="SEO coverage above 95%" />
            </ul>
            <p className="mt-4 text-[11px] text-muted-foreground">
              Structured data (Product, Breadcrumb, Organization, Website) is generated automatically on every
              product page. Manual SEO edits are always preserved — bulk actions only fill blank fields.
            </p>
          </div>

          <div className="mt-5">
            <Link to="/admin-products" className="inline-flex items-center gap-1.5 text-xs text-accent hover:underline">
              <Search className="size-3.5" /> Open Product Catalog
            </Link>
          </div>
        </>
      )}
    </AdminShell>
  );
}

function Check({ ok, label }: { ok: boolean; label: string }) {
  return (
    <li className="flex items-center gap-2">
      <span className={ok ? "text-emerald-400" : "text-orange-400"}>
        {ok ? "✓" : "•"}
      </span>
      <span className={ok ? "text-muted-foreground" : "text-foreground"}>{label}</span>
    </li>
  );
}

function DuplicatePanel({
  title, icon, groups,
}: {
  title: string;
  icon: React.ReactNode;
  groups: { value: string; slugs: string[]; count: number }[];
}) {
  return (
    <div className="card-premium rounded-2xl overflow-hidden">
      <div className="px-4 py-3 border-b border-border flex items-center justify-between">
        <div className="flex items-center gap-2">{icon}<h2 className="text-sm font-medium">{title}</h2></div>
        <span className="font-mono text-xs text-muted-foreground">{groups.length}</span>
      </div>
      <ul className="divide-y divide-border/40 max-h-[360px] overflow-y-auto">
        {groups.map((g) => (
          <li key={g.value} className="px-4 py-2.5">
            <p className="text-xs truncate">{g.value}</p>
            <p className="text-[10px] font-mono text-muted-foreground mt-0.5">{g.count} products</p>
          </li>
        ))}
        {groups.length === 0 && (
          <li className="px-4 py-8 text-center text-xs text-muted-foreground">No duplicates found.</li>
        )}
      </ul>
    </div>
  );
}
