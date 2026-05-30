import { useSectionImpression, trackSectionClick } from "@/lib/section-analytics";

/**
 * Wraps a homepage section so it auto-tracks an impression when scrolled into
 * view and a click (via capture) on any interactive child. Transparent layout —
 * renders a plain div with the provided className.
 */
export function SectionTracker({
  sectionKey,
  className,
  children,
}: {
  sectionKey: string;
  className?: string;
  children: React.ReactNode;
}) {
  const ref = useSectionImpression<HTMLDivElement>(sectionKey);

  function onClickCapture(e: React.MouseEvent<HTMLDivElement>) {
    const target = e.target as HTMLElement;
    if (target.closest("a, button, [role='button']")) {
      const slug = target.closest<HTMLElement>("[data-product-slug]")?.dataset.productSlug;
      trackSectionClick(sectionKey, slug);
    }
  }

  return (
    <div ref={ref} className={className} onClickCapture={onClickCapture}>
      {children}
    </div>
  );
}
