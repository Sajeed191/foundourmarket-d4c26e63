import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useNavigate } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import {
  MoreVertical, User, ShoppingBag, MapPin, Pencil, Mail, Bell, KeyRound,
  PauseCircle, Ban, ShieldOff, MessageSquareOff, Trash2, Loader2, CheckCircle2, X, Send,
} from "lucide-react";
import {
  setCustomerStatusFn, softDeleteCustomerFn, setCustomerFlagFn,
  sendCustomerNotificationFn, resetCustomerPasswordFn, updateCustomerFn, sendCustomerEmailFn,
  restoreCustomerFn,
} from "@/lib/customer-admin.functions";
import type { CustomerRow } from "@/lib/customer-center.functions";

type Props = { c: CustomerRow; onChanged: () => void };

type Modal = null | "edit" | "email" | "ban" | "notify";

export function CustomerActionsMenu({ c, onChanged }: Props) {
  const nav = useNavigate();
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [modal, setModal] = useState<Modal>(null);
  const ref = useRef<HTMLDivElement>(null);

  const setStatus = useServerFn(setCustomerStatusFn);
  const softDelete = useServerFn(softDeleteCustomerFn);
  const setFlag = useServerFn(setCustomerFlagFn);
  const notify = useServerFn(sendCustomerNotificationFn);
  const resetPw = useServerFn(resetCustomerPasswordFn);
  const updateCustomer = useServerFn(updateCustomerFn);
  const sendEmail = useServerFn(sendCustomerEmailFn);
  const restore = useServerFn(restoreCustomerFn);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [open]);

  const run = async (key: string, fn: () => Promise<unknown>, confirmMsg?: string) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setBusy(key);
    try { await fn(); onChanged(); setOpen(false); setModal(null); }
    catch (err) { window.alert((err as Error).message || "Action failed"); }
    finally { setBusy(null); }
  };

  const goProfile = (hash?: string) => {
    setOpen(false);
    nav({ to: "/admin-customers/$customerId", params: { customerId: c.id }, hash });
  };

  const goOrders = () => {
    setOpen(false);
    nav({ to: "/admin-orders-ops", search: { q: c.email || c.id } });
  };

  const Item = ({ icon: Icon, label, onClick, tone, k }: {
    icon: typeof User; label: string; onClick: () => void; tone?: string; k?: string;
  }) => (
    <button
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      disabled={busy !== null}
      className={`w-full flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm hover:bg-white/5 active:bg-white/10 disabled:opacity-50 transition-colors ${tone ?? "text-foreground"}`}
    >
      {k && busy === k ? <Loader2 className="size-4 animate-spin shrink-0" /> : <Icon className="size-4 shrink-0" />}
      {label}
    </button>
  );

  const menu = (
    <>
      <Item icon={User} label="View Profile" onClick={() => goProfile()} />
      <Item icon={ShoppingBag} label="View Orders" onClick={goOrders} />
      <Item icon={MapPin} label="View Addresses" onClick={() => goProfile("addresses")} />
      <Item icon={Pencil} label="Edit Customer" onClick={() => { setOpen(false); setModal("edit"); }} />
      <div className="my-1 h-px bg-white/10" />
      <Item
        icon={Mail}
        label="Send Email"
        onClick={() => {
          if (!c.email) { window.alert("This customer has no email on file."); return; }
          setOpen(false); setModal("email");
        }}
      />
      <Item icon={Bell} label="Send Notification" onClick={() => { setOpen(false); setModal("notify"); }} />
      <Item
        icon={KeyRound}
        label="Reset Password"
        k="reset"
        onClick={() => run("reset", () => resetPw({ data: { customerId: c.id } }), "Send a password reset email to this customer?")}
      />
      <div className="my-1 h-px bg-white/10" />
      {c.account_status === "deleted" ? (
        <Item icon={CheckCircle2} label="Restore Customer" tone="text-emerald-400" k="restore"
          onClick={() => run("restore", () => restore({ data: { customerId: c.id } }), "Restore this deleted customer? Login, ordering and reviews access will be reinstated.")} />
      ) : (
        <>
          {c.account_status !== "suspended" ? (
            <Item icon={PauseCircle} label="Suspend Customer" tone="text-amber-400" k="suspend"
              onClick={() => run("suspend", () => setStatus({ data: { customerId: c.id, status: "suspended" } }), "Suspend this customer? They can still sign in but cannot place new orders.")} />
          ) : (
            <Item icon={CheckCircle2} label="Reactivate Customer" tone="text-emerald-400" k="reactivate"
              onClick={() => run("reactivate", () => restore({ data: { customerId: c.id } }))} />
          )}
          {c.account_status !== "banned" ? (
            <Item icon={Ban} label="Ban Customer" tone="text-destructive" onClick={() => { setOpen(false); setModal("ban"); }} />
          ) : (
            <Item icon={CheckCircle2} label="Restore Account" tone="text-emerald-400" k="unban"
              onClick={() => run("unban", () => restore({ data: { customerId: c.id } }))} />
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
            onClick={() => run("delete", () => softDelete({ data: { customerId: c.id } }), "Soft-delete this customer? They lose login, ordering and review access. The record is retained and can be restored.")} />
        </>
      )}

    </>
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

      {open && createPortal(
        <div
          className="fixed inset-0 z-[120] flex items-end sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={(e) => { e.stopPropagation(); setOpen(false); }}
        >
          <div
            className="w-full sm:max-w-sm max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl border border-white/10 bg-[oklch(0.16_0.01_260)] shadow-2xl backdrop-blur-xl p-2 pb-[max(0.75rem,env(safe-area-inset-bottom))] animate-in slide-in-from-bottom sm:zoom-in-95 sm:slide-in-from-bottom-0 duration-300"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mx-auto mt-1 mb-2 h-1.5 w-10 rounded-full bg-white/15 sm:hidden" />
            <div className="flex items-center justify-between px-2 py-1.5">
              <h3 className="text-sm font-semibold">Customer Actions</h3>
              <button onClick={() => setOpen(false)} className="rounded-full p-1 text-muted-foreground hover:bg-white/10">
                <X className="size-4" />
              </button>
            </div>
            <div className="px-1">{menu}</div>
            <button
              onClick={() => setOpen(false)}
              className="mt-2 w-full rounded-xl border border-white/10 px-3 py-3 text-sm font-medium text-muted-foreground hover:bg-white/5"
            >
              Cancel
            </button>
          </div>
        </div>,
        document.body,
      )}

      {modal === "edit" && (
        <EditModal
          c={c}
          busy={busy === "edit"}
          onClose={() => setModal(null)}
          onSave={(patch) => run("edit", () => updateCustomer({ data: { customerId: c.id, ...patch } }))}
        />
      )}
      {modal === "email" && c.email && (
        <EmailModal
          to={c.email}
          name={c.full_name}
          busy={busy === "email"}
          onClose={() => setModal(null)}
          onSend={(subject, body) => run("email", () => sendEmail({ data: { customerId: c.id, to: c.email as string, subject, body } }))}
        />
      )}
      {modal === "notify" && (
        <NotifyModal
          busy={busy === "notify"}
          onClose={() => setModal(null)}
          onSend={(title, body) => run("notify", () => notify({ data: { customerId: c.id, title, body } }))}
        />
      )}
      {modal === "ban" && (
        <BanModal
          name={c.full_name || c.email || "this customer"}
          busy={busy === "ban"}
          onClose={() => setModal(null)}
          onBan={(reason) => run("ban", () => setStatus({ data: { customerId: c.id, status: "banned", reason } }))}
        />
      )}
    </div>
  );
}

function Shell({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => { document.body.style.overflow = prev; document.removeEventListener("keydown", onKey); };
  }, [onClose]);

  return createPortal(
    <div
      className="fixed inset-0 z-[130] flex items-stretch sm:items-center sm:justify-center bg-black/60 backdrop-blur-sm sm:p-4 animate-in fade-in duration-200"
      onClick={(e) => { e.stopPropagation(); onClose(); }}
    >
      <div
        className="flex w-full flex-col h-[100dvh] sm:h-auto sm:max-w-md sm:max-h-[90vh] border border-white/10 bg-[oklch(0.16_0.01_260)] shadow-2xl rounded-none sm:rounded-2xl animate-in slide-in-from-bottom sm:zoom-in-95 sm:slide-in-from-bottom-0 duration-300"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-4 border-b border-white/10 pt-[max(1rem,env(safe-area-inset-top))]">
          <h3 className="text-sm font-semibold truncate">{title}</h3>
          <button onClick={onClose} className="rounded-full p-1 shrink-0 text-muted-foreground hover:bg-white/10"><X className="size-4" /></button>
        </div>
        <div className="flex-1 overflow-y-auto px-5 py-5 pb-[max(1.5rem,env(safe-area-inset-bottom))]">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
}

const inputCls = "w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm focus:outline-none focus:border-accent/40";
const btnPrimary = "inline-flex items-center justify-center gap-1.5 rounded-xl bg-accent px-4 py-2 text-sm font-medium text-accent-foreground disabled:opacity-50";
const btnGhost = "rounded-xl border border-white/10 px-4 py-2 text-sm hover:bg-white/5";

type EditPatch = {
  full_name?: string;
  phone?: string;
  email?: string;
  account_status?: "active" | "suspended" | "banned" | "deleted";
  note?: string;
  tags?: string[];
  tier_override?: string | null;
};

function EditModal({ c, busy, onClose, onSave }: {
  c: CustomerRow; busy: boolean; onClose: () => void;
  onSave: (patch: EditPatch) => void;
}) {
  const [name, setName] = useState(c.full_name ?? "");
  const [phone, setPhone] = useState(c.phone ?? "");
  const [email, setEmail] = useState(c.email ?? "");
  const [status, setStatus] = useState<EditPatch["account_status"]>(c.account_status);
  const [note, setNote] = useState("");
  const [tags, setTags] = useState("");
  const [tier, setTier] = useState("");
  return (
    <Shell title="Edit Customer" onClose={onClose}>
      <div className="space-y-3">
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Name</span>
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} placeholder="Full name" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Email</span>
          <input value={email} onChange={(e) => setEmail(e.target.value)} className={inputCls} placeholder="email@example.com" type="email" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Phone</span>
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={inputCls} placeholder="Phone" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Status</span>
          <select value={status} onChange={(e) => setStatus(e.target.value as EditPatch["account_status"])} className={inputCls}>
            <option value="active">Active</option>
            <option value="suspended">Suspended</option>
            <option value="banned">Banned</option>
            <option value="deleted">Deleted</option>
          </select>
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Tier override</span>
          <input value={tier} onChange={(e) => setTier(e.target.value)} className={inputCls} placeholder="e.g. VIP, Gold (leave blank to keep)" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Tags (comma separated)</span>
          <input value={tags} onChange={(e) => setTags(e.target.value)} className={inputCls} placeholder="wholesale, fraud-watch" />
        </label>
        <label className="block">
          <span className="text-[11px] uppercase tracking-widest text-muted-foreground">Internal note</span>
          <textarea value={note} onChange={(e) => setNote(e.target.value)} rows={3} className={inputCls} placeholder="Add a private admin note (optional)" />
        </label>
        <div className="flex items-center justify-end gap-2 pt-2">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button
            disabled={busy}
            onClick={() => onSave({
              full_name: name.trim(),
              phone: phone.trim(),
              email: email.trim() && email.trim() !== (c.email ?? "") ? email.trim() : undefined,
              account_status: status,
              note: note.trim() || undefined,
              tags: tags.trim() ? tags.split(",").map((t) => t.trim()).filter(Boolean) : undefined,
              tier_override: tier.trim() ? tier.trim() : undefined,
            })}
            className={btnPrimary}
          >
            {busy ? <Loader2 className="size-4 animate-spin" /> : null} Save Changes
          </button>
        </div>
      </div>
    </Shell>
  );
}

function EmailModal({ to, name, busy, onClose, onSend }: {
  to: string; name: string | null; busy: boolean; onClose: () => void; onSend: (subject: string, body: string) => void;
}) {
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState(name ? `Hi ${name},\n\n` : "");
  const valid = subject.trim().length >= 2 && body.trim().length >= 1;
  return (
    <Shell title="Send Email" onClose={onClose}>
      <div className="space-y-3">
        <div className="text-xs text-muted-foreground">To: <span className="font-mono text-foreground">{to}</span></div>
        <input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputCls} placeholder="Subject" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={6} className={inputCls} placeholder="Message" />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button disabled={busy || !valid} onClick={() => onSend(subject.trim(), body.trim())} className={btnPrimary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />} Send
          </button>
        </div>
      </div>
    </Shell>
  );
}

function NotifyModal({ busy, onClose, onSend }: {
  busy: boolean; onClose: () => void; onSend: (title: string, body: string) => void;
}) {
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const valid = title.trim().length >= 2 && body.trim().length >= 1;
  return (
    <Shell title="Send Notification" onClose={onClose}>
      <div className="space-y-3">
        <input value={title} onChange={(e) => setTitle(e.target.value)} className={inputCls} placeholder="Notification title" />
        <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={inputCls} placeholder="Message" />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button disabled={busy || !valid} onClick={() => onSend(title.trim(), body.trim())} className={btnPrimary}>
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Bell className="size-4" />} Send
          </button>
        </div>
      </div>
    </Shell>
  );
}

function BanModal({ name, busy, onClose, onBan }: {
  name: string; busy: boolean; onClose: () => void; onBan: (reason: string) => void;
}) {
  const [reason, setReason] = useState("");
  const valid = reason.trim().length >= 3;
  return (
    <Shell title="Ban Customer" onClose={onClose}>
      <div className="space-y-3">
        <p className="text-xs text-muted-foreground">
          Banning <span className="text-foreground font-medium">{name}</span> blocks sign-in actions, ordering and reviews. A reason is required and recorded for audit.
        </p>
        <textarea value={reason} onChange={(e) => setReason(e.target.value)} rows={3} className={inputCls} placeholder="Reason for ban (required)" />
        <div className="flex items-center justify-end gap-2 pt-1">
          <button onClick={onClose} className={btnGhost}>Cancel</button>
          <button disabled={busy || !valid} onClick={() => onBan(reason.trim())}
            className="inline-flex items-center justify-center gap-1.5 rounded-xl bg-destructive px-4 py-2 text-sm font-medium text-destructive-foreground disabled:opacity-50">
            {busy ? <Loader2 className="size-4 animate-spin" /> : <Ban className="size-4" />} Ban Customer
          </button>
        </div>
      </div>
    </Shell>
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
