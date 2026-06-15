import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Plus, Send, LifeBuoy, X, ChevronRight,
  ShieldCheck, MessageSquare, CheckCircle2, Check, CheckCheck,
  Package, Truck, RotateCcw, AlertCircle, FileText, Download, Eye, Camera, UploadCloud, Mail,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { markTicketRead } from "@/lib/use-support-unread";
import { notifySupportEvent } from "@/lib/support.functions";
import { SUPPORT_CATEGORIES, type SupportCategoryId, type SupportContextSnapshot } from "@/lib/support-context";
import { useSupportAvailability, fmtLastActive } from "@/lib/support-presence";
import { PRESENCE_META } from "@/lib/support-analytics";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { TicketRatingPrompt } from "@/components/site/TicketRatingPrompt";

/** Fire-and-forget branded support email; never blocks or surfaces errors to the user. */
function fireSupportEmail(ticketId: string, event: "created" | "customer_reply" | "staff_reply") {
  void notifySupportEvent({ data: { ticketId, event } }).catch(() => {});
}

type SearchParams = {
  ticket?: string;
  order?: string;
  return?: string;
  refund?: string;
  compose?: string;
  category?: string;
  subject?: string;
};

export const Route = createFileRoute("/account_/support")({
  validateSearch: (search: Record<string, unknown>): SearchParams => {
    const str = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : undefined);
    return {
      ticket: str(search.ticket),
      order: str(search.order),
      return: str(search.return),
      refund: str(search.refund),
      compose: str(search.compose),
      category: str(search.category),
      subject: str(search.subject),
    };
  },
  head: () => ({
    meta: [
      { title: "Support — FoundOurMarket™" },
      { name: "description", content: "Open a support ticket and chat with our team in real time." },
    ],
  }),
  component: SupportPage,
});

const CATEGORIES = SUPPORT_CATEGORIES;


type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  last_message_at: string;
  created_at: string;
};

type Message = {
  id: string;
  ticket_id: string;
  sender_id: string;
  sender_role: string;
  body: string;
  attachments: string[];
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  channel?: string | null;
  source?: string | null;
  sender_email?: string | null;
  received_at?: string | null;
};

function statusTone(s: string) {
  const v = s.toLowerCase();
  if (v === "resolved" || v === "closed") return "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20";
  if (v === "pending") return "text-sky-400 bg-sky-400/10 ring-sky-400/20";
  return "text-accent bg-accent/10 ring-accent/25";
}

// Customer-facing support availability — aggregate only, no staff names.
function SupportAvailabilityBanner() {
  const a = useSupportAvailability();
  const meta = PRESENCE_META[a.state];
  const label = a.state === "online" ? "Support Online" : a.state === "away" ? "Support Team Away" : "Support Team Offline";
  const sub = a.state === "online"
    ? "We typically reply in real time."
    : a.state === "away"
      ? "We'll reply as soon as an agent is back."
      : a.lastActiveAt ? `Last active ${fmtLastActive(a.lastActiveAt)}` : "Leave a message and we'll get back to you.";
  return (
    <div className="mb-5 flex items-center gap-3 rounded-2xl glass p-3.5">
      <span aria-hidden className="text-lg leading-none">{meta.dot}</span>
      <div className="min-w-0">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-muted-foreground truncate">{sub}</p>
      </div>
    </div>
  );
}


function SupportPage() {
  const { user, loading } = useAuth();
  const { market } = useRegion();
  const nav = useNavigate();
  const search = useSearch({ from: Route.id });
  const deepLinkTicket = search.ticket;
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  const prefill = useMemo(
    () => ({
      order: search.order,
      return: search.return,
      refund: search.refund,
      category: (search.category as SupportCategoryId) || undefined,
      subject: search.subject,
    }),
    [search.order, search.return, search.refund, search.category, search.subject],
  );
  const wantsCompose = !!(search.compose || search.order || search.return || search.refund);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  // Deep-link: open the exact ticket from ?ticket=<id> (e.g. a notification tap).
  useEffect(() => {
    if (deepLinkTicket) setActiveId(deepLinkTicket);
  }, [deepLinkTicket]);

  // Deep-link: open the compose sheet pre-filled with order/return/refund context.
  useEffect(() => {
    if (wantsCompose && !deepLinkTicket) setComposing(true);
  }, [wantsCompose, deepLinkTicket]);


  const loadTickets = useCallback(async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,subject,category,status,priority,last_message_at,created_at")
      .order("last_message_at", { ascending: false });
    if (error) { toast.error(error.message); setTickets([]); return; }
    setTickets((data as Ticket[]) ?? []);
  }, []);

  useEffect(() => {
    if (!user) return;
    void loadTickets();
    const ch = supabase
      .channel(`support-tickets:${user.id}`)
      .on("postgres_changes", { event: "*", schema: "public", table: "support_tickets", filter: `user_id=eq.${user.id}` }, () => loadTickets())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, loadTickets]);

  if (loading || !user) {
    return <div className="min-h-[60vh] grid place-items-center"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  return (
    <div className="min-h-screen pb-[calc(7rem+env(safe-area-inset-bottom))] md:pb-10">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[55vh] opacity-40 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />
      </div>

      <header className="sticky top-0 z-30 backdrop-blur-xl bg-background/70 border-b border-white/[0.06]" style={{ paddingTop: "max(0.25rem, env(safe-area-inset-top))" }}>
        <div className="container-page h-12 flex items-center gap-3">
          <Link to="/account" className="size-9 -ml-2 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground" aria-label="Back to account">
            <ArrowLeft className="size-4" />
          </Link>
          <span className="text-[10px] font-mono uppercase tracking-[0.28em] text-muted-foreground/60">Account</span>
          <span className="ml-auto text-[10px] font-mono uppercase tracking-[0.24em] text-accent">Support</span>
        </div>
      </header>

      <div className="container-page py-6 max-w-3xl">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }} className="mb-6">
          <p className="text-[10px] font-mono uppercase tracking-[0.32em] text-accent mb-2">Help center</p>
          <h1 className="text-[28px] sm:text-[34px] leading-[1.05] font-display font-semibold tracking-tight">How can we help?</h1>
          <p className="mt-3 text-sm text-muted-foreground max-w-md leading-relaxed">
            Open a ticket and our team replies in real time. Track every conversation here.
          </p>
        </motion.div>

        <SupportAvailabilityBanner />


        <button
          onClick={() => setComposing(true)}
          className="group w-full mb-6 flex items-center gap-3 rounded-2xl glass-strong p-4 text-left hover:border-accent/40 transition-all"
        >
          <span className="size-10 grid place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30"><Plus className="size-5" /></span>
          <div className="flex-1">
            <p className="text-sm font-semibold">New support ticket</p>
            <p className="text-xs text-muted-foreground">Describe your issue and attach screenshots</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
        </button>

        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground/60">Your tickets</h2>
          {tickets && tickets.length > 0 && <span className="text-[10px] font-mono text-muted-foreground/40">{tickets.length}</span>}
        </div>

        {tickets === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : tickets.length === 0 ? (
          <div className="rounded-2xl glass p-8 text-center">
            <LifeBuoy className="size-6 text-accent mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">No tickets yet. Open one above and we'll take care of it.</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {tickets.map((t) => (
              <button key={t.id} onClick={() => setActiveId(t.id)} className="group w-full flex items-center gap-3 rounded-2xl glass p-4 text-left hover:border-accent/40 transition-all">
                <span className="size-9 grid place-items-center rounded-xl bg-white/[0.04] text-muted-foreground group-hover:text-accent transition-colors"><MessageSquare className="size-4" /></span>
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-[11px] text-muted-foreground/70 font-mono mt-0.5">
                    #{t.id.slice(0, 8)} · {new Date(t.last_message_at).toLocaleDateString()}
                  </p>
                </div>
                <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ring-1", statusTone(t.status))}>{t.status}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <AnimatePresence>
        {composing && (
          <ComposeSheet
            userId={user.id}
            market={market}
            prefill={prefill}
            onClose={() => {
              setComposing(false);
              if (wantsCompose) nav({ to: "/account_/support", search: {}, replace: true });
            }}
            onContinue={(id) => {
              setComposing(false);
              if (wantsCompose) nav({ to: "/account_/support", search: {}, replace: true });
              setActiveId(id);
            }}
            onCreated={(id) => {
              setComposing(false);
              if (wantsCompose) nav({ to: "/account_/support", search: {}, replace: true });
              void loadTickets();
              setActiveId(id);
            }}
          />
        )}

        {activeId && (
          <ThreadSheet
            ticketId={activeId}
            userId={user.id}
            isStaff={false}
            onClose={() => {
              setActiveId(null);
              if (deepLinkTicket) nav({ to: "/account_/support", search: {}, replace: true });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Compose new ticket ---------- */
type Prefill = { order?: string; return?: string; refund?: string; category?: SupportCategoryId; subject?: string };
type OpenTicket = { id: string; subject: string; status: string; ticket_number: string };

function ComposeSheet({
  userId, market, prefill, onClose, onCreated, onContinue,
}: {
  userId: string;
  market: string;
  prefill?: Prefill;
  onClose: () => void;
  onCreated: (id: string) => void;
  onContinue: (id: string) => void;
}) {
  const [subject, setSubject] = useState(prefill?.subject ?? "");
  const [category, setCategory] = useState<string>(prefill?.category ?? "other");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);
  const [ctx, setCtx] = useState<SupportContextSnapshot | null>(null);
  const [existing, setExisting] = useState<OpenTicket[] | null>(null);
  const [forceNew, setForceNew] = useState(false);

  // Build a context snapshot + duplicate check from the linked order/return/refund.
  useEffect(() => {
    let active = true;
    (async () => {
      const snap: SupportContextSnapshot = {};
      if (prefill?.order) {
        const [{ data: order }, { data: items }, { data: ship }, { data: ret }] = await Promise.all([
          supabase.from("orders").select("id,status,total,currency,tracking_number,carrier").eq("id", prefill.order).maybeSingle(),
          supabase.from("order_items").select("name,image").eq("order_id", prefill.order).limit(1),
          supabase.from("shipments").select("status").eq("order_id", prefill.order).order("created_at", { ascending: false }).limit(1),
          supabase.from("returns").select("status,refund_status").eq("order_id", prefill.order).order("created_at", { ascending: false }).limit(1),
        ]);
        if (order) {
          snap.order_number = order.id.slice(0, 8).toUpperCase();
          snap.order_status = order.status;
          snap.total = order.total;
          snap.currency = order.currency;
          snap.tracking_number = order.tracking_number ?? undefined;
          snap.carrier = order.carrier ?? undefined;
        }
        const item = (items ?? [])[0];
        if (item) { snap.product_name = item.name; snap.product_image = item.image ?? undefined; }
        const s = (ship ?? [])[0];
        if (s) snap.delivery_status = s.status;
        const r = (ret ?? [])[0];
        if (r) { snap.return_status = r.status; snap.refund_status = r.refund_status ?? undefined; }

        // Duplicate detection: any active ticket already linked to this order.
        const { data: open } = await supabase
          .from("support_tickets")
          .select("id,subject,status,ticket_number")
          .eq("order_id", prefill.order)
          .in("status", ["open", "pending"])
          .order("last_message_at", { ascending: false });
        if (active) setExisting((open as OpenTicket[]) ?? []);
      } else {
        if (active) setExisting([]);
      }
      if (active) setCtx(Object.keys(snap).length ? snap : null);
    })();
    return () => { active = false; };
  }, [prefill?.order]);

  async function submit() {
    if (!subject.trim()) { toast.error("Add a subject"); return; }
    if (!body.trim()) { toast.error("Describe your issue"); return; }
    setSaving(true);
    const { data: t, error } = await supabase
      .from("support_tickets")
      .insert({
        user_id: userId,
        subject: subject.trim(),
        category,
        market_region: market,
        order_id: prefill?.order ?? null,
        return_id: prefill?.return ?? null,
        refund_id: prefill?.refund ?? null,
        context: (ctx ?? {}) as unknown as never,
      })
      .select("id")
      .single();
    if (error || !t) { setSaving(false); toast.error(error?.message ?? "Failed to create ticket"); return; }
    const urls = await uploadAttachments(userId, t.id, files);
    const { error: mErr } = await supabase.from("support_messages").insert({
      ticket_id: t.id, sender_id: userId, sender_role: "customer", body: body.trim(), attachments: urls,
    });
    setSaving(false);
    if (mErr) { toast.error(mErr.message); return; }
    toast.success("Ticket created", { description: "We'll reply shortly." });
    fireSupportEmail(t.id, "created");
    onCreated(t.id);
  }

  const showDuplicateGate = existing && existing.length > 0 && !forceNew;

  return (
    <Sheet onClose={onClose} title="New ticket">
      <div className="space-y-4">
        {ctx && <ContextCard ctx={ctx} />}

        {showDuplicateGate ? (
          <div className="rounded-2xl border border-accent/30 bg-accent/[0.06] p-4 space-y-3">
            <p className="flex items-center gap-2 text-sm font-semibold text-accent">
              <AlertCircle className="size-4" /> You already have an active conversation for this order.
            </p>
            <p className="text-xs text-muted-foreground">
              Continuing keeps everything in one thread so our team has full context.
            </p>
            <div className="flex flex-col gap-2">
              <button
                onClick={() => onContinue(existing![0].id)}
                className="w-full bg-accent text-accent-foreground rounded-full px-5 py-2.5 text-xs uppercase tracking-widest font-bold hover:brightness-110 transition inline-flex items-center justify-center gap-2"
              >
                <MessageSquare className="size-4" /> Continue existing ticket
              </button>
              <button
                onClick={() => setForceNew(true)}
                className="w-full bg-white/[0.04] ring-1 ring-white/10 text-foreground rounded-full px-5 py-2.5 text-xs uppercase tracking-widest font-semibold hover:ring-accent/40 transition inline-flex items-center justify-center gap-2"
              >
                <Plus className="size-4" /> Create new ticket
              </button>
            </div>
          </div>
        ) : (
          <>
            <Field label="Subject">
              <input value={subject} onChange={(e) => setSubject(e.target.value)} maxLength={120} placeholder="Brief summary of your issue"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 transition" />
            </Field>
            <Field label="Category">
              <div className="flex flex-wrap gap-2">
                {CATEGORIES.map((c) => (
                  <button key={c.id} onClick={() => setCategory(c.id)} type="button"
                    className={cn("rounded-full px-3 py-1.5 text-xs ring-1 transition", category === c.id ? "bg-accent/15 text-accent ring-accent/40" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-accent/30")}>
                    {c.label}
                  </button>
                ))}
              </div>
            </Field>
            <Field label="Message">
              <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={5} maxLength={4000} placeholder="Tell us what's going on…"
                className="w-full bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 resize-none transition" />
            </Field>
            <AttachmentPicker files={files} setFiles={setFiles} />
            <button onClick={submit} disabled={saving}
              className="w-full bg-accent text-accent-foreground rounded-full px-6 py-3 text-xs uppercase tracking-widest font-bold disabled:opacity-50 hover:brightness-110 transition-all flex items-center justify-center gap-2">
              {saving ? <><Loader2 className="size-4 animate-spin" /> Creating…</> : <><Send className="size-4" /> Submit ticket</>}
            </button>
          </>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- Context card shown on ticket compose + thread ---------- */
export function ContextCard({ ctx }: { ctx: SupportContextSnapshot }) {
  const rows: { icon: typeof Package; label: string; value?: string }[] = [
    { icon: Package, label: "Order", value: ctx.order_number ? `#${ctx.order_number}` : undefined },
    { icon: CheckCircle2, label: "Status", value: ctx.order_status },
    { icon: Truck, label: "Tracking", value: ctx.tracking_number ? `${ctx.carrier ? ctx.carrier + " · " : ""}${ctx.tracking_number}` : ctx.delivery_status },
    { icon: RotateCcw, label: "Return", value: ctx.return_status },
    { icon: RotateCcw, label: "Refund", value: ctx.refund_status },
  ].filter((r) => r.value);

  return (
    <div className="rounded-2xl glass p-3.5 flex gap-3">
      {ctx.product_image ? (
        <img src={ctx.product_image} alt={ctx.product_name ?? "Product"} className="size-14 rounded-xl object-cover ring-1 ring-white/10 shrink-0" />
      ) : (
        <div className="size-14 rounded-xl bg-white/[0.04] grid place-items-center shrink-0"><Package className="size-5 text-muted-foreground" /></div>
      )}
      <div className="min-w-0 flex-1">
        {ctx.product_name && <p className="text-sm font-medium truncate">{ctx.product_name}</p>}
        <div className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
          {rows.map((r) => (
            <span key={r.label} className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
              <r.icon className="size-3 text-accent/70" />
              <span className="text-muted-foreground/60">{r.label}:</span>
              <span className="text-foreground/90 capitalize">{r.value!.replace(/_/g, " ")}</span>
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}


/* ---------- Conversation thread ---------- */
export function ThreadSheet({ ticketId, userId, isStaff, onClose }: { ticketId: string; userId: string; isStaff: boolean; onClose: () => void }) {
  const [messages, setMessages] = useState<Message[] | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    const [{ data: m }, { data: t }] = await Promise.all([
      supabase.from("support_messages").select("id,ticket_id,sender_id,sender_role,body,attachments,created_at,delivered_at,read_at,channel,source,sender_email,received_at").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("support_tickets").select("id,subject,category,status,priority,last_message_at,created_at").eq("id", ticketId).maybeSingle(),
    ]);
    setMessages(((m as Message[]) ?? []).map((x) => ({ ...x, attachments: (x.attachments as unknown as string[]) ?? [] })));
    setTicket((t as Ticket) ?? null);
    // Mark this ticket read for the current viewer (clears their unread badge).
    if (userId) void markTicketRead(ticketId, userId);
  }, [ticketId, userId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`support-thread:${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [ticketId, load]);

  useEffect(() => { endRef.current?.scrollIntoView({ behavior: "smooth" }); }, [messages]);

  async function send() {
    if (!reply.trim() && files.length === 0) return;
    setSending(true);
    const urls = await uploadAttachments(userId, ticketId, files);
    const { error } = await supabase.from("support_messages").insert({
      ticket_id: ticketId, sender_id: userId, sender_role: isStaff ? "staff" : "customer", body: reply.trim() || "(attachment)", attachments: urls,
    });
    setSending(false);
    if (error) { toast.error(error.message); return; }
    if (isStaff) void import("@/lib/support-presence").then((m) => m.pingPresence("send_message"));
    fireSupportEmail(ticketId, isStaff ? "staff_reply" : "customer_reply");
    setReply(""); setFiles([]);
  }

  return (
    <Sheet onClose={onClose} title={ticket?.subject ?? "Conversation"} subtitle={ticket ? `#${ticket.id.slice(0, 8)} · ${ticket.status}` : undefined}>
      <div className="flex flex-col h-[60vh]">
        <div className="flex-1 overflow-y-auto space-y-3 pr-1">
          {messages === null ? (
            <Loader2 className="size-4 animate-spin text-muted-foreground" />
          ) : messages.length === 0 ? (
            <p className="text-sm text-muted-foreground">No messages yet.</p>
          ) : (
            messages.map((m) => {
              const mine = isStaff ? m.sender_role === "staff" : m.sender_role === "customer";
              return (
                <div key={m.id} className={cn("flex", mine ? "justify-end" : "justify-start")}>
                  <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5", mine ? "bg-accent/15 ring-1 ring-accent/25" : "glass")}>
                    {m.sender_role === "staff" && !mine && (
                      <p className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent mb-1"><ShieldCheck className="size-3" /> Support team</p>
                    )}
                    {m.channel === "email" && (
                      <p className="flex flex-wrap items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-sky-400 mb-1">
                        <Mail className="size-3" /> Email
                        {m.sender_email && <span className="text-muted-foreground/70 normal-case tracking-normal">· {m.sender_email}</span>}
                        {m.received_at && <span className="text-muted-foreground/50 normal-case tracking-normal">· received {new Date(m.received_at).toLocaleString()}</span>}
                      </p>
                    )}
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>

                    {m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((p) => <Attachment key={p} path={p} />)}
                      </div>
                    )}
                    <p className="flex items-center gap-1 text-[9px] font-mono text-muted-foreground/50 mt-1.5">
                      <span>{new Date(m.created_at).toLocaleString()}</span>
                      {mine && (
                        m.read_at ? (
                          <span className="flex items-center gap-0.5 text-accent" title={`Read ${new Date(m.read_at).toLocaleString()}`}>
                            <CheckCheck className="size-3" /> Read
                          </span>
                        ) : (
                          <span className="flex items-center gap-0.5 text-muted-foreground/60" title="Delivered">
                            <Check className="size-3" /> Delivered
                          </span>
                        )
                      )}
                    </p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

        {!isStaff && (ticket?.status === "resolved" || ticket?.status === "closed") && (
          <TicketRatingPrompt ticketId={ticketId} userId={userId} />
        )}



        {ticket?.status === "closed" ? (
          <div className="mt-3 rounded-xl glass p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
            <CheckCircle2 className="size-3.5 text-emerald-400" /> This ticket is closed.
          </div>
        ) : (
          <div className="mt-3 space-y-2">
            <AttachmentPicker files={files} setFiles={setFiles} compact />
            <div className="flex items-end gap-2">
              <textarea value={reply} onChange={(e) => setReply(e.target.value)} rows={1} placeholder="Write a reply…"
                onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                className="flex-1 bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 resize-none transition max-h-32" />
              <button onClick={send} disabled={sending} className="size-10 shrink-0 grid place-items-center rounded-xl bg-accent text-accent-foreground disabled:opacity-50 hover:brightness-110 transition">
                {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
              </button>
            </div>
          </div>
        )}
      </div>
    </Sheet>
  );
}

/* ---------- shared bits ---------- */
function Sheet({ title, subtitle, children, onClose }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[70] flex items-end sm:items-center sm:justify-center">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full sm:max-w-lg rounded-t-3xl sm:rounded-3xl glass-strong p-5 max-h-[90vh] overflow-y-auto"
        style={{ paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-start justify-between mb-4">
          <div className="min-w-0">
            <h3 className="text-lg font-display font-semibold truncate">{title}</h3>
            {subtitle && <p className="text-[11px] font-mono uppercase tracking-widest text-muted-foreground mt-0.5">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground shrink-0"><X className="size-4" /></button>
        </div>
        {children}
      </motion.div>
    </motion.div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] font-mono uppercase tracking-widest text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

/* ---------- Attachment system (Phase 4 — secure attachments) ---------- */
const ALLOWED_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"];
const MAX_BYTES = 10 * 1024 * 1024; // 10 MB
const MAX_FILES = 5;
const isImg = (path: string) => /\.(jpe?g|png|webp)$/i.test(path);
const isPdf = (path: string) => /\.pdf$/i.test(path);
const fileLabel = (path: string) => path.split("/").pop() ?? "file";
const prettyBytes = (n: number) => (n < 1024 ? `${n} B` : n < 1048576 ? `${(n / 1024).toFixed(0)} KB` : `${(n / 1048576).toFixed(1)} MB`);

function validateFiles(list: FileList | File[]): File[] {
  const out: File[] = [];
  for (const f of Array.from(list)) {
    if (!ALLOWED_TYPES.includes(f.type)) { toast.error(`${f.name}: unsupported type`, { description: "JPG, PNG, WEBP or PDF only." }); continue; }
    if (f.size > MAX_BYTES) { toast.error(`${f.name}: too large`, { description: "Max 10 MB per file." }); continue; }
    out.push(f);
  }
  return out;
}

function AttachmentPicker({ files, setFiles, compact }: { files: File[]; setFiles: (f: File[]) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  const cameraRef = useRef<HTMLInputElement>(null);
  const [drag, setDrag] = useState(false);

  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...validateFiles(list)].slice(0, MAX_FILES);
    setFiles(next);
  }

  return (
    <div>
      <input ref={inputRef} type="file" accept="image/jpeg,image/png,image/webp,application/pdf" multiple hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />
      <input ref={cameraRef} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { add(e.target.files); e.target.value = ""; }} />

      <div
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={(e) => { e.preventDefault(); setDrag(false); add(e.dataTransfer.files); }}
        className={cn(
          "rounded-xl border border-dashed transition flex items-center gap-2 flex-wrap",
          compact ? "px-2.5 py-1.5" : "px-3 py-2.5",
          drag ? "border-accent/70 bg-accent/[0.06]" : "border-white/10 bg-white/[0.02]",
        )}
      >
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-accent transition">
          <UploadCloud className="size-3.5" /> {compact ? "Attach" : "Attach files"}
        </button>
        <button type="button" onClick={() => cameraRef.current?.click()} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-accent transition sm:hidden">
          <Camera className="size-3.5" /> Camera
        </button>
        {!compact && <span className="text-[10px] text-muted-foreground/60 ml-auto">JPG · PNG · WEBP · PDF · 10 MB</span>}
      </div>

      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative">
              {f.type === "application/pdf" ? (
                <div className="size-14 rounded-lg ring-1 ring-white/10 bg-white/[0.04] grid place-content-center text-center px-1">
                  <FileText className="size-5 mx-auto text-accent" />
                  <span className="block text-[8px] text-muted-foreground truncate max-w-[3.2rem]">{f.name}</span>
                </div>
              ) : (
                <img src={URL.createObjectURL(f)} alt={f.name} className="size-14 rounded-lg object-cover ring-1 ring-white/10" />
              )}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 size-4 grid place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/20"><X className="size-2.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function Attachment({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const pdf = isPdf(path);
  useEffect(() => {
    let active = true;
    supabase.storage.from("support-attachments").createSignedUrl(path, 3600).then(({ data }) => { if (active) setUrl(data?.signedUrl ?? null); });
    return () => { active = false; };
  }, [path]);

  async function download() {
    const { data } = await supabase.storage.from("support-attachments").createSignedUrl(path, 3600, { download: fileLabel(path) });
    if (data?.signedUrl) window.open(data.signedUrl, "_blank");
  }

  if (pdf) {
    return (
      <div className="flex items-center gap-2 rounded-xl glass px-3 py-2 max-w-[16rem]">
        <FileText className="size-5 text-accent shrink-0" />
        <span className="text-xs truncate flex-1 min-w-0">{fileLabel(path)}</span>
        <a href={url ?? "#"} target="_blank" rel="noreferrer" title="View" className="size-7 grid place-items-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-accent transition"><Eye className="size-3.5" /></a>
        <button onClick={download} title="Download" className="size-7 grid place-items-center rounded-lg hover:bg-white/10 text-muted-foreground hover:text-accent transition"><Download className="size-3.5" /></button>
      </div>
    );
  }

  if (!url) return <div className="size-20 rounded-lg bg-white/5 animate-pulse" />;
  return (
    <div className="relative group">
      <a href={url} target="_blank" rel="noreferrer">
        <img src={url} alt="attachment" className="size-20 rounded-lg object-cover ring-1 ring-white/10 hover:ring-accent/40 transition" />
      </a>
      <button onClick={download} title="Download" className="absolute bottom-1 right-1 size-6 grid place-items-center rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition"><Download className="size-3" /></button>
    </div>
  );
}

async function uploadAttachments(userId: string, ticketId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type) || f.size > MAX_BYTES) continue;
    const ext = f.name.split(".").pop()?.toLowerCase() || (f.type === "application/pdf" ? "pdf" : "png");
    const path = `${userId}/${ticketId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, f, { upsert: false, contentType: f.type });
    if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
    // Register metadata (best-effort; storage upload is the source of truth).
    await supabase.from("support_attachments").insert({
      ticket_id: ticketId, uploaded_by: userId, file_name: f.name, file_type: f.type, file_size: f.size, storage_path: path,
    });
    urls.push(path);
  }
  return urls;
}

