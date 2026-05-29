import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  Loader2, ShieldCheck, MapPin, Plus, Lock, Smartphone, CreditCard,
  Landmark, Wallet, Truck, CheckCircle2, XCircle, RotateCcw, Globe, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { useAddresses, type Address } from "@/lib/use-addresses";
import { useStoreSettings } from "@/lib/use-store-settings";
import { AddressForm } from "@/components/site/AddressForm";
import { createRazorpayOrder, verifyRazorpayPayment, cancelRazorpayOrder } from "@/lib/razorpay.functions";
import { createRazorpayCustomer, syncRazorpayPaymentMethods } from "@/lib/payment-methods.functions";
import { loadRazorpay, openRazorpay, type RazorpayResponse } from "@/lib/razorpay-loader";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — FoundOurMarket™" }] }),
  validateSearch: (search: Record<string, unknown>) => ({
    address: typeof search.address === "string" ? search.address : undefined,
  }),
  component: CheckoutPage,
});

const USD_TO_INR = 83;
const toInr = (usd: number) => Math.round(usd * USD_TO_INR);
const inrFmt = (v: number) => `₹${Math.round(v).toLocaleString("en-IN")}`;

type Stage = "review" | "processing" | "verifying" | "success" | "failed";

function CheckoutPage() {
  const { user, loading } = useAuth();
  const { detailed, subtotalUSD, clear, count } = useCart();
  const { region } = useRegion();
  const { addresses, loading: addrLoading, create: createAddress, defaultShipping, markUsed } = useAddresses();
  const { address: addressParam } = Route.useSearch();
  const { settings } = useStoreSettings();
  const nav = useNavigate();

  const createOrder = useServerFn(createRazorpayOrder);
  const verifyPayment = useServerFn(verifyRazorpayPayment);
  const cancelOrder = useServerFn(cancelRazorpayOrder);
  const ensureCustomer = useServerFn(createRazorpayCustomer);
  const syncMethods = useServerFn(syncRazorpayPaymentMethods);


  const [stage, setStage] = useState<Stage>("review");
  const [error, setError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [payMethod, setPayMethod] = useState<"razorpay" | "cod">("razorpay");
  const [promoInput, setPromoInput] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ code: string; kind: "percent" | "fixed"; value: number } | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<string | null>(null);

  const isIndia = region === "IN";

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (count === 0 && stage !== "success") nav({ to: "/cart" });
  }, [count, nav, stage]);

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

  const selectedAddress: Address | undefined = addresses.find((a) => a.id === selectedAddressId);

  // Force COD off if admin disabled it
  useEffect(() => {
    if (!settings.cod_enabled && payMethod === "cod") setPayMethod("razorpay");
  }, [settings.cod_enabled, payMethod]);

  const shippingUSD = subtotalUSD > 50 ? 0 : 9.99;
  const taxUSD = subtotalUSD * 0.08;
  const discountUSD = promo
    ? Math.min(subtotalUSD, promo.kind === "percent" ? +(subtotalUSD * (promo.value / 100)).toFixed(2) : promo.value)
    : 0;
  const totalUSD = Math.max(0, subtotalUSD + shippingUSD + taxUSD - discountUSD);

  const subtotalINR = toInr(subtotalUSD);
  const shippingINR = toInr(shippingUSD);
  const taxINR = toInr(taxUSD);
  const discountINR = toInr(discountUSD);
  const totalINR = Math.max(0, subtotalINR + shippingINR + taxINR - discountINR);

  async function applyPromo() {
    const code = promoInput.trim().toUpperCase();
    if (!code) return;
    setPromoBusy(true);
    setPromoError(null);
    const { data, error } = await supabase
      .from("promo_codes")
      .select("code,kind,value,min_subtotal,max_uses,uses")
      .ilike("code", code)
      .maybeSingle();
    setPromoBusy(false);
    if (error || !data) { setPromoError("Invalid or expired code"); return; }
    if (Number(data.min_subtotal) > subtotalUSD) {
      setPromoError(`Requires subtotal of at least $${Number(data.min_subtotal).toFixed(2)}`); return;
    }
    if (data.max_uses != null && data.uses >= data.max_uses) {
      setPromoError("This code has reached its usage limit"); return;
    }
    setPromo({ code: data.code, kind: data.kind as "percent" | "fixed", value: Number(data.value) });
  }

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
          promoCode: promo?.code ?? null,
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
      const shippingSnapshot = {
        full_name: selectedAddress.full_name,
        phone: selectedAddress.phone,
        line1: selectedAddress.line1,
        line2: selectedAddress.line2,
        city: selectedAddress.city,
        state: selectedAddress.state,
        postal: selectedAddress.postal,
        country: selectedAddress.country,
      };
      const { data: order, error: oErr } = await supabase
        .from("orders")
        .insert({
          user_id: user.id,
          status: "confirmed",
          currency: "INR",
          subtotal: subtotalINR,
          shipping: shippingINR,
          tax: taxINR,
          discount: discountINR,
          promo_code: promo?.code ?? null,
          total: totalINR,
          contact_email: user.email,
          shipping_address: shippingSnapshot,
          payment_method: "cod",
          payment_status: "pending",
        })
        .select("id")
        .single();
      if (oErr) throw oErr;

      const items = detailed.map((i) => ({
        order_id: order.id,
        product_slug: i.slug,
        name: i.product.name,
        image: i.product.image,
        unit_price: toInr(i.product.price),
        quantity: i.qty,
        line_total: toInr(i.product.price) * i.qty,
      }));
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      setPlacedOrderId(order.id);
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
    if (payMethod === "cod") placeCod();
    else payWithRazorpay();
  };

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  /* ---------- terminal states ---------- */
  if (stage === "success") {
    return <SuccessScreen orderId={placedOrderId} totalINR={totalINR} method={payMethod} nav={nav} />;
  }

  return (
    <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      <Atmosphere />

      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Secure Checkout</p>
      <h1 className="text-fluid-2xl font-display font-semibold mb-5 sm:mb-6">Almost yours</h1>

      {!isIndia ? (
        <InternationalSoon />
      ) : (
        <>
          <div className="mb-8 sm:mb-10 inline-flex items-center gap-2 bg-emerald-500/10 border border-emerald-500/25 rounded-full px-3 sm:px-4 py-1.5 max-w-full">
            <Lock className="size-3 text-emerald-400 shrink-0" />
            <p className="text-[10px] font-mono uppercase tracking-widest text-emerald-400 truncate">256-bit secured · Razorpay · INR</p>
          </div>

          <form onSubmit={placeOrder} className="grid lg:grid-cols-3 gap-8 lg:gap-12">
            <div className="lg:col-span-2 space-y-5 sm:space-y-6">
              {/* Shipping address */}
              <div className="glass border border-white/10 rounded-2xl p-5 sm:p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-sm uppercase tracking-widest font-medium inline-flex items-center gap-2">
                    <MapPin className="size-4 text-accent" /> Shipping address
                  </h2>
                  {!addingAddress && (
                    <button type="button" onClick={() => setAddingAddress(true)}
                      className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5">
                      <Plus className="size-3" /> New address
                    </button>
                  )}
                </div>

                {addrLoading ? (
                  <Loader2 className="size-4 animate-spin text-muted-foreground" />
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
                ) : (
                  <div className="grid sm:grid-cols-2 gap-3">
                    {addresses.map((a) => (
                      <label key={a.id}
                        className={`cursor-pointer border rounded-2xl p-4 transition-colors ${selectedAddressId === a.id ? "border-accent bg-accent/5" : "border-white/10 hover:border-accent/40"}`}>
                        <input type="radio" name="address" value={a.id} checked={selectedAddressId === a.id}
                          onChange={() => setSelectedAddressId(a.id)} className="sr-only" />
                        <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">
                          {a.label || "Address"}{a.is_default_shipping && " · Default"}
                        </p>
                        <p className="text-sm font-medium">{a.full_name}</p>
                        <p className="text-xs text-muted-foreground leading-relaxed mt-1">
                          {a.line1}{a.line2 ? `, ${a.line2}` : ""}<br />
                          {a.city}{a.state ? `, ${a.state}` : ""} {a.postal}<br />
                          {a.country}
                        </p>
                      </label>
                    ))}
                  </div>
                )}
              </div>

              {/* Payment method */}
              <div className="glass border border-white/10 rounded-2xl p-5 sm:p-6">
                <h2 className="text-sm uppercase tracking-widest font-medium mb-4 inline-flex items-center gap-2">
                  <CreditCard className="size-4 text-accent" /> Payment method
                </h2>

                <button type="button" onClick={() => setPayMethod("razorpay")}
                  className={`w-full text-left border rounded-2xl p-4 transition-colors ${payMethod === "razorpay" ? "border-accent bg-accent/5" : "border-white/10 hover:border-accent/40"}`}>
                  <div className="flex items-center gap-2">
                    <span className={`size-2 rounded-full ${payMethod === "razorpay" ? "bg-accent" : "bg-muted-foreground/40"}`} />
                    <span className="text-sm font-medium">Pay online (Razorpay)</span>
                    <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-emerald-400">Recommended</span>
                  </div>
                  <div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-muted-foreground">
                    <Tag icon={<Smartphone className="size-3" />} label="UPI" />
                    <Tag icon={<CreditCard className="size-3" />} label="Cards" />
                    <Tag icon={<Landmark className="size-3" />} label="Net Banking" />
                    <Tag icon={<Wallet className="size-3" />} label="Wallets" />
                  </div>
                </button>

                <div className={`mt-3 w-full text-left border rounded-2xl p-4 transition-colors ${!settings.cod_enabled ? "opacity-50" : payMethod === "cod" ? "border-accent bg-accent/5" : "border-white/10"}`}>
                  <button type="button" disabled={!settings.cod_enabled} onClick={() => setPayMethod("cod")}
                    className="w-full text-left disabled:cursor-not-allowed">
                    <div className="flex items-center gap-2">
                      <Truck className="size-4 text-muted-foreground" />
                      <span className="text-sm font-medium">Cash on Delivery</span>
                      <span className="ml-auto text-[10px] font-mono uppercase tracking-widest text-muted-foreground">
                        {settings.cod_enabled ? "Available" : "Currently unavailable"}
                      </span>
                    </div>
                  </button>
                </div>
              </div>

              {error && stage === "review" && <p className="text-xs text-destructive">{error}</p>}
            </div>

            {/* Summary */}
            <aside>
              <div className="glass border border-white/10 rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">
                <h2 className="text-lg font-medium mb-6">Summary</h2>
                <ul className="space-y-3 mb-5 max-h-64 overflow-y-auto">
                  {detailed.map((i) => (
                    <li key={i.slug} className="flex items-center gap-3 text-sm">
                      <img src={i.product.image} alt="" className="size-12 rounded-lg object-cover bg-black/30" />
                      <div className="flex-1 min-w-0">
                        <p className="truncate">{i.product.name}</p>
                        <p className="text-xs text-muted-foreground">× {i.qty}</p>
                      </div>
                      <span className="font-mono text-xs">{inrFmt(toInr(i.product.price * i.qty))}</span>
                    </li>
                  ))}
                </ul>
                <div className="border-t border-white/10 pt-4 mb-4">
                  {promo ? (
                    <div className="flex items-center justify-between gap-2 bg-background/40 border border-white/10 rounded-full px-4 py-2">
                      <div className="text-xs">
                        <span className="font-mono uppercase tracking-widest text-accent">{promo.code}</span>
                        <span className="text-muted-foreground ml-2">−{promo.kind === "percent" ? `${promo.value}%` : inrFmt(toInr(promo.value))}</span>
                      </div>
                      <button type="button" onClick={() => { setPromo(null); setPromoInput(""); }} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Remove</button>
                    </div>
                  ) : (
                    <div className="flex gap-2">
                      <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Promo code"
                        className="flex-1 bg-background/40 border border-white/10 rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent uppercase tracking-widest font-mono" />
                      <button type="button" onClick={applyPromo} disabled={promoBusy || !promoInput.trim()}
                        className="px-4 py-2 rounded-full text-[10px] uppercase tracking-widest font-bold border border-white/10 hover:bg-white/5 disabled:opacity-50 inline-flex items-center gap-1.5">
                        {promoBusy && <Loader2 className="size-3 animate-spin" />}Apply
                      </button>
                    </div>
                  )}
                  {promoError && <p className="text-[11px] text-destructive mt-2">{promoError}</p>}
                </div>
                <dl className="space-y-2 text-sm border-t border-white/10 pt-4">
                  <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{inrFmt(subtotalINR)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="font-mono">{shippingINR === 0 ? "Free" : inrFmt(shippingINR)}</dd></div>
                  <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="font-mono">{inrFmt(taxINR)}</dd></div>
                  {discountINR > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="font-mono text-accent">−{inrFmt(discountINR)}</dd></div>}
                  <div className="border-t border-white/10 pt-2 flex justify-between text-base"><dt className="font-medium">Total</dt><dd className="font-mono text-accent">{inrFmt(totalINR)}</dd></div>
                </dl>
                <button disabled={!selectedAddress || stage === "processing" || stage === "verifying"}
                  className="w-full mt-6 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2">
                  {(stage === "processing" || stage === "verifying") && <Loader2 className="size-3 animate-spin" />}
                  {stage === "processing" ? "Opening payment…" : stage === "verifying" ? "Verifying…" : payMethod === "cod" ? "Place order (COD)" : `Pay ${inrFmt(totalINR)}`}
                </button>
                <p className="text-[10px] text-muted-foreground text-center mt-3 font-mono uppercase tracking-widest inline-flex items-center justify-center gap-1.5 w-full">
                  <ShieldCheck className="size-3" /> Encrypted · PCI-DSS compliant
                </p>
              </div>
            </aside>
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
                    <button onClick={() => { setStage("review"); setError(null); }}
                      className="w-full bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 inline-flex items-center justify-center gap-2">
                      <RotateCcw className="size-3.5" /> Retry payment
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
    <span className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">
      {icon}{label}
    </span>
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

function InternationalSoon() {
  return (
    <div className="glass border border-white/10 rounded-3xl p-8 sm:p-12 text-center max-w-xl mx-auto">
      <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full bg-accent/10 border border-accent/30">
        <Globe className="size-6 text-accent" />
      </div>
      <h2 className="text-xl font-display font-semibold mb-2">International payments — coming soon</h2>
      <p className="text-sm text-muted-foreground mb-6">
        We're currently processing payments for orders shipping within India only.
        Global checkout with multi-currency support is on the way.
      </p>
      <Link to="/" className="inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold py-3 px-6 rounded-full text-xs uppercase tracking-widest hover:brightness-110">
        <Sparkles className="size-3.5" /> Continue browsing
      </Link>
    </div>
  );
}

function SuccessScreen({ orderId, totalINR, method, nav }: {
  orderId: string | null; totalINR: number; method: "razorpay" | "cod";
  nav: ReturnType<typeof useNavigate>;
}) {
  const eta = new Date(Date.now() + 5 * 86400000).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
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
              className="w-full bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110">
              View order
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
