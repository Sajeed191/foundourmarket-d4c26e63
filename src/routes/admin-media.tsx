import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Search, Trash2, Copy, Loader2 } from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { MediaUploader } from "@/components/admin/MediaUploader";
import {
  searchMediaLibrary,
  deleteMediaAsset,
  formatBytes,
  type MediaAsset,
} from "@/lib/media-engine";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/admin-media")({
  head: () => ({ meta: [{ title: "Media library — Admin" }] }),
  component: MediaLibraryPage,
});

const FILTERS = [
  "all", "library", "product", "category", "banner",
  "announcement", "testimonial", "blog", "cms", "homepage",
];

const PAGE = 40;

function MediaLibraryPage() {
  const [items, setItems] = useState<MediaAsset[]>([]);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState("all");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const offset = useRef(0);
  const sentinel = useRef<HTMLDivElement>(null);

  const load = useCallback(
    async (reset: boolean) => {
      if (loading) return;
      setLoading(true);
      try {
        const next = await searchMediaLibrary({
          q: q || undefined,
          entityType: filter,
          limit: PAGE,
          offset: reset ? 0 : offset.current,
        });
        offset.current = (reset ? 0 : offset.current) + next.length;
        setDone(next.length < PAGE);
        setItems((prev) => (reset ? next : [...prev, ...next]));
      } catch (e) {
        toast.error(e instanceof Error ? e.message : "Failed to load media");
      } finally {
        setLoading(false);
      }
    },
    [q, filter, loading],
  );

  useEffect(() => {
    offset.current = 0;
    setDone(false);
    void load(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [q, filter]);

  // infinite scroll
  useEffect(() => {
    const el = sentinel.current;
    if (!el) return;
    const io = new IntersectionObserver((entries) => {
      if (entries[0].isIntersecting && !loading && !done) void load(false);
    });
    io.observe(el);
    return () => io.disconnect();
  }, [load, loading, done]);

  async function handleDelete(asset: MediaAsset) {
    try {
      await deleteMediaAsset(asset);
      setItems((prev) => prev.filter((a) => a.id !== asset.id));
      toast.success("Media deleted & storage cleaned");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Delete failed");
    }
  }

  function copyUrl(url: string) {
    navigator.clipboard.writeText(url);
    toast.success("URL copied");
  }

  return (
    <AdminShell
      title="Media library"
      subtitle="Centralized, optimized & audited"
      allow={["admin", "super_admin", "manager", "editor"]}
    >
      <div className="space-y-5">
        <MediaUploader entityType="library" label="Add to library" />

        <div className="space-y-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, alt text or tag…"
              className="w-full rounded-xl border border-white/10 bg-white/[0.02] py-2.5 pl-10 pr-3 text-sm outline-none focus:border-accent/40"
            />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTERS.map((f) => (
              <button
                key={f}
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all",
                  filter === f
                    ? "border-accent/50 bg-accent/15 text-accent"
                    : "border-white/10 text-muted-foreground hover:text-foreground",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        {items.length === 0 && !loading ? (
          <p className="rounded-xl border border-dashed border-white/10 px-4 py-10 text-center text-xs text-muted-foreground">
            No media found. Upload to start your library.
          </p>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
            {items.map((asset) => (
              <div
                key={asset.id}
                className="group relative overflow-hidden rounded-xl border border-white/10 bg-white/[0.02]"
              >
                <img
                  src={asset.thumb_url || asset.url}
                  alt={asset.alt || asset.original_name || "media"}
                  loading="lazy"
                  className="aspect-square w-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">
                  <p className="truncate text-[10px] text-white/90">{asset.original_name || "—"}</p>
                  <p className="text-[9px] text-white/60">
                    {asset.width}×{asset.height} · {formatBytes(asset.size_bytes)}
                  </p>
                  <div className="mt-1 flex gap-1">
                    <button
                      onClick={() => copyUrl(asset.url)}
                      className="grid size-6 place-items-center rounded-md bg-white/10 text-white hover:bg-accent/40"
                      title="Copy URL"
                    >
                      <Copy className="size-3" />
                    </button>
                    <button
                      onClick={() => handleDelete(asset)}
                      className="grid size-6 place-items-center rounded-md bg-white/10 text-white hover:bg-destructive/60"
                      title="Delete"
                    >
                      <Trash2 className="size-3" />
                    </button>
                  </div>
                </div>
                <span className="absolute left-1.5 top-1.5 rounded-full bg-black/50 px-2 py-0.5 text-[8px] font-mono uppercase tracking-widest text-white/80">
                  {asset.entity_type}
                </span>
              </div>
            ))}
          </div>
        )}

        <div ref={sentinel} className="h-8" />
        {loading && (
          <div className="flex justify-center py-2">
            <Loader2 className="size-5 animate-spin text-accent" />
          </div>
        )}
      </div>
    </AdminShell>
  );
}
