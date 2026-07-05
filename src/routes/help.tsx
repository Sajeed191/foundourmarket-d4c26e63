import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useState, useCallback } from "react";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  Search, ChevronDown, ChevronRight, Mail, MessageCircle, Phone, PhoneCall, Copy, Check,
  Package, RotateCcw, CreditCard, Truck, UserRound, LifeBuoy, ArrowRight, X, AlertTriangle,
  BookOpen, FileText, ShieldCheck, Store, Users, ThumbsUp, ThumbsDown, Send, Loader2,
  Lock, Wrench, Command, Clock, TrendingUp, Sparkles,
} from "lucide-react";
import { loadCrisp, openCrispChat } from "@/lib/crisp";
import { toast } from "sonner";
import { useSupportSettings, resolveSupportStatus } from "@/lib/use-support-settings";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center — FoundOurMarket™" },
      { name: "description", content: "Find answers fast: search FAQs, track orders, manage returns and refunds, or reach live support in seconds." },
      { property: "og:title", content: "Help Center — FoundOurMarket™" },
      { property: "og:description", content: "Search FAQs, track orders, manage returns and reach live support — premium help whenever you need it." },
      { property: "og:type", content: "website" },
      { property: "og:url", content: "https://foundourmarket.com/help" },
    ],
    links: [{ rel: "canonical", href: "https://foundourmarket.com/help" }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "FAQPage",
          mainEntity: FAQS.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        }),
      },
    ],
  }),
  component: HelpRouteShell,
});

function HelpRouteShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname === "/help" ? <HelpPage /> : <Outlet />;
}

// ------- Data -------
type Category = "Orders" | "Shipping" | "Payments" | "Returns" | "Account" | "Security" | "Sellers" | "Technical";
type FAQ = { q: string; a: string; cat: Category };

const SUPPORT_EMAIL = "support@foundourmarket.com";

const FAQS: FAQ[] = [
  { cat: "Orders", q: "Where is my order?", a: "Open Account → Orders for live tracking, or use Track Order above. We email you the moment your parcel ships and again on out-for-delivery." },
  { cat: "Orders", q: "Can I cancel my order?", a: "Orders can be cancelled before they're packed. Open the order and tap 'Cancel'. If it's already shipped, start a return instead." },
  { cat: "Shipping", q: "How long does shipping take?", a: "Standard delivery is 3–7 business days. Cut-off is 2pm local time on weekdays. You'll receive tracking the moment your order ships." },
  { cat: "Shipping", q: "Can I change my delivery address?", a: "You can update the address before the order is packed from Account → Orders. Once shipped, contact support and we'll try to reroute it." },
  { cat: "Payments", q: "What payment methods do you accept?", a: "All major cards, Apple Pay, Google Pay, UPI and select buy-now-pay-later providers at checkout." },
  { cat: "Payments", q: "Is my payment secure?", a: "Payments are processed via PCI-compliant providers — we never store your card details." },
  { cat: "Returns", q: "How do returns work?", a: "Eligible items can be returned within 4 days of delivery. Start a request from Returns in a few taps." },
  { cat: "Returns", q: "How do refunds work?", a: "Once we receive your return, refunds are issued to your original payment method within 5–10 business days. You'll get an email at each step." },
  { cat: "Account", q: "How do I reset my password?", a: "Go to Sign in → Forgot password and we'll email you a secure reset link. Links expire after 60 minutes for security." },
  { cat: "Account", q: "How do I update my profile?", a: "Open Account → Profile to edit your name, email, addresses and notification preferences at any time." },
  { cat: "Security", q: "How do you protect my account?", a: "We use encrypted sessions, secure password hashing and optional email verification. Never share your password — our team will never ask for it." },
  { cat: "Sellers", q: "How do I contact a seller?", a: "Open the order and tap 'Message Seller'. Verified sellers reply within 24h on average." },
  { cat: "Sellers", q: "Does my product include a warranty?", a: "Most electronics carry a 12-month manufacturer warranty. Check the product page for exact coverage." },
  { cat: "Technical", q: "The app isn't loading correctly — what can I do?", a: "Refresh the page, clear your cache, or try another browser. If the issue continues, report it below and we'll investigate quickly." },
  { cat: "Technical", q: "Why do I sometimes see graphical glitches in Chrome?", a: "A small number of Android Chrome and WebView combinations may occasionally show rendering issues — such as flickering, horizontal lines, or duplicated images while scrolling — that are related to the browser rather than the website itself. If you run into this, open Account → Preferences → Display & performance and turn on Graphics Compatibility Mode. It switches to a simplified graphics path that can improve stability, is purely visual (it never affects your account, orders or payments), and can be turned off again at any time." },
];

const CATEGORY_META: { key: Category; icon: any }[] = [
  { key: "Orders", icon: Package },
  { key: "Payments", icon: CreditCard },
  { key: "Shipping", icon: Truck },
  { key: "Account", icon: UserRound },
  { key: "Security", icon: Lock },
  { key: "Sellers", icon: Store },
  { key: "Returns", icon: RotateCcw },
  { key: "Technical", icon: Wrench },
];

const QUICK_ACTIONS = [
  { icon: Package, label: "Track Order", desc: "Live status & delivery", to: "/track" },
  { icon: RotateCcw, label: "Returns & Refunds", desc: "Start or check a return", to: "/returns" },
  { icon: CreditCard, label: "Payments", desc: "Methods & receipts", to: "/account/payments" },
  { icon: Truck, label: "Shipping", desc: "Times & tracking", to: "/shipping-policy" },
  { icon: LifeBuoy, label: "Contact Support", desc: "Chat, email or call", to: "#contact" },
  { icon: AlertTriangle, label: "Report an Issue", desc: "Something went wrong", to: "#contact" },
] as const;

const RESOURCES = [
  { icon: BookOpen, label: "User Guide", to: "/about" },
  { icon: Truck, label: "Shipping Policy", to: "/shipping-policy" },
  { icon: FileText, label: "Returns Policy", to: "/return-policy" },
  { icon: ShieldCheck, label: "Privacy Policy", to: "/privacy" },
  { icon: FileText, label: "Terms", to: "/terms" },
  { icon: Store, label: "Seller Center", to: "/help/seller-assistance" },
] as const;

const TRENDING = ["Track order", "Refund status", "Change address", "Payment failed", "Reset password"];
const RECENT_KEY = "foundour_help_recent";

// ------- Helpers -------
function highlight(text: string, query: string) {
  const q = query.trim();
  if (!q) return text;
  const idx = text.toLowerCase().indexOf(q.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-orange-400/30 text-orange-100 rounded px-0.5">{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function scrollToId(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
}

// ------- Sticky search hero -------
function Hero({ query, setQuery }: { query: string; setQuery: (v: string) => void }) {
  const [focus, setFocus] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const commit = useCallback((term: string) => {
    const t = term.trim();
    if (!t) return;
    setQuery(t);
    setRecent((cur) => {
      const next = [t, ...cur.filter((x) => x.toLowerCase() !== t.toLowerCase())].slice(0, 5);
      try { localStorage.setItem(RECENT_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
    scrollToId("faqs");
  }, [setQuery]);

  const suggestions = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return [];
    return FAQS.filter((f) => f.q.toLowerCase().includes(q)).slice(0, 5);
  }, [query]);

  const showPanel = focus && (query.trim() ? suggestions.length > 0 : recent.length > 0 || TRENDING.length > 0);

  return (
    <section className="relative text-center pt-2">
      <div aria-hidden className="pointer-events-none absolute -top-24 left-1/2 -translate-x-1/2 size-[520px] rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(closest-side, rgba(255,122,0,0.35), transparent 70%)" }} />
      <div className="relative">
        <h1 className="text-fluid-3xl font-display font-semibold tracking-tight">
          How can we <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">help you?</span>
        </h1>
        <p className="mt-3 text-sm sm:text-base text-white/55 max-w-md mx-auto">
          Search our knowledge base or pick a topic below.
        </p>

        {/* Sticky search */}
        <div className="sticky top-[calc(var(--app-header-h,0px)+0.5rem)] z-20 mt-6 max-w-xl mx-auto">
          <div className={`relative rounded-2xl border bg-[#0a0f24]/85 backdrop-blur-xl transition-all ${
            focus ? "border-orange-400/60 shadow-[0_0_0_4px_rgba(255,122,0,0.12)]" : "border-white/10"
          }`}>
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-5 text-orange-300" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onFocus={() => setFocus(true)}
              onBlur={() => setTimeout(() => setFocus(false), 150)}
              onKeyDown={(e) => { if (e.key === "Enter") commit(query); }}
              aria-label="Search help topics"
              placeholder="Search for answers…"
              className="w-full h-14 pl-12 pr-24 bg-transparent text-sm sm:text-base placeholder:text-white/40 focus:outline-none"
            />
            <span className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 hidden sm:inline-flex items-center gap-1 px-2 py-1 rounded-lg border border-white/10 bg-white/[0.04] text-[10px] text-white/40">
              <Command className="size-3" /> K
            </span>

            <AnimatePresence>
              {showPanel && (
                <motion.div
                  initial={{ opacity: 0, y: -6 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }}
                  transition={{ duration: 0.15 }}
                  className="absolute left-0 right-0 top-[calc(100%+0.5rem)] rounded-2xl border border-white/10 bg-[#0a0f24]/95 backdrop-blur-xl p-2 text-left shadow-2xl">
                  {query.trim() ? (
                    suggestions.map((s) => (
                      <button key={s.q} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(s.q)}
                        className="w-full flex items-center gap-3 px-3 py-2.5 rounded-xl hover:bg-white/[0.06] transition text-sm">
                        <Search className="size-4 text-white/40 shrink-0" />
                        <span className="flex-1 truncate">{highlight(s.q, query)}</span>
                      </button>
                    ))
                  ) : (
                    <>
                      {recent.length > 0 && (
                        <div className="px-2 pt-1 pb-2">
                          <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/35 mb-1.5"><Clock className="size-3" /> Recent</p>
                          <div className="flex flex-wrap gap-2">
                            {recent.map((r) => (
                              <button key={r} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(r)}
                                className="px-3 py-1.5 rounded-full text-xs bg-white/[0.05] border border-white/10 text-white/70 hover:bg-white/[0.09] transition">{r}</button>
                            ))}
                          </div>
                        </div>
                      )}
                      <div className="px-2 pt-1 pb-1">
                        <p className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-white/35 mb-1.5"><TrendingUp className="size-3" /> Trending</p>
                        <div className="flex flex-wrap gap-2">
                          {TRENDING.map((t) => (
                            <button key={t} onMouseDown={(e) => e.preventDefault()} onClick={() => commit(t)}
                              className="px-3 py-1.5 rounded-full text-xs bg-orange-500/10 border border-orange-400/15 text-orange-200 hover:bg-orange-500/20 transition">{t}</button>
                          ))}
                        </div>
                      </div>
                    </>
                  )}
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </div>
    </section>
  );
}

// ------- Section header -------
function SectionHeader({ title, sub }: { title: string; sub?: string }) {
  return (
    <div className="mb-4">
      <h2 className="font-display font-semibold text-lg sm:text-xl">{title}</h2>
      {sub && <p className="text-xs text-white/45 mt-0.5">{sub}</p>}
    </div>
  );
}

// ------- Quick actions -------
function QuickActions() {
  const nav = useNavigate();
  const go = (to: string) => {
    if (to.startsWith("#")) { scrollToId(to.slice(1)); return; }
    nav({ to });
  };
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {QUICK_ACTIONS.map((a) => (
        <button key={a.label} onClick={() => go(a.to)} aria-label={a.label}
          className="group card-tile h-full text-left flex flex-col gap-3 min-h-[7.5rem] active:scale-[0.98] transition-transform">
          <span className="size-11 rounded-xl grid place-items-center bg-orange-500/10 border border-orange-400/15 text-orange-300 shrink-0 group-hover:scale-105 transition-transform">
            <a.icon className="size-5" />
          </span>
          <div className="mt-auto">
            <p className="text-sm font-medium leading-tight">{a.label}</p>
            <p className="text-[11px] text-white/45 mt-0.5">{a.desc}</p>
          </div>
        </button>
      ))}
    </div>
  );
}

// ------- Categories -------
function Categories({ onPick }: { onPick: (c: Category) => void }) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
      {CATEGORY_META.map((c) => {
        const count = FAQS.filter((f) => f.cat === c.key).length;
        return (
          <button key={c.key} onClick={() => onPick(c.key)} aria-label={`${c.key} — ${count} articles`}
            className="group card-tile flex items-center gap-3 active:scale-[0.98] transition-transform">
            <span className="size-10 rounded-xl grid place-items-center bg-orange-500/10 border border-orange-400/15 text-orange-300 shrink-0">
              <c.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1 text-left">
              <p className="text-sm font-medium leading-tight truncate">{c.key}</p>
              <p className="text-[11px] text-white/40 mt-0.5">{count} {count === 1 ? "article" : "articles"}</p>
            </div>
            <ChevronRight className="size-4 text-white/25 group-hover:text-white/60 group-hover:translate-x-0.5 transition shrink-0" />
          </button>
        );
      })}
    </div>
  );
}

// ------- FAQ -------
function FaqSection({ query, cat, setCat }: { query: string; cat: Category | "All"; setCat: (c: Category | "All") => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const reduce = useReducedMotion();

  const filtered = useMemo(() => {
    let list = cat === "All" ? FAQS : FAQS.filter((f) => f.cat === cat);
    const q = query.trim().toLowerCase();
    if (q) list = list.filter((f) => f.q.toLowerCase().includes(q) || f.a.toLowerCase().includes(q));
    return list;
  }, [cat, query]);

  const searching = query.trim().length > 0 || cat !== "All";
  const visible = searching || showAll ? filtered : filtered.slice(0, 5);
  const toggle = useCallback((q: string) => setOpen((cur) => (cur === q ? null : q)), []);

  return (
    <div id="faqs">
      <SectionHeader title="Popular questions" sub={searching ? `${filtered.length} ${filtered.length === 1 ? "answer" : "answers"}` : "The 5 most common questions"} />

      {cat !== "All" && (
        <button onClick={() => setCat("All")} className="mb-3 inline-flex items-center gap-1.5 text-xs text-orange-300 hover:text-orange-200 transition">
          <X className="size-3.5" /> Clear “{cat}” filter
        </button>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/[0.02] overflow-hidden divide-y divide-white/5">
        {visible.map((f) => {
          const isOpen = open === f.q;
          return (
            <div key={`${f.cat}-${f.q}`}>
              <button onClick={() => toggle(f.q)} aria-expanded={isOpen}
                className="w-full flex items-center gap-3 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.03] transition min-h-[56px]">
                <span className="flex-1 text-sm font-medium">{highlight(f.q, query)}</span>
                <ChevronDown className={`size-4 text-white/40 shrink-0 transition-transform ${isOpen ? "rotate-180" : ""}`} />
              </button>
              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    initial={reduce ? undefined : { height: 0, opacity: 0 }}
                    animate={reduce ? undefined : { height: "auto", opacity: 1 }}
                    exit={reduce ? undefined : { height: 0, opacity: 0 }}
                    transition={{ duration: 0.24, ease: "easeOut" }}
                    className="overflow-hidden">
                    <p className="px-4 sm:px-5 pb-4 text-sm text-white/60 leading-relaxed">{highlight(f.a, query)}</p>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
        {filtered.length === 0 && (
          <p className="p-6 text-center text-sm text-white/45">
            No results{query ? ` for "${query}"` : ""}. Try a different search or contact support below.
          </p>
        )}
      </div>

      {!searching && filtered.length > 5 && (
        <button onClick={() => setShowAll((v) => !v)}
          className="mt-3 w-full h-11 rounded-2xl grid place-items-center border border-white/10 bg-white/[0.03] text-sm text-white/70 hover:bg-white/[0.06] transition">
          {showAll ? "Show less" : `View all ${filtered.length} FAQs`}
        </button>
      )}
    </div>
  );
}

// ------- Contact support -------
function ContactSupport() {
  const { settings } = useSupportSettings();
  const { online, minutes } = resolveSupportStatus(settings);
  const [waOpen, setWaOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const nav = useNavigate();

  const openLiveChat = () => {
    loadCrisp().then(() => openCrispChat()).catch(() => toast.error("Live chat is loading — try again in a moment"));
  };
  const copyNumber = async (num: string) => {
    try {
      await navigator.clipboard.writeText(num.replace(/\s/g, ""));
      setCopied(num); toast.success("Number copied");
      setTimeout(() => setCopied(null), 1600);
    } catch { toast.error("Couldn't copy — long-press to copy manually"); }
  };
  const openWhatsApp = (num: string) => window.open(`https://wa.me/${num.replace(/[^0-9]/g, "")}`, "_blank", "noopener,noreferrer");

  const channels = [
    { icon: MessageCircle, label: "Live Chat", resp: online ? `~${minutes} min` : "Leave a message", avail: "24/7", status: online ? "online" : "away", onClick: openLiveChat },
    { icon: Phone, label: "WhatsApp", resp: "5–30 min", avail: "9am–9pm", status: settings.whatsappNumbers.length ? "online" : "soon", onClick: () => (settings.whatsappNumbers.length ? setWaOpen(true) : toast.info("WhatsApp support coming soon")) },
    { icon: Mail, label: "Email", resp: "Under 24h", avail: SUPPORT_EMAIL, status: "always", onClick: () => { window.location.href = `mailto:${SUPPORT_EMAIL}`; } },
    { icon: PhoneCall, label: "Request Callback", resp: "Same day", avail: "Business hrs", status: "always", onClick: () => nav({ to: "/contact" }) },
  ];

  const statusDot = (s: string) => (s === "online" ? "#22c55e" : s === "away" ? "#f59e0b" : s === "soon" ? "#64748b" : "#38bdf8");
  const statusLabel = (s: string) => (s === "online" ? "Online" : s === "away" ? "Away" : s === "soon" ? "Soon" : "Always on");

  return (
    <div id="contact" className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <span className="relative flex size-2.5">
          <span className="absolute inset-0 rounded-full animate-ping opacity-70" style={{ background: online ? "#22c55e" : "#f59e0b" }} />
          <span className="relative size-2.5 rounded-full" style={{ background: online ? "#22c55e" : "#f59e0b" }} />
        </span>
        <h2 className="font-display font-semibold text-lg sm:text-xl">Contact support</h2>
      </div>
      <p className="text-xs text-white/45 mt-1">{online ? "All channels online now" : "High volume — replies may take a little longer"}</p>

      <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
        {channels.map((c) => (
          <button key={c.label} onClick={c.onClick} aria-label={c.label}
            className="group card-tile text-left flex items-center gap-3 active:scale-[0.99] transition-transform">
            <span className="size-10 rounded-xl grid place-items-center bg-orange-500/10 border border-orange-400/15 text-orange-300 shrink-0">
              <c.icon className="size-5" />
            </span>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <p className="text-sm font-medium leading-tight">{c.label}</p>
                <span className="inline-flex items-center gap-1 text-[9px] uppercase tracking-wide text-white/45">
                  <span className="size-1.5 rounded-full" style={{ background: statusDot(c.status) }} />
                  {statusLabel(c.status)}
                </span>
              </div>
              <p className="text-[11px] text-white/45 truncate mt-0.5">{c.resp} · {c.avail}</p>
            </div>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {waOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setWaOpen(false)}
            className="fixed inset-0 z-[90] grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0a0f24]/95 backdrop-blur-xl p-5 shadow-2xl"
              style={{ paddingBottom: "calc(var(--mobile-nav-clearance) + 1.25rem)" }}>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl grid place-items-center bg-[#25D366]/10 border border-[#25D366]/20">
                  <Phone className="size-5 text-[#25D366]" />
                </div>
                <div className="flex-1">
                  <p className="font-display font-semibold text-base leading-tight">WhatsApp support</p>
                  <p className="text-[11px] text-[#25D366]">Online · replies in 5–30 min</p>
                </div>
                <button onClick={() => setWaOpen(false)} aria-label="Close" className="size-8 grid place-items-center rounded-full hover:bg-white/10 text-white/60">
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {settings.whatsappNumbers.map((num) => (
                  <div key={num} className="flex items-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] p-2 pl-4">
                    <span className="flex-1 text-sm font-mono tracking-wide">{num}</span>
                    <button onClick={() => copyNumber(num)} aria-label="Copy number"
                      className="size-9 grid place-items-center rounded-xl border border-white/10 bg-white/[0.05] text-white/70 hover:text-white transition">
                      {copied === num ? <Check className="size-4 text-emerald-400" /> : <Copy className="size-4" />}
                    </button>
                    <button onClick={() => openWhatsApp(num)}
                      className="h-9 px-3.5 rounded-xl grid place-items-center bg-[#25D366] text-black text-xs font-semibold hover:brightness-110 transition">
                      Chat
                    </button>
                  </div>
                ))}
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------- Resources -------
function Resources() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
      {RESOURCES.map((r) => (
        <Link key={r.label} to={r.to}
          className="group card-tile flex items-center gap-3 active:scale-[0.98] transition-transform">
          <span className="size-9 rounded-lg grid place-items-center bg-white/[0.04] border border-white/10 text-orange-300 shrink-0">
            <r.icon className="size-4" />
          </span>
          <span className="text-sm font-medium leading-tight flex-1">{r.label}</span>
          <ArrowRight className="size-3.5 text-white/30 group-hover:text-white group-hover:translate-x-0.5 transition" />
        </Link>
      ))}
    </div>
  );
}

// ------- Still need help CTA -------
function StillNeedHelp() {
  const openLiveChat = () => {
    loadCrisp().then(() => openCrispChat()).catch(() => toast.error("Live chat is loading — try again in a moment"));
  };
  return (
    <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/[0.03] p-6 sm:p-8 text-center">
      <div aria-hidden className="pointer-events-none absolute -top-16 left-1/2 -translate-x-1/2 size-[360px] rounded-full blur-3xl opacity-25"
        style={{ background: "radial-gradient(closest-side, rgba(255,122,0,0.4), transparent 70%)" }} />
      <div className="relative">
        <span className="inline-flex size-12 rounded-2xl items-center justify-center bg-orange-500/10 border border-orange-400/15 text-orange-300 mx-auto">
          <Sparkles className="size-6" />
        </span>
        <h2 className="mt-4 font-display font-semibold text-xl sm:text-2xl">Still need help?</h2>
        <p className="mt-2 text-sm text-white/55 max-w-sm mx-auto">Our team is here around the clock. Reach out and we'll get you sorted.</p>
        <div className="mt-5 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button onClick={openLiveChat}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-2xl bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold active:scale-[0.98] transition-transform">
            <MessageCircle className="size-4" /> Start Live Chat
          </button>
          <a href={`mailto:${SUPPORT_EMAIL}`}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-2 h-11 px-6 rounded-2xl border border-white/10 bg-white/[0.04] text-sm font-semibold hover:bg-white/[0.07] transition">
            <Mail className="size-4" /> Send Email
          </a>
        </div>
      </div>
    </div>
  );
}

// ------- Feedback -------
function Feedback() {
  const [state, setState] = useState<"idle" | "yes" | "modal" | "done">("idle");
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);

  const submitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    await new Promise((r) => setTimeout(r, 500));
    setSaving(false);
    setState("done");
    toast.success("Thanks — your feedback helps us improve");
  };

  if (state === "yes" || state === "done") {
    return (
      <p className="text-center text-sm text-white/50">
        {state === "yes" ? "Great — thanks for the feedback! 🙌" : "Thanks for helping us improve. 💬"}
      </p>
    );
  }

  return (
    <div className="text-center">
      <p className="text-sm text-white/60">Did this page help you?</p>
      <div className="mt-3 flex items-center justify-center gap-3">
        <button onClick={() => setState("yes")}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/10 bg-white/[0.03] text-sm hover:bg-white/[0.07] transition">
          <ThumbsUp className="size-4 text-emerald-400" /> Yes
        </button>
        <button onClick={() => setState("modal")}
          className="inline-flex items-center gap-2 h-10 px-4 rounded-full border border-white/10 bg-white/[0.03] text-sm hover:bg-white/[0.07] transition">
          <ThumbsDown className="size-4 text-orange-300" /> No
        </button>
      </div>

      <AnimatePresence>
        {state === "modal" && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setState("idle")}
            className="fixed inset-0 z-[90] grid place-items-center bg-black/60 backdrop-blur-sm p-4">
            <motion.form onSubmit={submitNote} initial={{ y: 20, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 20, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0a0f24]/95 backdrop-blur-xl p-5 text-left shadow-2xl">
              <div className="flex items-center justify-between">
                <p className="font-display font-semibold text-base">What could be better?</p>
                <button type="button" onClick={() => setState("idle")} aria-label="Close" className="size-8 grid place-items-center rounded-full hover:bg-white/10 text-white/60">
                  <X className="size-4" />
                </button>
              </div>
              <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={4} maxLength={1000}
                placeholder="Tell us what you were looking for…"
                className="mt-3 w-full rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 resize-none transition" />
              <button type="submit" disabled={saving}
                className="mt-3 w-full h-11 rounded-2xl grid place-items-center bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.99] transition">
                {saving ? <Loader2 className="size-4 animate-spin" /> : <span className="inline-flex items-center gap-2"><Send className="size-4" /> Send feedback</span>}
              </button>
            </motion.form>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------- Reveal wrapper -------
function Reveal({ children, delay = 0 }: { children: React.ReactNode; delay?: number }) {
  const reduce = useReducedMotion();
  return (
    <motion.section
      initial={reduce ? undefined : { opacity: 0, y: 16 }}
      whileInView={reduce ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-60px" }}
      transition={{ duration: 0.4, delay, ease: "easeOut" }}>
      {children}
    </motion.section>
  );
}

// ------- Page -------
function HelpPage() {
  const [query, setQuery] = useState("");
  const [cat, setCat] = useState<Category | "All">("All");

  const pickCategory = useCallback((c: Category) => {
    setCat(c);
    setQuery("");
    scrollToId("faqs");
  }, []);

  return (
    <main className="relative min-h-screen text-white" style={{ backgroundColor: "#050816" }}>
      <div className="relative container-page py-8 sm:py-12 max-w-3xl space-y-8 sm:space-y-10">
        <Hero query={query} setQuery={setQuery} />

        <Reveal>
          <SectionHeader title="Quick actions" sub="Jump straight to what you need" />
          <QuickActions />
        </Reveal>

        <Reveal>
          <SectionHeader title="Popular categories" sub="Browse answers by topic" />
          <Categories onPick={pickCategory} />
        </Reveal>

        <Reveal>
          <FaqSection query={query} cat={cat} setCat={setCat} />
        </Reveal>

        <Reveal>
          <ContactSupport />
        </Reveal>

        <Reveal>
          <SectionHeader title="Resources" sub="Guides & policies" />
          <Resources />
        </Reveal>

        <Reveal>
          <StillNeedHelp />
        </Reveal>

        <Reveal>
          <Feedback />
        </Reveal>

        <footer className="pt-2 border-t border-white/5">
          <p className="text-center text-[10px] font-mono uppercase tracking-[0.3em] text-white/25">
            FoundOurMarket™ · Support, 24/7
          </p>
        </footer>
      </div>
    </main>
  );
}
