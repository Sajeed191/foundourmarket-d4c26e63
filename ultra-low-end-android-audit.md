# Ultra Low-End Android GPU/Compositor Audit

Static audit scope: `src/**/*.tsx`, `src/**/*.ts`, `src/**/*.css`. The scan below looks for actual CSS/style/class/motion patterns that can create compositor layers or image texture churn; ordinary array `.filter()` calls are intentionally excluded.

## Exact root cause

This is a Chrome Android GPU/compositor stability failure triggered by **many promoted layers containing decoded product images**, then aggravated by **image texture churn** while scrolling. The code had three high-risk patterns together:
1. Product-heavy UI used transforms/3D perspective/blur/filter/drop-shadow/masks/opacity transitions, especially `HeroCarousel`, `ProductCard`, and global glass styles.
2. Product images were repeatedly decoded/revealed/transitioned, and `ProductImage` previously removed `src/srcset` on unmount, forcing Chrome to tear down and recreate GPU textures during list/card recycling.
3. Palette extraction (`image-palette.ts`) performed a second image load and canvas readback per uncached product image, increasing decode/canvas memory pressure on 4GB Android.

The symptoms map directly to this failure mode: colored rectangles = stale/corrupt image textures; text smearing/duplicates = invalid compositor tiles not being repainted; random card blocks/black flashes = GPU tile/context recovery under memory pressure. iPhone/desktop do not reproduce because they use different compositor/GPU drivers and have more reliable texture recycling.

## Highest-risk evidence before the ultra-mode guard

### `src/components/site/HeroCarousel.tsx`
- Compositor triggers: **CSS/keyframe animation** ×15, **transform** ×15, **large shadows/glows** ×6, **filter/blur** ×7, **opacity/opacity animation** ×5, **will-change** ×2, **perspective/3D** ×2, **mask/clip** ×2, **translate3d/translateZ** ×1
- Runtime triggers: **useEffect** ×4, **observer** ×2, **interval/timer** ×1
- Image/canvas/GPU triggers: **Image decode/preload** ×1
  - L22 `CSS/keyframe animation`: `// Apple/Stripe-style premium easing for the showcase transitions.`
  - L179 `transform`: `<div aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-screen -translate-x-1/2 -z-0 overflow-hidden">`
  - L180 `large shadows/glows`: `{/* Heavy blurred backdrop + radial glows are GPU-expensive and, on`
  - L191 `filter/blur`: `className="absolute inset-0 size-full scale-125 object-cover opacity-[0.14] blur-[64px]"`
  - L191 `opacity/opacity animation`: `className="absolute inset-0 size-full scale-125 object-cover opacity-[0.14] blur-[64px]"`
  - L192 `CSS/keyframe animation`: `style={{ transition: "opacity 800ms ease" }}`
  - L196 `transform`: `className="absolute left-1/2 -top-[20%] -translate-x-1/2 size-[460px] sm:size-[620px] rounded-full blur-[110px]"`
  - L196 `filter/blur`: `className="absolute left-1/2 -top-[20%] -translate-x-1/2 size-[460px] sm:size-[620px] rounded-full blur-[110px]"`
  - L197 `will-change`: `style={{ background: `radial-gradient(circle, ${ambient}, transparent 70%)`, transition: "background 700ms ease", willChange: "background" }}`
  - L197 `CSS/keyframe animation`: `style={{ background: `radial-gradient(circle, ${ambient}, transparent 70%)`, transition: "background 700ms ease", willChange: "background" }}`
  - L200 `transform`: `className="absolute left-1/2 top-1/3 -translate-x-1/2 h-[60%] w-[120%]"`
  - L201 `CSS/keyframe animation`: `style={{ background: `radial-gradient(ellipse at 50% 30%, ${ambientSoft}, transparent 65%)`, transition: "background 700ms ease" }}`
  - L203 `transform`: `<div className="absolute left-1/2 -top-[28%] -translate-x-1/2 size-[360px] sm:size-[460px] rounded-full blur-[100px] opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.30), transparent 70%)"`
  - L203 `filter/blur`: `<div className="absolute left-1/2 -top-[28%] -translate-x-1/2 size-[360px] sm:size-[460px] rounded-full blur-[100px] opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.30), transparent 70%)"`
  - L203 `opacity/opacity animation`: `<div className="absolute left-1/2 -top-[28%] -translate-x-1/2 size-[360px] sm:size-[460px] rounded-full blur-[100px] opacity-40" style={{ background: "radial-gradient(circle, oklch(0.74 0.19 49 / 0.30), transparent 70%)"`
  - L212 `CSS/keyframe animation`: `className="inline-flex h-8 items-center gap-1.5 rounded-full glass-strong px-3.5 text-[10px] font-mono uppercase tracking-[0.22em] text-foreground ring-1 ring-accent/40 animate-fade-in"`
  - L213 `large shadows/glows`: `style={{ boxShadow: "0 0 18px -4px oklch(0.74 0.19 49 / 0.5), inset 0 1px 0 oklch(1 0 0 / 0.08)" }}`
  - L227 `perspective/3D`: `className={`hero-stage relative mt-6 sm:mt-8 w-full max-w-none select-none overflow-hidden touch-pan-y outline-none ${lowEnd ? "" : "[perspective:1600px]"}`}`
  - L230 `mask/clip`: `WebkitMaskImage: lowEnd`
  - L233 `mask/clip`: `maskImage: lowEnd`
  - L254 `transform`: `className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[130%] rounded-full blur-3xl opacity-70"`
  - L254 `filter/blur`: `className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[130%] rounded-full blur-3xl opacity-70"`
  - L254 `opacity/opacity animation`: `className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 size-[130%] rounded-full blur-3xl opacity-70"`
  - L255 `CSS/keyframe animation`: `style={{ background: `radial-gradient(circle, ${ambient}, transparent 68%)`, transition: "background 800ms ease" }}`
  - … 39 more evidence lines omitted

### `src/components/site/ProductCard.tsx`
- Compositor triggers: **large shadows/glows** ×9, **transform** ×5, **filter/blur** ×2, **backdrop-filter** ×2, **CSS/keyframe animation** ×6
- Runtime triggers: **interval/timer** ×2
  - L90 `large shadows/glows`: `boxShadow: "0 2px 6px rgba(0,0,0,0.28)",`
  - L115 `transform`: `// Product-listing badges are intentionally static: transform/keyframe badge`
  - L131 `large shadows/glows`: `"inline-flex h-[22px] sm:h-[28px] w-full max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-bold uppercase leading-none tracking-[0.4px] shadow-[0_2px_8px_rgba(`
  - L179 `filter/blur`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L179 `backdrop-filter`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L179 `large shadows/glows`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L180 `CSS/keyframe animation`: `className={`absolute right-3 top-3 z-10 grid h-[36px] w-[36px] sm:h-[46px] sm:w-[46px] place-items-center rounded-full text-white transition-colors ${saved ? "text-accent" : "hover:text-accent"} ${justSaved ? "animate-[s`
  - L199 `filter/blur`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L199 `backdrop-filter`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L199 `large shadows/glows`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L200 `CSS/keyframe animation`: `className="absolute right-3 top-[52px] sm:top-[64px] z-10 grid h-[36px] w-[36px] sm:h-[46px] sm:w-[46px] place-items-center rounded-full text-white transition-colors hover:text-accent"`
  - L221 `large shadows/glows`: `const glow = "0 6px 18px -4px rgba(255,122,0,0.45)";`
  - L233 `large shadows/glows`: `<div className="flex h-[46px] sm:h-[52px] w-full items-center justify-between rounded-full px-2" style={{ background: gradient, boxShadow: glow }}>`
  - L234 `transform`: `<button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty - 1); }} aria-label="Decrease quantity" className="grid size-11 place-items-center rounded-full text-black active:scale-95 transition-transform"`
  - L234 `CSS/keyframe animation`: `<button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty - 1); }} aria-label="Decrease quantity" className="grid size-11 place-items-center rounded-full text-black active:scale-95 transition-transform"`
  - L238 `transform`: `<button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty + 1); }} aria-label="Increase quantity" className="grid size-11 place-items-center rounded-full text-black active:scale-95 transition-transform"`
  - L238 `CSS/keyframe animation`: `<button onClick={(e) => { e.preventDefault(); void setQty(product.slug, qty + 1); }} aria-label="Increase quantity" className="grid size-11 place-items-center rounded-full text-black active:scale-95 transition-transform"`
  - L249 `large shadows/glows`: `style={justAdded ? undefined : { background: gradient, boxShadow: glow }}`
  - L250 `transform`: `className={`product-typography inline-flex h-[46px] sm:h-[52px] w-full items-center justify-center gap-2 rounded-full text-[14px] sm:text-[16px] font-bold transition-[filter,transform] duration-150 hover:brightness-105 h`
  - L250 `CSS/keyframe animation`: `className={`product-typography inline-flex h-[46px] sm:h-[52px] w-full items-center justify-center gap-2 rounded-full text-[14px] sm:text-[16px] font-bold transition-[filter,transform] duration-150 hover:brightness-105 h`
  - L304 `transform`: `className="product-card-shell group relative flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hov`
  - L304 `large shadows/glows`: `className="product-card-shell group relative flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hov`
  - L304 `CSS/keyframe animation`: `className="product-card-shell group relative flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hov`
  - L309 `large shadows/glows`: `the product's own dominant colors, soft color glow, contain fit. */}`
  - … 2 more evidence lines omitted

### `src/components/site/AdaptiveProductMedia.tsx`
- Compositor triggers: **CSS/keyframe animation** ×3, **transform** ×1, **opacity/opacity animation** ×1
- Runtime triggers: **useEffect** ×1
  - L37 `CSS/keyframe animation`: `transition: ultraLowEndAndroid ? "none" : "background 300ms ease",`
  - L44 `CSS/keyframe animation`: `className="absolute inset-0 animate-pulse"`
  - L59 `transform`: `: "relative z-[1] block h-full w-full rounded-[14px] object-contain object-center transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.03]"`
  - L59 `CSS/keyframe animation`: `: "relative z-[1] block h-full w-full rounded-[14px] object-contain object-center transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.03]"`
  - L61 `opacity/opacity animation`: `style={{ opacity: revealed ? 1 : 0 }}`
  - L27 `useEffect`: `useEffect(() => setLoadedSrc(null), [src]);`

### `src/components/site/ProductImage.tsx`
- Runtime triggers: **useEffect** ×1
- Image/canvas/GPU triggers: **Image decode/preload** ×1
  - L55 `useEffect`: `useEffect(() => {`
  - L91 `Image decode/preload`: `decoding="async"`

### `src/lib/image-palette.ts`
- Compositor triggers: **large shadows/glows** ×3
- Image/canvas/GPU triggers: **Image decode/preload** ×2, **Canvas readback** ×4
  - L21 `large shadows/glows`: `glow: string;`
  - L31 `large shadows/glows`: `glow: "transparent",`
  - L55 `large shadows/glows`: `glow: "transparent",`
  - L119 `Image decode/preload`: `const img = new Image();`
  - L121 `Image decode/preload`: `img.decoding = "async";`
  - L132 `Canvas readback`: `const canvas = document.createElement("canvas");`
  - L135 `Canvas readback`: `const ctx = canvas.getContext("2d", { willReadFrequently: true });`
  - L137 `Canvas readback`: `ctx.drawImage(img, 0, 0, size, size);`
  - L138 `Canvas readback`: `const { data } = ctx.getImageData(0, 0, size, size);`

### `src/lib/use-image-palette.ts`
- Runtime triggers: **useEffect** ×1
  - L33 `useEffect`: `useEffect(() => {`

### `src/lib/use-low-end-device.ts`
- Compositor triggers: **CSS/keyframe animation** ×2, **transform** ×3, **contain/content-visibility** ×1, **large shadows/glows** ×2
- Runtime triggers: **useEffect** ×5
  - L10 `CSS/keyframe animation`: `* requested reduced motion. SSR-safe: assumes capable until mounted so the`
  - L55 `transform`: `* compositor bug where many promoted layers (transform + will-change + contain:`
  - L55 `contain/content-visibility`: `* compositor bug where many promoted layers (transform + will-change + contain:`
  - L58 `transform`: `* a transform-free incremental rendering strategy on Android. SSR-safe.`
  - L95 `transform`: `* Decide whether to use the transform-free Incremental Rendering Grid instead`
  - L145 `large shadows/glows`: `* visual effects (visible card count, blur strength, glow, shadows, animation).`
  - L147 `CSS/keyframe animation`: `*   low  — ≤4GB RAM, ≤4 cores, OR prefers-reduced-motion. Minimal blur, no`
  - L148 `large shadows/glows`: `*          heavy glow, simplest animations.`
  - L42 `useEffect`: `useEffect(() => {`
  - L112 `useEffect`: `useEffect(() => {`
  - L120 `useEffect`: `useEffect(() => {`
  - L134 `useEffect`: `useEffect(() => {`
  - L176 `useEffect`: `useEffect(() => {`

### `src/lib/startup-diagnostics.ts`
- Compositor triggers: **transform** ×2, **filter/blur** ×1, **backdrop-filter** ×1
- Runtime triggers: **interval/timer** ×5, **event listener** ×14, **observer** ×2, **useEffect** ×1
- Image/canvas/GPU triggers: **WebGL/context loss** ×2
  - L184 `transform`: `"[style*='transform']",`
  - L192 `filter/blur`: `"[class*='backdrop-blur']",`
  - L192 `backdrop-filter`: `"[class*='backdrop-blur']",`
  - L212 `transform`: `return /transform|translate|scale|rotate|blur|backdrop|filter|will-change|contain|isolation|animate-|shadow-|mask/i.test(value);`
  - L73 `interval/timer`: `else window.setTimeout(persist, 250);`
  - L146 `event listener`: `navigator.serviceWorker.addEventListener("controllerchange", () => {`
  - L149 `event listener`: `navigator.serviceWorker.addEventListener("message", (event) => {`
  - L164 `event listener`: `registration.addEventListener("updatefound", () => {`
  - L207 `interval/timer`: `else window.setTimeout(() => snapshot(label), 750);`
  - L216 `observer`: `if (!isUltraLowEndAndroid() || typeof MutationObserver === "undefined") return;`
  - L231 `interval/timer`: `const timer = window.setInterval(flush, 3000);`
  - L232 `observer`: `const observer = new MutationObserver((mutations) => {`
  - L253 `interval/timer`: `window.setTimeout(() => {`
  - L262 `event listener`: `document.addEventListener(`
  - L271 `event listener`: `document.addEventListener(`
  - L281 `event listener`: `window.addEventListener("pageshow", () => scheduleSnapshot("pageshow"));`
  - L282 `event listener`: `window.addEventListener("orientationchange", () => scheduleSnapshot("orientationchange"));`
  - L283 `event listener`: `document.addEventListener(`
  - L328 `event listener`: `window.addEventListener("error", (event) => {`
  - L340 `event listener`: `window.addEventListener("unhandledrejection", (event) => {`
  - L344 `event listener`: `window.addEventListener("pageshow", (event) => {`
  - L347 `event listener`: `window.addEventListener("pagehide", (event) => {`
  - L350 `event listener`: `window.addEventListener("beforeunload", () => {`
  - L353 `event listener`: `document.addEventListener("visibilitychange", () => {`
  - … 4 more evidence lines omitted

### `src/routes/__root.tsx`
- Compositor triggers: **transform** ×2, **CSS/keyframe animation** ×1, **large shadows/glows** ×1
- Runtime triggers: **Suspense/lazy** ×15, **interval/timer** ×4, **event listener** ×4, **useEffect** ×9
  - L73 `transform`: `body.innerHTML = '<div id="fom-startup-fallback" style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#0a0a0a;color:#f5f5f5;font-family:system-ui,-apple-system,Segoe U`
  - L149 `CSS/keyframe animation`: `className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-xs font-medium uppercase tracking-widest text-accent-foreground transition-colors hover:brightness-110"`
  - L285 `transform`: `// transform/will-change layers during hydration.`
  - L441 `large shadows/glows`: `<div className="mx-auto mb-5 size-16 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border">`
  - L2 `Suspense/lazy`: `import { Suspense, useEffect, useState } from "react";`
  - L40 `Suspense/lazy`: `import { lazyWithRetry, installChunkRecovery } from "@/lib/chunk-recovery";`
  - L77 `interval/timer`: `try { setTimeout(commit, 0); } catch(x) {}`
  - L81 `event listener`: `else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', commit, { once: true });`
  - L93 `event listener`: `window.addEventListener('vite:preloadError', function(e){ try { e.preventDefault(); } catch(x) {} window.__fomRecover(e && e.payload || e); });`
  - L94 `event listener`: `window.addEventListener('unhandledrejection', function(e){ if (isEntryFailure(e.reason)) { try { e.preventDefault(); } catch(x) {} window.__fomRecover(e.reason); } });`
  - L95 `event listener`: `window.addEventListener('error', function(e){ var t = e && e.target; var src = t && (t.src || t.href) || ''; if (isEntryFailure(e && e.message) || isEntryFailure(src)) window.__fomRecover(e && e.message || src); }, true)`
  - L102 `Suspense/lazy`: `const AdminFloatingToolbar = lazyWithRetry(() =>`
  - L107 `Suspense/lazy`: `const AdminOverlayIndicator = lazyWithRetry(() =>`
  - L112 `Suspense/lazy`: `const AdminCommandCenter = lazyWithRetry(() =>`
  - L115 `Suspense/lazy`: `const AdminMobileBar = lazyWithRetry(() =>`
  - L118 `Suspense/lazy`: `const CompareTray = lazyWithRetry(() =>`
  - L121 `Suspense/lazy`: `const InstallPrompt = lazyWithRetry(() =>`
  - L124 `Suspense/lazy`: `const LiveChat = lazyWithRetry(() =>`
  - L127 `Suspense/lazy`: `const SupportReplyWatcher = lazyWithRetry(() =>`
  - L132 `Suspense/lazy`: `const RegionSelectModal = lazyWithRetry(() =>`
  - L359 `useEffect`: `useEffect(() => {`
  - L373 `interval/timer`: `const t = setTimeout(() => setReady(true), 1500);`
  - L381 `Suspense/lazy`: `<Suspense fallback={null}>`
  - L383 `Suspense/lazy`: `</Suspense>`
  - … 12 more evidence lines omitted

### `src/styles.css`
- Compositor triggers: **CSS/keyframe animation** ×139, **large shadows/glows** ×87, **transform** ×107, **opacity/opacity animation** ×48, **filter/blur** ×29, **mix-blend-mode** ×3, **backdrop-filter** ×17, **mask/clip** ×7, **isolation** ×9, **contain/content-visibility** ×17, **perspective/3D** ×7, **will-change** ×6
  - L3 `CSS/keyframe animation`: `@import "tw-animate-css";`
  - L144 `large shadows/glows`: `/* Reusable gradients & glows */`
  - L154 `large shadows/glows`: `--shadow-glow: 0 0 0 1px oklch(0.74 0.19 49 / 0.3), 0 12px 40px -8px oklch(0.74 0.19 49 / 0.4);`
  - L159 `CSS/keyframe animation`: `@keyframes fade-up {`
  - L160 `transform`: `from { opacity: 0; transform: translateY(20px); }`
  - L160 `opacity/opacity animation`: `from { opacity: 0; transform: translateY(20px); }`
  - L161 `transform`: `to { opacity: 1; transform: translateY(0); }`
  - L161 `opacity/opacity animation`: `to { opacity: 1; transform: translateY(0); }`
  - L163 `CSS/keyframe animation`: `@keyframes rise-only {`
  - L164 `transform`: `from { transform: translateY(20px); }`
  - L165 `transform`: `to { transform: translateY(0); }`
  - L167 `CSS/keyframe animation`: `@keyframes slide-in-up {`
  - L168 `transform`: `from { opacity: 0; transform: translateY(120%); }`
  - L168 `opacity/opacity animation`: `from { opacity: 0; transform: translateY(120%); }`
  - L169 `transform`: `to { opacity: 1; transform: translateY(0); }`
  - L169 `opacity/opacity animation`: `to { opacity: 1; transform: translateY(0); }`
  - L171 `CSS/keyframe animation`: `@keyframes float {`
  - L172 `transform`: `0%, 100% { transform: translateY(0); }`
  - L173 `transform`: `50% { transform: translateY(-10px); }`
  - L175 `large shadows/glows`: `@keyframes glow-pulse {`
  - L175 `CSS/keyframe animation`: `@keyframes glow-pulse {`
  - L176 `opacity/opacity animation`: `0%, 100% { opacity: 0.4; }`
  - L177 `opacity/opacity animation`: `50% { opacity: 0.85; }`
  - L179 `CSS/keyframe animation`: `@keyframes orb-drift {`
  - … 452 more evidence lines omitted

## Complete compositor-trigger inventory

### `src/components/account/OrderDetailsDrawer.tsx`
- **filter/blur** ×8, **opacity/opacity animation** ×4, **CSS/keyframe animation** ×21, **backdrop-filter** ×3, **large shadows/glows** ×1, **transform** ×13, **contain/content-visibility** ×1
  - L163 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `id=eq.${orderId}` }, refresh)`
  - L164 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "order_items", filter: `order_id=eq.${orderId}` }, refresh)`
  - L165 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `order_id=eq.${orderId}` }, refresh)`
  - L167 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "refunds", filter: `order_id=eq.${orderId}` }, refresh)`
  - L168 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` }, refresh)`
  - L330 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L330 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L331 `filter/blur`: `onClick={onClose} className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" aria-hidden />`
  - L331 `backdrop-filter`: `onClick={onClose} className="fixed inset-0 z-[80] bg-background/70 backdrop-blur-sm" aria-hidden />`
  - L332 `CSS/keyframe animation`: `<motion.div`
  - … 41 more compositor lines omitted

### `src/components/admin/AIOperationsCenter.tsx`
- **opacity/opacity animation** ×6, **CSS/keyframe animation** ×14, **large shadows/glows** ×2, **transform** ×3, **filter/blur** ×1, **backdrop-filter** ×1
  - L40 `opacity/opacity animation`: `<motion.section id={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L40 `CSS/keyframe animation`: `<motion.section id={id} initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L42 `large shadows/glows`: `style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}>`
  - L48 `CSS/keyframe animation`: `</motion.section>`
  - L92 `transform`: `className={cn("text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all",`
  - L92 `opacity/opacity animation`: `className={cn("text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all",`
  - L92 `CSS/keyframe animation`: `className={cn("text-[9px] font-mono uppercase tracking-widest px-1.5 py-0.5 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all",`
  - L112 `transform`: `className={cn("text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all", tones[tone])}>`
  - L112 `opacity/opacity animation`: `className={cn("text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all", tones[tone])}>`
  - L112 `CSS/keyframe animation`: `className={cn("text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full border inline-flex items-center gap-1 disabled:opacity-50 active:scale-95 transition-all", tones[tone])}>`
  - … 17 more compositor lines omitted

### `src/components/admin/AISummaryCard.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×2, **large shadows/glows** ×1
  - L23 `opacity/opacity animation`: `<motion.section id="ai-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L23 `CSS/keyframe animation`: `<motion.section id="ai-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L25 `large shadows/glows`: `style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}>`
  - L42 `CSS/keyframe animation`: `</motion.section>`

### `src/components/admin/AcquisitionSummary.tsx`
- **CSS/keyframe animation** ×1
  - L53 `CSS/keyframe animation`: `<div className="grid place-items-center py-6"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>`

### `src/components/admin/AdminCommandCenter.tsx`
- **CSS/keyframe animation** ×2, **opacity/opacity animation** ×1
  - L185 `CSS/keyframe animation`: `<Loader2 className="size-3.5 animate-spin" /> Searching…`
  - L319 `opacity/opacity animation`: `className={`h-9 px-3 rounded-xl text-xs font-medium inline-flex items-center gap-2 ${confirmCmd?.danger ? "bg-rose-500 text-white" : "bg-accent text-accent-foreground"} disabled:opacity-50`}>`
  - L320 `CSS/keyframe animation`: `{running ? <Loader2 className="size-3.5 animate-spin" /> : null} Confirm`

### `src/components/admin/AdminCustomersTab.tsx`
- **CSS/keyframe animation** ×1, **transform** ×1
  - L61 `CSS/keyframe animation`: `return <div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L72 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`

### `src/components/admin/AdminFloatingToolbar.tsx`
- **CSS/keyframe animation** ×30, **opacity/opacity animation** ×4, **filter/blur** ×3, **backdrop-filter** ×2, **large shadows/glows** ×2, **transform** ×2
  - L87 `CSS/keyframe animation`: `<motion.div`
  - L88 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12, scale: 0.96 }}`
  - L89 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0, scale: 1 }}`
  - L90 `opacity/opacity animation`: `exit={{ opacity: 0, y: 12, scale: 0.96 }}`
  - L91 `CSS/keyframe animation`: `transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}`
  - L92 `filter/blur`: `className="mb-3 w-60 overflow-hidden rounded-2xl border border-accent/30 bg-background/80 p-2 backdrop-blur-2xl shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"`
  - L92 `backdrop-filter`: `className="mb-3 w-60 overflow-hidden rounded-2xl border border-accent/30 bg-background/80 p-2 backdrop-blur-2xl shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"`
  - L92 `large shadows/glows`: `className="mb-3 w-60 overflow-hidden rounded-2xl border border-accent/30 bg-background/80 p-2 backdrop-blur-2xl shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"`
  - L111 `CSS/keyframe animation`: `className="mb-2 flex w-full items-center gap-2 rounded-xl border border-accent/40 bg-accent/15 px-3 py-2.5 transition-all hover:bg-accent/25"`
  - L122 `CSS/keyframe animation`: `"mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 transition-all",`
  - … 33 more compositor lines omitted

### `src/components/admin/AdminImageManager.tsx`
- **filter/blur** ×3, **backdrop-filter** ×3, **large shadows/glows** ×1, **CSS/keyframe animation** ×7, **opacity/opacity animation** ×4
  - L193 `filter/blur`: `className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-xl shadow-[0_`
  - L193 `backdrop-filter`: `className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-xl shadow-[0_`
  - L193 `large shadows/glows`: `className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-xl shadow-[0_`
  - L193 `CSS/keyframe animation`: `className="absolute bottom-4 left-4 z-20 flex items-center gap-1.5 rounded-full border border-accent/40 bg-background/70 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-accent backdrop-blur-xl shadow-[0_`
  - L208 `CSS/keyframe animation`: `<motion.div`
  - L209 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L210 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L211 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L212 `filter/blur`: `className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"`
  - L212 `backdrop-filter`: `className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"`
  - … 8 more compositor lines omitted

### `src/components/admin/AdminMobileBar.tsx`
- **CSS/keyframe animation** ×10, **opacity/opacity animation** ×5, **filter/blur** ×5, **backdrop-filter** ×3, **large shadows/glows** ×5, **transform** ×1
  - L89 `CSS/keyframe animation`: `<motion.div`
  - L90 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L91 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L92 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L93 `filter/blur`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm"`
  - L93 `backdrop-filter`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm"`
  - L96 `CSS/keyframe animation`: `<motion.div`
  - L100 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 320, damping: 32 }}`
  - L101 `filter/blur`: `className="relative z-10 w-full rounded-t-3xl border-t border-accent/25 bg-background/95 px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] pt-3 backdrop-blur-2xl shadow-[0_-20px_60px_-15px_oklch(0.74_0.19_49/0`
  - L101 `backdrop-filter`: `className="relative z-10 w-full rounded-t-3xl border-t border-accent/25 bg-background/95 px-4 pb-[max(1.5rem,calc(env(safe-area-inset-bottom)+1rem))] pt-3 backdrop-blur-2xl shadow-[0_-20px_60px_-15px_oklch(0.74_0.19_49/0`
  - … 19 more compositor lines omitted

### `src/components/admin/AdminNavDrawer.tsx`
- **transform** ×2, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×2, **CSS/keyframe animation** ×8, **opacity/opacity animation** ×2
  - L29 `transform`: `className="lg:hidden fixed top-3 left-3 z-40 size-10 grid place-items-center rounded-xl bg-background/70 backdrop-blur-xl border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-30`
  - L29 `filter/blur`: `className="lg:hidden fixed top-3 left-3 z-40 size-10 grid place-items-center rounded-xl bg-background/70 backdrop-blur-xl border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-30`
  - L29 `backdrop-filter`: `className="lg:hidden fixed top-3 left-3 z-40 size-10 grid place-items-center rounded-xl bg-background/70 backdrop-blur-xl border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-30`
  - L29 `large shadows/glows`: `className="lg:hidden fixed top-3 left-3 z-40 size-10 grid place-items-center rounded-xl bg-background/70 backdrop-blur-xl border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-30`
  - L29 `CSS/keyframe animation`: `className="lg:hidden fixed top-3 left-3 z-40 size-10 grid place-items-center rounded-xl bg-background/70 backdrop-blur-xl border border-white/[0.08] hover:bg-white/[0.06] hover:border-accent/25 transition-all duration-30`
  - L37 `CSS/keyframe animation`: `<motion.button`
  - L38 `opacity/opacity animation`: `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L40 `filter/blur`: `className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"`
  - L40 `backdrop-filter`: `className="lg:hidden fixed inset-0 z-40 bg-black/70 backdrop-blur-sm"`
  - L48 `CSS/keyframe animation`: `<motion.aside`
  - … 8 more compositor lines omitted

### `src/components/admin/AdminOverlayIndicator.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×6, **transform** ×1, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1
  - L21 `CSS/keyframe animation`: `<motion.div`
  - L22 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L23 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L24 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L28 `CSS/keyframe animation`: `<motion.div`
  - L29 `opacity/opacity animation`: `initial={{ opacity: 0, y: -12 }}`
  - L30 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L31 `opacity/opacity animation`: `exit={{ opacity: 0, y: -12 }}`
  - L32 `CSS/keyframe animation`: `transition={{ duration: 0.22, ease: [0.16, 1, 0.3, 1] }}`
  - L33 `transform`: `className="fixed left-1/2 top-3 z-[56] -translate-x-1/2 print:hidden"`
  - … 5 more compositor lines omitted

### `src/components/admin/AdminProductPanel.tsx`
- **transform** ×1, **filter/blur** ×5, **backdrop-filter** ×5, **large shadows/glows** ×1, **CSS/keyframe animation** ×10, **opacity/opacity animation** ×3
  - L280 `transform`: `<div className="fixed bottom-[calc(10.75rem+env(safe-area-inset-bottom))] left-1/2 z-40 w-[calc(100vw-1.5rem)] max-w-[420px] -translate-x-1/2 sm:bottom-6 sm:w-auto">`
  - L281 `filter/blur`: `<div className="flex flex-wrap items-center justify-center gap-1 rounded-3xl border border-accent/30 bg-background/70 px-2 py-1.5 backdrop-blur-2xl shadow-[0_10px_40px_-10px_oklch(0.74_0.19_49/0.5)] sm:flex-nowrap sm:rou`
  - L281 `backdrop-filter`: `<div className="flex flex-wrap items-center justify-center gap-1 rounded-3xl border border-accent/30 bg-background/70 px-2 py-1.5 backdrop-blur-2xl shadow-[0_10px_40px_-10px_oklch(0.74_0.19_49/0.5)] sm:flex-nowrap sm:rou`
  - L281 `large shadows/glows`: `<div className="flex flex-wrap items-center justify-center gap-1 rounded-3xl border border-accent/30 bg-background/70 px-2 py-1.5 backdrop-blur-2xl shadow-[0_10px_40px_-10px_oklch(0.74_0.19_49/0.5)] sm:flex-nowrap sm:rou`
  - L314 `CSS/keyframe animation`: `<motion.div`
  - L315 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L316 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L317 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L318 `filter/blur`: `className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"`
  - L318 `backdrop-filter`: `className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm"`
  - … 15 more compositor lines omitted

### `src/components/admin/AdminShell.tsx`
- **opacity/opacity animation** ×20, **CSS/keyframe animation** ×43, **transform** ×9, **large shadows/glows** ×13, **filter/blur** ×6, **backdrop-filter** ×2
  - L201 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">`
  - L201 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex flex-col items-center gap-3">`
  - L202 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`
  - L204 `CSS/keyframe animation`: `</motion.div>`
  - L216 `CSS/keyframe animation`: `<motion.div`
  - L217 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }}`
  - L218 `CSS/keyframe animation`: `transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}`
  - L229 `CSS/keyframe animation`: `</motion.div>`
  - L252 `opacity/opacity animation`: `<div className="orb animate-orb -top-32 left-1/4 size-[28rem] opacity-30" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L252 `CSS/keyframe animation`: `<div className="orb animate-orb -top-32 left-1/4 size-[28rem] opacity-30" style={{ background: "var(--gradient-ember-soft)" }} />`
  - … 83 more compositor lines omitted

### `src/components/admin/AnnouncementAdminSheet.tsx`
- **CSS/keyframe animation** ×8, **opacity/opacity animation** ×4, **filter/blur** ×2, **backdrop-filter** ×2
  - L147 `CSS/keyframe animation`: `<motion.div`
  - L148 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L149 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L150 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L151 `filter/blur`: `className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"`
  - L151 `backdrop-filter`: `className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"`
  - L154 `CSS/keyframe animation`: `<motion.div`
  - L158 `CSS/keyframe animation`: `transition={{ type: "spring", damping: 32, stiffness: 300 }}`
  - L160 `filter/blur`: `className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none `
  - L160 `backdrop-filter`: `className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none `
  - … 6 more compositor lines omitted

### `src/components/admin/AutomationMonitor.tsx`
- **CSS/keyframe animation** ×1
  - L8 `CSS/keyframe animation`: `running: { label: "Running", cls: "bg-amber-500/15 text-amber-400", icon: <Loader2 className="size-4 animate-spin" /> },`

### `src/components/admin/AutomationSummaryWidget.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×3, **large shadows/glows** ×1
  - L93 `opacity/opacity animation`: `<motion.section id="automation-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L93 `CSS/keyframe animation`: `<motion.section id="automation-summary" initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L95 `large shadows/glows`: `style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}>`
  - L121 `opacity/opacity animation`: `className="h-8 px-3 rounded-full bg-accent text-accent-foreground text-[11px] font-medium inline-flex items-center gap-1.5 disabled:opacity-50">`
  - L122 `CSS/keyframe animation`: `{running ? <Loader2 className="size-3 animate-spin" /> : <Play className="size-3" />} Run now`
  - L133 `CSS/keyframe animation`: `</motion.section>`

### `src/components/admin/BadgeEditorModal.tsx`
- **large shadows/glows** ×5, **CSS/keyframe animation** ×8, **filter/blur** ×3, **backdrop-filter** ×3, **opacity/opacity animation** ×4, **transform** ×1
  - L53 `large shadows/glows`: `glowColor: "",`
  - L68 `CSS/keyframe animation`: `animation: "none",`
  - L80 `large shadows/glows`: `glowColor: b.glowColor,`
  - L95 `CSS/keyframe animation`: `animation: b.animation,`
  - L155 `large shadows/glows`: `? `0 ${Math.round(form.shadowStrength / 12)}px ${Math.round(form.shadowStrength / 4)}px -2px ${form.glowColor || bg}``
  - L178 `filter/blur`: `<div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />`
  - L178 `backdrop-filter`: `<div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />`
  - L179 `CSS/keyframe animation`: `<motion.div`
  - L180 `opacity/opacity animation`: `initial={{ opacity: 0, y: 40 }}`
  - L181 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - … 14 more compositor lines omitted

### `src/components/admin/BadgeSettingsEditor.tsx`
- **opacity/opacity animation** ×3, **CSS/keyframe animation** ×4, **transform** ×1
  - L133 `opacity/opacity animation`: `className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-40"`
  - L135 `CSS/keyframe animation`: `{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />}`
  - L166 `CSS/keyframe animation`: `className={`card-premium rounded-2xl p-4 border transition-opacity ${`
  - L167 `opacity/opacity animation`: `enabled ? "border-transparent" : "border-transparent opacity-60"`
  - L181 `CSS/keyframe animation`: `className={`relative w-11 h-6 rounded-full shrink-0 transition-colors ${`
  - L186 `transform`: `className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${`
  - L186 `CSS/keyframe animation`: `className={`absolute top-0.5 size-5 rounded-full bg-white transition-transform ${`
  - L208 `opacity/opacity animation`: `className="w-full bg-white/5 border border-border rounded-lg px-3 py-2 text-sm font-mono disabled:opacity-50"`

### `src/components/admin/BannerAdminSheet.tsx`
- **CSS/keyframe animation** ×8, **opacity/opacity animation** ×7, **filter/blur** ×2, **backdrop-filter** ×2
  - L231 `CSS/keyframe animation`: `<motion.div`
  - L232 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L233 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L234 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L235 `filter/blur`: `className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"`
  - L235 `backdrop-filter`: `className="fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"`
  - L249 `CSS/keyframe animation`: `<motion.div`
  - L253 `CSS/keyframe animation`: `transition={{ type: "spring", damping: 32, stiffness: 300 }}`
  - L255 `filter/blur`: `className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none `
  - L255 `backdrop-filter`: `className="absolute inset-x-0 bottom-0 max-h-[90vh] overflow-y-auto rounded-t-3xl border-t border-accent/20 bg-background/95 p-5 backdrop-blur-2xl sm:inset-y-0 sm:right-0 sm:left-auto sm:w-full sm:max-w-md sm:max-h-none `
  - … 9 more compositor lines omitted

### `src/components/admin/BulkActionBar.tsx`
- **CSS/keyframe animation** ×12, **opacity/opacity animation** ×2, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×2, **transform** ×1
  - L59 `CSS/keyframe animation`: `<motion.div`
  - L60 `opacity/opacity animation`: `initial={{ y: 80, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 80, opacity: 0 }}`
  - L61 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 380, damping: 30 }}`
  - L64 `filter/blur`: `<div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 shadow-2xl backdrop-blur-xl">`
  - L64 `backdrop-filter`: `<div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 shadow-2xl backdrop-blur-xl">`
  - L64 `large shadows/glows`: `<div className="mx-auto flex max-w-3xl items-center gap-2 rounded-2xl border border-border/60 bg-background/90 p-2 shadow-2xl backdrop-blur-xl">`
  - L72 `CSS/keyframe animation`: `{busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Actions"}`
  - L75 `CSS/keyframe animation`: `</motion.div>`
  - L83 `CSS/keyframe animation`: `<motion.div className="fixed inset-0 z-[70] flex items-end justify-center"`
  - L84 `opacity/opacity animation`: `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>`
  - … 11 more compositor lines omitted

### `src/components/admin/BulkVisibilityPanel.tsx`
- **CSS/keyframe animation** ×10, **opacity/opacity animation** ×5, **filter/blur** ×3, **backdrop-filter** ×3, **large shadows/glows** ×1
  - L141 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" />`
  - L156 `CSS/keyframe animation`: `"flex w-full items-center gap-2.5 rounded-xl border px-3 py-2.5 text-left transition-all",`
  - L185 `CSS/keyframe animation`: `<motion.div`
  - L186 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L187 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L188 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L189 `filter/blur`: `className="absolute inset-0 bg-background/60 backdrop-blur-sm"`
  - L189 `backdrop-filter`: `className="absolute inset-0 bg-background/60 backdrop-blur-sm"`
  - L192 `CSS/keyframe animation`: `<motion.aside`
  - L196 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 260, damping: 30 }}`
  - … 12 more compositor lines omitted

### `src/components/admin/CategoryAdminSheet.tsx`
- **CSS/keyframe animation** ×16, **opacity/opacity animation** ×8, **filter/blur** ×3, **backdrop-filter** ×3, **transform** ×1
  - L608 `CSS/keyframe animation`: `"rounded-xl border bg-white/[0.02] p-2.5 transition-colors",`
  - L691 `CSS/keyframe animation`: `<Loader2 className="size-3.5 animate-spin" />`
  - L729 `CSS/keyframe animation`: `<motion.div`
  - L730 `opacity/opacity animation`: `initial={embedded ? { opacity: 0, y: 8 } : { opacity: 0 }}`
  - L731 `opacity/opacity animation`: `animate={embedded ? { opacity: 1, y: 0 } : { opacity: 1 }}`
  - L732 `opacity/opacity animation`: `exit={embedded ? { opacity: 0, y: 8 } : { opacity: 0 }}`
  - L733 `filter/blur`: `className={embedded ? "" : "fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"}`
  - L733 `backdrop-filter`: `className={embedded ? "" : "fixed inset-0 z-[70] bg-black/70 backdrop-blur-sm"}`
  - L748 `CSS/keyframe animation`: `<motion.div`
  - L752 `CSS/keyframe animation`: `transition={embedded ? undefined : { type: "spring", damping: 32, stiffness: 300 }}`
  - … 21 more compositor lines omitted

### `src/components/admin/CollapsibleModule.tsx`
- **opacity/opacity animation** ×5, **filter/blur** ×1, **CSS/keyframe animation** ×5
  - L67 `opacity/opacity animation`: `className="pointer-events-none absolute -top-20 -right-20 size-40 rounded-full opacity-30"`
  - L68 `filter/blur`: `style={{ background: "var(--gradient-ember-soft)", filter: "blur(28px)" }}`
  - L83 `CSS/keyframe animation`: `<motion.span animate={{ rotate: open ? 180 : 0 }} transition={{ type: "spring", stiffness: 400, damping: 30 }}>`
  - L85 `CSS/keyframe animation`: `</motion.span>`
  - L90 `CSS/keyframe animation`: `<motion.div`
  - L92 `opacity/opacity animation`: `initial={{ height: 0, opacity: 0 }}`
  - L93 `opacity/opacity animation`: `animate={{ height: "auto", opacity: 1 }}`
  - L94 `opacity/opacity animation`: `exit={{ height: 0, opacity: 0 }}`
  - L95 `opacity/opacity animation`: `transition={{ type: "spring", stiffness: 300, damping: 34, opacity: { duration: 0.2 } }}`
  - L95 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 300, damping: 34, opacity: { duration: 0.2 } }}`
  - … 1 more compositor lines omitted

### `src/components/admin/CustomerActionsMenu.tsx`
- **opacity/opacity animation** ×3, **CSS/keyframe animation** ×11, **filter/blur** ×3, **backdrop-filter** ×3, **large shadows/glows** ×2
  - L69 `opacity/opacity animation`: `className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5 active:bg-white/10 disabled:opacity-50 transition-colors ${tone ?? "text-foreground"}`}`
  - L69 `CSS/keyframe animation`: `className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5 active:bg-white/10 disabled:opacity-50 transition-colors ${tone ?? "text-foreground"}`}`
  - L71 `CSS/keyframe animation`: `{k && busy === k ? <Loader2 className="size-4 animate-spin shrink-0" /> : <Icon className="size-4 shrink-0" />}`
  - L145 `CSS/keyframe animation`: `className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"`
  - L152 `filter/blur`: `className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"`
  - L152 `backdrop-filter`: `className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"`
  - L152 `CSS/keyframe animation`: `className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"`
  - L156 `filter/blur`: `className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[oklch(0.16_0.01_260)] shadow-2xl backdrop-blur-xl p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] anima`
  - L156 `backdrop-filter`: `className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[oklch(0.16_0.01_260)] shadow-2xl backdrop-blur-xl p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] anima`
  - L156 `large shadows/glows`: `className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[oklch(0.16_0.01_260)] shadow-2xl backdrop-blur-xl p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] anima`
  - … 12 more compositor lines omitted

### `src/components/admin/CustomerMarketingCard.tsx`
- **CSS/keyframe animation** ×6, **opacity/opacity animation** ×2
  - L49 `CSS/keyframe animation`: `<motion.div`
  - L50 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L51 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L52 `CSS/keyframe animation`: `transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L74 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" />`
  - L94 `CSS/keyframe animation`: `</motion.div>`
  - L115 `CSS/keyframe animation`: `className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"`
  - L117 `CSS/keyframe animation`: `<span className="text-muted-foreground transition-colors group-hover:text-accent">{icon}</span>`

### `src/components/admin/CustomerMarketingHub.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×1, **filter/blur** ×1, **backdrop-filter** ×1
  - L108 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`
  - L233 `opacity/opacity animation`: `className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono disabled:opacity-50 ${`
  - L237 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : icon}`
  - L322 `filter/blur`: `<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />`
  - L322 `backdrop-filter`: `<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />`
  - L382 `CSS/keyframe animation`: `{busy === `panel-dup-${c.id}` ? <Loader2 className="size-3 animate-spin" /> : <Copy className="size-3 text-muted-foreground" />}`

### `src/components/admin/DashboardOverview.tsx`
- **CSS/keyframe animation** ×17, **filter/blur** ×9, **opacity/opacity animation** ×8, **large shadows/glows** ×1, **transform** ×1
  - L166 `CSS/keyframe animation`: `<motion.div`
  - L167 `filter/blur`: `initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}`
  - L167 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16, filter: "blur(6px)" }}`
  - L168 `filter/blur`: `animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}`
  - L168 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}`
  - L169 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 220, damping: 26 }}`
  - L172 `filter/blur`: `<div className="pointer-events-none absolute -top-20 left-1/4 size-72 rounded-full opacity-40" style={{ background: "var(--gradient-ember)", filter: "blur(44px)" }} />`
  - L172 `opacity/opacity animation`: `<div className="pointer-events-none absolute -top-20 left-1/4 size-72 rounded-full opacity-40" style={{ background: "var(--gradient-ember)", filter: "blur(44px)" }} />`
  - L173 `filter/blur`: `<div className="pointer-events-none absolute -bottom-24 -right-10 size-56 rounded-full opacity-25" style={{ background: "radial-gradient(circle, oklch(0.55 0.18 280 / 0.6), transparent 70%)", filter: "blur(40px)" }} />`
  - L173 `opacity/opacity animation`: `<div className="pointer-events-none absolute -bottom-24 -right-10 size-56 rounded-full opacity-25" style={{ background: "radial-gradient(circle, oklch(0.55 0.18 280 / 0.6), transparent 70%)", filter: "blur(40px)" }} />`
  - … 26 more compositor lines omitted

### `src/components/admin/DraftActivityWidget.tsx`
- **CSS/keyframe animation** ×2
  - L74 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" />`
  - L111 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" />`

### `src/components/admin/EditorSaveBar.tsx`
- **opacity/opacity animation** ×2
  - L72 `opacity/opacity animation`: `className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent disabled:opacity-30"`
  - L81 `opacity/opacity animation`: `className="grid size-7 place-items-center rounded-lg border border-white/10 text-muted-foreground hover:text-accent disabled:opacity-30"`

### `src/components/admin/ExecutiveDashboard.tsx`
- **CSS/keyframe animation** ×15, **opacity/opacity animation** ×4, **large shadows/glows** ×2, **transform** ×3
  - L35 `CSS/keyframe animation`: `<motion.section`
  - L37 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L37 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L39 `large shadows/glows`: `style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}`
  - L49 `CSS/keyframe animation`: `</motion.section>`
  - L58 `transform`: `<svg viewBox="0 0 100 100" className="size-full -rotate-90">`
  - L58 `large shadows/glows`: `<svg viewBox="0 0 100 100" className="size-full -rotate-90">`
  - L60 `CSS/keyframe animation`: `<motion.circle cx="50" cy="50" r={r} fill="none" stroke="currentColor" strokeWidth="8" strokeLinecap="round"`
  - L63 `CSS/keyframe animation`: `transition={{ duration: 1, ease: EASE }} />`
  - L81 `CSS/keyframe animation`: `<motion.div className={cn("h-full rounded-full", tone)} initial={{ width: 0 }} animate={{ width: `${value}%` }} transition={{ duration: 0.8, ease: EASE }} />`
  - … 14 more compositor lines omitted

### `src/components/admin/ExecutiveQuickCard.tsx`
- **CSS/keyframe animation** ×8, **opacity/opacity animation** ×1, **large shadows/glows** ×1
  - L19 `CSS/keyframe animation`: `<motion.div`
  - L20 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L20 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: EASE }}`
  - L22 `large shadows/glows`: `style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.05), 0 22px 50px -32px oklch(0 0 0 / 0.85)" }}`
  - L29 `CSS/keyframe animation`: `<Link to="/admin-executive" className="text-[10px] font-mono uppercase tracking-widest px-2.5 py-1 rounded-full bg-accent/15 text-accent border border-accent/30 hover:bg-accent/25 transition-all inline-flex items-center `
  - L35 `CSS/keyframe animation`: `<div className="min-h-[160px] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L39 `CSS/keyframe animation`: `<Link to="/admin-executive" search={{ view: "health" }} className="rounded-xl border border-white/5 bg-white/[0.02] p-3 hover:border-accent/30 transition-all">`
  - L53 `CSS/keyframe animation`: `<Link to="/admin-executive" search={{ view: "risks" }} className="block rounded-xl border border-rose-400/20 bg-rose-400/5 p-3 hover:border-rose-400/40 transition-all">`
  - L58 `CSS/keyframe animation`: `<Link to="/admin-executive" search={{ view: "opportunities" }} className="block rounded-xl border border-emerald-400/20 bg-emerald-400/5 p-3 hover:border-emerald-400/40 transition-all">`
  - L64 `CSS/keyframe animation`: `</motion.div>`

### `src/components/admin/ExecutiveSummaryPanel.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×2, **filter/blur** ×1, **backdrop-filter** ×1
  - L24 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L43 `CSS/keyframe animation`: `<motion.section`
  - L44 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }}`
  - L45 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L46 `CSS/keyframe animation`: `transition={{ duration: 0.4 }}`
  - L47 `filter/blur`: `className="rounded-2xl border border-accent/30 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"`
  - L47 `backdrop-filter`: `className="rounded-2xl border border-accent/30 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"`
  - L52 `CSS/keyframe animation`: `<span className="size-1.5 rounded-full bg-accent animate-pulse" />`
  - L94 `CSS/keyframe animation`: `</motion.section>`

### `src/components/admin/FinancialInsightsPanel.tsx`
- **CSS/keyframe animation** ×13, **opacity/opacity animation** ×5, **filter/blur** ×1, **backdrop-filter** ×1
  - L42 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L58 `CSS/keyframe animation`: `<motion.section`
  - L59 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }}`
  - L60 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L61 `CSS/keyframe animation`: `transition={{ duration: 0.4 }}`
  - L62 `filter/blur`: `className="rounded-2xl border border-accent/30 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"`
  - L62 `backdrop-filter`: `className="rounded-2xl border border-accent/30 bg-gradient-to-br from-white/[0.04] to-transparent p-5 backdrop-blur-xl"`
  - L67 `CSS/keyframe animation`: `<span className="size-1.5 rounded-full bg-accent animate-pulse" />`
  - L77 `CSS/keyframe animation`: `</motion.section>`
  - L138 `opacity/opacity animation`: `className="flex items-center justify-center gap-1.5 rounded-xl border border-emerald-400/40 bg-emerald-400/10 px-3 py-2.5 text-xs font-medium text-foreground transition-all hover:bg-emerald-400/20 disabled:opacity-40"`
  - … 10 more compositor lines omitted

### `src/components/admin/FinancialMarketingCard.tsx`
- **CSS/keyframe animation** ×6, **opacity/opacity animation** ×2
  - L54 `CSS/keyframe animation`: `<motion.div`
  - L55 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L56 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L57 `CSS/keyframe animation`: `transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L72 `CSS/keyframe animation`: `<div className="h-28 grid place-items-center text-muted-foreground"><Loader2 className="size-4 animate-spin" /></div>`
  - L96 `CSS/keyframe animation`: `</motion.div>`
  - L119 `CSS/keyframe animation`: `className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"`
  - L121 `CSS/keyframe animation`: `<span className="text-muted-foreground transition-colors group-hover:text-accent">{icon}</span>`

### `src/components/admin/FinancialMarketingHub.tsx`
- **CSS/keyframe animation** ×3, **transform** ×1, **opacity/opacity animation** ×2
  - L104 `CSS/keyframe animation`: `<div className="rounded-2xl glass px-5 py-10 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L227 `transform`: `{c.roi >= 1.5 && <IconBtn busy={busy === `c-scale-${c.id}`} title="Scale budget" onClick={() => void run(`c-scale-${c.id}`, () => scaleCampaign(c), "Scaled")}><TrendingUp className="size-3" /></IconBtn>}`
  - L333 `opacity/opacity animation`: `<button disabled={busy} onClick={onClick} className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono disabled:opacity-50 ${primary ? "bg-accent/15 text-accent bord`
  - L334 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : icon}{children}`
  - L341 `opacity/opacity animation`: `<button disabled={busy} title={title} onClick={onClick} className="size-6 grid place-items-center rounded-lg border border-border hover:bg-white/5 disabled:opacity-50">`
  - L342 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : children}`

### `src/components/admin/GlobalExpansionWidget.tsx`
- **CSS/keyframe animation** ×1
  - L24 `CSS/keyframe animation`: `<div key={i} className="h-20 rounded-xl bg-muted/30 animate-pulse" />`

### `src/components/admin/InlineActiveToggle.tsx`
- **filter/blur** ×1, **backdrop-filter** ×1, **opacity/opacity animation** ×1, **CSS/keyframe animation** ×2
  - L56 `filter/blur`: `"inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-widest backdrop-blur-md transition-all disabled:opacity-60",`
  - L56 `backdrop-filter`: `"inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-widest backdrop-blur-md transition-all disabled:opacity-60",`
  - L56 `opacity/opacity animation`: `"inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-widest backdrop-blur-md transition-all disabled:opacity-60",`
  - L56 `CSS/keyframe animation`: `"inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-widest backdrop-blur-md transition-all disabled:opacity-60",`
  - L64 `CSS/keyframe animation`: `<Icon className={cn(iconSize, busy && "animate-spin")} />`

### `src/components/admin/InventoryMarketingHub.tsx`
- **CSS/keyframe animation** ×2, **opacity/opacity animation** ×1, **filter/blur** ×1, **backdrop-filter** ×1
  - L99 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`
  - L230 `opacity/opacity animation`: `className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] uppercase tracking-widest font-mono disabled:opacity-50 ${`
  - L234 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : icon}`
  - L309 `filter/blur`: `<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />`
  - L309 `backdrop-filter`: `<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />`

### `src/components/admin/KpiCard.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×3, **filter/blur** ×1
  - L10 `CSS/keyframe animation`: `<motion.div`
  - L11 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L12 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L13 `CSS/keyframe animation`: `transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L15 `CSS/keyframe animation`: `className="group relative overflow-hidden card-premium rounded-2xl p-5 hover:border-accent/40 transition-colors"`
  - L17 `filter/blur`: `<div className="absolute -top-16 -right-16 size-32 rounded-full bg-accent/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />`
  - L17 `opacity/opacity animation`: `<div className="absolute -top-16 -right-16 size-32 rounded-full bg-accent/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />`
  - L17 `CSS/keyframe animation`: `<div className="absolute -top-16 -right-16 size-32 rounded-full bg-accent/10 blur-3xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />`
  - L36 `CSS/keyframe animation`: `</motion.div>`

### `src/components/admin/MarketingAutomationCard.tsx`
- **CSS/keyframe animation** ×6, **opacity/opacity animation** ×2
  - L48 `CSS/keyframe animation`: `<motion.div`
  - L49 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L50 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L51 `CSS/keyframe animation`: `transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L73 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" />`
  - L110 `CSS/keyframe animation`: `</motion.div>`
  - L133 `CSS/keyframe animation`: `className="group flex flex-col items-center gap-1 rounded-xl border border-white/5 bg-white/[0.02] px-1.5 py-2.5 text-center transition-all hover:border-accent/40 hover:bg-accent/10"`
  - L135 `CSS/keyframe animation`: `<span className="text-muted-foreground transition-colors group-hover:text-accent">{icon}</span>`

### `src/components/admin/MarketingExecutionsCenter.tsx`
- **opacity/opacity animation** ×7, **CSS/keyframe animation** ×8, **transform** ×2, **filter/blur** ×1, **backdrop-filter** ×1
  - L60 `opacity/opacity animation`: `{(blocked || maint) && <span className="ml-auto text-[10px] uppercase tracking-widest opacity-80">System status</span>}`
  - L157 `CSS/keyframe animation`: `return <div className="grid place-items-center py-24 text-muted-foreground"><Loader2 className="size-5 animate-spin" /></div>;`
  - L202 `CSS/keyframe animation`: `className={`h-8 px-3 rounded-full text-xs whitespace-nowrap transition-colors ${filter === k ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>`
  - L203 `opacity/opacity animation`: `{l} <span className="opacity-70">({n})</span>`
  - L207 `transform`: `<Search className="size-3.5 absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />`
  - L340 `opacity/opacity animation`: `className="mt-3 w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">`
  - L341 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-4 animate-spin" /> : <ShieldCheck className="size-4" />} Confirm`
  - L374 `opacity/opacity animation`: `<button disabled={busy} onClick={retry} className="h-7 px-2.5 rounded-lg bg-card border border-border hover:border-accent/40 inline-flex items-center gap-1 disabled:opacity-50">`
  - L375 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : <RotateCcw className="size-3" />} Retry`
  - L379 `transform`: `<ChevronDown className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />`
  - … 9 more compositor lines omitted

### `src/components/admin/MediaUploader.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×3
  - L113 `CSS/keyframe animation`: `"rounded-2xl border-2 border-dashed transition-all",`
  - L160 `CSS/keyframe animation`: `<motion.div`
  - L162 `opacity/opacity animation`: `initial={{ opacity: 0, y: 6 }}`
  - L163 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L164 `opacity/opacity animation`: `exit={{ opacity: 0, height: 0 }}`
  - L182 `CSS/keyframe animation`: `"h-full rounded-full transition-all",`
  - L206 `CSS/keyframe animation`: `{item.status === "uploading" && <Loader2 className="size-4 animate-spin text-accent" />}`
  - L232 `CSS/keyframe animation`: `</motion.div>`

### `src/components/admin/OrderActionCenter.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×3, **transform** ×1
  - L32 `opacity/opacity animation`: `className={`inline-flex items-center justify-center gap-1.5 text-[11px] px-2.5 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>`
  - L32 `CSS/keyframe animation`: `className={`inline-flex items-center justify-center gap-1.5 text-[11px] px-2.5 py-2 rounded-lg border transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${cls}`}>`
  - L33 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : done ? <CheckCircle2 className="size-3.5" /> : icon}{label}`
  - L88 `transform`: `<ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />`
  - L88 `CSS/keyframe animation`: `<ChevronDown className={`size-4 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />`

### `src/components/admin/OrderIntegrityMonitor.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×3, **transform** ×1
  - L82 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 disabled:opacity-50">`
  - L83 `CSS/keyframe animation`: `{scanning ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />} Run scan`
  - L88 `CSS/keyframe animation`: `<div className="flex items-center gap-2 text-[11px] text-muted-foreground"><Loader2 className="size-3 animate-spin" /> Loading…</div>`
  - L113 `transform`: `<ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} /> View details`
  - L113 `CSS/keyframe animation`: `<ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} /> View details`

### `src/components/admin/PaymentDiagnostics.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×2, **filter/blur** ×1, **backdrop-filter** ×1
  - L78 `CSS/keyframe animation`: `<motion.div`
  - L79 `opacity/opacity animation`: `initial={{ opacity: 0, y: 8 }}`
  - L80 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L81 `filter/blur`: `className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl space-y-5"`
  - L81 `backdrop-filter`: `className="rounded-2xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl space-y-5"`
  - L92 `CSS/keyframe animation`: `{loading ? <Loader2 className="size-3.5 animate-spin" /> : <RefreshCw className="size-3.5" />}`
  - L219 `CSS/keyframe animation`: `</motion.div>`

### `src/components/admin/PaymentGatewayStatusCenter.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×5
  - L54 `CSS/keyframe animation`: `<motion.div`
  - L55 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }}`
  - L56 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L109 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest hover:border-accent/40 disabled:opacity-50"`
  - L111 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : g.enabled ? <ToggleRight className="size-3.5 text-emerald-400" /> : <ToggleLeft className="size-3.5" />}`
  - L122 `opacity/opacity animation`: `className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-50 ${g.mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground `
  - L122 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors disabled:opacity-50 ${g.mode === m ? "bg-accent text-accent-foreground" : "text-muted-foreground `
  - L134 `CSS/keyframe animation`: `</motion.div>`
  - L142 `opacity/opacity animation`: `<Icon className="size-3 opacity-60" />`
  - L170 `CSS/keyframe animation`: `<div className="h-40 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`

### `src/components/admin/PaymentIntelDrawer.tsx`
- **filter/blur** ×5, **CSS/keyframe animation** ×8, **opacity/opacity animation** ×4, **backdrop-filter** ×1
  - L98 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `order_id=eq.${orderId}` }, load)`
  - L99 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: `order_id=eq.${orderId}` }, load)`
  - L100 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "refunds", filter: `order_id=eq.${orderId}` }, load)`
  - L101 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `order_id=eq.${orderId}` }, load)`
  - L155 `CSS/keyframe animation`: `<motion.div`
  - L156 `opacity/opacity animation`: `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L157 `filter/blur`: `className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}`
  - L157 `backdrop-filter`: `className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm" onClick={onClose}`
  - L159 `CSS/keyframe animation`: `<motion.aside`
  - L161 `CSS/keyframe animation`: `transition={{ type: "spring", damping: 30, stiffness: 300 }}`
  - … 8 more compositor lines omitted

### `src/components/admin/ProductBadgeManager.tsx`
- **large shadows/glows** ×2, **opacity/opacity animation** ×10, **CSS/keyframe animation** ×11, **transform** ×1
  - L36 `large shadows/glows`: `boxShadow: b.shadowStrength`
  - L37 `large shadows/glows`: `? `0 ${Math.round(b.shadowStrength / 12)}px ${Math.round(b.shadowStrength / 4)}px -2px ${b.glowColor || b.backgroundColor || b.color}``
  - L54 `opacity/opacity animation`: `<button type="button" onClick={onRemove} disabled={busy} className="ml-0.5 opacity-70 hover:opacity-100 disabled:opacity-40">`
  - L55 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3 animate-spin" /> : <X className="size-3" />}`
  - L144 `CSS/keyframe animation`: `return <div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>;`
  - L174 `CSS/keyframe animation`: `<motion.div`
  - L177 `opacity/opacity animation`: `initial={{ opacity: 0, y: 6 }}`
  - L178 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L179 `opacity/opacity animation`: `exit={{ opacity: 0, x: -8 }}`
  - L185 `CSS/keyframe animation`: `"flex items-center gap-2 rounded-xl border bg-white/[0.03] px-2 py-1.5 transition-colors",`
  - … 14 more compositor lines omitted

### `src/components/admin/ProductCardAdminControls.tsx`
- **filter/blur** ×2, **backdrop-filter** ×2, **CSS/keyframe animation** ×6, **opacity/opacity animation** ×4, **large shadows/glows** ×1
  - L140 `filter/blur`: `"grid size-7 place-items-center rounded-full border backdrop-blur-md transition-all",`
  - L140 `backdrop-filter`: `"grid size-7 place-items-center rounded-full border backdrop-blur-md transition-all",`
  - L140 `CSS/keyframe animation`: `"grid size-7 place-items-center rounded-full border backdrop-blur-md transition-all",`
  - L146 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : <MoreVertical className="size-3.5" />}`
  - L151 `CSS/keyframe animation`: `<motion.div`
  - L152 `opacity/opacity animation`: `initial={{ opacity: 0, y: -6, scale: 0.96 }}`
  - L153 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0, scale: 1 }}`
  - L154 `opacity/opacity animation`: `exit={{ opacity: 0, y: -6, scale: 0.96 }}`
  - L155 `CSS/keyframe animation`: `transition={{ duration: 0.16 }}`
  - L156 `filter/blur`: `className="mt-1.5 w-44 overflow-hidden rounded-xl border border-accent/30 bg-background/90 p-1 backdrop-blur-2xl shadow-[0_16px_40px_-12px_oklch(0.74_0.19_49/0.5)]"`
  - … 5 more compositor lines omitted

### `src/components/admin/ProductEditorModal.tsx`
- **filter/blur** ×3, **backdrop-filter** ×3, **CSS/keyframe animation** ×5, **opacity/opacity animation** ×8, **large shadows/glows** ×1
  - L495 `filter/blur`: `className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"`
  - L495 `backdrop-filter`: `className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/70 backdrop-blur-sm p-0 sm:p-4"`
  - L499 `CSS/keyframe animation`: `<motion.form`
  - L500 `opacity/opacity animation`: `initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }}`
  - L504 `filter/blur`: `<div className="sticky top-0 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-2 bg-background/90 backdrop-blur space-y-2">`
  - L504 `backdrop-filter`: `<div className="sticky top-0 z-20 -mx-4 sm:-mx-5 px-4 sm:px-5 pt-2 pb-2 bg-background/90 backdrop-blur space-y-2">`
  - L519 `CSS/keyframe animation`: `className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${tab === id ? "bg-accent/15 text-accent border border-accent/40" : "text-muted-foreground border border-transparent hov`
  - L604 `large shadows/glows`: `<div className={`${cardWidth} max-w-full rounded-2xl overflow-hidden border border-white/10 bg-card shadow-[var(--shadow-ember)]`}>`
  - L689 `opacity/opacity animation`: `<select value={extraSub} disabled={!extraMain} onChange={(e) => setExtraSub(e.target.value)} className="filter-select disabled:opacity-50">`
  - L704 `opacity/opacity animation`: `className="mt-2 px-3 py-2 rounded-lg border border-accent/40 bg-accent/10 text-[10px] font-mono uppercase tracking-widest hover:bg-accent/20 disabled:opacity-40">`
  - … 10 more compositor lines omitted

### `src/components/admin/ProductFaqManager.tsx`
- **CSS/keyframe animation** ×2, **opacity/opacity animation** ×4
  - L165 `CSS/keyframe animation`: `<Loader2 className="size-3.5 animate-spin" /> Loading FAQs…`
  - L192 `opacity/opacity animation`: `<button type="button" disabled={busy} onClick={() => void saveEdit(f.id)} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-accent/20 text-accent text-xs disabled:opacity-50">`
  - L210 `opacity/opacity animation`: `<button type="button" disabled={busy} onClick={() => void toggleActive(f)} title={f.isActive ? "Hide from customers" : "Show to customers"} className="size-7 grid place-items-center rounded-lg hover:bg-white/5 text-muted`
  - L216 `opacity/opacity animation`: `<button type="button" disabled={busy} onClick={() => void remove(f.id)} title="Delete" className="size-7 grid place-items-center rounded-lg hover:bg-white/5 text-muted-foreground hover:text-destructive disabled:opacity-5`
  - L231 `opacity/opacity animation`: `<button type="button" disabled={busy} onClick={() => void handleAdd()} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-lg bg-gradient-to-r from-accent to-primary text-accent-foreground text-xs font-medium d`
  - L232 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add FAQ`

### `src/components/admin/ProductMarketingPanel.tsx`
- **CSS/keyframe animation** ×12, **opacity/opacity animation** ×3, **filter/blur** ×2, **backdrop-filter** ×2
  - L68 `CSS/keyframe animation`: `<motion.div`
  - L69 `opacity/opacity animation`: `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L70 `filter/blur`: `className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"`
  - L70 `backdrop-filter`: `className="fixed inset-0 z-[60] bg-black/75 backdrop-blur-sm"`
  - L73 `CSS/keyframe animation`: `<motion.div`
  - L75 `CSS/keyframe animation`: `transition={{ type: "spring", damping: 32, stiffness: 300 }}`
  - L77 `filter/blur`: `className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl"`
  - L77 `backdrop-filter`: `className="absolute right-0 top-0 flex h-full w-full max-w-xl flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl"`
  - L104 `CSS/keyframe animation`: `"flex-1 rounded-full px-3 py-1.5 text-xs font-medium capitalize transition",`
  - L116 `CSS/keyframe animation`: `<Loader2 className="size-6 animate-spin" />`
  - … 9 more compositor lines omitted

### `src/components/admin/ProductQuickEditSheet.tsx`
- **CSS/keyframe animation** ×12, **opacity/opacity animation** ×7, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×1, **transform** ×1
  - L135 `CSS/keyframe animation`: `<motion.div`
  - L136 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L137 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L138 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L139 `filter/blur`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm"`
  - L139 `backdrop-filter`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm"`
  - L142 `CSS/keyframe animation`: `<motion.div`
  - L143 `opacity/opacity animation`: `initial={{ opacity: 0, y: 24, scale: 0.98 }}`
  - L144 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0, scale: 1 }}`
  - L145 `opacity/opacity animation`: `exit={{ opacity: 0, y: 24, scale: 0.98 }}`
  - … 15 more compositor lines omitted

### `src/components/admin/ProductRatingManager.tsx`
- **CSS/keyframe animation** ×2
  - L117 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" /> Loading rating data…`
  - L165 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : <ShieldCheck className="size-3.5" />}`

### `src/components/admin/PublishConfirm.tsx`
- **filter/blur** ×1, **backdrop-filter** ×1, **CSS/keyframe animation** ×3, **large shadows/glows** ×1, **opacity/opacity animation** ×2
  - L26 `filter/blur`: `<div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md grid place-items-center p-4 animate-in fade-in duration-200">`
  - L26 `backdrop-filter`: `<div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md grid place-items-center p-4 animate-in fade-in duration-200">`
  - L26 `CSS/keyframe animation`: `<div className="fixed inset-0 z-[60] bg-black/80 backdrop-blur-md grid place-items-center p-4 animate-in fade-in duration-200">`
  - L27 `large shadows/glows`: `<div className="card-premium rounded-3xl p-7 max-w-md w-full border border-accent/30 shadow-2xl animate-in zoom-in-95 duration-200">`
  - L27 `CSS/keyframe animation`: `<div className="card-premium rounded-3xl p-7 max-w-md w-full border border-accent/30 shadow-2xl animate-in zoom-in-95 duration-200">`
  - L46 `opacity/opacity animation`: `className="px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-mono border border-border hover:bg-white/5 disabled:opacity-50"`
  - L54 `opacity/opacity animation`: `className="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest font-bold bg-accent text-accent-foreground hover:bg-accent/90 disabled:opacity-50"`
  - L56 `CSS/keyframe animation`: `{working ? <Loader2 className="size-3.5 animate-spin" /> : <Rocket className="size-3.5" />}`

### `src/components/admin/ReturnAdminCard.tsx`
- **CSS/keyframe animation** ×9, **transform** ×3, **filter/blur** ×1, **backdrop-filter** ×1
  - L130 `CSS/keyframe animation`: `className={`grid place-items-center size-6 rounded-full border text-[10px] transition-colors ${`
  - L245 `transform`: `<ChevronDown className={`size-4 shrink-0 transition-transform ${orderOpen ? "rotate-180" : ""}`} />`
  - L245 `CSS/keyframe animation`: `<ChevronDown className={`size-4 shrink-0 transition-transform ${orderOpen ? "rotate-180" : ""}`} />`
  - L291 `transform`: `<ChevronDown className={`size-4 shrink-0 transition-transform ${customerOpen ? "rotate-180" : ""}`} />`
  - L291 `CSS/keyframe animation`: `<ChevronDown className={`size-4 shrink-0 transition-transform ${customerOpen ? "rotate-180" : ""}`} />`
  - L319 `transform`: `<ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />`
  - L319 `CSS/keyframe animation`: `<ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${evidenceOpen ? "rotate-180" : ""}`} />`
  - L328 `CSS/keyframe animation`: `className="aspect-square rounded-lg overflow-hidden border border-border/60 hover:ring-2 hover:ring-accent/50 transition-all"`
  - L356 `CSS/keyframe animation`: `className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${`
  - L367 `CSS/keyframe animation`: `className={`min-h-[44px] inline-flex items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-[11px] font-mono uppercase tracking-widest transition-colors ${`
  - … 4 more compositor lines omitted

### `src/components/admin/ReturnQueueCard.tsx`
- **CSS/keyframe animation** ×2, **transform** ×1
  - L35 `CSS/keyframe animation`: `className="group w-full text-left card-premium rounded-2xl p-3 sm:p-4 flex items-center gap-3 hover:border-accent/40 transition-colors"`
  - L72 `transform`: `<ChevronRight className="size-4 group-hover:translate-x-0.5 transition-transform" />`
  - L72 `CSS/keyframe animation`: `<ChevronRight className="size-4 group-hover:translate-x-0.5 transition-transform" />`

### `src/components/admin/SaveStateBadge.tsx`
- **CSS/keyframe animation** ×1
  - L41 `CSS/keyframe animation`: `icon: <Loader2 className="h-3.5 w-3.5 animate-spin" />,`

### `src/components/admin/SectionAnalyticsPanel.tsx`
- **CSS/keyframe animation** ×6, **opacity/opacity animation** ×1
  - L31 `CSS/keyframe animation`: `<motion.div`
  - L32 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}`
  - L32 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.6, ease: EASE }}`
  - L43 `CSS/keyframe animation`: `<div className="grid place-items-center py-10"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L59 `CSS/keyframe animation`: `<motion.div`
  - L61 `CSS/keyframe animation`: `transition={{ duration: 0.8, ease: EASE, delay: i * 0.06 }}`
  - L73 `CSS/keyframe animation`: `</motion.div>`

### `src/components/admin/SecuritySummaryCard.tsx`
- **CSS/keyframe animation** ×1
  - L19 `CSS/keyframe animation`: `className="block rounded-2xl glass p-4 border border-white/[0.08] hover:border-accent/30 transition-all"`

### `src/components/admin/SegmentActivationCenter.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×2
  - L109 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40 transition-colors">`
  - L109 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 text-[11px] px-2.5 py-1.5 rounded-full bg-white/5 hover:bg-white/10 disabled:opacity-40 transition-colors">`
  - L110 `CSS/keyframe animation`: `{busy === id ? <Loader2 className="size-3.5 animate-spin" /> : a.icon}`

### `src/components/admin/SegmentedTabs.tsx`
- **CSS/keyframe animation** ×5, **large shadows/glows** ×1
  - L29 `CSS/keyframe animation`: `<motion.button`
  - L40 `CSS/keyframe animation`: `className={`relative shrink-0 inline-flex items-center gap-1.5 px-4 py-2 rounded-full text-[11px] font-mono uppercase tracking-widest whitespace-nowrap transition-colors ${`
  - L45 `CSS/keyframe animation`: `<motion.span`
  - L47 `large shadows/glows`: `className="absolute inset-0 rounded-full bg-accent shadow-[var(--shadow-ember)]"`
  - L48 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 420, damping: 34 }}`
  - L53 `CSS/keyframe animation`: `</motion.button>`

### `src/components/admin/StorefrontDashboardPanel.tsx`
- **CSS/keyframe animation** ×6, **opacity/opacity animation** ×4, **filter/blur** ×3, **backdrop-filter** ×2, **large shadows/glows** ×1
  - L126 `CSS/keyframe animation`: `<motion.div`
  - L127 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L128 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L129 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L130 `filter/blur`: `className="absolute inset-0 bg-background/60 backdrop-blur-sm"`
  - L130 `backdrop-filter`: `className="absolute inset-0 bg-background/60 backdrop-blur-sm"`
  - L133 `CSS/keyframe animation`: `<motion.aside`
  - L137 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 260, damping: 30 }}`
  - L138 `filter/blur`: `className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"`
  - L138 `backdrop-filter`: `className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"`
  - … 6 more compositor lines omitted

### `src/components/admin/SupportSatisfactionPanel.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×2
  - L205 `CSS/keyframe animation`: `if (loading) return <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L243 `CSS/keyframe animation`: `<div className="h-full bg-accent rounded-full transition-all" style={{ width: `${(d.count / stats.maxDist) * 100}%` }} />`
  - L312 `opacity/opacity animation`: `<div key={r.id} className={cn("rounded-xl border p-3", r.reviewed ? "border-border/50 bg-white/[0.02] opacity-70" : "border-destructive/30 bg-white/[0.02]")}>`
  - L367 `opacity/opacity animation`: `className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50",`
  - L367 `CSS/keyframe animation`: `className={cn("inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-[11px] font-medium transition-colors disabled:opacity-50",`

### `src/components/admin/SwipeRow.tsx`
- **CSS/keyframe animation** ×3, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1
  - L104 `CSS/keyframe animation`: `<motion.div`
  - L125 `CSS/keyframe animation`: `</motion.div>`
  - L129 `filter/blur`: `<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>`
  - L129 `backdrop-filter`: `<div className="absolute inset-0 z-20 flex items-center justify-center bg-background/80 backdrop-blur-sm" onClick={() => setMenuOpen(false)}>`
  - L131 `large shadows/glows`: `className="grid w-[min(20rem,90%)] gap-1.5 rounded-2xl border border-accent/25 bg-background/95 p-2 shadow-[0_20px_60px_-15px_oklch(0.74_0.19_49/0.45)]"`
  - L138 `CSS/keyframe animation`: `className="flex items-center gap-3 rounded-xl border border-white/5 bg-white/[0.02] px-3 py-2.5 text-left text-sm transition-colors hover:border-accent/40 hover:bg-accent/10"`

### `src/components/admin/TestimonialsEditor.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×1
  - L67 `CSS/keyframe animation`: `{deleting ? <Loader2 className="size-3.5 animate-spin" /> : <Trash2 className="size-3.5" />} Delete`
  - L72 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 text-xs px-4 py-2 rounded-lg bg-accent text-accent-foreground font-medium hover:opacity-90">`
  - L73 `CSS/keyframe animation`: `{saving ? <Loader2 className="size-3.5 animate-spin" /> : <Save className="size-3.5" />} {isNew ? "Add" : "Save"}`
  - L128 `CSS/keyframe animation`: `return <div className="grid place-items-center py-16"><Loader2 className="size-6 animate-spin text-accent" /></div>;`

### `src/components/admin/TicketOpsSheet.tsx`
- **filter/blur** ×6, **backdrop-filter** ×2, **large shadows/glows** ×1, **CSS/keyframe animation** ×7, **opacity/opacity animation** ×5
  - L169 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, schedule)`
  - L170 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_ticket_events", filter: `ticket_id=eq.${ticketId}` }, schedule)`
  - L171 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_internal_notes", filter: `ticket_id=eq.${ticketId}` }, schedule)`
  - L172 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, schedule)`
  - L301 `filter/blur`: `<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />`
  - L301 `backdrop-filter`: `<div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />`
  - L302 `large shadows/glows`: `<div className="relative w-full max-w-lg h-full overflow-y-auto bg-background border-l border-border shadow-2xl">`
  - L304 `filter/blur`: `<div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4">`
  - L304 `backdrop-filter`: `<div className="sticky top-0 z-10 bg-background/95 backdrop-blur border-b border-border px-5 py-4">`
  - L331 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - … 11 more compositor lines omitted

### `src/components/admin/TrafficSummaryCard.tsx`
- **CSS/keyframe animation** ×1
  - L19 `CSS/keyframe animation`: `className="block rounded-2xl glass p-4 border border-white/[0.08] hover:border-accent/30 transition-all"`

### `src/components/admin/VersionHistorySheet.tsx`
- **CSS/keyframe animation** ×1
  - L92 `CSS/keyframe animation`: `<Loader2 className="h-5 w-5 animate-spin" />`

### `src/components/admin/VirtualTable.tsx`
- **filter/blur** ×1, **backdrop-filter** ×1, **contain/content-visibility** ×2, **transform** ×1, **will-change** ×1
  - L51 `filter/blur`: `className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur text-[10px] font-mono uppercase tracking-widest text-muted-foreground"`
  - L51 `backdrop-filter`: `className="sticky top-0 z-10 border-b border-white/10 bg-background/80 backdrop-blur text-[10px] font-mono uppercase tracking-widest text-muted-foreground"`
  - L59 `contain/content-visibility`: `className="overflow-auto overscroll-contain"`
  - L60 `contain/content-visibility`: `style={{ maxHeight, contain: "strict" }}`
  - L71 `transform`: `style={{ transform: `translateY(${vi.start}px)`, willChange: "transform" }}`
  - L71 `will-change`: `style={{ transform: `translateY(${vi.start}px)`, willChange: "transform" }}`

### `src/components/admin/product-editor/category-selector.tsx`
- **CSS/keyframe animation** ×7, **transform** ×5, **opacity/opacity animation** ×6
  - L146 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" /> Loading live categories…`
  - L172 `transform`: `className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] text-muted-foreground transition-all hover:text-foreground active:scale-95">`
  - L172 `CSS/keyframe animation`: `className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 text-[10px] text-muted-foreground transition-all hover:text-foreground active:scale-95">`
  - L195 `opacity/opacity animation`: `className="opacity-60 transition-opacity hover:opacity-100">`
  - L195 `CSS/keyframe animation`: `className="opacity-60 transition-opacity hover:opacity-100">`
  - L201 `opacity/opacity animation`: `className="opacity-60 transition-opacity hover:opacity-100">`
  - L201 `CSS/keyframe animation`: `className="opacity-60 transition-opacity hover:opacity-100">`
  - L228 `transform`: `<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />`
  - L241 `opacity/opacity animation`: `className="w-full appearance-none rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 pr-9 text-sm text-foreground focus:border-accent/40 focus:outline-none disabled:opacity-50"`
  - L250 `transform`: `<ChevronDown className="pointer-events-none absolute right-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />`
  - … 8 more compositor lines omitted

### `src/components/admin/product-editor/field-builders.tsx`
- **CSS/keyframe animation** ×5, **transform** ×2
  - L44 `CSS/keyframe animation`: `className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive">`
  - L50 `transform`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-accent/40 active:s`
  - L50 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-accent/40 active:s`
  - L88 `CSS/keyframe animation`: `className="grid size-8 shrink-0 place-items-center rounded-md border border-white/10 text-muted-foreground transition-all hover:border-destructive/50 hover:text-destructive">`
  - L94 `transform`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-accent/40 active:s`
  - L94 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3.5 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-accent/40 active:s`
  - L148 `CSS/keyframe animation`: `className="grid size-8 place-items-center rounded-md text-muted-foreground transition-all hover:bg-white/5 hover:text-foreground">`

### `src/components/admin/product-editor/kit.tsx`
- **CSS/keyframe animation** ×14, **filter/blur** ×3, **backdrop-filter** ×3, **transform** ×5, **opacity/opacity animation** ×3, **large shadows/glows** ×1
  - L120 `CSS/keyframe animation`: `<label className="flex items-start gap-2.5 text-sm cursor-pointer rounded-lg border border-white/10 bg-white/[0.02] px-3 py-2.5 hover:border-white/20 transition-colors">`
  - L165 `filter/blur`: `<div className="sticky top-0 z-40 -mx-4 -mt-4 lg:-mx-10 lg:-mt-6 mb-3 border-b border-white/10 bg-background/85 px-4 py-2.5 backdrop-blur-xl lg:px-10">`
  - L165 `backdrop-filter`: `<div className="sticky top-0 z-40 -mx-4 -mt-4 lg:-mx-10 lg:-mt-6 mb-3 border-b border-white/10 bg-background/85 px-4 py-2.5 backdrop-blur-xl lg:px-10">`
  - L171 `transform`: `className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-95"`
  - L171 `CSS/keyframe animation`: `className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-95"`
  - L184 `transform`: `className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-95"`
  - L184 `CSS/keyframe animation`: `className="grid size-9 place-items-center rounded-full border border-white/10 bg-white/[0.03] text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scale-95"`
  - L247 `CSS/keyframe animation`: `<div className={`h-full rounded-full transition-all duration-500 ${completion.percent === 100 ? "bg-emerald-500" : "bg-accent"}`} style={{ width: `${completion.percent}%` }} />`
  - L257 `CSS/keyframe animation`: `className={`shrink-0 whitespace-nowrap inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${`
  - L479 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - … 19 more compositor lines omitted

### `src/components/admin/product-editor/media-fields.tsx`
- **transform** ×7, **opacity/opacity animation** ×12, **CSS/keyframe animation** ×16, **large shadows/glows** ×2, **filter/blur** ×3, **backdrop-filter** ×3
  - L224 `transform`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scal`
  - L224 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scal`
  - L224 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-muted-foreground transition-all hover:text-foreground hover:border-white/20 active:scal`
  - L228 `transform`: `className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40">`
  - L228 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40">`
  - L228 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-1.5 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110 active:scale-[0.97] disabled:opacity-40">`
  - L241 `CSS/keyframe animation`: `"rounded-2xl border-2 border-dashed p-5 text-center transition-all cursor-pointer",`
  - L243 `opacity/opacity animation`: `atLimit && "opacity-40 pointer-events-none",`
  - L258 `opacity/opacity animation`: `<motion.div key={u.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}`
  - L258 `CSS/keyframe animation`: `<motion.div key={u.id} initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, height: 0 }}`
  - … 33 more compositor lines omitted

### `src/components/builder/AddBlockMenu.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×6, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×1
  - L29 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L29 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L30 `filter/blur`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />`
  - L30 `backdrop-filter`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />`
  - L31 `CSS/keyframe animation`: `<motion.div`
  - L32 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: 16, scale: 0.97 }}`
  - L33 `CSS/keyframe animation`: `transition={{ duration: 0.24, ease: [0.16, 1, 0.3, 1] }}`
  - L34 `filter/blur`: `className="relative z-10 w-full max-w-lg rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"`
  - L34 `backdrop-filter`: `className="relative z-10 w-full max-w-lg rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"`
  - L34 `large shadows/glows`: `className="relative z-10 w-full max-w-lg rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"`
  - … 3 more compositor lines omitted

### `src/components/builder/BlockAnalyticsPanel.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×5, **filter/blur** ×2, **backdrop-filter** ×2
  - L46 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L46 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L47 `filter/blur`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />`
  - L47 `backdrop-filter`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />`
  - L48 `CSS/keyframe animation`: `<motion.aside`
  - L50 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 260, damping: 30 }}`
  - L51 `filter/blur`: `className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl"`
  - L51 `backdrop-filter`: `className="absolute right-0 top-0 flex h-full w-full max-w-sm flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl"`
  - L66 `CSS/keyframe animation`: `<div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L107 `CSS/keyframe animation`: `</motion.aside>`

### `src/components/builder/BlockEditorSheet.tsx`
- **CSS/keyframe animation** ×9, **opacity/opacity animation** ×2, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×1, **transform** ×1
  - L133 `CSS/keyframe animation`: `<motion.div`
  - L134 `opacity/opacity animation`: `initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}`
  - L135 `filter/blur`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm"`
  - L135 `backdrop-filter`: `className="absolute inset-0 bg-background/70 backdrop-blur-sm"`
  - L138 `CSS/keyframe animation`: `<motion.aside`
  - L140 `CSS/keyframe animation`: `transition={{ type: "spring", stiffness: 260, damping: 30 }}`
  - L141 `filter/blur`: `className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"`
  - L141 `backdrop-filter`: `className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"`
  - L141 `large shadows/glows`: `className="absolute right-0 top-0 flex h-full w-full max-w-md flex-col border-l border-accent/20 bg-background/95 backdrop-blur-2xl shadow-[-30px_0_80px_-30px_oklch(0.74_0.19_49/0.4)]"`
  - L232 `CSS/keyframe animation`: `className={`flex w-full items-center justify-between rounded-xl border px-3 py-2.5 transition-all ${f.active ? "border-accent/50 bg-accent/15" : "border-border bg-card hover:border-accent/30"}`}>`
  - … 7 more compositor lines omitted

### `src/components/builder/BlockPreview.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×1, **filter/blur** ×1
  - L42 `opacity/opacity animation`: `<div className={`relative overflow-hidden rounded-2xl border p-4 transition-opacity ${live ? "border-border bg-card/60" : "border-dashed border-border/60 bg-card/30 opacity-60"}`}>`
  - L42 `CSS/keyframe animation`: `<div className={`relative overflow-hidden rounded-2xl border p-4 transition-opacity ${live ? "border-border bg-card/60" : "border-dashed border-border/60 bg-card/30 opacity-60"}`}>`
  - L43 `filter/blur`: `<div className="pointer-events-none absolute -right-6 -top-8 size-20 rounded-full opacity-20" style={{ background: "var(--gradient-ember-soft)", filter: "blur(18px)" }} />`
  - L43 `opacity/opacity animation`: `<div className="pointer-events-none absolute -right-6 -top-8 size-20 rounded-full opacity-20" style={{ background: "var(--gradient-ember-soft)", filter: "blur(18px)" }} />`

### `src/components/builder/BlockToolbar.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×5, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1
  - L25 `opacity/opacity animation`: `"grid size-8 place-items-center rounded-lg border border-white/10 bg-background/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:hover:border-white/10 disab`
  - L25 `CSS/keyframe animation`: `"grid size-8 place-items-center rounded-lg border border-white/10 bg-background/60 text-muted-foreground transition-colors hover:border-accent/40 hover:text-accent disabled:opacity-30 disabled:hover:border-white/10 disab`
  - L47 `CSS/keyframe animation`: `{busy === "dup" ? <Loader2 className="size-3.5 animate-spin" /> : <Copy className="size-3.5" />}`
  - L53 `CSS/keyframe animation`: `{busy === "vis" ? <Loader2 className="size-3.5 animate-spin" /> : block.active ? <EyeOff className="size-3.5" /> : <Eye className="size-3.5" />}`
  - L68 `filter/blur`: `<div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-background/95 p-1 backdrop-blur-2xl shadow-xl"`
  - L68 `backdrop-filter`: `<div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-background/95 p-1 backdrop-blur-2xl shadow-xl"`
  - L68 `large shadows/glows`: `<div className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-xl border border-white/10 bg-background/95 p-1 backdrop-blur-2xl shadow-xl"`
  - L105 `opacity/opacity animation`: `className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-50 ${danger ? "text-destructive" : "text-foreground"}`}>`
  - L105 `CSS/keyframe animation`: `className={`flex w-full items-center gap-2 rounded-lg px-2.5 py-2 text-left text-xs transition-colors hover:bg-white/5 disabled:opacity-50 ${danger ? "text-destructive" : "text-foreground"}`}>`
  - L106 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5" />} {label}`

### `src/components/builder/HomepageBuilder.tsx`
- **CSS/keyframe animation** ×6, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1
  - L45 `CSS/keyframe animation`: `"inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition-colors";`
  - L119 `filter/blur`: `<div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">`
  - L119 `backdrop-filter`: `<div className="sticky top-0 z-20 -mx-4 mb-5 border-b border-border/60 bg-background/80 px-4 py-3 backdrop-blur-xl sm:-mx-6 sm:px-6">`
  - L153 `CSS/keyframe animation`: `{reordering && <Loader2 className="size-3.5 animate-spin text-accent" />}`
  - L158 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-3 py-2 text-xs font-semibold text-accent-foreground transition-all hover:brightness-110">`
  - L165 `CSS/keyframe animation`: `<div className="mx-auto transition-[max-width] duration-300" style={{ maxWidth: DEVICE_WIDTH[device] }}>`
  - L167 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-accent" /></div>`
  - L184 `CSS/keyframe animation`: `className="group rounded-2xl border border-transparent transition-colors"`
  - L185 `large shadows/glows`: `whileDrag={{ scale: 1.01, boxShadow: "0 20px 50px -15px oklch(0 0 0 / 0.6)" }}`

### `src/components/chat/LiveChat.tsx`
- **transform** ×9, **CSS/keyframe animation** ×19, **filter/blur** ×12, **backdrop-filter** ×12, **large shadows/glows** ×7
  - L286 `transform`: `className={`group fixed right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground animate-orb-breathe transition-all duration-300 active:s`
  - L286 `CSS/keyframe animation`: `className={`group fixed right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground animate-orb-breathe transition-all duration-300 active:s`
  - L303 `filter/blur`: `className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur-xl animate-chat-slide-up"`
  - L303 `backdrop-filter`: `className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur-xl animate-chat-slide-up"`
  - L303 `CSS/keyframe animation`: `className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur-xl animate-chat-slide-up"`
  - L308 `large shadows/glows`: `{/* Ambient glow */}`
  - L313 `filter/blur`: `className="relative z-10 border-b border-border/60 bg-card/70 backdrop-blur-xl"`
  - L313 `backdrop-filter`: `className="relative z-10 border-b border-border/60 bg-card/70 backdrop-blur-xl"`
  - L322 `transform`: `className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"`
  - L322 `CSS/keyframe animation`: `className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"`
  - … 49 more compositor lines omitted

### `src/components/site/AdaptiveProductMedia.tsx`
- **CSS/keyframe animation** ×3, **transform** ×1, **opacity/opacity animation** ×1
  - L37 `CSS/keyframe animation`: `transition: ultraLowEndAndroid ? "none" : "background 300ms ease",`
  - L44 `CSS/keyframe animation`: `className="absolute inset-0 animate-pulse"`
  - L59 `transform`: `: "relative z-[1] block h-full w-full rounded-[14px] object-contain object-center transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.03]"`
  - L59 `CSS/keyframe animation`: `: "relative z-[1] block h-full w-full rounded-[14px] object-contain object-center transition-[transform,opacity] duration-300 ease-out group-hover:scale-[1.03]"`
  - L61 `opacity/opacity animation`: `style={{ opacity: revealed ? 1 : 0 }}`

### `src/components/site/AddressForm.tsx`
- **CSS/keyframe animation** ×9, **large shadows/glows** ×4, **opacity/opacity animation** ×3, **transform** ×2
  - L468 `CSS/keyframe animation`: `"w-full bg-background/60 border rounded-2xl px-3.5 py-3 text-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/40";`
  - L492 `CSS/keyframe animation`: `className={`flex items-center justify-center gap-1.5 py-2.5 rounded-2xl border text-[11px] uppercase tracking-widest font-mono transition-all ${`
  - L494 `large shadows/glows`: `? "border-accent bg-accent/10 text-accent shadow-[0_0_20px_-6px_var(--color-accent)]"`
  - L512 `opacity/opacity animation`: `className={`relative overflow-hidden text-left rounded-[20px] border p-3.5 min-h-[88px] transition-all duration-200 disabled:opacity-70 ${`
  - L512 `CSS/keyframe animation`: `className={`relative overflow-hidden text-left rounded-[20px] border p-3.5 min-h-[88px] transition-all duration-200 disabled:opacity-70 ${`
  - L514 `large shadows/glows`: `? "border-accent bg-accent/10 shadow-[0_0_28px_-8px_var(--color-accent)]"`
  - L524 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" />`
  - L539 `CSS/keyframe animation`: `className={`relative overflow-hidden text-left rounded-[20px] border p-3.5 min-h-[88px] transition-all duration-200 ${`
  - L541 `large shadows/glows`: `? "border-accent bg-accent/10 shadow-[0_0_28px_-8px_var(--color-accent)]"`
  - L595 `CSS/keyframe animation`: `<Loader2 className="size-6 animate-spin text-accent" />`
  - … 8 more compositor lines omitted

### `src/components/site/AnnouncementBar.tsx`
- **filter/blur** ×2, **backdrop-filter** ×2, **opacity/opacity animation** ×1, **transform** ×1, **CSS/keyframe animation** ×1
  - L136 `filter/blur`: `className="relative h-9 overflow-hidden border-b border-accent/15 bg-background/80 backdrop-blur-md"`
  - L136 `backdrop-filter`: `className="relative h-9 overflow-hidden border-b border-accent/15 bg-background/80 backdrop-blur-md"`
  - L138 `opacity/opacity animation`: `<div aria-hidden className="absolute inset-0 opacity-40 pointer-events-none" style={{ background: gradient }} />`
  - L150 `transform`: `<div className="absolute right-2 top-1/2 -translate-y-1/2 z-10 flex items-center gap-1.5">`
  - L164 `filter/blur`: `"border border-accent/40 bg-background/70 text-accent backdrop-blur-md transition-all hover:bg-accent/15",`
  - L164 `backdrop-filter`: `"border border-accent/40 bg-background/70 text-accent backdrop-blur-md transition-all hover:bg-accent/15",`
  - L164 `CSS/keyframe animation`: `"border border-accent/40 bg-background/70 text-accent backdrop-blur-md transition-all hover:bg-accent/15",`

### `src/components/site/AnnouncementMessage.motion.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×3
  - L20 `CSS/keyframe animation`: `<motion.div`
  - L22 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }}`
  - L23 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L24 `opacity/opacity animation`: `exit={{ opacity: 0, y: -10 }}`
  - L25 `CSS/keyframe animation`: `transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}`
  - L29 `CSS/keyframe animation`: `</motion.div>`

### `src/components/site/AnnouncementMessage.tsx`
- **CSS/keyframe animation** ×1
  - L24 `CSS/keyframe animation`: `<a href={current.link} className="truncate hover:text-accent transition-colors">`

### `src/components/site/BackButton.tsx`
- **CSS/keyframe animation** ×2, **transform** ×1, **opacity/opacity animation** ×1
  - L20 `CSS/keyframe animation`: `* Premium pill "back" button — black + orange glass, CSS-only transitions.`
  - L37 `transform`: `<ArrowLeft className="size-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />`
  - L37 `CSS/keyframe animation`: `<ArrowLeft className="size-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />`
  - L39 `opacity/opacity animation`: `{showAccountIcon && <User className="size-4 shrink-0 opacity-80" />}`

### `src/components/site/CategoryCard.tsx`
- **large shadows/glows** ×3, **transform** ×2, **CSS/keyframe animation** ×4
  - L62 `large shadows/glows`: `* Subtle premium border, minimal glow, equal height across the grid.`
  - L87 `transform`: `className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-a`
  - L87 `large shadows/glows`: `className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-a`
  - L87 `CSS/keyframe animation`: `className="group flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-[var(--shadow-soft)] transition-[transform,box-shadow,border-color] duration-300 hover:-translate-y-0.5 hover:border-a`
  - L99 `transform`: `className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"`
  - L99 `CSS/keyframe animation`: `className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"`
  - L103 `large shadows/glows`: `<span className="grid size-11 sm:size-14 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_24px_-10px_oklch(0.74_0.19_49/0.5)] transition-colors group-hover:bg-accent/20">`
  - L103 `CSS/keyframe animation`: `<span className="grid size-11 sm:size-14 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/25 shadow-[0_0_24px_-10px_oklch(0.74_0.19_49/0.5)] transition-colors group-hover:bg-accent/20">`
  - L112 `CSS/keyframe animation`: `<h3 className="line-clamp-1 text-[13px] font-semibold leading-snug tracking-tight text-foreground transition-colors group-hover:text-accent sm:text-[15px]">`

### `src/components/site/CheckoutProgress.tsx`
- **CSS/keyframe animation** ×3, **transform** ×1
  - L26 `CSS/keyframe animation`: `className={`grid place-items-center rounded-full size-6 sm:size-7 text-[10px] font-bold transition-colors ${`
  - L45 `transform`: `<span className="relative flex-1 h-px min-w-3 sm:min-w-5 -translate-y-2 bg-white/10 overflow-hidden rounded-full">`
  - L46 `CSS/keyframe animation`: `<motion.span`
  - L49 `CSS/keyframe animation`: `transition={{ duration: 0.4, ease: "easeOut" }}`

### `src/components/site/CompareTray.tsx`
- **transform** ×1, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1, **CSS/keyframe animation** ×3
  - L19 `transform`: `<div data-floating-control className="fixed left-1/2 z-[var(--z-floating-controls)] w-[min(94vw,720px)] -translate-x-1/2 bottom-[var(--floating-bottom-offset)] md:bottom-4">`
  - L20 `filter/blur`: `<div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-3">`
  - L20 `backdrop-filter`: `<div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-3">`
  - L20 `large shadows/glows`: `<div className="bg-card/95 backdrop-blur-xl border border-border rounded-2xl shadow-2xl p-3 flex items-center gap-3">`
  - L34 `CSS/keyframe animation`: `className="absolute -top-1.5 -right-1.5 size-4 grid place-items-center rounded-full bg-background border border-border text-muted-foreground hover:text-accent hover:border-accent transition-colors"`
  - L46 `CSS/keyframe animation`: `className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors px-2 shrink-0"`
  - L52 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all shrink-0"`

### `src/components/site/ContactSupportButton.tsx`
- **CSS/keyframe animation** ×1
  - L34 `CSS/keyframe animation`: `"inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all",`

### `src/components/site/CouponInput.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L133 `opacity/opacity animation`: `className="px-4 rounded-lg bg-accent text-accent-foreground text-xs font-bold uppercase tracking-widest disabled:opacity-40 inline-flex items-center gap-1.5"`
  - L135 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : "Apply"}`

### `src/components/site/DesktopAccountDock.tsx`
- **large shadows/glows** ×1, **CSS/keyframe animation** ×1
  - L117 `large shadows/glows`: `className={`hidden md:flex fixed z-[var(--z-bottom-nav)] touch-none cursor-grab active:cursor-grabbing select-none items-center gap-2 rounded-full glass-strong border border-white/10 px-4 py-2.5 text-sm font-medium shado`
  - L117 `CSS/keyframe animation`: `className={`hidden md:flex fixed z-[var(--z-bottom-nav)] touch-none cursor-grab active:cursor-grabbing select-none items-center gap-2 rounded-full glass-strong border border-white/10 px-4 py-2.5 text-sm font-medium shado`

### `src/components/site/DocPage.tsx`
- **opacity/opacity animation** ×5, **transform** ×5, **CSS/keyframe animation** ×8, **large shadows/glows** ×6, **filter/blur** ×4
  - L54 `opacity/opacity animation`: `opacity: shown ? 1 : 0,`
  - L55 `transform`: `transform: shown ? "translateY(0)" : "translateY(22px)",`
  - L56 `transform`: `transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,`
  - L56 `CSS/keyframe animation`: `transition: `opacity 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms, transform 0.6s cubic-bezier(0.22,1,0.36,1) ${delay}ms`,`
  - L117 `large shadows/glows`: `className="h-full bg-gradient-to-r from-accent/40 via-accent to-accent/40 shadow-[0_0_12px_var(--color-accent)] transition-[width] duration-150 ease-out"`
  - L117 `CSS/keyframe animation`: `className="h-full bg-gradient-to-r from-accent/40 via-accent to-accent/40 shadow-[0_0_12px_var(--color-accent)] transition-[width] duration-150 ease-out"`
  - L122 `large shadows/glows`: `{/* Ambient background glow */}`
  - L124 `transform`: `<div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 opacity-70 blur-3xl" style={{ background: "var(--gradient-ember)" }} />`
  - L124 `filter/blur`: `<div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 opacity-70 blur-3xl" style={{ background: "var(--gradient-ember)" }} />`
  - L124 `opacity/opacity animation`: `<div className="absolute -top-32 left-1/2 h-[420px] w-[820px] -translate-x-1/2 opacity-70 blur-3xl" style={{ background: "var(--gradient-ember)" }} />`
  - … 18 more compositor lines omitted

### `src/components/site/FlashDeals.tsx`
- **filter/blur** ×3, **opacity/opacity animation** ×3, **large shadows/glows** ×8, **CSS/keyframe animation** ×7, **backdrop-filter** ×1, **transform** ×3, **will-change** ×2
  - L52 `filter/blur`: `className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-30"`
  - L52 `opacity/opacity animation`: `className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-30"`
  - L65 `opacity/opacity animation`: `className="mt-1 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition shadow-[var(--shadow-ember)]"`
  - L65 `large shadows/glows`: `className="mt-1 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition shadow-[var(--shadow-ember)]"`
  - L65 `CSS/keyframe animation`: `className="mt-1 inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-5 py-2.5 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition shadow-[var(--shadow-ember)]"`
  - L123 `CSS/keyframe animation`: `const iconBtn = "grid h-8 w-8 sm:h-9 sm:w-9 place-items-center rounded-full text-white/90 transition-colors hover:text-accent";`
  - L124 `filter/blur`: `const iconStyle = { backgroundColor: "rgba(20,20,20,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" } as const;`
  - L124 `backdrop-filter`: `const iconStyle = { backgroundColor: "rgba(20,20,20,0.6)", backdropFilter: "blur(8px)", border: "1px solid rgba(255,255,255,0.12)" } as const;`
  - L135 `transform`: `className="group flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,border-color] duration-200 will-change-transform motion-safe:lg:hover:-translate-`
  - L135 `will-change`: `className="group flex h-full flex-col overflow-hidden rounded-[22px] shadow-[0_8px_24px_rgba(0,0,0,0.35)] transition-[transform,box-shadow,border-color] duration-200 will-change-transform motion-safe:lg:hover:-translate-`
  - … 17 more compositor lines omitted

### `src/components/site/FlashSaleStrip.tsx`
- **filter/blur** ×1, **opacity/opacity animation** ×1, **large shadows/glows** ×2, **CSS/keyframe animation** ×1
  - L79 `filter/blur`: `className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-40"`
  - L79 `opacity/opacity animation`: `className="absolute -top-16 -right-16 size-56 rounded-full blur-3xl opacity-40"`
  - L85 `large shadows/glows`: `<div className={`size-9 grid place-items-center rounded-xl bg-accent text-accent-foreground shadow-[var(--shadow-ember)] shrink-0 ${lowEnd ? "" : "animate-flame-pulse"}`}>`
  - L85 `CSS/keyframe animation`: `<div className={`size-9 grid place-items-center rounded-xl bg-accent text-accent-foreground shadow-[var(--shadow-ember)] shrink-0 ${lowEnd ? "" : "animate-flame-pulse"}`}>`
  - L128 `large shadows/glows`: `<span className="absolute top-1.5 left-1.5 inline-flex items-center rounded-full bg-accent text-black text-[9px] font-bold font-mono px-2 py-0.5 shadow-[var(--shadow-ember)]">`

### `src/components/site/Footer.tsx`
- **transform** ×6, **CSS/keyframe animation** ×25, **opacity/opacity animation** ×6, **large shadows/glows** ×1, **filter/blur** ×2, **backdrop-filter** ×1
  - L19 `transform`: `<ChevronDown className={`size-4 text-muted-foreground transition-transform md:hidden ${open ? "rotate-180" : ""}`} />`
  - L19 `CSS/keyframe animation`: `<ChevronDown className={`size-4 text-muted-foreground transition-transform md:hidden ${open ? "rotate-180" : ""}`} />`
  - L35 `transform`: `<div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[50%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.4 }} />`
  - L35 `opacity/opacity animation`: `<div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[50%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.4 }} />`
  - L39 `CSS/keyframe animation`: `<Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>`
  - L40 `CSS/keyframe animation`: `<Link to="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>`
  - L41 `CSS/keyframe animation`: `<Link to="/returns" className="hover:text-foreground transition-colors">Refund Policy</Link>`
  - L42 `CSS/keyframe animation`: `<Link to="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>`
  - L51 `large shadows/glows`: `{/* Ambient divider glow */}`
  - L52 `transform`: `<div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[70%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.6 }} />`
  - … 31 more compositor lines omitted

### `src/components/site/GlobalCheckoutBeta.tsx`
- **CSS/keyframe animation** ×12, **opacity/opacity animation** ×4, **large shadows/glows** ×1, **transform** ×1
  - L106 `CSS/keyframe animation`: `<motion.div`
  - L107 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}`
  - L109 `large shadows/glows`: `style={{ boxShadow: "0 30px 80px -40px color-mix(in oklab, #5b9dff 60%, transparent)" }}`
  - L133 `CSS/keyframe animation`: `</motion.div>`
  - L143 `transform`: `className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5 transition-colors active:scale-95">`
  - L143 `CSS/keyframe animation`: `className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5 transition-colors active:scale-95">`
  - L151 `CSS/keyframe animation`: `<div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />`
  - L152 `CSS/keyframe animation`: `<div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />`
  - L224 `opacity/opacity animation`: `className="w-full mt-5 min-h-[56px] inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opa`
  - L224 `CSS/keyframe animation`: `className="w-full mt-5 min-h-[56px] inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opa`
  - … 8 more compositor lines omitted

### `src/components/site/HelpEnhancements.tsx`
- **filter/blur** ×4, **backdrop-filter** ×2, **CSS/keyframe animation** ×14, **opacity/opacity animation** ×5, **transform** ×2, **large shadows/glows** ×1
  - L11 `filter/blur`: `const card = "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl";`
  - L11 `backdrop-filter`: `const card = "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl";`
  - L26 `CSS/keyframe animation`: `<motion.div`
  - L28 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}`
  - L28 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}`
  - L31 `filter/blur`: `<div aria-hidden className="absolute -top-8 -right-8 size-20 rounded-full blur-2xl opacity-30"`
  - L31 `opacity/opacity animation`: `<div aria-hidden className="absolute -top-8 -right-8 size-20 rounded-full blur-2xl opacity-30"`
  - L36 `CSS/keyframe animation`: `</motion.div>`
  - L53 `CSS/keyframe animation`: `<div key={c.title} className={`${card} p-3.5 group hover:border-white/20 transition`}>`
  - L133 `CSS/keyframe animation`: `className={`${card} group relative overflow-hidden p-4 flex flex-col gap-3 hover:border-orange-400/40 transition`}>`
  - … 18 more compositor lines omitted

### `src/components/site/HeroCarousel.tsx`
- **CSS/keyframe animation** ×15, **transform** ×15, **large shadows/glows** ×6, **filter/blur** ×7, **opacity/opacity animation** ×5, **will-change** ×2, **perspective/3D** ×2, **mask/clip** ×2, **translate3d/translateZ** ×1
  - L22 `CSS/keyframe animation`: `// Apple/Stripe-style premium easing for the showcase transitions.`
  - L179 `transform`: `<div aria-hidden className="pointer-events-none absolute top-0 bottom-0 left-1/2 w-screen -translate-x-1/2 -z-0 overflow-hidden">`
  - L180 `large shadows/glows`: `{/* Heavy blurred backdrop + radial glows are GPU-expensive and, on`
  - L191 `filter/blur`: `className="absolute inset-0 size-full scale-125 object-cover opacity-[0.14] blur-[64px]"`
  - L191 `opacity/opacity animation`: `className="absolute inset-0 size-full scale-125 object-cover opacity-[0.14] blur-[64px]"`
  - L192 `CSS/keyframe animation`: `style={{ transition: "opacity 800ms ease" }}`
  - L196 `transform`: `className="absolute left-1/2 -top-[20%] -translate-x-1/2 size-[460px] sm:size-[620px] rounded-full blur-[110px]"`
  - L196 `filter/blur`: `className="absolute left-1/2 -top-[20%] -translate-x-1/2 size-[460px] sm:size-[620px] rounded-full blur-[110px]"`
  - L197 `will-change`: `style={{ background: `radial-gradient(circle, ${ambient}, transparent 70%)`, transition: "background 700ms ease", willChange: "background" }}`
  - L197 `CSS/keyframe animation`: `style={{ background: `radial-gradient(circle, ${ambient}, transparent 70%)`, transition: "background 700ms ease", willChange: "background" }}`
  - … 45 more compositor lines omitted

### `src/components/site/ImageLightbox.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×7, **filter/blur** ×1, **backdrop-filter** ×1
  - L59 `CSS/keyframe animation`: `<motion.div`
  - L60 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L61 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L62 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L63 `filter/blur`: `className="fixed inset-0 z-[140] flex flex-col bg-background/95 backdrop-blur-xl print:hidden"`
  - L63 `backdrop-filter`: `className="fixed inset-0 z-[140] flex flex-col bg-background/95 backdrop-blur-xl print:hidden"`
  - L101 `CSS/keyframe animation`: `<motion.img`
  - L105 `opacity/opacity animation`: `initial={{ opacity: 0, scale: 0.98 }}`
  - L106 `opacity/opacity animation`: `animate={{ opacity: 1, scale: 1 }}`
  - L107 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - … 4 more compositor lines omitted

### `src/components/site/InstallPrompt.tsx`
- **CSS/keyframe animation** ×4, **opacity/opacity animation** ×4, **transform** ×1, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1
  - L61 `CSS/keyframe animation`: `<motion.div`
  - L62 `opacity/opacity animation`: `initial={{ y: 120, opacity: 0 }}`
  - L63 `opacity/opacity animation`: `animate={{ y: 0, opacity: 1 }}`
  - L64 `opacity/opacity animation`: `exit={{ y: 120, opacity: 0 }}`
  - L65 `CSS/keyframe animation`: `transition={{ type: "spring", damping: 24, stiffness: 220 }}`
  - L67 `transform`: `className="fixed left-1/2 z-[var(--z-floating-controls)] -translate-x-1/2 px-4 w-full max-w-md"`
  - L72 `filter/blur`: `<div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 pl-4 shadow-2xl backdrop-blur-xl md:p-4">`
  - L72 `backdrop-filter`: `<div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 pl-4 shadow-2xl backdrop-blur-xl md:p-4">`
  - L72 `large shadows/glows`: `<div className="flex items-center gap-3 rounded-2xl border border-border bg-card/95 p-3 pl-4 shadow-2xl backdrop-blur-xl md:p-4">`
  - L84 `opacity/opacity animation`: `className="rounded-full bg-foreground px-4 py-2 text-xs font-medium uppercase tracking-wider text-background transition-opacity hover:opacity-90"`
  - … 2 more compositor lines omitted

### `src/components/site/LightMobileDrawer.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×14, **filter/blur** ×1, **backdrop-filter** ×1, **transform** ×13, **will-change** ×1, **large shadows/glows** ×9
  - L86 `opacity/opacity animation`: `style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}`
  - L86 `CSS/keyframe animation`: `style={{ opacity: visible ? 1 : 0, transition: "opacity 0.3s ease" }}`
  - L87 `filter/blur`: `className="absolute inset-0 bg-foreground/30 backdrop-blur-[6px]"`
  - L87 `backdrop-filter`: `className="absolute inset-0 bg-foreground/30 backdrop-blur-[6px]"`
  - L92 `transform`: `transform: visible ? "translateX(0)" : "translateX(-100%)",`
  - L93 `transform`: `transition: "transform 0.42s cubic-bezier(0.22,1,0.36,1)",`
  - L93 `CSS/keyframe animation`: `transition: "transform 0.42s cubic-bezier(0.22,1,0.36,1)",`
  - L95 `transform`: `className="absolute left-0 top-0 bottom-0 w-[92%] max-w-[420px] flex flex-col overflow-hidden border-r border-border bg-background shadow-[0_0_60px_-10px_oklch(0.4_0.02_260/0.25)] will-change-transform"`
  - L95 `will-change`: `className="absolute left-0 top-0 bottom-0 w-[92%] max-w-[420px] flex flex-col overflow-hidden border-r border-border bg-background shadow-[0_0_60px_-10px_oklch(0.4_0.02_260/0.25)] will-change-transform"`
  - L95 `large shadows/glows`: `className="absolute left-0 top-0 bottom-0 w-[92%] max-w-[420px] flex flex-col overflow-hidden border-r border-border bg-background shadow-[0_0_60px_-10px_oklch(0.4_0.02_260/0.25)] will-change-transform"`
  - … 30 more compositor lines omitted

### `src/components/site/MapPicker.tsx`
- **filter/blur** ×4, **backdrop-filter** ×3, **transform** ×4, **CSS/keyframe animation** ×7, **large shadows/glows** ×6, **opacity/opacity animation** ×2, **contain/content-visibility** ×1
  - L384 `filter/blur`: `className="relative z-[2200] shrink-0 border-b border-border bg-card/95 px-3 pb-3 backdrop-blur"`
  - L384 `backdrop-filter`: `className="relative z-[2200] shrink-0 border-b border-border bg-card/95 px-3 pb-3 backdrop-blur"`
  - L399 `transform`: `<Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />`
  - L408 `transform`: `<Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />`
  - L408 `CSS/keyframe animation`: `<Loader2 className="absolute right-3 top-1/2 size-4 -translate-y-1/2 animate-spin text-muted-foreground" />`
  - L412 `large shadows/glows`: `<ul className="absolute inset-x-3 z-[2300] mt-2 max-h-64 divide-y divide-border overflow-auto rounded-2xl border border-border bg-card shadow-xl">`
  - L437 `transform`: `<div className="pointer-events-none absolute left-1/2 top-1/2 z-[1000] -translate-x-1/2 -translate-y-full">`
  - L439 `filter/blur`: `className={`size-9 fill-accent/20 text-accent ${lowEnd ? "" : "drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"}`}`
  - L439 `large shadows/glows`: `className={`size-9 fill-accent/20 text-accent ${lowEnd ? "" : "drop-shadow-[0_4px_10px_rgba(0,0,0,0.5)]"}`}`
  - L449 `opacity/opacity animation`: `className="absolute right-4 z-[1200] grid size-12 place-items-center rounded-full border border-accent/40 bg-card text-accent shadow-lg disabled:opacity-70"`
  - … 17 more compositor lines omitted

### `src/components/site/MegaMenu.tsx`
- **CSS/keyframe animation** ×11, **transform** ×4, **opacity/opacity animation** ×4, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×2
  - L143 `CSS/keyframe animation`: `className="px-4 py-2.5 rounded-full hover:text-foreground hover:bg-white/5 transition-all duration-200 whitespace-nowrap"`
  - L162 `CSS/keyframe animation`: `className={`flex items-center gap-1.5 px-3 lg:px-3.5 py-2.5 rounded-full transition-all duration-200 whitespace-nowrap ${`
  - L169 `transform`: `className={`size-3 transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : "opacity-60"}`}`
  - L169 `opacity/opacity animation`: `className={`size-3 transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : "opacity-60"}`}`
  - L169 `CSS/keyframe animation`: `className={`size-3 transition-transform duration-200 ${isOpen ? "rotate-180 text-accent" : "opacity-60"}`}`
  - L175 `transform`: `className={`absolute left-1/2 top-full z-50 pt-3.5 -translate-x-1/2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${`
  - L175 `CSS/keyframe animation`: `className={`absolute left-1/2 top-full z-50 pt-3.5 -translate-x-1/2 transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${`
  - L177 `opacity/opacity animation`: `? "opacity-100 translate-y-0 scale-100 pointer-events-auto"`
  - L178 `opacity/opacity animation`: `: "opacity-0 translate-y-1 scale-[0.98] pointer-events-none"`
  - L181 `filter/blur`: `<div className="flex w-[680px] overflow-hidden rounded-2xl glass-strong ring-1 ring-white/12 shadow-[var(--shadow-float),0_0_70px_-22px_oklch(0.74_0.19_49/0.5)] backdrop-blur-2xl">`
  - … 13 more compositor lines omitted

### `src/components/site/MobileBottomNav.tsx`
- **transform** ×1, **CSS/keyframe animation** ×4, **opacity/opacity animation** ×2
  - L61 `transform`: `<span className="relative grid place-items-center size-9 rounded-2xl transition-transform duration-200 ease-out active:scale-90">`
  - L61 `CSS/keyframe animation`: `<span className="relative grid place-items-center size-9 rounded-2xl transition-transform duration-200 ease-out active:scale-90">`
  - L65 `CSS/keyframe animation`: `className={`absolute inset-0 rounded-2xl transition-all duration-300 ease-out ${`
  - L67 `opacity/opacity animation`: `? "scale-100 bg-accent/15 opacity-100 ring-1 ring-accent/35"`
  - L68 `opacity/opacity animation`: `: "scale-75 opacity-0"`
  - L73 `CSS/keyframe animation`: `className={`size-[21px] transition-colors duration-200 ${`
  - L86 `CSS/keyframe animation`: `className={`max-w-full truncate leading-none transition-colors duration-200 ${`

### `src/components/site/Nav.tsx`
- **transform** ×15, **CSS/keyframe animation** ×19, **opacity/opacity animation** ×2, **filter/blur** ×3, **will-change** ×1, **backdrop-filter** ×1, **large shadows/glows** ×7
  - L52 `transform`: `// CSS transforms. Android strips `transform` from header descendants (a`
  - L53 `transform`: `// compositor mitigation in styles.css); the previous transform-based offsets`
  - L57 `CSS/keyframe animation`: `"block h-[1.5px] w-5 rounded-full bg-current origin-center [transition:transform_0.4s_cubic-bezier(0.4,0,0.2,1),opacity_0.25s_ease]";`
  - L60 `transform`: `<span className={`${line} ${open ? "[transform:translateY(5.5px)_rotate(45deg)]" : ""}`} />`
  - L61 `opacity/opacity animation`: `<span className={`${line} ${open ? "opacity-0" : "opacity-100"}`} />`
  - L62 `transform`: `<span className={`${line} ${open ? "[transform:translateY(-5.5px)_rotate(-45deg)]" : ""}`} />`
  - L77 `CSS/keyframe animation`: `// Keep the drawer mounted during its exit transition.`
  - L172 `CSS/keyframe animation`: `// Drive the drawer enter/exit transition without framer-motion.`
  - L189 `transform`: `transform: !isAndroid && hidden ? "translateY(-120px)" : "translateY(0)",`
  - L190 `opacity/opacity animation`: `opacity: !isAndroid && hidden ? 0 : 1,`
  - … 38 more compositor lines omitted

### `src/components/site/NewsletterForm.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×2
  - L68 `opacity/opacity animation`: `className="bg-accent text-accent-foreground font-bold px-8 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"`
  - L68 `CSS/keyframe animation`: `className="bg-accent text-accent-foreground font-bold px-8 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2"`
  - L70 `CSS/keyframe animation`: `{status === "loading" || authLoading ? <Loader2 className="size-4 animate-spin" /> : "Subscribe"}`

### `src/components/site/NotificationBell.tsx`
- **transform** ×2, **large shadows/glows** ×3, **CSS/keyframe animation** ×2
  - L22 `transform`: `className={`relative size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground transition-all duration-200 hover:text-accent hover:bg-accent/10 hover:shadow-[0_0_18px_-6px_var(--color-accent)] active:bg`
  - L22 `large shadows/glows`: `className={`relative size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground transition-all duration-200 hover:text-accent hover:bg-accent/10 hover:shadow-[0_0_18px_-6px_var(--color-accent)] active:bg`
  - L22 `CSS/keyframe animation`: `className={`relative size-10 sm:size-11 rounded-xl grid place-items-center text-muted-foreground transition-all duration-200 hover:text-accent hover:bg-accent/10 hover:shadow-[0_0_18px_-6px_var(--color-accent)] active:bg`
  - L23 `large shadows/glows`: `isActive ? "bg-accent/10 text-accent shadow-[0_0_18px_-6px_var(--color-accent)]" : ""`
  - L28 `transform`: `<span key={totalUnread} className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono leading-none ring-2 ring-background shadow-[0_2px_6px_`
  - L28 `large shadows/glows`: `<span key={totalUnread} className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono leading-none ring-2 ring-background shadow-[0_2px_6px_`
  - L28 `CSS/keyframe animation`: `<span key={totalUnread} className="absolute top-1 right-1 grid size-4 place-items-center rounded-full bg-accent text-accent-foreground text-[9px] font-bold font-mono leading-none ring-2 ring-background shadow-[0_2px_6px_`

### `src/components/site/OrderSupportSection.tsx`
- **filter/blur** ×1
  - L134 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `order_id=eq.${orderId}` }, schedule)`

### `src/components/site/PhoneInput.tsx`
- **CSS/keyframe animation** ×1, **large shadows/glows** ×1
  - L178 `CSS/keyframe animation`: `className={`flex items-stretch rounded-2xl border bg-background/60 transition-all focus-within:border-accent focus-within:ring-1 focus-within:ring-accent/40 ${`
  - L220 `large shadows/glows`: `<div className="absolute z-50 mt-1.5 w-full max-h-64 overflow-hidden rounded-2xl border border-border bg-popover shadow-xl">`

### `src/components/site/PolicyLinks.tsx`
- **transform** ×2, **CSS/keyframe animation** ×2
  - L82 `transform`: `className={`group flex items-center gap-3 rounded-2xl p-3.5 transition-all active:scale-[0.98] ${`
  - L82 `CSS/keyframe animation`: `className={`group flex items-center gap-3 rounded-2xl p-3.5 transition-all active:scale-[0.98] ${`
  - L96 `transform`: `<span className={`block text-sm font-medium ${dark ? "text-white" : "text-foreground"} group-hover:translate-x-0.5 transition-transform`}>`
  - L96 `CSS/keyframe animation`: `<span className={`block text-sm font-medium ${dark ? "text-white" : "text-foreground"} group-hover:translate-x-0.5 transition-transform`}>`

### `src/components/site/Price.tsx`
- **CSS/keyframe animation** ×1
  - L34 `CSS/keyframe animation`: `"product-price-skeleton inline-block h-[1em] w-14 animate-pulse rounded bg-white/10 align-middle",`

### `src/components/site/ProductCard.tsx`
- **large shadows/glows** ×9, **transform** ×5, **filter/blur** ×2, **backdrop-filter** ×2, **CSS/keyframe animation** ×6
  - L90 `large shadows/glows`: `boxShadow: "0 2px 6px rgba(0,0,0,0.28)",`
  - L115 `transform`: `// Product-listing badges are intentionally static: transform/keyframe badge`
  - L131 `large shadows/glows`: `"inline-flex h-[22px] sm:h-[28px] w-full max-w-full items-center gap-1 whitespace-nowrap rounded-full px-2 sm:px-3 py-1 text-[10px] sm:text-[11px] font-bold uppercase leading-none tracking-[0.4px] shadow-[0_2px_8px_rgba(`
  - L179 `filter/blur`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L179 `backdrop-filter`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L179 `large shadows/glows`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L180 `CSS/keyframe animation`: `className={`absolute right-3 top-3 z-10 grid h-[36px] w-[36px] sm:h-[46px] sm:w-[46px] place-items-center rounded-full text-white transition-colors ${saved ? "text-accent" : "hover:text-accent"} ${justSaved ? "animate-[s`
  - L199 `filter/blur`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L199 `backdrop-filter`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - L199 `large shadows/glows`: `style={{ backgroundColor: "rgba(120,120,120,0.75)", backdropFilter: "blur(10px)", border: "1px solid rgba(255,255,255,0.12)", boxShadow: "0 2px 8px rgba(0,0,0,0.25)" }}`
  - … 14 more compositor lines omitted

### `src/components/site/ProductCollection.tsx`
- **filter/blur** ×1, **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L78 `filter/blur`: `className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40"`
  - L78 `opacity/opacity animation`: `className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40"`
  - L92 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`

### `src/components/site/ProductDescription.tsx`
- **CSS/keyframe animation** ×2, **opacity/opacity animation** ×3, **transform** ×1
  - L178 `CSS/keyframe animation`: `<motion.div`
  - L179 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L180 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L181 `opacity/opacity animation`: `exit={{ opacity: 0 }}`
  - L194 `transform`: `<ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />`
  - L194 `CSS/keyframe animation`: `<ChevronDown className={`size-3.5 transition-transform ${expanded ? "rotate-180" : ""}`} />`

### `src/components/site/ProductQA.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×10, **transform** ×1, **filter/blur** ×2, **backdrop-filter** ×1, **large shadows/glows** ×2
  - L226 `opacity/opacity animation`: `className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"`
  - L226 `CSS/keyframe animation`: `className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-2.5 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-50"`
  - L228 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}`
  - L239 `transform`: `<Search className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />`
  - L251 `CSS/keyframe animation`: `<div className="py-12 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`
  - L253 `filter/blur`: `<div className="py-14 px-6 text-center rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl shadow-[0_18px_40px_-24px_oklch(0_0_0/0.8)]">`
  - L253 `backdrop-filter`: `<div className="py-14 px-6 text-center rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl shadow-[0_18px_40px_-24px_oklch(0_0_0/0.8)]">`
  - L253 `large shadows/glows`: `<div className="py-14 px-6 text-center rounded-2xl border border-white/10 bg-card/40 backdrop-blur-xl shadow-[0_18px_40px_-24px_oklch(0_0_0/0.8)]">`
  - L255 `filter/blur`: `<div aria-hidden className="absolute inset-0 rounded-full opacity-60" style={{ background: "var(--gradient-ember-soft)", filter: "blur(18px)" }} />`
  - L255 `opacity/opacity animation`: `<div aria-hidden className="absolute inset-0 rounded-full opacity-60" style={{ background: "var(--gradient-ember-soft)", filter: "blur(18px)" }} />`
  - … 8 more compositor lines omitted

### `src/components/site/ProductReviews.tsx`
- **filter/blur** ×12, **CSS/keyframe animation** ×51, **opacity/opacity animation** ×30, **backdrop-filter** ×10, **large shadows/glows** ×9, **transform** ×3
  - L156 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "product_reviews", filter: `product_slug=eq.${productSlug}` }, () => load())`
  - L447 `CSS/keyframe animation`: `<motion.div`
  - L448 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L449 `opacity/opacity animation`: `whileInView={{ opacity: 1, y: 0 }}`
  - L451 `CSS/keyframe animation`: `transition={{ duration: 0.5 }}`
  - L452 `filter/blur`: `className="mb-8 grid gap-8 lg:grid-cols-[280px_1fr] rounded-3xl border border-white/10 bg-card/50 backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_-40px_oklch(0_0_0/0.9)] relative overflow-hidden"`
  - L452 `backdrop-filter`: `className="mb-8 grid gap-8 lg:grid-cols-[280px_1fr] rounded-3xl border border-white/10 bg-card/50 backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_-40px_oklch(0_0_0/0.9)] relative overflow-hidden"`
  - L452 `large shadows/glows`: `className="mb-8 grid gap-8 lg:grid-cols-[280px_1fr] rounded-3xl border border-white/10 bg-card/50 backdrop-blur-xl p-6 sm:p-8 shadow-[0_24px_60px_-40px_oklch(0_0_0/0.9)] relative overflow-hidden"`
  - L454 `opacity/opacity animation`: `<div className="pointer-events-none absolute -top-24 -left-24 size-64 rounded-full opacity-60" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L457 `large shadows/glows`: `<div className="mt-3"><StarRating rating={avg} starClassName="size-5" glow /></div>`
  - … 105 more compositor lines omitted

### `src/components/site/ProductSkeleton.tsx`
- **transform** ×1, **CSS/keyframe animation** ×1
  - L14 `transform`: `<div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />`
  - L14 `CSS/keyframe animation`: `<div className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent" />`

### `src/components/site/ProductTrustBlocks.tsx`
- **CSS/keyframe animation** ×1, **filter/blur** ×1, **opacity/opacity animation** ×1
  - L48 `CSS/keyframe animation`: `<span className="absolute inline-flex h-full w-full rounded-full bg-accent/60 animate-ping" />`
  - L70 `filter/blur`: `<div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(90px)" }} />`
  - L70 `opacity/opacity animation`: `<div aria-hidden className="pointer-events-none absolute -top-24 -right-16 size-80 rounded-full opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(90px)" }} />`

### `src/components/site/PromoBannerCarousel.tsx`
- **filter/blur** ×2, **backdrop-filter** ×2, **opacity/opacity animation** ×4, **CSS/keyframe animation** ×6, **transform** ×3
  - L118 `filter/blur`: `className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-background/70 px-4 py-2 text-[11px] font-mono uppercase tracking-widest text-accent backdrop-blur-md hover:bg-accent/15"`
  - L118 `backdrop-filter`: `className="inline-flex items-center gap-2 rounded-full border border-accent/40 bg-background/70 px-4 py-2 text-[11px] font-mono uppercase tracking-widest text-accent backdrop-blur-md hover:bg-accent/15"`
  - L140 `opacity/opacity animation`: `className={`relative max-w-7xl mx-auto rounded-3xl overflow-hidden border border-border bg-card ${aspectClassName} group ${canEdit && !b.active ? "opacity-60" : ""}`}`
  - L148 `CSS/keyframe animation`: `className="absolute inset-0 motion-safe:animate-fade-in"`
  - L163 `opacity/opacity animation`: `<div className="absolute inset-0" style={{ background: "var(--gradient-ember)", opacity: 0.5 }} />`
  - L179 `CSS/keyframe animation`: `className="inline-flex items-center gap-2 self-start bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs font-mono uppercase tracking-widest hover:gap-3 transition-all"`
  - L192 `transform`: `className="absolute left-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full glass-strong opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"`
  - L192 `opacity/opacity animation`: `className="absolute left-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full glass-strong opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"`
  - L192 `CSS/keyframe animation`: `className="absolute left-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full glass-strong opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"`
  - L199 `transform`: `className="absolute right-3 top-1/2 -translate-y-1/2 size-10 grid place-items-center rounded-full glass-strong opacity-0 group-hover:opacity-100 hover:bg-accent hover:text-accent-foreground transition-all"`
  - … 7 more compositor lines omitted

### `src/components/site/QuickViewDialog.tsx`
- **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×2, **transform** ×4, **CSS/keyframe animation** ×5, **opacity/opacity animation** ×1
  - L35 `filter/blur`: `<DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-white/10 bg-card/80 p-0 backdrop-blur-2xl">`
  - L35 `backdrop-filter`: `<DialogContent className="max-w-md gap-0 overflow-hidden rounded-[24px] border-white/10 bg-card/80 p-0 backdrop-blur-2xl">`
  - L40 `large shadows/glows`: `<span className="absolute left-3 top-3 rounded-full bg-accent px-2.5 py-1 text-[11px] font-bold text-black shadow-[var(--shadow-ember)]">`
  - L87 `transform`: `<button onClick={() => setQty(product.slug, cartQty - 1)} aria-label="Decrease" className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 active:scale-90">`
  - L87 `CSS/keyframe animation`: `<button onClick={() => setQty(product.slug, cartQty - 1)} aria-label="Decrease" className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 active:scale-90">`
  - L91 `transform`: `<button onClick={() => setQty(product.slug, cartQty + 1)} aria-label="Increase" className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 active:scale-90">`
  - L91 `CSS/keyframe animation`: `<button onClick={() => setQty(product.slug, cartQty + 1)} aria-label="Increase" className="grid size-9 place-items-center rounded-full text-accent transition-colors hover:bg-accent/15 active:scale-90">`
  - L99 `transform`: `className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] text-sm font-semibold text-black shadow-[var(--shadow-ember)] trans`
  - L99 `opacity/opacity animation`: `className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] text-sm font-semibold text-black shadow-[var(--shadow-ember)] trans`
  - L99 `large shadows/glows`: `className="inline-flex h-12 flex-1 items-center justify-center gap-1.5 rounded-full bg-[linear-gradient(135deg,oklch(0.80_0.18_58),oklch(0.68_0.20_42))] text-sm font-semibold text-black shadow-[var(--shadow-ember)] trans`
  - … 4 more compositor lines omitted

### `src/components/site/RecentlyViewed.tsx`
- **CSS/keyframe animation** ×6, **large shadows/glows** ×1
  - L41 `CSS/keyframe animation`: `className="w-full h-full object-cover transition-[opacity] duration-500"`
  - L44 `CSS/keyframe animation`: `<h4 data-product-text className="product-typography product-title-text text-xs sm:text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">{product.name}</h4>`
  - L56 `large shadows/glows`: `className={`shrink-0 grid place-items-center size-8 rounded-full bg-accent text-accent-foreground transition-colors hover:brightness-110 shadow-[var(--shadow-ember)] ${justAdded ? "animate-[save-pulse_0.6s_ease-out]" : "`
  - L56 `CSS/keyframe animation`: `className={`shrink-0 grid place-items-center size-8 rounded-full bg-accent text-accent-foreground transition-colors hover:brightness-110 shadow-[var(--shadow-ember)] ${justAdded ? "animate-[save-pulse_0.6s_ease-out]" : "`
  - L103 `CSS/keyframe animation`: `className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground hover:text-accent transition-colors"`
  - L110 `CSS/keyframe animation`: `className="hidden sm:grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"`
  - L117 `CSS/keyframe animation`: `className="hidden sm:grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"`

### `src/components/site/RecommendationStrip.tsx`
- **CSS/keyframe animation** ×2
  - L40 `CSS/keyframe animation`: `<div key={i} className="shrink-0 w-[42%] aspect-[4/5] rounded-2xl bg-card animate-pulse" />`
  - L45 `CSS/keyframe animation`: `<div key={i} className="aspect-[4/5] rounded-2xl bg-card animate-pulse" />`

### `src/components/site/RegionLockCard.tsx`
- **CSS/keyframe animation** ×2
  - L126 `CSS/keyframe animation`: `className="w-full resize-none rounded-2xl border border-border bg-background/60 px-3.5 py-3 text-sm outline-none transition-all focus:border-accent focus:ring-1 focus:ring-accent/40"`
  - L133 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-4 animate-spin" /> : "Submit request"}`

### `src/components/site/RegionSelectModal.tsx`
- **filter/blur** ×3, **backdrop-filter** ×2, **large shadows/glows** ×2, **transform** ×1, **opacity/opacity animation** ×7, **CSS/keyframe animation** ×8
  - L110 `filter/blur`: `className="max-w-sm overflow-hidden border-white/10 bg-background/85 p-6 backdrop-blur-2xl [&>button]:hidden"`
  - L110 `backdrop-filter`: `className="max-w-sm overflow-hidden border-white/10 bg-background/85 p-6 backdrop-blur-2xl [&>button]:hidden"`
  - L182 `filter/blur`: `className="max-w-lg overflow-hidden border-white/10 bg-background/80 p-0 backdrop-blur-2xl [&>button]:hidden"`
  - L182 `backdrop-filter`: `className="max-w-lg overflow-hidden border-white/10 bg-background/80 p-0 backdrop-blur-2xl [&>button]:hidden"`
  - L184 `large shadows/glows`: `{/* cinematic ambient glow */}`
  - L187 `transform`: `className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-50 animate-orb"`
  - L187 `opacity/opacity animation`: `className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-50 animate-orb"`
  - L187 `CSS/keyframe animation`: `className="absolute -top-24 left-1/2 size-72 -translate-x-1/2 rounded-full opacity-50 animate-orb"`
  - L188 `filter/blur`: `style={{ background: "var(--gradient-ember-soft)", filter: "blur(90px)" }}`
  - L194 `CSS/keyframe animation`: `<motion.div`
  - … 13 more compositor lines omitted

### `src/components/site/RelatedProducts.tsx`
- **CSS/keyframe animation** ×2, **large shadows/glows** ×1
  - L67 `CSS/keyframe animation`: `className="size-10 grid place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"`
  - L74 `CSS/keyframe animation`: `className="size-10 grid place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"`
  - L91 `large shadows/glows`: `className="snap-start shrink-0 w-[58%] xs:w-[46%] sm:w-[30%] md:w-[22%] lg:w-[18%] last:mr-4 sm:last:mr-0 rounded-2xl glow-border"`

### `src/components/site/ReturnCenterSections.tsx`
- **opacity/opacity animation** ×6, **CSS/keyframe animation** ×25, **filter/blur** ×9, **backdrop-filter** ×7, **large shadows/glows** ×1, **transform** ×2
  - L28 `opacity/opacity animation`: `initial: { opacity: 0, y: 14 },`
  - L29 `opacity/opacity animation`: `whileInView: { opacity: 1, y: 0 },`
  - L31 `CSS/keyframe animation`: `transition: { duration: 0.5, delay },`
  - L46 `CSS/keyframe animation`: `<motion.section {...reveal()} className="mt-12">`
  - L48 `filter/blur`: `<div className="relative rounded-3xl p-5 sm:p-7 ring-1 ring-white/10 backdrop-blur-xl" style={{ background: cardBg }}>`
  - L48 `backdrop-filter`: `<div className="relative rounded-3xl p-5 sm:p-7 ring-1 ring-white/10 backdrop-blur-xl" style={{ background: cardBg }}>`
  - L56 `large shadows/glows`: `<div className="relative shrink-0 size-12 grid place-items-center rounded-2xl ring-1 ring-accent/30 bg-accent/10" style={{ boxShadow: "0 8px 26px -12px rgba(255,122,0,0.6)" }}>`
  - L68 `CSS/keyframe animation`: `</motion.section>`
  - L83 `CSS/keyframe animation`: `<motion.section {...reveal()} className="mt-12">`
  - L85 `filter/blur`: `<div className="rounded-3xl p-5 sm:p-7 ring-1 ring-white/10 backdrop-blur-xl" style={{ background: cardBg }}>`
  - … 40 more compositor lines omitted

### `src/components/site/ReturnRequestDialog.tsx`
- **CSS/keyframe animation** ×10, **opacity/opacity animation** ×7
  - L193 `CSS/keyframe animation`: `<motion.div`
  - L195 `opacity/opacity animation`: `initial={{ opacity: 0, y: 8 }}`
  - L196 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L212 `CSS/keyframe animation`: `</motion.div>`
  - L214 `CSS/keyframe animation`: `<motion.div`
  - L216 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L217 `opacity/opacity animation`: `animate={{ opacity: 1 }}`
  - L229 `CSS/keyframe animation`: `className="flex items-center gap-3 rounded-xl border border-border p-2.5 cursor-pointer hover:border-accent/40 transition-colors"`
  - L266 `CSS/keyframe animation`: `className="w-full bg-background border border-border rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-accent transition-colors"`
  - L280 `opacity/opacity animation`: `Details <span className="normal-case opacity-60">(optional)</span>`
  - … 7 more compositor lines omitted

### `src/components/site/SavedAddressRail.tsx`
- **CSS/keyframe animation** ×9, **large shadows/glows** ×1, **opacity/opacity animation** ×3
  - L67 `CSS/keyframe animation`: `<motion.button`
  - L72 `CSS/keyframe animation`: `className={`relative shrink-0 w-[80%] sm:w-auto snap-start text-left border rounded-2xl p-4 transition-all duration-300 ${`
  - L74 `large shadows/glows`: `? "border-accent bg-accent/[0.07] shadow-[0_0_0_1px_var(--color-accent),0_12px_30px_-12px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]"`
  - L104 `CSS/keyframe animation`: `<motion.span`
  - L105 `opacity/opacity animation`: `initial={{ scale: 0, opacity: 0 }}`
  - L106 `opacity/opacity animation`: `animate={{ scale: 1, opacity: 1 }}`
  - L107 `opacity/opacity animation`: `exit={{ scale: 0, opacity: 0 }}`
  - L111 `CSS/keyframe animation`: `</motion.span>`
  - L134 `CSS/keyframe animation`: `className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer"`
  - L144 `CSS/keyframe animation`: `className="inline-flex items-center gap-1 hover:text-emerald-400 transition-colors cursor-pointer"`
  - … 3 more compositor lines omitted

### `src/components/site/SearchButton.tsx`
- **transform** ×3, **CSS/keyframe animation** ×4
  - L11 `transform`: `* - GPU-only animations (transform/opacity), respects prefers-reduced-motion.`
  - L11 `CSS/keyframe animation`: `* - GPU-only animations (transform/opacity), respects prefers-reduced-motion.`
  - L37 `transform`: `className={`search-cta group absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 inline-flex h-10 sm:h-12 items-center justify-center gap-1.5 rounded-full text-[13px] sm:text-sm font-semibold tracking-wide text-white `
  - L37 `CSS/keyframe animation`: `className={`search-cta group absolute right-2 sm:right-2.5 top-1/2 -translate-y-1/2 inline-flex h-10 sm:h-12 items-center justify-center gap-1.5 rounded-full text-[13px] sm:text-sm font-semibold tracking-wide text-white `
  - L48 `CSS/keyframe animation`: `<Loader2 className="relative z-[1] size-4 animate-spin" />`
  - L53 `transform`: `<ArrowRight className="relative z-[1] size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />`
  - L53 `CSS/keyframe animation`: `<ArrowRight className="relative z-[1] size-3.5 transition-transform duration-300 group-hover:translate-x-0.5" />`

### `src/components/site/SearchCommand.tsx`
- **filter/blur** ×2, **backdrop-filter** ×2, **CSS/keyframe animation** ×19, **transform** ×8, **large shadows/glows** ×3, **contain/content-visibility** ×1, **opacity/opacity animation** ×1
  - L197 `filter/blur`: `<div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />`
  - L197 `backdrop-filter`: `<div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />`
  - L197 `CSS/keyframe animation`: `<div className="absolute inset-0 bg-black/70 backdrop-blur-sm animate-fade-in" onClick={onClose} />`
  - L198 `transform`: `<div className="absolute left-1/2 top-[6vh] -translate-x-1/2 w-[94%] sm:w-[90%] max-w-2xl glass-strong border border-accent/20 rounded-[24px] shadow-[0_30px_90px_-20px_oklch(0.74_0.19_49/0.35),var(--shadow-float)] overfl`
  - L198 `large shadows/glows`: `<div className="absolute left-1/2 top-[6vh] -translate-x-1/2 w-[94%] sm:w-[90%] max-w-2xl glass-strong border border-accent/20 rounded-[24px] shadow-[0_30px_90px_-20px_oklch(0.74_0.19_49/0.35),var(--shadow-float)] overfl`
  - L198 `CSS/keyframe animation`: `<div className="absolute left-1/2 top-[6vh] -translate-x-1/2 w-[94%] sm:w-[90%] max-w-2xl glass-strong border border-accent/20 rounded-[24px] shadow-[0_30px_90px_-20px_oklch(0.74_0.19_49/0.35),var(--shadow-float)] overfl`
  - L202 `filter/blur`: `className="sticky top-0 z-10 p-3 sm:p-4 border-b border-white/8 bg-background/40 backdrop-blur-xl"`
  - L202 `backdrop-filter`: `className="sticky top-0 z-10 p-3 sm:p-4 border-b border-white/8 bg-background/40 backdrop-blur-xl"`
  - L204 `large shadows/glows`: `<div className={`relative flex items-center rounded-full transition-all duration-300 ${q ? "ring-2 ring-accent/50 shadow-[0_0_0_4px_oklch(0.74_0.19_49/0.10),0_0_34px_-6px_oklch(0.74_0.19_49/0.55)]" : "ring-1 ring-white/1`
  - L204 `CSS/keyframe animation`: `<div className={`relative flex items-center rounded-full transition-all duration-300 ${q ? "ring-2 ring-accent/50 shadow-[0_0_0_4px_oklch(0.74_0.19_49/0.10),0_0_34px_-6px_oklch(0.74_0.19_49/0.55)]" : "ring-1 ring-white/1`
  - … 26 more compositor lines omitted

### `src/components/site/ShareDialog.tsx`
- **transform** ×2, **CSS/keyframe animation** ×2, **opacity/opacity animation** ×1
  - L137 `transform`: `<span className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card/40 transition-colors active:scale-95 hover:bg-accent/10 hover:border-accent/40">`
  - L137 `CSS/keyframe animation`: `<span className="flex size-14 items-center justify-center rounded-2xl border border-border/60 bg-card/40 transition-colors active:scale-95 hover:bg-accent/10 hover:border-accent/40">`
  - L150 `transform`: `className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity active:scale-95 hover:opacity-90"`
  - L150 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity active:scale-95 hover:opacity-90"`
  - L150 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-xs font-semibold text-accent-foreground transition-opacity active:scale-95 hover:opacity-90"`

### `src/components/site/SmartDeliveryCard.tsx`
- **CSS/keyframe animation** ×1
  - L50 `CSS/keyframe animation`: `<Loader2 className="size-4 text-accent animate-spin shrink-0" />`

### `src/components/site/StarRating.tsx`
- **large shadows/glows** ×7, **filter/blur** ×1
  - L18 `large shadows/glows`: `glow,`
  - L22 `large shadows/glows`: `glow?: boolean;`
  - L28 `large shadows/glows`: `viewBox="0 0 24 24"`
  - L32 `filter/blur`: `glow && filled && "drop-shadow-[0_0_6px_oklch(0.74_0.19_49/0.6)]",`
  - L32 `large shadows/glows`: `glow && filled && "drop-shadow-[0_0_6px_oklch(0.74_0.19_49/0.6)]",`
  - L73 `large shadows/glows`: `glow = false,`
  - L83 `large shadows/glows`: `glow?: boolean;`
  - L106 `large shadows/glows`: `return <StarIcon key={i} pct={pct} className={starClassName} glow={glow} />;`

### `src/components/site/TestimonialsCarousel.tsx`
- **transform** ×1, **CSS/keyframe animation** ×3, **filter/blur** ×1, **opacity/opacity animation** ×1
  - L30 `transform`: `<figure className="group relative glass glass-reflect rounded-2xl p-4 sm:p-5 h-full flex flex-col overflow-hidden hover:-translate-y-1 transition-transform duration-200">`
  - L30 `CSS/keyframe animation`: `<figure className="group relative glass glass-reflect rounded-2xl p-4 sm:p-5 h-full flex flex-col overflow-hidden hover:-translate-y-1 transition-transform duration-200">`
  - L31 `filter/blur`: `<div aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full opacity-30 group-hover:opacity-60 transition-opacity blur-2xl" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L31 `opacity/opacity animation`: `<div aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full opacity-30 group-hover:opacity-60 transition-opacity blur-2xl" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L31 `CSS/keyframe animation`: `<div aria-hidden className="absolute -top-10 -right-10 size-32 rounded-full opacity-30 group-hover:opacity-60 transition-opacity blur-2xl" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L107 `CSS/keyframe animation`: `className={`h-1.5 rounded-full transition-all duration-300 ${`

### `src/components/site/ThemeMenu.tsx`
- **CSS/keyframe animation** ×1
  - L35 `CSS/keyframe animation`: `className="grid size-9 place-items-center rounded-full border border-border bg-card text-muted-foreground transition-colors hover:text-foreground hover:border-accent/40"`

### `src/components/site/ThemeSelector.tsx`
- **CSS/keyframe animation** ×1, **large shadows/glows** ×1
  - L31 `CSS/keyframe animation`: `className={`relative flex flex-col items-start gap-2 rounded-xl border p-4 text-left transition-all ${`
  - L33 `large shadows/glows`: `? "border-accent bg-accent/10 shadow-[0_0_0_1px_var(--color-accent)]"`

### `src/components/site/TicketRatingPrompt.tsx`
- **transform** ×1, **CSS/keyframe animation** ×6, **opacity/opacity animation** ×1
  - L98 `transform`: `className="p-0.5 transition-transform active:scale-90"`
  - L98 `CSS/keyframe animation`: `className="p-0.5 transition-transform active:scale-90"`
  - L102 `CSS/keyframe animation`: `"size-7 transition-colors",`
  - L115 `CSS/keyframe animation`: `className="mt-3 w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 resize-none transition"`
  - L121 `opacity/opacity animation`: `className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition"`
  - L121 `CSS/keyframe animation`: `className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition"`
  - L123 `CSS/keyframe animation`: `{submitting ? <Loader2 className="size-4 animate-spin" /> : "Submit Feedback"}`
  - L128 `CSS/keyframe animation`: `className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition"`

### `src/components/site/TrustBadgesStrip.tsx`
- **transform** ×1, **CSS/keyframe animation** ×2, **large shadows/glows** ×1
  - L34 `transform`: `className="size-[18px] text-accent shrink-0 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-[8deg] group-hover:scale-110"`
  - L34 `CSS/keyframe animation`: `className="size-[18px] text-accent shrink-0 transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-[8deg] group-hover:scale-110"`
  - L46 `large shadows/glows`: `<div className="hidden lg:flex items-center justify-between rounded-2xl glass-strong ring-1 ring-white/10 px-8 py-5 shadow-[var(--shadow-float)]">`
  - L50 `CSS/keyframe animation`: `<span className="grid size-9 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 text-foreground/80 transition-all duration-300 group-hover:text-accent group-hover:ring-accent/30">`

### `src/components/site/VirtualizedProductGrid.tsx`
- **transform** ×4, **contain/content-visibility** ×1, **CSS/keyframe animation** ×1
  - L27 `transform`: `* The previous transform-based `useWindowVirtualizer` path placed each row with`
  - L28 `transform`: `* `position: absolute` + `transform: translateY()` + `contain: layout paint`
  - L28 `contain/content-visibility`: `* `position: absolute` + `transform: translateY()` + `contain: layout paint`
  - L101 `transform`: `* Adaptive product grid — now a single, transform-free strategy for every`
  - L104 `CSS/keyframe animation`: `* memory. No virtualization, no transforms, no layer promotion.`
  - L121 `transform`: `// Large catalogs: bounded, incremental, transform-free rendering.`

### `src/components/site/WishlistCard.tsx`
- **CSS/keyframe animation** ×9, **large shadows/glows** ×5, **transform** ×1, **opacity/opacity animation** ×1, **filter/blur** ×4, **backdrop-filter** ×4
  - L60 `CSS/keyframe animation`: `animation: b.animation,`
  - L70 `CSS/keyframe animation`: `animation: undefined as string | undefined,`
  - L96 `CSS/keyframe animation`: `className={`group product-card-glass overflow-hidden relative flex flex-col h-full p-2 transition-all duration-300 ${`
  - L97 `large shadows/glows`: `selected ? "ring-2 ring-accent shadow-[var(--shadow-ember)]" : ""`
  - L121 `transform`: `className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"`
  - L121 `CSS/keyframe animation`: `className="absolute inset-0 -translate-x-full animate-[shimmer_1.6s_infinite] bg-gradient-to-r from-transparent via-white/[0.06] to-transparent"`
  - L133 `CSS/keyframe animation`: `className={`relative w-full h-full object-cover transition-opacity duration-500 ${`
  - L134 `opacity/opacity animation`: `imgLoaded ? "opacity-100" : "opacity-0"`
  - L140 `large shadows/glows`: `<span data-product-badge className={`absolute top-2 inline-flex items-center rounded-full bg-accent text-black font-bold font-mono text-[10px] px-2 py-0.5 shadow-[var(--shadow-ember)] ${selectMode ? "left-10" : "left-2"}`
  - L176 `filter/blur`: `<div className="absolute inset-0 grid place-items-center bg-black/55 backdrop-blur-[1px]">`
  - … 14 more compositor lines omitted

### `src/components/site/WishlistRecommendations.tsx`
- **CSS/keyframe animation** ×5, **filter/blur** ×1, **backdrop-filter** ×1, **opacity/opacity animation** ×1, **large shadows/glows** ×1
  - L27 `CSS/keyframe animation`: `className="w-full h-full object-cover transition-[opacity] duration-500"`
  - L30 `filter/blur`: `<span className="product-typography absolute top-1.5 left-1.5 rounded-full bg-background/80 backdrop-blur px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">`
  - L30 `backdrop-filter`: `<span className="product-typography absolute top-1.5 left-1.5 rounded-full bg-background/80 backdrop-blur px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">`
  - L35 `CSS/keyframe animation`: `<h4 data-product-text className="product-typography product-title-text text-[11px] font-medium line-clamp-1 group-hover:text-accent transition-colors">`
  - L48 `opacity/opacity animation`: `className="shrink-0 grid place-items-center size-7 rounded-full bg-accent text-accent-foreground transition-colors hover:brightness-110 shadow-[var(--shadow-ember)] disabled:opacity-40"`
  - L48 `large shadows/glows`: `className="shrink-0 grid place-items-center size-7 rounded-full bg-accent text-accent-foreground transition-colors hover:brightness-110 shadow-[var(--shadow-ember)] disabled:opacity-40"`
  - L48 `CSS/keyframe animation`: `className="shrink-0 grid place-items-center size-7 rounded-full bg-accent text-accent-foreground transition-colors hover:brightness-110 shadow-[var(--shadow-ember)] disabled:opacity-40"`
  - L92 `CSS/keyframe animation`: `className="grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"`
  - L99 `CSS/keyframe animation`: `className="grid size-9 place-items-center rounded-full border border-border hover:border-accent/40 hover:text-accent transition-colors"`

### `src/components/site/motion-primitives.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×4
  - L12 `opacity/opacity animation`: `hidden: { opacity: 0, y: 24 },`
  - L14 `opacity/opacity animation`: `opacity: 1,`
  - L16 `CSS/keyframe animation`: `transition: { duration: 0.6, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] as const },`
  - L36 `CSS/keyframe animation`: `<motion.div`
  - L46 `CSS/keyframe animation`: `</motion.div>`
  - L71 `CSS/keyframe animation`: `return <motion.span ref={ref}>{display}</motion.span>;`

### `src/components/support/TypingDots.tsx`
- **CSS/keyframe animation** ×5, **opacity/opacity animation** ×4
  - L12 `CSS/keyframe animation`: `<motion.div`
  - L13 `opacity/opacity animation`: `initial={{ opacity: 0, y: 4 }}`
  - L14 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L15 `opacity/opacity animation`: `exit={{ opacity: 0, y: 4 }}`
  - L16 `CSS/keyframe animation`: `transition={{ duration: 0.2, ease: [0.16, 1, 0.3, 1] }}`
  - L24 `CSS/keyframe animation`: `<motion.span`
  - L27 `opacity/opacity animation`: `animate={{ opacity: [0.25, 1, 0.25], y: [0, -2, 0] }}`
  - L28 `CSS/keyframe animation`: `transition={{ duration: 1, repeat: Infinity, ease: "easeInOut", delay: i * 0.2 }}`
  - L33 `CSS/keyframe animation`: `</motion.div>`

### `src/components/ui/accordion.tsx`
- **transform** ×2, **CSS/keyframe animation** ×3
  - L25 `transform`: `"flex flex-1 items-center justify-between py-4 text-sm font-medium cursor-pointer transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180",`
  - L25 `CSS/keyframe animation`: `"flex flex-1 items-center justify-between py-4 text-sm font-medium cursor-pointer transition-all hover:underline text-left [&[data-state=open]>svg]:rotate-180",`
  - L31 `transform`: `<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />`
  - L31 `CSS/keyframe animation`: `<ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground transition-transform duration-200" />`
  - L43 `CSS/keyframe animation`: `className="overflow-hidden text-sm data-[state=closed]:animate-accordion-up data-[state=open]:animate-accordion-down"`

### `src/components/ui/alert-dialog.tsx`
- **CSS/keyframe animation** ×2, **large shadows/glows** ×1
  - L19 `CSS/keyframe animation`: `"fixed inset-0 z-50 bg-black/80 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",`
  - L37 `large shadows/glows`: `"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=c`
  - L37 `CSS/keyframe animation`: `"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=c`

### `src/components/ui/alert.tsx`
- **transform** ×1
  - L7 `transform`: `"relative w-full rounded-lg border px-4 py-3 text-sm [&>svg+div]:translate-y-[-3px] [&>svg]:absolute [&>svg]:left-4 [&>svg]:top-4 [&>svg]:text-foreground [&>svg~*]:pl-7",`

### `src/components/ui/badge.tsx`
- **CSS/keyframe animation** ×1
  - L7 `CSS/keyframe animation`: `"inline-flex items-center rounded-md border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",`

### `src/components/ui/breadcrumb.tsx`
- **CSS/keyframe animation** ×1
  - L47 `CSS/keyframe animation`: `className={cn("transition-colors hover:text-foreground", className)}`

### `src/components/ui/button.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L8 `opacity/opacity animation`: `"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-ev`
  - L8 `CSS/keyframe animation`: `"inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium cursor-pointer transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-ev`

### `src/components/ui/calendar.tsx`
- **transform** ×2, **opacity/opacity animation** ×5
  - L29 `transform`: `String.raw`rtl:**:[.rdp-button\_next>svg]:rotate-180`,`
  - L30 `transform`: `String.raw`rtl:**:[.rdp-button\_previous>svg]:rotate-180`,`
  - L48 `opacity/opacity animation`: `"h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50",`
  - L53 `opacity/opacity animation`: `"h-(--cell-size) w-(--cell-size) select-none p-0 aria-disabled:opacity-50",`
  - L68 `opacity/opacity animation`: `dropdown: cn("bg-popover absolute inset-0 opacity-0", defaultClassNames.dropdown),`
  - L103 `opacity/opacity animation`: `disabled: cn("text-muted-foreground opacity-50", defaultClassNames.disabled),`
  - L168 `opacity/opacity animation`: `"data-[selected-single=true]:bg-primary data-[selected-single=true]:text-primary-foreground data-[range-middle=true]:bg-accent data-[range-middle=true]:text-accent-foreground data-[range-start=true]:bg-primary data-[rang`

### `src/components/ui/carousel.tsx`
- **transform** ×4
  - L189 `transform`: `? "-left-12 top-1/2 -translate-y-1/2"`
  - L190 `transform`: `: "-top-12 left-1/2 -translate-x-1/2 rotate-90",`
  - L217 `transform`: `? "-right-12 top-1/2 -translate-y-1/2"`
  - L218 `transform`: `: "-bottom-12 left-1/2 -translate-x-1/2 rotate-90",`

### `src/components/ui/chart.tsx`
- **large shadows/glows** ×1
  - L162 `large shadows/glows`: `"grid min-w-[8rem] items-start gap-1.5 rounded-lg border border-border/50 bg-background px-2.5 py-1.5 text-xs shadow-xl",`

### `src/components/ui/checkbox.tsx`
- **opacity/opacity animation** ×1
  - L14 `opacity/opacity animation`: `"grid place-content-center peer h-4 w-4 shrink-0 rounded-sm border border-primary shadow cursor-pointer focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity`

### `src/components/ui/command.tsx`
- **opacity/opacity animation** ×3
  - L43 `opacity/opacity animation`: `<Search className="mr-2 h-4 w-4 shrink-0 opacity-50" />`
  - L47 `opacity/opacity animation`: `"flex h-10 w-full rounded-md bg-transparent py-3 text-sm outline-none placeholder:text-muted-foreground disabled:cursor-not-allowed disabled:opacity-50",`
  - L114 `opacity/opacity animation`: `"relative flex cursor-default gap-2 select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none data-[disabled=true]:pointer-events-none data-[selected=true]:bg-accent data-[selected=true]:text-accent-foreground`

### `src/components/ui/context-menu.tsx`
- **transform** ×2, **large shadows/glows** ×1, **CSS/keyframe animation** ×2, **opacity/opacity animation** ×3
  - L47 `transform`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L47 `large shadows/glows`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L47 `CSS/keyframe animation`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L63 `transform`: `"z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=close`
  - L63 `CSS/keyframe animation`: `"z-50 max-h-(--radix-context-menu-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=close`
  - L81 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`
  - L97 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`
  - L120 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`

### `src/components/ui/dialog.tsx`
- **CSS/keyframe animation** ×3, **large shadows/glows** ×1, **opacity/opacity animation** ×1
  - L24 `CSS/keyframe animation`: `"fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",`
  - L41 `large shadows/glows`: `"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=c`
  - L41 `CSS/keyframe animation`: `"fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg translate-x-[-50%] translate-y-[-50%] gap-4 border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=c`
  - L47 `opacity/opacity animation`: `<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-`
  - L47 `CSS/keyframe animation`: `<DialogPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-`

### `src/components/ui/dropdown-menu.tsx`
- **transform** ×2, **large shadows/glows** ×1, **CSS/keyframe animation** ×5, **opacity/opacity animation** ×4
  - L49 `transform`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L49 `large shadows/glows`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L49 `CSS/keyframe animation`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L67 `transform`: `"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2`
  - L67 `CSS/keyframe animation`: `"data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[side=bottom]:slide-in-from-top-2`
  - L85 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:`
  - L85 `CSS/keyframe animation`: `"relative flex cursor-default select-none items-center gap-2 rounded-sm px-2 py-1.5 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:`
  - L101 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:o`
  - L101 `CSS/keyframe animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:o`
  - L124 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none transition-colors focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:o`
  - … 2 more compositor lines omitted

### `src/components/ui/hover-card.tsx`
- **transform** ×1, **CSS/keyframe animation** ×1
  - L19 `transform`: `"z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[sta`
  - L19 `CSS/keyframe animation`: `"z-50 w-64 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[sta`

### `src/components/ui/input-otp.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×2
  - L14 `opacity/opacity animation`: `"flex items-center gap-2 has-[:disabled]:opacity-50",`
  - L42 `CSS/keyframe animation`: `"relative flex h-9 w-9 items-center justify-center border-y border-r border-input text-sm shadow-sm transition-all first:rounded-l-md first:border-l last:rounded-r-md",`
  - L51 `CSS/keyframe animation`: `<div className="h-4 w-px animate-caret-blink bg-foreground duration-1000" />`

### `src/components/ui/input.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L11 `opacity/opacity animation`: `"flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-f`
  - L11 `CSS/keyframe animation`: `"flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-base shadow-sm transition-colors file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-f`

### `src/components/ui/label.tsx`
- **opacity/opacity animation** ×1
  - L10 `opacity/opacity animation`: `"text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70",`

### `src/components/ui/menubar.tsx`
- **transform** ×2, **large shadows/glows** ×1, **CSS/keyframe animation** ×2, **opacity/opacity animation** ×3
  - L85 `transform`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L85 `large shadows/glows`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L85 `CSS/keyframe animation`: `"z-50 min-w-[8rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-lg data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-`
  - L104 `transform`: `"z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-`
  - L104 `CSS/keyframe animation`: `"z-50 min-w-[12rem] overflow-hidden rounded-md border bg-popover p-1 text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-`
  - L122 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm px-2 py-1.5 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`
  - L138 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`
  - L161 `opacity/opacity animation`: `"relative flex cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`

### `src/components/ui/navigation-menu.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×5, **transform** ×1
  - L38 `opacity/opacity animation`: `"group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-acc`
  - L38 `CSS/keyframe animation`: `"group inline-flex h-9 w-max items-center justify-center rounded-md bg-background px-4 py-2 text-sm font-medium cursor-pointer transition-colors hover:bg-accent hover:text-accent-foreground focus:bg-accent focus:text-acc`
  - L52 `transform`: `className="relative top-[1px] ml-1 h-3 w-3 transition duration-300 group-data-[state=open]:rotate-180"`
  - L52 `CSS/keyframe animation`: `className="relative top-[1px] ml-1 h-3 w-3 transition duration-300 group-data-[state=open]:rotate-180"`
  - L66 `CSS/keyframe animation`: `"left-0 top-0 w-full data-[motion^=from-]:animate-in data-[motion^=to-]:animate-out data-[motion^=from-]:fade-in data-[motion^=to-]:fade-out data-[motion=from-end]:slide-in-from-right-52 data-[motion=from-start]:slide-in`
  - L83 `CSS/keyframe animation`: `"origin-top-center relative mt-1.5 h-[var(--radix-navigation-menu-viewport-height)] w-full overflow-hidden rounded-md border bg-popover text-popover-foreground shadow data-[state=open]:animate-in data-[state=closed]:anim`
  - L100 `CSS/keyframe animation`: `"top-full z-[1] flex h-1.5 items-end justify-center overflow-hidden data-[state=visible]:animate-in data-[state=hidden]:animate-out data-[state=hidden]:fade-out data-[state=visible]:fade-in",`

### `src/components/ui/popover.tsx`
- **transform** ×1, **CSS/keyframe animation** ×1
  - L22 `transform`: `"z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[sta`
  - L22 `CSS/keyframe animation`: `"z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[sta`

### `src/components/ui/progress.tsx`
- **CSS/keyframe animation** ×1, **transform** ×1
  - L18 `CSS/keyframe animation`: `className="h-full w-full flex-1 bg-primary transition-all"`
  - L19 `transform`: `style={{ transform: `translateX(-${100 - (value || 0)}%)` }}`

### `src/components/ui/radio-group.tsx`
- **opacity/opacity animation** ×1
  - L23 `opacity/opacity animation`: `"aspect-square h-4 w-4 rounded-full border border-primary text-primary shadow cursor-pointer focus:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50",`

### `src/components/ui/resizable.tsx`
- **transform** ×1
  - L24 `transform`: `"relative flex w-px items-center justify-center bg-border after:absolute after:inset-y-0 after:left-1/2 after:w-1 after:-translate-x-1/2 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring focus-visib`

### `src/components/ui/scroll-area.tsx`
- **CSS/keyframe animation** ×1
  - L32 `CSS/keyframe animation`: `"flex touch-none select-none transition-colors",`

### `src/components/ui/select.tsx`
- **opacity/opacity animation** ×3, **transform** ×2, **CSS/keyframe animation** ×1
  - L22 `opacity/opacity animation`: `"flex h-9 w-full items-center justify-between whitespace-nowrap rounded-md border border-input bg-transparent px-3 py-2 text-sm shadow-sm ring-offset-background cursor-pointer data-[placeholder]:text-muted-foreground foc`
  - L29 `opacity/opacity animation`: `<ChevronDown className="h-4 w-4 opacity-50" />`
  - L71 `transform`: `"relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed`
  - L71 `CSS/keyframe animation`: `"relative z-50 max-h-(--radix-select-content-available-height) min-w-[8rem] overflow-y-auto overflow-x-hidden rounded-md border bg-popover text-popover-foreground shadow-md data-[state=open]:animate-in data-[state=closed`
  - L73 `transform`: `"data-[side=bottom]:translate-y-1 data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=top]:-translate-y-1",`
  - L114 `opacity/opacity animation`: `"relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-2 pr-8 text-sm outline-none focus:bg-accent focus:text-accent-foreground data-[disabled]:pointer-events-none data-[disabled]:opacity-50",`

### `src/components/ui/sheet.tsx`
- **CSS/keyframe animation** ×3, **large shadows/glows** ×1, **opacity/opacity animation** ×1
  - L24 `CSS/keyframe animation`: `"fixed inset-0 z-50 bg-black/80  data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",`
  - L34 `large shadows/glows`: `"fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",`
  - L34 `CSS/keyframe animation`: `"fixed z-50 gap-4 bg-background p-6 shadow-lg transition ease-in-out data-[state=closed]:duration-300 data-[state=open]:duration-500 data-[state=open]:animate-in data-[state=closed]:animate-out",`
  - L64 `opacity/opacity animation`: `<SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`
  - L64 `CSS/keyframe animation`: `<SheetPrimitive.Close className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background cursor-pointer transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2`

### `src/components/ui/sidebar.tsx`
- **CSS/keyframe animation** ×7, **transform** ×6, **opacity/opacity animation** ×4, **large shadows/glows** ×1
  - L225 `CSS/keyframe animation`: `"relative w-(--sidebar-width) bg-transparent transition-[width] duration-200 ease-linear",`
  - L227 `transform`: `"group-data-[side=right]:rotate-180",`
  - L235 `CSS/keyframe animation`: `"fixed inset-y-0 z-10 hidden h-svh w-(--sidebar-width) transition-[left,right,width] duration-200 ease-linear md:flex",`
  - L299 `transform`: `"absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=r`
  - L299 `CSS/keyframe animation`: `"absolute inset-y-0 z-20 hidden w-4 -translate-x-1/2 transition-all ease-linear after:absolute after:inset-y-0 after:left-1/2 after:w-[2px] hover:after:bg-sidebar-border group-data-[side=left]:-right-4 group-data-[side=r`
  - L302 `transform`: `"group-data-[collapsible=offcanvas]:translate-x-0 group-data-[collapsible=offcanvas]:after:left-full group-data-[collapsible=offcanvas]:hover:bg-sidebar",`
  - L434 `CSS/keyframe animation`: `"flex h-8 shrink-0 items-center rounded-md px-2 text-xs font-medium text-sidebar-foreground/70 outline-none ring-sidebar-ring transition-[margin,opacity] duration-200 ease-linear focus-visible:ring-2 [&>svg]:size-4 [&>sv`
  - L435 `opacity/opacity animation`: `"group-data-[collapsible=icon]:-mt-8 group-data-[collapsible=icon]:opacity-0",`
  - L455 `transform`: `"absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring cursor-pointer transition-transform hover:bg-sidebar-accent hover:text-si`
  - L455 `CSS/keyframe animation`: `"absolute right-3 top-3.5 flex aspect-square w-5 items-center justify-center rounded-md p-0 text-sidebar-foreground outline-none ring-sidebar-ring cursor-pointer transition-transform hover:bg-sidebar-accent hover:text-si`
  - … 8 more compositor lines omitted

### `src/components/ui/skeleton.tsx`
- **CSS/keyframe animation** ×1
  - L4 `CSS/keyframe animation`: `return <div className={cn("animate-pulse rounded-md bg-primary/10", className)} {...props} />;`

### `src/components/ui/slider.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L27 `opacity/opacity animation`: `className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-`
  - L27 `CSS/keyframe animation`: `className="block h-4 w-4 rounded-full border border-primary/50 bg-background shadow transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:pointer-events-none disabled:opacity-`

### `src/components/ui/sonner.tsx`
- **large shadows/glows** ×1
  - L13 `large shadows/glows`: `"group toast group-[.toaster]:bg-background group-[.toaster]:text-foreground group-[.toaster]:border-border group-[.toaster]:shadow-lg",`

### `src/components/ui/switch.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×2, **transform** ×1, **large shadows/glows** ×1
  - L12 `opacity/opacity animation`: `"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ri`
  - L12 `CSS/keyframe animation`: `"peer inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ri`
  - L20 `transform`: `"pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",`
  - L20 `large shadows/glows`: `"pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",`
  - L20 `CSS/keyframe animation`: `"pointer-events-none block h-4 w-4 rounded-full bg-background shadow-lg ring-0 transition-transform data-[state=checked]:translate-x-4 data-[state=unchecked]:translate-x-0",`

### `src/components/ui/table.tsx`
- **CSS/keyframe animation** ×1, **transform** ×2
  - L47 `CSS/keyframe animation`: `"border-b transition-colors hover:bg-muted/50 data-[state=selected]:bg-muted",`
  - L63 `transform`: `"h-10 px-2 text-left align-middle font-medium text-muted-foreground [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",`
  - L78 `transform`: `"p-2 align-middle [&:has([role=checkbox])]:pr-0 [&>[role=checkbox]]:translate-y-[2px]",`

### `src/components/ui/tabs.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L30 `opacity/opacity animation`: `"inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-`
  - L30 `CSS/keyframe animation`: `"inline-flex items-center justify-center whitespace-nowrap rounded-md px-3 py-1 text-sm font-medium ring-offset-background cursor-pointer transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-`

### `src/components/ui/textarea.tsx`
- **opacity/opacity animation** ×1
  - L10 `opacity/opacity animation`: `"flex min-h-[60px] w-full rounded-md border border-input bg-transparent px-3 py-2 text-base shadow-sm placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring disabled:cur`

### `src/components/ui/toggle.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L8 `opacity/opacity animation`: `"inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium cursor-pointer transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring`
  - L8 `CSS/keyframe animation`: `"inline-flex items-center justify-center gap-2 rounded-md text-sm font-medium cursor-pointer transition-colors hover:bg-muted hover:text-muted-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring`

### `src/components/ui/tooltip.tsx`
- **transform** ×1, **CSS/keyframe animation** ×1
  - L23 `transform`: `"z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-`
  - L23 `CSS/keyframe animation`: `"z-50 overflow-hidden rounded-md bg-primary px-3 py-1.5 text-xs text-primary-foreground animate-in fade-in-0 zoom-in-95 data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-`

### `src/integrations/supabase/types.ts`
- **CSS/keyframe animation** ×1, **large shadows/glows** ×3
  - L652 `CSS/keyframe animation`: `animation: string`
  - L667 `large shadows/glows`: `glow_color: string`
  - L696 `large shadows/glows`: `glow_color?: string`
  - L725 `large shadows/glows`: `glow_color?: string`

### `src/lib/admin-order-actions.functions.ts`
- **CSS/keyframe animation** ×2
  - L157 `CSS/keyframe animation`: `// Forward stages: the DB enforces single-step status transitions, so we`
  - L160 `CSS/keyframe animation`: `// The DB trigger validates single-step transitions on `status`, so the`

### `src/lib/auth.tsx`
- **filter/blur** ×1
  - L76 `filter/blur`: `{ event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },`

### `src/lib/badges.ts`
- **large shadows/glows** ×2
  - L62 `large shadows/glows`: `staff_pick: { label: "Staff Pick", emoji: "🏆", className: "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" },`
  - L66 `large shadows/glows`: `trending: { label: "Trending", emoji: "🔥", className: "bg-accent text-accent-foreground shadow-[var(--shadow-ember)]" },`

### `src/lib/cart.tsx`
- **filter/blur** ×1
  - L183 `filter/blur`: `{ event: "*", schema: "public", table: "cart_items", filter: `cart_id=eq.${cartId}` },`

### `src/lib/category-image.functions.ts`
- **large shadows/glows** ×1
  - L42 `large shadows/glows`: `" Luxury, futuristic, cinematic product photography composition, dark navy and black layered background with warm orange and amber glow accents, soft premium lighting, glassmorphism, centered hero subject representing th`

### `src/lib/chat-orders.ts`
- **CSS/keyframe animation** ×1, **filter/blur** ×1
  - L91 `CSS/keyframe animation`: `// Detect status transitions for the live update toast.`
  - L108 `filter/blur`: `{ event: "*", schema: "public", table: "orders", filter: `user_id=eq.${userId}` },`

### `src/lib/crisp.ts`
- **opacity/opacity animation** ×1
  - L56 `opacity/opacity animation`: `opacity: 0 !important;`

### `src/lib/customer-admin.functions.ts`
- **CSS/keyframe animation** ×1
  - L98 `CSS/keyframe animation`: `// PRIORITY 1 + 2 — branded email + in-app notification for every transition.`

### `src/lib/email-templates/account-emails.tsx`
- **large shadows/glows** ×4
  - L92 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L110 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L113 `large shadows/glows`: `<Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`
  - L118 `large shadows/glows`: `<Section style={{ textAlign: 'center', margin: '0 0 22px' }}>`

### `src/lib/email-templates/demo-order.tsx`
- **large shadows/glows** ×4
  - L51 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(91,157,255,0.35)',`
  - L69 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L72 `large shadows/glows`: `<Text style={{ margin: '0 0 18px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`
  - L75 `large shadows/glows`: `<Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`

### `src/lib/email-templates/email-change.tsx`
- **large shadows/glows** ×3
  - L87 `large shadows/glows`: `borderRadius: '0 0 14px 14px',`
  - L90 `large shadows/glows`: `const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }`
  - L91 `large shadows/glows`: `const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }`

### `src/lib/email-templates/invite.tsx`
- **large shadows/glows** ×3
  - L74 `large shadows/glows`: `borderRadius: '0 0 14px 14px',`
  - L77 `large shadows/glows`: `const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }`
  - L78 `large shadows/glows`: `const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }`

### `src/lib/email-templates/lifecycle-emails.tsx`
- **large shadows/glows** ×4
  - L91 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L109 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L112 `large shadows/glows`: `<Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`
  - L131 `large shadows/glows`: `<Text style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: '1.55', color: TEXT }}>`

### `src/lib/email-templates/magic-link.tsx`
- **large shadows/glows** ×3
  - L66 `large shadows/glows`: `borderRadius: '0 0 14px 14px',`
  - L69 `large shadows/glows`: `const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }`
  - L70 `large shadows/glows`: `const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }`

### `src/lib/email-templates/order-emails.tsx`
- **large shadows/glows** ×3
  - L69 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L87 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L90 `large shadows/glows`: `<Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`

### `src/lib/email-templates/reauthentication.tsx`
- **large shadows/glows** ×4
  - L57 `large shadows/glows`: `borderRadius: '0 0 14px 14px',`
  - L60 `large shadows/glows`: `const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }`
  - L61 `large shadows/glows`: `const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }`
  - L73 `large shadows/glows`: `margin: '0 0 30px',`

### `src/lib/email-templates/recovery.tsx`
- **large shadows/glows** ×3
  - L67 `large shadows/glows`: `borderRadius: '0 0 14px 14px',`
  - L70 `large shadows/glows`: `const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }`
  - L71 `large shadows/glows`: `const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }`

### `src/lib/email-templates/return-emails.tsx`
- **large shadows/glows** ×3
  - L80 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L98 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L101 `large shadows/glows`: `<Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`

### `src/lib/email-templates/security-emails.tsx`
- **large shadows/glows** ×4
  - L97 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L115 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L118 `large shadows/glows`: `<Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`
  - L123 `large shadows/glows`: `<Section style={{ textAlign: 'center', margin: '0 0 22px' }}>`

### `src/lib/email-templates/signup.tsx`
- **large shadows/glows** ×3
  - L81 `large shadows/glows`: `borderRadius: '0 0 14px 14px',`
  - L84 `large shadows/glows`: `const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }`
  - L85 `large shadows/glows`: `const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }`

### `src/lib/email-templates/support-emails.tsx`
- **large shadows/glows** ×3
  - L86 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L104 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L107 `large shadows/glows`: `<Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`

### `src/lib/email-templates/test-email.tsx`
- **large shadows/glows** ×3
  - L58 `large shadows/glows`: `boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',`
  - L76 `large shadows/glows`: `<Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>`
  - L80 `large shadows/glows`: `<Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>`

### `src/lib/financial-marketing.ts`
- **transform** ×1
  - L380 `transform`: `out.push({ id: `frec-scale-${c.id}`, action: "scale", tone: "good", title: `Scale "${c.name}"`, detail: `ROI ${c.roi.toFixed(1)}× (ROAS ${c.roas.toFixed(1)}×). Increase budget to capture more profit.`, impact: c.profit, `

### `src/lib/image-palette.ts`
- **large shadows/glows** ×3
  - L21 `large shadows/glows`: `glow: string;`
  - L31 `large shadows/glows`: `glow: "transparent",`
  - L55 `large shadows/glows`: `glow: "transparent",`

### `src/lib/inbox-placement.functions.ts`
- **large shadows/glows** ×3
  - L87 `large shadows/glows`: `<h1 style="font-size:20px;margin:0 0 12px">Your FoundOurMarket order update</h1>`
  - L88 `large shadows/glows`: `<p style="font-size:14px;line-height:1.6;color:#aab0bb;margin:0 0 16px">`
  - L92 `large shadows/glows`: `<p style="font-size:14px;line-height:1.6;color:#aab0bb;margin:0 0 16px">`

### `src/lib/inventory-intelligence.ts`
- **CSS/keyframe animation** ×1
  - L419 `CSS/keyframe animation`: `title: `Overstock risk: ${p.name}`, detail: `${p.stock} units — ~${Math.round(p.daysRemaining ?? 0)} days of cover. Consider a promotion.` });`

### `src/lib/inventory-marketing.ts`
- **CSS/keyframe animation** ×1
  - L273 `CSS/keyframe animation`: `detail: `${scaleUp.length} high-margin products have rising demand and no active campaign. Scale up promotion.`,`

### `src/lib/notifications.tsx`
- **filter/blur** ×3
  - L290 `filter/blur`: `{ event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },`
  - L297 `filter/blur`: `{ event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },`
  - L304 `filter/blur`: `{ event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },`

### `src/lib/order-invoice.ts`
- **transform** ×6, **large shadows/glows** ×1
  - L109 `transform`: `.doc .label { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; }`
  - L115 `transform`: `.card h3 { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 8px; }`
  - L122 `transform`: `thead th { font-size: 10px; text-transform: uppercase; letter-spacing: 1px; color: #888; text-align: left; padding: 8px 10px; border-bottom: 2px solid #111; }`
  - L132 `transform`: `.cashbar .k { font-size: 12px; text-transform: uppercase; letter-spacing: 1px; color: #555; }`
  - L135 `transform`: `.checklist h3 { font-size: 11px; text-transform: uppercase; letter-spacing: 1px; color: #888; margin-bottom: 10px; }`
  - L146 `transform`: `.slip .big-label { font-size: 12px; text-transform: uppercase; letter-spacing: 2px; color: #888; margin-top: 26px; }`
  - L155 `large shadows/glows`: `.sheet, .slip { margin: 0; box-shadow: none; }`

### `src/lib/order-lifecycle.ts`
- **CSS/keyframe animation** ×2
  - L5 `CSS/keyframe animation`: `* transitions, customer-facing labels, timeline steps and status colors.`
  - L6 `CSS/keyframe animation`: `* Mirrors the database `order_lifecycle_step` / transition trigger so the`

### `src/lib/product-images.ts`
- **filter/blur** ×1
  - L53 `filter/blur`: `* Returns responsive WebP srcset + blur-up placeholder for a known bundled`

### `src/lib/shipment-notify.functions.ts`
- **CSS/keyframe animation** ×1
  - L2 `CSS/keyframe animation`: `* Service-role customer notification for shipment status transitions.`

### `src/lib/startup-diagnostics.ts`
- **transform** ×2, **filter/blur** ×1, **backdrop-filter** ×1
  - L184 `transform`: `"[style*='transform']",`
  - L192 `filter/blur`: `"[class*='backdrop-blur']",`
  - L192 `backdrop-filter`: `"[class*='backdrop-blur']",`
  - L212 `transform`: `return /transform|translate|scale|rotate|blur|backdrop|filter|will-change|contain|isolation|animate-|shadow-|mask/i.test(value);`

### `src/lib/unified-activity.ts`
- **large shadows/glows** ×20
  - L51 `large shadows/glows`: `glow: string;`
  - L58 `large shadows/glows`: `order_new:        { label: "New Order",       icon: ShoppingBag,   fg: "text-accent",            dot: "bg-accent",            glow: "oklch(0.74 0.19 49 / 0.4)",   severity: "success",  category: "commerce" },`
  - L59 `large shadows/glows`: `order_update:     { label: "Order Update",    icon: ShoppingBag,   fg: "text-teal-300",          dot: "bg-teal-400",          glow: "oklch(0.78 0.12 195 / 0.35)", severity: "info",     category: "commerce" },`
  - L60 `large shadows/glows`: `payment:          { label: "Payment",         icon: CreditCard,    fg: "text-emerald-300",       dot: "bg-emerald-400",       glow: "oklch(0.72 0.15 160 / 0.35)", severity: "success",  category: "commerce" },`
  - L61 `large shadows/glows`: `payment_failed:   { label: "Payment Failed",  icon: CreditCard,    fg: "text-rose-300",          dot: "bg-rose-400",          glow: "oklch(0.65 0.2 25 / 0.35)",   severity: "critical", category: "commerce" },`
  - L62 `large shadows/glows`: `refund:           { label: "Refund",          icon: Banknote,      fg: "text-amber-300",         dot: "bg-amber-400",         glow: "oklch(0.78 0.15 70 / 0.32)",  severity: "warning",  category: "commerce" },`
  - L63 `large shadows/glows`: `signup:           { label: "Signup",          icon: UserPlus,      fg: "text-violet-300",        dot: "bg-violet-400",        glow: "oklch(0.6 0.16 290 / 0.35)",  severity: "info",     category: "customer" },`
  - L64 `large shadows/glows`: `subscriber:       { label: "Subscriber",      icon: UserPlus,      fg: "text-violet-300",        dot: "bg-violet-400",        glow: "oklch(0.6 0.16 290 / 0.35)",  severity: "info",     category: "customer" },`
  - L65 `large shadows/glows`: `wishlist:         { label: "Wishlist",        icon: Heart,         fg: "text-rose-300",          dot: "bg-rose-400",          glow: "oklch(0.65 0.16 15 / 0.32)",  severity: "info",     category: "customer" },`
  - L66 `large shadows/glows`: `cart:             { label: "Add to Cart",     icon: ShoppingBag,   fg: "text-accent",            dot: "bg-accent",            glow: "oklch(0.74 0.19 49 / 0.35)",  severity: "info",     category: "customer" },`
  - … 10 more compositor lines omitted

### `src/lib/use-addresses.ts`
- **filter/blur** ×1
  - L110 `filter/blur`: `{ event: "*", schema: "public", table: "addresses", filter: `user_id=eq.${user.id}` },`

### `src/lib/use-low-end-device.ts`
- **CSS/keyframe animation** ×2, **transform** ×3, **contain/content-visibility** ×1, **large shadows/glows** ×2
  - L10 `CSS/keyframe animation`: `* requested reduced motion. SSR-safe: assumes capable until mounted so the`
  - L55 `transform`: `* compositor bug where many promoted layers (transform + will-change + contain:`
  - L55 `contain/content-visibility`: `* compositor bug where many promoted layers (transform + will-change + contain:`
  - L58 `transform`: `* a transform-free incremental rendering strategy on Android. SSR-safe.`
  - L95 `transform`: `* Decide whether to use the transform-free Incremental Rendering Grid instead`
  - L145 `large shadows/glows`: `* visual effects (visible card count, blur strength, glow, shadows, animation).`
  - L147 `CSS/keyframe animation`: `*   low  — ≤4GB RAM, ≤4 cores, OR prefers-reduced-motion. Minimal blur, no`
  - L148 `large shadows/glows`: `*          heavy glow, simplest animations.`

### `src/lib/use-payment-methods.ts`
- **filter/blur** ×1
  - L73 `filter/blur`: `{ event: "*", schema: "public", table: "saved_payment_methods", filter: `user_id=eq.${user.id}` },`

### `src/lib/use-product-badges.ts`
- **large shadows/glows** ×9, **CSS/keyframe animation** ×5
  - L12 `large shadows/glows`: `| "none" | "pulse" | "bounce" | "shine" | "glow" | "float" | "slide" | "flash";`
  - L15 `large shadows/glows`: `"none", "pulse", "bounce", "shine", "glow", "float", "slide", "flash",`
  - L28 `large shadows/glows`: `case "glow": return "badge-anim-glow";`
  - L49 `large shadows/glows`: `glowColor: string;`
  - L60 `CSS/keyframe animation`: `animation: BadgeAnimation;`
  - L89 `large shadows/glows`: `glow_color?: string | null;`
  - L131 `large shadows/glows`: `glowColor: r.glow_color ?? "",`
  - L142 `CSS/keyframe animation`: `animation: (r.animation as BadgeAnimation) ?? "none",`
  - L280 `large shadows/glows`: `glowColor: string;`
  - L295 `CSS/keyframe animation`: `animation: BadgeAnimation;`
  - … 4 more compositor lines omitted

### `src/lib/use-support-unread.ts`
- **filter/blur** ×2
  - L25 `filter/blur`: `.on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_reads', filter: `user_id=eq.${user.id}` }, () => refresh())`
  - L53 `filter/blur`: `.on('postgres_changes', { event: '*', schema: 'public', table: 'support_ticket_reads', filter: `user_id=eq.${user.id}` }, () => refresh())`

### `src/lib/wishlist-alerts.tsx`
- **filter/blur** ×2
  - L104 `filter/blur`: `{ event: "*", schema: "public", table: "wishlist_price_alerts", filter: `user_id=eq.${user.id}` },`
  - L109 `filter/blur`: `{ event: "*", schema: "public", table: "wishlist_restock_alerts", filter: `user_id=eq.${user.id}` },`

### `src/routes/__root.tsx`
- **transform** ×2, **CSS/keyframe animation** ×1, **large shadows/glows** ×1
  - L73 `transform`: `body.innerHTML = '<div id="fom-startup-fallback" style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#0a0a0a;color:#f5f5f5;font-family:system-ui,-apple-system,Segoe U`
  - L149 `CSS/keyframe animation`: `className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-xs font-medium uppercase tracking-widest text-accent-foreground transition-colors hover:brightness-110"`
  - L285 `transform`: `// transform/will-change layers during hydration.`
  - L441 `large shadows/glows`: `<div className="mx-auto mb-5 size-16 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border">`

### `src/routes/account.tsx`
- **opacity/opacity animation** ×28, **CSS/keyframe animation** ×110, **filter/blur** ×20, **transform** ×11, **large shadows/glows** ×31, **mask/clip** ×2, **backdrop-filter** ×3
  - L66 `opacity/opacity animation`: `initial: { opacity: 0, y: 14 },`
  - L67 `opacity/opacity animation`: `animate: { opacity: 1, y: 0 },`
  - L68 `CSS/keyframe animation`: `transition: { duration: 0.5, ease },`
  - L168 `filter/blur`: `{ event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` },`
  - L173 `filter/blur`: `{ event: "*", schema: "public", table: "returns", filter: `user_id=eq.${user.id}` },`
  - L339 `transform`: `<div className="absolute top-[-22%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L339 `filter/blur`: `<div className="absolute top-[-22%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L339 `opacity/opacity animation`: `<div className="absolute top-[-22%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L339 `large shadows/glows`: `<div className="absolute top-[-22%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L339 `CSS/keyframe animation`: `<div className="absolute top-[-22%] left-1/2 -translate-x-1/2 w-[120%] h-[60vh] opacity-50 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - … 195 more compositor lines omitted

### `src/routes/account_.addresses.tsx`
- **CSS/keyframe animation** ×28, **opacity/opacity animation** ×11, **transform** ×1, **large shadows/glows** ×6, **filter/blur** ×2, **backdrop-filter** ×1
  - L99 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L136 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>`
  - L136 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>`
  - L148 `CSS/keyframe animation`: `</motion.div>`
  - L152 `CSS/keyframe animation`: `<motion.div`
  - L153 `opacity/opacity animation`: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
  - L163 `CSS/keyframe animation`: `</motion.div>`
  - L170 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />`
  - L180 `large shadows/glows`: `className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-3 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 transition-all whitespace-nowrap shadow`
  - L180 `CSS/keyframe animation`: `className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-3 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 transition-all whitespace-nowrap shadow`
  - … 39 more compositor lines omitted

### `src/routes/account_.history.tsx`
- **CSS/keyframe animation** ×35, **large shadows/glows** ×6, **filter/blur** ×5, **opacity/opacity animation** ×11, **transform** ×1
  - L71 `CSS/keyframe animation`: `return <motion.span>{display}</motion.span>;`
  - L222 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L229 `large shadows/glows`: `{/* Ambient glow */}`
  - L230 `filter/blur`: `<div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 h-[420px] -z-10 blur-3xl opacity-60" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L230 `opacity/opacity animation`: `<div aria-hidden className="pointer-events-none absolute inset-x-0 -top-20 h-[420px] -z-10 blur-3xl opacity-60" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L234 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>`
  - L234 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease }}>`
  - L236 `CSS/keyframe animation`: `<Link to="/account" className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-[0.3em] text-muted-foreground hover:text-accent transition-colors">`
  - L246 `CSS/keyframe animation`: `<motion.div`
  - L248 `CSS/keyframe animation`: `transition={{ duration: 2.4, repeat: Infinity, ease: "linear" }}`
  - … 48 more compositor lines omitted

### `src/routes/account_.notifications.tsx`
- **CSS/keyframe animation** ×18, **opacity/opacity animation** ×8, **transform** ×2, **large shadows/glows** ×3, **filter/blur** ×4, **backdrop-filter** ×3
  - L50 `CSS/keyframe animation`: `<motion.div`
  - L51 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L52 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L53 `CSS/keyframe animation`: `transition={{ duration: 0.4 }}`
  - L79 `CSS/keyframe animation`: `</motion.div>`
  - L83 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />`
  - L88 `CSS/keyframe animation`: `className="w-full rounded-xl border border-border bg-card pl-9 pr-9 py-2.5 text-sm outline-none focus:border-accent/50 transition-colors"`
  - L91 `transform`: `<button onClick={() => setQuery("")} className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground">`
  - L108 `CSS/keyframe animation`: `className={`shrink-0 inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-medium transition-all ${`
  - L110 `large shadows/glows`: `? "border-accent/50 bg-accent/10 text-accent shadow-[0_0_12px_-4px_oklch(0.74_0.19_49_/_0.6)]"`
  - … 28 more compositor lines omitted

### `src/routes/account_.orders.tsx`
- **filter/blur** ×12, **backdrop-filter** ×9, **CSS/keyframe animation** ×37, **transform** ×26, **opacity/opacity animation** ×6
  - L224 `filter/blur`: `<div className="size-14 rounded-xl border border-border/60 bg-background/80 backdrop-blur grid place-items-center ring-2 ring-card">`
  - L224 `backdrop-filter`: `<div className="size-14 rounded-xl border border-border/60 bg-background/80 backdrop-blur grid place-items-center ring-2 ring-card">`
  - L324 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: `user_id=eq.${user.id}` }, refresh)`
  - L325 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: `user_id=eq.${user.id}` }, refresh)`
  - L326 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "returns", filter: `user_id=eq.${user.id}` }, refresh)`
  - L399 `CSS/keyframe animation`: `return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;`
  - L415 `filter/blur`: `<header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">`
  - L415 `backdrop-filter`: `<header className="sticky top-0 z-40 backdrop-blur-xl bg-background/80 border-b border-border/50">`
  - L417 `transform`: `<Link to="/account" aria-label="Back" className="size-9 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">`
  - L417 `CSS/keyframe animation`: `<Link to="/account" aria-label="Back" className="size-9 grid place-items-center rounded-full border border-border/60 hover:border-accent/50 active:scale-95 transition">`
  - … 80 more compositor lines omitted

### `src/routes/account_.payment-methods.add.tsx`
- **CSS/keyframe animation** ×20, **opacity/opacity animation** ×9, **large shadows/glows** ×2, **filter/blur** ×2, **transform** ×1
  - L131 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L141 `CSS/keyframe animation`: `<Link to="/account" className="hover:text-foreground transition">Account</Link>`
  - L143 `CSS/keyframe animation`: `<Link to="/account/payments" className="hover:text-foreground transition">Payment Methods</Link>`
  - L148 `CSS/keyframe animation`: `<motion.div`
  - L149 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L150 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L151 `CSS/keyframe animation`: `transition={{ duration: 0.4 }}`
  - L157 `CSS/keyframe animation`: `className="size-10 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"`
  - L167 `CSS/keyframe animation`: `</motion.div>`
  - L180 `opacity/opacity animation`: `className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition disabled:opacity-60 ${`
  - … 24 more compositor lines omitted

### `src/routes/account_.payments.tsx`
- **CSS/keyframe animation** ×17, **opacity/opacity animation** ×10, **filter/blur** ×3, **backdrop-filter** ×1, **large shadows/glows** ×3, **transform** ×3
  - L56 `CSS/keyframe animation`: `<motion.div`
  - L58 `opacity/opacity animation`: `initial={{ opacity: 0, y: 14 }}`
  - L59 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L60 `opacity/opacity animation`: `exit={{ opacity: 0, scale: 0.96 }}`
  - L69 `filter/blur`: `)} p-5 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(255,122,26,0.25)]`}`
  - L69 `backdrop-filter`: `)} p-5 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(255,122,26,0.25)]`}`
  - L69 `large shadows/glows`: `)} p-5 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(255,122,26,0.25)]`}`
  - L71 `filter/blur`: `<div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/20 blur-3xl" />`
  - L122 `opacity/opacity animation`: `className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition hover:bg-white/10 disabled:opacity-50"`
  - L122 `CSS/keyframe animation`: `className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition hover:bg-white/10 disabled:opacity-50"`
  - … 27 more compositor lines omitted

### `src/routes/account_.preferences.tsx`
- **CSS/keyframe animation** ×5, **transform** ×1, **opacity/opacity animation** ×2
  - L67 `CSS/keyframe animation`: `className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? "bg-accent" : "bg-border"}`}`
  - L69 `transform`: `<span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />`
  - L69 `CSS/keyframe animation`: `<span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />`
  - L110 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">`
  - L110 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">`
  - L117 `CSS/keyframe animation`: `</motion.div>`
  - L164 `opacity/opacity animation`: `<button onClick={save} disabled={saving} className="cta-primary disabled:opacity-50">`
  - L165 `CSS/keyframe animation`: `{saving ? <Loader2 className="size-3.5 animate-spin" /> : <SettingsIcon className="size-3.5" />}`

### `src/routes/account_.profile.tsx`
- **CSS/keyframe animation** ×34, **mix-blend-mode** ×1, **opacity/opacity animation** ×14, **large shadows/glows** ×8, **filter/blur** ×2, **transform** ×11
  - L305 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`
  - L316 `CSS/keyframe animation`: `<div className="orb animate-orb" style={{ width: 340, height: 340, top: -80, left: -60, background: "var(--gradient-ember)" }} />`
  - L317 `CSS/keyframe animation`: `<div className="orb animate-orb" style={{ width: 300, height: 300, bottom: 40, right: -80, background: "var(--gradient-violet)", animationDelay: "-8s" }} />`
  - L318 `mix-blend-mode`: `<div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulen`
  - L318 `opacity/opacity animation`: `<div className="absolute inset-0 opacity-[0.04] mix-blend-overlay" style={{ backgroundImage: "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulen`
  - L322 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>`
  - L322 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}>`
  - L323 `CSS/keyframe animation`: `<Link to="/account" className="inline-flex items-center gap-2 text-xs uppercase tracking-widest text-muted-foreground hover:text-accent mb-6 transition-colors">`
  - L332 `CSS/keyframe animation`: `<motion.div`
  - L333 `opacity/opacity animation`: `initial={{ opacity: 0, y: 20 }}`
  - … 60 more compositor lines omitted

### `src/routes/account_.returns.tsx`
- **CSS/keyframe animation** ×83, **large shadows/glows** ×6, **opacity/opacity animation** ×34, **filter/blur** ×14, **backdrop-filter** ×9, **transform** ×1
  - L318 `CSS/keyframe animation`: `"size-5 grid place-items-center rounded-full ring-1 transition-all",`
  - L324 `large shadows/glows`: `style={current ? { boxShadow: `0 0 14px -2px ${TONE_GLOW[view.tone]}` } : undefined}`
  - L329 `CSS/keyframe animation`: `<motion.span`
  - L330 `opacity/opacity animation`: `animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}`
  - L331 `CSS/keyframe animation`: `transition={{ duration: 1.6, repeat: Infinity }}`
  - L334 `CSS/keyframe animation`: `</motion.span>`
  - L351 `CSS/keyframe animation`: `className={cn("absolute inset-y-0 left-0 rounded-full transition-all", i < view.stage ? "w-full bg-emerald-400/50" : "w-0")}`
  - L541 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-[#FF7A00]" />`
  - L565 `filter/blur`: `<div className="absolute -top-40 -left-32 size-[420px] rounded-full blur-3xl opacity-[0.18]"`
  - L565 `opacity/opacity animation`: `<div className="absolute -top-40 -left-32 size-[420px] rounded-full blur-3xl opacity-[0.18]"`
  - … 137 more compositor lines omitted

### `src/routes/account_.security.tsx`
- **CSS/keyframe animation** ×42, **opacity/opacity animation** ×16, **mask/clip** ×1, **large shadows/glows** ×7, **transform** ×6
  - L106 `CSS/keyframe animation`: `<div className="orb animate-orb" style={{ width: 340, height: 340, top: -80, right: -60, background: "var(--gradient-ember)" }} />`
  - L107 `CSS/keyframe animation`: `<div className="orb animate-orb" style={{ width: 300, height: 300, bottom: 40, left: -80, background: "var(--gradient-violet)", animationDelay: "-8s" }} />`
  - L108 `opacity/opacity animation`: `<div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(oklch(1 0 0 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.5) 1px, transparent 1px)", backgroundSize: "44`
  - L108 `mask/clip`: `<div className="absolute inset-0 opacity-[0.035]" style={{ backgroundImage: "linear-gradient(oklch(1 0 0 / 0.5) 1px, transparent 1px), linear-gradient(90deg, oklch(1 0 0 / 0.5) 1px, transparent 1px)", backgroundSize: "44`
  - L112 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">`
  - L112 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">`
  - L119 `CSS/keyframe animation`: `</motion.div>`
  - L122 `CSS/keyframe animation`: `<motion.div`
  - L123 `opacity/opacity animation`: `initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}`
  - L123 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.45, delay: 0.05 }}`
  - … 62 more compositor lines omitted

### `src/routes/account_.support.tsx`
- **filter/blur** ×7, **CSS/keyframe animation** ×28, **transform** ×2, **opacity/opacity animation** ×6, **large shadows/glows** ×1, **backdrop-filter** ×2
  - L200 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` }, () => loadTickets())`
  - L221 `CSS/keyframe animation`: `return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L227 `transform`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L227 `filter/blur`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L227 `opacity/opacity animation`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L227 `large shadows/glows`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L227 `CSS/keyframe animation`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L230 `filter/blur`: `<header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-white/[0.06]" style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top))" }}>`
  - L230 `backdrop-filter`: `<header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-white/[0.06]" style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top))" }}>`
  - L241 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mb-6">`
  - … 36 more compositor lines omitted

### `src/routes/account_.support_.new.tsx`
- **CSS/keyframe animation** ×11, **transform** ×1, **filter/blur** ×3, **opacity/opacity animation** ×3, **backdrop-filter** ×2
  - L154 `CSS/keyframe animation`: `return <div className="min-h-[100dvh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L162 `transform`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L162 `filter/blur`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L162 `opacity/opacity animation`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L166 `filter/blur`: `<header className="sticky top-0 z-30 shrink-0 backdrop-blur-xl bg-background/70 border-b border-white/[0.06]" style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top))" }}>`
  - L166 `backdrop-filter`: `<header className="sticky top-0 z-30 shrink-0 backdrop-blur-xl bg-background/70 border-b border-white/[0.06]" style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top))" }}>`
  - L180 `CSS/keyframe animation`: `<motion.div`
  - L181 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L181 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L198 `CSS/keyframe animation`: `className="w-full bg-accent text-accent-foreground rounded-full px-5 py-2.5 text-xs uppercase tracking-widest font-bold hover:brightness-110 transition inline-flex items-center justify-center gap-2"`
  - … 10 more compositor lines omitted

### `src/routes/account_.support_.ticket.$ticketId.tsx`
- **filter/blur** ×7, **CSS/keyframe animation** ×18, **large shadows/glows** ×4, **transform** ×2, **opacity/opacity animation** ×5, **backdrop-filter** ×3
  - L134 `filter/blur`: `.on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())`
  - L135 `filter/blur`: `.on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())`
  - L136 `filter/blur`: `.on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, () => load())`
  - L219 `CSS/keyframe animation`: `return <div className="min-h-dvh grid place-items-center bg-background"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L250 `large shadows/glows`: `{/* Ambient glow */}`
  - L252 `transform`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[40vh] opacity-30 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L252 `filter/blur`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[40vh] opacity-30 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L252 `opacity/opacity animation`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[40vh] opacity-30 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L252 `large shadows/glows`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[40vh] opacity-30 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - L252 `CSS/keyframe animation`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[40vh] opacity-30 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />`
  - … 29 more compositor lines omitted

### `src/routes/admin-acquisition-intelligence.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×2
  - L72 `opacity/opacity animation`: `<button onClick={onExport} disabled={!rows.length} className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11px] hover:bg-muted disabled:opacity-50">`
  - L155 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>`
  - L184 `CSS/keyframe animation`: `<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh`
  - L259 `opacity/opacity animation`: `<button onClick={() => download(`attribution-${range}-${attrWindow}d.csv`, attributionToCsv(raw.attribution_models))} disabled={!raw.attribution_models.length} className="inline-flex items-center gap-1 rounded-md border `

### `src/routes/admin-activity.tsx`
- **CSS/keyframe animation** ×2
  - L32 `CSS/keyframe animation`: `<span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live`
  - L35 `CSS/keyframe animation`: `{logs === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :`

### `src/routes/admin-analytics.tsx`
- **CSS/keyframe animation** ×14, **opacity/opacity animation** ×9, **transform** ×1, **will-change** ×1, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×1
  - L44 `CSS/keyframe animation`: `<div className="orb animate-mesh" style={{ top: "-12%", left: "-6%", width: "46vw", height: "46vw", background: "var(--gradient-ember-soft)" }} />`
  - L45 `CSS/keyframe animation`: `<div className="orb animate-mesh" style={{ bottom: "-16%", right: "-10%", width: "52vw", height: "52vw", background: "var(--gradient-violet)", animationDelay: "-6s" }} />`
  - L46 `opacity/opacity animation`: `<div className="absolute inset-0 grid-texture opacity-40" />`
  - L59 `CSS/keyframe animation`: `return <motion.span>{text}</motion.span>;`
  - L66 `CSS/keyframe animation`: `<motion.div`
  - L67 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}`
  - L68 `CSS/keyframe animation`: `transition={{ duration: 0.45, ease: EASE, delay: i * 0.03 }} whileHover={{ y: -2 }}`
  - L69 `transform`: `className={`card-premium relative overflow-hidden rounded-2xl p-4 will-change-transform ${accent ? "ring-1 ring-accent/30" : ""}`}`
  - L69 `will-change`: `className={`card-premium relative overflow-hidden rounded-2xl p-4 will-change-transform ${accent ? "ring-1 ring-accent/30" : ""}`}`
  - L78 `CSS/keyframe animation`: `</motion.div>`
  - … 20 more compositor lines omitted

### `src/routes/admin-badges-analytics.tsx`
- **filter/blur** ×6, **backdrop-filter** ×5, **CSS/keyframe animation** ×5, **opacity/opacity animation** ×2
  - L95 `filter/blur`: `<div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/40 p-1 backdrop-blur">`
  - L95 `backdrop-filter`: `<div className="flex items-center gap-1 rounded-xl border border-border/60 bg-card/40 p-1 backdrop-blur">`
  - L100 `CSS/keyframe animation`: `className={`px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors ${`
  - L123 `CSS/keyframe animation`: `<motion.div`
  - L125 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L126 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L127 `CSS/keyframe animation`: `transition={{ delay: i * 0.05 }}`
  - L128 `filter/blur`: `className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur"`
  - L128 `backdrop-filter`: `className="relative overflow-hidden rounded-2xl border border-border/60 bg-card/50 p-4 backdrop-blur"`
  - L130 `filter/blur`: `<div className="absolute -right-6 -top-6 h-20 w-20 rounded-full bg-accent/10 blur-2xl" />`
  - … 8 more compositor lines omitted

### `src/routes/admin-badges-bulk.tsx`
- **CSS/keyframe animation** ×7, **opacity/opacity animation** ×1, **transform** ×1
  - L130 `CSS/keyframe animation`: `return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L150 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-bold border transition-all ${action === a.key ? "bg-accent text-accent-foreground border-accent" : "border-white/10 text-muted-foreground hov`
  - L195 `opacity/opacity animation`: `className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold disabled:opacity-50"`
  - L197 `CSS/keyframe animation`: `{running ? <Loader2 className="size-3.5 animate-spin" /> : <ChevronRight className="size-3.5" />}`
  - L205 `CSS/keyframe animation`: `<div className="h-full bg-accent transition-all" style={{ width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%` }} />`
  - L220 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-bold border transition-all ${b.enabled ? "border-emerald-400/40 bg-emerald-500/15 text-emerald-300" : "border-border bg-white/5 text-`
  - L222 `CSS/keyframe animation`: `<span className={`size-1.5 rounded-full ${b.enabled ? "bg-emerald-400 animate-pulse" : "bg-muted-foreground/60"}`} />`
  - L232 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />`
  - L272 `CSS/keyframe animation`: `className={`flex items-center gap-3 rounded-xl border p-2.5 text-left transition-all ${selected ? "border-accent bg-accent/10" : "border-white/10 hover:bg-white/5"}`}`

### `src/routes/admin-badges.tsx`
- **large shadows/glows** ×4, **opacity/opacity animation** ×4, **transform** ×1, **CSS/keyframe animation** ×9, **filter/blur** ×1
  - L64 `large shadows/glows`: `? `0 ${Math.round(b.shadowStrength / 12)}px ${Math.round(b.shadowStrength / 4)}px -2px ${b.glowColor || bg}``
  - L71 `large shadows/glows`: `boxShadow: shadow,`
  - L80 `opacity/opacity animation`: `{b.subtitle && <span className="opacity-75 font-medium">· {b.subtitle}</span>}`
  - L88 `large shadows/glows`: `live: { label: "Active", cls: "text-emerald-300 border-emerald-400/40 bg-emerald-500/15 shadow-[0_0_12px_-2px_rgba(16,185,129,0.6)]", dot: "bg-emerald-400 shadow-[0_0_6px_rgba(16,185,129,0.9)]" },`
  - L89 `large shadows/glows`: `scheduled: { label: "Scheduled", cls: "text-sky-300 border-sky-400/40 bg-sky-500/15 shadow-[0_0_12px_-2px_rgba(56,189,248,0.5)]", dot: "bg-sky-400" },`
  - L99 `transform`: `className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-widest font-bold transition-all hover:scale-105 active:scale-95 ${m.cls}`}`
  - L99 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] font-mono uppercase tracking-widest font-bold transition-all hover:scale-105 active:scale-95 ${m.cls}`}`
  - L101 `CSS/keyframe animation`: `<span className={`size-1.5 rounded-full ${m.dot} ${state === "live" ? "animate-pulse" : ""}`} />`
  - L214 `CSS/keyframe animation`: `return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L241 `CSS/keyframe animation`: `<motion.div`
  - … 9 more compositor lines omitted

### `src/routes/admin-bulk-badges.tsx`
- **CSS/keyframe animation** ×7, **transform** ×1, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1, **opacity/opacity animation** ×2
  - L119 `CSS/keyframe animation`: `return <div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L127 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />`
  - L141 `CSS/keyframe animation`: `"shrink-0 rounded-full border px-3 h-9 text-xs font-medium transition-colors",`
  - L179 `CSS/keyframe animation`: `"flex w-full items-center gap-3 rounded-xl border px-2.5 py-2 text-left transition-colors",`
  - L211 `filter/blur`: `<div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">`
  - L211 `backdrop-filter`: `<div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">`
  - L211 `large shadows/glows`: `<div className="mx-auto max-w-3xl rounded-2xl border border-border/60 bg-background/90 p-3 shadow-2xl backdrop-blur-xl">`
  - L225 `opacity/opacity animation`: `className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-bold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50"`
  - L225 `CSS/keyframe animation`: `className="flex-1 rounded-lg bg-accent px-2 py-1.5 text-[11px] font-bold text-accent-foreground transition-all hover:brightness-110 disabled:opacity-50"`
  - L227 `CSS/keyframe animation`: `{busy === `${b.key}:true` ? <Loader2 className="mx-auto size-3.5 animate-spin" /> : "On"}`
  - … 3 more compositor lines omitted

### `src/routes/admin-categories.tsx`
- **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1, **CSS/keyframe animation** ×12, **opacity/opacity animation** ×3, **transform** ×1
  - L32 `filter/blur`: `<div className="rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur text-xs shadow-xl">`
  - L32 `backdrop-filter`: `<div className="rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur text-xs shadow-xl">`
  - L32 `large shadows/glows`: `<div className="rounded-xl border border-border bg-card/95 px-3 py-2 backdrop-blur text-xs shadow-xl">`
  - L99 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L129 `CSS/keyframe animation`: `<motion.div`
  - L131 `opacity/opacity animation`: `initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}`
  - L131 `CSS/keyframe animation`: `initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.05 }}`
  - L143 `CSS/keyframe animation`: `</motion.div>`
  - L174 `CSS/keyframe animation`: `<motion.div`
  - L177 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}`
  - … 9 more compositor lines omitted

### `src/routes/admin-checkout-analytics.tsx`
- **CSS/keyframe animation** ×1
  - L137 `CSS/keyframe animation`: `<div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-checkout-funnel.tsx`
- **CSS/keyframe animation** ×1
  - L193 `CSS/keyframe animation`: `<div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-cms.tsx`
- **CSS/keyframe animation** ×2
  - L156 `CSS/keyframe animation`: `<div className={`p-3 rounded-lg border transition-colors ${editing?.id === p.id ? "border-accent bg-accent/5" : p.has_draft ? "border-amber-500/30" : "border-border"}`}>`
  - L313 `CSS/keyframe animation`: `<div className={`p-3 rounded-lg border transition-colors ${editing?.id === p.id ? "border-accent bg-accent/5" : p.has_draft ? "border-amber-500/30" : "border-border"}`}>`

### `src/routes/admin-customer-intelligence.tsx`
- **CSS/keyframe animation** ×4, **transform** ×1
  - L165 `CSS/keyframe animation`: `<Loader2 className="size-6 animate-spin text-accent" />`
  - L179 `CSS/keyframe animation`: `<RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh`
  - L213 `CSS/keyframe animation`: `<div className="h-full rounded-full bg-accent/60 group-hover:bg-accent transition-all" style={{ width: `${(s.count / maxSeg) * 100}%` }} />`
  - L227 `CSS/keyframe animation`: `<div className="w-full rounded-t bg-accent/50 hover:bg-accent transition-all" style={{ height: `${(g.count / maxGrowth) * 100}%`, minHeight: g.count ? 4 : 0 }} title={`${g.count}`} />`
  - L323 `transform`: `<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`

### `src/routes/admin-customers.$customerId.tsx`
- **CSS/keyframe animation** ×8, **opacity/opacity animation** ×5, **filter/blur** ×6
  - L82 `CSS/keyframe animation`: `className="inline-flex items-center gap-1 font-mono text-xs hover:text-accent transition-colors"`
  - L85 `opacity/opacity animation`: `{done ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 opacity-50" />}`
  - L281 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: flt }, ping)`
  - L282 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: flt }, ping)`
  - L283 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: flt }, ping)`
  - L284 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "returns", filter: flt }, ping)`
  - L285 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: flt }, ping)`
  - L286 `filter/blur`: `.on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: flt }, ping)`
  - L315 `CSS/keyframe animation`: `return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L354 `CSS/keyframe animation`: `<Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live`
  - … 9 more compositor lines omitted

### `src/routes/admin-customers.tsx`
- **CSS/keyframe animation** ×4, **transform** ×1, **opacity/opacity animation** ×2
  - L195 `CSS/keyframe animation`: `<Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live`
  - L198 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L214 `CSS/keyframe animation`: `className={`shrink-0 rounded-full border px-3 py-1.5 text-xs font-medium transition-colors ${`
  - L236 `CSS/keyframe animation`: `className="card-premium rounded-2xl p-3.5 text-left hover:border-accent/30 transition-colors cursor-pointer"`
  - L298 `CSS/keyframe animation`: `{loading && <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}`
  - L316 `opacity/opacity animation`: `className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="size-4" /></button>`
  - L319 `opacity/opacity animation`: `className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronRight className="size-4" /></button>`

### `src/routes/admin-email-delivery.tsx`
- **CSS/keyframe animation** ×5, **transform** ×1
  - L88 `CSS/keyframe animation`: `className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${`
  - L98 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"`
  - L100 `CSS/keyframe animation`: `<RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh`
  - L133 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L143 `CSS/keyframe animation`: `className="rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"`
  - L159 `CSS/keyframe animation`: `<div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-email-diagnostics.tsx`
- **CSS/keyframe animation** ×5
  - L100 `CSS/keyframe animation`: `return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L120 `CSS/keyframe animation`: `className={`rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${`
  - L132 `CSS/keyframe animation`: `<RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh`
  - L147 `CSS/keyframe animation`: `<div className={`h-full ${tone.bar} transition-all`} style={{ width: `${score}%` }} />`
  - L188 `CSS/keyframe animation`: `<div className="h-full bg-emerald-400 transition-all" style={{ width: `${primaryShare}%` }} title={`Primary ${primaryShare}%`} />`

### `src/routes/admin-email-health.tsx`
- **CSS/keyframe animation** ×3
  - L89 `CSS/keyframe animation`: `className={`rounded-md px-3 py-1.5 text-xs font-mono transition-colors ${`
  - L102 `CSS/keyframe animation`: `<RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />`
  - L137 `CSS/keyframe animation`: `<Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading deliverability…`

### `src/routes/admin-email-ops.tsx`
- **CSS/keyframe animation** ×5
  - L76 `CSS/keyframe animation`: `className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${`
  - L86 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"`
  - L88 `CSS/keyframe animation`: `<RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh`
  - L115 `CSS/keyframe animation`: `<div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`
  - L164 `CSS/keyframe animation`: `<div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-email-queue.tsx`
- **CSS/keyframe animation** ×6
  - L105 `CSS/keyframe animation`: `className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${`
  - L118 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"`
  - L120 `CSS/keyframe animation`: `<RefreshCw className={`size-3 ${queueQ.isFetching || logQ.isFetching ? "animate-spin" : ""}`} /> Refresh`
  - L146 `CSS/keyframe animation`: `<div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`
  - L219 `CSS/keyframe animation`: `className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${`
  - L230 `CSS/keyframe animation`: `<div className="py-10 grid place-items-center"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-emails.tsx`
- **opacity/opacity animation** ×1, **CSS/keyframe animation** ×6
  - L119 `opacity/opacity animation`: `className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[12px] font-medium uppercase tracking-widest text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-`
  - L119 `CSS/keyframe animation`: `className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-[12px] font-medium uppercase tracking-widest text-accent-foreground transition-opacity hover:opacity-90 disabled:opacity-40 disabled:cursor-`
  - L121 `CSS/keyframe animation`: `{sending ? <Loader2 className="size-3.5 animate-spin" /> : <Send className="size-3.5" />}`
  - L166 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-border/60 bg-white/[0.03] px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground transition-colors"`
  - L168 `CSS/keyframe animation`: `<RefreshCw className={`size-3 ${isFetching ? "animate-spin" : ""}`} /> Refresh`
  - L259 `CSS/keyframe animation`: `className={`px-2.5 py-1 rounded-full text-[10px] font-mono uppercase tracking-widest transition-colors ${`
  - L313 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin text-muted-foreground" />`

### `src/routes/admin-financial.tsx`
- **CSS/keyframe animation** ×33, **opacity/opacity animation** ×7, **large shadows/glows** ×5, **filter/blur** ×2, **backdrop-filter** ×1, **transform** ×8
  - L46 `CSS/keyframe animation`: `<div className="orb animate-mesh" style={{ top: "-12%", left: "-6%", width: "46vw", height: "46vw", background: "var(--gradient-ember-soft)" }} />`
  - L47 `CSS/keyframe animation`: `<div className="orb animate-mesh" style={{ bottom: "-16%", right: "-10%", width: "52vw", height: "52vw", background: "var(--gradient-ember-soft)", animationDelay: "-7s" }} />`
  - L48 `opacity/opacity animation`: `<div className="absolute inset-0 grid-texture opacity-30" />`
  - L74 `CSS/keyframe animation`: `<motion.div`
  - L75 `opacity/opacity animation`: `initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }}`
  - L76 `CSS/keyframe animation`: `transition={{ duration: 0.5, delay, ease: EASE }} whileHover={{ y: -3 }}`
  - L78 `large shadows/glows`: `style={{ boxShadow: "inset 0 1px 0 oklch(1 0 0 / 0.06), 0 18px 40px -28px oklch(0 0 0 / 0.8)" }}`
  - L80 `filter/blur`: `<div className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full opacity-25 group-hover:opacity-45 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(22px)`
  - L80 `opacity/opacity animation`: `<div className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full opacity-25 group-hover:opacity-45 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(22px)`
  - L80 `CSS/keyframe animation`: `<div className="pointer-events-none absolute -top-10 -right-8 size-24 rounded-full opacity-25 group-hover:opacity-45 transition-opacity duration-500" style={{ background: "var(--gradient-ember-soft)", filter: "blur(22px)`
  - … 46 more compositor lines omitted

### `src/routes/admin-flash-deals.tsx`
- **opacity/opacity animation** ×2, **CSS/keyframe animation** ×7, **filter/blur** ×1, **backdrop-filter** ×1
  - L263 `opacity/opacity animation`: `className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition"`
  - L263 `CSS/keyframe animation`: `className="inline-flex items-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2 text-xs font-mono uppercase tracking-widest hover:opacity-90 transition"`
  - L271 `CSS/keyframe animation`: `<Loader2 className="size-6 animate-spin text-accent" />`
  - L312 `CSS/keyframe animation`: `className="size-8 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition"`
  - L319 `CSS/keyframe animation`: `className="size-8 grid place-items-center rounded-full border border-white/10 hover:bg-white/5 transition"`
  - L326 `CSS/keyframe animation`: `className="size-8 grid place-items-center rounded-full border border-destructive/30 text-destructive hover:bg-destructive/10 transition"`
  - L338 `filter/blur`: `<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>`
  - L338 `backdrop-filter`: `<div className="fixed inset-0 z-50 grid place-items-center bg-black/60 backdrop-blur-sm p-4" onClick={() => setEditing(null)}>`
  - L422 `opacity/opacity animation`: `className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-60"`
  - L422 `CSS/keyframe animation`: `className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-accent text-accent-foreground px-4 py-2.5 text-sm font-medium hover:opacity-90 transition disabled:opacity-60"`
  - … 1 more compositor lines omitted

### `src/routes/admin-inbox-placement.tsx`
- **opacity/opacity animation** ×3, **CSS/keyframe animation** ×7
  - L56 `opacity/opacity animation`: `<span className="text-[9px] font-mono uppercase tracking-[0.2em] opacity-70">{provider}</span>`
  - L152 `opacity/opacity animation`: `className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-primary px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50 transition-opacity"`
  - L152 `CSS/keyframe animation`: `className="inline-flex items-center gap-2 rounded-xl bg-gradient-to-r from-accent to-primary px-4 py-2.5 text-sm font-medium text-accent-foreground disabled:opacity-50 transition-opacity"`
  - L154 `CSS/keyframe animation`: `{runTest.isPending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}`
  - L193 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors"`
  - L195 `CSS/keyframe animation`: `<RefreshCw className={`size-3.5 ${tests.isFetching ? "animate-spin" : ""}`} />`
  - L202 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`
  - L233 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs hover:border-accent/40 disabled:opacity-50 transition-colors"`
  - L233 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs hover:border-accent/40 disabled:opacity-50 transition-colors"`
  - L236 `CSS/keyframe animation`: `<Loader2 className="size-3.5 animate-spin" />`

### `src/routes/admin-inventory-intelligence.tsx`
- **CSS/keyframe animation** ×2
  - L72 `CSS/keyframe animation`: `<div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L94 `CSS/keyframe animation`: `<RefreshCw className={`size-3 ${refreshing ? "animate-spin" : ""}`} /> Refresh`

### `src/routes/admin-inventory.tsx`
- **CSS/keyframe animation** ×1, **filter/blur** ×1, **backdrop-filter** ×1, **opacity/opacity animation** ×1
  - L65 `CSS/keyframe animation`: `{products === null ? <div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div> :`
  - L136 `filter/blur`: `<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>`
  - L136 `backdrop-filter`: `<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>`
  - L158 `opacity/opacity animation`: `<button onClick={save} disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{saving ? "Saving…" : "Apply"}</button>`

### `src/routes/admin-live.tsx`
- **CSS/keyframe animation** ×42, **opacity/opacity animation** ×14, **transform** ×3, **will-change** ×2, **filter/blur** ×8, **backdrop-filter** ×4, **large shadows/glows** ×3, **contain/content-visibility** ×1
  - L48 `CSS/keyframe animation`: `<div className="orb animate-mesh" style={{ top: "-10%", left: "-5%", width: "45vw", height: "45vw", background: "var(--gradient-ember-soft)" }} />`
  - L49 `CSS/keyframe animation`: `<div className="orb animate-mesh" style={{ bottom: "-15%", right: "-8%", width: "50vw", height: "50vw", background: "var(--gradient-violet)", animationDelay: "-6s" }} />`
  - L50 `opacity/opacity animation`: `<div className="absolute inset-0 grid-texture opacity-40" />`
  - L64 `CSS/keyframe animation`: `return <motion.span>{text}</motion.span>;`
  - L70 `CSS/keyframe animation`: `<motion.div`
  - L71 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16 }}`
  - L72 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L73 `CSS/keyframe animation`: `transition={{ duration: 0.6, ease: EASE }}`
  - L75 `transform`: `className="card-ambient glass-reflect noise-layer relative overflow-hidden rounded-3xl p-6 sm:p-7 row-span-2 flex flex-col justify-between min-h-[180px] will-change-transform"`
  - L75 `will-change`: `className="card-ambient glass-reflect noise-layer relative overflow-hidden rounded-3xl p-6 sm:p-7 row-span-2 flex flex-col justify-between min-h-[180px] will-change-transform"`
  - … 67 more compositor lines omitted

### `src/routes/admin-low-stock.tsx`
- **CSS/keyframe animation** ×1
  - L55 `CSS/keyframe animation`: `<div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-marketing-automation.tsx`
- **CSS/keyframe animation** ×8, **large shadows/glows** ×1, **opacity/opacity animation** ×3, **filter/blur** ×1, **backdrop-filter** ×1
  - L118 `CSS/keyframe animation`: `<Loader2 className="size-6 animate-spin" />`
  - L142 `CSS/keyframe animation`: `<RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Refresh`
  - L154 `CSS/keyframe animation`: `className={`h-8 px-3.5 rounded-full text-xs whitespace-nowrap transition-colors ${tab === k ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"}`}>`
  - L286 `CSS/keyframe animation`: `className="text-left rounded-xl bg-card/60 border border-border p-3 hover:border-accent/40 transition-colors">`
  - L334 `large shadows/glows`: `<div key={c.id} id={`campaign-${c.id}`} className={`card-premium rounded-2xl p-4 transition-shadow ${focusId === c.id ? "ring-2 ring-primary shadow-lg" : ""}`}>`
  - L334 `CSS/keyframe animation`: `<div key={c.id} id={`campaign-${c.id}`} className={`card-premium rounded-2xl p-4 transition-shadow ${focusId === c.id ? "ring-2 ring-primary shadow-lg" : ""}`}>`
  - L525 `opacity/opacity animation`: `<button disabled={busy} onClick={submit} className="w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">`
  - L526 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-4 animate-spin" /> : <Rocket className="size-4" />} Create campaign`
  - L581 `opacity/opacity animation`: `<button disabled={busy} onClick={submit} className="w-full h-10 rounded-xl bg-accent text-accent-foreground text-sm font-medium inline-flex items-center justify-center gap-2 disabled:opacity-60">`
  - L582 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-4 animate-spin" /> : <Zap className="size-4" />} Create rule`
  - … 4 more compositor lines omitted

### `src/routes/admin-marketing-growth.tsx`
- **CSS/keyframe animation** ×5
  - L42 `CSS/keyframe animation`: `if (p.needs_promotion.length)`
  - L43 `CSS/keyframe animation`: `out.push({ tone: "warn", title: "High-view, zero-sale products", detail: `${p.needs_promotion.length} products get traffic but no sales — test a discount or better imagery.` });`
  - L210 `CSS/keyframe animation`: `<div className="grid place-items-center py-32"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>`
  - L264 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>`
  - L320 `CSS/keyframe animation`: `<Table title="Needs promotion" cols={["Product", "Views", "Stock"]} rows={d.products.needs_promotion.map((p) => [p.name, fmtN(p.views_count), fmtN(p.stock_quantity)])} />`

### `src/routes/admin-marketing-metrics.tsx`
- **CSS/keyframe animation** ×2, **opacity/opacity animation** ×1
  - L113 `CSS/keyframe animation`: `<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh`
  - L115 `opacity/opacity animation`: `<button onClick={exportCsv} disabled={!kpis.length} className="inline-flex items-center gap-1 rounded-md bg-accent px-2.5 py-1.5 text-xs font-medium text-accent-foreground disabled:opacity-50">`
  - L142 `CSS/keyframe animation`: `<Loader2 className="h-5 w-5 animate-spin" />`

### `src/routes/admin-marketing.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×5, **filter/blur** ×2, **backdrop-filter** ×2
  - L146 `CSS/keyframe animation`: `{banners === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :`
  - L173 `opacity/opacity animation`: `<button onClick={() => moveBanner(b.id, -1)} title="Move left" className="size-8 grid place-items-center rounded-full hover:bg-white/5 disabled:opacity-30" disabled={banners.indexOf(b) === 0}><ChevronLeft className="size`
  - L174 `opacity/opacity animation`: `<button onClick={() => moveBanner(b.id, 1)} title="Move right" className="size-8 grid place-items-center rounded-full hover:bg-white/5 disabled:opacity-30" disabled={banners.indexOf(b) === banners.length - 1}><ChevronRig`
  - L207 `CSS/keyframe animation`: `{flash === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :`
  - L371 `filter/blur`: `<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>`
  - L371 `backdrop-filter`: `<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>`
  - L412 `opacity/opacity animation`: `<button type="button" onClick={() => fileRef.current?.click()} disabled={uploading} className="inline-flex items-center gap-1.5 px-3 py-2 rounded-full border border-border text-[11px] uppercase tracking-widest font-mono `
  - L413 `CSS/keyframe animation`: `{uploading ? <Loader2 className="size-3.5 animate-spin" /> : <Upload className="size-3.5" />}`
  - L447 `opacity/opacity animation`: `<button type="submit" disabled={saving} className="px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold bg-accent text-accent-foreground disabled:opacity-50">{saving ? "Saving…" : "Save draft"}</button>`
  - L506 `filter/blur`: `<div className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm grid place-items-center p-4" onClick={onClose}>`
  - … 2 more compositor lines omitted

### `src/routes/admin-marketplace-quality.tsx`
- **CSS/keyframe animation** ×6, **opacity/opacity animation** ×4, **transform** ×1, **large shadows/glows** ×1, **filter/blur** ×1, **backdrop-filter** ×1
  - L44 `CSS/keyframe animation`: `<motion.div`
  - L45 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}`
  - L46 `CSS/keyframe animation`: `transition={{ duration: 0.45, ease: [0.16, 1, 0.3, 1] }}`
  - L50 `transform`: `<svg viewBox="0 0 36 36" className="size-16 -rotate-90">`
  - L50 `large shadows/glows`: `<svg viewBox="0 0 36 36" className="size-16 -rotate-90">`
  - L64 `CSS/keyframe animation`: `</motion.div>`
  - L119 `opacity/opacity animation`: `className="inline-flex items-center gap-2 text-[10px] font-mono uppercase tracking-widest glass rounded-full px-4 py-2 text-accent ring-1 ring-inset ring-accent/30 disabled:opacity-50"`
  - L121 `CSS/keyframe animation`: `<RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Re-scan`
  - L128 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`
  - L172 `opacity/opacity animation`: `<span className="opacity-60">({report.byCategory[c]})</span>`
  - … 4 more compositor lines omitted

### `src/routes/admin-media.tsx`
- **transform** ×1, **CSS/keyframe animation** ×3, **opacity/opacity animation** ×1
  - L103 `transform`: `<Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />`
  - L117 `CSS/keyframe animation`: `"rounded-full border px-3 py-1 text-[10px] font-mono uppercase tracking-widest transition-all",`
  - L146 `opacity/opacity animation`: `<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">`
  - L146 `CSS/keyframe animation`: `<div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-2 opacity-0 transition-opacity group-hover:opacity-100">`
  - L179 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-accent" />`

### `src/routes/admin-merchandising.tsx`
- **opacity/opacity animation** ×5, **CSS/keyframe animation** ×10, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×1
  - L160 `opacity/opacity animation`: `className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent border border-accent/40 px-4 py-2 text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"`
  - L160 `CSS/keyframe animation`: `className="shrink-0 inline-flex items-center gap-1.5 rounded-full bg-accent/15 text-accent border border-accent/40 px-4 py-2 text-xs font-medium hover:bg-accent/25 transition-colors disabled:opacity-50"`
  - L162 `CSS/keyframe animation`: `<Shuffle className={`size-3.5 ${reshuffling ? "animate-spin" : ""}`} /> Reshuffle all`
  - L182 `CSS/keyframe animation`: `className={`shrink-0 whitespace-nowrap rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors border ${`
  - L185 `opacity/opacity animation`: `{s.label} <span className="ml-1 opacity-60">{count}</span>`
  - L192 `CSS/keyframe animation`: `<div className="grid place-items-center py-24"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L244 `opacity/opacity animation`: `<motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}`
  - L244 `CSS/keyframe animation`: `<motion.div initial={{ y: 60, opacity: 0 }} animate={{ y: 0, opacity: 1 }}`
  - L245 `filter/blur`: `className="fixed bottom-0 inset-x-0 lg:left-[17.5rem] z-30 border-t border-border bg-background/90 backdrop-blur-xl px-4 py-3">`
  - L245 `backdrop-filter`: `className="fixed bottom-0 inset-x-0 lg:left-[17.5rem] z-30 border-t border-border bg-background/90 backdrop-blur-xl px-4 py-3">`
  - … 10 more compositor lines omitted

### `src/routes/admin-notifications.tsx`
- **filter/blur** ×9, **CSS/keyframe animation** ×31, **transform** ×2, **opacity/opacity animation** ×5, **backdrop-filter** ×6, **large shadows/glows** ×1
  - L144 `filter/blur`: `{ event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },`
  - L151 `filter/blur`: `{ event: "UPDATE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },`
  - L154 `filter/blur`: `{ event: "DELETE", schema: "public", table: "notifications", filter: `user_id=eq.${user.id}` },`
  - L242 `CSS/keyframe animation`: `<span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live`
  - L245 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full border border-border bg-white/5 px-3 py-1.5 text-xs hover:border-accent/50 transition-colors">`
  - L262 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L267 `CSS/keyframe animation`: `className="size-9 shrink-0 grid place-items-center rounded-xl border border-border bg-white/5 hover:border-accent/50 transition-colors">`
  - L276 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs font-medium capitalize transition-all ${`
  - L315 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}`
  - L315 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}`
  - … 44 more compositor lines omitted

### `src/routes/admin-orders-analytics.tsx`
- **CSS/keyframe animation** ×1
  - L64 `CSS/keyframe animation`: `<div className="min-h-[50vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>`

### `src/routes/admin-orders-ops.tsx`
- **large shadows/glows** ×2, **CSS/keyframe animation** ×12, **filter/blur** ×2, **backdrop-filter** ×2, **contain/content-visibility** ×1, **transform** ×2
  - L161 `large shadows/glows`: `<div className="absolute right-0 mt-1 z-20 w-36 rounded-lg border border-border bg-card shadow-xl p-1 text-xs">`
  - L175 `CSS/keyframe animation`: `<button onClick={onClick} className="w-full text-left grid grid-cols-[auto_1fr_auto] gap-3 sm:gap-4 items-center p-3 sm:p-3.5 rounded-xl hover:bg-muted/30 transition-colors border border-transparent hover:border-border/7`
  - L286 `filter/blur`: `<div className="absolute inset-0 bg-background/80 backdrop-blur-md" />`
  - L286 `backdrop-filter`: `<div className="absolute inset-0 bg-background/80 backdrop-blur-md" />`
  - L287 `contain/content-visibility`: `<div className="relative w-full max-w-md h-full overflow-y-auto overscroll-contain bg-card border-l border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>`
  - L287 `large shadows/glows`: `<div className="relative w-full max-w-md h-full overflow-y-auto overscroll-contain bg-card border-l border-border shadow-2xl" onClick={(e) => e.stopPropagation()}>`
  - L290 `filter/blur`: `<div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 pt-5 pb-4">`
  - L290 `backdrop-filter`: `<div className="sticky top-0 z-10 bg-card/95 backdrop-blur border-b border-border px-5 pt-5 pb-4">`
  - L362 `CSS/keyframe animation`: `className="w-full inline-flex items-center justify-center gap-2 text-[13px] font-medium px-4 py-2.5 rounded-xl border border-accent/40 bg-accent/[0.06] text-accent hover:bg-accent/10 transition-colors"`
  - L395 `transform`: `<ChevronDown className="size-3.5 transition-transform group-open:rotate-180" />`
  - … 11 more compositor lines omitted

### `src/routes/admin-payments.tsx`
- **CSS/keyframe animation** ×2, **transform** ×1, **opacity/opacity animation** ×2
  - L145 `CSS/keyframe animation`: `<Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live`
  - L148 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L227 `CSS/keyframe animation`: `{loading && <div className="p-6 grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>}`
  - L235 `opacity/opacity animation`: `className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronLeft className="size-4" /></button>`
  - L238 `opacity/opacity animation`: `className="rounded-full border border-white/10 p-1.5 hover:bg-white/5 disabled:opacity-40"><ChevronRight className="size-4" /></button>`

### `src/routes/admin-performance.tsx`
- **filter/blur** ×2, **backdrop-filter** ×2, **CSS/keyframe animation** ×1
  - L46 `filter/blur`: `<div className="px-5 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-card/80 backdrop-blur z-10">`
  - L46 `backdrop-filter`: `<div className="px-5 py-3 border-b border-border flex items-center justify-between sticky top-0 bg-card/80 backdrop-blur z-10">`
  - L58 `CSS/keyframe animation`: `<div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`
  - L62 `filter/blur`: `<thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border sticky top-[49px] bg-card/80 backdrop-blur">`
  - L62 `backdrop-filter`: `<thead className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground border-b border-border sticky top-[49px] bg-card/80 backdrop-blur">`

### `src/routes/admin-product.$slug.details.tsx`
- **transform** ×6, **CSS/keyframe animation** ×6, **mask/clip** ×1, **large shadows/glows** ×1, **opacity/opacity animation** ×1
  - L118 `transform`: `<ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />`
  - L118 `CSS/keyframe animation`: `<ChevronDown className={`size-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />`
  - L165 `mask/clip`: `style={{ clipPath: "inset(0 50% 0 0)" }} />`
  - L199 `transform`: `className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-all active:scale-[0.98] ${`
  - L199 `CSS/keyframe animation`: `className={`rounded-lg border px-2 py-2 text-[11px] font-semibold transition-all active:scale-[0.98] ${`
  - L220 `transform`: `className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:text-foreground active:scale-95">`
  - L220 `CSS/keyframe animation`: `className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] font-medium text-muted-foreground transition-all hover:text-foreground active:scale-95">`
  - L307 `transform`: `<svg viewBox="0 0 36 36" className="size-full -rotate-90">`
  - L307 `large shadows/glows`: `<svg viewBox="0 0 36 36" className="size-full -rotate-90">`
  - L325 `transform`: `className={`inline-flex items-center gap-1.5 rounded-full px-3.5 py-1.5 text-xs font-semibold transition-all active:scale-[0.97] disabled:opacity-50 ${status === "published" ? "border border-white/15 text-muted-foregroun`
  - … 5 more compositor lines omitted

### `src/routes/admin-product.$slug.index.tsx`
- **transform** ×3, **CSS/keyframe animation** ×11, **opacity/opacity animation** ×1
  - L393 `transform`: `className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110 active:scale-[0.98] transition-all">`
  - L393 `CSS/keyframe animation`: `className="inline-flex items-center gap-1.5 rounded-full bg-accent px-3.5 py-2 text-xs font-semibold text-accent-foreground hover:brightness-110 active:scale-[0.98] transition-all">`
  - L447 `CSS/keyframe animation`: `<div className="h-full rounded-full bg-gradient-to-r from-accent to-amber-400 transition-all" style={{ width: `${score}%` }} />`
  - L493 `CSS/keyframe animation`: `className="group card-premium rounded-2xl p-4 hover:border-accent/40 transition-colors">`
  - L496 `CSS/keyframe animation`: `<ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />`
  - L511 `transform`: `<ChevronDown className={`size-4 text-muted-foreground transition-transform ${showAnalytics ? "rotate-180" : ""}`} />`
  - L511 `CSS/keyframe animation`: `<ChevronDown className={`size-4 text-muted-foreground transition-transform ${showAnalytics ? "rotate-180" : ""}`} />`
  - L548 `CSS/keyframe animation`: `className={`rounded-full px-2.5 py-1 text-[11px] font-medium transition-colors ${win === k ? "bg-accent text-accent-foreground" : "text-muted-foreground hover:text-foreground"}`}>`
  - L555 `CSS/keyframe animation`: `<div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>`
  - L581 `CSS/keyframe animation`: `<div className="grid place-items-center py-6"><Loader2 className="size-4 animate-spin text-accent" /></div>`
  - … 5 more compositor lines omitted

### `src/routes/admin-product.$slug.preview.tsx`
- **large shadows/glows** ×1
  - L34 `large shadows/glows`: `<div className={`${cardWidth} max-w-full rounded-2xl overflow-hidden border border-white/10 bg-card shadow-[var(--shadow-ember)]`}>`

### `src/routes/admin-products.tsx`
- **CSS/keyframe animation** ×15, **transform** ×1, **opacity/opacity animation** ×6, **filter/blur** ×1
  - L640 `CSS/keyframe animation`: `return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L661 `CSS/keyframe animation`: `className={`relative overflow-hidden glass border rounded-xl px-3 py-2.5 flex items-center gap-2.5 text-left transition-colors ${k.tab ? "hover:border-accent/40 cursor-pointer" : "cursor-default"} ${k.accent ? "border-am`
  - L676 `CSS/keyframe animation`: `<Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live`
  - L679 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L684 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${showFilters ? "border-accent/40 text-accent bg-accent/5" : "border-white/10 hov`
  - L717 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 rounded-xl border px-3 py-2 text-[10px] font-mono uppercase tracking-widest transition-colors ${view === "recycle" ? "border-accent/40 text-accent bg-accent/5" : "border-white`
  - L729 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest transition-colors ${on ? "border-accent/50 text-accent bg-accent/10" : "border-white/10 text-mu`
  - L773 `CSS/keyframe animation`: `className={`shrink-0 rounded-xl px-3.5 py-2 text-xs font-medium transition-colors ${on ? "bg-accent text-accent-foreground shadow" : "text-muted-foreground hover:bg-white/5"}`}>`
  - L861 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-widest disabled:opacity-40 hover:bg-white/5"`
  - L871 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-2 text-[10px] font-mono uppercase tracking-widest disabled:opacity-40 hover:bg-white/5"`
  - … 13 more compositor lines omitted

### `src/routes/admin-quality.tsx`
- **filter/blur** ×1, **backdrop-filter** ×1, **CSS/keyframe animation** ×1
  - L68 `filter/blur`: `<div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2 sticky top-0 bg-card/80 backdrop-blur z-10">`
  - L68 `backdrop-filter`: `<div className="px-5 py-3 border-b border-border flex flex-wrap items-center justify-between gap-2 sticky top-0 bg-card/80 backdrop-blur z-10">`
  - L80 `CSS/keyframe animation`: `<div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-region.tsx`
- **CSS/keyframe animation** ×3, **opacity/opacity animation** ×4
  - L218 `CSS/keyframe animation`: `className={`rounded-xl border px-3.5 py-2 text-[11px] font-mono uppercase tracking-widest transition-all ${`
  - L241 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin" />`
  - L276 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-xl border border-accent/40 bg-accent/10 px-3 py-1.5 text-xs text-accent hover:brightness-110 disabled:opacity-60"`
  - L283 `opacity/opacity animation`: `className="inline-flex items-center gap-1.5 rounded-xl border border-border px-3 py-1.5 text-xs hover:bg-white/5 disabled:opacity-60"`
  - L332 `opacity/opacity animation`: `className="rounded-lg border border-border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider hover:border-accent/40 disabled:opacity-40"`
  - L396 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin" />`
  - L419 `opacity/opacity animation`: `className="rounded-xl border border-border px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest hover:border-accent/40 disabled:opacity-50"`

### `src/routes/admin-reports.tsx`
- **opacity/opacity animation** ×1
  - L95 `opacity/opacity animation`: `<button onClick={() => run(r.id)} disabled={busy === r.id} className="mt-4 inline-flex items-center gap-2 bg-accent text-accent-foreground px-4 py-2 rounded-full text-xs uppercase tracking-widest font-bold disabled:opaci`

### `src/routes/admin-returns.tsx`
- **CSS/keyframe animation** ×2
  - L103 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[11px] font-mono uppercase tracking-widest transition-colors ${`
  - L120 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin text-muted-foreground" />`

### `src/routes/admin-search.tsx`
- **CSS/keyframe animation** ×1, **opacity/opacity animation** ×1
  - L46 `CSS/keyframe animation`: `{rows === null ? <Loader2 className="size-4 animate-spin text-muted-foreground" /> :`
  - L75 `opacity/opacity animation`: `{noResults.length === 0 && <li className="px-5 py-8 text-center text-xs text-muted-foreground"><Search className="size-4 mx-auto mb-2 opacity-30" /> No zero-result queries.</li>}`

### `src/routes/admin-security.tsx`
- **CSS/keyframe animation** ×3, **transform** ×1, **opacity/opacity animation** ×5
  - L117 `CSS/keyframe animation`: `<Loader2 className="size-6 animate-spin text-accent" />`
  - L133 `CSS/keyframe animation`: `<RefreshCw className={`size-3.5 ${refreshing ? "animate-spin" : ""}`} /> Scan`
  - L163 `CSS/keyframe animation`: `className={`text-left rounded-2xl border bg-card p-3 transition ${typeFilter === t ? "border-accent/50" : "border-border hover:border-accent/30"}`}`
  - L179 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L245 `opacity/opacity animation`: `<button disabled={busy === a.id} onClick={() => changeStatus(a, "reviewing")} className="inline-flex items-center gap-1 rounded-lg border border-amber-400/30 bg-amber-400/10 px-2.5 py-1 text-[11px] text-amber-300 hover:b`
  - L249 `opacity/opacity animation`: `<button disabled={busy === a.id} onClick={() => changeStatus(a, "resolved")} className="inline-flex items-center gap-1 rounded-lg border border-emerald-400/30 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300 ho`
  - L252 `opacity/opacity animation`: `<button disabled={busy === a.id} onClick={() => changeStatus(a, "dismissed")} className="inline-flex items-center gap-1 rounded-lg border border-border bg-white/5 px-2.5 py-1 text-[11px] text-muted-foreground hover:borde`
  - L258 `opacity/opacity animation`: `<button disabled={busy === a.subject_id} onClick={() => toggleLock(a.subject_id!, a.subject_label ?? a.subject_id!, a.fraud_type)} className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-[11px] disa`
  - L284 `opacity/opacity animation`: `<button disabled={busy === p.userId} onClick={() => toggleLock(p.userId, p.label, p.types[0])} className={`inline-flex items-center gap-1 rounded-lg border px-2 py-1 text-[11px] disabled:opacity-50 ${isLocked ? "border-e`

### `src/routes/admin-seed.tsx`
- **CSS/keyframe animation** ×5, **transform** ×1, **opacity/opacity animation** ×3
  - L121 `CSS/keyframe animation`: `className={`relative w-12 h-7 rounded-full transition-colors ${status?.includeInAnalytics ? "bg-accent" : "bg-muted"}`}`
  - L124 `transform`: `<span className={`absolute top-1 left-1 size-5 rounded-full bg-background transition-transform ${status?.includeInAnalytics ? "translate-x-5" : ""}`} />`
  - L124 `CSS/keyframe animation`: `<span className={`absolute top-1 left-1 size-5 rounded-full bg-background transition-transform ${status?.includeInAnalytics ? "translate-x-5" : ""}`} />`
  - L140 `opacity/opacity animation`: `className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-accent text-accent-foreground text-sm font-medium disabled:opacity-50">`
  - L141 `CSS/keyframe animation`: `{busy === "all" ? <Loader2 className="size-4 animate-spin" /> : <Sparkles className="size-4" />}`
  - L167 `opacity/opacity animation`: `className="ml-auto inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-border hover:bg-muted text-xs disabled:opacity-50">`
  - L168 `CSS/keyframe animation`: `{busy === g.kind ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}`
  - L188 `opacity/opacity animation`: `className="shrink-0 inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-destructive text-destructive-foreground text-sm font-medium disabled:opacity-50">`
  - L189 `CSS/keyframe animation`: `{busy === "remove" ? <Loader2 className="size-4 animate-spin" /> : <Trash2 className="size-4" />}`

### `src/routes/admin-seo-health.tsx`
- **transform** ×1, **large shadows/glows** ×1, **opacity/opacity animation** ×3, **CSS/keyframe animation** ×4
  - L80 `transform`: `<svg viewBox="0 0 36 36" className="size-16 -rotate-90">`
  - L80 `large shadows/glows`: `<svg viewBox="0 0 36 36" className="size-16 -rotate-90">`
  - L103 `opacity/opacity animation`: `className="inline-flex items-center gap-2 rounded-full bg-accent px-4 py-2.5 text-xs font-medium text-accent-foreground disabled:opacity-50"`
  - L105 `CSS/keyframe animation`: `{busy === "seo" ? <Loader2 className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5" />}`
  - L111 `opacity/opacity animation`: `className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-medium disabled:opacity-50"`
  - L113 `CSS/keyframe animation`: `{busy === "alt" ? <Loader2 className="size-3.5 animate-spin" /> : <ImageIcon className="size-3.5" />}`
  - L119 `opacity/opacity animation`: `className="inline-flex items-center gap-2 rounded-full border border-border px-4 py-2.5 text-xs font-medium disabled:opacity-50"`
  - L121 `CSS/keyframe animation`: `<RefreshCw className={`size-3.5 ${loading ? "animate-spin" : ""}`} /> Validate`
  - L127 `CSS/keyframe animation`: `<div className="p-8"><Loader2 className="size-4 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-seo-intelligence.tsx`
- **CSS/keyframe animation** ×3
  - L117 `CSS/keyframe animation`: `<RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Refresh`
  - L120 `CSS/keyframe animation`: `<RotateCcw className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`} /> Sync Search Console`
  - L125 `CSS/keyframe animation`: `<div className="flex items-center justify-center py-20 text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" /></div>`

### `src/routes/admin-serviceability.tsx`
- **CSS/keyframe animation** ×1
  - L128 `CSS/keyframe animation`: `<div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-shipments.tsx`
- **large shadows/glows** ×3, **CSS/keyframe animation** ×13, **transform** ×3, **filter/blur** ×2, **backdrop-filter** ×1, **opacity/opacity animation** ×8
  - L191 `large shadows/glows`: `<span className={`size-2 rounded-full shrink-0 transition-colors duration-300 ${done ? "bg-accent shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_60%,transparent)]" : "bg-border"}`} />`
  - L191 `CSS/keyframe animation`: `<span className={`size-2 rounded-full shrink-0 transition-colors duration-300 ${done ? "bg-accent shadow-[0_0_8px_color-mix(in_oklab,var(--accent)_60%,transparent)]" : "bg-border"}`} />`
  - L193 `CSS/keyframe animation`: `<span className={`h-px flex-1 transition-colors duration-300 ${!terminal && i < active ? "bg-accent" : "bg-border"}`} />`
  - L249 `transform`: `<Download className="size-3.5" /> Export <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />`
  - L249 `CSS/keyframe animation`: `<Download className="size-3.5" /> Export <ChevronDown className={`size-3 transition-transform ${open ? "rotate-180" : ""}`} />`
  - L252 `filter/blur`: `<div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-background/95 backdrop-blur-xl p-1.5 shadow-xl">`
  - L252 `backdrop-filter`: `<div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-background/95 backdrop-blur-xl p-1.5 shadow-xl">`
  - L252 `large shadows/glows`: `<div className="absolute right-0 z-30 mt-1.5 w-56 rounded-xl border border-border bg-background/95 backdrop-blur-xl p-1.5 shadow-xl">`
  - L292 `opacity/opacity animation`: `<span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${online ? "bg-emerald-400 animate-ping" : "bg-muted-foreground"}`} />`
  - L292 `CSS/keyframe animation`: `<span className={`absolute inline-flex h-full w-full rounded-full opacity-60 ${online ? "bg-emerald-400 animate-ping" : "bg-muted-foreground"}`} />`
  - … 20 more compositor lines omitted

### `src/routes/admin-support.tsx`
- **CSS/keyframe animation** ×12, **opacity/opacity animation** ×3, **transform** ×2, **filter/blur** ×1, **backdrop-filter** ×1, **large shadows/glows** ×1
  - L283 `CSS/keyframe animation`: `className={cn("inline-flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-xs font-semibold transition-colors",`
  - L291 `CSS/keyframe animation`: `<div className="grid place-items-center py-20"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L392 `CSS/keyframe animation`: `className={cn("rounded-full px-3 py-1.5 text-xs ring-1 transition",`
  - L414 `opacity/opacity animation`: `className="bg-accent text-accent-foreground rounded-full px-6 py-2.5 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 transition-all inline-flex items-center gap-2">`
  - L414 `CSS/keyframe animation`: `className="bg-accent text-accent-foreground rounded-full px-6 py-2.5 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 transition-all inline-flex items-center gap-2">`
  - L415 `CSS/keyframe animation`: `{saving ? <><Loader2 className="size-4 animate-spin" /> Saving…</> : "Save settings"}`
  - L514 `CSS/keyframe animation`: `const pill = (active: boolean) => cn("rounded-full border px-3 py-1.5 text-xs font-medium transition-colors",`
  - L520 `transform`: `<Search className="absolute left-3 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L523 `transform`: `{q && <button onClick={() => setQ("")} className="absolute right-3 top-1/2 -translate-y-1/2"><X className="size-4 text-muted-foreground" /></button>}`
  - L528 `opacity/opacity animation`: `{f === "all" ? "All" : f === "overdue" ? "Overdue" : STAGE_LABEL[f as TicketStage]} <span className="opacity-60 tabular-nums">{stageCount(f)}</span>`
  - … 10 more compositor lines omitted

### `src/routes/admin-system-health.tsx`
- **CSS/keyframe animation** ×2
  - L98 `CSS/keyframe animation`: `<RefreshCw className={`h-4 w-4 ${isFetching ? "animate-spin" : ""}`} />`
  - L104 `CSS/keyframe animation`: `<Loader2 className="h-5 w-5 animate-spin mr-2" /> Loading system health…`

### `src/routes/admin-traffic.tsx`
- **CSS/keyframe animation** ×4, **transform** ×1, **large shadows/glows** ×1
  - L51 `CSS/keyframe animation`: `className="px-2 py-0.5 text-[10px] font-mono uppercase tracking-widest rounded-full border border-border hover:border-accent/50 hover:text-accent transition-colors"`
  - L65 `transform`: `<svg viewBox="0 0 36 36" className="size-20 -rotate-90">`
  - L65 `large shadows/glows`: `<svg viewBox="0 0 36 36" className="size-20 -rotate-90">`
  - L89 `CSS/keyframe animation`: `<span className="size-1.5 rounded-full bg-accent animate-pulse" /> Live · {data?.live.active ?? 0}`
  - L90 `CSS/keyframe animation`: `{refreshing && <Loader2 className="size-3 animate-spin" />}`
  - L101 `CSS/keyframe animation`: `<div className="flex items-center justify-center py-32"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>`

### `src/routes/admin-users.tsx`
- **CSS/keyframe animation** ×6, **transform** ×2, **large shadows/glows** ×1, **filter/blur** ×1, **backdrop-filter** ×1
  - L41 `CSS/keyframe animation`: `return <span className={`inline-block size-2 rounded-full ${map[status]} ${status === "online" ? "animate-pulse" : ""}`} />;`
  - L82 `transform`: `th{background:#f4f4f5;text-transform:uppercase;font-size:9px;letter-spacing:.05em}`
  - L111 `CSS/keyframe animation`: `<button onClick={() => setOpen((o) => !o)} className="inline-flex items-center gap-1.5 text-xs px-3 py-1.5 rounded-lg border border-border hover:border-accent/40 transition-colors">`
  - L115 `large shadows/glows`: `<div className="absolute right-0 mt-1 z-20 w-32 rounded-lg border border-border bg-popover shadow-lg overflow-hidden">`
  - L129 `CSS/keyframe animation`: `<button onClick={onClick} className="w-full flex items-center gap-3 p-3 rounded-xl hover:bg-muted/40 transition-colors text-left">`
  - L168 `filter/blur`: `<div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />`
  - L168 `backdrop-filter`: `<div className="absolute inset-0 bg-background/70 backdrop-blur-sm" onClick={onClose} />`
  - L262 `transform`: `<Search className="absolute left-2.5 top-1/2 -translate-y-1/2 size-3.5 text-muted-foreground" />`
  - L290 `CSS/keyframe animation`: `<div className="min-h-[50vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>`
  - L312 `CSS/keyframe animation`: `{refreshing && <Loader2 className="size-3.5 animate-spin text-accent" />}`
  - … 1 more compositor lines omitted

### `src/routes/admin-vendors.tsx`
- **CSS/keyframe animation** ×7, **opacity/opacity animation** ×3
  - L65 `CSS/keyframe animation`: `return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;`
  - L80 `CSS/keyframe animation`: `<motion.div`
  - L81 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}`
  - L82 `CSS/keyframe animation`: `transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}`
  - L105 `opacity/opacity animation`: `className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${enabled ? "bg-white/5 border border-white/10 hover:bg-white/10 text-foreground" : "bg-accent`
  - L105 `CSS/keyframe animation`: `className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-xs font-semibold transition-colors disabled:opacity-50 ${enabled ? "bg-white/5 border border-white/10 hover:bg-white/10 text-foreground" : "bg-accent`
  - L107 `CSS/keyframe animation`: `{busy ? <Loader2 className="size-4 animate-spin" /> : <Power className="size-4" />}`
  - L110 `CSS/keyframe animation`: `</motion.div>`
  - L132 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs transition-colors ${tab === t.id ? "bg-accent text-accent-foreground font-semibold" : "text-muted-foreground hover:text-foreground"}`}>`
  - L134 `opacity/opacity animation`: `<span className="text-[10px] opacity-70">{t.count}</span>`

### `src/routes/admin.tsx`
- **CSS/keyframe animation** ×34, **transform** ×1, **opacity/opacity animation** ×17, **filter/blur** ×7, **large shadows/glows** ×4, **mask/clip** ×1, **backdrop-filter** ×2
  - L188 `CSS/keyframe animation`: `return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;`
  - L228 `transform`: `<div className="orb absolute -top-32 left-1/2 -translate-x-1/2 size-[40rem] opacity-40" style={{ background: "var(--gradient-ember)" }} />`
  - L228 `opacity/opacity animation`: `<div className="orb absolute -top-32 left-1/2 -translate-x-1/2 size-[40rem] opacity-40" style={{ background: "var(--gradient-ember)" }} />`
  - L229 `opacity/opacity animation`: `<div className="orb absolute top-1/3 -right-40 size-[30rem] opacity-25" style={{ background: "radial-gradient(circle, oklch(0.55 0.18 280 / 0.5), transparent 70%)" }} />`
  - L230 `opacity/opacity animation`: `<div className="orb absolute bottom-0 -left-40 size-[34rem] opacity-25" style={{ background: "var(--gradient-ember-soft)" }} />`
  - L231 `opacity/opacity animation`: `<div className="absolute inset-0 opacity-[0.5]" style={{ background: "radial-gradient(ellipse at 50% 0%, transparent 40%, oklch(0.1 0.01 260 / 0.6) 100%)" }} />`
  - L234 `CSS/keyframe animation`: `<motion.div`
  - L235 `filter/blur`: `initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}`
  - L235 `opacity/opacity animation`: `initial={{ opacity: 0, y: 18, filter: "blur(8px)" }}`
  - L236 `filter/blur`: `animate={{ opacity: 1, y: 0, filter: "blur(0px)" }}`
  - … 56 more compositor lines omitted

### `src/routes/auth.callback.tsx`
- **transform** ×1, **opacity/opacity animation** ×3, **filter/blur** ×1, **CSS/keyframe animation** ×11, **large shadows/glows** ×3
  - L99 `transform`: `className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[600px] h-[50vh] rounded-full opacity-25"`
  - L99 `opacity/opacity animation`: `className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[600px] h-[50vh] rounded-full opacity-25"`
  - L102 `filter/blur`: `filter: "blur(110px)",`
  - L107 `CSS/keyframe animation`: `<motion.div`
  - L108 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L109 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L110 `CSS/keyframe animation`: `transition={{ duration: 0.5 }}`
  - L114 `large shadows/glows`: `<div className="size-20 rounded-2xl overflow-hidden ring-1 ring-white/10 shadow-[0_20px_60px_-12px_rgba(255,122,0,0.4)] bg-white/[0.04] grid place-items-center">`
  - L118 `CSS/keyframe animation`: `<motion.span`
  - L123 `CSS/keyframe animation`: `transition={{ duration: 1.2, repeat: Infinity, ease: "linear" }}`
  - … 9 more compositor lines omitted

### `src/routes/auth.tsx`
- **CSS/keyframe animation** ×52, **opacity/opacity animation** ×25, **transform** ×5, **filter/blur** ×7, **mix-blend-mode** ×1, **large shadows/glows** ×8, **backdrop-filter** ×4
  - L197 `CSS/keyframe animation`: `<motion.div`
  - L198 `opacity/opacity animation`: `initial={{ opacity: 0 }}`
  - L199 `opacity/opacity animation`: `animate={{ opacity: 0.22 }}`
  - L200 `CSS/keyframe animation`: `transition={{ duration: 1.4, ease }}`
  - L201 `transform`: `className="absolute top-[6%] left-1/2 -translate-x-1/2 w-[95vw] max-w-[720px] h-[58vh] rounded-full"`
  - L204 `filter/blur`: `filter: "blur(120px)",`
  - L208 `opacity/opacity animation`: `className="absolute bottom-[2%] right-[-10%] w-[55vw] max-w-[480px] h-[40vh] rounded-full opacity-[0.14]"`
  - L211 `filter/blur`: `filter: "blur(90px)",`
  - L216 `mix-blend-mode`: `className="absolute inset-0 opacity-[0.025] mix-blend-overlay"`
  - L216 `opacity/opacity animation`: `className="absolute inset-0 opacity-[0.025] mix-blend-overlay"`
  - … 92 more compositor lines omitted

### `src/routes/blog.$slug.tsx`
- **CSS/keyframe animation** ×1
  - L90 `CSS/keyframe animation`: `if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;`

### `src/routes/blog.tsx`
- **CSS/keyframe animation** ×3, **transform** ×1
  - L46 `CSS/keyframe animation`: `<div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`
  - L55 `transform`: `<img src={p.cover_image} alt={`${p.title} — article cover`} className="size-full object-cover group-hover:scale-105 transition-transform duration-700" />`
  - L55 `CSS/keyframe animation`: `<img src={p.cover_image} alt={`${p.title} — article cover`} className="size-full object-cover group-hover:scale-105 transition-transform duration-700" />`
  - L61 `CSS/keyframe animation`: `<h2 className="text-2xl font-display font-semibold mb-2 group-hover:text-accent transition-colors">{p.title}</h2>`

### `src/routes/cart.tsx`
- **CSS/keyframe animation** ×26, **opacity/opacity animation** ×9, **transform** ×5, **large shadows/glows** ×3, **filter/blur** ×2, **backdrop-filter** ×1
  - L91 `CSS/keyframe animation`: `<motion.div`
  - L92 `opacity/opacity animation`: `initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}`
  - L97 `CSS/keyframe animation`: `</motion.div>`
  - L100 `CSS/keyframe animation`: `<Link to="/" className="inline-flex items-center gap-2 px-6 py-3 rounded-full bg-accent text-accent-foreground text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">`
  - L118 `CSS/keyframe animation`: `<div className="mb-8 h-9 w-44 animate-pulse rounded-lg bg-white/10" />`
  - L121 `CSS/keyframe animation`: `<div key={i} className="h-24 animate-pulse rounded-2xl bg-white/[0.06]" />`
  - L149 `CSS/keyframe animation`: `<motion.div`
  - L150 `opacity/opacity animation`: `initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}`
  - L157 `CSS/keyframe animation`: `</motion.div>`
  - L179 `CSS/keyframe animation`: `<motion.div`
  - … 36 more compositor lines omitted

### `src/routes/categories.tsx`
- **CSS/keyframe animation** ×5, **transform** ×2, **filter/blur** ×1, **backdrop-filter** ×1
  - L74 `CSS/keyframe animation`: `className="group flex flex-col overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] transition-colors hover:border-accent/40"`
  - L84 `transform`: `className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"`
  - L84 `CSS/keyframe animation`: `className="size-full object-cover [transition:transform_700ms_cubic-bezier(0.16,1,0.3,1)] group-hover:scale-105"`
  - L98 `CSS/keyframe animation`: `<h2 className="line-clamp-1 text-base font-display font-semibold tracking-tight text-white transition-colors group-hover:text-accent sm:text-lg">`
  - L120 `filter/blur`: `<span className="mt-auto inline-flex h-8 w-fit items-center gap-1 rounded-full border border-accent/40 bg-white/[0.04] px-3.5 text-[13px] font-semibold text-accent backdrop-blur-sm transition-colors group-hover:border-ac`
  - L120 `backdrop-filter`: `<span className="mt-auto inline-flex h-8 w-fit items-center gap-1 rounded-full border border-accent/40 bg-white/[0.04] px-3.5 text-[13px] font-semibold text-accent backdrop-blur-sm transition-colors group-hover:border-ac`
  - L120 `CSS/keyframe animation`: `<span className="mt-auto inline-flex h-8 w-fit items-center gap-1 rounded-full border border-accent/40 bg-white/[0.04] px-3.5 text-[13px] font-semibold text-accent backdrop-blur-sm transition-colors group-hover:border-ac`
  - L122 `transform`: `<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />`
  - L122 `CSS/keyframe animation`: `<ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />`

### `src/routes/category.$main.$sub.tsx`
- **filter/blur** ×1, **opacity/opacity animation** ×2, **CSS/keyframe animation** ×1
  - L88 `filter/blur`: `<div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />`
  - L88 `opacity/opacity animation`: `<div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />`
  - L90 `opacity/opacity animation`: `<img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />`
  - L101 `CSS/keyframe animation`: `<div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`

### `src/routes/category.$slug.tsx`
- **filter/blur** ×3, **opacity/opacity animation** ×2, **backdrop-filter** ×2, **CSS/keyframe animation** ×4, **large shadows/glows** ×1
  - L113 `filter/blur`: `<div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />`
  - L113 `opacity/opacity animation`: `<div aria-hidden className="absolute -right-16 -top-16 size-64 rounded-full blur-3xl opacity-40" style={{ background: "var(--gradient-ember)" }} />`
  - L115 `opacity/opacity animation`: `<img src={cat.banner_image} alt="" loading="lazy" className="absolute inset-0 size-full object-cover opacity-25" />`
  - L121 `filter/blur`: `<span className="rounded-full border border-accent/30 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">`
  - L121 `backdrop-filter`: `<span className="rounded-full border border-accent/30 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">`
  - L125 `filter/blur`: `<span className="rounded-full border border-accent/30 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">`
  - L125 `backdrop-filter`: `<span className="rounded-full border border-accent/30 bg-background/40 px-3 py-1 text-xs text-muted-foreground backdrop-blur">`
  - L134 `CSS/keyframe animation`: `<div className="py-24 grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>`
  - L147 `large shadows/glows`: `className="group product-card-glass relative flex flex-col overflow-hidden rounded-3xl p-0 transition-[box-shadow,border-color] duration-300 hover:shadow-[0_18px_50px_-12px_color-mix(in_oklab,var(--accent)_55%,transparen`
  - L147 `CSS/keyframe animation`: `className="group product-card-glass relative flex flex-col overflow-hidden rounded-3xl p-0 transition-[box-shadow,border-color] duration-300 hover:shadow-[0_18px_50px_-12px_color-mix(in_oklab,var(--accent)_55%,transparen`
  - … 2 more compositor lines omitted

### `src/routes/checkout.tsx`
- **filter/blur** ×3, **CSS/keyframe animation** ×35, **opacity/opacity animation** ×10, **transform** ×6, **large shadows/glows** ×3, **backdrop-filter** ×2
  - L510 `filter/blur`: `metadata: { currency: created.currency, region: created.debug?.market ?? null, filter: "none" },`
  - L695 `CSS/keyframe animation`: `// Funnel analytics — fire once per meaningful transition.`
  - L724 `CSS/keyframe animation`: `return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;`
  - L777 `CSS/keyframe animation`: `<Loader2 className="size-3 text-accent shrink-0 animate-spin" />`
  - L812 `CSS/keyframe animation`: `<motion.div`
  - L813 `opacity/opacity animation`: `initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}`
  - L820 `CSS/keyframe animation`: `</motion.div>`
  - L830 `transform`: `className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5 transition-colors active:scale-95">`
  - L830 `CSS/keyframe animation`: `className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5 transition-colors active:scale-95">`
  - L838 `CSS/keyframe animation`: `<div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />`
  - … 49 more compositor lines omitted

### `src/routes/compare.tsx`
- **CSS/keyframe animation** ×4, **opacity/opacity animation** ×1
  - L40 `CSS/keyframe animation`: `<button onClick={clear} className="text-xs uppercase tracking-widest font-mono text-muted-foreground hover:text-accent transition-colors">`
  - L55 `CSS/keyframe animation`: `<Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground px-5 py-2.5 rounded-full text-xs uppercase tracking-widest font-bold hover:brightness-110 transition-all">`
  - L71 `CSS/keyframe animation`: `className="absolute top-2 right-2 size-7 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-accent transition-colors"`
  - L158 `opacity/opacity animation`: `className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opaci`
  - L158 `CSS/keyframe animation`: `className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground px-4 py-2.5 rounded-full text-[11px] font-bold uppercase tracking-widest hover:brightness-110 transition-all disabled:opaci`

### `src/routes/contact.tsx`
- **CSS/keyframe animation** ×1
  - L49 `CSS/keyframe animation`: `className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:text-accent transition-colors"`

### `src/routes/continue-shopping.tsx`
- **CSS/keyframe animation** ×13, **filter/blur** ×2, **backdrop-filter** ×2, **large shadows/glows** ×4, **opacity/opacity animation** ×5
  - L88 `CSS/keyframe animation`: `className="w-full h-full object-cover transition-opacity duration-500"`
  - L90 `filter/blur`: `<span className={`product-typography absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${meta.tone}`}>`
  - L90 `backdrop-filter`: `<span className={`product-typography absolute left-2 top-2 inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-medium backdrop-blur ${meta.tone}`}>`
  - L94 `filter/blur`: `<span className="product-typography absolute right-2 top-2 inline-flex items-center rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">`
  - L94 `backdrop-filter`: `<span className="product-typography absolute right-2 top-2 inline-flex items-center rounded-full bg-background/85 backdrop-blur px-2 py-0.5 text-[10px] font-semibold text-muted-foreground">`
  - L99 `CSS/keyframe animation`: `<h3 data-product-text className="product-typography product-title-text text-xs sm:text-sm font-medium line-clamp-1 group-hover:text-accent transition-colors">{product.name}</h3>`
  - L119 `large shadows/glows`: `className="mt-3 inline-flex h-11 sm:h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 sm:px-5 text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-accent-`
  - L119 `CSS/keyframe animation`: `className="mt-3 inline-flex h-11 sm:h-12 w-full shrink-0 items-center justify-center gap-2 whitespace-nowrap rounded-full bg-accent px-4 sm:px-5 text-[11px] sm:text-xs font-semibold uppercase tracking-widest text-accent-`
  - L259 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>`
  - L259 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}>`
  - … 16 more compositor lines omitted

### `src/routes/deals.tsx`
- **opacity/opacity animation** ×10, **CSS/keyframe animation** ×30, **mix-blend-mode** ×1, **filter/blur** ×4, **large shadows/glows** ×7, **transform** ×6, **backdrop-filter** ×1
  - L37 `opacity/opacity animation`: `initial: { opacity: 0, y: 14 },`
  - L38 `opacity/opacity animation`: `animate: { opacity: 1, y: 0 },`
  - L39 `CSS/keyframe animation`: `transition: { duration: 0.5, ease },`
  - L106 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L115 `CSS/keyframe animation`: `<div className="orb animate-orb -top-[10%] left-[10%] size-[60vw] max-w-[520px]" style={{ background: "var(--gradient-ember)" }} />`
  - L116 `CSS/keyframe animation`: `<div className="orb animate-orb [animation-delay:-8s] top-[30%] right-[5%] size-[50vw] max-w-[440px]" style={{ background: "var(--gradient-violet)" }} />`
  - L119 `mix-blend-mode`: `className="absolute inset-0 opacity-[0.03] mix-blend-overlay"`
  - L119 `opacity/opacity animation`: `className="absolute inset-0 opacity-[0.03] mix-blend-overlay"`
  - L126 `CSS/keyframe animation`: `<motion.header`
  - L132 `filter/blur`: `<div className="absolute -top-32 -right-16 size-[440px] rounded-full opacity-60 animate-glow" style={{ background: "var(--gradient-ember)", filter: "blur(90px)" }} />`
  - … 49 more compositor lines omitted

### `src/routes/help.seller-assistance.tsx`
- **CSS/keyframe animation** ×68, **opacity/opacity animation** ×33, **filter/blur** ×17, **backdrop-filter** ×10, **large shadows/glows** ×8, **transform** ×5
  - L95 `CSS/keyframe animation`: `<motion.div`
  - L96 `opacity/opacity animation`: `initial={{ opacity: 0.5 }}`
  - L97 `opacity/opacity animation`: `animate={{ opacity: [0.5, 0.75, 0.5] }}`
  - L98 `CSS/keyframe animation`: `transition={{ duration: 8, repeat: Infinity, ease: "easeInOut" }}`
  - L99 `filter/blur`: `className="absolute -top-32 -left-24 size-[520px] rounded-full blur-[160px]"`
  - L102 `CSS/keyframe animation`: `<motion.div`
  - L103 `opacity/opacity animation`: `initial={{ opacity: 0.4 }}`
  - L104 `opacity/opacity animation`: `animate={{ opacity: [0.4, 0.6, 0.4] }}`
  - L105 `CSS/keyframe animation`: `transition={{ duration: 10, repeat: Infinity, ease: "easeInOut", delay: 1 }}`
  - L106 `filter/blur`: `className="absolute top-1/3 -right-32 size-[460px] rounded-full blur-[160px]"`
  - … 131 more compositor lines omitted

### `src/routes/help.tsx`
- **transform** ×12, **filter/blur** ×23, **opacity/opacity animation** ×30, **CSS/keyframe animation** ×80, **backdrop-filter** ×15, **large shadows/glows** ×10
  - L133 `transform`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-40"`
  - L133 `filter/blur`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-40"`
  - L133 `opacity/opacity animation`: `<div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-40"`
  - L135 `filter/blur`: `<div className="absolute top-1/3 -left-20 size-[420px] rounded-full blur-3xl opacity-30"`
  - L135 `opacity/opacity animation`: `<div className="absolute top-1/3 -left-20 size-[420px] rounded-full blur-3xl opacity-30"`
  - L137 `opacity/opacity animation`: `<div className="absolute inset-0 opacity-[0.04]"`
  - L140 `CSS/keyframe animation`: `<motion.span key={i}`
  - L143 `opacity/opacity animation`: `animate={{ y: [0, -20, 0], opacity: [0.2, 0.8, 0.2] }}`
  - L144 `CSS/keyframe animation`: `transition={{ duration: 6 + (i % 5), repeat: Infinity, delay: i * 0.3 }}`
  - L159 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}`
  - … 160 more compositor lines omitted

### `src/routes/index.tsx`
- **large shadows/glows** ×9, **transform** ×12, **CSS/keyframe animation** ×24, **filter/blur** ×4, **backdrop-filter** ×3, **opacity/opacity animation** ×5, **contain/content-visibility** ×1
  - L102 `large shadows/glows`: `/* Cinematic ambient divider — layered glow between sections */`
  - L116 `transform`: `className="mt-4 flex items-center justify-center gap-2 w-full rounded-2xl glass-strong border-2 border-accent py-3.5 text-[11px] font-mono font-semibold uppercase tracking-[0.25em] text-accent hover:bg-accent/10 active:s`
  - L116 `CSS/keyframe animation`: `className="mt-4 flex items-center justify-center gap-2 w-full rounded-2xl glass-strong border-2 border-accent py-3.5 text-[11px] font-mono font-semibold uppercase tracking-[0.25em] text-accent hover:bg-accent/10 active:s`
  - L286 `CSS/keyframe animation`: `className="grid size-7 shrink-0 place-items-center rounded-full border border-accent/30 bg-accent/10 text-accent transition-colors hover:bg-accent/20"`
  - L294 `CSS/keyframe animation`: `<Link to={href} className="hidden sm:inline-block text-xs font-mono uppercase tracking-widest text-accent border-b border-accent pb-1 hover:text-foreground hover:border-foreground transition-colors">`
  - L301 `filter/blur`: `<div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />`
  - L301 `backdrop-filter`: `<div className="absolute inset-0 bg-background/70 backdrop-blur-sm" />`
  - L304 `filter/blur`: `className="relative z-10 w-full max-w-sm rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"`
  - L304 `backdrop-filter`: `className="relative z-10 w-full max-w-sm rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"`
  - L304 `large shadows/glows`: `className="relative z-10 w-full max-w-sm rounded-3xl border border-accent/25 bg-background/95 p-5 backdrop-blur-2xl shadow-[0_30px_80px_-20px_oklch(0.74_0.19_49/0.5)]"`
  - … 48 more compositor lines omitted

### `src/routes/orders.$id.tsx`
- **CSS/keyframe animation** ×19, **opacity/opacity animation** ×10
  - L87 `CSS/keyframe animation`: `<Loader2 className="size-5 animate-spin text-muted-foreground" />`
  - L143 `CSS/keyframe animation`: `<motion.div`
  - L144 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L145 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L146 `CSS/keyframe animation`: `transition={{ duration: 0.4 }}`
  - L152 `CSS/keyframe animation`: `</motion.div>`
  - L154 `CSS/keyframe animation`: `<motion.div`
  - L155 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L156 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L157 `CSS/keyframe animation`: `transition={{ duration: 0.4, delay: 0.05 }}`
  - … 19 more compositor lines omitted

### `src/routes/pages.$slug.tsx`
- **CSS/keyframe animation** ×1
  - L53 `CSS/keyframe animation`: `if (loading) return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;`

### `src/routes/pages.shipping.tsx`
- **transform** ×1, **filter/blur** ×5, **opacity/opacity animation** ×17, **backdrop-filter** ×3, **CSS/keyframe animation** ×25, **large shadows/glows** ×1
  - L101 `transform`: `className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-30"`
  - L101 `filter/blur`: `className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-30"`
  - L101 `opacity/opacity animation`: `className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-30"`
  - L108 `filter/blur`: `className="absolute top-1/3 -right-20 size-[420px] rounded-full blur-3xl opacity-20"`
  - L108 `opacity/opacity animation`: `className="absolute top-1/3 -right-20 size-[420px] rounded-full blur-3xl opacity-20"`
  - L115 `opacity/opacity animation`: `className="absolute inset-0 opacity-[0.04]"`
  - L128 `filter/blur`: `<span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">`
  - L128 `backdrop-filter`: `<span className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">`
  - L145 `CSS/keyframe animation`: `<motion.div`
  - L146 `opacity/opacity animation`: `initial={{ opacity: 0, y: 14 }}`
  - … 42 more compositor lines omitted

### `src/routes/products.$slug.tsx`
- **filter/blur** ×12, **opacity/opacity animation** ×26, **CSS/keyframe animation** ×61, **transform** ×10, **large shadows/glows** ×9, **backdrop-filter** ×8
  - L384 `filter/blur`: `<div className="absolute -top-32 -left-24 size-[36rem] rounded-full opacity-50 animate-orb" style={{ background: "var(--gradient-ember-soft)", filter: "blur(110px)" }} />`
  - L384 `opacity/opacity animation`: `<div className="absolute -top-32 -left-24 size-[36rem] rounded-full opacity-50 animate-orb" style={{ background: "var(--gradient-ember-soft)", filter: "blur(110px)" }} />`
  - L384 `CSS/keyframe animation`: `<div className="absolute -top-32 -left-24 size-[36rem] rounded-full opacity-50 animate-orb" style={{ background: "var(--gradient-ember-soft)", filter: "blur(110px)" }} />`
  - L385 `filter/blur`: `<div className="absolute top-1/3 -right-32 size-[34rem] rounded-full opacity-40 animate-orb" style={{ background: "var(--gradient-violet)", filter: "blur(120px)", animationDelay: "-8s" }} />`
  - L385 `opacity/opacity animation`: `<div className="absolute top-1/3 -right-32 size-[34rem] rounded-full opacity-40 animate-orb" style={{ background: "var(--gradient-violet)", filter: "blur(120px)", animationDelay: "-8s" }} />`
  - L385 `CSS/keyframe animation`: `<div className="absolute top-1/3 -right-32 size-[34rem] rounded-full opacity-40 animate-orb" style={{ background: "var(--gradient-violet)", filter: "blur(120px)", animationDelay: "-8s" }} />`
  - L418 `CSS/keyframe animation`: `<motion.div`
  - L419 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L420 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L421 `CSS/keyframe animation`: `transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}`
  - … 116 more compositor lines omitted

### `src/routes/recently-viewed.tsx`
- **CSS/keyframe animation** ×18, **opacity/opacity animation** ×8, **transform** ×1, **large shadows/glows** ×1
  - L35 `CSS/keyframe animation`: `<div className="h-8 w-56 rounded bg-white/[0.05] animate-pulse mb-8" />`
  - L44 `CSS/keyframe animation`: `<motion.div`
  - L45 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L46 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L47 `CSS/keyframe animation`: `transition={{ duration: 0.5 }}`
  - L63 `transform`: `className="shrink-0 inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 hover:text-accent active:scale-95 transition`
  - L63 `CSS/keyframe animation`: `className="shrink-0 inline-flex items-center gap-2 rounded-full border border-border bg-card px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:border-accent/40 hover:text-accent active:scale-95 transition`
  - L69 `CSS/keyframe animation`: `</motion.div>`
  - L73 `CSS/keyframe animation`: `<motion.div`
  - L74 `opacity/opacity animation`: `initial={{ opacity: 0, y: 16 }}`
  - … 18 more compositor lines omitted

### `src/routes/reset-password.tsx`
- **transform** ×1, **opacity/opacity animation** ×4, **filter/blur** ×2, **CSS/keyframe animation** ×5, **backdrop-filter** ×1
  - L60 `transform`: `<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[600px] h-[50vh] rounded-full opacity-25"`
  - L60 `opacity/opacity animation`: `<div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[80vw] max-w-[600px] h-[50vh] rounded-full opacity-25"`
  - L61 `filter/blur`: `style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)", filter: "blur(110px)" }} />`
  - L64 `CSS/keyframe animation`: `<motion.div`
  - L65 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }}`
  - L66 `opacity/opacity animation`: `animate={{ opacity: 1, y: 0 }}`
  - L67 `CSS/keyframe animation`: `transition={{ duration: 0.5, ease }}`
  - L68 `filter/blur`: `className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 backdrop-blur-xl"`
  - L68 `backdrop-filter`: `className="w-full max-w-sm rounded-3xl border border-white/10 bg-white/[0.04] p-6 sm:p-8 backdrop-blur-xl"`
  - L78 `CSS/keyframe animation`: `<Loader2 className="size-4 animate-spin" /> Verifying your reset link…`
  - … 3 more compositor lines omitted

### `src/routes/returns.tsx`
- **opacity/opacity animation** ×16, **CSS/keyframe animation** ×50, **filter/blur** ×11, **backdrop-filter** ×8, **large shadows/glows** ×5, **transform** ×11
  - L129 `opacity/opacity animation`: `<div className="absolute inset-0 opacity-[0.035]" style={{`
  - L140 `opacity/opacity animation`: `<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>`
  - L140 `CSS/keyframe animation`: `<motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.55 }}>`
  - L152 `CSS/keyframe animation`: `</motion.div>`
  - L155 `CSS/keyframe animation`: `<motion.div`
  - L156 `opacity/opacity animation`: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}`
  - L156 `CSS/keyframe animation`: `initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}`
  - L160 `filter/blur`: `<div key={label} className="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 ring-1 ring-white/10 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.03)" }}>`
  - L160 `backdrop-filter`: `<div key={label} className="shrink-0 flex items-center gap-2 rounded-full px-3 py-2 ring-1 ring-white/10 backdrop-blur-md" style={{ background: "rgba(255,255,255,0.03)" }}>`
  - L165 `CSS/keyframe animation`: `</motion.div>`
  - … 91 more compositor lines omitted

### `src/routes/search.tsx`
- **CSS/keyframe animation** ×13, **filter/blur** ×1, **backdrop-filter** ×1, **transform** ×4, **opacity/opacity animation** ×2, **large shadows/glows** ×2
  - L119 `CSS/keyframe animation`: `className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${!value.cat ? "border-accent bg-accent/15 text-accent" : "border-border text-foreground hover:border-accent/60"}`}`
  - L127 `CSS/keyframe animation`: `className={`rounded-full border px-3 py-1.5 text-xs transition-colors ${value.cat === c.slug ? "border-accent bg-accent/15 text-accent" : "border-border text-foreground hover:border-accent/60"}`}`
  - L161 `CSS/keyframe animation`: `className={`inline-flex items-center gap-1 rounded-full border px-3 py-1.5 text-xs transition-colors ${value.rating === r ? "border-accent bg-accent/15 text-accent" : "border-border text-foreground hover:border-accent/60`
  - L358 `filter/blur`: `className={`fixed inset-x-0 top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl transition-all duration-300 ${`
  - L358 `backdrop-filter`: `className={`fixed inset-x-0 top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl transition-all duration-300 ${`
  - L358 `CSS/keyframe animation`: `className={`fixed inset-x-0 top-0 z-40 border-b border-border bg-background/90 backdrop-blur-xl transition-all duration-300 ${`
  - L359 `transform`: `scrolled ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"`
  - L359 `opacity/opacity animation`: `scrolled ? "translate-y-0 opacity-100" : "-translate-y-full opacity-0 pointer-events-none"`
  - L367 `transform`: `<Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />`
  - L372 `CSS/keyframe animation`: `className="w-full bg-card border border-border rounded-full pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-accent/40 focus:border-accent transition-all"`
  - … 13 more compositor lines omitted

### `src/routes/track.tsx`
- **transform** ×4, **filter/blur** ×3, **opacity/opacity animation** ×18, **CSS/keyframe animation** ×48, **large shadows/glows** ×3
  - L230 `transform`: `<div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-3xl opacity-30"`
  - L230 `filter/blur`: `<div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-3xl opacity-30"`
  - L230 `opacity/opacity animation`: `<div className="absolute -top-32 left-1/2 -translate-x-1/2 w-[680px] h-[680px] rounded-full blur-3xl opacity-30"`
  - L232 `filter/blur`: `<div className="absolute top-1/3 -right-40 w-[420px] h-[420px] rounded-full blur-3xl opacity-20"`
  - L232 `opacity/opacity animation`: `<div className="absolute top-1/3 -right-40 w-[420px] h-[420px] rounded-full blur-3xl opacity-20"`
  - L238 `CSS/keyframe animation`: `<motion.div`
  - L239 `opacity/opacity animation`: `initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }}`
  - L240 `CSS/keyframe animation`: `transition={{ duration: 0.5 }}`
  - L245 `opacity/opacity animation`: `<span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />`
  - L245 `CSS/keyframe animation`: `<span className="absolute inset-0 rounded-full bg-accent animate-ping opacity-75" />`
  - … 66 more compositor lines omitted

### `src/routes/unsubscribe.tsx`
- **large shadows/glows** ×1, **opacity/opacity animation** ×1, **CSS/keyframe animation** ×1
  - L76 `large shadows/glows`: `<div className="w-full max-w-md rounded-3xl border border-border bg-card p-8 shadow-2xl">`
  - L94 `opacity/opacity animation`: `className="mt-6 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"`
  - L94 `CSS/keyframe animation`: `className="mt-6 w-full rounded-xl bg-primary px-5 py-3 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"`

### `src/routes/wishlist.tsx`
- **CSS/keyframe animation** ×28, **opacity/opacity animation** ×5, **transform** ×11, **large shadows/glows** ×8, **filter/blur** ×6, **backdrop-filter** ×2
  - L321 `CSS/keyframe animation`: `<div className="h-8 w-48 rounded bg-white/[0.05] animate-pulse mb-8" />`
  - L350 `opacity/opacity animation`: `<span className="text-[11px] uppercase tracking-widest font-mono opacity-80">`
  - L363 `transform`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[11px] uppercase tracking-widest font-bold leading-none hover:border-accent/40 active:scale-95 transition-`
  - L363 `CSS/keyframe animation`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[11px] uppercase tracking-widest font-bold leading-none hover:border-accent/40 active:scale-95 transition-`
  - L371 `transform`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[11px] uppercase tracking-widest font-bold leading-none hover:border-accent/40 active:scale-95 transition-`
  - L371 `CSS/keyframe animation`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[11px] uppercase tracking-widest font-bold leading-none hover:border-accent/40 active:scale-95 transition-`
  - L381 `transform`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[11px] uppercase tracking-widest font-bold leading-none hover:border-accent/40 active:scale-95 transition-`
  - L381 `CSS/keyframe animation`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card px-4 text-[11px] uppercase tracking-widest font-bold leading-none hover:border-accent/40 active:scale-95 transition-`
  - L387 `transform`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-accent text-accent-foreground px-5 text-[11px] uppercase tracking-widest font-bold leading-none hover:brightness-110`
  - L387 `large shadows/glows`: `className="h-10 inline-flex items-center justify-center gap-2 rounded-full border border-transparent bg-accent text-accent-foreground px-5 text-[11px] uppercase tracking-widest font-bold leading-none hover:brightness-110`
  - … 50 more compositor lines omitted

### `src/styles.css`
- **CSS/keyframe animation** ×139, **large shadows/glows** ×87, **transform** ×107, **opacity/opacity animation** ×48, **filter/blur** ×29, **mix-blend-mode** ×3, **backdrop-filter** ×17, **mask/clip** ×7, **isolation** ×9, **contain/content-visibility** ×17, **perspective/3D** ×7, **will-change** ×6
  - L3 `CSS/keyframe animation`: `@import "tw-animate-css";`
  - L144 `large shadows/glows`: `/* Reusable gradients & glows */`
  - L154 `large shadows/glows`: `--shadow-glow: 0 0 0 1px oklch(0.74 0.19 49 / 0.3), 0 12px 40px -8px oklch(0.74 0.19 49 / 0.4);`
  - L159 `CSS/keyframe animation`: `@keyframes fade-up {`
  - L160 `transform`: `from { opacity: 0; transform: translateY(20px); }`
  - L160 `opacity/opacity animation`: `from { opacity: 0; transform: translateY(20px); }`
  - L161 `transform`: `to { opacity: 1; transform: translateY(0); }`
  - L161 `opacity/opacity animation`: `to { opacity: 1; transform: translateY(0); }`
  - L163 `CSS/keyframe animation`: `@keyframes rise-only {`
  - L164 `transform`: `from { transform: translateY(20px); }`
  - … 466 more compositor lines omitted

## Complete runtime loop/observer/Suspense inventory

### `src/components/account/OrderDetailsDrawer.tsx`
- **useEffect** ×4, **interval/timer** ×3
  - L151 `useEffect`: `useEffect(() => {`
  - L158 `useEffect`: `useEffect(() => {`
  - L161 `interval/timer`: `const refresh = () => { if (t) clearTimeout(t); t = setTimeout(() => load(orderId, false), 400); };`
  - L175 `useEffect`: `useEffect(() => {`
  - L187 `useEffect`: `useEffect(() => {`
  - L189 `interval/timer`: `const t = setInterval(() => setNow(Date.now()), 30_000);`
  - L653 `interval/timer`: `try { await navigator.clipboard.writeText(v); setCopied(true); toast.success("Copied"); setTimeout(() => setCopied(false), 1500); }`

### `src/components/admin/AIOperationsCenter.tsx`
- **useEffect** ×1, **interval/timer** ×2, **requestAnimationFrame** ×1
  - L178 `useEffect`: `useEffect(() => {`
  - L183 `interval/timer`: `const t = setTimeout(() => {`
  - L188 `interval/timer`: `setTimeout(() => el.classList.remove("deep-link-flash"), 2000);`
  - L210 `requestAnimationFrame`: `<motion.button onClick={() => { setTab("actions"); requestAnimationFrame(() => document.getElementById(`cat-${c}`)?.scrollIntoView({ behavior: "smooth", block: "start" })); }} key={c}`

### `src/components/admin/AcquisitionSummary.tsx`
- **useEffect** ×1
  - L25 `useEffect`: `useEffect(() => {`

### `src/components/admin/AdminCommandCenter.tsx`
- **useEffect** ×2, **interval/timer** ×1
  - L91 `useEffect`: `useEffect(() => {`
  - L103 `useEffect`: `useEffect(() => {`
  - L112 `interval/timer`: `debounce.current = setTimeout(async () => {`

### `src/components/admin/AdminCustomersTab.tsx`
- **useEffect** ×2, **interval/timer** ×1
  - L41 `useEffect`: `useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);`
  - L41 `interval/timer`: `useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);`
  - L56 `useEffect`: `useEffect(() => { setRows(null); load(); }, [load]);`

### `src/components/admin/AdminNavDrawer.tsx`
- **useEffect** ×1
  - L18 `useEffect`: `useEffect(() => { setOpen(false); }, [path]);`

### `src/components/admin/AdminProductPanel.tsx`
- **useEffect** ×2
  - L102 `useEffect`: `useEffect(() => {`
  - L110 `useEffect`: `useEffect(() => {`

### `src/components/admin/AdminShell.tsx`
- **useEffect** ×4
  - L136 `useEffect`: `useEffect(() => {`
  - L165 `useEffect`: `useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);`
  - L166 `useEffect`: `useEffect(() => { setOpen(false); }, [path, activeTab]);`
  - L168 `useEffect`: `useEffect(() => {`

### `src/components/admin/AnnouncementAdminSheet.tsx`
- **useEffect** ×1
  - L74 `useEffect`: `useEffect(() => {`

### `src/components/admin/AutomationSummaryWidget.tsx`
- **useEffect** ×1
  - L51 `useEffect`: `useEffect(() => {`

### `src/components/admin/BadgeEditorModal.tsx`
- **useEffect** ×1
  - L136 `useEffect`: `useEffect(() => {`

### `src/components/admin/BadgeSettingsEditor.tsx`
- **useEffect** ×1
  - L83 `useEffect`: `useEffect(() => {`

### `src/components/admin/BannerAdminSheet.tsx`
- **useEffect** ×1
  - L97 `useEffect`: `useEffect(() => {`

### `src/components/admin/BulkVisibilityPanel.tsx`
- **useEffect** ×1
  - L42 `useEffect`: `useEffect(() => {`

### `src/components/admin/CategoryAdminSheet.tsx`
- **useEffect** ×2, **interval/timer** ×1
  - L223 `useEffect`: `useEffect(() => {`
  - L228 `useEffect`: `useEffect(() => {`
  - L297 `interval/timer`: `setTimeout(() => setProgress(0), 400);`

### `src/components/admin/CustomerActionsMenu.tsx`
- **useEffect** ×2, **event listener** ×4
  - L37 `useEffect`: `useEffect(() => {`
  - L40 `event listener`: `document.addEventListener("keydown", onKey);`
  - L42 `event listener`: `return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };`
  - L215 `useEffect`: `useEffect(() => {`
  - L219 `event listener`: `document.addEventListener("keydown", onKey);`
  - L220 `event listener`: `return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };`

### `src/components/admin/CustomerMarketingCard.tsx`
- **useEffect** ×1
  - L24 `useEffect`: `useEffect(() => {`

### `src/components/admin/CustomerMarketingHub.tsx`
- **useEffect** ×3
  - L50 `useEffect`: `useEffect(() => { void load(); }, [load]);`
  - L53 `useEffect`: `useEffect(() => {`
  - L73 `useEffect`: `useEffect(() => {`

### `src/components/admin/DraftActivityWidget.tsx`
- **useEffect** ×1
  - L37 `useEffect`: `useEffect(() => {`

### `src/components/admin/ExecutiveDashboard.tsx`
- **useEffect** ×1, **requestAnimationFrame** ×1, **interval/timer** ×1
  - L121 `useEffect`: `useEffect(() => {`
  - L125 `requestAnimationFrame`: `requestAnimationFrame(() => {`
  - L130 `interval/timer`: `setTimeout(() => el.classList.remove("deep-link-flash"), 2000);`

### `src/components/admin/FinancialMarketingCard.tsx`
- **useEffect** ×1
  - L21 `useEffect`: `useEffect(() => {`

### `src/components/admin/FinancialMarketingHub.tsx`
- **useEffect** ×4, **requestAnimationFrame** ×1, **interval/timer** ×1
  - L24 `useEffect`: `useEffect(() => { if (data) setLive(data); }, [data]);`
  - L32 `useEffect`: `useEffect(() => { if (!data) void reload(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);`
  - L35 `useEffect`: `useEffect(() => {`
  - L46 `useEffect`: `useEffect(() => {`
  - L55 `requestAnimationFrame`: `requestAnimationFrame(() => {`
  - L58 `interval/timer`: `if (el) { el.classList.add("deep-link-flash"); setTimeout(() => el.classList.remove("deep-link-flash"), 1800); }`

### `src/components/admin/InventoryMarketingHub.tsx`
- **useEffect** ×2
  - L46 `useEffect`: `useEffect(() => { void load(); }, [load]);`
  - L49 `useEffect`: `useEffect(() => {`

### `src/components/admin/MarketingAutomationCard.tsx`
- **useEffect** ×1
  - L22 `useEffect`: `useEffect(() => {`

### `src/components/admin/MarketingExecutionsCenter.tsx`
- **useEffect** ×2, **requestAnimationFrame** ×1
  - L83 `useEffect`: `useEffect(() => {`
  - L87 `requestAnimationFrame`: `requestAnimationFrame(() => document.getElementById("automation-health")?.scrollIntoView({ behavior: "smooth", block: "center" }));`
  - L96 `useEffect`: `useEffect(() => {`

### `src/components/admin/MediaUploader.tsx`
- **useEffect** ×1, **event listener** ×2
  - L50 `useEffect`: `useEffect(() => {`
  - L66 `event listener`: `document.addEventListener("paste", onPaste);`
  - L67 `event listener`: `return () => document.removeEventListener("paste", onPaste);`

### `src/components/admin/OrderIntegrityMonitor.tsx`
- **useEffect** ×1
  - L49 `useEffect`: `useEffect(() => {`

### `src/components/admin/PaymentDiagnostics.tsx`
- **useEffect** ×1
  - L72 `useEffect`: `useEffect(() => {`

### `src/components/admin/PaymentIntelDrawer.tsx`
- **interval/timer** ×1, **useEffect** ×2
  - L33 `interval/timer`: `onClick={() => { navigator.clipboard.writeText(v); setCopied(true); setTimeout(() => setCopied(false), 1200); }}`
  - L88 `useEffect`: `useEffect(() => {`
  - L94 `useEffect`: `useEffect(() => {`

### `src/components/admin/ProductCardAdminControlsGate.tsx`
- **Suspense/lazy** ×4
  - L1 `Suspense/lazy`: `import { lazy, Suspense } from "react";`
  - L15 `Suspense/lazy`: `const ProductCardAdminControls = lazy(() =>`
  - L26 `Suspense/lazy`: `<Suspense fallback={null}>`
  - L28 `Suspense/lazy`: `</Suspense>`

### `src/components/admin/ProductFaqManager.tsx`
- **useEffect** ×1
  - L46 `useEffect`: `useEffect(() => {`

### `src/components/admin/ProductMarketingPanel.tsx`
- **useEffect** ×2
  - L43 `useEffect`: `useEffect(() => { void load(); }, [load]);`
  - L46 `useEffect`: `useEffect(() => {`

### `src/components/admin/ProductQuickEditSheet.tsx`
- **useEffect** ×2, **event listener** ×2
  - L74 `useEffect`: `useEffect(() => {`
  - L78 `useEffect`: `useEffect(() => {`
  - L83 `event listener`: `window.addEventListener("keydown", onKey);`
  - L84 `event listener`: `return () => window.removeEventListener("keydown", onKey);`

### `src/components/admin/ProductRatingManager.tsx`
- **useEffect** ×1
  - L72 `useEffect`: `useEffect(() => {`

### `src/components/admin/SectionAnalyticsPanel.tsx`
- **useEffect** ×1
  - L21 `useEffect`: `useEffect(() => {`

### `src/components/admin/SegmentedTabs.tsx`
- **requestAnimationFrame** ×1
  - L33 `requestAnimationFrame`: `requestAnimationFrame(() => {`

### `src/components/admin/StorefrontDashboardPanel.tsx`
- **useEffect** ×1
  - L57 `useEffect`: `useEffect(() => {`

### `src/components/admin/SupportSatisfactionPanel.tsx`
- **useEffect** ×1
  - L90 `useEffect`: `useEffect(() => {`

### `src/components/admin/SwipeRow.tsx`
- **interval/timer** ×1
  - L52 `interval/timer`: `pressTimer.current = setTimeout(() => {`

### `src/components/admin/TestimonialsEditor.tsx`
- **useEffect** ×1
  - L95 `useEffect`: `useEffect(() => { reload(); }, [reload]);`

### `src/components/admin/TicketOpsSheet.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L165 `useEffect`: `useEffect(() => {`
  - L167 `interval/timer`: `const schedule = () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => void load(), 400); };`

### `src/components/admin/VersionHistorySheet.tsx`
- **useEffect** ×1
  - L52 `useEffect`: `useEffect(() => {`

### `src/components/admin/product-editor/category-selector.tsx`
- **useEffect** ×1
  - L64 `useEffect`: `useEffect(() => {`

### `src/components/admin/product-editor/field-builders.tsx`
- **requestAnimationFrame** ×2
  - L114 `requestAnimationFrame`: `requestAnimationFrame(() => {`
  - L132 `requestAnimationFrame`: `requestAnimationFrame(() => el.focus());`

### `src/components/admin/product-editor/kit.tsx`
- **useEffect** ×5, **interval/timer** ×2
  - L143 `useEffect`: `useEffect(() => {`
  - L211 `useEffect`: `useEffect(() => {`
  - L317 `useEffect`: `useEffect(() => {`
  - L344 `useEffect`: `useEffect(() => {`
  - L383 `interval/timer`: `savedFlash.current = setTimeout(() => setJustSaved(false), 2000);`
  - L393 `useEffect`: `useEffect(() => {`
  - L399 `interval/timer`: `timer.current = setTimeout(() => void doSave(true), 2000);`

### `src/components/admin/product-editor/media-fields.tsx`
- **useEffect** ×2, **interval/timer** ×1
  - L60 `useEffect`: `useEffect(() => {`
  - L110 `interval/timer`: `setTimeout(() => setUploads((u) => u.filter((x) => x.error)), 1200);`
  - L416 `useEffect`: `useEffect(() => { if (!value) setMeta({ size: 0, duration: 0 }); }, [value]);`

### `src/components/builder/BlockAnalyticsPanel.tsx`
- **useEffect** ×1
  - L23 `useEffect`: `useEffect(() => {`

### `src/components/builder/BlockEditorSheet.tsx`
- **useEffect** ×1
  - L81 `useEffect`: `useEffect(() => {`

### `src/components/builder/HomepageBuilder.tsx`
- **useEffect** ×1
  - L65 `useEffect`: `useEffect(() => {`

### `src/components/chat/LiveChat.tsx`
- **useEffect** ×8, **requestAnimationFrame** ×2, **event listener** ×2, **interval/timer** ×1
  - L131 `useEffect`: `useEffect(() => { openRef.current = open; if (open) setUnread(0); }, [open]);`
  - L141 `useEffect`: `useEffect(() => {`
  - L147 `requestAnimationFrame`: `requestAnimationFrame(() => {`
  - L155 `event listener`: `window.addEventListener("scroll", onScroll, { passive: true });`
  - L156 `event listener`: `return () => window.removeEventListener("scroll", onScroll);`
  - L168 `useEffect`: `useEffect(() => {`
  - L173 `useEffect`: `useEffect(() => {`
  - L180 `useEffect`: `useEffect(() => {`
  - L195 `useEffect`: `useEffect(() => {`
  - L202 `useEffect`: `useEffect(() => {`
  - … 3 more runtime lines omitted

### `src/components/chat/SupportReplyWatcher.tsx`
- **useEffect** ×1
  - L25 `useEffect`: `useEffect(() => {`

### `src/components/site/AdaptiveProductMedia.tsx`
- **useEffect** ×1
  - L27 `useEffect`: `useEffect(() => setLoadedSrc(null), [src]);`

### `src/components/site/AddressForm.tsx`
- **Suspense/lazy** ×4, **useEffect** ×5, **interval/timer** ×1
  - L1 `Suspense/lazy`: `import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";`
  - L16 `Suspense/lazy`: `const MapPicker = lazy(() => import("@/components/site/MapPicker"));`
  - L160 `useEffect`: `useEffect(() => {`
  - L167 `useEffect`: `useEffect(() => {`
  - L178 `useEffect`: `useEffect(() => {`
  - L245 `useEffect`: `useEffect(() => {`
  - L331 `interval/timer`: `const timer = setTimeout(() => controller.abort(), 8000);`
  - L399 `useEffect`: `useEffect(() => {`
  - L592 `Suspense/lazy`: `<Suspense`
  - L605 `Suspense/lazy`: `</Suspense>`

### `src/components/site/AnnouncementBar.tsx`
- **Suspense/lazy** ×6, **useEffect** ×3, **interval/timer** ×2
  - L1 `Suspense/lazy`: `import { useEffect, useMemo, useState, lazy, Suspense } from "react";`
  - L7 `Suspense/lazy`: `const MotionAnnouncement = lazy(() => import("@/components/site/AnnouncementMessage.motion"));`
  - L9 `Suspense/lazy`: `const AnnouncementAdminSheet = lazy(() =>`
  - L51 `useEffect`: `useEffect(() => {`
  - L53 `interval/timer`: `const t = setInterval(() => setNow(Date.now()), 1000);`
  - L101 `useEffect`: `useEffect(() => {`
  - L113 `useEffect`: `useEffect(() => {`
  - L116 `interval/timer`: `const t = setInterval(() => setI((p) => (p + 1) % items.length), 4500);`
  - L143 `Suspense/lazy`: `<Suspense fallback={<StaticAnnouncement current={current} countdown={countdown} />}>`
  - L145 `Suspense/lazy`: `</Suspense>`
  - … 1 more runtime lines omitted

### `src/components/site/AnnouncementMessage.tsx`
- **Suspense/lazy** ×1
  - L6 `Suspense/lazy`: `* render and as the Suspense fallback while the motion-enhanced version loads.`

### `src/components/site/CouponInput.tsx`
- **useEffect** ×1
  - L73 `useEffect`: `useEffect(() => {`

### `src/components/site/CurrencySwitcher.tsx`
- **useEffect** ×1
  - L11 `useEffect`: `useEffect(() => setMounted(true), []);`

### `src/components/site/DesktopAccountDock.tsx`
- **useEffect** ×2, **event listener** ×2
  - L54 `useEffect`: `useEffect(() => {`
  - L60 `useEffect`: `useEffect(() => {`
  - L62 `event listener`: `window.addEventListener("resize", onResize);`
  - L63 `event listener`: `return () => window.removeEventListener("resize", onResize);`

### `src/components/site/DocPage.tsx`
- **useEffect** ×3, **event listener** ×4, **observer** ×4
  - L17 `useEffect`: `useEffect(() => {`
  - L24 `event listener`: `window.addEventListener("scroll", onScroll, { passive: true });`
  - L25 `event listener`: `window.addEventListener("resize", onScroll);`
  - L27 `event listener`: `window.removeEventListener("scroll", onScroll);`
  - L28 `event listener`: `window.removeEventListener("resize", onScroll);`
  - L38 `useEffect`: `useEffect(() => {`
  - L41 `observer`: `if (typeof IntersectionObserver === "undefined") { setShown(true); return; }`
  - L42 `observer`: `const io = new IntersectionObserver(`
  - L67 `useEffect`: `useEffect(() => {`
  - L68 `observer`: `if (typeof IntersectionObserver === "undefined") return;`
  - … 1 more runtime lines omitted

### `src/components/site/FlashDeals.tsx`
- **useEffect** ×1
  - L228 `useEffect`: `useEffect(() => {`

### `src/components/site/FlashSaleStrip.tsx`
- **useEffect** ×2, **interval/timer** ×1
  - L22 `useEffect`: `useEffect(() => {`
  - L24 `interval/timer`: `const id = setInterval(() => setNow(Date.now()), 1000);`
  - L47 `useEffect`: `useEffect(() => {`

### `src/components/site/HeroCarousel.tsx`
- **useEffect** ×4, **observer** ×2, **interval/timer** ×1
  - L60 `useEffect`: `useEffect(() => {`
  - L78 `useEffect`: `useEffect(() => {`
  - L81 `observer`: `if (!el || typeof IntersectionObserver === "undefined") return;`
  - L82 `observer`: `const io = new IntersectionObserver(`
  - L93 `useEffect`: `useEffect(() => {`
  - L96 `interval/timer`: `const id = window.setInterval(() => {`
  - L109 `useEffect`: `useEffect(() => {`

### `src/components/site/HomePersonalized.tsx`
- **useEffect** ×1
  - L12 `useEffect`: `useEffect(() => {`

### `src/components/site/ImageLightbox.tsx`
- **useEffect** ×1, **event listener** ×2
  - L37 `useEffect`: `useEffect(() => {`
  - L44 `event listener`: `window.addEventListener("keydown", onKey);`
  - L47 `event listener`: `window.removeEventListener("keydown", onKey);`

### `src/components/site/InstallPrompt.tsx`
- **useEffect** ×1, **interval/timer** ×1, **event listener** ×4
  - L18 `useEffect`: `useEffect(() => {`
  - L29 `interval/timer`: `setTimeout(() => setVisible(true), 2500);`
  - L31 `event listener`: `window.addEventListener("beforeinstallprompt", onPrompt);`
  - L37 `event listener`: `window.addEventListener("appinstalled", onInstalled);`
  - L40 `event listener`: `window.removeEventListener("beforeinstallprompt", onPrompt);`
  - L41 `event listener`: `window.removeEventListener("appinstalled", onInstalled);`

### `src/components/site/LazyMount.tsx`
- **observer** ×4, **useEffect** ×1, **interval/timer** ×1
  - L11 `observer`: `* IntersectionObserver, plus a safety timeout that guarantees the section`
  - L31 `useEffect`: `useEffect(() => {`
  - L39 `observer`: `let io: IntersectionObserver | null = null;`
  - L41 `interval/timer`: `const fallback = window.setTimeout(() => setShow(true), 4000);`
  - L43 `observer`: `if (typeof IntersectionObserver === "undefined") {`
  - L46 `observer`: `io = new IntersectionObserver(`

### `src/components/site/MapPicker.tsx`
- **interval/timer** ×5, **useEffect** ×4, **event listener** ×2
  - L91 `interval/timer`: `previewTimer.current = setTimeout(async () => {`
  - L95 `interval/timer`: `const timer = setTimeout(() => controller.abort(), 6000);`
  - L119 `useEffect`: `useEffect(() => {`
  - L146 `interval/timer`: `setTimeout(() => map.invalidateSize(), 80);`
  - L160 `useEffect`: `useEffect(() => {`
  - L167 `event listener`: `window.addEventListener("keydown", onKey);`
  - L171 `event listener`: `window.removeEventListener("keydown", onKey);`
  - L289 `useEffect`: `useEffect(() => {`
  - L292 `interval/timer`: `const t = setTimeout(() => acquireLocation(true), 250);`
  - L333 `useEffect`: `useEffect(() => {`
  - … 1 more runtime lines omitted

### `src/components/site/MegaMenu.tsx`
- **interval/timer** ×2
  - L129 `interval/timer`: `openTimer.current = setTimeout(() => setActive(slug), 160);`
  - L134 `interval/timer`: `closeTimer.current = setTimeout(() => setActive(null), 160);`

### `src/components/site/Nav.tsx`
- **Suspense/lazy** ×4, **useEffect** ×7, **event listener** ×4, **requestAnimationFrame** ×1, **interval/timer** ×1
  - L2 `Suspense/lazy`: `import { Suspense, lazy, useEffect, useRef, useState } from "react";`
  - L12 `Suspense/lazy`: `const SearchCommand = lazy(() =>`
  - L83 `useEffect`: `useEffect(() => {`
  - L89 `useEffect`: `useEffect(() => {`
  - L99 `useEffect`: `useEffect(() => {`
  - L106 `event listener`: `window.addEventListener("keydown", onKey);`
  - L107 `event listener`: `return () => window.removeEventListener("keydown", onKey);`
  - L119 `useEffect`: `useEffect(() => {`
  - L126 `useEffect`: `useEffect(() => {`
  - L156 `useEffect`: `useEffect(() => {`
  - … 7 more runtime lines omitted

### `src/components/site/OrderSupportSection.tsx`
- **useEffect** ×1
  - L129 `useEffect`: `useEffect(() => {`

### `src/components/site/PhoneInput.tsx`
- **useEffect** ×5, **event listener** ×2
  - L96 `useEffect`: `useEffect(() => {`
  - L102 `useEffect`: `useEffect(() => {`
  - L117 `useEffect`: `useEffect(() => {`
  - L125 `useEffect`: `useEffect(() => {`
  - L134 `useEffect`: `useEffect(() => {`
  - L139 `event listener`: `document.addEventListener("mousedown", onDoc);`
  - L140 `event listener`: `return () => document.removeEventListener("mousedown", onDoc);`

### `src/components/site/ProductCard.tsx`
- **interval/timer** ×2
  - L171 `interval/timer`: `window.setTimeout(() => setJustSaved(false), 600);`
  - L217 `interval/timer`: `window.setTimeout(() => setJustAdded(false), 800);`

### `src/components/site/ProductImage.tsx`
- **useEffect** ×1
  - L55 `useEffect`: `useEffect(() => {`

### `src/components/site/ProductQA.tsx`
- **useEffect** ×4
  - L58 `useEffect`: `useEffect(() => {`
  - L62 `useEffect`: `useEffect(() => {`
  - L70 `useEffect`: `useEffect(() => {`
  - L77 `useEffect`: `useEffect(() => {`

### `src/components/site/ProductReviews.tsx`
- **useEffect** ×7, **event listener** ×2
  - L148 `useEffect`: `useEffect(() => { setLoading(true); load(); }, [load]);`
  - L149 `useEffect`: `useEffect(() => { loadMyVotes(); }, [loadMyVotes]);`
  - L150 `useEffect`: `useEffect(() => { loadEligibility(); }, [loadEligibility]);`
  - L153 `useEffect`: `useEffect(() => {`
  - L233 `useEffect`: `useEffect(() => { setVisibleCount(6); }, [filter, sort]);`
  - L1084 `useEffect`: `useEffect(() => {`
  - L1259 `useEffect`: `useEffect(() => {`
  - L1266 `event listener`: `window.addEventListener("keydown", onKey);`
  - L1268 `event listener`: `return () => { window.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };`

### `src/components/site/PromoBannerCarousel.tsx`
- **Suspense/lazy** ×4, **useEffect** ×3, **interval/timer** ×1
  - L1 `Suspense/lazy`: `import { useEffect, useRef, useState, lazy, Suspense } from "react";`
  - L8 `Suspense/lazy`: `const BannerAdminSheet = lazy(() =>`
  - L76 `useEffect`: `useEffect(() => {`
  - L88 `useEffect`: `useEffect(() => {`
  - L91 `interval/timer`: `const id = setInterval(() => setIdx((i) => (i + 1) % banners.length), 6000);`
  - L97 `useEffect`: `useEffect(() => {`
  - L123 `Suspense/lazy`: `{editing && <Suspense fallback={null}><BannerAdminSheet defaultType={types[0]} onClose={() => setEditing(false)} onChanged={fetchBanners} /></Suspense>}`
  - L234 `Suspense/lazy`: `{canEdit && editing && <Suspense fallback={null}><BannerAdminSheet defaultType={types[0]} onClose={() => setEditing(false)} onChanged={fetchBanners} /></Suspense>}`

### `src/components/site/RecentlyViewed.tsx`
- **interval/timer** ×1
  - L53 `interval/timer`: `window.setTimeout(() => setJustAdded(false), 900);`

### `src/components/site/RecommendationStrip.tsx`
- **useEffect** ×1
  - L17 `useEffect`: `useEffect(() => {`

### `src/components/site/RegionLockCard.tsx`
- **useEffect** ×1
  - L32 `useEffect`: `useEffect(() => {`

### `src/components/site/RegionSelectModal.tsx`
- **useEffect** ×1
  - L93 `useEffect`: `useEffect(() => {`

### `src/components/site/ReturnRequestDialog.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L57 `useEffect`: `useEffect(() => {`
  - L59 `interval/timer`: `const t = setTimeout(() => handleOpenChange(false), 1800);`

### `src/components/site/Reveal.tsx`
- **Suspense/lazy** ×7
  - L1 `Suspense/lazy`: `import { Suspense, lazy, type ReactNode } from "react";`
  - L15 `Suspense/lazy`: `const MotionReveal = lazy(() =>`
  - L18 `Suspense/lazy`: `const MotionCounter = lazy(() =>`
  - L53 `Suspense/lazy`: `<Suspense fallback={<div className={className}>{children}</div>}>`
  - L57 `Suspense/lazy`: `</Suspense>`
  - L80 `Suspense/lazy`: `<Suspense fallback={<span>{formatted}</span>}>`
  - L82 `Suspense/lazy`: `</Suspense>`

### `src/components/site/SearchCommand.tsx`
- **useEffect** ×5, **requestAnimationFrame** ×1, **event listener** ×2
  - L48 `useEffect`: `useEffect(() => {`
  - L54 `requestAnimationFrame`: `requestAnimationFrame(() => inputRef.current?.focus());`
  - L115 `useEffect`: `useEffect(() => { setLimit(PRODUCT_PAGE); }, [term]);`
  - L131 `useEffect`: `useEffect(() => { setActive(0); }, [items.length]);`
  - L155 `useEffect`: `useEffect(() => {`
  - L171 `event listener`: `window.addEventListener("keydown", onKey);`
  - L172 `event listener`: `return () => window.removeEventListener("keydown", onKey);`
  - L176 `useEffect`: `useEffect(() => {`

### `src/components/site/ShareDialog.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L83 `useEffect`: `useEffect(() => onOpenShareDialog((d) => {`
  - L96 `interval/timer`: `setTimeout(() => setCopied(false), 2000);`

### `src/components/site/TestimonialsCarousel.tsx`
- **useEffect** ×2, **interval/timer** ×1
  - L62 `useEffect`: `useEffect(() => {`
  - L64 `interval/timer`: `const id = setInterval(() => {`
  - L71 `useEffect`: `useEffect(() => {`

### `src/components/site/TicketRatingPrompt.tsx`
- **useEffect** ×1
  - L32 `useEffect`: `useEffect(() => { void check(); }, [check]);`

### `src/components/site/VirtualizedProductGrid.tsx`
- **observer** ×2, **useEffect** ×2
  - L39 `observer`: `* grow the visible window in small batches via an IntersectionObserver`
  - L65 `useEffect`: `useEffect(() => {`
  - L69 `useEffect`: `useEffect(() => {`
  - L72 `observer`: `const io = new IntersectionObserver(`

### `src/components/site/WishlistCard.tsx`
- **interval/timer** ×1, **useEffect** ×1
  - L78 `interval/timer`: `window.setTimeout(() => setJustAdded(false), 900);`
  - L81 `useEffect`: `useEffect(() => {`

### `src/components/site/motion-primitives.tsx`
- **useEffect** ×1
  - L68 `useEffect`: `useEffect(() => {`

### `src/components/ui/calendar.tsx`
- **useEffect** ×1
  - L148 `useEffect`: `React.useEffect(() => {`

### `src/components/ui/carousel.tsx`
- **useEffect** ×2
  - L85 `useEffect`: `React.useEffect(() => {`
  - L93 `useEffect`: `React.useEffect(() => {`

### `src/components/ui/sidebar.tsx`
- **useEffect** ×1, **event listener** ×2
  - L97 `useEffect`: `React.useEffect(() => {`
  - L105 `event listener`: `window.addEventListener("keydown", handleKeyDown);`
  - L106 `event listener`: `return () => window.removeEventListener("keydown", handleKeyDown);`

### `src/hooks/use-autosave.ts`
- **useEffect** ×2, **interval/timer** ×1, **event listener** ×4
  - L78 `useEffect`: `useEffect(() => {`
  - L84 `interval/timer`: `timer.current = setTimeout(() => {`
  - L94 `useEffect`: `useEffect(() => {`
  - L100 `event listener`: `document.addEventListener("visibilitychange", onHide);`
  - L101 `event listener`: `window.addEventListener("pagehide", onHide);`
  - L103 `event listener`: `document.removeEventListener("visibilitychange", onHide);`
  - L104 `event listener`: `window.removeEventListener("pagehide", onHide);`

### `src/hooks/use-compare.ts`
- **useEffect** ×1, **event listener** ×2
  - L26 `useEffect`: `useEffect(() => {`
  - L31 `event listener`: `window.addEventListener("storage", onStorage);`
  - L32 `event listener`: `return () => { subs.delete(sub); window.removeEventListener("storage", onStorage); };`

### `src/hooks/use-editor-protection.ts`
- **useEffect** ×1
  - L82 `useEffect`: `useEffect(() => {`

### `src/hooks/use-mobile.tsx`
- **useEffect** ×1, **event listener** ×2
  - L8 `useEffect`: `React.useEffect(() => {`
  - L13 `event listener`: `mql.addEventListener("change", onChange);`
  - L15 `event listener`: `return () => mql.removeEventListener("change", onChange);`

### `src/hooks/use-recently-viewed.ts`
- **useEffect** ×1
  - L101 `useEffect`: `useEffect(() => {`

### `src/hooks/use-selection.ts`
- **interval/timer** ×1
  - L40 `interval/timer`: `timer.current = setTimeout(() => {`

### `src/hooks/use-undo-redo.ts`
- **useEffect** ×1, **event listener** ×2
  - L75 `useEffect`: `useEffect(() => {`
  - L89 `event listener`: `window.addEventListener("keydown", onKey);`
  - L90 `event listener`: `return () => window.removeEventListener("keydown", onKey);`

### `src/hooks/use-unsaved-guard.ts`
- **useEffect** ×1, **event listener** ×2
  - L13 `useEffect`: `useEffect(() => {`
  - L20 `event listener`: `window.addEventListener("beforeunload", handler);`
  - L21 `event listener`: `return () => window.removeEventListener("beforeunload", handler);`

### `src/lib/admin-mode.tsx`
- **useEffect** ×1
  - L30 `useEffect`: `useEffect(() => {`

### `src/lib/auth.tsx`
- **useEffect** ×2
  - L24 `useEffect`: `useEffect(() => {`
  - L38 `useEffect`: `useEffect(() => {`

### `src/lib/badge-visibility.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L149 `useEffect`: `useEffect(() => {`
  - L150 `interval/timer`: `const id = setInterval(() => setNow(Date.now()), 60_000);`

### `src/lib/bulk-products.ts`
- **interval/timer** ×1
  - L53 `interval/timer`: `setTimeout(() => URL.revokeObjectURL(url), 1000);`

### `src/lib/cart.tsx`
- **useEffect** ×6
  - L92 `useEffect`: `useEffect(() => {`
  - L102 `useEffect`: `useEffect(() => {`
  - L177 `useEffect`: `useEffect(() => {`
  - L207 `useEffect`: `useEffect(() => {`
  - L373 `useEffect`: `useEffect(() => {`
  - L377 `useEffect`: `useEffect(() => {`

### `src/lib/chat-orders.ts`
- **useEffect** ×1
  - L77 `useEffect`: `useEffect(() => {`

### `src/lib/chunk-recovery.ts`
- **Suspense/lazy** ×3, **interval/timer** ×1, **event listener** ×3
  - L58 `Suspense/lazy`: `* sees a working app instead of a blank Suspense boundary.`
  - L60 `Suspense/lazy`: `export function lazyWithRetry<T extends ComponentType<unknown>>(`
  - L64 `Suspense/lazy`: `return lazy(async () => {`
  - L73 `interval/timer`: `await new Promise((r) => setTimeout(r, baseDelay * (attempt + 1)));`
  - L98 `event listener`: `window.addEventListener("vite:preloadError", (event) => {`
  - L104 `event listener`: `window.addEventListener("unhandledrejection", (event) => {`
  - L113 `event listener`: `window.addEventListener(`

### `src/lib/command-center.tsx`
- **useEffect** ×1, **event listener** ×2
  - L16 `useEffect`: `useEffect(() => {`
  - L23 `event listener`: `window.addEventListener("keydown", onKey);`
  - L24 `event listener`: `return () => window.removeEventListener("keydown", onKey);`

### `src/lib/crisp.ts`
- **interval/timer** ×2, **event listener** ×5
  - L91 `interval/timer`: `setTimeout(finish, 0);`
  - L130 `interval/timer`: `else setTimeout(start, 2000);`
  - L134 `event listener`: `else window.addEventListener("load", schedule, { once: true });`
  - L156 `event listener`: `window.addEventListener(OPEN_EVENT, cb);`
  - L157 `event listener`: `return () => window.removeEventListener(OPEN_EVENT, cb);`
  - L162 `event listener`: `window.addEventListener(CLOSE_EVENT, cb);`
  - L163 `event listener`: `return () => window.removeEventListener(CLOSE_EVENT, cb);`

### `src/lib/error-capture.ts`
- **event listener** ×2
  - L12 `event listener`: `globalThis.addEventListener("error", (event) => record((event as ErrorEvent).error ?? event));`
  - L13 `event listener`: `globalThis.addEventListener("unhandledrejection", (event) =>`

### `src/lib/layout-metrics.tsx`
- **requestAnimationFrame** ×3, **useEffect** ×1, **event listener** ×4, **observer** ×2
  - L116 `requestAnimationFrame`: `requestAnimationFrame(measure);`
  - L124 `requestAnimationFrame`: `requestAnimationFrame(measure);`
  - L129 `useEffect`: `useEffect(() => {`
  - L134 `requestAnimationFrame`: `frame = requestAnimationFrame(measure);`
  - L138 `event listener`: `window.addEventListener("resize", schedule, { passive: true });`
  - L139 `event listener`: `window.addEventListener("orientationchange", schedule, { passive: true });`
  - L144 `observer`: `const resizeObserver = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;`
  - L148 `observer`: `const mutationObserver = new MutationObserver(schedule);`
  - L153 `event listener`: `window.removeEventListener("resize", schedule);`
  - L154 `event listener`: `window.removeEventListener("orientationchange", schedule);`

### `src/lib/media-engine.ts`
- **event listener** ×1
  - L205 `event listener`: `signal.addEventListener("abort", () => xhr.abort(), { once: true });`

### `src/lib/notifications.tsx`
- **observer** ×2, **useEffect** ×4
  - L233 `observer`: `* Uses a MutationObserver so the prefix survives TanStack head() title swaps on`
  - L250 `useEffect`: `useEffect(() => {`
  - L255 `observer`: `const obs = new MutationObserver(() => apply());`
  - L260 `useEffect`: `useEffect(() => { apply(); }, [unread, apply]);`
  - L283 `useEffect`: `useEffect(() => { refresh(); }, [refresh]);`
  - L285 `useEffect`: `useEffect(() => {`

### `src/lib/oauth-return.ts`
- **interval/timer** ×1
  - L61 `interval/timer`: `timer = setTimeout(() => reject(new Error("OAuth session exchange timed out")), timeoutMs);`

### `src/lib/perf-monitor.ts`
- **requestAnimationFrame** ×2, **interval/timer** ×1
  - L47 `requestAnimationFrame`: `requestAnimationFrame(tick);`
  - L49 `requestAnimationFrame`: `requestAnimationFrame(tick);`
  - L56 `interval/timer`: `setInterval(() => {`

### `src/lib/pincode-lookup.server.ts`
- **interval/timer** ×1
  - L53 `interval/timer`: `const timer = setTimeout(() => controller.abort(), ms);`

### `src/lib/promo-code.ts`
- **useEffect** ×1, **event listener** ×4
  - L24 `useEffect`: `useEffect(() => {`
  - L26 `event listener`: `window.addEventListener(EVT, sync);`
  - L27 `event listener`: `window.addEventListener("storage", sync);`
  - L29 `event listener`: `window.removeEventListener(EVT, sync);`
  - L30 `event listener`: `window.removeEventListener("storage", sync);`

### `src/lib/razorpay-loader.ts`
- **event listener** ×2, **interval/timer** ×2
  - L75 `event listener`: `existing.addEventListener("load", () => (window.Razorpay ? resolve() : reject(new Error("Failed to load Razorpay"))));`
  - L76 `event listener`: `existing.addEventListener("error", () => reject(new Error("Failed to load Razorpay. Check your network.")));`
  - L83 `interval/timer`: `const timeout = setTimeout(() => reject(new Error("Failed to load Razorpay. Check your network.")), 12000);`
  - L111 `interval/timer`: `await new Promise((r) => setTimeout(r, 600));`

### `src/lib/region.tsx`
- **useEffect** ×5, **interval/timer** ×1
  - L172 `useEffect`: `useEffect(() => {`
  - L180 `useEffect`: `useEffect(() => {`
  - L188 `useEffect`: `useEffect(() => {`
  - L200 `useEffect`: `useEffect(() => {`
  - L202 `interval/timer`: `const t = setTimeout(() => {`
  - L211 `useEffect`: `useEffect(() => {`

### `src/lib/rotation.ts`
- **useEffect** ×2, **interval/timer** ×2
  - L11 `useEffect`: `useEffect(() => {`
  - L12 `interval/timer`: `const id = setInterval(() => setSeed(orderWindowSeed(Date.now())), 60_000);`
  - L73 `useEffect`: `useEffect(() => {`
  - L81 `interval/timer`: `timer = setTimeout(() => {`

### `src/lib/section-analytics.ts`
- **useEffect** ×1, **observer** ×2
  - L16 `useEffect`: `useEffect(() => {`
  - L18 `observer`: `// scrolls when multiple IntersectionObservers fire alongside product-grid`
  - L24 `observer`: `const io = new IntersectionObserver(`

### `src/lib/share.ts`
- **event listener** ×2
  - L78 `event listener`: `window.addEventListener(SHARE_EVENT, listener);`
  - L79 `event listener`: `return () => window.removeEventListener(SHARE_EVENT, listener);`

### `src/lib/startup-diagnostics.ts`
- **interval/timer** ×5, **event listener** ×14, **observer** ×2, **useEffect** ×1
  - L73 `interval/timer`: `else window.setTimeout(persist, 250);`
  - L146 `event listener`: `navigator.serviceWorker.addEventListener("controllerchange", () => {`
  - L149 `event listener`: `navigator.serviceWorker.addEventListener("message", (event) => {`
  - L164 `event listener`: `registration.addEventListener("updatefound", () => {`
  - L207 `interval/timer`: `else window.setTimeout(() => snapshot(label), 750);`
  - L216 `observer`: `if (!isUltraLowEndAndroid() || typeof MutationObserver === "undefined") return;`
  - L231 `interval/timer`: `const timer = window.setInterval(flush, 3000);`
  - L232 `observer`: `const observer = new MutationObserver((mutations) => {`
  - L253 `interval/timer`: `window.setTimeout(() => {`
  - L262 `event listener`: `document.addEventListener(`
  - … 12 more runtime lines omitted

### `src/lib/support-presence.ts`
- **useEffect** ×3, **interval/timer** ×3
  - L47 `useEffect`: `useEffect(() => {`
  - L55 `interval/timer`: `const poll = setInterval(() => setTick(Date.now()), 30000);`
  - L98 `useEffect`: `useEffect(() => {`
  - L105 `interval/timer`: `const poll = setInterval(load, 60000);`
  - L125 `useEffect`: `useEffect(() => {`
  - L133 `interval/timer`: `hideTimer.current = setTimeout(() => setOtherTyping(false), 5000);`

### `src/lib/theme.tsx`
- **useEffect** ×3, **event listener** ×2
  - L62 `useEffect`: `useEffect(() => {`
  - L69 `useEffect`: `useEffect(() => {`
  - L77 `useEffect`: `useEffect(() => {`
  - L85 `event listener`: `mql.addEventListener("change", onChange);`
  - L86 `event listener`: `return () => mql.removeEventListener("change", onChange);`

### `src/lib/traffic-export.ts`
- **interval/timer** ×1
  - L17 `interval/timer`: `setTimeout(() => URL.revokeObjectURL(url), 1000);`

### `src/lib/use-addresses.ts`
- **useEffect** ×2
  - L98 `useEffect`: `useEffect(() => {`
  - L104 `useEffect`: `useEffect(() => {`

### `src/lib/use-admin.ts`
- **useEffect** ×1
  - L87 `useEffect`: `useEffect(() => {`

### `src/lib/use-ai-operations.ts`
- **useEffect** ×4
  - L50 `useEffect`: `useEffect(() => {`
  - L62 `useEffect`: `useEffect(() => {`
  - L82 `useEffect`: `useEffect(() => {`
  - L108 `useEffect`: `useEffect(() => {`

### `src/lib/use-badge-settings.ts`
- **useEffect** ×1
  - L98 `useEffect`: `useEffect(() => {`

### `src/lib/use-categories.ts`
- **useEffect** ×3
  - L79 `useEffect`: `useEffect(() => {`
  - L131 `useEffect`: `useEffect(() => {`
  - L169 `useEffect`: `useEffect(() => {`

### `src/lib/use-checkout-analytics.ts`
- **useEffect** ×1
  - L192 `useEffect`: `useEffect(() => {`

### `src/lib/use-checkout-funnel.ts`
- **useEffect** ×1
  - L215 `useEffect`: `useEffect(() => {`

### `src/lib/use-customer-intel-summary.ts`
- **useEffect** ×1
  - L49 `useEffect`: `useEffect(() => {`

### `src/lib/use-executive-intelligence.ts`
- **useEffect** ×1, **interval/timer** ×1
  - L19 `useEffect`: `useEffect(() => {`
  - L35 `interval/timer`: `const poll = setInterval(load, 60_000);`

### `src/lib/use-financial-marketing.ts`
- **useEffect** ×1
  - L25 `useEffect`: `useEffect(() => {`

### `src/lib/use-flash-deals.ts`
- **useEffect** ×2, **interval/timer** ×1
  - L47 `useEffect`: `useEffect(() => {`
  - L49 `interval/timer`: `const id = setInterval(() => setNow(Date.now()), intervalMs);`
  - L80 `useEffect`: `useEffect(() => {`

### `src/lib/use-fraud-intelligence.ts`
- **useEffect** ×2
  - L64 `useEffect`: `useEffect(() => {`
  - L99 `useEffect`: `useEffect(() => {`

### `src/lib/use-homepage-sections.ts`
- **useEffect** ×1
  - L60 `useEffect`: `useEffect(() => {`

### `src/lib/use-image-palette.ts`
- **useEffect** ×1
  - L33 `useEffect`: `useEffect(() => {`

### `src/lib/use-low-end-device.ts`
- **useEffect** ×5
  - L42 `useEffect`: `useEffect(() => {`
  - L112 `useEffect`: `useEffect(() => {`
  - L120 `useEffect`: `useEffect(() => {`
  - L134 `useEffect`: `useEffect(() => {`
  - L176 `useEffect`: `useEffect(() => {`

### `src/lib/use-marketplace.ts`
- **useEffect** ×2
  - L66 `useEffect`: `useEffect(() => { load(); }, [load]);`
  - L69 `useEffect`: `useEffect(() => {`

### `src/lib/use-order-operations.ts`
- **useEffect** ×2, **interval/timer** ×2
  - L32 `useEffect`: `useEffect(() => {`
  - L38 `useEffect`: `useEffect(() => {`
  - L41 `interval/timer`: `debounce.current = setTimeout(() => load(true), 3000);`
  - L56 `interval/timer`: `const poll = setInterval(() => load(true), 30000);`

### `src/lib/use-payment-gateways.ts`
- **useEffect** ×1
  - L60 `useEffect`: `useEffect(() => {`

### `src/lib/use-payment-methods.ts`
- **useEffect** ×1
  - L61 `useEffect`: `useEffect(() => {`

### `src/lib/use-product-badges.ts`
- **useEffect** ×2
  - L230 `useEffect`: `useEffect(() => {`
  - L258 `useEffect`: `useEffect(() => {`

### `src/lib/use-products.ts`
- **event listener** ×2, **useEffect** ×2
  - L37 `event listener`: `window.addEventListener("focus", refreshFromBrowserEvent);`
  - L38 `event listener`: `document.addEventListener("visibilitychange", refreshFromBrowserEvent);`
  - L67 `useEffect`: `useEffect(() => {`
  - L83 `useEffect`: `useEffect(() => {`

### `src/lib/use-realtime.ts`
- **useEffect** ×1
  - L10 `useEffect`: `useEffect(() => {`

### `src/lib/use-rotation-nonce.ts`
- **useEffect** ×1
  - L14 `useEffect`: `useEffect(() => {`

### `src/lib/use-serviceability-analytics.ts`
- **useEffect** ×1
  - L137 `useEffect`: `useEffect(() => {`

### `src/lib/use-store-settings.ts`
- **useEffect** ×1
  - L35 `useEffect`: `useEffect(() => {`

### `src/lib/use-storefront-blocks.ts`
- **useEffect** ×1
  - L113 `useEffect`: `useEffect(() => {`

### `src/lib/use-support-settings.ts`
- **useEffect** ×1
  - L45 `useEffect`: `useEffect(() => {`

### `src/lib/use-support-unread.ts`
- **useEffect** ×2
  - L19 `useEffect`: `useEffect(() => {`
  - L47 `useEffect`: `useEffect(() => {`

### `src/lib/use-testimonials.ts`
- **useEffect** ×1
  - L77 `useEffect`: `useEffect(() => {`

### `src/lib/use-traffic-intelligence.ts`
- **useEffect** ×2, **interval/timer** ×2
  - L28 `useEffect`: `useEffect(() => {`
  - L35 `useEffect`: `useEffect(() => {`
  - L38 `interval/timer`: `debounce.current = setTimeout(() => load(true), 2500);`
  - L47 `interval/timer`: `const poll = setInterval(() => load(true), 20000);`

### `src/lib/use-traffic-summary.ts`
- **useEffect** ×1, **interval/timer** ×2
  - L17 `useEffect`: `useEffect(() => {`
  - L30 `interval/timer`: `debounce.current = setTimeout(load, 3000);`
  - L38 `interval/timer`: `const poll = setInterval(load, 30000);`

### `src/lib/use-user-intelligence.ts`
- **useEffect** ×2, **interval/timer** ×2
  - L31 `useEffect`: `useEffect(() => {`
  - L37 `useEffect`: `useEffect(() => {`
  - L40 `interval/timer`: `debounce.current = setTimeout(() => load(true), 3000);`
  - L50 `interval/timer`: `const poll = setInterval(() => load(true), 30000);`

### `src/lib/wishlist-alerts.tsx`
- **useEffect** ×3
  - L93 `useEffect`: `useEffect(() => {`
  - L98 `useEffect`: `useEffect(() => {`
  - L121 `useEffect`: `useEffect(() => {`

### `src/lib/wishlist.tsx`
- **useEffect** ×3
  - L43 `useEffect`: `useEffect(() => {`
  - L79 `useEffect`: `useEffect(() => {`
  - L83 `useEffect`: `useEffect(() => {`

### `src/routes/__root.tsx`
- **Suspense/lazy** ×15, **interval/timer** ×4, **event listener** ×4, **useEffect** ×9
  - L2 `Suspense/lazy`: `import { Suspense, useEffect, useState } from "react";`
  - L40 `Suspense/lazy`: `import { lazyWithRetry, installChunkRecovery } from "@/lib/chunk-recovery";`
  - L77 `interval/timer`: `try { setTimeout(commit, 0); } catch(x) {}`
  - L81 `event listener`: `else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', commit, { once: true });`
  - L93 `event listener`: `window.addEventListener('vite:preloadError', function(e){ try { e.preventDefault(); } catch(x) {} window.__fomRecover(e && e.payload || e); });`
  - L94 `event listener`: `window.addEventListener('unhandledrejection', function(e){ if (isEntryFailure(e.reason)) { try { e.preventDefault(); } catch(x) {} window.__fomRecover(e.reason); } });`
  - L95 `event listener`: `window.addEventListener('error', function(e){ var t = e && e.target; var src = t && (t.src || t.href) || ''; if (isEntryFailure(e && e.message) || isEntryFailure(src)) window.__fomRecover(e && e.message || src); }, true)`
  - L102 `Suspense/lazy`: `const AdminFloatingToolbar = lazyWithRetry(() =>`
  - L107 `Suspense/lazy`: `const AdminOverlayIndicator = lazyWithRetry(() =>`
  - L112 `Suspense/lazy`: `const AdminCommandCenter = lazyWithRetry(() =>`
  - … 22 more runtime lines omitted

### `src/routes/account.tsx`
- **useEffect** ×6, **interval/timer** ×2
  - L134 `useEffect`: `useEffect(() => {`
  - L138 `useEffect`: `useEffect(() => {`
  - L786 `useEffect`: `useEffect(() => {`
  - L804 `useEffect`: `useEffect(() => {`
  - L824 `useEffect`: `useEffect(() => {`
  - L826 `interval/timer`: `const t = setInterval(() => setNow(Date.now()), 1000);`
  - L889 `useEffect`: `useEffect(() => {`
  - L890 `interval/timer`: `const t = setInterval(() => setI((p) => (p + 1) % messages.length), 3000);`

### `src/routes/account_.addresses.tsx`
- **useEffect** ×1
  - L59 `useEffect`: `useEffect(() => {`

### `src/routes/account_.history.tsx`
- **useEffect** ×4
  - L67 `useEffect`: `useEffect(() => {`
  - L89 `useEffect`: `useEffect(() => {`
  - L93 `useEffect`: `useEffect(() => { setSearchHistory(readSearchHistory()); }, []);`
  - L95 `useEffect`: `useEffect(() => {`

### `src/routes/account_.orders.tsx`
- **useEffect** ×4, **interval/timer** ×1
  - L253 `useEffect`: `useEffect(() => {`
  - L309 `useEffect`: `useEffect(() => {`
  - L318 `useEffect`: `useEffect(() => {`
  - L321 `interval/timer`: `const refresh = () => { if (t) clearTimeout(t); t = setTimeout(load, 400); };`
  - L382 `useEffect`: `useEffect(() => { setVisible(PAGE); }, [filter, q]);`

### `src/routes/account_.payment-methods.add.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L71 `useEffect`: `useEffect(() => {`
  - L110 `interval/timer`: `setTimeout(() => nav({ to: "/account/payments" }), 1100);`

### `src/routes/account_.payments.tsx`
- **useEffect** ×1
  - L168 `useEffect`: `useEffect(() => {`

### `src/routes/account_.preferences.tsx`
- **useEffect** ×1
  - L81 `useEffect`: `useEffect(() => {`

### `src/routes/account_.profile.tsx`
- **useEffect** ×5, **interval/timer** ×2, **event listener** ×2
  - L155 `useEffect`: `useEffect(() => {`
  - L159 `useEffect`: `useEffect(() => {`
  - L191 `useEffect`: `useEffect(() => {`
  - L197 `useEffect`: `useEffect(() => {`
  - L201 `interval/timer`: `const t = setTimeout(() => {`
  - L295 `interval/timer`: `setTimeout(() => nav({ to: "/account" }), 900);`
  - L575 `useEffect`: `useEffect(() => {`
  - L580 `event listener`: `document.addEventListener("mousedown", onDoc);`
  - L581 `event listener`: `return () => document.removeEventListener("mousedown", onDoc);`

### `src/routes/account_.returns.tsx`
- **useEffect** ×5, **interval/timer** ×2, **event listener** ×6
  - L380 `useEffect`: `useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);`
  - L393 `interval/timer`: `setTimeout(() => setCopied(false), 1800);`
  - L406 `event listener`: `document.addEventListener("visibilitychange", onHide, { once: true });`
  - L407 `event listener`: `window.addEventListener("blur", onHide, { once: true });`
  - L413 `interval/timer`: `window.setTimeout(() => {`
  - L414 `event listener`: `document.removeEventListener("visibilitychange", onHide);`
  - L415 `event listener`: `window.removeEventListener("blur", onHide);`
  - L427 `useEffect`: `useEffect(() => {`
  - L429 `event listener`: `window.addEventListener("scroll", onScroll, { passive: true });`
  - L430 `event listener`: `return () => window.removeEventListener("scroll", onScroll);`
  - … 3 more runtime lines omitted

### `src/routes/account_.security.tsx`
- **interval/timer** ×1
  - L73 `interval/timer`: `setTimeout(() => setSuccess(false), 2200);`

### `src/routes/account_.support.tsx`
- **useEffect** ×8
  - L160 `useEffect`: `useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);`
  - L163 `useEffect`: `useEffect(() => {`
  - L170 `useEffect`: `useEffect(() => {`
  - L195 `useEffect`: `useEffect(() => {`
  - L397 `useEffect`: `useEffect(() => {`
  - L415 `useEffect`: `useEffect(() => {`
  - L428 `useEffect`: `useEffect(() => {`
  - L640 `useEffect`: `useEffect(() => {`

### `src/routes/account_.support_.new.tsx`
- **useEffect** ×2
  - L76 `useEffect`: `useEffect(() => {`
  - L81 `useEffect`: `useEffect(() => {`

### `src/routes/account_.support_.ticket.$ticketId.tsx`
- **useEffect** ×5
  - L116 `useEffect`: `useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);`
  - L129 `useEffect`: `useEffect(() => {`
  - L147 `useEffect`: `useEffect(() => {`
  - L159 `useEffect`: `useEffect(() => {`
  - L170 `useEffect`: `useEffect(() => { autoGrow(); }, [reply, autoGrow]);`

### `src/routes/admin-acquisition-intelligence.tsx`
- **useEffect** ×3
  - L134 `useEffect`: `useEffect(() => { void load(); }, [load]);`
  - L135 `useEffect`: `useEffect(() => { logActivity("acquisition_intelligence_open", "marketing"); }, []);`
  - L138 `useEffect`: `useEffect(() => {`

### `src/routes/admin-activity.tsx`
- **useEffect** ×1
  - L17 `useEffect`: `useEffect(() => {`

### `src/routes/admin-ai-operations.tsx`
- **useEffect** ×1
  - L19 `useEffect`: `useEffect(() => { logActivity("ai_operations_open", "ai_operations", undefined, view ? { view } : undefined); }, [view]);`

### `src/routes/admin-analytics.tsx`
- **useEffect** ×2, **interval/timer** ×2
  - L58 `useEffect`: `useEffect(() => { mv.set(value); }, [value, mv]);`
  - L165 `useEffect`: `useEffect(() => {`
  - L168 `interval/timer`: `debounce.current = setTimeout(() => refetch(), 1500);`
  - L176 `interval/timer`: `const poll = setInterval(() => refetch(), 45_000);`

### `src/routes/admin-badges-analytics.tsx`
- **useEffect** ×2
  - L44 `useEffect`: `useEffect(() => {`
  - L79 `useEffect`: `useEffect(() => {`

### `src/routes/admin-badges.tsx`
- **useEffect** ×3
  - L31 `useEffect`: `useEffect(() => {`
  - L124 `useEffect`: `useEffect(() => { setOrder(sorted.map((b) => b.id)); }, [sorted]);`
  - L127 `useEffect`: `useEffect(() => {`

### `src/routes/admin-bulk-badges.tsx`
- **useEffect** ×1
  - L69 `useEffect`: `useEffect(() => { void load(); }, [load]);`

### `src/routes/admin-categories-manage.tsx`
- **useEffect** ×1
  - L33 `useEffect`: `useEffect(() => {`

### `src/routes/admin-categories.tsx`
- **useEffect** ×1
  - L50 `useEffect`: `useEffect(() => {`

### `src/routes/admin-cms.tsx`
- **useEffect** ×1
  - L46 `useEffect`: `useEffect(() => { void load(); }, []);`

### `src/routes/admin-customer-intelligence.tsx`
- **useEffect** ×2, **requestAnimationFrame** ×1, **interval/timer** ×1
  - L62 `useEffect`: `useEffect(() => {`
  - L75 `useEffect`: `useEffect(() => {`
  - L87 `requestAnimationFrame`: `if (id) requestAnimationFrame(() => {`
  - L92 `interval/timer`: `setTimeout(() => el.classList.remove("deep-link-flash"), 1800);`

### `src/routes/admin-customers.$customerId.tsx`
- **interval/timer** ×3, **useEffect** ×3, **requestAnimationFrame** ×1
  - L81 `interval/timer`: `onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}`
  - L207 `useEffect`: `useEffect(() => { load(); loadNotes(); loadEmails(); loadTags(); loadTimeline(); }, [load, loadNotes, loadEmails, loadTags, loadTimeline]);`
  - L264 `useEffect`: `useEffect(() => {`
  - L269 `requestAnimationFrame`: `if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));`
  - L276 `useEffect`: `useEffect(() => {`
  - L277 `interval/timer`: `const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };`
  - L311 `interval/timer`: `setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500);`

### `src/routes/admin-customers.tsx`
- **useEffect** ×4, **interval/timer** ×2
  - L98 `useEffect`: `useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);`
  - L98 `interval/timer`: `useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);`
  - L99 `useEffect`: `useEffect(() => { setPage(0); }, [search]);`
  - L117 `useEffect`: `useEffect(() => { load(); }, [load]);`
  - L119 `useEffect`: `useEffect(() => {`
  - L120 `interval/timer`: `const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };`

### `src/routes/admin-executive.tsx`
- **useEffect** ×1
  - L20 `useEffect`: `useEffect(() => { logActivity("executive_dashboard_open", "executive", undefined, view ? { view } : undefined); }, [view]);`

### `src/routes/admin-financial.tsx`
- **useEffect** ×6, **interval/timer** ×2
  - L59 `useEffect`: `useEffect(() => { mv.set(value); }, [value, mv]);`
  - L60 `useEffect`: `useEffect(() => spring.on("change", (v) => setTxt(decimals ? fmt2(v, currency) : fmt(v, currency))), [spring, currency, decimals]);`
  - L147 `useEffect`: `useEffect(() => {`
  - L163 `useEffect`: `useEffect(() => { load(); }, [load]);`
  - L166 `useEffect`: `useEffect(() => {`
  - L169 `interval/timer`: `debounce.current = setTimeout(() => load(true), 900);`
  - L178 `interval/timer`: `const poll = setInterval(() => load(true), 45_000);`
  - L639 `useEffect`: `useEffect(() => {`

### `src/routes/admin-flash-deals.tsx`
- **useEffect** ×1
  - L119 `useEffect`: `useEffect(() => {`

### `src/routes/admin-inbox-placement.tsx`
- **useEffect** ×1
  - L74 `useEffect`: `useEffect(() => {`

### `src/routes/admin-inventory-intelligence.tsx`
- **useEffect** ×1
  - L45 `useEffect`: `useEffect(() => {`

### `src/routes/admin-inventory.tsx`
- **useEffect** ×1
  - L22 `useEffect`: `useEffect(() => { load(); }, []);`

### `src/routes/admin-live.tsx`
- **useEffect** ×7, **interval/timer** ×3
  - L63 `useEffect`: `useEffect(() => { mv.set(value); }, [value, mv]);`
  - L189 `useEffect`: `useEffect(() => {`
  - L190 `interval/timer`: `const t = setInterval(() => force((n) => n + 1), 10_000);`
  - L195 `useEffect`: `useEffect(() => {`
  - L196 `interval/timer`: `const t = setInterval(() => setEmptyIdx((i) => (i + 1) % EMPTY_MESSAGES.length), 4_000);`
  - L201 `useEffect`: `useEffect(() => {`
  - L218 `useEffect`: `useEffect(() => {`
  - L220 `interval/timer`: `const t = setInterval(loadMetrics, 25_000);`
  - L225 `useEffect`: `useEffect(() => {`
  - L246 `useEffect`: `useEffect(() => {`

### `src/routes/admin-low-stock.tsx`
- **useEffect** ×1
  - L32 `useEffect`: `useEffect(() => { fetchProducts().then(setProducts); }, []);`

### `src/routes/admin-marketing-automation.tsx`
- **useEffect** ×3, **requestAnimationFrame** ×1
  - L62 `useEffect`: `useEffect(() => {`
  - L74 `useEffect`: `useEffect(() => {`
  - L89 `requestAnimationFrame`: `requestAnimationFrame(() => {`
  - L477 `useEffect`: `useEffect(() => {`

### `src/routes/admin-marketing-growth.tsx`
- **useEffect** ×3, **interval/timer** ×1
  - L120 `useEffect`: `useEffect(() => { void load(); void loadExecs(); }, [load, loadExecs]);`
  - L121 `useEffect`: `useEffect(() => {`
  - L126 `useEffect`: `useEffect(() => {`
  - L129 `interval/timer`: `tRef.current = setTimeout(() => { void load(true); void loadExecs(); void loadAttr(); }, 1500);`

### `src/routes/admin-marketing-metrics.tsx`
- **useEffect** ×2
  - L55 `useEffect`: `useEffect(() => { void load(); }, [load]);`
  - L58 `useEffect`: `useEffect(() => {`

### `src/routes/admin-marketing.tsx`
- **useEffect** ×1
  - L64 `useEffect`: `useEffect(() => { load(); }, []);`

### `src/routes/admin-marketplace-quality.tsx`
- **useEffect** ×1
  - L86 `useEffect`: `useEffect(() => { logActivity("marketplace_quality_open", "marketplace_quality"); load(); }, []);`

### `src/routes/admin-media.tsx`
- **useEffect** ×2, **observer** ×1
  - L59 `useEffect`: `useEffect(() => {`
  - L67 `useEffect`: `useEffect(() => {`
  - L70 `observer`: `const io = new IntersectionObserver((entries) => {`

### `src/routes/admin-merchandising.tsx`
- **useEffect** ×2
  - L43 `useEffect`: `useEffect(() => { fetchMerchProducts().then(setRows).catch((e) => toast.error("Load failed", { description: e.message })); }, []);`
  - L46 `useEffect`: `useEffect(() => {`

### `src/routes/admin-notifications.tsx`
- **useEffect** ×3
  - L128 `useEffect`: `useEffect(() => { oldest.current = null; load(true); }, [load]);`
  - L131 `useEffect`: `useEffect(() => {`
  - L140 `useEffect`: `useEffect(() => {`

### `src/routes/admin-orders-ops.tsx`
- **interval/timer** ×1, **useEffect** ×1, **requestAnimationFrame** ×1
  - L204 `interval/timer`: `onClick={() => { navigator.clipboard?.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}`
  - L259 `useEffect`: `useEffect(() => {`
  - L759 `requestAnimationFrame`: `requestAnimationFrame(() => document.getElementById("recent-orders")?.scrollIntoView({ behavior: "smooth", block: "start" }));`

### `src/routes/admin-payments.tsx`
- **useEffect** ×4, **interval/timer** ×2
  - L85 `useEffect`: `useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);`
  - L85 `interval/timer`: `useEffect(() => { const t = setTimeout(() => setSearch(query), 300); return () => clearTimeout(t); }, [query]);`
  - L86 `useEffect`: `useEffect(() => { setPage(0); }, [search, status]);`
  - L104 `useEffect`: `useEffect(() => { load(); }, [load]);`
  - L107 `useEffect`: `useEffect(() => {`
  - L108 `interval/timer`: `const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };`

### `src/routes/admin-performance.tsx`
- **useEffect** ×1
  - L19 `useEffect`: `useEffect(() => { fetchProductPerformance(90).then(setData); }, []);`

### `src/routes/admin-product.$slug.index.tsx`
- **useEffect** ×3
  - L144 `useEffect`: `useEffect(() => {`
  - L213 `useEffect`: `useEffect(() => {`
  - L606 `useEffect`: `useEffect(() => {`

### `src/routes/admin-products.tsx`
- **useEffect** ×6, **interval/timer** ×2
  - L212 `useEffect`: `useEffect(() => {`
  - L213 `interval/timer`: `const t = setTimeout(() => setSearchTerm(query.trim().toLowerCase()), 250);`
  - L269 `interval/timer`: `setTimeout(() => setPulse(false), 1000);`
  - L275 `useEffect`: `useEffect(() => { loadProducts(); loadCategories(); loadStats(); loadSummary(); }, [loadProducts, loadCategories, loadStats, loadSummary]);`
  - L278 `useEffect`: `useEffect(() => {`
  - L495 `useEffect`: `useEffect(() => { setPage(1); }, [cat, state, stock, tag, searchTerm, sort, view, catalogTab]);`
  - L498 `useEffect`: `useEffect(() => {`
  - L1129 `useEffect`: `useEffect(() => { setStockInput(String(p.stock_quantity)); }, [p.stock_quantity]);`

### `src/routes/admin-quality.tsx`
- **useEffect** ×1
  - L31 `useEffect`: `useEffect(() => {`

### `src/routes/admin-region.tsx`
- **useEffect** ×2
  - L158 `useEffect`: `useEffect(() => {`
  - L162 `useEffect`: `useEffect(() => {`

### `src/routes/admin-reports.tsx`
- **useEffect** ×1
  - L28 `useEffect`: `useEffect(() => {`

### `src/routes/admin-returns.tsx`
- **useEffect** ×1
  - L55 `useEffect`: `useEffect(() => { void load(); }, []);`

### `src/routes/admin-search.tsx`
- **useEffect** ×1
  - L18 `useEffect`: `useEffect(() => {`

### `src/routes/admin-seed.tsx`
- **useEffect** ×1
  - L50 `useEffect`: `useEffect(() => { load(); }, []);`

### `src/routes/admin-seo-health.tsx`
- **useEffect** ×1
  - L40 `useEffect`: `useEffect(() => { refresh(); }, [refresh]);`

### `src/routes/admin-seo-intelligence.tsx`
- **useEffect** ×1
  - L83 `useEffect`: `useEffect(() => { load(); }, [load]);`

### `src/routes/admin-shipments.tsx`
- **useEffect** ×4, **event listener** ×2, **interval/timer** ×1
  - L232 `useEffect`: `useEffect(() => {`
  - L234 `event listener`: `document.addEventListener("mousedown", onDoc);`
  - L235 `event listener`: `return () => document.removeEventListener("mousedown", onDoc);`
  - L374 `useEffect`: `useEffect(() => { void load(); }, []);`
  - L376 `useEffect`: `useEffect(() => {`
  - L391 `useEffect`: `useEffect(() => {`
  - L394 `interval/timer`: `reloadTimer.current = setTimeout(() => void load(true), 600);`

### `src/routes/admin-support.tsx`
- **useEffect** ×6, **interval/timer** ×2
  - L108 `useEffect`: `useEffect(() => {`
  - L109 `interval/timer`: `const id = setInterval(() => setNowTick(Date.now()), 30000);`
  - L115 `useEffect`: `useEffect(() => {`
  - L141 `useEffect`: `useEffect(() => {`
  - L143 `interval/timer`: `const schedule = () => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => void load(), 600); };`
  - L349 `useEffect`: `useEffect(() => {`
  - L907 `useEffect`: `useEffect(() => {`
  - L1000 `useEffect`: `useEffect(() => {`

### `src/routes/admin.tsx`
- **useEffect** ×6
  - L82 `useEffect`: `useEffect(() => { if (tabParam) setTab(tabParam); }, [tabParam]);`
  - L92 `useEffect`: `useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);`
  - L94 `useEffect`: `useEffect(() => {`
  - L101 `useEffect`: `useEffect(() => {`
  - L735 `useEffect`: `useEffect(() => { load(); }, [slug]);`
  - L796 `useEffect`: `useEffect(() => { load(); }, [slug]);`

### `src/routes/auth.callback.tsx`
- **useEffect** ×1, **interval/timer** ×3
  - L34 `useEffect`: `useEffect(() => {`
  - L43 `interval/timer`: `setTimeout(() => {`
  - L60 `interval/timer`: `timer = setTimeout(check, 400);`
  - L76 `interval/timer`: `const fail = setTimeout(() => {`

### `src/routes/auth.tsx`
- **useEffect** ×2
  - L90 `useEffect`: `useEffect(() => {`
  - L111 `useEffect`: `useEffect(() => {`

### `src/routes/blog.$slug.tsx`
- **useEffect** ×1
  - L62 `useEffect`: `useEffect(() => {`

### `src/routes/blog.tsx`
- **useEffect** ×1
  - L26 `useEffect`: `useEffect(() => {`

### `src/routes/cart.tsx`
- **useEffect** ×1
  - L67 `useEffect`: `useEffect(() => { refreshProducts(); }, []);`

### `src/routes/category.$main.$sub.tsx`
- **useEffect** ×1
  - L61 `useEffect`: `useEffect(() => {`

### `src/routes/category.$slug.tsx`
- **useEffect** ×1
  - L87 `useEffect`: `useEffect(() => {`

### `src/routes/checkout.tsx`
- **useEffect** ×16, **interval/timer** ×3, **observer** ×2
  - L106 `useEffect`: `useEffect(() => {`
  - L111 `useEffect`: `useEffect(() => { refreshProducts(); }, []);`
  - L116 `useEffect`: `useEffect(() => {`
  - L129 `useEffect`: `useEffect(() => {`
  - L133 `useEffect`: `useEffect(() => {`
  - L141 `useEffect`: `useEffect(() => {`
  - L146 `useEffect`: `useEffect(() => {`
  - L148 `interval/timer`: `const t = setInterval(() => setReserveLeft((s) => (s > 0 ? s - 1 : 0)), 1000);`
  - L160 `useEffect`: `useEffect(() => {`
  - L183 `useEffect`: `useEffect(() => {`
  - … 11 more runtime lines omitted

### `src/routes/continue-shopping.tsx`
- **useEffect** ×1
  - L147 `useEffect`: `useEffect(() => {`

### `src/routes/deals.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L49 `useEffect`: `useEffect(() => {`
  - L50 `interval/timer`: `const id = setInterval(() => setNow(Date.now()), 1000);`

### `src/routes/help.seller-assistance.tsx`
- **useEffect** ×2, **interval/timer** ×7, **event listener** ×2
  - L161 `useEffect`: `useEffect(() => {`
  - L164 `interval/timer`: `const id = setInterval(tick, 30_000);`
  - L166 `event listener`: `document.addEventListener("visibilitychange", onVis);`
  - L167 `event listener`: `return () => { clearInterval(id); document.removeEventListener("visibilitychange", onVis); };`
  - L194 `useEffect`: `useEffect(() => {`
  - L201 `interval/timer`: `calendlyTimeoutRef.current = setTimeout(() => {`
  - L219 `interval/timer`: `calendlyTimeoutRef.current = setTimeout(() => {`
  - L253 `interval/timer`: `setTimeout(() => {`
  - L260 `interval/timer`: `setTimeout(() => {`
  - L274 `interval/timer`: `setTimeout(() => {`
  - … 1 more runtime lines omitted

### `src/routes/help.tsx`
- **interval/timer** ×4, **useEffect** ×3
  - L196 `interval/timer`: `setTimeout(() => setCopied(null), 1800);`
  - L512 `useEffect`: `useEffect(() => { scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [messages, typing]);`
  - L520 `interval/timer`: `setTimeout(() => {`
  - L623 `interval/timer`: `onBlur={() => setTimeout(() => setFocus(false), 150)}`
  - L677 `useEffect`: `useEffect(() => { const t = setTimeout(() => setLoaded(true), 350); return () => clearTimeout(t); }, []);`
  - L677 `interval/timer`: `useEffect(() => { const t = setTimeout(() => setLoaded(true), 350); return () => clearTimeout(t); }, []);`
  - L679 `useEffect`: `useEffect(() => {`

### `src/routes/index.tsx`
- **Suspense/lazy** ×4, **useEffect** ×2, **interval/timer** ×2, **event listener** ×2
  - L2 `Suspense/lazy`: `import { Suspense, lazy, useEffect, useMemo, useState } from "react";`
  - L16 `Suspense/lazy`: `const CategoryAdminSheet = lazy(() =>`
  - L62 `useEffect`: `useEffect(() => {`
  - L64 `interval/timer`: `const id = setInterval(() => setIdx((i) => (i + 1) % PLACEHOLDERS.length), 2800);`
  - L376 `useEffect`: `useEffect(() => {`
  - L379 `event listener`: `window.addEventListener("resize", onResize);`
  - L380 `event listener`: `return () => window.removeEventListener("resize", onResize);`
  - L517 `interval/timer`: `onBlur={() => setTimeout(() => setSearchFocused(false), 120)}`
  - L671 `Suspense/lazy`: `<Suspense fallback={null}>`
  - L673 `Suspense/lazy`: `</Suspense>`

### `src/routes/lovable/email/queue/process.ts`
- **interval/timer** ×1
  - L317 `interval/timer`: `await new Promise((r) => setTimeout(r, sendDelayMs))`

### `src/routes/orders.$id.tsx`
- **useEffect** ×2
  - L57 `useEffect`: `useEffect(() => {`
  - L61 `useEffect`: `useEffect(() => {`

### `src/routes/pages.$slug.tsx`
- **useEffect** ×1
  - L24 `useEffect`: `useEffect(() => {`

### `src/routes/products.$slug.tsx`
- **Suspense/lazy** ×7, **useEffect** ×8, **interval/timer** ×2, **requestAnimationFrame** ×2, **event listener** ×6
  - L6 `Suspense/lazy`: `import { useState, useEffect, useMemo, lazy, Suspense } from "react";`
  - L31 `Suspense/lazy`: `const AdminProductPanel = lazy(() =>`
  - L34 `Suspense/lazy`: `const AdminImageManager = lazy(() =>`
  - L215 `useEffect`: `useEffect(() => {`
  - L220 `useEffect`: `useEffect(() => {`
  - L240 `useEffect`: `useEffect(() => {`
  - L244 `interval/timer`: `const t = setTimeout(() => {`
  - L251 `useEffect`: `useEffect(() => { refreshProducts(); }, []);`
  - L253 `useEffect`: `useEffect(() => {`
  - L256 `interval/timer`: `const fallback = window.setTimeout(() => { if (active) setDataReady(true); }, 1200);`
  - … 15 more runtime lines omitted

### `src/routes/reset-password.tsx`
- **useEffect** ×1, **interval/timer** ×2
  - L24 `useEffect`: `useEffect(() => {`
  - L32 `interval/timer`: `const t = setTimeout(async () => {`
  - L54 `interval/timer`: `setTimeout(() => nav({ to: "/account" }), 1400);`

### `src/routes/returns.tsx`
- **useEffect** ×1, **interval/timer** ×1
  - L499 `useEffect`: `useEffect(() => {`
  - L500 `interval/timer`: `const t = setInterval(() => setNow(Date.now()), 1000);`

### `src/routes/search.tsx`
- **useEffect** ×5, **event listener** ×2
  - L209 `useEffect`: `useEffect(() => {`
  - L216 `event listener`: `window.addEventListener("scroll", onScroll, { passive: true });`
  - L217 `event listener`: `return () => window.removeEventListener("scroll", onScroll);`
  - L232 `useEffect`: `useEffect(() => { if (drawerOpen) setDraft(currentFilters); /* eslint-disable-next-line */ }, [drawerOpen]);`
  - L234 `useEffect`: `useEffect(() => {`
  - L249 `useEffect`: `useEffect(() => {`
  - L277 `useEffect`: `useEffect(() => {`

### `src/routes/track.tsx`
- **useEffect** ×5, **interval/timer** ×1
  - L92 `useEffect`: `useEffect(() => {`
  - L126 `useEffect`: `useEffect(() => {`
  - L144 `useEffect`: `useEffect(() => {`
  - L173 `useEffect`: `useEffect(() => {`
  - L194 `useEffect`: `useEffect(() => {`
  - L196 `interval/timer`: `const id = setInterval(() => setTick((t) => t + 1), 1000);`

### `src/routes/unsubscribe.tsx`
- **useEffect** ×1
  - L36 `useEffect`: `useEffect(() => {`

### `src/routes/wishlist.tsx`
- **useEffect** ×4
  - L112 `useEffect`: `useEffect(() => {`
  - L123 `useEffect`: `useEffect(() => {`
  - L148 `useEffect`: `useEffect(() => {`
  - L676 `useEffect`: `useEffect(() => {`

## Complete image/canvas/WebGL inventory

### `src/components/admin/CategoryAdminSheet.tsx`
- **Canvas readback** ×4
  - L102 `Canvas readback`: `const bitmap = await createImageBitmap(file);`
  - L107 `Canvas readback`: `const canvas = document.createElement("canvas");`
  - L110 `Canvas readback`: `const ctx = canvas.getContext("2d");`
  - L112 `Canvas readback`: `ctx.drawImage(bitmap, 0, 0, w, h);`

### `src/components/site/CategoryCard.tsx`
- **Image decode/preload** ×1
  - L98 `Image decode/preload`: `decoding="async"`

### `src/components/site/FlashDeals.tsx`
- **Image decode/preload** ×2
  - L79 `Image decode/preload`: `<img data-product-image src={p.image} alt={p.name} loading="lazy" decoding="async" className="w-full h-full object-cover" />`
  - L144 `Image decode/preload`: `decoding="async"`

### `src/components/site/HeroCarousel.tsx`
- **Image decode/preload** ×1
  - L115 `Image decode/preload`: `const img = new Image();`

### `src/components/site/ProductImage.tsx`
- **Image decode/preload** ×1
  - L91 `Image decode/preload`: `decoding="async"`

### `src/components/site/PromoBannerCarousel.tsx`
- **Image decode/preload** ×1
  - L157 `Image decode/preload`: `decoding="async"`

### `src/components/site/RecentlyViewed.tsx`
- **Image decode/preload** ×1
  - L40 `Image decode/preload`: `decoding="sync"`

### `src/components/site/WishlistCard.tsx`
- **Image decode/preload** ×1
  - L129 `Image decode/preload`: `decoding="sync"`

### `src/components/site/WishlistRecommendations.tsx`
- **Image decode/preload** ×1
  - L26 `Image decode/preload`: `decoding="sync"`

### `src/lib/image-palette.ts`
- **Image decode/preload** ×2, **Canvas readback** ×4
  - L119 `Image decode/preload`: `const img = new Image();`
  - L121 `Image decode/preload`: `img.decoding = "async";`
  - L132 `Canvas readback`: `const canvas = document.createElement("canvas");`
  - L135 `Canvas readback`: `const ctx = canvas.getContext("2d", { willReadFrequently: true });`
  - L137 `Canvas readback`: `ctx.drawImage(img, 0, 0, size, size);`
  - L138 `Canvas readback`: `const { data } = ctx.getImageData(0, 0, size, size);`

### `src/lib/media-engine.ts`
- **Image decode/preload** ×1, **Canvas readback** ×6
  - L77 `Image decode/preload`: `const img = new Image();`
  - L101 `Canvas readback`: `const canvas = document.createElement("canvas");`
  - L104 `Canvas readback`: `const ctx = canvas.getContext("2d");`
  - L107 `Canvas readback`: `ctx.drawImage(source, 0, 0, w, h);`
  - L133 `Canvas readback`: `const canvas = document.createElement("canvas");`
  - L136 `Canvas readback`: `const ctx = canvas.getContext("2d");`
  - L140 `Canvas readback`: `ctx.drawImage(`

### `src/lib/startup-diagnostics.ts`
- **WebGL/context loss** ×2
  - L263 `WebGL/context loss`: `"webglcontextlost",`
  - L272 `WebGL/context loss`: `"webglcontextrestored",`

### `src/routes/account.tsx`
- **Image decode/preload** ×1
  - L741 `Image decode/preload`: `<img data-product-image src={p.image} alt={p.name} loading="lazy" decoding="sync" className="w-full h-full object-cover transition-opacity duration-500" />`

### `src/routes/checkout.tsx`
- **Image decode/preload** ×1
  - L368 `Image decode/preload`: `const probe = new Image();`

### `src/routes/continue-shopping.tsx`
- **Image decode/preload** ×1
  - L87 `Image decode/preload`: `decoding="sync"`

### `src/routes/index.tsx`
- **Image decode/preload** ×1
  - L610 `Image decode/preload`: `decoding="async"`

## Implemented ultra-low-end Android guardrails

- `detectUltraLowEndAndroid`: Android + `deviceMemory <= 4`, `hardwareConcurrency <= 4`, reduced motion, or Android with hidden memory signal.
- First-paint HTML flag: `data-ultra-low-end="true"` is set before CSS paints, preventing a one-frame mount of blur/3D layers.
- CSS kill switch: last block in `styles.css` disables animation, transition, transform, translate/rotate/scale, perspective, filter, backdrop-filter, blend modes, masks, `will-change`, `contain`, `content-visibility`, isolation, and nonessential shadows only under `html[data-ultra-low-end="true"]`.
- Hero carousel: ultra/low-end skips IntersectionObserver, autoplay interval, adjacent image preloads, palette sampling and side-card rendering.
- Product media: ultra mode uses static white media background and no skeleton/opacity-gated reveal.
- Product images: ultra mode avoids `src/srcset` removal on unmount and requests smaller storage variants, preventing forced texture teardown/recreation.
- Lazy/Suspense overlays: deferred shell returns `null` on ultra-low-end Android to avoid late code-split/UI memory spikes.
- Diagnostics: logs `gpu-context-lost`, `gpu-context-restored`, `product-image-error`, compositor snapshots, and short-lived layer-candidate mutations to `fom_startup_diagnostics` and console.