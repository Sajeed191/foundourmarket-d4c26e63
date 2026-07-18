import { useState, useEffect } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Instagram, Facebook, Youtube, Send, MessageCircle,
  ShoppingBag, Package, Tag, MessageSquare, HelpCircle,
  Lock, Truck, CreditCard, ShieldCheck, Globe2, ChevronDown,
  Search, ArrowUp,
} from "lucide-react";
import { BrandName } from "@/components/site/BrandName";

/* ---------- Data ---------- */

const TRUST_CHIPS = [
  { icon: Lock,        label: "Secure Payments" },
  { icon: Truck,       label: "Fast Shipping" },
  { icon: ShieldCheck, label: "Buyer Protection" },
];

const QUICK_ACTIONS = [
  { icon: ShoppingBag,   label: "Shop All",    to: "/" },
  { icon: Package,       label: "Track Order", to: "/track" },
  { icon: Tag,           label: "Deals",       to: "/deals" },
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
  { icon: Lock,        title: "Secure Checkout",    desc: "Your payments are encrypted." },
  { icon: Truck,       title: "Fast Delivery",      desc: "Fast shipping across India." },
  { icon: CreditCard,  title: "Safe Payments",      desc: "Trusted payment partners." },
  { icon: ShieldCheck, title: "Buyer Protection",   desc: "Easy returns & protection." },
];

const PAYMENT_METHODS = ["UPI", "Visa", "Mastercard", "RuPay", "Paytm", "GPay", "PhonePe"];

/* ---------- Primitives ---------- */

function TextLink({ to, label }: { to: string; label: string }) {
  return (
    <Link
      to={to as never}
      className="text-[14px] text-white/60 transition-colors duration-[180ms] hover:text-accent"
    >
      {label}
    </Link>
  );
}

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between py-3.5 md:hidden"
        aria-expanded={open}
      >
        <span className="text-[15px] font-semibold tracking-tight text-white">{title}</span>
        <ChevronDown
          className={`size-4 text-white/50 transition-transform duration-[200ms] ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="hidden md:block">
        <h5 className="text-[16px] font-semibold tracking-tight text-white">{title}</h5>
      </div>

      <ul
        className={`grid overflow-hidden transition-[grid-template-rows,opacity] duration-[220ms] ease-out md:mt-4 md:block ${
          open ? "grid-rows-[1fr] opacity-100 pb-4" : "grid-rows-[0fr] opacity-0 md:grid-rows-[1fr] md:opacity-100 md:pb-0"
        }`}
      >
        <div className="min-h-0 space-y-2.5">
          {links.map((l) => (
            <li key={l.label} className="list-none">
              <TextLink to={l.to} label={l.label} />
            </li>
          ))}
        </div>
      </ul>
    </div>
  );
}

function BackToTop() {
  const scroll = () => {
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  };
  return (
    <div className="flex justify-center -mb-5 relative z-10">
      <button
        type="button"
        onClick={scroll}
        aria-label="Back to top"
        className="group inline-flex items-center gap-2 rounded-full bg-[#0b0b0f] px-5 py-2.5 ring-1 ring-white/10 shadow-[0_8px_24px_-8px_rgba(0,0,0,0.6)] transition-all duration-[180ms] hover:ring-accent/50 active:scale-[0.98]"
      >
        <ArrowUp className="size-4 text-accent transition-transform duration-[180ms] group-hover:-translate-y-0.5" strokeWidth={2.25} />
        <span className="text-[12px] font-medium text-white/80 group-hover:text-white">Back to top</span>
      </button>
    </div>
  );
}

/* ---------- Footer ---------- */

export function Footer() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const compact = pathname.startsWith("/checkout");
  const [hasAndroidApp, setHasAndroidApp] = useState(false);

  useEffect(() => {
    // Only render Play Store button when an app URL is configured.
    const url = (import.meta.env.VITE_ANDROID_APP_URL as string | undefined)?.trim();
    if (url) setHasAndroidApp(true);
  }, []);

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
    <>
      <BackToTop />
      <footer className="relative bg-[#0b0b0f] text-white mobile-page-clearance">
        <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-white/[0.08] to-transparent" />

        <div className="mx-auto max-w-6xl px-6 pt-10 pb-8 sm:px-8 md:pt-14">
          {/* ── 1 · Brand ─────────────────────────────────────── */}
          <section className="flex flex-col items-start gap-3">
            <Link to="/" aria-label="FoundOurMarket home" className="text-2xl font-display font-medium tracking-tight">
              <BrandName />
            </Link>
            <p className="text-[13.5px] text-white/75">
              Global Marketplace for Trusted Shopping
            </p>
            <div className="mt-1 grid w-full grid-cols-3 gap-2">
              {TRUST_CHIPS.map(({ icon: Icon, label }) => (
                <span
                  key={label}
                  className="inline-flex h-8 items-center justify-center gap-1.5 rounded-full bg-white/[0.04] px-2 text-[11px] font-medium text-white/85 ring-1 ring-white/[0.06]"
                >
                  <Icon className="size-3.5 text-accent shrink-0" strokeWidth={2} />
                  <span className="truncate">{label}</span>
                </span>
              ))}
            </div>
          </section>

          {/* ── 2 · Footer Search ────────────────────────────── */}
          <section className="mt-9">
            <label className="mb-2 block text-[12px] font-medium text-white/60">
              What are you looking for?
            </label>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const q = new FormData(e.currentTarget).get("q")?.toString().trim();
                if (q) window.location.href = `/help?q=${encodeURIComponent(q)}`;
              }}
              className="flex h-11 items-center gap-2 rounded-full bg-black/40 px-4 ring-1 ring-white/[0.08] focus-within:ring-accent/40"
            >
              <Search className="size-4 shrink-0 text-white/40" />
              <input
                name="q"
                type="search"
                placeholder="Search help articles..."
                className="min-w-0 flex-1 bg-transparent text-[14px] text-white placeholder:text-white/35 focus:outline-none"
              />
            </form>
          </section>

          {/* ── 3 · Quick Actions ────────────────────────────── */}
          <section className="mt-8">
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 md:grid-cols-5">
              {QUICK_ACTIONS.map(({ icon: Icon, label, to }) => (
                <Link
                  key={label}
                  to={to as never}
                  className="group flex items-center gap-2.5 rounded-xl bg-white/[0.03] px-3 py-2.5 ring-1 ring-white/[0.06] transition-all duration-[150ms] hover:bg-white/[0.06] hover:ring-accent/30 active:scale-[0.98]"
                >
                  <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
                    <Icon className="size-4" strokeWidth={2} />
                  </span>
                  <span className="text-[13.5px] font-medium text-white/90 group-hover:text-white">
                    {label}
                  </span>
                </Link>
              ))}
            </div>
          </section>

          {/* ── 4 · Link columns ─────────────────────────────── */}
          <section className="mt-9 md:mt-12 md:grid md:grid-cols-3 md:gap-10">
            <LinkColumn title="Need Help?" links={SUPPORT_LINKS} />
            <LinkColumn title="Company"    links={COMPANY_LINKS} />
            <LinkColumn title="Legal"      links={LEGAL_LINKS} />
          </section>

          {/* ── 5 · Newsletter ───────────────────────────────── */}
          <section className="mt-10 rounded-2xl bg-white/[0.03] p-5 ring-1 ring-white/[0.06]">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <h5 className="text-[16px] font-semibold tracking-tight text-white">Stay Updated</h5>
                <p className="mt-1 text-[12.5px] text-white/55">
                  Exclusive deals, flash sales and new arrivals.
                </p>
              </div>
              <form
                onSubmit={(e) => e.preventDefault()}
                className="flex w-full max-w-md flex-col gap-1.5"
              >
                <div className="flex h-11 items-center gap-2 rounded-full bg-black/40 pl-4 pr-1.5 ring-1 ring-white/[0.08] focus-within:ring-accent/40">
                  <input
                    type="email"
                    required
                    placeholder="Enter your email"
                    className="min-w-0 flex-1 bg-transparent text-[13.5px] text-white placeholder:text-white/35 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="h-8 shrink-0 rounded-full bg-accent px-4 text-[12.5px] font-semibold text-accent-foreground transition-all duration-[150ms] hover:brightness-110 active:scale-[0.98]"
                  >
                    Subscribe
                  </button>
                </div>
                <p className="pl-1 text-[11px] text-white/40">No spam. Unsubscribe anytime.</p>
              </form>
            </div>
          </section>

          {/* ── 6 · Socials (lazy content, only paints when in view) ── */}
          <section className="mt-10 flex flex-col items-center gap-3 content-visibility-auto">
            <p className="text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">Follow us</p>
            <div className="flex flex-wrap justify-center gap-2.5">
              {SOCIALS.map(({ icon: Icon, label, href, isX }) => (
                <a
                  key={label}
                  href={href}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={label}
                  className="grid size-10 place-items-center rounded-full bg-white/[0.04] text-white/75 ring-1 ring-white/[0.06] transition-all duration-[180ms] hover:-translate-y-0.5 hover:scale-[1.05] hover:text-accent hover:ring-accent/40 hover:shadow-[0_0_20px_-4px] hover:shadow-accent/50"
                >
                  {isX ? (
                    <svg viewBox="0 0 24 24" className="size-[16px] fill-current" aria-hidden>
                      <path d="M18.244 2H21l-6.52 7.45L22 22h-6.86l-4.77-6.24L4.8 22H2l7.02-8.02L2 2h6.94l4.31 5.7L18.24 2Zm-1.2 18h1.9L7.06 4H5.06l11.98 16Z" />
                    </svg>
                  ) : (
                    Icon ? <Icon className="size-[17px]" strokeWidth={1.75} /> : null
                  )}
                </a>
              ))}
            </div>
          </section>

          {/* ── 7 · Trust features 2×2 ───────────────────────── */}
          <section className="mt-10 grid grid-cols-2 gap-2.5">
            {TRUST_FEATURES.map(({ icon: Icon, title, desc }) => (
              <div
                key={title}
                className="flex items-start gap-2.5 rounded-xl bg-white/[0.03] px-3 py-3 ring-1 ring-white/[0.06]"
              >
                <span className="grid size-8 shrink-0 place-items-center rounded-full bg-accent/10 text-accent ring-1 ring-accent/20">
                  <Icon className="size-4" strokeWidth={2} />
                </span>
                <div className="min-w-0">
                  <p className="text-[12.5px] font-semibold text-white/90 leading-tight">{title}</p>
                  <p className="mt-0.5 text-[11px] text-white/50 leading-snug">{desc}</p>
                </div>
              </div>
            ))}
          </section>

          {/* ── 8 · Payment methods ──────────────────────────── */}
          <section className="mt-9">
            <p className="mb-3 text-center text-[11px] font-medium uppercase tracking-[0.22em] text-white/40">
              We accept
            </p>
            <div className="flex flex-wrap justify-center gap-1.5">
              {PAYMENT_METHODS.map((p) => (
                <span
                  key={p}
                  className="inline-flex h-7 items-center rounded-md bg-white/[0.05] px-2.5 text-[10.5px] font-semibold tracking-wide text-white/70 ring-1 ring-white/[0.06]"
                >
                  {p}
                </span>
              ))}
            </div>
          </section>

          {/* ── 9 · Country & Language ───────────────────────── */}
          <section className="mt-9 flex justify-center">
            <button
              type="button"
              className="inline-flex min-w-[220px] items-center justify-center gap-2 rounded-full bg-white/[0.04] px-5 py-2.5 text-[13px] text-white/85 ring-1 ring-white/[0.08] transition-colors duration-[180ms] hover:text-white hover:ring-white/20"
            >
              <Globe2 className="size-4 text-accent" />
              <span className="font-medium">India</span>
              <span className="text-white/25">·</span>
              <span>English</span>
              <ChevronDown className="size-3.5 text-white/40" />
            </button>
          </section>

          {/* ── 10 · Android app (conditional) ───────────────── */}
          {hasAndroidApp && (
            <section className="mt-8 flex justify-center">
              <a
                href={(import.meta.env.VITE_ANDROID_APP_URL as string) || "#"}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2.5 rounded-xl bg-white/[0.05] px-4 py-2.5 ring-1 ring-white/[0.08] transition-all hover:ring-accent/30"
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
          <section className="mt-8 flex flex-col items-center gap-2.5 border-t border-white/[0.05] pt-6 text-center">
            <p className="text-[11px] text-white/50">
              © 2026 <BrandName /> · Made with <span className="text-accent">♥</span> for Global Shopping
            </p>
            <nav className="flex gap-4 text-[11px] text-white/40">
              <Link to="/privacy" className="transition-colors duration-[180ms] hover:text-white">Privacy</Link>
              <Link to="/terms" className="transition-colors duration-[180ms] hover:text-white">Terms</Link>
              <Link to="/privacy" className="transition-colors duration-[180ms] hover:text-white">Cookies</Link>
            </nav>
          </section>
        </div>
      </footer>
    </>
  );
}
