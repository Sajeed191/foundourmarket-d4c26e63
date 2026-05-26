import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin-cms")({
  head: () => ({ meta: [{ title: "CMS — FoundOurMarket™" }] }),
  component: AdminCmsPage,
});

type Page = {
  id: string; slug: string; title: string; body: string;
  meta_title: string | null; meta_description: string | null;
  published: boolean; sort_order: number;
};
type Post = {
  id: string; slug: string; title: string; excerpt: string | null; body: string;
  cover_image: string | null; author: string | null;
  meta_title: string | null; meta_description: string | null;
  published_at: string | null;
};

function AdminCmsPage() {
  const [tab, setTab] = useState<"pages" | "posts">("pages");
  const [pages, setPages] = useState<Page[]>([]);
  const [posts, setPosts] = useState<Post[]>([]);

  async function load() {
    const [{ data: p, error: pe }, { data: b, error: be }] = await Promise.all([
      supabase.from("cms_pages").select("*").order("sort_order"),
      supabase.from("cms_posts").select("*").order("created_at", { ascending: false }),
    ]);
    if (pe) toast.error(pe.message);
    if (be) toast.error(be.message);
    setPages((p as Page[]) ?? []);
    setPosts((b as Post[]) ?? []);
  }

  useEffect(() => { void load(); }, []);

  return (
    <AdminShell title="Content" subtitle="Pages and journal posts" allow={["admin","super_admin","editor"]}>
      <div className="flex gap-2 mb-8 border-b border-border">
        {(["pages", "posts"] as const).map((t) => (
          <button key={t} onClick={() => setTab(t)}
            className={`px-4 py-2 text-xs font-mono uppercase tracking-widest border-b-2 -mb-px ${tab === t ? "border-accent text-accent" : "border-transparent text-muted-foreground"}`}>
            {t}
          </button>
        ))}
      </div>
      {tab === "pages" ? <PagesTab pages={pages} reload={load} /> : <PostsTab posts={posts} reload={load} />}
    </AdminShell>
  );
}

function PagesTab({ pages, reload }: { pages: Page[]; reload: () => void }) {
  const [editing, setEditing] = useState<Partial<Page> | null>(null);

  async function save() {
    if (!editing?.slug || !editing.title) { toast.error("Slug and title are required"); return; }
    const payload = {
      slug: editing.slug, title: editing.title, body: editing.body ?? "",
      meta_title: editing.meta_title ?? null, meta_description: editing.meta_description ?? null,
      published: editing.published ?? false, sort_order: editing.sort_order ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from("cms_pages").update(payload).eq("id", editing.id)
      : await supabase.from("cms_pages").insert(payload);
    if (error) { toast.error(error.message); return; }
    toast.success(editing.id ? "Page updated" : "Page created");
    logActivity(editing.id ? "page_update" : "page_create", "cms_page", editing.id, { slug: payload.slug });
    setEditing(null); reload();
  }

  async function del(id: string) {
    if (!confirm("Delete this page?")) return;
    const { error } = await supabase.from("cms_pages").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity("page_delete", "cms_page", id);
    reload();
  }

  return (
    <div className="grid lg:grid-cols-[1fr,2fr] gap-8">
      <div>
        <button onClick={() => setEditing({ published: false })}
          className="w-full mb-4 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest">
          <Plus className="size-3.5" /> New page
        </button>
        <ul className="space-y-2">
          {pages.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEditing(p)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${editing?.id === p.id ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"}`}>
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">/{p.slug} · {p.published ? "published" : "draft"}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {editing && <PageEditor key={editing.id ?? "new"} editing={editing} setEditing={setEditing} save={save} del={del} />}
    </div>
  );
}

function PageEditor({ editing, setEditing, save, del }: any) {
  return (
    <div className="space-y-4 p-6 border border-border rounded-2xl">
      <Field label="Slug"><input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={inputCls} placeholder="about" /></Field>
      <Field label="Title"><input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} /></Field>
      <Field label="Meta title"><input value={editing.meta_title ?? ""} onChange={(e) => setEditing({ ...editing, meta_title: e.target.value })} className={inputCls} /></Field>
      <Field label="Meta description"><input value={editing.meta_description ?? ""} onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })} className={inputCls} /></Field>
      <Field label="Body (markdown / text)">
        <textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={14} className={`${inputCls} font-mono text-xs`} />
      </Field>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={!!editing.published} onChange={(e) => setEditing({ ...editing, published: e.target.checked })} /> Published
        </label>
        <input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} className={`${inputCls} w-24`} placeholder="Sort" />
      </div>
      <div className="flex gap-2 pt-4 border-t border-border">
        <button onClick={save} className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2 rounded-full text-[11px] uppercase tracking-widest">
          <Save className="size-3.5" /> Save
        </button>
        {editing.id && (
          <button onClick={() => del(editing.id)} className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-full text-[11px] uppercase tracking-widest text-destructive">
            <Trash2 className="size-3.5" /> Delete
          </button>
        )}
        <button onClick={() => setEditing(null)} className="ml-auto text-xs font-mono uppercase tracking-widest text-muted-foreground">Cancel</button>
      </div>
    </div>
  );
}

function PostsTab({ posts, reload }: { posts: Post[]; reload: () => void }) {
  const [editing, setEditing] = useState<Partial<Post> | null>(null);

  async function save() {
    if (!editing?.slug || !editing.title) return;
    const payload = {
      slug: editing.slug, title: editing.title, excerpt: editing.excerpt ?? null,
      body: editing.body ?? "", cover_image: editing.cover_image ?? null, author: editing.author ?? null,
      meta_title: editing.meta_title ?? null, meta_description: editing.meta_description ?? null,
      published_at: editing.published_at ?? null,
    };
    if (editing.id) await supabase.from("cms_posts").update(payload).eq("id", editing.id);
    else await supabase.from("cms_posts").insert(payload);
    setEditing(null); reload();
  }
  async function del(id: string) {
    if (!confirm("Delete this post?")) return;
    await supabase.from("cms_posts").delete().eq("id", id); reload();
  }

  return (
    <div className="grid lg:grid-cols-[1fr,2fr] gap-8">
      <div>
        <button onClick={() => setEditing({})}
          className="w-full mb-4 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest">
          <Plus className="size-3.5" /> New post
        </button>
        <ul className="space-y-2">
          {posts.map((p) => (
            <li key={p.id}>
              <button onClick={() => setEditing(p)}
                className={`w-full text-left p-3 rounded-lg border transition-colors ${editing?.id === p.id ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"}`}>
                <div className="text-sm font-medium">{p.title}</div>
                <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">/{p.slug} · {p.published_at ? "published" : "draft"}</div>
              </button>
            </li>
          ))}
        </ul>
      </div>
      {editing && (
        <div className="space-y-4 p-6 border border-border rounded-2xl">
          <Field label="Slug"><input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={inputCls} /></Field>
          <Field label="Title"><input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} /></Field>
          <Field label="Author"><input value={editing.author ?? ""} onChange={(e) => setEditing({ ...editing, author: e.target.value })} className={inputCls} /></Field>
          <Field label="Cover image URL"><input value={editing.cover_image ?? ""} onChange={(e) => setEditing({ ...editing, cover_image: e.target.value })} className={inputCls} /></Field>
          <Field label="Excerpt"><textarea value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} rows={2} className={inputCls} /></Field>
          <Field label="Body"><textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={14} className={`${inputCls} font-mono text-xs`} /></Field>
          <Field label="Meta title"><input value={editing.meta_title ?? ""} onChange={(e) => setEditing({ ...editing, meta_title: e.target.value })} className={inputCls} /></Field>
          <Field label="Meta description"><input value={editing.meta_description ?? ""} onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })} className={inputCls} /></Field>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={!!editing.published_at}
              onChange={(e) => setEditing({ ...editing, published_at: e.target.checked ? new Date().toISOString() : null })} /> Published
          </label>
          <div className="flex gap-2 pt-4 border-t border-border">
            <button onClick={save} className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2 rounded-full text-[11px] uppercase tracking-widest">
              <Save className="size-3.5" /> Save
            </button>
            {editing.id && (
              <button onClick={() => del(editing.id!)} className="inline-flex items-center gap-2 border border-border px-4 py-2 rounded-full text-[11px] uppercase tracking-widest text-destructive">
                <Trash2 className="size-3.5" /> Delete
              </button>
            )}
            <button onClick={() => setEditing(null)} className="ml-auto text-xs font-mono uppercase tracking-widest text-muted-foreground">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}

const inputCls = "w-full bg-background border border-border rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-accent";
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[10px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}
