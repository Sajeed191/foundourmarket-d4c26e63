import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { MessageCircleQuestion, Loader2, Send, Trash2, CheckCircle2, Pencil, Search, Clock, BadgeCheck } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
const brandLogo = "/logo.webp";

const draftKey = (slug: string) => `pq_draft_${slug}`;
const pendingKey = (slug: string) => `pq_pending_${slug}`;

type Question = {
  id: string;
  product_slug: string;
  question: string;
  answer: string | null;
  answered_at: string | null;
  created_at: string;
  is_mine: boolean;
  author_name: string | null;
  author_avatar: string | null;
};

export function ProductQA({ productSlug }: { productSlug: string }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [isAdmin, setIsAdmin] = useState(false);
  const [items, setItems] = useState<Question[]>([]);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState(() => {
    if (typeof window === "undefined") return "";
    return localStorage.getItem(draftKey(productSlug)) ?? "";
  });
  const [busy, setBusy] = useState(false);
  const [answerDrafts, setAnswerDrafts] = useState<Record<string, string>>({});
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [questionDraft, setQuestionDraft] = useState("");
  const [search, setSearch] = useState("");
  // Synchronous guard against rapid double taps (state updates are async).
  const submittingRef = useRef(false);

  async function load() {
    setLoading(true);
    const { data, error } = await supabase.rpc("get_product_questions", { _slug: productSlug });
    if (error) {
      console.error("[ProductQA] failed to load questions", {
        productSlug,
        code: error.code,
        message: error.message,
      });
    }
    const list = (data ?? []) as Question[];
    setItems(list);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, [productSlug]);

  useEffect(() => {
    if (!user) { setIsAdmin(false); return; }
    supabase.from("user_roles").select("role").eq("user_id", user.id)
      .in("role", ["admin", "super_admin", "manager", "support"])
      .then(({ data }) => setIsAdmin((data?.length ?? 0) > 0));
  }, [user]);

  // Persist the in-progress question so it survives navigation/login.
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (draft.trim()) localStorage.setItem(draftKey(productSlug), draft);
    else localStorage.removeItem(draftKey(productSlug));
  }, [draft, productSlug]);

  // After the user signs in (returning from /auth) auto-continue a pending submit.
  useEffect(() => {
    if (!user || typeof window === "undefined") return;
    if (localStorage.getItem(pendingKey(productSlug)) === "1") {
      localStorage.removeItem(pendingKey(productSlug));
      void insertQuestion();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, productSlug]);

  async function insertQuestion() {
    if (!user) return false;
    const text = draft.trim();
    if (!text) return false;
    if (submittingRef.current || busy) return false; // guard against double submission
    submittingRef.current = true;
    setBusy(true);
    const { resilientInsert } = await import("@/lib/infra/supabase-resilient");
    const r = await resilientInsert("qa.submit", "product_questions", {
      product_slug: productSlug,
      user_id: user.id,
      question: text,
    }, `qa.submit:${user.id}:${productSlug}:${text.slice(0, 64)}`);
    submittingRef.current = false;
    setBusy(false);
    if (!r.ok) {
      console.error("[ProductQA] question insert failed", { productSlug, userId: user.id, error: r.error });
      toast.error("Couldn't submit your question. Please try again.");
      return false;
    }
    setDraft("");
    if (typeof window !== "undefined") {
      localStorage.removeItem(draftKey(productSlug));
      localStorage.removeItem(pendingKey(productSlug));
    }
    if (!r.queued) {
      toast.success("Your question was submitted.");
      await load();
    }
    return true;
  }


  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current || busy) return;
    if (!draft.trim()) {
      toast.error("Please type a question first.");
      return;
    }
    if (!user) {
      // Preserve the question and continue after authentication.
      if (typeof window !== "undefined") {
        localStorage.setItem(draftKey(productSlug), draft);
        localStorage.setItem(pendingKey(productSlug), "1");
        localStorage.setItem("post_auth_redirect", window.location.pathname);
      }
      toast.message("Sign in to post your question — we'll keep your draft.");
      navigate({ to: "/auth", search: { redirect: window.location.pathname } });
      return;
    }
    await insertQuestion();
  }

  async function postAnswer(id: string) {
    const text = (answerDrafts[id] ?? "").trim();
    if (!text || !user) return;
    const { error } = await supabase
      .from("product_questions")
      .update({ answer: text, answered_by: user.id, answered_at: new Date().toISOString() })
      .eq("id", id);
    if (error) {
      console.error("[ProductQA] answer update failed", { id, code: error.code, message: error.message });
      toast.error("Couldn't post the answer.");
      return;
    }
    setAnswerDrafts((d) => ({ ...d, [id]: "" }));
    setEditingId(null);
    toast.success("Answer posted.");
    await load();
  }

  async function remove(id: string) {
    if (!confirm("Are you sure you want to delete this question?")) return;
    const { error } = await supabase.rpc("soft_delete_own_question", { p_id: id });
    if (error) {
      console.error("[ProductQA] delete failed", { id, code: error.code, message: error.message });
      toast.error("Couldn't delete the question.");
      return;
    }
    toast.success("Question deleted.");
    await load();
  }

  async function saveQuestion(id: string) {
    const text = questionDraft.trim();
    if (!text) return;
    const { error } = await supabase
      .from("product_questions")
      .update({ question: text })
      .eq("id", id);
    if (error) {
      console.error("[ProductQA] question edit failed", { id, code: error.code, message: error.message });
      toast.error("Couldn't update the question.");
      return;
    }
    setEditingQuestionId(null);
    setQuestionDraft("");
    toast.success("Question updated.");
    await load();
  }


  const answeredCount = items.filter((q) => q.answer).length;
  const query = search.trim().toLowerCase();
  const filtered = query
    ? items.filter((it) => it.question.toLowerCase().includes(query) || (it.answer ?? "").toLowerCase().includes(query))
    : items;

  return (
    <section className="max-w-7xl mx-auto pt-2 pb-16">
      {items.length > 0 && (
        <div className="mb-6 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">
          {items.length} {items.length === 1 ? "question" : "questions"} · {answeredCount} answered
        </div>
      )}

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
        <div className="flex items-center justify-between mt-3 gap-3">
          <span className="text-[10px] font-mono text-muted-foreground">
            {draft.length}/500{!user && draft.trim() ? " · sign in to post" : ""}
          </span>
          <button
            type="submit"
            disabled={busy || !draft.trim()}
            className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"
          >
            {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}
            {busy ? "Submitting…" : user ? "Submit" : "Sign in to submit"}
          </button>
        </div>
      </form>



      {/* Search */}
      {items.length > 0 && (
        <div className="relative mb-6">
          <Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search questions…"
            className="w-full bg-card border border-border rounded-full pl-11 pr-4 py-3 text-sm focus:outline-none focus:border-accent"
          />
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
      ) : filtered.length === 0 ? (
        <p className="py-10 text-center text-sm text-muted-foreground">No questions match “{search}”.</p>
      ) : (
        <ul className="space-y-4">
          {filtered.map((q) => {
            const canDelete = isAdmin || q.is_mine;
            const canAnswer = isAdmin && !q.answer;
            const canEditQuestion = q.is_mine;
            const name = q.author_name || "Customer";
            return (
              <li key={q.id} className="bg-card border border-border rounded-2xl p-5 sm:p-6">
                <div className="flex items-start gap-4">
                  <div className="size-11 shrink-0 rounded-full bg-muted overflow-hidden grid place-items-center font-display text-sm font-bold ring-1 ring-white/10">
                    {q.author_avatar ? <img src={q.author_avatar} alt="" className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase()}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="text-sm font-display truncate">{name}</p>
                      {q.answer ? (
                        <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/20 bg-emerald-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-emerald-400">
                          <CheckCircle2 className="size-2.5" /> Answered
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full border border-amber-500/20 bg-amber-500/10 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-amber-400">
                          <Clock className="size-2.5" /> Pending
                        </span>
                      )}
                    </div>
                    {editingQuestionId === q.id ? (
                      <div className="mt-2">
                        <textarea
                          value={questionDraft}
                          onChange={(e) => setQuestionDraft(e.target.value)}
                          rows={3}
                          maxLength={500}
                          className="w-full bg-background border border-border rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent resize-none"
                        />
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => saveQuestion(q.id)}
                            className="bg-accent text-accent-foreground font-bold px-4 py-1.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all"
                          >
                            Save
                          </button>
                          <button
                            onClick={() => { setEditingQuestionId(null); setQuestionDraft(""); }}
                            className="px-3 py-1.5 rounded-full text-[11px] uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"
                          >
                            Cancel
                          </button>
                        </div>
                      </div>
                    ) : (
                      <p className="text-sm leading-relaxed mt-1 break-words whitespace-pre-wrap">{q.question}</p>
                    )}
                    <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                      {new Date(q.created_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                    </p>
                  </div>
                  <div className="flex items-center gap-1 shrink-0">
                    {canEditQuestion && editingQuestionId !== q.id && (
                      <button
                        onClick={() => { setEditingQuestionId(q.id); setQuestionDraft(q.question); }}
                        aria-label="Edit question"
                        className="text-muted-foreground hover:text-accent transition-colors"
                      >
                        <Pencil className="size-4" />
                      </button>
                    )}
                    {canDelete && (
                      <button onClick={() => remove(q.id)} aria-label="Delete" className="text-muted-foreground hover:text-destructive transition-colors">
                        <Trash2 className="size-4" />
                      </button>
                    )}
                  </div>
                </div>



                {q.answer && editingId !== q.id ? (
                  <div className="mt-4 ml-[3.75rem] flex items-start gap-3 p-4 sm:p-5 bg-accent/[0.07] border border-accent/25 rounded-2xl shadow-[0_16px_40px_-30px_oklch(0_0_0/0.9)]">
                    <span className="size-10 shrink-0 rounded-full overflow-hidden grid place-items-center ring-1 ring-accent/40 bg-card">
                      <img src={brandLogo} alt="FoundOurMarket" className="w-full h-full object-cover" />
                    </span>
                    <div className="flex-1 min-w-0">
                      <div className="flex flex-wrap items-center gap-2 mb-1.5">
                        <span className="text-sm font-display">FoundOurMarket Official</span>
                        <span className="inline-flex items-center gap-1 rounded-full border border-accent/30 bg-accent/15 px-2 py-0.5 text-[9px] font-mono uppercase tracking-wider text-accent">
                          <BadgeCheck className="size-2.5" /> Verified Staff
                        </span>
                      </div>
                      <p className="text-sm leading-relaxed break-words whitespace-pre-wrap">{q.answer}</p>
                      {q.answered_at && (
                        <p className="mt-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                          Answered {new Date(q.answered_at).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric" })}
                        </p>
                      )}
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
                  <div className="mt-4 ml-[3.75rem] flex gap-2">
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
                  <p className="mt-3 ml-[3.75rem] text-[11px] font-mono text-muted-foreground italic">Awaiting reply…</p>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </section>
  );
}
