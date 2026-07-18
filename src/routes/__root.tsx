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
import { ShareDialog } from "@/components/site/ShareDialog";
import { completeOAuthReturn, hasOAuthReturnParams } from "@/lib/oauth-return";
import { safeInternalPath } from "@/lib/safe-redirect";
import { startPerfMonitoring } from "@/lib/perf-monitor";
import { startCapabilityGovernor, publishRenderDiagnostics } from "@/lib/runtime-capability";
import { startMotionTier } from "@/lib/motion-tier";
import { lazyWithRetry, installChunkRecovery } from "@/lib/chunk-recovery";
import { AppErrorBoundary } from "@/components/site/AppErrorBoundary";
import { installStartupDiagnostics, useRenderDiagnostics } from "@/lib/startup-diagnostics";
import { initDebugFlags, getFlag } from "@/lib/debug-flags";
import { installDebugDiagnostics, patchImageDecode } from "@/lib/debug-diagnostics";
import { initCompatConfidence } from "@/lib/compat-confidence";
import { DebugPanel } from "@/components/site/DebugPanel";
import { useRegion } from "@/lib/region";
import { useRecentlyViewed } from "@/hooks/use-recently-viewed";
import { buildVisibleMap } from "@/lib/product-availability";
import { RecommendationProvider } from "@/lib/recommendations";

import { WindowMetricsPanel } from "@/components/site/WindowMetricsPanel";

const HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

const STARTUP_GUARD_SCRIPT = `(function(){
  if (typeof window === 'undefined') return;
  var BUILD_ID = ${JSON.stringify(BUILD_ID)};
  var MAX_RECOVER = 3;      // capped reload attempts before the fatal screen
  var BASE_DELAY = 800;     // exponential backoff base (ms)
  var fatalShown = false;
  var pendingOffline = false;
  var recovering = false;

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
  function swVersion(){
    try { return (navigator.serviceWorker && navigator.serviceWorker.controller && navigator.serviceWorker.controller.scriptURL) || 'none'; }
    catch(e){ return 'unknown'; }
  }
  function getCount(){ try { return parseInt(sessionStorage.getItem('fom_recover_count') || '0', 10) || 0; } catch(e){ return 0; } }
  function setCount(n){ try { sessionStorage.setItem('fom_recover_count', String(n)); } catch(e){} }

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
  // Telemetry for every asset-load failure: URL, status, deploy version,
  // browser/device, service-worker version, online status, retry count.
  function telemetry(reason, assetUrl, status){
    log('asset-load-failure', {
      asset: assetUrl || urlOf(reason),
      status: (status == null ? '' : status),
      deploy: BUILD_ID,
      ua: (navigator.userAgent || '').slice(0, 300),
      sw: swVersion(),
      online: !!navigator.onLine,
      retry: getCount(),
      reason: txt(reason)
    });
  }
  function renderFallback(reason){
    function commit(){
      try {
        var body = document.body;
        if (!body) {
          body = document.createElement('body');
          document.documentElement.appendChild(body);
        }
        document.documentElement.classList.remove('dark');
        body.innerHTML = '<div id="fom-startup-fallback" style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#0a0a0a;color:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"><div style="max-width:22rem;text-align:center"><div style="margin:0 auto 1rem;width:3rem;height:3rem;border-radius:.85rem;display:grid;place-items:center;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);overflow:hidden"><img src="/logo.webp" alt="FoundOurMarket\u2122" style="width:100%;height:100%;object-fit:cover" /></div><h1 style="font-size:1.15rem;font-weight:600;margin:0 0 .5rem">FoundOurMarket\u2122 couldn\u2019t finish loading.</h1><p style="font-size:.9rem;color:#a3a3a3;margin:0 0 1.5rem">We tried reconnecting a few times but a required file kept failing to load. Please check your connection and try again.</p><button id="fom-retry" style="appearance:none;border:none;cursor:pointer;border-radius:9999px;padding:.75rem 1.75rem;font-size:.75rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#0a0a0a;background:#f59e0b">Reload</button></div></div>';
        var b = document.getElementById('fom-retry');
        if (b) b.onclick = function(){ setCount(0); location.reload(); };
      } catch(e) {
        try { setTimeout(commit, 0); } catch(x) {}
      }
    }
    if (document.body) commit();
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', commit, { once: true });
    else commit();
  }
  function showFatal(reason){
    if (fatalShown && document.getElementById('fom-startup-fallback')) return;
    fatalShown = true;
    log('startup-fallback-shown', { reason: txt(reason), attempts: getCount() });
    renderFallback(reason);
  }

  // Defensive stale-cache eviction before a recovery reload: kill any SW and
  // its caches so the reload cannot be served an outdated app shell.
  function clearCaches(){
    try { if ('caches' in window) caches.keys().then(function(keys){ keys.forEach(function(k){ caches.delete(k); }); }).catch(function(){}); } catch(e){}
    try { if (navigator.serviceWorker) navigator.serviceWorker.getRegistrations().then(function(rs){ rs.forEach(function(r){ r.unregister().catch(function(){}); }); }).catch(function(){}); } catch(e){}
  }
  function reloadFresh(){
    try {
      var u = new URL(location.href);
      u.searchParams.set('_rc', String(Date.now()));
      location.replace(u.toString());
    } catch(e){ location.reload(); }
  }
  // Detect a newer deployment: re-fetch the current document fresh and check
  // whether it still references our build id. Either way the reload pulls the
  // latest asset graph; the check is for telemetry + bypassing the retry cap.
  function checkVersionThenReload(cb){
    var done = false;
    function go(newer){ if (done) return; done = true; if (newer) log('deploy-version-mismatch', { from: BUILD_ID }); clearCaches(); cb(newer); }
    try {
      var ctrl = ('AbortController' in window) ? new AbortController() : null;
      var t = setTimeout(function(){ if (ctrl) try { ctrl.abort(); } catch(e){} go(false); }, 4000);
      fetch(location.pathname + '?_v=' + Date.now(), { cache: 'no-store', signal: ctrl ? ctrl.signal : undefined })
        .then(function(r){ return r.text(); })
        .then(function(html){ clearTimeout(t); go(html.indexOf(BUILD_ID) === -1); })
        .catch(function(){ clearTimeout(t); go(false); });
    } catch(e){ go(false); }
  }

  function doRecover(reason, assetUrl, status){
    if (fatalShown || recovering) return;
    telemetry(reason, assetUrl, status);

    // Offline: never burn a retry. Wait for connectivity to return, then retry.
    if (!navigator.onLine){
      if (pendingOffline) return;
      pendingOffline = true;
      log('recovery-waiting-online', {});
      var onOnline = function(){ window.removeEventListener('online', onOnline); pendingOffline = false; doRecover(reason, assetUrl, status); };
      window.addEventListener('online', onOnline);
      return;
    }

    var count = getCount();
    recovering = true;
    checkVersionThenReload(function(newer){
      // A fresh deployment is a legitimate reason to reload beyond the cap once.
      if (!newer && count >= MAX_RECOVER){ recovering = false; showFatal(reason); return; }
      if (!newer) setCount(count + 1);
      var delay = BASE_DELAY * Math.pow(2, count);
      log('recovery-scheduled', { attempt: count + 1, delayMs: delay, newer: !!newer });
      setTimeout(reloadFresh, newer ? 0 : delay);
    });
  }

  window.__fomRecover = function(reason){ doRecover(reason, urlOf(reason), null); };
  window.__fomShowStartupError = showFatal;
  window.__fomBootOk = function(){
    log('boot-ok');
    setCount(0);
    try {
      var u = new URL(location.href);
      if (u.searchParams.has('_rc') || u.searchParams.has('_v')) {
        u.searchParams.delete('_rc');
        u.searchParams.delete('_v');
        history.replaceState(history.state, '', u.pathname + u.search + u.hash);
      }
    } catch(e){}
  };
  window.addEventListener('vite:preloadError', function(e){ try { e.preventDefault(); } catch(x) {} var p = e && e.payload; doRecover(p || e, urlOf(p || e), null); });
  window.addEventListener('unhandledrejection', function(e){ if (isEntryFailure(e.reason)) { try { e.preventDefault(); } catch(x) {} doRecover(e.reason, urlOf(e.reason), null); } });
  window.addEventListener('error', function(e){ var t = e && e.target; var src = t && (t.src || t.href) || ''; if (isEntryFailure(e && e.message) || isAssetUrl(src)) doRecover(e && e.message || src, src, null); }, true);
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
  return (
    <div className="flex min-h-[60vh] items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold">This page didn't load</h1>
        <p className="mt-2 text-sm text-muted-foreground">Something went wrong on our end.</p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="rounded-full bg-accent px-6 py-3 text-xs font-medium uppercase tracking-widest text-accent-foreground"
          >
            Try again
          </button>
          <a
            href="/"
            className="rounded-full border border-border px-6 py-3 text-xs font-medium uppercase tracking-widest"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
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
      <RegionSelectModal />
      {!isAuthRoute && <AdminMobileBar />}
      {!isAuthRoute && <AdminFloatingToolbar />}
      {!isAuthRoute && <AdminOverlayIndicator />}
      {!isAuthRoute && <AdminCommandCenter />}
      <CompareTray />
      <InstallPrompt />
      {!hideLiveChat && <LiveChat />}
      {!hideLiveChat && <SupportReplyWatcher />}
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
    // Affected-Device Confidence System: loads persisted per-device evidence,
    // re-scores (a previously-confirmed device activates immediately), and
    // installs always-on runtime-evidence listeners. Compatibility Mode only
    // activates at score >= 90% (suspect hardware + verified runtime anomalies).
    initCompatConfidence();
    installDebugDiagnostics();
    patchImageDecode();
    installStartupDiagnostics();
    installChunkRecovery();
    if (getFlag("serviceWorker") && getFlag("pwa")) registerServiceWorker();
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
                              hideLiveChat={!(isHomeRoute || (pathname === "/account" || pathname.startsWith("/account/"))) || isTicketRoute}
                            />
                            <Toaster position="bottom-center" richColors />
                            <GpuCompatBanner />
                            <ShareDialog />
                            
                            <DebugPanel />
                            <WindowMetricsPanel />
                            <GlobalSearchMount />
                            <ContinueShoppingHistoryCleanup />
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
