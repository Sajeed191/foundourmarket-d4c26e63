import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LogOut, Package, Loader2, RotateCcw, MapPin } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";

export const Route = createFileRoute("/account")({
  head: () => ({ meta: [{ title: "Account — FoundOurMarket™" }] }),
  component: AccountPage,
});

type Order = {
  id: string;
  status: string;
  total: number;
  currency: string;
  created_at: string;
  order_items: { name: string; quantity: number; image: string | null }[];
};

function AccountPage() {
  const { user, loading, signOut } = useAuth();
  const { format } = useRegion();
  const nav = useNavigate();
  const [orders, setOrders] = useState<Order[] | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("orders")
      .select("id,status,total,currency,created_at,order_items(name,quantity,image)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setOrders((data as Order[]) ?? []));
  }, [user]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <div className="flex items-end justify-between flex-wrap gap-4 mb-12">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
          <h1 className="text-3xl md:text-5xl font-display font-semibold">
            {user.user_metadata?.full_name || user.email}
          </h1>
          <p className="text-sm text-muted-foreground mt-2">{user.email}</p>
        </div>
        <div className="flex items-center gap-2">
          <Link to="/account/addresses" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest border border-border rounded-full px-5 py-2.5 hover:border-accent/40">
            <MapPin className="size-3.5" /> Addresses
          </Link>
          <Link to="/account/returns" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest border border-border rounded-full px-5 py-2.5 hover:border-accent/40">
            <RotateCcw className="size-3.5" /> Returns
          </Link>
          <button onClick={signOut} className="inline-flex items-center gap-2 text-xs uppercase tracking-widest border border-border rounded-full px-5 py-2.5 hover:border-accent/40">
            <LogOut className="size-3.5" /> Sign out
          </button>
        </div>
      </div>

      <section>
        <h2 className="text-xl font-medium mb-6 flex items-center gap-2">
          <Package className="size-4 text-accent" /> Orders
        </h2>
        {orders === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : orders.length === 0 ? (
          <div className="bg-card border border-border rounded-2xl p-10 text-center">
            <p className="text-sm text-muted-foreground mb-4">You haven't placed any orders yet.</p>
            <Link to="/" className="inline-block bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold">Start shopping</Link>
          </div>
        ) : (
          <div className="space-y-3">
            {orders.map((o) => (
              <Link
                key={o.id}
                to="/orders/$id"
                params={{ id: o.id }}
                className="bg-card border border-border rounded-2xl p-5 flex items-center justify-between gap-4 flex-wrap hover:border-accent/40 transition-colors"
              >
                <div className="min-w-0">
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                    #{o.id.slice(0, 8)} · {new Date(o.created_at).toLocaleDateString()}
                  </p>
                  <p className="font-medium mt-1">
                    {o.order_items.length} item{o.order_items.length === 1 ? "" : "s"} · <span className="text-accent">{o.status}</span>
                  </p>
                  <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-md">
                    {o.order_items.map((i) => `${i.name}×${i.quantity}`).join(", ")}
                  </p>
                </div>
                <span className="font-mono text-sm text-accent">{format(Number(o.total))}</span>
              </Link>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
