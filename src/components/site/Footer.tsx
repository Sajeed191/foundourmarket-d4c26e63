import { Link } from "@tanstack/react-router";
import { useRegion } from "@/lib/region";
import { Instagram, Twitter, Facebook, Youtube } from "lucide-react";

export function Footer() {
  const { region, setRegion } = useRegion();
  return (
    <footer className="relative px-4 sm:px-6 pt-5 pb-[calc(7.5rem+env(safe-area-inset-bottom))] sm:pt-6 sm:pb-[calc(8rem+env(safe-area-inset-bottom))] md:py-6 border-t border-border bg-background overflow-hidden">
      {/* Ambient divider glow */}
      <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[70%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.6 }} />
      <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[70%] h-32 opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(70px)" }} />

      <div className="relative max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-5 sm:gap-6">
        <div className="col-span-2 space-y-3">
          <div className="text-lg sm:text-xl font-display tracking-tighter font-semibold">
            FoundOurMarket<span className="text-accent">™</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[38ch]">
            Everything you need. All in one place. A premium independent marketplace sourcing top-quality products worldwide.
          </p>
          {/* Social icons */}
          <div className="flex items-center gap-2 pt-0.5">
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
                className="size-8 grid place-items-center rounded-xl glass text-muted-foreground hover:text-accent hover:border-accent/40 hover:-translate-y-0.5 transition-all"
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>
        <div className="space-y-2.5">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Shop</h5>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/category/$slug" params={{ slug: "electronics" }} className="hover:text-foreground transition-colors">Electronics</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fashion" }} className="hover:text-foreground transition-colors">Fashion</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "home" }} className="hover:text-foreground transition-colors">Home</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fitness" }} className="hover:text-foreground transition-colors">Fitness</Link></li>
          </ul>
        </div>
        <div className="space-y-2.5">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Support</h5>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/track" className="hover:text-foreground transition-colors">Track Order</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "shipping" }} className="hover:text-foreground transition-colors">Shipping Policy</Link></li>
            <li><Link to="/returns" className="hover:text-foreground transition-colors">Returns</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "about" }} className="hover:text-foreground transition-colors">About</Link></li>
          </ul>
        </div>
        <div className="space-y-2.5">
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


      <div className="relative max-w-7xl mx-auto mt-6 pt-5 border-t border-border flex flex-col md:flex-row justify-between items-center md:items-start gap-4 text-center md:text-left">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">© 2026 FoundOurMarket. All rights reserved.</p>
        <div className="flex w-full max-w-sm flex-wrap justify-center gap-1.5 rounded-2xl border border-border/70 bg-card/35 p-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest backdrop-blur-xl md:w-auto md:max-w-none md:justify-end md:gap-5 md:border-0 md:bg-transparent md:p-0 md:backdrop-blur-none">
          <Link to="/pages/$slug" params={{ slug: "privacy" }} className="min-h-10 rounded-xl px-3 py-2 grid place-items-center hover:bg-accent/10 hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/pages/$slug" params={{ slug: "terms" }} className="min-h-10 rounded-xl px-3 py-2 grid place-items-center hover:bg-accent/10 hover:text-foreground transition-colors">Terms</Link>
          <Link to="/returns" className="min-h-10 rounded-xl px-3 py-2 grid place-items-center hover:bg-accent/10 hover:text-foreground transition-colors">Refunds</Link>
        </div>
      </div>
    </footer>
  );
}
