import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { lazy, Suspense, useEffect, useState } from "react";
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
import { RegionProvider } from "@/lib/region";
import { CartProvider } from "@/lib/cart";
import { AuthProvider } from "@/lib/auth";
import { WishlistProvider } from "@/lib/wishlist";
import { WishlistAlertsProvider } from "@/lib/wishlist-alerts";
import { NotificationsProvider } from "@/lib/notifications";
import { Nav } from "@/components/site/Nav";
import { Footer } from "@/components/site/Footer";
import { AdminModeProvider } from "@/lib/admin-mode";
import { CommandCenterProvider } from "@/lib/command-center";
import { MobileBottomNav } from "@/components/site/MobileBottomNav";
import { registerServiceWorker } from "@/lib/pwa";
import { preloadCrisp } from "@/lib/crisp";
import { trackPageView } from "@/lib/analytics";
import { captureAttribution } from "@/lib/marketing-tracking";
import { LayoutMetricsProvider } from "@/lib/layout-metrics";
import { Toaster } from "@/components/ui/sonner";

// Non-critical client-only shell: deferred out of the entry bundle so the
// homepage/product/search first paint never pays for admin tooling, the live
// chat widget, the compare tray, or the install prompt. These mount after
// hydration via the <DeferredShell> gate below.
const AdminFloatingToolbar = lazy(() =>
  import("@/components/admin/AdminFloatingToolbar").then((m) => ({ default: m.AdminFloatingToolbar })),
);
const AdminOverlayIndicator = lazy(() =>
  import("@/components/admin/AdminOverlayIndicator").then((m) => ({ default: m.AdminOverlayIndicator })),
);
const AdminCommandCenter = lazy(() =>
  import("@/components/admin/AdminCommandCenter").then((m) => ({ default: m.AdminCommandCenter })),
);
const AdminMobileBar = lazy(() =>
  import("@/components/admin/AdminMobileBar").then((m) => ({ default: m.AdminMobileBar })),
);
const CompareTray = lazy(() =>
  import("@/components/site/CompareTray").then((m) => ({ default: m.CompareTray })),
);
const InstallPrompt = lazy(() =>
  import("@/components/site/InstallPrompt").then((m) => ({ default: m.InstallPrompt })),
);
const LiveChat = lazy(() =>
  import("@/components/chat/LiveChat").then((m) => ({ default: m.LiveChat })),
);
const RegionSelectModal = lazy(() =>
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
            onClick={() => { router.invalidate(); reset(); }}
            className="rounded-full bg-accent px-6 py-3 text-xs font-medium uppercase tracking-widest text-accent-foreground"
          >
            Try again
          </button>
          <a href="/" className="rounded-full border border-border px-6 py-3 text-xs font-medium uppercase tracking-widest">
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
      { name: "viewport", content: "width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover" },
      { title: "FoundOurMarket™ | Premium Global Marketplace" },
      { name: "description", content: "Discover premium products worldwide with secure shopping, trusted sellers, and a luxury marketplace experience built for modern consumers." },
      { name: "application-name", content: "FoundOurMarket" },
      { name: "apple-mobile-web-app-capable", content: "yes" },
      { name: "apple-mobile-web-app-title", content: "FoundOurMarket" },
      { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
      { name: "mobile-web-app-capable", content: "yes" },
      { name: "format-detection", content: "telephone=no" },
      { property: "og:title", content: "FoundOurMarket™ | Premium Global Marketplace" },
      { property: "og:description", content: "Discover premium products worldwide with secure shopping, trusted sellers, and a luxury marketplace experience built for modern consumers." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://foundourmarket.com/" },
      { property: "og:site_name", content: "FoundOurMarket" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "theme-color", content: "#0a0a0a" },
      { name: "twitter:title", content: "FoundOurMarket™ | Premium Global Marketplace" },
      { name: "twitter:description", content: "Discover premium products worldwide with secure shopping, trusted sellers, and a luxury marketplace experience built for modern consumers." },
      { property: "og:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/WNBAvMpbiIc783NsRzlYQb1I1wj1/social-images/social-1779938854051-1000130607.webp" },
      { name: "twitter:image", content: "https://storage.googleapis.com/gpt-engineer-file-uploads/WNBAvMpbiIc783NsRzlYQb1I1wj1/social-images/social-1779938854051-1000130607.webp" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "preconnect", href: "https://fonts.googleapis.com" },
      { rel: "preconnect", href: "https://fonts.gstatic.com", crossOrigin: "anonymous" },
      { rel: "stylesheet", href: "https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@400;600;700&family=DM+Sans:wght@400;500;600;700&family=JetBrains+Mono:wght@400;500&display=swap" },
      { rel: "preconnect", href: "https://client.crisp.chat", crossOrigin: "anonymous" },
      { rel: "dns-prefetch", href: "https://client.crisp.chat" },
      { rel: "manifest", href: "/manifest.webmanifest" },
      { rel: "icon", href: "/logo.webp", type: "image/webp" },
      { rel: "apple-touch-icon", href: "/logo.webp" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "FoundOurMarket",
          url: "https://foundourmarket.com/",
          logo: "https://foundourmarket.com/logo.webp",
        }),
      },
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "WebSite",
          name: "FoundOurMarket",
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
function DeferredShell({ isAuthRoute }: { isAuthRoute: boolean }) {
  const [ready, setReady] = useState(false);
  useEffect(() => {
    const ric =
      (window as unknown as { requestIdleCallback?: (cb: () => void, o?: { timeout: number }) => number })
        .requestIdleCallback;
    if (ric) {
      const id = ric(() => setReady(true), { timeout: 3000 });
      return () => {
        const cancel = (window as unknown as { cancelIdleCallback?: (id: number) => void }).cancelIdleCallback;
        cancel?.(id);
      };
    }
    const t = setTimeout(() => setReady(true), 1500);
    return () => clearTimeout(t);
  }, []);

  if (!ready) return null;

  return (
    <Suspense fallback={null}>
      {!isAuthRoute && <AdminMobileBar />}
      {!isAuthRoute && <AdminFloatingToolbar />}
      {!isAuthRoute && <AdminOverlayIndicator />}
      {!isAuthRoute && <AdminCommandCenter />}
      <CompareTray />
      <InstallPrompt />
      <LiveChat />
    </Suspense>
  );
}

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  useEffect(() => { registerServiceWorker(); }, []);
  useEffect(() => { preloadCrisp(); }, []);
  useEffect(() => {
    trackPageView(pathname);
    void captureAttribution();
  }, [pathname]);

  const isAuthRoute = pathname.startsWith("/auth");

  return (
    <QueryClientProvider client={queryClient}>
      <AuthProvider>
        <NotificationsProvider>
          <WishlistProvider>
            <RegionProvider>
              <WishlistAlertsProvider>
              <CartProvider>
                <AdminModeProvider>
                 <CommandCenterProvider>
                  <LayoutMetricsProvider>
                    <div data-app-shell className="min-h-dvh flex flex-col">
                      {!isAuthRoute && <Nav />}
                      <main data-app-content className={isAuthRoute ? "flex-1" : "flex-1 mobile-page-clearance md:pb-0"}>
                        <Outlet />
                      </main>
                      {!isAuthRoute && <Footer />}
                      {!isAuthRoute && <MobileBottomNav />}
                      <RegionSelectModal />
                      <DeferredShell isAuthRoute={isAuthRoute} />
                      <Toaster position="bottom-center" richColors />
                    </div>
                  </LayoutMetricsProvider>
                 </CommandCenterProvider>
                </AdminModeProvider>
              </CartProvider>
              </WishlistAlertsProvider>
            </RegionProvider>
          </WishlistProvider>
        </NotificationsProvider>
      </AuthProvider>
    </QueryClientProvider>
  );
}
