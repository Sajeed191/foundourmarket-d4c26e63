import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { motion, AnimatePresence } from "framer-motion";
import {
  Star, Loader2, CheckCircle2, Pencil, Trash2, ThumbsUp, ThumbsDown, Flag,
  ImagePlus, X, Pin, Sparkles, ShieldCheck, EyeOff, Eye, MessageSquare, Play, Brain,
  Camera, BadgeCheck, PackageCheck, ChevronLeft, ChevronRight, ThumbsUp as Recommend,
  Users, TrendingUp, Check, ArrowRight, ArrowLeft, ZoomIn,
  LogIn, UserPlus, ShoppingBag, Repeat, HelpCircle, LifeBuoy, Bookmark, Truck, CalendarCheck,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import type { TablesUpdate } from "@/integrations/supabase/types";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useWishlist } from "@/lib/wishlist";
import { useIsAdmin } from "@/lib/use-admin";
import {
  type Review, type ReviewMedia, REPORT_REASONS,
  uploadReviewMedia, validateReviewFile, castReviewVote, reportReview, ratingBuckets,
} from "@/lib/reviews";
import { analyzeReviews } from "@/lib/reviews-ai.functions";
import { cn } from "@/lib/utils";
import { StarRating } from "@/components/site/StarRating";

type ProfileMap = Record<string, { full_name: string | null; avatar_url: string | null }>;

type PurchaseState = {
  purchased: boolean;
  delivered: boolean;
  status?: string | null;
  purchased_at?: string | null;
  delivered_at?: string | null;
};

type ReviewFilter =
  | "all" | "verified" | "photo" | "video" | "featured" | "pinned" | "ai"
  | "published" | "pending" | "hidden" | "rejected" | "deleted"
  | "5" | "4" | "3" | "2" | "1";
type ReviewSort = "newest" | "oldest" | "helpful" | "highest" | "lowest";

// Full column set incl. moderation/sentiment/fraud internals — admin moderation only.
const REVIEW_COLS =
  "id, product_slug, user_id, rating, title, body, media, status, pinned, featured, verified_purchase, helpful_count, not_helpful_count, report_count, is_flagged, admin_reply, admin_reply_at, admin_reply_by, sentiment, sentiment_score, sentiment_summary, fake_score, fake_reasons, created_at, deleted_at, deleted_by, deleted_reason";
// Safe public columns — granted to anonymous visitors. No reviewer UUIDs are
// exposed; author display name/avatar are denormalized into the view instead.
const REVIEW_COLS_PUBLIC =
  "id, product_slug, author_name, author_avatar_url, rating, title, body, media, status, pinned, featured, verified_purchase, helpful_count, not_helpful_count, admin_reply, admin_reply_at, created_at";

function fmtDate(d: string) {
  return new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });
}

// Themes derived from review text to surface "what customers love".
const HIGHLIGHT_THEMES: { label: string; keywords: string[] }[] = [
  { label: "Quality", keywords: ["quality", "well made", "well-made", "durable", "premium", "sturdy", "excellent", "build"] },
  { label: "Fast Delivery", keywords: ["delivery", "shipping", "fast", "quick", "arrived", "on time", "speedy", "prompt"] },
  { label: "Value for Money", keywords: ["value", "price", "worth", "affordable", "cheap", "bargain", "deal", "money"] },
  { label: "Packaging", keywords: ["packaging", "packed", "package", "wrapped", "box", "secure"] },
  { label: "As Described", keywords: ["as described", "as shown", "accurate", "exactly", "matches", "true to"] },
  { label: "Comfort", keywords: ["comfort", "comfortable", "soft", "cozy", "fit"] },
];

export function ProductReviews({ productSlug, onAggregateChange }: { productSlug: string; onAggregateChange?: () => void }) {
  const { user } = useAuth();
  const { isAdmin } = useIsAdmin();
  const runAnalyze = useServerFn(analyzeReviews);
  const cart = useCart();
  const wishlist = useWishlist();

  const [reviews, setReviews] = useState<Review[]>([]);
  const [profiles, setProfiles] = useState<ProfileMap>({});
  // The signed-in customer's own review (fetched directly; the public view no
  // longer exposes user_id so we can't derive ownership from the list).
  const [myReview, setMyReview] = useState<Review | null>(null);
  const [myVotes, setMyVotes] = useState<Record<string, "helpful" | "not_helpful">>({});
  const [trust, setTrust] = useState<number | null>(null);
  const [eligible, setEligible] = useState(false);
  const [purchase, setPurchase] = useState<PurchaseState>({ purchased: false, delivered: false });
  const [buyingAgain, setBuyingAgain] = useState(false);
  const [loading, setLoading] = useState(true);

  // browse state
  const [filter, setFilter] = useState<ReviewFilter>("all");
  const [sort, setSort] = useState<ReviewSort>("newest");
  const [lightboxList, setLightboxList] = useState<ReviewMedia[] | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  // compose form
  const [showCompose, setShowCompose] = useState(false);
  const [step, setStep] = useState(1);
  const [rating, setRating] = useState(0);
  const [hoverRating, setHoverRating] = useState(0);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [pendingMedia, setPendingMedia] = useState<ReviewMedia[]>([]);
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const composeSessionRef = useRef(0);

  // per-review UI state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editRating, setEditRating] = useState(5);
  const [editTitle, setEditTitle] = useState("");
  const [editBody, setEditBody] = useState("");
  const [editMedia, setEditMedia] = useState<ReviewMedia[]>([]);
  const [editUploading, setEditUploading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const editFileRef = useRef<HTMLInputElement>(null);
  const [replyDrafts, setReplyDrafts] = useState<Record<string, string>>({});
  const [reportFor, setReportFor] = useState<string | null>(null);
  const [reportedIds, setReportedIds] = useState<Set<string>>(new Set());
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteMode, setDeleteMode] = useState<"customer" | "admin_soft" | "admin_hard">("customer");
  const [deleteReason, setDeleteReason] = useState("");
  const [restoringId, setRestoringId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [analyzing, setAnalyzing] = useState<string | null>(null);
  const [visibleCount, setVisibleCount] = useState(6);
  const [expanded, setExpanded] = useState(false);

  const load = useCallback(async () => {
    const table = (isAdmin ? "product_reviews" : "product_reviews_public") as "product_reviews_public";
    const { data } = await supabase
      .from(table)
      .select((isAdmin ? REVIEW_COLS : REVIEW_COLS_PUBLIC) as string)
      .eq("product_slug", productSlug)
      .order("created_at", { ascending: false });
    const list = ((data ?? []) as unknown as Review[]).map((r) => ({ ...r, media: (r.media ?? []) as ReviewMedia[] }));
    const visible = list.filter((r) => r.status === "published");
    setReviews(isAdmin ? list : visible);

    // Admin reads expose user_id, so resolve author profiles by UUID. Public
    // reads carry denormalized author_name/author_avatar_url on each row.
    if (isAdmin) {
      const ids = Array.from(new Set(list.map((r) => r.user_id).filter(Boolean))) as string[];
      if (ids.length) {
        const { data: profs } = await supabase.rpc("get_public_profiles", { _ids: ids });
        const map: ProfileMap = {};
        (profs ?? []).forEach((p: any) => { map[p.id] = { full_name: p.full_name, avatar_url: p.avatar_url }; });
        setProfiles(map);
      }
    }

    // Own-review detection no longer relies on user_id being in the public
    // view — signed-in customers read their own review directly (RLS-scoped).
    if (user) {
      const { data: mine } = await supabase
        .from("product_reviews")
        .select(REVIEW_COLS)
        .eq("product_slug", productSlug)
        .eq("user_id", user.id)
        .maybeSingle();
      setMyReview(mine ? ({ ...(mine as any), media: ((mine as any).media ?? []) as ReviewMedia[] } as Review) : null);
    } else {
      setMyReview(null);
    }

    const { data: ts } = await supabase.rpc("product_trust_score", { _slug: productSlug });
    if (typeof ts === "number") setTrust(ts);
    setLoading(false);
  }, [productSlug, isAdmin, user]);

  const loadMyVotes = useCallback(async () => {
    if (!user) { setMyVotes({}); return; }
    const { data } = await supabase.from("review_votes").select("review_id, vote").eq("user_id", user.id);
    const map: Record<string, "helpful" | "not_helpful"> = {};
    (data ?? []).forEach((v: any) => { map[v.review_id] = v.vote; });
    setMyVotes(map);
  }, [user]);

  const loadMyReports = useCallback(async () => {
    if (!user) { setReportedIds(new Set()); return; }
    const { data } = await supabase.from("review_reports").select("review_id").eq("user_id", user.id);
    setReportedIds(new Set((data ?? []).map((r: any) => r.review_id as string)));
  }, [user]);

  const loadEligibility = useCallback(async () => {
    if (!user) { setEligible(false); setPurchase({ purchased: false, delivered: false }); return; }
    const [{ data }, { data: ps }] = await Promise.all([
      supabase.rpc("can_review_product", { _slug: productSlug }),
      supabase.rpc("customer_product_state", { _slug: productSlug }),
    ]);
    setEligible(data === true);
    if (ps && typeof ps === "object") setPurchase(ps as PurchaseState);
    else setPurchase({ purchased: false, delivered: false });
  }, [user, productSlug]);

  useEffect(() => { setLoading(true); load(); }, [load]);
  useEffect(() => { loadMyVotes(); }, [loadMyVotes]);
  useEffect(() => { loadMyReports(); }, [loadMyReports]);
  useEffect(() => { loadEligibility(); }, [loadEligibility]);

  // realtime
  useEffect(() => {
    const ch = supabase
      .channel(`reviews:${productSlug}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "product_reviews", filter: `product_slug=eq.${productSlug}` }, () => load())
      .on("postgres_changes", { event: "*", schema: "public", table: "review_votes" }, () => { load(); loadMyVotes(); })
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [productSlug, load, loadMyVotes]);

  const published = useMemo(() => reviews.filter((r) => r.status === "published"), [reviews]);

  // `myReview` is loaded directly in `load()` (RLS-scoped) since the public
  // view no longer carries user_id to derive ownership from the list.
  const hasReviewed = !!myReview;

  // Reviews are open to every signed-in customer. Buyers still receive the
  // Verified Purchase badge (set server-side by the mark_review_verified
  // trigger from real orders), but writing is not gated by a purchase.
  const customerState: "guest" | "can_review" | "reviewed" =
    !user ? "guest" : hasReviewed ? "reviewed" : "can_review";

  const isSaved = user ? wishlist.has(productSlug) : false;
  const avg = published.length ? published.reduce((s, r) => s + r.rating, 0) / published.length : 0;
  const buckets = ratingBuckets(published);
  const verifiedCount = published.filter((r) => r.verified_purchase).length;
  const photoReviews = published.filter((r) => (r.media?.length ?? 0) > 0);
  const recommendPct = published.length
    ? Math.round((published.filter((r) => r.rating >= 4).length / published.length) * 100)
    : 0;

  // highlights derived from review content
  const highlights = useMemo(() => {
    const text = published.map((r) => `${r.title ?? ""} ${r.body ?? ""}`.toLowerCase()).join(" \n ");
    return HIGHLIGHT_THEMES
      .map((t) => ({ label: t.label, count: t.keywords.reduce((n, k) => n + (text.includes(k) ? 1 : 0), 0) }))
      .filter((t) => t.count > 0)
      .sort((a, b) => b.count - a.count)
      .slice(0, 4);
  }, [published]);

  // gallery of all customer media (cap for performance)
  const galleryMedia = useMemo(() => {
    const all: ReviewMedia[] = [];
    for (const r of published) for (const m of r.media ?? []) all.push(m);
    return all;
  }, [published]);

  const sorted = useMemo(() => {
    let list = reviews.slice();
    list = list.filter((r) => {
      // Deleted reviews are hidden by default; only visible under the explicit
      // "Deleted" filter (admin-only archive view).
      if (r.status === "deleted" && filter !== "deleted") return false;
      switch (filter) {
        case "verified": return r.verified_purchase;
        case "photo": return (r.media ?? []).some((m) => m.type === "image");
        case "video": return (r.media ?? []).some((m) => m.type === "video");
        case "featured": return !!r.featured;
        case "pinned": return !!r.pinned;
        case "ai": return !!(r.sentiment_summary || r.fake_reasons || r.sentiment);
        case "published": return r.status === "published";
        case "pending": return r.status === "pending";
        case "hidden": return r.status === "hidden";
        case "rejected": return r.status === "rejected";
        case "deleted": return r.status === "deleted";
        case "5": return Math.round(r.rating) === 5;
        case "4": return Math.round(r.rating) === 4;
        case "3": return Math.round(r.rating) === 3;
        case "2": return Math.round(r.rating) === 2;
        case "1": return Math.round(r.rating) === 1;
        default: return true;
      }
    });
    return list.sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      if (a.featured !== b.featured) return a.featured ? -1 : 1;
      if (sort === "helpful") return (b.helpful_count ?? 0) - (a.helpful_count ?? 0);
      if (sort === "highest") return b.rating - a.rating;
      if (sort === "lowest") return a.rating - b.rating;
      if (sort === "oldest") return +new Date(a.created_at) - +new Date(b.created_at);
      return +new Date(b.created_at) - +new Date(a.created_at);
    });
  }, [reviews, filter, sort]);

  useEffect(() => { setVisibleCount(6); }, [filter, sort]);

  function clearReviewDraft() {
    composeSessionRef.current += 1;
    setStep(1);
    setRating(0);
    setHoverRating(0);
    setTitle("");
    setBody("");
    setPendingMedia([]);
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
    if (typeof window !== "undefined") {
      window.localStorage.removeItem(`review_draft_${productSlug}`);
      window.sessionStorage.removeItem(`review_draft_${productSlug}`);
    }
  }

  function closeCompose() {
    clearReviewDraft();
    setShowCompose(false);
  }

  function discardReviewDraft() {
    closeCompose();
  }

  function openLightbox(list: ReviewMedia[], index: number) {
    setLightboxList(list);
    setLightboxIndex(index);
  }

  async function onPickFiles(files: FileList | null) {
    if (!files || !user) return;
    const sessionId = composeSessionRef.current;
    const arr = Array.from(files).slice(0, 6 - pendingMedia.length);
    setUploading(true);
    for (const f of arr) {
      if (sessionId !== composeSessionRef.current) return;
      const err = validateReviewFile(f);
      if (err) { toast.error(err); continue; }
      try {
        const m = await uploadReviewMedia(f, user.id);
        if (sessionId !== composeSessionRef.current) return;
        setPendingMedia((p) => [...p, m]);
      } catch (e) {
        toast.error("Upload failed", { description: e instanceof Error ? e.message : undefined });
      }
    }
    if (sessionId !== composeSessionRef.current) return;
    setUploading(false);
    if (fileRef.current) fileRef.current.value = "";
  }

  function openCompose() {
    if (!user) { toast.error("Sign in to write a review."); return; }
    clearReviewDraft();
    setShowCompose(true);
  }

  function scrollToQuestions() {
    document.getElementById("questions")?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function startEditMyReview() {
    if (!myReview) return;
    setEditingId(myReview.id);
    setEditRating(myReview.rating);
    setEditTitle(myReview.title ?? "");
    setEditBody(myReview.body ?? "");
    document.getElementById(`review-${myReview.id}`)?.scrollIntoView({ behavior: "smooth", block: "center" });
  }

  async function buyAgain() {
    setBuyingAgain(true);
    try {
      await cart.add(productSlug, 1);
      toast.success("Added to cart");
    } catch (e) {
      toast.error("Could not add to cart", { description: e instanceof Error ? e.message : undefined });
    } finally {
      setBuyingAgain(false);
    }
  }

  async function toggleSave() {
    await wishlist.toggle(productSlug);
    toast.success(wishlist.has(productSlug) ? "Removed from saved" : "Saved to your list");
  }

  async function submit(e?: React.FormEvent) {
    e?.preventDefault();
    if (!user) return;
    if (rating < 1) { toast.error("Choose a star rating before posting your review."); return; }
    setSubmitting(true);
    const { resilientRpc } = await import("@/lib/infra/supabase-resilient");
    const r = await resilientRpc("review.submit", "submit_review", {
      p_product_slug: productSlug,
      p_rating: rating,
      p_title: title.trim() || undefined,
      p_body: body.trim() || undefined,
      p_media: pendingMedia,
    }, `review.submit:${user.id}:${productSlug}`);
    setSubmitting(false);
    if (!r.ok) { toast.error("Could not post review", { description: (r.error as any)?.message }); return; }
    closeCompose();
    if (!r.queued) {
      toast.success("Review posted — thank you!");
      await load();
      onAggregateChange?.();
    }
  }

  async function saveEdit(id: string) {
    if (!user) return;
    setEditSaving(true);
    // Snapshot for rollback.
    const prevList = reviews;
    const prevMine = myReview;
    // Optimistic apply.
    const patchLocal = { rating: editRating, title: editTitle.trim() || null, body: editBody.trim() || null, media: editMedia };
    setReviews((list) => list.map((x) => (x.id === id ? { ...x, ...patchLocal } as Review : x)));
    if (myReview?.id === id) setMyReview({ ...myReview, ...patchLocal } as Review);
    try {
      const { resilientRpc } = await import("@/lib/infra/supabase-resilient");
      const r = await resilientRpc("review.submit", "update_own_review", {
        p_id: id,
        p_rating: editRating,
        p_title: editTitle.trim() || undefined,
        p_body: editBody.trim() || undefined,
      }, `review.update:${id}`);
      if (!r.ok) throw new Error((r.error as any)?.message ?? "Update failed");
      // Media isn't handled by the RPC — patch it directly under RLS.
      const { error: mErr } = await supabase
        .from("product_reviews")
        .update({ media: editMedia as never })
        .eq("id", id)
        .eq("user_id", user.id);
      if (mErr) throw new Error(mErr.message);
      setEditingId(null);
      toast.success("Review updated");
      if (!r.queued) { await load(); onAggregateChange?.(); }
    } catch (e) {
      setReviews(prevList);
      setMyReview(prevMine);
      toast.error(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  }

  async function onPickEditFiles(files: FileList | null) {
    if (!files || !user) return;
    setEditUploading(true);
    try {
      const uploaded: ReviewMedia[] = [];
      for (const f of Array.from(files).slice(0, 6 - editMedia.length)) {
        try {
          uploaded.push(await uploadReviewMedia(f, user.id));
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Upload failed");
        }
      }
      if (uploaded.length) setEditMedia((m) => [...m, ...uploaded].slice(0, 6));
    } finally {
      setEditUploading(false);
      if (editFileRef.current) editFileRef.current.value = "";
    }
  }

  async function confirmDelete() {
    const id = confirmDeleteId;
    if (!id) return;
    setDeleting(true);
    // Snapshot + optimistic remove.
    const prevList = reviews;
    const prevMine = myReview;
    setReviews((list) => list.filter((r) => r.id !== id));
    if (myReview?.id === id) setMyReview(null);
    try {
      const { resilientRpc } = await import("@/lib/infra/supabase-resilient");
      const r = await resilientRpc("review.submit", "soft_delete_own_review", { p_id: id }, `review.delete:${id}`);
      if (!r.ok) throw new Error((r.error as any)?.message ?? "Delete failed");
      toast.success("Review deleted");
      if (!r.queued) { await load(); onAggregateChange?.(); }
    } catch (e) {
      setReviews(prevList);
      setMyReview(prevMine);
      toast.error(e instanceof Error ? e.message : "Delete failed");
    } finally {
      setDeleting(false);
      setConfirmDeleteId(null);
    }
  }

  function requestDelete(id: string) { setConfirmDeleteId(id); }


  async function vote(r: Review, v: "helpful" | "not_helpful") {
    if (!user) { toast.error("Sign in to vote"); return; }
    const prev = myVotes[r.id] ?? null;
    const next = prev === v ? null : v;
    // Optimistically update my vote map and the review's counts.
    setMyVotes((m) => { const c = { ...m }; if (next) c[r.id] = next; else delete c[r.id]; return c; });
    const deltaHelpful = (next === "helpful" ? 1 : 0) - (prev === "helpful" ? 1 : 0);
    const deltaNot = (next === "not_helpful" ? 1 : 0) - (prev === "not_helpful" ? 1 : 0);
    setReviews((list) => list.map((x) => x.id === r.id
      ? { ...x, helpful_count: Math.max(0, (x.helpful_count ?? 0) + deltaHelpful), not_helpful_count: Math.max(0, (x.not_helpful_count ?? 0) + deltaNot) }
      : x));
    const { error } = await castReviewVote(r.id, user.id, next);
    if (error) {
      // Rollback on failure.
      setMyVotes((m) => { const c = { ...m }; if (prev) c[r.id] = prev; else delete c[r.id]; return c; });
      setReviews((list) => list.map((x) => x.id === r.id
        ? { ...x, helpful_count: Math.max(0, (x.helpful_count ?? 0) - deltaHelpful), not_helpful_count: Math.max(0, (x.not_helpful_count ?? 0) - deltaNot) }
        : x));
      toast.error(error.message);
    }
  }

  async function submitReport(reviewId: string, reason: string) {
    if (!user) return;
    const { error } = await reportReview(reviewId, user.id, reason);
    setReportFor(null);
    if (error) { toast.error(error.message); return; }
    setReportedIds((s) => new Set(s).add(reviewId));
    toast.success("Reported — thank you. Our team will review it.");
  }

  // staff moderation
  async function patch(id: string, fields: TablesUpdate<"product_reviews">, successMsg?: string): Promise<boolean> {
    // Optimistically update local list so admin sees change instantly.
    setReviews((prev) => prev.map((r) => (r.id === id ? ({ ...r, ...(fields as Partial<Review>) }) : r)));
    const { error } = await supabase.from("product_reviews").update(fields).eq("id", id);
    if (error) {
      toast.error("Action failed", { description: error.message });
      await load();
      return false;
    }
    if (successMsg) toast.success(successMsg);
    await load();
    onAggregateChange?.();
    return true;
  }
  async function postReply(id: string) {
    const text = (replyDrafts[id] ?? "").trim();
    if (!text || !user) return;
    const ok = await patch(
      id,
      { admin_reply: text, admin_reply_at: new Date().toISOString(), admin_reply_by: user.id },
      "Reply published",
    );
    if (ok) setReplyDrafts((d) => ({ ...d, [id]: "" }));
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

  const filterChips: { key: ReviewFilter; label: string }[] = [
    { key: "all", label: "All reviews" },
    { key: "verified", label: "Verified" },
    { key: "photo", label: "With photos" },
    { key: "video", label: "With videos" },
    { key: "featured", label: "Featured" },
    { key: "pinned", label: "Pinned" },
    { key: "ai", label: "AI Insights" },
    { key: "5", label: "5★" },
    { key: "4", label: "4★" },
    { key: "3", label: "3★" },
    { key: "2", label: "2★" },
    { key: "1", label: "1★" },
  ];
  const sortChips: { key: ReviewSort; label: string }[] = [
    { key: "newest", label: "Newest" },
    { key: "oldest", label: "Oldest" },
    { key: "helpful", label: "Most helpful" },
    { key: "highest", label: "Highest" },
    { key: "lowest", label: "Lowest" },
  ];

  const hasReviews = published.length > 0;
  const visible = sorted.slice(0, visibleCount);

  return (
    <section className="max-w-7xl mx-auto pt-2 pb-14 sm:pb-20">
      {trust !== null && hasReviews && (
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-accent/20 bg-accent/[0.07] px-3.5 py-1.5">
          <ShieldCheck className="size-4 text-accent" />
          <span className="text-[11px] font-mono uppercase tracking-widest text-accent">Trust score {trust}/100</span>
        </div>
      )}

      {loading ? (
        <ReviewsSkeleton />
      ) : (
        <>
          {/* ── Rating summary ──────────────────────────────────────────── */}
          {hasReviews && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.22 }}
              className="mb-10 grid gap-8 lg:grid-cols-[240px_1fr] pb-8 border-b border-border/60"
            >
              <div className="flex flex-col items-start">
                <p className="text-[44px] leading-none font-display text-foreground">{avg.toFixed(1)}</p>
                <div className="mt-2"><StarRating rating={avg} starClassName="size-4" /></div>
                <p className="mt-2 text-[13px] text-muted-foreground">
                  Based on {published.length.toLocaleString()} {published.length === 1 ? "review" : "reviews"}
                </p>
                <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 text-[12px] text-muted-foreground">
                  <span className="inline-flex items-center gap-1.5"><BadgeCheck className="size-3.5 text-emerald-400" /> {verifiedCount} verified</span>
                  <span className="inline-flex items-center gap-1.5"><Camera className="size-3.5 text-accent" /> {photoReviews.length} with photos</span>
                </div>
                {recommendPct > 0 && (
                  <p className="mt-3 text-[13px] text-foreground/85">
                    <span className="font-semibold text-accent">{recommendPct}%</span> of customers recommend this
                  </p>
                )}
              </div>
              <div className="space-y-2 self-center">
                {[5, 4, 3, 2, 1].map((star, idx) => {
                  const count = buckets[star - 1];
                  const pct = published.length ? (count / published.length) * 100 : 0;
                  return (
                    <button
                      key={star}
                      onClick={() => setFilter(String(star) as ReviewFilter)}
                      className="flex w-full items-center gap-3 text-xs group"
                    >
                      <span className="flex w-8 items-center gap-1 font-mono text-muted-foreground">
                        {star}<Star className="size-3 fill-accent/70 text-accent/70" />
                      </span>
                      <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-white/[0.06]">
                        <motion.span
                          className="block h-full rounded-full bg-accent/80 group-hover:bg-accent"
                          initial={{ width: 0 }}
                          whileInView={{ width: `${pct}%` }}
                          viewport={{ once: true }}
                          transition={{ duration: 0.5, delay: idx * 0.05, ease: "easeOut" }}
                        />
                      </span>
                      <span className="w-10 text-right font-mono text-muted-foreground tabular-nums">{Math.round(pct)}%</span>
                    </button>
                  );
                })}
              </div>
            </motion.div>
          )}

          {/* ── Single smart action card ─────────────────────────────────── */}
          {expanded && (
          <div className="mb-8 rounded-3xl border border-white/10 bg-card/50 backdrop-blur-xl p-5 sm:p-7 relative overflow-hidden">
            <div className="pointer-events-none absolute -top-24 -right-24 size-64 rounded-full opacity-50" style={{ background: "var(--gradient-ember-soft)" }} />

            {/* CASE 1 — Guest */}
            {customerState === "guest" && (
              <div className="relative">
                <p className="text-base sm:text-lg font-display leading-snug">Sign in to share your experience</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Anyone with an account can leave a review. Actual buyers get a Verified Purchase badge automatically.
                </p>
                <div className="mt-4">
                  <Link to="/auth" className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground transition-all hover:brightness-110">
                    <LogIn className="size-3.5" /> Sign In
                  </Link>
                </div>
              </div>
            )}

            {/* CASE 2 — Signed in, no review yet (buyer or not) */}
            {customerState === "can_review" && (
              <div className="relative">
                <p className="text-base sm:text-lg font-display leading-snug">Share your experience</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  {purchase.purchased
                    ? "Help other shoppers by rating this product and uploading photos."
                    : "Rate this product and help other shoppers. Buyers automatically get a Verified Purchase badge."}
                </p>
                <div className="mt-4">
                  <button onClick={openCompose} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground transition-all hover:brightness-110">
                    <Pencil className="size-3.5" /> Write Review
                  </button>
                </div>
              </div>
            )}

            {/* CASE 5 — Already reviewed */}
            {customerState === "reviewed" && myReview && (
              <div className="relative">
                <p className="text-base sm:text-lg font-display leading-snug">Thank you for your review</p>
                <p className="mt-1 text-sm text-muted-foreground">You can edit or delete your review anytime.</p>
                <div className="mt-4 flex flex-wrap gap-2.5">
                  <button onClick={startEditMyReview} className="inline-flex items-center gap-2 rounded-full bg-accent px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground transition-all hover:brightness-110">
                    <Pencil className="size-3.5" /> Edit Review
                  </button>
                  <button onClick={() => requestDelete(myReview.id)} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-foreground transition-all hover:border-destructive/50 hover:text-destructive">
                    <Trash2 className="size-3.5" /> Delete Review
                  </button>
                </div>
              </div>
            )}
          </div>
          )}



          {/* Trust boosters */}
          {expanded && hasReviews && (
            <div className="mb-8 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <StatCard icon={<Users className="size-4" />} value={verifiedCount.toLocaleString()} label="Verified Buyers" />
              <StatCard icon={<Star className="size-4" />} value={avg.toFixed(1)} label="Average Rating" />
              <StatCard icon={<TrendingUp className="size-4" />} value={`${trust ?? 98}%`} label="Trust Score" />
              <StatCard icon={<Recommend className="size-4" />} value={`${recommendPct}%`} label="Recommend" highlight />
            </div>
          )}

          {/* Review highlights */}
          {expanded && highlights.length > 0 && (
            <div className="mb-8 rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl p-5">
              <p className="mb-3 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Customers love</p>
              <div className="flex flex-wrap gap-2">
                {highlights.map((h) => (
                  <span key={h.label} className="inline-flex items-center gap-1.5 rounded-full border border-accent/20 bg-accent/[0.08] px-3.5 py-1.5 text-xs text-accent">
                    <Check className="size-3.5" /> {h.label}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Customer photos gallery */}
          {expanded && galleryMedia.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-4 text-sm font-display tracking-tight flex items-center gap-2">
                <Camera className="size-4 text-accent" /> Customer Photos &amp; Videos
                <span className="text-[11px] font-mono text-muted-foreground">({galleryMedia.length})</span>
              </h3>
              <div className="grid grid-cols-4 gap-2 sm:grid-cols-6 md:grid-cols-8">
                {galleryMedia.slice(0, 16).map((media, i) => (
                  <button
                    key={i}
                    onClick={() => openLightbox(galleryMedia, i)}
                    className="relative aspect-square overflow-hidden rounded-xl border border-white/10 group"
                  >
                    {media.type === "image" ? (
                      <img decoding="async" src={media.url} alt="" loading="lazy" className="size-full object-cover transition-transform duration-300 group-hover:scale-110" />
                    ) : (
                      <>
                        <video src={media.url} className="size-full object-cover" />
                        <span className="absolute inset-0 grid place-items-center bg-black/40"><Play className="size-5 text-white" /></span>
                      </>
                    )}
                    {i === 15 && galleryMedia.length > 16 && (
                      <span className="absolute inset-0 grid place-items-center bg-black/60 text-sm font-display text-white">+{galleryMedia.length - 16}</span>
                    )}
                    <span className="absolute inset-0 grid place-items-center bg-black/0 opacity-0 transition-all group-hover:bg-black/30 group-hover:opacity-100">
                      <ZoomIn className="size-5 text-white" />
                    </span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Filters + sort + write CTA */}
          {expanded && (
          <div className="mb-8 space-y-3">
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              {filterChips.map((c) => (
                <button
                  key={c.key}
                  onClick={() => setFilter(c.key)}
                  className={cn(
                    "shrink-0 rounded-full border px-4 py-2 text-[11px] font-mono uppercase tracking-wider transition-all",
                    filter === c.key
                      ? "border-accent/40 bg-accent/15 text-accent shadow-[0_0_0_1px_oklch(0.74_0.19_49/0.2)]"
                      : "border-border text-muted-foreground hover:text-foreground hover:border-white/20",
                  )}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex gap-1.5 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
                <span className="shrink-0 self-center text-[10px] font-mono uppercase tracking-widest text-muted-foreground/60 mr-1">Sort</span>
                {sortChips.map((c) => (
                  <button
                    key={c.key}
                    onClick={() => setSort(c.key)}
                    className={cn(
                      "shrink-0 rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-wider transition-colors",
                      sort === c.key ? "bg-white/[0.07] text-foreground" : "text-muted-foreground hover:text-foreground",
                    )}
                  >
                    {c.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
          )}

          {/* List / empty state */}
          {sorted.length === 0 ? (
            <EmptyState canWrite={!!user && !hasReviewed} onWrite={openCompose} filtered={filter !== "all"} onReset={() => setFilter("all")} />
          ) : (
            <>
              <ul className="grid gap-5 sm:grid-cols-2">
                <AnimatePresence>
                  {(expanded ? visible : sorted.slice(0, 2)).map((r) => {
                    // Admin: resolve author by UUID. Public: use denormalized fields.
                    const prof = r.user_id ? profiles[r.user_id] : undefined;
                    const name = (prof?.full_name ?? r.author_name) || "Customer";
                    const avatarUrl = prof?.avatar_url ?? r.author_avatar_url ?? null;
                    const isOwn = r.id === myReview?.id;
                    const editing = editingId === r.id;
                    return (
                      <motion.li
                        layout
                        key={r.id}
                        id={`review-${r.id}`}
                        initial={{ opacity: 0, y: 16 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.35 }}
                        className={cn(
                          "group rounded-2xl border bg-card/50 backdrop-blur-xl p-5 sm:p-6 transition-all hover:border-accent/30 hover:shadow-[0_18px_50px_-30px_oklch(0.74_0.19_49/0.5)]",
                          r.pinned || r.featured ? "border-accent/40" : "border-white/10",
                          r.status !== "published" && "opacity-70",
                        )}
                      >
                        {(r.featured || r.pinned) && (
                          <div className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 px-2.5 py-1 text-[9px] font-mono uppercase tracking-widest text-accent">
                            {r.pinned ? <Pin className="size-2.5" /> : <Sparkles className="size-2.5" />}
                            {r.pinned ? "Pinned" : "Featured"}
                          </div>
                        )}
                        {isAdmin && (r.status !== "published" || r.is_flagged) && (
                          <div className="mb-3 flex flex-wrap gap-1.5">
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
                              placeholder="Review title"
                              className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-2.5 focus:outline-none focus:border-accent" />
                            <textarea value={editBody} onChange={(e) => setEditBody(e.target.value)} maxLength={2000} rows={3}
                              placeholder="Your experience"
                              className="w-full bg-background/60 border border-border rounded-lg px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent" />
                            <div className="mb-3">
                              <p className="mb-2 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Photos &amp; videos</p>
                              <div className="flex flex-wrap gap-2">
                                {editMedia.map((m, i) => (
                                  <div key={i} className="relative size-16 overflow-hidden rounded-lg border border-border">
                                    {m.type === "image"
                                      ? <img loading="lazy" decoding="async" src={m.url} alt="" className="size-full object-cover" />
                                      : <video src={m.url} className="size-full object-cover" muted playsInline />}
                                    <button type="button" onClick={() => setEditMedia((p) => p.filter((_, idx) => idx !== i))}
                                      className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground ring-1 ring-border">
                                      <X className="size-3" />
                                    </button>
                                  </div>
                                ))}
                                {editMedia.length < 6 && (
                                  <button type="button" onClick={() => editFileRef.current?.click()} disabled={editUploading}
                                    className="grid size-16 place-items-center rounded-lg border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-50">
                                    {editUploading ? <Loader2 className="size-4 animate-spin" /> : <ImagePlus className="size-4" />}
                                  </button>
                                )}
                              </div>
                              <input ref={editFileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => onPickEditFiles(e.target.files)} />
                            </div>
                            <div className="flex gap-2">
                              <button onClick={() => saveEdit(r.id)} disabled={editSaving || editUploading} className="inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">
                                {editSaving ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {editSaving ? "Saving…" : "Update"}
                              </button>
                              <button onClick={() => setEditingId(null)} disabled={editSaving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest border border-border">Cancel</button>
                            </div>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-center gap-3.5">
                              <div className="size-12 rounded-full bg-muted overflow-hidden grid place-items-center text-base font-display shrink-0 ring-1 ring-white/10">
                                {avatarUrl ? <img loading="lazy" decoding="async" src={avatarUrl} alt="" className="w-full h-full object-cover" /> : name.charAt(0).toUpperCase()}
                              </div>
                              <div className="min-w-0 flex-1">
                                <p className="text-[15px] font-display truncate">{name}</p>
                                {r.verified_purchase && (
                                  <span className="mt-0.5 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-wider text-emerald-400">
                                    <BadgeCheck className="size-3" /> Verified Purchase
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="mt-4 flex items-center gap-3">
                              <StarRating rating={r.rating} starClassName="size-4" />
                              <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70">{fmtDate(r.created_at)}</span>
                            </div>

                            {r.title && <p className="mt-4 text-base font-display leading-snug">{r.title}</p>}
                            {r.body && <ReviewBody text={r.body} />}

                            {r.media?.length > 0 && (
                              <div className="mt-4 flex flex-wrap gap-2">
                                {r.media.map((m, i) => (
                                  <button key={i} onClick={() => openLightbox(r.media, i)} className="relative size-20 overflow-hidden rounded-xl border border-white/10 group/media">
                                    {m.type === "image" ? (
                                      <img decoding="async" src={m.url} alt="" loading="lazy" className="size-full object-cover transition-transform group-hover/media:scale-110" />
                                    ) : (
                                      <>
                                        <video src={m.url} className="size-full object-cover" />
                                        <span className="absolute inset-0 grid place-items-center bg-black/30"><Play className="size-5 text-white" /></span>
                                      </>
                                    )}
                                  </button>
                                ))}
                              </div>
                            )}

                            {r.verified_purchase && (
                              <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
                                <span className="inline-flex items-center gap-1 text-emerald-400/90"><CheckCircle2 className="size-3" /> Verified Purchase</span>
                                <span className="inline-flex items-center gap-1"><PackageCheck className="size-3" /> Product Delivered</span>
                                <span className="inline-flex items-center gap-1"><ShieldCheck className="size-3" /> Review Approved</span>
                              </div>
                            )}

                            {r.admin_reply && (
                              <div className="mt-4 flex items-start gap-2.5 rounded-xl border border-accent/20 bg-accent/[0.06] p-3.5">
                                <ShieldCheck className="size-4 text-accent shrink-0 mt-0.5" />
                                <div>
                                  <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">FoundOurMarket · Official reply</p>
                                  <p className="text-sm leading-relaxed">{r.admin_reply}</p>
                                </div>
                              </div>
                            )}

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

                            <div className="mt-4 flex flex-wrap items-center gap-3 border-t border-border/40 pt-3">
                              <button onClick={() => vote(r, "helpful")} className={cn("inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-all", myVotes[r.id] === "helpful" ? "bg-accent/15 text-accent" : "text-muted-foreground hover:bg-white/5 hover:text-foreground")}>
                                <ThumbsUp className="size-3.5" /> Helpful {r.helpful_count > 0 ? `(${r.helpful_count})` : ""}
                              </button>
                              <button onClick={() => vote(r, "not_helpful")} className={cn("inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors", myVotes[r.id] === "not_helpful" ? "text-destructive" : "text-muted-foreground hover:text-foreground")}>
                                <ThumbsDown className="size-3.5" /> {r.not_helpful_count}
                              </button>
                              {!isOwn && user && (
                                reportedIds.has(r.id) ? (
                                  <span className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground/70 ml-auto">
                                    <Flag className="size-3.5" /> Reported
                                  </span>
                                ) : (
                                  <button onClick={() => setReportFor(reportFor === r.id ? null : r.id)} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive ml-auto">
                                    <Flag className="size-3.5" /> Report
                                  </button>
                                )
                              )}
                              {isOwn && (
                                <button onClick={() => { setEditingId(r.id); setEditRating(r.rating); setEditTitle(r.title ?? ""); setEditBody(r.body ?? ""); setEditMedia((r.media ?? []).slice()); }} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent">
                                  <Pencil className="size-3.5" /> Edit
                                </button>
                              )}
                              {(isOwn || isAdmin) && (
                                <button onClick={() => requestDelete(r.id)} className="inline-flex items-center gap-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-destructive">
                                  <Trash2 className="size-3.5" /> Delete
                                </button>
                              )}
                            </div>

                            {reportFor === r.id && (
                              <div className="mt-2 flex flex-wrap gap-1.5">
                                {REPORT_REASONS.map((reason) => (
                                  <button key={reason} onClick={() => submitReport(r.id, reason)} className="rounded-lg border border-border px-2.5 py-1 text-[11px] text-muted-foreground hover:border-destructive/50 hover:text-destructive">
                                    {reason}
                                  </button>
                                ))}
                              </div>
                            )}

                            {isAdmin && (
                              <div className="mt-3 border-t border-border/50 pt-3">
                                <div className="flex flex-wrap gap-1.5">
                                  <ModBtn onClick={() => patch(r.id, { pinned: !r.pinned }, r.pinned ? "Unpinned" : "Pinned")} active={r.pinned}><Pin className="size-3" /> Pin</ModBtn>
                                  <ModBtn onClick={() => patch(r.id, { featured: !r.featured }, r.featured ? "Unfeatured" : "Featured")} active={r.featured}><Sparkles className="size-3" /> Feature</ModBtn>
                                  {r.status === "published" ? (
                                    <ModBtn onClick={() => patch(r.id, { status: "hidden" }, "Review hidden")}><EyeOff className="size-3" /> Hide</ModBtn>
                                  ) : (
                                    <ModBtn onClick={() => patch(r.id, { status: "published" }, "Review approved")}><Eye className="size-3" /> Approve</ModBtn>
                                  )}
                                  {r.status !== "rejected" && (
                                    <ModBtn onClick={() => patch(r.id, { status: "rejected" }, "Review rejected")}><X className="size-3" /> Reject</ModBtn>
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
                      </motion.li>
                    );
                  })}
                </AnimatePresence>
              </ul>

              {!expanded && sorted.length > 2 && (
                <div className="mt-6 grid place-items-center">
                  <button
                    onClick={() => setExpanded(true)}
                    className="inline-flex items-center gap-2 rounded-full border border-accent/30 bg-accent/[0.08] px-6 py-3 text-[11px] font-mono uppercase tracking-widest text-accent transition-all hover:border-accent/50 hover:bg-accent/[0.12]"
                  >
                    View all reviews ({sorted.length}) <ChevronRight className="size-3.5" />
                  </button>
                </div>
              )}

              {expanded && visibleCount < sorted.length && (
                <div className="mt-8 grid place-items-center">
                  <button
                    onClick={() => setVisibleCount((c) => c + 6)}
                    className="inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/[0.03] px-6 py-3 text-[11px] font-mono uppercase tracking-widest text-foreground transition-all hover:border-accent/40 hover:text-accent"
                  >
                    Load more reviews <ChevronRight className="size-3.5" />
                  </button>
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* Write review multi-step modal */}
      {showCompose && !!user && (
        <WriteReviewModal
          key={composeSessionRef.current}
          onClose={closeCompose}
          onDiscard={discardReviewDraft}
          step={step}
          setStep={setStep}
          rating={rating}
          setRating={setRating}
          hoverRating={hoverRating}
          setHoverRating={setHoverRating}
          title={title}
          setTitle={setTitle}
          body={body}
          setBody={setBody}
          pendingMedia={pendingMedia}
          setPendingMedia={setPendingMedia}
          uploading={uploading}
          submitting={submitting}
          fileRef={fileRef}
          onPickFiles={onPickFiles}
          onSubmit={submit}
        />
      )}

      {/* Lightbox gallery */}
      <Lightbox
        list={lightboxList}
        index={lightboxIndex}
        onIndex={setLightboxIndex}
        onClose={() => setLightboxList(null)}
      />

      {/* Delete confirmation dialog */}
      <AnimatePresence>
        {confirmDeleteId && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => !deleting && setConfirmDeleteId(null)}
            className="fixed inset-0 z-[var(--z-modal-dialog)] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-sm rounded-3xl border border-white/10 bg-card p-6 text-center shadow-[var(--shadow-float)]"
            >
              <div className="mx-auto grid size-12 place-items-center rounded-2xl bg-destructive/15 text-destructive">
                <Trash2 className="size-5" />
              </div>
              <p className="mt-4 text-base font-display">Delete this review?</p>
              <p className="mt-1.5 text-sm text-muted-foreground">This review will be removed and can't be recovered. The product rating and count will update immediately.</p>
              <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-center">
                <button
                  onClick={() => setConfirmDeleteId(null)}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-foreground transition-all hover:border-accent/40 hover:text-accent disabled:opacity-50"
                >
                  Cancel
                </button>
                <button
                  onClick={confirmDelete}
                  disabled={deleting}
                  className="inline-flex items-center justify-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-destructive-foreground transition-all hover:brightness-110 disabled:opacity-50"
                >
                  {deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />}
                  {deleting ? "Deleting…" : "Delete Review"}
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </section>
  );
}

/* ---------- Sub components ---------- */

function ReviewBody({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  const isLong = text.length > 180 || text.split("\n").length > 3;
  return (
    <div className="mt-2">
      <p className={cn("text-sm text-muted-foreground leading-relaxed whitespace-pre-wrap", !open && isLong && "line-clamp-3")}>
        {text}
      </p>
      {isLong && (
        <button
          onClick={() => setOpen((o) => !o)}
          className="mt-1 text-[11px] font-mono uppercase tracking-widest text-accent hover:brightness-110"
        >
          {open ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}

function SmartActions({
  purchase, primary, onBuyAgain, buyingAgain, onAsk, onSave, isSaved,
}: {
  purchase: PurchaseState;
  primary?: { label: string; icon: React.ReactNode; onClick: () => void };
  onBuyAgain: () => void;
  buyingAgain: boolean;
  onAsk: () => void;
  onSave: () => void;
  isSaved: boolean;
}) {
  return (
    <div className="mt-5 border-t border-border/40 pt-5">
      {/* Purchase facts */}
      <div className="flex flex-wrap gap-x-4 gap-y-1.5 text-[10px] font-mono uppercase tracking-wider text-muted-foreground">
        {purchase.purchased_at && (
          <span className="inline-flex items-center gap-1 text-emerald-400/90"><CalendarCheck className="size-3" /> Purchased on {fmtDate(purchase.purchased_at)}</span>
        )}
        {purchase.delivered && (
          <span className="inline-flex items-center gap-1"><Truck className="size-3" /> Delivered</span>
        )}
        <span className="inline-flex items-center gap-1 text-emerald-400/90"><BadgeCheck className="size-3" /> Verified Purchase</span>
      </div>
      {/* Actions */}
      <div className="mt-3.5 flex flex-wrap gap-2">
        {primary && (
          <button onClick={primary.onClick} className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-accent-foreground transition-all hover:brightness-110">
            {primary.icon} {primary.label}
          </button>
        )}
        <button onClick={onBuyAgain} disabled={buyingAgain} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground transition-all hover:border-accent/40 hover:text-accent disabled:opacity-60">
          {buyingAgain ? <Loader2 className="size-3.5 animate-spin" /> : <Repeat className="size-3.5" />} Buy Again
        </button>
        <button onClick={onAsk} className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground transition-all hover:border-accent/40 hover:text-accent">
          <HelpCircle className="size-3.5" /> Ask Question
        </button>
        <button onClick={onSave} className={cn("inline-flex items-center gap-2 rounded-full border px-4 py-2 text-[11px] font-bold uppercase tracking-widest transition-all", isSaved ? "border-accent/40 bg-accent/10 text-accent" : "border-white/15 text-foreground hover:border-accent/40 hover:text-accent")}>
          <Bookmark className={cn("size-3.5", isSaved && "fill-accent")} /> {isSaved ? "Saved" : "Save"}
        </button>
        <Link to="/account/support/new" className="inline-flex items-center gap-2 rounded-full border border-white/15 px-4 py-2 text-[11px] font-bold uppercase tracking-widest text-foreground transition-all hover:border-accent/40 hover:text-accent">
          <LifeBuoy className="size-3.5" /> Contact Support
        </Link>
      </div>
    </div>
  );
}



function StatCard({ icon, value, label, highlight }: { icon: React.ReactNode; value: string; label: string; highlight?: boolean }) {
  return (
    <div className={cn(
      "rounded-2xl border p-4 backdrop-blur-xl",
      highlight ? "border-accent/30 bg-accent/[0.08]" : "border-white/10 bg-card/40",
    )}>
      <span className={cn("inline-grid size-8 place-items-center rounded-full mb-2", highlight ? "bg-accent/15 text-accent" : "bg-white/5 text-muted-foreground")}>{icon}</span>
      <p className="text-xl font-display leading-none">{value}</p>
      <p className="mt-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{label}</p>
    </div>
  );
}

function EmptyState({ canWrite, onWrite, filtered, onReset }: { canWrite: boolean; onWrite: () => void; filtered: boolean; onReset: () => void }) {
  if (filtered) {
    return (
      <div className="grid place-items-center rounded-3xl border border-white/10 bg-card/40 py-14 text-center">
        <p className="text-sm text-muted-foreground">No reviews match this filter.</p>
        <button onClick={onReset} className="mt-4 inline-flex items-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-mono uppercase tracking-widest hover:border-accent/40 hover:text-accent">
          Show all reviews
        </button>
      </div>
    );
  }
  return (
    <div className="relative grid place-items-center overflow-hidden rounded-3xl border border-white/10 bg-card/40 backdrop-blur-xl py-16 px-6 text-center">
      <div className="pointer-events-none absolute inset-0 opacity-50" style={{ background: "var(--gradient-ember-soft)" }} />
      <div className="relative">
        <span className="inline-grid size-16 place-items-center rounded-2xl bg-accent/15 text-accent animate-glow">
          <Star className="size-8 fill-accent" />
        </span>
        <h3 className="mt-5 text-xl font-display">No reviews yet</h3>
        <p className="mt-2 max-w-sm text-sm text-muted-foreground">Be the first to share your experience.</p>
        {canWrite && (
          <button onClick={onWrite} className="mt-6 inline-flex items-center gap-2 rounded-full bg-accent px-6 py-3 text-[11px] font-bold uppercase tracking-widest text-accent-foreground hover:brightness-110 hover:shadow-[var(--shadow-ember)]">
            <Pencil className="size-3.5" /> Write Review
          </button>
        )}
      </div>
    </div>
  );
}

function ReviewsSkeleton() {
  return (
    <div className="animate-pulse">
      <div className="mb-8 grid gap-8 lg:grid-cols-[280px_1fr] rounded-3xl border border-white/10 bg-card/40 p-8">
        <div className="flex flex-col items-center gap-3">
          <div className="h-16 w-20 rounded-xl bg-white/5" />
          <div className="h-4 w-32 rounded bg-white/5" />
          <div className="h-3 w-40 rounded bg-white/5" />
        </div>
        <div className="space-y-3 self-center">
          {[0, 1, 2, 3, 4].map((i) => <div key={i} className="h-2.5 w-full rounded-full bg-white/5" />)}
        </div>
      </div>
      <div className="grid gap-5 sm:grid-cols-2">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-2xl border border-white/10 bg-card/40 p-6">
            <div className="flex items-center gap-3.5">
              <div className="size-12 rounded-full bg-white/5" />
              <div className="space-y-2"><div className="h-3 w-24 rounded bg-white/5" /><div className="h-2.5 w-16 rounded bg-white/5" /></div>
            </div>
            <div className="mt-4 h-3 w-32 rounded bg-white/5" />
            <div className="mt-4 h-4 w-48 rounded bg-white/5" />
            <div className="mt-2 h-3 w-full rounded bg-white/5" />
            <div className="mt-1.5 h-3 w-3/4 rounded bg-white/5" />
          </div>
        ))}
      </div>
    </div>
  );
}

const STEPS = ["Rating", "Title", "Experience", "Photos", "Submit"];

function WriteReviewModal(props: {
  onClose: () => void;
  onDiscard: () => void;
  step: number;
  setStep: (n: number) => void;
  rating: number;
  setRating: (n: number) => void;
  hoverRating: number;
  setHoverRating: (n: number) => void;
  title: string;
  setTitle: (s: string) => void;
  body: string;
  setBody: (s: string) => void;
  pendingMedia: ReviewMedia[];
  setPendingMedia: React.Dispatch<React.SetStateAction<ReviewMedia[]>>;
  uploading: boolean;
  submitting: boolean;
  fileRef: React.RefObject<HTMLInputElement | null>;
  onPickFiles: (f: FileList | null) => void;
  onSubmit: () => void;
}) {
  const { onClose, onDiscard, step, setStep, rating, setRating, hoverRating, setHoverRating, title, setTitle, body, setBody, pendingMedia, setPendingMedia, uploading, submitting, fileRef, onPickFiles, onSubmit } = props;
  const last = step === STEPS.length;
  const canNext = (step !== 1 || rating > 0) && (step !== 3 || body.trim().length > 0);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const hasUnsavedChanges = rating > 0 || title.trim().length > 0 || body.trim().length > 0 || pendingMedia.length > 0;

  // Intercept close: if there is an in-progress draft, ask for confirmation via a
  // centered modal instead of letting the prompt fall toward the bottom nav.
  function requestClose() {
    if (hasUnsavedChanges && !submitting) {
      setConfirmDiscard(true);
      return;
    }
    onClose();
  }

  function discardAndClose() {
    setConfirmDiscard(false);
    onDiscard();
  }

  useEffect(() => {
    document.body.setAttribute("data-review-wizard-open", "");
    return () => document.body.removeAttribute("data-review-wizard-open");
  }, []);

  return (
    <AnimatePresence>
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 z-[var(--z-modal-overlay)] flex items-end justify-center bg-black/70 p-0 pb-[var(--app-bottom-nav-height)] backdrop-blur-sm sm:items-center sm:p-4"
          onClick={requestClose}
        >
          <motion.div
            initial={{ y: 40, opacity: 0, scale: 0.98 }}
            animate={{ y: 0, opacity: 1, scale: 1 }}
            exit={{ y: 40, opacity: 0 }}
            transition={{ type: "spring", damping: 26, stiffness: 280 }}
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-lg max-h-[92dvh] overflow-y-auto rounded-t-3xl sm:rounded-3xl border border-white/10 bg-card/95 backdrop-blur-2xl p-6 sm:p-8 shadow-[var(--shadow-float)]"
          >
            <div className="flex items-center justify-between mb-5">
              <h3 className="text-lg font-display">Write a review</h3>
              <button onClick={requestClose} className="grid size-9 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>

            {/* progress */}
            <div className="mb-6 flex items-center gap-1.5">
              {STEPS.map((_, i) => (
                <span key={i} className={cn("h-1 flex-1 rounded-full transition-colors", i < step ? "bg-accent" : "bg-white/10")} />
              ))}
            </div>
            <p className="mb-5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Step {step} of {STEPS.length} · {STEPS[step - 1]}</p>

            <div className="min-h-[180px]">
              {step === 1 && (
                <div className="grid place-items-center py-6">
                  <p className="mb-5 text-sm text-muted-foreground">How would you rate this product?</p>
                  <div className="flex items-center gap-2">
                    {Array.from({ length: 5 }).map((_, i) => {
                      const value = i + 1;
                      const active = (hoverRating || rating) >= value;
                      return (
                        <button key={i} type="button" onMouseEnter={() => setHoverRating(value)} onMouseLeave={() => setHoverRating(0)} onClick={() => setRating(value)} aria-label={`Rate ${value}`} className="p-1 transition-transform hover:scale-125">
                          <Star className={cn("size-9 transition-colors", active ? "fill-accent text-accent drop-shadow-[0_0_8px_oklch(0.74_0.19_49/0.5)]" : "text-muted-foreground/40")} />
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-4 text-sm font-display text-accent">{["", "Poor", "Fair", "Good", "Very good", "Excellent"][hoverRating || rating]}</p>
                </div>
              )}
              {step === 2 && (
                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">Give your review a title</label>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} placeholder="e.g. Excellent quality and fast delivery" autoFocus
                    className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
                  <p className="mt-2 text-right text-[10px] font-mono text-muted-foreground">{title.length}/120</p>
                </div>
              )}
              {step === 3 && (
                <div>
                  <label className="mb-2 block text-sm text-muted-foreground">Tell us about your experience</label>
                  <textarea value={body} onChange={(e) => setBody(e.target.value)} maxLength={2000} rows={6} placeholder="What did you like? How was the quality, delivery and packaging?" autoFocus
                    className="w-full bg-background/60 border border-border rounded-xl px-4 py-3 text-sm focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/25" />
                  <p className="mt-2 text-right text-[10px] font-mono text-muted-foreground">{body.length}/2000</p>
                </div>
              )}
              {step === 4 && (
                <div>
                  <label className="mb-3 block text-sm text-muted-foreground">Add photos or videos (optional)</label>
                  <div className="flex flex-wrap gap-2.5">
                    {pendingMedia.map((m, i) => (
                      <div key={i} className="relative size-20 overflow-hidden rounded-xl border border-border">
                        {m.type === "image" ? <img loading="lazy" decoding="async" src={m.url} alt="" className="size-full object-cover" /> : <video src={m.url} className="size-full object-cover" />}
                        <button type="button" onClick={() => setPendingMedia((p) => p.filter((_, idx) => idx !== i))}
                          className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-background/90 text-foreground ring-1 ring-border">
                          <X className="size-3" />
                        </button>
                      </div>
                    ))}
                    {pendingMedia.length < 6 && (
                      <button type="button" onClick={() => fileRef.current?.click()} disabled={uploading}
                        className="grid size-20 place-items-center rounded-xl border border-dashed border-border text-muted-foreground hover:border-accent hover:text-accent disabled:opacity-50">
                        {uploading ? <Loader2 className="size-5 animate-spin" /> : <ImagePlus className="size-5" />}
                      </button>
                    )}
                  </div>
                  <input ref={fileRef} type="file" accept="image/*,video/*" multiple className="hidden" onChange={(e) => onPickFiles(e.target.files)} />
                </div>
              )}
              {step === 5 && (
                <div className="rounded-2xl border border-white/10 bg-background/40 p-5">
                  <p className="mb-3 text-[11px] font-mono uppercase tracking-widest text-muted-foreground">Review summary</p>
                  <StarRating rating={rating} starClassName="size-5" />
                  {title && <p className="mt-3 font-display">{title}</p>}
                  {body && <p className="mt-1.5 text-sm text-muted-foreground line-clamp-4">{body}</p>}
                  {pendingMedia.length > 0 && (
                    <p className="mt-3 inline-flex items-center gap-1.5 text-[11px] font-mono text-muted-foreground"><Camera className="size-3.5" /> {pendingMedia.length} attachment{pendingMedia.length === 1 ? "" : "s"}</p>
                  )}
                </div>
              )}
            </div>

            {/* nav */}
            <div className="mt-6 flex items-center justify-between gap-3">
              <button
                onClick={() => (step === 1 ? requestClose() : setStep(step - 1))}
                className="inline-flex items-center gap-1.5 rounded-full border border-white/15 px-4 py-2.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground"
              >
                <ArrowLeft className="size-3.5" /> {step === 1 ? "Cancel" : "Back"}
              </button>
              {last ? (
                <button onClick={onSubmit} disabled={submitting || uploading}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground hover:brightness-110 disabled:opacity-50">
                  {submitting ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />} {submitting ? "Posting…" : "Submit review"}
                </button>
              ) : (
                <button onClick={() => canNext && setStep(step + 1)} disabled={!canNext}
                  className="inline-flex items-center gap-2 rounded-full bg-accent px-6 py-2.5 text-[11px] font-bold uppercase tracking-widest text-accent-foreground hover:brightness-110 disabled:opacity-40">
                  Next <ArrowRight className="size-3.5" />
                </button>
              )}
            </div>
          </motion.div>

          {/* Centered discard confirmation — never rendered near the bottom nav */}
          <AnimatePresence>
            {confirmDiscard && (
              <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                onClick={(e) => { e.stopPropagation(); setConfirmDiscard(false); }}
                className="fixed inset-0 z-[var(--z-modal-dialog)] flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
              >
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  onClick={(e) => e.stopPropagation()}
                  className="w-full max-w-sm rounded-3xl border border-white/10 bg-card p-6 text-center shadow-[var(--shadow-float)]"
                >
                  <p className="text-base font-display">Discard review?</p>
                  <p className="mt-1.5 text-sm text-muted-foreground">You have unsaved changes. Do you want to continue editing or discard this review?</p>
                  <div className="mt-5 flex flex-col-reverse gap-2.5 sm:flex-row sm:justify-center">
                    <button
                      onClick={() => setConfirmDiscard(false)}
                      className="inline-flex items-center justify-center gap-2 rounded-full border border-white/15 px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-foreground transition-all hover:border-accent/40 hover:text-accent"
                    >
                      Continue Editing
                    </button>
                    <button
                      onClick={discardAndClose}
                      className="inline-flex items-center justify-center gap-2 rounded-full bg-destructive px-5 py-2.5 text-[11px] font-bold uppercase tracking-widest text-destructive-foreground transition-all hover:brightness-110"
                    >
                      <Trash2 className="size-3.5" /> Discard Review
                    </button>
                  </div>
                </motion.div>
              </motion.div>
            )}
          </AnimatePresence>
        </motion.div>
    </AnimatePresence>
  );
}

function Lightbox({ list, index, onIndex, onClose }: { list: ReviewMedia[] | null; index: number; onIndex: (i: number) => void; onClose: () => void }) {
  const touchStart = useRef<number | null>(null);
  const count = list?.length ?? 0;

  useEffect(() => {
    if (!list) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      if (e.key === "ArrowRight" && count > 1) onIndex((index + 1) % count);
      if (e.key === "ArrowLeft" && count > 1) onIndex((index - 1 + count) % count);
    };
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [list, index, count, onClose, onIndex]);

  if (!list) return null;
  const current = list[index];
  if (!current) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
        onClick={onClose}
        className="fixed inset-0 z-[var(--z-modal-overlay)] flex flex-col bg-black/90 backdrop-blur-md"
      >
        <div className="flex items-center justify-between px-4 py-3" onClick={(e) => e.stopPropagation()}>
          <span className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground">{index + 1} / {count}</span>
          <button onClick={onClose} className="grid size-10 place-items-center rounded-full border border-white/10 text-muted-foreground hover:text-foreground">
            <X className="size-5" />
          </button>
        </div>
        <div
          className="relative flex flex-1 items-center justify-center px-4"
          onClick={(e) => e.stopPropagation()}
          onTouchStart={(e) => (touchStart.current = e.touches[0].clientX)}
          onTouchEnd={(e) => {
            if (touchStart.current == null || count < 2) return;
            const dx = e.changedTouches[0].clientX - touchStart.current;
            if (dx > 50) onIndex((index - 1 + count) % count);
            else if (dx < -50) onIndex((index + 1) % count);
            touchStart.current = null;
          }}
        >
          {count > 1 && (
            <button onClick={() => onIndex((index - 1 + count) % count)} className="absolute left-2 z-10 grid size-11 place-items-center rounded-full border border-white/10 bg-background/60 text-foreground hover:text-accent">
              <ChevronLeft className="size-5" />
            </button>
          )}
          {current.type === "image" ? (
            <motion.img
              key={current.url}
              src={current.url}
              alt=""
              initial={{ opacity: 0, scale: 0.97 }}
              animate={{ opacity: 1, scale: 1 }}
              className="max-h-[78vh] max-w-full rounded-2xl object-contain select-none"
              style={{ touchAction: "pinch-zoom" }}
              draggable={false}
            />
          ) : (
            <video key={current.url} src={current.url} controls autoPlay playsInline className="max-h-[78vh] max-w-full rounded-2xl" />
          )}
          {count > 1 && (
            <button onClick={() => onIndex((index + 1) % count)} className="absolute right-2 z-10 grid size-11 place-items-center rounded-full border border-white/10 bg-background/60 text-foreground hover:text-accent">
              <ChevronRight className="size-5" />
            </button>
          )}
        </div>
        {count > 1 && (
          <div className="flex justify-center gap-2 overflow-x-auto px-4 py-4" onClick={(e) => e.stopPropagation()}>
            {list.map((m, i) => (
              <button key={i} onClick={() => onIndex(i)} className={cn("size-14 shrink-0 overflow-hidden rounded-lg border transition-all", i === index ? "border-accent ring-2 ring-accent/30" : "border-border opacity-60 hover:opacity-100")}>
                {m.type === "image" ? <img decoding="async" src={m.url} alt="" className="size-full object-cover" loading="lazy" /> : <video src={m.url} className="size-full object-cover" />}
              </button>
            ))}
          </div>
        )}
      </motion.div>
    </AnimatePresence>
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
