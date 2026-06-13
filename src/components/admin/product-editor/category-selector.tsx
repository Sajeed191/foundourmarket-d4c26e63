import { useEffect, useMemo, useState } from "react";
import { ChevronDown, FolderTree, Loader2, Plus, RefreshCw, Sparkles, Star, X } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

function slugify(s: string) {
  return s
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

type Cat = {
  id: string;
  name: string;
  slug: string;
  parent_id: string | null;
  status: string | null;
  sort_order: number | null;
};

/**
 * Live multi main + sub category selector.
 * A product can belong to several categories at once. The selected slugs are
 * stored in `products.categories` (text[]). The FIRST slug is treated as the
 * primary category and mirrored into `products.category` for backward
 * compatibility with the storefront.
 */
export function CategorySelector({
  value,
  onChange,
}: {
  /** Selected category slugs. First entry is the primary category. */
  value: string[];
  onChange: (slugs: string[]) => void;
}) {
  const [cats, setCats] = useState<Cat[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mainId, setMainId] = useState<string | null>(null);
  const [subSlug, setSubSlug] = useState<string>("");
  const [newSubName, setNewSubName] = useState("");
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const selected = Array.isArray(value) ? value : [];

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

  const parents = useMemo(() => cats.filter((c) => !c.parent_id), [cats]);
  const subs = useMemo(
    () => cats.filter((c) => c.parent_id && c.parent_id === mainId),
    [cats, mainId],
  );

  const nameForSlug = (slug: string) => cats.find((c) => c.slug === slug)?.name ?? slug;

  function addSlug(slug: string) {
    if (!slug) return;
    if (selected.includes(slug)) return;
    onChange([...selected, slug]);
  }

  function removeSlug(slug: string) {
    onChange(selected.filter((s) => s !== slug));
  }

  function makePrimary(slug: string) {
    onChange([slug, ...selected.filter((s) => s !== slug)]);
  }

  function handleAdd() {
    const parent = parents.find((p) => p.id === mainId);
    // Prefer a chosen sub category; fall back to the main category slug.
    const slug = subSlug || parent?.slug;
    if (slug) {
      addSlug(slug);
      setSubSlug("");
    }
  }

  async function createSub() {
    const parent = parents.find((p) => p.id === mainId);
    if (!parent) return;
    const name = newSubName.trim();
    if (!name) return;
    const slug = slugify(name);
    if (!slug) {
      setCreateError("Enter a valid subcategory name.");
      return;
    }
    // Already exists? Just select it.
    const existing = cats.find((c) => c.slug === slug);
    if (existing) {
      addSlug(existing.slug);
      setNewSubName("");
      return;
    }
    setCreating(true);
    setCreateError(null);
    const maxSort = subs.reduce((m, s) => Math.max(m, s.sort_order ?? 0), 0);
    const { data, error } = await supabase
      .from("categories")
      .insert({
        name,
        slug,
        parent_id: parent.id,
        status: "published",
        homepage_visible: false,
        sort_order: maxSort + 1,
      })
      .select("id,name,slug,parent_id,status,sort_order")
      .single();
    setCreating(false);
    if (error) {
      setCreateError(error.message);
      return;
    }
    setCats((prev) => [...prev, data as Cat]);
    addSlug((data as Cat).slug);
    setNewSubName("");
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

      {/* Selected categories */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">
          Selected Categories ({selected.length})
        </label>
        {selected.length ? (
          <div className="flex flex-wrap gap-2">
            {selected.map((slug, i) => (
              <span key={slug}
                className={`group inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                  i === 0
                    ? "border-accent/40 bg-accent/10 text-foreground"
                    : "border-white/10 bg-white/[0.03] text-muted-foreground"
                }`}>
                {i === 0 ? (
                  <Star className="size-3 fill-accent text-accent" aria-label="Primary" />
                ) : (
                  <button type="button" onClick={() => makePrimary(slug)} title="Make primary"
                    className="opacity-60 transition-opacity hover:opacity-100">
                    <Star className="size-3" />
                  </button>
                )}
                <span className="capitalize">{nameForSlug(slug)}</span>
                <button type="button" onClick={() => removeSlug(slug)} aria-label={`Remove ${slug}`}
                  className="opacity-60 transition-opacity hover:opacity-100">
                  <X className="size-3" />
                </button>
              </span>
            ))}
          </div>
        ) : (
          <p className="rounded-lg border border-amber-400/30 bg-amber-400/10 px-3 py-2 text-[11px] text-amber-400">
            No categories selected yet. Add at least one below.
          </p>
        )}
      </div>

      {/* Main category */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Main Category</label>
        <div className="relative">
          <select
            value={mainId ?? ""}
            onChange={(e) => { setMainId(e.target.value || null); setSubSlug(""); }}
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

      {/* Sub category + add */}
      <div>
        <label className="mb-1.5 block text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Sub Category</label>
        <div className="flex gap-2">
          <div className="relative flex-1">
            <select
              value={subSlug}
              disabled={!mainId}
              onChange={(e) => setSubSlug(e.target.value)}
              className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 pr-9 text-sm text-foreground focus:border-accent/40 focus:outline-none disabled:opacity-50"
            >
              <option value="">
                {!mainId ? "Select a main category first" : subs.length ? "Use main category" : "No sub categories"}
              </option>
              {subs.map((s) => (
                <option key={s.id} value={s.slug} className="bg-background">{s.name}</option>
              ))}
            </select>
            <ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
          </div>
          <button type="button" onClick={handleAdd} disabled={!mainId}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-lg border border-accent/40 bg-accent/10 px-3 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-accent/20 active:scale-95 disabled:opacity-40">
            <Plus className="size-3.5" /> Add
          </button>
        </div>
      </div>

      {/* Resolved value */}
      <div className="rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2">
        <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-muted-foreground">Primary saved as</span>
        <p className="mt-0.5 truncate font-mono text-xs text-foreground">{selected[0] || "—"}</p>
      </div>
    </div>
  );
}
