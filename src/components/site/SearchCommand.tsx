import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X, TrendingUp, Clock, Tag, ArrowRight, Loader2, CornerDownLeft, ArrowUp, ArrowDown } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useCategories } from "@/lib/use-categories";
import { useRegion } from "@/lib/region";
import { Price } from "@/components/site/Price";

const TRENDING = ["Wireless headphones", "Leather jacket", "Ceramic mug", "Smart watch", "Linen shirt"];
const RECENT_KEY = "fom-recent-searches";

function readRecent(): string[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? "[]");
  } catch {
    return [];
  }
}
function pushRecent(q: string) {
  const cleaned = q.trim();
  if (!cleaned) return;
  const list = [cleaned, ...readRecent().filter((r) => r.toLowerCase() !== cleaned.toLowerCase())].slice(0, 6);
  localStorage.setItem(RECENT_KEY, JSON.stringify(list));
}

type Item =
  | { kind: "category"; slug: string; name: string }
  | { kind: "product"; slug: string; name: string; category: string; image: string; price: number }
  | { kind: "search"; q: string };

export function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(0);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQ("");
      setActive(0);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  const term = q.trim().toLowerCase();

  const productMatches = useMemo(() => {
    if (!term) return [];
    return products
      .filter((p) => `${p.name} ${p.tagline ?? ""} ${p.category} ${p.description ?? ""}`.toLowerCase().includes(term))
      .slice(0, 6);
  }, [products, term]);
  const catMatches = useMemo(() => {
    if (!term) return [];
    return categories.filter((c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term)).slice(0, 4);
  }, [categories, term]);

  const items: Item[] = useMemo(() => {
    if (!term) return [];
    const list: Item[] = [
      ...catMatches.map((c): Item => ({ kind: "category", slug: c.slug, name: c.name })),
      ...productMatches.map((p): Item => ({ kind: "product", slug: p.slug, name: p.name, category: p.category, image: p.image, price: p.price })),
    ];
    if (list.length > 0) list.push({ kind: "search", q });
    return list;
  }, [catMatches, productMatches, term, q]);

  // Reset active index when results change
  useEffect(() => { setActive(0); }, [items.length]);

  function go(query: string) {
    pushRecent(query);
    nav({ to: "/search", search: { q: query } });
    onClose();
  }

  function activate(item: Item) {
    if (item.kind === "category") {
      pushRecent(item.name);
      nav({ to: "/category/$slug", params: { slug: item.slug } });
      onClose();
    } else if (item.kind === "product") {
      pushRecent(q);
      nav({ to: "/products/$slug", params: { slug: item.slug } });
      onClose();
    } else {
      go(item.q);
    }
  }

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") { onClose(); return; }
      if (items.length === 0) return;
      if (e.key === "ArrowDown") {
        e.preventDefault();
        setActive((i) => (i + 1) % items.length);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        setActive((i) => (i - 1 + items.length) % items.length);
      } else if (e.key === "Enter") {
        const it = items[active];
        if (it) { e.preventDefault(); activate(it); }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, items, active, onClose]);

  // Scroll active item into view
  useEffect(() => {
    if (!listRef.current) return;
    const el = listRef.current.querySelector<HTMLElement>(`[data-idx="${active}"]`);
    el?.scrollIntoView({ block: "nearest" });
  }, [active]);

  function clearRecent() {
    localStorage.removeItem(RECENT_KEY);
    setRecent([]);
  }

  if (!open) return null;

  const catStart = 0;
  const prodStart = catMatches.length;

  return (
    <div className="fixed inset-0 z-[80]">
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />
      <div className="absolute left-1/2 top-[8vh] -translate-x-1/2 w-[94%] sm:w-[90%] max-w-2xl bg-background border border-border rounded-2xl shadow-2xl overflow-hidden animate-fade-in flex flex-col max-h-[84vh]">
        <form onSubmit={(e) => { e.preventDefault(); if (items[active]) activate(items[active]); else if (term) go(q); }} className="relative border-b border-border">
          <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search products, categories, brands…"
            className="w-full bg-transparent pl-12 pr-14 py-5 text-base focus:outline-none"
            aria-autocomplete="list"
            aria-controls="search-results"
            aria-activedescendant={items[active] ? `search-item-${active}` : undefined}
          />
          <button type="button" onClick={onClose} aria-label="Close" className="absolute right-3 top-1/2 -translate-y-1/2 size-9 rounded-full grid place-items-center hover:bg-white/5">
            <X className="size-4" />
          </button>
        </form>

        <div ref={listRef} className="overflow-y-auto flex-1" id="search-results" role="listbox">
          {!term ? (
            <div className="p-5 space-y-6">
              {recent.length > 0 && (
                <div>
                  <div className="flex items-center justify-between mb-3">
                    <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground inline-flex items-center gap-2"><Clock className="size-3" /> Recent</h4>
                    <button onClick={clearRecent} className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">Clear</button>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {recent.map((r) => (
                      <button key={r} onClick={() => go(r)} className="px-3 py-1.5 rounded-full border border-border text-xs hover:border-accent/50 hover:text-accent transition-colors">{r}</button>
                    ))}
                  </div>
                </div>
              )}
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3 inline-flex items-center gap-2"><TrendingUp className="size-3" /> Trending</h4>
                <div className="flex flex-wrap gap-2">
                  {TRENDING.map((t) => (
                    <button key={t} onClick={() => go(t)} className="px-3 py-1.5 rounded-full bg-accent/10 text-accent text-xs hover:bg-accent/20 transition-colors">{t}</button>
                  ))}
                </div>
              </div>
              <div>
                <h4 className="text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground mb-3 inline-flex items-center gap-2"><Tag className="size-3" /> Categories</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {categories.slice(0, 6).map((c) => (
                    <Link
                      key={c.slug}
                      to="/category/$slug"
                      params={{ slug: c.slug }}
                      onClick={onClose}
                      className="px-3 py-2.5 rounded-xl border border-border text-sm hover:border-accent/50 hover:text-accent transition-colors truncate"
                    >
                      {c.name}
                    </Link>
                  ))}
                </div>
              </div>
            </div>
          ) : loading ? (
            <div className="py-16 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : items.length === 0 ? (
            <div className="py-16 text-center px-5">
              <p className="text-sm text-muted-foreground">No matches for "{q}".</p>
              <button onClick={() => go(q)} className="mt-4 inline-flex items-center gap-2 text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-0.5">
                Search anyway <ArrowRight className="size-3" />
              </button>
            </div>
          ) : (
            <div className="p-3 space-y-2">
              {catMatches.length > 0 && (
                <div>
                  <p className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Categories</p>
                  {catMatches.map((c, i) => {
                    const idx = catStart + i;
                    const isActive = idx === active;
                    return (
                      <Link
                        key={c.slug}
                        to="/category/$slug"
                        params={{ slug: c.slug }}
                        onClick={onClose}
                        onMouseEnter={() => setActive(idx)}
                        id={`search-item-${idx}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={isActive}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isActive ? "bg-accent/10" : "hover:bg-white/5"}`}
                      >
                        <span className="size-9 rounded-lg bg-accent/10 text-accent grid place-items-center"><Tag className="size-4" /></span>
                        <span className="flex-1 text-sm">{c.name}</span>
                        <ArrowRight className={`size-3.5 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
                      </Link>
                    );
                  })}
                </div>
              )}
              {productMatches.length > 0 && (
                <div>
                  <p className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Products</p>
                  {productMatches.map((p, i) => {
                    const idx = prodStart + i;
                    const isActive = idx === active;
                    return (
                      <Link
                        key={p.slug}
                        to="/products/$slug"
                        params={{ slug: p.slug }}
                        onClick={() => { pushRecent(q); onClose(); }}
                        onMouseEnter={() => setActive(idx)}
                        id={`search-item-${idx}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={isActive}
                        className={`flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors ${isActive ? "bg-accent/10" : "hover:bg-white/5"}`}
                      >
                        <img src={p.image} alt="" className="size-12 rounded-lg object-cover border border-border" />
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium truncate">{p.name}</p>
                          <p className="text-[11px] font-mono text-muted-foreground truncate">{p.category}</p>
                        </div>
                        <Price value={p.price} className="font-mono text-sm text-accent" />
                      </Link>
                    );
                  })}
                  {(() => {
                    const idx = items.length - 1;
                    const isActive = idx === active;
                    return (
                      <button
                        onClick={() => go(q)}
                        onMouseEnter={() => setActive(idx)}
                        id={`search-item-${idx}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={isActive}
                        className={`w-full mt-2 flex items-center justify-center gap-2 px-3 py-3 rounded-xl border text-xs font-mono uppercase tracking-widest text-accent transition-colors ${isActive ? "border-accent bg-accent/5" : "border-border hover:border-accent/50"}`}
                      >
                        See all results for "{q}" <ArrowRight className="size-3" />
                      </button>
                    );
                  })()}
                </div>
              )}
            </div>
          )}
        </div>

        <div className="border-t border-border px-5 py-3 flex items-center justify-between text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
          <span className="inline-flex items-center gap-3">
            <span className="inline-flex items-center gap-1"><ArrowUp className="size-3" /><ArrowDown className="size-3" /> Navigate</span>
            <span className="inline-flex items-center gap-1"><CornerDownLeft className="size-3" /> Select</span>
          </span>
          <span>Esc to close</span>
        </div>
      </div>
    </div>
  );
}
