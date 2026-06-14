import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  MoreVertical, User, ShoppingBag, MapPin, Pencil, Mail, Bell, KeyRound,
  PauseCircle, Ban, ShieldOff, MessageSquareOff, Trash2, Loader2, CheckCircle2,
} from "lucide-react";
import {
  setCustomerStatusFn, softDeleteCustomerFn, setCustomerFlagFn,
  sendCustomerNotificationFn, resetCustomerPasswordFn,
} from "@/lib/customer-admin.functions";
import type { CustomerRow } from "@/lib/customer-center.functions";

type Props = { c: CustomerRow; onChanged: () => void };

export function CustomerActionsMenu({ c, onChanged }: Props) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  const setStatus = useServerFn(setCustomerStatusFn);
  const softDelete = useServerFn(softDeleteCustomerFn);
  const setFlag = useServerFn(setCustomerFlagFn);
  const notify = useServerFn(sendCustomerNotificationFn);
  const resetPw = useServerFn(resetCustomerPasswordFn);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    document.addEventListener("mousedown", close);
    return () => document.removeEventListener("mousedown", close);
  }, [open]);

  const run = async (key: string, fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    try { await fn(); onChanged(); setOpen(false); }
    catch (err) { window.alert((err as Error).message || "Action failed"); }
    finally { setBusy(null); }
  };

  const goProfile = (hash?: string) => {
    setOpen(false);
    nav({ to: "/admin-customers/$customerId", params: { customerId: c.id }, hash });
  };

  const Item = ({ icon: Icon, label, onClick, tone, k }: {
    icon: typeof User; label: string; onClick: () => void; tone?: string; k?: string;
  }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy !== null}
      className={`w-full flex items-center gap-2.5 px-3 py-2 text-left text-xs hover:bg-white/5 disabled:opacity-50 ${tone ?? "text-foreground"}`}
    >
      {k && busy === k ? <Loader2 className="size-3.5 animate-spin" /> : <Icon className="size-3.5 shrink-0" />}
      {label}
    </button>
  );

  return (
    <div ref={ref} className="relative" onClick={(e) => e.stopPropagation()}>
      <button
        onClick={(e) => { e.stopPropagation(); setOpen((o) => !o); }}
        aria-label="Customer actions"
        className="rounded-full p-1.5 text-muted-foreground hover:bg-white/10 hover:text-foreground transition-colors"
      >
        <MoreVertical className="size-4" />
      </button>

      {open && (
        <div className="absolute right-0 z-50 mt-1 w-56 max-h-[70vh] overflow-y-auto rounded-xl border border-white/10 bg-[oklch(0.16_0.01_260)] shadow-2xl py-1 backdrop-blur-xl">
          <Item icon={User} label="View Profile" onClick={() => goProfile()} />
          <Item icon={ShoppingBag} label="View Orders" onClick={() => goProfile("orders")} />
          <Item icon={MapPin} label="View Addresses" onClick={() => goProfile("addresses")} />
          <Item icon={Pencil} label="Edit Customer" onClick={() => goProfile("edit")} />
          <div className="my-1 h-px bg-white/10" />
          <Item
            icon={Mail}
            label="Send Email"
            onClick={() => {
              if (c.email) window.open(`mailto:${c.email}`, "_blank");
              else window.alert("This customer has no email on file.");
              setOpen(false);
            }}
          />
          <Item
            icon={Bell}
            label="Send Notification"
            k="notify"
            onClick={() => {
              const title = window.prompt("Notification title")?.trim();
              if (!title) return;
              const body = window.prompt("Notification message")?.trim();
              if (!body) return;
              run("notify", () => notify({ data: { customerId: c.id, title, body } }));
            }}
          />
          <Item
            icon={KeyRound}
            label="Reset Password"
            k="reset"
            onClick={() => run("reset", () => resetPw({ data: { customerId: c.id } }), "Send a password reset email to this customer?")}
          />
          <div className="my-1 h-px bg-white/10" />
          {c.account_status !== "suspended" ? (
            <Item icon={PauseCircle} label="Suspend Customer" tone="text-amber-400" k="suspend"
              onClick={() => run("suspend", () => setStatus({ data: { customerId: c.id, status: "suspended" } }), "Suspend this customer?")} />
          ) : (
            <Item icon={CheckCircle2} label="Reactivate Customer" tone="text-emerald-400" k="reactivate"
              onClick={() => run("reactivate", () => setStatus({ data: { customerId: c.id, status: "active" } }))} />
          )}
          {c.account_status !== "banned" ? (
            <Item icon={Ban} label="Ban Customer" tone="text-destructive" k="ban"
              onClick={() => run("ban", () => setStatus({ data: { customerId: c.id, status: "banned" } }), "Ban this customer? They will lose access.")} />
          ) : (
            <Item icon={CheckCircle2} label="Lift Ban" tone="text-emerald-400" k="unban"
              onClick={() => run("unban", () => setStatus({ data: { customerId: c.id, status: "active" } }))} />
          )}
          <Item
            icon={ShieldOff}
            label={c.ordering_blocked ? "Allow Ordering" : "Block Ordering"}
            tone={c.ordering_blocked ? "text-emerald-400" : "text-amber-400"}
            k="order"
            onClick={() => run("order", () => setFlag({ data: { customerId: c.id, flag: "ordering_blocked", value: !c.ordering_blocked } }))}
          />
          <Item
            icon={MessageSquareOff}
            label={c.reviews_disabled ? "Enable Reviews" : "Disable Reviews"}
            tone={c.reviews_disabled ? "text-emerald-400" : "text-amber-400"}
            k="reviews"
            onClick={() => run("reviews", () => setFlag({ data: { customerId: c.id, flag: "reviews_disabled", value: !c.reviews_disabled } }))}
          />
          <div className="my-1 h-px bg-white/10" />
          <Item icon={Trash2} label="Delete Customer" tone="text-destructive" k="delete"
            onClick={() => run("delete", () => softDelete({ data: { customerId: c.id } }), "Soft-delete this customer? The record is retained but marked deleted.")} />
        </div>
      )}
    </div>
  );
}

const STATUS_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10" },
  suspended: { label: "Suspended", cls: "text-amber-400 border-amber-500/30 bg-amber-500/10" },
  banned: { label: "Banned", cls: "text-destructive border-destructive/30 bg-destructive/10" },
  deleted: { label: "Deleted", cls: "text-muted-foreground border-white/15 bg-white/5" },
};

export function StatusBadge({ status }: { status: string }) {
  const m = STATUS_META[status] ?? STATUS_META.active;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-medium ${m.cls}`}>
      <span className={`size-1.5 rounded-full ${m.cls.split(" ")[0].replace("text-", "bg-")}`} />
      {m.label}
    </span>
  );
}
