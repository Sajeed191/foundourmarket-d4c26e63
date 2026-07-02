import { useEffect, useRef, useState } from "react";
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

const TRUST_PILLS = [
  { emoji: "🚚", label: "Fast Delivery", icon: Truck },
  { emoji: "🔒", label: "Secure Checkout", icon: ShieldCheck },
  { emoji: "↩️", label: "Easy Returns", icon: RotateCcw },
  { emoji: "🌍", label: "Global Sourcing", icon: Globe },
];

const SOCIALS = [
  { icon: Instagram, label: "Instagram", href: "https://www.instagram.com/foundourmarket?igsh=MXgwd3QwcXlleXhueQ==", demo: false },
  { icon: Twitter, label: "Twitter", href: "#", demo: true },
  { icon: Facebook, label: "Facebook", href: "https://www.facebook.com/share/1DHs1PbeUN/", demo: false },
  { icon: Youtube, label: "YouTube", href: "https://youtube.com/@foundourmarket?si=JsljIPlZFQtWIb1t", demo: false },
];

/** Fade-in only on first viewport entry. */
function useInViewOnce<T extends HTMLElement>() {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    const io = new IntersectionObserver(
      (entries) => {
        if (entries[0]?.isIntersecting) {
          setSeen(true);
          io.disconnect();
        }
      },
      { threshold: 0.15 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, [seen]);
  return { ref, seen };
}

/** True while the user is scrolling down (for mobile social dock collapse). */
function useScrollingDown() {
  const [down, setDown] = useState(false);
  useEffect(() => {
    let lastY = window.scrollY;
    let raf = 0;
    let idle: ReturnType<typeof setTimeout>;
    const onScroll = () => {
      if (raf) return;
      raf = requestAnimationFrame(() => {
        raf = 0;
        const y = window.scrollY;
        if (y > lastY + 6) setDown(true);
        else if (y < lastY - 6) setDown(false);
        lastY = y;
        clearTimeout(idle);
        idle = setTimeout(() => setDown(false), 700);
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (raf) cancelAnimationFrame(raf);
      clearTimeout(idle);
    };
  }, []);
  return down;
}

/** Adaptive rotating trust pill layer — 3 visible, active pill glows softly. */
function TrustLayer() {
  const [active, setActive] = useState(0);
  const [locked, setLocked] = useState(false);
  useEffect(() => {
    if (locked) return;
    const id = setInterval(() => setActive((a) => (a + 1) % TRUST_PILLS.length), 3600);
    return () => clearInterval(id);
  }, [locked]);

  return (
    <div
      className="relative max-w-7xl mx-auto mt-5 flex flex-wrap items-center gap-2.5"
      onMouseEnter={() => setLocked(true)}
      onMouseLeave={() => setLocked(false)}
    >
      {TRUST_PILLS.map(({ emoji, label, icon: Icon }, i) => {
        const isActive = i === active;
        return (
          <button
            key={label}
            type="button"
            onClick={() => {
              setActive(i);
              setLocked(true);
            }}
            className="group inline-flex items-center gap-2 rounded-full border px-3.5 py-2 transition-all duration-200"
            style={{
              transitionTimingFunction: EASE,
              opacity: isActive ? 1 : 0.6,
              transform: isActive ? "scale(1)" : "scale(0.97)",
              borderColor: isActive
                ? "color-mix(in oklab, var(--color-accent) 40%, transparent)"
                : "color-mix(in oklab, var(--color-border) 60%, transparent)",
              background: isActive
                ? "color-mix(in oklab, var(--color-accent) 10%, transparent)"
                : "color-mix(in oklab, var(--color-card) 55%, transparent)",
              boxShadow: isActive
                ? "0 0 18px color-mix(in oklab, var(--color-accent) 22%, transparent)"
                : "none",
            }}
          >
            <span aria-hidden className="text-sm leading-none">{emoji}</span>
            <Icon className="size-3.5 text-accent" aria-hidden />
            <span className="text-[11px] sm:text-xs font-medium leading-none text-foreground/90 whitespace-nowrap">
              {label}
            </span>
          </button>
        );
      })}
    </div>
  );
}

/** Accordion footer group — strict single-open on mobile, always open on desktop. */
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
    <div
      className="relative border-b border-border/40 md:border-0 pb-1.5 md:pb-0 md:pl-0 pl-2.5"
    >
      {/* left accent glow bar — mobile, active only */}
      <span
        aria-hidden
        className="absolute left-0 top-1 bottom-1 w-0.5 rounded-full transition-all duration-200 md:hidden"
        style={{
          transitionTimingFunction: EASE,
          opacity: isOpen ? 1 : 0,
          background: "var(--color-accent)",
          boxShadow: isOpen ? "0 0 10px color-mix(in oklab, var(--color-accent) 55%, transparent)" : "none",
        }}
      />
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isOpen}
        className="group flex w-full items-center justify-between py-1 md:py-0 md:pointer-events-none rounded-lg transition-colors duration-200"
        style={{
          transitionTimingFunction: EASE,
          background: isOpen ? "color-mix(in oklab, var(--color-accent) 5%, transparent)" : "transparent",
        }}
      >
        <h5 className="text-[10px] font-mono uppercase tracking-[0.2em] text-accent">
          {group.title}
        </h5>
        <ChevronDown
          className="size-4 text-muted-foreground md:hidden"
          style={{
            transition: "transform 220ms cubic-bezier(0.34,1.56,0.64,1)",
            transform: isOpen ? "rotate(180deg)" : "rotate(0deg)",
          }}
        />
      </button>
      <div
        className={`grid transition-all duration-200 md:!grid-rows-[1fr] md:!opacity-100 ${
          isOpen ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0"
        }`}
        style={{ transitionTimingFunction: EASE }}
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

/** Contextual intelligence bar — copy adapts to the current route/intent. */
function IntelligenceBar({ pathname }: { pathname: string }) {
  let message = "Explore curated collections";
  if (pathname.startsWith("/cart") || pathname.startsWith("/checkout")) {
    message = "Secure checkout guaranteed";
  } else if (pathname.startsWith("/product") || pathname.startsWith("/category") || pathname.startsWith("/shop")) {
    message = "Need help choosing products?";
  }

  return (
    <div className="relative max-w-7xl mx-auto mt-7">
      <div
        className="animate-cta-breathe flex flex-col sm:flex-row items-center justify-between gap-3 rounded-3xl border px-4 py-4 sm:px-6"
        style={{
          borderColor: "color-mix(in oklab, var(--color-accent) 28%, transparent)",
          background:
            "linear-gradient(100deg, color-mix(in oklab, var(--color-accent) 9%, transparent), color-mix(in oklab, var(--color-card) 55%, transparent))",
          boxShadow: "inset 0 0 26px color-mix(in oklab, var(--color-accent) 10%, transparent)",
        }}
      >
        <p className="text-sm font-semibold text-foreground text-center sm:text-left">{message}</p>
        <Link
          to="/contact"
          className="inline-flex items-center justify-center gap-2 w-full sm:w-auto min-h-11 rounded-full px-6 text-sm font-semibold text-accent-foreground transition-transform duration-200 active:scale-[0.98]"
          style={{
            background: "linear-gradient(90deg, var(--color-accent), color-mix(in oklab, var(--color-accent) 60%, gold))",
            transitionTimingFunction: EASE,
          }}
        >
          <Headphones className="size-4" />
          Get Assistance
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </div>
  );
}

/** Floating capsule social dock — collapses to a single orb while scrolling down (mobile). */
function SocialDock() {
  const scrollingDown = useScrollingDown();
  const [forceOpen, setForceOpen] = useState(false);
  const collapsed = scrollingDown && !forceOpen;

  return (
    <div className="flex items-center">
      <button
        type="button"
        aria-label="Toggle social links"
        onClick={() => setForceOpen((o) => !o)}
        className="sm:hidden size-9 grid place-items-center rounded-full bg-card/60 border border-border/50 text-accent transition-all duration-200"
        style={{ transitionTimingFunction: EASE, boxShadow: "0 0 14px color-mix(in oklab, var(--color-accent) 22%, transparent)" }}
      >
        <MessageCircle className="size-4" />
      </button>
      <div
        className="flex items-center gap-2.5 overflow-hidden transition-all duration-200 sm:!max-w-none sm:!opacity-100 sm:!ml-0"
        style={{
          transitionTimingFunction: EASE,
          maxWidth: collapsed ? 0 : 260,
          opacity: collapsed ? 0 : 1,
          marginLeft: collapsed ? 0 : 10,
        }}
      >
        {SOCIALS.map(({ icon: Icon, label, href, demo }) => (
          <a
            key={label}
            href={href}
            {...(demo
              ? { onClick: (e: React.MouseEvent) => e.preventDefault() }
              : { target: "_blank", rel: "noopener noreferrer" })}
            aria-label={demo ? `${label} (demo)` : label}
            className="size-9 grid place-items-center rounded-full bg-card/60 border border-border/50 text-muted-foreground transition-all duration-200 hover:text-accent hover:border-accent/40 hover:scale-[1.08] active:scale-95"
            style={{ transitionTimingFunction: EASE }}
          >
            <Icon className="size-4" />
          </a>
        ))}
      </div>
    </div>
  );
}

export function Footer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");
  const [openSection, setOpenSection] = useState<string | null>(null);
  const { ref: brandRef, seen } = useInViewOnce<HTMLDivElement>();

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
    <footer className="relative px-4 sm:px-6 pt-6 mobile-page-clearance md:py-8 border-t border-border overflow-hidden" style={{ background: "#0B0B0F" }}>
      {/* Ambient divider glow — opacity-based, no backdrop-filter */}
      <div aria-hidden className="pointer-events-none absolute -top-px left-1/2 -translate-x-1/2 w-[70%] h-px" style={{ background: "linear-gradient(90deg, transparent, var(--color-accent), transparent)", opacity: 0.6 }} />
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 w-[80%] h-40 opacity-40" style={{ background: "var(--gradient-ember-soft)" }} />

      {/* ── 1. Brand core strip ── */}
      <div
        ref={brandRef}
        className="relative max-w-7xl mx-auto"
        style={{
          opacity: seen ? 1 : 0,
          transform: seen ? "translateY(0)" : "translateY(10px)",
          transition: "opacity 500ms cubic-bezier(0.2,0.8,0.2,1), transform 500ms cubic-bezier(0.2,0.8,0.2,1)",
        }}
      >
        <Link
          to="/"
          aria-label="FoundOurMarket home"
          className="inline-block text-xl sm:text-2xl font-display font-semibold hover:opacity-90 transition-opacity"
          style={{ letterSpacing: seen ? "-0.01em" : "-0.03em", transition: "letter-spacing 700ms cubic-bezier(0.2,0.8,0.2,1)" }}
        >
          FoundOurMarket<span className="text-accent">™</span>
        </Link>
        <p className="mt-2 text-xs sm:text-sm text-muted-foreground tracking-wide">
          Curated global products, delivered with precision.
        </p>
        {/* ultra-soft gradient underline */}
        <div
          aria-hidden
          className="mt-4 h-px transition-all duration-500"
          style={{
            width: seen ? "100%" : "0%",
            transitionTimingFunction: EASE,
            background: "linear-gradient(90deg, color-mix(in oklab, var(--color-accent) 45%, transparent), transparent)",
          }}
        />
      </div>

      {/* ── 2. Adaptive trust layer ── */}
      <TrustLayer />

      {/* ── 3. Contact / social  +  accordion navigation ── */}
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
          <SocialDock />
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

      {/* ── 4. Contextual footer intelligence bar ── */}
      <IntelligenceBar pathname={pathname} />

      {/* ── 5. Copyright bar ── */}
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
