import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FolderTree, Loader2, RefreshCw } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Cat = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  status: string | null;
  sort_order: number | null;
};

/**
 * Live main + sub category selector.
 * The selected sub-category slug is what gets stored in `products.category`
 * (matching the storefront which filters products by sub-category slug).
 * Selecting a main category with no sub stores the main slug instead.
 */
export function CategorySelector({
  value,
  onChange,
}: {
  value: string;
  onChange: (slug: string) => void;
}) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainId, setMainId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    setError(null);
    const { data, error } = await supabase
      .from("categories")
      .select("id,name,slug,parent_id,status,sort_order")
      .order("sort_order", { ascending: true });
    if (error) {
      setError(error.message);
      setLoading(false);
      return;
    }
    setCats((data ?? []) as Cat[]);
    setLoading(false);
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const parents = useMemo(
    () => cats.filter((c) => !c.parent_id),
    [cats],
  );

  // Resolve the current main category from the stored value (which may be a
  // sub-category slug or a main-category slug).
  useEffect(() => {
    if (!cats.length) return;
    if (mainId !== null) return;
    const current = cats.find((c) => c.slug === value);
    if (!current) return;
    setMainId(current.parent_id ?? current.id);
  }, [cats, value, mainId]);

  const subs = useMemo(
    () => cats.filter((c) => c.parent_id && c.parent_id === mainId),
    [cats, mainId],
  );

  const isSubSelected = subs.some((s) => s.slug === value);
  const mainSlugSelected = parents.find((p) => p.id === mainId)?.slug === value;

  function handleMain(id: string) {
    setMainId(id);
    const parent = parents.find((p) => p.id === id);
    // Default the stored category to the main slug until a sub is chosen.
    if (parent) onChange(parent.slug);
  }

  if (loading) {
    return (
      <div className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-3 py-3 text-xs text-muted-foreground">
        <Loader2 className="size-4 animate-spin" /> Loading live categories…
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-2">
        <p className="rounded-lg border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          Couldn't load categories: {error}
        </p>
        <button type="button" onClick={load}
          className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-xs text-muted-foreground hover:text-foreground">
          <RefreshCw className="size-3.5" /> Retry
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          <FolderTree className="size-3.5 text-accent" /> Live Categories
        </span>
        <button type="button" onClick={load} aria-label="Refresh categories"
          className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] text-muted-foreground transition-all hover:text-foreground active:scale-95">
          <RefreshCw className="size-3" /> Refresh
        </button>
      </div>

      {/* Main category */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Main Category</label>
        <div className="relative">
          <select
            value={mainId ?? ""}
            onChange={(e) => handleMain(e.target.value)}
            className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 pr-9 text-sm text-foreground focus:border-accent/40 focus:outline-none"
          >
            <option value="" disabled>Select a main category…</option>
            {parents.map((p) => (
              <option key={p.id} value={p.id} className="bg-background">{p.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
      </div>

      {/* Sub category */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Sub Category</label>
        <div className="relative">
          <select
            value={isSubSelected ? value : ""}
            disabled={!mainId}
            onChange={(e) => onChange(e.target.value)}
            className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 pr-9 text-sm text-foreground focus:border-accent/40 focus:outline-none disabled:opacity-50"
          >
            <option value="">
              {!mainId ? "Select a main category first" : subs.length ? "Select a sub category…" : "No sub categories"}
            </option>
            {subs.map((s) => (
              <option key={s.id} value={s.slug} className="bg-background">{s.name}</option>
            ))}
          </select>
          <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        </div>
        {mainSlugSelected && subs.length > 0 && (
          <p className="mt-1.5 text-[10px] text-amber-400">
            Using the main category. Pick a sub category for more precise placement.
          </p>
        )}
      </div>

      {/* Resolved value */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Saved as</span>
        <p className="mt-0.5 truncate font-mono text-xs text-foreground">{value || "—"}</p>
      </div>
    </div>
  );
}
