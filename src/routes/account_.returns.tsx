import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  ArrowLeft,
  Package,
  Sparkles,
  ShieldCheck,
  Clock,
  BadgeCheck,
  MessageCircle,
  FileText,
  LifeBuoy,
  Mail,
  ChevronRight,
  CheckCircle2,
  XCircle,
  Hourglass,
  Copy,
  ExternalLink,
  Check,
  ShieldCheck as ShieldCheckIcon,
  Loader2 as Spinner,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";

const SUPPORT_EMAIL = "support@foundourmarket.com";
const SUPPORT_CC = "returns@foundourmarket.com";
const SUPPORT_SUBJECT = "Refund Support Request - FoundOurMarket";
const SUPPORT_BODY = `Hello FoundOurMarket Support,

I need help regarding a refund request.

Order ID:
Issue:
Details:

Thank you.`;

function buildMailto() {
  const params = new URLSearchParams({
    cc: SUPPORT_CC,
    subject: SUPPORT_SUBJECT,
    body: SUPPORT_BODY,
  });
  return `mailto:${SUPPORT_EMAIL}?${params.toString()}`;
}

function buildGmailUrl() {
  const params = new URLSearchParams({
    view: "cm",
    fs: "1",
    to: SUPPORT_EMAIL,
    cc: SUPPORT_CC,
    su: SUPPORT_SUBJECT,
    body: SUPPORT_BODY,
  });
  return `https://mail.google.com/mail/?${params.toString()}`;
}

function hapticTap() {
  try {
    if (typeof navigator !== "undefined" && "vibrate" in navigator) {
      navigator.vibrate?.(8);
    }
  } catch {}
}

const searchSchema = z.object({ order: z.string().optional() });

export const Route = createFileRoute("/account_/returns")({
  head: () => ({
    meta: [
      { title: "Refund Status — FoundOurMarket™" },
      { name: "description", content: "Track refund requests, monitor review progress, and manage returns." },
    ],
  }),
  validateSearch: searchSchema,
  component: ReturnsPage,
});

type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  reason: string;
  refund_amount: number;
  refund_status: string;
  created_at: string;
};

type OrderItem = { id: string; name: string; product_slug: string; quantity: number; unit_price: number };
type OrderForReturn = { id: string; order_items: OrderItem[] };

type FilterKey = "all" | "processing" | "approved" | "refunded" | "rejected";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "processing", label: "Processing" },
  { key: "approved", label: "Approved" },
  { key: "refunded", label: "Refunded" },
  { key: "rejected", label: "Rejected" },
];

function matchFilter(r: ReturnRow, f: FilterKey): boolean {
  if (f === "all") return true;
  const s = `${r.status} ${r.refund_status}`.toLowerCase();
  if (f === "processing") return /requested|pending|review|processing/.test(s);
  if (f === "approved") return /approved/.test(s);
  if (f === "refunded") return /refunded|completed|paid/.test(s);
  if (f === "rejected") return /rejected|denied|cancel/.test(s);
  return true;
}

function statusTone(s: string): string {
  const v = s.toLowerCase();
  if (/refunded|completed|paid/.test(v)) return "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20";
  if (/approved/.test(v)) return "text-sky-400 bg-sky-400/10 ring-sky-400/20";
  if (/rejected|denied|cancel/.test(v)) return "text-rose-400 bg-rose-400/10 ring-rose-400/20";
  return "text-[#FF9F43] bg-[#FF7A00]/10 ring-[#FF7A00]/25";
}

function ReturnsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { order } = useSearch({ from: "/account_/returns" });
  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [eligibleOrder, setEligibleOrder] = useState<OrderForReturn | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [scrolled, setScrolled] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  function openEmailSupport() {
    hapticTap();
    setEmailOpen(true);
  }

  async function copySupportEmail() {
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      toast.success("Support email copied");
    } catch {
      toast.error("Could not copy");
    }
  }

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 8);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    if (!user) return;
    supabase
      .from("returns")
      .select("id,order_id,status,reason,refund_amount,refund_status,created_at")
      .order("created_at", { ascending: false })
      .then(({ data }) => setReturns((data as ReturnRow[]) ?? []));
  }, [user]);

  useEffect(() => {
    if (!user || !order) { setEligibleOrder(null); return; }
    supabase
      .from("orders")
      .select("id,order_items(id,name,product_slug,quantity,unit_price)")
      .eq("id", order)
      .maybeSingle()
      .then(({ data }) => setEligibleOrder((data as OrderForReturn) ?? null));
  }, [user, order]);

  const filtered = useMemo(() => (returns ?? []).filter((r) => matchFilter(r, filter)), [returns, filter]);
  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: 0, processing: 0, approved: 0, refunded: 0, rejected: 0 };
    (returns ?? []).forEach((r) => {
      c.all++;
      FILTERS.forEach((f) => { if (f.key !== "all" && matchFilter(r, f.key)) c[f.key]++; });
    });
    return c;
  }, [returns]);

  async function submit() {
    if (!user || !eligibleOrder) return;
    const items = Object.entries(qty).filter(([, q]) => q > 0);
    if (items.length === 0) { toast.error("Pick at least one item"); return; }
    if (!reason.trim()) { toast.error("Reason required"); return; }
    setSubmitting(true);
    const refund = items.reduce((sum, [iid, q]) => {
      const it = eligibleOrder.order_items.find((x) => x.id === iid);
      return sum + (it ? Number(it.unit_price) * q : 0);
    }, 0);
    const { data: r, error } = await supabase.from("returns").insert({
      order_id: eligibleOrder.id, user_id: user.id, reason, notes: notes || null, refund_amount: refund,
    }).select("id").single();
    if (error || !r) { setSubmitting(false); toast.error(error?.message ?? "Failed"); return; }
    const rows = items.map(([iid, q]) => {
      const it = eligibleOrder.order_items.find((x) => x.id === iid)!;
      return { return_id: r.id, order_item_id: iid, product_slug: it.product_slug, quantity: q };
    });
    await supabase.from("return_items").insert(rows);
    setSubmitting(false);
    toast.success("Refund request submitted");
    nav({ to: "/account/returns" });
  }

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center bg-[#050816]">
        <Loader2 className="size-5 animate-spin text-[#FF7A00]" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050816] text-white relative overflow-hidden">
      {/* Cinematic ambient atmosphere */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-0">
        <div className="absolute -top-40 -left-32 size-[420px] rounded-full blur-3xl opacity-[0.18]"
          style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)" }} />
        <div className="absolute top-1/3 -right-32 size-[360px] rounded-full blur-3xl opacity-[0.12]"
          style={{ background: "radial-gradient(circle, #FF9F43 0%, transparent 70%)" }} />
      </div>

      {/* Sticky collapsible glass header */}
      <header
        className={cn(
          "sticky top-0 z-30 transition-all duration-300 backdrop-blur-xl",
          scrolled
            ? "bg-[#050816]/80 border-b border-white/[0.06] shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)]"
            : "bg-transparent border-b border-transparent"
        )}
        style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
      >
        <div className="max-w-3xl mx-auto px-4 sm:px-6 h-12 flex items-center gap-3">
          <Link
            to="/account"
            className="size-9 -ml-2 grid place-items-center rounded-full hover:bg-white/5 transition-colors text-white/80 hover:text-white"
            aria-label="Back to account"
          >
            <ArrowLeft className="size-4" />
          </Link>
          <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-white/40">Support</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.24em] text-[#FF9F43]">
            Refunds
          </span>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-6 pb-32">
        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="pt-2 pb-6"
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-[#FF9F43] mb-3">
            Account · Support
          </p>
          <h1 className="text-[28px] sm:text-[34px] leading-[1.05] font-display font-semibold tracking-tight">
            Refund Status
          </h1>
          <p className="mt-3 text-sm text-white/65 max-w-md leading-relaxed">
            Track refund requests and monitor review progress.
          </p>
          <p className="mt-1.5 text-xs text-white/40 max-w-md leading-relaxed">
            Refund reviews are completed within approximately 2 business days.
          </p>
        </motion.section>

        {/* AI REFUND ASSISTANT */}
        <motion.section
          initial={{ opacity: 0, y: 16 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.55, delay: 0.08, ease: [0.22, 1, 0.36, 1] }}
          className="relative rounded-2xl overflow-hidden ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-5"
        >
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A00]/70 to-transparent" />
          <div aria-hidden className="absolute -top-16 -right-10 size-40 rounded-full blur-3xl opacity-30"
            style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)" }} />
          <div className="flex items-start gap-3 relative">
            <div className="size-9 grid place-items-center rounded-xl bg-[#FF7A00]/15 ring-1 ring-[#FF7A00]/30 text-[#FF9F43] shrink-0">
              <Sparkles className="size-4" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2">
                <h2 className="text-sm font-semibold">Refund Assistant</h2>
                <span className="inline-flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-emerald-400/90">
                  <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" /> Live
                </span>
              </div>
              <ul className="mt-3 space-y-1.5 text-[12.5px] text-white/70 leading-relaxed">
                <li className="flex gap-2"><span className="text-[#FF9F43]">•</span> Average review time: 2 business days</li>
                <li className="flex gap-2"><span className="text-[#FF9F43]">•</span> Refund updates happen automatically</li>
                <li className="flex gap-2"><span className="text-[#FF9F43]">•</span> Seller approval may be required for selected products</li>
                <li className="flex gap-2"><span className="text-[#FF9F43]">•</span> Refund eligibility depends on delivery status</li>
              </ul>
            </div>
          </div>
        </motion.section>

        {/* ELIGIBLE ORDER FORM (if redirected from order) */}
        <AnimatePresence>
          {eligibleOrder && (
            <motion.section
              initial={{ opacity: 0, y: 14 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.4 }}
              className="mt-5 rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-5"
            >
              <h2 className="text-sm font-semibold mb-4">
                Request refund · Order #{eligibleOrder.id.slice(0, 8)}
              </h2>
              <div className="space-y-3 mb-4">
                {eligibleOrder.order_items.map((it) => (
                  <div key={it.id} className="flex items-center gap-3">
                    <div className="flex-1 min-w-0">
                      <p className="text-sm truncate">{it.name}</p>
                      <p className="text-[11px] text-white/40 font-mono">Ordered: {it.quantity}</p>
                    </div>
                    <input
                      type="number" min={0} max={it.quantity} value={qty[it.id] ?? 0}
                      onChange={(e) => setQty((p) => ({ ...p, [it.id]: Math.min(it.quantity, Math.max(0, Number(e.target.value))) }))}
                      className="w-20 bg-white/[0.04] border border-white/10 rounded-lg px-2 py-1.5 text-sm focus:outline-none focus:border-[#FF7A00]/60 focus:ring-2 focus:ring-[#FF7A00]/20 transition"
                    />
                  </div>
                ))}
              </div>
              <select
                value={reason} onChange={(e) => setReason(e.target.value)}
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF7A00]/60 mb-3 transition"
              >
                <option value="">Select reason…</option>
                <option value="Defective / damaged">Defective / damaged</option>
                <option value="Wrong item">Wrong item</option>
                <option value="Not as described">Not as described</option>
                <option value="No longer needed">No longer needed</option>
                <option value="Other">Other</option>
              </select>
              <textarea
                value={notes} onChange={(e) => setNotes(e.target.value)} rows={3}
                placeholder="Additional details (optional)"
                className="w-full bg-white/[0.04] border border-white/10 rounded-lg px-3 py-2.5 text-sm focus:outline-none focus:border-[#FF7A00]/60 mb-4 transition resize-none"
              />
              <motion.button
                whileTap={{ scale: 0.97 }}
                onClick={submit}
                disabled={submitting}
                className="w-full sm:w-auto bg-[#FF7A00] text-white rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 shadow-[0_8px_24px_-8px_#FF7A00] transition-all"
              >
                {submitting ? "Submitting…" : "Submit refund request"}
              </motion.button>
            </motion.section>
          )}
        </AnimatePresence>

        {/* FILTERS */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.16 }}
          className="mt-7"
        >
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/50">Your refunds</h2>
            {returns && returns.length > 0 && (
              <span className="text-[10px] font-mono text-white/40">{returns.length} total</span>
            )}
          </div>
          <div className="flex gap-2 overflow-x-auto -mx-4 px-4 sm:mx-0 sm:px-0 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {FILTERS.map((f) => {
              const count = counts[f.key];
              const active = filter === f.key;
              return (
                <motion.button
                  key={f.key}
                  whileTap={{ scale: 0.92 }}
                  transition={{ type: "spring", stiffness: 500, damping: 28 }}
                  onClick={() => { hapticTap(); setFilter(f.key); }}
                  aria-pressed={active}
                  className={cn(
                    "shrink-0 px-3.5 py-1.5 rounded-full text-[11px] font-medium tracking-wide transition-all ring-1 backdrop-blur-xl",
                    active
                      ? "bg-[#FF7A00] text-white ring-[#FF7A00] shadow-[0_6px_20px_-6px_#FF7A00,0_0_0_4px_rgba(255,122,0,0.12)] scale-[1.02]"
                      : "bg-white/[0.04] text-white/70 ring-white/[0.08] hover:text-white hover:bg-white/[0.07]"
                  )}
                >
                  {f.label}
                  {f.key !== "all" && (
                    <span className={cn("ml-1.5 text-[10px] tabular-nums", active ? "opacity-90" : "opacity-50")}>
                      {count}
                    </span>
                  )}
                </motion.button>
              );
            })}
          </div>
        </motion.section>

        {/* LIST or EMPTY */}
        <section className="mt-4">
          {returns === null ? (
            <div className="space-y-3">
              {[0, 1].map((i) => (
                <div key={i} className="h-24 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            (() => {
              const emptyMap: Record<FilterKey, { icon: typeof Package; title: string; sub: string }> = {
                all:       { icon: Package,      title: "No refund requests yet", sub: "Eligible products may be refunded within 4 days after successful delivery." },
                processing:{ icon: Hourglass,    title: "No refunds in review",   sub: "Submitted requests under review will appear here." },
                approved:  { icon: CheckCircle2, title: "No approved refunds yet",sub: "Approved refunds awaiting payout will show up here." },
                refunded:  { icon: BadgeCheck,   title: "No completed refunds",   sub: "Completed refunds will appear here once processed." },
                rejected:  { icon: XCircle,      title: "No rejected refund requests", sub: "Declined refund requests will appear here with reasons." },
              };
              const E = emptyMap[filter];
              const Icon = E.icon;
              return (
                <motion.div
                  key={filter}
                  initial={{ opacity: 0, y: 14 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -8 }}
                  transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
                  className="relative rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl px-6 py-10 sm:py-12 text-center overflow-hidden"
                >
                  <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A00]/50 to-transparent" />
                  <div aria-hidden className="absolute -bottom-20 left-1/2 -translate-x-1/2 size-64 rounded-full blur-3xl opacity-20"
                    style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)" }} />
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 18 }}
                    className="relative size-16 mx-auto mb-5 grid place-items-center rounded-2xl bg-[#FF7A00]/10 ring-1 ring-[#FF7A00]/25"
                  >
                    <Icon className="size-6 text-[#FF9F43]" />
                  </motion.div>
                  <p className="relative text-base font-semibold">{E.title}</p>
                  <p className="relative text-[13px] text-white/55 mt-1.5 max-w-sm mx-auto leading-relaxed">{E.sub}</p>
                  <div className="relative mt-6 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-center">
                    {filter !== "all" && (
                      <button
                        onClick={() => { hapticTap(); setFilter("all"); }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[11px] uppercase tracking-widest font-semibold text-white/80 hover:text-white ring-1 ring-white/10 hover:ring-white/25 bg-white/[0.03] transition"
                      >
                        Show all refunds
                      </button>
                    )}
                    <Link
                      to="/account/orders"
                      className="inline-flex items-center justify-center gap-1.5 bg-[#FF7A00] text-white rounded-full px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 shadow-[0_8px_20px_-8px_#FF7A00] transition-all"
                    >
                      View Eligible Orders <ChevronRight className="size-3.5" />
                    </Link>
                    <Link
                      to="/returns"
                      className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[11px] uppercase tracking-widest font-semibold text-white/60 hover:text-white transition"
                    >
                      Refund Policy
                    </Link>
                  </div>
                </motion.div>
              );
            })()
          ) : (
            <div className="space-y-2.5">
              {filtered.map((r, i) => (
                <motion.div
                  key={r.id}
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.35, delay: i * 0.04 }}
                  className="rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-4 sm:p-5 hover:ring-[#FF7A00]/30 hover:bg-white/[0.05] transition-all"
                >
                  <div className="flex items-start justify-between gap-3 flex-wrap">
                    <div className="min-w-0">
                      <p className="text-[10px] font-mono uppercase tracking-[0.22em] text-white/40">
                        Refund #{r.id.slice(0, 8)} · Order #{r.order_id.slice(0, 8)}
                      </p>
                      <p className="text-sm mt-1.5 text-white/90">{r.reason}</p>
                      <p className="text-[11px] text-white/40 mt-1 font-mono">
                        {new Date(r.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </p>
                    </div>
                    <div className="text-right shrink-0">
                      <span className={cn(
                        "text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-full ring-1",
                        statusTone(r.status)
                      )}>
                        {r.status}
                      </span>
                      <p className="font-mono text-sm mt-2 text-white">${Number(r.refund_amount).toFixed(2)}</p>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-0.5">
                        {r.refund_status}
                      </p>
                    </div>
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </section>

        {/* TRUST STRIP */}
        <motion.section
          initial={{ opacity: 0, y: 10 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="mt-8 grid grid-cols-3 gap-2"
        >
          {[
            { icon: ShieldCheck, label: "Secure Refund" },
            { icon: Clock, label: "2-Day Review" },
            { icon: BadgeCheck, label: "Buyer Protection" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl ring-1 ring-white/[0.06] bg-white/[0.02] py-3 px-2">
              <Icon className="size-3.5 text-[#FF9F43]" />
              <span className="text-[10px] font-medium text-white/65 text-center leading-tight">{label}</span>
            </div>
          ))}
        </motion.section>

        {/* QUICK SUPPORT */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="mt-6"
        >
          <h3 className="text-[11px] font-mono uppercase tracking-[0.24em] text-white/50 mb-3">Quick support</h3>
          <div className="grid grid-cols-2 gap-2.5">
            {([
              { kind: "link",   to: "/help",    icon: MessageCircle, label: "Chat Support", hint: "Live agent" },
              { kind: "link",   to: "/returns", icon: FileText,      label: "Refund Policy", hint: "Eligibility" },
              { kind: "link",   to: "/help",    icon: LifeBuoy,      label: "Help Center",   hint: "FAQs" },
              { kind: "email",  icon: Mail,     label: "Email Support", hint: SUPPORT_EMAIL.replace("@foundourmarket.com","@…") },
            ] as const).map((a) => {
              const inner = (
                <motion.div
                  whileTap={{ scale: 0.96 }}
                  whileHover={{ y: -1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                  className="group relative rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-3.5 hover:ring-[#FF7A00]/30 hover:bg-white/[0.05] transition-all overflow-hidden"
                >
                  <div aria-hidden className="pointer-events-none absolute -inset-px rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity"
                    style={{ background: "radial-gradient(120px 60px at var(--x,50%) 0%, rgba(255,122,0,0.18), transparent 70%)" }} />
                  <div className="flex items-center gap-2.5 relative">
                    <div className="size-8 grid place-items-center rounded-lg bg-[#FF7A00]/10 ring-1 ring-[#FF7A00]/20 text-[#FF9F43] shrink-0">
                      <a.icon className="size-3.5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[12px] font-semibold leading-tight truncate">{a.label}</p>
                      <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 truncate mt-0.5">{a.hint}</p>
                    </div>
                  </div>
                </motion.div>
              );
              if (a.kind === "email") {
                return (
                  <button
                    key={a.label}
                    type="button"
                    onClick={openEmailSupport}
                    className="text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-[#FF7A00]/40 rounded-2xl"
                    aria-label="Email FoundOurMarket support"
                  >
                    {inner}
                  </button>
                );
              }
              return (
                <Link key={a.label} to={a.to} onClick={() => hapticTap()}>{inner}</Link>
              );
            })}
          </div>
        </motion.section>

        {/* COMPACT UTILITY FOOTER */}
        <footer className="mt-10 pt-5 border-t border-white/[0.06] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] font-mono uppercase tracking-[0.22em] text-white/40">
          <Link to="/pages/$slug" params={{ slug: "privacy" }} className="hover:text-white/80 transition">Privacy</Link>
          <span className="text-white/15">·</span>
          <Link to="/pages/$slug" params={{ slug: "terms" }} className="hover:text-white/80 transition">Terms</Link>
          <span className="text-white/15">·</span>
          <Link to="/returns" className="hover:text-white/80 transition">Refund Policy</Link>
        </footer>
      </main>

      {/* EMAIL SUPPORT FALLBACK DIALOG */}
      <Dialog open={emailOpen} onOpenChange={setEmailOpen}>
        <DialogContent className="bg-[#0a0f1f] border-white/[0.08] text-white max-w-sm rounded-2xl p-0 overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A00]/60 to-transparent" />
          <div aria-hidden className="absolute -top-24 -right-16 size-56 rounded-full blur-3xl opacity-30 pointer-events-none"
            style={{ background: "radial-gradient(circle, #FF7A00 0%, transparent 70%)" }} />
          <div className="relative p-5">
            <DialogHeader>
              <div className="size-10 grid place-items-center rounded-xl bg-[#FF7A00]/15 ring-1 ring-[#FF7A00]/30 text-[#FF9F43] mb-3">
                <Mail className="size-4" />
              </div>
              <DialogTitle className="text-base font-semibold">Contact Support</DialogTitle>
              <DialogDescription className="text-white/60 text-[13px] leading-relaxed">
                Reach FoundOurMarket support directly. Pick the option that works best for you.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.06] px-3 py-2.5 flex items-center justify-between gap-2">
              <span className="text-[12px] font-mono text-white/80 truncate">{SUPPORT_EMAIL}</span>
              <button
                onClick={copySupportEmail}
                className="shrink-0 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-[#FF9F43] hover:text-white transition px-2 py-1 rounded-md hover:bg-white/5"
              >
                <Copy className="size-3" /> Copy
              </button>
            </div>

            <div className="mt-4 grid gap-2">
              <a
                href={buildMailto()}
                onClick={() => { hapticTap(); setEmailOpen(false); }}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#FF7A00] text-white rounded-full px-5 py-3 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 shadow-[0_8px_22px_-8px_#FF7A00] transition-all"
              >
                <Mail className="size-3.5" /> Open Email App
              </a>
              <a
                href={buildGmailUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { hapticTap(); setEmailOpen(false); }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[11px] uppercase tracking-widest font-semibold text-white/85 hover:text-white ring-1 ring-white/10 hover:ring-white/25 bg-white/[0.03] transition"
              >
                <ExternalLink className="size-3.5" /> Open in Gmail
              </a>
              <Link
                to="/help"
                onClick={() => { hapticTap(); setEmailOpen(false); }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-3 text-[11px] uppercase tracking-widest font-semibold text-white/70 hover:text-white transition"
              >
                <MessageCircle className="size-3.5" /> Contact Live Chat
              </Link>
            </div>

            <p className="mt-4 text-[10px] font-mono uppercase tracking-[0.22em] text-white/35 text-center">
              Avg reply · 2 business days
            </p>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
