import { createFileRoute } from "@tanstack/react-router";
import { FileText } from "lucide-react";
import { SectionEditor, Field, Area, parseList, kvToText, textToKv } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/details")({ component: DetailsPage });

const COLS = ["name", "slug", "tagline", "description", "image", "brand", "product_type", "tags", "features", "specifications", "attributes", "video_url", "demo_url"];

function DetailsPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="details" title="Product Details" icon={<FileText className="size-4" />} cols={COLS}
      toForm={(r) => ({
        name: r.name ?? "", tagline: r.tagline ?? "", description: r.description ?? "", image: r.image ?? "",
        brand: r.brand ?? "", product_type: r.product_type ?? "",
        tags: (r.tags ?? []).join(", "), features: (r.features ?? []).join("\n"),
        specifications: kvToText(r.specifications), attributes: kvToText(r.attributes),
        video_url: r.video_url ?? "", demo_url: r.demo_url ?? "",
      })}
      toPatch={(f) => ({
        name: f.name.trim(), tagline: f.tagline.trim() || null, description: f.description.trim() || null,
        image: f.image.trim() || null, brand: f.brand.trim() || null, product_type: f.product_type.trim() || null,
        tags: parseList(f.tags), features: parseList(f.features),
        specifications: textToKv(f.specifications), attributes: textToKv(f.attributes),
        video_url: f.video_url.trim() || null, demo_url: f.demo_url.trim() || null,
      })}
      validate={(f) => (f.name.trim() ? null : "Product name is required.")}
    >
      {(f, set) => (
        <div className="space-y-3">
          <Field label="Name" value={f.name} onChange={(v) => set({ name: v })} />
          <Field label="Tagline" value={f.tagline} onChange={(v) => set({ tagline: v })} />
          <Field label="Image URL" value={f.image} onChange={(v) => set({ image: v })} />
          <Area label="Description" value={f.description} rows={5} onChange={(v) => set({ description: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Brand" value={f.brand} onChange={(v) => set({ brand: v })} />
            <Field label="Product type" value={f.product_type} onChange={(v) => set({ product_type: v })} />
          </div>
          <Field label="Tags (comma separated)" value={f.tags} onChange={(v) => set({ tags: v })} />
          <Area label="Features (one per line)" value={f.features} onChange={(v) => set({ features: v })} />
          <Area label="Specifications (key: value per line)" value={f.specifications} onChange={(v) => set({ specifications: v })} />
          <Area label="Attributes (key: value per line)" value={f.attributes} onChange={(v) => set({ attributes: v })} />
          <div className="grid grid-cols-2 gap-3">
            <Field label="Video URL" value={f.video_url} onChange={(v) => set({ video_url: v })} />
            <Field label="Demo URL" value={f.demo_url} onChange={(v) => set({ demo_url: v })} />
          </div>
        </div>
      )}
    </SectionEditor>
  );
}
