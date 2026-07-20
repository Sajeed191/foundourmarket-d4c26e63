import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { renderMarkdown } from "@/lib/cms";

type Post = { slug: string; title: string; excerpt: string | null; body: string; cover_image: string | null; author: string | null; published_at: string; meta_title: string | null; meta_description: string | null };

export const Route = createFileRoute("/blog/$slug")({
  loader: async ({ params }) => {
    const { data } = await supabase.from("cms_posts_public" as "cms_posts").select("slug,title,excerpt,cover_image,author,published_at,meta_title,meta_description")
      .eq("slug", params.slug)
      .not("published_at", "is", null).lte("published_at", new Date().toISOString())
      .maybeSingle();
    return { post: data as (Pick<Post, "slug" | "title" | "excerpt" | "cover_image" | "author" | "published_at" | "meta_title" | "meta_description">) | null };
  },
  head: ({ params, loaderData }) => {
    const post = loaderData?.post;
    const url = `https://foundourmarket.com/blog/${params.slug}`;
    const title = post ? (post.meta_title || `${post.title} — Journal — FoundOurMarket™`) : `${params.slug} — Journal — FoundOurMarket™`;
    const description = post
      ? (post.meta_description || post.excerpt || `Read "${post.title}" on the FoundOurMarket Journal.`)
      : "Stories, guides, and editorial from FoundOurMarket.";
    const meta: Array<Record<string, string>> = [
      { title },
      { name: "description", content: description },
      { property: "og:title", content: title },
      { property: "og:description", content: description },
      { property: "og:type", content: "article" },
      { property: "og:url", content: url },
    ];
    if (post?.cover_image) {
      meta.push({ property: "og:image", content: post.cover_image });
      meta.push({ name: "twitter:image", content: post.cover_image });
    }
    const scripts = post
      ? [{
          type: "application/ld+json",
          children: JSON.stringify({
            "@context": "https://schema.org",
            "@type": "Article",
            headline: post.title,
            image: post.cover_image || undefined,
            datePublished: post.published_at,
            author: post.author ? { "@type": "Person", name: post.author } : undefined,
            description: post.excerpt || undefined,
            mainEntityOfPage: url,
          }),
        }]
      : [];
    return { meta, links: [{ rel: "canonical", href: url }], scripts };
  },
  component: BlogPost,
});

function BlogPost() {
  const { slug } = Route.useParams();
  const [post, setPost] = useState<Post | null>(null);
  const [loading, setLoading] = useState(true);
  const [missing, setMissing] = useState(false);

  useEffect(() => {
    let active = true;
    function fetchPost() {
      supabase.from("cms_posts_public" as "cms_posts").select("slug,title,excerpt,body,cover_image,author,published_at,meta_title,meta_description").eq("slug", slug)
        .not("published_at", "is", null).lte("published_at", new Date().toISOString())
        .maybeSingle().then(({ data }) => {
          if (!active) return;
          if (!data) setMissing(true);
          else {
            setPost(data as Post); setMissing(false);
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
    fetchPost();
    const ch = supabase
      .channel(`rt-cms-post-${slug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "cms_posts" }, fetchPost)
      .subscribe();
    return () => { active = false; supabase.removeChannel(ch); };
  }, [slug]);

  if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  if (missing || !post) return (
    <div className="max-w-2xl mx-auto px-6 py-24 text-center">
      <h1 className="text-3xl font-display font-semibold mb-4">Post not found</h1>
      <Link to="/blog" className="text-xs font-mono uppercase tracking-widest text-accent">← Journal</Link>
    </div>
  );

  return (
    <article className="max-w-3xl mx-auto px-6 py-16">
      <Link to="/blog" className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">← Journal</Link>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-8 mb-3">
        {new Date(post.published_at).toLocaleDateString()}{post.author && ` · ${post.author}`}
      </p>
      <h1 className="text-4xl md:text-5xl font-display font-semibold mb-8">{post.title}</h1>
      {post.cover_image && (
        <div className="aspect-[16/9] overflow-hidden rounded-2xl mb-10 bg-muted">
          <img loading="lazy" decoding="async" src={post.cover_image} alt={`${post.title} — article cover`} className="size-full object-cover" />
        </div>
      )}
      <div className="prose prose-invert max-w-none text-foreground/90 leading-relaxed [&_h1]:text-3xl [&_h1]:font-display [&_h1]:font-semibold [&_h1]:mt-10 [&_h1]:mb-4 [&_h2]:text-2xl [&_h2]:font-display [&_h2]:font-semibold [&_h2]:mt-8 [&_h2]:mb-3 [&_p]:mb-4 [&_p]:text-sm"
        dangerouslySetInnerHTML={{ __html: renderMarkdown(post.body) }} />
    </article>
  );
}
