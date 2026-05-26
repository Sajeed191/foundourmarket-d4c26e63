import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ArrowLeft, RotateCcw, Package } from "lucide-react";
import { motion } from "framer-motion";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";

const searchSchema = z.object({ order: z.string().optional() });

export const Route = createFileRoute("/account/returns")({
  head: () => ({ meta: [{ title: "Returns — FoundOurMarket™" }] }),
  validateSearch: searchSchema,
  component: ReturnsPage,
});

type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  reason: string;
  refund_amount: number;
  refund_status: string;
  created_at: string;
};

type OrderItem = { id: string; name: string; product_slug: string; quantity: number; unit_price: number };
type OrderForReturn = { id: string; order_items: OrderItem[] };

function ReturnsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { order } = useSearch({ from: "/account/returns" });
  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [eligibleOrder, setEligibleOrder] = useState<OrderForReturn | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("returns").select("id,order_id,status,reason,refund_amount,refund_status,created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setReturns((data as ReturnRow[]) ?? []));
  }, [user]);

  useEffect(() => {
    if (!user || !order) { setEligibleOrder(null); return; }
    supabase.from("orders").select("id,order_items(id,name,product_slug,quantity,unit_price)").eq("id", order).maybeSingle()
      .then(({ data }) => setEligibleOrder((data as OrderForReturn) ?? null));
  }, [user, order]);

  async function submit() {
    if (!user || !eligibleOrder) return;
    const items = Object.entries(qty).filter(([, q]) => q > 0);
    if (items.length === 0) { toast.error("Pick at least one item"); return; }
    if (!reason.trim()) { toast.error("Reason required"); return; }
    setSubmitting(true);
    const refund = items.reduce((sum, [iid, q]) => {
      const it = eligibleOrder.order_items.find((x) => x.id === iid);
      return sum + (it ? Number(it.unit_price) * q : 0);
    }, 0);
    const { data: r, error } = await supabase.from("returns").insert({
      order_id: eligibleOrder.id, user_id: user.id, reason, notes: notes || null, refund_amount: refund,
    }).select("id").single();
    if (error || !r) { setSubmitting(false); toast.error(error?.message ?? "Failed"); return; }
    const rows = items.map(([iid, q]) => {
      const it = eligibleOrder.order_items.find((x) => x.id === iid)!;
      return { return_id: r.id, order_item_id: iid, product_slug: it.product_slug, quantity: q };
    });
    await supabase.from("return_items").insert(rows);
    setSubmitting(false);
    toast.success("Return submitted");
    nav({ to: "/account/returns" });
  }

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="container-page py-10 sm:py-16 max-w-3xl">
      <Link to="/account" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-foreground mb-6">
        <ArrowLeft className="size-3.5" /> Account
      </Link>
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
        <h1 className="text-fluid-2xl font-display font-semibold flex items-center gap-3">
          <RotateCcw className="size-7 text-accent" /> Returns
        </h1>
        <p className="text-sm text-muted-foreground mt-2 max-w-md">
          Submit a return request and track refund status. Returns are reviewed within 2 business days.
        </p>
      </motion.div>

      {eligibleOrder && (
        <motion.div
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
          className="bg-card border border-border rounded-2xl p-5 sm:p-6 mt-8"
        >
          <h2 className="text-sm font-medium mb-4">Request return for order #{eligibleOrder.id.slice(0, 8)}</h2>
          <div className="space-y-3 mb-4">
            {eligibleOrder.order_items.map((it) => (
              <div key={it.id} className="flex items-center gap-3">
                <div className="flex-1 min-w-0">
                  <p className="text-sm truncate">{it.name}</p>
                  <p className="text-xs text-muted-foreground font-mono">Ordered: {it.quantity}</p>
                </div>
                <input type="number" min={0} max={it.quantity} value={qty[it.id] ?? 0}
                  onChange={(e) => setQty((p) => ({ ...p, [it.id]: Math.min(it.quantity, Math.max(0, Number(e.target.value))) }))}
                  className="w-20 bg-background border border-border rounded-md px-2 py-1.5 text-sm focus:outline-none focus:border-accent" />
              </div>
            ))}
          </div>
          <select value={reason} onChange={(e) => setReason(e.target.value)}
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent mb-3">
            <option value="">Select reason…</option>
            <option value="Defective / damaged">Defective / damaged</option>
            <option value="Wrong item">Wrong item</option>
            <option value="Not as described">Not as described</option>
            <option value="No longer needed">No longer needed</option>
            <option value="Other">Other</option>
          </select>
          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} placeholder="Additional details (optional)"
            className="w-full bg-background border border-border rounded-md px-3 py-2 text-sm focus:outline-none focus:border-accent mb-4" />
          <button onClick={submit} disabled={submitting}
            className="w-full sm:w-auto bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 transition-all">
            {submitting ? "Submitting…" : "Submit return"}
          </button>
        </motion.div>
      )}

      <div className="mt-10">
        <h2 className="text-sm font-medium mb-4 uppercase tracking-widest text-muted-foreground">Your returns</h2>
        {returns === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : returns.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-card border border-border rounded-2xl p-12 sm:p-16 text-center"
          >
            <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
              <Package className="size-5 text-muted-foreground" />
            </div>
            <p className="text-base font-medium">No returns yet</p>
            <p className="text-sm text-muted-foreground mt-1">Eligible orders can be returned from the order page.</p>
          </motion.div>
        ) : (
          <div className="space-y-3">
            {returns.map((r, i) => (
              <motion.div
                key={r.id}
                initial={{ opacity: 0, y: 8 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.04 }}
                className="bg-card border border-border rounded-2xl p-4 sm:p-5 flex items-center justify-between flex-wrap gap-3 hover:border-accent/30 transition-colors"
              >
                <div>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Return #{r.id.slice(0, 8)} · Order #{r.order_id.slice(0, 8)}</p>
                  <p className="text-sm mt-1">{r.reason}</p>
                </div>
                <div className="text-right">
                  <span className="text-[10px] font-mono uppercase tracking-widest text-accent bg-accent/10 px-2 py-1 rounded-full">{r.status}</span>
                  <p className="font-mono text-sm mt-1">${Number(r.refund_amount).toFixed(2)} · {r.refund_status}</p>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
