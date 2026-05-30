import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Database, Users, ShoppingCart, Truck, Star, MessageCircleQuestion,
  LifeBuoy, RotateCcw, BarChart3, Loader2, Trash2, Sparkles, RefreshCw, AlertTriangle,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  getSeedStatus, runSeed, seedAll, removeSeedData, setSeedInAnalytics,
} from "@/lib/seed.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-seed")({
  head: () => ({ meta: [{ title: "Seed data — Admin" }] }),
  component: SeedPage,
});

type Status = Awaited<ReturnType<typeof getSeedStatus>>;

const GENERATORS: { kind: any; label: string; icon: any; unit: string; defaultAmount: number; countKeys: string[] }[] = [
  { kind: "customers", label: "Customers", icon: Users, unit: "customers", defaultAmount: 40, countKeys: ["profiles"] },
  { kind: "orders", label: "Orders & payments", icon: ShoppingCart, unit: "orders", defaultAmount: 120, countKeys: ["orders", "payments"] },
  { kind: "shipments", label: "Shipments", icon: Truck, unit: "auto", defaultAmount: 1, countKeys: ["shipments"] },
  { kind: "reviews", label: "Reviews", icon: Star, unit: "reviews", defaultAmount: 80, countKeys: ["product_reviews"] },
  { kind: "questions", label: "Product questions", icon: MessageCircleQuestion, unit: "questions", defaultAmount: 40, countKeys: ["product_questions"] },
  { kind: "support", label: "Support tickets", icon: LifeBuoy, unit: "tickets", defaultAmount: 25, countKeys: ["support_tickets"] },
  { kind: "returns", label: "Returns", icon: RotateCcw, unit: "returns", defaultAmount: 15, countKeys: ["returns"] },
  { kind: "analytics", label: "Analytics & traffic", icon: BarChart3, unit: "days", defaultAmount: 60, countKeys: ["analytics_events", "page_views"] },
];

function SeedPage() {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [amounts, setAmounts] = useState<Record<string, number>>(
    Object.fromEntries(GENERATORS.map((g) => [g.kind, g.defaultAmount])),
  );
  const [scale, setScale] = useState(1);

  const fetchStatus = useServerFn(getSeedStatus);
  const runSeedFn = useServerFn(runSeed);
  const seedAllFn = useServerFn(seedAll);
  const removeFn = useServerFn(removeSeedData);
  const toggleFn = useServerFn(setSeedInAnalytics);

  async function load() {
    try { setStatus(await fetchStatus({ data: {} } as any)); }
    catch (e: any) { toast.error(e.message ?? "Failed to load seed status"); }
  }
  useEffect(() => { load(); }, []);

  async function doRun(kind: string) {
    setBusy(kind);
    try {
      await runSeedFn({ data: { kind, amount: amounts[kind] } } as any);
      toast.success(`Seeded ${kind}`);
      await load();
    } catch (e: any) { toast.error(e.message ?? "Seed failed"); }
    finally { setBusy(null); }
  }

  async function doSeedAll() {
    setBusy("all");
    try {
      await seedAllFn({ data: { scale } } as any);
      toast.success("Full store seeded");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Seed failed"); }
    finally { setBusy(null); }
  }

  async function doRemove() {
    if (!confirm("Remove ALL seeded data and seeded customer accounts? Real data is never touched. This cannot be undone.")) return;
    setBusy("remove");
    try {
      await removeFn({ data: {} } as any);
      toast.success("All seed data removed");
      await load();
    } catch (e: any) { toast.error(e.message ?? "Remove failed"); }
    finally { setBusy(null); }
  }

  async function doToggle(include: boolean) {
    try {
      await toggleFn({ data: { include } } as any);
      setStatus((s) => s ? { ...s, includeInAnalytics: include } : s);
      toast.success(include ? "Seed data now shown in analytics" : "Seed data hidden from analytics");
    } catch (e: any) { toast.error(e.message ?? "Update failed"); }
  }

  const counts = status?.counts ?? ({} as Record<string, number>);

  return (
    <AdminShell>
      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        <header className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-semibold flex items-center gap-2">
              <Database className="size-5 text-accent" /> Seed data
            </h1>
            <p className="text-sm text-muted-foreground mt-1 max-w-xl">
              Populate every dashboard with realistic activity. All seeded rows are flagged and 100% removable.
              Real customers, orders, payments and financial reports are never affected.
            </p>
          </div>
          <button onClick={load} className="shrink-0 inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg border border-border hover:bg-muted">
            <RefreshCw className="size-3.5" /> Refresh
          </button>
        </header>

        {/* Analytics toggle */}
        <div className="rounded-xl border border-border p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm">Include seed data in analytics</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              When off, dashboards ignore seeded rows. Financial &amp; payment reports always exclude seed data.
            </p>
          </div>
          <button
            onClick={() => doToggle(!status?.includeInAnalytics)}
            className={`relative w-12 h-7 rounded-full transition-colors ${status?.includeInAnalytics ? "bg-accent" : "bg-muted"}`}
            aria-label="Toggle seed analytics"
          >
            <span className={`absolute top-1 left-1 size-5 rounded-full bg-background transition-transform ${status?.includeInAnalytics ? "translate-x-5" : ""}`} />
          </button>
        </div>

        {/* Seed all */}
        <div className="rounded-xl border border-accent/40 bg-accent/5 p-4">
          <div className="flex items-center gap-2 mb-3">
            <Sparkles className="size-4 text-accent" />
            <p className="font-medium text-sm">Seed entire store</p>
          </div>
          <div className="flex items-center gap-3 flex-wrap">
            <label className="text-xs text-muted-foreground">Scale</label>
            <input type="range" min={0.5} max={5} step={0.5} value={scale}
              onChange={(e) => setScale(Number(e.target.value))} className="flex-1 min-w-[140px]" />
            <span className="text-xs font-mono w-8">{scale}×</span>
            <button onClick={doSeedAll} disabled={busy !== null}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50">
              {busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
              Seed everything
            </button>
          </div>
        </div>

        {/* Individual generators */}
        <div className="grid sm:grid-cols-2 gap-3">
          {GENERATORS.map((g) => {
            const existing = g.countKeys.reduce((a, k) => a + (counts[k] ?? 0), 0);
            return (
              <div key={g.kind} className="rounded-xl border border-border p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <span className="inline-flex items-center gap-2 text-sm font-medium">
                    <g.icon className="size-4 text-accent" /> {g.label}
                  </span>
                  <span className="text-xs font-mono text-muted-foreground">{existing} seeded</span>
                </div>
                <div className="flex items-center gap-2">
                  {g.unit !== "auto" && (
                    <input type="number" min={1} max={5000} value={amounts[g.kind]}
                      onChange={(e) => setAmounts((a) => ({ ...a, [g.kind]: Number(e.target.value) }))}
                      className="w-20 text-sm px-2 py-1.5 rounded-lg border border-border bg-background" />
                  )}
                  {g.unit !== "auto" && <span className="text-xs text-muted-foreground">{g.unit}</span>}
                  <button onClick={() => doRun(g.kind)} disabled={busy !== null}
                    className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs disabled:opacity-50">
                    {busy === g.kind ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                    Generate
                  </button>
                </div>
              </div>
            );
          })}
        </div>

        {/* Danger zone */}
        <div className="rounded-xl border border-destructive/40 bg-destructive/5 p-4 flex items-center justify-between gap-4">
          <div>
            <p className="font-medium text-sm flex items-center gap-2 text-destructive">
              <AlertTriangle className="size-4" /> Remove all seed data
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              Total seeded rows: <span className="font-mono">{status?.total ?? 0}</span>. Deletes flagged rows and seeded accounts.
            </p>
          </div>
          <button onClick={doRemove} disabled={busy !== null}
            className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50">
            {busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}
            Wipe seed data
          </button>
        </div>

        {/* Recent runs */}
        {status?.runs && status.runs.length > 0 && (
          <div className="rounded-xl border border-border p-4">
            <p className="font-medium text-sm mb-3">Recent seed runs</p>
            <ul className="space-y-1.5 text-xs">
              {status.runs.map((r: any) => (
                <li key={r.id} className="flex items-center justify-between gap-3 text-muted-foreground">
                  <span className="font-mono">{r.kind}</span>
                  <span className="truncate">{JSON.stringify(r.counts)}</span>
                  <span className="shrink-0">{new Date(r.created_at).toLocaleString()}</span>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </AdminShell>
  );
}
