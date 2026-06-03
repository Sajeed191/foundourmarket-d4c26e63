import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderMarkdown } from "@/lib/cms";

type Page = { slug: string; title: string; body: string; meta_title: string | null; meta_description: string | null };

export const Route = createFileRoute("/pages/$slug")({
  head: ({ params }) => ({
    meta: [
      { title: `${params.slug} — FoundOurMarket™` },
    ],
  }),
  component: CmsPage,
});

function CmsPage() {
  const { slug } = Route.useParams();
  const [page, setPage] = useState<Page | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    setLoading(true); setMissing(false);
    function fetchPage() {
      supabase.from("cms_pages_public").select("slug,title,body,meta_title,meta_description")
        .eq("slug", slug).maybeSingle()
        .then(({ data }) => {
          if (!active) return;
          if (!data) setMissing(true);
          else {
            setPage(data as Page); setMissing(false);
            if (data.meta_title) document.title = data.meta_title;
            if (data.meta_description) {
              let m = document.querySelector('meta[name="description"]');
              if (!m) { m = document.createElement("meta"); m.setAttribute("name", "description"); document.head.appendChild(m); }
              m.setAttribute("content", data.meta_description);
            }
          }
          setLoading(false);
        });
    }
    fetchPage();
    const ch = supabase
      .channel(`rt-cms-page-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cms_pages" }, fetchPage)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [slug]);

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (missing || !page) return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-display font-semibold mb-4">Page not found</h1>
      <Link to="/" className="text-xs font-mono uppercase tracking-widest text-accent">← Home</Link>
    </div>
  );

  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <h1 className="text-4xl md:text-5xl font-display font-semibold mb-10">{page.title}</h1>
      <div className="prose prose-invert max-w-none text-foreground/90 leading-relaxed [&_h1]:text-3xl [&_h1]:font-display [&_h1]:font-semibold [&_h1]:mt-10 [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-display [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:mb-4 [&_p]:text-sm"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(page.body) }} />
    </article>
  );
}
