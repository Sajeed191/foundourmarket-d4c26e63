import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  ArrowLeft,
  Package,
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
  Truck,
  RefreshCw,
  Wallet,
  Download,
  Search,
  CircleDot,
  Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { z } from "zod";
import { supabase } from "@/integrations/supabase/client";
import { fetchProductsBySlugs } from "@/lib/products";
import { supportSearch } from "@/lib/support-context";
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
const SUPPORT_CC = "support@foundourmarket.com";
const SUPPORT_SUBJECT = "Resolution Support Request - FoundOurMarket";
const SUPPORT_BODY = `Hello FoundOurMarket Support,

I need help regarding a resolution request.

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
      { title: "Resolution Center — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Track replacements, refunds, approvals, reviews and resolution progress from one premium place.",
      },
    ],
  }),
  validateSearch: searchSchema,
  component: ReturnsPage,
});

type ReturnItem = { product_slug: string; quantity: number };
type ReturnRow = {
  id: string;
  order_id: string;
  status: string;
  reason: string;
  refund_amount: number;
  refund_status: string;
  resolution_type: string;
  replacement_status: string;
  created_at: string;
  return_items?: ReturnItem[] | null;
};

type OrderItem = { id: string; name: string; product_slug: string; quantity: number; unit_price: number };
type OrderForReturn = { id: string; order_items: OrderItem[] };

type FilterKey = "all" | "reviewing" | "replacement" | "refund" | "completed" | "rejected";

const FILTERS: { key: FilterKey; label: string }[] = [
  { key: "all", label: "All" },
  { key: "reviewing", label: "Reviewing" },
  { key: "replacement", label: "Replacement" },
  { key: "refund", label: "Refund" },
  { key: "completed", label: "Completed" },
  { key: "rejected", label: "Rejected" },
];

/* ---------------- Resolution model ---------------- */

type Tone = "neutral" | "blue" | "purple" | "orange" | "indigo" | "green" | "red";

const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-white/70 bg-white/[0.06] ring-white/15",
  blue: "text-sky-300 bg-sky-400/10 ring-sky-400/25",
  purple: "text-violet-300 bg-violet-400/10 ring-violet-400/25",
  orange: "text-[#FF9F43] bg-[#FF7A00]/12 ring-[#FF7A00]/30",
  indigo: "text-indigo-300 bg-indigo-400/10 ring-indigo-400/25",
  green: "text-emerald-300 bg-emerald-400/10 ring-emerald-400/25",
  red: "text-rose-300 bg-rose-400/10 ring-rose-400/25",
};

const TONE_GLOW: Record<Tone, string> = {
  neutral: "rgba(255,255,255,0.12)",
  blue: "rgba(56,189,248,0.35)",
  purple: "rgba(167,139,250,0.35)",
  orange: "rgba(255,122,0,0.4)",
  indigo: "rgba(129,140,248,0.35)",
  green: "rgba(52,211,153,0.35)",
  red: "rgba(251,113,133,0.35)",
};

const STAGES = ["Requested", "Review", "Approved", "Processing", "Completed"] as const;

type ResolutionView = {
  isReplacement: boolean;
  status: string; // primary status label
  resolution: string; // current resolution label
  tone: Tone;
  stage: number; // -1 rejected, 0..4
  rejected: boolean;
  expectedLabel: string;
  expectedDate: string | null;
  matches: (f: FilterKey) => boolean;
};

function addBusinessDays(from: Date, days: number): Date {
  const d = new Date(from);
  let added = 0;
  while (added < days) {
    d.setDate(d.getDate() + 1);
    const day = d.getDay();
    if (day !== 0 && day !== 6) added++;
  }
  return d;
}

function fmtDate(d: Date): string {
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function deriveView(r: ReturnRow): ResolutionView {
  const s = (r.status ?? "").toLowerCase();
  const rep = (r.replacement_status ?? "").toLowerCase();
  const ref = (r.refund_status ?? "").toLowerCase();
  const isReplacement = r.resolution_type !== "refund";
  const created = new Date(r.created_at);

  const rejected = /rejected|denied|cancel/.test(s);
  const replacementDone = /delivered|completed|fulfilled/.test(rep);
  const refundDone = /refunded|paid|completed|succeeded/.test(ref);
  const completed = replacementDone || refundDone;

  let stage = 0;
  let status = "Requested";
  let resolution = isReplacement ? "Replacement Requested" : "Refund Requested";
  let tone: Tone = "neutral";

  if (rejected) {
    return {
      isReplacement,
      status: "Rejected",
      resolution: isReplacement ? "Replacement Declined" : "Refund Declined",
      tone: "red",
      stage: -1,
      rejected: true,
      expectedLabel: "Status",
      expectedDate: null,
      matches: (f) => f === "all" || f === "rejected",
    };
  }

  if (completed) {
    stage = 4;
    tone = "green";
    status = "Completed";
    resolution = isReplacement
      ? "Replacement Delivered"
      : `Refund Processed`;
  } else if (isReplacement) {
    // Replacement-first flow
    if (/shipped|transit|dispatch/.test(rep)) {
      stage = 3;
      tone = "indigo";
      status = "Replacement Shipped";
      resolution = "Replacement Shipped";
    } else if (/processing|preparing|packed|approved/.test(rep) || /approved/.test(s)) {
      stage = /approved/.test(s) && !/processing|preparing|packed/.test(rep) ? 2 : 3;
      tone = stage === 2 ? "purple" : "orange";
      status = stage === 2 ? "Replacement Approved" : "Replacement Processing";
      resolution = status;
    } else if (/review|pending/.test(s) || /pending|review/.test(rep)) {
      stage = 1;
      tone = "blue";
      status = "In Review";
      resolution = "Replacement In Review";
    } else {
      stage = 0;
      tone = "neutral";
      status = "Requested";
      resolution = "Replacement Requested";
    }
  } else {
    // Refund flow
    if (/processing|pending_payout|payout/.test(ref)) {
      stage = 3;
      tone = "orange";
      status = "Refund Processing";
      resolution = "Refund Processing";
    } else if (/approved/.test(s) || /approved/.test(ref)) {
      stage = 2;
      tone = "purple";
      status = "Refund Approved";
      resolution = "Refund Approved";
    } else if (/review|pending/.test(s)) {
      stage = 1;
      tone = "blue";
      status = "In Review";
      resolution = "Refund In Review";
    } else {
      stage = 0;
      tone = "neutral";
      status = "Requested";
      resolution = "Refund Requested";
    }
  }

  // Estimated date
  let expectedLabel = "Expected Resolution";
  let expectedDate: string | null = null;
  if (stage === 4) {
    expectedLabel = "Resolved";
    expectedDate = "Completed";
  } else if (isReplacement) {
    expectedLabel = stage >= 3 ? "Replacement Arriving" : "Expected Resolution";
    expectedDate = fmtDate(addBusinessDays(created, stage >= 3 ? 4 : 7));
  } else {
    expectedLabel = "Expected Resolution";
    expectedDate = fmtDate(addBusinessDays(created, stage >= 3 ? 2 : 5));
  }

  const matches = (f: FilterKey): boolean => {
    if (f === "all") return true;
    if (f === "completed") return stage === 4;
    if (f === "rejected") return false;
    if (f === "reviewing") return stage <= 1;
    if (f === "replacement") return isReplacement && stage > 1 && stage < 4;
    if (f === "refund") return !isReplacement && stage > 1 && stage < 4;
    return false;
  };

  return { isReplacement, status, resolution, tone, stage, rejected: false, expectedLabel, expectedDate, matches };
}

/* ---------------- Timeline ---------------- */

function ResolutionTimeline({ view }: { view: ResolutionView }) {
  if (view.rejected) {
    return (
      <div className="flex items-center gap-2 text-[11px] font-medium text-rose-300">
        <XCircle className="size-3.5" /> Request was declined
      </div>
    );
  }
  return (
    <div className="flex items-center">
      {STAGES.map((label, i) => {
        const done = i < view.stage;
        const current = i === view.stage;
        return (
          <div key={label} className="flex items-center flex-1 last:flex-none">
            <div className="flex flex-col items-center gap-1">
              <div
                className={cn(
                  "size-5 grid place-items-center rounded-full ring-1 transition-all",
                  done && "bg-emerald-400/20 ring-emerald-400/40 text-emerald-300",
                  current && "ring-2",
                  current && TONE_CLASS[view.tone],
                  !done && !current && "bg-white/[0.04] ring-white/10 text-white/30"
                )}
                style={current ? { boxShadow: `0 0 14px -2px ${TONE_GLOW[view.tone]}` } : undefined}
              >
                {done ? (
                  <Check className="size-3" />
                ) : current ? (
                  <motion.span
                    animate={{ scale: [1, 1.35, 1], opacity: [1, 0.6, 1] }}
                    transition={{ duration: 1.6, repeat: Infinity }}
                  >
                    <CircleDot className="size-3" />
                  </motion.span>
                ) : (
                  <span className="size-1.5 rounded-full bg-current" />
                )}
              </div>
              <span
                className={cn(
                  "text-[8.5px] font-mono uppercase tracking-wider whitespace-nowrap",
                  current ? "text-white/85" : done ? "text-white/55" : "text-white/30"
                )}
              >
                {label}
              </span>
            </div>
            {i < STAGES.length - 1 && (
              <div className="flex-1 h-px mx-1 -mt-4 bg-white/10 relative overflow-hidden rounded-full">
                <div
                  className={cn("absolute inset-y-0 left-0 rounded-full transition-all", i < view.stage ? "w-full bg-emerald-400/50" : "w-0")}
                />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

function ReturnsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { order } = useSearch({ from: "/account_/returns" });
  const [returns, setReturns] = useState<ReturnRow[] | null>(null);
  const [products, setProducts] = useState<Record<string, { name: string; image: string }>>({});
  const [eligibleOrder, setEligibleOrder] = useState<OrderForReturn | null>(null);
  const [reason, setReason] = useState("");
  const [notes, setNotes] = useState("");
  const [qty, setQty] = useState<Record<string, number>>({});
  const [submitting, setSubmitting] = useState(false);
  const [filter, setFilter] = useState<FilterKey>("all");
  const [scrolled, setScrolled] = useState(false);
  const [emailOpen, setEmailOpen] = useState(false);
  const [sending, setSending] = useState(false);
  const [copied, setCopied] = useState(false);
  const [detail, setDetail] = useState<ReturnRow | null>(null);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  function openEmailSupport() {
    hapticTap();
    setEmailOpen(true);
  }

  async function copySupportEmail() {
    hapticTap();
    try {
      await navigator.clipboard.writeText(SUPPORT_EMAIL);
      setCopied(true);
      toast.success("Email copied", { description: SUPPORT_EMAIL });
      setTimeout(() => setCopied(false), 1800);
    } catch {
      toast.error("Couldn't copy — try selecting the address manually");
    }
  }

  function sendEmail() {
    if (sending) return;
    hapticTap();
    setSending(true);

    let handed = false;
    const onHide = () => { handed = true; };
    document.addEventListener("visibilitychange", onHide, { once: true });
    window.addEventListener("blur", onHide, { once: true });

    try {
      window.location.href = buildMailto();
    } catch {}

    window.setTimeout(() => {
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("blur", onHide);
      setSending(false);
      if (!handed && !document.hidden) {
        toast.error("No email app detected", {
          description: "Try Gmail, copy the address, or open live chat.",
        });
      } else {
        setEmailOpen(false);
      }
    }, 1600);
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
      .select("id,order_id,status,reason,refund_amount,refund_status,resolution_type,replacement_status,created_at,return_items(product_slug,quantity)")
      .order("created_at", { ascending: false })
      .then(({ data }) => setReturns((data as ReturnRow[]) ?? []));
  }, [user]);

  // Resolve product names + thumbnails for nicer cards (read-only enrichment).
  useEffect(() => {
    if (!returns || returns.length === 0) return;
    const slugs = [
      ...new Set(
        returns.flatMap((r) => (r.return_items ?? []).map((it) => it.product_slug)).filter(Boolean),
      ),
    ];
    if (slugs.length === 0) return;
    fetchProductsBySlugs(slugs)
      .then((list) => {
        const map: Record<string, { name: string; image: string }> = {};
        list.forEach((p) => { map[p.slug] = { name: p.name, image: p.image }; });
        setProducts(map);
      })
      .catch(() => {});
  }, [returns]);

  useEffect(() => {
    if (!user || !order) { setEligibleOrder(null); return; }
    supabase
      .from("orders")
      .select("id,order_items(id,name,product_slug,quantity,unit_price)")
      .eq("id", order)
      .maybeSingle()
      .then(({ data }) => setEligibleOrder((data as OrderForReturn) ?? null));
  }, [user, order]);

  const enriched = useMemo(
    () => (returns ?? []).map((r) => ({ row: r, view: deriveView(r) })),
    [returns],
  );

  const filtered = useMemo(
    () => enriched.filter(({ view }) => view.matches(filter)),
    [enriched, filter],
  );

  const counts = useMemo(() => {
    const c: Record<FilterKey, number> = { all: 0, reviewing: 0, replacement: 0, refund: 0, completed: 0, rejected: 0 };
    enriched.forEach(({ view }) => {
      FILTERS.forEach((f) => { if (view.matches(f.key)) c[f.key]++; });
    });
    return c;
  }, [enriched]);

  const summary = useMemo(() => {
    let active = 0, review = 0, repProc = 0, refProc = 0, done = 0;
    enriched.forEach(({ view }) => {
      if (view.rejected) return;
      if (view.stage === 4) { done++; return; }
      active++;
      if (view.stage <= 1) review++;
      if (view.isReplacement && view.stage >= 2 && view.stage < 4) repProc++;
      if (!view.isReplacement && view.stage >= 2 && view.stage < 4) refProc++;
    });
    return { active, review, repProc, refProc, done };
  }, [enriched]);

  function firstSlug(r: ReturnRow): string | null {
    return r.return_items?.[0]?.product_slug ?? null;
  }
  function productFor(r: ReturnRow): { name: string; image: string } | null {
    const slug = firstSlug(r);
    return slug ? products[slug] ?? null : null;
  }

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
    // Fire customer notification + branded email + audit (server-side).
    try {
      const { notifyReturnRequestedFn } = await import("@/lib/return-notify.functions");
      await notifyReturnRequestedFn({ data: { returnId: r.id } });
    } catch { /* non-blocking */ }
    setSubmitting(false);
    toast.success("Resolution request submitted");
    nav({ to: "/account/returns" });
  }

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center bg-[#050816]">
        <Loader2 className="size-5 animate-spin text-[#FF7A00]" />
      </div>
    );
  }

  const SUMMARY_CARDS = [
    { label: "Active Cases", value: summary.active, icon: Sparkles, tone: "orange" as Tone },
    { label: "In Review", value: summary.review, icon: Hourglass, tone: "blue" as Tone },
    { label: "Replacement Processing", value: summary.repProc, icon: RefreshCw, tone: "orange" as Tone },
    { label: "Refund Processing", value: summary.refProc, icon: Wallet, tone: "purple" as Tone },
    { label: "Completed", value: summary.done, icon: CheckCircle2, tone: "green" as Tone },
  ];

  const QUICK_ACTIONS = [
    { to: "/track", icon: Truck, label: "Track Order", hint: "Live status" },
    { to: "/account/orders", icon: FileText, label: "View Returns", hint: "All requests" },
    { kind: "email" as const, icon: MessageCircle, label: "Contact Support", hint: "< 5 min" },
    { to: "/account/orders", icon: Download, label: "Download Invoice", hint: "Receipts" },
  ];

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
          <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-white/40">Account</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.24em] text-[#FF9F43]">
            Resolution
          </span>
        </div>
      </header>

      <main className="relative max-w-3xl mx-auto px-4 sm:px-6 pt-4 pb-32">
        {/* HERO */}
        <motion.section
          initial={{ opacity: 0, y: 14 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="pt-1 pb-4"
        >
          <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-[#FF9F43] mb-2">
            Account · Post-purchase
          </p>
          <h1 className="text-[28px] sm:text-[34px] leading-[1.05] font-display font-semibold tracking-tight">
            Resolution Center
          </h1>
          <p className="mt-2.5 text-sm text-white/65 max-w-md leading-relaxed">
            Track replacements, refunds, approvals, reviews, and resolution progress from one place.
          </p>
        </motion.section>

        {/* SUMMARY CARDS */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.06 }}
          className="-mx-4 px-4 sm:mx-0 sm:px-0"
        >
          <div className="flex gap-2.5 overflow-x-auto pb-1 sm:grid sm:grid-cols-5 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            {SUMMARY_CARDS.map((c, i) => (
              <motion.div
                key={c.label}
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
                transition={{ delay: 0.06 + i * 0.04 }}
                className="relative shrink-0 w-[42%] sm:w-auto rounded-2xl ring-1 ring-white/[0.08] bg-white/[0.03] backdrop-blur-xl p-3.5 overflow-hidden"
              >
                <c.icon className={cn("relative size-4 mb-2", TONE_CLASS[c.tone].split(" ")[0])} />
                <p className="relative text-2xl font-display font-semibold leading-none tabular-nums">{c.value}</p>
                <p className="relative mt-1.5 text-[10px] uppercase tracking-wider text-white/50 leading-tight">{c.label}</p>
              </motion.div>
            ))}
          </div>
        </motion.section>

        {/* QUICK ACTIONS */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.1 }}
          className="mt-4 grid grid-cols-2 sm:grid-cols-4 gap-2.5"
        >
          {QUICK_ACTIONS.map((a) => {
            const inner = (
              <motion.div
                whileTap={{ scale: 0.96 }}
                whileHover={{ y: -1 }}
                transition={{ type: "spring", stiffness: 420, damping: 26 }}
                className="group relative h-full rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-3.5 hover:ring-[#FF7A00]/30 hover:bg-white/[0.05] transition-all overflow-hidden"
              >
                <div className="size-9 grid place-items-center rounded-xl bg-[#FF7A00]/12 ring-1 ring-[#FF7A00]/25 text-[#FF9F43] mb-2.5">
                  <a.icon className="size-4" />
                </div>
                <p className="text-[12.5px] font-semibold leading-tight">{a.label}</p>
                <p className="text-[10px] font-mono uppercase tracking-wider text-white/40 mt-0.5">{a.hint}</p>
              </motion.div>
            );
            if ("kind" in a && a.kind === "email") {
              return (
                <button key={a.label} type="button" onClick={openEmailSupport} className="text-left">
                  {inner}
                </button>
              );
            }
            return <Link key={a.label} to={a.to!} onClick={() => hapticTap()}>{inner}</Link>;
          })}
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
                Request resolution · Order #{eligibleOrder.id.slice(0, 8)}
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
                {submitting ? "Submitting…" : "Submit request"}
              </motion.button>
            </motion.section>
          )}
        </AnimatePresence>

        {/* FILTERS (sticky) */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5, delay: 0.14 }}
          className="mt-6 sticky top-12 z-20 -mx-4 px-4 sm:mx-0 sm:px-0 py-2 bg-[#050816]/70 backdrop-blur-xl"
        >
          <div className="flex gap-2 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
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
                <div key={i} className="h-36 rounded-2xl bg-white/[0.03] ring-1 ring-white/[0.05] animate-pulse" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            (() => {
              const emptyMap: Record<FilterKey, { icon: typeof Package; title: string; sub: string }> = {
                all:        { icon: Package,      title: "No Active Resolution Requests", sub: "When a return, replacement, or refund request is submitted it will appear here." },
                reviewing:  { icon: Hourglass,    title: "Nothing in review",            sub: "Submitted requests under review will appear here." },
                replacement:{ icon: RefreshCw,    title: "No replacements in progress",  sub: "Approved replacements being prepared or shipped will show here." },
                refund:     { icon: Wallet,       title: "No refunds in progress",       sub: "Refunds awaiting payout will appear here." },
                completed:  { icon: CheckCircle2, title: "No completed resolutions",     sub: "Delivered replacements and processed refunds will appear here." },
                rejected:   { icon: XCircle,      title: "No rejected requests",         sub: "Declined requests will appear here with reasons." },
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
                  className="relative rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl px-6 py-12 text-center overflow-hidden"
                >
                  <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A00]/50 to-transparent" />
                  <motion.div
                    initial={{ scale: 0.85, opacity: 0 }} animate={{ scale: 1, opacity: 1 }}
                    transition={{ delay: 0.08, type: "spring", stiffness: 220, damping: 18 }}
                    className="relative size-20 mx-auto mb-5 grid place-items-center rounded-3xl bg-[#FF7A00]/10 ring-1 ring-[#FF7A00]/25"
                  >
                    <Icon className="size-8 text-[#FF9F43]" />
                  </motion.div>
                  <p className="relative text-base font-semibold">{E.title}</p>
                  <p className="relative text-[13px] text-white/55 mt-1.5 max-w-sm mx-auto leading-relaxed">{E.sub}</p>
                  <div className="relative mt-6 flex flex-col sm:flex-row gap-2 items-stretch sm:items-center justify-center">
                    {filter !== "all" && (
                      <button
                        onClick={() => { hapticTap(); setFilter("all"); }}
                        className="inline-flex items-center justify-center gap-1.5 rounded-full px-5 py-2.5 text-[11px] uppercase tracking-widest font-semibold text-white/80 hover:text-white ring-1 ring-white/10 hover:ring-white/25 bg-white/[0.03] transition"
                      >
                        Show all
                      </button>
                    )}
                    <Link
                      to="/account/orders"
                      className="inline-flex items-center justify-center gap-1.5 bg-[#FF7A00] text-white rounded-full px-5 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 shadow-[0_8px_20px_-8px_#FF7A00] transition-all"
                    >
                      Browse Orders <ChevronRight className="size-3.5" />
                    </Link>
                  </div>
                </motion.div>
              );
            })()
          ) : (
            <div className="space-y-2.5">
              {filtered.map(({ row: r, view }, i) => {
                const prod = productFor(r);
                return (
                  <motion.button
                    key={r.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.35, delay: i * 0.04 }}
                    whileTap={{ scale: 0.99 }}
                    onClick={() => { hapticTap(); setDetail(r); }}
                    className="w-full text-left rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-4 hover:ring-[#FF7A00]/30 hover:bg-white/[0.05] transition-all"
                  >
                    <div className="flex items-start gap-3">
                      {/* Thumbnail */}
                      <div className="size-14 shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/[0.04] grid place-items-center">
                        {prod?.image ? (
                          <img decoding="async" src={prod.image} alt={prod.name} className="size-full object-cover" loading="lazy" />
                        ) : (
                          <Package className="size-5 text-white/30" />
                        )}
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="text-sm font-semibold text-white/90 truncate">
                          {prod?.name ?? r.reason}
                        </p>
                        <p className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 mt-0.5 truncate">
                          REQ #{r.id.slice(0, 8)} · ORD #{r.order_id.slice(0, 8)}
                        </p>
                        <div className="flex items-center gap-2 mt-2 flex-wrap">
                          <span className={cn(
                            "inline-flex items-center gap-1 text-[10px] font-medium px-2 py-0.5 rounded-full ring-1",
                            TONE_CLASS[view.tone]
                          )}>
                            {view.isReplacement ? <RefreshCw className="size-2.5" /> : <Wallet className="size-2.5" />}
                            {view.resolution}
                          </span>
                          {!view.isReplacement && (
                            <span className="text-[11px] font-mono text-white/55">${Number(r.refund_amount).toFixed(2)}</span>
                          )}
                        </div>
                      </div>
                      <ChevronRight className="size-4 text-white/30 shrink-0 mt-1" />
                    </div>

                    {/* Reason */}
                    <p className="mt-3 text-[12px] text-white/55 line-clamp-1">
                      <span className="text-white/40">Reason:</span> {r.reason}
                    </p>

                    {/* Timeline */}
                    <div className="mt-3">
                      <ResolutionTimeline view={view} />
                    </div>

                    {/* Expected completion */}
                    {view.expectedDate && (
                      <div className="mt-3 pt-3 border-t border-white/[0.06] flex items-center justify-between">
                        <span className="text-[10px] font-mono uppercase tracking-wider text-white/40">
                          {view.expectedLabel}
                        </span>
                        <span className={cn(
                          "text-[11px] font-semibold",
                          view.stage === 4 ? "text-emerald-300" : "text-white/85"
                        )}>
                          {view.expectedDate}
                        </span>
                      </div>
                    )}
                  </motion.button>
                );
              })}
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
            { icon: RefreshCw, label: "Replacement First" },
            { icon: Clock, label: "Fast Review" },
            { icon: ShieldCheck, label: "Buyer Protection" },
          ].map(({ icon: Icon, label }) => (
            <div key={label} className="flex flex-col items-center gap-1.5 rounded-xl ring-1 ring-white/[0.06] bg-white/[0.02] py-3 px-2">
              <Icon className="size-3.5 text-[#FF9F43]" />
              <span className="text-[10px] font-medium text-white/65 text-center leading-tight">{label}</span>
            </div>
          ))}
        </motion.section>

        {/* SUPPORT CENTER */}
        <motion.section
          initial={{ opacity: 0, y: 12 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-50px" }}
          transition={{ duration: 0.5 }}
          className="mt-8"
        >
          <h3 className="text-base font-semibold mb-3">Need Help?</h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            {([
              { kind: "email", icon: MessageCircle, label: "Chat Support", hint: "Average response < 5 min" },
              { kind: "email", icon: Mail,          label: "Email Support", hint: SUPPORT_EMAIL },
              { kind: "link",  to: "/help",         icon: LifeBuoy,         label: "Help Center", hint: "Guides & FAQs" },
              { kind: "link",  to: "/returns",      icon: FileText,         label: "Refund Policy", hint: "Eligibility & timelines" },
            ] as const).map((a) => {
              const inner = (
                <motion.div
                  whileTap={{ scale: 0.97 }}
                  whileHover={{ y: -1 }}
                  transition={{ type: "spring", stiffness: 420, damping: 26 }}
                  className="group relative rounded-2xl ring-1 ring-white/[0.07] bg-white/[0.03] backdrop-blur-xl p-4 hover:ring-[#FF7A00]/30 hover:bg-white/[0.05] transition-all overflow-hidden min-h-[64px]"
                >
                  <div className="flex items-center gap-3 relative">
                    <div className="size-10 grid place-items-center rounded-xl bg-[#FF7A00]/10 ring-1 ring-[#FF7A00]/20 text-[#FF9F43] shrink-0">
                      <a.icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-[13px] font-semibold leading-tight">{a.label}</p>
                      <p className="text-[11px] text-white/45 truncate mt-0.5">{a.hint}</p>
                    </div>
                    <ChevronRight className="size-4 text-white/25 ml-auto shrink-0" />
                  </div>
                </motion.div>
              );
              if (a.kind === "email") {
                return (
                  <button key={a.label} type="button" onClick={openEmailSupport} className="text-left">
                    {inner}
                  </button>
                );
              }
              return <Link key={a.label} to={a.to} onClick={() => hapticTap()}>{inner}</Link>;
            })}
          </div>
        </motion.section>

        {/* COMPACT UTILITY FOOTER */}
        <footer className="mt-10 pt-5 border-t border-white/[0.06] flex flex-wrap items-center justify-center gap-x-4 gap-y-2 text-[10px] font-mono uppercase tracking-[0.22em] text-white/40">
          <Link to="/privacy" className="hover:text-white/80 transition">Privacy</Link>
          <span className="text-white/15">·</span>
          <Link to="/terms" className="hover:text-white/80 transition">Terms</Link>
          <span className="text-white/15">·</span>
          <Link to="/returns" className="hover:text-white/80 transition">Refund Policy</Link>
        </footer>
      </main>

      {/* DETAIL DIALOG */}
      <Dialog open={!!detail} onOpenChange={(o) => { if (!o) setDetail(null); }}>
        <DialogContent className="bg-[#050816] border-white/[0.08] text-white w-[calc(100vw-1.5rem)] max-w-md rounded-2xl p-0 overflow-hidden">
          {detail && (() => {
            const view = deriveView(detail);
            const prod = productFor(detail);
            return (
              <div className="relative w-full min-w-0 overflow-hidden">
                <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A00]/70 to-transparent" />
                <div className="p-5">
                  <DialogHeader className="space-y-0 text-left">
                    <div className="flex items-start gap-3">
                      <div className="size-14 shrink-0 rounded-xl overflow-hidden ring-1 ring-white/10 bg-white/[0.04] grid place-items-center">
                        {prod?.image ? (
                          <img loading="lazy" decoding="async" src={prod.image} alt={prod.name} className="size-full object-cover" />
                        ) : (
                          <Package className="size-5 text-white/30" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <DialogTitle className="text-[15px] font-semibold tracking-tight truncate">
                          {prod?.name ?? detail.reason}
                        </DialogTitle>
                        <DialogDescription className="text-[10px] font-mono uppercase tracking-[0.18em] text-white/40 mt-1">
                          REQ #{detail.id.slice(0, 8)} · ORD #{detail.order_id.slice(0, 8)}
                        </DialogDescription>
                        <span className={cn(
                          "inline-flex items-center gap-1 mt-2 text-[10px] font-medium px-2 py-0.5 rounded-full ring-1",
                          TONE_CLASS[view.tone]
                        )}>
                          {view.status}
                        </span>
                      </div>
                    </div>
                  </DialogHeader>

                  <div className="mt-5">
                    <ResolutionTimeline view={view} />
                  </div>

                  <dl className="mt-5 space-y-2.5 text-[12.5px]">
                    <div className="flex justify-between gap-3">
                      <dt className="text-white/45">Reason</dt>
                      <dd className="text-white/85 text-right">{detail.reason}</dd>
                    </div>
                    <div className="flex justify-between gap-3">
                      <dt className="text-white/45">Current Resolution</dt>
                      <dd className="text-white/85 text-right">{view.resolution}</dd>
                    </div>
                    {!view.isReplacement && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-white/45">Refund Amount</dt>
                        <dd className="text-white/85 text-right font-mono">${Number(detail.refund_amount).toFixed(2)}</dd>
                      </div>
                    )}
                    {view.expectedDate && (
                      <div className="flex justify-between gap-3">
                        <dt className="text-white/45">{view.expectedLabel}</dt>
                        <dd className={cn("text-right font-semibold", view.stage === 4 ? "text-emerald-300" : "text-white/85")}>
                          {view.expectedDate}
                        </dd>
                      </div>
                    )}
                    <div className="flex justify-between gap-3">
                      <dt className="text-white/45">Requested</dt>
                      <dd className="text-white/70 text-right font-mono">
                        {new Date(detail.created_at).toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" })}
                      </dd>
                    </div>
                  </dl>

                  <Link
                    to="/account/support"
                    onClick={() => { hapticTap(); setDetail(null); }}
                    search={supportSearch(
                      view.isReplacement
                        ? { return: detail.id, order: detail.order_id, category: "return_request", subject: `Return request · Order #${detail.order_id.slice(0, 8)}` }
                        : { refund: detail.id, order: detail.order_id, category: "refund_request", subject: `Refund request · Order #${detail.order_id.slice(0, 8)}` },
                    )}
                    className="mt-5 w-full inline-flex items-center justify-center gap-1.5 bg-[#FF7A00] text-white rounded-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition"
                  >
                    <LifeBuoy className="size-3.5" /> Contact Support
                  </Link>

                  <div className="mt-2 grid grid-cols-2 gap-2">

                    <Link
                      to="/track"
                      onClick={() => { hapticTap(); setDetail(null); }}
                      className="inline-flex items-center justify-center gap-1.5 rounded-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-semibold ring-1 ring-white/12 bg-white/[0.03] hover:bg-white/[0.06] transition"
                    >
                      <Search className="size-3.5" /> Track
                    </Link>
                    <button
                      onClick={() => { hapticTap(); setDetail(null); openEmailSupport(); }}
                      className="inline-flex items-center justify-center gap-1.5 bg-[#FF7A00] text-white rounded-full px-4 py-2.5 text-[11px] uppercase tracking-widest font-bold hover:brightness-110 transition"
                    >
                      <MessageCircle className="size-3.5" /> Support
                    </button>
                  </div>
                </div>
              </div>
            );
          })()}
        </DialogContent>
      </Dialog>

      {/* EMAIL SUPPORT DIALOG */}
      <Dialog open={emailOpen} onOpenChange={(o) => { setEmailOpen(o); if (!o) setSending(false); }}>
        <DialogContent className="bg-[#050816] border-white/[0.08] text-white max-w-[22rem] rounded-2xl p-0 overflow-hidden">
          <div aria-hidden className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-[#FF7A00]/70 to-transparent" />

          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
            className="relative p-5"
          >
            <DialogHeader className="space-y-2">
              <div className="size-9 grid place-items-center rounded-xl bg-[#FF7A00]/15 ring-1 ring-[#FF7A00]/30 text-[#FF9F43]">
                <Mail className="size-4" />
              </div>
              <DialogTitle className="text-[15px] font-semibold tracking-tight">Contact Support</DialogTitle>
              <DialogDescription className="text-white/55 text-[12.5px] leading-snug">
                A real human will reply. Pick the channel that's easiest for you.
              </DialogDescription>
            </DialogHeader>

            <div className="mt-4 rounded-xl bg-white/[0.03] ring-1 ring-white/[0.07] px-3 py-2 flex items-center justify-between gap-2">
              <span className="text-[12px] font-mono text-white/85 truncate">{SUPPORT_EMAIL}</span>
              <motion.button
                whileTap={{ scale: 0.94 }}
                onClick={copySupportEmail}
                aria-label="Copy support email"
                className={cn(
                  "shrink-0 inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest px-2 py-1 rounded-md transition",
                  copied ? "text-emerald-300 bg-emerald-400/10" : "text-[#FF9F43] hover:text-white hover:bg-white/5"
                )}
              >
                {copied ? <><Check className="size-3" /> Copied</> : <><Copy className="size-3" /> Copy</>}
              </motion.button>
            </div>

            <div className="mt-4 grid gap-2">
              <motion.button
                whileTap={{ scale: 0.985 }}
                onClick={sendEmail}
                disabled={sending}
                className="w-full inline-flex items-center justify-center gap-2 bg-[#FF7A00] text-white rounded-full px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] font-bold hover:brightness-110 shadow-[0_10px_28px_-10px_#FF7A00] transition-all disabled:opacity-70"
              >
                {sending ? (
                  <><Loader2 className="size-3.5 animate-spin" /> Launching mail app…</>
                ) : (
                  <><Mail className="size-3.5" /> Send Email</>
                )}
              </motion.button>

              <motion.a
                whileTap={{ scale: 0.985 }}
                href={buildGmailUrl()}
                target="_blank"
                rel="noopener noreferrer"
                onClick={() => { hapticTap(); setEmailOpen(false); }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-2.5 text-[11px] uppercase tracking-[0.18em] font-semibold text-white/90 hover:text-white ring-1 ring-white/12 hover:ring-white/25 bg-white/[0.03] hover:bg-white/[0.06] transition"
              >
                <ExternalLink className="size-3.5" /> Open Gmail
              </motion.a>

              <Link
                to="/help"
                onClick={() => { hapticTap(); setEmailOpen(false); }}
                className="w-full inline-flex items-center justify-center gap-2 rounded-full px-5 py-2 text-[11px] uppercase tracking-[0.18em] font-semibold text-white/55 hover:text-white transition"
              >
                <MessageCircle className="size-3.5" /> Contact Live Chat
              </Link>
            </div>

            <div className="mt-4 pt-3 border-t border-white/[0.06] flex items-center justify-center gap-1.5 text-[10.5px] text-white/45">
              <ShieldCheck className="size-3 text-emerald-400/80" />
              <span>Trusted support · Avg reply within 2 business days</span>
            </div>
          </motion.div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
