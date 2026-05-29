import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Briefcase, CheckCircle2, Clock, Copy, Home, Loader2, MapPin, Pencil, Phone,
  Plus, Search, Star, Trash2, X, Navigation, CreditCard, Truck, Sparkles,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useAddresses, type Address, type AddressType } from "@/lib/use-addresses";
import { AddressForm } from "@/components/site/AddressForm";

export const Route = createFileRoute("/account_/addresses")({
  head: () => ({ meta: [{ title: "Manage Addresses — FoundOurMarket™" }] }),
  component: AddressesPage,
});

const FILTERS = ["all", "home", "work", "other", "default", "recent"] as const;
type Filter = (typeof FILTERS)[number];

function TypeIcon({ type }: { type: AddressType }) {
  if (type === "home") return <Home className="size-3.5" />;
  if (type === "work") return <Briefcase className="size-3.5" />;
  return <MapPin className="size-3.5" />;
}

function timeAgo(iso: string | null) {
  if (!iso) return null;
  const s = Math.floor((Date.now() - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const d = Math.floor(h / 24);
  return `${d}d ago`;
}

function formatAddress(a: Address) {
  return [a.line1, a.line2, a.landmark, a.city, a.state, a.postal, a.country]
    .filter(Boolean)
    .join(", ");
}

function AddressesPage() {
  const { user, loading } = useAuth();
  const nav = useNavigate();
  const {
    addresses, loading: aLoading, create, update, remove, duplicate,
    setDefaultShipping, setDefaultBilling, defaultShipping, defaultBilling, lastUsed,
  } = useAddresses();
  const [editing, setEditing] = useState<Address | null>(null);
  const [creating, setCreating] = useState(false);
  const [filter, setFilter] = useState<Filter>("all");
  const [q, setQ] = useState("");
  const [confirmDelete, setConfirmDelete] = useState<Address | null>(null);

  useEffect(() => {
    if (!loading && !user) nav({ to: "/auth" });
  }, [loading, user, nav]);

  const counts = useMemo(() => {
    const c = { all: addresses.length, home: 0, work: 0, other: 0, default: 0, recent: 0 };
    addresses.forEach((a) => {
      c[a.address_type]++;
      if (a.is_default_shipping || a.is_default_billing) c.default++;
      if (a.last_used_at) c.recent++;
    });
    return c;
  }, [addresses]);

  const filtered = useMemo(() => {
    let list = addresses.filter((a) => {
      if (filter === "home" || filter === "work" || filter === "other") return a.address_type === filter;
      if (filter === "default") return a.is_default_shipping || a.is_default_billing;
      if (filter === "recent") return !!a.last_used_at;
      return true;
    });
    if (q) {
      const n = q.toLowerCase();
      list = list.filter((a) =>
        `${a.nickname ?? ""} ${a.full_name} ${a.line1} ${a.line2 ?? ""} ${a.landmark ?? ""} ${a.city} ${a.state ?? ""} ${a.postal} ${a.country} ${a.phone ?? ""}`
          .toLowerCase()
          .includes(n)
      );
    }
    if (filter === "recent") {
      list = [...list].sort(
        (x, y) => new Date(y.last_used_at!).getTime() - new Date(x.last_used_at!).getTime()
      );
    }
    return list;
  }, [addresses, filter, q]);

  if (loading || !user) {
    return (
      <div className="min-h-[60vh] grid place-items-center">
        <Loader2 className="size-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  const copyAddress = (a: Address) => {
    navigator.clipboard?.writeText(`${a.full_name}\n${formatAddress(a)}\n${a.phone ?? ""}`);
    toast.success("Address copied");
  };

  const onSetShipping = async (a: Address) => {
    await setDefaultShipping(a.id);
    toast.success("Default shipping updated");
  };
  const onSetBilling = async (a: Address) => {
    await setDefaultBilling(a.id);
    toast.success("Default billing updated");
  };
  const onDuplicate = async (a: Address) => {
    await duplicate(a.id);
    toast.success("Address duplicated");
  };
  const useForCheckout = (a: Address) => {
    nav({ to: "/checkout", search: { address: a.id } as any });
  };
  const doDelete = async () => {
    if (!confirmDelete) return;
    await remove(confirmDelete.id);
    setConfirmDelete(null);
    toast.success("Address deleted");
  };

  const showForm = creating || editing;

  return (
    <div className="container-page py-8 sm:py-14 max-w-5xl pb-28">
      {/* Header */}
      <motion.div initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.4 }}>
        <p className="text-[10px] font-mono uppercase tracking-[0.3em] text-accent mb-3">Account</p>
        <div className="flex items-end justify-between flex-wrap gap-4 mb-6">
          <div>
            <h1 className="text-fluid-2xl font-display font-semibold">Manage addresses</h1>
            <p className="text-sm text-muted-foreground mt-2 max-w-md">
              Save delivery locations for one-tap checkout with realtime sync across devices.
            </p>
          </div>
          <Link to="/account" className="text-xs uppercase tracking-widest text-muted-foreground hover:text-accent">
            ← Back to account
          </Link>
        </div>
      </motion.div>

      {/* Overview stats */}
      {!showForm && addresses.length > 0 && (
        <motion.div
          initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
          className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6"
        >
          <StatCard icon={<MapPin className="size-4" />} label="Saved" value={addresses.length} />
          <StatCard icon={<Truck className="size-4" />} label="Default shipping"
            value={defaultShipping ? defaultShipping.city : "—"} subtle={!defaultShipping} />
          <StatCard icon={<CreditCard className="size-4" />} label="Default billing"
            value={defaultBilling ? defaultBilling.city : "—"} subtle={!defaultBilling} />
          <StatCard icon={<Clock className="size-4" />} label="Last used"
            value={lastUsed ? (timeAgo(lastUsed.last_used_at) ?? lastUsed.city) : "—"} subtle={!lastUsed} />
        </motion.div>
      )}

      {/* Search + Add */}
      {!showForm && (
        <div className="flex flex-col sm:flex-row gap-3 mb-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Search by name, city, PIN, phone or state"
              className="w-full pl-10 pr-4 py-3 rounded-2xl bg-card border border-border text-sm focus:border-accent outline-none"
            />
          </div>
          <button
            onClick={() => setCreating(true)}
            className="inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold px-5 py-3 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 transition-all whitespace-nowrap shadow-[0_0_30px_-8px_var(--color-accent)]"
          >
            <Plus className="size-3.5" /> Add address
          </button>
        </div>
      )}

      {/* Filters */}
      {!showForm && addresses.length > 0 && (
        <div className="flex gap-1.5 overflow-x-auto -mx-1 px-1 mb-2">
          {FILTERS.map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`px-4 py-2 rounded-full text-[11px] uppercase tracking-widest font-mono transition-all whitespace-nowrap inline-flex items-center gap-2 ${
                filter === f
                  ? "bg-accent text-accent-foreground"
                  : "bg-card border border-border text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "home" && <Home className="size-3" />}
              {f === "work" && <Briefcase className="size-3" />}
              {f === "other" && <MapPin className="size-3" />}
              {f === "default" && <Star className="size-3" />}
              {f === "recent" && <Clock className="size-3" />}
              {f} <span className="opacity-60">({counts[f]})</span>
            </button>
          ))}
        </div>
      )}

      {!showForm && addresses.length > 0 && (
        <p className="text-[11px] font-mono text-muted-foreground mb-5">
          {filtered.length} result{filtered.length === 1 ? "" : "s"}
        </p>
      )}

      {/* Add / Edit form */}
      <AnimatePresence>
        {creating && (
          <motion.div
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-accent/30 rounded-3xl p-5 sm:p-6 mb-6 shadow-[0_0_40px_-12px_var(--color-accent)]"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm uppercase tracking-widest font-medium">New address</h2>
              <button onClick={() => setCreating(false)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <AddressForm
              onSubmit={async (input) => {
                await create({ ...input, is_default_shipping: addresses.length === 0 ? true : input.is_default_shipping });
                setCreating(false);
                toast.success("Address added");
              }}
              onCancel={() => setCreating(false)}
              submitLabel="Add address"
            />
          </motion.div>
        )}

        {editing && (
          <motion.div
            key={editing.id}
            initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -8 }}
            className="bg-card border border-accent/30 rounded-3xl p-5 sm:p-6 mb-6 shadow-[0_0_40px_-12px_var(--color-accent)]"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-sm uppercase tracking-widest font-medium">Edit address</h2>
              <button onClick={() => setEditing(null)} className="text-muted-foreground hover:text-foreground">
                <X className="size-4" />
              </button>
            </div>
            <AddressForm
              initial={editing}
              onSubmit={async (input) => {
                await update(editing.id, input);
                setEditing(null);
                toast.success("Address updated");
              }}
              onCancel={() => setEditing(null)}
              submitLabel="Update address"
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* List */}
      {!showForm && (
        aLoading ? (
          <div className="grid sm:grid-cols-2 gap-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="h-44 rounded-3xl bg-card border border-border animate-pulse" />
            ))}
          </div>
        ) : filtered.length === 0 ? (
          <EmptyState
            searching={!!q || filter !== "all"}
            onAdd={() => setCreating(true)}
          />
        ) : (
          <ul className="grid sm:grid-cols-2 gap-4">
            {filtered.map((a, i) => (
              <AddressCard
                key={a.id}
                a={a}
                index={i}
                onEdit={() => setEditing(a)}
                onDelete={() => setConfirmDelete(a)}
                onCopy={() => copyAddress(a)}
                onSetShipping={() => onSetShipping(a)}
                onSetBilling={() => onSetBilling(a)}
                onDuplicate={() => onDuplicate(a)}
                onCheckout={() => useForCheckout(a)}
              />
            ))}
          </ul>
        )
      )}

      {/* Delete confirm */}
      <AnimatePresence>
        {confirmDelete && (
          <motion.div
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 grid place-items-center bg-black/70 backdrop-blur-sm p-4"
            onClick={() => setConfirmDelete(null)}
          >
            <motion.div
              initial={{ scale: 0.95, y: 10 }} animate={{ scale: 1, y: 0 }} exit={{ scale: 0.95, y: 10 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-card border border-border rounded-3xl p-6 max-w-sm w-full"
            >
              <div className="size-12 grid place-items-center rounded-full bg-destructive/15 text-destructive mb-4">
                <Trash2 className="size-5" />
              </div>
              <h3 className="font-display font-semibold text-lg">Delete address?</h3>
              <p className="text-sm text-muted-foreground mt-1">
                {confirmDelete.nickname || confirmDelete.full_name} · {confirmDelete.city}. This cannot be undone.
              </p>
              <div className="flex gap-2 mt-5">
                <button
                  onClick={doDelete}
                  className="flex-1 bg-destructive text-destructive-foreground font-bold py-3 rounded-2xl text-[11px] uppercase tracking-widest"
                >
                  Delete
                </button>
                <button
                  onClick={() => setConfirmDelete(null)}
                  className="px-5 py-3 rounded-2xl text-[11px] uppercase tracking-widest border border-border hover:bg-white/5"
                >
                  Cancel
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function StatCard({ icon, label, value, subtle }: { icon: React.ReactNode; label: string; value: React.ReactNode; subtle?: boolean }) {
  return (
    <div className="relative overflow-hidden bg-card border border-border rounded-2xl p-4">
      <div className="flex items-center gap-2 text-accent mb-2">{icon}</div>
      <p className={`font-display font-semibold truncate ${subtle ? "text-muted-foreground text-sm" : "text-lg"}`}>{value}</p>
      <p className="text-[10px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">{label}</p>
      <div className="absolute -right-6 -bottom-6 size-16 rounded-full bg-accent/5 blur-xl" />
    </div>
  );
}

function EmptyState({ searching, onAdd }: { searching: boolean; onAdd: () => void }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.98 }} animate={{ opacity: 1, scale: 1 }}
      className="relative overflow-hidden bg-card border border-border rounded-3xl p-12 sm:p-16 text-center"
    >
      <div
        className="absolute inset-0 opacity-[0.07]"
        style={{
          backgroundImage:
            "linear-gradient(var(--color-accent) 1px, transparent 1px), linear-gradient(90deg, var(--color-accent) 1px, transparent 1px)",
          backgroundSize: "28px 28px",
        }}
      />
      <div className="relative">
        <motion.div
          animate={{ scale: [1, 1.06, 1] }} transition={{ duration: 2.5, repeat: Infinity }}
          className="size-16 mx-auto mb-5 grid place-items-center rounded-full bg-accent/10 border border-accent/30 text-accent shadow-[0_0_30px_-8px_var(--color-accent)]"
        >
          {searching ? <Search className="size-6" /> : <Navigation className="size-6" />}
        </motion.div>
        <p className="text-lg font-display font-semibold">
          {searching ? "No matching addresses" : "Add your first delivery address"}
        </p>
        <p className="text-sm text-muted-foreground mt-1.5 max-w-xs mx-auto">
          {searching
            ? "Try a different filter or search term."
            : "Save it once for lightning-fast one-tap checkout on every order."}
        </p>
        {!searching && (
          <button
            onClick={onAdd}
            className="mt-6 inline-flex items-center gap-2 bg-accent text-accent-foreground font-bold px-6 py-3 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 transition-all shadow-[0_0_30px_-8px_var(--color-accent)]"
          >
            <Plus className="size-3.5" /> Add address
          </button>
        )}
      </div>
    </motion.div>
  );
}

function AddressCard({
  a, index, onEdit, onDelete, onCopy, onSetShipping, onSetBilling, onDuplicate, onCheckout,
}: {
  a: Address; index: number;
  onEdit: () => void; onDelete: () => void; onCopy: () => void;
  onSetShipping: () => void; onSetBilling: () => void; onDuplicate: () => void; onCheckout: () => void;
}) {
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.35, delay: index * 0.04 }}
      whileTap={{ scale: 0.99 }}
      className={`relative overflow-hidden bg-card border rounded-3xl p-5 flex flex-col transition-colors ${
        a.is_default_shipping
          ? "border-accent/50 ring-1 ring-accent/20 shadow-[0_0_36px_-14px_var(--color-accent)]"
          : "border-border hover:border-accent/30"
      }`}
    >
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex flex-wrap items-center gap-2 min-w-0">
          <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-background border border-border text-[10px] uppercase tracking-widest font-mono">
            <TypeIcon type={a.address_type} />
            {a.nickname || a.address_type}
          </span>
          {a.is_default_shipping && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-[10px] font-mono uppercase tracking-widest text-accent">
              <Truck className="size-2.5" /> Shipping
            </span>
          )}
          {a.is_default_billing && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-accent/10 text-[10px] font-mono uppercase tracking-widest text-accent">
              <CreditCard className="size-2.5" /> Billing
            </span>
          )}
          {a.use_count >= 3 && (
            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/10 text-[10px] font-mono uppercase tracking-widest text-amber-400">
              <Sparkles className="size-2.5" /> Frequent
            </span>
          )}
        </div>
      </div>

      <p className="font-medium truncate">{a.full_name}</p>
      <p className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
        <Phone className="size-3" /> {a.phone || "—"}
        {a.alternate_phone && <span className="opacity-60">/ {a.alternate_phone}</span>}
      </p>
      <p className="text-sm text-muted-foreground mt-2 leading-relaxed line-clamp-3">{formatAddress(a)}</p>
      {a.delivery_notes && (
        <p className="text-[11px] text-muted-foreground/80 italic mt-1.5 line-clamp-1">“{a.delivery_notes}”</p>
      )}

      <div className="flex items-center gap-2 mt-2 text-[10px] font-mono uppercase tracking-widest">
        <span className="inline-flex items-center gap-1 text-emerald-400">
          <CheckCircle2 className="size-3" /> Delivers here
        </span>
        {a.last_used_at && <span className="text-muted-foreground">· used {timeAgo(a.last_used_at)}</span>}
      </div>

      {/* Primary action */}
      <button
        onClick={onCheckout}
        className="mt-4 w-full inline-flex items-center justify-center gap-2 bg-accent text-accent-foreground font-bold py-2.5 rounded-2xl text-[11px] uppercase tracking-widest hover:brightness-110 transition-all"
      >
        <Truck className="size-3.5" /> Use for checkout
      </button>

      {/* Secondary actions */}
      <div className="grid grid-cols-3 gap-1.5 mt-2">
        {!a.is_default_shipping && (
          <CardBtn onClick={onSetShipping} icon={<Star className="size-3.5" />} label="Default" />
        )}
        {!a.is_default_billing && (
          <CardBtn onClick={onSetBilling} icon={<CreditCard className="size-3.5" />} label="Billing" />
        )}
        <CardBtn onClick={onEdit} icon={<Pencil className="size-3.5" />} label="Edit" />
        <CardBtn onClick={onCopy} icon={<Copy className="size-3.5" />} label="Copy" />
        <CardBtn onClick={onDuplicate} icon={<Plus className="size-3.5" />} label="Clone" />
        <CardBtn onClick={onDelete} icon={<Trash2 className="size-3.5" />} label="Delete" danger />
      </div>
    </motion.li>
  );
}

function CardBtn({ onClick, icon, label, danger }: { onClick: () => void; icon: React.ReactNode; label: string; danger?: boolean }) {
  return (
    <button
      onClick={onClick}
      className={`inline-flex flex-col items-center justify-center gap-1 py-2 rounded-xl border text-[9px] uppercase tracking-widest font-mono transition-all ${
        danger
          ? "border-destructive/30 text-destructive hover:bg-destructive/10"
          : "border-border text-muted-foreground hover:text-foreground hover:border-accent/40"
      }`}
    >
      {icon}
      {label}
    </button>
  );
}
