import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2, Check } from "lucide-react";
import { toast } from "sonner";
import { z } from "zod";
import { trackEvent, deviceType, currentRegion } from "@/lib/visitor";

const emailSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(1, "Enter your email address.")
  .max(255, "Email is too long.")
  .email("Enter a valid email address.");

export function NewsletterForm({ source = "homepage" }: { source?: string }) {
  const [email, setEmail] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (status === "loading") return;

    setError(null);
    const parsed = emailSchema.safeParse(email);
    if (!parsed.success) {
      const msg = parsed.error.issues[0]?.message ?? "Invalid email.";
      setError(msg);
      toast.error(msg);
      return;
    }
    const normalized = parsed.data;

    setStatus("loading");
    const safeSource = source.replace(/[^a-z0-9_.:-]/gi, "_").slice(0, 80) || "site";
    const path = typeof window !== "undefined" ? window.location.pathname : null;

    const { error: insertError } = await supabase
      .from("newsletter_subscribers")
      .insert({
        email: normalized,
        source: safeSource,
        source_page: path,
        device: deviceType(),
        country: currentRegion() === "india" ? "IN" : "INTL",
        status: "subscribed",
      });

    const isDuplicate =
      !!insertError &&
      (insertError.code === "23505" ||
        insertError.message.toLowerCase().includes("duplicate"));

    if (insertError && !isDuplicate) {
      setStatus("idle");
      setError("Something went wrong. Try again.");
      toast.error("Subscription failed. Please try again.");
      void trackEvent("newsletter_failed", {
        metadata: { source: safeSource, reason: insertError.message },
      });
      return;
    }

    setStatus("done");
    setEmail("");
    if (isDuplicate) {
      toast.success("You're already subscribed. 🎉");
    } else {
      toast.success("Subscribed! Watch your inbox.");
    }
    void trackEvent("newsletter_subscribed", {
      metadata: { source: safeSource, duplicate: isDuplicate },
    });
  };

  if (status === "done") {
    return (
      <div className="max-w-md mx-auto flex items-center justify-center gap-3 px-6 py-4 rounded-full border border-accent/40 bg-accent/10 text-sm">
        <Check className="size-4 text-accent shrink-0" />
        <span className="truncate">You're in. Watch your inbox.</span>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto">
      <form className="flex flex-col sm:flex-row gap-2 sm:gap-3 w-full" onSubmit={submit} noValidate>
        <input
          type="email"
          inputMode="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => {
            setEmail(e.target.value);
            if (error) setError(null);
          }}
          placeholder="Email address"
          maxLength={255}
          aria-invalid={!!error}
          aria-label="Email address"
          disabled={status === "loading"}
          className="flex-1 min-w-0 w-full bg-card/50 border border-border rounded-full px-5 sm:px-6 py-3 text-sm focus:outline-none focus:ring-1 focus:ring-accent disabled:opacity-60 truncate"
        />
        <button
          type="submit"
          disabled={status === "loading"}
          className="bg-accent text-accent-foreground font-bold px-6 sm:px-8 py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 disabled:cursor-not-allowed inline-flex items-center justify-center gap-2 shrink-0"
        >
          {status === "loading" ? (
            <>
              <Loader2 className="size-4 animate-spin" />
              <span>Subscribing…</span>
            </>
          ) : (
            "Subscribe"
          )}
        </button>
      </form>
      {error && (
        <p className="mt-2 text-center text-xs text-destructive">{error}</p>
      )}
    </div>
  );
}
