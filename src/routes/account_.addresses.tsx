import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Loader2, MapPin, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { useAuth } from "@/lib/auth";
import { useAddresses, type Address } from "@/lib/use-addresses";
import { AddressForm } from "@/components/site/AddressForm";

export const Route = createFileRoute("/account_/addresses")({
  head: () => ({ meta: [{ title: "Addresses — FoundOurMarket™" }] }),
  component: AddressesPage,
});

function AddressesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const { addresses, loading: aLoading, create, update, remove, setDefaultShipping } = useAddresses();
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="container-page py-10 sm:py-16 max-w-5xl">
      <motion.div
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.4 }}
      >
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-8 sm:mb-12">
          <div>
            <h1 className="text-fluid-2xl font-display font-semibold">Address book</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Save the places you ship to. Set a default and checkout faster.
            </p>
          </div>
          <Link to="/account" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-accent">
            ← Back to account
          </Link>
        </div>
      </motion.div>

      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
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
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -8 }}
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

      {!creating && !editing && (
        <button
          onClick={() => setCreating(true)}
          className="mb-6 inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-3 rounded-full text-[11px] uppercase tracking-widest hover:brightness-110 transition-all"
        >
          <Plus className="size-3.5" /> Add new address
        </button>
      )}

      {aLoading ? (
        <Loader2 className="size-4 animate-spin text-muted-foreground" />
      ) : addresses.length === 0 ? (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-card border border-border rounded-2xl p-12 sm:p-16 text-center"
        >
          <div className="size-14 mx-auto mb-5 grid place-items-center rounded-full border border-border">
            <MapPin className="size-5 text-muted-foreground" />
          </div>
          <p className="text-base font-medium">No addresses yet</p>
          <p className="text-sm text-muted-foreground mt-1">Add your first shipping address to speed up checkout.</p>
        </motion.div>
      ) : (
        <ul className="grid sm:grid-cols-2 gap-4">
          {addresses.map((a, i) => (
            <motion.li
              key={a.id}
              initial={{ opacity: 0, y: 12 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.35, delay: i * 0.04 }}
              className="bg-card border border-border rounded-2xl p-5 flex flex-col hover:border-accent/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-3 mb-3">
                <div className="min-w-0">
                  <p className="text-xs font-mono uppercase tracking-widest text-accent">{a.label || "Address"}</p>
                  <p className="font-medium mt-1 truncate">{a.full_name}</p>
                </div>
                <div className="flex flex-col items-end gap-1 shrink-0">
                  {a.is_default_shipping && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-accent inline-flex items-center gap-1">
                      <Star className="size-3 fill-accent" /> Shipping
                    </span>
                  )}
                  {a.is_default_billing && (
                    <span className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground">Billing</span>
                  )}
                </div>
              </div>
              <p className="text-xs text-muted-foreground leading-relaxed">
                {a.line1}{a.line2 ? `, ${a.line2}` : ""}
                <br />
                {a.city}{a.state ? `, ${a.state}` : ""} {a.postal}
                <br />
                {a.country}{a.phone ? ` · ${a.phone}` : ""}
              </p>
              <div className="mt-auto pt-4 flex items-center gap-2 flex-wrap">
                {!a.is_default_shipping && (
                  <button
                    onClick={() => setDefaultShipping(a.id)}
                    className="text-[10px] uppercase tracking-widest text-muted-foreground hover:text-accent"
                  >
                    Make default
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
          ))}
        </ul>
      )}
    </div>
  );
}
