import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Star, Loader2, CheckCircle2, Pencil, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

type Review = {
  id: string;
  user_id: string;
  rating: number;
  title: string | null;
  body: string | null;
  created_at: string;
};

type ProfileMap = Record<string, { full_name: string | null; avatar_url: string | null }>;

export function ProductReviews({ productSlug, onAggregateChange }: { productSlug: string; onAggregateChange?: () => void }) {
  const { user } = useAuth();
  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editHoverRating, setEditHoverRating] = useState(0);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");


  const load = async () => {
    setLoading(true);
    const { data, error: err } = await supabase
      .from("product_reviews")
      .select("id, user_id, rating, title, body, created_at")
      .eq("product_slug", productSlug)
      .order("created_at", { ascending: false });
    if (err) {
      setError(err.message);
      setLoading(false);
      return;
    }
    const list = (data ?? []) as Review[];
    setReviews(list);
    const ids = Array.from(new Set(list.map((r) => r.user_id)));
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
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productSlug]);

  const resetForm = () => {
    setRating(5);
    setHoverRating(0);
    setTitle("");
    setBody("");
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditRating(5);
    setEditHoverRating(0);
    setEditTitle("");
    setEditBody("");
  };

  const startEdit = (r: Review) => {
    setEditingId(r.id);
    setEditRating(r.rating);
    setEditTitle(r.title ?? "");
    setEditBody(r.body ?? "");
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase.from("product_reviews").insert({
      product_slug: productSlug,
      user_id: user.id,
      rating,
      title: title.trim() || null,
      body: body.trim() || null,
    });
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    resetForm();
    await load();
    onAggregateChange?.();
  };

  const saveEdit = async (id: string) => {
    if (!user) return;
    setSubmitting(true);
    setError(null);
    const { error: err } = await supabase
      .from("product_reviews")
      .update({
        rating: editRating,
        title: editTitle.trim() || null,
        body: editBody.trim() || null,
      })
      .eq("id", id);
    setSubmitting(false);
    if (err) {
      setError(err.message);
      return;
    }
    cancelEdit();
    await load();
    onAggregateChange?.();
  };


  const remove = async (id: string) => {
    if (!confirm("Delete this review?")) return;
    setSubmitting(true);
    const { error: err } = await supabase.from("product_reviews").delete().eq("id", id);
    setSubmitting(false);
    if (err) { setError(err.message); return; }
    if (editingId === id) cancelEdit();
    await load();
    onAggregateChange?.();
  };

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-t border-border/60">

      <h2 className="text-xl sm:text-2xl font-display tracking-tight mb-6">Customer Reviews</h2>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        <div className="lg:col-span-1">
          {user ? (
            <form onSubmit={submit} className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-display mb-3">Write a review</h3>

              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => {
                  const value = i + 1;
                  const active = (hoverRating || rating) >= value;
                  return (
                    <button
                      key={i}
                      type="button"
                      onMouseEnter={() => setHoverRating(value)}
                      onMouseLeave={() => setHoverRating(0)}
                      onClick={() => setRating(value)}
                      aria-label={`Rate ${value} star${value > 1 ? "s" : ""}`}
                      className="p-1"
                    >
                      <Star className={`size-5 ${active ? "fill-accent text-accent" : "text-muted-foreground"}`} />
                    </button>
                  );
                })}
              </div>
              <input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                maxLength={120}
                placeholder="Title (optional)"
                className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-2.5 transition-all focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 focus:shadow-[0_0_20px_-6px_oklch(0.74_0.19_49/0.55)]"
              />
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                maxLength={2000}
                rows={3}
                placeholder="Share your thoughts…"
                className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-3 transition-all focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25 focus:shadow-[0_0_20px_-6px_oklch(0.74_0.19_49/0.55)]"
              />

              {error && !editingId && <p className="text-xs text-red-400 mb-3">{error}</p>}
              <button
                type="submit"
                disabled={submitting}
                className="w-full px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50"
              >
                {submitting && !editingId ? "Saving…" : "Submit"}
              </button>
            </form>

          ) : (
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-sm text-muted-foreground mb-4">Sign in to leave a review.</p>
              <Link to="/auth" className="inline-block px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110">
                Sign in
              </Link>
            </div>
          )}
        </div>

        <div className="lg:col-span-2">
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : reviews.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your experience.</p>
          ) : (
            <ul className="space-y-3">
              {reviews.map((r) => {
                const prof = profiles[r.user_id];
                const name = prof?.full_name || "Anonymous";
                const isOwn = user?.id === r.user_id;
                return (
                  <li key={r.id} className="rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl p-4 sm:p-5 shadow-[0_18px_40px_-24px_oklch(0_0_0/0.8)] transition-all hover:border-accent/30 hover:-translate-y-0.5">
                    <div className="flex items-center gap-3 mb-2.5">
                      <div className="size-9 rounded-full bg-muted overflow-hidden grid place-items-center text-xs font-mono shrink-0 ring-1 ring-white/10">
                        {prof?.avatar_url ? <img src={prof.avatar_url} alt="" className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase()}
                      </div>
                      <div className="min-w-0">
                        <p className="text-sm font-display flex items-center gap-1.5 truncate">
                          {name}
                          <span className="inline-flex items-center gap-1 text-[8px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                            <CheckCircle2 className="size-2.5" /> Verified Purchase
                          </span>
                        </p>
                        <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">
                          {new Date(r.created_at).toLocaleDateString()}
                        </p>
                      </div>
                      <div className="ml-auto flex items-center gap-0.5">
                        {Array.from({ length: 5 }).map((_, i) => (
                          <Star key={i} className={`size-3 ${i < r.rating ? "fill-accent text-accent drop-shadow-[0_0_5px_oklch(0.74_0.19_49/0.6)]" : "text-muted-foreground/30"}`} />
                        ))}
                      </div>
                    </div>
                    {r.title && <p className="text-sm font-display mb-1">{r.title}</p>}
                    {r.body && <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{r.body}</p>}
                    {isOwn && (
                      <div className="mt-3 flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => startEdit(r)}
                          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"
                        >
                          <Pencil className="size-3" /> Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => remove(r.id)}
                          className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive transition-colors"
                        >
                          <Trash2 className="size-3" /> Delete
                        </button>
                      </div>
                    )}
                  </li>
                );

              })}
            </ul>
          )}
        </div>
      </div>
    </section>
  );
}
