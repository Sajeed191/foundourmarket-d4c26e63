import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Users, Search, Pin, Trash2, Plus, Tag, X, Loader2, Crown } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { downloadCSV } from "@/lib/admin-queries";

export const Route = createFileRoute("/admin-customers")({
  head: () => ({ meta: [{ title: "Customers — Admin" }] }),
  component: CustomersPage,
});

type Customer = {
  user_id: string; email: string | null; full_name: string | null;
  orders: number; spent: number; last_order: string | null;
  created_at: string | null;
};
type Note = { id: string; note: string; pinned: boolean; created_at: string };
type CTag = { id: string; tag: string };

function CustomersPage() {
  const [customers, setCustomers] = useState<Customer[] | null>(null);
  const [q, setQ] = useState("");
  const [segment, setSegment] = useState<"all" | "vip" | "new" | "repeat">("all");
  const [selected, setSelected] = useState<Customer | null>(null);

  useEffect(() => { load(); }, []);

  async function load() {
    const [{ data: orders }, { data: profiles }] = await Promise.all([
      supabase.from("orders").select("user_id,total,contact_email,created_at").order("created_at", { ascending: false }).limit(2000),
      supabase.from("profiles").select("id,full_name,created_at"),
    ]);
    const profMap = new Map((profiles ?? []).map((p) => [p.id, p]));
    const m = new Map<string, Customer>();
    for (const o of orders ?? []) {
      const prev = m.get(o.user_id);
      const prof = profMap.get(o.user_id);
      m.set(o.user_id, {
        user_id: o.user_id,
        email: o.contact_email ?? prev?.email ?? null,
        full_name: prof?.full_name ?? prev?.full_name ?? null,
        orders: (prev?.orders ?? 0) + 1,
        spent: (prev?.spent ?? 0) + Number(o.total),
        last_order: !prev || o.created_at > (prev.last_order ?? "") ? o.created_at : prev.last_order,
        created_at: prof?.created_at ?? null,
      });
    }
    setCustomers([...m.values()].sort((a, b) => b.spent - a.spent));
  }

  const filtered = useMemo(() => {
    let list = customers ?? [];
    if (q) {
      const lq = q.toLowerCase();
      list = list.filter((c) => (c.email ?? "").toLowerCase().includes(lq) || (c.full_name ?? "").toLowerCase().includes(lq) || c.user_id.includes(lq));
    }
    if (segment === "vip") list = list.filter((c) => c.spent >= 500);
    else if (segment === "repeat") list = list.filter((c) => c.orders > 1);
    else if (segment === "new") list = list.filter((c) => c.orders === 1);
    return list;
  }, [customers, q, segment]);

  const totals = useMemo(() => {
    const list = customers ?? [];
    return {
      total: list.length,
      vip: list.filter((c) => c.spent >= 500).length,
      repeat: list.filter((c) => c.orders > 1).length,
      ltv: list.length ? list.reduce((s, c) => s + c.spent, 0) / list.length : 0,
      retention: list.length ? (list.filter((c) => c.orders > 1).length / list.length) * 100 : 0,
    };
  }, [customers]);

  function exportCSV() {
    downloadCSV("customers.csv", filtered.map((c) => ({
      email: c.email, name: c.full_name, orders: c.orders, spent: c.spent.toFixed(2), last_order: c.last_order, user_id: c.user_id,
    })));
  }

  return (
    <AdminShell title="Customers" subtitle="CRM with notes, tags and segments" allow={["admin","super_admin","manager","support"]} actions={
      <button onClick={exportCSV} className="inline-flex items-center gap-2 border border-border px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-mono hover:bg-white/5">Export CSV</button>
    }>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3 mb-6">
        <Stat label="Customers" value={totals.total} icon={<Users className="size-4" />} />
        <Stat label="VIP (≥$500)" value={totals.vip} icon={<Crown className="size-4" />} />
        <Stat label="Repeat" value={totals.repeat} icon={<Users className="size-4" />} />
        <Stat label="Avg LTV" value={`$${totals.ltv.toFixed(2)}`} />
        <Stat label="Retention" value={`${totals.retention.toFixed(1)}%`} />
      </div>

      <div className="flex items-center gap-3 mb-4 flex-wrap">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
          <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search by email or name"
            className="w-full bg-card border border-border rounded-full pl-9 pr-3 py-2 text-sm focus:outline-none focus:border-accent" />
        </div>
        <div className="inline-flex rounded-full border border-border bg-card p-0.5">
          {(["all", "vip", "repeat", "new"] as const).map((s) => (
            <button key={s} onClick={() => setSegment(s)}
              className={`px-3 py-1 text-[10px] font-mono uppercase tracking-widest rounded-full transition-colors ${segment === s ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>
              {s}
            </button>
          ))}
        </div>
      </div>

      {customers === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
        <div className="bg-card border border-border rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                <tr><th className="text-left px-5 py-3">Customer</th><th className="text-right px-5 py-3">Orders</th><th className="text-right px-5 py-3">Spent</th><th className="text-right px-5 py-3">Last order</th><th className="px-5 py-3"></th></tr>
              </thead>
              <tbody>
                {filtered.map((c) => (
                  <tr key={c.user_id} className="border-b border-border/40 last:border-0 hover:bg-white/[0.02]">
                    <td className="px-5 py-3">
                      <div className="flex items-center gap-3">
                        <div className="size-9 rounded-full grid place-items-center bg-accent/10 text-accent font-mono text-xs uppercase">
                          {(c.email ?? c.user_id)[0]}
                        </div>
                        <div>
                          <p className="text-sm">{c.full_name || c.email || c.user_id.slice(0, 8)}</p>
                          {c.email && c.full_name && <p className="text-[10px] font-mono text-muted-foreground">{c.email}</p>}
                        </div>
                        {c.spent >= 500 && <span className="text-[9px] font-mono uppercase tracking-widest bg-accent/15 text-accent px-2 py-0.5 rounded-full">VIP</span>}
                      </div>
                    </td>
                    <td className="px-5 py-3 text-right font-mono text-xs">{c.orders}</td>
                    <td className="px-5 py-3 text-right font-mono text-accent">${c.spent.toFixed(2)}</td>
                    <td className="px-5 py-3 text-right text-[11px] font-mono text-muted-foreground">{c.last_order ? new Date(c.last_order).toLocaleDateString() : "—"}</td>
                    <td className="px-5 py-3 text-right">
                      <button onClick={() => setSelected(c)} className="text-[10px] font-mono uppercase tracking-widest text-accent hover:underline">View</button>
                    </td>
                  </tr>
                ))}
                {filtered.length === 0 && <tr><td colSpan={5} className="px-5 py-8 text-center text-sm text-muted-foreground">No customers match.</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      }

      {selected && <CustomerDetail customer={selected} onClose={() => setSelected(null)} />}
    </AdminShell>
  );
}

function Stat({ label, value, icon }: { label: string; value: React.ReactNode; icon?: React.ReactNode }) {
  return (
    <div className="bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-muted-foreground mb-2">{icon}<span className="text-[10px] font-mono uppercase tracking-[0.3em]">{label}</span></div>
      <p className="text-xl font-display font-semibold">{value}</p>
    </div>
  );
}

function CustomerDetail({ customer, onClose }: { customer: Customer; onClose: () => void }) {
  const [notes, setNotes] = useState<Note[]>([]);
  const [tags, setTags] = useState<CTag[]>([]);
  const [newNote, setNewNote] = useState("");
  const [newTag, setNewTag] = useState("");

  useEffect(() => {
    supabase.from("customer_notes").select("*").eq("customer_id", customer.user_id).order("pinned", { ascending: false }).order("created_at", { ascending: false })
      .then(({ data }) => setNotes((data as Note[]) ?? []));
    supabase.from("customer_tags").select("*").eq("customer_id", customer.user_id)
      .then(({ data }) => setTags((data as CTag[]) ?? []));
  }, [customer.user_id]);

  async function addNote() {
    if (!newNote.trim()) return;
    const { data: u } = await supabase.auth.getUser();
    const { data } = await supabase.from("customer_notes").insert({
      customer_id: customer.user_id, note: newNote.trim(), author_id: u.user?.id,
    }).select().single();
    if (data) setNotes([data as Note, ...notes]);
    setNewNote("");
  }
  async function togglePin(n: Note) {
    await supabase.from("customer_notes").update({ pinned: !n.pinned }).eq("id", n.id);
    setNotes(notes.map((x) => x.id === n.id ? { ...x, pinned: !x.pinned } : x));
  }
  async function deleteNote(id: string) {
    await supabase.from("customer_notes").delete().eq("id", id);
    setNotes(notes.filter((n) => n.id !== id));
  }
  async function addTag() {
    if (!newTag.trim()) return;
    const t = newTag.trim().toLowerCase();
    const { data } = await supabase.from("customer_tags").insert({ customer_id: customer.user_id, tag: t }).select().single();
    if (data) setTags([...tags, data as CTag]);
    setNewTag("");
  }
  async function deleteTag(id: string) {
    await supabase.from("customer_tags").delete().eq("id", id);
    setTags(tags.filter((t) => t.id !== id));
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm p-4 grid place-items-center" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className="w-full max-w-2xl bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-start mb-6">
          <div>
            <h2 className="text-xl font-display">{customer.full_name || customer.email || customer.user_id.slice(0, 8)}</h2>
            {customer.email && <p className="text-xs font-mono text-muted-foreground">{customer.email}</p>}
            <div className="flex gap-4 mt-3 text-xs">
              <div><span className="text-muted-foreground">Orders</span><p className="font-mono text-accent">{customer.orders}</p></div>
              <div><span className="text-muted-foreground">Lifetime spend</span><p className="font-mono text-accent">${customer.spent.toFixed(2)}</p></div>
              <div><span className="text-muted-foreground">Member since</span><p className="font-mono">{customer.created_at ? new Date(customer.created_at).toLocaleDateString() : "—"}</p></div>
            </div>
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>

        <section className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3 flex items-center gap-2"><Tag className="size-3" /> Tags</p>
          <div className="flex flex-wrap items-center gap-2">
            {tags.map((t) => (
              <span key={t.id} className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest bg-accent/10 text-accent px-2.5 py-1 rounded-full">
                {t.tag}
                <button onClick={() => deleteTag(t.id)} className="hover:text-foreground"><X className="size-2.5" /></button>
              </span>
            ))}
            <div className="inline-flex items-center gap-1">
              <input value={newTag} onChange={(e) => setNewTag(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addTag()} placeholder="add tag"
                className="bg-background border border-border rounded-full px-3 py-1 text-xs w-28 focus:outline-none focus:border-accent" />
              <button onClick={addTag} className="size-7 grid place-items-center rounded-full bg-accent/10 text-accent"><Plus className="size-3" /></button>
            </div>
          </div>
        </section>

        <section>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3">Internal notes</p>
          <div className="space-y-2 mb-4">
            <textarea value={newNote} onChange={(e) => setNewNote(e.target.value)} rows={2} placeholder="Add a private note"
              className="w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent" />
            <button onClick={addNote} className="text-xs uppercase tracking-widest bg-accent text-accent-foreground px-4 py-1.5 rounded-full font-bold">Add note</button>
          </div>
          <ul className="space-y-2">
            {notes.map((n) => (
              <li key={n.id} className={`p-3 rounded-lg border ${n.pinned ? "border-accent/40 bg-accent/5" : "border-border bg-background"}`}>
                <div className="flex items-start justify-between gap-2">
                  <p className="text-sm flex-1">{n.note}</p>
                  <div className="flex gap-1">
                    <button onClick={() => togglePin(n)} className={`size-7 grid place-items-center rounded-full hover:bg-white/5 ${n.pinned ? "text-accent" : "text-muted-foreground"}`}><Pin className="size-3" /></button>
                    <button onClick={() => deleteNote(n.id)} className="size-7 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-destructive"><Trash2 className="size-3" /></button>
                  </div>
                </div>
                <p className="text-[10px] font-mono text-muted-foreground mt-1">{new Date(n.created_at).toLocaleString()}</p>
              </li>
            ))}
            {notes.length === 0 && <p className="text-xs text-muted-foreground">No notes yet.</p>}
          </ul>
        </section>
      </div>
    </div>
  );
}
