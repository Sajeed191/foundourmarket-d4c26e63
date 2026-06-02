import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

export const Route = createFileRoute("/sitemap.xml")({
  server: {
    handlers: {
      GET: async () => {
        const origin = "https://foundourmarket.com";
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);

        const [products, categories, pages, posts] = await Promise.all([
          sb.from("products_public").select("slug,updated_at"),
          sb.from("categories").select("slug,parent_id,id"),
          sb.from("cms_pages").select("slug,updated_at").eq("published", true),
          sb.from("cms_posts").select("slug,updated_at,published_at")
            .not("published_at", "is", null).lte("published_at", new Date().toISOString()),
        ]);

        const urls: { loc: string; lastmod?: string }[] = [
          { loc: `${origin}/` },
          { loc: `${origin}/search` },
          { loc: `${origin}/deals` },
          { loc: `${origin}/blog` },
          { loc: `${origin}/track` },
          { loc: `${origin}/compare` },
          { loc: `${origin}/returns` },
          { loc: `${origin}/help` },
          { loc: `${origin}/pages/shipping` },
          { loc: `${origin}/pages/returns` },
        ];
        (products.data ?? []).forEach((p: any) => urls.push({ loc: `${origin}/products/${p.slug}`, lastmod: p.updated_at }));
        {
          const cats = (categories.data ?? []) as any[];
          const bySlug = new Map(cats.map((c) => [c.id, c.slug]));
          cats.forEach((c) => {
            if (c.parent_id && bySlug.get(c.parent_id)) {
              urls.push({ loc: `${origin}/category/${bySlug.get(c.parent_id)}/${c.slug}` });
            } else {
              urls.push({ loc: `${origin}/category/${c.slug}` });
            }
          });
        }
        (pages.data ?? []).forEach((p: any) => urls.push({ loc: `${origin}/pages/${p.slug}`, lastmod: p.updated_at }));
        (posts.data ?? []).forEach((p: any) => urls.push({ loc: `${origin}/blog/${p.slug}`, lastmod: p.updated_at }));

        const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${urls
          .map((u) => `  <url><loc>${u.loc}</loc>${u.lastmod ? `<lastmod>${new Date(u.lastmod).toISOString()}</lastmod>` : ""}</url>`)
          .join("\n")}\n</urlset>`;

        return new Response(body, {
          status: 200,
          headers: { "content-type": "application/xml; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
