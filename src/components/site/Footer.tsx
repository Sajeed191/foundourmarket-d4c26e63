import { Link, useRouterState } from "@tanstack/react-router";
import { Instagram, Twitter, Facebook, Youtube } from "lucide-react";
import { BrandName } from "@/components/site/BrandName";

const EASE = "cubic-bezier(0.2,0.8,0.2,1)";

type NavGroup = {
  title: string;
  links: { label: string; to?: string; href?: string }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Shop",
    links: [
      { label: "Shop All", to: "/" },
      { label: "Shipping", to: "/pages/shipping" },
      { label: "Buyer Protection", to: "/buyer-protection" },
      { label: "Track Order", to: "/track" },
    ],
  },
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Blog", to: "/blog" },
      { label: "Contact", to: "/contact" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Help Center", to: "/help" },
      { label: "Contact Us", to: "/contact" },
      { label: "Returns", to: "/returns" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms", to: "/terms" },
      { label: "Refund Policy", to: "/returns" },
    ],
  },
];

const SOCIALS = [
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/foundourmarket?igsh=MXgwd3QwcXlleXhueQ==", demo: false },
  { icon: Twitter, label: "Twitter", href: "#", demo: true },
  { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/share/1DHs1PbeUN/", demo: false },
  { icon: Youtube, label: "YouTube", href: "https://youtube.com/@foundourmarket?si=JsljIPlZFQtWIb1t", demo: false },
];

/** Apple-style quiet text link with hover-underline fade (opacity only). */
function FooterLink({ to, href, label }: { to?: string; href?: string; label: string }) {
  const className =
    "group inline-flex text-[13px] text-muted-foreground/60 transition-colors duration-200 hover:text-foreground/90";
  const inner = (
    <span className="relative">
      {label}
      <span
        aria-hidden
        className="pointer-events-none absolute left-0 -bottom-0.5 h-px w-full bg-current opacity-0 transition-opacity duration-200 group-hover:opacity-40"
        style={{ transitionTimingFunction: EASE }}
      />
    </span>
  );

  if (href) {
    return (
      <a href={href} className={className} target="_blank" rel="noopener noreferrer">
        {inner}
      </a>
    );
  }
  if (!to) return <span className="text-muted-foreground/50 cursor-default text-[13px]">{inner}</span>;
  return (
    <Link to={to} className={className}>
      {inner}
    </Link>
  );
}

export function Footer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");

  if (compact) {
    return (
      <footer className="relative px-4 sm:px-6 py-4 mobile-page-clearance lg:pb-4 border-t border-white/[0.05] bg-background">
        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-[11px] text-muted-foreground/60 tracking-wide">© 2026 <BrandName /></p>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[11px] text-muted-foreground/60">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
            <Link to="/returns" className="hover:text-foreground transition-colors">Refunds</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative px-6 sm:px-8 pt-8 mobile-page-clearance md:py-24 bg-[#0b0b0f]">
      <div className="relative max-w-6xl mx-auto">
        {/* ── 1. Brand identity — minimal ── */}
        <div>
          <Link
            to="/"
            aria-label="FoundOurMarket home"
            className="inline-block text-lg font-display font-medium tracking-tight text-foreground/90 hover:opacity-80 transition-opacity duration-200"
          >
            <BrandName />
          </Link>
          <p className="mt-2 text-[13px] text-muted-foreground/45 font-light">
            Built for precision global commerce.
          </p>
        </div>

        {/* ── 2. Clean link columns ── */}
        <div className="mt-14 grid grid-cols-2 gap-y-10 gap-x-6 sm:grid-cols-4 sm:gap-x-8">
          {NAV_GROUPS.map((group) => (
            <div key={group.title}>
              <h5 className="text-[11px] font-medium uppercase tracking-[0.18em] text-foreground/40">
                {group.title}
              </h5>
              <ul className="mt-4 space-y-3">
                {group.links.map((link) => (
                  <li key={link.label}>
                    <FooterLink to={link.to} href={link.href} label={link.label} />
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        {/* ── 3. Soft utility row + 4. Support line ── */}
        <div className="mt-16 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-[12px] text-muted-foreground/45 font-light">
            Global · English (US)
          </p>
          <p className="text-[12px] text-muted-foreground/45 font-light">
            Need help?{" "}
            <a
              href="mailto:support@foundourmarket.com"
              className="text-muted-foreground/60 hover:text-foreground/90 transition-colors duration-200"
            >
              support@foundourmarket.com
            </a>
          </p>
        </div>

        {/* ── 5. Social icons — monochrome outline ── */}
        <div className="mt-14 flex justify-center gap-6">
          {SOCIALS.map(({ icon: Icon, label, href, demo }) => (
            <a
              key={label}
              href={href}
              {...(demo
                ? { onClick: (e: React.MouseEvent) => e.preventDefault() }
                : { target: "_blank", rel: "noopener noreferrer" })}
              aria-label={demo ? `${label} (demo)` : label}
              className="text-muted-foreground/35 transition-opacity duration-200 hover:opacity-100 hover:text-foreground/80"
            >
              <Icon className="size-[18px]" strokeWidth={1.5} />
            </a>
          ))}
        </div>

        {/* ── 6. Copyright bar ── */}
        <div className="mt-12 pt-6 border-t border-white/[0.04] flex flex-col items-center gap-2 sm:flex-row sm:justify-between">
          <p className="text-[11px] text-muted-foreground/40 font-light tracking-wide">
            © 2026 <BrandName />
          </p>
          <nav className="flex gap-5 text-[11px] text-muted-foreground/40 font-light">
            <Link to="/privacy" className="hover:text-foreground/80 transition-colors duration-200">Privacy</Link>
            <Link to="/terms" className="hover:text-foreground/80 transition-colors duration-200">Terms</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
}
