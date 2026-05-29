import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft,
  CreditCard,
  Landmark,
  Loader2,
  Lock,
  ShieldCheck,
  Smartphone,
  Wallet,
  CheckCircle2,
  Sparkles,
  BadgeCheck,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import {
  createTokenizationSetup,
  verifyTokenizationSetup,
} from "@/lib/payment-methods.functions";
import { loadRazorpay, openRazorpay, type RazorpayResponse } from "@/lib/razorpay-loader";

export const Route = createFileRoute("/account_/payment-methods/add")({
  head: () => ({
    meta: [
      { title: "Add Payment Method — FoundOurMarket™" },
      {
        name: "description",
        content:
          "Securely add a UPI, card, wallet or net-banking method with Razorpay tokenization. We never store your CVV.",
      },
    ],
  }),
  component: AddPaymentMethodPage,
});

type MethodKey = "upi" | "card_debit" | "card_credit" | "wallet" | "netbanking";

const METHODS: {
  key: MethodKey;
  title: string;
  subtitle: string;
  icon: typeof CreditCard;
  rzp: Record<string, boolean>;
}[] = [
  { key: "upi", title: "UPI", subtitle: "GPay, PhonePe, Paytm", icon: Smartphone, rzp: { upi: true } },
  { key: "card_debit", title: "Debit Card", subtitle: "Visa, Mastercard, RuPay", icon: CreditCard, rzp: { card: true } },
  { key: "card_credit", title: "Credit Card", subtitle: "Visa, Mastercard, Amex", icon: CreditCard, rzp: { card: true } },
  { key: "wallet", title: "Wallets", subtitle: "Paytm, Freecharge & more", icon: Wallet, rzp: { wallet: true } },
  { key: "netbanking", title: "Net Banking", subtitle: "All major banks", icon: Landmark, rzp: { netbanking: true } },
];

const SECURITY = [
  { icon: ShieldCheck, label: "PCI DSS compliant" },
  { icon: Lock, label: "Bank-grade encryption" },
  { icon: BadgeCheck, label: "Razorpay secured" },
  { icon: Sparkles, label: "Tokenized payments" },
];

function AddPaymentMethodPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const setupFn = useServerFn(createTokenizationSetup);
  const verifyFn = useServerFn(verifyTokenizationSetup);
  const [selected, setSelected] = useState<MethodKey>("upi");
  const [stage, setStage] = useState<"idle" | "processing" | "verifying" | "done">("idle");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  async function start() {
    const method = METHODS.find((m) => m.key === selected)!;
    setStage("processing");
    try {
      await loadRazorpay();
      const setup = await setupFn();
      const rzp = openRazorpay({
        key: setup.keyId,
        amount: setup.amount,
        currency: setup.currency,
        order_id: setup.razorpayOrderId,
        customer_id: setup.customerId,
        save: 1,
        name: "FoundOurMarket™",
        description: "Save payment method (₹2 refundable validation)",
        method: { ...method.rzp, emi: false, paylater: false },
        theme: { color: "#ff7a1a", backdrop_color: "#0a0a0f" },
        prefill: { email: user?.email ?? undefined },
        modal: {
          ondismiss: () => setStage("idle"),
        },
        handler: async (resp: RazorpayResponse) => {
          setStage("verifying");
          try {
            const res = await verifyFn({
              data: {
                razorpayOrderId: resp.razorpay_order_id,
                razorpayPaymentId: resp.razorpay_payment_id,
                razorpaySignature: resp.razorpay_signature,
              },
            });
            setStage("done");
            toast.success(
              res.saved > 0 ? "Payment method saved securely" : "Verified — syncing your method",
            );
            setTimeout(() => nav({ to: "/account/payments" }), 1100);
          } catch (e: any) {
            setStage("idle");
            toast.error(e?.message ?? "Could not save this payment method.");
          }
        },
      });
      rzp.on("payment.failed", () => {
        setStage("idle");
        toast.error("Payment could not be completed.");
      });
      rzp.open();
    } catch (e: any) {
      setStage("idle");
      toast.error(e?.message ?? "Could not start secure setup.");
    }
  }

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const busy = stage === "processing" || stage === "verifying";

  return (
    <div className="container-page py-8 sm:py-14 max-w-3xl pb-[calc(7rem+env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Link to="/account" className="hover:text-foreground transition">Account</Link>
        <span>/</span>
        <Link to="/account/payments" className="hover:text-foreground transition">Payment Methods</Link>
        <span>/</span>
        <span className="text-foreground">Add</span>
      </div>

      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
        className="mt-3 flex items-center gap-3"
      >
        <Link
          to="/account/payments"
          aria-label="Back"
          className="size-10 grid place-items-center rounded-xl border border-white/10 bg-white/5 hover:bg-white/10 transition"
        >
          <ArrowLeft className="size-4" />
        </Link>
        <div>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight">Add a payment method</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Choose a type, then complete a quick secure verification.
          </p>
        </div>
      </motion.div>

      {/* Payment type selection */}
      <div className="mt-7">
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Payment type</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {METHODS.map((m) => {
            const active = selected === m.key;
            return (
              <button
                key={m.key}
                onClick={() => setSelected(m.key)}
                disabled={busy}
                className={`group relative overflow-hidden rounded-2xl border p-4 text-left transition disabled:opacity-60 ${
                  active
                    ? "border-primary/50 bg-primary/10 shadow-[0_8px_40px_-12px_rgba(255,122,26,0.4)]"
                    : "border-white/10 bg-white/[0.03] hover:bg-white/[0.06]"
                }`}
              >
                {active && (
                  <span className="pointer-events-none absolute -right-8 -top-8 size-24 rounded-full bg-primary/25 blur-2xl" />
                )}
                <div className="relative flex items-center gap-3">
                  <span
                    className={`grid size-10 place-items-center rounded-xl border transition ${
                      active ? "border-primary/40 bg-primary/15 text-primary" : "border-white/10 bg-white/5 text-foreground/80"
                    }`}
                  >
                    <m.icon className="size-5" />
                  </span>
                  <div className="min-w-0">
                    <p className="font-medium">{m.title}</p>
                    <p className="text-xs text-muted-foreground">{m.subtitle}</p>
                  </div>
                  {active && <CheckCircle2 className="ml-auto size-5 text-primary" />}
                </div>
              </button>
            );
          })}
          {/* Disabled options */}
          {["EMI", "Pay Later"].map((d) => (
            <div
              key={d}
              className="rounded-2xl border border-dashed border-white/10 bg-white/[0.02] p-4 opacity-50"
            >
              <div className="flex items-center gap-3">
                <span className="grid size-10 place-items-center rounded-xl border border-white/10 bg-white/5">
                  <Lock className="size-4 text-muted-foreground" />
                </span>
                <div>
                  <p className="font-medium">{d}</p>
                  <p className="text-xs text-muted-foreground">Not available</p>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Security section */}
      <div className="mt-7 relative overflow-hidden rounded-2xl border border-emerald-500/25 bg-emerald-500/[0.06] p-5">
        <span className="pointer-events-none absolute -left-10 -top-10 size-40 rounded-full bg-emerald-500/15 blur-3xl" />
        <div className="relative flex items-center gap-2 text-emerald-300">
          <ShieldCheck className="size-5" />
          <h2 className="text-sm font-semibold">Your payment data is protected</h2>
        </div>
        <p className="relative mt-1 text-xs text-emerald-200/80">
          We never store your full card number or CVV. Methods are tokenized through Razorpay.
        </p>
        <div className="relative mt-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
          {SECURITY.map((s) => (
            <div
              key={s.label}
              className="flex items-center gap-2 rounded-xl border border-emerald-500/15 bg-emerald-500/[0.04] px-3 py-2"
            >
              <s.icon className="size-4 shrink-0 text-emerald-400" />
              <span className="text-[11px] text-emerald-100/90">{s.label}</span>
            </div>
          ))}
        </div>
      </div>

      <p className="mt-4 text-center text-[11px] text-muted-foreground">
        A ₹2 validation charge is used to securely tokenize your method and is refunded automatically.
      </p>

      {/* Sticky CTA */}
      <div className="sticky bottom-4 mt-6 flex justify-center">
        <button
          onClick={start}
          disabled={busy}
          className="inline-flex items-center gap-2 rounded-full bg-gradient-to-r from-primary to-[#ff9a4a] px-7 py-3.5 text-sm font-semibold text-primary-foreground shadow-[0_10px_30px_-8px_rgba(255,122,26,0.6)] transition active:scale-95 disabled:opacity-70"
        >
          <AnimatePresence mode="wait" initial={false}>
            {stage === "idle" && (
              <motion.span key="idle" className="inline-flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Lock className="size-4" /> Continue securely
              </motion.span>
            )}
            {stage === "processing" && (
              <motion.span key="p" className="inline-flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="size-4 animate-spin" /> Opening secure checkout…
              </motion.span>
            )}
            {stage === "verifying" && (
              <motion.span key="v" className="inline-flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <Loader2 className="size-4 animate-spin" /> Verifying…
              </motion.span>
            )}
            {stage === "done" && (
              <motion.span key="d" className="inline-flex items-center gap-2" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
                <CheckCircle2 className="size-4" /> Saved!
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>
    </div>
  );
}
