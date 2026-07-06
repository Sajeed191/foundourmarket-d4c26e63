import { Children, cloneElement, isValidElement, memo, useEffect, useLayoutEffect, useRef, useState, type ReactElement } from "react";
import { publishWindowMetrics, resetWindowMetrics } from "@/lib/window-metrics";
import { ProductSkeletonGrid } from "@/components/site/ProductSkeleton";
import { getResponsiveImage } from "@/lib/product-images";
import { getStorageResponsive } from "@/lib/storage-image";
import { publishGridTelemetry, isScrollRestoring } from "@/lib/grid-telemetry";
import { useFlag } from "@/lib/use-debug-flag";

function flagOff(name: string): boolean {
  return typeof document !== "undefined" && document.documentElement.dataset[name] === "off";
}

/** How gridReady was reached (mirrors telemetry `committedVia`). */
type GridReadyReason = "decode-complete" | "safety-timeout" | "empty" | "instant";

/** Resolve the active column count for the current viewport width. */
function resolveColsWidth(cols: Cols, width: number): number {
  let c = cols.base;
  if (width >= 640 && cols.sm) c = cols.sm;
  if (width >= 768 && cols.md) c = cols.md;
  if (width >= 1024 && cols.lg) c = cols.lg;
  if (width >= 1280 && cols.xl) c = cols.xl;
  return Math.max(1, c);
}

/** Default responsive `sizes` used by ProductImage — mirror it so the in-memory
 * preloader warms the exact same srcset candidate the real grid will request. */
const DEFAULT_SIZES = "(min-width: 1024px) 300px, (min-width: 640px) 45vw, 76vw";

/**
 * Warm one image entirely in memory (HTTP + decode caches) using a detached
 * HTMLImageElement — NO DOM insertion, so the browser allocates zero GPU
 * compositor tiles for it during Phase 1. We mirror ProductImage's src/srcset/
 * sizes resolution so the candidate the browser picks here is the same one the
 * real <img> requests, guaranteeing a warm cache hit on the atomic swap.
 */
function warmImage(rawSrc: string): Promise<void> {
  return new Promise<void>((resolve) => {
    if (typeof window === "undefined" || !rawSrc) return resolve();
    const disableAsyncDecoding = flagOff("ffImageDecoding");
    const bundled = getResponsiveImage(rawSrc);
    const storage = bundled ? null : getStorageResponsive(rawSrc);
    const srcset = bundled?.srcset ?? storage?.srcset;
    const src = storage?.src ?? rawSrc;

    const img = new Image();
    img.decoding = disableAsyncDecoding ? "sync" : "async";
    if (srcset) {
      img.sizes = DEFAULT_SIZES;
      img.srcset = srcset;
    }
    img.src = src;

    const finish = () => {
      if (!disableAsyncDecoding && typeof img.decode === "function") {
        img.decode().then(() => resolve()).catch(() => resolve());
      } else {
        resolve();
      }
    };
    if (img.complete && img.naturalWidth > 0) return finish();
    img.addEventListener("load", finish, { once: true });
    img.addEventListener("error", () => resolve(), { once: true });
  });
}

/**
 * Cheaply probe an image's intrinsic pixel area WITHOUT gating on decode().
 *
 * WHY: the first-frame cap must upload the *smallest* textures first, not just
 * whichever happen to be in row 1. A hero/featured image or a mixed aspect
 * ratio in row 1 could dominate the initial GPU upload and still band. Sorting
 * the viewport batch by pixel area keeps the first-frame decode budget stable
 * across categories (Trending / Deals / Search). The probe reuses the browser
 * cache, so the subsequent warmImage() call is a warm hit — no double download.
 */
function probeArea(rawSrc: string): Promise<{ src: string; area: number }> {
  return new Promise((resolve) => {
    if (typeof window === "undefined" || !rawSrc) return resolve({ src: rawSrc, area: 0 });
    const disableAsyncDecoding = flagOff("ffImageDecoding");
    const bundled = getResponsiveImage(rawSrc);
    const storage = bundled ? null : getStorageResponsive(rawSrc);
    const srcset = bundled?.srcset ?? storage?.srcset;
    const src = storage?.src ?? rawSrc;
    const img = new Image();
    img.decoding = disableAsyncDecoding ? "sync" : "async";
    if (srcset) {
      img.sizes = DEFAULT_SIZES;
      img.srcset = srcset;
    }
    const done = () => resolve({ src: rawSrc, area: (img.naturalWidth || 0) * (img.naturalHeight || 0) });
    if (img.complete && img.naturalWidth > 0) {
      img.src = src;
      return done();
    }
    img.addEventListener("load", done, { once: true });
    img.addEventListener("error", () => resolve({ src: rawSrc, area: Number.MAX_SAFE_INTEGER }), { once: true });
    img.src = src;
  });
}

/**
 * Run async tasks with a bounded concurrency pool instead of all-at-once.
 *
 * WHY: firing `Promise.all` over the whole first batch decodes every image in
 * parallel, then the atomic swap uploads all their textures in a SINGLE commit
 * frame. On Chromium Android that one-frame multi-texture upload overflows the
 * GPU tile manager and produces rainbow banding / duplicated strips / partial
 * bottom rows. Staggering decodes into a small pool spreads the texture uploads
 * across a few frames so the tile budget is never saturated at once. Desktop and
 * Firefox are unaffected (they just decode a hair less parallel).
 *
 * Rollback: `?ff-decode-all` restores the original unbounded parallel decode.
 */
function decodeConcurrency(): number {
  if (typeof window !== "undefined") {
    try {
      if (/[?&]ff-decode-all\b/.test(window.location.search)) return Infinity;
    } catch {
      /* ignore */
    }
  }
  return 3;
}

function mapWithConcurrency<T>(
  items: T[],
  limit: number,
  task: (item: T, index: number) => Promise<void>,
): Promise<void> {
  if (!Number.isFinite(limit) || limit >= items.length) {
    return Promise.all(items.map((it, i) => task(it, i))).then(() => undefined);
  }
  let cursor = 0;
  const worker = (): Promise<void> => {
    const i = cursor++;
    if (i >= items.length) return Promise.resolve();
    return task(items[i], i).then(worker);
  };
  return Promise.all(Array.from({ length: limit }, worker)).then(() => undefined);
}

/** Grid hydration debug logging — opt-in only.
 * Enable via `?debug-grid` in the URL or `window.__DEBUG_GRID = true`.
 * Zero cost in production when disabled. */
function gridDebugEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      (window as unknown as { __DEBUG_GRID?: boolean }).__DEBUG_GRID === true ||
      /[?&]debug-grid\b/.test(window.location.search)
    );
  } catch {
    return false;
  }
}

function gridLog(...args: unknown[]): void {
  if (gridDebugEnabled()) console.log("%c[ZeroFlickerGrid]", "color:#f59e0b", ...args);
}

/** Wait N animation frames — a "decode barrier flush" so the compositor and
 * rasterizer are synced before we mount the real grid. */
function nextFrames(n: number): Promise<void> {
  // EXPERIMENT: rAF disabled — resolve directly instead of waiting frames.
  return Promise.resolve();
}

/**
 * Wait until scroll restoration has settled before releasing the hydration gate.
 * On refresh/back-forward the browser may restore a non-zero scroll offset a few
 * frames after mount; committing before that lands can cause an early-render
 * correction frame. We poll scrollY until it stops moving (or a short cap), so
 * gridReady is delayed until scroll is stable. No-op when not restoring.
 */
function waitForScrollSettled(): Promise<void> {
  // EXPERIMENT: rAF disabled — resolve directly (no per-frame scroll polling).
  return Promise.resolve();
}

/**
 * Perceived-load optimization: after the current batch commits, pre-warm the
 * NEXT viewport batch in the background so a first scroll paints from cache.
 * Idle-scheduled and non-blocking — never gates the UI and never touches the DOM.
 */
function prewarmNextBatch(preloadSrcs: string[] | undefined, currentK: number): void {
  if (typeof window === "undefined" || !preloadSrcs) return;
  const next = preloadSrcs.slice(currentK, currentK + currentK);
  if (next.length === 0) return;
  const run = () => {
    // Sequential to avoid a decode burst competing with the just-painted grid.
    next.reduce<Promise<void>>((chain, src) => chain.then(() => warmImage(src)), Promise.resolve());
  };
  const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void })
    .requestIdleCallback;
  if (typeof ric === "function") ric(run);
  else setTimeout(run, 200);
}



/**
 * Two-phase rendering engine — skeleton → atomic swap grid.
 *
 * Phase 1 (fast paint): render ONLY a `ProductSkeletonGrid`. In parallel, warm
 * the first visible batch of images fully in memory via detached
 * `HTMLImageElement`s (no DOM, no GPU tiles). Phase 2 (atomic commit): once the
 * batch is decoded AND a two-frame barrier has flushed, unmount the skeleton and
 * mount the real grid in a single commit — images paint instantly from cache.
 *
 * This splits the DOM into two trees (SkeletonGrid vs RealGrid) so there is zero
 * hidden GPU work during Phase 1, and eliminates partial rows, bottom flicker
 * and the first-scroll correction on refresh.
 *
 * When `preloadSrcs` is unavailable we fall back to the lighter opacity gate:
 * the real grid mounts hidden and reveals after its own images decode.
 */

/**
 * TEMPORARY EXPERIMENT — read `?exp-stagger=on` (client-only, default OFF).
 *
 * When ON, TwoPhaseGrid Phase 2 no longer commits the whole decoded batch in a
 * single React render. Instead it inserts exactly ONE product card per animation
 * frame until all cards are in the DOM. Nothing else changes — same ProductCard,
 * same images, same wrappers, same grid <div>, same className, same CSS, same
 * virtualization. The ONLY difference is the DOM-insertion schedule, isolating
 * whether the corruption is caused by a large atomic DOM/texture upload.
 */
function staggerMountEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return /[?&]exp-stagger(=on|=1|=true)?\b/.test(window.location.search);
  } catch {
    return false;
  }
}

/**
 * Renders the SAME grid element it is handed, but reveals its card-frame
 * children one-per-requestAnimationFrame instead of all at once. Card frames,
 * keys, grid <div>, className and props are preserved exactly (via cloneElement);
 * only how many frames exist in the DOM on each frame changes.
 */
function StaggeredGridChildren({ grid }: { grid: ReactElement }) {
  const frames = Children.toArray(
    (grid.props as { children?: React.ReactNode }).children,
  );
  const total = frames.length;
  const [count, setCount] = useState(() => Math.min(1, total));

  useEffect(() => {
    if (count >= total) {
      gridLog("stagger-mount complete →", { insertedPerCommit: 1, total });
      return;
    }
    // EXPERIMENT: rAF disabled — advance the stagger count directly.
    setCount((c) => Math.min(total, c + 1));
  }, [count, total]);

  return cloneElement(grid, undefined, frames.slice(0, count));
}

function TwoPhaseGrid({
  cols,
  itemCount,
  preloadSrcs,
  className,
  children,
}: {
  cols: Cols;
  itemCount: number;
  preloadSrcs?: string[];
  className?: string;
  children: React.ReactNode;
}) {
  const [ready, setReady] = useState(false);
  const ref = useRef<HTMLDivElement | null>(null);
  const canTwoPhase = !!preloadSrcs && preloadSrcs.length > 0;

  // Compute the first visible batch size: visible rows × columns (+1 slack).
  // Never relies on IntersectionObserver (unreliable right after a refresh).
  const computeK = () => {
    if (typeof window === "undefined") return Math.min(itemCount, 8);
    const colCount = resolveColsWidth(cols, window.innerWidth);
    const visibleRows = Math.max(1, Math.ceil(window.innerHeight / 320));
    return Math.min(itemCount, colCount * (visibleRows + 1));
  };

  // Scroll stabilization lock — after the atomic swap, pin scrollY for a short
  // window so any last-frame tile settling can't nudge layout / cause a jump.
  const stabilizeScroll = () => {
    if (typeof window === "undefined") return;
    const y = window.scrollY;
    const start = performance.now();
    const LOCK_MS = 220;
    // EXPERIMENT: rAF disabled — perform the scroll pin once, synchronously.
    if (Math.abs(window.scrollY - y) > 1) window.scrollTo(0, y);
    publishGridTelemetry({ scrollLockDurationMs: LOCK_MS });
  };

  // TWO-PHASE PATH: skeleton first, warm images off-DOM, atomic swap.
  useLayoutEffect(() => {
    if (!canTwoPhase || ready) return;
    if (itemCount === 0 || typeof window === "undefined") {
      publishGridTelemetry({ committedVia: "empty" });
      setReady(true);
      return;
    }
    let cancelled = false;
    const k = computeK();
    const srcs = (preloadSrcs ?? []).slice(0, k);
    const startedAt = performance.now();
    publishGridTelemetry({
      hydrationStartTime: Math.round(startedAt),
      viewportBatchSize: k,
    });
    gridLog("phase1 start →", {
      viewportBatch: k,
      itemCount,
      cols: resolveColsWidth(cols, window.innerWidth),
      viewport: { w: window.innerWidth, h: window.innerHeight },
    });

    const commit = (via: GridReadyReason) => {
      if (cancelled) return;
      const now = performance.now();
      const ms = Math.round(now - startedAt);
      publishGridTelemetry({
        gridReadyTimestamp: Math.round(now),
        skeletonDurationMs: ms,
        committedVia: via,
      });
      gridLog(`atomic commit (${via}) → gridReady`, {
        hydrationMs: ms,
        gridReadyTs: Math.round(now),
      });
      setReady(true);
      stabilizeScroll();
      // Background: overlap the NEXT viewport batch decode while the current
      // grid paints. Non-blocking, idle-scheduled, never gates the UI.
      prewarmNextBatch(preloadSrcs, k);
    };

    const decodeBatchStart = performance.now();
    publishGridTelemetry({ decodeBatchStart: Math.round(decodeBatchStart) });

    // Hard safety cap so we never sit on the skeleton forever (3s).
    const safety = new Promise<GridReadyReason>((res) =>
      setTimeout(() => res("safety-timeout"), 3000),
    );

    // FIRST-FRAME CAP: decode the SMALLEST N images (by intrinsic pixel area)
    // in the viewport batch first, with strict serial throttle, so the initial
    // paint uploads a minimal texture set. Choosing by area (instead of strictly
    // "row 1") avoids an oversized hero/featured image or a mixed aspect ratio
    // dominating the first GPU upload and re-introducing banding. Only after that
    // safe first frame do we fall back to normal pooled concurrency for the rest.
    const firstFrameCap = Math.max(1, resolveColsWidth(cols, window.innerWidth));
    const decodeOne = (s: string, i: number) => {
      const t0 = performance.now();
      return warmImage(s).then(() => {
        if (gridDebugEnabled()) gridLog(`decode[${i}] ${Math.round(performance.now() - t0)}ms`);
      });
    };
    const orderByArea = Promise.all(srcs.map(probeArea)).then((probed) => {
      const sorted = probed.slice().sort((a, b) => a.area - b.area).map((p) => p.src);
      const firstFrame = sorted.slice(0, firstFrameCap);
      const rest = sorted.slice(firstFrameCap);
      return { firstFrame, rest };
    });
    const decodeAll = orderByArea
      .then(({ firstFrame, rest }) =>
        mapWithConcurrency(firstFrame, 1, decodeOne)
          .then(() => nextFrames(1)) // let the smallest textures commit alone
          .then(() => mapWithConcurrency(rest, decodeConcurrency(), (s, i) => decodeOne(s, i + firstFrameCap))),
      )

      .then(() => {
        publishGridTelemetry({ decodeBatchEnd: Math.round(performance.now()) });
      })
      // Defer commit until scroll restoration is settled, then flush 2 frames.
      .then(() => waitForScrollSettled())
      .then(() => nextFrames(2)) // decode barrier flush
      .then<GridReadyReason>(() => "decode-complete");

    Promise.race([decodeAll, safety]).then(commit);

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTwoPhase, ready, itemCount, cols]);

  // FALLBACK PATH (no preloadSrcs): opacity gate the real grid after its own
  // in-DOM images decode.
  useLayoutEffect(() => {
    if (canTwoPhase || ready) return;
    const container = ref.current;
    if (!container || itemCount === 0 || typeof window === "undefined") {
      setReady(true);
      return;
    }
    let cancelled = false;
    const reveal = () => !cancelled && setReady(true);

    const k = computeK();
    const imgs = Array.from(
      container.querySelectorAll<HTMLImageElement>("img[data-product-image]"),
    ).slice(0, k);
    if (imgs.length === 0) {
      reveal();
      return;
    }
    const settle = (img: HTMLImageElement): Promise<void> => {
      const decode = () =>
        !flagOff("ffImageDecoding") && typeof img.decode === "function"
          ? img.decode().catch(() => undefined)
          : nextFrames(1);
      if (img.complete && img.naturalWidth > 0) return decode();
      return new Promise<void>((res) => {
        img.addEventListener("load", () => decode().then(() => res()), { once: true });
        img.addEventListener("error", () => res(), { once: true });
      });
    };
    const safety = new Promise<void>((res) => setTimeout(res, 3000));
    Promise.race([Promise.all(imgs.map(settle)).then(() => undefined), safety]).then(reveal);
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canTwoPhase, ready, itemCount, cols]);

  // Phase 1 for two-phase mode: render only the skeleton (separate DOM tree).
  if (canTwoPhase && !ready) {
    return (
      <ProductSkeletonGrid
        count={Math.max(4, Math.min(itemCount, computeK()))}
        className={className ?? "grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5"}
      />
    );
  }

  // Two-phase Phase 2: mount the real grid.
  if (canTwoPhase) {
    // EXPERIMENT (?exp-stagger=on): insert one card per animation frame instead
    // of committing the whole decoded batch in a single render. Default OFF →
    // original atomic commit is completely unchanged.
    if (staggerMountEnabled() && isValidElement(children)) {
      return <StaggeredGridChildren grid={children as ReactElement} />;
    }
    return <>{children}</>;
  }

  // Fallback: opacity gate.
  return (
    <div
      ref={ref}
      data-grid-hydrated={ready ? "true" : "false"}
      style={{
        opacity: ready ? 1 : 0,
        transition: ready ? "opacity 220ms ease-out" : undefined,
        pointerEvents: ready ? undefined : "none",
      }}
    >
      {children}
    </div>
  );
}

type Cols = { base: number; sm?: number; md?: number; lg?: number; xl?: number };

type Props<T> = {
  items: T[];
  /** Render a single item. The grid owns stable keys; never key by index. */
  renderItem: (item: T, index: number) => React.ReactNode;
  /** Permanent item identity. Product grids must pass product.id (slug fallback only for legacy rows). */
  getKey?: (item: T) => string;
  /** Column counts per Tailwind breakpoint (kept for call-site compatibility). */
  cols: Cols;
  /** Responsive grid className (SSR-safe, normal document flow). */
  className?: string;
  /** Rough row height estimate (unused; kept for call-site compatibility). */
  estimateRowHeight?: number;
  /** Overscan rows (unused; kept for call-site compatibility). */
  overscan?: number;
  /** Only grow incrementally once the list exceeds this size. */
  virtualizeThreshold?: number;
  /**
   * Optional: resolve an item's primary image URL. When provided, the grid uses
   * the two-phase engine (skeleton → warm first batch off-DOM → atomic swap).
   * Without it, the grid falls back to opacity-gated reveal.
   */
  getImageSrc?: (item: T) => string | null | undefined;
};

/**
 * Transform-free incremental product grid (all platforms) — DEFAULT path.
 *
 * WHY no window virtualizer by default:
 * The previous transform-based `useWindowVirtualizer` path placed each row with
 * `position: absolute` + `transform: translateY()` + `contain: layout paint
 * style` and re-measured row heights with `measureElement`. When a card's
 * height changed after mount (e.g. the ProductCard static→rich swap, or image
 * decode), the virtualizer repositioned rows mid-scroll. On BOTH Chromium and
 * Safari this produces duplicated/overlapping titles, stale images and ghost
 * paint during fast fling scrolling.
 *
 * This append-only grid renders every item in normal document flow inside a
 * plain CSS grid (no transforms) and grows the visible window in small batches
 * via an IntersectionObserver sentinel. Its known trade-off is that scrolled-
 * past cards are NEVER unmounted — DOM/`<img>`/GPU-texture retention grows with
 * scroll distance. The `?ff-window=on` experiment (below) swaps this for a true
 * fixed-size sliding window to A/B test whether that retention is what triggers
 * Chromium-Android compositor corruption.
 */
function IncrementalGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  cols,
  batchSize,
  preloadSrcs,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  cols: Cols;
  batchSize: number;
  preloadSrcs?: string[];
}) {
  const [visible, setVisible] = useState(() => Math.min(items.length, batchSize));
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const visibleRef = useRef(visible);
  visibleRef.current = visible;

  // Reset the window when the dataset changes (filter/sort/navigation).
  useEffect(() => {
    setVisible(Math.min(items.length, batchSize));
  }, [items, batchSize]);

  useEffect(() => {
    const el = sentinelRef.current;
    if (!el) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting && visibleRef.current < items.length) {
          setVisible((v) => Math.min(items.length, v + batchSize));
        }
      },
      { rootMargin: "800px 0px" },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [items.length, batchSize]);

  const shown = items.slice(0, visible);

  return (
    <>
      <TwoPhaseGrid cols={cols} itemCount={shown.length} preloadSrcs={preloadSrcs} className={className}>
        <div data-product-grid className={className}>
          {shown.map((item, i) => (
            <div key={getKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
              {renderItem(item, i)}
            </div>
          ))}
        </div>
      </TwoPhaseGrid>
      {visible < items.length && <div ref={sentinelRef} aria-hidden style={{ height: 1 }} />}
    </>
  );
}

/** Resolve the active column count for the current viewport width. */
function resolveCols(cols: Cols, width: number): number {
  let c = cols.base;
  if (width >= 640 && cols.sm) c = cols.sm;
  if (width >= 768 && cols.md) c = cols.md;
  if (width >= 1024 && cols.lg) c = cols.lg;
  if (width >= 1280 && cols.xl) c = cols.xl;
  return Math.max(1, c);
}

/**
 * EXPERIMENTAL — true windowed virtualization (only via `?ff-window=on`).
 *
 * Keeps only the rows near the viewport mounted (~30–40 cards) and replaces the
 * scrolled-away rows with plain top/bottom spacer <div>s so total scroll height
 * and scroll position are preserved exactly. No transforms, no layer promotion:
 * the grid still lays out in normal flow, we just bound how many rows exist.
 *
 * This isolates one variable — unbounded retained ProductCards/<img>/GPU
 * textures — without touching ProductCard, ProductImage, srcset, decoding,
 * loading, SEO, or backend. Cards/images are identical; only their lifetime
 * changes.
 */
function WindowedGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  cols,
  estimateRowHeight = 340,
  overscanRows = 6,
  preloadSrcs,
}: {
  items: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  getKey: (item: T) => string;
  className?: string;
  cols: Cols;
  estimateRowHeight?: number;
  overscanRows?: number;
  preloadSrcs?: string[];
}) {
  const outerRef = useRef<HTMLDivElement | null>(null);
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [viewportWidth, setViewportWidth] = useState(() =>
    typeof window === "undefined" ? 1280 : window.innerWidth,
  );
  const [viewportHeight, setViewportHeight] = useState(() =>
    typeof window === "undefined" ? 900 : window.innerHeight,
  );
  const [rowStride, setRowStride] = useState(estimateRowHeight);
  const [scrollY, setScrollY] = useState(0);

  const colCount = resolveCols(cols, viewportWidth);
  const totalRows = Math.ceil(items.length / colCount);

  // Track viewport size.
  useEffect(() => {
    const onResize = () => {
      setViewportWidth(window.innerWidth);
      setViewportHeight(window.innerHeight);
    };
    window.addEventListener("resize", onResize, { passive: true });
    return () => window.removeEventListener("resize", onResize);
  }, []);

  // Track scroll position (rAF-throttled).
  useEffect(() => {
    // EXPERIMENT: rAF disabled — update scroll position directly on each event.
    const onScroll = () => {
      setScrollY(window.scrollY || window.pageYOffset || 0);
    };
    onScroll();
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
    };
  }, []);

  // Measure the true row stride (card height + row gap) from a mounted card.
  useLayoutEffect(() => {
    const grid = gridRef.current;
    if (!grid) return;
    const first = grid.firstElementChild as HTMLElement | null;
    if (!first) return;
    const gap = parseFloat(getComputedStyle(grid).rowGap) || 0;
    const h = first.offsetHeight + gap;
    if (h > 0 && Math.abs(h - rowStride) > 1) setRowStride(h);
  });

  // Absolute document offset of the grid's top edge.
  const gridTopAbs =
    outerRef.current && typeof window !== "undefined"
      ? outerRef.current.getBoundingClientRect().top + (window.scrollY || 0)
      : 0;

  const relativeScroll = scrollY - gridTopAbs;
  const firstVisibleRow = Math.floor(relativeScroll / rowStride);
  const lastVisibleRow = Math.ceil((relativeScroll + viewportHeight) / rowStride);

  const startRow = Math.max(0, firstVisibleRow - overscanRows);
  const endRow = Math.min(totalRows, lastVisibleRow + overscanRows);

  const startIndex = startRow * colCount;
  const endIndex = Math.min(items.length, endRow * colCount);

  const topSpacer = startRow * rowStride;
  const bottomSpacer = Math.max(0, (totalRows - endRow) * rowStride);

  const windowItems = items.slice(startIndex, endIndex);

  // Publish live metrics for the A/B debug panel (instrumentation only).
  useEffect(() => {
    publishWindowMetrics({
      mode: "windowed",
      windowSize: windowItems.length,
      overscanRows,
      visibleRows: Math.max(0, lastVisibleRow - firstVisibleRow),
      startRow,
      endRow,
      totalRows,
      colCount,
      rowStride,
      topSpacer,
      bottomSpacer,
    });
    return () => resetWindowMetrics();
  }, [
    windowItems.length,
    overscanRows,
    firstVisibleRow,
    lastVisibleRow,
    startRow,
    endRow,
    totalRows,
    colCount,
    rowStride,
    topSpacer,
    bottomSpacer,
  ]);



  return (
    <div ref={outerRef}>
      {topSpacer > 0 && <div aria-hidden style={{ height: topSpacer }} />}
      <TwoPhaseGrid cols={cols} itemCount={windowItems.length} preloadSrcs={preloadSrcs} className={className}>
        <div ref={gridRef} data-product-grid data-windowed="on" className={className}>
          {windowItems.map((item, i) => {
            const index = startIndex + i;
            return (
              <div key={getKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
                {renderItem(item, index)}
              </div>
            );
          })}
        </div>
      </TwoPhaseGrid>
      {bottomSpacer > 0 && <div aria-hidden style={{ height: bottomSpacer }} />}
    </div>
  );
}

/** Read the `?ff-window=on` experiment flag (client-only). */
function useWindowExperiment(): boolean {
  const [on, setOn] = useState(false);
  useEffect(() => {
    try {
      setOn(new URLSearchParams(window.location.search).get("ff-window") === "on");
    } catch {
      setOn(false);
    }
  }, []);
  return on;
}

/**
 * Adaptive product grid. Small lists render as a plain responsive grid (also
 * the SSR output). Large lists use the append-only IncrementalGrid by default;
 * with `?ff-window=on` they use the experimental true windowed virtualization
 * so the two architectures can be A/B tested on the same build.
 */
export function VirtualizedProductGrid<T>({
  items,
  renderItem,
  getKey,
  className,
  cols,
  virtualizeThreshold = 32,
  getImageSrc,
}: Props<T>) {
  const windowExperiment = useWindowExperiment();
  const virtualizationEnabled = useFlag("virtualization");
  const big = items.length > virtualizeThreshold;
  const stableKey = getKey ?? ((item: T) => {
    const candidate = item as { id?: string | null; slug?: string | null };
    const key = candidate.id || candidate.slug;
    if (!key) throw new Error("VirtualizedProductGrid requires getKey for items without id/slug");
    return key;
  });

  // Resolve the first ~60 image URLs for the two-phase warm-up (off-DOM decode).
  // Only enabled when the caller provides getImageSrc.
  const preloadSrcs = getImageSrc
    ? items
        .slice(0, 60)
        .map((item) => getImageSrc(item) ?? "")
        .filter((s): s is string => !!s)
    : undefined;

  // Large catalogs: bounded, transform-free rendering.
  if (big && virtualizationEnabled) {
    if (windowExperiment) {
      return (
        <WindowedGrid
          items={items}
          renderItem={renderItem}
          getKey={stableKey}
          className={className}
          cols={cols}
          preloadSrcs={preloadSrcs}
        />
      );
    }
    return (
      <IncrementalGrid
        items={items}
        renderItem={renderItem}
        getKey={stableKey}
        className={className}
        cols={cols}
        preloadSrcs={preloadSrcs}
        // 16 cards per batch keeps paint/memory cost low while feeling like
        // infinite scroll on low-end phones.
        batchSize={16}
      />
    );
  }

  // Small lists, or explicit `?ff-disable=virtualization`: plain responsive grid
  // with no IntersectionObserver sentinel and no scroll windowing.
  return (
    <TwoPhaseGrid cols={cols} itemCount={items.length} preloadSrcs={preloadSrcs} className={className}>
      <div data-product-grid className={className}>
        {items.map((item, i) => (
          <div key={stableKey(item)} data-product-card-frame className="h-full min-w-0 [&>*]:h-full">
            {renderItem(item, i)}
          </div>
        ))}
      </div>
    </TwoPhaseGrid>
  );
}

export default memo(VirtualizedProductGrid) as typeof VirtualizedProductGrid;
