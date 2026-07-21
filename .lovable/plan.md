# Product Q&A v1.0 + Product Comparison v1.0

Two independent features. I'll ship them in this order so each can be validated separately before moving on.

---

## Phase 1 — Product Q&A v1.0

### Backend
Current `product_questions` table only supports one answer per question and has no public SELECT policy. It needs to grow into a full Q&A thread system. New migration:

- New table `product_answers` (multiple answers per question)
  - `id, question_id, user_id, body, is_official, is_store_response, parent_answer_id (1-level reply), status ('visible'|'hidden'|'deleted'), helpful_count, created_at, updated_at, deleted_at`
- New table `product_answer_votes` (one helpful vote per user per answer, unique constraint)
- Extend `product_questions`: add `is_anonymous bool`, `status ('visible'|'hidden'|'deleted')`, `helpful_count`, `details text`
- Public SELECT policy on questions/answers where `status='visible'` and not deleted
- Owner insert/update/delete; staff moderate all
- GRANTs for anon (SELECT) + authenticated + service_role
- RPC `toggle_answer_helpful(answer_id)` — atomic vote
- RPC `mark_official_answer(question_id, answer_id)` — staff-only, unpins previous
- Realtime publication add for both tables

### Frontend
- `src/components/site/ProductQuestions.tsx` — new section injected under `<ProductReviews>` in `src/routes/products.$slug.tsx`
  - Header + "Ask Question" CTA + subtitle
  - Search box, sort dropdown (Newest / Oldest / Most Helpful / Answered / Unanswered)
  - Question cards: ❓ icon, question, asker (name or "Anonymous"), date, status badge (Official Answer ✓ / Answered / Unanswered), details
  - Answers: avatar, name, "🛡 Store Response" badge for admins, date, body, helpful vote, reply button
  - 1-level nested replies
  - Admin `Moderation ▾` dropdown: Approve/Hide/Delete/Pin Official/Reply/Edit
  - Empty state with CTA
  - Pagination (10 questions/page, load more)
  - Realtime subscribe on both tables while section mounted
- `src/components/site/AskQuestionModal.tsx` — question + optional details + Anonymous toggle, 500 char limit, dedupe check
- `src/lib/product-qna.ts` — data hooks + helpers (fetch, submit, vote, moderate)
- Guest ask → redirect to `/signin`

### Design
- 18px radius, `bg-card/60`, orange accents matching Reviews v2.1
- Deterministic circular avatars (reuse Reviews v2.1 `avatarSwatch` helper — extract to shared util)
- Mobile-optimized compact cards

---

## Phase 2 — Product Comparison v1.0

Current `/compare` route and `CompareTray` exist but are basic (single table, no grouping, no winners, no mobile swipe, add-only from PDP). Upgrade in place — no new backend, reuses `useCompare` + product data.

### Compare Button
- Add ⇄ Compare toggle to `ProductCard` next to Wishlist heart (badge shows when active)
- Also expose on PDP, Wishlist, Search, Category, Recently Viewed via existing `useCompare` hook

### Floating Compare Bar
- `CompareTray` already exists — polish: show product thumbs, count, "Compare Now" + "Clear", sticky, respects floating-stack

### Compare Page (`/compare` rewrite)
- Grouped spec sections (expandable accordions): General, Dimensions, Performance, Materials, Power, Warranty, Shipping, Description
- Rows where values differ get subtle amber tint (`bg-amber-500/5`); identical rows plain
- Winner badges per row when applicable:
  - 🏆 Lowest Price, 🏆 Highest Rating, 🏆 Best Discount, 🏆 Most Reviews, 🏆 Fastest Delivery (from shipping data)
- Per-column actions: Add to Cart / Buy Now / Remove
- Empty state → "Browse Products" CTA

### Mobile
- Swipeable product columns (horizontal snap-scroll) with sticky left spec-label column
- Cards, not table, on mobile

### Perf
- Memoize spec extraction & winner computation
- Lazy-load compare images
- No new fetches — reuse `useProducts`/`fetchProductsBySlugs`

---

## Files touched

**New**
- `supabase/migrations/*_qna_v1.sql`
- `src/components/site/ProductQuestions.tsx`
- `src/components/site/AskQuestionModal.tsx`
- `src/lib/product-qna.ts`
- `src/lib/avatar-swatch.ts` (extracted shared helper)

**Modified**
- `src/routes/products.$slug.tsx` — mount `<ProductQuestions>` under Reviews
- `src/routes/compare.tsx` — full rewrite (grouped specs, winners, mobile swipe)
- `src/components/site/CompareTray.tsx` — minor polish
- `src/components/site/ProductCard.tsx` (or equivalent card) — Compare toggle button
- `src/components/site/ProductReviews.tsx` — swap inline avatar helper for shared util

## Validation
- Typecheck passes after each phase
- Manual verify: submit question (auth + anonymous), submit answer, mark official, helpful vote, search, filters, moderation, empty states, mobile view

## Out of scope (untouched)
Reviews logic, product cards' data model, cart/checkout/orders, homepage, search, badges, AI, all frozen systems.

Approve to start Phase 1 (Q&A). Phase 2 will follow after Phase 1 is validated.
