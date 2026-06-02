import { createFileRoute } from "@tanstack/react-router";
import { Truck } from "lucide-react";
import { SectionEditor, Field, Toggle, numOrNull } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/shipping")({ component: ShippingPage });

const COLS = ["shipping_fee_inr", "shipping_fee_usd", "weight", "length", "width", "height", "shipping_class", "cod_enabled", "pickup_supported", "international_shipping", "fragile"];
const s = (v: any) => (v != null ? String(v) : "");

function ShippingPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="shipping" title="Shipping" icon={<Truck className="size-4" />} cols={COLS}
      toForm={(r) => ({
        shipping_fee_inr: s(r.shipping_fee_inr ?? 0), shipping_fee_usd: s(r.shipping_fee_usd ?? 0),
        weight: s(r.weight), length: s(r.length), width: s(r.width), height: s(r.height),
        shipping_class: r.shipping_class ?? "",
        cod_enabled: r.cod_enabled ?? true, pickup_supported: r.pickup_supported ?? false,
        international_shipping: r.international_shipping ?? true, fragile: r.fragile ?? false,
      })}
      toPatch={(f) => ({
        shipping_fee_inr: Number(f.shipping_fee_inr) || 0, shipping_fee_usd: Number(f.shipping_fee_usd) || 0,
        weight: numOrNull(f.weight), length: numOrNull(f.length), width: numOrNull(f.width), height: numOrNull(f.height),
        shipping_class: f.shipping_class.trim() || null,
        cod_enabled: f.cod_enabled, pickup_supported: f.pickup_supported,
        international_shipping: f.international_shipping, fragile: f.fragile,
      })}
    >
      {(f, set) => (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Field label="Shipping fee (INR)" type="number" value={f.shipping_fee_inr} onChange={(v) => set({ shipping_fee_inr: v })} />
            <Field label="Shipping fee (USD)" type="number" value={f.shipping_fee_usd} onChange={(v) => set({ shipping_fee_usd: v })} />
          </div>
          <div className="grid grid-cols-4 gap-3">
            <Field label="Weight" type="number" value={f.weight} onChange={(v) => set({ weight: v })} />
            <Field label="Length" type="number" value={f.length} onChange={(v) => set({ length: v })} />
            <Field label="Width" type="number" value={f.width} onChange={(v) => set({ width: v })} />
            <Field label="Height" type="number" value={f.height} onChange={(v) => set({ height: v })} />
          </div>
          <Field label="Shipping class" value={f.shipping_class} onChange={(v) => set({ shipping_class: v })} />
          <div className="grid grid-cols-2 gap-2">
            <Toggle checked={f.cod_enabled} onChange={(v) => set({ cod_enabled: v })} label="Cash on delivery" />
            <Toggle checked={f.pickup_supported} onChange={(v) => set({ pickup_supported: v })} label="Store pickup" />
            <Toggle checked={f.international_shipping} onChange={(v) => set({ international_shipping: v })} label="International shipping" />
            <Toggle checked={f.fragile} onChange={(v) => set({ fragile: v })} label="Fragile" />
          </div>
        </div>
      )}
    </SectionEditor>
  );
}
