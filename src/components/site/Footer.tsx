import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";

import {
  Instagram,
  Twitter,
  Facebook,
  Youtube,
  ChevronDown,
  Mail,
  MessageCircle,
  Truck,
  ShieldCheck,
  RotateCcw,
  Globe,
  ArrowRight,
  Headphones,
} from "lucide-react";
import { BUILD_ID } from "@/lib/build-version";

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
      { label: "Returns & Refunds", to: "/returns" },
    ],
  },
  {
    title: "Legal",
    links: [
      { label: "Privacy Policy", to: "/privacy" },
      { label: "Terms & Conditions", to: "/terms" },
      { label: "Shipping Policy", to: "/pages/shipping" },
      { label: "Refund Policy", to: "/returns" },
    ],
  },
  {
    title: "Customer Care",
    links: [
      { label: "Buyer Protection", to: "/buyer-protection" },
      { label: "FAQ", to: "/help" },
      { label: "Support Center", to: "/help" },
    ],
  },
];

const TRUST_BADGES = [
  { icon: Truck, label: "Fast Global Delivery" },
  { icon: ShieldCheck, label: "Secure Payments" },
  { icon: RotateCcw, label: "Easy Returns" },
  { icon: Globe, label: "Worldwide Sourcing" },
];

const SOCIALS = [
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/foundourmarket?igsh=MXgwd3QwcXlleXhueQ==", demo: false },
  { icon: Twitter, label: "Twitter", href: "#", demo: true },
  { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/share/1DHs1PbeUN/", demo: false },
  { icon: Youtube, label: "YouTube", href: "https://youtube.com/@foundourmarket?si=JsljIPlZFQtWIb1t", demo: false },
];

/**
 * Accordion footer group — single-open behavior on mobile, always open on desktop.
 * Expand/collapse uses grid-template-rows (0fr → 1fr) + opacity: smooth, no blur,
 * no reflow jank. Chevron rotates with the shared easing curve.
 */
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
    <div className="border-b border-border/40 md:border-0 pb-1.5 md:pb-0">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="group flex w-full items-center justify-between py-1 md:py-0 md:pointer-events-none"
      >
        <h5 className="relative text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
          {group.title}
          {/* active accent underline — mobile only */}
          <span
            aria-hidden
            className={`absolute -bottom-1 left-0 h-px bg-accent transition-all duration-200 md:hidden ${
              isOpen ? "w-full opacity-70" : "w-0 opacity-0"
            }`}
            style={{ transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
          />
        </h5>
        <ChevronDown
          className={`size-4 text-muted-foreground transition-transform duration-200 md:hidden ${isOpen ? "rotate-180" : ""}`}
          style={{ transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
        />
      </button>
      <div
        className={`grid transition-all duration-200 md:!grid-rows-[1fr] md:!opacity-100 ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
      >
        <ul className="overflow-hidden text-xs space-y-2 text-muted-foreground pt-1.5 md:pt-2.5">
          {group.links.map((link) => (
            <li key={link.label}>
              {link.to ? (
                <Link to={link.to} className="hover:text-foreground transition-colors">
                  {link.label}
                </Link>
              ) : (
                <span className="inline-flex items-center gap-1.5 cursor-default">
                  {link.label}
                  {link.badge && (
                    <span className="rounded-full border border-border px-1.5 py-px text-[8px] font-mono uppercase tracking-wider text-accent">
                      {link.badge}
                    </span>
                  )}
                </span>
              )}
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
      <footer className="relative px-4 sm:px-6 py-4 mobile-page-clearance lg:pb-4 border-t border-border bg-background">
        <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[50%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.4 }} />
        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-[10px] font-mono text-muted-foreground uppercase tracking-widest">© 2026 FoundOurMarket™</p>
          <nav className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 text-[10px] font-mono text-muted-foreground uppercase tracking-widest">
            <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy Policy</Link>
            <Link to="/terms" className="hover:text-foreground transition-colors">Terms &amp; Conditions</Link>
            <Link to="/returns" className="hover:text-foreground transition-colors">Refund Policy</Link>
            <Link to="/contact" className="hover:text-foreground transition-colors">Contact Us</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative px-4 sm:px-6 pt-6 mobile-page-clearance md:py-8 border-t border-border bg-background overflow-hidden">
      {/* Ambient divider glow — opacity-based, no backdrop-filter */}
      <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[70%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.6 }} />
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[80%] h-40 opacity-40" style={{ background: "var(--gradient-ember-soft)" }} />

      {/* ── 1. Brand identity block ── */}
      <div className="relative max-w-7xl mx-auto">
        <div className="max-w-[42ch] space-y-2.5">
          <Link to="/" aria-label="FoundOurMarket home" className="inline-block text-xl sm:text-2xl font-display tracking-tighter font-semibold hover:opacity-90 transition-opacity">
            FoundOurMarket<span className="text-accent">™</span>
          </Link>
          <p className="text-xs sm:text-sm text-muted-foreground leading-relaxed">
            Curated global products with precision — a premium independent marketplace sourcing top-quality goods worldwide.
          </p>
        </div>
        {/* gradient divider */}
        <div aria-hidden className="mt-5 h-px w-full" style={{ background: "linear-gradient(90deg, transparent, color-mix(in oklab, var(--color-accent) 35%, transparent), transparent)" }} />
      </div>

      {/* ── 2. Trust & value row ── */}
      <div className="relative max-w-7xl mx-auto mt-5 grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {TRUST_BADGES.map(({ icon: Icon, label }) => (
          <div
            key={label}
            className="flex items-center gap-2.5 rounded-2xl bg-card/60 border border-border/50 px-3 py-2.5 transition-transform duration-200 hover:scale-[1.03] active:scale-[0.98]"
            style={{ transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
          >
            <span
              className="grid place-items-center size-8 shrink-0 rounded-full text-accent"
              style={{ background: "color-mix(in oklab, var(--color-accent) 12%, transparent)", boxShadow: "inset 0 0 12px color-mix(in oklab, var(--color-accent) 18%, transparent)" }}
            >
              <Icon className="size-4" />
            </span>
            <span className="text-[11px] sm:text-xs font-medium leading-tight text-foreground/90">{label}</span>
          </div>
        ))}
      </div>

      {/* ── 3 + 4. Contact / social  +  accordion navigation ── */}
      <div className="relative max-w-7xl mx-auto mt-6 grid grid-cols-1 md:grid-cols-6 gap-x-6 gap-y-5">
        <div className="md:col-span-2 space-y-3.5">
          <ul className="text-xs space-y-2 text-muted-foreground">
            <li>
              <a href="mailto:support@foundourmarket.com" className="flex items-center gap-2 hover:text-foreground transition-colors">
                <Mail className="size-3.5 text-accent shrink-0" />
                <span className="truncate">support@foundourmarket.com</span>
              </a>
            </li>
            <li>
              <a href="https://wa.me/919745844213" target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 hover:text-foreground transition-colors">
                <MessageCircle className="size-3.5 text-accent shrink-0" />
                <span>+91 97458 44213</span>
              </a>
            </li>
          </ul>
          <div className="flex items-center gap-2.5">
            {SOCIALS.map(({ icon: Icon, label, href, demo }) => (
              <a
                key={label}
                href={href}
                {...(demo
                  ? { onClick: (e: React.MouseEvent) => e.preventDefault() }
                  : { target: "_blank", rel: "noopener noreferrer" })}
                aria-label={demo ? `${label} (demo)` : label}
                className="size-9 grid place-items-center rounded-full bg-card/60 border border-border/50 text-muted-foreground transition-all duration-200 hover:text-accent hover:border-accent/40 hover:scale-[1.08] active:scale-95"
                style={{ transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
              >
                <Icon className="size-4" />
              </a>
            ))}
          </div>
        </div>

        {NAV_GROUPS.map((group) => (
          <FooterSection
            key={group.title}
            group={group}
            isOpen={openSection === group.title}
            onToggle={() => setOpenSection((cur) => (cur === group.title ? null : group.title))}
          />
        ))}
      </div>

      {/* ── 5. Smart footer CTA strip ── */}
      <div className="relative max-w-7xl mx-auto mt-7">
        <div className="flex flex-col sm:flex-row items-center justify-between gap-3 rounded-3xl border border-border/50 bg-card/50 px-4 py-4 sm:px-6">
          <div className="text-center sm:text-left">
            <p className="text-sm font-semibold text-foreground">Need help finding something?</p>
            <p className="text-xs text-muted-foreground mt-0.5">Our team sources products worldwide, just for you.</p>
          </div>
          <Link
            to="/contact"
            className="relative isolate inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-11 rounded-full px-6 text-sm font-semibold text-accent-foreground overflow-hidden transition-transform duration-200 active:scale-[0.98]"
            style={{ background: "linear-gradient(90deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 60%, gold))", transitionTimingFunction: "cubic-bezier(0.2,0.8,0.2,1)" }}
          >
            <span aria-hidden className="animate-cta-breathe pointer-events-none absolute inset-0 -z-10" style={{ background: "radial-gradient(circle at center, color-mix(in oklab, var(--color-accent) 55%, transparent), transparent 70%)" }} />
            <Headphones className="size-4" />
            Talk to Support
            <ArrowRight className="size-4" />
          </Link>
        </div>
      </div>

      {/* ── 6. Copyright bar ── */}
      <div className="relative max-w-7xl mx-auto mt-6 pt-4 border-t border-border/60 flex flex-col md:flex-row justify-between items-center gap-2 text-center md:text-left">
        <p className="text-[10px] font-mono text-muted-foreground/80 uppercase tracking-widest">
          © 2026 FoundOurMarket. All rights reserved. <span className="opacity-60 normal-case">build {BUILD_ID}</span>
        </p>
        <div className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[10px] font-mono text-muted-foreground/80 uppercase tracking-widest">
          <Link to="/privacy" className="hover:text-foreground transition-colors">Privacy</Link>
          <Link to="/terms" className="hover:text-foreground transition-colors">Terms</Link>
          <Link to="/returns" className="hover:text-foreground transition-colors">Refunds</Link>
        </div>
      </div>
    </footer>
  );
}
