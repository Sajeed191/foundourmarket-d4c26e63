import { createFileRoute } from "@tanstack/react-router";
import { createClient } from "@supabase/supabase-js";

const ORIGIN = "https://foundourmarket.com";

function xmlEscape(s: string): string {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resolveUrl(raw: string | null | undefined): string | null {
  if (!raw) return null;
  if (raw.startsWith("http://") || raw.startsWith("https://")) return raw;
  if (raw.startsWith("/")) return `${ORIGIN}${raw}`;
  return null; // skip bundled local asset names (not crawlable absolute URLs)
}

export const Route = createFileRoute("/product-feed.xml")({
  server: {
    handlers: {
      GET: async () => {
        const sb = createClient(process.env.SUPABASE_URL!, process.env.SUPABASE_PUBLISHABLE_KEY!);

        const { data: products } = await sb
          .from("products_public")
          .select(
            "slug,name,description,seo_title,seo_description,image,sku,brand,category,price_inr,compare_price_inr,price_usd,in_stock,stock_quantity,status,hide_from_search",
          );

        const list = (products ?? []).filter(
          (p: any) => p.status === "published" && p.hide_from_search !== true,
        );

        const slugs = list.map((p: any) => p.slug);
        const imagesBySlug = new Map<string, string[]>();
        if (slugs.length) {
          const { data: imgs } = await sb
            .from("product_images")
            .select("product_slug,url,sort_order")
            .in("product_slug", slugs)
            .order("sort_order", { ascending: true });
          (imgs ?? []).forEach((r: any) => {
            const url = resolveUrl(r.url);
            if (!url) return;
            const arr = imagesBySlug.get(r.product_slug) ?? [];
            arr.push(url);
            imagesBySlug.set(r.product_slug, arr);
          });
        }

        const items: string[] = [];
        for (const p of list as any[]) {
          // Pricing: prefer USD for Google Shopping (international free listings),
          // fall back to INR. Skip products with no valid price.
          const usd = p.price_usd != null ? Number(p.price_usd) : null;
          const inr = p.price_inr != null ? Number(p.price_inr) : null;
          let price: string | null = null;
          if (usd != null && usd > 0) price = `${usd.toFixed(2)} USD`;
          else if (inr != null && inr > 0) price = `${inr.toFixed(2)} INR`;
          if (!price) continue;

          const id = p.sku || p.slug;
          const title = p.seo_title || p.name;
          const description = p.seo_description || p.description || p.name;
          const link = `${ORIGIN}/products/${p.slug}`;

          const gallery = imagesBySlug.get(p.slug) ?? [];
          const main = resolveUrl(p.image) ?? gallery[0] ?? null;
          if (!main) continue; // Google requires an image
          const additional = gallery.filter((u) => u !== main).slice(0, 10);

          const available =
            p.in_stock === true && (p.stock_quantity == null || Number(p.stock_quantity) > 0);

          const parts: string[] = [
            `    <g:id>${xmlEscape(id)}</g:id>`,
            `    <g:title>${xmlEscape(title)}</g:title>`,
            `    <g:description>${xmlEscape(description)}</g:description>`,
            `    <g:link>${xmlEscape(link)}</g:link>`,
            `    <g:image_link>${xmlEscape(main)}</g:image_link>`,
            ...additional.map((u) => `    <g:additional_image_link>${xmlEscape(u)}</g:additional_image_link>`),
            `    <g:availability>${available ? "in_stock" : "out_of_stock"}</g:availability>`,
            `    <g:price>${xmlEscape(price)}</g:price>`,
            `    <g:condition>new</g:condition>`,
            `    <g:brand>${xmlEscape(p.brand || "FoundOurMarket")}</g:brand>`,
            `    <g:identifier_exists>false</g:identifier_exists>`,
          ];
          if (p.category) parts.push(`    <g:product_type>${xmlEscape(p.category)}</g:product_type>`);

          items.push(`  <item>\n${parts.join("\n")}\n  </item>`);
        }

        const body =
          `<?xml version="1.0" encoding="UTF-8"?>\n` +
          `<rss version="2.0" xmlns:g="http://base.google.com/ns/1.0">\n` +
          `<channel>\n` +
          `  <title>FoundOurMarket\u2122 Product Feed</title>\n` +
          `  <link>${ORIGIN}</link>\n` +
          `  <description>Everything You Need \u2014 All in One Place</description>\n` +
          `${items.join("\n")}\n` +
          `</channel>\n</rss>`;

        return new Response(body, {
          status: 200,
          headers: {
            "content-type": "application/xml; charset=utf-8",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
