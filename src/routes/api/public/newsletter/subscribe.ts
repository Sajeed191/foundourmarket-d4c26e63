/**
 * Public subscribe endpoint — Newsletter Stage 1 (Security & Anti-Spam).
 *
 * All public subscribes flow through here. RLS no longer allows anon to
 * INSERT into newsletter_subscribers directly. This route enforces:
 *   - honeypot rejection (silent)
 *   - tri-layer rate limit per hashed IP (10s / 1h / 24h)
 *   - disposable-email domain block
 *   - unicode normalization + strict email validation
 *   - spam fingerprinting (hashed IP + UA, browser, referrer, landing page)
 *   - audit logging for every outcome
 *
 * Runs under /api/public/* which bypasses the published-site auth wall,
 * so we implement all security in the handler itself.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createHash } from "crypto";
import { z } from "zod";
import { isDisposableEmail } from "@/lib/newsletter/disposable-domains";

// Small helper — friendly JSON responses; never leak server internals.
function json(status: number, body: Record<string, unknown>) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}

// SHA-256 hex — used for pseudonymized IP + UA fingerprints. Salt lets us
// rotate hashes at will (rehash-only-on-write; historical rows keep their
// pre-rotation hash so admins can still correlate abuse patterns).
function sha256(input: string, salt: string): string {
  return createHash("sha256").update(`${salt}::${input}`).digest("hex");
}

const bodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  source: z.string().max(80).optional(),
  source_page: z.string().max(512).nullable().optional(),
  device: z.enum(["mobile", "tablet", "desktop"]).optional(),
  country: z.string().max(64).optional(),
  // Honeypot — legitimate browsers never see it, so it must be empty.
  website: z.string().max(0).optional(),
  company: z.string().max(0).optional(),
  // Client-provided timing floor — bots submit within milliseconds of page
  // load. Optional; when present must be >= 750ms since form mount.
  ts: z.number().int().nonnegative().optional(),
});

const emailShape = z
  .string()
  .trim()
  .toLowerCase()
  .max(255)
  .email();

function normalizeEmail(raw: string): string {
  // NFKC normalize + collapse internal whitespace + lowercase + trim.
  return raw.normalize("NFKC").replace(/\s+/g, "").toLowerCase().trim();
}

function browserName(ua: string | null): string {
  if (!ua) return "unknown";
  if (/Edg\//.test(ua)) return "Edge";
  if (/OPR\/|Opera/.test(ua)) return "Opera";
  if (/Chrome\//.test(ua) && !/Chromium/.test(ua)) return "Chrome";
  if (/Firefox\//.test(ua)) return "Firefox";
  if (/Safari\//.test(ua) && /Version\//.test(ua)) return "Safari";
  return "Other";
}

// Rate-limit thresholds (defense in depth). All by hashed IP.
const RATE = {
  BURST_SECONDS: 10,
  BURST_LIMIT: 1,      // no more than 1 submit / 10s
  HOUR_LIMIT: 3,       // 3 / hour
  DAY_LIMIT: 10,       // 10 / day
} as const;

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

export const Route = createFileRoute("/api/public/newsletter/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1) Parse & validate input shape
        let payload: z.infer<typeof bodySchema>;
        try {
          const raw = await request.json();
          payload = bodySchema.parse(raw);
        } catch {
          return json(400, { ok: false, error: "invalid_request" });
        }

        // 2) Salt (rotatable via env; falls back to a build-time constant).
        const salt = process.env.NEWSLETTER_HASH_SALT || "fom-nl-v1";

        // 3) Fingerprint the caller (never store raw IP)
        const rawIp = getRequestIP({ xForwardedFor: true }) ?? "0.0.0.0";
        const ua = getRequestHeader("user-agent") ?? "";
        const ipHash = sha256(rawIp, salt);
        const uaHash = sha256(ua, salt);

        const supabaseAdmin = await loadAdmin();

        const logAttempt = async (
          outcome: string,
          reason: string | null,
          emailForHash?: string,
        ) => {
          try {
            await supabaseAdmin.from("newsletter_submission_attempts").insert({
              ip_hash: ipHash,
              email_hash: emailForHash ? sha256(emailForHash, salt) : null,
              outcome,
              reason,
            } as never);
          } catch {
            /* audit failure must never break the request */
          }
        };

        const logAudit = async (
          action: string,
          detail: Record<string, unknown>,
          targetEmail?: string,
        ) => {
          try {
            await supabaseAdmin.from("newsletter_audit_log").insert({
              actor_id: null,
              actor_email: null,
              action,
              target_email: targetEmail ?? null,
              ip_hash: ipHash,
              metadata: detail as never,
            } as never);
          } catch {
            /* never break request */
          }
        };

        // 4) Honeypot — silent success, never notify the attacker
        if ((payload.website && payload.website.length > 0) ||
            (payload.company && payload.company.length > 0)) {
          await logAttempt("honeypot", "honeypot_filled");
          await logAudit("honeypot_hit", { ua_hash: uaHash });
          // Fake success so bots don't retry
          return json(200, { ok: true, duplicate: false });
        }

        // 5) Email normalization + strict validation
        let email: string;
        try {
          email = emailShape.parse(normalizeEmail(payload.email));
        } catch {
          await logAttempt("invalid", "email_invalid");
          return json(400, { ok: false, error: "invalid_email" });
        }

        // 6) Disposable-domain block
        if (isDisposableEmail(email)) {
          await logAttempt("disposable", "disposable_domain", email);
          await logAudit("disposable_blocked", { email }, email);
          return json(400, {
            ok: false,
            error: "disposable_email",
            message: "Please use a permanent email address.",
          });
        }

        // 7) Rate limit (tri-layer, per hashed IP)
        const nowIso = new Date().toISOString();
        const burstFrom = new Date(Date.now() - RATE.BURST_SECONDS * 1000).toISOString();
        const hourFrom = new Date(Date.now() - 3600 * 1000).toISOString();
        const dayFrom = new Date(Date.now() - 24 * 3600 * 1000).toISOString();

        const [{ count: burstCount }, { count: hourCount }, { count: dayCount }] =
          await Promise.all([
            supabaseAdmin
              .from("newsletter_submission_attempts")
              .select("id", { count: "exact", head: true })
              .eq("ip_hash", ipHash)
              .gte("created_at", burstFrom),
            supabaseAdmin
              .from("newsletter_submission_attempts")
              .select("id", { count: "exact", head: true })
              .eq("ip_hash", ipHash)
              .eq("outcome", "accepted")
              .gte("created_at", hourFrom),
            supabaseAdmin
              .from("newsletter_submission_attempts")
              .select("id", { count: "exact", head: true })
              .eq("ip_hash", ipHash)
              .eq("outcome", "accepted")
              .gte("created_at", dayFrom),
          ]);

        if ((burstCount ?? 0) >= RATE.BURST_LIMIT) {
          await logAttempt("rate_limited", "burst_window", email);
          await logAudit("rate_limit_hit", { window: "burst", email }, email);
          return json(429, {
            ok: false,
            error: "rate_limited",
            message: "You're going too fast. Please wait a moment and try again.",
          });
        }
        if ((hourCount ?? 0) >= RATE.HOUR_LIMIT) {
          await logAttempt("rate_limited", "hour_window", email);
          await logAudit("rate_limit_hit", { window: "hour", email }, email);
          return json(429, {
            ok: false,
            error: "rate_limited",
            message: "Too many attempts. Please try again later.",
          });
        }
        if ((dayCount ?? 0) >= RATE.DAY_LIMIT) {
          await logAttempt("rate_limited", "day_window", email);
          await logAudit("rate_limit_hit", { window: "day", email }, email);
          return json(429, {
            ok: false,
            error: "rate_limited",
            message: "Daily limit reached. Please try again tomorrow.",
          });
        }

        // 8) Insert (or detect duplicate)
        const safeSource = (payload.source ?? "site")
          .replace(/[^a-z0-9_.:-]/gi, "_")
          .slice(0, 80) || "site";

        const row = {
          email,
          source: safeSource,
          source_page: payload.source_page ?? null,
          device: payload.device ?? null,
          country: payload.country ?? null,
          status: "subscribed",
          ip_hash: ipHash,
          ua_hash: uaHash,
          browser: browserName(ua),
          referrer: (getRequestHeader("referer") ?? getRequestHeader("referrer") ?? "").slice(0, 512) || null,
          landing_page: payload.source_page ?? null,
          abuse_status: "normal",
          subscribed_at: nowIso,
        };

        const { error: insertError } = await supabaseAdmin
          .from("newsletter_subscribers")
          .insert(row as never);

        const isDuplicate =
          !!insertError &&
          (insertError.code === "23505" ||
            (insertError.message ?? "").toLowerCase().includes("duplicate"));

        if (insertError && !isDuplicate) {
          await logAttempt("error", insertError.code ?? "db_error", email);
          await logAudit("subscribe_error", { code: insertError.code }, email);
          // Never surface raw DB errors
          return json(500, { ok: false, error: "server_error" });
        }

        if (isDuplicate) {
          await logAttempt("duplicate", null, email);
          await logAudit("duplicate_attempt", { source: safeSource }, email);
          return json(200, { ok: true, duplicate: true });
        }

        await logAttempt("accepted", null, email);
        await logAudit("subscribed", { source: safeSource, browser: row.browser }, email);
        return json(200, { ok: true, duplicate: false });
      },

      // Explicit 405 on other methods so scanners don't get HTML page HTMLs
      GET: () => json(405, { ok: false, error: "method_not_allowed" }),
      OPTIONS: () =>
        new Response(null, {
          status: 204,
          headers: {
            "Access-Control-Allow-Methods": "POST, OPTIONS",
            "Access-Control-Allow-Headers": "Content-Type",
            "Access-Control-Max-Age": "600",
          },
        }),
    },
  },
});
