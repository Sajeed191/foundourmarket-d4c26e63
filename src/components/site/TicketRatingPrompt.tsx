import { useCallback, useEffect, useState } from "react";
import { Star, Loader2, CheckCircle2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

const skipKey = (ticketId: string) => `fom-rating-skip:${ticketId}`;

/**
 * One-time customer satisfaction prompt shown when a ticket is resolved/closed.
 * Prompts only once per ticket: a stored rating (rated_at) or a local "skip"
 * suppresses it permanently. Captures an analytics snapshot at rating time.
 */
export function TicketRatingPrompt({ ticketId, userId }: { ticketId: string; userId: string }) {
  const [phase, setPhase] = useState<"loading" | "prompt" | "done" | "hidden">("loading");
  const [rating, setRating] = useState(0);
  const [hover, setHover] = useState(0);
  const [comment, setComment] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const check = useCallback(async () => {
    const { data } = await supabase
      .from("support_ticket_ratings")
      .select("id")
      .eq("ticket_id", ticketId)
      .maybeSingle();
    if (data) return setPhase("hidden");
    if (typeof window !== "undefined" && localStorage.getItem(skipKey(ticketId))) return setPhase("hidden");
    setPhase("prompt");
  }, [ticketId]);

  useEffect(() => { void check(); }, [check]);

  function skip() {
    if (typeof window !== "undefined") localStorage.setItem(skipKey(ticketId), "1");
    setPhase("hidden");
  }

  async function submit() {
    if (rating < 1) return;
    setSubmitting(true);
    try {
      // Snapshot ticket fields for future reporting.
      const { data: t } = await supabase
        .from("support_tickets")
        .select("category,priority,assigned_to,created_at,resolved_at,closed_at")
        .eq("id", ticketId)
        .maybeSingle();
      const tk = t as
        | { category: string; priority: string; assigned_to: string | null; created_at: string; resolved_at: string | null; closed_at: string | null }
        | null;
      const end = tk?.resolved_at ?? tk?.closed_at ?? null;
      const resolution_time_ms = tk && end ? +new Date(end) - +new Date(tk.created_at) : null;

      const { resilientInsert } = await import("@/lib/infra/supabase-resilient");
      const r = await resilientInsert("support.message.send", "support_ticket_ratings", {
        ticket_id: ticketId,
        customer_id: userId,
        rating,
        comment: comment.trim() || null,
        category: tk?.category ?? null,
        priority: tk?.priority ?? null,
        assigned_agent: tk?.assigned_to ?? null,
        resolution_time_ms,
      }, `support.rate:${ticketId}:${userId}`);
      if (!r.ok) throw r.error ?? new Error("Failed");
      setPhase("done");

    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Could not submit feedback");
    } finally {
      setSubmitting(false);
    }
  }

  if (phase === "loading" || phase === "hidden") return null;

  if (phase === "done") {
    return (
      <div className="mt-3 rounded-2xl glass p-4 text-center">
        <CheckCircle2 className="size-6 mx-auto text-emerald-400 mb-2" />
        <p className="text-sm font-medium">Thank you for your feedback.</p>
        <p className="text-xs text-muted-foreground mt-0.5">Your feedback helps us improve FoundOurMarket™.</p>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-2xl glass-strong p-4">
      <p className="text-sm font-medium text-center">How was your support experience?</p>
      <div className="mt-3 flex items-center justify-center gap-1.5">
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            onMouseEnter={() => setHover(n)}
            onMouseLeave={() => setHover(0)}
            onClick={() => setRating(n)}
            aria-label={`${n} star${n > 1 ? "s" : ""}`}
            className="p-0.5 transition-transform active:scale-90"
          >
            <Star
              className={cn(
                "size-7 transition-colors",
                (hover || rating) >= n ? "fill-accent text-accent" : "text-muted-foreground/40",
              )}
            />
          </button>
        ))}
      </div>
      <textarea
        value={comment}
        onChange={(e) => setComment(e.target.value)}
        rows={2}
        maxLength={1000}
        placeholder="Add an optional comment…"
        className="mt-3 w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 resize-none transition"
      />
      <div className="mt-3 flex items-center gap-2">
        <button
          onClick={submit}
          disabled={rating < 1 || submitting}
          className="flex-1 inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground rounded-full px-4 py-2.5 text-xs font-bold uppercase tracking-widest disabled:opacity-50 hover:brightness-110 transition"
        >
          {submitting ? <Loader2 className="size-4 animate-spin" /> : "Submit Feedback"}
        </button>
        <button
          onClick={skip}
          disabled={submitting}
          className="px-4 py-2.5 text-xs font-semibold uppercase tracking-widest text-muted-foreground hover:text-foreground transition"
        >
          Skip
        </button>
      </div>
    </div>
  );
}
