import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type Post = { slug: string; title: string; excerpt: string | null; cover_image: string | null; author: string | null; published_at: string };

export const Route = createFileRoute("/blog")({
  head: () => ({
    meta: [
      { title: "Journal — FoundOurMarket™" },
      { name: "description", content: "Stories, guides, and editorial from FoundOurMarket — shopping tips, product spotlights, and inspiration for a curated global lifestyle." },
      { property: "og:title", content: "Journal — FoundOurMarket™" },
      { property: "og:description", content: "Stories, guides, and editorial from FoundOurMarket." },
      { property: "og:url", content: "https://foundourmarket.com/blog" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/blog" }],
  }),
  component: BlogIndex,
});

function BlogIndex() {
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    function fetchPosts() {
      supabase.from("cms_posts_public" as "cms_posts").select("slug,title,excerpt,cover_image,author,published_at")
        .not("published_at", "is", null).lte("published_at", new Date().toISOString())
        .order("published_at", { ascending: false })
        .then(({ data }) => { setPosts((data as Post[]) ?? []); setLoading(false); });
    }
    fetchPosts();
    const ch = supabase
      .channel("rt-cms-posts-list")
      .on("postgres_changes", { event: "*", schema: "public", table: "cms_posts" }, fetchPosts)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, []);

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Journal</p>
      <h1 className="text-4xl md:text-5xl font-display font-semibold mb-12">Stories & guides</h1>
      {loading ? (
        <div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : posts.length === 0 ? (
        <p className="text-muted-foreground text-sm">No posts yet. Check back soon.</p>
      ) : (
        <div className="grid md:grid-cols-2 gap-10">
          {posts.map((p) => (
            <Link key={p.slug} to="/blog/$slug" params={{ slug: p.slug }} className="group">
              {p.cover_image && (
                <div className="aspect-[4/3] overflow-hidden rounded-2xl mb-4 bg-muted">
                  <img loading="lazy" decoding="async" src={p.cover_image} alt={`${p.title} — article cover`} className="size-full object-cover group-hover:scale-105 transition-transform duration-700" />
                </div>
              )}
              <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-2">
                {new Date(p.published_at).toLocaleDateString()}{p.author && ` · ${p.author}`}
              </p>
              <h2 className="text-2xl font-display font-semibold mb-2 group-hover:text-accent transition-colors">{p.title}</h2>
              {p.excerpt && <p className="text-sm text-muted-foreground leading-relaxed">{p.excerpt}</p>}
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
