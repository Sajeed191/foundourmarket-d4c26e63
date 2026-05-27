import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { ArrowLeft, Loader2, Mail, Settings as SettingsIcon } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

export const Route = createFileRoute("/account_/preferences")({
  head: () => ({ meta: [{ title: "Preferences — FoundOurMarket™" }] }),
  component: PreferencesPage,
});

type Prefs = {
  order_updates: boolean;
  shipping_updates: boolean;
  return_updates: boolean;
  marketing: boolean;
  product_news: boolean;
  abandoned_cart: boolean;
};

const DEFAULTS: Prefs = {
  order_updates: true,
  shipping_updates: true,
  return_updates: true,
  marketing: false,
  product_news: false,
  abandoned_cart: true,
};

const TOGGLES: Array<{ key: keyof Prefs; title: string; desc: string }> = [
  { key: "order_updates", title: "Order updates", desc: "Confirmations, receipts, invoices" },
  { key: "shipping_updates", title: "Shipping updates", desc: "Dispatch, in transit, delivery" },
  { key: "return_updates", title: "Returns & refunds", desc: "RMA progress and refund status" },
  { key: "abandoned_cart", title: "Cart reminders", desc: "We'll nudge you about items left behind" },
  { key: "marketing", title: "Marketing & offers", desc: "Promos, flash sales, drops" },
  { key: "product_news", title: "Product news", desc: "New launches and feature updates" },
];

function PreferencesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const [prefs, setPrefs] = useState<Prefs>(DEFAULTS);
  const [fetching, setFetching] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (loading) return;
    if (!user) { nav({ to: "/auth" }); return; }
    (async () => {
      const { data } = await supabase
        .from("email_preferences")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data) setPrefs({
        order_updates: data.order_updates,
        shipping_updates: data.shipping_updates,
        return_updates: data.return_updates,
        marketing: data.marketing,
        product_news: data.product_news,
        abandoned_cart: data.abandoned_cart,
      });
      setFetching(false);
    })();
  }, [user, loading, nav]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    const { error } = await supabase
      .from("email_preferences")
      .upsert({ user_id: user.id, ...prefs }, { onConflict: "user_id" });
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Preferences saved");
  };

  const toggle = (k: keyof Prefs) => setPrefs((p) => ({ ...p, [k]: !p[k] }));

  return (
    <div className="container-page py-10 sm:py-16 max-w-2xl">
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }} className="mb-8">
        <Link to="/account" className="inline-flex items-center gap-1.5 text-xs font-mono uppercase tracking-widest text-muted-foreground hover:text-foreground mb-4">
          <ArrowLeft className="size-3" /> Back to account
        </Link>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent">Account</p>
        <h1 className="text-fluid-2xl font-display font-semibold mt-2">Preferences</h1>
        <p className="text-sm text-muted-foreground mt-2">Choose what shows up in your inbox.</p>
      </motion.div>

      {fetching ? (
        <p className="text-sm text-muted-foreground">Loading…</p>
      ) : (
        <>
          <div className="rounded-2xl border border-border bg-card overflow-hidden mb-6">
            <div className="flex items-center gap-2 px-6 py-4 border-b border-border">
              <Mail className="size-4 text-accent" />
              <h2 className="font-display text-base font-semibold">Email notifications</h2>
            </div>
            <ul className="divide-y divide-border">
              {TOGGLES.map((t) => (
                <li key={t.key} className="flex items-center justify-between gap-4 px-6 py-4">
                  <div className="min-w-0">
                    <p className="font-medium text-sm">{t.title}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">{t.desc}</p>
                  </div>
                  <button
                    type="button"
                    role="switch"
                    aria-checked={prefs[t.key]}
                    onClick={() => toggle(t.key)}
                    className={`relative h-6 w-11 shrink-0 rounded-full transition-colors ${prefs[t.key] ? "bg-accent" : "bg-border"}`}
                  >
                    <span className={`absolute top-0.5 size-5 rounded-full bg-background shadow transition-transform ${prefs[t.key] ? "translate-x-[22px]" : "translate-x-0.5"}`} />
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <div className="flex justify-end">
            <button onClick={save} disabled={saving} className="cta-primary disabled:opacity-50">
              {saving ? <Loader2 className="size-3.5 animate-spin" /> : <SettingsIcon className="size-3.5" />}
              Save preferences
            </button>
          </div>
        </>
      )}
    </div>
  );
}
