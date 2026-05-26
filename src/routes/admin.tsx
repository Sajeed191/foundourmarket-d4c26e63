import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldAlert, TrendingUp, ShoppingBag, Users, Package, Plus, Pencil, Trash2, X, Upload, Tag, Ticket, Mail, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { invalidateProducts } from "@/lib/use-products";
import { invalidateCategories, type Category } from "@/lib/use-categories";
import { resolveImage } from "@/lib/products";


export const Route = createFileRoute("/admin")({
  head: () => ({ meta: [{ title: "Admin — FoundOurMarket™" }] }),
  component: AdminPage,
});

type Order = {
  id: string; user_id: string; status: string; total: number; currency: string;
  contact_email: string | null; created_at: string;
  order_items: { name: string; quantity: number }[];
};

type ProductRow = {
  id: string; slug: string; name: string; tagline: string | null; category: string;
  price: number | string; rating: number | string; reviews: number;
  image: string | null; description: string | null; in_stock: boolean;
  discount: number | null; sort_order: number; featured: boolean;
};

type PromoRow = {
  id: string; code: string; kind: "percent" | "fixed"; value: number | string;
  active: boolean; max_uses: number | null; uses: number;
  min_subtotal: number | string; expires_at: string | null;
};

type Subscriber = {
  id: string; email: string; source: string | null; status: string; created_at: string;
};

const STATUSES = ["pending", "processing", "shipped", "delivered", "cancelled"] as const;
type Tab = "overview" | "orders" | "customers" | "products" | "categories" | "promos" | "subscribers";

function AdminPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [isAdmin, setIsAdmin] = useState<boolean | null>(null);
  const [orders, setOrders] = useState<Order[] | null>(null);
  const [products, setProducts] = useState<ProductRow[] | null>(null);
  const [categories, setCategories] = useState<Category[] | null>(null);
  const [tab, setTab] = useState<Tab>("overview");
  const [updating, setUpdating] = useState<string | null>(null);
  const [editing, setEditing] = useState<ProductRow | "new" | null>(null);
  const [editingCat, setEditingCat] = useState<Category | "new" | null>(null);
  const [promos, setPromos] = useState<PromoRow[] | null>(null);
  const [editingPromo, setEditingPromo] = useState<PromoRow | "new" | null>(null);
  const [subscribers, setSubscribers] = useState<Subscriber[] | null>(null);


  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

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
    loadProducts();
    loadCategories();
    loadPromos();
    loadSubscribers();
  }, [isAdmin]);

  async function loadProducts() {
    const { data } = await supabase.from("products").select("*").order("sort_order", { ascending: true });
    setProducts((data as ProductRow[]) ?? []);
  }

  async function loadSubscribers() {
    const { data } = await supabase.from("newsletter_subscribers").select("*").order("created_at", { ascending: false });
    setSubscribers((data as Subscriber[]) ?? []);
  }

  async function deleteSubscriber(id: string) {
    if (!confirm("Remove this subscriber?")) return;
    await supabase.from("newsletter_subscribers").delete().eq("id", id);
    setSubscribers((prev) => prev?.filter((s) => s.id !== id) ?? null);
  }

  function exportSubscribersCSV() {
    if (!subscribers?.length) return;
    const rows = [["email", "source", "status", "created_at"]].concat(
      subscribers.map((s) => [s.email, s.source ?? "", s.status, s.created_at])
    );
    const csv = rows.map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `subscribers-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }


  async function loadPromos() {
    const { data } = await supabase.from("promo_codes").select("*").order("created_at", { ascending: false });
    setPromos((data as PromoRow[]) ?? []);
  }

  async function loadCategories() {
    const { data } = await supabase.from("categories").select("*").order("sort_order", { ascending: true });
    setCategories((data as Category[]) ?? []);
  }

  async function updateStatus(id: string, status: string) {
    setUpdating(id);
    const { error } = await supabase.from("orders").update({ status }).eq("id", id);
    if (!error) setOrders((prev) => prev?.map((o) => o.id === id ? { ...o, status } : o) ?? null);
    setUpdating(null);
  }

  async function deleteProduct(id: string) {
    if (!confirm("Delete this product?")) return;
    await supabase.from("products").delete().eq("id", id);
    await loadProducts();
    invalidateProducts();
  }

  async function deleteCategory(id: string) {
    if (!confirm("Delete this category? Products in it will keep their category slug.")) return;
    await supabase.from("categories").delete().eq("id", id);
    await loadCategories();
    invalidateCategories();
  }

  async function deletePromo(id: string) {
    if (!confirm("Delete this promo code?")) return;
    await supabase.from("promo_codes").delete().eq("id", id);
    await loadPromos();
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

      <div className="flex gap-1 mb-10 border-b border-border overflow-x-auto">
        {(["overview", "orders", "products", "categories", "promos", "customers"] as Tab[]).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-xs uppercase tracking-widest font-mono transition-colors border-b-2 -mb-px whitespace-nowrap ${tab === t ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t}
          </button>
        ))}
      </div>

      {tab === "overview" && (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-5 mb-12">
            <Stat icon={<TrendingUp className="size-4" />} label="Revenue" value={`$${totalRevenue.toFixed(2)}`} />
            <Stat icon={<ShoppingBag className="size-4" />} label="Orders" value={list.length} />
            <Stat icon={<Users className="size-4" />} label="Customers" value={customers.length} />
            <Stat icon={<Package className="size-4" />} label="Products" value={products?.length ?? 0} />
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
          <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-4">Units sold: {totalUnits}</p>
        </>
      )}

      {tab === "orders" && (
        orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        list.length === 0 ? <p className="text-sm text-muted-foreground">No orders yet.</p> :
        <div className="overflow-x-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm min-w-[800px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr><th className="text-left px-5 py-3">Order</th><th className="text-left px-5 py-3">Customer</th><th className="text-left px-5 py-3">Items</th><th className="text-left px-5 py-3">Status</th><th className="text-right px-5 py-3">Total</th><th className="text-right px-5 py-3">Date</th></tr>
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

      {tab === "products" && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-medium">Catalog</h2>
            <button onClick={() => setEditing("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
              <Plus className="size-3.5" /> New Product
            </button>
          </div>
          {products === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            products.length === 0 ? <p className="text-sm text-muted-foreground">No products yet.</p> :
            <div className="overflow-x-auto bg-card border border-border rounded-2xl">
              <table className="w-full text-sm min-w-[720px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr><th className="text-left px-5 py-3">Product</th><th className="text-left px-5 py-3">Category</th><th className="text-right px-5 py-3">Price</th><th className="text-right px-5 py-3">Stock</th><th className="px-5 py-3"></th></tr>
                </thead>
                <tbody>
                  {products.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-10 rounded-lg overflow-hidden bg-background border border-border shrink-0">
                            {p.image && <img src={resolveImage(p.image)} alt="" className="w-full h-full object-cover" />}
                          </div>
                          <div>
                            <p className="text-sm">{p.name}</p>
                            <p className="font-mono text-[10px] text-muted-foreground">{p.slug}</p>
                          </div>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs text-muted-foreground capitalize">{p.category}</td>
                      <td className="px-5 py-3 text-right font-mono text-accent">${Number(p.price).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex flex-wrap gap-1 justify-end">
                          {p.featured && <span className="text-[9px] font-mono uppercase tracking-widest bg-foreground/10 text-foreground px-2 py-0.5 rounded-full">Featured</span>}
                          {p.discount && <span className="text-[9px] font-mono uppercase tracking-widest bg-accent/15 text-accent px-2 py-0.5 rounded-full">Sale −{p.discount}%</span>}
                          <span className={`text-[9px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full ${p.in_stock ? "bg-accent/10 text-accent" : "bg-muted text-muted-foreground"}`}>
                            {p.in_stock ? "In stock" : "Out"}
                          </span>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditing(p)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 transition-colors" aria-label="Edit">
                            <Pencil className="size-3.5" />
                          </button>
                          <button onClick={() => deleteProduct(p.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent transition-colors" aria-label="Delete">
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {tab === "customers" && (
        orders === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        customers.length === 0 ? <p className="text-sm text-muted-foreground">No customers yet.</p> :
        <div className="overflow-x-auto bg-card border border-border rounded-2xl">
          <table className="w-full text-sm min-w-[640px]">
            <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
              <tr><th className="text-left px-5 py-3">Customer</th><th className="text-right px-5 py-3">Orders</th><th className="text-right px-5 py-3">Spent</th><th className="text-right px-5 py-3">Last Order</th></tr>
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

      {tab === "categories" && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-medium">Categories</h2>
            <button onClick={() => setEditingCat("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
              <Plus className="size-3.5" /> New Category
            </button>
          </div>
          {categories === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            categories.length === 0 ? <p className="text-sm text-muted-foreground">No categories yet.</p> :
            <div className="overflow-x-auto bg-card border border-border rounded-2xl">
              <table className="w-full text-sm min-w-[640px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr><th className="text-left px-5 py-3">Category</th><th className="text-left px-5 py-3">Slug</th><th className="text-right px-5 py-3">Products</th><th className="text-right px-5 py-3">Order</th><th className="px-5 py-3"></th></tr>
                </thead>
                <tbody>
                  {categories.map((c) => {
                    const count = products?.filter((p) => p.category === c.slug).length ?? 0;
                    return (
                      <tr key={c.id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                        <td className="px-5 py-3">
                          <div className="flex items-center gap-3">
                            <div className="size-9 rounded-lg overflow-hidden bg-background border border-border shrink-0 grid place-items-center">
                              {c.image ? <img src={c.image} alt="" className="w-full h-full object-cover" /> : <Tag className="size-4 text-muted-foreground" />}
                            </div>
                            <p className="text-sm">{c.name}</p>
                          </div>
                        </td>
                        <td className="px-5 py-3 text-xs font-mono text-muted-foreground">{c.slug}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs">{count}</td>
                        <td className="px-5 py-3 text-right font-mono text-xs text-muted-foreground">{c.sort_order}</td>
                        <td className="px-5 py-3 text-right">
                          <div className="flex justify-end gap-1">
                            <button onClick={() => setEditingCat(c)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 transition-colors" aria-label="Edit">
                              <Pencil className="size-3.5" />
                            </button>
                            <button onClick={() => deleteCategory(c.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent transition-colors" aria-label="Delete">
                              <Trash2 className="size-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {tab === "promos" && (
        <>
          <div className="flex justify-between items-center mb-6">
            <h2 className="text-xl font-medium">Promo Codes</h2>
            <button onClick={() => setEditingPromo("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">
              <Plus className="size-3.5" /> New Code
            </button>
          </div>
          {promos === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            promos.length === 0 ? <p className="text-sm text-muted-foreground">No promo codes yet.</p> :
            <div className="overflow-x-auto bg-card border border-border rounded-2xl">
              <table className="w-full text-sm min-w-[760px]">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr>
                    <th className="text-left px-5 py-3">Code</th>
                    <th className="text-left px-5 py-3">Discount</th>
                    <th className="text-right px-5 py-3">Min Subtotal</th>
                    <th className="text-right px-5 py-3">Uses</th>
                    <th className="text-left px-5 py-3">Expires</th>
                    <th className="text-left px-5 py-3">Status</th>
                    <th className="px-5 py-3"></th>
                  </tr>
                </thead>
                <tbody>
                  {promos.map((p) => (
                    <tr key={p.id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                      <td className="px-5 py-3">
                        <div className="flex items-center gap-3">
                          <div className="size-9 rounded-lg bg-background border border-border grid place-items-center"><Ticket className="size-4 text-muted-foreground" /></div>
                          <p className="font-mono uppercase tracking-widest text-xs">{p.code}</p>
                        </div>
                      </td>
                      <td className="px-5 py-3 text-xs">{p.kind === "percent" ? `${Number(p.value)}%` : `$${Number(p.value).toFixed(2)}`}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs">${Number(p.min_subtotal).toFixed(2)}</td>
                      <td className="px-5 py-3 text-right font-mono text-xs">{p.uses}{p.max_uses != null ? ` / ${p.max_uses}` : ""}</td>
                      <td className="px-5 py-3 text-[11px] font-mono text-muted-foreground">{p.expires_at ? new Date(p.expires_at).toLocaleDateString() : "—"}</td>
                      <td className="px-5 py-3 text-[11px] font-mono uppercase tracking-widest">
                        <span className={p.active ? "text-accent" : "text-muted-foreground"}>{p.active ? "Active" : "Inactive"}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => setEditingPromo(p)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 transition-colors" aria-label="Edit"><Pencil className="size-3.5" /></button>
                          <button onClick={() => deletePromo(p.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-accent transition-colors" aria-label="Delete"><Trash2 className="size-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {editing && (
        <ProductEditor
          row={editing === "new" ? null : editing}
          nextSort={(products?.length ?? 0) + 1}
          categories={categories ?? []}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await loadProducts(); invalidateProducts(); }}
        />
      )}

      {editingCat && (
        <CategoryEditor
          row={editingCat === "new" ? null : editingCat}
          nextSort={(categories?.length ?? 0) + 1}
          onClose={() => setEditingCat(null)}
          onSaved={async () => { setEditingCat(null); await loadCategories(); invalidateCategories(); }}
        />
      )}

      {editingPromo && (
        <PromoEditor
          row={editingPromo === "new" ? null : editingPromo}
          onClose={() => setEditingPromo(null)}
          onSaved={async () => { setEditingPromo(null); await loadPromos(); }}
        />
      )}
    </div>
  );
}

function PromoEditor({ row, onClose, onSaved }: { row: PromoRow | null; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    code: row?.code ?? "",
    kind: (row?.kind ?? "percent") as "percent" | "fixed",
    value: row ? String(row.value) : "10",
    active: row?.active ?? true,
    min_subtotal: row ? String(row.min_subtotal) : "0",
    max_uses: row?.max_uses != null ? String(row.max_uses) : "",
    expires_at: row?.expires_at ? row.expires_at.slice(0, 10) : "",
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {
      code: form.code.trim().toUpperCase(),
      kind: form.kind,
      value: Number(form.value) || 0,
      active: form.active,
      min_subtotal: Number(form.min_subtotal) || 0,
      max_uses: form.max_uses ? Number(form.max_uses) : null,
      expires_at: form.expires_at ? new Date(form.expires_at).toISOString() : null,
    };
    const { error } = row
      ? await supabase.from("promo_codes").update(payload).eq("id", row.id)
      : await supabase.from("promo_codes").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-card border border-border rounded-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display">{row ? "Edit Promo Code" : "New Promo Code"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Code" required value={form.code} onChange={(v) => setForm({ ...form, code: v.toUpperCase() })} />
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Kind</label>
            <select value={form.kind} onChange={(e) => setForm({ ...form, kind: e.target.value as "percent" | "fixed" })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
              <option value="percent">Percent off</option>
              <option value="fixed">Fixed amount (USD)</option>
            </select>
          </div>
          <Field label={form.kind === "percent" ? "Value (%)" : "Value (USD)"} type="number" required value={form.value} onChange={(v) => setForm({ ...form, value: v })} />
          <Field label="Min Subtotal (USD)" type="number" value={form.min_subtotal} onChange={(v) => setForm({ ...form, min_subtotal: v })} />
          <Field label="Max Uses (blank = ∞)" type="number" value={form.max_uses} onChange={(v) => setForm({ ...form, max_uses: v })} />
          <Field label="Expires" type="date" value={form.expires_at} onChange={(v) => setForm({ ...form, expires_at: v })} />
          <label className="flex items-center gap-2 text-sm col-span-2">
            <input type="checkbox" checked={form.active} onChange={(e) => setForm({ ...form, active: e.target.checked })} className="accent-[var(--accent)]" />
            Active
          </label>
        </div>
        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-border hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}


function ProductEditor({ row, nextSort, categories, onClose, onSaved }: { row: ProductRow | null; nextSort: number; categories: Category[]; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: row?.slug ?? "",
    name: row?.name ?? "",
    tagline: row?.tagline ?? "",
    category: row?.category ?? categories[0]?.slug ?? "",

    price: row ? String(row.price) : "0",
    image: row?.image ?? "",
    description: row?.description ?? "",
    in_stock: row?.in_stock ?? true,
    discount: row?.discount ?? null as number | null,
    rating: row ? String(row.rating) : "5",
    reviews: row?.reviews ?? 0,
    sort_order: row?.sort_order ?? nextSort,
    featured: row?.featured ?? false,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {
      slug: form.slug.trim(),
      name: form.name.trim(),
      tagline: form.tagline.trim() || null,
      category: form.category,
      price: Number(form.price) || 0,
      image: form.image.trim() || null,
      description: form.description.trim() || null,
      in_stock: form.in_stock,
      discount: form.discount ? Number(form.discount) : null,
      rating: Number(form.rating) || 0,
      reviews: Number(form.reviews) || 0,
      sort_order: Number(form.sort_order) || 0,
      featured: form.featured,
    };
    const { error } = row
      ? await supabase.from("products").update(payload).eq("id", row.id)
      : await supabase.from("products").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-card border border-border rounded-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display">{row ? "Edit Product" : "New Product"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Slug" required value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
          <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Tagline" value={form.tagline} onChange={(v) => setForm({ ...form, tagline: v })} />
          <div>
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Category</label>
            <select value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent">
              {categories.map((c) => <option key={c.slug} value={c.slug}>{c.name}</option>)}
            </select>
          </div>
          <Field label="Price (USD)" type="number" required value={form.price} onChange={(v) => setForm({ ...form, price: v })} />
          <Field label="Discount %" type="number" value={form.discount?.toString() ?? ""} onChange={(v) => setForm({ ...form, discount: v ? Number(v) : null })} />
          <Field label="Rating" type="number" value={form.rating} onChange={(v) => setForm({ ...form, rating: v })} />
          <Field label="Reviews" type="number" value={String(form.reviews)} onChange={(v) => setForm({ ...form, reviews: Number(v) || 0 })} />
          <div className="col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Image</label>
            <div className="flex gap-3 items-start">
              <div className="size-20 rounded-lg overflow-hidden bg-background border border-border shrink-0 grid place-items-center">
                {form.image ? (
                  <img src={form.image.startsWith("http") ? form.image : form.image} alt="" className="w-full h-full object-cover" />
                ) : (
                  <Package className="size-5 text-muted-foreground" />
                )}
              </div>
              <div className="flex-1 space-y-2">
                <input type="text" value={form.image} onChange={(e) => setForm({ ...form, image: e.target.value })}
                  placeholder="Paste URL or upload below"
                  className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
                <label className="inline-flex items-center gap-2 cursor-pointer px-3 py-2 rounded-lg border border-border text-[10px] font-mono uppercase tracking-widest hover:bg-white/5 transition-colors">
                  {uploading ? <Loader2 className="size-3 animate-spin" /> : <Upload className="size-3" />}
                  {uploading ? "Uploading…" : "Upload Image"}
                  <input type="file" accept="image/*" className="hidden" disabled={uploading}
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      setUploading(true); setError(null);
                      const ext = file.name.split(".").pop() ?? "jpg";
                      const path = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
                      const { error: upErr } = await supabase.storage.from("product-images").upload(path, file, { contentType: file.type });
                      if (upErr) { setError(upErr.message); setUploading(false); return; }
                      const { data } = supabase.storage.from("product-images").getPublicUrl(path);
                      setForm((f) => ({ ...f, image: data.publicUrl }));
                      setUploading(false);
                    }} />
                </label>
              </div>
            </div>
          </div>
          <div className="col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.in_stock} onChange={(e) => setForm({ ...form, in_stock: e.target.checked })}
              className="accent-[var(--accent)]" />
            In stock
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={form.featured} onChange={(e) => setForm({ ...form, featured: e.target.checked })}
              className="accent-[var(--accent)]" />
            Featured
          </label>
        </div>
        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-border hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, value, onChange, type = "text", required }: { label: string; value: string; onChange: (v: string) => void; type?: string; required?: boolean }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">{label}</label>
      <input type={type} required={required} value={value} onChange={(e) => onChange(e.target.value)}
        className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
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

function CategoryEditor({ row, nextSort, onClose, onSaved }: { row: Category | null; nextSort: number; onClose: () => void; onSaved: () => void }) {
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [form, setForm] = useState({
    slug: row?.slug ?? "",
    name: row?.name ?? "",
    description: row?.description ?? "",
    image: row?.image ?? "",
    sort_order: row?.sort_order ?? nextSort,
  });

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true); setError(null);
    const payload = {
      slug: form.slug.trim().toLowerCase(),
      name: form.name.trim(),
      description: form.description.trim() || null,
      image: form.image.trim() || null,
      sort_order: Number(form.sort_order) || 0,
    };
    const { error } = row
      ? await supabase.from("categories").update(payload).eq("id", row.id)
      : await supabase.from("categories").insert(payload);
    setSaving(false);
    if (error) { setError(error.message); return; }
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-card border border-border rounded-2xl p-8 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-xl font-display">{row ? "Edit Category" : "New Category"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-4">
          <Field label="Slug" required value={form.slug} onChange={(v) => setForm({ ...form, slug: v })} />
          <Field label="Name" required value={form.name} onChange={(v) => setForm({ ...form, name: v })} />
          <Field label="Sort Order" type="number" value={String(form.sort_order)} onChange={(v) => setForm({ ...form, sort_order: Number(v) || 0 })} />
          <Field label="Image URL" value={form.image} onChange={(v) => setForm({ ...form, image: v })} />
          <div className="col-span-2">
            <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">Description</label>
            <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={3}
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
          </div>
        </div>
        {error && <p className="text-xs text-red-400 mt-4">{error}</p>}
        <div className="flex justify-end gap-2 mt-6">
          <button type="button" onClick={onClose} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest border border-border hover:bg-white/5">Cancel</button>
          <button type="submit" disabled={saving} className="px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50">
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </form>
    </div>
  );
}
