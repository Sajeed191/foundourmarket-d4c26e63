import { createFileRoute, Link, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, Search, Sparkles, Bot, Send, ChevronDown,
  Mail, MessageCircle, Phone, Store,
  Package, RotateCcw, CreditCard, Wrench, FileText, Truck, AlertTriangle,
  ShieldCheck, BadgeCheck, Lock, ShieldHalf, LifeBuoy,
  Loader2, Clock, Zap, ArrowRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center — FoundOurMarket™" },
      { name: "description", content: "AI-powered support, live agents, smart answers for orders, returns, refunds, shipping and seller help." },
      { property: "og:title", content: "Help Center — FoundOurMarket™" },
      { property: "og:description", content: "Smart answers and premium support — whenever you need help." },
    ],
  }),
  component: HelpRouteShell,
});

function HelpRouteShell() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  return pathname === "/help" ? <HelpPage /> : <Outlet />;
}

// ------- Data -------
type FAQ = { q: string; a: string; cat: Category };
type Category = "Orders" | "Shipping" | "Returns" | "Refunds" | "Payments" | "Warranty" | "Seller";

const CATEGORIES: { key: Category | "All"; icon: any }[] = [
  { key: "All", icon: Sparkles },
  { key: "Orders", icon: Package },
  { key: "Shipping", icon: Truck },
  { key: "Returns", icon: RotateCcw },
  { key: "Refunds", icon: CreditCard },
  { key: "Payments", icon: CreditCard },
  { key: "Warranty", icon: Wrench },
  { key: "Seller", icon: Store },
];

const FAQS: FAQ[] = [
  { cat: "Orders", q: "Where is my order?", a: "Open Account → Orders for live tracking. We email you the moment your parcel ships and again on out-for-delivery." },
  { cat: "Shipping", q: "How long does shipping take?", a: "Standard 3–7 business days, Express 1–3. Cut-off is 2pm local time on weekdays." },
  { cat: "Returns", q: "How do I return an item?", a: "Eligible items can be returned within 4 days of delivery. Visit the Return Eligibility Center to verify and start a request." },
  { cat: "Refunds", q: "When will I get my refund?", a: "Refunds land back on your original payment method within 5–10 days of us receiving the return." },
  { cat: "Payments", q: "What payment methods do you accept?", a: "All major cards, Apple Pay, Google Pay and select buy-now-pay-later providers at checkout." },
  { cat: "Payments", q: "Is my payment secure?", a: "Payments are processed via PCI-compliant providers — we never store your card details." },
  { cat: "Warranty", q: "Does my product include a warranty?", a: "Most electronics carry a 12-month manufacturer warranty. Check the product page for exact coverage." },
  { cat: "Seller", q: "How do I contact a seller?", a: "Open the order, tap 'Message Seller'. Verified sellers reply within 24h on average." },
];

const QUICK_ACTIONS = [
  { icon: Package, label: "Track Order", to: "/track", tone: "from-orange-500/20 to-amber-500/10" },
  { icon: RotateCcw, label: "Request Return", to: "/returns", tone: "from-pink-500/20 to-orange-500/10" },
  { icon: CreditCard, label: "Refund Status", to: "/account/returns", tone: "from-emerald-500/20 to-teal-500/10" },
  { icon: Wrench, label: "Warranty Help", to: "/returns", tone: "from-violet-500/20 to-fuchsia-500/10" },
  { icon: FileText, label: "Download Invoice", to: "/account/orders", tone: "from-sky-500/20 to-indigo-500/10" },
  { icon: Store, label: "Seller Assistance", to: "/help/seller-assistance", tone: "from-amber-500/20 to-rose-500/10" },
  { icon: AlertTriangle, label: "Delivery Issue", to: "/track", tone: "from-red-500/20 to-orange-500/10" },
];

const CONTACT_METHODS = [
  { icon: MessageCircle, title: "Live Chat", desc: "AI + human agents", status: "Online Now", eta: "Instant reply", color: "#22c55e", href: "#assistant" },
  { icon: Phone, title: "WhatsApp", desc: "Chat with support", status: "Active", eta: "≈ 12 min", color: "#25D366", href: "https://wa.me/" },
  { icon: Mail, title: "Email Support", desc: "support@foundourmarket.com", status: "24/7", eta: "< 4h response", color: "#FF7A00", href: "mailto:support@foundourmarket.com" },
  { icon: Store, title: "Seller Support", desc: "foundourmarket@gmail.com", status: "Verified", eta: "< 24h", color: "#FF9F43", href: "mailto:foundourmarket@gmail.com" },
];

const TRUST = [
  { icon: ShieldCheck, label: "Verified Support" },
  { icon: ShieldHalf, label: "Buyer Protection" },
  { icon: Lock, label: "Secure Assistance" },
  { icon: BadgeCheck, label: "Protected Refunds" },
  { icon: ShieldCheck, label: "Verified Sellers" },
];

const TRENDING = ["track my order", "return policy", "refund delay", "change address", "cancel order", "warranty claim"];

// ------- Atmosphere -------
function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none absolute inset-0 overflow-hidden">
      <div className="absolute -top-40 left-1/2 -translate-x-1/2 size-[640px] rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(255,122,0,0.35), transparent 70%)" }} />
      <div className="absolute top-1/3 -left-20 size-[420px] rounded-full blur-3xl opacity-30"
        style={{ background: "radial-gradient(closest-side, rgba(255,159,67,0.25), transparent 70%)" }} />
      <div className="absolute inset-0 opacity-[0.04]"
        style={{ backgroundImage: "radial-gradient(circle at 1px 1px, white 1px, transparent 0)", backgroundSize: "32px 32px" }} />
      {Array.from({ length: 14 }).map((_, i) => (
        <motion.span key={i}
          className="absolute size-1 rounded-full bg-orange-300/40"
          style={{ left: `${(i * 73) % 100}%`, top: `${(i * 41) % 100}%` }}
          animate={{ y: [0, -20, 0], opacity: [0.2, 0.8, 0.2] }}
          transition={{ duration: 6 + (i % 5), repeat: Infinity, delay: i * 0.3 }}
        />
      ))}
    </div>
  );
}

// ------- AI Assistant -------
type ChatMsg = { role: "user" | "ai"; text: string };

function aiAnswer(input: string): string {
  const q = input.toLowerCase();
  if (/track|where.*order|shipment|delivery/.test(q)) return "You can live-track your order from Account → Orders, or open the Tracking page. I can also pull up your most recent shipment if you're signed in.";
  if (/return|exchange/.test(q)) return "Eligible items can be returned within 4 days of delivery. Head to the Return Eligibility Center and I'll verify your order instantly.";
  if (/refund/.test(q)) return "Refunds are issued to your original payment method within 5–10 business days after we receive the return. I can check status if you share your order ID.";
  if (/warranty|broken|defect/.test(q)) return "Most electronics include a 12-month manufacturer warranty. I can route you to a warranty claim with the seller in one tap.";
  if (/cancel/.test(q)) return "Orders can be cancelled before they are packed. Open the order and tap 'Cancel' — I'll handle the rest.";
  if (/payment|card|pay/.test(q)) return "We accept all major cards, Apple Pay, Google Pay and select BNPL providers. Payments are PCI-compliant and tokenized.";
  if (/seller|contact/.test(q)) return "Open your order and tap 'Message Seller'. Verified sellers reply within 24h on average.";
  return "I can help with orders, returns, refunds, shipping, warranties and seller issues. Try asking: 'where is my order?' or 'how do refunds work?'";
}

function AIAssistant() {
  const [messages, setMessages] = useState<ChatMsg[]>([
    { role: "ai", text: "Hi 👋 I'm your FoundOurMarket assistant. Ask anything about orders, refunds, returns, shipping, warranty or seller support." },
  ]);
  const [input, setInput] = useState("");
  const [typing, setTyping] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => { scrollRef.current?.scrollTo({ top: 9999, behavior: "smooth" }); }, [messages, typing]);

  const send = (text?: string) => {
    const q = (text ?? input).trim();
    if (!q) return;
    setMessages((m) => [...m, { role: "user", text: q }]);
    setInput("");
    setTyping(true);
    setTimeout(() => {
      setMessages((m) => [...m, { role: "ai", text: aiAnswer(q) }]);
      setTyping(false);
    }, 700 + Math.random() * 600);
  };

  const suggestions = ["Where is my order?", "How do refunds work?", "Start a return", "Warranty claim"];

  return (
    <section id="assistant" className="relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      <div aria-hidden className="absolute -top-24 -right-24 size-72 rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(255,122,0,0.5), transparent 70%)" }} />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <motion.div className="absolute inset-0 rounded-full bg-orange-500/40 blur-md"
              animate={{ scale: [1, 1.4, 1], opacity: [0.5, 0.2, 0.5] }} transition={{ duration: 2.4, repeat: Infinity }} />
            <div className="relative size-10 rounded-full grid place-items-center bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30">
              <Bot className="size-5" />
            </div>
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">AI Support Assistant</p>
            <h3 className="font-display font-semibold text-lg leading-tight">Ask anything — get smart answers in seconds</h3>
          </div>
          <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-300">
            <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> online
          </span>
        </div>

        <div ref={scrollRef} className="mt-5 h-72 overflow-y-auto pr-1 space-y-3 scrollbar-thin">
          <AnimatePresence initial={false}>
            {messages.map((m, i) => (
              <motion.div key={i}
                initial={{ opacity: 0, y: 6 }} animate={{ opacity: 1, y: 0 }}
                className={`flex ${m.role === "user" ? "justify-end" : "justify-start"}`}>
                <div className={`max-w-[85%] rounded-2xl px-3.5 py-2.5 text-sm leading-relaxed ${
                  m.role === "user"
                    ? "bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/20"
                    : "bg-white/[0.06] border border-white/10 text-white/90"
                }`}>
                  {m.text}
                </div>
              </motion.div>
            ))}
            {typing && (
              <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                <div className="bg-white/[0.06] border border-white/10 rounded-2xl px-4 py-3 flex gap-1">
                  {[0, 1, 2].map((d) => (
                    <motion.span key={d} className="size-1.5 rounded-full bg-orange-300"
                      animate={{ y: [0, -4, 0], opacity: [0.4, 1, 0.4] }}
                      transition={{ duration: 0.9, repeat: Infinity, delay: d * 0.15 }} />
                  ))}
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        <div className="mt-3 flex flex-wrap gap-1.5">
          {suggestions.map((s) => (
            <button key={s} onClick={() => send(s)}
              className="text-[11px] px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] hover:bg-white/[0.08] text-white/70 transition">
              {s}
            </button>
          ))}
        </div>

        <form onSubmit={(e) => { e.preventDefault(); send(); }} className="mt-3 relative">
          <input value={input} onChange={(e) => setInput(e.target.value)}
            placeholder="Ask the assistant…"
            className="w-full h-12 rounded-2xl bg-white/[0.05] border border-white/10 pl-4 pr-14 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 focus:bg-white/[0.08] transition" />
          <button type="submit" aria-label="Send"
            className="absolute right-1.5 top-1.5 size-9 rounded-xl grid place-items-center bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 active:scale-95 transition">
            <Send className="size-4" />
          </button>
        </form>
      </div>
    </section>
  );
}

// ------- Smart Search -------
function SmartSearch({ onPick }: { onPick: (q: string) => void }) {
  const [q, setQ] = useState("");
  const [focus, setFocus] = useState(false);

  const matches = useMemo(() => {
    if (!q.trim()) return [];
    const l = q.toLowerCase();
    return FAQS.filter((f) => f.q.toLowerCase().includes(l) || f.a.toLowerCase().includes(l)).slice(0, 5);
  }, [q]);

  return (
    <div className="relative">
      <div className={`relative rounded-2xl border bg-white/[0.04] backdrop-blur-xl transition-all ${
        focus ? "border-orange-400/60 shadow-[0_0_0_4px_rgba(255,122,0,0.12)]" : "border-white/10"
      }`}>
        <Search className="absolute left-4 top-1/2 -translate-y-1/2 size-4 text-orange-300" />
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          onFocus={() => setFocus(true)}
          onBlur={() => setTimeout(() => setFocus(false), 150)}
          placeholder="Search help topics, refunds, shipping…"
          className="w-full h-14 pl-12 pr-4 bg-transparent text-sm placeholder:text-white/40 focus:outline-none"
        />
      </div>

      <AnimatePresence>
        {focus && (
          <motion.div
            initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }}
            className="absolute z-30 mt-2 w-full rounded-2xl border border-white/10 bg-[#0a0f24]/95 backdrop-blur-xl overflow-hidden shadow-2xl shadow-black/40">
            {matches.length > 0 ? (
              <ul className="py-2">
                {matches.map((m, i) => (
                  <li key={i}>
                    <button onClick={() => { onPick(m.q); setQ(""); }}
                      className="w-full text-left px-4 py-2.5 text-sm hover:bg-white/[0.05] flex items-center gap-3">
                      <HelpCircle className="size-4 text-orange-300 shrink-0" />
                      <span className="flex-1 truncate">{m.q}</span>
                      <span className="text-[10px] font-mono uppercase tracking-widest text-white/40">{m.cat}</span>
                    </button>
                  </li>
                ))}
              </ul>
            ) : (
              <div className="p-4">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/40 mb-2">Trending</p>
                <div className="flex flex-wrap gap-1.5">
                  {TRENDING.map((t) => (
                    <button key={t} onClick={() => { onPick(t); setQ(""); }}
                      className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/[0.1] text-white/70">
                      {t}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ------- Page -------
function HelpPage() {
  const { user } = useAuth();
  const [activeCat, setActiveCat] = useState<Category | "All">("All");
  const [open, setOpen] = useState<number | null>(0);
  const [highlight, setHighlight] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { const t = setTimeout(() => setLoaded(true), 350); return () => clearTimeout(t); }, []);

  const filtered = useMemo(() => {
    let list = activeCat === "All" ? FAQS : FAQS.filter((f) => f.cat === activeCat);
    if (highlight) {
      const l = highlight.toLowerCase();
      list = [...list].sort((a, b) =>
        (b.q.toLowerCase().includes(l) ? 1 : 0) - (a.q.toLowerCase().includes(l) ? 1 : 0)
      );
    }
    return list;
  }, [activeCat, highlight]);

  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: "#050816" }}>
      <Atmosphere />

      <div className="relative container-page py-10 sm:py-14 max-w-5xl">
        {/* HERO */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-center mb-8">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <LifeBuoy className="size-3.5 text-orange-300" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">Support</span>
          </div>
          <h1 className="mt-4 text-fluid-3xl font-display font-semibold tracking-tight">
            Help <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">Center</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-white/60 max-w-xl mx-auto">
            Smart answers and premium support — whenever you need help.
          </p>

          {/* Live status pills */}
          <div className="mt-5 flex flex-wrap items-center justify-center gap-2">
            <StatusPill color="#22c55e" label="Agents online" />
            <StatusPill color="#FF7A00" label="Avg reply 12 min" />
            <StatusPill color="#25D366" label="WhatsApp active" />
            <StatusPill color="#a78bfa" label="Email < 4h" />
          </div>
        </motion.div>

        {/* SEARCH */}
        <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, delay: 0.1 }}>
          <SmartSearch onPick={(q) => { setHighlight(q); setActiveCat("All"); setOpen(0); }} />
        </motion.div>

        {/* QUICK ACTIONS */}
        <div className="mt-8">
          <SectionHeader eyebrow="Quick actions" title="Resolve in one tap" />
          <div className="mt-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-3 min-w-max pb-2">
              {QUICK_ACTIONS.map((a, i) => (
                <motion.div key={a.label}
                  initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: i * 0.05 }}>
                  <Link to={a.to}
                    className="group relative w-36 sm:w-40 h-28 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-3 flex flex-col justify-between overflow-hidden hover:border-orange-400/40 transition">
                    <div className={`absolute inset-0 bg-gradient-to-br ${a.tone} opacity-0 group-hover:opacity-100 transition-opacity`} />
                    <a.icon className="relative size-5 text-orange-300" />
                    <div className="relative">
                      <p className="text-sm font-medium leading-tight">{a.label}</p>
                      <ArrowRight className="size-3.5 text-white/40 mt-1 group-hover:translate-x-1 group-hover:text-white transition" />
                    </div>
                  </Link>
                </motion.div>
              ))}
            </div>
          </div>
        </div>

        {/* PERSONALIZED */}
        {user && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="mt-8 rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-500/[0.08] to-transparent p-5 backdrop-blur-xl">
            <div className="flex items-start gap-3">
              <Sparkles className="size-5 text-orange-300 mt-0.5" />
              <div className="flex-1">
                <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">For you</p>
                <h3 className="font-display font-semibold text-base mt-1">Need help with a recent order?</h3>
                <p className="text-xs text-white/60 mt-1">We can fast-track support for your latest shipment or active refund.</p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Link to="/account/orders" className="text-xs px-3 py-1.5 rounded-full bg-white/10 hover:bg-white/20 transition">View orders</Link>
                  <Link to="/track" className="text-xs px-3 py-1.5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white">Track package</Link>
                </div>
              </div>
            </div>
          </motion.div>
        )}

        {/* AI ASSISTANT */}
        <div className="mt-10">
          <SectionHeader eyebrow="AI Assistant" title="Powered by smart routing" />
          <div className="mt-4">
            <AIAssistant />
          </div>
        </div>

        {/* FAQ */}
        <div className="mt-12">
          <SectionHeader eyebrow="FAQs" title="People also ask" />

          <div className="mt-4 -mx-4 px-4 overflow-x-auto scrollbar-hide">
            <div className="flex gap-2 min-w-max pb-2">
              {CATEGORIES.map((c) => {
                const active = activeCat === c.key;
                return (
                  <button key={c.key} onClick={() => setActiveCat(c.key)}
                    className={`inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-xs font-medium border transition-all ${
                      active
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-transparent shadow-lg shadow-orange-500/20"
                        : "bg-white/[0.03] text-white/70 border-white/10 hover:bg-white/[0.08]"
                    }`}>
                    <c.icon className="size-3.5" /> {c.key}
                  </button>
                );
              })}
            </div>
          </div>

          {!loaded ? (
            <div className="mt-4 space-y-2">
              {Array.from({ length: 4 }).map((_, i) => (
                <div key={i} className="h-14 rounded-2xl bg-white/[0.04] border border-white/5 animate-pulse" />
              ))}
            </div>
          ) : (
            <div className="mt-4 rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden divide-y divide-white/5">
              <AnimatePresence initial={false}>
                {filtered.map((f, i) => {
                  const isOpen = open === i;
                  return (
                    <motion.div key={`${f.cat}-${f.q}`} layout
                      initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                      <button onClick={() => setOpen(isOpen ? null : i)}
                        className="w-full flex items-center gap-4 px-4 sm:px-5 py-4 text-left hover:bg-white/[0.04] transition">
                        <div className="size-8 grid place-items-center rounded-full border border-white/10 bg-white/[0.04] text-orange-300 shrink-0">
                          <HelpCircle className="size-4" />
                        </div>
                        <span className="flex-1 text-sm font-medium">{f.q}</span>
                        <span className="text-[9px] font-mono uppercase tracking-widest text-white/40 hidden sm:inline">{f.cat}</span>
                        <ChevronDown className={`size-4 text-white/50 transition-transform ${isOpen ? "rotate-180" : ""}`} />
                      </button>
                      <AnimatePresence initial={false}>
                        {isOpen && (
                          <motion.div
                            initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                            transition={{ duration: 0.25 }}
                            className="overflow-hidden">
                            <p className="px-4 sm:px-5 pb-4 pl-[3.75rem] text-sm text-white/65 leading-relaxed">{f.a}</p>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </motion.div>
                  );
                })}
              </AnimatePresence>
              {filtered.length === 0 && (
                <p className="p-6 text-center text-sm text-white/50">No matching questions. Try the AI Assistant above.</p>
              )}
            </div>
          )}
        </div>

        {/* CONTACT METHODS */}
        <div className="mt-12">
          <SectionHeader eyebrow="Contact us" title="Premium support, your way" />
          <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
            {CONTACT_METHODS.map((c, i) => (
              <motion.a key={c.title} href={c.href}
                initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.06 }}
                className="group relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 flex items-center gap-4 overflow-hidden hover:border-orange-400/40 transition">
                <div className="absolute -inset-12 rounded-full opacity-0 group-hover:opacity-30 transition-opacity blur-3xl"
                  style={{ background: `radial-gradient(closest-side, ${c.color}, transparent)` }} />
                <div className="relative size-12 rounded-2xl grid place-items-center bg-white/[0.05] border border-white/10">
                  <c.icon className="size-5" style={{ color: c.color }} />
                </div>
                <div className="relative flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <p className="font-medium text-sm">{c.title}</p>
                    <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-white/60">
                      <span className="size-1.5 rounded-full animate-pulse" style={{ background: c.color }} /> {c.status}
                    </span>
                  </div>
                  <p className="text-xs text-white/55 truncate">{c.desc}</p>
                  <p className="text-[10px] font-mono uppercase tracking-widest text-white/40 mt-1 flex items-center gap-1">
                    <Clock className="size-3" /> {c.eta}
                  </p>
                </div>
                <ArrowRight className="relative size-4 text-white/40 group-hover:translate-x-1 group-hover:text-white transition" />
              </motion.a>
            ))}
          </div>
        </div>

        {/* TRUST */}
        <div className="mt-12 flex flex-wrap items-center justify-center gap-2">
          {TRUST.map((t) => (
            <div key={t.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-[11px] text-white/70">
              <t.icon className="size-3.5 text-orange-300" />
              <span>{t.label}</span>
            </div>
          ))}
        </div>

        <p className="mt-8 text-center text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
          FoundOurMarket™ · Premium support, 24/7
        </p>
      </div>
    </div>
  );
}

function SectionHeader({ eyebrow, title }: { eyebrow: string; title: string }) {
  return (
    <div className="flex items-end justify-between gap-3">
      <div>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">{eyebrow}</p>
        <h2 className="mt-1 font-display font-semibold text-lg sm:text-xl">{title}</h2>
      </div>
      <Zap className="size-4 text-white/30" />
    </div>
  );
}

function StatusPill({ color, label }: { color: string; label: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl text-[10px] font-mono uppercase tracking-widest text-white/70">
      <span className="relative flex size-1.5">
        <span className="absolute inset-0 rounded-full animate-ping opacity-60" style={{ background: color }} />
        <span className="relative size-1.5 rounded-full" style={{ background: color }} />
      </span>
      {label}
    </div>
  );
}
