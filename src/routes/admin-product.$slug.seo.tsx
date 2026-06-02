import { createFileRoute } from "@tanstack/react-router";
import { Search } from "lucide-react";
import { SectionEditor, Field, Area, Toggle, parseList } from "@/components/admin/product-editor/kit";

export const Route = createFileRoute("/admin-product/$slug/seo")({ component: SeoPage });

const COLS = ["seo_title", "seo_description", "meta_keywords", "hide_from_search"];

function SeoPage() {
  const { slug } = Route.useParams();
  return (
    <SectionEditor
      slug={slug} sectionKey="seo" title="SEO" icon={<Search className="size-4" />} cols={COLS}
      toForm={(r) => ({
        seo_title: r.seo_title ?? "", seo_description: r.seo_description ?? "",
        meta_keywords: (r.meta_keywords ?? []).join(", "), hide_from_search: r.hide_from_search ?? false,
      })}
      toPatch={(f) => ({
        seo_title: f.seo_title.trim() || null, seo_description: f.seo_description.trim() || null,
        meta_keywords: parseList(f.meta_keywords), hide_from_search: f.hide_from_search,
      })}
    >
      {(f, set) => (
        <div className="space-y-3">
          <Field label="SEO title" value={f.seo_title} onChange={(v) => set({ seo_title: v })} hint={`${f.seo_title.length}/60 characters`} />
          <Area label="SEO description" value={f.seo_description} onChange={(v) => set({ seo_description: v })} hint={`${f.seo_description.length}/160 characters`} />
          <Field label="Meta keywords (comma separated)" value={f.meta_keywords} onChange={(v) => set({ meta_keywords: v })} />
          <Toggle checked={f.hide_from_search} onChange={(v) => set({ hide_from_search: v })} label="Hide from on-site search" />
        </div>
      )}
    </SectionEditor>
  );
}
