import { useRegion, type Currency } from "@/lib/region";
import { Check, ChevronDown } from "lucide-react";
import { useState, useRef, useEffect } from "react";

const OPTIONS: { code: Currency; label: string; flag: string }[] = [
  { code: "USD", label: "US Dollar", flag: "🇺🇸" },
  { code: "EUR", label: "Euro", flag: "🇪🇺" },
  { code: "INR", label: "Indian Rupee", flag: "🇮🇳" },
  { code: "AED", label: "UAE Dirham", flag: "🇦🇪" },
];

export function CurrencySwitcher() {
  const { currency, setCurrency } = useRegion();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const active = OPTIONS.find((o) => o.code === currency) ?? OPTIONS[0];

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-full border border-border text-[11px] font-mono uppercase tracking-widest hover:bg-white/5 transition-colors"
        aria-label="Change currency"
      >
        <span className="text-sm leading-none">{active.flag}</span>
        <span>{active.code}</span>
        <ChevronDown className="size-3" />
      </button>
      {open && (
        <div className="absolute right-0 top-full mt-2 w-44 rounded-2xl border border-border bg-card shadow-xl p-1 z-50">
          {OPTIONS.map((o) => (
            <button
              key={o.code}
              onClick={() => { setCurrency(o.code); setOpen(false); }}
              className="w-full flex items-center gap-2 px-3 py-2 text-left text-sm rounded-xl hover:bg-white/5"
            >
              <span>{o.flag}</span>
              <span className="flex-1">{o.label}</span>
              <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{o.code}</span>
              {o.code === currency && <Check className="size-3.5 text-accent" />}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
