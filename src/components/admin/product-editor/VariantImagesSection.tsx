// ============================================================
// Variant media manager — per-COLOUR galleries (images + videos).
//
// Media is shared by COLOUR, not size: every size variant of a
// colour (Blue S / Blue M / Blue L …) points at ONE gallery. To
// support that while still rendering the media manager *inside*
// every variant card, gallery state is lifted into a shared
// manager hook (`useColorGalleryManager`). Each card renders a
// controlled `VariantMediaPanel`; two cards of the same colour
// read/write the exact same state, so there is never a duplicate
// gallery or duplicate upload.
//
// `VariantImagesSection` (self-contained, one panel per colour)
// is retained for the Variant Builder modal, which manages its
// own local state.
// ============================================================
import { useEffect, useMemo, useRef, useState } from "react";
import {
  Images,
  Loader2,
  Trash2,
  Star,
  GripVertical,
  Save,
  Check,
  Play,
  Video,
  Link2,
  Replace,
  Eye,
  X,
  RotateCw,
  ZoomIn,
  ZoomOut,
} from "lucide-react";
import { toast } from "sonner";
import { createPortal } from "react-dom";
import { MediaUploader } from "@/components/admin/MediaUploader";
import {
  fetchAdminColorGalleries,
  fetchVariantImageMax,
  setVariantImageMax,
  saveColorGallery,
  uploadVariantVideo,
  detectMediaType,
  newImgId,
  VIDEO_EXT,
  type VariantImageDraft,
  type MediaType,
} from "@/lib/variant-images";

type ColorInfo = { color: string; hex: string | null };

// ---------------------------------------------------------------------------
// Shared per-colour gallery manager (used by the variants route so that all
// size cards of a colour edit ONE gallery).
// ---------------------------------------------------------------------------
export function useColorGalleryManager(slug: string) {
  const [loading, setLoading] = useState(true);
  const [galleries, setGalleries] = useState<Record<string, VariantImageDraft[]>>({});
  const [saved, setSaved] = useState<Record<string, string>>({}); // color -> JSON snapshot
  const [savingColor, setSavingColor] = useState<string | null>(null);
  const [max, setMax] = useState<number | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [g, m] = await Promise.all([fetchAdminColorGalleries(slug), fetchVariantImageMax(slug)]);
      if (!active) return;
      setGalleries(g);
      setSaved(Object.fromEntries(Object.entries(g).map(([k, v]) => [k, JSON.stringify(v)])));
      setMax(m);
      setLoading(false);
    })().catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  async function commitMax(next: number | null) {
    setMax(next);
    try {
      await setVariantImageMax(slug, next);
    } catch (e: any) {
      toast.error("Could not save limit", { description: e?.message });
    }
  }

  const getMedia = (color: string) => galleries[color] ?? [];

  const setColorMedia = (color: string, next: VariantImageDraft[]) =>
    setGalleries((g) => ({ ...g, [color]: next }));

  const isDirty = (color: string) =>
    JSON.stringify(galleries[color] ?? []) !== (saved[color] ?? "[]");

  async function saveColor(color: string) {
    setSavingColor(color);
    try {
      const media = galleries[color] ?? [];
      await saveColorGallery(slug, color, media);
      setSaved((s) => ({ ...s, [color]: JSON.stringify(media) }));
      toast.success(`${color} gallery saved`);
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSavingColor(null);
    }
  }

  /**
   * Flush every dirty colour gallery to the database. Called by the variants
   * page's main Save so gallery edits persist alongside variant changes and the
   * colour thumbnails re-sync into cart/checkout.
   */
  async function saveAll() {
    const dirtyColors = Object.keys(galleries).filter((c) => isDirty(c));
    for (const color of dirtyColors) {
      await saveColorGallery(slug, color, galleries[color] ?? []);
    }
    if (dirtyColors.length) {
      setSaved(
        Object.fromEntries(Object.entries(galleries).map(([k, v]) => [k, JSON.stringify(v)])),
      );
    }
  }

  return { slug, loading, max, commitMax, getMedia, setColorMedia, isDirty, savingColor, saveColor, saveAll };
}

// ---------------------------------------------------------------------------
// VariantImagesSection — self-contained (local state) list of colour
// galleries. Kept for the Variant Builder modal.
// ---------------------------------------------------------------------------
export function VariantImagesSection({ slug, colors }: { slug: string; colors: ColorInfo[] }) {
  const [loading, setLoading] = useState(true);
  const [galleries, setGalleries] = useState<Record<string, VariantImageDraft[]>>({});
  const [max, setMax] = useState<number | null>(null);
  const [maxInput, setMaxInput] = useState("");

  useEffect(() => {
    let active = true;
    setLoading(true);
    (async () => {
      const [g, m] = await Promise.all([fetchAdminColorGalleries(slug), fetchVariantImageMax(slug)]);
      if (!active) return;
      setGalleries(g);
      setMax(m);
      setMaxInput(m == null ? "" : String(m));
      setLoading(false);
    })().catch(() => active && setLoading(false));
    return () => {
      active = false;
    };
  }, [slug]);

  async function commitMax() {
    const trimmed = maxInput.trim();
    const next = trimmed === "" ? null : Math.max(1, Math.trunc(Number(trimmed) || 0));
    setMax(next);
    setMaxInput(next == null ? "" : String(next));
    try {
      await setVariantImageMax(slug, next);
    } catch (e: any) {
      toast.error("Could not save limit", { description: e?.message });
    }
  }

  if (colors.length === 0) return null;

  return (
    <div className="card-premium rounded-2xl p-4 space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <Images className="size-4 text-accent" />
        <h3 className="text-sm font-medium">Variant Media</h3>
        <span className="text-[11px] text-muted-foreground">Each colour has its own image + video gallery</span>
        <div className="ml-auto flex items-center gap-2">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Max / colour</label>
          <input
            value={maxInput}
            onChange={(e) => setMaxInput(e.target.value.replace(/[^\d]/g, ""))}
            onBlur={commitMax}
            onKeyDown={(e) => e.key === "Enter" && (e.currentTarget as HTMLInputElement).blur()}
            placeholder="∞"
            inputMode="numeric"
            className="w-16 bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-sm text-center focus:outline-none focus:border-accent/40"
          />
        </div>
      </div>

      {loading ? (
        <div className="grid place-items-center py-8">
          <Loader2 className="size-5 animate-spin text-accent" />
        </div>
      ) : (
        <div className="space-y-4">
          {colors.map((c) => (
            <LocalColorGallery key={c.color} slug={slug} color={c.color} hex={c.hex} max={max} initial={galleries[c.color] ?? []} />
          ))}
        </div>
      )}
    </div>
  );
}

// Self-contained gallery (local state + save) wrapping the controlled panel.
function LocalColorGallery({
  slug,
  color,
  hex,
  max,
  initial,
}: {
  slug: string;
  color: string;
  hex: string | null;
  max: number | null;
  initial: VariantImageDraft[];
}) {
  const [media, setMedia] = useState<VariantImageDraft[]>(initial);
  const [dirty, setDirty] = useState(false);
  const [saving, setSaving] = useState(false);

  function change(next: VariantImageDraft[]) {
    setMedia(next);
    setDirty(true);
  }

  async function save() {
    setSaving(true);
    try {
      await saveColorGallery(slug, color, media);
      setDirty(false);
      toast.success(`${color} gallery saved`);
    } catch (e: any) {
      toast.error("Save failed", { description: e?.message });
    } finally {
      setSaving(false);
    }
  }

  return (
    <VariantMediaPanel
      slug={slug}
      color={color}
      hex={hex}
      max={max}
      media={media}
      onChange={change}
      dirty={dirty}
      saving={saving}
      onSave={save}
    />
  );
}

// ---------------------------------------------------------------------------
// VariantMediaPanel — controlled media manager for one colour gallery.
// ---------------------------------------------------------------------------
export function VariantMediaPanel({
  slug,
  color,
  hex,
  max,
  media,
  onChange,
  dirty,
  saving,
  onSave,
  showHeaderSwatch = true,
}: {
  slug: string;
  color: string;
  hex: string | null;
  max: number | null;
  media: VariantImageDraft[];
  onChange: (next: VariantImageDraft[]) => void;
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  showHeaderSwatch?: boolean;
}) {
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [videoBusy, setVideoBusy] = useState(false);
  const [preview, setPreview] = useState<VariantImageDraft | null>(null);
  const dragIndex = useRef<number | null>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const replaceRef = useRef<HTMLInputElement>(null);
  const replaceTarget = useRef<string | null>(null);
  const bulkReplaceRef = useRef<HTMLInputElement>(null);

  const atMax = max != null && media.length >= max;
  const imageCount = useMemo(() => media.filter((m) => m.mediaType === "image").length, [media]);
  const videoCount = media.length - imageCount;

  // Always mirror the latest committed media so that concurrent uploads
  // (MediaUploader runs several files in parallel) append onto the running
  // list instead of each overwriting the stale prop captured at render time.
  const mediaRef = useRef<VariantImageDraft[]>(media);
  useEffect(() => {
    mediaRef.current = media;
  }, [media]);

  function addDraft(draft: VariantImageDraft): boolean {
    const current = mediaRef.current;
    if (max != null && current.length >= max) {
      toast.error(`Limit reached — max ${max} media for ${color}`);
      return false;
    }
    const next = [...current, draft];
    mediaRef.current = next; // synchronous so parallel completions compound
    onChange(next);
    return true;
  }

  function onImageUploaded(url: string, thumbUrl: string | null, mediumUrl: string | null) {
    addDraft({ id: newImgId(), url, thumbUrl, mediumUrl, mediaType: "image", posterUrl: null });
  }


  async function onVideoFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setVideoBusy(true);
    try {
      const next = [...mediaRef.current];
      for (const file of Array.from(files)) {
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (!VIDEO_EXT.includes(ext)) {
          toast.error(`${file.name}: only ${VIDEO_EXT.join(", ")} videos are supported`);
          continue;
        }
        if (max != null && next.length >= max) {
          toast.error(`Limit reached — max ${max} media for ${color}`);
          break;
        }
        const url = await uploadVariantVideo(slug, file);
        next.push({ id: newImgId(), url, thumbUrl: null, mediumUrl: null, mediaType: "video", posterUrl: null });
      }
      mediaRef.current = next;
      onChange(next);
      toast.success("Video added");
    } catch (e: any) {
      toast.error("Video upload failed", { description: e?.message });
    } finally {
      setVideoBusy(false);
      if (videoRef.current) videoRef.current.value = "";
    }
  }


  function addUrl(kind: MediaType) {
    const url = window.prompt(`Paste the ${kind} URL for ${color}`)?.trim();
    if (!url) return;
    if (!/^https?:\/\//i.test(url)) {
      toast.error("Enter a full URL starting with http(s)://");
      return;
    }
    const type = kind === "video" || detectMediaType(url) === "video" ? "video" : "image";
    addDraft({ id: newImgId(), url, thumbUrl: null, mediumUrl: null, mediaType: type, posterUrl: null });
  }

  function remove(id: string) {
    onChange(media.filter((i) => i.id !== id));
    setSelected((prev) => {
      const n = new Set(prev);
      n.delete(id);
      return n;
    });
  }

  function bulkDelete() {
    if (selected.size === 0) return;
    if (!window.confirm(`Delete ${selected.size} selected media item(s) from ${color}?`)) return;
    onChange(media.filter((i) => !selected.has(i.id)));
    setSelected(new Set());
  }

  function bulkDownload() {
    const items = media.filter((m) => selected.has(m.id));
    items.forEach((m, idx) => setTimeout(() => download(m), idx * 200));
  }

  function moveSelected(toEnd: boolean) {
    if (selected.size === 0) return;
    const sel = media.filter((m) => selected.has(m.id));
    const rest = media.filter((m) => !selected.has(m.id));
    onChange(toEnd ? [...rest, ...sel] : [...sel, ...rest]);
  }

  function coverFromSelection() {
    const firstSel = media.find((m) => selected.has(m.id) && m.mediaType === "image");
    if (!firstSel) {
      toast.error("Select an image to set as cover");
      return;
    }
    makeThumbnail(firstSel.id);
  }

  async function onBulkReplace(files: FileList | null) {
    if (!files || files.length === 0) return;
    const ids = media.filter((m) => selected.has(m.id)).map((m) => m.id);
    const arr = Array.from(files);
    try {
      let next = [...media];
      const { processAndUpload } = await import("@/lib/media-engine");
      for (let k = 0; k < Math.min(ids.length, arr.length); k++) {
        const file = arr[k];
        const id = ids[k];
        const ext = (file.name.split(".").pop() || "").toLowerCase();
        if (VIDEO_EXT.includes(ext)) {
          const url = await uploadVariantVideo(slug, file);
          next = next.map((m) =>
            m.id === id ? { ...m, url, thumbUrl: null, mediumUrl: null, mediaType: "video" as MediaType } : m,
          );
        } else {
          const done = await processAndUpload(file, { entityType: "product", entityRef: slug });
          next = next.map((m) =>
            m.id === id
              ? {
                  ...m,
                  url: done.variants.large_url || done.variants.url,
                  thumbUrl: done.variants.thumb_url,
                  mediumUrl: done.variants.medium_url,
                  mediaType: "image" as MediaType,
                }
              : m,
          );
        }
      }
      onChange(next);
      toast.success(`Replaced ${Math.min(ids.length, arr.length)} selected media`);
    } catch (e: any) {
      toast.error("Bulk replace failed", { description: e?.message });
    } finally {
      if (bulkReplaceRef.current) bulkReplaceRef.current.value = "";
    }
  }


  function toggleSelect(id: string) {
    setSelected((prev) => {
      const n = new Set(prev);
      n.has(id) ? n.delete(id) : n.add(id);
      return n;
    });
  }

  function makeThumbnail(id: string) {
    const idx = media.findIndex((i) => i.id === id);
    if (idx <= 0) return;
    const next = [...media];
    const [item] = next.splice(idx, 1);
    next.unshift(item);
    onChange(next);
  }

  function reorder(from: number, to: number) {
    if (from === to) return;
    const next = [...media];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    onChange(next);
  }

  function beginReplace(id: string) {
    replaceTarget.current = id;
    replaceRef.current?.click();
  }

  async function onReplaceFile(files: FileList | null) {
    const id = replaceTarget.current;
    if (!files || files.length === 0 || !id) return;
    const file = files[0];
    const ext = (file.name.split(".").pop() || "").toLowerCase();
    try {
      if (VIDEO_EXT.includes(ext)) {
        const url = await uploadVariantVideo(slug, file);
        onChange(media.map((m) => (m.id === id ? { ...m, url, thumbUrl: null, mediumUrl: null, mediaType: "video" } : m)));
      } else {
        const { processAndUpload } = await import("@/lib/media-engine");
        const done = await processAndUpload(file, { entityType: "product", entityRef: slug });
        onChange(
          media.map((m) =>
            m.id === id
              ? {
                  ...m,
                  url: done.variants.large_url || done.variants.url,
                  thumbUrl: done.variants.thumb_url,
                  mediumUrl: done.variants.medium_url,
                  mediaType: "image",
                }
              : m,
          ),
        );
      }
      toast.success("Media replaced");
    } catch (e: any) {
      toast.error("Replace failed", { description: e?.message });
    } finally {
      replaceTarget.current = null;
      if (replaceRef.current) replaceRef.current.value = "";
    }
  }

  function download(m: VariantImageDraft) {
    const a = document.createElement("a");
    a.href = m.url;
    a.download = "";
    a.target = "_blank";
    a.rel = "noopener";
    document.body.appendChild(a);
    a.click();
    a.remove();
  }

  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3 space-y-3">
      <input
        ref={videoRef}
        type="file"
        accept={VIDEO_EXT.map((e) => `.${e}`).join(",")}
        multiple
        className="hidden"
        onChange={(e) => onVideoFiles(e.target.files)}
      />
      <input ref={replaceRef} type="file" accept="image/*,video/*" className="hidden" onChange={(e) => onReplaceFile(e.target.files)} />
      <input ref={bulkReplaceRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => onBulkReplace(e.target.files)} />

      <div className="flex flex-wrap items-center gap-2">
        {showHeaderSwatch && (
          <span className="size-4 rounded-full border border-white/20 shrink-0" style={{ background: hex ?? "#111111" }} />
        )}
        <span className="inline-flex items-center gap-1 text-sm font-medium">
          <Images className="size-3.5 text-accent" /> Media ({media.length}){max != null ? ` / ${max}` : ""}
        </span>
        {imageCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            <Star className="size-3 fill-current text-accent" /> Cover
          </span>
        )}
        {videoCount > 0 && (
          <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-muted-foreground">
            <Video className="size-3" /> {videoCount}
          </span>
        )}
        {dirty ? (
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="ml-auto inline-flex items-center gap-1.5 rounded-lg bg-accent px-3 py-1.5 text-xs font-semibold text-accent-foreground hover:brightness-110 disabled:opacity-50"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} Save media
          </button>
        ) : media.length > 0 ? (
          <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-emerald-400">
            <Check className="size-3.5" /> Saved
          </span>
        ) : null}
      </div>

      {/* Bulk toolbar */}
      {media.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <button
            type="button"
            onClick={() => setSelected((prev) => (prev.size === media.length ? new Set() : new Set(media.map((m) => m.id))))}
            className="rounded-lg border border-white/10 px-2 py-1 text-muted-foreground hover:text-foreground"
          >
            {selected.size === media.length ? "Clear all" : "Select all"}
          </button>
          {selected.size > 0 ? (
            <>
              <span className="rounded-lg bg-accent/15 px-2 py-1 font-medium text-accent">{selected.size} selected</span>
              <button
                type="button"
                onClick={coverFromSelection}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                <Star className="size-3" /> Set cover
              </button>
              <button
                type="button"
                onClick={() => moveSelected(false)}
                className="rounded-lg border border-white/10 px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                ↑ To start
              </button>
              <button
                type="button"
                onClick={() => moveSelected(true)}
                className="rounded-lg border border-white/10 px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                ↓ To end
              </button>
              <button
                type="button"
                onClick={() => bulkReplaceRef.current?.click()}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                <Replace className="size-3" /> Replace
              </button>
              <button
                type="button"
                onClick={bulkDownload}
                className="inline-flex items-center gap-1 rounded-lg border border-white/10 px-2 py-1 text-muted-foreground hover:text-foreground"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
                  <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                Download
              </button>
              <button
                type="button"
                onClick={bulkDelete}
                className="inline-flex items-center gap-1 rounded-lg border border-destructive/40 bg-destructive/10 px-2 py-1 text-destructive hover:bg-destructive/20"
              >
                <Trash2 className="size-3" /> Delete
              </button>
            </>
          ) : null}
          <span className="ml-auto text-muted-foreground">Drag tiles to reorder · first image = cover</span>
        </div>
      )}


      {media.length > 0 && (
        <div className="grid grid-cols-3 sm:grid-cols-4 gap-2">
          {media.map((m, i) => {
            const isVideo = m.mediaType === "video";
            const isSel = selected.has(m.id);
            return (
              <div
                key={m.id}
                draggable
                onDragStart={() => (dragIndex.current = i)}
                onDragOver={(e) => e.preventDefault()}
                onDrop={() => {
                  if (dragIndex.current != null) reorder(dragIndex.current, i);
                  dragIndex.current = null;
                }}
                className={`group relative aspect-square overflow-hidden rounded-lg border transition-transform hover:scale-[1.02] ${
                  isSel ? "border-accent ring-2 ring-accent" : i === 0 ? "border-accent/60 ring-1 ring-accent/40" : "border-white/10"
                } bg-black/20`}
              >
                {isVideo ? (
                  <>
                    {m.posterUrl ? (
                      <img decoding="async" src={m.posterUrl} alt="" className="size-full object-cover" loading="lazy" />
                    ) : (
                      <video src={m.url} muted preload="metadata" className="size-full object-cover" />
                    )}
                    <span className="pointer-events-none absolute inset-0 grid place-items-center">
                      <span className="grid size-8 place-items-center rounded-full bg-black/55 text-white">
                        <Play className="size-4 fill-current" />
                      </span>
                    </span>
                    <VideoDuration url={m.url} />

                  </>
                ) : (
                  <img decoding="async" src={m.thumbUrl ?? m.url} alt={`${color} ${i + 1}`} loading="lazy" className="size-full object-cover" />
                )}

                <button
                  type="button"
                  onClick={() => toggleSelect(m.id)}
                  aria-label="Select media"
                  className={`absolute left-1 top-1 grid size-5 place-items-center rounded border ${
                    isSel ? "bg-accent border-accent text-accent-foreground" : "bg-black/50 border-white/30 text-transparent"
                  }`}
                >
                  <Check className="size-3" />
                </button>

                {i === 0 && !isVideo && (
                  <span className="absolute left-8 top-1 inline-flex items-center gap-0.5 rounded bg-accent px-1.5 py-0.5 text-[9px] font-semibold text-accent-foreground">
                    <Star className="size-2.5 fill-current" /> Cover
                  </span>
                )}
                <span className="absolute right-1 top-1 rounded bg-black/55 px-1 py-0.5 text-[8px] font-mono uppercase text-white/80">
                  {isVideo ? "video" : "img"}
                </span>

                <div className="absolute inset-x-0 bottom-0 flex items-center gap-1 bg-gradient-to-t from-black/75 to-transparent p-1 opacity-0 transition-opacity group-hover:opacity-100">
                  <button
                    type="button"
                    onClick={() => setPreview(m)}
                    title="Preview"
                    className="grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-accent hover:text-accent-foreground"
                  >
                    <Eye className="size-3" />
                  </button>
                  {i !== 0 && !isVideo && (
                    <button
                      type="button"
                      onClick={() => makeThumbnail(m.id)}
                      title="Set as cover"
                      className="grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-accent hover:text-accent-foreground"
                    >
                      <Star className="size-3" />
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => beginReplace(m.id)}
                    title="Replace"
                    className="grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-accent hover:text-accent-foreground"
                  >
                    <Replace className="size-3" />
                  </button>
                  <button
                    type="button"
                    onClick={() => download(m)}
                    title="Download"
                    className="grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-accent hover:text-accent-foreground"
                  >
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="size-3">
                      <path d="M12 3v12m0 0l-4-4m4 4l4-4M4 21h16" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  </button>
                  <button
                    type="button"
                    onClick={() => remove(m.id)}
                    title="Delete"
                    className="ml-auto grid size-6 place-items-center rounded bg-white/15 text-white hover:bg-destructive"
                  >
                    <Trash2 className="size-3" />
                  </button>
                </div>
                <span className="absolute right-1 bottom-1 hidden text-white/60 group-hover:inline cursor-grab">
                  <GripVertical className="size-3" />
                </span>
              </div>
            );
          })}
        </div>
      )}

      {/* Add controls */}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          onClick={() => videoRef.current?.click()}
          disabled={atMax || videoBusy}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs hover:border-accent/40 disabled:opacity-50"
        >
          {videoBusy ? <Loader2 className="size-3.5 animate-spin" /> : <Video className="size-3.5" />} Upload videos
        </button>
        <button
          type="button"
          onClick={() => addUrl("image")}
          disabled={atMax}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs hover:border-accent/40 disabled:opacity-50"
        >
          <Link2 className="size-3.5" /> Add image URL
        </button>
        <button
          type="button"
          onClick={() => addUrl("video")}
          disabled={atMax}
          className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs hover:border-accent/40 disabled:opacity-50"
        >
          <Link2 className="size-3.5" /> Add video URL
        </button>
      </div>

      {atMax ? (
        <p className="text-[11px] text-muted-foreground">
          Maximum of {max} media reached for {color}. Delete one to add more.
        </p>
      ) : (
        <MediaUploader
          entityType="product"
          entityRef={slug}
          compact
          label={`Upload ${color} images`}
          onComplete={(done) => onImageUploaded(done.variants.large_url || done.variants.url, done.variants.thumb_url, done.variants.medium_url)}
        />
      )}

      {preview && createPortal(<MediaPreview media={preview} onClose={() => setPreview(null)} />, document.body)}
    </div>
  );
}

// ---------------------------------------------------------------------------
// VideoDuration — lazily reads a video's duration and shows it as a badge.
// ---------------------------------------------------------------------------
function fmtDuration(s: number): string {
  if (!isFinite(s) || s <= 0) return "";
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, "0")}`;
}

function VideoDuration({ url }: { url: string }) {
  const [dur, setDur] = useState<number | null>(null);
  return (
    <>
      <video
        src={url}
        preload="metadata"
        muted
        className="hidden"
        onLoadedMetadata={(e) => setDur((e.currentTarget as HTMLVideoElement).duration)}
      />
      {dur != null && dur > 0 && (
        <span className="absolute bottom-1 left-1 rounded bg-black/65 px-1 py-0.5 text-[8px] font-mono text-white/90">
          {fmtDuration(dur)}
        </span>
      )}
    </>
  );
}

// ---------------------------------------------------------------------------
// MediaPreview — fullscreen preview with zoom / pan / rotate for images and
// native play / pause / mute / fullscreen controls for videos.
// ---------------------------------------------------------------------------
function MediaPreview({ media, onClose }: { media: VariantImageDraft; onClose: () => void }) {
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [pan, setPan] = useState({ x: 0, y: 0 });
  const dragging = useRef<{ x: number; y: number } | null>(null);
  const isVideo = media.mediaType === "video";

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const reset = () => {
    setScale(1);
    setRotation(0);
    setPan({ x: 0, y: 0 });
  };

  return (
    <div className="fixed inset-0 z-[2147483646] grid place-items-center bg-black/90 p-4" onClick={onClose}>
      <button
        className="absolute right-4 top-4 grid size-10 place-items-center rounded-full bg-white/10 text-white hover:bg-white/20"
        onClick={onClose}
        aria-label="Close preview"
      >
        <X className="size-5" />
      </button>

      {!isVideo && (
        <div
          className="absolute left-1/2 top-4 flex -translate-x-1/2 items-center gap-1 rounded-full bg-black/60 px-2 py-1 text-white"
          onClick={(e) => e.stopPropagation()}
        >
          <button className="grid size-8 place-items-center rounded-full hover:bg-white/15" onClick={() => setScale((s) => Math.max(1, +(s - 0.25).toFixed(2)))} title="Zoom out">
            <ZoomOut className="size-4" />
          </button>
          <span className="w-12 text-center text-xs font-mono">{Math.round(scale * 100)}%</span>
          <button className="grid size-8 place-items-center rounded-full hover:bg-white/15" onClick={() => setScale((s) => Math.min(5, +(s + 0.25).toFixed(2)))} title="Zoom in">
            <ZoomIn className="size-4" />
          </button>
          <button className="grid size-8 place-items-center rounded-full hover:bg-white/15" onClick={() => setRotation((r) => (r + 90) % 360)} title="Rotate">
            <RotateCw className="size-4" />
          </button>
          <button className="rounded-full px-2 text-xs hover:bg-white/15" onClick={reset} title="Reset">
            Reset
          </button>
        </div>
      )}

      <div className="max-h-[85vh] max-w-[92vw] overflow-hidden" onClick={(e) => e.stopPropagation()}>
        {isVideo ? (
          <video src={media.url} controls autoPlay className="max-h-[85vh] max-w-[92vw] rounded-lg" />
        ) : (
          <img loading="lazy" decoding="async"
            src={media.url}
            alt=""
            draggable={false}
            onWheel={(e) => setScale((s) => Math.min(5, Math.max(1, +(s - e.deltaY * 0.0015).toFixed(2))))}
            onMouseDown={(e) => {
              if (scale <= 1) return;
              dragging.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
            }}
            onMouseMove={(e) => {
              if (!dragging.current) return;
              setPan({ x: e.clientX - dragging.current.x, y: e.clientY - dragging.current.y });
            }}
            onMouseUp={() => (dragging.current = null)}
            onMouseLeave={() => (dragging.current = null)}
            style={{
              transform: `translate(${pan.x}px, ${pan.y}px) scale(${scale}) rotate(${rotation}deg)`,
              cursor: scale > 1 ? "grab" : "default",
              transition: dragging.current ? "none" : "transform 0.15s ease",
            }}
            className="max-h-[85vh] max-w-[92vw] rounded-lg object-contain select-none"
          />
        )}
      </div>
    </div>
  );
}

