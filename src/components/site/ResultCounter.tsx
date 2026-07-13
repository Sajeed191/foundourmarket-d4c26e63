/**
 * Always-visible product counter. Updates instantly as filters change (no
 * loading state) — the count is derived synchronously from the client-side
 * filtered result set.
 */
export function ResultCounter({
  count,
  className,
}: {
  count: number;
  className?: string;
}) {
  return (
    <p
      className={`text-sm font-medium text-foreground ${className ?? ""}`}
      aria-live="polite"
    >
      <span className="tabular-nums font-semibold text-accent">{count.toLocaleString()}</span>{" "}
      <span className="text-muted-foreground">{count === 1 ? "Product" : "Products"}</span>
    </p>
  );
}
