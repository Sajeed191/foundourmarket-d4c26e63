import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Megaphone, Zap, Plus, Pencil, Trash2, X, Loader2, ChevronLeft, ChevronRight, Rocket, AlertCircle, CheckCircle2 } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { PublishConfirm } from "@/components/admin/PublishConfirm";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-marketing")({
  head: () => ({ meta: [{ title: "Marketing — Admin" }] }),
  component: MarketingPage,
});

type Banner = {
  id: string; type: string; title: string; subtitle: string | null; image: string | null;
  link: string | null; cta_text: string | null; active: boolean;
  starts_at: string | null; ends_at: string | null; sort_order: number;
  draft_data: any; has_draft: boolean; last_published_at: string | null;
};
type Flash = {
  id: string; name: string; discount_percent: number; starts_at: string; ends_at: string | null;
  active: boolean; product_slugs: string[];
};

const BANNER_FIELDS = ["type","title","subtitle","image","link","cta_text","active","starts_at","ends_at","sort_order"] as const;

function MarketingPage() {
  const [tab, setTab] = useState<"banners" | "flash">("banners");
  const [banners, setBanners] = useState<Banner[] | null>(null);
  const [flash, setFlash] = useState<Flash[] | null>(null);
  const [editingB, setEditingB] = useState<Banner | "new" | null>(null);
  const [editingF, setEditingF] = useState<Flash | "new" | null>(null);
  const [publishing, setPublishing] = useState<Banner | null>(null);

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
    if (!confirm("Delete this banner? This removes it from the live site too.")) return;
    await supabase.from("banners").delete().eq("id", id);
    logActivity("banner_delete", "banner", id);
    toast.success("Banner deleted");
    load();
  }
  async function moveBanner(id: string, dir: -1 | 1) {
    if (!banners) return;
    const i = banners.findIndex((x) => x.id === id);
    const j = i + dir;
    if (i < 0 || j < 0 || j >= banners.length) return;
    const a = banners[i], b = banners[j];
    const next = [...banners];
    next[i] = { ...b, sort_order: a.sort_order };
    next[j] = { ...a, sort_order: b.sort_order };
    setBanners(next);
    await Promise.all([
      supabase.from("banners").update({ sort_order: b.sort_order }).eq("id", a.id),
      supabase.from("banners").update({ sort_order: a.sort_order }).eq("id", b.id),
    ]);
    logActivity("banner_reorder", "banner", id);
    load();
  }

  async function publishBanner(b: Banner) {
    if (!b.draft_data) return;
    const merged: any = { ...b.draft_data, has_draft: false, draft_data: null, last_published_at: new Date().toISOString() };
    const { error } = await supabase.from("banners").update(merged).eq("id", b.id);
    if (error) { toast.error(error.message); return; }
    logActivity("banner_publish", "banner", b.id);
    toast.success("Banner is now live");
    setPublishing(null);
    load();
  }

  async function deleteFlash(id: string) {
    if (!confirm("Delete this flash sale?")) return;
    await supabase.from("flash_sales").delete().eq("id", id);
    logActivity("flash_delete", "flash_sale", id);
    load();
  }

  return (
    <AdminShell title="Marketing" subtitle="Banners, announcements and flash sales — draft & publish workflow" allow={["admin","super_admin","manager","editor"]}>
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
              {banners.map((b) => {
                const live = b.draft_data ?? b;
                return (
                  <div key={b.id} className={`card-premium rounded-2xl overflow-hidden border ${b.has_draft ? "border-accent/50" : "border-transparent"}`}>
                    {live.image && <img src={live.image} alt="" className="w-full h-32 object-cover" />}
                    <div className="p-4">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="text-[9px] font-mono uppercase tracking-widest bg-accent/10 text-accent px-2 py-0.5 rounded-full">{live.type}</span>
                            {b.has_draft && (
                              <span className="text-[9px] font-mono uppercase tracking-widest bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full inline-flex items-center gap-1">
                                <AlertCircle className="size-2.5" /> Unpublished
                              </span>
                            )}
                            {!b.has_draft && b.last_published_at && (
                              <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1">
                                <CheckCircle2 className="size-2.5" /> Live
                              </span>
                            )}
                          </div>
                          <h3 className="text-sm font-medium mt-2 truncate">{live.title}</h3>
                          {live.subtitle && <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{live.subtitle}</p>}
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button onClick={() => moveBanner(b.id, -1)} title="Move left" className="size-8 grid place-items-center rounded-full hover:bg-white/5 disabled:opacity-30" disabled={banners.indexOf(b) === 0}><ChevronLeft className="size-3.5" /></button>
                          <button onClick={() => moveBanner(b.id, 1)} title="Move right" className="size-8 grid place-items-center rounded-full hover:bg-white/5 disabled:opacity-30" disabled={banners.indexOf(b) === banners.length - 1}><ChevronRight className="size-3.5" /></button>
                          <button onClick={() => setEditingB(b)} title="Edit" className="size-8 grid place-items-center rounded-full hover:bg-white/5"><Pencil className="size-3.5" /></button>
                          <button onClick={() => deleteBanner(b.id)} title="Delete" className="size-8 grid place-items-center rounded-full hover:bg-white/5 hover:text-destructive"><Trash2 className="size-3.5" /></button>
                        </div>
                      </div>
                      <div className="flex items-center justify-between gap-2 mt-3">
                        <div className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                          {b.last_published_at ? `Last published ${new Date(b.last_published_at).toLocaleDateString()}` : "Never published"}
                        </div>
                        {b.has_draft && (
                          <button onClick={() => setPublishing(b)} className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-3 py-1.5 rounded-full text-[10px] uppercase tracking-widest font-bold hover:bg-accent/90">
                            <Rocket className="size-3" /> Publish
                          </button>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
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
            <div className="card-premium rounded-2xl overflow-hidden">
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

      <PublishConfirm
        open={!!publishing}
        title="Publish banner live?"
        description={`"${publishing?.draft_data?.title ?? publishing?.title}" will appear on the public site immediately for every visitor.`}
        onCancel={() => setPublishing(null)}
        onConfirm={async () => { if (publishing) await publishBanner(publishing); }}
      />
    </AdminShell>
  );
}

function BannerEditor({ row, onClose, onSaved }: { row: Banner | null; onClose: () => void; onSaved: () => void }) {
  // When editing, prefer the staged draft over the live values
  const src: any = row?.draft_data ?? row ?? {};
  const [f, setF] = useState({
    type: src.type ?? "hero", title: src.title ?? "", subtitle: src.subtitle ?? "",
    image: src.image ?? "", link: src.link ?? "", cta_text: src.cta_text ?? "",
    active: src.active ?? true, starts_at: src.starts_at?.slice(0, 10) ?? "",
    ends_at: src.ends_at?.slice(0, 10) ?? "", sort_order: src.sort_order ?? 0,
  });
  const [saving, setSaving] = useState(false);

  async function saveDraft(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    const draft = {
      type: f.type, title: f.title, subtitle: f.subtitle || null, image: f.image || null,
      link: f.link || null, cta_text: f.cta_text || null, active: f.active,
      starts_at: f.starts_at ? new Date(f.starts_at).toISOString() : null,
      ends_at: f.ends_at ? new Date(f.ends_at).toISOString() : null,
      sort_order: Number(f.sort_order),
    };
    const { error } = row
      ? await supabase.from("banners").update({ draft_data: draft, has_draft: true }).eq("id", row.id)
      // brand-new row: create as inactive draft so it doesn't go live until publish
      : await supabase.from("banners").insert({ ...draft, active: false, draft_data: draft, has_draft: true });
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Draft saved — click Publish to go live");
    logActivity(row ? "banner_draft_update" : "banner_draft_create", "banner", row?.id);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={saveDraft} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl card-premium rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
        <div className="flex justify-between items-center mb-2">
          <h2 className="text-lg font-display">{row ? "Edit banner draft" : "New banner"}</h2>
          <button type="button" onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5"><X className="size-4" /></button>
        </div>
        <p className="text-[11px] text-muted-foreground mb-5">Changes are saved as a draft. Click <span className="text-accent font-mono">Publish</span> on the banner card to push live.</p>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Type"><select value={f.type} onChange={(e) => setF({ ...f, type: e.target.value })} className="input"><option>hero</option><option>announcement</option><option>promo</option><option>offer</option></select></Field>
          <Field label="Sort"><input type="number" value={f.sort_order} onChange={(e) => setF({ ...f, sort_order: Number(e.target.value) })} className="input" /></Field>
          <Field label="Title" className="col-span-2"><input value={f.title} onChange={(e) => setF({ ...f, title: e.target.value })} required className="input" /></Field>
          <Field label="Subtitle" className="col-span-2"><input value={f.subtitle ?? ""} onChange={(e) => setF({ ...f, subtitle: e.target.value })} className="input" /></Field>
          <Field label="Image URL" className="col-span-2"><input value={f.image ?? ""} onChange={(e) => setF({ ...f, image: e.target.value })} className="input" /></Field>
          <Field label="Link"><input value={f.link ?? ""} onChange={(e) => setF({ ...f, link: e.target.value })} className="input" /></Field>
          <Field label="CTA"><input value={f.cta_text ?? ""} onChange={(e) => setF({ ...f, cta_text: e.target.value })} className="input" /></Field>
          <Field label="Starts"><input type="date" value={f.starts_at} onChange={(e) => setF({ ...f, starts_at: e.target.value })} className="input" /></Field>
          <Field label="Ends"><input type="date" value={f.ends_at} onChange={(e) => setF({ ...f, ends_at: e.target.value })} className="input" /></Field>
          <label className="flex items-center gap-2 col-span-2 text-sm"><input type="checkbox" checked={f.active} onChange={(e) => setF({ ...f, active: e.target.checked })} /> Active (when published)</label>
        </div>
        <div className="flex justify-end gap-2 mt-5">
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest border border-border">Cancel</button>
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{saving ? "Saving…" : "Save draft"}</button>
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
  const [confirmOpen, setConfirmOpen] = useState(false);

  async function actuallySave() {
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
    setConfirmOpen(false);
    if (error) { toast.error(error.message); return; }
    toast.success(f.active ? "Flash sale is live" : "Flash sale saved");
    logActivity(row ? "flash_update" : "flash_create", "flash_sale", row?.id);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>
      <form onSubmit={(e) => { e.preventDefault(); setConfirmOpen(true); }} onClick={(e) => e.stopPropagation()} className="w-full max-w-xl card-premium rounded-2xl p-6 max-h-[90vh] overflow-y-auto">
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
          <button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{f.active ? "Save & Publish" : "Save"}</button>
        </div>
      </form>
      <PublishConfirm
        open={confirmOpen}
        title={f.active ? "Publish flash sale live?" : "Save flash sale?"}
        description={f.active
          ? `"${f.name}" will be active on the public site immediately and apply −${f.discount_percent}% to ${f.product_slugs.split(",").filter(Boolean).length} products.`
          : `"${f.name}" will be saved as inactive — it won't be visible to customers until you toggle Active.`}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={actuallySave}
      />
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
