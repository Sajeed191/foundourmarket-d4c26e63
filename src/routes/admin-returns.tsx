import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, RotateCcw, ArrowLeft, ShieldAlert } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-returns")({
  head: () => ({ meta: [{ title: "Returns — Admin" }] }),
  component: AdminReturnsPage,
});

type ReturnRow = {
  id: string;
  order_id: string;
  user_id: string;
  status: string;
  reason: string;
  notes: string | null;
  refund_amount: number;
  refund_status: string;
  created_at: string;
  return_items: { id: string; product_slug: string; quantity: number; reason: string | null }[];
};

const RETURN_STATUSES = ["requested", "approved", "received", "completed", "rejected"] as const;
const REFUND_STATUSES = ["pending", "issued", "failed"] as const;

function AdminReturnsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [returns, setReturns] = useState<ReturnRow[] | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);
  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    void load();
  }, [isAdmin]);

  async function load() {
    const { data } = await supabase
      .from("returns")
      .select("id,order_id,user_id,status,reason,notes,refund_amount,refund_status,created_at,return_items(id,product_slug,quantity,reason)")
      .order("created_at", { ascending: false });
    setReturns((data as ReturnRow[]) ?? []);
  }

  async function update(id: string, patch: Record<string, unknown>) {
    if (patch.status === "completed") patch.resolved_at = new Date().toISOString();
    const { error } = await (supabase.from("returns") as any).update(patch).eq("id", id);
    if (error) { toast.error(error.message); return; }
    toast.success("Return updated");
    void load();
  }

  if (loading || isAdmin === null) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }
  if (!isAdmin) {
    return (
      <div className="max-w-md mx-auto px-6 py-24 text-center">
        <ShieldAlert className="size-8 mx-auto text-muted-foreground mb-3" />
        <h1 className="font-display text-2xl mb-2">Admins only</h1>
        <Link to="/" className="text-xs uppercase tracking-widest text-accent">Back home</Link>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
      <Link to="/admin" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" /> Admin
      </Link>
      <h1 className="text-2xl sm:text-4xl font-display font-semibold mb-2 flex items-center gap-3">
        <RotateCcw className="size-7 text-accent" /> Returns &amp; Refunds
      </h1>
      <p className="text-sm text-muted-foreground mb-8">Review customer return requests. Marking "completed" restores stock automatically.</p>

      {returns === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        returns.length === 0 ? <p className="text-sm text-muted-foreground">No returns yet.</p> :
        <div className="space-y-3">
          {returns.map((r) => (
            <div key={r.id} className="bg-card border border-border rounded-2xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div>
                  <p className="font-mono text-[11px] text-muted-foreground">Return #{r.id.slice(0, 8)} · Order #{r.order_id.slice(0, 8)}</p>
                  <p className="text-sm mt-1">{r.reason}</p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                </div>
                <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
              </div>
              <ul className="text-xs text-muted-foreground space-y-1 mb-4">
                {r.return_items.map((i) => (
                  <li key={i.id} className="font-mono">{i.product_slug} × {i.quantity}{i.reason ? ` — ${i.reason}` : ""}</li>
                ))}
              </ul>
              <div className="grid sm:grid-cols-3 gap-2">
                <select value={r.status} onChange={(e) => update(r.id, { status: e.target.value })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent">
                  {RETURN_STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                <input type="number" step="0.01" defaultValue={r.refund_amount} placeholder="Refund $"
                  onBlur={(e) => Number(e.target.value) !== Number(r.refund_amount) && update(r.id, { refund_amount: Number(e.target.value) })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent font-mono" />
                <select value={r.refund_status} onChange={(e) => update(r.id, { refund_status: e.target.value })}
                  className="bg-background border border-border rounded-md px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent">
                  {REFUND_STATUSES.map((s) => <option key={s} value={s}>refund: {s}</option>)}
                </select>
              </div>
            </div>
          ))}
        </div>
      }
    </div>
  );
}
