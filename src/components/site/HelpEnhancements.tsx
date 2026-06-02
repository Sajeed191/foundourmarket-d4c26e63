import { useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { motion, AnimatePresence } from "framer-motion";
import {
  ShieldCheck, Clock, Star, CheckCircle2, BadgeCheck,
  Package, XCircle, CreditCard, RotateCcw, MapPin, PackageX, AlertTriangle,
  ChevronDown, Truck, Lock, Globe, Wrench, HelpCircle, Headphones,
  ArrowRight, Ticket, ShieldHalf, FileText,
} from "lucide-react";

const card = "rounded-2xl border border-white/10 bg-white/[0.03] backdrop-blur-xl";

/* ---------------- Section 1 — Trust header mini cards ---------------- */
const TRUST_STATS = [
  { icon: Clock, value: "< 30 min", label: "Avg response" },
  { icon: Headphones, value: "24/7", label: "Availability" },
  { icon: Star, value: "98.6%", label: "Satisfaction" },
  { icon: CheckCircle2, value: "12,400+", label: "Resolved this month" },
  { icon: BadgeCheck, value: "Verified", label: "Support team" },
];

export function TrustHeaderCards() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-2.5">
      {TRUST_STATS.map((s, i) => (
        <motion.div
          key={s.label}
          initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: i * 0.05 }}
          className={`${card} relative overflow-hidden p-3.5`}
        >
          <div aria-hidden className="absolute -top-8 -right-8 size-20 rounded-full blur-2xl opacity-30"
            style={{ background: "radial-gradient(closest-side,#FF7A00,transparent)" }} />
          <s.icon className="relative size-4 text-orange-300" />
          <p className="relative mt-2 text-base font-display font-semibold leading-none">{s.value}</p>
          <p className="relative mt-1 text-[10px] uppercase tracking-wider text-white/50">{s.label}</p>
        </motion.div>
      ))}
    </div>
  );
}

/* ---------------- Section 2 — Contact method detail strip ---------------- */
const CONTACT_DETAILS = [
  { icon: Clock, color: "#22c55e", title: "Live Chat", rows: ["Status: Online now", "Estimated wait: under 2 min"] },
  { icon: Truck, color: "#25D366", title: "WhatsApp", rows: ["Hours: 8am–11pm IST", "Code: +91 · replies in 5–30 min"] },
  { icon: FileText, color: "#FF7A00", title: "Email", rows: ["Typical response: under 6 hours", "Priority escalation available"] },
];

export function ContactDetailStrip() {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
      {CONTACT_DETAILS.map((c) => (
        <div key={c.title} className={`${card} p-3.5 group hover:border-white/20 transition`}>
          <div className="flex items-center gap-2">
            <c.icon className="size-3.5" style={{ color: c.color }} />
            <p className="text-xs font-medium">{c.title}</p>
          </div>
          <ul className="mt-2 space-y-1">
            {c.rows.map((r) => (
              <li key={r} className="text-[11px] text-white/55 flex items-center gap-1.5">
                <span className="size-1 rounded-full" style={{ background: c.color }} /> {r}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
}

/* ---------------- Section 3 — Ticket status overview ---------------- */
const TICKET_STATUS = [
  { label: "Open", count: 2, color: "#3b82f6", bg: "rgba(59,130,246,0.12)" },
  { label: "Pending", count: 1, color: "#f59e0b", bg: "rgba(245,158,11,0.12)" },
  { label: "Resolved", count: 7, color: "#22c55e", bg: "rgba(34,197,94,0.12)" },
  { label: "Closed", count: 4, color: "#94a3b8", bg: "rgba(148,163,184,0.12)" },
];

const SAMPLE_TICKETS = [
  { id: "FOM-2026-48213", created: "May 28", updated: "2h ago", status: "Open", color: "#3b82f6" },
  { id: "FOM-2026-47190", created: "May 24", updated: "1d ago", status: "Pending", color: "#f59e0b" },
  { id: "FOM-2026-45872", created: "May 19", updated: "May 21", status: "Resolved", color: "#22c55e" },
];

export function TicketStatusOverview() {
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        {TICKET_STATUS.map((t) => (
          <div key={t.label} className={`${card} p-3.5`}>
            <div className="flex items-center justify-between">
              <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full"
                style={{ color: t.color, background: t.bg }}>{t.label}</span>
            </div>
            <p className="mt-2 text-2xl font-display font-semibold leading-none">{t.count}</p>
            <p className="mt-1 text-[10px] text-white/45">tickets</p>
          </div>
        ))}
      </div>
      <div className={`${card} divide-y divide-white/5 overflow-hidden`}>
        {SAMPLE_TICKETS.map((t) => (
          <div key={t.id} className="flex items-center gap-3 px-4 py-3">
            <Ticket className="size-4 text-orange-300 shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="font-mono text-xs text-white/85 truncate">{t.id}</p>
              <p className="text-[10px] text-white/45">Created {t.created} · Updated {t.updated}</p>
            </div>
            <span className="text-[10px] font-mono uppercase tracking-widest px-2 py-0.5 rounded-full shrink-0"
              style={{ color: t.color, background: `${t.color}1f` }}>{t.status}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

/* ---------------- Section 4 — Order help quick actions ---------------- */
const ORDER_ACTIONS = [
  { icon: Package, label: "Track Order", to: "/track" },
  { icon: XCircle, label: "Cancel Order", to: "/account/orders" },
  { icon: CreditCard, label: "Request Refund", to: "/returns" },
  { icon: RotateCcw, label: "Return Item", to: "/returns" },
  { icon: MapPin, label: "Change Address", to: "/account" },
  { icon: PackageX, label: "Missing Package", to: "/track" },
  { icon: AlertTriangle, label: "Damaged Product", to: "/returns" },
];

export function OrderHelpCenter() {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
      {ORDER_ACTIONS.map((a) => (
        <Link key={a.label} to={a.to}
          className={`${card} group relative overflow-hidden p-4 flex flex-col gap-3 hover:border-orange-400/40 transition`}>
          <div aria-hidden className="absolute inset-0 bg-gradient-to-br from-orange-500/10 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />
          <a.icon className="relative size-5 text-orange-300" />
          <p className="relative text-xs font-medium leading-tight">{a.label}</p>
        </Link>
      ))}
    </div>
  );
}

/* ---------------- Section 5 — Knowledge base ---------------- */
const KB = [
  { icon: Package, title: "Orders & Tracking", faqs: ["How do I track my order?", "Can I change my order after placing it?", "Why is my tracking not updating?"] },
  { icon: CreditCard, title: "Payments & Billing", faqs: ["What payment methods are accepted?", "Why was my payment declined?", "How do I get an invoice?"] },
  { icon: RotateCcw, title: "Returns & Refunds", faqs: ["How long do refunds take?", "How do I start a return?", "What items are non-returnable?"] },
  { icon: Truck, title: "Shipping Information", faqs: ["How long does delivery take?", "Do you ship internationally?", "What are the shipping costs?"] },
  { icon: Lock, title: "Account & Security", faqs: ["How do I reset my password?", "Is my data secure?", "How do I delete my account?"] },
  { icon: HelpCircle, title: "Product Questions", faqs: ["Are products authentic?", "How do I check sizing?", "Can I ask the seller a question?"] },
  { icon: Wrench, title: "Warranty & Protection", faqs: ["What does warranty cover?", "How do I file a warranty claim?", "Is buyer protection automatic?"] },
  { icon: Globe, title: "International Orders", faqs: ["Are there customs fees?", "Which countries do you ship to?", "How is currency handled?"] },
];

export function KnowledgeBase() {
  const [open, setOpen] = useState<string | null>(null);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
      {KB.map((k) => {
        const on = open === k.title;
        return (
          <div key={k.title} className={`${card} overflow-hidden`}>
            <button onClick={() => setOpen(on ? null : k.title)}
              className="w-full flex items-center gap-3 px-4 py-3.5 text-left hover:bg-white/[0.04] transition">
              <div className="size-9 rounded-xl grid place-items-center bg-orange-500/10 border border-orange-400/20 shrink-0">
                <k.icon className="size-4 text-orange-300" />
              </div>
              <span className="flex-1 text-sm font-medium">{k.title}</span>
              <ChevronDown className={`size-4 text-white/50 transition-transform ${on ? "rotate-180" : ""}`} />
            </button>
            <AnimatePresence initial={false}>
              {on && (
                <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: "auto", opacity: 1 }} exit={{ height: 0, opacity: 0 }}
                  transition={{ duration: 0.2 }} className="overflow-hidden">
                  <ul className="px-4 pb-3.5 space-y-2">
                    {k.faqs.map((f) => (
                      <li key={f}>
                        <Link to="/help" className="text-xs text-white/60 hover:text-orange-300 flex items-center gap-2 transition">
                          <ArrowRight className="size-3 shrink-0" /> {f}
                        </Link>
                      </li>
                    ))}
                  </ul>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        );
      })}
    </div>
  );
}

/* ---------------- Section 7 — Stripe trust block ---------------- */
const TRUST_POINTS = [
  { icon: Lock, label: "Secure Payments" },
  { icon: ShieldCheck, label: "SSL Encrypted Checkout" },
  { icon: ShieldHalf, label: "Buyer Protection" },
  { icon: BadgeCheck, label: "Verified Suppliers" },
  { icon: CreditCard, label: "Secure Refund Policy" },
  { icon: Globe, label: "International Shipping" },
  { icon: Headphones, label: "24/7 Customer Support" },
];

export function StripeTrustSection() {
  return (
    <div className={`${card} relative overflow-hidden p-5 sm:p-7`}>
      <div aria-hidden className="absolute -top-20 -right-20 size-56 rounded-full blur-3xl opacity-20"
        style={{ background: "radial-gradient(closest-side,#FF7A00,transparent)" }} />
      <div className="relative">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-orange-300">Why shop with us</p>
        <h3 className="mt-1 font-display font-semibold text-lg sm:text-xl">Why Shop With FoundOurMarket™</h3>
        <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          {TRUST_POINTS.map((p) => (
            <div key={p.label} className="flex items-center gap-3 rounded-xl border border-white/10 bg-white/[0.02] px-3.5 py-2.5">
              <div className="size-8 rounded-lg grid place-items-center bg-emerald-500/10 border border-emerald-400/20 shrink-0">
                <p.icon className="size-4 text-emerald-400" />
              </div>
              <span className="text-sm text-white/85">{p.label}</span>
              <CheckCircle2 className="size-4 text-emerald-400 ml-auto shrink-0" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ---------------- Section 8 — Dispute prevention ---------------- */
export function DisputePrevention({ onResolve }: { onResolve: () => void }) {
  return (
    <div className="rounded-2xl border border-orange-400/25 bg-gradient-to-br from-orange-500/[0.1] to-transparent backdrop-blur-xl p-5 sm:p-6">
      <div className="flex items-start gap-4">
        <div className="size-11 rounded-2xl grid place-items-center bg-orange-500/15 border border-orange-400/30 shrink-0">
          <ShieldCheck className="size-5 text-orange-300" />
        </div>
        <div className="flex-1">
          <h3 className="font-display font-semibold text-base sm:text-lg">Need Help Before Filing a Dispute?</h3>
          <p className="mt-1 text-sm text-white/65">
            Contact our support team first — most issues are resolved within <span className="text-orange-300 font-medium">24–48 hours</span> without needing a dispute.
          </p>
          <button onClick={onResolve}
            className="mt-4 inline-flex items-center gap-2 h-10 px-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold shadow-lg shadow-orange-500/25 active:scale-95 transition">
            Resolve My Issue <ArrowRight className="size-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

/* ---------------- Section 9 — Footer help links ---------------- */
const FOOTER_LINKS = [
  { label: "Privacy Policy", to: "/privacy" },
  { label: "Terms & Conditions", to: "/terms" },
  { label: "Shipping Policy", to: "/pages/shipping" },
  { label: "Refund Policy", to: "/returns" },
  { label: "Return Policy", to: "/returns" },
  { label: "Buyer Protection", to: "/buyer-protection" },
  { label: "Contact Us", to: "/contact" },
  { label: "About Us", to: "/about" },
  { label: "Track Order", to: "/track" },
];

export function FooterHelpLinks() {
  return (
    <div className="flex flex-wrap items-center justify-center gap-x-2 gap-y-2">
      {FOOTER_LINKS.map((l) => (
        <Link key={l.label} to={l.to}
          className="text-xs px-3 py-1.5 rounded-full border border-white/10 bg-white/[0.03] text-white/65 hover:text-orange-300 hover:border-orange-400/30 transition">
          {l.label}
        </Link>
      ))}
    </div>
  );
}

/* ---------------- Section 10 — Sticky help button ---------------- */
export function StickyHelpButton({ onClick }: { onClick: () => void }) {
  return (
    <button onClick={onClick}
      className="sm:hidden fixed bottom-24 right-4 z-40 inline-flex items-center gap-2 h-12 px-5 rounded-full bg-gradient-to-r from-orange-500 to-amber-500 text-white text-sm font-semibold shadow-xl shadow-orange-500/30 active:scale-95 transition"
      style={{ paddingBottom: "env(safe-area-inset-bottom)" }}>
      <Headphones className="size-4" /> Help
    </button>
  );
}
