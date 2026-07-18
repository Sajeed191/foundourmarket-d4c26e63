import { useState, useEffect, type ReactElement } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Instagram, Facebook, Youtube, Send, MessageCircle,
  ShoppingBag, Package, Tag, MessageSquare, HelpCircle,
  Lock, Truck, CreditCard, ShieldCheck, Globe2, ChevronDown,
  ArrowUp,
} from "lucide-react";
import { BrandName } from "@/components/site/BrandName";
import { NewsletterForm } from "@/components/site/NewsletterForm";

/* ---------- Data ---------- */

const TRUST_CHIPS = [
  { icon: Lock,        label: "Secure Payments" },
  { icon: Truck,       label: "Fast Shipping" },
  { icon: ShieldCheck, label: "Buyer Protection" },
];

const QUICK_ACTIONS = [
  { icon: ShoppingBag,   label: "Shop All",    to: "/" },
  { icon: Tag,           label: "Deals",       to: "/deals" },
  { icon: Package,       label: "Track Order", to: "/track" },
  { icon: MessageSquare, label: "Contact Us",  to: "/contact" },
  { icon: HelpCircle,    label: "Help Center", to: "/help" },
];

const SUPPORT_LINKS = [
  { label: "Help Center",      to: "/help" },
  { label: "Returns",          to: "/returns" },
  { label: "Shipping",         to: "/pages/shipping" },
  { label: "Refund Policy",    to: "/returns" },
  { label: "Buyer Protection", to: "/buyer-protection" },
  { label: "Contact Support",  to: "/contact" },
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
  { icon: Instagram,     label: "Instagram", href: "https://www.instagram.com/foundourmarket" },
  { icon: Facebook,      label: "Facebook",  href: "https://www.facebook.com/share/1DHs1PbeUN/" },
  { icon: null,          label: "X",         href: "#", isX: true },
  { icon: Youtube,       label: "YouTube",   href: "https://youtube.com/@foundourmarket" },
  { icon: MessageCircle, label: "WhatsApp",  href: "#" },
  { icon: Send,          label: "Telegram",  href: "#" },
];

const TRUST_FEATURES = [
  { icon: Lock,        title: "Secure Checkout",  desc: "Encrypted payments end to end." },
  { icon: Truck,       title: "Fast Delivery",    desc: "Across India, delivered quickly." },
  { icon: CreditCard,  title: "Safe Payments",    desc: "Trusted partners, zero worries." },
  { icon: ShieldCheck, title: "Buyer Protection", desc: "Easy returns on every order." },
];

/* ---------- Monochrome payment logos (inline SVG) ---------- */

type LogoProps = { className?: string };

const UPILogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <text x="30" y="17" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="13" letterSpacing="0.5" fill="currentColor">UPI</text>
  </svg>
);
const VisaLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <text x="30" y="17" textAnchor="middle" fontFamily="Georgia, serif" fontStyle="italic" fontWeight="900" fontSize="14" letterSpacing="1" fill="currentColor">VISA</text>
  </svg>
);
const MastercardLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <circle cx="24" cy="12" r="7" fill="currentColor" opacity="0.85" />
    <circle cx="36" cy="12" r="7" fill="currentColor" opacity="0.45" />
  </svg>
);
const RupayLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <text x="30" y="17" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="11" letterSpacing="0.3" fill="currentColor">RuPay</text>
  </svg>
);
const PaytmLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <text x="30" y="17" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="11" letterSpacing="0.2" fill="currentColor">Paytm</text>
  </svg>
);
const GPayLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <text x="30" y="17" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="700" fontSize="11" letterSpacing="0.2" fill="currentColor">G Pay</text>
  </svg>
);
const PhonePeLogo = ({ className }: LogoProps) => (
  <svg viewBox="0 0 60 24" className={className} aria-hidden>
    <text x="30" y="17" textAnchor="middle" fontFamily="system-ui, -apple-system, sans-serif" fontWeight="800" fontSize="10" letterSpacing="0.2" fill="currentColor">PhonePe</text>
  </svg>
);

const PAYMENTS: { label: string; Logo: (p: LogoProps) => ReactElement }[] = [
  { label: "UPI",        Logo: UPILogo },
  { label: "Visa",       Logo: VisaLogo },
  { label: "Mastercard", Logo: MastercardLogo },
  { label: "RuPay",      Logo: RupayLogo },
  { label: "Paytm",      Logo: PaytmLogo },
  { label: "Google Pay", Logo: GPayLogo },
  { label: "PhonePe",    Logo: PhonePeLogo },
];

/* ---------- Primitives ---------- */

const EASE = "duration-[180ms] ease-out";

function TextLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to as never}
      className={`block py-2 text-[14px] font-medium text-white/60 transition-all ${EASE} hover:text-accent hover:translate-x-0.5`}
    >
      {label}
    </Link>
  );
}

function LinkColumn({
  title,
  links,
  isOpen,
  onToggle,
}: {
  title: string;
  links: { label: string; to: string }[];
  isOpen: boolean;
  onToggle: () => void;
}) {
  return (
    <div className="border-b border-white/[0.05] md:border-0">
      <button
        type="button"
        onClick={onToggle}
        className={`flex w-full items-center justify-between py-3 md:hidden transition-colors ${EASE} active:text-accent`}
        aria-expanded={isOpen}
      >
        <span className="text-[15px] font-semibold tracking-tight text-white/95">{title}</span>
        <ChevronDown
          className={`size-4 text-white/50 transition-transform ${EASE} ${isOpen ? "rotate-180 text-accent" : ""}`}
        />
      </button>

      <div className="hidden md:block">
        <h5 className="text-[15px] font-semibold tracking-tight text-white/95">{title}</h5>
      </div>

      <div
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-200 ease-out md:mt-3 md:block ${
          isOpen ? "grid-rows-[1fr] opacity-100 pb-2" : "grid-rows-[0fr] opacity-0 md:grid-rows-[1fr] md:opacity-100 md:pb-0"
        }`}
      >
        <ul className="min-h-0 list-none">
          {links.map((l) => (
            <li key={l.label}>
              <TextLink to={l.to} label={l.label} />
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function BackToTop() {
  const scroll = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="mx-auto max-w-6xl px-6 sm:px-8">
      <div className="flex items-center gap-4 py-5">
        <span aria-hidden className="h-px flex-1 bg-white/[0.06]" />
        <button
          type="button"
          onClick={scroll}
          aria-label="Back to top"
          className={`group inline-flex items-center gap-1.5 rounded-full px-4 py-1.5 text-[12.5px] font-medium text-white/75 transition-all ${EASE} hover:text-white active:scale-[0.98]`}
        >
          <ArrowUp className={`size-3.5 text-accent transition-transform ${EASE} group-hover:-translate-y-0.5`} strokeWidth={2.5} />
          Back to Top
        </button>
        <span aria-hidden className="h-px flex-1 bg-white/[0.06]" />
      </div>
    </div>
  );
}

/* Subtle divider between major footer sections */
function Divider() {
  return <div aria-hidden className="my-8 h-px bg-white/[0.04]" />;
}

/* ---------- Footer ---------- */

export function Footer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");
  const [hasAndroidApp, setHasAndroidApp] = useState(false);
  const [openAccordion, setOpenAccordion] = useState<string | null>(null);

  useEffect(() => {
    const url = (import.meta.env.VITE_ANDROID_APP_URL as string | undefined)?.trim();
    if (url) setHasAndroidApp(true);
  }, []);

  const toggleAccordion = (key: string) =>
    setOpenAccordion((prev) => (prev === key ? null : key));

  if (compact) {
    return (
      <footer className="relative px-4 sm:px-6 py-4 mobile-page-clearance lg:pb-4 border-t border-white/[0.05] bg-background">
        <div className="relative max-w-7xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-center">
          <p className="text-[11px] text-white/50 tracking-wide">© 2026 <BrandName /></p>
          <nav className="flex flex-wrap justify-center gap-x-5 gap-y-1.5 text-[11px] text-white/50">
            <Link to="/privacy" className={`hover:text-white transition-colors ${EASE}`}>Privacy</Link>
            <Link to="/terms" className={`hover:text-white transition-colors ${EASE}`}>Terms</Link>
            <Link to="/returns" className={`hover:text-white transition-colors ${EASE}`}>Refunds</Link>
            <Link to="/contact" className={`hover:text-white transition-colors ${EASE}`}>Contact</Link>
          </nav>
        </div>
      </footer>
    );
  }

  return (
    <>
      <BackToTop />
      <footer className="relative bg-[#0b0b0f] text-white mobile-page-clearance">
        <div className="mx-auto max-w-6xl px-6 pt-8 pb-6 sm:px-8 md:pt-10">
          {/* ── 1 · Brand ─────────────────────────────────────── */}
          <section className="flex flex-col items-start gap-1.5">
            <Link
              to="/"
              aria-label="FoundOurMarket home"
              className="text-[28px] font-display font-bold tracking-tight leading-none text-white"
            >
              <BrandName />
            </Link>
            <p className="text-[13.5px] text-white/75 leading-snug">
              Global Marketplace for Trusted Shopping
            </p>

            {/* Trust chips — 36px, softer border, orange glow on hover/tap */}
            <div className="mt-4 grid w-full grid-cols-3 gap-2">
              {TRUST_CHIPS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className={`inline-flex h-9 items-center justify-center gap-1.5 rounded-full bg-white/[0.035] px-4 text-[11px] font-medium text-white/85 ring-1 ring-white/[0.06] whitespace-nowrap transition-all ${EASE} hover:ring-accent/40 hover:shadow-[0_0_16px_-4px] hover:shadow-accent/60 active:ring-accent/50 active:shadow-[0_0_18px_-4px] active:shadow-accent/70`}
                >
                  <Icon className="size-4 text-accent shrink-0" strokeWidth={2} />
                  <span className="leading-none">{label}</span>
                </span>
              ))}
            </div>
          </section>

          <Divider />

          {/* ── 2 · Quick help header ─────────────────────────── */}
          <section>
            <p className="text-[13px] text-white/60">
              Need help finding something? Choose one of the options below.
            </p>
          </section>

          {/* ── 3 · Quick Actions ────────────────────────────── */}
          <section className="mt-3">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {QUICK_ACTIONS.map(({ icon: Icon, label, to }) => (
                <Link
                  key={label}
                  to={to as never}
                  className={`group flex h-12 w-full items-center gap-2.5 rounded-2xl bg-white/[0.03] px-3 ring-1 ring-white/[0.06] shadow-[0_2px_8px_-4px_rgba(0,0,0,0.4)] transition-all ${EASE} hover:bg-white/[0.05] hover:ring-accent/30 active:-translate-y-0.5 active:bg-white/[0.07] active:ring-accent/50 active:shadow-[0_10px_22px_-8px] active:shadow-accent/60`}
                  style={{ borderRadius: 16 }}
                >
                  <span className="grid size-7 shrink-0 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/20">
                    <Icon className="size-3.5" strokeWidth={2} />
                  </span>
                  <span className="text-[13px] font-medium text-white/90 group-hover:text-white truncate leading-none">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          <Divider />

          {/* ── 4 · Link columns — single-open accordion ─────── */}
          <section className="md:grid md:grid-cols-3 md:gap-10">
            <LinkColumn
              title="Need Help"
              links={SUPPORT_LINKS}
              isOpen={openAccordion === "help"}
              onToggle={() => toggleAccordion("help")}
            />
            <LinkColumn
              title="Company"
              links={COMPANY_LINKS}
              isOpen={openAccordion === "company"}
              onToggle={() => toggleAccordion("company")}
            />
            <LinkColumn
              title="Legal"
              links={LEGAL_LINKS}
              isOpen={openAccordion === "legal"}
              onToggle={() => toggleAccordion("legal")}
            />
          </section>

          <Divider />

          {/* ── 5 · Newsletter ───────────────────────────────── */}
          <section className="rounded-2xl bg-white/[0.03] p-4 ring-1 ring-white/[0.06] shadow-[0_2px_10px_-6px_rgba(0,0,0,0.5)]">
            <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
              <div>
                <h5 className="text-[15px] font-semibold tracking-tight text-white/95 leading-tight">Stay Updated</h5>
                <p className="mt-0.5 text-[12px] text-white/55">Exclusive deals & new arrivals.</p>
              </div>
              <div className="w-full max-w-md">
                <NewsletterForm source="footer" />
                <p className="mt-1.5 pl-1 text-[11px] text-white/40">No spam. Unsubscribe anytime.</p>
              </div>
            </div>
          </section>

          <Divider />

          {/* ── 6 · Socials ──────────────────────────────────── */}
          <section className="flex flex-col items-center gap-3 content-visibility-auto">
            <p className="text-[10.5px] font-medium uppercase tracking-[0.22em] text-white/45">Follow us</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {SOCIALS.map(({ icon: Icon, label, href, isX }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className={`grid size-11 place-items-center rounded-full bg-white/[0.04] text-white/95 ring-1 ring-white/[0.08] transition-all ${EASE} hover:text-accent hover:ring-accent/50 hover:shadow-[0_0_24px_-4px] hover:shadow-accent/70 active:scale-[1.08]`}
                >
                  {isX ? (
                    <svg viewBox="0 0 24 24" className="size-5 fill-current" aria-hidden>
                      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.86l-4.77-6.24L4.8 22H2l7.02-8.02L2 2h6.94l4.31 5.7L18.24 2Zm-1.2 18h1.9L7.06 4H5.06l11.98 16Z" />
                    </svg>
                  ) : (
                    Icon ? <Icon className="size-5" strokeWidth={1.9} /> : null
                  )}
                </a>
              ))}
            </div>
          </section>

          <Divider />

          {/* ── 7 · Trust features 2×2 — 2 line clamp ────────── */}
          <section className="grid grid-cols-2 gap-2 auto-rows-fr">
            {TRUST_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className={`flex h-full items-start gap-3 rounded-2xl bg-white/[0.045] px-3 py-3 ring-1 ring-white/[0.05] transition-all ${EASE} hover:ring-accent/30 hover:shadow-[0_0_18px_-8px] hover:shadow-accent/50`}
                style={{ borderRadius: 16 }}
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/12 text-accent ring-1 ring-accent/20 mt-0.5">
                  <Icon className="size-[15px]" strokeWidth={2} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[12.5px] font-semibold text-white/95 leading-tight">{title}</p>
                  <p
                    className="mt-1 text-[11px] text-white/65 leading-snug overflow-hidden"
                    style={{
                      display: "-webkit-box",
                      WebkitLineClamp: 2,
                      WebkitBoxOrient: "vertical",
                    }}
                  >
                    {desc}
                  </p>
                </div>
              </div>
            ))}
          </section>

          <Divider />

          {/* ── 8 · Payment methods ──────────────────────────── */}
          <section>
            <p className="mb-3 text-center text-[10.5px] font-medium uppercase tracking-[0.22em] text-white/45">
              We accept
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {PAYMENTS.map(({ label, Logo }) => (
                <span
                  key={label}
                  aria-label={label}
                  className={`inline-flex h-8 w-[54px] items-center justify-center rounded-md bg-white/[0.05] px-1.5 text-white/85 ring-1 ring-white/[0.06] transition-all ${EASE} hover:text-accent hover:ring-accent/40 hover:shadow-[0_0_14px_-4px] hover:shadow-accent/60`}
                >
                  <Logo className="h-4 w-full" />
                </span>
              ))}
            </div>
          </section>

          <Divider />

          {/* ── 9 · Country & Language ───────────────────────── */}
          <section className="flex justify-center">
            <button
              type="button"
              className={`group inline-flex h-9 items-center justify-center gap-2 rounded-full bg-white/[0.035] px-5 text-[12.5px] text-white/85 ring-1 ring-white/[0.08] transition-all ${EASE} hover:text-white hover:ring-accent/40 hover:shadow-[0_0_18px_-6px] hover:shadow-accent/60 active:scale-[0.98]`}
            >
              <Globe2 className="size-3.5 text-accent" strokeWidth={2} />
              <span className="font-medium">India</span>
              <span className="text-white/25">·</span>
              <span>English</span>
              <ChevronDown className={`size-3 text-white/40 transition-transform ${EASE} group-hover:rotate-180`} />
            </button>
          </section>

          {/* ── 10 · Android app (conditional) ───────────────── */}
          {hasAndroidApp && (
            <section className="mt-5 flex justify-center">
              <a
                href={(import.meta.env.VITE_ANDROID_APP_URL as string) || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className={`inline-flex items-center gap-2.5 rounded-2xl bg-white/[0.04] px-4 py-2 ring-1 ring-white/[0.08] transition-all ${EASE} hover:ring-accent/30`}
                style={{ borderRadius: 16 }}
              >
                <svg viewBox="0 0 24 24" className="size-5 fill-accent" aria-hidden>
                  <path d="M3 20.5V3.5c0-.4.1-.7.3-.9l10.6 9.4L3.3 21.4c-.2-.2-.3-.5-.3-.9zm12.5-8.5 3.6-2c.7-.4.7-1.4 0-1.8l-3.2-1.8L12.8 9l2.7 3zm-1 1.5-11.2 9.9c.2.1.5.1.7 0l12.4-6.9-1.9-3zM4 2.6l11 9.9 2-2.2L4.7 2.5c-.2-.1-.5-.1-.7.1z"/>
                </svg>
                <div className="text-left">
                  <p className="text-[10px] uppercase tracking-wider text-white/50 leading-tight">Get it on</p>
                  <p className="text-[13px] font-semibold text-white leading-tight">Google Play</p>
                </div>
              </a>
            </section>
          )}

          {/* ── 11 · Copyright ───────────────────────────────── */}
          <section className="mt-4 flex flex-col items-center gap-1 border-t border-white/[0.05] pt-4 pb-2 text-center">
            <p className="text-[12.5px] text-white/40">
              © 2026 <span className="font-semibold text-white/95"><BrandName /></span>
            </p>
            <p className="text-[11px] text-white/40">Connecting Buyers &amp; Sellers Worldwide.</p>
            <nav className="mt-1 flex gap-3 text-[11px] text-white/40">
              <Link to="/privacy" className={`transition-colors ${EASE} hover:text-white`}>Privacy</Link>
              <span className="text-white/20">•</span>
              <Link to="/terms" className={`transition-colors ${EASE} hover:text-white`}>Terms</Link>
              <span className="text-white/20">•</span>
              <Link to="/privacy" className={`transition-colors ${EASE} hover:text-white`}>Cookies</Link>
            </nav>
          </section>
        </div>
      </footer>
    </>
  );
}
