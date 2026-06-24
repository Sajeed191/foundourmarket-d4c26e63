import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/robots.txt")({
  server: {
    handlers: {
      GET: async () => {
        const origin = "https://foundourmarket.com";
        const body = [
          "User-agent: *",
          "Allow: /",
          // Internal / gated surfaces — never index (prevents Google "Deceptive Pages" flags on thin login walls)
          "Disallow: /admin",
          "Disallow: /builder",
          // Internal search results — crawlable links but no thin/duplicate index
          "Disallow: /search",
          "Disallow: /account",
          "Disallow: /checkout",
          "Disallow: /cart",
          "Disallow: /auth",
          "Disallow: /login",
          "Disallow: /signin",
          "Disallow: /signup",
          "Disallow: /reset-password",
          "",
          `Sitemap: ${origin}/sitemap.xml`,
          `Sitemap: ${origin}/product-feed.xml`,
          "",
        ].join("\n");
        return new Response(body, {
          status: 200,
          headers: { "content-type": "text/plain; charset=utf-8", "cache-control": "public, max-age=3600" },
        });
      },
    },
  },
});
