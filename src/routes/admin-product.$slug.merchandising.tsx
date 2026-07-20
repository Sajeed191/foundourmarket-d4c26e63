import { createFileRoute } from "@tanstack/react-router";
import { Sparkles } from "lucide-react";
import { toast } from "sonner";
import { SectionEditor, Field, Select, Toggle, numOrNull } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/merchandising")({ component: MerchPage });

const COLS = ["featured", "trending", "bestseller", "new_arrival", "flash_deal", "staff_pick", "recommended", "homepage_hero", "gift_idea", "premium", "fast_selling", "editors_choice", "priority_score", "homepage_section", "is_category_banner", "hide_from_recommendations"];

const FLAGS: [string, string][] = [
  ["featured", "Featured"], ["trending", "Trending"], ["bestseller", "Best Seller"], ["new_arrival", "New Arrival"],
  ["premium", "Premium"], ["fast_selling", "Fast Selling"], ["editors_choice", "Editor's Choice"], ["flash_deal", "Flash Deal"],
  ["staff_pick", "Staff Pick"], ["recommended", "Recommended"], ["homepage_hero", "Homepage Hero"], ["gift_idea", "Gift Idea"],
];

/**
 * Single-badge policy — only ONE promotional flag can be active on a product
 * at a time. Enabling a new one auto-swaps out any other. Non-promotional
 * flags (staff_pick, gift_idea, premium, etc.) are unaffected.
 */
const PROMO_FLAGS: { key: string; label: string }[] = [
  { key: "flash_deal", label: "Flash Deal" },
  { key: "trending", label: "Trending" },
  { key: "bestseller", label: "Best Seller" },
  { key: "new_arrival", label: "New Arrival" },
  { key: "featured", label: "Featured" },
];
const PROMO_KEYS = new Set(PROMO_FLAGS.map((p) => p.key));

const SECTION_OPTS = ["none", "featured", "trending", "new_arrivals", "best_sellers", "deals"];

function MerchPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="merchandising" title="Merchandising" icon={<Sparkles className="size-4" />} cols={COLS}
      toForm={(r) => {
        const o: Record<string, any> = {
          priority_score: r.priority_score != null ? String(r.priority_score) : "",
          homepage_section: r.homepage_section ?? "none",
          is_category_banner: r.is_category_banner ?? false,
          hide_from_recommendations: r.hide_from_recommendations ?? false,
        };
        for (const [k] of FLAGS) o[k] = r[k] ?? false;
        return o;
      }}
      toPatch={(f) => {
        const p: Record<string, unknown> = {
          priority_score: numOrNull(f.priority_score),
          homepage_section: f.homepage_section === "none" ? null : f.homepage_section,
          is_category_banner: f.is_category_banner,
          hide_from_recommendations: f.hide_from_recommendations,
        };
        for (const [k] of FLAGS) p[k] = f[k];
        return p;
      }}
    >
      {(f, set) => {
        function toggleFlag(k: string, v: boolean) {
          // Non-promo flag → normal toggle.
          if (!PROMO_KEYS.has(k) || !v) {
            set({ [k]: v } as any);
            return;
          }
          // Enabling a promo flag: auto-swap out any other promo flag.
          const patch: Record<string, boolean> = { [k]: true };
          const displaced: string[] = [];
          for (const p of PROMO_FLAGS) {
            if (p.key === k) continue;
            if (f[p.key]) {
              patch[p.key] = false;
              displaced.push(p.label);
            }
          }
          set(patch as any);
          const newLabel = PROMO_FLAGS.find((p) => p.key === k)?.label ?? k;
          if (displaced.length > 0) {
            toast.success("Promotional badge updated", {
              description: `"${displaced.join(", ")}" replaced with "${newLabel}".`,
            });
          }
        }
        return (
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-2">
              {FLAGS.map(([k, label]) => (
                <Toggle key={k} checked={!!f[k]} onChange={(v) => toggleFlag(k, v)} label={label} />
              ))}
            </div>
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              A product may hold only <strong>one</strong> promotional badge at a time (Flash Deal, Trending, Best Seller,
              New Arrival, Featured). Enabling one automatically removes the others.
            </p>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Priority score (0-100)" type="number" value={f.priority_score} onChange={(v) => set({ priority_score: v })} />
              <Select label="Homepage section" value={f.homepage_section} onChange={(v) => set({ homepage_section: v })}
                options={SECTION_OPTS.map((o) => ({ value: o, label: o.replace(/_/g, " ") }))} />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <Toggle checked={f.is_category_banner} onChange={(v) => set({ is_category_banner: v })} label="Category banner" />
              <Toggle checked={f.hide_from_recommendations} onChange={(v) => set({ hide_from_recommendations: v })} label="Hide from recommendations" />
            </div>
          </div>
        );
      }}
    </SectionEditor>
  );
}

