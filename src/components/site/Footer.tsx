import { Link } from "@tanstack/react-router";
import { useRegion } from "@/lib/region";

export function Footer() {
  const { region, setRegion } = useRegion();
  return (
    <footer className="px-4 sm:px-6 py-12 sm:py-16 border-t border-border bg-background safe-bottom">
      <div className="max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-4 gap-8 sm:gap-12">
        <div className="col-span-2 md:col-span-1 space-y-4 sm:space-y-6">
          <div className="text-lg sm:text-xl font-display tracking-tighter uppercase font-semibold">
            FoundOurMarket<span className="text-accent">™</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[34ch]">
            Everything you need. All in one place. A premium independent marketplace sourcing top-quality products worldwide.
          </p>
        </div>
        <div className="space-y-4">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Shop</h5>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/category/$slug" params={{ slug: "electronics" }} className="hover:text-foreground transition-colors">Electronics</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fashion" }} className="hover:text-foreground transition-colors">Fashion</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "home" }} className="hover:text-foreground transition-colors">Home</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fitness" }} className="hover:text-foreground transition-colors">Fitness</Link></li>
          </ul>
        </div>
        <div className="space-y-4">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Support</h5>
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/track" className="hover:text-foreground transition-colors">Track Order</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "shipping" }} className="hover:text-foreground transition-colors">Shipping Policy</Link></li>
            <li><Link to="/returns" className="hover:text-foreground transition-colors">Returns</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "about" }} className="hover:text-foreground transition-colors">About</Link></li>
            <li><Link to="/blog" className="hover:text-foreground transition-colors">Journal</Link></li>
          </ul>
        </div>
        <div className="space-y-4">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Region</h5>
          <select
            value={region}
            onChange={(e) => setRegion(e.target.value as "IN" | "INTL")}
            className="w-full bg-transparent border border-border rounded px-3 py-2 text-xs uppercase font-mono"
          >
            <option value="INTL">International · USD ($)</option>
            <option value="IN">India · INR (₹)</option>
          </select>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {region === "IN" ? "Pricing in ₹. Razorpay/UPI at checkout." : "Pricing in USD. International cards & PayPal."}
          </p>
        </div>
      </div>
      <div className="max-w-7xl mx-auto mt-10 sm:mt-16 pt-6 sm:pt-8 border-t border-border flex flex-col md:flex-row justify-between gap-4 text-center md:text-left">
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
