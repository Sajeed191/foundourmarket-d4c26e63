import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import {
  Plus,
  Trash2,
  X,
  Loader2,
  ArrowUp,
  ArrowDown,
  ImagePlus,
  Tag,
  Search,
  Copy,
  Eye,
  EyeOff,
  Star,
  Flame,
  BarChart3,
  Save,
  Upload,
  RotateCcw,
  Globe2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { logActivity } from "@/components/admin/AdminShell";
import {
  invalidateCategories,
  CATEGORY_COLUMNS,
  type Category,
  type CategoryStatus,
  type CategoryRegion,
} from "@/lib/use-categories";
import { cn } from "@/lib/utils";

type Row = Category;
type ImageSlot = "image" | "banner_image" | "mobile_image";

const slugify = (s: string) =>
  s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");

const blank = (): Partial<Row> => ({
  name: "",
  slug: "",
  description: null,
  image: null,
  banner_image: null,
  mobile_image: null,
  icon: null,
  seo_title: null,
  seo_description: null,
  sort_order: 0,
  status: "draft",
  featured: false,
  trending: false,
  homepage_visible: true,
  region: "all",
  views: 0,
  clicks: 0,
});

const STATUS_META: Record<CategoryStatus, { label: string; cls: string }> = {
  published: { label: "Live", cls: "bg-emerald-500/15 text-emerald-300 border-emerald-500/30" },
  draft: { label: "Draft", cls: "bg-amber-500/15 text-amber-300 border-amber-500/30" },
  hidden: { label: "Hidden", cls: "bg-white/10 text-muted-foreground border-white/15" },
  archived: { label: "Archived", cls: "bg-red-500/10 text-red-300 border-red-500/25" },
};

/** Downscale + compress an image client-side before upload (max 1600px, JPEG q0.82). */
async function compressImage(file: File): Promise<Blob> {
  if (!file.type.startsWith("image/") || file.type === "image/svg+xml") return file;
  try {
    const bitmap = await createImageBitmap(file);
    const max = 1600;
    const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
    const w = Math.round(bitmap.width * scale);
    const h = Math.round(bitmap.height * scale);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(bitmap, 0, 0, w, h);
    const blob = await new Promise<Blob | null>((res) =>
      canvas.toBlob((b) => res(b), "image/jpeg", 0.82),
    );
    return blob && blob.size < file.size ? blob : file;
  } catch {
    return file;
  }
}

/** Upload with one retry + cache-busting public URL. */
async function uploadWithRetry(path: string, body: Blob): Promise<string> {
  const attempt = () =>
    supabase.storage.from("product-images").upload(path, body, {
      cacheControl: "31536000",
      upsert: true,
      contentType: body.type || "image/jpeg",
    });
  let { error } = await attempt();
  if (error) ({ error } = await attempt());
  if (error) throw error;
  const { data } = supabase.storage.from("product-images").getPublicUrl(path);
  return `${data.publicUrl}?v=${Date.now()}`;
}

export function CategoryAdminSheet({
  onClose,
  onChanged,
  productCounts = {},
}: {
  onClose: () => void;
  onChanged: () => void;
  productCounts?: Record<string, number>;
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ImageSlot | null>(null);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<"all" | CategoryStatus>("all");
  const fileSlot = useRef<ImageSlot>("image");
  const fileRef = useRef<HTMLInputElement>(null);

  const dirty = useMemo(
    () => (editing ? JSON.stringify(editing) !== original : false),
    [editing, original],
  );

  const load = useCallback(async () => {
    const { data, error } = await supabase
      .from("categories")
      .select(CATEGORY_COLUMNS)
      .order("sort_order", { ascending: true });
    setLoading(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    setRows((data as Row[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  // realtime sync while the sheet is open
  useEffect(() => {
    const ch = supabase
      .channel("category-cms")
      .on("postgres_changes", { event: "*", schema: "public", table: "categories" }, () => load())
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, [load]);

  function open(row: Partial<Row>) {
    setEditing(row);
    setOriginal(JSON.stringify(row));
  }

  function tryClose() {
    if (dirty && !confirm("Discard unsaved changes?")) return;
    setEditing(null);
  }

  async function onFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !editing) return;
    const slot = fileSlot.current;
    setUploadingSlot(slot);
    setProgress(15);
    try {
      const compressed = await compressImage(file);
      setProgress(55);
      const ext = compressed.type === "image/jpeg" ? "jpg" : file.name.split(".").pop() ?? "jpg";
      const path = `categories/${crypto.randomUUID()}.${ext}`;
      const url = await uploadWithRetry(path, compressed);
      setProgress(100);
      setEditing((prev) => (prev ? { ...prev, [slot]: url } : prev));
      toast.success("Image uploaded");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setTimeout(() => setProgress(0), 400);
      setUploadingSlot(null);
    }
  }

  function pickImage(slot: ImageSlot) {
    fileSlot.current = slot;
    fileRef.current?.click();
  }

  async function persist(status?: CategoryStatus) {
    if (!editing?.name?.trim()) {
      toast.error("Name is required");
      return;
    }
    setSaving(true);
    const slug = editing.slug?.trim() || slugify(editing.name);
    const payload = {
      name: editing.name.trim(),
      slug,
      description: editing.description?.trim() || null,
      image: editing.image || null,
      banner_image: editing.banner_image || null,
      mobile_image: editing.mobile_image || null,
      icon: editing.icon?.trim() || null,
      seo_title: editing.seo_title?.trim() || null,
      seo_description: editing.seo_description?.trim() || null,
      sort_order: Number(editing.sort_order) || 0,
      status: status ?? editing.status ?? "draft",
      featured: !!editing.featured,
      trending: !!editing.trending,
      homepage_visible: editing.homepage_visible ?? true,
      region: (editing.region ?? "all") as CategoryRegion,
    };
    const { error } = editing.id
      ? await supabase.from("categories").update(payload).eq("id", editing.id)
      : await supabase.from("categories").insert(payload);
    setSaving(false);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(editing.id ? "Saved" : "Created");
    logActivity(editing.id ? "category_update" : "category_create", "category", editing.id, {
      slug,
      status: payload.status,
    });
    setEditing(null);
    await load();
    invalidateCategories();
    onChanged();
  }

  async function reorder(row: Row, direction: "up" | "down") {
    setRows((prev) => {
      const i = prev.findIndex((r) => r.id === row.id);
      const j = direction === "up" ? i - 1 : i + 1;
      if (j < 0 || j >= prev.length) return prev;
      const next = [...prev];
      [next[i], next[j]] = [next[j], next[i]];
      return next;
    });
    const { error } = await supabase.rpc("reorder_category", { _id: row.id, _direction: direction });
    if (error) toast.error(error.message);
    await load();
    invalidateCategories();
    onChanged();
  }

  async function quickStatus(row: Row, status: CategoryStatus) {
    const { error } = await supabase.from("categories").update({ status }).eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("category_update", "category", row.id, { status });
    await load();
    invalidateCategories();
    onChanged();
  }

  async function duplicate(row: Row) {
    const copy = {
      name: `${row.name} (copy)`,
      slug: `${row.slug}-copy-${Math.random().toString(36).slice(2, 6)}`,
      description: row.description,
      image: row.image,
      banner_image: row.banner_image,
      mobile_image: row.mobile_image,
      icon: row.icon,
      seo_title: row.seo_title,
      seo_description: row.seo_description,
      sort_order: row.sort_order + 1,
      status: "draft" as CategoryStatus,
      featured: row.featured,
      trending: row.trending,
      homepage_visible: row.homepage_visible,
      region: row.region,
    };
    const { error } = await supabase.from("categories").insert(copy);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Duplicated as draft");
    logActivity("category_create", "category", undefined, { slug: copy.slug, duplicated: true });
    await load();
    invalidateCategories();
    onChanged();
  }

  async function del(id: string) {
    if (!confirm("Delete this category permanently?")) return;
    const { error } = await supabase.from("categories").delete().eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    logActivity("category_delete", "category", id);
    toast.success("Deleted");
    await load();
    invalidateCategories();
    onChanged();
  }

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter !== "all" && r.status !== filter) return false;
      if (q && !`${r.name} ${r.slug}`.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [rows, query, filter]);

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"
        onClick={() => {
          if (uploadingSlot || saving) return;
          onClose();
        }}
      >
        <input
          ref={fileRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={onFile}
          onClick={(e) => e.stopPropagation()}
        />
        <motion.div
          initial={{ y: "100%" }}
          animate={{ y: 0 }}
          exit={{ y: "100%" }}
          transition={{ type: "spring", damping: 32, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className="absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-t-0"
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold leading-tight">Category CMS</h2>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Realtime · admin-only · {rows.length} total
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
                onClick={() => open(blank())}
                className="mb-3 flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground"
              >
                <Plus className="size-3.5" /> New category
              </button>

              <div className="mb-3 flex items-center gap-2 rounded-full border border-white/10 bg-white/[0.02] px-3">
                <Search className="size-3.5 text-muted-foreground" />
                <input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search categories…"
                  className="w-full bg-transparent py-2 text-sm focus:outline-none"
                />
              </div>

              <div className="mb-4 flex gap-1.5 overflow-x-auto pb-1">
                {(["all", "published", "draft", "hidden", "archived"] as const).map((f) => (
                  <button
                    key={f}
                    onClick={() => setFilter(f)}
                    className={cn(
                      "shrink-0 rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-colors",
                      filter === f
                        ? "border-accent/50 bg-accent/15 text-accent"
                        : "border-white/10 text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {f}
                  </button>
                ))}
              </div>

              {loading ? (
                <div className="grid place-items-center py-16">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <ul className="space-y-2">
                  {visible.map((r, i) => (
                    <li
                      key={r.id}
                      className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5"
                    >
                      <div className="flex items-center gap-2">
                        <div className="flex shrink-0 flex-col">
                          <button
                            onClick={() => reorder(r, "up")}
                            disabled={i === 0}
                            className="grid size-5 place-items-center rounded text-muted-foreground/60 hover:text-accent disabled:opacity-20"
                            aria-label="Move up"
                          >
                            <ArrowUp className="size-3.5" />
                          </button>
                          <button
                            onClick={() => reorder(r, "down")}
                            disabled={i === visible.length - 1}
                            className="grid size-5 place-items-center rounded text-muted-foreground/60 hover:text-accent disabled:opacity-20"
                            aria-label="Move down"
                          >
                            <ArrowDown className="size-3.5" />
                          </button>
                        </div>
                        <div className="size-11 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]">
                          {r.image ? (
                            <img src={r.image} alt="" className="size-full object-cover" />
                          ) : (
                            <div className="grid size-full place-items-center text-muted-foreground/40">
                              <Tag className="size-4" />
                            </div>
                          )}
                        </div>
                        <button onClick={() => open(r)} className="min-w-0 flex-1 text-left">
                          <div className="flex items-center gap-1.5">
                            <p className="truncate text-sm">{r.name}</p>
                            {r.featured && <Star className="size-3 shrink-0 text-accent" />}
                            {r.trending && <Flame className="size-3 shrink-0 text-orange-400" />}
                          </div>
                          <div className="flex items-center gap-2">
                            <span
                              className={cn(
                                "rounded border px-1.5 py-px text-[8px] font-mono uppercase tracking-wider",
                                STATUS_META[r.status].cls,
                              )}
                            >
                              {STATUS_META[r.status].label}
                            </span>
                            <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                              {productCounts[r.slug] ?? 0} items
                            </span>
                          </div>
                        </button>
                      </div>
                      <div className="mt-2 flex items-center gap-1.5 border-t border-white/5 pt-2">
                        <QuickBtn
                          onClick={() =>
                            quickStatus(r, r.status === "published" ? "hidden" : "published")
                          }
                          title={r.status === "published" ? "Unpublish" : "Publish"}
                        >
                          {r.status === "published" ? (
                            <EyeOff className="size-3.5" />
                          ) : (
                            <Eye className="size-3.5" />
                          )}
                        </QuickBtn>
                        <QuickBtn onClick={() => duplicate(r)} title="Duplicate">
                          <Copy className="size-3.5" />
                        </QuickBtn>
                        <span className="ml-auto flex items-center gap-2 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                          <BarChart3 className="size-3" /> {r.views}v · {r.clicks}c
                        </span>
                        <QuickBtn onClick={() => del(r.id)} title="Delete" danger>
                          <Trash2 className="size-3.5" />
                        </QuickBtn>
                      </div>
                    </li>
                  ))}
                  {visible.length === 0 && (
                    <li className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                      No categories match.
                    </li>
                  )}
                </ul>
              )}
            </>
          )}

          {editing && (
            <div className="space-y-4 pb-20">
              {/* analytics preview */}
              {editing.id && (
                <div className="grid grid-cols-3 gap-2">
                  <Stat label="Views" value={editing.views ?? 0} />
                  <Stat label="Clicks" value={editing.clicks ?? 0} />
                  <Stat label="Products" value={productCounts[editing.slug ?? ""] ?? 0} />
                </div>
              )}

              <ImageField
                label="Thumbnail"
                value={editing.image ?? null}
                uploading={uploadingSlot === "image"}
                progress={progress}
                onPick={() => pickImage("image")}
                onClear={() => setEditing({ ...editing, image: null })}
              />
              <div className="grid grid-cols-2 gap-3">
                <ImageField
                  label="Banner"
                  value={editing.banner_image ?? null}
                  uploading={uploadingSlot === "banner_image"}
                  progress={progress}
                  onPick={() => pickImage("banner_image")}
                  onClear={() => setEditing({ ...editing, banner_image: null })}
                  compact
                />
                <ImageField
                  label="Mobile"
                  value={editing.mobile_image ?? null}
                  uploading={uploadingSlot === "mobile_image"}
                  progress={progress}
                  onPick={() => pickImage("mobile_image")}
                  onClear={() => setEditing({ ...editing, mobile_image: null })}
                  compact
                />
              </div>

              <Field label="Name">
                <input
                  value={editing.name ?? ""}
                  onChange={(e) =>
                    setEditing({
                      ...editing,
                      name: e.target.value,
                      slug: !editing.id && !editing.slug ? slugify(e.target.value) : editing.slug,
                    })
                  }
                  className={input}
                  placeholder="Electronics"
                />
              </Field>

              <Field label="Slug (URL)">
                <input
                  value={editing.slug ?? ""}
                  onChange={(e) => setEditing({ ...editing, slug: slugify(e.target.value) })}
                  className={input}
                  placeholder="electronics"
                />
              </Field>

              <Field label="Description">
                <textarea
                  value={editing.description ?? ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={2}
                  className={input}
                  placeholder="Premium gadgets and gear"
                />
              </Field>

              <Field label="Icon (lucide name or emoji)">
                <input
                  value={editing.icon ?? ""}
                  onChange={(e) => setEditing({ ...editing, icon: e.target.value })}
                  className={input}
                  placeholder="Smartphone"
                />
              </Field>

              <div className="rounded-xl border border-white/10 p-3 space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Visibility & type
                </p>
                <Field label="Status">
                  <select
                    value={editing.status ?? "draft"}
                    onChange={(e) =>
                      setEditing({ ...editing, status: e.target.value as CategoryStatus })
                    }
                    className={input}
                  >
                    <option value="draft">Draft</option>
                    <option value="published">Published</option>
                    <option value="hidden">Hidden</option>
                    <option value="archived">Archived</option>
                  </select>
                </Field>
                <Toggle
                  label="Featured"
                  icon={<Star className="size-3.5" />}
                  on={!!editing.featured}
                  onClick={() => setEditing({ ...editing, featured: !editing.featured })}
                />
                <Toggle
                  label="Trending"
                  icon={<Flame className="size-3.5" />}
                  on={!!editing.trending}
                  onClick={() => setEditing({ ...editing, trending: !editing.trending })}
                />
                <Toggle
                  label="Show on homepage"
                  icon={<Eye className="size-3.5" />}
                  on={editing.homepage_visible ?? true}
                  onClick={() =>
                    setEditing({ ...editing, homepage_visible: !(editing.homepage_visible ?? true) })
                  }
                />
                <Field label="Region targeting">
                  <select
                    value={editing.region ?? "all"}
                    onChange={(e) =>
                      setEditing({ ...editing, region: e.target.value as CategoryRegion })
                    }
                    className={input}
                  >
                    <option value="all">All regions</option>
                    <option value="india">India only</option>
                    <option value="international">International only</option>
                  </select>
                </Field>
              </div>

              <div className="rounded-xl border border-white/10 p-3 space-y-3">
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  SEO
                </p>
                <Field label="SEO title">
                  <input
                    value={editing.seo_title ?? ""}
                    onChange={(e) => setEditing({ ...editing, seo_title: e.target.value })}
                    className={input}
                  />
                </Field>
                <Field label="SEO description">
                  <textarea
                    value={editing.seo_description ?? ""}
                    onChange={(e) => setEditing({ ...editing, seo_description: e.target.value })}
                    rows={2}
                    className={input}
                  />
                </Field>
              </div>

              <Field label="Sort order (lower = first)">
                <input
                  type="number"
                  value={editing.sort_order ?? 0}
                  onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })}
                  className={input}
                />
              </Field>

              <div className="sticky bottom-0 -mx-5 space-y-2 border-t border-white/10 bg-background/95 px-5 py-3 backdrop-blur-xl">
                <div className="flex gap-2">
                  <button
                    onClick={() => persist("published")}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full bg-accent px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground disabled:opacity-50"
                  >
                    {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}
                    Publish
                  </button>
                  <button
                    onClick={() => persist("draft")}
                    disabled={saving}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-white/15 px-3 py-2.5 text-[11px] font-bold uppercase tracking-widest disabled:opacity-50"
                  >
                    <Save className="size-3.5" /> Draft
                  </button>
                </div>
                <div className="flex gap-2">
                  <button
                    onClick={() => persist()}
                    disabled={saving || !dirty}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-full border border-accent/30 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent disabled:opacity-40"
                  >
                    Save changes
                  </button>
                  {dirty && original && (
                    <button
                      onClick={() => setEditing(JSON.parse(original))}
                      className="flex items-center justify-center gap-1.5 rounded-full border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                    >
                      <RotateCcw className="size-3" /> Reset
                    </button>
                  )}
                  <button
                    onClick={tryClose}
                    className="rounded-full border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                  >
                    Cancel
                  </button>
                </div>
                {dirty && (
                  <p className="text-center text-[9px] font-mono uppercase tracking-widest text-amber-300/80">
                    Unsaved changes
                  </p>
                )}
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
      <span className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}

function QuickBtn({
  children,
  onClick,
  title,
  danger,
}: {
  children: React.ReactNode;
  onClick: () => void;
  title: string;
  danger?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className={cn(
        "grid size-7 place-items-center rounded-lg border border-white/10 transition-colors",
        danger
          ? "text-red-400 hover:bg-red-500/10"
          : "text-muted-foreground hover:text-accent hover:border-accent/30",
      )}
    >
      {children}
    </button>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-center">
      <p className="font-display text-lg font-semibold">{value.toLocaleString()}</p>
      <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function Toggle({
  label,
  icon,
  on,
  onClick,
}: {
  label: string;
  icon: React.ReactNode;
  on: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center justify-between rounded-lg border border-white/10 px-3 py-2 text-sm"
    >
      <span className="flex items-center gap-2">
        {icon} {label}
      </span>
      <span
        className={cn(
          "relative h-5 w-9 rounded-full transition-colors",
          on ? "bg-accent" : "bg-white/15",
        )}
      >
        <span
          className={cn(
            "absolute top-0.5 size-4 rounded-full bg-white transition-transform",
            on ? "translate-x-4" : "translate-x-0.5",
          )}
        />
      </span>
    </button>
  );
}

function ImageField({
  label,
  value,
  uploading,
  progress,
  onPick,
  onClear,
  compact,
}: {
  label: string;
  value: string | null;
  uploading: boolean;
  progress: number;
  onPick: () => void;
  onClear: () => void;
  compact?: boolean;
}) {
  return (
    <div>
      <span className="mb-1 block text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
        {label}
      </span>
      <div
        className={cn(
          "relative overflow-hidden rounded-lg border border-white/10 bg-white/[0.02]",
          compact ? "aspect-square" : "aspect-video",
        )}
      >
        {value ? (
          <img src={value} alt="" className="size-full object-cover" />
        ) : (
          <div className="grid size-full place-items-center text-muted-foreground/40">
            <ImagePlus className="size-5" />
          </div>
        )}
        {uploading && (
          <div className="absolute inset-0 grid place-items-center gap-2 bg-black/60">
            <Loader2 className="size-5 animate-spin text-accent" />
            <div className="h-1 w-3/4 overflow-hidden rounded-full bg-white/15">
              <div className="h-full bg-accent transition-all" style={{ width: `${progress}%` }} />
            </div>
          </div>
        )}
        {value && !uploading && (
          <button
            onClick={onClear}
            className="absolute right-1.5 top-1.5 grid size-6 place-items-center rounded-full bg-black/60 text-white hover:bg-red-500/70"
            aria-label="Remove image"
          >
            <X className="size-3" />
          </button>
        )}
      </div>
      <button
        onClick={onPick}
        disabled={uploading}
        className="mt-1.5 w-full rounded-lg border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:border-accent/40 hover:text-accent disabled:opacity-50"
      >
        {value ? "Replace" : "Upload"}
      </button>
    </div>
  );
}
