import { useEffect, useState, useCallback } from "react";
import { Loader2, Plus, Trash2, Star, Save, GripVertical } from "lucide-react";
import { toast } from "sonner";
import {
  type Testimonial,
  fetchAllTestimonials,
  saveTestimonial,
  deleteTestimonial,
} from "@/lib/use-testimonials";
import { logActivity } from "@/components/admin/AdminShell";

function blank(sort: number): Testimonial {
  return { id: "", quote: "", name: "", role: "", country: "", flag: "", rating: 5, active: true, sort_order: sort };
}

function Row({ t, onChange, onSave, onDelete }: {
  t: Testimonial;
  onChange: (next: Testimonial) => void;
  onSave: (t: Testimonial) => void;
  onDelete: (t: Testimonial) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const isNew = !t.id;

  return (
    <div className="glass rounded-2xl p-4 space-y-3">
      <div className="flex items-start gap-2">
        <GripVertical className="size-4 text-muted-foreground mt-2.5 shrink-0" />
        <textarea
          value={t.quote}
          onChange={(e) => onChange({ ...t, quote: e.target.value })}
          placeholder="Customer quote…"
          rows={2}
          className="flex-1 bg-input/40 rounded-lg px-3 py-2 text-sm resize-none outline-none focus:ring-1 focus:ring-accent"
        />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
        <input value={t.name} onChange={(e) => onChange({ ...t, name: e.target.value })} placeholder="Name"
          className="bg-input/40 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" />
        <input value={t.role} onChange={(e) => onChange({ ...t, role: e.target.value })} placeholder="Role"
          className="bg-input/40 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" />
        <input value={t.country} onChange={(e) => onChange({ ...t, country: e.target.value })} placeholder="Country"
          className="bg-input/40 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" />
        <input value={t.flag} onChange={(e) => onChange({ ...t, flag: e.target.value })} placeholder="Flag 🇬🇧"
          className="bg-input/40 rounded-lg px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-accent" />
      </div>
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="flex gap-0.5">
            {Array.from({ length: 5 }).map((_, i) => (
              <button key={i} onClick={() => onChange({ ...t, rating: i + 1 })} aria-label={`Rate ${i + 1}`}>
                <Star className={`size-4 ${i < t.rating ? "fill-accent text-accent" : "text-muted-foreground"}`} />
              </button>
            ))}
          </div>
          <label className="flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-muted-foreground cursor-pointer">
            <input type="checkbox" checked={t.active} onChange={(e) => onChange({ ...t, active: e.target.checked })} className="accent-[var(--accent)]" />
            Active
          </label>
        </div>
        <div className="flex items-center gap-2">
          {!isNew && (
            <button
              onClick={async () => { setDeleting(true); try { await onDelete(t); } finally { setDeleting(false); } }}
              className="inline-flex items-center gap-1.5 text-xs px-3 py-2 rounded-lg text-destructive hover:bg-destructive/10">
              {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete
            </button>
          )}
          <button
            onClick={async () => { setSaving(true); try { await onSave(t); } finally { setSaving(false); } }}
            className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90">
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} {isNew ? "Add" : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}

export function TestimonialsEditor() {
  const [rows, setRows] = useState<Testimonial[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = useCallback(async () => {
    setLoading(true);
    try {
      const list = await fetchAllTestimonials();
      setRows(list);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { reload(); }, [reload]);

  function patch(id: string, next: Testimonial) {
    setRows((r) => r.map((x) => (x.id === id ? next : x)));
  }

  async function handleSave(t: Testimonial) {
    try {
      await saveTestimonial(t);
      logActivity(t.id ? "testimonial_update" : "testimonial_create", "testimonial", t.id || undefined);
      toast.success(t.id ? "Testimonial saved" : "Testimonial added");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to save");
    }
  }

  async function handleDelete(t: Testimonial) {
    try {
      await deleteTestimonial(t.id);
      logActivity("testimonial_delete", "testimonial", t.id);
      toast.success("Testimonial deleted");
      await reload();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed to delete");
    }
  }

  function addNew() {
    setRows((r) => [...r, blank(r.length)]);
  }

  if (loading) {
    return <div className="grid place-items-center py-16"><Loader2 className="size-6 animate-spin text-accent" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">Manage homepage customer testimonials.</p>
        <button onClick={addNew} className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg glass hover:bg-accent/10">
          <Plus className="size-3.5" /> Add testimonial
        </button>
      </div>
      {rows.length === 0 && (
        <p className="text-sm text-muted-foreground py-8 text-center">No testimonials yet — add your first one.</p>
      )}
      {rows.map((t, i) => (
        <Row
          key={t.id || `new-${i}`}
          t={t}
          onChange={(next) => patch(t.id, next)}
          onSave={handleSave}
          onDelete={handleDelete}
        />
      ))}
    </div>
  );
}
