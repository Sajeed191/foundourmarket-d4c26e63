## Turn 2: Safe Deterministic Normalization

Extend the Image Intelligence Engine with real pixel analysis, Photon-WASM normalization, a mandatory quality gate, admin preview UI, and background job processing. No new AI features.

### 1. WASM Pixel Analysis (`src/lib/image-intelligence.server.ts`)

Add `@cf-wasm/photon` pixel decode path (activated when `analysis_depth = 'full'`). Replace `null` fields with real measurements:

- **occupancy** — bounding box of non-background pixels ÷ total pixels
- **empty_margins** — top/right/bottom/left whitespace ratios
- **brightness** — mean luminance (0–1)
- **sharpness** — Laplacian variance proxy over downsampled grayscale
- **background_uniformity** — stdev of corner-sampled swatches
- **transparency** — alpha channel presence + % transparent pixels
- **centering** — bbox center offset from image center (dx, dy)
- **aspect_ratio** — width/height (already present via header, keep)

Downsample large images to ≤512px longest edge before pixel work to keep Worker CPU under budget.

### 2. Deterministic Normalization (`src/lib/image-normalization.server.ts` — new)

Photon-WASM only. Pipeline steps, each optional, driven by analysis + category rules:

1. Empty-border crop (only trim uniform background pixels, never product pixels)
2. Canvas expansion / safe padding to reach category target aspect ratio
3. Product centering (translate within expanded canvas)
4. Background fill — sampled solid, 2-stop gradient, or edge-blur continuation
5. Resize to target long-edge (e.g. 1600px)
6. WebP encode (quality 82)

Every step records `{op, params, reason}` into `actions[]` for explainability. No recolor, no outpaint, no sharpen, no denoise.

### 3. Mandatory Quality Gate (`src/lib/image-quality-gate.server.ts` — new)

Runs after normalization, before `optimized_url` is written. Checks:

| Check | Rule |
|---|---|
| Original preserved | `original_url` still points to untouched bytes |
| Product fully visible | Post-crop occupancy bbox fully inside canvas with ≥2% margin |
| Product pixels unchanged | Pixel diff of bbox region vs. original bbox ≤ 0.5% |
| Resolution acceptable | Output long-edge ≥ 800px |
| No excessive blur | Output sharpness ≥ 85% of original |
| Safe occupancy | Category-target min ≤ occupancy ≤ max |
| Background uniform | uniformity ≥ threshold when fill applied |

Any failure → discard optimized bytes, keep original, log `rejection_reason` on the job row, expose it in the assistant recommendation.

### 4. Background Job Processing

- Add `job_type` (`analyze` | `normalize`) and `status` (`queued` | `running` | `succeeded` | `failed` | `rejected`) to `image_intelligence_jobs`.
- Upload flow: original stored immediately, `analyze` job enqueued, then chains to `normalize` job when mode is `analyze+normalize`.
- Server fn `runPendingImageJobs` processes a small batch per invocation; called from admin panel button and from a `/api/public/hooks/image-jobs` route driven by pg_cron every minute.
- `optimized_url` stays `null` until the quality gate passes.

### 5. Admin Preview UI (`src/routes/admin-image-intelligence.tsx`)

Add a per-image review panel:

```text
┌──────────────┬──────────────┐
│  Original    │  Optimized   │
│  [preview]   │  [preview]   │
└──────────────┴──────────────┘
  Actions taken: center, pad 8%, gradient bg
  Quality gate:  ✅ passed
  [ Keep Original ]  [ Apply Optimized ]
```

Global setting adds `auto_apply_safe` toggle:
- **On** — quality-gate-passing optimizations auto-swap the displayed URL.
- **Off** — always require admin click to apply.

### 6. Assistant Integration

`MarketplaceImageAssistant.tsx` consumes the richer `analysis_json` — no API changes for other consumers (Gallery Health, Hero Recommendation, Duplicate Detection 2.0). Traffic light logic gains `rejected` → 🟡 amber with rejection reason.

### Technical notes

- New dep: `@cf-wasm/photon` (Worker-safe, ~1MB WASM). Loaded lazily inside handlers only.
- All pixel work stays server-side in `*.server.ts` behind `createServerFn`, so nothing ships to the client bundle.
- Migration adds `job_type`, `status`, `rejection_reason`, `actions_json` to `image_intelligence_jobs`; adds `auto_apply_safe` bool to `image_intelligence_settings`.
- Cron: `*/1 * * * *` calling `/api/public/hooks/image-jobs` with the anon key.
- Safety contract unchanged: originals immutable, every action reversible, everything explainable, product pixels never modified.

### Out of scope (deferred)

- AI outpainting / generative fill
- Category rule editor UI (rules stay code-defined)
- Bulk re-processing of historical catalog (one-off script later)
- Any change to Gallery Health / Hero / Duplicate Detection surfaces