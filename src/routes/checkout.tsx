import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, ShieldCheck, MapPin, CreditCard, Smartphone, Truck, Plus } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useCart } from "@/lib/cart";
import { useRegion } from "@/lib/region";
import { useAddresses, type Address } from "@/lib/use-addresses";
import { AddressForm } from "@/components/site/AddressForm";

export const Route = createFileRoute("/checkout")({
  head: () => ({ meta: [{ title: "Checkout — FoundOurMarket™" }] }),
  component: CheckoutPage,
});

type PayMethod = "demo_card" | "demo_upi" | "demo_cod";

function CheckoutPage() {
  const { user, loading } = useAuth();
  const { detailed, subtotalUSD, clear, count } = useCart();
  const { format } = useRegion();
  const { addresses, loading: addrLoading, create: createAddress, defaultShipping } = useAddresses();
  const nav = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedAddressId, setSelectedAddressId] = useState<string | null>(null);
  const [addingAddress, setAddingAddress] = useState(false);
  const [payMethod, setPayMethod] = useState<PayMethod>("demo_card");
  const [forceFail, setForceFail] = useState(false);
  const [promoInput, setPromoInput] = useState("");
  const [promoBusy, setPromoBusy] = useState(false);
  const [promoError, setPromoError] = useState<string | null>(null);
  const [promo, setPromo] = useState<{ code: string; kind: "percent" | "fixed"; value: number } | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  useEffect(() => {
    if (count === 0) nav({ to: "/cart" });
  }, [count, nav]);

  // Auto-select default or first address when loaded
  useEffect(() => {
    if (selectedAddressId) return;
    if (defaultShipping) setSelectedAddressId(defaultShipping.id);
    else if (addresses[0]) setSelectedAddressId(addresses[0].id);
  }, [addresses, defaultShipping, selectedAddressId]);

  const selectedAddress: Address | undefined = addresses.find((a) => a.id === selectedAddressId);

  const shipping = subtotalUSD > 50 ? 0 : 9.99;
  const tax = subtotalUSD * 0.08;
  const discount = promo
    ? Math.min(subtotalUSD, promo.kind === "percent" ? +(subtotalUSD * (promo.value / 100)).toFixed(2) : promo.value)
    : 0;
  const total = Math.max(0, subtotalUSD + shipping + tax - discount);

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

  function genTxnId(method: PayMethod) {
    const prefix = method === "demo_card" ? "DCRD" : method === "demo_upi" ? "DUPI" : "DCOD";
    return `${prefix}_${Math.random().toString(36).slice(2, 10).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
  }

  async function simulatePayment(method: PayMethod, amount: number) {
    // Fake gateway latency
    await new Promise((r) => setTimeout(r, 900));
    if (forceFail) return { ok: false, txnId: genTxnId(method) };
    // COD is always "succeeded" (collected on delivery)
    if (method === "demo_cod") return { ok: true, txnId: genTxnId(method) };
    // Random 5% fail on card/upi unless user toggled force-fail (already handled above)
    const ok = Math.random() > 0.05;
    return { ok, txnId: genTxnId(method), amount };
  }

  const placeOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;
    if (!selectedAddress) {
      setError("Please select or add a shipping address.");
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const result = await simulatePayment(payMethod, total);

      const initialStatus = result.ok ? (payMethod === "demo_cod" ? "confirmed" : "paid") : "payment_failed";
      const paymentStatus = result.ok ? (payMethod === "demo_cod" ? "pending" : "succeeded") : "failed";

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
          status: initialStatus,
          currency: "USD",
          subtotal: Number(subtotalUSD.toFixed(2)),
          shipping: Number(shipping.toFixed(2)),
          tax: Number(tax.toFixed(2)),
          discount: Number(discount.toFixed(2)),
          promo_code: promo?.code ?? null,
          total: Number(total.toFixed(2)),
          contact_email: user.email,
          shipping_address: shippingSnapshot,
          payment_method: payMethod,
          payment_status: paymentStatus,
        })
        .select()
        .single();
      if (oErr) throw oErr;

      // Record demo payment
      await supabase.from("payments").insert({
        order_id: order.id,
        user_id: user.id,
        method: payMethod,
        status: paymentStatus,
        amount: Number(total.toFixed(2)),
        currency: "USD",
        transaction_id: result.txnId,
        demo: true,
        meta: { simulated: true, force_fail: forceFail },
      });

      if (!result.ok) {
        setError("Demo payment failed. Try again or pick another method.");
        setBusy(false);
        return;
      }

      // Only create line items on a successful (or COD) order so inventory triggers fire correctly
      const items = detailed.map((i) => ({
        order_id: order.id,
        product_slug: i.slug,
        name: i.product.name,
        image: i.product.image,
        unit_price: i.product.price,
        quantity: i.qty,
        line_total: Number((i.product.price * i.qty).toFixed(2)),
      }));
      const { error: iErr } = await supabase.from("order_items").insert(items);
      if (iErr) throw iErr;

      clear();
      nav({ to: "/orders/$id", params: { id: order.id } });
    } catch (err: any) {
      setError(err?.message ?? "Could not place order");
    } finally {
      setBusy(false);
    }
  };

  if (loading || !user || count === 0) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-8 sm:py-16">
      <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Checkout</p>
      <h1 className="text-fluid-2xl font-display font-semibold mb-5 sm:mb-6">Almost yours</h1>
      <div className="mb-8 sm:mb-10 inline-flex items-center gap-2 bg-accent/10 border border-accent/30 rounded-full px-3 sm:px-4 py-1.5 max-w-full">
        <span className="size-1.5 rounded-full bg-accent animate-pulse shrink-0" />
        <p className="text-[10px] font-mono uppercase tracking-widest text-accent truncate">Demo payment mode — no real transaction</p>
      </div>

      <form onSubmit={placeOrder} className="grid lg:grid-cols-3 gap-8 lg:gap-12">
        <div className="lg:col-span-2 space-y-5 sm:space-y-6">
          {/* Shipping address */}
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">

            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm uppercase tracking-widest font-medium inline-flex items-center gap-2">
                <MapPin className="size-4 text-accent" /> Shipping address
              </h2>
              {!addingAddress && (
                <button
                  type="button"
                  onClick={() => setAddingAddress(true)}
                  className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent inline-flex items-center gap-1.5"
                >
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
                  <label
                    key={a.id}
                    className={`cursor-pointer border rounded-2xl p-4 transition-colors ${selectedAddressId === a.id ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"}`}
                  >
                    <input
                      type="radio"
                      name="address"
                      value={a.id}
                      checked={selectedAddressId === a.id}
                      onChange={() => setSelectedAddressId(a.id)}
                      className="sr-only"
                    />
                    <p className="text-[10px] font-mono uppercase tracking-widest text-accent mb-1">
                      {a.label || "Address"}
                      {a.is_default_shipping && " · Default"}
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
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6">
            <h2 className="text-sm uppercase tracking-widest font-medium mb-4 inline-flex items-center gap-2">
              <CreditCard className="size-4 text-accent" /> Payment method
            </h2>
            <div className="grid sm:grid-cols-3 gap-3">
              <PaymentChoice value="demo_card" current={payMethod} onSelect={setPayMethod} icon={<CreditCard className="size-4" />} label="Demo Card" sub="Visa · MC · Amex" />
              <PaymentChoice value="demo_upi" current={payMethod} onSelect={setPayMethod} icon={<Smartphone className="size-4" />} label="Demo UPI" sub="Any @upi handle" />
              <PaymentChoice value="demo_cod" current={payMethod} onSelect={setPayMethod} icon={<Truck className="size-4" />} label="Cash on Delivery" sub="Pay when it arrives" />
            </div>

            {payMethod === "demo_card" && (
              <div className="mt-5 grid sm:grid-cols-2 gap-3">
                <input disabled value="4242 4242 4242 4242" className="w-full bg-background/60 border border-border rounded-full px-4 py-3 text-sm font-mono text-muted-foreground" />
                <input disabled value="12/29  ·  CVC 123" className="w-full bg-background/60 border border-border rounded-full px-4 py-3 text-sm font-mono text-muted-foreground" />
              </div>
            )}
            {payMethod === "demo_upi" && (
              <input disabled value="demo@upi" className="mt-5 w-full bg-background/60 border border-border rounded-full px-4 py-3 text-sm font-mono text-muted-foreground" />
            )}

            <label className="mt-5 flex items-center gap-2 text-xs text-muted-foreground cursor-pointer">
              <input type="checkbox" checked={forceFail} onChange={(e) => setForceFail(e.target.checked)} className="accent-accent" />
              Simulate a failed payment
            </label>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <aside>
          <div className="bg-card border border-border rounded-2xl p-5 sm:p-6 lg:sticky lg:top-24">

            <h2 className="text-lg font-medium mb-6">Summary</h2>
            <ul className="space-y-3 mb-5">
              {detailed.map((i) => (
                <li key={i.slug} className="flex items-center gap-3 text-sm">
                  <img src={i.product.image} alt="" className="size-12 rounded-lg object-cover bg-black/30" />
                  <div className="flex-1 min-w-0">
                    <p className="truncate">{i.product.name}</p>
                    <p className="text-xs text-muted-foreground">× {i.qty}</p>
                  </div>
                  <span className="font-mono text-xs">{format(i.product.price * i.qty)}</span>
                </li>
              ))}
            </ul>
            <div className="border-t border-border pt-4 mb-4">
              {promo ? (
                <div className="flex items-center justify-between gap-2 bg-background border border-border rounded-full px-4 py-2">
                  <div className="text-xs">
                    <span className="font-mono uppercase tracking-widest text-accent">{promo.code}</span>
                    <span className="text-muted-foreground ml-2">−{promo.kind === "percent" ? `${promo.value}%` : format(promo.value)}</span>
                  </div>
                  <button type="button" onClick={() => { setPromo(null); setPromoInput(""); }} className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-foreground">Remove</button>
                </div>
              ) : (
                <div className="flex gap-2">
                  <input value={promoInput} onChange={(e) => setPromoInput(e.target.value)} placeholder="Promo code"
                    className="flex-1 bg-background border border-border rounded-full px-4 py-2 text-xs focus:outline-none focus:ring-1 focus:ring-accent uppercase tracking-widest font-mono" />
                  <button type="button" onClick={applyPromo} disabled={promoBusy || !promoInput.trim()}
                    className="px-4 py-2 rounded-full text-[10px] uppercase tracking-widest font-bold border border-border hover:bg-white/5 disabled:opacity-50 inline-flex items-center gap-1.5">
                    {promoBusy && <Loader2 className="size-3 animate-spin" />}Apply
                  </button>
                </div>
              )}
              {promoError && <p className="text-[11px] text-destructive mt-2">{promoError}</p>}
            </div>
            <dl className="space-y-2 text-sm border-t border-border pt-4">
              <div className="flex justify-between"><dt className="text-muted-foreground">Subtotal</dt><dd className="font-mono">{format(subtotalUSD)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Shipping</dt><dd className="font-mono">{shipping === 0 ? "Free" : format(shipping)}</dd></div>
              <div className="flex justify-between"><dt className="text-muted-foreground">Tax</dt><dd className="font-mono">{format(tax)}</dd></div>
              {discount > 0 && <div className="flex justify-between"><dt className="text-muted-foreground">Discount</dt><dd className="font-mono text-accent">−{format(discount)}</dd></div>}
              <div className="border-t border-border pt-2 flex justify-between text-base"><dt className="font-medium">Total</dt><dd className="font-mono text-accent">{format(total)}</dd></div>
            </dl>
            <button disabled={busy || !selectedAddress} className="w-full mt-6 bg-accent text-accent-foreground font-bold py-3 rounded-full text-xs uppercase tracking-widest hover:brightness-110 transition-all disabled:opacity-60 inline-flex items-center justify-center gap-2">
              {busy && <Loader2 className="size-3 animate-spin" />}
              {payMethod === "demo_cod" ? "Place order (COD)" : `Pay ${format(total)}`}
            </button>
            <p className="text-[10px] text-muted-foreground text-center mt-3 font-mono uppercase tracking-widest inline-flex items-center justify-center gap-1.5 w-full">
              <ShieldCheck className="size-3" /> Demo · No real charge
            </p>
          </div>
        </aside>
      </form>
    </div>
  );
}

function PaymentChoice({
  value, current, onSelect, icon, label, sub,
}: {
  value: PayMethod;
  current: PayMethod;
  onSelect: (v: PayMethod) => void;
  icon: React.ReactNode;
  label: string;
  sub: string;
}) {
  const active = value === current;
  return (
    <label className={`cursor-pointer border rounded-2xl p-4 transition-colors flex flex-col gap-2 ${active ? "border-accent bg-accent/5" : "border-border hover:border-accent/40"}`}>
      <input type="radio" name="payment" value={value} checked={active} onChange={() => onSelect(value)} className="sr-only" />
      <div className="flex items-center gap-2">
        <span className={active ? "text-accent" : "text-muted-foreground"}>{icon}</span>
        <span className="text-sm font-medium">{label}</span>
      </div>
      <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">{sub}</span>
    </label>
  );
}
