import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  Star, Loader2, CheckCircle2, Pencil, Trash2, ThumbsUp, ThumbsDown, Flag,
  ImagePlus, X, Pin, Sparkles, ShieldCheck, EyeOff, Eye, MessageSquare, Play, Brain,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useIsAdmin } from "@/lib/use-admin";
import {
  type Review, type ReviewMedia, REPORT_REASONS,
  uploadReviewMedia, validateReviewFile, castReviewVote, reportReview, ratingBuckets,
} from "@/lib/reviews";
import { analyzeReviews } from "@/lib/reviews-ai.functions";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/site/StarRating";

type ProfileMap = Record<string, { full_name: string | null; avatar_url: string | null }>;

// Full column set incl. moderation/sentiment/fraud internals — admin moderation only.
const REVIEW_COLS =
  "id, product_slug, user_id, rating, title, body, media, status, pinned, featured, verified_purchase, helpful_count, not_helpful_count, report_count, is_flagged, admin_reply, admin_reply_at, admin_reply_by, sentiment, sentiment_score, sentiment_summary, fake_score, fake_reasons, created_at";
// Safe public columns — granted to anonymous visitors (no internal scoring exposed).
const REVIEW_COLS_PUBLIC =
  "id, product_slug, user_id, rating, title, body, media, status, pinned, featured, verified_purchase, helpful_count, not_helpful_count, admin_reply, admin_reply_at, created_at";

export function ProductReviews({ productSlug, onAggregateChange }: { productSlug: string; onAggregateChange?: () => void }) {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const runAnalyze = useServerFn(analyzeReviews);

  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  const [myVotes, setMyVotes] = useState<Record<string, "helpful" | "not_helpful">>({});
  const [trust, setTrust] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);

  // compose form
  const [rating, setRating] = useState(5);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<ReviewMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // per-review UI state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState<string | null>(null);

  const load = useCallback(async () => {
    const table = (isAdmin ? "product_reviews" : "product_reviews_public") as "product_reviews_public";
    const { data } = await supabase
      .from(table)
      .select((isAdmin ? REVIEW_COLS : REVIEW_COLS_PUBLIC) as string)
      .eq("product_slug", productSlug)
      .order("created_at", { ascending: false });
    const list = ((data ?? []) as unknown as Review[]).map((r) => ({ ...r, media: (r.media ?? []) as ReviewMedia[] }));
    // customers only see published; staff see everything
    const visible = list.filter((r) => r.status === "published");
    setReviews(isAdmin ? list : visible);

    const ids = Array.from(new Set(list.map((r) => r.user_id)));
    if (ids.length) {
      const { data: profs } = await supabase.rpc("get_public_profiles", { _ids: ids });
      const map: ProfileMap = {};
      (profs ?? []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
      setProfiles(map);
    }
    const { data: ts } = await supabase.rpc("product_trust_score", { _slug: productSlug });
    if (typeof ts === "number") setTrust(ts);
    setLoading(false);
  }, [productSlug, isAdmin]);

  const loadMyVotes = useCallback(async () => {
    if (!user) { setMyVotes({}); return; }
    const { data } = await supabase.from("review_votes").select("review_id, vote").eq("user_id", user.id);
    const map: Record<string, "helpful" | "not_helpful"> = {};
    (data ?? []).forEach((v: any) => { map[v.review_id] = v.vote; });
    setMyVotes(map);
  }, [user]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { loadMyVotes(); }, [loadMyVotes]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`reviews:${productSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_reviews", filter: `product_slug=eq.${productSlug}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_votes" }, () => { load(); loadMyVotes(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [productSlug, load, loadMyVotes]);

  const sorted = useMemo(() => {
    return [...reviews].sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [reviews]);

  const published = reviews.filter((r) => r.status === "published");
  const avg = published.length ? published.reduce((s, r) => s + r.rating, 0) / published.length : 0;
  const buckets = ratingBuckets(published);

  async function onPickFiles(files: FileList | null) {
    if (!files || !user) return;
    const arr = Array.from(files).slice(0, 6 - pendingMedia.length);
    setUploading(true);
    for (const f of arr) {
      const err = validateReviewFile(f);
      if (err) { toast.error(err); continue; }
      try {
        const m = await uploadReviewMedia(f, user.id);
        setPendingMedia((p) => [...p, m]);
      } catch (e) {
        toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
      }
    }
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;
    setSubmitting(true);
    const { error } = await supabase.from("product_reviews").insert({
      product_slug: productSlug,
      user_id: user.id,
      rating,
      title: title.trim() || null,
      body: body.trim() || null,
      media: pendingMedia,
    });
    setSubmitting(false);
    if (error) { toast.error("Could not post review", { description: error.message }); return; }
    setRating(5); setTitle(""); setBody(""); setPendingMedia([]);
    toast.success("Review posted");
    await load();
    onAggregateChange?.();
  }

  async function saveEdit(id: string) {
    const { error } = await supabase.from("product_reviews")
      .update({ rating: editRating, title: editTitle.trim() || null, body: editBody.trim() || null })
      .eq("id", id);
    if (error) { toast.error(error.message); return; }
    setEditingId(null);
    await load();
    onAggregateChange?.();
  }

  async function remove(id: string) {
    if (!confirm("Delete this review?")) return;
    const { error } = await supabase.from("product_reviews").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    await load();
    onAggregateChange?.();
  }

  async function vote(r: Review, v: "helpful" | "not_helpful") {
    if (!user) { toast.error("Sign in to vote"); return; }
    const next = myVotes[r.id] === v ? null : v;
    setMyVotes((m) => { const c = { ...m }; if (next) c[r.id] = next; else delete c[r.id]; return c; });
    const { error } = await castReviewVote(r.id, user.id, next);
    if (error) toast.error(error.message);
  }

  async function submitReport(reviewId: string, reason: string) {
    if (!user) return;
    const { error } = await reportReview(reviewId, user.id, reason);
    setReportFor(null);
    if (error) toast.error(error.message);
    else toast.success("Reported — thank you. Our team will review it.");
  }

  // staff moderation
  async function patch(id: string, fields: TablesUpdate<"product_reviews">) {
    const { error } = await supabase.from("product_reviews").update(fields).eq("id", id);
    if (error) toast.error(error.message);
  }
  async function postReply(id: string) {
    const text = (replyDrafts[id] ?? "").trim();
    if (!text || !user) return;
    await patch(id, { admin_reply: text, admin_reply_at: new Date().toISOString(), admin_reply_by: user.id });
    setReplyDrafts((d) => ({ ...d, [id]: "" }));
    toast.success("Reply published");
  }
  async function analyzeOne(id: string) {
    setAnalyzing(id);
    try {
      await runAnalyze({ data: { ids: [id] } });
      toast.success("AI analysis complete");
    } catch (e) {
      toast.error("Analysis failed", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setAnalyzing(null);
    }
  }

  return (
    <section className="max-w-7xl mx-auto px-4 sm:px-6 py-10 sm:py-14 border-t border-border/60">
      <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
        <h2 className="text-xl sm:text-2xl font-display tracking-tight">Customer Reviews</h2>
        {trust !== null && published.length > 0 && (
          <div className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/10 px-3 py-1.5">
            <ShieldCheck className="size-4 text-accent" />
            <span className="text-xs font-mono uppercase tracking-widest text-accent">Trust score {trust}/100</span>
          </div>
        )}
      </div>

      {/* Summary */}
      {published.length > 0 && (
        <div className="mb-8 grid gap-6 sm:grid-cols-[auto_1fr] sm:items-center rounded-2xl border border-white/10 bg-card/40 p-5">
          <div className="text-center sm:pr-6 sm:border-r sm:border-border/60">
            <p className="text-4xl font-display">{avg.toFixed(1)}</p>
            <div className="mt-1 flex items-center justify-center">
              <StarRating rating={avg} starClassName="size-3.5" />
            </div>
            <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{published.length} reviews</p>
          </div>
          <div className="space-y-1.5">
            {[5, 4, 3, 2, 1].map((star) => {
              const count = buckets[star - 1];
              const pct = published.length ? (count / published.length) * 100 : 0;
              return (
                <div key={star} className="flex items-center gap-2 text-[11px]">
                  <span className="w-8 font-mono text-muted-foreground">{star}★</span>
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-white/5">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${pct}%` }} />
                  </span>
                  <span className="w-8 text-right font-mono text-muted-foreground">{count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 lg:gap-10">
        {/* Compose */}
        <div className="lg:col-span-1">
          {user ? (
            <form onSubmit={submit} className="bg-card/60 backdrop-blur-xl border border-border rounded-2xl p-4 sm:p-5">
              <h3 className="text-sm font-display mb-3">Write a review</h3>
              <div className="flex items-center gap-1 mb-4">
                {Array.from({ length: 5 }).map((_, i) => {
                  const value = i + 1;
                  const active = (hoverRating || rating) >= value;
                  return (
                    <button key={i} type="button" onMouseEnter={() => setHoverRating(value)} onMouseLeave={() => setHoverRating(0)} onClick={() => setRating(value)} aria-label={`Rate ${value}`} className="p-1">
                      <Star className={cn("size-5", active ? "fill-accent text-accent" : "text-muted-foreground")} />
                    </button>
                  );
                })}
              </div>
              <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="Title (optional)"
                className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-2.5 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
              <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={3} placeholder="Share your thoughts…"
                className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />

              {/* media */}
              {pendingMedia.length > 0 && (
                <div className="mb-3 flex flex-wrap gap-2">
                  {pendingMedia.map((m, i) => (
                    <div key={i} className="relative size-16 overflow-hidden rounded-lg border border-border">
                      {m.type === "image" ? <img src={m.url} alt="" className="size-full object-cover" /> : <video src={m.url} className="size-full object-cover" />}
                      <button type="button" onClick={() => setPendingMedia((p) => p.filter((_, idx) => idx !== i))}
                        className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground ring-1 ring-border">
                        <X className="size-3" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
              <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
              <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading || pendingMedia.length >= 6}
                className="mb-3 inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs text-muted-foreground hover:text-foreground disabled:opacity-50">
                {uploading ? <Loader2 className="size-3.5 animate-spin" /> : <ImagePlus className="size-3.5" />}
                Add photos / videos
              </button>

              <button type="submit" disabled={submitting || uploading}
                className="w-full px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110 disabled:opacity-50">
                {submitting ? "Posting…" : "Submit review"}
              </button>
            </form>
          ) : (
            <div className="bg-card border border-border rounded-2xl p-6">
              <p className="text-sm text-muted-foreground mb-4">Sign in to leave a review.</p>
              <Link to="/auth" className="inline-block px-5 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:brightness-110">Sign in</Link>
            </div>
          )}
        </div>

        {/* List */}
        <div className="lg:col-span-2">
          {loading ? (
            <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : sorted.length === 0 ? (
            <p className="text-sm text-muted-foreground">No reviews yet. Be the first to share your experience.</p>
          ) : (
            <ul className="space-y-3">
              {sorted.map((r) => {
                const prof = profiles[r.user_id];
                const name = prof?.full_name || "Anonymous";
                const isOwn = user?.id === r.user_id;
                const editing = editingId === r.id;
                return (
                  <li key={r.id} className={cn(
                    "rounded-2xl border bg-card/40 backdrop-blur-xl p-4 sm:p-5 transition-all",
                    r.pinned ? "border-accent/40" : "border-white/10",
                    r.status !== "published" && "opacity-70",
                  )}>
                    {/* staff status badges */}
                    {isAdmin && (r.status !== "published" || r.is_flagged || r.featured || r.pinned) && (
                      <div className="mb-2 flex flex-wrap gap-1.5">
                        {r.pinned && <Badge tone="accent"><Pin className="size-2.5" /> Pinned</Badge>}
                        {r.featured && <Badge tone="accent"><Sparkles className="size-2.5" /> Featured</Badge>}
                        {r.status !== "published" && <Badge tone="muted">{r.status}</Badge>}
                        {r.is_flagged && <Badge tone="danger"><Flag className="size-2.5" /> {r.report_count} report{r.report_count === 1 ? "" : "s"}</Badge>}
                      </div>
                    )}

                    {editing ? (
                      <div>
                        <div className="flex items-center gap-1 mb-3">
                          {Array.from({ length: 5 }).map((_, i) => (
                            <button key={i} type="button" onClick={() => setEditRating(i + 1)} className="p-1">
                              <Star className={cn("size-5", editRating >= i + 1 ? "fill-accent text-accent" : "text-muted-foreground")} />
                            </button>
                          ))}
                        </div>
                        <input value={editTitle} onChange={(e) => setEditTitle(e.target.value)} maxLength={120}
                          className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-2.5 focus:outline-none focus:border-accent" />
                        <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={2000} rows={3}
                          className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent" />
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(r.id)} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground">Update</button>
                          <button onClick={() => setEditingId(null)} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest border border-border">Cancel</button>
                        </div>
                      </div>
                    ) : (
                      <>
                        <div className="flex items-center gap-3 mb-2.5">
                          <div className="size-9 rounded-full bg-muted overflow-hidden grid place-items-center text-xs font-mono shrink-0 ring-1 ring-white/10">
                            {prof?.avatar_url ? <img src={prof.avatar_url} alt="" className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-display flex items-center gap-1.5 truncate">
                              {name}
                              {r.verified_purchase && (
                                <span className="inline-flex items-center gap-1 text-[8px] font-mono uppercase tracking-wider text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.5 rounded-full shrink-0">
                                  <CheckCircle2 className="size-2.5" /> Verified
                                </span>
                              )}
                            </p>
                            <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground/70">{new Date(r.created_at).toLocaleDateString()}</p>
                          </div>
                          <div className="ml-auto flex items-center">
                            <StarRating rating={r.rating} starClassName="size-3" />
                          </div>
                        </div>

                        {r.title && <p className="text-sm font-display mb-1">{r.title}</p>}
                        {r.body && <p className="text-[13px] text-muted-foreground leading-relaxed whitespace-pre-wrap">{r.body}</p>}

                        {/* media gallery */}
                        {r.media?.length > 0 && (
                          <div className="mt-3 flex flex-wrap gap-2">
                            {r.media.map((m, i) => (
                              <a key={i} href={m.url} target="_blank" rel="noreferrer" className="relative size-20 overflow-hidden rounded-lg border border-border group">
                                {m.type === "image" ? (
                                  <img src={m.url} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover:scale-105" />
                                ) : (
                                  <>
                                    <video src={m.url} className="size-full object-cover" />
                                    <span className="absolute inset-0 grid place-items-center bg-black/30"><Play className="size-5 text-white" /></span>
                                  </>
                                )}
                              </a>
                            ))}
                          </div>
                        )}

                        {/* admin reply */}
                        {r.admin_reply && (
                          <div className="mt-3 ml-2 flex items-start gap-2 rounded-xl border border-accent/20 bg-accent/5 p-3">
                            <ShieldCheck className="size-4 text-accent shrink-0 mt-0.5" />
                            <div>
                              <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">FoundOurMarket · Official reply</p>
                              <p className="text-[13px] leading-relaxed">{r.admin_reply}</p>
                            </div>
                          </div>
                        )}

                        {/* AI insight (staff) */}
                        {isAdmin && r.sentiment && (
                          <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] font-mono">
                            <Badge tone={r.sentiment === "negative" ? "danger" : r.sentiment === "positive" ? "accent" : "muted"}>
                              <Brain className="size-2.5" /> {r.sentiment} {r.sentiment_score ?? 0}
                            </Badge>
                            {typeof r.fake_score === "number" && (
                              <Badge tone={r.fake_score >= 60 ? "danger" : "muted"}>Fake risk {r.fake_score}</Badge>
                            )}
                            {r.sentiment_summary && <span className="text-muted-foreground">{r.sentiment_summary}</span>}
                          </div>
                        )}

                        {/* action row */}
                        <div className="mt-3 flex flex-wrap items-center gap-3">
                          <button onClick={() => vote(r, "helpful")} className={cn("inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors", myVotes[r.id] === "helpful" ? "text-accent" : "text-muted-foreground hover:text-foreground")}>
                            <ThumbsUp className="size-3.5" /> {r.helpful_count}
                          </button>
                          <button onClick={() => vote(r, "not_helpful")} className={cn("inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors", myVotes[r.id] === "not_helpful" ? "text-destructive" : "text-muted-foreground hover:text-foreground")}>
                            <ThumbsDown className="size-3.5" /> {r.not_helpful_count}
                          </button>
                          {!isOwn && user && (
                            <button onClick={() => setReportFor(reportFor === r.id ? null : r.id)} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive">
                              <Flag className="size-3.5" /> Report
                            </button>
                          )}
                          {isOwn && (
                            <button onClick={() => { setEditingId(r.id); setEditRating(r.rating); setEditTitle(r.title ?? ""); setEditBody(r.body ?? ""); }} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">
                              <Pencil className="size-3.5" /> Edit
                            </button>
                          )}
                          {(isOwn || isAdmin) && (
                            <button onClick={() => remove(r.id)} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive">
                              <Trash2 className="size-3.5" /> Delete
                            </button>
                          )}
                        </div>

                        {/* report reasons */}
                        {reportFor === r.id && (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {REPORT_REASONS.map((reason) => (
                              <button key={reason} onClick={() => submitReport(r.id, reason)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-destructive/50 hover:text-destructive">
                                {reason}
                              </button>
                            ))}
                          </div>
                        )}

                        {/* staff moderation toolbar */}
                        {isAdmin && (
                          <div className="mt-3 border-t border-border/50 pt-3">
                            <div className="flex flex-wrap gap-1.5">
                              <ModBtn onClick={() => patch(r.id, { pinned: !r.pinned })} active={r.pinned}><Pin className="size-3" /> Pin</ModBtn>
                              <ModBtn onClick={() => patch(r.id, { featured: !r.featured })} active={r.featured}><Sparkles className="size-3" /> Feature</ModBtn>
                              {r.status === "published" ? (
                                <ModBtn onClick={() => patch(r.id, { status: "hidden" })}><EyeOff className="size-3" /> Hide</ModBtn>
                              ) : (
                                <ModBtn onClick={() => patch(r.id, { status: "published" })}><Eye className="size-3" /> Publish</ModBtn>
                              )}
                              <ModBtn onClick={() => analyzeOne(r.id)} disabled={analyzing === r.id}>
                                {analyzing === r.id ? <Loader2 className="size-3 animate-spin" /> : <Brain className="size-3" />} AI analyze
                              </ModBtn>
                            </div>
                            <div className="mt-2 flex gap-2">
                              <input value={replyDrafts[r.id] ?? r.admin_reply ?? ""} onChange={(e) => setReplyDrafts((d) => ({ ...d, [r.id]: e.target.value }))} placeholder="Public reply…"
                                className="flex-1 bg-background border border-border rounded-full px-4 py-2 text-sm focus:outline-none focus:border-accent" />
                              <button onClick={() => postReply(r.id)} className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground font-bold px-4 rounded-full text-[11px] uppercase tracking-widest">
                                <MessageSquare className="size-3.5" /> {r.admin_reply ? "Update" : "Reply"}
                              </button>
                            </div>
                          </div>
                        )}
                      </>
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

function Badge({ children, tone }: { children: React.ReactNode; tone: "accent" | "danger" | "muted" }) {
  const cls = tone === "accent" ? "text-accent bg-accent/10 border-accent/20"
    : tone === "danger" ? "text-destructive bg-destructive/10 border-destructive/20"
    : "text-muted-foreground bg-white/5 border-white/10";
  return <span className={cn("inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wider", cls)}>{children}</span>;
}

function ModBtn({ children, onClick, active, disabled }: { children: React.ReactNode; onClick: () => void; active?: boolean; disabled?: boolean }) {
  return (
    <button onClick={onClick} disabled={disabled} className={cn(
      "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors disabled:opacity-50",
      active ? "border-accent/50 bg-accent/15 text-accent" : "border-border text-muted-foreground hover:text-foreground",
    )}>{children}</button>
  );
}
