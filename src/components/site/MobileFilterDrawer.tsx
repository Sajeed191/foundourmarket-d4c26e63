import { useEffect, useMemo, useRef, useState } from "react";
import { X, Search, Check, Star, ChevronDown } from "lucide-react";
import * as SliderPrimitive from "@radix-ui/react-slider";
import { Switch } from "@/components/ui/switch";
import type { Category } from "@/lib/use-categories";
import {
  type Facet,
  type Filters,
  SORT_OPTIONS,
  countActive,
} from "@/lib/search-filters";

type Props = {
  open: boolean;
  onClose: () => void;
  draft: Filters;
  setDraft: (f: Filters) => void;
  sort: string;
  setSort: (s: string) => void;
  allCategories: Category[];
  brands: Facet[];
  colors: Facet[];
  sizes: Facet[];
  priceMax: number;
  snapPoints: number[];
  fmt: (usd: number) => string;
  rate: number;
  symbol: string;
  resultCount: number;
  onReset: () => void;
  onApply: () => void;
};

const RATINGS = [4, 3, 2, 1];
const DISCOUNTS = [10, 20, 30, 40, 50, 70];

const OFFERS: { key: keyof Filters; label: string }[] = [
  { key: "free", label: "Free Shipping" },
  { key: "cod", label: "Cash on Delivery" },
  { key: "sale", label: "On Sale" },
  { key: "newx", label: "New Arrival" },
  { key: "feat", label: "Featured" },
  { key: "flash", label: "Flash Deal" },
  { key: "hot", label: "Hot Deal" },
];

const AVAILABILITY: { key: string; label: string }[] = [
  { key: "in", label: "In Stock" },
  { key: "out", label: "Out of Stock" },
  { key: "pre", label: "Pre-order" },
];

/* ------------------------------------------------------------------ */
/* Accordion primitive                                                 */
/* ------------------------------------------------------------------ */
function Section({
  id,
  title,
  summary,
  openIds,
  toggle,
  children,
}: {
  id: string;
  title: string;
  summary?: string;
  openIds: Set<string>;
  toggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const isOpen = openIds.has(id);
  const panelId = `filter-panel-${id}`;
  return (
    <div className="rounded-2xl bg-white/[0.03] ring-1 ring-white/10 overflow-hidden">
      <button
        type="button"
        aria-expanded={isOpen}
        aria-controls={panelId}
        onClick={() => toggle(id)}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left active:bg-white/[0.03] transition-colors"
      >
        <span className="flex min-w-0 flex-col">
          <span className="text-sm font-semibold text-foreground">{title}</span>
          {summary && <span className="truncate text-[11px] text-accent">{summary}</span>}
        </span>
        <ChevronDown
          className={`size-4 shrink-0 text-muted-foreground transition-transform duration-300 ${isOpen ? "rotate-180 text-accent" : ""}`}
        />
      </button>
      <div
        id={panelId}
        className="grid transition-[grid-template-rows] duration-300 ease-out"
        style={{ gridTemplateRows: isOpen ? "1fr" : "0fr" }}
      >
        <div className="overflow-hidden">
          <div className="px-4 pb-4 pt-1">{children}</div>
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dual price slider                                                   */
/* ------------------------------------------------------------------ */
function PriceSlider({
  max,
  value,
  onChange,
  fmt,
}: {
  max: number;
  value: [number, number];
  onChange: (v: [number, number]) => void;
  fmt: (usd: number) => string;
}) {
  return (
    <div className="pt-8 px-1">
      <SliderPrimitive.Root
        min={0}
        max={max}
        step={10}
        value={value}
        minStepsBetweenThumbs={1}
        onValueChange={(v) => onChange([Math.min(v[0], v[1]), Math.max(v[0], v[1])] as [number, number])}
        className="relative flex w-full touch-none select-none items-center"
      >
        <SliderPrimitive.Track className="relative h-2 w-full grow overflow-hidden rounded-full bg-white/10">
          <SliderPrimitive.Range className="absolute h-full rounded-full bg-gradient-to-r from-[#FFA52E] to-[#FF7A18]" />
        </SliderPrimitive.Track>
        {[0, 1].map((i) => (
          <SliderPrimitive.Thumb
            key={i}
            aria-label={i === 0 ? "Minimum price" : "Maximum price"}
            className="relative block size-5 rounded-full border-2 border-accent bg-background shadow-[0_2px_12px_-2px_var(--accent)] transition-transform active:scale-110 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/40"
          >
            <span className="pointer-events-none absolute -top-8 left-1/2 -translate-x-1/2 whitespace-nowrap rounded-lg bg-accent px-2 py-1 text-[10px] font-bold tabular-nums text-accent-foreground shadow-lg">
              {fmt(value[i])}
              {i === 1 && value[1] >= max ? "+" : ""}
            </span>
          </SliderPrimitive.Thumb>
        ))}
      </SliderPrimitive.Root>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Main drawer                                                         */
/* ------------------------------------------------------------------ */
export function MobileFilterDrawer({
  open,
  onClose,
  draft,
  setDraft,
  sort,
  setSort,
  allCategories,
  brands,
  colors,
  sizes,
  priceMax,
  snapPoints,
  fmt,
  rate,
  symbol,
  resultCount,
  onReset,
  onApply,
}: Props) {
  // Remember expanded sections for the lifetime of the open drawer.
  const [openIds, setOpenIds] = useState<Set<string>>(() => new Set(["category"]));
  const toggle = (id: string) =>
    setOpenIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  const set = (patch: Partial<Filters>) => setDraft({ ...draft, ...patch });

  const activeCount = useMemo(() => countActive(draft), [draft]);

  /* ----- Category tree ----- */
  const [catSearch, setCatSearch] = useState("");
  const parents = useMemo(
    () => allCategories.filter((c) => !c.parent_id),
    [allCategories],
  );
  const subsByParent = useMemo(() => {
    const m = new Map<string, Category[]>();
    for (const c of allCategories) {
      if (c.parent_id) {
        const arr = m.get(c.parent_id) ?? [];
        arr.push(c);
        m.set(c.parent_id, arr);
      }
    }
    return m;
  }, [allCategories]);
  const catQuery = catSearch.trim().toLowerCase();
  const visibleParents = useMemo(() => {
    if (!catQuery) return parents;
    return parents.filter((p) => {
      if (p.name.toLowerCase().includes(catQuery)) return true;
      return (subsByParent.get(p.id) ?? []).some((s) => s.name.toLowerCase().includes(catQuery));
    });
  }, [parents, subsByParent, catQuery]);

  const selectParent = (slug: string) =>
    set({ cat: draft.cat === slug ? undefined : slug, sub: undefined });
  const selectSub = (parentSlug: string, slug: string) =>
    set({ cat: parentSlug, sub: draft.sub === slug ? undefined : slug });

  /* ----- Brand ----- */
  const [brandSearch, setBrandSearch] = useState("");
  const [showAllBrands, setShowAllBrands] = useState(false);
  const selectedBrands = useMemo(
    () => new Set((draft.brand ?? "").split(",").map((b) => b.trim()).filter(Boolean)),
    [draft.brand],
  );
  const brandQuery = brandSearch.trim().toLowerCase();
  const filteredBrands = useMemo(
    () => brands.filter((b) => b.name.toLowerCase().includes(brandQuery)),
    [brands, brandQuery],
  );
  const shownBrands = showAllBrands || brandQuery ? filteredBrands : filteredBrands.slice(0, 8);
  const toggleBrand = (name: string) => {
    const next = new Set(selectedBrands);
    next.has(name) ? next.delete(name) : next.add(name);
    set({ brand: next.size ? [...next].join(",") : undefined });
  };

  /* ----- Colour (variant-aware) ----- */
  const selectedColors = useMemo(
    () => new Set((draft.color ?? "").split(",").map((c) => c.trim()).filter(Boolean)),
    [draft.color],
  );
  const toggleColor = (name: string) => {
    const next = new Set(selectedColors);
    next.has(name) ? next.delete(name) : next.add(name);
    set({ color: next.size ? [...next].join(",") : undefined });
  };

  /* ----- Size (variant-aware) ----- */
  const selectedSizes = useMemo(
    () => new Set((draft.size ?? "").split(",").map((s) => s.trim()).filter(Boolean)),
    [draft.size],
  );
  const toggleSize = (name: string) => {
    const next = new Set(selectedSizes);
    next.has(name) ? next.delete(name) : next.add(name);
    set({ size: next.size ? [...next].join(",") : undefined });
  };



  /* ----- Price manual inputs ----- */
  const priceLo = draft.min ?? 0;
  const priceHi = draft.max ?? priceMax;
  const [minInput, setMinInput] = useState("");
  const [maxInput, setMaxInput] = useState("");
  useEffect(() => {
    setMinInput(draft.min != null ? String(Math.round(draft.min * rate)) : "");
    setMaxInput(draft.max != null ? String(Math.round(draft.max * rate)) : "");
  }, [draft.min, draft.max, rate]);
  const commitMin = () => {
    const v = minInput === "" ? undefined : Math.max(0, Math.round(Number(minInput) / rate));
    set({ min: v && v > 0 ? Math.min(v, priceHi) : undefined });
  };
  const commitMax = () => {
    const v = maxInput === "" ? undefined : Math.round(Number(maxInput) / rate);
    set({ max: v != null && v < priceMax ? Math.max(v, priceLo) : undefined });
  };

  /* ----- Active chips ----- */
  const chips = useMemo(() => {
    const out: { label: string; clear: () => void }[] = [];
    if (draft.sub) {
      const c = allCategories.find((x) => x.slug === draft.sub);
      out.push({ label: c?.name ?? draft.sub, clear: () => set({ sub: undefined }) });
    } else if (draft.cat) {
      const c = allCategories.find((x) => x.slug === draft.cat);
      out.push({ label: c?.name ?? draft.cat, clear: () => set({ cat: undefined }) });
    }
    for (const b of selectedBrands) out.push({ label: b, clear: () => toggleBrand(b) });
    for (const c of selectedColors) out.push({ label: c, clear: () => toggleColor(c) });
    for (const s of selectedSizes) out.push({ label: `Size ${s}`, clear: () => toggleSize(s) });
    if (draft.min != null || draft.max != null)
      out.push({
        label: `${fmt(priceLo)} – ${fmt(priceHi)}${priceHi >= priceMax ? "+" : ""}`,
        clear: () => set({ min: undefined, max: undefined }),
      });
    if (draft.rating != null)
      out.push({ label: `${draft.rating}★ & Up`, clear: () => set({ rating: undefined }) });
    if (draft.stock) {
      const a = AVAILABILITY.find((x) => x.key === draft.stock);
      out.push({ label: a?.label ?? draft.stock, clear: () => set({ stock: undefined }) });
    }
    for (const o of OFFERS)
      if (draft[o.key] === "1")
        out.push({ label: o.label, clear: () => set({ [o.key]: undefined } as Partial<Filters>) });
    if (draft.dmin != null)
      out.push({ label: `${draft.dmin}%+ off`, clear: () => set({ dmin: undefined }) });
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draft, allCategories, selectedBrands, selectedColors, selectedSizes, priceLo, priceHi]);

  // Body scroll-lock while open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const closeRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  if (!open) return null;

  const catSummary = draft.sub
    ? allCategories.find((c) => c.slug === draft.sub)?.name
    : draft.cat
      ? allCategories.find((c) => c.slug === draft.cat)?.name
      : undefined;
  const sortSummary = SORT_OPTIONS.find((s) => s.value === sort)?.label;

  return (
    <div className="fixed inset-0 z-[100001] lg:hidden flex flex-col bg-background animate-fade-in" role="dialog" aria-modal="true" aria-label="Filters">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between gap-2 border-b border-white/10 px-5 pt-[max(0.75rem,env(safe-area-inset-top))] pb-3">
        <div className="min-w-0">
          <h2 className="text-base font-semibold">Filters</h2>
          <p className="text-[11px] text-muted-foreground">{resultCount.toLocaleString()} products</p>
        </div>
        <button
          ref={closeRef}
          onClick={onClose}
          aria-label="Close filters"
          className="grid place-items-center size-9 rounded-full bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10 active:scale-95 transition-all"
        >
          <X className="size-4" />
        </button>
      </div>

      {/* Active chips */}
      {chips.length > 0 && (
        <div className="shrink-0 border-b border-white/10 px-4 py-3">
          <div className="flex gap-2 overflow-x-auto pb-0.5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {chips.map((chip, i) => (
              <button
                key={`${chip.label}-${i}`}
                onClick={chip.clear}
                className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent ring-1 ring-accent/30 pl-3 pr-2 py-1.5 text-xs font-medium active:scale-95 transition-all"
              >
                {chip.label}
                <X className="size-3.5" />
              </button>
            ))}
            <button
              onClick={onReset}
              className="shrink-0 rounded-full px-3 py-1.5 text-xs font-semibold text-muted-foreground hover:text-accent"
            >
              Clear All
            </button>
          </div>
        </div>
      )}

      {/* Scrollable body */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-3 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {/* Category */}
        <Section id="category" title="Category" summary={catSummary} openIds={openIds} toggle={toggle}>
          <div className="relative mb-3">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={catSearch}
              onChange={(e) => setCatSearch(e.target.value)}
              placeholder="Search categories…"
              className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
            />
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {visibleParents.map((p) => {
              const subs = (subsByParent.get(p.id) ?? []).filter(
                (s) => !catQuery || s.name.toLowerCase().includes(catQuery) || p.name.toLowerCase().includes(catQuery),
              );
              const parentActive = draft.cat === p.slug && !draft.sub;
              return (
                <div key={p.id}>
                  <button
                    onClick={() => selectParent(p.slug)}
                    className={`flex w-full items-center gap-2 rounded-lg px-2 py-2 text-sm font-semibold transition-colors ${parentActive ? "text-accent" : "text-foreground"}`}
                  >
                    <span className={`grid size-4 place-items-center rounded-full border ${parentActive ? "border-accent bg-accent text-accent-foreground" : "border-white/25"}`}>
                      {parentActive && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {p.name}
                  </button>
                  {subs.length > 0 && (
                    <div className="ml-4 mt-1 space-y-1 border-l border-white/10 pl-3">
                      {subs.map((s) => {
                        const active = draft.sub === s.slug;
                        return (
                          <button
                            key={s.id}
                            onClick={() => selectSub(p.slug, s.slug)}
                            className={`flex w-full items-center gap-2 rounded-lg px-2 py-1.5 text-sm transition-colors ${active ? "text-accent font-medium" : "text-muted-foreground hover:text-foreground"}`}
                          >
                            <span className={`grid size-4 place-items-center rounded-full border ${active ? "border-accent bg-accent text-accent-foreground" : "border-white/20"}`}>
                              {active && <Check className="size-3" strokeWidth={3} />}
                            </span>
                            {s.name}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
            {visibleParents.length === 0 && (
              <p className="px-2 py-4 text-center text-xs text-muted-foreground">No categories found</p>
            )}
          </div>
        </Section>

        {/* Brand */}
        {brands.length > 0 && (
          <Section
            id="brand"
            title="Brand"
            summary={selectedBrands.size ? `${selectedBrands.size} selected` : undefined}
            openIds={openIds}
            toggle={toggle}
          >
            <div className="relative mb-3">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
              <input
                value={brandSearch}
                onChange={(e) => setBrandSearch(e.target.value)}
                placeholder="Search brands…"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-9 pr-3 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40"
              />
            </div>
            <div className="space-y-1 max-h-64 overflow-y-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {shownBrands.map((b) => {
                const active = selectedBrands.has(b.name);
                return (
                  <button
                    key={b.name}
                    onClick={() => !b.disabled && toggleBrand(b.name)}
                    disabled={b.disabled}
                    aria-disabled={b.disabled}
                    className={`flex w-full items-center gap-2.5 rounded-lg px-2 py-2 text-sm transition-colors ${b.disabled ? "opacity-50 cursor-not-allowed" : "hover:bg-white/[0.04]"}`}
                  >
                    <span className={`grid size-4.5 place-items-center rounded-md border ${active ? "border-accent bg-accent text-accent-foreground" : "border-white/25"}`}>
                      {active && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    <span className={`flex-1 text-left ${active ? "text-accent font-medium" : "text-foreground"}`}>{b.name}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">{b.count}</span>
                  </button>
                );
              })}
              {filteredBrands.length === 0 && (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">No brands found</p>
              )}
            </div>
            {!brandQuery && filteredBrands.length > 8 && (
              <button
                onClick={() => setShowAllBrands((v) => !v)}
                className="mt-2 text-xs font-semibold text-accent"
              >
                {showAllBrands ? "Show less" : `Show ${filteredBrands.length - 8} more`}
              </button>
            )}
          </Section>
        )}

        {/* Colour (variant-aware) — only shown when variants expose colours */}
        {colors.length > 0 && (
          <Section
            id="color"
            title="Colour"
            summary={selectedColors.size ? `${selectedColors.size} selected` : undefined}
            openIds={openIds}
            toggle={toggle}
          >
            <div className="grid grid-cols-4 gap-3 sm:grid-cols-5">
              {colors.map((c) => {
                const active = selectedColors.has(c.name);
                return (
                  <button
                    key={c.name}
                    onClick={() => !c.disabled && toggleColor(c.name)}
                    disabled={c.disabled}
                    aria-pressed={active}
                    aria-disabled={c.disabled}
                    aria-label={`${c.name}${c.disabled ? " (unavailable)" : ` (${c.count})`}`}
                    className={`group flex flex-col items-center gap-1.5 transition-transform ${c.disabled ? "opacity-50 cursor-not-allowed" : "active:scale-95"}`}
                  >
                    <span
                      className={`relative grid size-11 place-items-center rounded-full ring-2 transition-all ${active ? "ring-accent shadow-[0_0_0_3px_var(--accent)/20]" : c.disabled ? "ring-white/10" : "ring-white/20 group-hover:ring-white/40"}`}
                    >
                      <span
                        className="size-8 rounded-full ring-1 ring-black/20"
                        style={{ backgroundColor: c.hex ?? "#888" }}
                        aria-hidden
                      />
                      {active && (
                        <span className="absolute inset-0 grid place-items-center animate-scale-in">
                          <span className="grid size-5 place-items-center rounded-full bg-accent text-accent-foreground shadow">
                            <Check className="size-3" strokeWidth={3} />
                          </span>
                        </span>
                      )}
                      {c.disabled && (
                        <span aria-hidden className="absolute inset-0 grid place-items-center">
                          <span className="h-px w-9 rotate-45 bg-white/40" />
                        </span>
                      )}
                    </span>
                    <span className={`max-w-[4.5rem] truncate text-[11px] font-medium ${active ? "text-accent" : "text-foreground"}`}>{c.name}</span>
                    <span className="-mt-1 tabular-nums text-[10px] text-muted-foreground">{c.count}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}

        {/* Size (variant-aware) — only shown when variants expose sizes */}
        {sizes.length > 0 && (
          <Section
            id="size"
            title="Size"
            summary={selectedSizes.size ? `${selectedSizes.size} selected` : undefined}
            openIds={openIds}
            toggle={toggle}
          >
            <div className="flex flex-wrap gap-2">
              {sizes.map((s) => {
                const active = selectedSizes.has(s.name);
                return (
                  <button
                    key={s.name}
                    onClick={() => !s.disabled && toggleSize(s.name)}
                    disabled={s.disabled}
                    aria-pressed={active}
                    aria-disabled={s.disabled}
                    className={`relative min-w-12 rounded-xl px-3 py-2.5 text-xs font-semibold transition-all ${
                      s.disabled
                        ? "text-muted-foreground/60 bg-white/[0.02] ring-1 ring-white/5 cursor-not-allowed"
                        : active
                          ? "bg-accent/15 text-accent ring-1 ring-accent/40 active:scale-95"
                          : "bg-white/[0.04] text-foreground ring-1 ring-white/10 hover:bg-white/[0.07] active:scale-95"
                    }`}
                  >
                    <span className={s.disabled ? "line-through" : ""}>{s.name}</span>
                    <span className="ml-1 tabular-nums text-[10px] text-muted-foreground">{s.count}</span>
                  </button>
                );
              })}
            </div>
          </Section>
        )}



        {/* Price */}
        <Section
          id="price"
          title="Price"
          summary={draft.min != null || draft.max != null ? `${fmt(priceLo)} – ${fmt(priceHi)}${priceHi >= priceMax ? "+" : ""}` : undefined}
          openIds={openIds}
          toggle={toggle}
        >
          <PriceSlider
            max={priceMax}
            value={[priceLo, priceHi]}
            onChange={([lo, hi]) => set({ min: lo > 0 ? lo : undefined, max: hi < priceMax ? hi : undefined })}
            fmt={fmt}
          />
          <div className="mt-4 flex items-center gap-3">
            <label className="flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Minimum</span>
              <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">{symbol}</span>
                <input
                  inputMode="numeric"
                  value={minInput}
                  onChange={(e) => setMinInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={commitMin}
                  onKeyDown={(e) => e.key === "Enter" && commitMin()}
                  placeholder="0"
                  className="w-full bg-transparent text-sm tabular-nums focus:outline-none"
                />
              </div>
            </label>
            <span className="mt-5 text-muted-foreground">–</span>
            <label className="flex-1">
              <span className="mb-1 block text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">Maximum</span>
              <div className="flex items-center gap-1.5 rounded-xl bg-white/[0.04] border border-white/10 px-3 py-2.5">
                <span className="text-sm text-muted-foreground">{symbol}</span>
                <input
                  inputMode="numeric"
                  value={maxInput}
                  onChange={(e) => setMaxInput(e.target.value.replace(/[^0-9]/g, ""))}
                  onBlur={commitMax}
                  onKeyDown={(e) => e.key === "Enter" && commitMax()}
                  placeholder={`${Math.round(priceMax * rate)}+`}
                  className="w-full bg-transparent text-sm tabular-nums focus:outline-none"
                />
              </div>
            </label>
          </div>
        </Section>

        {/* Rating */}
        <Section
          id="rating"
          title="Rating"
          summary={draft.rating != null ? `${draft.rating}★ & Up` : undefined}
          openIds={openIds}
          toggle={toggle}
        >
          <div className="space-y-2">
            {RATINGS.map((r) => {
              const active = draft.rating === r;
              return (
                <button
                  key={r}
                  onClick={() => set({ rating: active ? undefined : r })}
                  className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 transition-all active:scale-[0.99] ${active ? "bg-accent/15 ring-1 ring-accent/40" : "bg-white/[0.03] ring-1 ring-white/10 hover:bg-white/[0.06]"}`}
                >
                  <span className="flex items-center gap-0.5">
                    {[1, 2, 3, 4, 5].map((i) => (
                      <Star
                        key={i}
                        className={`size-4 ${i <= r ? "fill-amber-400 text-amber-400" : "text-white/20"}`}
                      />
                    ))}
                  </span>
                  <span className={`text-sm font-medium ${active ? "text-accent" : "text-foreground"}`}>& Up</span>
                  {active && <Check className="ml-auto size-4 text-accent" strokeWidth={2.5} />}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Availability */}
        <Section
          id="availability"
          title="Availability"
          summary={draft.stock ? AVAILABILITY.find((a) => a.key === draft.stock)?.label : undefined}
          openIds={openIds}
          toggle={toggle}
        >
          <div className="grid grid-cols-3 gap-2">
            {AVAILABILITY.map((a) => {
              const active = draft.stock === a.key;
              return (
                <button
                  key={a.key}
                  onClick={() => set({ stock: active ? undefined : a.key })}
                  className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition-all active:scale-95 ${active ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/10 hover:text-foreground"}`}
                >
                  {a.label}
                </button>
              );
            })}
          </div>
        </Section>

        {/* Offers */}
        <Section id="offers" title="Offers" openIds={openIds} toggle={toggle}>
          <div className="rounded-xl bg-white/[0.02] ring-1 ring-white/10 divide-y divide-white/5">
            {OFFERS.map((o) => (
              <label key={String(o.key)} className="flex items-center justify-between gap-3 px-3.5 py-3 cursor-pointer">
                <span className="text-sm font-medium text-foreground">{o.label}</span>
                <Switch
                  checked={draft[o.key] === "1"}
                  onCheckedChange={(c) => set({ [o.key]: c ? "1" : undefined } as Partial<Filters>)}
                />
              </label>
            ))}
          </div>
        </Section>

        {/* Discount */}
        <Section
          id="discount"
          title="Discount"
          summary={draft.dmin != null ? `${draft.dmin}%+` : undefined}
          openIds={openIds}
          toggle={toggle}
        >
          <div className="grid grid-cols-3 gap-2">
            {DISCOUNTS.map((d) => {
              const active = draft.dmin === d;
              return (
                <button
                  key={d}
                  onClick={() => set({ dmin: active ? undefined : d })}
                  className={`rounded-xl px-2 py-2.5 text-xs font-semibold transition-all active:scale-95 ${active ? "bg-accent/15 text-accent ring-1 ring-accent/40" : "bg-white/[0.04] text-muted-foreground ring-1 ring-white/10 hover:text-foreground"}`}
                >
                  {d}%+
                </button>
              );
            })}
          </div>
        </Section>

        {/* Sort */}
        <Section id="sort" title="Sort" summary={sortSummary} openIds={openIds} toggle={toggle}>
          <div className="space-y-1.5">
            {SORT_OPTIONS.map((s) => {
              const active = sort === s.value;
              return (
                <button
                  key={s.value}
                  onClick={() => setSort(s.value)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors hover:bg-white/[0.04]"
                >
                  <span className={`grid size-4.5 place-items-center rounded-full border ${active ? "border-accent" : "border-white/25"}`}>
                    {active && <span className="size-2.5 rounded-full bg-accent" />}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className={`block text-sm font-medium ${active ? "text-accent" : "text-foreground"}`}>{s.label}</span>
                    <span className="block truncate text-[11px] text-muted-foreground">{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>
        </Section>
      </div>

      {/* Sticky bottom bar */}
      <div className="shrink-0 border-t border-white/10 px-5 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        {activeCount > 0 && (
          <div className="mb-2 flex items-center justify-between text-[12px]">
            <span className="text-muted-foreground">
              <span className="font-semibold text-foreground">{activeCount}</span> filter{activeCount === 1 ? "" : "s"} applied
            </span>
            <button
              onClick={onReset}
              className="font-semibold text-accent hover:underline active:scale-95 transition-transform"
            >
              Clear All
            </button>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button
            onClick={onReset}
            disabled={activeCount === 0}
            className="rounded-full px-5 py-3.5 text-sm font-medium bg-white/[0.06] ring-1 ring-white/10 hover:bg-white/10 active:scale-95 transition-all disabled:opacity-40"
          >
            Reset{activeCount > 0 ? ` · ${activeCount}` : ""}
          </button>
          <button
            onClick={onApply}
            className="flex-1 rounded-full bg-accent text-accent-foreground py-3.5 text-sm font-semibold shadow-[0_8px_24px_-8px_var(--accent)] hover:brightness-110 active:scale-[0.98] transition-all"
          >
            Show {resultCount.toLocaleString()} Product{resultCount === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );
}
