import { useEffect, useRef, useState } from "react";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { trackEvent, deviceType, currentRegion } from "@/lib/visitor";

/**
 * Newsletter subscribe form.
 * Stage 1 Security update: posts to /api/public/newsletter/subscribe which
 * enforces honeypot, tri-layer rate limit, disposable-email block, and
 * spam fingerprinting. Client-side responsibilities stay tiny: validate,
 * include the honeypot fields, and translate server responses into toasts.
 */

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(255, "Email is too long.")
  .email("Enter a valid email address.");

const REQUEST_TIMEOUT_MS = 12000;
const SUBSCRIBE_URL = "/api/public/newsletter/subscribe";

type Status = "idle" | "loading" | "success" | "pending";

async function postWithTimeout(body: Record<string, unknown>) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    const res = await fetch(SUBSCRIBE_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
      credentials: "same-origin",
    });
    let data: { ok?: boolean; duplicate?: boolean; error?: string; message?: string } = {};
    try { data = await res.json(); } catch { /* non-JSON error */ }
    return { status: res.status, data };
  } finally {
    clearTimeout(timer);
  }
}

export function NewsletterForm({ source = "homepage" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState<string | null>(null);
  const [successPulse, setSuccessPulse] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const submittingRef = useRef(false);
  const trackedRef = useRef<string | null>(null);
  const mountedAtRef = useRef<number>(Date.now());
  // Honeypot state — must stay empty. Real users never see these inputs.
  const [website, setWebsite] = useState("");
  const [company, setCompany] = useState("");

  useEffect(() => { mountedAtRef.current = Date.now(); }, []);

  useEffect(() => {
    if (!email) { setError(null); return; }
    if (email.length < 4) return;
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success && /@/.test(email)) {
      setError(parsed.error.issues[0]?.message ?? null);
    } else {
      setError(null);
    }
  }, [email]);

  const submit = async (e?: React.FormEvent) => {
    e?.preventDefault();
    if (submittingRef.current || status === "loading") return;

    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid email.";
      setError(msg);
      toast.error(msg);
      inputRef.current?.focus();
      return;
    }
    const normalized = parsed.data;

    submittingRef.current = true;
    setStatus("loading");
    setError(null);

    const safeSource = source.replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 80) || "site";
    const path = typeof window !== "undefined" ? window.location.pathname : null;

    let tz: string | undefined;
    try { tz = Intl.DateTimeFormat().resolvedOptions().timeZone || undefined; } catch { /* ignore */ }

    try {
      const { status: httpStatus, data } = await postWithTimeout({
        email: normalized,
        source: safeSource,
        source_page: path,
        device: deviceType(),
        country: currentRegion() === "india" ? "IN" : "INTL",
        timezone: tz,
        website,           // honeypot
        company,           // honeypot
        ts: Date.now() - mountedAtRef.current,
      });

      // Success / duplicate
      if (httpStatus === 200 && data.ok) {
        setEmail("");
        setStatus(((data as { pending?: boolean }).pending) ? "pending" : "success");
        setSuccessPulse(true);
        window.setTimeout(() => setSuccessPulse(false), 1400);
        const isDuplicate = !!data.duplicate;
        const isPending = !!(data as { pending?: boolean }).pending;
        const successMsg = isDuplicate
          ? "You're already subscribed. 🎉"
          : isPending
            ? "Almost there — check your inbox to confirm."
            : "Subscribed! Watch your inbox.";
        toast.success(successMsg);
        inputRef.current?.blur();
        const evt = isDuplicate
          ? "newsletter_duplicate"
          : isPending
            ? "newsletter_pending"
            : "newsletter_subscribed";
        const key = `ok:${normalized}:${evt}`;
        if (trackedRef.current !== key) {
          trackedRef.current = key;
          void trackEvent(evt, {
            metadata: { source: safeSource, duplicate: isDuplicate, pending: isPending },
          });
        }
        return;
      }

      // Structured error responses
      if (httpStatus === 429) {
        const msg = data.message ?? "Too many attempts. Please try again later.";
        setError(msg); toast.error(msg);
        if (trackedRef.current !== `rl:${normalized}`) {
          trackedRef.current = `rl:${normalized}`;
          void trackEvent("newsletter_rate_limited", { metadata: { source: safeSource } });
        }
      } else if (data.error === "disposable_email") {
        const msg = data.message ?? "Please use a permanent email address.";
        setError(msg); toast.error(msg);
        if (trackedRef.current !== `dp:${normalized}`) {
          trackedRef.current = `dp:${normalized}`;
          void trackEvent("newsletter_disposable_blocked", { metadata: { source: safeSource } });
        }
      } else if (data.error === "invalid_email" || data.error === "invalid_request") {
        const msg = "Enter a valid email address.";
        setError(msg); toast.error(msg);
      } else {
        const msg = "Something went wrong. Please try again.";
        setError(msg); toast.error(msg);
        if (trackedRef.current !== `fail:${normalized}`) {
          trackedRef.current = `fail:${normalized}`;
          void trackEvent("newsletter_failed", {
            metadata: { source: safeSource, reason: data.error ?? String(httpStatus) },
          });
        }
      }
      setStatus("idle");
    } catch {
      const msg = "Network is slow. Please try again.";
      setError(msg);
      toast.error(msg);
      setStatus("idle");
    } finally {
      submittingRef.current = false;
    }
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Escape") (e.currentTarget as HTMLInputElement).blur();
  };

  if (status === "success" || status === "pending") {
    const msg = status === "pending"
      ? "Almost there — check your inbox to confirm."
      : "You're in. Watch your inbox.";
    return (
      <div
        role="status"
        aria-live="polite"
        className="max-w-md mx-auto flex items-center justify-center gap-3 px-6 py-4 rounded-full border border-accent/40 bg-accent/10 text-sm"
      >
        <Check className="size-4 text-accent shrink-0" />
        <span className="truncate">{msg}</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form
        className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full"
        onSubmit={submit}
        noValidate
      >
        <label htmlFor="newsletter-email" className="sr-only">Email address</label>
        <input
          ref={inputRef}
          id="newsletter-email"
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          required
          value={email}
          onChange={(e) => setEmail(e.target.value.replace(/\s+/g, "").toLowerCase())}
          onKeyDown={onKeyDown}
          placeholder="Email address"
          maxLength={255}
          aria-invalid={!!error}
          aria-describedby={error ? "newsletter-error" : undefined}
          disabled={status === "loading"}
          className="flex-1 min-w-0 w-full bg-card/50 border border-border rounded-full px-5 sm:px-6 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 truncate"
        />

        {/* Honeypot fields — invisible to humans, catnip for bots.
            aria-hidden + tabIndex=-1 keeps screen readers away. */}
        <div aria-hidden="true" style={{ position: "absolute", left: "-10000px", top: "auto", width: 1, height: 1, overflow: "hidden" }}>
          <label htmlFor="nl-website">Website</label>
          <input
            id="nl-website"
            type="text"
            name="website"
            tabIndex={-1}
            autoComplete="off"
            value={website}
            onChange={(e) => setWebsite(e.target.value)}
          />
          <label htmlFor="nl-company">Company</label>
          <input
            id="nl-company"
            type="text"
            name="company"
            tabIndex={-1}
            autoComplete="off"
            value={company}
            onChange={(e) => setCompany(e.target.value)}
          />
        </div>

        <button
          type="submit"
          disabled={status === "loading"}
          aria-busy={status === "loading"}
          className={`bg-accent text-accent-foreground font-bold px-6 sm:px-8 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shrink-0 ${
            successPulse ? "ring-2 ring-accent/60 scale-[1.02]" : ""
          }`}
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" aria-hidden="true" />
              <span>Subscribing…</span>
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </form>
      <p
        id="newsletter-error"
        role={error ? "alert" : undefined}
        aria-live="polite"
        className={`mt-2 text-center text-xs text-destructive min-h-[1rem] ${error ? "" : "opacity-0"}`}
      >
        {error ?? " "}
      </p>
    </div>
  );
}
