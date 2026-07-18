import { createStart, createMiddleware } from "@tanstack/react-start";

import { renderErrorPage } from "./lib/error-page";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

const CANONICAL_HOST = "foundourmarket.com";
const CANONICAL_ORIGIN = "https://foundourmarket.com";

/**
 * Decide whether an incoming request host/proto should be 301'd to the
 * canonical origin (https://foundourmarket.com).
 *
 * Redirected: www., the published `foundourmarket.lovable.app`, and plain
 * http:// on the canonical host (force TLS).
 * NEVER redirected (would break the editor preview or external webhooks):
 *  - the canonical host already on https (prevents redirect loops)
 *  - `id-preview--*.lovable.app` (live editor preview, requires login)
 *  - `*-dev.lovable.app` and `project--*.lovable.app` (stable preview + infra
 *    URLs that external services / cron call directly)
 *  - `*.lovableproject.com` sandbox host (not a *.lovable.app match anyway)
 */
function canonicalRedirectTarget(host: string | null, proto: string): boolean {
  if (!host) return false;
  const h = host.toLowerCase().split(":")[0];

  if (h === CANONICAL_HOST) return proto === "http"; // force https only
  if (h === `www.${CANONICAL_HOST}`) return true;

  if (h.endsWith(".lovable.app")) {
    if (h.startsWith("id-preview--")) return false;
    if (h.startsWith("project--")) return false;
    if (h.endsWith("-dev.lovable.app")) return false;
    return true; // e.g. foundourmarket.lovable.app
  }
  return false;
}

const canonicalHostMiddleware = createMiddleware().server(async ({ next, request }) => {
  // Only normalize safe, idempotent navigations. POST/PUT/etc (webhooks, RPCs)
  // must never be 301'd — that would drop the request body.
  const method = request.method.toUpperCase();
  if (method !== "GET" && method !== "HEAD") return next();

  const url = new URL(request.url);
  // Leave API endpoints and platform internals untouched (webhooks/cron rely on
  // the exact host they were configured with).
  if (url.pathname.startsWith("/api/") || url.pathname.startsWith("/lovable/")) {
    return next();
  }

  const host = request.headers.get("host") ?? url.host;
  const proto = (
    request.headers.get("x-forwarded-proto") ?? url.protocol.replace(":", "")
  )
    .split(",")[0]
    .trim()
    .toLowerCase();

  if (canonicalRedirectTarget(host, proto)) {
    const target = `${CANONICAL_ORIGIN}${url.pathname}${url.search}`;
    return new Response(null, {
      status: 301,
      headers: { Location: target, "Cache-Control": "no-store" },
    });
  }

  return next();
});

const errorMiddleware = createMiddleware().server(async ({ next, request }) => {
  if (new URL(request.url).pathname.startsWith("/lovable/")) {
    return next();
  }
  try {
    return await next();
  } catch (error) {
    if (error != null && typeof error === "object" && "statusCode" in error) {
      throw error;
    }
    console.error(error);
    return new Response(renderErrorPage(), {
      status: 500,
      headers: { "content-type": "text/html; charset=utf-8" },
    });
  }
});

export const startInstance = createStart(() => ({
  requestMiddleware: [canonicalHostMiddleware, errorMiddleware],
  functionMiddleware: [attachSupabaseAuth],
}));

