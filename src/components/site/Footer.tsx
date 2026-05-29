import { Link } from "@tanstack/react-router";
import { useRegion } from "@/lib/region";
import { Instagram, Twitter, Facebook, Youtube, ShieldCheck, Lock, CreditCard } from "lucide-react";

export function Footer() {
  const { region, setRegion } = useRegion();
  return (
    <footer className="relative px-4 sm:px-6 py-10 sm:py-12 border-t border-border bg-background safe-bottom overflow-hidden">
      {/* Ambient divider glow */}
      <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[60%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.5 }} />
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[70%] h-40 opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(80px)" }} />

      <div className="relative max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-7 sm:gap-8">
        <div className="col-span-2 space-y-4">
          <div className="text-lg sm:text-xl font-display tracking-tighter font-semibold">
            FoundOurMarket<span className="text-accent">™</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[38ch]">
            Everything you need. All in one place. A premium independent marketplace sourcing top-quality products worldwide.
          </p>
          {/* Social icons */}
          <div className="flex items-center gap-2.5 pt-1">
            {[
              { icon: Instagram, label: "Instagram" },
              { icon: Twitter, label: "Twitter" },
              { icon: Facebook, label: "Facebook" },
              { icon: Youtube, label: "YouTube" },
            ].map(({ icon: Icon, label }) => (
              <a
                key={label}
                href="#"
                aria-label={label}
                className="size-9 grid place-items-center rounded-xl glass text-muted-foreground hover:text-accent hover:border-accent/40 hover:-translate-y-0.5 transition-all"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-3.5">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Shop</h5>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/category/$slug" params={{ slug: "electronics" }} className="hover:text-foreground transition-colors">Electronics</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fashion" }} className="hover:text-foreground transition-colors">Fashion</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "home" }} className="hover:text-foreground transition-colors">Home</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fitness" }} className="hover:text-foreground transition-colors">Fitness</Link></li>
          </ul>
        </div>
        <div className="space-y-3.5">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Support</h5>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/track" className="hover:text-foreground transition-colors">Track Order</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "shipping" }} className="hover:text-foreground transition-colors">Shipping Policy</Link></li>
            <li><Link to="/returns" className="hover:text-foreground transition-colors">Returns</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "about" }} className="hover:text-foreground transition-colors">About</Link></li>
          </ul>
        </div>
        <div className="space-y-3.5">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Region</h5>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as "IN" | "INTL")}
            className="w-full bg-transparent border border-border rounded-xl px-3 py-2 text-xs uppercase font-mono hover:border-accent/40 focus:border-accent/60 transition-colors outline-none"
          >
            <option value="INTL">International · USD ($)</option>
            <option value="IN">India · INR (₹)</option>
          </select>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {region === "IN" ? "Pricing in ₹. Razorpay/UPI at checkout." : "Pricing in USD. International cards & PayPal."}
          </p>
        </div>
      </div>

      {/* Trust + payment badges */}
      <div className="relative max-w-7xl mx-auto mt-8 pt-6 border-t border-border flex flex-col sm:flex-row items-center justify-between gap-4">
        <div className="flex flex-wrap items-center justify-center gap-2.5">
          {[
            { icon: ShieldCheck, text: "Buyer Protection" },
            { icon: Lock, text: "Secure Checkout" },
            { icon: CreditCard, text: "Encrypted Payments" },
          ].map(({ icon: Icon, text }) => (
            <span key={text} className="inline-flex items-center gap-1.5 rounded-full glass px-3 py-1.5 text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
              <Icon className="size-3.5 text-accent" /> {text}
            </span>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          {["VISA", "MC", "AMEX", "UPI", "PayPal"].map((p) => (
            <span key={p} className="px-2 py-1 rounded-md bg-white/[0.06] border border-border text-[9px] font-mono font-semibold tracking-wider text-muted-foreground">
              {p}
            </span>
          ))}
        </div>
      </div>

      <div className="relative max-w-7xl mx-auto mt-6 pt-5 border-t border-border flex flex-col md:flex-row justify-between gap-3 text-center md:text-left">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">© 2026 FoundOurMarket. All rights reserved.</p>
        <div className="flex flex-wrap justify-center md:justify-end gap-4 sm:gap-6 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          <Link to="/pages/$slug" params={{ slug: "privacy" }} className="hover:text-foreground">Privacy</Link>
          <Link to="/pages/$slug" params={{ slug: "terms" }} className="hover:text-foreground">Terms</Link>
          <Link to="/returns" className="hover:text-foreground">Refunds</Link>
        </div>
      </div>
    </footer>
  );
}
