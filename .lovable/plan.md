# Reviews v1.1 — Stability & Synchronization Fix

Scope: only `src/components/site/ProductReviews.tsx` and small helpers in `src/lib/reviews.ts`. No changes to badges, orders, payments, AI, homepage, search, site rules, or DB schema. Existing RPCs, RLS, triggers, and the `product_reviews_public` view already do the right thing — the fixes are all client-side wiring.

## What's actually broken (verified against the running code + DB)

- Delete: uses `window.confirm`, and on success doesn't drop the row from local state until the reload round-trip completes → card lingers.
- Edit: modal only edits rating/title/body — media (photos/videos) cannot be changed.
- Helpful: relies solely on realtime `review_votes` events to bump `helpful_count`; if realtime is delayed the count doesn't move.
- Report: no "already reported" affordance; button always active.
- Filter/sort chips are missing Oldest, With Videos, Featured, Pinned, AI Insights.
- Media viewer: images open fullscreen but pinch-zoom isn't enabled and videos don't play inline in the lightbox reliably.
- Admin-authored reviews are correctly visible when `status = 'published'` — the earlier "invisible admin review" was a single row stuck at `status = 'rejected'`. No code change needed here; documented in validation.

Everything else (rating recalc, aggregate refresh, RLS, verified badge trigger, admin visibility of non-published rows) already works via DB triggers + realtime channel — verified.

## Fixes

### 1. Delete
- Replace `window.confirm` with the existing shadcn `AlertDialog` (premium confirm).
- On success: optimistically remove from `reviews` state and clear `myReview`, then call `load()` + `onAggregateChange?.()`; error → rollback + toast.

### 2. Edit
- Extend edit mode to include media: reuse `uploadReviewMedia` + `validateReviewFile`, allow add/remove of images and videos.
- Call existing `update_own_review` RPC for text/rating, then a direct `UPDATE product_reviews SET media = $1 WHERE id = $2 AND user_id = auth.uid()` for media (RLS-scoped).
- Optimistic update; rollback on error.

### 3. Helpful
- Keep server truth via `castReviewVote`, but also optimistically bump `helpful_count` / `not_helpful_count` on the local row (and decrement the opposite bucket when switching). Realtime reconciles.

### 4. Report
- Track `reported_ids` in local state (seeded from a `review_reports` fetch for the current user).
- Disable the report button + show "Reported" when already reported.

### 5. Filters/Sort
- Add filter chips: `videos`, `featured`, `pinned`, `ai` (has sentiment_summary or fake_reasons).
- Add sort option: `oldest`.

### 6. Media viewer
- Enable pinch-zoom via `touch-action: pan-x pan-y pinch-zoom` and a max-scale transform on tap.
- Ensure `<video controls playsInline>` inside the lightbox so it plays inline.

### 7. Synchronization polish
- Every mutating action (`patch`, `remove`, `saveEdit`, `submitReport`, `vote`, `postReply`) already calls `load()` + `onAggregateChange?.()`. Confirm they all do; add where missing. The `recalc_product_rating` trigger keeps `products.rating` + `reviews` in sync automatically.

### 8. Empty state
- Confirmed present (`EmptyState` component). Ensure it renders the exact copy: "No reviews yet. Be the first to share your experience." with the "Write a Review" CTA. Update text if drifted.

## Validation

- Delete → dialog opens → row disappears instantly → toast → aggregate refreshes.
- Edit with new photo → modal saves → new media renders inline without refresh.
- Helpful toggle → count moves immediately, persists after reload.
- Report → button flips to "Reported" and stays disabled.
- Filters: Featured/Pinned/Videos/AI Insights each narrow the list correctly.
- Media viewer: pinch to zoom on iOS/Android; videos play inline.
- Admin publishes a rejected admin review → appears on the public list within realtime tick.
- `bun run typecheck` (via harness) passes.

## Out of scope

Anything outside `ProductReviews.tsx`, `src/lib/reviews.ts`, and the shadcn AlertDialog import. No DB migrations, no changes to RPCs, no touching of `ProductRatingManager` or admin routes.
