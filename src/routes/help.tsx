import { createFileRoute, Link, Outlet, useNavigate, useRouterState } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  HelpCircle, Search, Sparkles, Bot, Send, ChevronDown,
  Mail, MessageCircle, Phone, Store, Copy, Check,
  Package, RotateCcw, CreditCard, Wrench, FileText, Truck, AlertTriangle,
  ShieldCheck, BadgeCheck, Lock, ShieldHalf, LifeBuoy,
  Loader2, Clock, Zap, ArrowRight, Ticket, ChevronsDownUp, Flame, History, X,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { loadCrisp, openCrispChat } from "@/lib/crisp";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/help")({
  head: () => ({
    meta: [
      { title: "Help Center — FoundOurMarket™" },
      { name: "description", content: "Enterprise-grade support: live chat, WhatsApp, order tracking, tickets and instant answers for orders, returns, refunds and shipping." },
      { property: "og:title", content: "Help Center — FoundOurMarket™" },
      { property: "og:description", content: "Live chat, WhatsApp, order tracking, tickets and smart answers — premium support whenever you need help." },
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

const SUPPORT_EMAIL = "foundourmarket@gmail.com";
const WHATSAPP_NUMBERS = ["+91 97458 44213", "+91 62820 88380", "+91 87144 59240"];

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
  { cat: "Orders", q: "Where is my order?", a: "Open Account → Orders for live tracking, or use the Track My Order card above. We email you the moment your parcel ships and again on out-for-delivery." },
  { cat: "Shipping", q: "How long does shipping take?", a: "Standard delivery is 3–7 business days. Cut-off is 2pm local time on weekdays. You'll receive tracking the moment your order ships." },
  { cat: "Refunds", q: "How do refunds work?", a: "Once we receive your return, refunds are issued to your original payment method within 5–10 business days. You'll get an email confirmation at each step." },
  { cat: "Orders", q: "Can I cancel my order?", a: "Orders can be cancelled before they're packed. Open the order and tap 'Cancel' — if it's already shipped, start a return instead." },
  { cat: "Returns", q: "How do returns work?", a: "Eligible items can be returned within 4 days of delivery. Visit the Return Eligibility Center, verify your order and start a request in a few taps." },
  { cat: "Payments", q: "What payment methods do you accept?", a: "All major cards, Apple Pay, Google Pay, UPI and select buy-now-pay-later providers at checkout." },
  { cat: "Payments", q: "Is my payment secure?", a: "Payments are processed via PCI-compliant providers — we never store your card details." },
  { cat: "Warranty", q: "Does my product include a warranty?", a: "Most electronics carry a 12-month manufacturer warranty. Check the product page for exact coverage." },
  { cat: "Seller", q: "How do I contact a seller?", a: "Open the order and tap 'Message Seller'. Verified sellers reply within 24h on average." },
];

const POPULAR_QUESTIONS = [
  "Where is my order?",
  "How long does shipping take?",
  "How do refunds work?",
  "Can I cancel my order?",
  "How do returns work?",
];

const QUICK_ACTIONS = [
  { icon: Package, label: "Track Order", to: "/track", tone: "from-orange-500/20 to-amber-500/10" },
  { icon: RotateCcw, label: "Request Return", to: "/returns", tone: "from-pink-500/20 to-orange-500/10" },
  { icon: CreditCard, label: "Refund Status", to: "/account/returns", tone: "from-emerald-500/20 to-teal-500/10" },
  { icon: Wrench, label: "Warranty Help", to: "/returns", tone: "from-violet-500/20 to-fuchsia-500/10" },
  { icon: FileText, label: "Download Invoice", to: "/account/orders", tone: "from-sky-500/20 to-indigo-500/10" },
  { icon: Store, label: "Seller Assistance", to: "/help/seller-assistance", tone: "from-amber-500/20 to-rose-500/10" },
  { icon: AlertTriangle, label: "Delivery Issue", to: "/track", tone: "from-red-500/20 to-orange-500/10" },
] as const;

const TICKET_CATEGORIES = [
  { id: "order", label: "Order Issue", icon: Package },
  { id: "shipping", label: "Delivery Issue", icon: Truck },
  { id: "refund", label: "Refund", icon: CreditCard },
  { id: "return", label: "Return", icon: RotateCcw },
  { id: "payment", label: "Payment Issue", icon: CreditCard },
  { id: "technical", label: "Technical Problem", icon: Wrench },
  { id: "general", label: "Other", icon: FileText },
] as const;

const TRUST = [
  { icon: ShieldCheck, label: "Verified Support" },
  { icon: ShieldHalf, label: "Buyer Protection" },
  { icon: Lock, label: "Secure Assistance" },
  { icon: BadgeCheck, label: "Protected Refunds" },
  { icon: ShieldCheck, label: "Verified Sellers" },
];

const TRENDING = ["track my order", "return policy", "refund delay", "change address", "cancel order", "warranty claim"];

const RECENT_FAQ_KEY = "fom_recent_faqs";

function genTicketId(): string {
  const n = Math.floor(10000 + Math.random() * 90000);
  return `FOM-2026-${n}`;
}

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

// ------- Status Banner -------
function StatusBanner() {
  // Simulated live status — green during normal hours, amber on high volume.
  const highVolume = useMemo(() => {
    const h = new Date().getHours();
    return h >= 18 && h <= 22; // evening peak
  }, []);
  const online = !highVolume;
  const color = online ? "#22c55e" : "#f59e0b";
  const eta = online ? "8 minutes" : "up to 1 hour";

  return (
    <motion.div initial={{ opacity: 0, y: -8 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
      className="relative rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      <div aria-hidden className="absolute inset-0 opacity-30"
        style={{ background: `radial-gradient(120% 120% at 0% 50%, ${color}22, transparent 60%)` }} />
      <div className="relative flex items-center gap-3 px-4 py-3">
        <span className="relative flex size-3 shrink-0">
          <span className="absolute inset-0 rounded-full animate-ping opacity-70" style={{ background: color }} />
          <span className="relative size-3 rounded-full" style={{ background: color }} />
        </span>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-medium">
            {online ? "🟢 All support channels online" : "🟠 High support volume"}
          </p>
          <p className="text-[11px] text-white/55">
            {online ? `Average response time: ${eta}` : `Replies may take ${eta}`}
          </p>
        </div>
        <span className="hidden sm:inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/60 shrink-0">
          <Clock className="size-3" /> {eta}
        </span>
      </div>
    </motion.div>
  );
}

// ------- Support Contacts -------
function SupportContacts() {
  const [waOpen, setWaOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);

  const copyNumber = async (num: string) => {
    try {
      await navigator.clipboard.writeText(num.replace(/\s/g, ""));
      setCopied(num);
      toast.success("Number copied");
      setTimeout(() => setCopied(null), 1800);
    } catch {
      toast.error("Couldn't copy — long-press to copy manually");
    }
  };

  const openWhatsApp = (num: string) => {
    const clean = num.replace(/[^0-9]/g, "");
    window.open(`https://wa.me/${clean}`, "_blank", "noopener,noreferrer");
  };

  const openLiveChat = () => {
    loadCrisp().then(() => openCrispChat()).catch(() => toast.error("Live chat is loading — try again in a moment"));
  };

  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
      {/* Live Chat */}
      <button onClick={openLiveChat}
        className="group relative text-left rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 overflow-hidden hover:border-emerald-400/40 transition">
        <div className="absolute -inset-12 rounded-full opacity-0 group-hover:opacity-30 transition-opacity blur-3xl"
          style={{ background: "radial-gradient(closest-side, #22c55e, transparent)" }} />
        <div className="relative flex items-center justify-between">
          <div className="size-11 rounded-2xl grid place-items-center bg-emerald-500/10 border border-emerald-400/20">
            <MessageCircle className="size-5 text-emerald-400" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-300">
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-emerald-400 animate-ping opacity-70" />
              <span className="relative size-2 rounded-full bg-emerald-400" />
            </span>
            Live Now
          </span>
        </div>
        <p className="relative mt-3 font-medium text-sm">Live Chat</p>
        <p className="relative text-xs text-white/55 mt-0.5">Avg response under 2 min · Agents online</p>
        <span className="relative mt-2 inline-flex items-center gap-1 text-[11px] text-emerald-300 font-medium">
          Open chat <ArrowRight className="size-3.5 group-hover:translate-x-1 transition" />
        </span>
      </button>

      {/* WhatsApp */}
      <button onClick={() => setWaOpen(true)}
        className="group relative text-left rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 overflow-hidden hover:border-[#25D366]/40 transition">
        <div className="absolute -inset-12 rounded-full opacity-0 group-hover:opacity-30 transition-opacity blur-3xl"
          style={{ background: "radial-gradient(closest-side, #25D366, transparent)" }} />
        <div className="relative flex items-center justify-between">
          <div className="size-11 rounded-2xl grid place-items-center bg-[#25D366]/10 border border-[#25D366]/20">
            <Phone className="size-5 text-[#25D366]" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-[#25D366]">
            <span className="relative flex size-2">
              <span className="absolute inset-0 rounded-full bg-[#25D366] animate-ping opacity-70" />
              <span className="relative size-2 rounded-full bg-[#25D366]" />
            </span>
            Online
          </span>
        </div>
        <p className="relative mt-3 font-medium text-sm">WhatsApp Support</p>
        <p className="relative text-xs text-white/55 mt-0.5">Usually replies within 5–30 minutes</p>
        <span className="relative mt-2 inline-flex items-center gap-1 text-[11px] text-[#25D366] font-medium">
          View numbers <ArrowRight className="size-3.5 group-hover:translate-x-1 transition" />
        </span>
      </button>

      {/* Email */}
      <a href={`mailto:${SUPPORT_EMAIL}`}
        className="group relative text-left rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl p-4 overflow-hidden hover:border-orange-400/40 transition">
        <div className="absolute -inset-12 rounded-full opacity-0 group-hover:opacity-30 transition-opacity blur-3xl"
          style={{ background: "radial-gradient(closest-side, #FF7A00, transparent)" }} />
        <div className="relative flex items-center justify-between">
          <div className="size-11 rounded-2xl grid place-items-center bg-orange-500/10 border border-orange-400/20">
            <Mail className="size-5 text-orange-400" />
          </div>
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-orange-300">
            <span className="size-2 rounded-full bg-orange-400 animate-pulse" /> 24/7
          </span>
        </div>
        <p className="relative mt-3 font-medium text-sm">Email Support</p>
        <p className="relative text-xs text-white/55 mt-0.5 break-all">{SUPPORT_EMAIL}</p>
        <span className="relative mt-2 inline-flex items-center gap-1 text-[11px] text-orange-300 font-medium">
          Send email <ArrowRight className="size-3.5 group-hover:translate-x-1 transition" />
        </span>
      </a>

      {/* WhatsApp numbers modal */}
      <AnimatePresence>
        {waOpen && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            onClick={() => setWaOpen(false)}
            className="fixed inset-0 z-50 grid place-items-end sm:place-items-center bg-black/60 backdrop-blur-sm p-0 sm:p-4">
            <motion.div initial={{ y: 30, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 30, opacity: 0 }}
              transition={{ type: "spring", damping: 26, stiffness: 280 }}
              onClick={(e) => e.stopPropagation()}
              className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-[#0a0f24]/95 backdrop-blur-xl p-5 shadow-2xl"
              style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}>
              <div className="flex items-center gap-3">
                <div className="size-10 rounded-2xl grid place-items-center bg-[#25D366]/10 border border-[#25D366]/20">
                  <Phone className="size-5 text-[#25D366]" />
                </div>
                <div className="flex-1">
                  <p className="font-display font-semibold text-base leading-tight">WhatsApp Support</p>
                  <p className="text-[11px] text-[#25D366] inline-flex items-center gap-1.5">
                    <span className="size-1.5 rounded-full bg-[#25D366] animate-pulse" /> Online · replies in 5–30 min
                  </p>
                </div>
                <button onClick={() => setWaOpen(false)} className="size-8 grid place-items-center rounded-full hover:bg-white/10 text-white/60">
                  <X className="size-4" />
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {WHATSAPP_NUMBERS.map((num) => (
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

// ------- Track My Order -------
function TrackMyOrder() {
  const nav = useNavigate();
  const [orderId, setOrderId] = useState("");
  const [email, setEmail] = useState("");

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderId.trim()) { toast.error("Enter your Order ID"); return; }
    try {
      sessionStorage.setItem("fom_track_prefill", JSON.stringify({ orderId: orderId.trim(), email: email.trim() }));
    } catch { /* ignore */ }
    nav({ to: "/track" });
  };

  return (
    <section className="relative rounded-3xl border border-orange-400/20 bg-gradient-to-br from-orange-500/[0.1] to-white/[0.02] backdrop-blur-xl overflow-hidden">
      <div aria-hidden className="absolute -top-24 -right-16 size-64 rounded-full blur-3xl opacity-40"
        style={{ background: "radial-gradient(closest-side, rgba(255,122,0,0.5), transparent 70%)" }} />
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="size-12 rounded-2xl grid place-items-center bg-gradient-to-br from-orange-500 to-amber-500 text-white shadow-lg shadow-orange-500/30 text-2xl">
            📦
          </div>
          <div>
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">Tracking</p>
            <h3 className="font-display font-semibold text-lg leading-tight">Track My Order</h3>
          </div>
        </div>
        <form onSubmit={submit} className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-3">
          <input value={orderId} onChange={(e) => setOrderId(e.target.value)} placeholder="Order ID"
            className="h-12 rounded-2xl bg-white/[0.05] border border-white/10 px-4 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 focus:bg-white/[0.08] transition" />
          <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Email address"
            className="h-12 rounded-2xl bg-white/[0.05] border border-white/10 px-4 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 focus:bg-white/[0.08] transition" />
          <button type="submit"
            className="sm:col-span-2 h-12 rounded-2xl grid place-items-center bg-gradient-to-r from-orange-500 to-amber-500 text-white font-semibold text-sm shadow-lg shadow-orange-500/25 active:scale-[0.99] transition">
            <span className="inline-flex items-center gap-2"><Package className="size-4" /> Track</span>
          </button>
        </form>
      </div>
    </section>
  );
}

// ------- Create Ticket -------
function CreateTicket() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [category, setCategory] = useState<string>("order");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [email, setEmail] = useState("");
  const [saving, setSaving] = useState(false);
  const [ticketId, setTicketId] = useState<string | null>(null);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!subject.trim()) { toast.error("Add a subject"); return; }
    if (!body.trim()) { toast.error("Describe your issue"); return; }
    setSaving(true);
    const displayId = genTicketId();
    try {
      if (user) {
        const { data: t, error } = await supabase
          .from("support_tickets")
          .insert({ user_id: user.id, subject: `[${displayId}] ${subject.trim()}`, category })
          .select("id")
          .single();
        if (!error && t) {
          await supabase.from("support_messages").insert({
            ticket_id: t.id, sender_id: user.id, sender_role: "customer", body: body.trim(), attachments: [],
          });
        }
      }
      setTicketId(displayId);
      toast.success("Ticket created", { description: displayId });
    } catch {
      setTicketId(displayId);
    } finally {
      setSaving(false);
    }
  };

  const reset = () => {
    setTicketId(null); setSubject(""); setBody(""); setEmail(""); setCategory("order"); setOpen(false);
  };

  return (
    <section className="relative rounded-3xl border border-white/10 bg-white/[0.03] backdrop-blur-xl overflow-hidden">
      <div className="relative p-5 sm:p-6">
        <div className="flex items-center gap-3">
          <div className="size-11 rounded-2xl grid place-items-center bg-white/[0.05] border border-white/10">
            <Ticket className="size-5 text-orange-300" />
          </div>
          <div className="flex-1">
            <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">Support tickets</p>
            <h3 className="font-display font-semibold text-lg leading-tight">Create a support ticket</h3>
          </div>
          {!open && !ticketId && (
            <button onClick={() => setOpen(true)}
              className="h-9 px-4 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-xs font-semibold shadow-lg shadow-orange-500/25 active:scale-95 transition">
              New ticket
            </button>
          )}
        </div>

        <AnimatePresence mode="wait">
          {ticketId ? (
            <motion.div key="done" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}
              className="mt-4 rounded-2xl border border-emerald-400/20 bg-emerald-500/[0.06] p-5 text-center">
              <Check className="size-7 text-emerald-400 mx-auto" />
              <p className="mt-2 text-sm font-medium">Ticket created successfully</p>
              <p className="mt-1 text-xs text-white/60">Your reference ID</p>
              <p className="mt-1 font-mono text-lg tracking-wider text-orange-300">{ticketId}</p>
              <p className="mt-2 text-[11px] text-white/50">We'll reply to you shortly. Keep this ID for reference.</p>
              <button onClick={reset} className="mt-4 text-xs px-4 py-2 rounded-full bg-white/10 hover:bg-white/20 transition">Create another</button>
            </motion.div>
          ) : open ? (
            <motion.form key="form" onSubmit={submit} initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }} exit={{ opacity: 0, height: 0 }}
              className="mt-4 space-y-3 overflow-hidden">
              <div className="flex flex-wrap gap-2">
                {TICKET_CATEGORIES.map((c) => (
                  <button key={c.id} type="button" onClick={() => setCategory(c.id)}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs border transition ${
                      category === c.id
                        ? "bg-gradient-to-r from-orange-500 to-amber-500 text-white border-transparent"
                        : "bg-white/[0.03] text-white/70 border-white/10 hover:bg-white/[0.08]"
                    }`}>
                    <c.icon className="size-3.5" /> {c.label}
                  </button>
                ))}
              </div>
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Subject"
                className="w-full h-12 rounded-2xl bg-white/[0.05] border border-white/10 px-4 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 transition" />
              {!user && (
                <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" placeholder="Your email"
                  className="w-full h-12 rounded-2xl bg-white/[0.05] border border-white/10 px-4 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 transition" />
              )}
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} maxLength={4000} placeholder="Describe your issue…"
                className="w-full rounded-2xl bg-white/[0.05] border border-white/10 px-4 py-3 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 resize-none transition" />
              <div className="flex gap-2">
                <button type="button" onClick={() => setOpen(false)} className="flex-1 h-11 rounded-2xl border border-white/10 text-sm text-white/70 hover:bg-white/5 transition">Cancel</button>
                <button type="submit" disabled={saving}
                  className="flex-1 h-11 rounded-2xl grid place-items-center bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold disabled:opacity-50 active:scale-[0.99] transition">
                  {saving ? <Loader2 className="size-4 animate-spin" /> : <span className="inline-flex items-center gap-2"><Send className="size-4" /> Submit</span>}
                </button>
              </div>
            </motion.form>
          ) : (
            <motion.p key="hint" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
              className="mt-3 text-xs text-white/55">
              Can't find an answer? Open a ticket and our team will follow up — you'll get a tracking ID like <span className="font-mono text-orange-300">FOM-2026-XXXXX</span>.
            </motion.p>
          )}
        </AnimatePresence>
      </div>
    </section>
  );
}

// ------- AI Assistant -------
type ChatMsg = { role: "user" | "ai"; text: string };

function aiAnswer(input: string): string {
  const q = input.toLowerCase();
  if (/track|where.*order|shipment|delivery/.test(q)) return "You can live-track your order from Account → Orders, the Track My Order card above, or the Tracking page.";
  if (/return|exchange/.test(q)) return "Eligible items can be returned within 4 days of delivery. Head to the Return Eligibility Center and I'll verify your order instantly.";
  if (/refund/.test(q)) return "Refunds are issued to your original payment method within 5–10 business days after we receive the return.";
  if (/warranty|broken|defect/.test(q)) return "Most electronics include a 12-month manufacturer warranty. I can route you to a warranty claim in one tap.";
  if (/cancel/.test(q)) return "Orders can be cancelled before they are packed. Open the order and tap 'Cancel'.";
  if (/payment|card|pay/.test(q)) return "We accept all major cards, Apple Pay, Google Pay, UPI and select BNPL providers. Payments are PCI-compliant.";
  if (/seller|contact/.test(q)) return "Open your order and tap 'Message Seller'. Verified sellers reply within 24h on average.";
  return "I can help with orders, returns, refunds, shipping, warranties and seller issues. Try: 'where is my order?' or 'how do refunds work?'";
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
  const [open, setOpen] = useState<string | null>(FAQS[0].q);
  const [faqQuery, setFaqQuery] = useState("");
  const [expandAll, setExpandAll] = useState(false);
  const [recent, setRecent] = useState<string[]>([]);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => { const t = setTimeout(() => setLoaded(true), 350); return () => clearTimeout(t); }, []);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(RECENT_FAQ_KEY);
      if (raw) setRecent(JSON.parse(raw));
    } catch { /* ignore */ }
  }, []);

  const recordRecent = (q: string) => {
    setRecent((prev) => {
      const next = [q, ...prev.filter((x) => x !== q)].slice(0, 4);
      try { localStorage.setItem(RECENT_FAQ_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  };

  const openFaq = (q: string) => {
    setOpen((cur) => (cur === q ? null : q));
    recordRecent(q);
  };

  const filtered = useMemo(() => {
    let list = activeCat === "All" ? FAQS : FAQS.filter((f) => f.cat === activeCat);
    if (faqQuery.trim()) {
      const l = faqQuery.toLowerCase();
      list = list.filter((f) => f.q.toLowerCase().includes(l) || f.a.toLowerCase().includes(l));
    }
    return list;
  }, [activeCat, faqQuery]);

  return (
    <div className="relative min-h-screen text-white" style={{ backgroundColor: "#050816" }}>
      <Atmosphere />

      <div className="relative container-page py-10 sm:py-14 max-w-5xl space-y-10">
        {/* STATUS BANNER */}
        <StatusBanner />

        {/* HERO */}
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5 }}
          className="text-center">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full border border-white/10 bg-white/[0.04] backdrop-blur-xl">
            <LifeBuoy className="size-3.5 text-orange-300" />
            <span className="text-[10px] font-mono uppercase tracking-[0.3em] text-white/70">Support</span>
          </div>
          <h1 className="mt-4 text-fluid-3xl font-display font-semibold tracking-tight">
            Help <span className="bg-gradient-to-r from-orange-400 to-amber-300 bg-clip-text text-transparent">Center</span>
          </h1>
          <p className="mt-3 text-sm sm:text-base text-white/60 max-w-xl mx-auto">
            Live chat, WhatsApp, order tracking and tickets — enterprise-grade support whenever you need it.
          </p>
          <div className="mt-5">
            <SmartSearch onPick={(q) => { setFaqQuery(""); setActiveCat("All"); setOpen(q); recordRecent(q); document.getElementById("faqs")?.scrollIntoView({ behavior: "smooth" }); }} />
          </div>
        </motion.div>

        {/* SUPPORT CONTACTS */}
        <div>
          <SectionHeader eyebrow="Contact us" title="Premium support, your way" />
          <div className="mt-4">
            <SupportContacts />
          </div>
        </div>

        {/* QUICK ACTIONS */}
        <div>
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

        {/* TRACK MY ORDER */}
        <TrackMyOrder />

        {/* SUPPORT TICKETS */}
        <CreateTicket />

        {/* AI ASSISTANT */}
        <div>
          <SectionHeader eyebrow="AI Assistant" title="Powered by smart routing" />
          <div className="mt-4">
            <AIAssistant />
          </div>
        </div>

        {/* FAQ */}
        <div id="faqs">
          <SectionHeader eyebrow="FAQs" title="Frequently asked questions" />

          {/* Popular */}
          <div className="mt-4 flex flex-wrap gap-2">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-orange-300">
              <Flame className="size-3.5" /> Popular
            </span>
            {POPULAR_QUESTIONS.map((q) => (
              <button key={q} onClick={() => { setActiveCat("All"); setFaqQuery(""); setOpen(q); recordRecent(q); }}
                className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.05] border border-white/10 hover:bg-white/[0.1] text-white/75 transition">
                {q}
              </button>
            ))}
          </div>

          {/* Recently viewed */}
          {recent.length > 0 && (
            <div className="mt-3 flex flex-wrap gap-2">
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-white/40">
                <History className="size-3.5" /> Recently viewed
              </span>
              {recent.map((q) => (
                <button key={q} onClick={() => { setActiveCat("All"); setFaqQuery(""); setOpen(q); }}
                  className="text-[11px] px-2.5 py-1 rounded-full bg-white/[0.03] border border-white/10 hover:bg-white/[0.08] text-white/60 transition">
                  {q}
                </button>
              ))}
            </div>
          )}

          {/* FAQ search + expand all */}
          <div className="mt-4 flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 size-4 text-white/40" />
              <input value={faqQuery} onChange={(e) => setFaqQuery(e.target.value)} placeholder="Search FAQs…"
                className="w-full h-11 rounded-2xl bg-white/[0.04] border border-white/10 pl-10 pr-4 text-sm placeholder:text-white/40 focus:outline-none focus:border-orange-400/60 transition" />
            </div>
            <button onClick={() => setExpandAll((v) => !v)}
              className="h-11 px-4 rounded-2xl border border-white/10 bg-white/[0.04] text-sm text-white/75 hover:bg-white/[0.08] inline-flex items-center justify-center gap-2 transition">
              <ChevronsDownUp className="size-4" /> {expandAll ? "Collapse all" : "Expand all"}
            </button>
          </div>

          {/* Category chips */}
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
              {filtered.map((f) => {
                const isOpen = expandAll || open === f.q;
                return (
                  <div key={`${f.cat}-${f.q}`}>
                    <button onClick={() => openFaq(f.q)}
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
                  </div>
                );
              })}
              {filtered.length === 0 && (
                <p className="p-6 text-center text-sm text-white/50">No matching questions. Try the AI Assistant above.</p>
              )}
            </div>
          )}
        </div>

        {/* PERSONALIZED */}
        {user && (
          <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }}
            className="rounded-2xl border border-orange-400/20 bg-gradient-to-br from-orange-500/[0.08] to-transparent p-5 backdrop-blur-xl">
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

        {/* TRUST */}
        <div className="flex flex-wrap items-center justify-center gap-2">
          {TRUST.map((t) => (
            <div key={t.label} className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-[11px] text-white/70">
              <t.icon className="size-3.5 text-orange-300" />
              <span>{t.label}</span>
            </div>
          ))}
        </div>

        <p className="text-center text-[10px] font-mono uppercase tracking-[0.3em] text-white/30">
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
