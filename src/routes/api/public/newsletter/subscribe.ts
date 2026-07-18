/**
 * Public subscribe endpoint — Newsletter Stage 2 (Security & Anti-Spam Core).
 *
 * Every protection is independently toggleable via
 * `newsletter_security_settings` so admins can dial spend up/down per env.
 * Enforces:
 *   - active IP block check (persistent, expiring)
 *   - honeypot rejection (silent success)
 *   - submit-timing floor (bots submit sub-ms)
 *   - unicode normalization + strict email validation
 *   - disposable-email domain block
 *   - tri-layer rate limit per hashed IP (configurable)
 *   - abuse scoring → auto temporary block on threshold breach
 *   - request fingerprinting (hashed IP + UA, browser, referrer, accept-lang, timezone)
 *   - audit logging for every outcome (accept, dup, invalid, blocked, rate)
 *
 * Runs under /api/public/* which bypasses the published-site auth wall,
 * so all security is implemented in the handler itself.
 */
import { createFileRoute } from "@tanstack/react-router";
import { getRequestHeader, getRequestIP } from "@tanstack/react-start/server";
import { createHash } from "crypto";
import { z } from "zod";
import { isDisposableEmail } from "@/lib/newsletter/disposable-domains";

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

function sha256(input: string, salt: string): string {
  return createHash("sha256").update(`${salt}::${input}`).digest("hex");
}

const bodySchema = z.object({
  email: z.string().trim().min(1).max(320),
  source: z.string().max(80).optional(),
  source_page: z.string().max(512).nullable().optional(),
  device: z.enum(["mobile", "tablet", "desktop"]).optional(),
  country: z.string().max(64).optional(),
  timezone: z.string().max(80).optional(),
  // Honeypot — must remain empty
  website: z.string().max(0).optional(),
  company: z.string().max(0).optional(),
  // Ms elapsed between form mount and submit
  ts: z.number().int().nonnegative().optional(),
});

const emailShape = z.string().trim().toLowerCase().max(255).email();

function normalizeEmail(raw: string): string {
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

type Settings = {
  honeypot_enabled: boolean;
  disposable_check_enabled: boolean;
  rate_limit_enabled: boolean;
  auto_block_enabled: boolean;
  timing_floor_enabled: boolean;
  fingerprint_enabled: boolean;
  burst_seconds: number;
  burst_limit: number;
  hour_limit: number;
  day_limit: number;
  min_submit_ms: number;
  abuse_threshold: number;
  block_minutes: number;
};

const DEFAULTS: Settings = {
  honeypot_enabled: true,
  disposable_check_enabled: true,
  rate_limit_enabled: true,
  auto_block_enabled: true,
  timing_floor_enabled: true,
  fingerprint_enabled: true,
  burst_seconds: 10,
  burst_limit: 1,
  hour_limit: 3,
  day_limit: 10,
  min_submit_ms: 750,
  abuse_threshold: 50,
  block_minutes: 60,
};

async function loadAdmin() {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  return supabaseAdmin;
}

async function loadSettings(admin: Awaited<ReturnType<typeof loadAdmin>>): Promise<Settings> {
  try {
    const { data } = await admin
      .from("newsletter_security_settings" as never)
      .select("*")
      .eq("id", 1)
      .maybeSingle();
    if (!data) return DEFAULTS;
    return { ...DEFAULTS, ...(data as Partial<Settings>) };
  } catch {
    return DEFAULTS;
  }
}

export const Route = createFileRoute("/api/public/newsletter/subscribe")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        // 1) Parse
        let payload: z.infer<typeof bodySchema>;
        try {
          const raw = await request.json();
          payload = bodySchema.parse(raw);
        } catch {
          return json(400, { ok: false, error: "invalid_request" });
        }

        const salt = process.env.NEWSLETTER_HASH_SALT || "fom-nl-v1";
        const rawIp = getRequestIP({ xForwardedFor: true }) ?? "0.0.0.0";
        const ua = getRequestHeader("user-agent") ?? "";
        const acceptLanguage = (getRequestHeader("accept-language") ?? "").slice(0, 120) || null;
        const ipHash = sha256(rawIp, salt);
        const uaHash = sha256(ua, salt);
        const timezone = payload.timezone?.slice(0, 80) ?? null;

        const supabaseAdmin = await loadAdmin();
        const settings = await loadSettings(supabaseAdmin);

        // Abuse score accumulator — recorded on the attempt row
        let abuseScore = 0;

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
              abuse_score: abuseScore,
              accept_language: acceptLanguage,
              timezone,
            } as never);
          } catch { /* never break request */ }
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
          } catch { /* never break request */ }
        };

        const applyAutoBlock = async (reason: string) => {
          if (!settings.auto_block_enabled) return;
          try {
            const expires = new Date(Date.now() + settings.block_minutes * 60_000).toISOString();
            await supabaseAdmin.from("newsletter_ip_blocks" as never).insert({
              ip_hash: ipHash,
              reason,
              score: abuseScore,
              expires_at: expires,
            } as never);
            await logAudit("auto_blocked", { reason, score: abuseScore, expires });
          } catch { /* never break */ }
        };

        // 2) Active block check (fast fail before anything else)
        if (settings.auto_block_enabled) {
          try {
            const { data: blockRow } = await supabaseAdmin
              .from("newsletter_ip_blocks" as never)
              .select("id,expires_at")
              .eq("ip_hash", ipHash)
              .is("cleared_at", null)
              .gt("expires_at", new Date().toISOString())
              .order("expires_at", { ascending: false })
              .limit(1)
              .maybeSingle();
            if (blockRow) {
              abuseScore += 100;
              await logAttempt("blocked", "ip_blocked");
              await logAudit("blocked_request", { source: "ip_block" });
              return json(429, {
                ok: false,
                error: "temporarily_blocked",
                message: "Too many attempts. Please try again later.",
              });
            }
          } catch { /* if block check fails, don't lock users out */ }
        }

        // 3) Honeypot — silent success to poison bots
        if (settings.honeypot_enabled) {
          if ((payload.website && payload.website.length > 0) ||
              (payload.company && payload.company.length > 0)) {
            abuseScore += 40;
            await logAttempt("honeypot", "honeypot_filled");
            await logAudit("honeypot_hit", { ua_hash: uaHash });
            if (abuseScore >= settings.abuse_threshold) await applyAutoBlock("honeypot");
            return json(200, { ok: true, duplicate: false });
          }
        }

        // 4) Timing floor
        if (settings.timing_floor_enabled && typeof payload.ts === "number" &&
            payload.ts < settings.min_submit_ms) {
          abuseScore += 25;
          await logAttempt("timing", `submit_ms:${payload.ts}`);
          await logAudit("timing_floor_hit", { submit_ms: payload.ts, min: settings.min_submit_ms });
          if (abuseScore >= settings.abuse_threshold) await applyAutoBlock("timing");
          // Silent success — don't teach bots the threshold
          return json(200, { ok: true, duplicate: false });
        }

        // 5) Email normalization + validation
        let email: string;
        try {
          email = emailShape.parse(normalizeEmail(payload.email));
        } catch {
          abuseScore += 5;
          await logAttempt("invalid", "email_invalid");
          return json(400, { ok: false, error: "invalid_email" });
        }

        // 6) Disposable-domain block
        if (settings.disposable_check_enabled && isDisposableEmail(email)) {
          abuseScore += 15;
          await logAttempt("disposable", "disposable_domain", email);
          await logAudit("disposable_blocked", { email }, email);
          return json(400, {
            ok: false,
            error: "disposable_email",
            message: "Please use a permanent email address.",
          });
        }

        // 7) Rate limit (tri-layer)
        if (settings.rate_limit_enabled) {
          const burstFrom = new Date(Date.now() - settings.burst_seconds * 1000).toISOString();
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

          const hitLimit = (label: string, window: string, message: string) => {
            abuseScore += 20;
            void logAttempt("rate_limited", label, email);
            void logAudit("rate_limit_hit", { window, email }, email);
            if (abuseScore >= settings.abuse_threshold) void applyAutoBlock(`rate:${window}`);
            return json(429, { ok: false, error: "rate_limited", message });
          };

          if ((burstCount ?? 0) >= settings.burst_limit) {
            return hitLimit("burst_window", "burst",
              "You're going too fast. Please wait a moment and try again.");
          }
          if ((hourCount ?? 0) >= settings.hour_limit) {
            return hitLimit("hour_window", "hour",
              "Too many attempts. Please try again later.");
          }
          if ((dayCount ?? 0) >= settings.day_limit) {
            return hitLimit("day_window", "day",
              "Daily limit reached. Please try again tomorrow.");
          }
        }

        // 8) Insert (or detect duplicate)
        const safeSource = (payload.source ?? "site")
          .replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 80) || "site";
        const nowIso = new Date().toISOString();

        const fpFields = settings.fingerprint_enabled ? {
          ip_hash: ipHash,
          ua_hash: uaHash,
          browser: browserName(ua),
          referrer: (getRequestHeader("referer") ?? getRequestHeader("referrer") ?? "").slice(0, 512) || null,
          landing_page: payload.source_page ?? null,
          accept_language: acceptLanguage,
          timezone,
        } : {};

        const row = {
          email,
          source: safeSource,
          source_page: payload.source_page ?? null,
          device: payload.device ?? null,
          country: payload.country ?? null,
          status: "subscribed",
          abuse_status: "normal",
          abuse_score: abuseScore,
          subscribed_at: nowIso,
          ...fpFields,
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
          return json(500, { ok: false, error: "server_error" });
        }

        if (isDuplicate) {
          await logAttempt("duplicate", null, email);
          await logAudit("duplicate_attempt", { source: safeSource }, email);
          return json(200, { ok: true, duplicate: true });
        }

        await logAttempt("accepted", null, email);
        await logAudit("subscribed",
          { source: safeSource, browser: browserName(ua), timezone }, email);
        return json(200, { ok: true, duplicate: false });
      },

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
