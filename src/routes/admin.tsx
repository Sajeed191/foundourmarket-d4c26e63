import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, TrendingUp, ShoppingBag, Users, Package, Check } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — FoundOurMarket™" }] }),
  component: AdminPage,
});

type Order = {
  id: string;
  user_id: string;
  status: string;
  total: number;
  currency: string;
  contact_email: string | null;
  created_at: string;
  order_items: { name: string; quantity: number }[];
};

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
type Tab = "overview" | "orders" | "customers";

function AdminPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [updating, setUpdating] = useState<string | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin").maybeSingle()
      .then(({ data }) => setIsAdmin(!!data));
  }, [user]);

  useEffect(() => {
    if (!isAdmin) return;
    supabase.from("orders")
      .select("id,user_id,status,total,currency,contact_email,created_at,order_items(name,quantity)")
      .order("created_at", { ascending: false }).limit(200)
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [isAdmin]);

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (!error) setOrders((prev) => prev?.map((o) => o.id === id ? { ...o, status } : o) ?? null);
    setUpdating(null);
  }

  if (loading || isAdmin === null) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  if (!isAdmin) {
    return (
      <div className="min-h-[60vh] grid place-items-center px-6">
        <div className="text-center max-w-md">
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <ShieldAlert className="size-5 text-accent" />
          </div>
          <h1 className="text-2xl font-display font-semibold mb-2">Admin access required</h1>
          <p className="text-sm text-muted-foreground mb-6">
            Signed in as <span className="text-foreground">{user?.email}</span>. Grant yourself the admin role to access the dashboard.
          </p>
          <code className="block text-left text-[11px] bg-card border border-border rounded-xl p-4 font-mono text-muted-foreground overflow-x-auto">
            insert into user_roles (user_id, role) values ('{user?.id}', 'admin');
          </code>
          <Link to="/" className="inline-block mt-6 text-xs uppercase tracking-widest text-accent">← Back to shop</Link>
        </div>
      </div>
    );
  }

  const list = orders ?? [];
  const totalRevenue = list.reduce((s, o) => s + Number(o.total), 0);
  const totalOrders = list.length;
  const customerMap = new Map<string, { email: string | null; orders: number; spent: number; last: string }>();
  for (const o of list) {
    const prev = customerMap.get(o.user_id);
    customerMap.set(o.user_id, {
      email: o.contact_email ?? prev?.email ?? null,
      orders: (prev?.orders ?? 0) + 1,
      spent: (prev?.spent ?? 0) + Number(o.total),
      last: prev?.last && prev.last > o.created_at ? prev.last : o.created_at,
    });
  }
  const customers = [...customerMap.entries()].sort((a, b) => b[1].spent - a[1].spent);
  const totalUnits = list.reduce((s, o) => s + o.order_items.reduce((a, i) => a + i.quantity, 0), 0);

  return (
    <div className="max-w-7xl mx-auto px-6 py-16">
      <div className="mb-10">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Operator</p>
        <h1 className="text-3xl md:text-5xl font-display font-semibold">Admin Dashboard</h1>
      </div>

      <div className="flex gap-1 mb-10 border-b border-border">
        {(["overview", "orders", "customers"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-xs uppercase tracking-widest font-mono transition-colors border-b-2 -mb-px ${tab === t ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-12">
            <Stat icon={<TrendingUp className="size-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
            <Stat icon={<ShoppingBag className="size-4" />} label="Orders" value={totalOrders} />
            <Stat icon={<Users className="size-4" />} label="Customers" value={customers.length} />
            <Stat icon={<Package className="size-4" />} label="Units" value={totalUnits} />
          </div>
          <h2 className="text-xl font-medium mb-6">Recent Activity</h2>
          {orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            list.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> :
            <div className="bg-card border border-border rounded-2xl divide-y divide-border/40">
              {list.slice(0, 8).map((o) => (
                <div key={o.id} className="px-5 py-4 flex items-center justify-between">
                  <div>
                    <p className="font-mono text-[11px] text-muted-foreground">#{o.id.slice(0, 8)}</p>
                    <p className="text-sm">{o.contact_email ?? "—"}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-mono text-accent">${Number(o.total).toFixed(2)}</p>
                    <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{o.status}</p>
                  </div>
                </div>
              ))}
            </div>
          }
        </>
      )}

      {tab === "orders" && (
        orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        list.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> :
        <div className="overflow-x-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-5 py-3">Order</th>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-left px-5 py-3">Items</th>
                <th className="text-left px-5 py-3">Status</th>
                <th className="text-right px-5 py-3">Total</th>
                <th className="text-right px-5 py-3">Date</th>
              </tr>
            </thead>
            <tbody>
              {list.map((o) => (
                <tr key={o.id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 font-mono text-[11px]">#{o.id.slice(0, 8)}</td>
                  <td className="px-5 py-3 text-xs truncate max-w-[180px]">{o.contact_email ?? "—"}</td>
                  <td className="px-5 py-3 text-xs text-muted-foreground">{o.order_items.reduce((s, i) => s + i.quantity, 0)} units</td>
                  <td className="px-5 py-3">
                    <div className="flex items-center gap-2">
                      <select value={o.status} onChange={(e) => updateStatus(o.id, e.target.value)} disabled={updating === o.id}
                        className="bg-background border border-border rounded-md px-2 py-1 text-[10px] font-mono uppercase tracking-widest text-accent focus:outline-none focus:border-accent">
                        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                      </select>
                      {updating === o.id ? <Loader2 className="size-3 animate-spin text-muted-foreground" /> : null}
                    </div>
                  </td>
                  <td className="px-5 py-3 text-right font-mono text-accent">${Number(o.total).toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-[11px] font-mono text-muted-foreground">{new Date(o.created_at).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "customers" && (
        orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        customers.length === 0 ? <p className="text-sm text-muted-foreground">No customers yet.</p> :
        <div className="overflow-x-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr>
                <th className="text-left px-5 py-3">Customer</th>
                <th className="text-right px-5 py-3">Orders</th>
                <th className="text-right px-5 py-3">Spent</th>
                <th className="text-right px-5 py-3">Last Order</th>
              </tr>
            </thead>
            <tbody>
              {customers.map(([uid, c]) => (
                <tr key={uid} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                  <td className="px-5 py-3 text-xs">{c.email ?? <span className="font-mono text-muted-foreground">{uid.slice(0, 8)}</span>}</td>
                  <td className="px-5 py-3 text-right font-mono text-xs">{c.orders}</td>
                  <td className="px-5 py-3 text-right font-mono text-accent">${c.spent.toFixed(2)}</td>
                  <td className="px-5 py-3 text-right text-[11px] font-mono text-muted-foreground">{new Date(c.last).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string | number }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-5">
      <div className="flex items-center justify-between mb-3 text-muted-foreground">
        <span className="text-[10px] font-mono uppercase tracking-widest">{label}</span>
        <span className="text-accent">{icon}</span>
      </div>
      <p className="text-2xl font-display font-semibold">{value}</p>
    </div>
  );
}

// silence unused import
void Check;
