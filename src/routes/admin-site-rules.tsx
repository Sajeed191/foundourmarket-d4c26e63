import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import {
  SlidersHorizontal, Loader2, Save, RotateCcw, Clock, Layers, ArrowRight,
  Plus, X, Zap, Package, Search, Star, Heart, ShoppingCart, RotateCw,
  Truck, MessageSquare, Globe, Gauge, Brain, Rocket,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import {
  useHomepageCollectionRules,
  saveHomepageCollectionRules,
  DEFAULT_HOMEPAGE_RULES,
  ROTATION_HOUR_OPTIONS,
  type HomepageCollectionRules,
  type HomepageCollectionKey,
} from "@/lib/site-rules";
import { triggerGlobalReshuffle } from "@/lib/use-rotation-nonce";

export const Route = createFileRoute("/admin-site-rules")({
  head: () => ({
    meta: [
      { title: "Site Rules — FoundOurMarket™ Admin" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: SiteRulesPage,
});

/** Editable collection labels shown in the limits card. */
const COLLECTION_LABELS: Record<HomepageCollectionKey, { label: string; hint: string }> = {
  flash_deals: { label: "Flash Deals", hint: "Flash Deal + Hot Deal products" },
  trending: { label: "Trending", hint: "Products marked as Trending" },
  best_sellers: { label: "Best Sellers", hint: "Products marked as Best Seller" },
  new_arrivals: { label: "New Arrivals", hint: "Products marked as New" },
  featured: { label: "Featured", hint: "Products marked as Featured" },
};

/** Deep-clone so form edits don't mutate the cached hook state. */
function cloneRules(r: HomepageCollectionRules): HomepageCollectionRules {
  return {
    limits: { ...r.limits },
    rotationHours: r.rotationHours,
    reshuffleTimesIst: [...r.reshuffleTimesIst],
    reshuffleEnabled: r.reshuffleEnabled,
    featuredMode: r.featuredMode,
  };
}

function SiteRulesPage() {
  const live = useHomepageCollectionRules();
  const [draft, setDraft] = useState<HomepageCollectionRules>(() => cloneRules(live));
  const [saving, setSaving] = useState(false);
  const [reshuffling, setReshuffling] = useState(false);

  // Sync when a realtime update arrives (or after save).
  useEffect(() => {
    setDraft(cloneRules(live));
  }, [live]);

  const dirty = JSON.stringify(draft) !== JSON.stringify(live);

  async function onSave() {
    setSaving(true);
    try {
      await saveHomepageCollectionRules(draft);
      toast.success("Site rules saved");
    } catch (e) {
      toast.error("Failed to save", { description: (e as Error).message });
    } finally {
      setSaving(false);
    }
  }

  async function onReshuffle() {
    setReshuffling(true);
    const ok = await triggerGlobalReshuffle();
    setReshuffling(false);
    if (ok) toast.success("Marketplace reshuffled");
    else toast.error("Reshuffle failed — admin permission required");
  }

  function resetToDefaults() {
    setDraft(cloneRules(DEFAULT_HOMEPAGE_RULES));
  }

  return (
    <AdminShell
      title="Site Rules"
      subtitle="Central controller for homepage collections, rotation, and future marketplace rules"
      allow={["admin", "super_admin", "manager"]}
      actions={
        <div className="flex items-center gap-2">
          <button
            onClick={onReshuffle}
            disabled={reshuffling}
            className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs border border-border/60 hover:bg-accent/5 disabled:opacity-50"
          >
            {reshuffling ? <Loader2 className="size-3.5 animate-spin" /> : <RotateCw className="size-3.5" />}
            Reshuffle marketplace
          </button>
          <button
            onClick={onSave}
            disabled={!dirty || saving}
            className="inline-flex items-center gap-1.5 px-4 h-9 rounded-full text-xs font-medium bg-accent text-accent-foreground shadow disabled:opacity-40"
          >
            {saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}
            Save changes
          </button>
        </div>
      }
    >
      <div className="max-w-5xl mx-auto space-y-6">
        {/* Homepage Display Limits */}
        <Card
          icon={<Layers className="size-4" />}
          title="Homepage display limits"
          description="Maximum number of products each homepage rail is allowed to serve. Excess products stay queued and rotate in automatically."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {(Object.keys(COLLECTION_LABELS) as HomepageCollectionKey[]).map((k) => (
              <NumberField
                key={k}
                label={COLLECTION_LABELS[k].label}
                hint={COLLECTION_LABELS[k].hint}
                value={draft.limits[k]}
                min={1}
                max={500}
                onChange={(v) =>
                  setDraft({ ...draft, limits: { ...draft.limits, [k]: v } })
                }
              />
            ))}
          </div>
        </Card>

        {/* Rotation */}
        <Card
          icon={<Clock className="size-4" />}
          title="Product rotation"
          description="How often the fair-rotation window advances. Every product in a collection gets exposure before the queue restarts."
        >
          <div className="flex flex-wrap gap-2">
            {ROTATION_HOUR_OPTIONS.map((h) => {
              const active = draft.rotationHours === h;
              return (
                <button
                  key={h}
                  onClick={() => setDraft({ ...draft, rotationHours: h })}
                  className={`px-4 h-9 rounded-full text-xs border transition-colors ${
                    active
                      ? "border-accent bg-accent/10 text-accent"
                      : "border-border/60 hover:bg-accent/5"
                  }`}
                >
                  {h === 24 ? "Daily" : `${h}h`}
                </button>
              );
            })}
          </div>
        </Card>

        {/* Reshuffle schedule */}
        <Card
          icon={<RotateCcw className="size-4" />}
          title="Daily reshuffle schedule"
          description="IST wall-clock times when the marketplace queues fully reshuffle. Applies on top of the fair-rotation window."
        >
          <label className="flex items-center gap-2 text-xs mb-4">
            <input
              type="checkbox"
              checked={draft.reshuffleEnabled}
              onChange={(e) =>
                setDraft({ ...draft, reshuffleEnabled: e.target.checked })
              }
              className="size-4 accent-accent"
            />
            <span>Enable automatic daily reshuffles</span>
          </label>
          <div className="flex flex-wrap gap-2">
            {draft.reshuffleTimesIst.map((t, i) => (
              <div
                key={`${t}-${i}`}
                className="inline-flex items-center gap-1 pl-3 pr-1 h-9 rounded-full border border-border/60 bg-background/40 text-xs"
              >
                <input
                  type="time"
                  value={t}
                  onChange={(e) => {
                    const next = [...draft.reshuffleTimesIst];
                    next[i] = e.target.value;
                    setDraft({ ...draft, reshuffleTimesIst: next });
                  }}
                  className="bg-transparent outline-none w-[70px]"
                />
                <button
                  onClick={() =>
                    setDraft({
                      ...draft,
                      reshuffleTimesIst: draft.reshuffleTimesIst.filter((_, j) => j !== i),
                    })
                  }
                  className="size-6 grid place-items-center rounded-full hover:bg-destructive/10 text-muted-foreground hover:text-destructive"
                  aria-label="Remove"
                >
                  <X className="size-3" />
                </button>
              </div>
            ))}
            <button
              onClick={() =>
                setDraft({
                  ...draft,
                  reshuffleTimesIst: [...draft.reshuffleTimesIst, "09:00"],
                })
              }
              className="inline-flex items-center gap-1 px-3 h-9 rounded-full text-xs border border-dashed border-border/60 hover:bg-accent/5"
            >
              <Plus className="size-3.5" /> Add time
            </button>
          </div>
        </Card>

        {/* Featured Behavior (Featured Editorial Override) */}
        <Card
          icon={<Star className="size-4" />}
          title="Featured behavior"
          description="Featured is an editorial overlay, not a promotional badge. Choose how it interacts with promotional sections."
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
            <ModeChoice
              active={draft.featuredMode === "editorial_overlay"}
              onClick={() => setDraft({ ...draft, featuredMode: "editorial_overlay" })}
              title="Editorial overlay"
              hint="Default. Featured coexists with one promotional section (Trending, Flash Deals, Best Sellers, or New Arrivals). Products without Featured never appear in more than one promo section."
            />
            <ModeChoice
              active={draft.featuredMode === "multi_section"}
              onClick={() => setDraft({ ...draft, featuredMode: "multi_section" })}
              title="Allow Featured in multiple sections"
              hint="Featured products may appear in every promotional section they are badged for. Non-Featured products still follow the single-promo rule."
            />
          </div>
        </Card>

        {/* Badge rules link */}
        <Card
          icon={<Star className="size-4" />}
          title="Badge rules"
          description="Automatic badge thresholds (Trending, Best Seller, New Arrival, Hot Deal) are managed in the Badge Manager. Manual assignments on a product act as overrides."
        >
          <div className="flex flex-wrap gap-2">
            <LinkChip to="/admin-badges" label="Open Badge Manager" />
            <LinkChip to="/admin-badges-bulk" label="Bulk Badges" />
            <LinkChip to="/admin-badges-analytics" label="Badge Analytics" />
          </div>
        </Card>

        {/* Reset */}
        <div className="flex justify-end">
          <button
            onClick={resetToDefaults}
            className="text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground"
          >
            Reset to defaults
          </button>
        </div>

        {/* Future placeholders */}
        <div className="pt-4">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-display uppercase tracking-widest text-muted-foreground">
              Future rule domains
            </h2>
            <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
              Coming soon
            </span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            <ComingSoonCard icon={<Package className="size-4" />} title="Category Rules" to="/admin-categories" cta="Category Intelligence" />
            <ComingSoonCard icon={<Search className="size-4" />} title="Search Rules" to="/admin-search" cta="Search trends" />
            <ComingSoonCard icon={<Brain className="size-4" />} title="Recommendation Rules" to="/admin-recommendation-rules" cta="Recommendation Rules" />
            <ComingSoonCard icon={<Heart className="size-4" />} title="Wishlist Rules" />
            <ComingSoonCard icon={<ShoppingCart className="size-4" />} title="Cart Rules" />
            <ComingSoonCard icon={<RotateCcw className="size-4" />} title="Returns Rules" to="/admin-returns" cta="Returns" />
            <ComingSoonCard icon={<Truck className="size-4" />} title="Shipping Rules" to="/admin-serviceability" cta="Serviceability" />
            <ComingSoonCard icon={<MessageSquare className="size-4" />} title="Review Rules" />
            <ComingSoonCard icon={<Globe className="size-4" />} title="SEO Rules" to="/admin-seo-intelligence" cta="SEO Intelligence" />
            <ComingSoonCard icon={<Gauge className="size-4" />} title="Performance Rules" to="/admin-performance" cta="Performance" />
            <ComingSoonCard icon={<Zap className="size-4" />} title="AI Rules" to="/admin-ai-operations" cta="AI Operations" />
            <ComingSoonCard icon={<Rocket className="size-4" />} title="Marketplace Rules" />
          </div>
          <p className="mt-4 text-[11px] text-muted-foreground max-w-2xl">
            Additional rule domains will be centralized into this controller in future phases. Configuration for these areas currently lives in the linked admin pages above.
          </p>
        </div>
      </div>
    </AdminShell>
  );
}

function Card({
  icon, title, description, children,
}: {
  icon: React.ReactNode;
  title: string;
  description: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-border/60 bg-card/40 backdrop-blur-sm p-5 sm:p-6">
      <header className="mb-4 flex items-start gap-3">
        <span className="size-8 grid place-items-center rounded-lg bg-accent/10 text-accent shrink-0">
          {icon}
        </span>
        <div className="min-w-0">
          <h3 className="text-sm font-medium">{title}</h3>
          <p className="text-[12px] text-muted-foreground mt-0.5 leading-relaxed">
            {description}
          </p>
        </div>
      </header>
      {children}
    </section>
  );
}

function NumberField({
  label, hint, value, min, max, onChange,
}: {
  label: string;
  hint?: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <label className="flex items-center justify-between gap-3 rounded-xl border border-border/60 bg-background/30 px-3 py-2">
      <div className="min-w-0">
        <div className="text-xs font-medium truncate">{label}</div>
        {hint ? (
          <div className="text-[10px] text-muted-foreground truncate">{hint}</div>
        ) : null}
      </div>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n)) onChange(Math.max(min, Math.min(max, Math.floor(n))));
        }}
        className="w-20 text-right bg-transparent border border-border/60 rounded-md px-2 py-1 text-sm outline-none focus:border-accent"
      />
    </label>
  );
}

function LinkChip({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to}
      className="inline-flex items-center gap-1.5 px-3 h-9 rounded-full text-xs border border-border/60 hover:bg-accent/5 hover:border-accent/40"
    >
      {label}
      <ArrowRight className="size-3.5" />
    </Link>
  );
}

function ComingSoonCard({
  icon, title, to, cta,
}: {
  icon: React.ReactNode;
  title: string;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col justify-between min-h-[110px]">
      <div className="flex items-center gap-2">
        <span className="size-7 grid place-items-center rounded-md bg-muted/40 text-muted-foreground">
          {icon}
        </span>
        <div className="text-xs font-medium">{title}</div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
          Coming soon
        </span>
        {to && cta ? (
          <Link to={to} className="text-[11px] text-accent hover:underline inline-flex items-center gap-1">
            {cta} <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}

function ModeChoice({
  active, onClick, title, hint,
}: {
  active: boolean;
  onClick: () => void;
  title: string;
  hint: string;
}) {
  return (
    <button
      onClick={onClick}
      className={`text-left rounded-xl border px-4 py-3 transition-colors ${
        active
          ? "border-accent bg-accent/10"
          : "border-border/60 bg-background/30 hover:bg-accent/5"
      }`}
    >
      <div className="flex items-center gap-2">
        <span
          className={`inline-block size-2.5 rounded-full ${
            active ? "bg-accent" : "bg-muted-foreground/30"
          }`}
        />
        <span className="text-xs font-medium">{title}</span>
      </div>
      <p className="mt-1.5 text-[11px] text-muted-foreground leading-relaxed">{hint}</p>
    </button>
  );
}
  icon: React.ReactNode;
  title: string;
  to?: string;
  cta?: string;
}) {
  return (
    <div className="rounded-xl border border-border/50 bg-card/30 p-4 flex flex-col justify-between min-h-[110px]">
      <div className="flex items-center gap-2">
        <span className="size-7 grid place-items-center rounded-md bg-muted/40 text-muted-foreground">
          {icon}
        </span>
        <div className="text-xs font-medium">{title}</div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground/70">
          Coming soon
        </span>
        {to && cta ? (
          <Link to={to} className="text-[11px] text-accent hover:underline inline-flex items-center gap-1">
            {cta} <ArrowRight className="size-3" />
          </Link>
        ) : null}
      </div>
    </div>
  );
}
