import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useEffect, useRef, useState } from "react";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  useRouterState,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";

import appCss from "../styles.css?url";
import { AiShoppingMount } from "@/components/chat/AiShoppingMount";
import { ShoppingContextPublisher } from "@/components/chat/ShoppingContextPublisher";
import { GpuCompatBanner } from "@/components/site/GpuCompatBanner";
import { MotionConfig } from "framer-motion";
import { RegionProvider } from "@/lib/region";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
import { GraphicsCompatProvider } from "@/lib/graphics-compat";
import { WishlistProvider } from "@/lib/wishlist";
import { WishlistAlertsProvider } from "@/lib/wishlist-alerts";
import { NotificationsProvider } from "@/lib/notifications";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { AdminModeProvider } from "@/lib/admin-mode";
import { CommandCenterProvider } from "@/lib/command-center";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { SearchUIProvider, useSearchUI } from "@/lib/search-ui";
import { registerServiceWorker } from "@/lib/pwa";
import { logBuildVersion, BUILD_ID } from "@/lib/build-version";
import { preloadCrisp } from "@/lib/crisp";
import { trackPageView } from "@/lib/analytics";
import { loadProducts, useProducts } from "@/lib/use-products";
import { captureAttribution } from "@/lib/marketing-tracking";
import { LayoutMetricsProvider } from "@/lib/layout-metrics";
import { BadgeEngineProvider } from "@/lib/badge-visibility";
import { Toaster } from "@/components/ui/sonner";
import { SyncToastsMount } from "@/lib/infra/sync-toasts";
import { ShareDialog } from "@/components/site/ShareDialog";
import { FloatingContextObserver } from "@/components/site/FloatingContextObserver";

import { completeOAuthReturn, hasOAuthReturnParams } from "@/lib/oauth-return";
import { safeInternalPath } from "@/lib/safe-redirect";
import { startPerfMonitoring } from "@/lib/perf-monitor";
import { startCapabilityGovernor, publishRenderDiagnostics } from "@/lib/runtime-capability";
import { startMotionTier } from "@/lib/motion-tier";
import { lazyWithRetry, installChunkRecovery } from "@/lib/chunk-recovery";
import { AppErrorBoundary } from "@/components/site/AppErrorBoundary";
import { IsolatedBoundary } from "@/components/site/IsolatedBoundary";
import { installStartupDiagnostics, useRenderDiagnostics } from "@/lib/startup-diagnostics";
import { initDebugFlags, getFlag } from "@/lib/debug-flags";
// debug-diagnostics (~600 LOC) and compat-confidence (~470 LOC) are
// dynamic-imported inside the mount effect below so they don't add parse
// cost to the initial bundle — they only run once, after mount, anyway.
// Perf v3 — debug overlays are self-gated to render nothing in prod, but
// static imports still shipped ~1.1k LOC of parse cost on every cold load.
// Lazy so they only enter the initial bundle when the user actually opens
// them (dev/admin/?debug flags).
const DebugPanel = lazyWithRetry(() =>
  import("@/components/site/DebugPanel").then((m) => ({ default: m.DebugPanel })),
);
const WindowMetricsPanel = lazyWithRetry(() =>
  import("@/components/site/WindowMetricsPanel").then((m) => ({ default: m.WindowMetricsPanel })),
);
import { useRegion } from "@/lib/region";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { buildVisibleMap } from "@/lib/product-availability";
import { RecommendationProvider } from "@/lib/recommendations";

const HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const STARTUP_GUARD_SCRIPT = `(function(){
  if (typeof window === 'undefined') return;
  var BUILD_ID = ${JSON.stringify(BUILD_ID)};
  // Exponential backoff schedule (ms) used only when a real chunk failure
  // triggers recovery. Never used for connectivity blips.
  var BACKOFF = [1000, 2000, 4000, 8000, 15000];
  var POLL_INTERVAL = 30000;

  // -------- Connection state machine (single source of truth) -----------
  // States: 'healthy' | 'offline' | 'recovering'
  // Transitions are debounced (3s) and toasts throttled (60s cooldown).
  var state = 'healthy';
  var recovering = false;               // an actual reload is scheduled
  var hadRealOfflinePeriod = false;     // sticky flag for the current session
  var lastToastAt = 0;                  // cooldown timestamp
  var offlineDebounceTimer = 0;
  var onlineDebounceTimer = 0;
  var STABLE_MS = 3000;
  var COOLDOWN_MS = 60000;

  function txt(x){
    try { return typeof x === 'string' ? x : (x && (x.message || (x.reason && x.reason.message) || x.type || '')) || ''; }
    catch(e){ return ''; }
  }
  function urlOf(x){
    try {
      if (!x) return '';
      if (typeof x === 'string') return x;
      return x.href || x.src || (x.target && (x.target.src || x.target.href)) || '';
    } catch(e){ return ''; }
  }
  function isEntryFailure(x){
    return /Failed to fetch dynamically imported module|virtual:tanstack-start-client-entry|vite:preloadError|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Loading CSS chunk/i.test(String(txt(x)));
  }
  function isAssetUrl(u){ return /\\/assets\\/.*\\.(js|css|mjs)/i.test(String(u || '')); }
  function getCount(){ try { return parseInt(sessionStorage.getItem('fom_auto_reload_count') || '0', 10) || 0; } catch(e){ return 0; } }
  function setCount(n){ try { sessionStorage.setItem('fom_auto_reload_count', String(n)); } catch(e){} }
  function markStart(){ try { sessionStorage.setItem('fom_recovery_started', String(Date.now())); } catch(e){} }
  function readStart(){ try { return parseInt(sessionStorage.getItem('fom_recovery_started') || '0', 10) || 0; } catch(e){ return 0; } }
  function clearStart(){ try { sessionStorage.removeItem('fom_recovery_started'); } catch(e){} }
  function markRealOffline(){
    hadRealOfflinePeriod = true;
    try { sessionStorage.setItem('fom_real_offline', '1'); } catch(e){}
  }
  function hadRealOffline(){
    if (hadRealOfflinePeriod) return true;
    try { return sessionStorage.getItem('fom_real_offline') === '1'; } catch(e){ return false; }
  }
  function clearRealOffline(){
    hadRealOfflinePeriod = false;
    try { sessionStorage.removeItem('fom_real_offline'); } catch(e){}
  }

  function log(name, payload){
    try {
      var item = { event: name, at: new Date().toISOString(), path: location.pathname, build: BUILD_ID, payload: payload || {} };
      var arr = JSON.parse(localStorage.getItem('fom_startup_diagnostics') || '[]');
      if (!Array.isArray(arr)) arr = [];
      arr.push(item);
      localStorage.setItem('fom_startup_diagnostics', JSON.stringify(arr.slice(-80)));
    } catch(e) {}
    try { console.warn('[startup-diagnostics]', name, payload || {}); } catch(e) {}
  }
  function diag(reason, prev, next, source, extra){
    log('recovery-transition', {
      reason: reason || '',
      prev: prev, next: next, source: source || '',
      at: Date.now(), extra: extra || {}
    });
  }

  // Premium native-style pill toast. Injected by this inline script so it
  // works even before React hydrates. Rendering is purely presentational —
  // gating decisions live in the state machine below.
  var toastEl = null;
  var toastHideTimer = 0;
  function ensureToast(){
    if (toastEl && document.body && toastEl.parentNode === document.body) return toastEl;
    if (!document.body) return null;
    toastEl = document.createElement('div');
    toastEl.id = 'fom-connection-toast';
    toastEl.setAttribute('role', 'status');
    toastEl.setAttribute('aria-live', 'polite');
    toastEl.style.cssText = [
      'position:fixed',
      'left:50%',
      'bottom:calc(env(safe-area-inset-bottom,0px) + 96px)',
      'transform:translate(-50%,20px)',
      'z-index:2147483647',
      'pointer-events:none',
      'opacity:0',
      'transition:opacity .25s ease,transform .25s ease',
      'height:40px',
      'max-height:48px',
      'display:inline-flex',
      'align-items:center',
      'gap:8px',
      'background:rgba(10,10,10,.88)',
      'color:#f5f5f5',
      'border:1px solid rgba(245,158,11,.4)',
      'border-radius:9999px',
      'padding:0 18px',
      'font:500 13px/1.2 system-ui,-apple-system,Segoe UI,Roboto,sans-serif',
      'letter-spacing:.01em',
      'box-shadow:0 10px 30px rgba(0,0,0,.35),0 0 0 1px rgba(245,158,11,.08)',
      '-webkit-backdrop-filter:blur(14px) saturate(140%)',
      'backdrop-filter:blur(14px) saturate(140%)',
      'max-width:calc(100vw - 32px)',
      'white-space:nowrap',
      'overflow:hidden',
      'text-overflow:ellipsis'
    ].join(';') + ';';
    var dot = document.createElement('span');
    dot.setAttribute('data-dot', '');
    dot.style.cssText = 'width:8px;height:8px;border-radius:9999px;background:#f59e0b;box-shadow:0 0 10px rgba(245,158,11,.7);flex:0 0 auto;';
    var label = document.createElement('span');
    label.setAttribute('data-label', '');
    toastEl.appendChild(dot);
    toastEl.appendChild(label);
    document.body.appendChild(toastEl);
    return toastEl;
  }
  function renderToast(msg, opts){
    var tone = (opts && opts.tone) || 'progress';
    var autoHide = opts && typeof opts.autoHide === 'number' ? opts.autoHide : (tone === 'success' ? 1800 : 0);
    var commit = function(){
      var el = ensureToast();
      if (!el) return;
      var label = el.querySelector('[data-label]');
      var dot = el.querySelector('[data-dot]');
      if (label) label.textContent = msg;
      if (dot){
        if (tone === 'success'){ dot.style.background = '#22c55e'; dot.style.boxShadow = '0 0 10px rgba(34,197,94,.7)'; }
        else if (tone === 'offline'){ dot.style.background = '#a3a3a3'; dot.style.boxShadow = 'none'; }
        else { dot.style.background = '#f59e0b'; dot.style.boxShadow = '0 0 10px rgba(245,158,11,.7)'; }
      }
      if (toastHideTimer){ clearTimeout(toastHideTimer); toastHideTimer = 0; }
      requestAnimationFrame(function(){
        el.style.opacity = '1';
        el.style.transform = 'translate(-50%,0)';
      });
      if (autoHide > 0){ toastHideTimer = setTimeout(hideToast, autoHide); }
    };
    if (document.body) commit();
    else document.addEventListener('DOMContentLoaded', commit, { once: true });
  }
  function hideToast(){
    if (!toastEl) return;
    if (toastHideTimer){ clearTimeout(toastHideTimer); toastHideTimer = 0; }
    toastEl.style.opacity = '0';
    toastEl.style.transform = 'translate(-50%,20px)';
  }
  // Public direct-toast bridge (used by non-recovery UI). Bypasses the
  // state machine intentionally — callers own their own throttling.
  window.__fomShowToast = function(msg, opts){ renderToast(msg, opts); };
  window.__fomHideToast = hideToast;

  // Gated recovery toast — respects cooldown and current state.
  function recoveryToast(msg, opts){
    var now = Date.now();
    if (now - lastToastAt < COOLDOWN_MS) return false;
    lastToastAt = now;
    renderToast(msg, opts);
    return true;
  }

  function telemetry(reason, assetUrl, status){
    log('asset-load-failure', {
      asset: assetUrl || urlOf(reason),
      status: (status == null ? '' : status),
      deploy: BUILD_ID,
      ua: (navigator.userAgent || '').slice(0, 300),
      online: !!navigator.onLine,
      retry: getCount(),
      reason: txt(reason)
    });
  }

  function reloadFresh(){
    try {
      var u = new URL(location.href);
      u.searchParams.set('_rc', String(Date.now()));
      location.replace(u.toString());
    } catch(e){ try { location.reload(); } catch(x){} }
  }

  // Real recovery: only invoked when we KNOW the app is unusable (chunk
  // load failure, entry-script failure, or a caller explicitly claiming a
  // chunk error). Never invoked on visibility/queue/health events.
  function doRecover(reason, assetUrl, status){
    if (recovering) return;
    var prev = state;
    telemetry(reason, assetUrl, status);
    if (!readStart()) markStart();

    if (!navigator.onLine){
      if (state !== 'offline'){ state = 'offline'; markRealOffline(); }
      diag(txt(reason), prev, 'offline', 'chunk-while-offline');
      recoveryToast("You're offline", { tone: 'offline' });
      var onOnline = function(){
        window.removeEventListener('online', onOnline);
        doRecover(reason, assetUrl, status);
      };
      window.addEventListener('online', onOnline);
      return;
    }

    var count = getCount();
    var delay = count < BACKOFF.length ? BACKOFF[count] : POLL_INTERVAL;
    recovering = true;
    state = 'recovering';
    setCount(count + 1);
    // First attempt: silent within cooldown. Deep retries (>=2) show the
    // subtle pill so the user knows something is happening.
    if (count === 0) recoveryToast('Reconnecting…');
    else if (count >= 2) recoveryToast('Trying to reconnect…');
    diag(txt(reason), prev, 'recovering', 'chunk-error', { attempt: count + 1, delayMs: delay });
    setTimeout(reloadFresh, delay);
  }

  // Public recovery hook — accepts an optional reason. Only acts on
  // genuine chunk / entry-script failures OR when the caller sets
  // { force: true }. Other errors are ignored (logged only).
  window.__fomRecover = function(reason, opts){
    var forced = !!(opts && opts.force);
    if (!forced && !isEntryFailure(reason)){
      log('recovery-ignored', { reason: txt(reason).slice(0, 200) });
      return;
    }
    doRecover(reason, urlOf(reason), null);
  };
  // Legacy full-screen fatal hook: same rule — only recover for real
  // chunk failures. Do NOT reload on generic React errors.
  window.__fomShowStartupError = function(reason){
    if (!isEntryFailure(reason)){ log('startup-error-ignored', { reason: txt(reason).slice(0, 200) }); return; }
    doRecover(reason, urlOf(reason), null);
  };
  window.__fomBootOk = function(){
    var started = readStart();
    var recoveredFrom = started ? Date.now() - started : 0;
    log('boot-ok', recoveredFrom ? { recoveredInMs: recoveredFrom, attempts: getCount() } : {});
    setCount(0);
    clearStart();
    state = 'healthy';
    recovering = false;
    // Only surface "Connection restored" when the user actually experienced
    // a real offline period during this session AND recovery was triggered.
    if (recoveredFrom > 0 && hadRealOffline() && (Date.now() - lastToastAt) >= 1200){
      recoveryToast('Connection restored', { tone: 'success', autoHide: 1800 });
    } else {
      hideToast();
    }
    clearRealOffline();
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('_rc') || u.searchParams.has('_v')) {
        u.searchParams.delete('_rc');
        u.searchParams.delete('_v');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      }
    } catch(e){}
  };

  // -------------- Debounced online/offline transitions ------------------
  function onOfflineRaw(){
    log('network-offline-raw');
    if (onlineDebounceTimer){ clearTimeout(onlineDebounceTimer); onlineDebounceTimer = 0; }
    if (offlineDebounceTimer) return;
    offlineDebounceTimer = setTimeout(function(){
      offlineDebounceTimer = 0;
      if (navigator.onLine) return; // flapped back within debounce window
      if (state === 'offline') return;
      var prev = state; state = 'offline';
      markRealOffline();
      diag('network-offline', prev, 'offline', 'network');
      recoveryToast("You're offline", { tone: 'offline' });
    }, STABLE_MS);
  }
  function onOnlineRaw(){
    log('network-online-raw');
    if (offlineDebounceTimer){ clearTimeout(offlineDebounceTimer); offlineDebounceTimer = 0; }
    // If we never actually transitioned to 'offline', do nothing.
    if (state !== 'offline' && !hadRealOffline()) return;
    if (onlineDebounceTimer) return;
    onlineDebounceTimer = setTimeout(function(){
      onlineDebounceTimer = 0;
      if (!navigator.onLine) return;
      if (state === 'healthy') return;
      var prev = state; state = 'healthy';
      diag('network-online', prev, 'healthy', 'network');
      // "Connection restored" only fires when we truly had an offline period.
      recoveryToast('Connection restored', { tone: 'success', autoHide: 1600 });
      clearRealOffline();
    }, STABLE_MS);
  }
  window.addEventListener('online', onOnlineRaw);
  window.addEventListener('offline', onOfflineRaw);

  // Visibility changes: silent. Log only. Never toast.
  document.addEventListener('visibilitychange', function(){
    if (document.visibilityState !== 'visible') return;
    log('visibility-revalidate');
  });

  // Chunk / entry-script failure surface — the only genuine triggers for
  // real recovery. Media/image errors are ignored.
  window.addEventListener('vite:preloadError', function(e){
    try { e.preventDefault(); } catch(x) {}
    var p = e && e.payload;
    doRecover(p || e, urlOf(p || e), null);
  });
  window.addEventListener('unhandledrejection', function(e){
    if (isEntryFailure(e.reason)) {
      try { e.preventDefault(); } catch(x) {}
      doRecover(e.reason, urlOf(e.reason), null);
    }
  });
  window.addEventListener('error', function(e){
    var t = e && e.target;
    var src = t && (t.src || t.href) || '';
    // Only script/css chunk failures — never <img>, <video>, etc.
    var tag = t && t.tagName ? String(t.tagName).toLowerCase() : '';
    var chunkTag = tag === 'script' || tag === 'link';
    if (isEntryFailure(e && e.message) || (chunkTag && isAssetUrl(src))){
      doRecover(e && e.message || src, src, null);
    }
  }, true);
})();`;



// (Removed temporary FF binary-search isolation script — all diagnostic
// URL-flag experiments have been retired in favour of the permanent
// Compatibility Mode driven by the WebGL gate below.)

// Non-critical client-only shell: deferred out of the entry bundle so the
// homepage/product/search first paint never pays for admin tooling, the live
// chat widget, the compare tray, or the install prompt. These mount after
// hydration via the <DeferredShell> gate below.
const AdminFloatingToolbar = lazyWithRetry(() =>
  import("@/components/admin/AdminFloatingToolbar").then((m) => ({
    default: m.AdminFloatingToolbar,
  })),
);
const AdminOverlayIndicator = lazyWithRetry(() =>
  import("@/components/admin/AdminOverlayIndicator").then((m) => ({
    default: m.AdminOverlayIndicator,
  })),
);
const AdminCommandCenter = lazyWithRetry(() =>
  import("@/components/admin/AdminCommandCenter").then((m) => ({ default: m.AdminCommandCenter })),
);
const AdminMobileBar = lazyWithRetry(() =>
  import("@/components/admin/AdminMobileBar").then((m) => ({ default: m.AdminMobileBar })),
);
const CompareTray = lazyWithRetry(() =>
  import("@/components/site/CompareTray").then((m) => ({ default: m.CompareTray })),
);
const InstallPrompt = lazyWithRetry(() =>
  import("@/components/site/InstallPrompt").then((m) => ({ default: m.InstallPrompt })),
);
const LiveChat = lazyWithRetry(() =>
  import("@/components/chat/LiveChat").then((m) => ({ default: m.LiveChat })),
);
// Communication Hub is tiny (~4KB) and always mounted so the chooser opens
// instantly. The AI Shopping Assistant is lazy — its JS + chat state only
// load after the customer picks "AI Shopping" for the first time.
const CommunicationHub = lazyWithRetry(() =>
  import("@/components/chat/CommunicationHub").then((m) => ({ default: m.CommunicationHub })),
);
// AiShoppingMount is a ~1KB gatekeeper (event listener only). It stays in
// the main bundle so it can catch the very first `fom:ai:open` event; the
// heavy AiShoppingAssistant it renders is lazy-loaded inside it.
const SearchCommand = lazyWithRetry(() =>
  import("@/components/site/SearchCommand").then((m) => ({
    default: m.SearchCommand as unknown as React.ComponentType<unknown>,
  })),
) as unknown as React.ComponentType<{ open: boolean; onClose: () => void }>;

/** The single, app-wide immersive search surface. Rendered once here and driven
 *  by SearchUIContext, so both the top-nav icon and the bottom-nav tab open the
 *  exact same UI, state, and animation. */
function GlobalSearchMount() {
  const { open, closeSearch } = useSearchUI();
  if (!open) return null;
  return (
    <Suspense fallback={null}>
      <SearchCommand open={open} onClose={closeSearch} />
    </Suspense>
  );
}
const SupportReplyWatcher = lazyWithRetry(() =>
  import("@/components/chat/SupportReplyWatcher").then((m) => ({
    default: m.SupportReplyWatcher,
  })),
);
const RegionSelectModal = lazyWithRetry(() =>
  import("@/components/site/RegionSelectModal").then((m) => ({ default: m.RegionSelectModal })),
);


function NotFoundComponent() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-display font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-full bg-accent px-6 py-3 text-xs font-medium uppercase tracking-widest text-accent-foreground transition-colors hover:brightness-110"
          >
            Back to shop
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    const w = window as unknown as {
      __fomShowToast?: (msg: string) => void;
      __fomRecover?: (reason?: unknown) => void;
    };
    w.__fomShowToast?.("Reconnecting…");
    // Silently retry the loader a few times before falling back to the
    // background recovery pipeline. No full-screen error page ever renders.
    let cancelled = false;
    let attempt = 0;
    const tick = () => {
      if (cancelled) return;
      attempt += 1;
      router.invalidate();
      reset();
      if (attempt < 5) {
        setTimeout(tick, 1200 + Math.round(Math.random() * 400));
      } else {
        w.__fomRecover?.(error);
      }
    };
    const t = setTimeout(tick, 1000);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [error, reset, router]);
  // Render nothing — the previous route content stays visible under the toast.
  return null;
}



export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      {
        name: "viewport",
        content:
          "width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover",
      },
      { title: "FoundOurMarket™ | Premium Global Marketplace" },
      {
        name: "description",
        content:
          "Discover premium products worldwide with secure shopping, trusted sellers, and a luxury marketplace experience built for modern consumers.",
      },
      { name: "application-name", content: "FoundOurMarket" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "FoundOurMarket" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:title", content: "FoundOurMarket™ | Premium Global Marketplace" },
      {
        property: "og:description",
        content:
          "Discover premium products worldwide with secure shopping, trusted sellers, and a luxury marketplace experience built for modern consumers.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://foundourmarket.com/" },
      { property: "og:site_name", content: "FoundOurMarket" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "twitter:title", content: "FoundOurMarket™ | Premium Global Marketplace" },
      {
        name: "twitter:description",
        content:
          "Discover premium products worldwide with secure shopping, trusted sellers, and a luxury marketplace experience built for modern consumers.",
      },
      {
        property: "og:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/WNBAvMpbiIc783NsRzlYQb1I1wj1/social-images/social-1779938854051-1000130607.webp",
      },
      {
        name: "twitter:image",
        content:
          "https://storage.googleapis.com/gpt-engineer-file-uploads/WNBAvMpbiIc783NsRzlYQb1I1wj1/social-images/social-1779938854051-1000130607.webp",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      // Fonts are now self-hosted (see @font-face in styles.css), removing the
      // render-blocking Google Fonts CSS request and the cross-origin font
      // waterfall that delayed the hero LCP text. Preload only the hero h1
      // weight (Space Grotesk 600) so the LCP text paints with its final font
      // immediately — no swap/reflow on the largest contentful element.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/space-grotesk-latin-600-normal.woff2",
        crossOrigin: "anonymous",
      },
      // Preload the body weight used by above-the-fold labels (feature/trust
      // cards render in DM Sans 500). Without this, Chrome paints them in the
      // fallback font on cold refresh, then swaps once DM Sans loads — the
      // width change reflows the centered labels into a first-paint flicker.
      {
        rel: "preload",
        as: "font",
        type: "font/woff2",
        href: "/fonts/dm-sans-latin-500-normal.woff2",
        crossOrigin: "anonymous",
      },
      // Warm up the data API connection (DNS + TLS) on every page so the very
      // first products/categories query — which happens on most routes — skips
      // the cold-connection handshake and returns faster.
      ...(import.meta.env.VITE_SUPABASE_URL
        ? [
            {
              rel: "preconnect",
              href: import.meta.env.VITE_SUPABASE_URL as string,
              crossOrigin: "anonymous" as const,
            },
            { rel: "dns-prefetch", href: import.meta.env.VITE_SUPABASE_URL as string },
          ]
        : []),
      { rel: "preconnect", href: "https://client.crisp.chat", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://client.crisp.chat" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", href: "/favicon-16.png", type: "image/png", sizes: "16x16" },
      { rel: "icon", href: "/favicon-32.png", type: "image/png", sizes: "32x32" },
      { rel: "icon", href: "/favicon-48.png", type: "image/png", sizes: "48x48" },
      { rel: "icon", href: "/icon-192.png", type: "image/png", sizes: "192x192" },
      { rel: "icon", href: "/icon-512.png", type: "image/png", sizes: "512x512" },
      { rel: "apple-touch-icon", href: "/apple-touch-icon.png", sizes: "180x180" },
      { rel: "mask-icon", href: "/favicon-64.png", color: "#f59e0b" },
    ],
    scripts: [
      {
        children: STARTUP_GUARD_SCRIPT,
      },
      {
        // No-FOUC theme init: resolve the stored theme preference (default
        // "system") and set data-theme/.dark before first paint.
        children:
          "(function(){var d=document.documentElement;try{var p=localStorage.getItem('fom-theme')||'system';var e=p==='system'?(window.matchMedia&&window.matchMedia('(prefers-color-scheme: dark)').matches?'dark':'light'):p;d.setAttribute('data-theme',e);d.classList.toggle('dark',e==='dark');}catch(x){d.setAttribute('data-theme','dark');d.classList.add('dark');}})();",
      },
      {
        // Graphics Compatibility Mode: if the user explicitly enabled it, apply
        // the existing render-safe path BEFORE first paint (no flash of the
        // premium effects). Reuses data-render-safe; no GPU blocklist.
        children:
          "(function(){try{if(localStorage.getItem('fom-graphics-compat')==='on'){document.documentElement.setAttribute('data-graphics-compat','true');}}catch(e){}})();",
      },





      {
        // Pre-paint hardware-signal probe for the Affected-Device Confidence
        // System (see src/lib/compat-confidence.ts). This script NO LONGER
        // activates Compatibility Mode from a single hardware/UA signal — a
        // suspect GPU family or old browser alone is NOT enough. It only:
        //   1. Records the WebGL renderer + Android/engine signals as data-*
        //      attributes for the confidence engine to read, and
        //   2. Re-applies data-gpu-unsafe before first paint ONLY for a
        //      renderer signature that was CONFIRMED-affected (score >= 90%,
        //      combining hardware + verified runtime evidence) in a prior
        //      session — so a proven-bad device doesn't flash corruption again.
        // First-time affected devices activate at runtime once evidence crosses
        // the threshold; healthy Mali/Chromium devices never activate.
        children:
          "(function(){var d=document.documentElement;function rd(){try{var c=document.createElement('canvas');var gl=c.getContext('webgl')||c.getContext('experimental-webgl');if(!gl)return '';var e=gl.getExtension('WEBGL_debug_renderer_info');var s=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);return (s||'').toString();}catch(x){return '';}}var R='unknown';try{var ua=navigator.userAgent||'';var r=rd();R=r||'unknown';d.setAttribute('data-gpu-renderer',R);if(/Android/.test(ua))d.setAttribute('data-android','true');var eng='';var m;if((m=ua.match(/SamsungBrowser\\/(\\d+)/))&&parseInt(m[1],10)<14)eng='samsung';else if(/Android/.test(ua)&&(m=ua.match(/Chrome\\/(\\d+)/))&&parseInt(m[1],10)<80)eng='chromium';if(eng)d.setAttribute('data-compat-engine',eng);var on=false;try{var raw=localStorage.getItem('fom-compat-activated');if(raw){var a=JSON.parse(raw);if(a&&a.sig===R){on=true;d.setAttribute('data-gpu-unsafe','true');d.setAttribute('data-compat-reason',a.reason||'gpu');}}}catch(e){}if(!on)d.setAttribute('data-gpu-unsafe','false');}catch(y){d.setAttribute('data-gpu-unsafe','false');}try{window.__fomCompat=function(){var flags={};var names=d.getAttributeNames?d.getAttributeNames():[];for(var i=0;i<names.length;i++){var n=names[i];if(n.indexOf('data-')===0&&(/android|gpu|compat|degrade|low-end|render-safe|ultra|ff-/.test(n)))flags[n]=d.getAttribute(n);}var info={webglRenderer:R,userAgent:navigator.userAgent,compatibilityMode:d.getAttribute('data-gpu-unsafe')==='true',flags:flags};try{console.info('%c[FOM Compatibility]','color:#ff8a3d;font-weight:bold',info);}catch(e){}return info;};}catch(w){}})();",
      },



      {

        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "FoundOurMarket",
          alternateName: "FoundOurMarket Marketplace",
          url: "https://foundourmarket.com/",
          logo: "https://foundourmarket.com/logo.webp",
          description:
            "Premium global marketplace offering curated products with secure shopping, trusted sellers, and worldwide delivery.",
          contactPoint: {
            "@type": "ContactPoint",
            email: "support@foundourmarket.com",
            contactType: "customer support",
            availableLanguage: ["English"],
          },
          sameAs: [
            "https://www.instagram.com/foundourmarket",
            "https://www.facebook.com/foundourmarket",
            "https://twitter.com/foundourmarket",
          ],
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "FoundOurMarket",
          alternateName: "FoundOurMarket Marketplace",
          url: "https://foundourmarket.com/",
          potentialAction: {
            "@type": "SearchAction",
            target: "https://foundourmarket.com/search?q={search_term_string}",
            "query-input": "required name=search_term_string",
          },
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

/**
 * Mounts non-critical, client-only overlays (admin tooling, live chat, compare
 * tray, install prompt) after first paint + an idle tick. This keeps their code
 * out of the entry bundle and off the critical hydration path, cutting TBT and
 * speeding up LCP on the homepage / product / search routes.
 */
function DeferredShell({
  isAuthRoute,
  hideLiveChat,
}: {
  isAuthRoute: boolean;
  isAdminRoute?: boolean;
  hideLiveChat?: boolean;
}) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric = (
      window as unknown as {
        requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
      }
    ).requestIdleCallback;
    if (ric) {
      const id = ric(() => setReady(true), { timeout: 3000 });
      return () => {
        const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void })
          .cancelIdleCallback;
        cancel?.(id);
      };
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      <IsolatedBoundary name="RegionSelectModal"><RegionSelectModal /></IsolatedBoundary>
      {!isAuthRoute && <IsolatedBoundary name="AdminMobileBar"><AdminMobileBar /></IsolatedBoundary>}
      {!isAuthRoute && <IsolatedBoundary name="AdminFloatingToolbar"><AdminFloatingToolbar /></IsolatedBoundary>}
      {!isAuthRoute && <IsolatedBoundary name="AdminOverlayIndicator"><AdminOverlayIndicator /></IsolatedBoundary>}
      {!isAuthRoute && <IsolatedBoundary name="AdminCommandCenter"><AdminCommandCenter /></IsolatedBoundary>}
      <IsolatedBoundary name="CompareTray"><CompareTray /></IsolatedBoundary>
      <IsolatedBoundary name="InstallPrompt"><InstallPrompt /></IsolatedBoundary>
      {!hideLiveChat && <IsolatedBoundary name="LiveChat"><LiveChat /></IsolatedBoundary>}
      {!hideLiveChat && <IsolatedBoundary name="CommunicationHub"><CommunicationHub /></IsolatedBoundary>}
      {!hideLiveChat && <IsolatedBoundary name="AiShoppingAssistant"><AiShoppingMount /></IsolatedBoundary>}
      <IsolatedBoundary name="ShoppingContextPublisher"><ShoppingContextPublisher /></IsolatedBoundary>
      {!hideLiveChat && <IsolatedBoundary name="SupportReplyWatcher"><SupportReplyWatcher /></IsolatedBoundary>}
    </Suspense>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <noscript>
          <div
            style={{
              fontFamily: "system-ui, -apple-system, sans-serif",
              maxWidth: "28rem",
              margin: "3rem auto",
              padding: "1.5rem",
              textAlign: "center",
              color: "#111",
            }}
          >
            <h1 style={{ fontSize: "1.25rem", margin: "0 0 0.5rem" }}>
              FoundOurMarket™
            </h1>
            <p style={{ color: "#4b5563", margin: 0 }}>
              This store needs JavaScript enabled to load. Please turn on
              JavaScript or update your browser, then reload the page.
            </p>
          </div>
        </noscript>
        {children}
        <Scripts />
      </body>

    </html>
  );
}

function OAuthReturnScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-background px-6">
      <div className="max-w-xs text-center">
        <div className="mx-auto mb-5 size-16 overflow-hidden rounded-2xl bg-card shadow-lg ring-1 ring-border">
          <img src="/logo.webp" alt="FoundOurMarket" className="h-full w-full object-cover" />
        </div>
        <h1 className="font-display text-xl font-semibold text-foreground">Completing sign-in…</h1>
        <p className="mt-2 text-sm text-muted-foreground">Just a moment while we finish up</p>
      </div>
    </div>
  );
}

/**
 * TEMPORARY — runtime-isolation baseline switch.
 *
 * Route "/runtime-isolation" must run with a TRUE zero-runtime baseline: none
 * of the global providers, chrome, effects, analytics, or overlays that the
 * normal app shell mounts. Because React hooks can't be conditional, we branch
 * at the component level here — RootComponent is a thin switch that mounts a
 * completely separate tree per route. Production routes render <AppRoot />,
 * which is byte-for-byte the previous RootComponent body (unchanged behavior).
 * Only "/runtime-isolation" renders <IsolationRoot />.
 */
function RootComponent() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  if (pathname === "/runtime-isolation") return <IsolationRoot />;
  return <AppRoot />;
}

/**
 * Minimal layout for "/runtime-isolation" ONLY. Keeps the bare minimum needed
 * to render the product grid:
 *   - QueryClientProvider  (data loading / router query context)
 *   - AuthProvider         (required: RegionProvider + WishlistProvider read useAuth)
 *   - RegionProvider       (required: ProductCard calls useRegion for pricing)
 *   - WishlistProvider     (required: ProductCard calls useWishlist* hooks)
 *   - AdminModeProvider    (required: ProductCard mounts ProductCardAdminControlsGate,
 *                           which calls useAdminMode and THROWS without it — the only
 *                           entry from the "excluded" list that ProductCard strictly
 *                           needs to render, kept as a hard dependency)
 *   - <Outlet />           (renders ProductCard → ProductImage inside a plain div)
 *
 * Deliberately EXCLUDED (present on every production route via <AppRoot />):
 *   ThemeProvider, GraphicsCompatProvider, NotificationsProvider,
 *   WishlistAlertsProvider, CartProvider,
 *   CommandCenterProvider, LayoutMetricsProvider, BadgeEngineProvider,
 *   SearchUIProvider, Nav (header), Footer, MobileBottomNav (bottom nav),
 *   DeferredShell (live chat, region modal, admin tooling, compare tray,
 *   install prompt), Toaster, ShareDialog, DebugPanel, WindowMetricsPanel,
 *   GlobalSearchMount, and ALL RootComponent effects (analytics/GA page views,
 *   perf monitor, capability governor, motion tier, crisp preload, product
 *   cache warm, startup/debug diagnostics, OAuth return handling).
 *
 * ProductCard also calls useBadgeEngine, but that hook has a default context
 * value and does NOT require BadgeEngineProvider, so badges resolve to their
 * safe defaults without mounting the engine.
 */
function IsolationRoot() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // ISOLATION STEP 7: restore ONLY the analytics / page-view initialization
  // effect, byte-for-byte from AppRoot. Nothing else (no perf monitor,
  // capability governor, motion tier, crisp preload, cache warm, GA4 bootstrap,
  // OAuth handling, or other startup effects).
  useEffect(() => {
    trackPageView(pathname);
    void captureAttribution();
    import("@/lib/ga4").then((m) => m.ga4PageView(pathname)).catch(() => {});
  }, [pathname]);
  return (
    <QueryClientProvider client={queryClient}>
      {/* ISOLATION STEP 4: ThemeProvider is a HARD dependency of the Header —
          Nav calls useTheme(), which THROWS without it (SSR 500). Not a
          "feature" provider, just required plumbing to render the shell. */}
      <ThemeProvider>
      <AuthProvider>
        <RegionProvider>
          <WishlistProvider>
            <AdminModeProvider>
              {/* ISOLATION STEP 5: CommandCenterProvider added back (only this). */}
              <CommandCenterProvider>
              {/* ISOLATION STEP 2: LayoutMetricsProvider added back (only this). */}
              <LayoutMetricsProvider>
                {/* ISOLATION STEP 3: BadgeEngineProvider added back (only this). */}
                <BadgeEngineProvider>
                  {/* ISOLATION STEP 4: restore Header + Bottom Navigation only.
                      CartProvider is a HARD dependency — both Nav and
                      MobileBottomNav call useCart(), which throws without it
                      (useSearchUI has a safe no-op fallback, so SearchUIProvider
                      is intentionally NOT added; NotificationBell uses a default
                      context, so NotificationsProvider is NOT added either).
                      Shell markup mirrors the normal app shell but omits Footer,
                      DeferredShell, Toaster, etc. */}
                  <CartProvider>
                    {/* ISOLATION STEP 6: SearchUIProvider added back (only this). */}
                    <SearchUIProvider>
                    <div data-app-shell className="min-h-dvh flex flex-col">
                      <Nav />
                      <main
                        data-app-content
                        className="flex-1 account-footer-gapless md:pb-0"
                      >
                        <Outlet />
                      </main>
                      <MobileBottomNav />
                    </div>
                    </SearchUIProvider>
                  </CartProvider>
                </BadgeEngineProvider>
              </LayoutMetricsProvider>
              </CommandCenterProvider>
            </AdminModeProvider>
          </WishlistProvider>
        </RegionProvider>
      </AuthProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}

function AppRoot() {
  useRenderDiagnostics("RootComponent");
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [oauthReturnPending, setOauthReturnPending] = useState(
    () => typeof window !== "undefined" && hasOAuthReturnParams(),
  );

  useEffect(() => {
    initDebugFlags();
    // Affected-Device Confidence System + debug diagnostics: dynamic-imported
    // so ~1k LOC of always-mount-once code stays out of the initial bundle.
    void import("@/lib/compat-confidence").then((m) => m.initCompatConfidence());
    void import("@/lib/debug-diagnostics").then((m) => {
      m.installDebugDiagnostics();
      m.patchImageDecode();
    });
    installStartupDiagnostics();
    installChunkRecovery();
    // Infra v2.0 owns SW lifecycle. On approved hosts it registers /sw.js;
    // everywhere else it runs the same unregister-and-wipe path that
    // registerServiceWorker() used to perform. bootInfra() (scheduled below
    // via requestIdleCallback) triggers it.
    if (!(getFlag("serviceWorker") && getFlag("pwa"))) registerServiceWorker();

    logBuildVersion();
    // React mounted successfully. Clear the persistent boot-attempt counter a
    // few seconds after a stable render so the auto-reload cap only ever counts
    // genuine startup failures (chunk 404 / OOM crash), never healthy boots.
    const t = window.setTimeout(() => {
      (window as unknown as { __fomBootOk?: () => void }).__fomBootOk?.();
    }, 6000);
    return () => window.clearTimeout(t);
  }, []);
  useEffect(() => {
    startPerfMonitoring();
    // Live capability governor: measures real FPS / long tasks and trims only
    // expensive effects (blur/shadow/3D/particles) if the device can't sustain
    // smooth rendering — never hides images or hero animations. Runs on every
    // capable device (incl. 4–6GB Android) so degradation is performance-driven.
    startCapabilityGovernor();
    // Motion-tier + scroll-activity system: classifies the device (high/mid/low),
    // freezes secondary/continuous animation during active scroll, and tightens
    // motion scheduling on constrained hardware. See src/lib/motion-tier.ts.
    startMotionTier();
    // Anonymous render diagnostics (GPU/browser/FPS/mode) on window.__fomRender —
    // helps surface newly problematic GPUs. No PII, no network transmission.
    publishRenderDiagnostics();
  }, []);
  useEffect(() => {
    preloadCrisp();
  }, []);
  // Bootstrap Google Analytics off the critical path (on idle / after paint) so
  // gtag.js never competes with hydration on the main thread during load.
  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    const start = () => import("@/lib/ga4").then((m) => m.loadGa4()).catch(() => {});
    if (w.requestIdleCallback) {
      w.requestIdleCallback(start, { timeout: 4000 });
    } else {
      const t = setTimeout(start, 2500);
      return () => clearTimeout(t);
    }
  }, []);
  // Infrastructure v2.0 — boot request queue + network quality on idle.
  // Fully lazy; never blocks hydration and adds no eager cost to the entry chunk.
  useEffect(() => {
    const w = window as unknown as {
      requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number;
    };
    const start = () => import("@/lib/infra").then((m) => m.bootInfra()).catch(() => {});
    if (w.requestIdleCallback) {
      w.requestIdleCallback(start, { timeout: 5000 });
    } else {
      const t = setTimeout(start, 3000);
      return () => clearTimeout(t);
    }
  }, []);
  // Warm the global products cache immediately on hydration so route components
  // (home, search, category, product) render with data already in memory instead
  // of each kicking off its own fetch on mount.
  useEffect(() => {
    void loadProducts();
  }, []);
  useEffect(() => {
    trackPageView(pathname);
    void captureAttribution();
    import("@/lib/ga4").then((m) => m.ga4PageView(pathname)).catch(() => {});
  }, [pathname]);
  useEffect(() => {
    if (!oauthReturnPending || typeof window === "undefined") return;
    let cancelled = false;
    completeOAuthReturn().then((result) => {
      if (cancelled) return;
      if (result.completed) {
        const stored = safeInternalPath(localStorage.getItem("post_auth_redirect"));
        if (stored) localStorage.removeItem("post_auth_redirect");
        window.location.replace(stored ?? "/account");
        return;
      }
      setOauthReturnPending(false);
      if (result.error && !pathname.startsWith("/auth")) window.location.replace("/auth");
    });
    return () => {
      cancelled = true;
    };
  }, [oauthReturnPending, pathname]);

  const isAuthRoute = pathname.startsWith("/auth");
  // Admin routes own their full chrome via <AdminShell> (sidebar + top bar with
  // its own NotificationBell). Rendering the public site Nav / Footer / bottom
  // nav on top of that caused a duplicate notification bell whose dropdown
  // floated over admin controls. Suppress public chrome on admin routes.
  const isAdminRoute = pathname.startsWith("/admin");
  const isCheckoutRoute = pathname.startsWith("/checkout");
  const isAccountHomeRoute = pathname === "/account";
  const isSearchRoute = pathname === "/search";
  const isHomeRoute = pathname === "/";
  const isDealsRoute = pathname === "/deals";
  const isCategoriesRoute = pathname === "/categories";
  // Dedicated full-page support conversation owns the entire screen (its own
  // header + composer with safe-area handling). Suppress all site chrome.
  const isTicketRoute = /^\/account\/support\/(ticket\/|new)/.test(pathname);
  const hideSiteChrome = isAuthRoute || isAdminRoute || isTicketRoute;

  if (oauthReturnPending) return <OAuthReturnScreen />;

  return (
    <AppErrorBoundary>
      {/* EXPERIMENT: globally neutralize Framer Motion. reducedMotion="always"
          strips transform/opacity movement and the zero-duration default
          transition makes every animation/AnimatePresence transition instant.
          DOM structure, layout and CSS are unchanged. ROLLBACK: remove this
          <MotionConfig> wrapper (and its closing tag) plus the MotionConfig
          import, restoring the previous <QueryClientProvider> as the direct
          child of <AppErrorBoundary>. */}
      <MotionConfig reducedMotion="always" transition={{ duration: 0 }}>
      <QueryClientProvider client={queryClient}>
      <ThemeProvider>
       <GraphicsCompatProvider>
        <AuthProvider>
          <NotificationsProvider>
            <WishlistProvider>
              <RegionProvider>
                <WishlistAlertsProvider>
                  <CartProvider>
                    <AdminModeProvider>
                      <CommandCenterProvider>
                        <LayoutMetricsProvider>
                          <BadgeEngineProvider>
                          <SearchUIProvider>
                          <RecommendationProvider>
                          <div data-app-shell className="min-h-dvh flex flex-col">
                            {!hideSiteChrome && <Nav />}
                            <main
                              data-app-content
                              className={
                                hideSiteChrome
                                  ? "flex-1"
                                  : "flex-1 account-footer-gapless md:pb-0"
                              }
                            >
                              <Outlet />
                            </main>
                            {!hideSiteChrome && <Footer />}
                            {!hideSiteChrome && !isCheckoutRoute && <MobileBottomNav />}
                            <DeferredShell
                              isAuthRoute={isAuthRoute}
                              isAdminRoute={isAdminRoute}
                              hideLiveChat={(() => {
                                if (isAuthRoute || isAdminRoute || isCheckoutRoute || isTicketRoute) return true;
                                const hidden = ["/login","/signup","/reset-password","/signin","/otp","/payment","/order-success","/orders/success","/vendor","/builder","/return","/unsubscribe","/newsletter"];
                                if (hidden.some((p) => pathname === p || pathname.startsWith(p + "/") || pathname.startsWith(p + "?"))) return true;
                                const allowedPrefixes = ["/","/categories","/category","/products","/product","/search","/account"];
                                return !allowedPrefixes.some((p) => p === "/" ? pathname === "/" : pathname === p || pathname.startsWith(p + "/"));
                              })()}
                            />
                            <Toaster position="bottom-center" richColors />
                            <SyncToastsMount />

                            <GpuCompatBanner />
                            <ShareDialog />
                            
                            <Suspense fallback={null}>
                              <DebugPanel />
                              <WindowMetricsPanel />
                            </Suspense>
                            <GlobalSearchMount />
                            <ContinueShoppingHistoryCleanup />
                            <FloatingContextObserver />

                          </div>
                          </RecommendationProvider>
                          </SearchUIProvider>
                          </BadgeEngineProvider>
                        </LayoutMetricsProvider>
                      </CommandCenterProvider>
                    </AdminModeProvider>
                  </CartProvider>
                </WishlistAlertsProvider>
              </RegionProvider>
            </WishlistProvider>
          </NotificationsProvider>
        </AuthProvider>
       </GraphicsCompatProvider>
      </ThemeProvider>
    </QueryClientProvider>
    </MotionConfig>
    </AppErrorBoundary>
  );
}

function ContinueShoppingHistoryCleanup() {
  const { products, loading } = useProducts();
  const { market } = useRegion();
  const { entries, removeMany } = useRecentlyViewed();
  const lastCleanupKey = useRef("");

  useEffect(() => {
    if (loading || entries.length === 0) return;
    const visible = buildVisibleMap(products, market);
    const cutoff = Date.now() - HISTORY_MAX_AGE_MS;
    const stale = entries
      .filter((entry) => !visible.has(entry.slug) || entry.at < cutoff)
      .map((entry) => entry.slug)
      .sort();
    const key = stale.join("|");
    if (stale.length > 0 && key !== lastCleanupKey.current) {
      lastCleanupKey.current = key;
      void removeMany(stale).then((result) => {
        if (!result.ok) lastCleanupKey.current = "";
      });
    }
  }, [loading, products, market, entries, removeMany]);

  return null;
}
