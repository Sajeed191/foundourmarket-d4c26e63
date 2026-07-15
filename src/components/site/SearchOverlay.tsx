import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { Search, X, ArrowRight, Sparkles, Package, Tag, LayoutGrid } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useCategories } from "@/lib/use-categories";
import { useRegion } from "@/lib/region";
import type { Product } from "@/lib/products";
import { parseAiQuery, toSearchParams } from "@/lib/ai-search";

type Props = {
  open: boolean;
  onClose: () => void;
  /** Query is owned by the parent so input state survives close→reopen (300ms cache). */
  query: string;
  onQueryChange: (q: string) => void;
};

const EMPTY_SUGGESTIONS = ["wireless headphones", "smart watch", "linen shirt", "running shoes", "coffee maker"];

/**
 * Ultra-premium search destination.
 *
 * A full dedicated surface that slides up above the app when the search field is
 * tapped — not a dropdown. Dark matte, warm amber glow, NO backdrop-filter
 * (solid dim overlay for Android stability). Only the surface gets a GPU layer;
 * children animate with transform/opacity only. Three intent states: empty,
 * typing (grouped results), and refinement (result count + smart filters).
 */
export function SearchOverlay({ open, onClose, query, onQueryChange }: Props) {
  const nav = useNavigate();
  const { products } = useProducts();
  const { categories } = useCategories();
  const { formatProduct } = useRegion();
  const inputRef = useRef<HTMLInputElement>(null);

  // Keep the surface mounted through the exit animation.
  const [render, setRender] = useState(open);
  const [closing, setClosing] = useState(false);
  useEffect(() => {
    if (open) {
      setRender(true);
      setClosing(false);
    } else if (render) {
      setClosing(true);
      const t = setTimeout(() => setRender(false), 200);
      return () => clearTimeout(t);
    }
  }, [open, render]);

  // Lock body scroll + focus input on open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    // Single source of truth: while search is open, hide the top nav entirely.
    document.documentElement.setAttribute("data-search-open", "true");
    const t = setTimeout(() => inputRef.current?.focus(), 60);
    return () => {
      document.body.style.overflow = prev;
      document.documentElement.removeAttribute("data-search-open");
      clearTimeout(t);
    };
  }, [open]);

  // Escape to close.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  // Debounce for live matches.
  const [debounced, setDebounced] = useState(query.trim());
  useEffect(() => {
    const t = setTimeout(() => setDebounced(query.trim()), 200);
    return () => clearTimeout(t);
  }, [query]);

  const pending = query.trim() !== "" && query.trim() !== debounced;

  const { productMatches, brandMatches, categoryMatches } = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return { productMatches: [] as Product[], brandMatches: [] as string[], categoryMatches: [] as { slug: string; name: string }[] };
    const terms = q.split(/\s+/).filter(Boolean);
    const scored = products
      .filter((p) => !p.hideFromSearch && p.inStock !== false)
      .map((p) => {
        const name = p.name.toLowerCase();
        const hay = `${name} ${p.brand ?? ""} ${p.category} ${p.tagline ?? ""}`.toLowerCase();
        let score = 0;
        for (const t of terms) {
          if (!hay.includes(t)) return { p, score: -1 };
          if (name.startsWith(t)) score += 4;
          else if (name.includes(t)) score += 3;
          else score += 1;
        }
        return { p, score };
      })
      .filter((x) => x.score >= 0)
      .sort((a, b) => b.score - a.score);

    const brands = Array.from(
      new Set(
        scored
          .map((x) => x.p.brand)
          .filter((b): b is string => !!b && b.toLowerCase().includes(terms[0])),
      ),
    ).slice(0, 4);

    const cats = categories
      .filter((c) => !c.parent_id && terms.some((t) => c.name.toLowerCase().includes(t)))
      .slice(0, 4)
      .map((c) => ({ slug: c.slug, name: c.name }));

    return {
      productMatches: scored.slice(0, 8).map((x) => x.p),
      brandMatches: brands,
      categoryMatches: cats,
    };
  }, [debounced, products, categories]);

  // Total pool count for the refinement headline ("We found N+ products").
  const totalMatchCount = useMemo(() => {
    const q = debounced.toLowerCase();
    if (!q) return 0;
    const terms = q.split(/\s+/).filter(Boolean);
    return products.filter((p) => {
      if (p.hideFromSearch || p.inStock === false) return false;
      const hay = `${p.name} ${p.brand ?? ""} ${p.category} ${p.tagline ?? ""}`.toLowerCase();
      return terms.every((t) => hay.includes(t));
    }).length;
  }, [debounced, products]);

  const quickCategories = useMemo(
    () => categories.filter((c) => !c.parent_id).slice(0, 10).map((c) => ({ slug: c.slug, name: c.name })),
    [categories],
  );

  const smartFilters = [
    { label: "Under ₹999", search: { max: 999 } as Record<string, unknown> },
    { label: "Best Rated", search: { sort: "rating" } as Record<string, unknown> },
    { label: "Fast Delivery", search: { sort: "popular" } as Record<string, unknown> },
    { label: "In Stock", search: { stock: "in" } as Record<string, unknown> },
  ];

  // AI Marketplace Search — Track B Phase 1. Parses the current query into
  // the frozen `/search` filter contract; presentation-only, no scoring.
  const aiContext = useMemo(() => {
    const brands = Array.from(
      new Set(products.map((p) => p.brand).filter((b): b is string => !!b)),
    );
    const cats = categories
      .filter((c) => !c.parent_id)
      .map((c) => ({ slug: c.slug, name: c.name }));
    return { brands, categories: cats };
  }, [products, categories]);

  const aiIntent = useMemo(() => parseAiQuery(debounced, aiContext), [debounced, aiContext]);

  if (!render) return null;

  const submit = (q: string) => {
    const term = q.trim();
    onClose();
    if (!term) {
      nav({ to: "/search", search: { q: "" } });
      return;
    }
    // Re-parse on the raw submit value so a fast "Enter" before debounce still routes correctly.
    const parsed = parseAiQuery(term, aiContext);
    if (parsed.hasIntent) {
      nav({ to: "/search", search: toSearchParams(parsed.query || term, parsed.filters) });
    } else {
      nav({ to: "/search", search: { q: term } });
    }
  };

  const showEmpty = debounced === "" && !pending;
  const showResults = !pending && debounced !== "";
  const hasAnyResult = productMatches.length > 0 || brandMatches.length > 0 || categoryMatches.length > 0;

  return createPortal(
    <div className="fixed inset-0 z-[1000]" role="dialog" aria-modal="true" aria-label="Search products">
      {/* Solid dim overlay — no backdrop-filter (Android-safe) */}
      <button
        type="button"
        aria-label="Close search"
        onClick={onClose}
        className={`absolute inset-0 ${closing ? "opacity-0 transition-opacity duration-200" : "animate-search-dim-in"}`}
        style={{ background: "oklch(0.06 0.006 60 / 0.92)" }}
      />

      {/* Search surface — the only GPU-promoted layer */}
      <div
        className={`absolute inset-0 flex flex-col ${closing ? "animate-search-surface-out" : "animate-search-surface-in"}`}
        style={{ willChange: "transform, opacity", background: "linear-gradient(180deg, oklch(0.09 0.006 60), oklch(0.07 0.006 60))" }}
      >
        {/* warm ambient glow (opacity only) */}
        <div aria-hidden className="pointer-events-none absolute inset-x-0 top-0 h-56 opacity-60" style={{ background: "radial-gradient(ellipse at 50% 0%, oklch(0.74 0.19 49 / 0.16), transparent 65%)" }} />

        {/* 1 · Floating pinned search header */}
        <div className="relative z-10 px-3 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3" style={{ paddingTop: "max(0.9rem, env(safe-area-inset-top))" }}>
          <div className="mx-auto flex max-w-2xl items-center gap-2">
            <form
              className="flex-1"
              onSubmit={(e) => {
                e.preventDefault();
                submit(query);
              }}
            >
              <div
                className="relative rounded-full transition-shadow duration-300"
                style={{
                  background: "oklch(0.16 0.008 60)",
                  boxShadow:
                    "inset 0 0 0 1px oklch(0.74 0.19 49 / 0.35), 0 0 0 4px oklch(0.74 0.19 49 / 0.08), 0 14px 34px -16px oklch(0 0 0 / 0.8)",
                }}
              >
                <span className="absolute left-2 top-1/2 -translate-y-1/2 grid size-10 place-items-center rounded-full bg-accent/15 text-accent animate-search-pulse">
                  <Search className="size-[19px]" />
                </span>
                <input
                  ref={inputRef}
                  type="text"
                  value={query}
                  onChange={(e) => onQueryChange(e.target.value)}
                  placeholder="Search products, brands, categories…"
                  aria-label="Search products"
                  className="w-full h-13 min-h-[3.25rem] bg-transparent rounded-full pl-14 pr-[92px] text-[16px] font-medium tracking-[-0.01em] focus:outline-none placeholder:text-muted-foreground/60"
                />
                <button
                  type="submit"
                  className="absolute right-1.5 top-1/2 -translate-y-1/2 inline-flex items-center gap-1.5 rounded-full bg-accent px-4 h-10 text-[13px] font-semibold text-accent-foreground transition-transform duration-200 active:scale-95"
                  style={{ transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
                >
                  {query.trim() ? "Search" : (<><Sparkles className="size-3.5" /> Ask AI</>)}
                </button>
              </div>
            </form>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close"
              className="grid size-11 shrink-0 place-items-center rounded-full bg-white/[0.05] text-muted-foreground transition-colors duration-200 hover:text-foreground"
            >
              <X className="size-5" />
            </button>
          </div>
        </div>

        {/* Scrollable body */}
        <div className="relative z-0 flex-1 overflow-y-auto overscroll-contain [-webkit-overflow-scrolling:touch] px-3 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          <div className="mx-auto max-w-2xl">
            {/* A · Empty state */}
            {showEmpty && (
              <div className="pt-2">
                <p className="px-1 pb-3 text-[13px] font-medium text-muted-foreground/70">Try searching for</p>
                <div className="flex flex-wrap gap-2">
                  {EMPTY_SUGGESTIONS.map((s, i) => (
                    <button
                      key={s}
                      type="button"
                      onClick={() => {
                        onQueryChange(s);
                        setDebounced(s);
                      }}
                      className="animate-search-chip-in rounded-full bg-white/[0.05] px-4 py-2.5 text-[14px] font-medium text-foreground/85 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                      style={{ animationDelay: `${i * 60}ms`, transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" } as React.CSSProperties}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Loading */}
            {pending && (
              <ul className="flex flex-col gap-1 pt-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <li key={i} className="flex items-center gap-3 px-2 py-2.5">
                    <div className="size-12 shrink-0 rounded-xl bg-white/[0.05]" />
                    <div className="flex-1 space-y-1.5">
                      <div className="h-3 w-3/5 rounded bg-white/[0.05]" />
                      <div className="h-2.5 w-2/5 rounded bg-white/[0.035]" />
                    </div>
                  </li>
                ))}
              </ul>
            )}

            {/* C · Intent refinement — result count + smart filters */}
            {showResults && totalMatchCount > 0 && (
              <div className="pt-3 pb-1">
                <p className="px-1 text-[14px] font-semibold text-foreground/90">
                  We found {totalMatchCount >= 240 ? "240+" : totalMatchCount} product{totalMatchCount === 1 ? "" : "s"} for{" "}
                  <span className="text-accent">“{debounced}”</span>
                </p>
                <div className="mt-2.5 flex flex-wrap gap-2">
                  {smartFilters.map((f, i) => (
                    <button
                      key={f.label}
                      type="button"
                      style={{ animationDelay: `${i * 55}ms` }}
                      onClick={() => {
                        onClose();
                        nav({ to: "/search", search: { q: debounced, ...f.search } });
                      }}
                      className="animate-search-chip-in rounded-full border border-accent/25 bg-accent/[0.08] px-3.5 py-2 text-[13px] font-medium text-accent transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                    >
                      {f.label}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* B · Typing state — grouped results */}
            {showResults && !hasAnyResult && (
              <div className="px-3 py-12 text-center">
                <p className="text-[15px] text-foreground/80">No matches for “{debounced}”</p>
                <p className="mt-1 text-[13px] text-muted-foreground/60">Try a different keyword or check the spelling.</p>
              </div>
            )}

            {showResults && categoryMatches.length > 0 && (
              <Group icon={LayoutGrid} label="Categories">
                <div className="flex flex-wrap gap-2 px-1">
                  {categoryMatches.map((c) => (
                    <button
                      key={c.slug}
                      type="button"
                      onClick={() => {
                        onClose();
                        nav({ to: "/category/$slug", params: { slug: c.slug } });
                      }}
                      className="rounded-full bg-white/[0.05] px-3.5 py-2 text-[13px] font-medium text-foreground/85 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </Group>
            )}

            {showResults && brandMatches.length > 0 && (
              <Group icon={Tag} label="Brands">
                <div className="flex flex-wrap gap-2 px-1">
                  {brandMatches.map((b) => (
                    <button
                      key={b}
                      type="button"
                      onClick={() => submit(b)}
                      className="rounded-full bg-white/[0.05] px-3.5 py-2 text-[13px] font-medium text-foreground/85 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                    >
                      {b}
                    </button>
                  ))}
                </div>
              </Group>
            )}

            {showResults && productMatches.length > 0 && (
              <Group icon={Package} label="Products">
                <ul className="flex flex-col">
                  {productMatches.map((p) => (
                    <li key={p.slug}>
                      <button
                        type="button"
                        onClick={() => {
                          onClose();
                          nav({ to: "/products/$slug", params: { slug: p.slug } });
                        }}
                        className="flex w-full items-center gap-3 rounded-2xl px-2 py-2.5 text-left transition-colors duration-200 hover:bg-white/[0.04]"
                      >
                        <span className="size-12 shrink-0 overflow-hidden rounded-xl bg-white/[0.05]">
                          <img src={p.image} alt="" loading="lazy" decoding="async" className="h-full w-full object-cover" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[15px] font-medium text-foreground/90">{p.name}</span>
                          <span className="block truncate text-[12px] text-muted-foreground/60">{p.category}</span>
                        </span>
                        <span className="shrink-0 text-[14px] font-semibold text-foreground/85">{formatProduct(p)}</span>
                        <ArrowRight className="size-4 shrink-0 text-muted-foreground/40" />
                      </button>
                    </li>
                  ))}
                </ul>
              </Group>
            )}

            {/* Category quick layer — always available below */}
            {(showEmpty || (showResults && !hasAnyResult)) && quickCategories.length > 0 && (
              <div className="pt-6">
                <p className="px-1 pb-3 text-[13px] font-medium text-muted-foreground/70">Browse categories</p>
                <div className="flex flex-wrap gap-2">
                  {quickCategories.map((c, i) => (
                    <button
                      key={c.slug}
                      type="button"
                      style={{ animationDelay: `${i * 40}ms` }}
                      onClick={() => {
                        onClose();
                        nav({ to: "/category/$slug", params: { slug: c.slug } });
                      }}
                      className="animate-search-chip-in rounded-2xl border border-white/[0.06] bg-white/[0.03] px-4 py-2.5 text-[13px] font-medium text-foreground/85 transition-transform duration-200 hover:scale-[1.03] active:scale-95"
                    >
                      {c.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Group({ icon: Icon, label, children }: { icon: typeof Package; label: string; children: React.ReactNode }) {
  return (
    <div className="pt-4">
      <p className="mb-1.5 flex items-center gap-1.5 px-1 text-[11px] font-mono uppercase tracking-[0.16em] text-muted-foreground/60">
        <Icon className="size-3.5 text-accent" />
        {label}
      </p>
      {children}
    </div>
  );
}
