import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, ShieldCheck, MapPin, Plus, Lock, Smartphone, CreditCard,
  Landmark, Wallet, Truck, CheckCircle2, XCircle, RotateCcw, Globe, Sparkles,
  Home, Briefcase, MapPinned, Pencil, Trash2, Star, ArrowRight, Clock,
  PackageCheck, Headphones, BadgeCheck, ShieldHalf, Download,
} from "lucide-react";
import { toast } from "sonner";
import { downloadInvoice } from "@/lib/invoice";
import { motion, AnimatePresence } from "framer-motion";

import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { useAddresses, type Address } from "@/lib/use-addresses";
import { useStoreSettings } from "@/lib/use-store-settings";
import { AddressForm } from "@/components/site/AddressForm";
import { SavedAddressRail } from "@/components/site/SavedAddressRail";
import { SmartDeliveryCard } from "@/components/site/SmartDeliveryCard";
import { createRazorpayOrder, verifyRazorpayPayment, cancelRazorpayOrder, placeCodOrder } from "@/lib/razorpay.functions";
import { buildOrderAttribution } from "@/lib/marketing-tracking";
import { createRazorpayCustomer, syncRazorpayPaymentMethods } from "@/lib/payment-methods.functions";
import { loadRazorpay, openRazorpay, type RazorpayResponse } from "@/lib/razorpay-loader";
import { validatePincode, type ServiceabilityResult } from "@/lib/serviceability.functions";
import { usePaymentGateways } from "@/lib/use-payment-gateways";

export const Route = createFileRoute("/checkout")({
  head: () => ({
    meta: [
      { title: "Secure Checkout — FoundOurMarket™" },
      { name: "description", content: "Whatever you need. All in one place. Complete your order with secure, encrypted Razorpay checkout." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>) => ({
    address: typeof search.address === "string" ? search.address : undefined,
  }),
  component: CheckoutPage,
});

import { computeOrderTotals, formatMoney } from "@/lib/pricing";


type Stage = "review" | "processing" | "verifying" | "success" | "failed";

const ADDRESS_META: Record<string, { icon: typeof Home; label: string }> = {
  home: { icon: Home, label: "Home" },
  work: { icon: Briefcase, label: "Work" },
  other: { icon: MapPinned, label: "Other" },
};

function formatEta(daysFrom: number, daysTo: number) {
  const opts: Intl.DateTimeFormatOptions = { weekday: "short", month: "short", day: "numeric" };
  const a = new Date(Date.now() + daysFrom * 86400000).toLocaleDateString(undefined, opts);
  const b = new Date(Date.now() + daysTo * 86400000).toLocaleDateString(undefined, opts);
  return `${a} – ${b}`;
}

function CheckoutPage() {
  const { user, loading } = useAuth();
  const { detailed, subtotalUSD, clear, count, hydrated: cartHydrated } = useCart();
  const { market, priceOf } = useRegion();
  const fmt = (n: number) => formatMoney(market, n);
  const { internationalLive, loading: gatewaysLoading } = usePaymentGateways();
  const {
    addresses, loading: addrLoading, create: createAddress,
    update: updateAddress, remove: removeAddress, setDefaultShipping,
    defaultShipping, markUsed,
  } = useAddresses();
  const { address: addressParam } = Route.useSearch();
  const { settings } = useStoreSettings();
  const nav = useNavigate();

  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const cancelOrder = useServerFn(cancelRazorpayOrder);
  const placeCodOrderFn = useServerFn(placeCodOrder);
  const ensureCustomer = useServerFn(createRazorpayCustomer);
  const syncMethods = useServerFn(syncRazorpayPaymentMethods);

  const [stage, setStage] = useState<Stage>("review");
  const [error, setError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [payMethod, setPayMethod] = useState<"razorpay" | "cod">("razorpay");
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);
  const [reserveLeft, setReserveLeft] = useState(15 * 60);

  const isIndia = market === "india";

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (!loading && user && cartHydrated && count === 0 && stage !== "success") nav({ to: "/cart" });
  }, [loading, user, cartHydrated, count, nav, stage]);

  useEffect(() => {
    if (selectedAddressId) return;
    if (addressParam && addresses.some((a) => a.id === addressParam)) setSelectedAddressId(addressParam);
    else if (defaultShipping) setSelectedAddressId(defaultShipping.id);
    else if (addresses[0]) setSelectedAddressId(addresses[0].id);
  }, [addresses, defaultShipping, selectedAddressId, addressParam]);

  // Preload the Razorpay SDK for snappier checkout
  useEffect(() => {
    if (isIndia) loadRazorpay().catch(() => {});
  }, [isIndia]);

  // Stock reservation countdown
  useEffect(() => {
    if (stage !== "review") return;
    const t = setInterval(() => setReserveLeft((s) => (s > 0 ? s - 1 : 0)), 1000);
    return () => clearInterval(t);
  }, [stage]);

  const selectedAddress: Address | undefined = addresses.find((a) => a.id === selectedAddressId);

  // Realtime pincode serviceability for the selected address
  const checkPincode = useServerFn(validatePincode);
  const [service, setService] = useState<ServiceabilityResult | null>(null);
  const [serviceChecking, setServiceChecking] = useState(false);
  const selectedPostal = selectedAddress?.postal ?? null;

  useEffect(() => {
    if (!selectedPostal) {
      setService(null);
      setServiceChecking(false);
      return;
    }
    let cancelled = false;
    setService(null);
    setServiceChecking(true);
    checkPincode({ data: { postal: selectedPostal } })
      .then((r) => { if (!cancelled) setService(r); })
      .catch(() => { if (!cancelled) setService(null); })
      .finally(() => { if (!cancelled) setServiceChecking(false); });
    return () => { cancelled = true; };
  }, [selectedPostal, checkPincode]);

  const serviceable = service?.serviceable === true;
  // Allow checkout when verified OR when the lookup service is temporarily down.
  const allowProceed = service?.allowProceed === true;
  const serviceDown = service?.status === "service_down";

  // Force COD off if admin disabled it
  useEffect(() => {
    if (!settings.cod_enabled && payMethod === "cod") setPayMethod("razorpay");
  }, [settings.cod_enabled, payMethod]);

  // Region-native totals — identical math to the server re-pricer, no conversion.
  const totals = computeOrderTotals(market, subtotalUSD);
  const subtotalINR = totals.subtotal;
  const shippingINR = totals.shipping;
  const taxINR = totals.tax;
  const totalINR = totals.total;
  const savingsINR = totals.shipping === 0 ? (market === "india" ? 99 : 9.99) : 0;
  const itemsCount = useMemo(() => detailed.reduce((s, i) => s + i.qty, 0), [detailed]);

  const eta = formatEta(3, 5);
  const reserveMin = String(Math.floor(reserveLeft / 60)).padStart(2, "0");
  const reserveSec = String(reserveLeft % 60).padStart(2, "0");

  async function payWithRazorpay() {
    if (!user || !selectedAddress) {
      setError("Please select or add a shipping address.");
      return;
    }
    setError(null);
    setStage("processing");
    try {
      await loadRazorpay();
      const created = await createOrder({
        data: {
          items: detailed.map((i) => ({ slug: i.slug, qty: i.qty })),
          addressId: selectedAddress.id,
          promoCode: null,
          attribution: buildOrderAttribution(),
        },
      });

      let customerId: string | undefined;
      try {
        const c = await ensureCustomer();
        customerId = c.customerId;
      } catch {
        /* saving methods is optional — continue checkout regardless */
      }

      const rzp = openRazorpay({
        key: created.keyId,
        amount: created.amount,
        currency: created.currency,
        order_id: created.razorpayOrderId,
        name: "FoundOurMarket™",
        description: `Order ${created.orderId.slice(0, 8)}`,
        ...(customerId ? { customer_id: customerId, save: 1 } : {}),
        prefill: {
          name: selectedAddress.full_name,
          email: user.email ?? undefined,
          contact: selectedAddress.phone ?? undefined,
        },
        notes: { order_id: created.orderId },
        theme: { color: "#ff7a1a", backdrop_color: "#0a0a0f" },
        method: { emi: false, paylater: false },
        modal: {
          ondismiss: () => {
            setStage("failed");
            setError("Payment was cancelled. Your cart is safe — you can try again.");
            cancelOrder({ data: { orderId: created.orderId } }).catch(() => {});
          },
        },
        handler: async (response: RazorpayResponse) => {
          setStage("verifying");
          try {
            await verifyPayment({
              data: {
                orderId: created.orderId,
                razorpayOrderId: response.razorpay_order_id,
                razorpayPaymentId: response.razorpay_payment_id,
                razorpaySignature: response.razorpay_signature,
              },
            });
            setPlacedOrderId(created.orderId);
            setStage("success");
            clear();
            if (selectedAddress) markUsed(selectedAddress.id).catch(() => {});
            syncMethods().catch(() => {});
          } catch (e: any) {
            setStage("failed");
            setError(e?.message ?? "We couldn't verify your payment. If charged, it will auto-resolve.");
          }
        },
      });

      rzp.on("payment.failed", (resp: any) => {
        setStage("failed");
        setError(resp?.error?.description ?? "Payment failed. Please try again.");
        cancelOrder({ data: { orderId: created.orderId } }).catch(() => {});
      });

      rzp.open();
    } catch (e: any) {
      setStage("failed");
      setError(e?.message ?? "Could not start checkout. Please retry.");
    }
  }

  async function placeCod() {
    if (!user || !selectedAddress) {
      setError("Please select or add a shipping address.");
      return;
    }
    setError(null);
    setStage("processing");
    try {
      // Order totals and line prices are computed server-side from trusted
      // database prices — never from client state (anti price-tampering).
      const placed = await placeCodOrderFn({
        data: {
          items: detailed.map((i) => ({ slug: i.slug, qty: i.qty })),
          addressId: selectedAddress.id,
          promoCode: null,
          attribution: buildOrderAttribution(),
        },
      });

      setPlacedOrderId(placed.orderId);
      setStage("success");
      clear();
      if (selectedAddress) markUsed(selectedAddress.id).catch(() => {});
    } catch (e: any) {
      setStage("failed");
      setError(e?.message ?? "Could not place your COD order.");
    }
  }


  const placeOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!allowProceed) {
      setError(service?.message ?? "This address isn't serviceable yet.");
      return;
    }
    import("@/lib/visitor").then((m) => m.trackEvent("checkout_start", {
      value: totalINR, metadata: { pay_method: payMethod },
    })).catch(() => {});
    if (payMethod === "cod") placeCod();
    else payWithRazorpay();
  };

  useEffect(() => {
    if (stage === "success") {
      import("@/lib/visitor").then((m) => m.trackEvent("purchase", {
        value: totalINR, metadata: { order_id: placedOrderId, pay_method: payMethod },
      })).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stage]);

  const busy = stage === "processing" || stage === "verifying";
  const ctaLabel = stage === "processing"
    ? "Opening payment…"
    : stage === "verifying"
      ? "Verifying…"
      : payMethod === "cod"
        ? "Place order"
        : `Pay ${fmt(totalINR)}`;

  if (loading || !user || !cartHydrated) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  /* ---------- terminal states ---------- */
  if (stage === "success") {
    return <SuccessScreen orderId={placedOrderId} totalINR={totalINR} market={market} method={payMethod} eta={eta} nav={nav} />;
  }

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-7 sm:py-16 pb-[calc(7.5rem+env(safe-area-inset-bottom))] lg:pb-16">
      <Atmosphere />

      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-2.5">Secure Checkout</p>
      <h1 className="text-fluid-2xl font-display font-semibold mb-4 sm:mb-6 tracking-tight">Almost yours</h1>

      {!isIndia ? (
        <InternationalSoon live={internationalLive} loading={gatewaysLoading} />
      ) : (
        <>
          <div className="mb-6 sm:mb-9 flex flex-wrap items-center gap-2">
            <div className="inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 py-1.5">
              <Lock className="size-3 text-emerald-400 shrink-0" />
              <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400">256-bit secured · INR</p>
            </div>
            {selectedAddress && serviceChecking && (
              <div className="inline-flex items-center gap-2 glass border border-white/10 rounded-full px-3 py-1.5">
                <Loader2 className="size-3 text-accent shrink-0 animate-spin" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Checking pincode {selectedAddress.postal}…
                </p>
              </div>
            )}
            {selectedAddress && !serviceChecking && serviceable && (
              <div className="inline-flex items-center gap-2 glass border border-white/10 rounded-full px-3 py-1.5">
                <MapPin className="size-3 text-accent shrink-0" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                  Delivering to {service?.city ?? selectedAddress.city} {selectedAddress.postal}
                </p>
              </div>
            )}
            {selectedAddress && !serviceChecking && serviceDown && (
              <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/30 rounded-full px-3 py-1.5">
                <Loader2 className="size-3 text-amber-400 shrink-0" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-amber-400">
                  Verification unavailable · we'll confirm before dispatch
                </p>
              </div>
            )}
            {selectedAddress && !serviceChecking && service && !serviceable && !serviceDown && (
              <div className="inline-flex items-center gap-2 bg-destructive/10 border border-destructive/30 rounded-full px-3 py-1.5">
                <XCircle className="size-3 text-destructive shrink-0" />
                <p className="text-[10px] font-mono uppercase tracking-widest text-destructive">
                  {service.message}
                </p>
              </div>
            )}
          </div>

          <form onSubmit={placeOrder} className="grid lg:grid-cols-3 gap-6 lg:gap-12">
            <div className="lg:col-span-2 space-y-5 sm:space-y-6">
              {/* Reservation strip */}
              <motion.div
                initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className="flex items-center gap-2.5 rounded-xl border border-accent/20 bg-accent/[0.06] px-4 py-2.5">
                <Clock className="size-3.5 text-accent shrink-0" />
                <p className="text-xs text-muted-foreground">
                  Items reserved for{" "}
                  <span className="font-mono text-accent tabular-nums">{reserveMin}:{reserveSec}</span>
                </p>
              </motion.div>

              {/* Shipping address */}
              <section className="glass border border-white/10 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm uppercase tracking-widest font-medium inline-flex items-center gap-2">
                    <MapPin className="size-4 text-accent" /> Shipping address
                  </h2>
                  {!addingAddress && !editingId && (
                    <button type="button" onClick={() => setAddingAddress(true)}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5 transition-colors active:scale-95">
                      <Plus className="size-3" /> New
                    </button>
                  )}
                </div>

                {addrLoading ? (
                  <div className="space-y-3">
                    <div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />
                    <div className="h-24 rounded-2xl bg-white/[0.03] animate-pulse" />
                  </div>
                ) : addingAddress || addresses.length === 0 ? (
                  <AddressForm
                    onSubmit={async (input) => {
                      const created = await createAddress({ ...input, is_default_shipping: addresses.length === 0 ? true : input.is_default_shipping });
                      setSelectedAddressId(created.id);
                      setAddingAddress(false);
                    }}
                    onCancel={addresses.length > 0 ? () => setAddingAddress(false) : undefined}
                    submitLabel="Save & use this address"
                  />
                ) : editingId ? (
                  <AddressForm
                    initial={addresses.find((a) => a.id === editingId)}
                    onSubmit={async (input) => {
                      await updateAddress(editingId, input);
                      setEditingId(null);
                    }}
                    onCancel={() => setEditingId(null)}
                    submitLabel="Save changes"
                  />
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {addresses.map((a) => {
                      const meta = ADDRESS_META[a.address_type] ?? ADDRESS_META.other;
                      const Icon = meta.icon;
                      const active = selectedAddressId === a.id;
                      return (
                        <motion.button
                          key={a.id} type="button" onClick={() => setSelectedAddressId(a.id)}
                          whileTap={{ scale: 0.98 }}
                          className={`relative text-left border rounded-2xl p-4 transition-all duration-300 ${active ? "border-accent bg-accent/[0.07] shadow-[0_0_0_1px_var(--color-accent),0_12px_30px_-12px_color-mix(in_oklab,var(--color-accent)_45%,transparent)]" : "border-white/10 hover:border-accent/40"}`}>
                          <div className="flex items-center gap-2 mb-1.5">
                            <span className={`size-6 grid place-items-center rounded-lg ${active ? "bg-accent/15 text-accent" : "bg-white/[0.04] text-muted-foreground"}`}>
                              <Icon className="size-3.5" />
                            </span>
                            <span className="text-[10px] font-mono uppercase tracking-widest text-accent">{a.nickname || meta.label}</span>
                            {a.is_default_shipping && (
                              <span className="text-[9px] font-mono uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1">
                                <Star className="size-2.5 fill-current" /> Default
                              </span>
                            )}
                            <AnimatePresence>
                              {active && (
                                <motion.span
                                  initial={{ scale: 0, opacity: 0 }} animate={{ scale: 1, opacity: 1 }} exit={{ scale: 0, opacity: 0 }}
                                  className="ml-auto text-accent">
                                  <CheckCircle2 className="size-4" />
                                </motion.span>
                              )}
                            </AnimatePresence>
                          </div>
                          <p className="text-sm font-medium">{a.full_name}</p>
                          <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                            {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                            {a.city}{a.state ? `, ${a.state}` : ""} {a.postal}
                          </p>
                          <div className="mt-2.5 inline-flex items-center gap-1.5 text-[10px] text-emerald-400">
                            <PackageCheck className="size-3" /> Delivers {eta}
                          </div>
                          <div className="mt-3 flex items-center gap-3 text-[10px] uppercase tracking-widest text-muted-foreground">
                            <span onClick={(e) => { e.stopPropagation(); setEditingId(a.id); }}
                              className="inline-flex items-center gap-1 hover:text-foreground transition-colors cursor-pointer">
                              <Pencil className="size-2.5" /> Edit
                            </span>
                            {!a.is_default_shipping && (
                              <span onClick={(e) => { e.stopPropagation(); setDefaultShipping(a.id).catch(() => {}); }}
                                className="inline-flex items-center gap-1 hover:text-emerald-400 transition-colors cursor-pointer">
                                <Star className="size-2.5" /> Default
                              </span>
                            )}
                            {addresses.length > 1 && (
                              <span onClick={(e) => { e.stopPropagation(); removeAddress(a.id).catch(() => {}); }}
                                className="inline-flex items-center gap-1 hover:text-destructive transition-colors cursor-pointer ml-auto">
                                <Trash2 className="size-2.5" /> Delete
                              </span>
                            )}
                          </div>
                        </motion.button>
                      );
                    })}
                  </div>
                )}
              </section>

              {/* Payment method */}
              <section className="glass border border-white/10 rounded-2xl p-5 sm:p-6">
                <h2 className="text-sm uppercase tracking-widest font-medium mb-4 inline-flex items-center gap-2">
                  <CreditCard className="size-4 text-accent" /> Payment method
                </h2>

                <motion.button type="button" onClick={() => setPayMethod("razorpay")} whileTap={{ scale: 0.99 }}
                  className={`w-full text-left border rounded-2xl p-4 transition-all duration-300 ${payMethod === "razorpay" ? "border-accent bg-accent/[0.07] shadow-[0_0_0_1px_var(--color-accent),0_14px_34px_-14px_color-mix(in_oklab,var(--color-accent)_50%,transparent)]" : "border-white/10 hover:border-accent/40"}`}>
                  <div className="flex items-center gap-2.5">
                    <span className={`size-4 grid place-items-center rounded-full border ${payMethod === "razorpay" ? "border-accent" : "border-muted-foreground/40"}`}>
                      <AnimatePresence>
                        {payMethod === "razorpay" && (
                          <motion.span initial={{ scale: 0 }} animate={{ scale: 1 }} exit={{ scale: 0 }} className="size-2 rounded-full bg-accent" />
                        )}
                      </AnimatePresence>
                    </span>
                    <span className="text-sm font-medium">Pay online</span>
                    <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-emerald-400 inline-flex items-center gap-1">
                      <BadgeCheck className="size-3" /> Recommended
                    </span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-1.5">
                    <UpiPill name="GPay" colors={["#1a73e8", "#ea4335", "#fbbc04", "#34a853"]} />
                    <UpiPill name="PhonePe" colors={["#5f259f", "#5f259f"]} />
                    <UpiPill name="Paytm" colors={["#00baf2", "#002970"]} />
                    <Tag icon={<Smartphone className="size-3" />} label="UPI" />
                    <Tag icon={<CreditCard className="size-3" />} label="Cards" />
                    <Tag icon={<Landmark className="size-3" />} label="Net Banking" />
                    <Tag icon={<Wallet className="size-3" />} label="Wallets" />
                  </div>
                  <div className="mt-3 flex items-center gap-1.5 text-[10px] text-muted-foreground">
                    <ShieldCheck className="size-3 text-emerald-400" /> End-to-end encrypted · Powered by Razorpay
                  </div>
                </motion.button>

                <div className={`mt-3 w-full text-left border rounded-2xl p-4 transition-all duration-300 ${!settings.cod_enabled ? "opacity-50" : payMethod === "cod" ? "border-accent bg-accent/[0.07]" : "border-white/10"}`}>
                  <button type="button" disabled={!settings.cod_enabled} onClick={() => setPayMethod("cod")}
                    className="w-full text-left disabled:cursor-not-allowed">
                    <div className="flex items-center gap-2.5">
                      <span className={`size-4 grid place-items-center rounded-full border ${payMethod === "cod" ? "border-accent" : "border-muted-foreground/40"}`}>
                        {payMethod === "cod" && <span className="size-2 rounded-full bg-accent" />}
                      </span>
                      <Truck className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Cash on Delivery</span>
                      <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {settings.cod_enabled ? "Available" : "Unavailable"}
                      </span>
                    </div>
                  </button>
                </div>

                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[9px] font-mono uppercase tracking-widest text-muted-foreground">
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1"><ShieldHalf className="size-3 text-emerald-400" /> PCI-DSS</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 opacity-50"><CreditCard className="size-3" /> EMI off</span>
                  <span className="inline-flex items-center gap-1 rounded-full border border-white/10 px-2 py-1 opacity-50"><Clock className="size-3" /> Pay Later off</span>
                </div>
              </section>

              {/* Trust & security */}
              <section className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                <TrustCard icon={<ShieldHalf className="size-4" />} title="PCI-DSS" sub="Compliant" />
                <TrustCard icon={<Lock className="size-4" />} title="Encrypted" sub="256-bit SSL" />
                <TrustCard icon={<BadgeCheck className="size-4" />} title="Razorpay" sub="Verified" />
                <TrustCard icon={<RotateCcw className="size-4" />} title="Easy returns" sub="7-day window" />
                <TrustCard icon={<Headphones className="size-4" />} title="Fast support" sub="24/7 help" />
                <TrustCard icon={<PackageCheck className="size-4" />} title="Tracked" sub="Real-time" />
              </section>

              {error && stage === "review" && (
                <p className="text-xs text-destructive flex items-center gap-1.5"><XCircle className="size-3.5" />{error}</p>
              )}
            </div>

            {/* Summary */}
            <aside>
              <div className="glass border border-white/10 rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
                <div className="flex items-center justify-between mb-5">
                  <h2 className="text-lg font-medium">Summary</h2>
                  <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{itemsCount} item{itemsCount !== 1 ? "s" : ""}</span>
                </div>

                <ul className="space-y-3 mb-5 max-h-56 overflow-y-auto pr-1">
                  {detailed.map((i) => (
                    <li key={i.slug} className="flex items-center gap-3 text-sm">
                      <img src={i.product.image} alt="" loading="lazy" className="size-12 rounded-lg object-cover bg-black/30 shrink-0" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{i.product.name}</p>
                        <p className="text-xs text-muted-foreground">× {i.qty}</p>
                      </div>
                      <span className="font-mono text-xs">{fmt(priceOf(i.product) * i.qty)}</span>
                    </li>
                  ))}
                </ul>

                {savingsINR > 0 && (
                  <div className="mb-4 flex items-center justify-between rounded-xl bg-emerald-500/10 border border-emerald-500/25 px-3.5 py-2.5">
                    <span className="text-xs font-medium text-emerald-400 inline-flex items-center gap-1.5"><Sparkles className="size-3.5" /> You saved</span>
                    <span className="font-mono text-sm text-emerald-400">{fmt(savingsINR)}</span>
                  </div>
                )}

                <dl className="space-y-2.5 text-sm border-t border-white/10 pt-4">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{fmt(subtotalINR)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="font-mono">{shippingINR === 0 ? <span className="text-emerald-400">Free</span> : fmt(shippingINR)}</dd></div>
                  <div className="flex justify-between">
                    <dt className="text-muted-foreground inline-flex items-center gap-1">Tax<span className="text-[10px] text-muted-foreground/70">({market === "india" ? "18% GST" : "8%"} est.)</span></dt>
                    <dd className="font-mono">{fmt(taxINR)}</dd>
                  </div>
                  <div className="border-t border-white/10 pt-3 flex justify-between items-end">
                    <dt className="font-medium text-base">Total</dt>
                    <dd className="text-right">
                      <span className="block font-mono text-2xl font-semibold text-accent leading-none">{fmt(totalINR)}</span>
                      <span className="block text-[10px] text-muted-foreground mt-1">Incl. all taxes</span>
                    </dd>
                  </div>
                </dl>

                <div className="mt-4 flex items-center gap-1.5 text-[11px] text-muted-foreground">
                  <PackageCheck className="size-3.5 text-accent" /> Estimated delivery {eta}
                </div>

                {/* Desktop CTA */}
                <button disabled={!selectedAddress || busy || (!allowProceed && !serviceChecking)}
                  className="hidden lg:inline-flex w-full mt-5 group relative overflow-hidden bg-accent text-accent-foreground font-bold py-3.5 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 items-center justify-center gap-2">
                  {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-3.5" />}
                  <span>{selectedAddress && !allowProceed ? (serviceChecking ? "Checking delivery…" : "Not deliverable") : ctaLabel}</span>
                  {!busy && <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-1" />}
                </button>

                <p className="hidden lg:flex text-[10px] text-muted-foreground text-center mt-3 font-mono uppercase tracking-widest items-center justify-center gap-1.5 w-full">
                  <ShieldCheck className="size-3" /> Encrypted · PCI-DSS · 7-day returns
                </p>
              </div>
            </aside>

            {/* Mobile sticky CTA */}
            <div className="lg:hidden fixed inset-x-0 bottom-0 z-40 px-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] pt-2 pointer-events-none">
              <div className="pointer-events-auto rounded-2xl border border-white/12 p-2.5"
                style={{ background: "color-mix(in oklab, var(--color-background) 78%, transparent)", backdropFilter: "blur(28px) saturate(160%)", boxShadow: "0 16px 40px -16px color-mix(in oklab, var(--color-accent) 45%, transparent)" }}>
                <div className="flex items-center gap-3">
                  <div className="pl-1.5 min-w-0">
                    <p className="text-[9px] font-mono uppercase tracking-widest text-muted-foreground">Total · {itemsCount} item{itemsCount !== 1 ? "s" : ""}</p>
                    <p className="font-mono text-lg font-semibold text-accent leading-tight truncate">{fmt(totalINR)}</p>
                  </div>
                  <button disabled={!selectedAddress || busy || (!allowProceed && !serviceChecking)}
                    className="ml-auto group inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-3 rounded-xl text-xs uppercase tracking-widest hover:brightness-110 active:scale-[0.98] transition-all disabled:opacity-60 shrink-0">
                    {busy ? <Loader2 className="size-4 animate-spin" /> : <Lock className="size-3.5" />}
                    <span>{selectedAddress && !allowProceed ? (serviceChecking ? "Checking…" : "Not deliverable") : stage === "processing" ? "Opening…" : stage === "verifying" ? "Verifying…" : payMethod === "cod" ? "Place order" : "Pay now"}</span>
                    {!busy && <ArrowRight className="size-3.5 transition-transform group-hover:translate-x-0.5" />}
                  </button>
                </div>
              </div>
            </div>
          </form>
        </>
      )}

      {/* Processing / failed overlay */}
      <AnimatePresence>
        {(stage === "processing" || stage === "verifying" || stage === "failed") && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-md px-6">
            <motion.div initial={{ scale: 0.94, y: 12 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.94, opacity: 0 }}
              className="glass-strong border border-white/10 rounded-3xl p-8 max-w-sm w-full text-center">
              {stage === "failed" ? (
                <>
                  <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full bg-destructive/10 border border-destructive/30">
                    <XCircle className="size-6 text-destructive" />
                  </div>
                  <h3 className="text-lg font-display font-semibold mb-1.5">Payment not completed</h3>
                  <p className="text-sm text-muted-foreground mb-6">{error ?? "Something went wrong. Your cart is safe."}</p>
                  <div className="flex flex-col gap-2">
                    <button onClick={() => { setError(null); if (payMethod === "cod") placeCod(); else payWithRazorpay(); }}
                      className="w-full bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 inline-flex items-center justify-center gap-2">
                      <RotateCcw className="size-3.5" /> Retry payment
                    </button>
                    <button onClick={() => { setStage("review"); setError(null); }}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-2">
                      Review order
                    </button>
                    <Link to="/cart" className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-2">Back to cart</Link>
                  </div>
                </>
              ) : (
                <>
                  <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full bg-accent/10 border border-accent/30">
                    <Loader2 className="size-6 text-accent animate-spin" />
                  </div>
                  <h3 className="text-lg font-display font-semibold mb-1.5">
                    {stage === "verifying" ? "Verifying payment" : "Opening secure payment"}
                  </h3>
                  <p className="text-sm text-muted-foreground">
                    {stage === "verifying" ? "Confirming your transaction with our servers…" : "Do not close this window."}
                  </p>
                </>
              )}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function Tag({ icon, label }: { icon: React.ReactNode; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1 text-[10px] text-muted-foreground">
      {icon}{label}
    </span>
  );
}

function UpiPill({ name, colors }: { name: string; colors: string[] }) {
  return (
    <span className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.05] px-2 py-1 text-[10px] font-medium">
      <span className="flex -space-x-0.5">
        {colors.map((c, i) => (
          <span key={i} className="size-1.5 rounded-full ring-1 ring-background" style={{ background: c }} />
        ))}
      </span>
      {name}
    </span>
  );
}

function TrustCard({ icon, title, sub }: { icon: React.ReactNode; title: string; sub: string }) {
  return (
    <motion.div whileHover={{ y: -2 }}
      className="glass border border-white/10 rounded-xl p-3 flex items-center gap-2.5">
      <span className="size-8 grid place-items-center rounded-lg bg-accent/10 text-accent shrink-0">{icon}</span>
      <div className="min-w-0">
        <p className="text-xs font-medium leading-tight truncate">{title}</p>
        <p className="text-[10px] text-muted-foreground truncate">{sub}</p>
      </div>
    </motion.div>
  );
}

function Atmosphere() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="orb animate-mesh" style={{ top: "-12%", left: "-6%", width: "46vw", height: "46vw", background: "var(--gradient-ember-soft)" }} />
      <div className="orb animate-mesh" style={{ bottom: "-16%", right: "-10%", width: "52vw", height: "52vw", background: "var(--gradient-ember-soft)", animationDelay: "-7s" }} />
    </div>
  );
}

function InternationalSoon({ live, loading }: { live: boolean; loading: boolean }) {
  if (loading) {
    return (
      <div className="min-h-[30vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (live) {
    // A gateway (Stripe / PayPal) is connected — international checkout unlocked.
    return (
      <div className="glass border border-emerald-500/20 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto">
        <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
          <ShieldCheck className="size-6 text-emerald-400" />
        </div>
        <h2 className="text-xl font-display font-semibold mb-2">International checkout is ready</h2>
        <p className="text-sm text-muted-foreground mb-6">
          Secure global payments are now available. Continue to complete your order in USD.
        </p>
        <Link to="/cart" className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold py-3 px-6 rounded-full text-xs uppercase tracking-widest hover:brightness-110">
          <Sparkles className="size-3.5" /> Continue to payment
        </Link>
      </div>
    );
  }

  return (
    <div className="glass border border-white/10 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto">
      <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full bg-accent/10 border border-accent/30">
        <Globe className="size-6 text-accent" />
      </div>
      <h2 className="text-xl font-display font-semibold mb-2">International checkout is temporarily unavailable.</h2>
      <p className="text-sm text-muted-foreground mb-6">
        You can keep adding items to your cart, wishlist and account — global checkout
        with multi-currency support will be enabled here shortly.
      </p>
      <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
        <Link to="/cart" className="inline-flex items-center gap-2 glass border border-white/10 text-foreground font-bold py-3 px-6 rounded-full text-xs uppercase tracking-widest hover:border-accent/40">
          <Wallet className="size-3.5" /> View cart
        </Link>
        <Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold py-3 px-6 rounded-full text-xs uppercase tracking-widest hover:brightness-110">
          <Sparkles className="size-3.5" /> Continue browsing
        </Link>
      </div>
    </div>
  );
}

function SuccessScreen({ orderId, totalINR, market, method, eta, nav }: {
  orderId: string | null; totalINR: number; market: "india" | "international";
  method: "razorpay" | "cod"; eta: string;
  nav: ReturnType<typeof useNavigate>;
}) {
  const inrFmt = (n: number) => formatMoney(market, n);
  const [downloading, setDownloading] = useState(false);
  return (
    <div className="relative min-h-[70vh] grid place-items-center px-6">
      <Atmosphere />
      <motion.div initial={{ opacity: 0, y: 16 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
        className="glass-strong border border-white/10 rounded-3xl p-8 sm:p-10 max-w-md w-full text-center">
        <motion.div initial={{ scale: 0 }} animate={{ scale: 1 }} transition={{ type: "spring", stiffness: 220, damping: 16, delay: 0.1 }}
          className="size-16 mx-auto mb-6 grid place-items-center rounded-full bg-emerald-500/10 border border-emerald-500/30">
          <CheckCircle2 className="size-7 text-emerald-400" />
        </motion.div>
        <h1 className="text-2xl font-display font-semibold mb-1.5">
          {method === "cod" ? "Order confirmed" : "Payment successful"}
        </h1>
        <p className="text-sm text-muted-foreground mb-6">
          {method === "cod" ? "Pay in cash when your order arrives." : "Your payment has been verified and your order is being prepared."}
        </p>
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] p-4 text-left space-y-2 mb-6">
          <Row label="Order" value={orderId ? `#${orderId.slice(0, 8)}` : "—"} />
          <Row label="Amount" value={inrFmt(totalINR)} />
          <Row label="Method" value={method === "cod" ? "Cash on Delivery" : "Razorpay"} />
          <Row label="Est. delivery" value={eta} />
        </div>
        <div className="flex flex-col gap-2">
          {orderId && (
            <button onClick={() => nav({ to: "/orders/$id", params: { id: orderId } })}
              className="w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110">
              <Truck className="size-3.5" /> Track your order
            </button>
          )}
          {orderId && (
            <button
              onClick={async () => {
                setDownloading(true);
                const ok = await downloadInvoice(orderId);
                if (!ok) toast.error("Couldn't generate invoice. Please try from your order page.");
                setDownloading(false);
              }}
              disabled={downloading}
              className="w-full inline-flex items-center justify-center gap-2 glass border border-white/10 text-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:border-accent/40 disabled:opacity-60">
              {downloading ? <Loader2 className="size-3.5 animate-spin" /> : <Download className="size-3.5" />}
              {downloading ? "Preparing…" : "Download invoice"}
            </button>
          )}
          <button onClick={() => nav({ to: "/" })}
            className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground py-2">
            Continue shopping
          </button>
        </div>
      </motion.div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between text-sm">
      <span className="text-muted-foreground text-xs uppercase tracking-widest">{label}</span>
      <span className="font-mono">{value}</span>
    </div>
  );
}
