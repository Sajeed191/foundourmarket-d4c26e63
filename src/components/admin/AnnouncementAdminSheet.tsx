import { useEffect, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { Plus, Trash2, X, Loader2, GripVertical, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import {
  ANNOUNCEMENT_ICON_KEYS,
  ANNOUNCEMENT_ICONS,
  ANNOUNCEMENT_TYPES,
  AnnouncementIcon,
} from "@/lib/announcement-icons";
import { cn } from "@/lib/utils";
import type { Announcement } from "@/components/site/AnnouncementBar";
import { useEditorProtection } from "@/hooks/use-editor-protection";
import { EditorSaveBar } from "@/components/admin/EditorSaveBar";

const REGIONS = ["all", "india", "international"] as const;
const PAGE_OPTIONS = ["home", "shop", "product", "category", "cart", "checkout", "deals"] as const;

type Row = Announcement;

const blank = (): Partial<Row> => ({
  message: "",
  icon: "sparkles",
  type: "info",
  region: "all",
  pages: [],
  active: true,
  sort_order: 0,
  link: null,
  cta_text: null,
  starts_at: null,
  ends_at: null,
  countdown_to: null,
});

const toLocal = (iso: string | null | undefined) =>
  iso ? new Date(new Date(iso).getTime() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 16) : "";
const fromLocal = (v: string) => (v ? new Date(v).toISOString() : null);

/**
 * Full live CMS for announcements as a mobile-first glass bottom sheet.
 * All writes go through the announcements RLS policies (editor+ only).
 */
export function AnnouncementAdminSheet({ onClose, onChanged }: { onClose: () => void; onChanged: () => void }) {
  const [rows, setRows] = useState<Row[]>([]);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data, error } = await supabase.from("announcements").select("*").order("sort_order");
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as Row[]) ?? []);
  }
  useEffect(() => {
    void load();
  }, []);

  async function save() {
    if (!editing?.message?.trim()) {
      toast.error("Message is required");
      return;
    }
    setSaving(true);
    const payload = {
      message: editing.message.trim(),
      icon: editing.icon ?? "sparkles",
      type: editing.type ?? "info",
      region: editing.region ?? "all",
      pages: editing.pages ?? [],
      active: editing.active ?? true,
      sort_order: Number(editing.sort_order) || 0,
      link: editing.link?.trim() || null,
      cta_text: editing.cta_text?.trim() || null,
      starts_at: editing.starts_at ?? null,
      ends_at: editing.ends_at ?? null,
      countdown_to: editing.countdown_to ?? null,
    };
    const { error } = editing.id
      ? await supabase.from("announcements").update(payload).eq("id", editing.id)
      : await supabase.from("announcements").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing.id ? "Announcement updated" : "Announcement created");
    logActivity(editing.id ? "announcement_update" : "announcement_create", "announcement", editing.id, {
      type: payload.type,
    });
    setEditing(null);
    await load();
    onChanged();
  }

  async function toggleActive(r: Row) {
    const { error } = await supabase.from("announcements").update({ active: !r.active }).eq("id", r.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("announcement_toggle", "announcement", r.id, { active: !r.active });
    await load();
    onChanged();
  }

  async function del(id: string) {
    if (!confirm("Delete this announcement?")) return;
    const { error } = await supabase.from("announcements").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("announcement_delete", "announcement", id);
    toast.success("Deleted");
    await load();
    onChanged();
  }

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
        onClick={onClose}
      >
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-t-0"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold leading-tight">Announcement CMS</h2>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Live · realtime · region-aware
              </p>
            </div>
            <button
              onClick={onClose}
              className="grid size-8 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground"
            >
              <X className="size-4" />
            </button>
          </div>

          {!editing && (
            <>
              <button
                onClick={() => setEditing(blank())}
                className="mb-4 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground"
              >
                <Plus className="size-3.5" /> New announcement
              </button>
              <ul className="space-y-2">
                {rows.map((r) => (
                  <li
                    key={r.id}
                    className="flex items-center gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
                  >
                    <GripVertical className="size-3.5 shrink-0 text-muted-foreground/40" />
                    <AnnouncementIcon icon={r.icon} className="size-4 shrink-0 text-accent" />
                    <button onClick={() => setEditing(r)} className="min-w-0 flex-1 text-left">
                      <p className={cn("truncate text-sm", !r.active && "text-muted-foreground line-through")}>
                        {r.message}
                      </p>
                      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                        {r.type} · {r.region}
                        {r.pages.length > 0 && ` · ${r.pages.join(",")}`}
                      </p>
                    </button>
                    <button
                      onClick={() => toggleActive(r)}
                      className={cn(
                        "grid size-7 shrink-0 place-items-center rounded-lg border",
                        r.active ? "border-accent/40 bg-accent/10 text-accent" : "border-white/10 text-muted-foreground",
                      )}
                      aria-label="Toggle active"
                    >
                      {r.active ? <Eye className="size-3.5" /> : <EyeOff className="size-3.5" />}
                    </button>
                    <button
                      onClick={() => del(r.id)}
                      className="grid size-7 shrink-0 place-items-center rounded-lg border border-white/10 text-red-400 hover:bg-red-500/10"
                      aria-label="Delete"
                    >
                      <Trash2 className="size-3.5" />
                    </button>
                  </li>
                ))}
                {rows.length === 0 && (
                  <li className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                    No announcements yet.
                  </li>
                )}
              </ul>
            </>
          )}

          {editing && (
            <div className="space-y-4">
              <Field label="Message">
                <textarea
                  value={editing.message ?? ""}
                  onChange={(e) => setEditing({ ...editing, message: e.target.value })}
                  rows={2}
                  className={input}
                  placeholder="Free shipping this weekend only"
                />
              </Field>

              <Field label="Icon">
                <div className="flex flex-wrap gap-1.5">
                  {ANNOUNCEMENT_ICON_KEYS.map((k) => {
                    const Icon = ANNOUNCEMENT_ICONS[k];
                    return (
                      <button
                        key={k}
                        onClick={() => setEditing({ ...editing, icon: k })}
                        className={cn(
                          "grid size-9 place-items-center rounded-lg border transition-all",
                          editing.icon === k
                            ? "border-accent/50 bg-accent/15 text-accent"
                            : "border-white/10 text-muted-foreground hover:text-foreground",
                        )}
                      >
                        <Icon className="size-4" />
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Type">
                  <select
                    value={editing.type ?? "info"}
                    onChange={(e) => setEditing({ ...editing, type: e.target.value })}
                    className={input}
                  >
                    {ANNOUNCEMENT_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="Region">
                  <select
                    value={editing.region ?? "all"}
                    onChange={(e) => setEditing({ ...editing, region: e.target.value })}
                    className={input}
                  >
                    {REGIONS.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                </Field>
              </div>

              <Field label="Show on pages (none = all)">
                <div className="flex flex-wrap gap-1.5">
                  {PAGE_OPTIONS.map((p) => {
                    const on = (editing.pages ?? []).includes(p);
                    return (
                      <button
                        key={p}
                        onClick={() =>
                          setEditing({
                            ...editing,
                            pages: on
                              ? (editing.pages ?? []).filter((x) => x !== p)
                              : [...(editing.pages ?? []), p],
                          })
                        }
                        className={cn(
                          "rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all",
                          on ? "border-accent/50 bg-accent/15 text-accent" : "border-white/10 text-muted-foreground",
                        )}
                      >
                        {p}
                      </button>
                    );
                  })}
                </div>
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Link (optional)">
                  <input
                    value={editing.link ?? ""}
                    onChange={(e) => setEditing({ ...editing, link: e.target.value })}
                    className={input}
                    placeholder="/deals"
                  />
                </Field>
                <Field label="CTA label">
                  <input
                    value={editing.cta_text ?? ""}
                    onChange={(e) => setEditing({ ...editing, cta_text: e.target.value })}
                    className={input}
                    placeholder="Shop now"
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Starts">
                  <input
                    type="datetime-local"
                    value={toLocal(editing.starts_at)}
                    onChange={(e) => setEditing({ ...editing, starts_at: fromLocal(e.target.value) })}
                    className={input}
                  />
                </Field>
                <Field label="Ends">
                  <input
                    type="datetime-local"
                    value={toLocal(editing.ends_at)}
                    onChange={(e) => setEditing({ ...editing, ends_at: fromLocal(e.target.value) })}
                    className={input}
                  />
                </Field>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Countdown to">
                  <input
                    type="datetime-local"
                    value={toLocal(editing.countdown_to)}
                    onChange={(e) => setEditing({ ...editing, countdown_to: fromLocal(e.target.value) })}
                    className={input}
                  />
                </Field>
                <Field label="Priority (lower = first)">
                  <input
                    type="number"
                    value={editing.sort_order ?? 0}
                    onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                    className={input}
                  />
                </Field>
              </div>

              <button
                onClick={() => setEditing({ ...editing, active: !(editing.active ?? true) })}
                className={cn(
                  "flex w-full items-center justify-between rounded-lg border px-3 py-2 text-xs",
                  editing.active ?? true
                    ? "border-accent/40 bg-accent/10 text-accent"
                    : "border-white/10 text-muted-foreground",
                )}
              >
                Active (visible live)
                <span className={cn("size-2 rounded-full", editing.active ?? true ? "bg-accent" : "bg-muted-foreground/40")} />
              </button>

              <div className="sticky bottom-0 -mx-5 flex gap-2 border-t border-white/10 bg-background/95 px-5 py-3">
                <button
                  onClick={save}
                  disabled={saving}
                  className="flex flex-1 items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
                >
                  {saving ? <Loader2 className="size-3.5 animate-spin" /> : null}
                  {editing.id ? "Save changes" : "Create"}
                </button>
                <button
                  onClick={() => setEditing(null)}
                  className="rounded-full border border-white/10 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground"
                >
                  Back
                </button>
              </div>
            </div>
          )}
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
}

const input =
  "w-full bg-background border border-white/10 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent";

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</span>
      {children}
    </label>
  );
}
