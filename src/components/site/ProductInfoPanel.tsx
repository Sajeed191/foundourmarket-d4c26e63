import type { ReactNode } from "react";
import type { LucideIcon } from "lucide-react";

/**
 * ProductInfoPanel — the shared surface used for the grouped info sections on
 * the Product Details page (Key Features, Specifications, Details).
 *
 * Extracted from the three identical inline blocks that previously lived in
 * products.$slug.tsx so every panel shares one consistent treatment:
 * matching radius, border, glass surface, header rhythm and an accent-tinted
 * section icon. Presentation only — no behaviour, data or animation change.
 */
export function ProductInfoPanel({
  title,
  icon: Icon,
  children,
  className,
}: {
  title: string;
  icon?: LucideIcon;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section
      className={`mb-4 rounded-2xl border border-border bg-card/50 p-4 sm:p-5 ${className ?? ""}`}
    >
      <h2 className="mb-3 flex items-center gap-2 text-[11px] font-mono font-semibold uppercase tracking-[0.2em] text-muted-foreground">
        {Icon && (
          <span className="grid size-6 shrink-0 place-items-center rounded-lg bg-accent/10 text-accent">
            <Icon className="size-3.5" />
          </span>
        )}
        <span className="truncate">{title}</span>
      </h2>
      {children}
    </section>
  );
}
