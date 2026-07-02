import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  ChevronDown,
  Headphones,
  ArrowRight,
} from "lucide-react";


const EASE = "cubic-bezier(0.2,0.8,0.2,1)";

type NavGroup = {
  title: string;
  links: { label: string; to?: string; badge?: string }[];
};

const NAV_GROUPS: NavGroup[] = [
  {
    title: "Company",
    links: [
      { label: "About Us", to: "/about" },
      { label: "Blog", to: "/blog" },
      { label: "Careers", badge: "Soon" },
    ],
  },
  {
    title: "Support",
    links: [
      { label: "Contact Us", to: "/contact" },
      { label: "Help Center", to: "/help" },
      { label: "Track Order", to: "/track" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Refund Policy", to: "/returns" },
    ],
  },
  {
    title: "Explore",
    links: [
      { label: "Shop All", to: "/" },
      { label: "Buyer Protection", to: "/buyer-protection" },
      { label: "Shipping Policy", to: "/pages/shipping" },
    ],
  },
];

const TRUST = ["Fast Global Delivery", "Secure Payments", "Verified Sellers", "Easy Returns"];

const SOCIALS = [
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/foundourmarket?igsh=MXgwd3QwcXlleXhueQ==", demo: false },
  { icon: Twitter, label: "Twitter", href: "#", demo: true },
  { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/share/1DHs1PbeUN/", demo: false },
  { icon: Youtube, label: "YouTube", href: "https://youtube.com/@foundourmarket?si=JsljIPlZFQtWIb1t", demo: false },
];

/** Footer link with a soft, slow hover-underline (transform only). */
function FooterLink({ to, label, badge }: { to?: string; label: string; badge?: string }) {
  const inner = (
    <span className="relative inline-flex items-center gap-1.5">
      <span className="footer-underline relative">
        {label}
        <span
          aria-hidden
          className="pointer-events-none absolute left-0 -bottom-0.5 h-px w-full origin-left scale-x-0 bg-accent/60 transition-transform duration-[280ms]"
          style={{ transitionTimingFunction: EASE }}
        />
      </span>
      {badge && (
        <span className="rounded-full px-1.5 py-px text-[8px] font-mono uppercase tracking-wider text-accent/80 bg-accent/10">
          {badge}
        </span>
      )}
    </span>
  );

  if (!to) {
    return <span className="text-muted-foreground/70 cursor-default">{inner}</span>;
  }
  return (
    <Link
      to={to}
      className="group inline-flex text-muted-foreground/70 hover:text-foreground transition-colors duration-200 [&_.footer-underline>span]:hover:scale-x-100"
    >
      {inner}
    </Link>
  );
}

/** Nav group — quiet category zone; accordion on mobile, always-expanded on desktop. */
function FooterSection({
  group,
  isOpen,
  onToggle,
}: {
  group: NavGroup;
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/[0.05] md:border-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="flex w-full items-center justify-between py-3.5 md:py-0 md:pb-4 md:pointer-events-none min-h-[44px] md:min-h-0"
      >
        <h5 className="text-[11px] font-medium uppercase tracking-[0.24em] text-foreground/55">
          {group.title}
        </h5>
        <ChevronDown
          className="size-4 text-muted-foreground/60 md:hidden"
          style={{
            transition: `transform 240ms ${EASE}`,
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      <div
        className={`grid transition-all duration-[280ms] md:!grid-rows-[1fr] md:!opacity-100 ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        style={{ transitionTimingFunction: EASE }}
      >
        <ul className="overflow-hidden text-sm space-y-2.5 pb-4 md:pb-0">
          {group.links.map((link) => (
            <li key={link.label}>
              <FooterLink to={link.to} label={link.label} badge={link.badge} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

export function Footer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");
  const [openSection, setOpenSection] = useState<string | null>(null);

  // Minimal, low-distraction footer during checkout to reduce abandonment.
  if (compact) {
    return (
      <footer className="relative px-4 sm:px-6 py-4 mobile-page-clearance lg:pb-4 border-t border-white/[0.05] bg-background">
        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">© 2026 FoundOurMarket™</p>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
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
    <footer
      className="relative px-6 sm:px-8 pt-14 mobile-page-clearance md:py-20 overflow-hidden"
      style={{
        background:
          "radial-gradient(120% 80% at 50% 0%, #101017 0%, #0A0A0E 45%, #070709 100%)",
      }}
    >
      {/* soft vignette edges */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0"
        style={{
          boxShadow: "inset 0 60px 120px -60px rgba(0,0,0,0.8), inset 0 -40px 100px -60px rgba(0,0,0,0.6)",
        }}
      />
      {/* very low-opacity noise texture */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 opacity-[0.025] mix-blend-soft-light"
        style={{
          backgroundImage:
            "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='120' height='120'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23n)'/%3E%3C/svg%3E\")",
        }}
      />

      <div className="relative max-w-6xl mx-auto">
        {/* ── 1. Brand experience core ── */}
        <div className="max-w-2xl">
          <Link
            to="/"
            aria-label="FoundOurMarket home"
            className="inline-block text-3xl sm:text-5xl font-display font-medium tracking-tight text-foreground/95 hover:opacity-90 transition-opacity duration-200"
          >
            FoundOurMarket<span className="text-accent font-normal">™</span>
          </Link>
          <p className="mt-5 text-base sm:text-lg font-light text-muted-foreground/75 leading-relaxed max-w-xl">
            A curated marketplace for products selected with precision, delivered globally.
          </p>
          {/* soft animated gradient line */}
          <div aria-hidden className="mt-8 h-px w-full max-w-sm overflow-hidden">
            <div
              className="animate-footer-line h-px w-[130%]"
              style={{
                background:
                  "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-accent) 60%, transparent), transparent)",
              }}
            />
          </div>
        </div>

        {/* ── 2. Trust layer — floating micro chips ── */}
        <div className="mt-10 -mx-1 flex gap-3 overflow-x-auto no-scrollbar sm:flex-wrap sm:overflow-visible pb-1">
          {TRUST.map((label) => (
            <span
              key={label}
              className="group shrink-0 inline-flex items-center rounded-full bg-white/[0.03] px-4 py-2 text-[13px] font-light text-muted-foreground/70 whitespace-nowrap transition-[transform,color,box-shadow,background] duration-200 hover:-translate-y-0.5 hover:text-foreground hover:bg-white/[0.05]"
              style={{ transitionTimingFunction: EASE }}
              onMouseEnter={(e) => {
                e.currentTarget.style.boxShadow =
                  "0 8px 30px -12px color-mix(in oklab, var(--color-accent) 45%, transparent)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.boxShadow = "none";
              }}
            >
              {label}
            </span>
          ))}
        </div>

        {/* ── 3. Navigation system — luxury grid + 4. contact module ── */}
        <div className="mt-14 grid grid-cols-1 md:grid-cols-12 gap-x-8 gap-y-2 md:gap-y-10">
          <div className="md:col-span-8 grid grid-cols-1 md:grid-cols-4 gap-x-8 gap-y-0 md:gap-y-0">
            {NAV_GROUPS.map((group) => (
              <FooterSection
                key={group.title}
                group={group}
                isOpen={openSection === group.title}
                onToggle={() => setOpenSection((cur) => (cur === group.title ? null : group.title))}
              />
            ))}
          </div>

          {/* Intelligent contact module */}
          <div className="md:col-span-4 pt-6 md:pt-0">
            <h4 className="text-lg font-light text-foreground/90">Need help?</h4>
            <div className="mt-3 space-y-1.5">
              <a
                href="mailto:support@foundourmarket.com"
                className="block text-sm text-muted-foreground/75 hover:text-foreground transition-colors"
              >
                support@foundourmarket.com
              </a>
              <a
                href="https://wa.me/919745844213"
                target="_blank"
                rel="noopener noreferrer"
                className="block text-sm text-muted-foreground/75 hover:text-foreground transition-colors"
              >
                +91 97458 44213
              </a>
            </div>
            <Link
              to="/contact"
              className="group relative mt-5 inline-flex items-center gap-2 rounded-full px-5 py-3 text-sm font-medium text-foreground overflow-hidden transition-transform duration-200 hover:scale-[1.02] active:scale-100"
              style={{ transitionTimingFunction: EASE }}
            >
              <span
                aria-hidden
                className="animate-cta-breathe absolute inset-0 rounded-full"
                style={{
                  background:
                    "radial-gradient(120% 120% at 30% 30%, color-mix(in oklab, var(--color-accent) 40%, transparent), transparent 70%)",
                }}
              />
              <span aria-hidden className="absolute inset-0 rounded-full bg-white/[0.04]" />
              <Headphones className="relative size-4 text-accent" />
              <span className="relative">Talk to Support</span>
              <ArrowRight className="relative size-4 transition-transform duration-200 group-hover:translate-x-0.5" style={{ transitionTimingFunction: EASE }} />
            </Link>
          </div>
        </div>

        {/* ── 5. Social experience bar — floating glass capsule ── */}
        <div className="mt-16 flex justify-center md:justify-start">
          <div className="inline-flex items-center gap-2 rounded-full bg-white/[0.03] p-1.5">
            {SOCIALS.map(({ icon: Icon, label, href, demo }) => (
              <a
                key={label}
                href={href}
                {...(demo
                  ? { onClick: (e: React.MouseEvent) => e.preventDefault() }
                  : { target: "_blank", rel: "noopener noreferrer" })}
                aria-label={demo ? `${label} (demo)` : label}
                className="grid size-10 place-items-center rounded-full text-muted-foreground/60 transition-[transform,color,box-shadow,background] duration-200 hover:text-accent hover:bg-white/[0.05] hover:-translate-y-0.5"
                style={{ transitionTimingFunction: EASE }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.boxShadow =
                    "0 0 20px -4px color-mix(in oklab, var(--color-accent) 40%, transparent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.boxShadow = "none";
                }}
              >
                <Icon className="size-[18px]" />
              </a>
            ))}
          </div>
        </div>

        {/* ── 6. Signature line ── */}
        <div className="mt-14 pt-6 border-t border-white/[0.05] flex flex-col sm:flex-row items-center justify-between gap-2 text-center">
          <p className="text-[11px] font-light text-muted-foreground/55 tracking-wide">
            © 2026 FoundOurMarket — All rights reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
