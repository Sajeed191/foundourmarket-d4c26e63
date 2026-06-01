import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import { useRegion } from "@/lib/region";
import { Instagram, Twitter, Facebook, Youtube, ChevronDown } from "lucide-react";

/** Footer column that collapses into an accordion on mobile, always open on desktop. */
function FooterSection({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2.5 border-b border-border/50 md:border-0 pb-2.5 md:pb-0">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between md:pointer-events-none"
      >
        <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">{title}</h5>
        <ChevronDown className={`size-4 text-muted-foreground transition-transform md:hidden ${open ? "rotate-180" : ""}`} />
      </button>
      <div className={`${open ? "block" : "hidden"} md:block`}>{children}</div>
    </div>
  );
}


export function Footer() {
  const { market } = useRegion();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");

  // Minimal, low-distraction footer during checkout to reduce abandonment.
  if (compact) {
    return (
      <footer className="relative px-4 sm:px-6 py-4 mobile-page-clearance lg:pb-4 border-t border-border bg-background">
        <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[50%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.4 }} />
        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">© 2026 FoundOurMarket™</p>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            <Link to="/pages/$slug" params={{ slug: "privacy" }} className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/pages/$slug" params={{ slug: "terms" }} className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>
            <Link to="/returns" className="hover:text-foreground transition-colors">Refund Policy</Link>
            <Link to="/help" className="hover:text-foreground transition-colors">Contact Us</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative px-4 sm:px-6 pt-4 mobile-page-clearance sm:pt-4 md:py-4 border-t border-border bg-background overflow-hidden">
      {/* Ambient divider glow */}
      <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[70%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.6 }} />
      <div aria-hidden className="pointer-events-none absolute -top-20 left-1/2 -translate-x-1/2 w-[70%] h-32 opacity-40" style={{ background: "var(--gradient-ember-soft)", filter: "blur(70px)" }} />

      <div className="relative max-w-7xl mx-auto grid grid-cols-2 md:grid-cols-5 gap-x-5 gap-y-4 sm:gap-5">
        <div className="col-span-2 space-y-3">
          <div className="text-lg sm:text-xl font-display tracking-tighter font-semibold">
            FoundOurMarket<span className="text-accent">™</span>
          </div>
          <p className="text-xs text-muted-foreground leading-relaxed max-w-[38ch]">
            Whatever you need. All in one place. A premium independent marketplace sourcing top-quality products worldwide.
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
        <FooterSection title="Shop">
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/category/$slug" params={{ slug: "electronics" }} className="hover:text-foreground transition-colors">Electronics</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fashion" }} className="hover:text-foreground transition-colors">Fashion</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "home" }} className="hover:text-foreground transition-colors">Home</Link></li>
            <li><Link to="/category/$slug" params={{ slug: "fitness" }} className="hover:text-foreground transition-colors">Fitness</Link></li>
          </ul>
        </FooterSection>
        <FooterSection title="Support">
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li><Link to="/help" className="hover:text-foreground transition-colors">Contact Us</Link></li>
            <li><Link to="/help" className="hover:text-foreground transition-colors">Help Center</Link></li>
            <li><Link to="/track" className="hover:text-foreground transition-colors">Track Order</Link></li>
            <li><Link to="/returns" className="hover:text-foreground transition-colors">Returns &amp; Refunds</Link></li>
            <li><Link to="/pages/$slug" params={{ slug: "shipping" }} className="hover:text-foreground transition-colors">Shipping Policy</Link></li>
          </ul>
        </FooterSection>

        <div className="space-y-2.5">
          <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">Region</h5>
          <div className="w-full bg-transparent border border-border rounded-xl px-3 py-2 text-xs uppercase font-mono">
            {market === "india" ? "India · INR (₹)" : "International · USD ($)"}
          </div>
          <p className="text-[10px] text-muted-foreground leading-relaxed">
            {market === "india" ? "Pricing in ₹. Razorpay/UPI at checkout." : "Pricing in USD. International cards & PayPal."}
          </p>
        </div>
      </div>


      <div className="relative max-w-7xl mx-auto mt-3 pt-3 border-t border-border flex flex-col md:flex-row justify-between items-center gap-2 text-center md:text-left">
        <div aria-hidden className="pointer-events-none absolute top-0 left-1/2 -translate-x-1/2 w-[50%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.35 }} />
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
