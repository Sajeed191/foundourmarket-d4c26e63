import { supabase } from "@/integrations/supabase/client";

export type ReviewMedia = { url: string; type: "image" | "video" };

export type ReviewStatus = "published" | "pending" | "hidden" | "rejected" | "deleted";
export type Sentiment = "positive" | "neutral" | "negative" | "mixed";

export type Review = {
  id: string;
  product_slug: string;
  // Present only on admin reads (product_reviews) and the current user's own
  // review. The public view no longer exposes reviewer UUIDs to visitors.
  user_id?: string | null;
  // Denormalized author display fields, surfaced by the public view.
  author_name?: string | null;
  author_avatar_url?: string | null;
  rating: number;
  title: string | null;
  body: string | null;
  media: ReviewMedia[];
  status: ReviewStatus;
  pinned: boolean;
  featured: boolean;
  verified_purchase: boolean;
  helpful_count: number;
  not_helpful_count: number;
  report_count: number;
  is_flagged: boolean;
  admin_reply: string | null;
  admin_reply_at: string | null;
  admin_reply_by: string | null;
  sentiment: Sentiment | null;
  sentiment_score: number | null;
  sentiment_summary: string | null;
  fake_score: number | null;
  fake_reasons: string | null;
  created_at: string;
  deleted_at?: string | null;
  deleted_by?: string | null;
  deleted_reason?: string | null;
};

export const REPORT_REASONS = [
  "Spam or advertising",
  "Offensive or abusive",
  "Fake or misleading",
  "Off-topic",
  "Private information",
  "Other",
] as const;

const MAX_IMAGE_MB = 12;
const MAX_VIDEO_MB = 60;
const IMAGE_TYPES = ["image/jpeg", "image/png", "image/webp", "image/avif", "image/gif"];
const VIDEO_TYPES = ["video/mp4", "video/webm", "video/quicktime"];

export function validateReviewFile(file: File): string | null {
  const isImage = IMAGE_TYPES.includes(file.type);
  const isVideo = VIDEO_TYPES.includes(file.type);
  if (!isImage && !isVideo) return "Only images and videos are allowed.";
  const mb = file.size / (1024 * 1024);
  if (isImage && mb > MAX_IMAGE_MB) return `Images must be under ${MAX_IMAGE_MB}MB.`;
  if (isVideo && mb > MAX_VIDEO_MB) return `Videos must be under ${MAX_VIDEO_MB}MB.`;
  return null;
}

/** Upload a single review image/video into the public review-media bucket. */
export async function uploadReviewMedia(file: File, userId: string): Promise<ReviewMedia> {
  const err = validateReviewFile(file);
  if (err) throw new Error(err);
  const ext = file.name.split(".").pop()?.toLowerCase() || "bin";
  const path = `${userId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await supabase.storage
    .from("review-media")
    .upload(path, file, { cacheControl: "31536000", upsert: false, contentType: file.type });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("review-media").getPublicUrl(path);
  return { url: data.publicUrl, type: VIDEO_TYPES.includes(file.type) ? "video" : "image" };
}

export async function castReviewVote(reviewId: string, userId: string, vote: "helpful" | "not_helpful" | null) {
  if (vote === null) {
    return supabase.from("review_votes").delete().eq("review_id", reviewId).eq("user_id", userId);
  }
  return supabase
    .from("review_votes")
    .upsert({ review_id: reviewId, user_id: userId, vote }, { onConflict: "review_id,user_id" });
}

export async function reportReview(reviewId: string, userId: string, reason: string, details?: string) {
  return supabase
    .from("review_reports")
    .upsert(
      { review_id: reviewId, user_id: userId, reason, details: details ?? null, status: "open" },
      { onConflict: "review_id,user_id" },
    );
}

export function ratingBuckets(reviews: Pick<Review, "rating">[]) {
  const counts = [0, 0, 0, 0, 0]; // index 0 = 1 star
  for (const r of reviews) {
    const i = Math.min(5, Math.max(1, Math.round(r.rating))) - 1;
    counts[i]++;
  }
  return counts;
}
