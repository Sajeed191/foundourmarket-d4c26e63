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
import { toast } from "sonner";

export const Route = createFileRoute("/admin-returns")({
  head: () => ({ meta: [{ title: "Returns — Admin" }] }),
  component: AdminReturnsPage,
});

function AdminReturnsPage() {
  const [returns, setReturns] = useState<AdminReturnRow[] | null>(null);
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

  return (
    <AdminShell
      title="Returns & Refunds"
      subtitle={`Review customer return requests. Marking "completed" restores stock automatically.`}
      allow={["admin","super_admin","manager","support"]}
      actions={<RotateCcw className="size-4 text-accent" />}
    >
      {returns === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        returns.length === 0 ? <p className="text-sm text-muted-foreground">No returns yet.</p> :
        <div className="space-y-4">
          {returns.map((r) => (
            <ReturnAdminCard key={r.id} r={r} products={productMap} onUpdate={update} />
          ))}
        </div>
      }
    </AdminShell>
  );
}
