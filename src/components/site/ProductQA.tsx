import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { MessageCircleQuestion, Loader2, Send, Trash2, CheckCircle2, Pencil } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Question = {
  id: string;
  product_slug: string;
  user_id: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
};

type ProfileMap = Record<string, { full_name: string | null; avatar_url: string | null }>;

export function ProductQA({ productSlug }: { productSlug: string }) {
  const { user } = useAuth();
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Question[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);

  async function load() {
    setLoading(true);
    const { data } = await supabase
      .from("product_questions")
      .select("*")
      .eq("product_slug", productSlug)
      .order("created_at", { ascending: false });
    const list = (data ?? []) as Question[];
    setItems(list);
    const ids = Array.from(new Set(list.map((q) => q.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase
        .from("profiles")
        .select("id, full_name, avatar_url")
        .in("id", ids);
      const map: ProfileMap = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
      setProfiles(map);
    }
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [productSlug]);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id).eq("role", "admin")
      .then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));
  }, [user]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user || !draft.trim()) return;
    setBusy(true);
    const { error } = await supabase.from("product_questions").insert({
      product_slug: productSlug,
      user_id: user.id,
      question: draft.trim(),
    });
    setBusy(false);
    if (!error) {
      setDraft("");
      load();
    }
  }

  async function postAnswer(id: string) {
    const text = (answerDrafts[id] ?? "").trim();
    if (!text || !user) return;
    const { error } = await supabase
      .from("product_questions")
      .update({ answer: text, answered_by: user.id, answered_at: new Date().toISOString() })
      .eq("id", id);
    if (!error) {
      setAnswerDrafts((d) => ({ ...d, [id]: "" }));
      setEditingId(null);
      load();
    }
  }

  async function remove(id: string) {
    if (!confirm("Delete this question?")) return;
    await supabase.from("product_questions").delete().eq("id", id);
    load();
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-16 border-t border-border">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-8">
        <div>
          <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2">Questions</p>
          <h2 className="text-2xl sm:text-3xl font-display tracking-tight inline-flex items-center gap-3">
            <MessageCircleQuestion className="size-6 text-accent" /> Questions & Answers
          </h2>
        </div>
        <span className="text-xs font-mono text-muted-foreground">{items.length} {items.length === 1 ? "question" : "questions"}</span>
      </div>

      {user ? (
        <form onSubmit={submit} className="bg-card border border-border rounded-2xl p-4 sm:p-5 mb-8">
          <label className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Ask a question</label>
          <textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={3}
            maxLength={500}
            placeholder="What size does this come in? How does it fit?"
            className="mt-2 w-full bg-background border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent resize-none"
          />
          <div className="flex items-center justify-between mt-3">
            <span className="text-[10px] font-mono text-muted-foreground">{draft.length}/500</span>
            <button
              type="submit"
              disabled={busy || !draft.trim()}
              className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
            >
              {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
              Submit
            </button>
          </div>
        </form>
      ) : (
        <div className="bg-card border border-border rounded-2xl p-6 mb-8 text-center">
          <p className="text-sm text-muted-foreground">
            <Link to="/auth" className="text-accent underline">Sign in</Link> to ask a question.
          </p>
        </div>
      )}

      {loading ? (
        <div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="py-14 px-6 text-center rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl shadow-[0_18px_40px_-24px_oklch(0_0_0/0.8)]">
          <div className="relative mx-auto mb-4 size-16 grid place-items-center">
            <div aria-hidden className="absolute inset-0 rounded-full opacity-60" style={{ background: "var(--gradient-ember-soft)", filter: "blur(18px)" }} />
            <div className="relative size-14 rounded-2xl grid place-items-center bg-accent/10 border border-accent/20 text-accent">
              <MessageCircleQuestion className="size-6" />
            </div>
          </div>
          <p className="text-base font-display mb-1">Be the first to ask</p>
          <p className="text-sm text-muted-foreground max-w-sm mx-auto leading-relaxed">No questions yet — start the conversation and get answers from our team.</p>
        </div>
      ) : (
        <ul className="space-y-4">
          {items.map((q) => {
            const canDelete = isAdmin || user?.id === q.user_id;
            const canAnswer = isAdmin && !q.answer;
            return (
              <li key={q.id} className="bg-card border border-border rounded-2xl p-5">
                <div className="flex items-start gap-3">
                  <span className="size-8 shrink-0 rounded-full bg-accent/10 text-accent grid place-items-center font-mono text-xs font-bold">Q</span>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm leading-relaxed">{q.question}</p>
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {new Date(q.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  {canDelete && (
                    <button onClick={() => remove(q.id)} aria-label="Delete" className="text-muted-foreground hover:text-destructive transition-colors">
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </div>

                {q.answer && editingId !== q.id ? (
                  <div className="mt-4 ml-11 flex items-start gap-3 p-4 bg-accent/5 border border-accent/20 rounded-xl">
                    <span className="size-8 shrink-0 rounded-full bg-accent text-accent-foreground grid place-items-center font-mono text-xs font-bold">A</span>
                    <div className="flex-1">
                      <div className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-accent mb-1">
                        <CheckCircle2 className="size-3" /> Official answer
                      </div>
                      <p className="text-sm leading-relaxed">{q.answer}</p>
                    </div>
                    {isAdmin && (
                      <button
                        onClick={() => {
                          setEditingId(q.id);
                          setAnswerDrafts((d) => ({ ...d, [q.id]: q.answer ?? "" }));
                        }}
                        aria-label="Edit answer"
                        className="text-muted-foreground hover:text-accent transition-colors"
                      >
                        <Pencil className="size-4" />
                      </button>
                    )}
                  </div>
                ) : canAnswer || (isAdmin && editingId === q.id) ? (
                  <div className="mt-4 ml-11 flex gap-2">
                    <input
                      value={answerDrafts[q.id] ?? ""}
                      onChange={(e) => setAnswerDrafts((d) => ({ ...d, [q.id]: e.target.value }))}
                      placeholder="Post an official answer…"
                      className="flex-1 bg-background border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:border-accent"
                    />
                    <button
                      onClick={() => postAnswer(q.id)}
                      className="bg-accent text-accent-foreground font-bold px-4 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all"
                    >
                      {editingId === q.id ? "Update" : "Reply"}
                    </button>
                    {editingId === q.id && (
                      <button
                        onClick={() => {
                          setEditingId(null);
                          setAnswerDrafts((d) => ({ ...d, [q.id]: "" }));
                        }}
                        className="px-3 rounded-full text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                ) : (
                  <p className="mt-3 ml-11 text-[11px] font-mono text-muted-foreground italic">Awaiting reply…</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
