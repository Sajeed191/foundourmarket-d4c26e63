import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Flame, Plus, Pencil, Pause, Play, Trash2, Loader2, X, Eye, MousePointerClick, ShoppingBag, TrendingUp } from "lucide-react";
import { toast } from "sonner";
import { AdminShell } from "@/components/admin/AdminShell";
import { KpiCard } from "@/components/admin/KpiCard";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin-flash-deals")({
  head: () => ({ meta: [{ title: "Flash Deals — Admin" }, { name: "robots", content: "noindex, nofollow" }] }),
  component: FlashDealsAdmin,
});

type ProductOpt = { id: string; slug: string; name: string; price: number; image: string | null };

type Deal = {
  id: string;
  product_id: string;
  flash_price: number;
  start_at: string;
  end_at: string;
  priority: number;
  active: boolean;
  created_at: string;
};

type DealStatus = "active" | "scheduled" | "expired";

function statusOf(d: Deal, now: number): DealStatus {
  if (!d.active || new Date(d.end_at).getTime() < now) return "expired";
  if (new Date(d.start_at).getTime() > now) return "scheduled";
  return "active";
}

const STATUS_STYLE: Record<DealStatus, string> = {
  active: "border-emerald-500/40 text-emerald-300 bg-emerald-500/10",
  scheduled: "border-sky-500/40 text-sky-300 bg-sky-500/10",
  expired: "border-white/10 text-muted-foreground bg-white/5",
};

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const off = d.getTimezoneOffset();
  return new Date(d.getTime() - off * 60000).toISOString().slice(0, 16);
}

type FormState = {
  id: string | null;
  product_id: string;
  flash_price: string;
  start_at: string;
  end_at: string;
  priority: string;
  active: boolean;
};

function emptyForm(): FormState {
  const now = new Date();
  const end = new Date(now.getTime() + 24 * 3600 * 1000);
  return {
    id: null,
    product_id: "",
    flash_price: "",
    start_at: toLocalInput(now.toISOString()),
    end_at: toLocalInput(end.toISOString()),
    priority: "0",
    active: true,
  };
}

type Analytics = { impressions: number; clicks: number; purchases: number };
type AuditRow = {
  id: string;
  ran_at: string;
  expired_deactivated: number;
  invalid_product_deactivated: number;
  out_of_stock_deactivated: number;
  duplicates_found: number;
};

function FlashDealsAdmin() {
  const [deals, setDeals] = useState<Deal[] | null>(null);
  const [products, setProducts] = useState<ProductOpt[]>([]);
  const [editing, setEditing] = useState<FormState | null>(null);
  const [saving, setSaving] = useState(false);
  const [analytics, setAnalytics] = useState<Analytics>({ impressions: 0, clicks: 0, purchases: 0 });
  const [audit, setAudit] = useState<AuditRow[]>([]);
  const now = Date.now();

  function fetchDeals() {
    supabase
      .from("flash_deals")
      .select("*")
      .order("priority", { ascending: false })
      .order("created_at", { ascending: false })
      .then(({ data }) => setDeals((data as Deal[]) ?? []));
  }

  function fetchAnalytics() {
    supabase
      .from("flash_deal_events")
      .select("event_type")
      .then(({ data }) => {
        const rows = (data as { event_type: string }[]) ?? [];
        setAnalytics({
          impressions: rows.filter((r) => r.event_type === "impression").length,
          clicks: rows.filter((r) => r.event_type === "click").length,
          purchases: rows.filter((r) => r.event_type === "purchase").length,
        });
      });
    supabase
      .from("flash_deal_audit_log")
      .select("id,ran_at,expired_deactivated,invalid_product_deactivated,out_of_stock_deactivated,duplicates_found")
      .order("ran_at", { ascending: false })
      .limit(5)
      .then(({ data }) => setAudit((data as AuditRow[]) ?? []));
  }

  useEffect(() => {
    fetchDeals();
    fetchAnalytics();
    supabase
      .from("products")
      .select("id,slug,name,price,image")
      .eq("status", "published")
      .order("name")
      .then(({ data }) => setProducts((data as ProductOpt[]) ?? []));
    const ch = supabase
      .channel("admin-flash-deals")
      .on("postgres_changes", { event: "*", schema: "public", table: "flash_deals" }, fetchDeals)
      .subscribe();
    return () => {
      supabase.removeChannel(ch);
    };
  }, []);

  const conversion = analytics.impressions > 0
    ? ((analytics.purchases / analytics.impressions) * 100).toFixed(1)
    : "0.0";

  const productMap = useMemo(() => new Map(products.map((p) => [p.id, p])), [products]);

  const counts = useMemo(() => {
    const d = deals ?? [];
    return {
      total: d.length,
      active: d.filter((x) => statusOf(x, now) === "active").length,
      scheduled: d.filter((x) => statusOf(x, now) === "scheduled").length,
      expired: d.filter((x) => statusOf(x, now) === "expired").length,
    };
  }, [deals, now]);

  async function save() {
    if (!editing) return;
    if (!editing.product_id) return toast.error("Pick a product");
    const flash = Number(editing.flash_price);
    if (!(flash >= 0)) return toast.error("Enter a valid flash price");
    if (new Date(editing.end_at).getTime() <= new Date(editing.start_at).getTime())
      return toast.error("End date must be after start date");

    // Client-side duplicate guard (DB unique index is the hard backstop).
    if (editing.active) {
      const dupe = (deals ?? []).some(
        (d) => d.product_id === editing.product_id && d.active && d.id !== editing.id,
      );
      if (dupe) return toast.error("This product already has an active flash deal");
    }


    setSaving(true);
    const payload = {
      product_id: editing.product_id,
      flash_price: flash,
      start_at: new Date(editing.start_at).toISOString(),
      end_at: new Date(editing.end_at).toISOString(),
      priority: Number(editing.priority) || 0,
      active: editing.active,
    };
    const res = editing.id
      ? await supabase.from("flash_deals").update(payload).eq("id", editing.id)
      : await supabase.from("flash_deals").insert(payload);
    setSaving(false);
    if (res.error) {
      if (res.error.code === "23505") toast.error("This product already has an active flash deal");
      else toast.error(res.error.message);
      return;
    }
    toast.success(editing.id ? "Flash deal updated" : "Flash deal added");
    setEditing(null);
    fetchDeals();
    fetchAnalytics();
  }

  async function togglePause(d: Deal) {
    const { error } = await supabase.from("flash_deals").update({ active: !d.active }).eq("id", d.id);
    if (error) toast.error(error.message);
    else fetchDeals();
  }

  async function remove(d: Deal) {
    const { error } = await supabase.from("flash_deals").delete().eq("id", d.id);
    if (error) toast.error(error.message);
    else {
      toast.success("Flash deal removed");
      fetchDeals();
    }
  }

  function openEdit(d: Deal) {
    setEditing({
      id: d.id,
      product_id: d.product_id,
      flash_price: String(d.flash_price),
      start_at: toLocalInput(d.start_at),
      end_at: toLocalInput(d.end_at),
      priority: String(d.priority),
      active: d.active,
    });
  }

  return (
    <AdminShell
      title="Flash Deals"
      subtitle="Schedule, price & auto-expire limited-time product deals"
      allow={["admin", "super_admin", "manager"]}
    >
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Total" value={counts.total} icon={<Flame className="size-4" />} />
        <KpiCard label="Active" value={counts.active} icon={<Play className="size-4" />} />
        <KpiCard label="Scheduled" value={counts.scheduled} icon={<Plus className="size-4" />} />
        <KpiCard label="Expired" value={counts.expired} icon={<Pause className="size-4" />} />
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-5">
        <KpiCard label="Impressions" value={analytics.impressions} icon={<Eye className="size-4" />} />
        <KpiCard label="Clicks" value={analytics.clicks} icon={<MousePointerClick className="size-4" />} />
        <KpiCard label="Purchases" value={analytics.purchases} icon={<ShoppingBag className="size-4" />} />
        <KpiCard label="Conversion" value={`${conversion}%`} icon={<TrendingUp className="size-4" />} />
      </div>

      {audit.length > 0 && (
        <div className="rounded-2xl border border-border bg-card p-4 mb-5">
          <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-3">
            Daily Audit Log
          </p>
          <div className="space-y-1.5">
            {audit.map((a) => (
              <div key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
                <span className="font-mono text-foreground/80">{new Date(a.ran_at).toLocaleString()}</span>
                <span>expired: <b className="text-foreground">{a.expired_deactivated}</b></span>
                <span>invalid: <b className="text-foreground">{a.invalid_product_deactivated}</b></span>
                <span>out-of-stock: <b className="text-foreground">{a.out_of_stock_deactivated}</b></span>
                <span>duplicates: <b className="text-foreground">{a.duplicates_found}</b></span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="flex justify-end mb-4">
        <button
          onClick={() => setEditing(emptyForm())}
          className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition"
        >
          <Plus className="size-3.5" /> Add Flash Deal
        </button>
      </div>

      {deals === null ? (
        <div className="grid place-items-center py-20">
          <Loader2 className="size-6 animate-spin text-accent" />
        </div>
      ) : deals.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-10 text-center text-sm text-muted-foreground">
          No flash deals yet. Add one to feature it on the homepage.
        </div>
      ) : (
        <div className="space-y-2">
          {deals.map((d) => {
            const p = productMap.get(d.product_id);
            const st = statusOf(d, now);
            const off = p && p.price > 0 ? Math.round(((p.price - d.flash_price) / p.price) * 100) : 0;
            return (
              <div
                key={d.id}
                className="flex items-center gap-3 rounded-2xl border border-border bg-card p-3"
              >
                <div className="size-12 shrink-0 rounded-xl overflow-hidden bg-black/40 ring-1 ring-white/10">
                  {p?.image && <img loading="lazy" decoding="async" src={p.image} alt={p.name} className="w-full h-full object-cover" />}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{p?.name ?? "Unknown product"}</p>
                  <p className="text-[11px] text-muted-foreground tabular-nums">
                    {p ? <span className="line-through mr-1.5">{p.price}</span> : null}
                    <span className="text-accent font-semibold">{d.flash_price}</span>
                    {off > 0 && <span className="ml-1.5 text-accent">-{off}%</span>}
                    <span className="ml-2">· priority {d.priority}</span>
                  </p>
                  <p className="text-[10px] text-muted-foreground font-mono mt-0.5">
                    {new Date(d.start_at).toLocaleString()} → {new Date(d.end_at).toLocaleString()}
                  </p>
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest ${STATUS_STYLE[st]}`}
                >
                  {st}
                </span>
                <div className="flex items-center gap-1 shrink-0">
                  <button
                    onClick={() => openEdit(d)}
                    aria-label="Edit"
                    className="size-8 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => togglePause(d)}
                    aria-label={d.active ? "Pause" : "Resume"}
                    className="size-8 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition"
                  >
                    {d.active ? <Pause className="size-3.5" /> : <Play className="size-3.5" />}
                  </button>
                  <button
                    onClick={() => remove(d)}
                    aria-label="Remove"
                    className="size-8 grid place-items-center rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-md rounded-3xl border border-border bg-card p-5 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between">
              <h3 className="font-display font-semibold">{editing.id ? "Edit Flash Deal" : "Add Flash Deal"}</h3>
              <button onClick={() => setEditing(null)} className="size-8 grid place-items-center rounded-full hover:bg-white/5">
                <X className="size-4" />
              </button>
            </div>

            <label className="block space-y-1">
              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Product</span>
              <select
                value={editing.product_id}
                onChange={(e) => setEditing({ ...editing, product_id: e.target.value })}
                className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
              >
                <option value="">Select a product…</option>
                {products.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} — {p.price}
                  </option>
                ))}
              </select>
            </label>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Flash price</span>
                <input
                  type="number"
                  min={0}
                  value={editing.flash_price}
                  onChange={(e) => setEditing({ ...editing, flash_price: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Priority</span>
                <input
                  type="number"
                  value={editing.priority}
                  onChange={(e) => setEditing({ ...editing, priority: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Start</span>
                <input
                  type="datetime-local"
                  value={editing.start_at}
                  onChange={(e) => setEditing({ ...editing, start_at: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
              <label className="block space-y-1">
                <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">End</span>
                <input
                  type="datetime-local"
                  value={editing.end_at}
                  onChange={(e) => setEditing({ ...editing, end_at: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-accent"
                />
              </label>
            </div>

            <label className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={editing.active}
                onChange={(e) => setEditing({ ...editing, active: e.target.checked })}
                className="size-4 accent-[var(--color-accent)]"
              />
              Active
            </label>

            <button
              onClick={save}
              disabled={saving}
              className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-60"
            >
              {saving ? <Loader2 className="size-4 animate-spin" /> : <Flame className="size-4" />}
              {editing.id ? "Save changes" : "Create flash deal"}
            </button>
          </div>
        </div>
      )}
    </AdminShell>
  );
}
