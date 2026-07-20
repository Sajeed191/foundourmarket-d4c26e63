import { createFileRoute, useNavigate, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import {
  ArrowLeft, Loader2, Radio, ShieldAlert, IndianRupee, ShoppingBag, Truck,
  RotateCcw, LifeBuoy, Bell, MapPin, Copy, Check, Download, Mail, Plus, X, CreditCard,
  User, Clock, ExternalLink, Star, Heart, StickyNote, HeartPulse, Trash2,
  Tag, Activity, Zap, Send, KeyRound, Ban, ShieldCheck, RefreshCw,
} from "lucide-react";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";
import {
  getCustomerProfileFn, getCustomerRiskFn, createCustomerTicketFn, type CustomerProfile,
  getCustomerExtrasFn, type CustomerReview, type CustomerWishlistItem,
  listCustomerNotesFn, addCustomerNoteFn, deleteCustomerNoteFn, type CustomerNote,
  listCustomerEmailsFn, type CustomerEmail,
  listCustomerTagsFn, addCustomerTagFn, removeCustomerTagFn, CUSTOMER_TAGS,
  getCustomerTimelineFn, type TimelineEvent,
} from "@/lib/customer-center.functions";
import {
  setCustomerStatusFn, restoreCustomerFn, sendCustomerNotificationFn, resetCustomerPasswordFn,
} from "@/lib/customer-admin.functions";
import { computeTier, computeHealth, initialsOf, type TierMeta } from "@/lib/customer-tiers";
import { safeExternalUrl } from "@/lib/safe-redirect";
import { toast } from "sonner";


export const Route = createFileRoute("/admin-customers/$customerId")({
  head: () => ({ meta: [{ title: "Customer Profile — FoundOurMarket™" }] }),
  component: ProfilePage,
});

const money = (v: number | null | undefined, c = "INR") =>
  new Intl.NumberFormat("en-IN", { style: "currency", currency: c, maximumFractionDigits: 0 }).format(Number(v) || 0);
const when = (s: string | null) => (s ? new Date(s).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" }) : "—");
const dateOnly = (s: string | null) => (s ? new Date(s).toLocaleDateString("en-IN", { dateStyle: "medium" }) : "—");
const accountAge = (s: string | null) => {
  if (!s) return "—";
  const days = Math.floor((Date.now() - new Date(s).getTime()) / 86400000);
  if (days < 30) return `${days}d`;
  if (days < 365) return `${Math.floor(days / 30)}mo`;
  return `${(days / 365).toFixed(1)}y`;
};

function riskTone(score: number) {
  if (score >= 70) return "text-destructive border-destructive/30 bg-destructive/10";
  if (score >= 35) return "text-amber-400 border-amber-500/30 bg-amber-500/10";
  return "text-emerald-400 border-emerald-500/30 bg-emerald-500/10";
}
function StatusPill({ status }: { status: string | null }) {
  const s = status ?? "—";
  const map: Record<string, string> = {
    succeeded: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    paid: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    delivered: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    fulfilled: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    resolved: "text-emerald-400 border-emerald-500/30 bg-emerald-500/10",
    pending: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    open: "text-amber-400 border-amber-500/30 bg-amber-500/10",
    failed: "text-destructive border-destructive/30 bg-destructive/10",
    cancelled: "text-destructive border-destructive/30 bg-destructive/10",
    dlq: "text-destructive border-destructive/30 bg-destructive/10",
    bounced: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    complained: "text-orange-400 border-orange-500/30 bg-orange-500/10",
    suppressed: "text-zinc-400 border-zinc-500/30 bg-zinc-500/10",
    sent: "text-sky-400 border-sky-500/30 bg-sky-500/10",
    refunded: "text-sky-400 border-sky-500/30 bg-sky-500/10",
  };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider ${map[s] ?? "text-muted-foreground border-white/10 bg-white/5"}`}>
      {s}
    </span>
  );
}

function CopyBtn({ value, label }: { value: string | null | undefined; label?: string }) {
  const [done, setDone] = useState(false);
  if (!value) return <span className="text-muted-foreground">—</span>;
  return (
    <button
      onClick={() => { navigator.clipboard.writeText(value); setDone(true); setTimeout(() => setDone(false), 1200); }}
      className="inline-flex items-center gap-1 font-mono text-xs hover:text-accent transition-colors"
    >
      <span className="truncate max-w-[200px]">{label ?? value}</span>
      {done ? <Check className="size-3 text-emerald-400" /> : <Copy className="size-3 opacity-50" />}
    </button>
  );
}

function Section({ icon: Icon, title, count, children, id }: { icon: typeof User; title: string; count?: number; children: React.ReactNode; id?: string }) {
  return (
    <div id={id} className="glass border border-white/10 rounded-2xl p-4 scroll-mt-24">
      <div className="flex items-center gap-2 mb-3">
        <Icon className="size-4 text-accent" />
        <h2 className="text-sm font-semibold">{title}</h2>
        {count !== undefined && <span className="text-[10px] font-mono text-muted-foreground">({count})</span>}
      </div>
      {children}
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
      <p className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</p>
      <p className="mt-1 text-sm font-bold tabular-nums">{value}</p>
    </div>
  );
}

function ProfilePage() {
  return (
    <AdminShell title="Customer Profile" subtitle="Customer 360° dossier" allow={["admin", "super_admin", "manager"]}>
      <ProfileInner />
    </AdminShell>
  );
}

type Risk = {
  score: number; level: string; open_alerts: number; failed_payments: number;
  total_attempts: number; address_count: number; chargeback_risk: string;
};

function ProfileInner() {
  const { customerId } = Route.useParams();
  const nav = useNavigate();
  const profileFn = useServerFn(getCustomerProfileFn);
  const riskFn = useServerFn(getCustomerRiskFn);
  const ticketFn = useServerFn(createCustomerTicketFn);
  const extrasFn = useServerFn(getCustomerExtrasFn);
  const notesListFn = useServerFn(listCustomerNotesFn);
  const noteAddFn = useServerFn(addCustomerNoteFn);
  const noteDelFn = useServerFn(deleteCustomerNoteFn);
  const emailsFn = useServerFn(listCustomerEmailsFn);
  const tagsListFn = useServerFn(listCustomerTagsFn);
  const tagAddFn = useServerFn(addCustomerTagFn);
  const tagRemoveFn = useServerFn(removeCustomerTagFn);
  const timelineFn = useServerFn(getCustomerTimelineFn);
  const statusFn = useServerFn(setCustomerStatusFn);
  const restoreFn = useServerFn(restoreCustomerFn);
  const notifyFn = useServerFn(sendCustomerNotificationFn);
  const resetPwFn = useServerFn(resetCustomerPasswordFn);

  const [data, setData] = useState<CustomerProfile | null>(null);
  const [risk, setRisk] = useState<Risk | null>(null);
  const [reviews, setReviews] = useState<CustomerReview[]>([]);
  const [wishlist, setWishlist] = useState<CustomerWishlistItem[]>([]);
  const [notes, setNotes] = useState<CustomerNote[]>([]);
  const [emails, setEmails] = useState<CustomerEmail[]>([]);
  const [emailFilter, setEmailFilter] = useState<string>("all");
  const [tags, setTags] = useState<string[]>([]);
  const [timeline, setTimeline] = useState<TimelineEvent[]>([]);
  const [tlFilter, setTlFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [pulse, setPulse] = useState(false);
  const [showTicket, setShowTicket] = useState(false);
  const [copiedAll, setCopiedAll] = useState(false);
  const reqId = useRef(0);

  const loadNotes = useCallback(async () => {
    try {
      const res = await notesListFn({ data: { customerId } });
      setNotes(res.notes ?? []);
    } catch { /* ignore */ }
  }, [notesListFn, customerId]);

  const loadEmails = useCallback(async () => {
    try {
      const res = await emailsFn({ data: { customerId } });
      setEmails(res.emails ?? []);
    } catch { /* ignore */ }
  }, [emailsFn, customerId]);

  const loadTags = useCallback(async () => {
    try {
      const res = await tagsListFn({ data: { customerId } });
      setTags(res.tags ?? []);
    } catch { /* ignore */ }
  }, [tagsListFn, customerId]);

  const loadTimeline = useCallback(async () => {
    try {
      const res = await timelineFn({ data: { customerId } });
      setTimeline(res.events ?? []);
    } catch { /* ignore */ }
  }, [timelineFn, customerId]);

  const load = useCallback(async () => {
    const id = ++reqId.current;
    setLoading(true);
    try {
      const [p, r, ex] = await Promise.all([
        profileFn({ data: { customerId } }),
        riskFn({ data: { customerId } }).catch(() => null),
        extrasFn({ data: { customerId } }).catch(() => null),
      ]);
      if (id !== reqId.current) return;
      setData(p);
      setRisk(r as Risk | null);
      if (ex) { setReviews(ex.reviews ?? []); setWishlist(ex.wishlist ?? []); }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [profileFn, riskFn, extrasFn, customerId]);

  useEffect(() => { load(); loadNotes(); loadEmails(); loadTags(); loadTimeline(); }, [load, loadNotes, loadEmails, loadTags, loadTimeline]);

  // Quick-action handlers — each re-verifies staff server-side.
  const doStatus = useCallback(async (status: "suspended" | "banned") => {
    const reason = window.prompt(`Reason for ${status === "banned" ? "ban" : "suspension"} (optional):`) ?? undefined;
    try {
      await statusFn({ data: { customerId, status, reason } });
      toast.success(`Customer ${status}`);
      load();
    } catch (e: any) { toast.error(e?.message ?? "Action failed"); }
  }, [statusFn, customerId, load]);

  const doRestore = useCallback(async () => {
    try {
      await restoreFn({ data: { customerId } });
      toast.success("Customer restored");
      load();
    } catch (e: any) { toast.error(e?.message ?? "Action failed"); }
  }, [restoreFn, customerId, load]);

  const doResetPw = useCallback(async () => {
    if (!window.confirm("Send a password-reset email to this customer?")) return;
    try {
      await resetPwFn({ data: { customerId } });
      toast.success("Password reset email sent");
      loadEmails();
    } catch (e: any) { toast.error(e?.message ?? "Action failed"); }
  }, [resetPwFn, customerId, loadEmails]);

  const doNotify = useCallback(async () => {
    const title = window.prompt("Notification title:")?.trim();
    if (!title) return;
    const body = window.prompt("Notification message:")?.trim();
    if (!body) return;
    try {
      await notifyFn({ data: { customerId, title, body } });
      toast.success("Notification sent");
      loadTimeline();
    } catch (e: any) { toast.error(e?.message ?? "Action failed"); }
  }, [notifyFn, customerId, loadTimeline]);

  const addTag = useCallback(async (tag: string) => {
    try {
      const res = await tagAddFn({ data: { customerId, tag: tag as (typeof CUSTOMER_TAGS)[number] } });
      setTags(res.tags ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Could not add tag"); }
  }, [tagAddFn, customerId]);

  const removeTag = useCallback(async (tag: string) => {
    try {
      const res = await tagRemoveFn({ data: { customerId, tag } });
      setTags(res.tags ?? []);
    } catch (e: any) { toast.error(e?.message ?? "Could not remove tag"); }
  }, [tagRemoveFn, customerId]);

  // Scroll to the section referenced by the URL hash once data is rendered
  // (e.g. /admin-customers/:id#orders or #addresses from the actions menu).
  useEffect(() => {
    if (loading || !data) return;
    const hash = typeof window !== "undefined" ? window.location.hash.replace("#", "") : "";
    if (!hash) return;
    const el = document.getElementById(hash);
    if (el) requestAnimationFrame(() => el.scrollIntoView({ behavior: "smooth", block: "start" }));
  }, [loading, data]);




  // Realtime only for this active profile.
  useEffect(() => {
    const ping = () => { setPulse(true); setTimeout(() => setPulse(false), 1000); load(); };
    const flt = `user_id=eq.${customerId}`;
    const ch = supabase
      .channel(`admin-customer-${customerId}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "orders", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "payments", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "shipments", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "returns", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: flt }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "notifications", filter: flt }, ping)
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [customerId, load]);

  const exportHistory = () => {
    if (!data) return;
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `customer-${customerId}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const copyAll = () => {
    if (!data?.profile) return;
    const p = data.profile;
    const text = [
      `Name: ${p.full_name ?? "—"}`, `Email: ${p.email ?? "—"}`, `Phone: ${p.phone ?? "—"}`,
      `Country: ${p.country ?? "—"}`, `Customer ID: ${p.id}`,
      `Lifetime Revenue: ${money(data.value.lifetime_revenue)}`, `Total Orders: ${data.value.total_orders}`,
    ].join("\n");
    navigator.clipboard.writeText(text);
    setCopiedAll(true); setTimeout(() => setCopiedAll(false), 1500);
  };

  if (loading && !data) {
    return <div className="min-h-[40vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }
  if (!data?.profile) {
    return (
      <div className="space-y-4">
        <button onClick={() => nav({ to: "/admin-customers" })} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back to customers
        </button>
        <p className="text-muted-foreground">Customer not found.</p>
      </div>
    );
  }

  const p = data.profile;
  const v = data.value;
  const refundRate = v.total_orders > 0 ? Math.round((v.refund_count / v.total_orders) * 100) : 0;
  const returnRate = v.total_orders > 0 ? Math.round((v.return_count / v.total_orders) * 100) : 0;
  const aov = v.succeeded_payments > 0 ? v.lifetime_revenue / v.succeeded_payments : 0;
  const score = risk?.score ?? 0;
  const tier: TierMeta = computeTier(v.total_orders, v.lifetime_revenue);
  const lastActiveStr = data.orders[0]?.created_at ?? p.last_sign_in_at ?? null;
  const health = computeHealth({
    totalOrders: v.total_orders,
    lifetimeRevenue: v.lifetime_revenue,
    refundCount: v.refund_count,
    openTickets: data.tickets.filter((t) => t.status !== "resolved" && t.status !== "closed").length,
    riskScore: score,
    lastActive: lastActiveStr,
  });

  return (
    <div className="space-y-5">
      {/* Header / actions */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <button onClick={() => nav({ to: "/admin-customers" })} className="inline-flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" /> Back
        </button>
        <div className="flex flex-wrap items-center gap-2">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-widest text-emerald-400">
            <Radio className={`size-3 ${pulse ? "text-accent animate-ping" : ""}`} /> Live
          </span>
          {p.email && (
            <a href={`mailto:${p.email}`} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
              <Mail className="size-3.5" /> Contact
            </a>
          )}
          <button onClick={() => setShowTicket(true)} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
            <Plus className="size-3.5" /> Ticket
          </button>
          <button onClick={copyAll} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
            {copiedAll ? <Check className="size-3.5 text-emerald-400" /> : <Copy className="size-3.5" />} Copy
          </button>
          <button onClick={exportHistory} className="inline-flex items-center gap-1.5 rounded-xl border border-white/10 px-3 py-1.5 text-xs hover:bg-white/5">
            <Download className="size-3.5" /> Export
          </button>
        </div>
      </div>

      {/* Identity banner — avatar, tier, health, value, risk */}
      <div className="glass border border-white/10 rounded-2xl p-4">
        <div className="flex flex-col sm:flex-row sm:items-center gap-4">
          <div className="flex items-center gap-3 min-w-0">
            {p.avatar_url ? (
              <img loading="lazy" decoding="async" src={p.avatar_url} alt="" className="size-14 rounded-2xl object-cover border border-white/10" />
            ) : (
              <span className="size-14 rounded-2xl grid place-items-center bg-accent/15 text-accent text-lg font-bold border border-accent/20">
                {initialsOf(p.full_name, p.email)}
              </span>
            )}
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <h2 className="text-base font-bold truncate">{p.full_name || p.email || "Customer"}</h2>
                <span className={`inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[10px] font-semibold ${tier.className}`}>
                  <span aria-hidden>{tier.emoji}</span> {tier.label}
                </span>
              </div>
              <p className="text-[11px] text-muted-foreground truncate mt-0.5">{p.email || p.phone || p.id}</p>
            </div>
          </div>
          <div className="grid grid-cols-3 gap-2 sm:ml-auto sm:w-auto w-full">
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1"><HeartPulse className="size-3" /> Health</p>
              <p className={`text-lg font-bold tabular-nums ${health.className}`}>{health.score}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1"><IndianRupee className="size-3" /> Value</p>
              <p className="text-lg font-bold tabular-nums text-accent">{money(v.lifetime_revenue)}</p>
            </div>
            <div className="rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2 text-center">
              <p className="text-[9px] uppercase tracking-widest text-muted-foreground inline-flex items-center gap-1"><ShieldAlert className="size-3" /> Risk</p>
              <p className={`text-lg font-bold tabular-nums ${score >= 70 ? "text-destructive" : score >= 35 ? "text-amber-400" : "text-emerald-400"}`}>{score}</p>
            </div>
          </div>
        </div>
      </div>

      {/* Quick Actions — full support console without navigating away */}
      <Section icon={Zap} title="Quick Actions">
        <div className="flex flex-wrap gap-2">
          {p.email && (
            <a href={`mailto:${p.email}`} className="qa-btn"><Mail className="size-3.5" /> Send Email</a>
          )}
          <button onClick={doNotify} className="qa-btn"><Send className="size-3.5" /> Send Notification</button>
          <button onClick={() => setShowTicket(true)} className="qa-btn"><Plus className="size-3.5" /> Add Ticket</button>
          <button onClick={doResetPw} className="qa-btn"><KeyRound className="size-3.5" /> Reset Password</button>
          <button onClick={() => doStatus("suspended")} className="qa-btn text-amber-300"><ShieldAlert className="size-3.5" /> Suspend</button>
          <button onClick={() => doStatus("banned")} className="qa-btn text-destructive"><Ban className="size-3.5" /> Ban</button>
          <button onClick={doRestore} className="qa-btn text-emerald-300"><ShieldCheck className="size-3.5" /> Restore</button>
          <Link to="/admin-orders-ops" className="qa-btn"><ShoppingBag className="size-3.5" /> View Orders</Link>
          <Link to="/admin-shipments" search={{}} className="qa-btn"><Truck className="size-3.5" /> View Shipments</Link>
        </div>
      </Section>

      {/* Segmentation Tags */}
      <Section icon={Tag} title="Tags" count={tags.length}>
        <div className="flex flex-wrap gap-2 mb-3">
          {tags.length === 0 ? (
            <span className="text-xs text-muted-foreground">No tags yet.</span>
          ) : tags.map((t) => (
            <span key={t} className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/10 text-accent px-3 py-1 text-[11px] font-medium">
              {t}
              <button onClick={() => removeTag(t)} aria-label={`Remove ${t}`} className="hover:text-destructive">
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
        <div className="flex flex-wrap gap-1.5">
          {CUSTOMER_TAGS.filter((t) => !tags.includes(t)).map((t) => (
            <button
              key={t}
              onClick={() => addTag(t)}
              className="inline-flex items-center gap-1 rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[10px] text-muted-foreground hover:text-foreground hover:border-accent/40 transition-colors"
            >
              <Plus className="size-3" /> {t}
            </button>
          ))}
        </div>
      </Section>

      <Section icon={User} title="Customer Intelligence">
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Stat label="Name" value={p.full_name ?? "—"} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Email</p>
            <div className="mt-1 text-sm"><CopyBtn value={p.email} /></div>
          </div>
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Phone</p>
            <div className="mt-1 text-sm"><CopyBtn value={p.phone} /></div>
          </div>
          <Stat label="Country" value={p.country ?? "—"} />
          <Stat label="Account Age" value={accountAge(p.created_at)} />
          <Stat label="Last Login" value={when(p.last_sign_in_at)} />
          <Stat label="Last Order" value={dateOnly(data.orders[0]?.created_at ?? null)} />
          <div className="rounded-xl border border-white/10 bg-white/[0.02] p-3">
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground">Risk Score</p>
            <span className={`mt-1 inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-mono ${riskTone(score)}`}>
              <ShieldAlert className="size-3 mr-1" />{score} · {risk?.level ?? "low"}
            </span>
          </div>
        </div>
      </Section>

      {/* SECTION 2 — Customer Value */}
      <Section icon={IndianRupee} title="Customer Value">
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          <Stat label="Lifetime Revenue" value={money(v.lifetime_revenue)} />
          <Stat label="Avg Order Value" value={money(aov)} />
          <Stat label="Total Orders" value={String(v.total_orders)} />
          <Stat label="Delivered" value={String(v.delivered_orders)} />
          <Stat label="Refund Rate" value={`${refundRate}%`} />
          <Stat label="Return Rate" value={`${returnRate}%`} />
        </div>
      </Section>

      {/* SECTION 3 — Orders Timeline */}
      <Section id="orders" icon={ShoppingBag} title="Orders Timeline" count={data.orders.length}>
        {data.orders.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-mono">{o.id.slice(0, 8)}</span>
                    <StatusPill status={o.status} />
                    <StatusPill status={o.payment_status} />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{when(o.created_at)}</p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="font-mono">{money(o.total, o.currency ?? "INR")}</span>
                  <Link to="/admin-orders-ops" className="text-accent hover:underline"><ExternalLink className="size-3.5" /></Link>
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 4 — Payment Intelligence */}
      <Section icon={CreditCard} title="Payment Intelligence" count={data.payments.length}>
        <div className="grid grid-cols-3 gap-3 mb-3">
          <Stat label="Successful" value={String(v.succeeded_payments)} />
          <Stat label="Failed" value={String(v.failed_payments)} />
          <Stat label="Attempts" value={String(risk?.total_attempts ?? data.payments.length)} />
        </div>
        {data.payments.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.payments.map((pay) => (
              <div key={pay.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="capitalize">{pay.method || "—"}</span>
                    <StatusPill status={pay.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5">
                    <CopyBtn value={pay.razorpay_payment_id || pay.transaction_id} />
                  </div>
                </div>
                <span className="font-mono shrink-0">{money(pay.amount, pay.currency ?? "INR")}</span>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 5 — Address Intelligence */}
      <Section id="addresses" icon={MapPin} title="Address Intelligence" count={data.addresses.length}>
        {data.addresses.length === 0 ? <Empty /> : (
          <div className="grid sm:grid-cols-2 gap-3">
            {data.addresses.map((a) => {
              const full = [a.line1, a.line2, a.city, a.state, a.postal, a.country].filter(Boolean).join(", ");
              const maps = a.latitude && a.longitude
                ? `https://www.google.com/maps?q=${a.latitude},${a.longitude}`
                : `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(full)}`;
              return (
                <div key={a.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-3 text-xs">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-medium">{a.full_name || a.label || "Address"}</span>
                    {a.is_default_shipping && <span className="text-[9px] rounded-full border border-emerald-500/30 bg-emerald-500/10 text-emerald-400 px-1.5 py-0.5">SHIP</span>}
                    {a.is_default_billing && <span className="text-[9px] rounded-full border border-sky-500/30 bg-sky-500/10 text-sky-400 px-1.5 py-0.5">BILL</span>}
                  </div>
                  <p className="text-muted-foreground">{full || "—"}</p>
                  {a.phone && <p className="text-muted-foreground mt-0.5">{a.phone}</p>}
                  <div className="mt-2 flex items-center gap-3">
                    <a href={maps} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-accent hover:underline">
                      <MapPin className="size-3" /> Maps
                    </a>
                    <CopyBtn value={full} label="Copy" />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Section>

      {/* SECTION 6 — Shipment Intelligence */}
      <Section icon={Truck} title="Shipment Intelligence" count={data.shipments.length}>
        {data.shipments.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.shipments.map((s) => (
              <div key={s.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span>{s.carrier || "—"}</span>
                    <StatusPill status={s.status} />
                  </div>
                  <div className="text-[10px] text-muted-foreground mt-0.5"><CopyBtn value={s.tracking_number} /></div>
                </div>
                <div className="text-right shrink-0 text-[10px] text-muted-foreground">
                  <p>{s.delivered_at ? `Delivered ${dateOnly(s.delivered_at)}` : s.estimated_delivery ? `ETA ${dateOnly(s.estimated_delivery)}` : dateOnly(s.created_at)}</p>
                  {safeExternalUrl(s.tracking_url) && <a href={safeExternalUrl(s.tracking_url)!} target="_blank" rel="noopener noreferrer" className="text-accent hover:underline">Track</a>}
                </div>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 7 — Returns & Refunds */}
      <Section icon={RotateCcw} title="Returns & Refunds" count={data.returns.length + data.refunds.length}>
        <div className="grid sm:grid-cols-2 gap-4">
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Returns</p>
            {data.returns.length === 0 ? <Empty /> : data.returns.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs mb-2">
                <div className="min-w-0">
                  <StatusPill status={r.status} />
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.reason || "—"}</p>
                </div>
                <span className="font-mono shrink-0">{money(r.refund_amount)}</span>
              </div>
            ))}
          </div>
          <div>
            <p className="text-[10px] uppercase tracking-widest text-muted-foreground mb-2">Refunds</p>
            {data.refunds.length === 0 ? <Empty /> : data.refunds.map((r) => (
              <div key={r.id} className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs mb-2">
                <div className="min-w-0">
                  <StatusPill status={r.status} />
                  <p className="text-[10px] text-muted-foreground mt-0.5 truncate">{r.reason || "—"}</p>
                </div>
                <span className="font-mono shrink-0">{money(r.amount, r.currency ?? "INR")}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* SECTION 8 — Support Intelligence */}
      <Section icon={LifeBuoy} title="Support Intelligence" count={data.tickets.length}>
        {data.tickets.length === 0 ? <Empty /> : (
          <div className="space-y-2">
            {data.tickets.map((t) => (
              <Link key={t.id} to="/admin-support" className="flex items-center justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs hover:bg-white/[0.04]">
                <div className="min-w-0">
                  <p className="truncate font-medium">{t.subject || "Ticket"}</p>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{t.category} · {when(t.last_message_at ?? t.created_at)}</p>
                </div>
                <StatusPill status={t.status} />
              </Link>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 9 — Notification History */}
      <Section icon={Bell} title="Notification History" count={data.notifications.length}>
        {data.notifications.length === 0 ? <Empty /> : (
          <div className="space-y-2 max-h-72 overflow-y-auto pr-1">
            {data.notifications.map((n) => (
              <div key={n.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{n.title || n.type}</span>
                  <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-1"><Clock className="size-3" />{when(n.created_at)}</span>
                </div>
                {n.body && <p className="text-[10px] text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 9b — Email History */}
      <Section icon={Mail} title="Email History" count={emails.length} id="email-history">
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(["all", "sent", "delivered", "failed", "bounced", "suppressed"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setEmailFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                emailFilter === f
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}
            >
              {f}
            </button>
          ))}
        </div>
        {(() => {
          const eStatus = (e: CustomerEmail) =>
            e.delivered_at ? "delivered" : (e.status ?? "sent");
          const matches = (e: CustomerEmail) => {
            if (emailFilter === "all") return true;
            const s = eStatus(e);
            if (emailFilter === "failed") return s === "failed" || s === "dlq";
            if (emailFilter === "bounced") return s === "bounced" || s === "complained";
            return s === emailFilter;
          };
          const shown = emails.filter(matches);
          if (shown.length === 0) return <Empty label="No emails for this filter." />;
          return (
            <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
              {shown.map((e) => (
                <div key={e.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-medium truncate">{e.subject || e.template || "Email"}</span>
                    <StatusPill status={eStatus(e)} />
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[10px] text-muted-foreground">
                    {e.template && <span className="font-mono">{e.template}</span>}
                    <span className="inline-flex items-center gap-1"><Clock className="size-3" />Sent {when(e.sent_at)}</span>
                    {e.delivered_at && <span>Delivered {when(e.delivered_at)}</span>}
                    {e.trigger_source && <span>via {e.trigger_source}</span>}
                  </div>
                  {e.error && <p className="text-[10px] text-destructive mt-1 line-clamp-2">{e.error}</p>}
                </div>
              ))}
            </div>
          );
        })()}
      </Section>



      {/* SECTION 10 — Fraud Intelligence */}
      <Section icon={ShieldAlert} title="Fraud Intelligence" count={data.fraud.length}>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-3">
          <Stat label="Risk Score" value={String(score)} />
          <Stat label="Open Alerts" value={String(risk?.open_alerts ?? 0)} />
          <Stat label="Failed Payments" value={String(risk?.failed_payments ?? 0)} />
          <Stat label="Chargeback Risk" value={risk?.chargeback_risk ?? "low"} />
        </div>
        {data.fraud.length === 0 ? <Empty label="No fraud signals." /> : (
          <div className="space-y-2">
            {data.fraud.map((f) => (
              <div key={f.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="font-medium truncate">{f.title || f.fraud_type}</span>
                  <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[10px] font-mono ${riskTone(Number(f.score) || 0)}`}>{f.severity || f.score}</span>
                </div>
                {f.detail && <p className="text-[10px] text-muted-foreground mt-0.5">{f.detail}</p>}
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 11 — Admin Notes */}
      <Section icon={StickyNote} title="Admin Notes" count={notes.length}>
        <NotesPanel
          notes={notes}
          onAdd={async (note) => { await noteAddFn({ data: { customerId, note } }); await loadNotes(); }}
          onDelete={async (noteId) => { await noteDelFn({ data: { customerId, noteId } }); await loadNotes(); }}
        />
      </Section>

      {/* SECTION 12 — Reviews */}
      <Section icon={Star} title="Reviews" count={reviews.length}>
        {reviews.length === 0 ? <Empty label="No reviews." /> : (
          <div className="space-y-2">
            {reviews.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                <div className="flex items-center justify-between gap-2">
                  <span className="inline-flex items-center gap-1 text-amber-300">
                    {Array.from({ length: 5 }).map((_, i) => (
                      <Star key={i} className={`size-3 ${i < r.rating ? "fill-amber-300" : "opacity-30"}`} />
                    ))}
                  </span>
                  <span className="text-[10px] text-muted-foreground">{dateOnly(r.created_at)}</span>
                </div>
                {r.title && <p className="mt-1 font-medium truncate">{r.title}</p>}
                {r.body && <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-2">{r.body}</p>}
                <p className="text-[10px] text-muted-foreground mt-1 font-mono truncate">{r.product_slug}</p>
              </div>
            ))}
          </div>
        )}
      </Section>

      {/* SECTION 13 — Wishlist */}
      <Section icon={Heart} title="Wishlist" count={wishlist.length}>
        {wishlist.length === 0 ? <Empty label="No saved items." /> : (
          <div className="flex flex-wrap gap-2">
            {wishlist.map((w) => (
              <span key={w.id} className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/[0.02] px-3 py-1.5 text-[11px]">
                <Heart className="size-3 text-accent" /> {w.product_slug}
              </span>
            ))}
          </div>
        )}
      </Section>

      {/* Activity Timeline — unified chronological history, filterable */}
      <Section icon={Activity} title="Activity Timeline" count={timeline.length}>
        <div className="flex flex-wrap gap-1.5 mb-3">
          {(["all", "order", "payment", "shipment", "email", "notification", "support_ticket", "review", "admin_action"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setTlFilter(f)}
              className={`rounded-full border px-2.5 py-1 text-[10px] font-mono uppercase tracking-wider transition-colors ${
                tlFilter === f
                  ? "border-accent/50 bg-accent/15 text-accent"
                  : "border-white/10 bg-white/[0.02] text-muted-foreground hover:text-foreground"
              }`}
            >
              {f === "support_ticket" ? "support" : f === "admin_action" ? "admin" : f}
            </button>
          ))}
        </div>
        {(() => {
          const shown = timeline.filter((e) => tlFilter === "all" || e.kind === tlFilter);
          if (shown.length === 0) return <Empty label="No activity for this filter." />;
          return (
            <ol className="relative border-l border-white/10 ml-2 space-y-3 max-h-[28rem] overflow-y-auto pr-1">
              {shown.map((e, i) => (
                <li key={`${e.kind}-${e.at}-${i}`} className="ml-4">
                  <span className="absolute -left-[5px] mt-1 size-2 rounded-full bg-accent" />
                  <div className="rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-medium truncate">{e.title}</span>
                      <span className="text-[10px] text-muted-foreground shrink-0 inline-flex items-center gap-1">
                        <Clock className="size-3" />{when(e.at)}
                      </span>
                    </div>
                    <div className="mt-0.5 flex items-center gap-2">
                      <span className="text-[9px] font-mono uppercase tracking-wider text-muted-foreground">{e.kind.replace("_", " ")}</span>
                      {e.detail && <span className="text-[10px] text-muted-foreground">{e.detail}</span>}
                    </div>
                  </div>
                </li>
              ))}
            </ol>
          );
        })()}
      </Section>



      {showTicket && (
        <TicketModal
          onClose={() => setShowTicket(false)}
          onCreate={async (subject, priority) => {
            await ticketFn({ data: { customerId, subject, priority } });
            setShowTicket(false);
            load();
          }}
        />
      )}
    </div>
  );
}

function Empty({ label = "No records." }: { label?: string }) {
  return <p className="text-xs text-muted-foreground py-3 text-center">{label}</p>;
}

function TicketModal({ onClose, onCreate }: { onClose: () => void; onCreate: (subject: string, priority: "low" | "normal" | "high" | "urgent") => Promise<void> }) {
  const [subject, setSubject] = useState("");
  const [priority, setPriority] = useState<"low" | "normal" | "high" | "urgent">("normal");
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/60 p-4" onClick={onClose}>
      <div className="glass border border-white/10 rounded-2xl p-5 w-full max-w-md" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold">Create Support Ticket</h3>
          <button onClick={onClose}><X className="size-4 text-muted-foreground" /></button>
        </div>
        <input
          value={subject} onChange={(e) => setSubject(e.target.value)} placeholder="Subject"
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm mb-3 focus:outline-none focus:border-accent/40"
        />
        <select value={priority} onChange={(e) => setPriority(e.target.value as typeof priority)}
          className="w-full bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-sm mb-4 focus:outline-none focus:border-accent/40">
          {["low", "normal", "high", "urgent"].map((p) => <option key={p} value={p} className="bg-background">{p}</option>)}
        </select>
        <button
          disabled={busy || subject.trim().length < 3}
          onClick={async () => { setBusy(true); try { await onCreate(subject.trim(), priority); } finally { setBusy(false); } }}
          className="w-full rounded-xl bg-accent text-accent-foreground py-2 text-sm font-medium disabled:opacity-40"
        >
          {busy ? <Loader2 className="size-4 animate-spin mx-auto" /> : "Create Ticket"}
        </button>
      </div>
    </div>
  );
}

function NotesPanel({
  notes, onAdd, onDelete,
}: {
  notes: CustomerNote[];
  onAdd: (note: string) => Promise<void>;
  onDelete: (noteId: string) => Promise<void>;
}) {
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const QUICK = ["VIP Buyer", "Frequent Customer", "Refund Sensitive", "High Value Buyer"];

  const add = async (note: string) => {
    if (note.trim().length < 1) return;
    setBusy(true);
    try { await onAdd(note.trim()); setText(""); } finally { setBusy(false); }
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-1.5">
        {QUICK.map((q) => (
          <button key={q} disabled={busy} onClick={() => add(q)}
            className="rounded-full border border-white/10 bg-white/[0.02] px-2.5 py-1 text-[11px] hover:bg-white/5 disabled:opacity-40">
            + {q}
          </button>
        ))}
      </div>
      <div className="flex items-center gap-2">
        <input
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") add(text); }}
          placeholder="Add a private note…"
          maxLength={2000}
          className="flex-1 bg-white/[0.03] border border-white/10 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-accent/40"
        />
        <button
          disabled={busy || text.trim().length < 1}
          onClick={() => add(text)}
          className="rounded-xl bg-accent text-accent-foreground px-3 py-2 text-xs font-medium disabled:opacity-40 inline-flex items-center gap-1"
        >
          {busy ? <Loader2 className="size-3.5 animate-spin" /> : <Plus className="size-3.5" />} Add
        </button>
      </div>
      {notes.length === 0 ? (
        <Empty label="No notes yet." />
      ) : (
        <div className="space-y-2">
          {notes.map((n) => (
            <div key={n.id} className="flex items-start justify-between gap-2 rounded-xl border border-white/10 bg-white/[0.02] p-2.5 text-xs">
              <div className="min-w-0">
                <p className="whitespace-pre-wrap break-words">{n.note}</p>
                <p className="text-[10px] text-muted-foreground mt-1">{when(n.created_at)}</p>
              </div>
              <button onClick={() => onDelete(n.id)} className="shrink-0 text-muted-foreground hover:text-destructive">
                <Trash2 className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
