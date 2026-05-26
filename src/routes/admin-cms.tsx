import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Trash2, Save, Rocket, AlertCircle, CheckCircle2 } from "lucide-react";
import { AdminShell, logActivity } from "@/components/admin/AdminShell";
import { PublishConfirm } from "@/components/admin/PublishConfirm";
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
  draft_data: any; has_draft: boolean; last_published_at: string | null;
};
type Post = {
  id: string; slug: string; title: string; excerpt: string | null; body: string;
  cover_image: string | null; author: string | null;
  meta_title: string | null; meta_description: string | null;
  published_at: string | null;
  draft_data: any; has_draft: boolean; last_published_at: string | null;
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
    <AdminShell title="Content" subtitle="Pages and journal posts — draft & publish workflow" allow={["admin","super_admin","editor"]}>
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

function StatusBadge({ hasDraft, isLive }: { hasDraft: boolean; isLive: boolean }) {
  return (
    <div className="flex items-center gap-1.5 mt-1">
      {hasDraft && <span className="text-[9px] font-mono uppercase tracking-widest bg-amber-500/15 text-amber-400 px-2 py-0.5 rounded-full inline-flex items-center gap-1"><AlertCircle className="size-2.5" /> Unpublished</span>}
      {isLive ? (
        <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1"><CheckCircle2 className="size-2.5" /> Live</span>
      ) : (
        <span className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Draft only</span>
      )}
    </div>
  );
}

function PagesTab({ pages, reload }: { pages: Page[]; reload: () => void }) {
  const [editing, setEditing] = useState<Partial<Page> | null>(null);
  const [publishing, setPublishing] = useState<Page | null>(null);

  async function saveDraft() {
    if (!editing?.slug || !editing.title) { toast.error("Slug and title are required"); return; }
    const draft = {
      slug: editing.slug, title: editing.title, body: editing.body ?? "",
      meta_title: editing.meta_title ?? null, meta_description: editing.meta_description ?? null,
      sort_order: editing.sort_order ?? 0,
    };
    const { error } = editing.id
      ? await supabase.from("cms_pages").update({ draft_data: draft, has_draft: true }).eq("id", editing.id)
      : await supabase.from("cms_pages").insert({ ...draft, published: false, draft_data: draft, has_draft: true });
    if (error) { toast.error(error.message); return; }
    toast.success("Draft saved");
    logActivity(editing.id ? "page_draft_update" : "page_draft_create", "cms_page", editing.id, { slug: draft.slug });
    setEditing(null); reload();
  }

  async function publishPage(p: Page) {
    if (!p.draft_data) return;
    const payload: any = { ...p.draft_data, published: true, has_draft: false, draft_data: null, last_published_at: new Date().toISOString() };
    const { error } = await supabase.from("cms_pages").update(payload).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Page is now live");
    logActivity("page_publish", "cms_page", p.id);
    setPublishing(null); reload();
  }

  async function unpublish(p: Page) {
    if (!confirm(`Unpublish "${p.title}" from the live site?`)) return;
    await supabase.from("cms_pages").update({ published: false }).eq("id", p.id);
    logActivity("page_unpublish", "cms_page", p.id);
    toast.success("Page unpublished");
    reload();
  }

  async function del(id: string) {
    if (!confirm("Delete this page? This removes it from the live site too.")) return;
    const { error } = await supabase.from("cms_pages").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity("page_delete", "cms_page", id);
    reload();
  }

  return (
    <>
      <div className="grid lg:grid-cols-[1fr,2fr] gap-8">
        <div>
          <button onClick={() => setEditing({ published: false })}
            className="w-full mb-4 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest">
            <Plus className="size-3.5" /> New page
          </button>
          <ul className="space-y-2">
            {pages.map((p) => {
              const display: any = p.draft_data ?? p;
              return (
                <li key={p.id}>
                  <div className={`p-3 rounded-lg border transition-colors ${editing?.id === p.id ? "border-accent bg-accent/5" : p.has_draft ? "border-amber-500/30" : "border-border"}`}>
                    <button onClick={() => setEditing(p.draft_data ? { ...p, ...p.draft_data } : p)} className="w-full text-left">
                      <div className="text-sm font-medium">{display.title}</div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">/{display.slug}</div>
                      <StatusBadge hasDraft={p.has_draft} isLive={p.published} />
                    </button>
                    <div className="flex gap-1 mt-2">
                      {p.has_draft && (
                        <button onClick={() => setPublishing(p)} className="inline-flex items-center gap-1 bg-accent text-accent-foreground px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest font-bold">
                          <Rocket className="size-2.5" /> Publish
                        </button>
                      )}
                      {p.published && (
                        <button onClick={() => unpublish(p)} className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest border border-border text-muted-foreground hover:text-foreground">
                          Unpublish
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {editing && <PageEditor key={editing.id ?? "new"} editing={editing} setEditing={setEditing} save={saveDraft} del={del} />}
      </div>
      <PublishConfirm
        open={!!publishing}
        title="Publish page live?"
        description={`"${publishing?.draft_data?.title ?? publishing?.title}" will be visible at /pages/${publishing?.draft_data?.slug ?? publishing?.slug} for every visitor immediately.`}
        onCancel={() => setPublishing(null)}
        onConfirm={async () => { if (publishing) await publishPage(publishing); }}
      />
    </>
  );
}

function PageEditor({ editing, setEditing, save, del }: any) {
  return (
    <div className="space-y-4 p-6 border border-border rounded-2xl">
      <p className="text-[11px] text-muted-foreground -mt-1">Edits are saved as a draft. Click <span className="text-accent font-mono">Publish</span> on the page card to go live.</p>
      <Field label="Slug"><input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={inputCls} placeholder="about" /></Field>
      <Field label="Title"><input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} /></Field>
      <Field label="Meta title"><input value={editing.meta_title ?? ""} onChange={(e) => setEditing({ ...editing, meta_title: e.target.value })} className={inputCls} /></Field>
      <Field label="Meta description"><input value={editing.meta_description ?? ""} onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })} className={inputCls} /></Field>
      <Field label="Body (markdown / text)">
        <textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={14} className={`${inputCls} font-mono text-xs`} />
      </Field>
      <input type="number" value={editing.sort_order ?? 0} onChange={(e) => setEditing({ ...editing, sort_order: Number(e.target.value) })} className={`${inputCls} w-24`} placeholder="Sort" />
      <div className="flex gap-2 pt-4 border-t border-border">
        <button onClick={save} className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2 rounded-full text-[11px] uppercase tracking-widest">
          <Save className="size-3.5" /> Save draft
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
  const [publishing, setPublishing] = useState<Post | null>(null);

  async function saveDraft() {
    if (!editing?.slug || !editing.title) { toast.error("Slug and title are required"); return; }
    const draft = {
      slug: editing.slug, title: editing.title, excerpt: editing.excerpt ?? null,
      body: editing.body ?? "", cover_image: editing.cover_image ?? null, author: editing.author ?? null,
      meta_title: editing.meta_title ?? null, meta_description: editing.meta_description ?? null,
    };
    const { error } = editing.id
      ? await supabase.from("cms_posts").update({ draft_data: draft, has_draft: true }).eq("id", editing.id)
      : await supabase.from("cms_posts").insert({ ...draft, published_at: null, draft_data: draft, has_draft: true });
    if (error) { toast.error(error.message); return; }
    toast.success("Draft saved");
    logActivity(editing.id ? "post_draft_update" : "post_draft_create", "cms_post", editing.id, { slug: draft.slug });
    setEditing(null); reload();
  }

  async function publishPost(p: Post) {
    if (!p.draft_data) return;
    const now = new Date().toISOString();
    const payload: any = { ...p.draft_data, published_at: p.published_at ?? now, has_draft: false, draft_data: null, last_published_at: now };
    const { error } = await supabase.from("cms_posts").update(payload).eq("id", p.id);
    if (error) { toast.error(error.message); return; }
    toast.success("Post is now live");
    logActivity("post_publish", "cms_post", p.id);
    setPublishing(null); reload();
  }

  async function unpublish(p: Post) {
    if (!confirm(`Unpublish "${p.title}" from the live journal?`)) return;
    await supabase.from("cms_posts").update({ published_at: null }).eq("id", p.id);
    logActivity("post_unpublish", "cms_post", p.id);
    toast.success("Post unpublished");
    reload();
  }

  async function del(id: string) {
    if (!confirm("Delete this post? This removes it from the live site too.")) return;
    const { error } = await supabase.from("cms_posts").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    logActivity("post_delete", "cms_post", id);
    reload();
  }

  return (
    <>
      <div className="grid lg:grid-cols-[1fr,2fr] gap-8">
        <div>
          <button onClick={() => setEditing({})}
            className="w-full mb-4 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2.5 rounded-full text-[11px] uppercase tracking-widest">
            <Plus className="size-3.5" /> New post
          </button>
          <ul className="space-y-2">
            {posts.map((p) => {
              const display: any = p.draft_data ?? p;
              const isLive = !!p.published_at && new Date(p.published_at) <= new Date();
              return (
                <li key={p.id}>
                  <div className={`p-3 rounded-lg border transition-colors ${editing?.id === p.id ? "border-accent bg-accent/5" : p.has_draft ? "border-amber-500/30" : "border-border"}`}>
                    <button onClick={() => setEditing(p.draft_data ? { ...p, ...p.draft_data } : p)} className="w-full text-left">
                      <div className="text-sm font-medium">{display.title}</div>
                      <div className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest mt-1">/{display.slug}</div>
                      <StatusBadge hasDraft={p.has_draft} isLive={isLive} />
                    </button>
                    <div className="flex gap-1 mt-2">
                      {p.has_draft && (
                        <button onClick={() => setPublishing(p)} className="inline-flex items-center gap-1 bg-accent text-accent-foreground px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest font-bold">
                          <Rocket className="size-2.5" /> Publish
                        </button>
                      )}
                      {isLive && (
                        <button onClick={() => unpublish(p)} className="px-2.5 py-1 rounded-full text-[9px] uppercase tracking-widest border border-border text-muted-foreground hover:text-foreground">
                          Unpublish
                        </button>
                      )}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
        {editing && (
          <div className="space-y-4 p-6 border border-border rounded-2xl">
            <p className="text-[11px] text-muted-foreground -mt-1">Edits are saved as a draft. Click <span className="text-accent font-mono">Publish</span> on the post card to go live.</p>
            <Field label="Slug"><input value={editing.slug ?? ""} onChange={(e) => setEditing({ ...editing, slug: e.target.value })} className={inputCls} /></Field>
            <Field label="Title"><input value={editing.title ?? ""} onChange={(e) => setEditing({ ...editing, title: e.target.value })} className={inputCls} /></Field>
            <Field label="Author"><input value={editing.author ?? ""} onChange={(e) => setEditing({ ...editing, author: e.target.value })} className={inputCls} /></Field>
            <Field label="Cover image URL"><input value={editing.cover_image ?? ""} onChange={(e) => setEditing({ ...editing, cover_image: e.target.value })} className={inputCls} /></Field>
            <Field label="Excerpt"><textarea value={editing.excerpt ?? ""} onChange={(e) => setEditing({ ...editing, excerpt: e.target.value })} rows={2} className={inputCls} /></Field>
            <Field label="Body"><textarea value={editing.body ?? ""} onChange={(e) => setEditing({ ...editing, body: e.target.value })} rows={14} className={`${inputCls} font-mono text-xs`} /></Field>
            <Field label="Meta title"><input value={editing.meta_title ?? ""} onChange={(e) => setEditing({ ...editing, meta_title: e.target.value })} className={inputCls} /></Field>
            <Field label="Meta description"><input value={editing.meta_description ?? ""} onChange={(e) => setEditing({ ...editing, meta_description: e.target.value })} className={inputCls} /></Field>
            <div className="flex gap-2 pt-4 border-t border-border">
              <button onClick={saveDraft} className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-4 py-2 rounded-full text-[11px] uppercase tracking-widest">
                <Save className="size-3.5" /> Save draft
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
      <PublishConfirm
        open={!!publishing}
        title="Publish post live?"
        description={`"${publishing?.draft_data?.title ?? publishing?.title}" will be visible on the journal for every visitor immediately.`}
        onCancel={() => setPublishing(null)}
        onConfirm={async () => { if (publishing) await publishPost(publishing); }}
      />
    </>
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
