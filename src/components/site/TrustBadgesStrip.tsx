import { Truck, ShieldCheck, RotateCcw, Headphones, Lock, Globe2, BadgeCheck } from "lucide-react";

const ITEMS = [
  { icon: Truck, label: "Fast Delivery" },
  { icon: ShieldCheck, label: "Secure Checkout" },
  { icon: RotateCcw, label: "Easy Returns" },
  { icon: Headphones, label: "24/7 Support" },
];

// Premium desktop credibility strip — minimal luxury, monochrome icons.
const DESKTOP_ITEMS = [
  { icon: Lock, label: "Secure Payments" },
  { icon: ShieldCheck, label: "Buyer Protection" },
  { icon: Globe2, label: "Global Shipping" },
  { icon: RotateCcw, label: "Easy Returns" },
  { icon: BadgeCheck, label: "Verified Suppliers" },
];

/**
 * Trust strip between the hero and categories. Mobile keeps the compact 4-up
 * layout untouched; desktop shows a refined 5-up credibility row.
 */
export function TrustBadgesStrip() {
  return (
    <section className="px-4 sm:px-6 lg:px-10 pt-1 lg:pt-4 pb-4 lg:pb-8 max-w-7xl lg:max-w-[1480px] mx-auto">
      {/* Mobile / tablet — unchanged */}
      <div className="grid grid-cols-4 gap-2 sm:gap-3 lg:hidden">
        {ITEMS.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="feature-card group flex h-[72px] flex-col items-center justify-center gap-1.5 rounded-2xl px-1.5 py-3 text-center"
          >
            <span className="flex h-[18px] w-[18px] shrink-0 items-center justify-center">
              <Icon
                width={18}
                height={18}
                className="text-accent transition-transform duration-300 [transition-timing-function:cubic-bezier(0.22,1,0.36,1)] group-hover:rotate-[8deg] group-hover:scale-110"
                strokeWidth={2}
              />
            </span>
            <span className="flex h-[26px] items-center justify-center text-[9px] sm:text-[11px] font-medium leading-[1.15] text-white/90">
              {label}
            </span>
          </div>
        ))}

      </div>

      {/* Desktop — premium monochrome credibility strip with separators */}
      <div className="hidden lg:flex items-center justify-between rounded-2xl glass-strong ring-1 ring-white/10 px-8 py-5 shadow-[var(--shadow-float)]">
        {DESKTOP_ITEMS.map(({ icon: Icon, label }, i) => (
          <div key={label} className="flex items-center">
            <div className="group flex items-center gap-3">
              <span className="grid size-9 place-items-center rounded-xl bg-white/5 ring-1 ring-white/10 text-foreground/80 transition-all duration-300 group-hover:text-accent group-hover:ring-accent/30">
                <Icon className="size-[18px]" strokeWidth={1.75} />
              </span>
              <span className="text-[13px] font-medium tracking-tight text-foreground/90">{label}</span>
            </div>
            {i < DESKTOP_ITEMS.length - 1 && (
              <span aria-hidden className="ml-8 h-8 w-px bg-gradient-to-b from-transparent via-white/15 to-transparent" />
            )}
          </div>
        ))}
      </div>
    </section>
  );
}
