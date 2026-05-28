import { ShieldCheck, BadgeCheck, Lock } from "lucide-react";

const ITEMS = [
  { icon: ShieldCheck, label: "Secure checkout", hint: "256-bit SSL" },
  { icon: BadgeCheck, label: "Verified sellers", hint: "Hand-picked" },
  { icon: Lock, label: "Buyer protection", hint: "Money-back" },
];

export function TrustBadgesStrip() {
  return (
    <section className="px-4 sm:px-6 pt-2 pb-6 max-w-7xl mx-auto">
      <div className="flex gap-2 sm:gap-3 overflow-x-auto snap-x snap-mandatory [scrollbar-width:none] [&::-webkit-scrollbar]:hidden -mx-1 px-1">
        {ITEMS.map(({ icon: Icon, label, hint }) => (
          <div
            key={label}
            className="snap-start shrink-0 w-[44%] sm:w-auto sm:flex-1 flex items-center gap-2.5 glass rounded-2xl px-3 py-2.5 ring-1 ring-white/5"
          >
            <div className="size-8 grid place-items-center rounded-lg bg-accent/10 text-accent shrink-0">
              <Icon className="size-4" />
            </div>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold leading-tight truncate">{label}</p>
              <p className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground truncate">{hint}</p>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
