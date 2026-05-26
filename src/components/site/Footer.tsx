import { Link } from "@tanstack/react-router";
import { useRegion } from "@/lib/region";

export function Footer() {
  const { region, setRegion } = useRegion();
  return (
    <footer className="px-6 py-16 border-t border-border bg-background">
      <div className="max-w-7xl mx-auto grid grid-cols-1 md:grid-cols-4 gap-12">
        <div className="space-y-6">
          <div className="text-xl font-display tracking-tighter uppercase font-semibold">
            FoundOurMarket<span className="text-accent">™</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[30ch]">
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
            <li className="hover:text-foreground transition-colors cursor-pointer">Shipping Policy</li>
            <li className="hover:text-foreground transition-colors cursor-pointer">Returns</li>
            <li className="hover:text-foreground transition-colors cursor-pointer">Contact</li>
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
      <div className="max-w-7xl mx-auto mt-16 pt-8 border-t border-border flex flex-col md:flex-row justify-between gap-4">
        <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">© 2026 FoundOurMarket. All rights reserved.</p>
        <div className="flex gap-6 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
          <span className="hover:text-foreground cursor-pointer">Privacy</span>
          <span className="hover:text-foreground cursor-pointer">Terms</span>
          <span className="hover:text-foreground cursor-pointer">Refunds</span>
        </div>
      </div>
    </footer>
  );
}
