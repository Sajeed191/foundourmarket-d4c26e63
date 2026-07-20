import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Link, useNavigate } from "@tanstack/react-router";
import { Search, X, TrendingUp, History, Tag, ArrowRight, Loader2, CornerDownLeft, ArrowUp, ArrowDown, Flame, Store, Star } from "lucide-react";
import { useProducts } from "@/lib/use-products";
import { useCategories } from "@/lib/use-categories";
import { iconForCategory } from "@/components/site/CategoryCard";
import { Price } from "@/components/site/Price";
import { useRegion } from "@/lib/region";

const RECENT_KEY = "fom-recent-searches";
const PRODUCT_PAGE = 6; // initial product results; lazy-load more on demand (keeps initial list small)

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
  | { kind: "brand"; name: string }
  | { kind: "product"; slug: string; name: string; category: string; image: string; price: number }
  | { kind: "search"; q: string };

export function SearchCommand({ open, onClose }: { open: boolean; onClose: () => void }) {
  const nav = useNavigate();
  const { products, loading } = useProducts();
  const { categories } = useCategories();
  const { priceOf } = useRegion();

  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(0);
  const [limit, setLimit] = useState(PRODUCT_PAGE);

  useEffect(() => {
    if (open) {
      setRecent(readRecent());
      setQ("");
      setActive(0);
      setLimit(PRODUCT_PAGE);
      requestAnimationFrame(() => inputRef.current?.focus());
      document.body.style.overflow = "hidden";
    }
    return () => { document.body.style.overflow = ""; };
  }, [open]);

  // Defer filtering so typing stays responsive even over the full catalog.
  const deferredQ = useDeferredValue(q);
  const term = deferredQ.trim().toLowerCase();

  // Popular products (empty state) — top sellers, then most viewed.
  const popular = useMemo(
    () =>
      [...products]
        .sort((a, b) => (b.soldCount ?? 0) - (a.soldCount ?? 0) || (b.viewsCount ?? 0) - (a.viewsCount ?? 0))
        .slice(0, 6),
    [products],
  );





  // Product counts per category (matched by slug or name) for the category cards.
  const catCount = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of products) {
      const key = (p.category ?? "").toLowerCase();
      if (!key) continue;
      m.set(key, (m.get(key) ?? 0) + 1);
    }
    return (c: { slug: string; name: string }) =>
      m.get(c.slug.toLowerCase()) ?? m.get(c.name.toLowerCase()) ?? 0;
  }, [products]);

  // Derive brand-like groups from recurring leading words in product names.
  const brandsAll = useMemo(() => {
    const counts = new Map<string, number>();
    for (const p of products) {
      const first = p.name.trim().split(/\s+/)[0];
      if (!first || first.length < 3 || /^\d/.test(first)) continue;
      counts.set(first, (counts.get(first) ?? 0) + 1);
    }
    return [...counts.entries()]
      .filter(([, n]) => n >= 2)
      .sort((a, b) => b[1] - a[1])
      .map(([name]) => name);
  }, [products]);

  // Trending searches — derived from live catalog signals: top categories by
  // product count (clean display names) blended with top brand names. No mocks.
  const trending = useMemo(() => {
    const seen = new Set<string>();
    const out: string[] = [];
    const push = (v?: string | null) => {
      const t = (v ?? "").trim();
      if (t.length < 3) return;
      const key = t.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      out.push(t);
    };
    const topCats = [...categories].sort((a, b) => catCount(b) - catCount(a));
    topCats.slice(0, 3).forEach((c) => push(c.name));
    brandsAll.slice(0, 3).forEach((b) => push(b));
    return out.slice(0, 5);
  }, [categories, catCount, brandsAll]);



  const productMatches = useMemo(() => {
    if (!term) return [];
    return products
      .filter((p) => `${p.name} ${p.brand ?? ""} ${p.tagline ?? ""} ${p.category} ${p.description ?? ""}`.toLowerCase().includes(term))
      .slice(0, 18);
  }, [products, term]);
  const catMatches = useMemo(() => {
    if (!term) return [];
    return categories.filter((c) => c.name.toLowerCase().includes(term) || c.slug.toLowerCase().includes(term)).slice(0, 4);
  }, [categories, term]);
  const brandMatches = useMemo(() => {
    if (!term) return [];
    return brandsAll.filter((b) => b.toLowerCase().includes(term)).slice(0, 3);
  }, [brandsAll, term]);

  // Reset paging when the query changes.
  useEffect(() => { setLimit(PRODUCT_PAGE); }, [term]);

  const shownProducts = productMatches.slice(0, limit);

  const items: Item[] = useMemo(() => {
    if (!term) return [];
    const list: Item[] = [
      ...catMatches.map((c): Item => ({ kind: "category", slug: c.slug, name: c.name })),
      ...brandMatches.map((b): Item => ({ kind: "brand", name: b })),
      ...shownProducts.map((p): Item => ({ kind: "product", slug: p.slug, name: p.name, category: p.category, image: p.image, price: priceOf(p) })),
    ];
    if (list.length > 0) list.push({ kind: "search", q });
    return list;
  }, [catMatches, brandMatches, shownProducts, term, q, priceOf]);

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
    } else if (item.kind === "brand") {
      go(item.name);
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
  const brandStart = catMatches.length;
  const prodStart = catMatches.length + brandMatches.length;
  const hasMore = productMatches.length > shownProducts.length;
  const stale = q.trim() !== term; // deferred filter is catching up

  // Portal to <body> so the overlay escapes the sticky/transformed header
  // (a transformed ancestor becomes the containing block for position:fixed,
  // which previously mispositioned this overlay and leaked the page behind it).
  return createPortal(
    <div className="fixed inset-0 z-[var(--z-modal-overlay)]">
      <div className="absolute inset-0 bg-background/85 backdrop-blur-xl animate-fade-in" onClick={onClose} />
      <div className="absolute inset-0 flex flex-col overflow-hidden bg-background animate-search-rise sm:animate-search-drop sm:inset-x-auto sm:left-1/2 sm:top-[6vh] sm:bottom-auto sm:max-h-[88vh] sm:w-[90%] sm:max-w-2xl sm:-translate-x-1/2 sm:rounded-[24px] sm:border sm:border-accent/20 sm:bg-transparent sm:glass-strong sm:shadow-[0_30px_90px_-20px_oklch(0.74_0.19_49/0.35),var(--shadow-float)]">
        {/* Full-screen immersive surface on mobile; floating command panel on larger screens */}
        {/* Sticky premium search bar */}
        <form
          onSubmit={(e) => { e.preventDefault(); if (items[active]) activate(items[active]); else if (q.trim()) go(q); }}
          className="sticky top-0 z-10 p-3 sm:p-4 border-b border-white/8 bg-background/40 backdrop-blur-xl"
        >
          <div className={`relative flex items-center rounded-full transition-all duration-300 ${q ? "ring-2 ring-accent/50 shadow-[0_0_0_4px_oklch(0.74_0.19_49/0.10),0_0_34px_-6px_oklch(0.74_0.19_49/0.55)]" : "ring-1 ring-white/12"} bg-white/[0.04]`}>
            <Search className="absolute left-5 top-1/2 -translate-y-1/2 size-[22px] text-accent" />
            <input
              ref={inputRef}
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search products, categories, brands…"
              className="w-full h-14 sm:h-[60px] bg-transparent rounded-full pl-14 pr-24 text-base font-medium tracking-[-0.01em] focus:outline-none placeholder:text-muted-foreground/65"
              aria-autocomplete="list"
              aria-controls="search-results"
              aria-activedescendant={items[active] ? `search-item-${active}` : undefined}
            />
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 flex items-center gap-1">
              {q && (
                <button type="button" onClick={() => { setQ(""); inputRef.current?.focus(); }} aria-label="Clear" className="size-8 rounded-full grid place-items-center text-muted-foreground hover:bg-white/8 hover:text-foreground transition-colors">
                  <X className="size-4" />
                </button>
              )}
              <button type="button" onClick={onClose} aria-label="Close" className="size-9 rounded-full grid place-items-center bg-white/[0.04] text-muted-foreground hover:bg-accent/15 hover:text-accent transition-colors">
                <X className="size-[18px]" />
              </button>
            </div>
          </div>
        </form>

        <div ref={listRef} className="overflow-y-auto flex-1 overscroll-contain" id="search-results" role="listbox">
          {!term ? (
            <div className="p-4 sm:p-6 space-y-7">
              {/* Trending */}
              {(loading || trending.length > 0) && (
                <section>
                  <h4 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80"><TrendingUp className="size-4 text-accent" /> Trending Searches</h4>
                  <div className="flex flex-wrap gap-2.5">
                    {loading && trending.length === 0
                      ? Array.from({ length: 5 }).map((_, i) => (
                          <span key={i} className="h-10 w-28 animate-pulse rounded-full bg-white/[0.05]" />
                        ))
                      : trending.map((t) => (
                          <button key={t} onClick={() => go(t)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-accent/25 bg-gradient-to-b from-accent/15 to-accent/5 px-4 text-sm font-medium text-accent transition-all duration-200 hover:border-accent/50 hover:from-accent/25 active:translate-y-px">
                            <Flame className="size-3.5" /> {t}
                          </button>
                        ))}
                  </div>
                </section>
              )}

              {/* Recent */}
              {recent.length > 0 && (
                <section className="border-t border-white/8 pt-6">
                  <div className="mb-3 flex items-center justify-between">
                    <h4 className="inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80"><History className="size-4 text-accent" /> Recent Searches</h4>
                    <button onClick={clearRecent} className="text-[11px] font-medium uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors">Clear History</button>
                  </div>
                  <div className="flex flex-wrap gap-2.5">
                    {recent.map((r) => (
                      <button key={r} onClick={() => go(r)} className="inline-flex h-10 items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.04] px-4 text-sm text-foreground/85 transition-all duration-200 hover:border-accent/40 hover:text-accent active:translate-y-px">
                        <History className="size-3.5 text-muted-foreground" /> {r}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Brands */}
              {brandsAll.length > 0 && (
                <section className="border-t border-white/8 pt-6">
                  <h4 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80"><Store className="size-4 text-accent" /> Popular Brands</h4>
                  <div className="flex flex-wrap gap-2.5">
                    {brandsAll.slice(0, 8).map((b, i) => (
                      <button key={b} onClick={() => go(b)} className={`inline-flex h-10 items-center rounded-full border px-4 text-sm font-medium transition-all duration-200 active:translate-y-px ${i < 3 ? "border-accent/40 text-accent hover:bg-accent/15" : "border-white/12 text-foreground/85 hover:border-accent/40 hover:text-accent"}`}>
                        {b}
                      </button>
                    ))}
                  </div>
                </section>
              )}

              {/* Categories */}
              <section className="border-t border-white/8 pt-6">
                <h4 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80"><Tag className="size-4 text-accent" /> Browse Categories</h4>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {loading && categories.length === 0
                    ? Array.from({ length: 6 }).map((_, i) => (
                        <span key={i} className="h-[68px] animate-pulse rounded-[18px] bg-white/[0.04]" />
                      ))
                    : categories.slice(0, 6).map((c) => {
                        const Icon = iconForCategory(c.slug, c.name);
                        const n = catCount(c);
                        return (
                          <Link
                            key={c.slug}
                            to="/category/$slug"
                            params={{ slug: c.slug }}
                            onClick={onClose}
                            className="group flex items-center gap-3 rounded-[18px] border border-white/10 bg-white/[0.03] p-3 shadow-[0_4px_16px_-8px_rgba(0,0,0,0.5)] transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40 hover:bg-accent/[0.06]"
                          >
                            <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-accent/12 text-accent transition-colors group-hover:bg-accent/20">
                              <Icon className="size-5" />
                            </span>
                            <span className="min-w-0">
                              <span className="block truncate text-sm font-semibold text-foreground/90">{c.name}</span>
                              {n > 0 && <span className="block text-[11px] text-muted-foreground">{n} {n === 1 ? "product" : "products"}</span>}
                            </span>
                          </Link>
                        );
                      })}
                </div>
              </section>

              {/* Popular products — horizontal scroll */}
              {(loading || popular.length > 0) && (
                <section className="border-t border-white/8 pt-6">
                  <h4 className="mb-3 inline-flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.18em] text-foreground/80"><Flame className="size-4 text-accent" /> Popular Products</h4>
                  <div className="-mx-4 sm:-mx-6 flex gap-3 overflow-x-auto px-4 sm:px-6 pb-2 overscroll-x-contain [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                    {loading && popular.length === 0
                      ? Array.from({ length: 6 }).map((_, i) => (
                          <div key={i} className="w-[150px] shrink-0 rounded-[18px] border border-white/10 bg-white/[0.03] p-2.5">
                            <span className="block aspect-square w-full animate-pulse rounded-xl bg-white/[0.05]" />
                            <span className="mt-2 block h-3.5 w-4/5 animate-pulse rounded bg-white/[0.05]" />
                            <span className="mt-1.5 block h-3 w-1/2 animate-pulse rounded bg-white/[0.05]" />
                          </div>
                        ))
                      : popular.map((p) => (
                          <Link
                            key={p.id ?? p.slug}
                            to="/products/$slug"
                            params={{ slug: p.slug }}
                            onClick={onClose}
                            className="group w-[150px] shrink-0 rounded-[18px] border border-white/10 bg-white/[0.03] p-2.5 transition-all duration-200 hover:-translate-y-0.5 hover:border-accent/40"
                          >
                            <img decoding="async" src={p.image} alt="" loading="lazy" className="aspect-square w-full rounded-xl object-cover" />
                            <p className="product-typography product-title-text mt-2 line-clamp-2 text-[13px] font-medium leading-snug">{p.name}</p>
                            <div className="mt-1.5 flex items-center justify-between">
                              <Price value={priceOf(p)} className="font-mono text-sm font-semibold text-accent" />
                              {p.rating > 0 && (
                                <span className="inline-flex items-center gap-0.5 text-[11px] text-muted-foreground">
                                  <Star className="size-3 fill-accent text-accent" /> {p.rating.toFixed(1)}
                                </span>
                              )}
                            </div>
                          </Link>
                        ))}
                  </div>
                </section>
              )}
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
            <div className={`p-3 space-y-2 transition-opacity ${stale ? "opacity-60" : "opacity-100"}`}>
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
              {brandMatches.length > 0 && (
                <div>
                  <p className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Brands</p>
                  {brandMatches.map((b, i) => {
                    const idx = brandStart + i;
                    const isActive = idx === active;
                    return (
                      <button
                        key={b}
                        onClick={() => go(b)}
                        onMouseEnter={() => setActive(idx)}
                        id={`search-item-${idx}`}
                        data-idx={idx}
                        role="option"
                        aria-selected={isActive}
                        className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl transition-colors text-left ${isActive ? "bg-accent/10" : "hover:bg-white/5"}`}
                      >
                        <span className="size-9 rounded-lg bg-accent/10 text-accent grid place-items-center"><Store className="size-4" /></span>
                        <span className="flex-1 text-sm">{b}</span>
                        <ArrowRight className={`size-3.5 ${isActive ? "text-accent" : "text-muted-foreground"}`} />
                      </button>
                    );
                  })}
                </div>
              )}
              {shownProducts.length > 0 && (
                <div>
                  <p className="px-3 py-2 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground">Products</p>
                  {shownProducts.map((p, i) => {
                    const idx = prodStart + i;
                    const isActive = idx === active;
                    return (
                      <Link
                        key={p.id ?? p.slug}
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
                        <img decoding="async" src={p.image} alt="" loading="lazy" className="size-12 rounded-lg object-cover border border-border" />
                        <div className="flex-1 min-w-0">
                          <p className="product-typography product-title-text text-sm font-medium truncate">{p.name}</p>
                          <p className="product-typography text-[11px] font-mono text-muted-foreground truncate">{p.category}</p>
                        </div>
                        <Price value={p.price} className="font-mono text-sm text-accent" />
                      </Link>
                    );
                  })}
                  {hasMore && (
                    <button
                      onClick={() => setLimit((l) => l + PRODUCT_PAGE)}
                      className="w-full mt-1 flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent hover:bg-white/5 transition-colors"
                    >
                      Load more <ArrowDown className="size-3" />
                    </button>
                  )}
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
    </div>,
    document.body,
  );
}
