import { Link } from "@tanstack/react-router";
import { ArrowLeft, User } from "lucide-react";
import type { ComponentProps } from "react";

type LinkTo = ComponentProps<typeof Link>["to"];

type Props = {
  /** Destination route. Defaults to the account page. */
  to?: LinkTo;
  /** Visible label (sentence case). Defaults to "Account". */
  label?: string;
  /** Accessible label. Defaults to `Back to ${label}`. */
  ariaLabel?: string;
  /** Show a small account icon after the label. */
  showAccountIcon?: boolean;
  className?: string;
};

/**
 * Premium pill "back" button — black + orange glass, CSS-only transitions.
 * Reusable across Account, Orders, Wishlist, Settings, etc.
 * Respects the global `[data-low-end]` mode (effects reduced via styles.css).
 */
export function BackButton({
  to = "/account",
  label = "Account",
  ariaLabel,
  showAccountIcon = false,
  className = "",
}: Props) {
  return (
    <Link
      to={to as never}
      aria-label={ariaLabel ?? `Back to ${label}`}
      className={`premium-back-btn group inline-flex w-fit shrink-0 items-center gap-2 whitespace-nowrap rounded-full px-[18px] py-3 text-sm font-medium text-foreground ${className}`}
    >
      <ArrowLeft className="size-4 shrink-0 transition-transform duration-200 group-hover:-translate-x-0.5" />
      <span className="leading-none">{label}</span>
      {showAccountIcon && <User className="size-4 shrink-0 opacity-80" />}
    </Link>
  );
}
