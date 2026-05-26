import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone, Zap, Plus, Pencil, Trash2, X, Loader2 } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/admin-marketing")({
  head: () => ({ meta: [{ title: "Marketing — Admin" }] }),
  component: MarketingPage,
});

type Banner = {
  id: string; type: string; title: string; subtitle: string | null; image: string | null;
  link: string | null; cta_text: string | null; active: boolean;
  starts_at: string | null; ends_at: string | null; sort_order: number;
};
type Flash = {
  id: string; name: string; discount_percent: number; starts_at: string; ends_at: string | null;
  active: boolean; product_slugs: string[];
};

function MarketingPage() {
  const [tab, setTab] = useState<"banners" | "flash">("banners");
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [flash, setFlash] = useState<Flash[] | null>(null);
  const [editingB, setEditingB] = useState<Banner | "new" | null>(null);
  const [editingF, setEditingF] = useState<Flash | "new" | null>(null);

  useEffect(() => { load(); }, []);
  async function load() {
    const [{ data: b }, { data: f }] = await Promise.all([
      supabase.from("banners").select("*").order("sort_order"),
      supabase.from("flash_sales").select("*").order("starts_at", { ascending: false }),
    ]);
    setBanners((b as Banner[]) ?? []);
    setFlash((f as Flash[]) ?? []);
  }

  async function deleteBanner(id: string) {
    if (!confirm("Delete this banner?")) return;
    await supabase.from("banners").delete().eq("id", id);
    logActivity("banner_delete", "banner", id);
    load();
  }
  async function deleteFlash(id: string) {
    if (!confirm("Delete this flash sale?")) return;
    await supabase.from("flash_sales").delete().eq("id", id);
    logActivity("flash_delete", "flash_sale", id);
    load();
  }

  return (
    <AdminShell title="Marketing" subtitle="Banners, announcements and flash sales" allow={["admin","super_admin","manager","editor"]}>
      <div className="flex gap-1 mb-6 border-b border-border">
        {(["banners", "flash"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-5 py-3 text-xs uppercase tracking-widest font-mono border-b-2 -mb-px ${tab === t ? "border-accent text-foreground" : "border-transparent text-muted-foreground hover:text-foreground"}`}>
            {t === "banners" ? "Banners" : "Flash sales"}
          </button>
        ))}
      </div>

      {tab === "banners" && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-medium flex items-center gap-2"><Megaphone className="size-4 text-muted-foreground" /> Banners</h2>
            <button onClick={() => setEditingB("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold">
              <Plus className="size-3.5" /> New banner
            </button>
          </div>
          {banners === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {banners.map((b) => (
                <div key={b.id} className="bg-card border border-border rounded-2xl overflow-hidden">
                  {b.image && <img src={b.image} alt="" className="w-full h-32 object-cover" />}
                  <div className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <span className="text-[9px] font-mono uppercase tracking-widest bg-accent/10 text-accent px-2 py-0.5 rounded-full">{b.type}</span>
                        <h3 className="text-sm font-medium mt-2">{b.title}</h3>
                        {b.subtitle && <p className="text-xs text-muted-foreground mt-1">{b.subtitle}</p>}
                      </div>
                      <div className="flex gap-1">
                        <button onClick={() => setEditingB(b)} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><Pencil className="size-3.5" /></button>
                        <button onClick={() => deleteBanner(b.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 mt-3 text-[10px] font-mono uppercase tracking-widest">
                      <span className={b.active ? "text-accent" : "text-muted-foreground"}>{b.active ? "Active" : "Inactive"}</span>
                      {b.starts_at && <span className="text-muted-foreground">· from {new Date(b.starts_at).toLocaleDateString()}</span>}
                      {b.ends_at && <span className="text-muted-foreground">· to {new Date(b.ends_at).toLocaleDateString()}</span>}
                    </div>
                  </div>
                </div>
              ))}
              {banners.length === 0 && <p className="text-sm text-muted-foreground col-span-full">No banners yet.</p>}
            </div>
          }
        </>
      )}

      {tab === "flash" && (
        <>
          <div className="flex justify-between items-center mb-4">
            <h2 className="text-sm font-medium flex items-center gap-2"><Zap className="size-4 text-muted-foreground" /> Flash sales</h2>
            <button onClick={() => setEditingF("new")} className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold">
              <Plus className="size-3.5" /> New flash sale
            </button>
          </div>
          {flash === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :
            <div className="bg-card border border-border rounded-2xl overflow-hidden">
              <table className="w-full text-sm">
                <thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border">
                  <tr><th className="text-left px-5 py-3">Name</th><th className="text-right px-5 py-3">Discount</th><th className="text-left px-5 py-3">Products</th><th className="text-left px-5 py-3">Window</th><th className="text-left px-5 py-3">Status</th><th></th></tr>
                </thead>
                <tbody>
                  {flash.map((f) => (
                    <tr key={f.id} className="border-b border-border/40 last:border-0">
                      <td className="px-5 py-3 text-sm">{f.name}</td>
                      <td className="px-5 py-3 text-right font-mono text-accent">−{f.discount_percent}%</td>
                      <td className="px-5 py-3 text-xs text-muted-foreground">{f.product_slugs.length} skus</td>
                      <td className="px-5 py-3 text-[11px] font-mono text-muted-foreground">
                        {new Date(f.starts_at).toLocaleDateString()} → {f.ends_at ? new Date(f.ends_at).toLocaleDateString() : "∞"}
                      </td>
                      <td className="px-5 py-3 text-[10px] font-mono uppercase tracking-widest">
                        <span className={f.active ? "text-accent" : "text-muted-foreground"}>{f.active ? "Active" : "Off"}</span>
                      </td>
                      <td className="px-5 py-3 text-right">
                        <button onClick={() => setEditingF(f)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 inline-flex"><Pencil className="size-3.5" /></button>
                        <button onClick={() => deleteFlash(f.id)} className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-destructive inline-flex"><Trash2 className="size-3.5" /></button>
                      </td>
                    </tr>
                  ))}
                  {flash.length === 0 && <tr><td colSpan={6} className="px-5 py-8 text-center text-sm text-muted-foreground">No flash sales yet.</td></tr>}
                </tbody>
              </table>
            </div>
          }
        </>
      )}

      {editingB && <BannerEditor row={editingB === "new" ? null : editingB} onClose={() => setEditingB(null)} onSaved={() => { setEditingB(null); load(); }} />}
      {editingF && <FlashEditor row={editingF === "new" ? null : editingF} onClose={() => setEditingF(null)} onSaved={() => { setEditingF(null); load(); }} />}
    </AdminShell>
  );
}

function BannerEditor({ row, onClose, onSaved }: { row: Banner | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    type: row?.type ?? "hero", title: row?.title ?? "", subtitle: row?.subtitle ?? "",
    image: row?.image ?? "", link: row?.link ?? "", cta_text: row?.cta_text ?? "",
    active: row?.active ?? true, starts_at: row?.starts_at?.slice(0, 10) ?? "",
    ends_at: row?.ends_at?.slice(0, 10) ?? "", sort_order: row?.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      ...f, subtitle: f.subtitle || null, image: f.image || null, link: f.link || null, cta_text: f.cta_text || null,
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
      ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
    };
    const { error } = row ? await supabase.from("banners").update(payload).eq("id", row.id) : await supabase.from("banners").insert(payload);
    setSaving(false);
    if (!error) { logActivity(row ? "banner_update" : "banner_create", "banner", row?.id); onSaved(); }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-display">{row ? "Edit banner" : "New banner"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="input"><option>hero</option><option>announcement</option><option>promo</option></select></Field>
          <Field label="Sort"><input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} className="input" /></Field>
          <Field label="Title" className="col-span-2"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required className="input" /></Field>
          <Field label="Subtitle" className="col-span-2"><input value={f.subtitle ?? ""} onChange={(e) => setF({ ...f, subtitle: e.target.value })} className="input" /></Field>
          <Field label="Image URL" className="col-span-2"><input value={f.image ?? ""} onChange={(e) => setF({ ...f, image: e.target.value })} className="input" /></Field>
          <Field label="Link"><input value={f.link ?? ""} onChange={(e) => setF({ ...f, link: e.target.value })} className="input" /></Field>
          <Field label="CTA"><input value={f.cta_text ?? ""} onChange={(e) => setF({ ...f, cta_text: e.target.value })} className="input" /></Field>
          <Field label="Starts"><input type="date" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} className="input" /></Field>
          <Field label="Ends"><input type="date" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} className="input" /></Field>
          <label className="flex items-center gap-2 col-span-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest border border-border">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function FlashEditor({ row, onClose, onSaved }: { row: Flash | null; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    name: row?.name ?? "", discount_percent: row?.discount_percent ?? 20,
    starts_at: row?.starts_at?.slice(0, 16) ?? new Date().toISOString().slice(0, 16),
    ends_at: row?.ends_at?.slice(0, 16) ?? "", active: row?.active ?? true,
    product_slugs: (row?.product_slugs ?? []).join(", "),
  });
  const [saving, setSaving] = useState(false);
  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const payload = {
      name: f.name, discount_percent: Number(f.discount_percent),
      starts_at: new Date(f.starts_at).toISOString(),
      ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
      active: f.active,
      product_slugs: f.product_slugs.split(",").map((s) => s.trim()).filter(Boolean),
    };
    const { error } = row ? await supabase.from("flash_sales").update(payload).eq("id", row.id) : await supabase.from("flash_sales").insert(payload);
    setSaving(false);
    if (!error) { logActivity(row ? "flash_update" : "flash_create", "flash_sale", row?.id); onSaved(); }
  }
  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={save} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl bg-card border border-border rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-5">
          <h2 className="text-lg font-display">{row ? "Edit flash sale" : "New flash sale"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Name" className="col-span-2"><input value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required className="input" /></Field>
          <Field label="Discount %"><input type="number" value={f.discount_percent} onChange={(e) => setF({ ...f, discount_percent: Number(e.target.value) })} className="input" /></Field>
          <label className="flex items-center gap-2 text-sm pt-6"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active</label>
          <Field label="Starts"><input type="datetime-local" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} className="input" /></Field>
          <Field label="Ends"><input type="datetime-local" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} className="input" /></Field>
          <Field label="Product slugs (comma separated)" className="col-span-2"><textarea value={f.product_slugs} onChange={(e) => setF({ ...f, product_slugs: e.target.value })} rows={3} className="input" /></Field>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest border border-border">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{saving ? "Saving…" : "Save"}</button>
        </div>
      </form>
    </div>
  );
}

function Field({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
