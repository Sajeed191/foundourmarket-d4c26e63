import { useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Instagram, Facebook, Youtube, Send, MessageCircle,
  ShoppingBag, Package, Tag, MessageSquare, HelpCircle,
  Lock, Truck, CreditCard, ShieldCheck, Globe2, ChevronDown,
  Mail, ArrowRight,
} from "lucide-react";
import { BrandName } from "@/components/site/BrandName";

/* ---------- Data ---------- */

const TRUST_CHIPS = [
  { icon: Lock, label: "Secure Payments" },
  { icon: Truck, label: "Fast Shipping" },
  { icon: ShieldCheck, label: "Buyer Protection" },
];

const QUICK_ACTIONS = [
  { icon: ShoppingBag, label: "Shop All",     to: "/" },
  { icon: Package,     label: "Track Order",  to: "/track" },
  { icon: Tag,         label: "Deals",        to: "/deals" },
  { icon: MessageSquare, label: "Contact Us", to: "/contact" },
  { icon: HelpCircle,  label: "Help Center",  to: "/help" },
];

const SUPPORT_LINKS = [
  { label: "Help Center",       to: "/help" },
  { label: "Returns",           to: "/returns" },
  { label: "Shipping",          to: "/pages/shipping" },
  { label: "Refund Policy",     to: "/returns" },
  { label: "Buyer Protection",  to: "/buyer-protection" },
  { label: "Contact Support",   to: "/contact" },
];

const COMPANY_LINKS = [
  { label: "About Us",          to: "/about" },
  { label: "Careers",           to: "/about" },
  { label: "Blog",              to: "/blog" },
  { label: "Become a Seller",   to: "/vendor" },
  { label: "Affiliate Program", to: "/about" },
];

const LEGAL_LINKS = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms",          to: "/terms" },
  { label: "Cookies",        to: "/privacy" },
  { label: "Disclaimer",     to: "/terms" },
];

const SOCIALS = [
  { icon: Instagram,    label: "Instagram", href: "https://www.instagram.com/foundourmarket" },
  { icon: Facebook,     label: "Facebook",  href: "https://www.facebook.com/share/1DHs1PbeUN/" },
  // lucide has no clean X mark; reuse Send-like glyph via inline SVG below
  { icon: null,         label: "X",         href: "#", isX: true },
  { icon: Youtube,      label: "YouTube",   href: "https://youtube.com/@foundourmarket" },
  { icon: MessageCircle,label: "WhatsApp",  href: "#" },
  { icon: Send,         label: "Telegram",  href: "#" },
];

const TRUST_BADGES = [
  { icon: Lock,        label: "Secure Checkout" },
  { icon: Truck,       label: "Fast Delivery" },
  { icon: CreditCard,  label: "Safe Payments" },
  { icon: ShieldCheck, label: "Buyer Protection" },
];

/* ---------- Small primitives ---------- */

function TextLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to as never}
      className="text-[15px] text-white/60 transition-colors duration-[180ms] hover:text-white"
    >
      {label}
    </Link>
  );
}

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h5 className="text-[18px] font-semibold tracking-tight text-white">
      {children}
    </h5>
  );
}

/* ---------- Collapsible (mobile accordion) ---------- */

function LinkColumn({
  title,
  links,
  defaultOpen = false,
}: {
  title: string;
  links: { label: string; to: string }[];
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-white/[0.06] md:border-0">
      {/* Mobile: accordion trigger */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-4 md:hidden"
        aria-expanded={open}
      >
        <SectionHeading>{title}</SectionHeading>
        <ChevronDown
          className={`size-4 text-white/50 transition-transform duration-[180ms] ${open ? "rotate-180" : ""}`}
        />
      </button>

      {/* Desktop: static heading */}
      <div className="hidden md:block">
        <SectionHeading>{title}</SectionHeading>
      </div>

      <ul
        className={`space-y-3 overflow-hidden transition-all duration-[180ms] md:mt-5 md:block md:max-h-none md:pb-0 ${
          open ? "max-h-96 pb-5" : "max-h-0 md:max-h-none"
        }`}
      >
        {links.map((l) => (
          <li key={l.label}>
            <TextLink to={l.to} label={l.label} />
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ---------- Footer ---------- */

export function Footer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");

  if (compact) {
    return (
      <footer className="relative px-4 sm:px-6 py-4 mobile-page-clearance lg:pb-4 border-t border-white/[0.05] bg-background">
        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-[11px] text-white/50 tracking-wide">© 2026 <BrandName /></p>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[11px] text-white/50">
            <Link to="/privacy" className="hover:text-white transition-colors">Privacy</Link>
            <Link to="/terms" className="hover:text-white transition-colors">Terms</Link>
            <Link to="/returns" className="hover:text-white transition-colors">Refunds</Link>
            <Link to="/contact" className="hover:text-white transition-colors">Contact</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <footer className="relative bg-[#0b0b0f] text-white mobile-page-clearance">
      {/* subtle top edge */}
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

      <div className="mx-auto max-w-6xl px-6 pt-14 pb-10 sm:px-8 md:pt-20">
        {/* ── 1 · Brand ─────────────────────────────────────── */}
        <section className="flex flex-col items-start gap-5">
          <Link to="/" aria-label="FoundOurMarket home" className="text-xl font-display font-medium tracking-tight">
            <BrandName />
          </Link>
          <p className="text-[13px] text-white/55">
            Global Marketplace for Trusted Shopping
          </p>
          <div className="flex flex-wrap gap-2">
            {TRUST_CHIPS.map(({ icon: Icon, label }) => (
              <span
                key={label}
                className="inline-flex items-center gap-1.5 rounded-full bg-white/[0.04] px-3 py-1.5 text-[12px] text-white/80 ring-1 ring-white/[0.06]"
              >
                <Icon className="size-3.5 text-accent" strokeWidth={2} />
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* ── 2 · Quick Actions ────────────────────────────── */}
        <section className="mt-14">
          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3 md:grid-cols-5">
            {QUICK_ACTIONS.map(({ icon: Icon, label, to }) => (
              <Link
                key={label}
                to={to as never}
                className="group flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-white/[0.06] transition-all duration-[180ms] hover:bg-white/[0.06] hover:ring-accent/30"
              >
                <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <span className="text-[14px] font-medium text-white/90 group-hover:text-white">
                  {label}
                </span>
              </Link>
            ))}
          </div>
        </section>

        {/* ── 3-5 · Link columns ───────────────────────────── */}
        <section className="mt-12 md:mt-16 md:grid md:grid-cols-3 md:gap-10">
          <LinkColumn title="Need Help?" links={SUPPORT_LINKS} />
          <LinkColumn title="Company"    links={COMPANY_LINKS} />
          <LinkColumn title="Legal"      links={LEGAL_LINKS} />
        </section>

        {/* ── 6 · Newsletter ───────────────────────────────── */}
        <section className="mt-14 rounded-2xl bg-white/[0.03] p-6 ring-1 ring-white/[0.06] sm:p-8">
          <div className="flex flex-col gap-5 md:flex-row md:items-center md:justify-between">
            <div>
              <h5 className="text-[18px] font-semibold tracking-tight text-white">Stay Updated</h5>
              <p className="mt-1.5 text-[13px] text-white/55">
                Get exclusive deals, flash sales and new arrivals.
              </p>
            </div>
            <form
              onSubmit={(e) => e.preventDefault()}
              className="flex w-full max-w-md items-center gap-2 rounded-full bg-black/40 p-1.5 ring-1 ring-white/[0.08] focus-within:ring-accent/40"
            >
              <Mail className="ml-3 size-4 shrink-0 text-white/40" />
              <input
                type="email"
                required
                placeholder="Enter your email"
                className="min-w-0 flex-1 bg-transparent px-1 py-2 text-[14px] text-white placeholder:text-white/35 focus:outline-none"
              />
              <button
                type="submit"
                className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-accent px-4 py-2 text-[13px] font-semibold text-accent-foreground transition-all duration-[180ms] hover:brightness-110"
              >
                Subscribe
                <ArrowRight className="size-3.5" />
              </button>
            </form>
          </div>
        </section>

        {/* ── 7 · Socials ──────────────────────────────────── */}
        <section className="mt-14 flex flex-col items-center gap-4">
          <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">Follow us</p>
          <div className="flex flex-wrap justify-center gap-3">
            {SOCIALS.map(({ icon: Icon, label, href, isX }) => (
              <a
                key={label}
                href={href}
                target="_blank"
                rel="noopener noreferrer"
                aria-label={label}
                className="group grid size-11 place-items-center rounded-full bg-white/[0.04] text-white/70 ring-1 ring-white/[0.08] transition-all duration-[180ms] hover:text-accent hover:ring-accent/40 hover:shadow-[0_0_24px_-6px_var(--tw-shadow-color)] hover:shadow-accent/50"
              >
                {isX ? (
                  <svg viewBox="0 0 24 24" className="size-[17px] fill-current" aria-hidden>
                    <path d="M18.244 2H21l-6.52 7.45L22 22h-6.86l-4.77-6.24L4.8 22H2l7.02-8.02L2 2h6.94l4.31 5.7L18.24 2Zm-1.2 18h1.9L7.06 4H5.06l11.98 16Z" />
                  </svg>
                ) : (
                  Icon ? <Icon className="size-[18px]" strokeWidth={1.75} /> : null
                )}
              </a>
            ))}
          </div>
        </section>

        {/* ── 8 · Trust badges row ─────────────────────────── */}
        <section className="mt-14 grid grid-cols-2 gap-2.5 sm:grid-cols-4">
          {TRUST_BADGES.map(({ icon: Icon, label }) => (
            <div
              key={label}
              className="flex items-center gap-3 rounded-2xl bg-white/[0.03] px-4 py-3.5 ring-1 ring-white/[0.06]"
            >
              <span className="grid size-9 shrink-0 place-items-center rounded-xl bg-accent/10 text-accent ring-1 ring-accent/20">
                <Icon className="size-4" strokeWidth={2} />
              </span>
              <span className="text-[13px] font-medium text-white/85">{label}</span>
            </div>
          ))}
        </section>

        {/* ── 9 · Country & Language ───────────────────────── */}
        <section className="mt-12 flex justify-center">
          <button
            type="button"
            className="inline-flex items-center gap-2 rounded-full bg-white/[0.04] px-4 py-2 text-[12px] text-white/75 ring-1 ring-white/[0.08] transition-colors duration-[180ms] hover:text-white hover:ring-white/20"
          >
            <Globe2 className="size-3.5 text-accent" />
            <span>India</span>
            <span className="text-white/25">·</span>
            <span>English</span>
            <ChevronDown className="size-3 text-white/40" />
          </button>
        </section>

        {/* ── 10 · Copyright ───────────────────────────────── */}
        <section className="mt-10 flex flex-col items-center gap-3 border-t border-white/[0.05] pt-8 text-center">
          <p className="text-[12px] text-white/55">
            © 2026 <BrandName /> · Made with <span className="text-accent">♥</span> for Global Shopping
          </p>
          <nav className="flex gap-5 text-[12px] text-white/45">
            <Link to="/privacy" className="transition-colors duration-[180ms] hover:text-white">Privacy</Link>
            <Link to="/terms" className="transition-colors duration-[180ms] hover:text-white">Terms</Link>
            <Link to="/privacy" className="transition-colors duration-[180ms] hover:text-white">Cookies</Link>
          </nav>
        </section>
      </div>
    </footer>
  );
}
