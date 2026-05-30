import { useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

type Props = {
  /** Whether the entity is currently active/published/visible. */
  active: boolean;
  /** Called with the desired next state. Should persist to the backend. */
  onToggle: (next: boolean) => Promise<void>;
  /** Short noun used in the toast + a11y label, e.g. "Banner", "Category". */
  label?: string;
  /** Compact pill variant for tight surfaces (announcement bar, cards). */
  size?: "sm" | "md";
  className?: string;
};

/**
 * Reusable inline visibility toggle for the global admin overlay. Lets staff
 * flip an entity's active/published state directly on the storefront without
 * opening an edit sheet. Optimistic with rollback on failure; every write is
 * still enforced server-side via RLS + role checks.
 */
export function InlineActiveToggle({ active, onToggle, label = "Item", size = "md", className }: Props) {
  const [busy, setBusy] = useState(false);

  async function handle(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (busy) return;
    const next = !active;
    setBusy(true);
    try {
      await onToggle(next);
      toast.success(next ? `${label} published` : `${label} hidden`);
    } catch (err) {
      toast.error("Update failed", {
        description: err instanceof Error ? err.message : "Try again.",
      });
    } finally {
      setBusy(false);
    }
  }

  const Icon = busy ? Loader2 : active ? Eye : EyeOff;
  const iconSize = size === "sm" ? "size-3" : "size-3.5";

  return (
    <button
      type="button"
      onClick={handle}
      disabled={busy}
      aria-label={`${active ? "Hide" : "Publish"} ${label.toLowerCase()}`}
      title={active ? `${label} is live — click to hide` : `${label} is hidden — click to publish`}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border font-mono uppercase tracking-widest backdrop-blur-md transition-all disabled:opacity-60",
        size === "sm" ? "px-2 py-1 text-[9px]" : "px-2.5 py-1.5 text-[10px]",
        active
          ? "border-accent/40 bg-accent/15 text-accent hover:bg-accent/25"
          : "border-border bg-background/70 text-muted-foreground hover:border-accent/30 hover:text-accent",
        className,
      )}
    >
      <Icon className={cn(iconSize, busy && "animate-spin")} />
      {active ? "Live" : "Hidden"}
    </button>
  );
}
