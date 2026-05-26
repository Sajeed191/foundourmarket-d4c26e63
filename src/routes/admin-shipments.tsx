import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-shipments")({
  head: () => ({ meta: [{ title: "Shipments — Admin" }] }),
  component: AdminShipmentsPage,
});

type Order = {
  id: string;
  user_id: string;
  status: string;
  total: number;
  contact_email: string | null;
  fulfillment_status: string;
  tracking_number: string | null;
  carrier: string | null;
  created_at: string;
};

type Shipment = {
  id: string;
  order_id: string;
  carrier: string | null;
  tracking_number: string | null;
  tracking_url: string | null;
  status: string;
  shipped_at: string | null;
  delivered_at: string | null;
  created_at: string;
};

const SHIPMENT_STATUSES = ["pending", "label_created", "picked_up", "in_transit", "out_for_delivery", "delivered", "failed"] as const;

function AdminShipmentsPage() {
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [shipments, setShipments] = useState<Shipment[]>([]);
  const [creating, setCreating] = useState<string | null>(null);

  useEffect(() => { void load(); }, []);

  async function load() {
    const [{ data: o }, { data: s }] = await Promise.all([
      supabase.from("orders").select("id,user_id,status,total,contact_email,fulfillment_status,tracking_number,carrier,created_at").order("created_at", { ascending: false }).limit(200),
      supabase.from("shipments").select("*").order("created_at", { ascending: false }),
    ]);
    setOrders((o as Order[]) ?? []);
    setShipments((s as Shipment[]) ?? []);
  }

  async function createShipment(o: Order) {
    setCreating(o.id);
    const { error, data } = await supabase.from("shipments").insert({
      order_id: o.id,
      user_id: o.user_id,
      status: "pending",
    }).select().single();
    setCreating(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Shipment created");
    logActivity("shipment_create", "shipment", (data as { id: string } | null)?.id, { order_id: o.id });
    void load();
  }

  async function updateShipment(id: string, patch: Partial<Shipment>) {
    const before = shipments.find((s) => s.id === id);
    const next: Partial<Shipment> = { ...patch };
    if (patch.status === "in_transit" && !before?.shipped_at) next.shipped_at = new Date().toISOString();
    if (patch.status === "delivered" && !before?.delivered_at) next.delivered_at = new Date().toISOString();
    const { error } = await supabase.from("shipments").update(next).eq("id", id);
    if (error) { toast.error(error.message); return; }
    if (patch.status) {
      await supabase.from("shipment_events").insert({
        shipment_id: id,
        status: patch.status,
        description: `Status updated to ${patch.status.replace(/_/g, " ")}`,
      });
      logActivity("shipment_status", "shipment", id, { status: patch.status });
    }
    void load();
  }

  return (
    <AdminShell
      title="Shipments"
      subtitle="Create shipments and track delivery status. Updates sync to customer order timelines."
      allow={["admin","super_admin","manager","fulfillment","warehouse_staff"]}
    >
      {orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        orders.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> : (
        <div className="space-y-3">
          {orders.map((o) => {
            const orderShipments = shipments.filter((s) => s.order_id === o.id);
            return (
              <div key={o.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-center justify-between flex-wrap gap-3 mb-3">
                  <div>
                    <p className="font-mono text-[11px] text-muted-foreground">#{o.id.slice(0, 8)}</p>
                    <p className="text-sm">{o.contact_email ?? "—"} · <span className="text-muted-foreground">${Number(o.total).toFixed(2)}</span></p>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-accent bg-accent/10 px-2 py-1 rounded-full">{o.fulfillment_status}</span>
                    {orderShipments.length === 0 && (
                      <button onClick={() => createShipment(o)} disabled={creating === o.id}
                        className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold disabled:opacity-50">
                        {creating === o.id ? <Loader2 className="size-3 animate-spin" /> : <Plus className="size-3" />} Create shipment
                      </button>
                    )}
                  </div>
                </div>
                {orderShipments.map((s) => (
                  <div key={s.id} className="border-t border-border/40 pt-3 mt-3 grid sm:grid-cols-4 gap-2">
                    <input
                      defaultValue={s.carrier ?? ""}
                      placeholder="Carrier"
                      onBlur={(e) => e.target.value !== (s.carrier ?? "") && updateShipment(s.id, { carrier: e.target.value })}
                      className="bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent"
                    />
                    <input
                      defaultValue={s.tracking_number ?? ""}
                      placeholder="Tracking #"
                      onBlur={(e) => e.target.value !== (s.tracking_number ?? "") && updateShipment(s.id, { tracking_number: e.target.value })}
                      className="bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent font-mono"
                    />
                    <input
                      defaultValue={s.tracking_url ?? ""}
                      placeholder="Tracking URL"
                      onBlur={(e) => e.target.value !== (s.tracking_url ?? "") && updateShipment(s.id, { tracking_url: e.target.value })}
                      className="bg-background border border-border rounded-md px-3 py-2 text-xs focus:outline-none focus:border-accent"
                    />
                    <select
                      value={s.status}
                      onChange={(e) => updateShipment(s.id, { status: e.target.value })}
                      className="bg-background border border-border rounded-md px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent"
                    >
                      {SHIPMENT_STATUSES.map((st) => <option key={st} value={st}>{st.replace(/_/g, " ")}</option>)}
                    </select>
                  </div>
                ))}
              </div>
            );
          })}
        </div>
      )}
    </AdminShell>
  );
}
