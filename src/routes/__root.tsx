import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Suspense, useEffect, useState } from "react";
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
import { RenderExperiments } from "@/lib/render-experiments";
import { RegionProvider } from "@/lib/region";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { ThemeProvider } from "@/lib/theme";
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
import { logBuildVersion } from "@/lib/build-version";
import { preloadCrisp } from "@/lib/crisp";
import { trackPageView } from "@/lib/analytics";
import { loadProducts } from "@/lib/use-products";
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
import { DebugPanel } from "@/components/site/DebugPanel";

import { WindowMetricsPanel } from "@/components/site/WindowMetricsPanel";

const STARTUP_GUARD_SCRIPT = `(function(){
  if (typeof window === 'undefined') return;
  var fallbackShown = false;
  function txt(x){
    try { return typeof x === 'string' ? x : (x && (x.message || (x.reason && x.reason.message) || x.type || '')) || ''; }
    catch(e){ return ''; }
  }
  function isEntryFailure(x){
    return /Failed to fetch dynamically imported module|virtual:tanstack-start-client-entry|vite:preloadError|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk/i.test(String(txt(x)));
  }
  function log(name, payload){
    try {
      var item = { event: name, at: new Date().toISOString(), path: location.pathname, payload: payload || {} };
      var arr = JSON.parse(localStorage.getItem('fom_startup_diagnostics') || '[]');
      if (!Array.isArray(arr)) arr = [];
      arr.push(item);
      localStorage.setItem('fom_startup_diagnostics', JSON.stringify(arr.slice(-80)));
    } catch(e) {}
    try { console.warn('[startup-diagnostics]', name, payload || {}); } catch(e) {}
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
        body.innerHTML = '<div id="fom-startup-fallback" style="min-height:100dvh;display:flex;align-items:center;justify-content:center;padding:1.5rem;background:#0a0a0a;color:#f5f5f5;font-family:system-ui,-apple-system,Segoe UI,Roboto,sans-serif"><div style="max-width:22rem;text-align:center"><div style="margin:0 auto 1rem;width:3rem;height:3rem;border-radius:.85rem;display:grid;place-items:center;background:rgba(245,158,11,.12);border:1px solid rgba(245,158,11,.3);overflow:hidden"><img src="/logo.webp" alt="FoundOurMarket\u2122" style="width:100%;height:100%;object-fit:cover" /></div><h1 style="font-size:1.15rem;font-weight:600;margin:0 0 .5rem">FoundOurMarket\u2122 couldn\u2019t finish loading.</h1><p style="font-size:.9rem;color:#a3a3a3;margin:0 0 1.5rem">A required app file was blocked or failed. Auto-reload is disabled, so this screen will stay stable.</p><button id="fom-retry" style="appearance:none;border:none;cursor:pointer;border-radius:9999px;padding:.75rem 1.75rem;font-size:.75rem;font-weight:600;letter-spacing:.12em;text-transform:uppercase;color:#0a0a0a;background:#f59e0b">Reload manually</button></div></div>';
        var b = document.getElementById('fom-retry');
        if (b) b.onclick = function(){ location.reload(); };
      } catch(e) {
        try { setTimeout(commit, 0); } catch(x) {}
      }
    }
    if (document.body) commit();
    else if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', commit, { once: true });
    else commit();
  }
  function showFatal(reason){
    if (fallbackShown && document.getElementById('fom-startup-fallback')) return;
    fallbackShown = true;
    log('startup-fallback-shown', { reason: txt(reason) });
    renderFallback(reason);
  }
  window.__fomRecover = function(reason){ log('auto-reload-blocked', { reason: txt(reason) }); showFatal(reason); };
  window.__fomShowStartupError = showFatal;
  window.__fomBootOk = function(){ log('boot-ok'); };
  window.addEventListener('vite:preloadError', function(e){ try { e.preventDefault(); } catch(x) {} window.__fomRecover(e && e.payload || e); });
  window.addEventListener('unhandledrejection', function(e){ if (isEntryFailure(e.reason)) { try { e.preventDefault(); } catch(x) {} window.__fomRecover(e.reason); } });
  window.addEventListener('error', function(e){ var t = e && e.target; var src = t && (t.src || t.href) || ''; if (isEntryFailure(e && e.message) || isEntryFailure(src)) window.__fomRecover(e && e.message || src); }, true);
})();`;

const FF_ISOLATION_SCRIPT =
  "(function(){try{var d=document.documentElement,q=new URLSearchParams(location.search);function off(a){d.setAttribute(a,'off')}function has(k){return q.has(k)||q.get(k)==='1'||q.get(k)==='true'}if(q.get('render')==='safe'||has('render-safe'))d.setAttribute('data-render-safe','true');var map={backdrop:'data-ff-backdrop-filters','backdrop-filter':'data-ff-backdrop-filters',blur:'data-ff-blur-effects',filter:'data-ff-css-filters','mix-blend':'data-ff-mix-blend-mode','mix-blend-mode':'data-ff-mix-blend-mode',cv:'data-ff-content-visibility','content-visibility':'data-ff-content-visibility',contain:'data-ff-containment',containment:'data-ff-containment','will-change':'data-ff-will-change',transform:'data-ff-transform',transforms:'data-ff-transform','gpu-transform':'data-ff-gpu-transforms','gpu-transforms':'data-ff-gpu-transforms',sticky:'data-ff-sticky-position',fixed:'data-ff-fixed-position',mask:'data-ff-css-masks',masks:'data-ff-css-masks','clip-path':'data-ff-clip-path',overflow:'data-ff-overflow-clipping','overflow-clipping':'data-ff-overflow-clipping',framer:'data-ff-js-animations','framer-motion':'data-ff-js-animations','css-animations':'data-ff-animations',animations:'data-ff-animations','translate3d':'data-ff-gpu-transforms','translatez':'data-ff-gpu-transforms',shadow:'data-ff-box-shadows',shadows:'data-ff-box-shadows','box-shadow':'data-ff-box-shadows',gradients:'data-ff-gradients',gradient:'data-ff-gradients',lazy:'data-ff-lazy-loading','lazy-loading':'data-ff-lazy-loading',virtualization:'data-ff-virtualization','intersection-observer':'data-ff-virtualization','object-fit':'data-ff-object-fit','image-decoding':'data-ff-image-decoding','image-transformations':'data-ff-image-transformations','palette-extraction':'data-ff-palette-extraction'};var requested=[];Object.keys(map).forEach(function(k){if(has('ff-disable-'+k))requested.push(k)});var list=q.get('ff-disable');if(list)list.split(',').forEach(function(k){requested.push(k.trim().toLowerCase())});var ff=q.get('ff');if(ff&&ff.indexOf('off:')===0)ff.slice(4).split(',').forEach(function(k){requested.push(k.trim())});for(var i=0;i<requested.length;i++){var k=requested[i];if(!k)continue;var css=k.replace(/[A-Z]/g,function(m){return '-'+m.toLowerCase()}).toLowerCase();if(map[css]){off(map[css]);break}}}catch(e){}})();";

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
          "(function(){try{var d=document.documentElement;if(localStorage.getItem('fom-graphics-compat')==='on'){d.setAttribute('data-graphics-compat','true');d.setAttribute('data-render-safe','true');}}catch(e){}})();",
      },

      {
        // GPU-compositor safety gate. Some Android GPUs (Mali, PowerVR, software
        // renderers, very old Adreno) corrupt compositor tiles when many
        // backdrop-filter + large blur() + mix-blend-mode + 3D layers stack —
        // producing horizontal colored lines, duplicated text/cards, partially
        // corrupted images and random artifacts. We detect the renderer via
        // WebGL and set data-gpu-unsafe="true" so the dormant safe-mode CSS
        // swaps those effects for visually-equivalent CPU-friendly fallbacks.
        // Premium effects are untouched on healthy GPUs (Adreno/Apple/desktop).
        children:
          "(function(){var d=document.documentElement;function rd(){try{var c=document.createElement('canvas');var gl=c.getContext('webgl')||c.getContext('experimental-webgl');if(!gl)return '';var e=gl.getExtension('WEBGL_debug_renderer_info');var s=e?gl.getParameter(e.UNMASKED_RENDERER_WEBGL):gl.getParameter(gl.RENDERER);return (s||'').toString();}catch(x){return '';}}var R='unknown',U=false;try{var ua=navigator.userAgent||'';var r=rd();R=r||'unknown';var rl=r.toLowerCase();var gpuUnsafe=/mali/.test(rl)||/swiftshader|software|llvmpipe|microsoft basic/.test(rl)||/powervr/.test(rl)||/videocore/.test(rl)||/vivante/.test(rl)||/adreno\\s*(2|3)\\d\\d/.test(rl);var engineUnsafe=false;var m;if((m=ua.match(/SamsungBrowser\\/(\\d+)/)))engineUnsafe=parseInt(m[1],10)<14;else if(/Android/.test(ua)&&(m=ua.match(/Chrome\\/(\\d+)/)))engineUnsafe=parseInt(m[1],10)<80;var unsafe=gpuUnsafe||engineUnsafe;U=unsafe;if(/Android/.test(ua))d.setAttribute('data-android','true');d.setAttribute('data-gpu-renderer',r||'unknown');d.setAttribute('data-gpu-unsafe',unsafe?'true':'false');if(unsafe)d.setAttribute('data-compat-reason',gpuUnsafe?'gpu':'engine');}catch(y){d.setAttribute('data-gpu-unsafe','false');try{if(/Android/.test(navigator.userAgent||''))d.setAttribute('data-android','true');}catch(z){}}try{window.__fomCompat=function(){var flags={};var names=d.getAttributeNames?d.getAttributeNames():[];for(var i=0;i<names.length;i++){var n=names[i];if(n.indexOf('data-')===0&&(/android|gpu|compat|degrade|low-end|render-safe|ultra|ff-/.test(n)))flags[n]=d.getAttribute(n);}var info={webglRenderer:R,userAgent:navigator.userAgent,compatibilityMode:d.getAttribute('data-gpu-unsafe')==='true',flags:flags};try{console.info('%c[FOM Compatibility]','color:#ff8a3d;font-weight:bold',info);}catch(e){}return info;};window.__fomCompat();}catch(w){}})();",
      },
      {
        // TEMPORARY BINARY-SEARCH ISOLATION FLAGS. These attributes are set
        // before first paint so Chromium Android can be tested one rendering
        // feature at a time on the affected device. Production is unchanged
        // unless a `?ff-disable-*` / `?render=safe` URL flag is present.
        children: FF_ISOLATION_SCRIPT,
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
      <RenderExperiments />
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

function RootComponent() {
  useRenderDiagnostics("RootComponent");
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [oauthReturnPending, setOauthReturnPending] = useState(
    () => typeof window !== "undefined" && hasOAuthReturnParams(),
  );

  useEffect(() => {
    initDebugFlags();
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
      <QueryClientProvider client={queryClient}>
      <ThemeProvider>
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
                              hideLiveChat={isCheckoutRoute || isTicketRoute}
                            />
                            <Toaster position="bottom-center" richColors />
                            <ShareDialog />
                            
                            <DebugPanel />
                            <WindowMetricsPanel />
                            <GlobalSearchMount />
                          </div>
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
      </ThemeProvider>
    </QueryClientProvider>
    </AppErrorBoundary>
  );
}
