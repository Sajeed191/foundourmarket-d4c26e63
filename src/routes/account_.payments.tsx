import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  CreditCard,
  Loader2,
  Plus,
  RefreshCw,
  ShieldCheck,
  Smartphone,
  Star,
  Trash2,
  AlertTriangle,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { usePaymentMethods, isExpired, type PaymentMethod } from "@/lib/use-payment-methods";

export const Route = createFileRoute("/account_/payments")({
  head: () => ({
    meta: [
      { title: "Payment Methods — FoundOurMarket™" },
      {
        name: "description",
        content: "Securely manage your saved cards and UPI payment methods, powered by Razorpay tokenization.",
      },
    ],
  }),
  component: PaymentsPage,
});

function brandGradient(brand?: string | null) {
  const b = (brand ?? "").toLowerCase();
  if (b.includes("visa")) return "from-[#1a1f71]/60 to-[#0a0a0f]";
  if (b.includes("master")) return "from-[#eb001b]/30 to-[#f79e1b]/20";
  if (b.includes("rupay")) return "from-[#0c7d3d]/40 to-[#f47216]/20";
  if (b.includes("amex")) return "from-[#2e77bb]/40 to-[#0a0a0f]";
  return "from-primary/25 to-[#0a0a0f]";
}

function MethodCard({
  m,
  onDelete,
  onDefault,
  busy,
}: {
  m: PaymentMethod;
  onDelete: (id: string) => void;
  onDefault: (id: string) => void;
  busy: boolean;
}) {
  const expired = isExpired(m);
  const upi = m.payment_type === "upi";
  return (
    <motion.div
      layout
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, scale: 0.96 }}
      drag="x"
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.2}
      onDragEnd={(_, info) => {
        if (info.offset.x < -120) onDelete(m.id);
      }}
      className={`relative overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-br ${brandGradient(
        m.brand,
      )} p-5 backdrop-blur-xl shadow-[0_8px_40px_-12px_rgba(255,122,26,0.25)]`}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 size-32 rounded-full bg-primary/20 blur-3xl" />
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2">
          {upi ? (
            <Smartphone className="size-5 text-primary" />
          ) : (
            <CreditCard className="size-5 text-primary" />
          )}
          <span className="text-xs font-semibold uppercase tracking-widest text-foreground/80">
            {upi ? "UPI" : m.brand || "Card"}
          </span>
        </div>
        {m.is_default && (
          <span className="inline-flex items-center gap-1 rounded-full border border-primary/40 bg-primary/15 px-2 py-0.5 text-[10px] font-medium text-primary">
            <Star className="size-3 fill-primary" /> Default
          </span>
        )}
      </div>

      <div className="mt-6">
        {upi ? (
          <p className="font-mono text-base text-foreground">{m.upi_vpa ?? "UPI ID"}</p>
        ) : (
          <p className="font-mono text-lg tracking-[0.2em] text-foreground">
            •••• •••• •••• {m.last4 ?? "••••"}
          </p>
        )}
      </div>

      <div className="mt-4 flex items-end justify-between">
        <div className="text-[11px] text-muted-foreground">
          {!upi && m.expiry_month && m.expiry_year ? (
            <span className={expired ? "text-destructive" : ""}>
              Expires {String(m.expiry_month).padStart(2, "0")}/{String(m.expiry_year).slice(-2)}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1">
              <ShieldCheck className="size-3 text-emerald-400" /> Tokenized · secure
            </span>
          )}
          {expired && (
            <span className="ml-2 inline-flex items-center gap-1 text-destructive">
              <AlertTriangle className="size-3" /> Expired
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!m.is_default && !expired && (
            <button
              disabled={busy}
              onClick={() => onDefault(m.id)}
              className="rounded-lg border border-white/10 bg-white/5 px-2.5 py-1.5 text-[11px] font-medium text-foreground/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              Set default
            </button>
          )}
          <button
            disabled={busy}
            onClick={() => onDelete(m.id)}
            aria-label="Delete payment method"
            className="rounded-lg border border-destructive/30 bg-destructive/10 p-1.5 text-destructive transition hover:bg-destructive/20 disabled:opacity-50"
          >
            <Trash2 className="size-4" />
          </button>
        </div>
      </div>
    </motion.div>
  );
}

const TABS = [
  { key: "all", label: "All" },
  { key: "card", label: "Cards" },
  { key: "upi", label: "UPI" },
  { key: "wallet", label: "Wallets" },
] as const;
type Tab = (typeof TABS)[number]["key"];

function timeAgo(d: Date | null) {
  if (!d) return null;
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 10) return "just now";
  if (s < 60) return `${s}s ago`;
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  return `${h}h ago`;
}

function PaymentsPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { methods, loading: mLoading, syncing, lastSynced, syncError, sync, remove, makeDefault } =
    usePaymentMethods();
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState<Tab>("all");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const counts = useMemo(() => {
    return {
      all: methods.length,
      card: methods.filter((m) => m.payment_type === "card").length,
      upi: methods.filter((m) => m.payment_type === "upi").length,
      wallet: methods.filter((m) => m.payment_type === "wallet").length,
    };
  }, [methods]);

  const filtered = useMemo(
    () => (tab === "all" ? methods : methods.filter((m) => m.payment_type === tab)),
    [methods, tab],
  );

  async function handle(action: () => Promise<void>) {
    setBusy(true);
    try {
      await action();
    } finally {
      setBusy(false);
    }
  }

  async function doSync() {
    try {
      await sync();
      toast.success("Payment methods synced");
    } catch (e: any) {
      toast.error(e?.message ?? "Sync failed. Try again.");
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container-page py-10 sm:py-16 max-w-4xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Link to="/account" className="hover:text-foreground transition">Account</Link>
          <span>/</span>
          <span className="text-foreground">Payment Methods</span>
        </div>

        <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Payment Methods</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {counts.card} card{counts.card !== 1 ? "s" : ""} · {counts.upi} UPI · tokenized by Razorpay
            </p>
          </div>
          <div className="flex flex-col items-end gap-1">
            <button
              onClick={doSync}
              disabled={syncing}
              className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/5 px-3 py-2 text-sm font-medium text-foreground/90 transition hover:bg-white/10 disabled:opacity-50"
            >
              <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} />
              {syncing ? "Syncing…" : "Sync"}
            </button>
            <span className="text-[10px] text-muted-foreground">
              {syncError ? (
                <span className="inline-flex items-center gap-1 text-destructive">
                  <AlertTriangle className="size-3" /> Sync failed
                </span>
              ) : lastSynced ? (
                <span className="inline-flex items-center gap-1">
                  <CheckCircle2 className="size-3 text-emerald-400" /> Synced {timeAgo(lastSynced)}
                </span>
              ) : (
                "Up to date"
              )}
            </span>
          </div>
        </div>
      </motion.div>

      <div className="mt-6 rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 text-xs text-emerald-300/90 flex items-center gap-2">
        <ShieldCheck className="size-4 shrink-0" />
        We never store your full card number or CVV. Methods are securely tokenized through Razorpay.
      </div>

      {/* Tabs */}
      <div className="mt-6 flex gap-1.5 overflow-x-auto -mx-1 px-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`whitespace-nowrap rounded-full px-4 py-2 text-[11px] font-mono uppercase tracking-widest transition ${
              tab === t.key
                ? "bg-primary text-primary-foreground"
                : "border border-white/10 bg-white/5 text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label} <span className="opacity-60">({counts[t.key]})</span>
          </button>
        ))}
      </div>

      <div className="mt-5 grid gap-4 sm:grid-cols-2">
        <AnimatePresence mode="popLayout">
          {mLoading ? (
            <>
              {[0, 1].map((i) => (
                <div key={i} className="h-44 animate-pulse rounded-2xl border border-white/10 bg-white/5" />
              ))}
            </>
          ) : filtered.length === 0 ? (
            <motion.div
              initial={{ opacity: 0, scale: 0.98 }}
              animate={{ opacity: 1, scale: 1 }}
              className="sm:col-span-2 relative overflow-hidden rounded-2xl border border-dashed border-primary/25 bg-white/[0.03] p-12 text-center"
            >
              <span className="pointer-events-none absolute left-1/2 top-0 size-48 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />
              <div className="relative mx-auto grid size-16 place-items-center rounded-2xl border border-primary/30 bg-primary/10 text-primary animate-float-soft">
                <CreditCard className="size-7" />
              </div>
              <h3 className="relative mt-4 font-medium">
                {methods.length === 0 ? "No saved payment methods yet" : "Nothing in this category"}
              </h3>
              <p className="relative mx-auto mt-1 max-w-sm text-sm text-muted-foreground">
                {methods.length === 0
                  ? "Add a UPI, card or wallet securely — tokenized by Razorpay, ready for one-tap checkout."
                  : "Try a different tab or add a new method."}
              </p>
              {methods.length === 0 && (
                <Link
                  to="/account/payment-methods/add"
                  className="relative mt-5 inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[#ff9a4a] px-5 py-2.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-8px_rgba(255,122,26,0.6)] transition active:scale-95"
                >
                  <Plus className="size-4" /> Add your first payment method
                </Link>
              )}
            </motion.div>
          ) : (
            filtered.map((m) => (
              <MethodCard
                key={m.id}
                m={m}
                busy={busy}
                onDelete={(id) => handle(() => remove(id))}
                onDefault={(id) => handle(() => makeDefault(id))}
              />
            ))
          )}
        </AnimatePresence>
      </div>

      {/* Sticky add button (mobile-first) */}
      <div className="sticky bottom-4 mt-8 flex justify-center">
        <Link
          to="/account/payment-methods/add"
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[#ff9a4a] px-6 py-3 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-8px_rgba(255,122,26,0.6)] transition active:scale-95"
        >
          <Plus className="size-4" />
          Add Payment Method
        </Link>
      </div>

      <p className="mt-3 text-center text-[11px] text-muted-foreground">
        <CheckCircle2 className="inline size-3 text-emerald-400" /> Methods are tokenized securely and synced here in realtime.
      </p>
    </div>
  );
}
