import { createFileRoute, Link, useNavigate, useSearch } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import {
  ArrowLeft, Loader2, Plus, Send, LifeBuoy, X, ChevronRight,
  ShieldCheck, MessageSquare, CheckCircle2, Check, CheckCheck,
  Package, Truck, RotateCcw, AlertCircle, FileText, Download, Eye, Camera, UploadCloud, Mail, Search,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";

import { markTicketRead } from "@/lib/use-support-unread";
import { notifySupportEvent } from "@/lib/support.functions";
import { type SupportCategoryId, type SupportContextSnapshot } from "@/lib/support-context";
import { useSupportAvailability, fmtLastActive, useTypingIndicator } from "@/lib/support-presence";
import { PRESENCE_META } from "@/lib/support-analytics";
import { TypingIndicator } from "@/components/support/TypingDots";
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


type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  last_message_at: string;
  created_at: string;
  ticket_number?: string;
  unread_customer_count?: number;
  order_id?: string | null;
  channel?: string | null;
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


const FILTERS = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "pending", label: "Pending" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
  { id: "unread", label: "Unread" },
  { id: "high", label: "High Priority" },
] as const;
type FilterId = (typeof FILTERS)[number]["id"];

function priorityTone(p: string) {
  const v = p.toLowerCase();
  if (v === "urgent") return "text-rose-400 bg-rose-400/10 ring-rose-400/25";
  if (v === "high") return "text-amber-400 bg-amber-400/10 ring-amber-400/25";
  if (v === "low") return "text-muted-foreground bg-white/[0.04] ring-white/10";
  return "text-foreground/70 bg-white/[0.04] ring-white/10";
}

function SupportPage() {
  const { user, loading } = useAuth();
  
  const nav = useNavigate();
  const search = useSearch({ from: Route.id });
  const deepLinkTicket = search.ticket;
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [filter, setFilter] = useState<FilterId>("all");
  const [query, setQuery] = useState("");

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

  // Deep-link: a notification tap (?ticket=<id>) opens the dedicated full-page conversation.
  useEffect(() => {
    if (deepLinkTicket) {
      nav({ to: "/account/support/ticket/$ticketId", params: { ticketId: deepLinkTicket }, replace: true });
    }
  }, [deepLinkTicket, nav]);

  // Deep-link: redirect compose intent to the dedicated full-page new-ticket form.
  useEffect(() => {
    if (wantsCompose && !deepLinkTicket) {
      nav({
        to: "/account/support/new",
        search: {
          order: prefill.order,
          return: prefill.return,
          refund: prefill.refund,
          category: prefill.category,
          subject: prefill.subject,
        },
        replace: true,
      });
    }
  }, [wantsCompose, deepLinkTicket, nav, prefill]);

  const loadTickets = useCallback(async () => {
    const { data, error } = await supabase
      .from("support_tickets")
      .select("id,subject,category,status,priority,last_message_at,created_at,ticket_number,unread_customer_count,order_id,channel")
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

  const visible = useMemo(() => {
    if (!tickets) return null;
    const q = query.trim().toLowerCase();
    return tickets.filter((t) => {
      if (filter === "unread") { if (!(t.unread_customer_count && t.unread_customer_count > 0)) return false; }
      else if (filter === "high") { if (!["high", "urgent"].includes(t.priority.toLowerCase())) return false; }
      else if (filter !== "all") { if (t.status.toLowerCase() !== filter) return false; }
      if (q) {
        const hay = `${t.subject} ${t.ticket_number ?? ""} ${t.id}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [tickets, filter, query]);

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

        <Link
          to="/account/support/new"
          search={{}}
          className="group w-full mb-6 flex items-center gap-3 rounded-2xl glass-strong p-4 text-left hover:border-accent/40 transition-all"
        >
          <span className="size-10 grid place-items-center rounded-xl bg-accent/15 text-accent ring-1 ring-accent/30"><Plus className="size-5" /></span>
          <div className="flex-1">
            <p className="text-sm font-semibold">New support ticket</p>
            <p className="text-xs text-muted-foreground">Describe your issue and attach screenshots</p>
          </div>
          <ChevronRight className="size-4 text-muted-foreground group-hover:text-accent transition-colors" />
        </Link>

        {/* Search */}
        <div className="relative mb-3">
          <Search className="size-4 absolute left-3.5 top-1/2 -translate-y-1/2 text-muted-foreground/60" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search by ticket number, subject, or order"
            className="w-full bg-white/[0.04] border border-white/10 rounded-xl pl-10 pr-3 py-2.5 text-sm focus:outline-none focus:border-accent/60 transition"
          />
        </div>

        {/* Filters */}
        <div className="flex items-center gap-2 mb-4 overflow-x-auto no-scrollbar -mx-1 px-1">
          {FILTERS.map((f) => (
            <button
              key={f.id}
              onClick={() => setFilter(f.id)}
              className={cn(
                "shrink-0 rounded-full px-3 py-1.5 text-xs font-medium ring-1 transition",
                filter === f.id ? "bg-accent/15 text-accent ring-accent/40" : "bg-white/[0.03] text-muted-foreground ring-white/10 hover:ring-accent/30",
              )}
            >
              {f.label}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-2 mb-3">
          <h2 className="text-[11px] font-mono uppercase tracking-[0.24em] text-muted-foreground/60">Your tickets</h2>
          {visible && visible.length > 0 && <span className="text-[10px] font-mono text-muted-foreground/40">{visible.length}</span>}
        </div>

        {visible === null ? (
          <Loader2 className="size-4 animate-spin text-muted-foreground" />
        ) : visible.length === 0 ? (
          <div className="rounded-2xl glass p-8 text-center">
            <LifeBuoy className="size-6 text-accent mx-auto mb-3" />
            <p className="text-sm text-muted-foreground">{tickets && tickets.length > 0 ? "No tickets match this filter." : "No tickets yet. Open one above and we'll take care of it."}</p>
          </div>
        ) : (
          <div className="space-y-2.5">
            {visible.map((t) => {
              const unread = t.unread_customer_count && t.unread_customer_count > 0 ? t.unread_customer_count : 0;
              return (
                <Link
                  key={t.id}
                  to="/account/support/ticket/$ticketId"
                  params={{ ticketId: t.id }}
                  className="group block rounded-2xl glass p-4 hover:border-accent/40 transition-all"
                >
                  <div className="flex items-center gap-2 mb-1.5 flex-wrap">
                    <span className="text-[10px] font-mono tracking-wider text-muted-foreground/70">{t.ticket_number ?? `#${t.id.slice(0, 8)}`}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ring-1", statusTone(t.status))}>{t.status}</span>
                    <span className={cn("rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest ring-1", priorityTone(t.priority))}>{t.priority}</span>
                    {t.channel === "email" && <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[9px] font-mono uppercase tracking-widest text-sky-400 bg-sky-400/10 ring-1 ring-sky-400/25"><Mail className="size-2.5" /> Email</span>}
                    {unread > 0 && <span className="ml-auto size-5 grid place-items-center rounded-full bg-accent text-accent-foreground text-[10px] font-bold">{unread}</span>}
                  </div>
                  <p className="text-sm font-medium truncate">{t.subject}</p>
                  <p className="text-[11px] text-muted-foreground/70 mt-1 flex items-center gap-1.5">
                    <span>{new Date(t.last_message_at).toLocaleDateString()}</span>
                    {t.order_id && <span className="inline-flex items-center gap-1"><Package className="size-3" /> Linked order</span>}
                    <ChevronRight className="size-3.5 ml-auto text-muted-foreground/40 group-hover:text-accent transition-colors" />
                  </p>
                </Link>
              );
            })}
          </div>
        )}
      </div>
    </div>
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
        <img loading="lazy" decoding="async" src={ctx.product_image} alt={ctx.product_name ?? "Product"} className="size-14 rounded-xl object-cover ring-1 ring-white/10 shrink-0" />
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
  const scrollRef = useRef<HTMLDivElement>(null);
  const isAtBottomRef = useRef(true);
  const prevMessageCount = useRef(0);
  const myRole = isStaff ? "staff" : "customer";
  const { otherTyping, notifyTyping, notifyStop } = useTypingIndicator(ticketId, myRole);

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

  // Smart auto-scroll: only snap to bottom on first load, own messages, or when already near bottom.
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 100;
  }, []);

  useEffect(() => {
    if (!messages || !scrollRef.current) return;
    const count = messages.length;
    const firstLoad = prevMessageCount.current === 0 && count > 0;
    const grew = count > prevMessageCount.current;
    const ownMessage = grew && messages[count - 1]?.sender_id === userId;

    if (firstLoad || ownMessage || (grew && isAtBottomRef.current)) {
      endRef.current?.scrollIntoView({ behavior: firstLoad ? "auto" : "smooth" });
    }
    prevMessageCount.current = count;
  }, [messages, userId]);

  useEffect(() => {
    if (otherTyping && isAtBottomRef.current) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [otherTyping]);

  async function send() {
    if (!reply.trim() && files.length === 0) return;
    setSending(true);
    const urls = await uploadAttachments(userId, ticketId, files);
    const { resilientInsert } = await import("@/lib/infra/supabase-resilient");
    const r = await resilientInsert("support.message.send", "support_messages", {
      ticket_id: ticketId, sender_id: userId, sender_role: isStaff ? "staff" : "customer", body: reply.trim() || "(attachment)", attachments: urls,
    }, `support.msg:${ticketId}:${Date.now()}`);
    setSending(false);
    if (!r.ok) { toast.error((r.error as any)?.message ?? "Failed to send"); return; }
    notifyStop();
    if (!r.queued) {
      if (isStaff) void import("@/lib/support-presence").then((m) => m.pingPresence("send_message"));
      fireSupportEmail(ticketId, isStaff ? "staff_reply" : "customer_reply");
    }
    setReply(""); setFiles([]);
  }


  return (
    <Sheet onClose={onClose} title={ticket?.subject ?? "Conversation"} subtitle={ticket ? `#${ticket.id.slice(0, 8)} · ${ticket.status}` : undefined} fullPage>
      <div className="flex flex-col h-full min-h-0">
        <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto space-y-3 pr-1">
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
          <TypingIndicator show={otherTyping} label={isStaff ? "Customer" : "Support"} />
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
              <textarea value={reply} onChange={(e) => { setReply(e.target.value); if (e.target.value.trim()) notifyTyping(); else notifyStop(); }} rows={1} placeholder="Write a reply…"
                onBlur={notifyStop}
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
function Sheet({ title, subtitle, children, onClose, fullPage }: { title: string; subtitle?: string; children: React.ReactNode; onClose: () => void; fullPage?: boolean }) {
  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className={cn("fixed inset-0 z-[100] flex", fullPage ? "items-start sm:items-center sm:justify-center" : "items-end sm:items-center sm:justify-center")}>
      <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" onClick={onClose} />
      <motion.div
        initial={{ y: 40, opacity: 0 }} animate={{ y: 0, opacity: 1 }} exit={{ y: 40, opacity: 0 }}
        transition={{ duration: 0.35, ease: [0.16, 1, 0.3, 1] }}
        className={cn(
          "relative w-full glass-strong p-5 overflow-y-auto",
          fullPage
            ? "h-[100dvh] rounded-none sm:max-w-lg sm:rounded-3xl sm:h-auto sm:max-h-[92dvh]"
            : "sm:max-w-lg rounded-t-3xl sm:rounded-3xl max-h-[92dvh]"
        )}
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

export function AttachmentPicker({ files, setFiles, compact }: { files: File[]; setFiles: (f: File[]) => void; compact?: boolean }) {
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
                <img loading="lazy" decoding="async" src={URL.createObjectURL(f)} alt={f.name} className="size-14 rounded-lg object-cover ring-1 ring-white/10" />
              )}
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute -top-1 -right-1 size-4 grid place-items-center rounded-full bg-black/80 text-white ring-1 ring-white/20"><X className="size-2.5" /></button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function Attachment({ path }: { path: string }) {
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
        <img loading="lazy" decoding="async" src={url} alt="attachment" className="size-20 rounded-lg object-cover ring-1 ring-white/10 hover:ring-accent/40 transition" />
      </a>
      <button onClick={download} title="Download" className="absolute bottom-1 right-1 size-6 grid place-items-center rounded-md bg-black/70 text-white opacity-0 group-hover:opacity-100 transition"><Download className="size-3" /></button>
    </div>
  );
}

export async function uploadAttachments(userId: string, ticketId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    if (!ALLOWED_TYPES.includes(f.type) || f.size > MAX_BYTES) continue;
    const ext = f.name.split(".").pop()?.toLowerCase() || (f.type === "application/pdf" ? "pdf" : "png");
    const path = `${userId}/${ticketId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, f, { upsert: false, contentType: f.type });
    if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
    // Register metadata (best-effort; storage upload is the source of truth).
    const { resilientInsert } = await import("@/lib/infra/supabase-resilient");
    await resilientInsert("support.message.send", "support_attachments", {
      ticket_id: ticketId, uploaded_by: userId, file_name: f.name, file_type: f.type, file_size: f.size, storage_path: path,
    }, `support.att:${path}`);

    urls.push(path);
  }
  return urls;
}

