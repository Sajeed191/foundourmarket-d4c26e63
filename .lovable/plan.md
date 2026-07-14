# Enterprise AI Duplicate Detection & Prevention

A new **intelligence module** inside the existing Marketplace Intelligence platform (`src/lib/recommendations/*`, admin analytics, `use-products` cache). No new/parallel AI engine — it reuses the deterministic explainable-scoring philosophy, the cached product catalog, and the admin analytics shell.

## Architecture

```text
src/lib/duplicate-detection/
  index.ts          public surface
  types.ts          DupSignal, DupVerdict, DupMatch, DupScore
  normalize.ts      title/brand/spec normalization + stopwords + transliteration
  text-similarity.ts fuzzy (token-set + Levenshtein) matchers
  image-hash.ts     aHash/dHash/avgHash from canvas + Hamming distance
  engine.ts         multi-signal weighted confidence engine (pure, explainable)
  candidates.ts     indexed prefilter over cached catalog (barcode/brand/token buckets)
  events.functions.ts  ignore / merge / feedback (learning) via createServerFn
src/hooks/use-duplicate-detection.ts   debounced live hook
src/components/admin/duplicate/
  DuplicateIntelligencePanel.tsx   right-side panel (score, reasons, match cards)
  DuplicateMatchCard.tsx           thumbnail, badges, actions
  DuplicateCompareDialog.tsx       side-by-side diff (same/different/missing/new)
  ImageCompareDialog.tsx           current vs existing + overlay + similarity %
src/routes/admin-duplicate-intelligence.tsx   dashboard
```

## Confidence engine (0–100, explainable)

Pure function `scoreDuplicate(draft, candidate) -> { score, verdict, signals[] }`. Each signal returns `{ key, weight, similarity, matched, label }`; final score is a weighted, capped blend. **Barcode/UPC/EAN exact match short-circuits to 100 (Exact Duplicate).** Signals: title (normalized fuzzy), brand, category, sku, variant, image (phash Hamming), description, specifications (key-by-key semantic-ish), price, attributes, keyword overlap, admin-history. Weights live in one config object (configurable). Verdict bands: Safe / Similar / Possible / High Confidence / Exact. Every match carries the reason list shown in the UI. Mirrors `recommendations/scorer.ts` — deterministic, no randomness.

## Title & spec normalization

Lowercase, strip punctuation/extra space, remove marketing/pack/unit/stop words, collapse model tokens, basic transliteration map. `"Apple iPhone 15 Pro Max"`, `"iPhone15ProMax"`, `"APPLE IPHONE 15 PRO MAX"` → near-identical token sets. Fuzzy = token-set ratio + Levenshtein fallback (typo tolerance).

## Image AI (in-browser, no native deps)

On image add, draw to an offscreen canvas → compute **average hash + difference hash** (64-bit each) + a coarse 16-bin color histogram. Compare via Hamming distance → similarity %. Grayscale + resize before hashing gives resistance to resize/compression/brightness; dHash gives crop/edit tolerance. Stored per product in a new `image_phash` column so comparison is O(candidates), not image re-fetch. (Deep-embedding/rotation/watermark tolerance beyond hashes is noted as a phase-2 hook; the engine already accepts an optional embedding-similarity signal.)

## Variant intelligence

Red/Blue/Black are **not** duplicate products. When a high-confidence product match exists but the draft's variant axis differs, downgrade to a variant notice: *"You already have this Red variant"* vs *"Duplicate product"*. Variant comparison reads `product_variants`.

## Live detection

`use-duplicate-detection(draft)` — debounced (~350ms), runs candidate prefilter + engine against the already-cached catalog (`use-products`), never blocks typing. Recomputes on title/brand/category/barcode/sku/image/variant change.

## Duplicate panel + actions

Right-side panel in `ProductEditorModal`: risk %, verdict, reason checklist, "Found N similar products". Each match card: thumbnail (hover zoom), title, brand, price, status, stock, published date, category, variant count, rating, sales/popularity, quick badges (EXACT/SIMILAR/IMAGE/TITLE/SPEC/BARCODE MATCH), buttons: Preview, Compare, Open, Merge, Ignore, Create Anyway. **Never blocks** — publish is always allowed.

## Compare + merge

`DuplicateCompareDialog` side-by-side across images/gallery/variants/specs/description/attributes/price/stock/SEO/categories/tags/shipping/warranty with Same/Different/Missing/New highlighting. `ImageCompareDialog` shows both images + difference overlay + similarity %. Merge mode previews a merged record (media/variants/inventory/tags/SEO/collections/specs) before applying.

## Ignore + learning

New table `duplicate_detection_events` (draft signature, candidate slug, action: ignored|merged|created_anyway|confirmed, score, signals jsonb). Ignored pairs stop warning. Learning: aggregate feedback lightly adjusts confidence (repeat ignores on a pair → suppress; merges → reinforce) — additive adjustment layer, never rewrites the base scorer (same pattern as `recommendation_rules` ruleAdjust).

## Dashboard

`/admin-duplicate-intelligence` in `AdminShell`: duplicate rate, merge rate, ignored warnings, top duplicate categories/brands, recent attempts, false-positive rate, image-duplicate trend — from `duplicate_detection_events`.

## Database (one migration)

- `products.barcode text`, `products.image_phash text` (+ index on barcode).
- `duplicate_detection_events` table with full GRANTs + RLS (staff read/write via `has_role`).
- Add a `Barcode / UPC / EAN` field to the editor basic tab.

## Guardrails

Zero changes to checkout, orders, payments, SEO, auth, inventory writes, storefront perf, or the recommendation engine's public surface. All detection is admin-only and read-mostly; candidate prefilter keeps it O(candidates) for 100k+ catalogs. Mobile-responsive panel (collapses to a bottom sheet on small screens), accessible dialogs.

## Phasing (delivered in order)

1. Migration + editor barcode field + normalization/text/image-hash/engine/candidates libs.
2. `use-duplicate-detection` + panel + match cards wired into `ProductEditorModal`.
3. Compare + image-compare dialogs.
4. Ignore + learning (events table wired) .
5. Merge preview.
6. Dashboard route.
