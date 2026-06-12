import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { getReturnsAdminFn, type AdminReturnRow } from "@/lib/returns-admin.functions";
import { useProducts } from "@/lib/use-products";
import type { Product } from "@/lib/products";
import { ReturnAdminCard } from "@/components/admin/ReturnAdminCard";
import { ReturnQueueCard } from "@/components/admin/ReturnQueueCard";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-returns")({
  head: () => ({ meta: [{ title: "Returns — Admin" }] }),
  component: AdminReturnsPage,
});

const FILTERS = ["All", "Requested", "Replacement", "Refund", "Completed", "Rejected"] as const;
type Filter = (typeof FILTERS)[number];

function matchesFilter(r: AdminReturnRow, f: Filter): boolean {
  switch (f) {
    case "All":
      return true;
    case "Requested":
      return r.status === "requested";
    case "Replacement":
      return r.resolution_type !== "refund" && r.status !== "rejected";
    case "Refund":
      return r.resolution_type === "refund" && r.status !== "rejected";
    case "Completed":
      return r.status === "completed" || r.refund_status === "issued" || r.replacement_status === "delivered";
    case "Rejected":
      return r.status === "rejected";
    default:
      return true;
  }
}

function AdminReturnsPage() {
  const [returns, setReturns] = useState<AdminReturnRow[] | null>(null);
  const [filter, setFilter] = useState<Filter>("All");
  const [activeId, setActiveId] = useState<string | null>(null);
  const fetchReturns = useServerFn(getReturnsAdminFn);
  const { products } = useProducts();

  const productMap = useMemo(() => {
    const m = new Map<string, Product>();
    for (const p of products) m.set(p.slug, p);
    return m;
  }, [products]);

  useEffect(() => { void load(); }, []);

  async function load() {
    try {
      const data = await fetchReturns();
      setReturns(data ?? []);
    } catch (e: any) {
      toast.error(e?.message ?? "Failed to load returns");
      setReturns([]);
    }
  }

  async function update(id: string, patch: Record<string, unknown>) {
    if (patch.status === "completed") patch.resolved_at = new Date().toISOString();
    const { error } = await (supabase.from("returns") as any).update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Return updated");
    logActivity("return_update", "return", id, patch as Record<string, unknown>);
    void load();
  }

  const filtered = useMemo(
    () => (returns ?? []).filter((r) => matchesFilter(r, filter)),
    [returns, filter],
  );

  const counts = useMemo(() => {
    const map = {} as Record<Filter, number>;
    for (const f of FILTERS) map[f] = (returns ?? []).filter((r) => matchesFilter(r, f)).length;
    return map;
  }, [returns]);

  const active = useMemo(() => filtered.find((r) => r.id === activeId) ?? (returns ?? []).find((r) => r.id === activeId) ?? null, [filtered, returns, activeId]);

  return (
    <AdminShell
      title="Returns & Refunds"
      subtitle="Triage the return queue. Select a request to review details and resolve."
      allow={["admin","super_admin","manager","support"]}
      actions={<RotateCcw className="size-4 text-accent" />}
    >
      {/* Filter chips */}
      <div className="flex flex-wrap gap-2 mb-4">
        {FILTERS.map((f) => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors ${
              filter === f
                ? "border-accent bg-accent/15 text-accent"
                : "border-border bg-background text-muted-foreground hover:border-accent/40"
            }`}
          >
            {f}
            {returns && (
              <span className={`text-[9px] ${filter === f ? "text-accent" : "text-muted-foreground/70"}`}>
                {counts[f]}
              </span>
            )}
          </button>
        ))}
      </div>

      {returns === null ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <p className="text-sm text-muted-foreground">No returns in this view.</p>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((r) => (
            <ReturnQueueCard key={r.id} r={r} products={productMap} onReview={(row) => setActiveId(row.id)} />
          ))}
        </div>
      )}

      {/* Review drawer */}
      <Sheet open={activeId != null} onOpenChange={(open) => !open && setActiveId(null)}>
        <SheetContent className="w-full sm:max-w-lg overflow-y-auto p-4 sm:p-6">
          <SheetHeader className="mb-4">
            <SheetTitle className="text-base">Return Review</SheetTitle>
          </SheetHeader>
          {active && (
            <ReturnAdminCard r={active} products={productMap} onUpdate={update} />
          )}
        </SheetContent>
      </Sheet>
    </AdminShell>
  );
}
