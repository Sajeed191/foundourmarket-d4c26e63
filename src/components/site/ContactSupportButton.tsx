import { Link } from "@tanstack/react-router";
import { LifeBuoy } from "lucide-react";
import { cn } from "@/lib/utils";
import { supportSearch, type SupportPrefill } from "@/lib/support-context";

/**
 * Universal "Contact Support" entry point. Deep-links into the support page
 * with prefill params (order / return / refund / category / subject) so a
 * ticket opens with full context already attached.
 */
export function ContactSupportButton({
  prefill,
  label = "Contact Support",
  variant = "solid",
  className,
}: {
  prefill?: SupportPrefill;
  label?: string;
  variant?: "solid" | "ghost" | "subtle";
  className?: string;
}) {
  const styles =
    variant === "solid"
      ? "bg-accent text-accent-foreground hover:brightness-110"
      : variant === "subtle"
        ? "bg-white/[0.04] text-foreground ring-1 ring-white/10 hover:ring-accent/40"
        : "text-accent hover:text-accent/80";

  return (
    <Link
      to="/account/support"
      search={prefill ? supportSearch(prefill) : { compose: "1" }}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-full px-4 py-2.5 text-xs font-semibold uppercase tracking-widest transition-all",
        styles,
        className,
      )}
    >
      <LifeBuoy className="size-4" />
      {label}
    </Link>
  );
}
