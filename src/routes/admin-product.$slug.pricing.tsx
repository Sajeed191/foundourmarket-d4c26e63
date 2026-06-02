import { createFileRoute } from "@tanstack/react-router";
import { IndianRupee } from "lucide-react";
import { SectionEditor, Field, numOrNull } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/pricing")({ component: PricingPage });

const COLS = ["price", "cost", "discount", "price_inr", "compare_price_inr", "price_usd", "compare_price_usd", "cost_price_inr", "cost_price_usd"];
const s = (v: any) => (v != null ? String(v) : "");

function PricingPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="pricing" title="Pricing" icon={<IndianRupee className="size-4" />} cols={COLS}
      toForm={(r) => ({
        price: s(r.price ?? 0), cost: s(r.cost ?? 0), discount: s(r.discount),
        price_inr: s(r.price_inr), compare_price_inr: s(r.compare_price_inr),
        price_usd: s(r.price_usd), compare_price_usd: s(r.compare_price_usd),
        cost_price_inr: s(r.cost_price_inr), cost_price_usd: s(r.cost_price_usd),
      })}
      toPatch={(f) => ({
        price: Number(f.price) || 0, cost: Number(f.cost) || 0, discount: numOrNull(f.discount),
        price_inr: numOrNull(f.price_inr), compare_price_inr: numOrNull(f.compare_price_inr),
        price_usd: numOrNull(f.price_usd), compare_price_usd: numOrNull(f.compare_price_usd),
        cost_price_inr: numOrNull(f.cost_price_inr), cost_price_usd: numOrNull(f.cost_price_usd),
      })}
    >
      {(f, set) => (
        <div className="space-y-4">
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2">India (INR)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Price" type="number" value={f.price_inr} onChange={(v) => set({ price_inr: v })} />
              <Field label="Compare-at" type="number" value={f.compare_price_inr} onChange={(v) => set({ compare_price_inr: v })} />
              <Field label="Cost" type="number" value={f.cost_price_inr} onChange={(v) => set({ cost_price_inr: v })} />
            </div>
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-2">International (USD)</p>
            <div className="grid grid-cols-3 gap-3">
              <Field label="Price" type="number" value={f.price_usd} onChange={(v) => set({ price_usd: v })} />
              <Field label="Compare-at" type="number" value={f.compare_price_usd} onChange={(v) => set({ compare_price_usd: v })} />
              <Field label="Cost" type="number" value={f.cost_price_usd} onChange={(v) => set({ cost_price_usd: v })} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Base price (legacy)" type="number" value={f.price} onChange={(v) => set({ price: v })} />
            <Field label="Discount %" type="number" value={f.discount} onChange={(v) => set({ discount: v })} />
          </div>
        </div>
      )}
    </SectionEditor>
  );
}
