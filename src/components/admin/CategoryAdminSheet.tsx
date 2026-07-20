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
  History,
  Sparkles,
  ChevronDown,
  ChevronRight,
  CheckSquare,
  Square,
  Pencil,
  FolderUp,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useServerFn } from "@tanstack/react-start";
import { generateCategoryImage } from "@/lib/category-image.functions";
import { logActivity } from "@/components/admin/AdminShell";
import {
  invalidateCategories,
  CATEGORY_COLUMNS,
  type Category,
  type CategoryStatus,
  type CategoryRegion,
} from "@/lib/use-categories";
import { cn } from "@/lib/utils";
import { useAutosave } from "@/hooks/use-autosave";
import { useUnsavedGuard } from "@/hooks/use-unsaved-guard";
import { SaveStateBadge } from "@/components/admin/SaveStateBadge";
import { DraftRecoveryDialog } from "@/components/admin/DraftRecoveryDialog";
import { VersionHistorySheet } from "@/components/admin/VersionHistorySheet";
import {
  fetchDraft,
  discardDraft,
  readLocalDraft,
  saveVersion,
  diffFields,
  logAdminActivity,
} from "@/lib/drafts";

type Row = Category;
type ImageSlot = "image" | "banner_image" | "mobile_image";
type CatFilter = "all" | "main" | "sub" | "visible" | "hidden" | "empty";

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
  parent_id: null,
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
  variant = "sheet",
}: {
  onClose: () => void;
  onChanged: () => void;
  productCounts?: Record<string, number>;
  variant?: "sheet" | "embedded";
}) {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<Row> | null>(null);
  const [original, setOriginal] = useState<string>("");
  const [saving, setSaving] = useState(false);
  const [uploadingSlot, setUploadingSlot] = useState<ImageSlot | null>(null);
  const [progress, setProgress] = useState(0);
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<CatFilter>("all");
  const [aiBusy, setAiBusy] = useState(false);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [cardAiId, setCardAiId] = useState<string | null>(null);
  const genImage = useServerFn(generateCategoryImage);
  const fileSlot = useRef<ImageSlot>("image");
  const fileRef = useRef<HTMLInputElement>(null);
  const embedded = variant === "embedded";

  async function regenerateAi() {
    if (!editing?.name?.trim()) {
      toast.error("Enter a category name first");
      return;
    }
    setAiBusy(true);
    try {
      const slug = editing.slug?.trim() || slugify(editing.name);
      const { url } = await genImage({
        data: {
          name: editing.name.trim(),
          slug,
          description: editing.description?.trim() || undefined,
        },
      });
      setEditing((prev) => (prev ? { ...prev, image: url } : prev));
      toast.success("AI image generated");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setAiBusy(false);
    }
  }

  const dirty = useMemo(
    () => (editing ? JSON.stringify(editing) !== original : false),
    [editing, original],
  );

  const entityId = editing?.id ?? "new";
  const [showVersions, setShowVersions] = useState(false);
  const [recovery, setRecovery] = useState<
    { data: Partial<Row>; savedAt: string | null; device?: string | null } | null
  >(null);

  // Autosave the open editor + protect against accidental navigation.
  const autosave = useAutosave({
    entityType: "category",
    entityId,
    value: editing ?? {},
    enabled: !!editing && dirty,
  });
  useUnsavedGuard(dirty);

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
    // Look for a recoverable draft (local first for instant crash recovery,
    // then the database-synced copy from another device/session).
    const id = row.id ?? "new";
    const local = readLocalDraft("category", id);
    if (local) {
      setRecovery({ data: local.data as Partial<Row>, savedAt: local.savedAt });
    }
    void fetchDraft("category", id).then((d) => {
      if (d && (!local || new Date(d.updated_at) > new Date(local.savedAt))) {
        setRecovery({
          data: d.data as Partial<Row>,
          savedAt: d.updated_at,
          device: d.device_label,
        });
      }
    });
  }

  function restoreDraft() {
    if (recovery) {
      setEditing(recovery.data);
      void logAdminActivity("draft_recover", "category", entityId);
    }
    setRecovery(null);
  }

  async function dismissDraft() {
    setRecovery(null);
    await discardDraft("category", entityId).catch(() => {});
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
      parent_id: editing.parent_id || null,
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
    // Record an immutable version snapshot with changed-field highlighting.
    const changed = diffFields(
      original ? (JSON.parse(original) as Record<string, unknown>) : {},
      payload as Record<string, unknown>,
    );
    await saveVersion(
      "category",
      slug,
      payload as Record<string, unknown>,
      changed,
      editing.id ? `Updated ${changed.length} field(s)` : "Created category",
    ).catch(() => {});
    logActivity(editing.id ? "category_update" : "category_create", "category", editing.id, {
      slug,
      status: payload.status,
    });
    // Clear autosave draft now that work is committed.
    autosave.markClean();
    await discardDraft("category", entityId).catch(() => {});
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
      parent_id: row.parent_id,
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

  function toggleCollapse(id: string) {
    setCollapsed((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  function toggleSelect(id: string) {
    setSelected((p) => {
      const n = new Set(p);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  }

  async function quickHomepage(row: Row) {
    const next = !row.homepage_visible;
    const { error } = await supabase
      .from("categories")
      .update({ homepage_visible: next })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    await load();
    invalidateCategories();
    onChanged();
  }

  async function convertToMain(row: Row) {
    const { error } = await supabase
      .from("categories")
      .update({ parent_id: null })
      .eq("id", row.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`"${row.name}" is now a main category`);
    logActivity("category_update", "category", row.id, { converted: "main" });
    await load();
    invalidateCategories();
    onChanged();
  }

  function addSubcategory(main: Row) {
    // Lightweight: open the editor pre-bound to this parent and keep it expanded.
    setCollapsed((p) => {
      const n = new Set(p);
      n.delete(main.id);
      return n;
    });
    open({ ...blank(), parent_id: main.id, status: "published" });
  }

  async function generateCardImage(row: Row) {
    setCardAiId(row.id);
    try {
      const { url } = await genImage({
        data: {
          name: row.name,
          slug: row.slug,
          description: row.description?.trim() || undefined,
        },
      });
      const { error } = await supabase
        .from("categories")
        .update({ image: url })
        .eq("id", row.id);
      if (error) throw error;
      toast.success("AI image generated");
      await load();
      invalidateCategories();
      onChanged();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "AI generation failed");
    } finally {
      setCardAiId(null);
    }
  }

  async function bulkVisibility(homepage_visible: boolean) {
    const ids = Array.from(selected);
    if (!ids.length) return;
    const { error } = await supabase
      .from("categories")
      .update({ homepage_visible })
      .in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} ${homepage_visible ? "shown" : "hidden"}`);
    setSelected(new Set());
    await load();
    invalidateCategories();
    onChanged();
  }

  async function bulkDelete() {
    const ids = Array.from(selected);
    if (!ids.length) return;
    if (!confirm(`Delete ${ids.length} categories permanently?`)) return;
    const { error } = await supabase.from("categories").delete().in("id", ids);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success(`${ids.length} deleted`);
    setSelected(new Set());
    await load();
    invalidateCategories();
    onChanged();
  }

  const productCount = (r: Row) => productCounts[r.slug] ?? 0;

  const groups = useMemo(() => {
    const q = query.trim().toLowerCase();
    const nameOf = (id: string) => rows.find((r) => r.id === id)?.name ?? "";
    const count = (r: Row) => productCounts[r.slug] ?? 0;
    const matches = (r: Row) => {
      if (q) {
        const hay = `${r.name} ${r.slug} ${
          r.parent_id ? nameOf(r.parent_id) : ""
        }`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      switch (filter) {
        case "main":
          return !r.parent_id;
        case "sub":
          return !!r.parent_id;
        case "visible":
          return !!r.homepage_visible;
        case "hidden":
          return !r.homepage_visible;
        case "empty":
          return count(r) === 0;
        default:
          return true;
      }
    };
    const mains = rows.filter((r) => !r.parent_id);
    const mainIds = new Set(mains.map((m) => m.id));
    const out: { main: Row; subs: Row[]; totalSubs: number }[] = [];
    for (const m of mains) {
      const allSubs = rows.filter((s) => s.parent_id === m.id);
      const mSubs = allSubs.filter(matches);
      if (matches(m) || mSubs.length > 0)
        out.push({ main: m, subs: mSubs, totalSubs: allSubs.length });
    }
    const orphans = rows.filter(
      (s) => s.parent_id && !mainIds.has(s.parent_id) && matches(s),
    );
    return { out, orphans };
  }, [rows, query, filter, productCounts]);

  const renderCard = (r: Row, isSub: boolean, index: number, total: number) => {
    const sel = selected.has(r.id);
    const meta = STATUS_META[r.status];
    return (
      <div
        className={cn(
          "rounded-xl border bg-white/[0.02] p-2.5 transition-colors",
          sel ? "border-accent/60 bg-accent/[0.06]" : "border-white/10",
        )}
      >
        <div className="flex items-center gap-2.5">
          <button
            onClick={() => toggleSelect(r.id)}
            className="grid size-5 shrink-0 place-items-center text-muted-foreground hover:text-accent"
            aria-label="Select category"
          >
            {sel ? (
              <CheckSquare className="size-4 text-accent" />
            ) : (
              <Square className="size-4" />
            )}
          </button>
          <button
            onClick={() => open(r)}
            className="size-12 shrink-0 overflow-hidden rounded-lg border border-white/10 bg-white/[0.03]"
          >
            {r.image ? (
              <img decoding="async"
                src={r.image}
                alt=""
                loading="lazy"
                className="size-full object-cover"
              />
            ) : (
              <div className="grid size-full place-items-center text-muted-foreground/40">
                <Tag className="size-4" />
              </div>
            )}
          </button>
          <button onClick={() => open(r)} className="min-w-0 flex-1 text-left">
            <div className="flex items-center gap-1.5">
              <p className="truncate text-sm font-medium">{r.name}</p>
              {r.featured && <Star className="size-3 shrink-0 text-accent" />}
              {r.trending && <Flame className="size-3 shrink-0 text-orange-400" />}
            </div>
            <div className="mt-0.5 flex flex-wrap items-center gap-1.5">
              <span
                className={cn(
                  "rounded border px-1.5 py-px text-[8px] font-mono uppercase tracking-wider",
                  isSub
                    ? "border-sky-500/30 bg-sky-500/10 text-sky-300"
                    : "border-accent/30 bg-accent/10 text-accent",
                )}
              >
                {isSub ? "Sub" : "Main"}
              </span>
              <span
                className={cn(
                  "rounded border px-1.5 py-px text-[8px] font-mono uppercase tracking-wider",
                  meta.cls,
                )}
              >
                {meta.label}
              </span>
              <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                {productCount(r)} products
              </span>
            </div>
          </button>
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-1.5 border-t border-white/5 pt-2">
          <QuickBtn onClick={() => open(r)} title="Edit">
            <Pencil className="size-3.5" />
          </QuickBtn>
          <QuickBtn
            onClick={() => quickHomepage(r)}
            title={r.homepage_visible ? "Hide" : "Show"}
          >
            {r.homepage_visible ? (
              <EyeOff className="size-3.5" />
            ) : (
              <Eye className="size-3.5" />
            )}
          </QuickBtn>
          <QuickBtn onClick={() => duplicate(r)} title="Duplicate">
            <Copy className="size-3.5" />
          </QuickBtn>
          <QuickBtn onClick={() => generateCardImage(r)} title="Generate AI image">
            {cardAiId === r.id ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Sparkles className="size-3.5" />
            )}
          </QuickBtn>
          {isSub && (
            <QuickBtn onClick={() => convertToMain(r)} title="Make main category">
              <FolderUp className="size-3.5" />
            </QuickBtn>
          )}
          <QuickBtn
            onClick={() => reorder(r, "up")}
            title="Move up"
          >
            <ArrowUp className="size-3.5" />
          </QuickBtn>
          {!isSub && (
            <QuickBtn onClick={() => addSubcategory(r)} title="Add subcategory">
              <Plus className="size-3.5" />
            </QuickBtn>
          )}
          <QuickBtn
            onClick={() => reorder(r, "down")}
            title="Move down"
          >
            <ArrowDown className="size-3.5" />
          </QuickBtn>
          <QuickBtn onClick={() => del(r.id)} title="Delete" danger>
            <Trash2 className="size-3.5" />
          </QuickBtn>
        </div>
      </div>
    );
  };


  return (
    <AnimatePresence>
      <motion.div
        initial={embedded ? { opacity: 0, y: 8 } : { opacity: 0 }}
        animate={embedded ? { opacity: 1, y: 0 } : { opacity: 1 }}
        exit={embedded ? { opacity: 0, y: 8 } : { opacity: 0 }}
        className={embedded ? "" : "fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"}
        onClick={() => {
          if (embedded) return;
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
          initial={embedded ? false : { y: "100%" }}
          animate={embedded ? undefined : { y: 0 }}
          exit={embedded ? undefined : { y: "100%" }}
          transition={embedded ? undefined : { type: "spring", damping: 32, stiffness: 300 }}
          onClick={(e) => e.stopPropagation()}
          className={embedded ? "relative overflow-hidden rounded-2xl border border-accent/20 bg-background/70 p-5 backdrop-blur-xl" : "absolute inset-x-0 bottom-0 max-h-[92vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none sm:rounded-none sm:rounded-l-3xl sm:border-l sm:border-t-0"}
        >
          <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15 sm:hidden" />
          <div className="mb-4 flex items-center justify-between">
            <div>
              <h2 className="font-display font-semibold leading-tight">Category CMS</h2>
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                Realtime · admin-only · {rows.length} total
              </p>
            </div>
            {!embedded && (
              <button
                onClick={() => {
                  if (uploadingSlot || saving) {
                    toast.error("Please wait for the upload to finish");
                    return;
                  }
                  onClose();
                }}
                className="grid size-8 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            )}
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

              <div className="mb-3 flex gap-1.5 overflow-x-auto pb-1">
                {(
                  [
                    ["all", "All"],
                    ["main", "Main"],
                    ["sub", "Subcategories"],
                    ["visible", "Visible"],
                    ["hidden", "Hidden"],
                    ["empty", "Empty"],
                  ] as const
                ).map(([f, label]) => (
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
                    {label}
                  </button>
                ))}
              </div>

              {selected.size > 0 && (
                <div className="mb-3 flex items-center gap-1.5 rounded-xl border border-accent/30 bg-accent/[0.06] p-2">
                  <span className="ml-1 text-[10px] font-mono uppercase tracking-widest text-accent">
                    {selected.size} selected
                  </span>
                  <div className="ml-auto flex items-center gap-1.5">
                    <QuickBtn onClick={() => bulkVisibility(true)} title="Show">
                      <Eye className="size-3.5" />
                    </QuickBtn>
                    <QuickBtn onClick={() => bulkVisibility(false)} title="Hide">
                      <EyeOff className="size-3.5" />
                    </QuickBtn>
                    <QuickBtn onClick={bulkDelete} title="Delete" danger>
                      <Trash2 className="size-3.5" />
                    </QuickBtn>
                    <button
                      onClick={() => setSelected(new Set())}
                      className="rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                    >
                      Clear
                    </button>
                  </div>
                </div>
              )}

              {loading ? (
                <div className="grid place-items-center py-16">
                  <Loader2 className="size-5 animate-spin text-muted-foreground" />
                </div>
              ) : (
                <div className="space-y-2.5">
                  {groups.out.map(({ main, subs, totalSubs }, mi) => {
                    const isCollapsed = collapsed.has(main.id);
                    return (
                      <div key={main.id} className="space-y-1.5">
                        <div className="flex items-stretch gap-1">
                          {totalSubs > 0 ? (
                            <button
                              onClick={() => toggleCollapse(main.id)}
                              className="grid w-6 shrink-0 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent"
                              aria-label={isCollapsed ? "Expand" : "Collapse"}
                            >
                              {isCollapsed ? (
                                <ChevronRight className="size-4" />
                              ) : (
                                <ChevronDown className="size-4" />
                              )}
                            </button>
                          ) : (
                            <div className="w-6 shrink-0" />
                          )}
                          <div className="min-w-0 flex-1">
                            {renderCard(main, false, mi, groups.out.length)}
                          </div>
                        </div>
                        {!isCollapsed &&
                          subs.map((s, si) => (
                            <div key={s.id} className="flex items-stretch gap-1">
                              <div className="flex w-6 shrink-0 justify-center">
                                <span className="w-px bg-white/10" />
                              </div>
                              <div className="min-w-0 flex-1">
                                {renderCard(s, true, si, subs.length)}
                              </div>
                            </div>
                          ))}
                      </div>
                    );
                  })}

                  {groups.orphans.length > 0 && (
                    <div className="space-y-1.5">
                      <p className="px-1 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                        Ungrouped
                      </p>
                      {groups.orphans.map((s, si) => (
                        <div key={s.id}>{renderCard(s, true, si, groups.orphans.length)}</div>
                      ))}
                    </div>
                  )}

                  {groups.out.length === 0 && groups.orphans.length === 0 && (
                    <div className="rounded-xl border border-dashed border-white/10 p-6 text-center text-sm text-muted-foreground">
                      No categories match.
                    </div>
                  )}
                </div>
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
              <button
                type="button"
                onClick={regenerateAi}
                disabled={aiBusy}
                className="-mt-2 flex w-full items-center justify-center gap-2 rounded-full border border-accent/30 bg-accent/[0.06] px-3 py-2 text-[10px] font-mono uppercase tracking-widest text-accent disabled:opacity-50"
              >
                {aiBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}
                {editing.image ? "Regenerate AI image" : "Generate AI image"}
              </button>

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

              <Field label="Parent category (leave empty for a main category)">
                <select
                  value={editing.parent_id ?? ""}
                  onChange={(e) => setEditing({ ...editing, parent_id: e.target.value || null })}
                  className={input}
                >
                  <option value="">— Main category —</option>
                  {rows
                    .filter((r) => !r.parent_id && r.id !== editing.id)
                    .map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name}
                      </option>
                    ))}
                </select>
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
                <div className="flex items-center justify-between gap-2 pt-1">
                  <SaveStateBadge
                    state={autosave.state}
                    lastSavedAt={autosave.lastSavedAt}
                  />
                  {editing.id && (
                    <button
                      onClick={() => setShowVersions(true)}
                      className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-2.5 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground"
                    >
                      <History className="size-3" /> History
                    </button>
                  )}
                </div>
              </div>

            </div>
          )}
        </motion.div>
      </motion.div>

      <DraftRecoveryDialog
        open={!!recovery}
        savedAt={recovery?.savedAt ?? null}
        deviceLabel={recovery?.device}
        onRestore={restoreDraft}
        onDiscard={dismissDraft}
      />
      <VersionHistorySheet
        open={showVersions}
        onOpenChange={setShowVersions}
        entityType="category"
        entityId={editing?.slug ?? entityId}
        onRestore={(snap) =>
          setEditing((prev) => ({ ...(prev ?? {}), ...(snap as Partial<Row>) }))
        }
        onDuplicate={(snap) =>
          setEditing({
            ...(snap as Partial<Row>),
            id: undefined,
            slug: `${(snap as Row).slug ?? "category"}-copy`,
            status: "draft",
          })
        }
      />
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
          <img loading="lazy" decoding="async" src={value} alt="" className="size-full object-cover" />
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
