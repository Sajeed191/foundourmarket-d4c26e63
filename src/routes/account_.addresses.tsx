import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Briefcase, CheckCircle2, Home, Loader2, MapPin, Pencil, Phone, Plus, Search, Star, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useAddresses, type Address } from "@/lib/use-addresses";
import { AddressForm } from "@/components/site/AddressForm";

export const Route = createFileRoute("/account_/addresses")({
  head: () => ({ meta: [{ title: "Manage Addresses — FoundOurMarket™" }] }),
  component: AddressesPage,
});

const TABS = ["all", "home", "work", "other"] as const;
type Tab = (typeof TABS)[number];

function addressType(a: Address): "home" | "work" | "other" {
  const l = (a.label ?? "").toLowerCase();
  if (l.includes("home")) return "home";
  if (l.includes("work") || l.includes("office")) return "work";
  return "other";
}

function TypeIcon({ type }: { type: "home" | "work" | "other" }) {
  if (type === "home") return <Home className="size-3.5" />;
  if (type === "work") return <Briefcase className="size-3.5" />;
  return <MapPin className="size-3.5" />;
}

function AddressesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const {
    addresses, loading: aLoading, create, update, remove,
    setDefaultShipping, setDefaultBilling,
  } = useAddresses();
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);
  const [tab, setTab] = useState<Tab>("all");
  const [q, setQ] = useState("");

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const counts = useMemo(() => {
    const c = { all: addresses.length, home: 0, work: 0, other: 0 };
    addresses.forEach((a) => { c[addressType(a)]++; });
    return c;
  }, [addresses]);

  const filtered = useMemo(() => {
    return addresses.filter((a) => {
      if (tab !== "all" && addressType(a) !== tab) return false;
      if (q) {
        const n = q.toLowerCase();
        const hay = `${a.full_name} ${a.line1} ${a.line2 ?? ""} ${a.city} ${a.state ?? ""} ${a.postal} ${a.country} ${a.phone ?? ""}`.toLowerCase();
        if (!hay.includes(n)) return false;
      }
      return true;
    });
  }, [addresses, tab, q]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const defaultShip = addresses.find((a) => a.is_default_shipping);

  return (
    <div className="container-page py-10 sm:py-16 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8">
          <div>
            <h1 className="text-fluid-2xl font-display font-semibold">Manage addresses</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Save delivery locations for one-tap checkout. Mark a default for shipping and billing.
            </p>
          </div>
          <Link to="/account" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-accent">
            ← Back to account
          </Link>
        </div>
      </motion.div>

      {/* Default address highlight banner */}
      {defaultShip && !creating && !editing && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="bg-gradient-to-r from-accent/10 to-transparent border border-accent/30 rounded-2xl p-4 sm:p-5 mb-6 flex items-start gap-4"
        >
          <div className="size-10 grid place-items-center rounded-full bg-accent/15 text-accent shrink-0">
            <CheckCircle2 className="size-4" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-mono uppercase tracking-widest text-accent">Default delivery address</p>
            <p className="font-medium mt-0.5 truncate">{defaultShip.full_name} · {defaultShip.postal}</p>
            <p className="text-xs text-muted-foreground truncate">
              {defaultShip.line1}{defaultShip.line2 ? `, ${defaultShip.line2}` : ""}, {defaultShip.city}
            </p>
          </div>
        </motion.div>
      )}

      {/* Search + Add */}
      <div className="flex flex-col sm:flex-row gap-3 mb-4">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name, city, pincode or phone"
            className="w-full pl-10 pr-4 py-3 rounded-full bg-card border border-border text-sm focus:border-accent outline-none"
          />
        </div>
        {!creating && !editing && (
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-3 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all whitespace-nowrap"
          >
            <Plus className="size-3.5" /> Add new address
          </button>
        )}
      </div>

      {/* Type tabs */}
      <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 mb-6">
        {TABS.map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-widest font-mono transition-all whitespace-nowrap inline-flex items-center gap-2 ${
              tab === t ? "bg-accent text-accent-foreground" : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t === "home" && <Home className="size-3" />}
            {t === "work" && <Briefcase className="size-3" />}
            {t === "other" && <MapPin className="size-3" />}
            {t} <span className="opacity-60">({counts[t]})</span>
          </button>
        ))}
      </div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-2xl p-5 sm:p-6 mb-6"
          >
            <h2 className="text-sm uppercase tracking-widest font-medium mb-4">New address</h2>
            <AddressForm
              onSubmit={async (input) => { await create(input); setCreating(false); }}
              onCancel={() => setCreating(false)}
              submitLabel="Add address"
            />
          </motion.div>
        )}

        {editing && (
          <motion.div
            key={editing.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-border rounded-2xl p-5 sm:p-6 mb-6"
          >
            <h2 className="text-sm uppercase tracking-widest font-medium mb-4">Edit address</h2>
            <AddressForm
              initial={editing}
              onSubmit={async (input) => { await update(editing.id, input); setEditing(null); }}
              onCancel={() => setEditing(null)}
              submitLabel="Update address"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {aLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : filtered.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-12 sm:p-16 text-center"
        >
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <MapPin className="size-5 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">
            {q || tab !== "all" ? "No matching addresses" : "No addresses yet"}
          </p>
          <p className="text-sm text-muted-foreground mt-1">
            {q || tab !== "all" ? "Try a different filter or search." : "Add your first shipping address to speed up checkout."}
          </p>
        </motion.div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {filtered.map((a, i) => {
            const type = addressType(a);
            return (
              <motion.li
                key={a.id}
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.35, delay: i * 0.04 }}
                className={`relative bg-card border rounded-2xl p-5 flex flex-col transition-colors ${
                  a.is_default_shipping ? "border-accent/50 ring-1 ring-accent/20" : "border-border hover:border-accent/30"
                }`}
              >
                <div className="flex items-start justify-between gap-3 mb-3">
                  <div className="flex items-center gap-2 min-w-0">
                    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-[10px] uppercase tracking-widest font-mono">
                      <TypeIcon type={type} />
                      {a.label || type}
                    </span>
                    {a.is_default_shipping && (
                      <span className="inline-flex items-center gap-1 text-[10px] font-mono uppercase tracking-widest text-accent">
                        <Star className="size-3 fill-accent" /> Default
                      </span>
                    )}
                  </div>
                </div>

                <p className="font-semibold text-base truncate">{a.full_name}</p>
                <p className="text-sm text-muted-foreground leading-relaxed mt-1">
                  {a.line1}{a.line2 ? `, ${a.line2}` : ""}
                  <br />
                  {a.city}{a.state ? `, ${a.state}` : ""}
                  <br />
                  {a.country} <span className="font-mono font-semibold text-foreground">— {a.postal}</span>
                </p>

                {a.phone && (
                  <p className="text-xs text-muted-foreground mt-3 inline-flex items-center gap-1.5">
                    <Phone className="size-3" /> {a.phone}
                  </p>
                )}

                {a.is_default_billing && (
                  <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-2">
                    Default billing
                  </p>
                )}

                <div className="mt-4 pt-4 border-t border-border flex items-center gap-2 flex-wrap">
                  {!a.is_default_shipping && (
                    <button
                      onClick={() => setDefaultShipping(a.id)}
                      className="text-[10px] uppercase tracking-widest font-mono text-accent hover:underline"
                    >
                      Deliver here
                    </button>
                  )}
                  {!a.is_default_billing && (
                    <button
                      onClick={() => setDefaultBilling(a.id)}
                      className="text-[10px] uppercase tracking-widest font-mono text-muted-foreground hover:text-accent"
                    >
                      Use for billing
                    </button>
                  )}
                  <button
                    onClick={() => setEditing(a)}
                    aria-label="Edit"
                    className="ml-auto size-9 grid place-items-center rounded-full border border-border hover:text-accent hover:border-accent/40 transition-colors"
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button
                    onClick={() => { if (confirm("Delete this address?")) remove(a.id); }}
                    aria-label="Delete"
                    className="size-9 grid place-items-center rounded-full border border-border hover:text-destructive hover:border-destructive/40 transition-colors"
                  >
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </motion.li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
