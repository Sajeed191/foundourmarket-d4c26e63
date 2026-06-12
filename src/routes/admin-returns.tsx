import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RotateCcw, User, Mail, Phone, MapPin, Check, X } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { getReturnsAdminFn, type AdminReturnRow } from "@/lib/returns-admin.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-returns")({
  head: () => ({ meta: [{ title: "Returns — Admin" }] }),
  component: AdminReturnsPage,
});

const RETURN_STATUSES = ["requested", "approved", "received", "completed", "rejected"] as const;
const REFUND_STATUSES = ["pending", "issued", "failed"] as const;

const STATUS_TONE: Record<string, string> = {
  requested: "text-amber-400 border-amber-400/30 bg-amber-400/10",
  approved: "text-sky-400 border-sky-400/30 bg-sky-400/10",
  received: "text-violet-400 border-violet-400/30 bg-violet-400/10",
  completed: "text-emerald-400 border-emerald-400/30 bg-emerald-400/10",
  rejected: "text-rose-400 border-rose-400/30 bg-rose-400/10",
};

function AdminReturnsPage() {
  const [returns, setReturns] = useState<AdminReturnRow[] | null>(null);
  const fetchReturns = useServerFn(getReturnsAdminFn);

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
        <div className="space-y-3">
          {returns.map((r) => (
            <div key={r.id} className="card-premium rounded-2xl p-5">
              <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                <div>
                  <p className="font-mono text-[11px] text-muted-foreground">Return #{r.id.slice(0, 8)} · Order #{r.order_id.slice(0, 8)}</p>
                  <p className="text-sm mt-1">{r.reason}</p>
                  {r.notes && <p className="text-xs text-muted-foreground mt-1">{r.notes}</p>}
                </div>
                <div className="flex items-center gap-2">
                  <span className={`text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border ${STATUS_TONE[r.status] ?? "text-muted-foreground border-border"}`}>{r.status}</span>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{new Date(r.created_at).toLocaleDateString()}</span>
                </div>
              </div>

              {/* Customer details */}
              <div className="rounded-xl border border-border/60 bg-background/40 p-3 mb-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Requested by</p>
                <div className="grid sm:grid-cols-2 gap-x-4 gap-y-1.5 text-xs">
                  <span className="flex items-center gap-2"><User className="size-3.5 text-accent shrink-0" />{r.customer.name ?? "—"}</span>
                  <span className="flex items-center gap-2"><Phone className="size-3.5 text-accent shrink-0" />{r.customer.phone ?? "—"}</span>
                  <a href={r.customer.email ? `mailto:${r.customer.email}` : undefined} className="flex items-center gap-2 min-w-0 hover:text-accent"><Mail className="size-3.5 text-accent shrink-0" /><span className="truncate">{r.customer.email ?? "—"}</span></a>
                  <span className="flex items-start gap-2 sm:col-span-2"><MapPin className="size-3.5 text-accent shrink-0 mt-0.5" /><span>{r.customer.address ?? "—"}</span></span>
                </div>
              </div>

              <ul className="text-xs text-muted-foreground space-y-1 mb-4">
                {r.return_items.map((i) => (
                  <li key={i.id} className="font-mono">{i.product_slug} × {i.quantity}{i.reason ? ` — ${i.reason}` : ""}</li>
                ))}
              </ul>

              {/* Quick actions */}
              {r.status === "requested" && (
                <div className="flex flex-wrap gap-2 mb-3">
                  <button onClick={() => update(r.id, { status: "approved" })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-400/30 bg-emerald-400/10 text-emerald-400 px-3 py-2 text-[11px] font-mono uppercase tracking-widest hover:bg-emerald-400/20 transition-colors">
                    <Check className="size-3.5" /> Approve
                  </button>
                  <button onClick={() => update(r.id, { status: "rejected" })}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-rose-400/30 bg-rose-400/10 text-rose-400 px-3 py-2 text-[11px] font-mono uppercase tracking-widest hover:bg-rose-400/20 transition-colors">
                    <X className="size-3.5" /> Reject
                  </button>
                </div>
              )}

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
    </AdminShell>
  );
}
