import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Send, ShieldCheck, Check, CheckCheck, Mail,
  MoreVertical, CheckCircle2, RotateCcw, Download, Package, AlertCircle, X,
  Info, Clock, Calendar, Tag, Flag, Hash, ExternalLink,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { markTicketRead } from "@/lib/use-support-unread";
import { notifySupportEvent } from "@/lib/support.functions";
import { useSupportAvailability, fmtLastActive, useTypingIndicator } from "@/lib/support-presence";
import { PRESENCE_META } from "@/lib/support-analytics";
import { TypingIndicator } from "@/components/support/TypingDots";
import { TicketRatingPrompt } from "@/components/site/TicketRatingPrompt";
import {
  Attachment, AttachmentPicker, uploadAttachments, ContextCard,
} from "@/routes/account_.support";
import type { SupportContextSnapshot } from "@/lib/support-context";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import supportEmpty from "@/assets/support-empty.png";

export const Route = createFileRoute("/account_/support_/ticket/$ticketId")({
  head: () => ({
    meta: [
      { title: "Conversation — FoundOurMarket™ Support" },
      { name: "description", content: "Your support conversation with the FoundOurMarket™ team." },
    ],
  }),
  component: TicketPage,
});

type Ticket = {
  id: string;
  subject: string;
  category: string;
  status: string;
  priority: string;
  last_message_at: string;
  created_at: string;
  resolved_at: string | null;
  closed_at: string | null;
  ticket_number: string;
  channel: string;
  order_id: string | null;
  context: SupportContextSnapshot | null;
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
  if (v === "resolved" || v === "closed") return "text-emerald-400 bg-emerald-400/10 ring-emerald-400/25";
  if (v === "pending") return "text-sky-400 bg-sky-400/10 ring-sky-400/25";
  return "text-accent bg-accent/10 ring-accent/25";
}
function priorityTone(p: string) {
  const v = p.toLowerCase();
  if (v === "urgent") return "text-rose-400 bg-rose-400/10 ring-rose-400/25";
  if (v === "high") return "text-amber-400 bg-amber-400/10 ring-amber-400/25";
  if (v === "low") return "text-muted-foreground bg-white/[0.04] ring-white/10";
  return "text-foreground/80 bg-white/[0.04] ring-white/10";
}

/** Human date separator label. */
function dayLabel(d: Date) {
  const today = new Date();
  const y = new Date();
  y.setDate(today.getDate() - 1);
  const same = (a: Date, b: Date) => a.toDateString() === b.toDateString();
  if (same(d, today)) return "Today";
  if (same(d, y)) return "Yesterday";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" });
}

function TicketPage() {
  const { user, loading } = useAuth();
  const { ticketId } = useParams({ from: Route.id });
  const nav = useNavigate();

  const [messages, setMessages] = useState<Message[] | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [notFound, setNotFound] = useState(false);
  const [reply, setReply] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [sending, setSending] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);
  const isAtBottomRef = useRef(true);
  const prevCount = useRef(0);

  const availability = useSupportAvailability();
  const presence = PRESENCE_META[availability.state];
  const { otherTyping, notifyTyping, notifyStop } = useTypingIndicator(ticketId, "customer");

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

  const load = useCallback(async () => {
    const [{ data: m }, { data: t, error: tErr }] = await Promise.all([
      supabase.from("support_messages").select("id,ticket_id,sender_id,sender_role,body,attachments,created_at,delivered_at,read_at,channel,source,sender_email,received_at").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("support_tickets").select("id,subject,category,status,priority,last_message_at,created_at,resolved_at,closed_at,ticket_number,channel,order_id,context").eq("id", ticketId).maybeSingle(),
    ]);
    if (tErr || !t) { setNotFound(true); return; }
    setMessages(((m as Message[]) ?? []).map((x) => ({ ...x, attachments: (x.attachments as unknown as string[]) ?? [] })));
    setTicket(t as Ticket);
    if (user?.id) void markTicketRead(ticketId, user.id);
  }, [ticketId, user?.id]);

  useEffect(() => {
    if (!user) return;
    void load();
    const ch = supabase
      .channel(`support-thread:${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())
      .on("postgres_changes", { event: "UPDATE", schema: "public", table: "support_tickets", filter: `id=eq.${ticketId}` }, () => load())
      .subscribe();
    return () => { supabase.removeChannel(ch); };
  }, [user, ticketId, load]);

  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isAtBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
  }, []);

  useEffect(() => {
    if (!messages || !scrollRef.current) return;
    const count = messages.length;
    const firstLoad = prevCount.current === 0 && count > 0;
    const grew = count > prevCount.current;
    const own = grew && messages[count - 1]?.sender_id === user?.id;
    if (firstLoad || own || (grew && isAtBottomRef.current)) {
      endRef.current?.scrollIntoView({ behavior: firstLoad ? "auto" : "smooth" });
    }
    prevCount.current = count;
  }, [messages, user?.id]);

  useEffect(() => {
    if (otherTyping && isAtBottomRef.current) endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [otherTyping]);

  // Auto-grow composer textarea (max 120px).
  const autoGrow = useCallback(() => {
    const el = taRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);
  useEffect(() => { autoGrow(); }, [reply, autoGrow]);

  async function send() {
    if (!user || (!reply.trim() && files.length === 0)) return;
    setSending(true);
    const urls = await uploadAttachments(user.id, ticketId, files);
    const { resilientInsert } = await import("@/lib/infra/supabase-resilient");
    const r = await resilientInsert("support.message.send", "support_messages", {
      ticket_id: ticketId, sender_id: user.id, sender_role: "customer", body: reply.trim() || "(attachment)", attachments: urls,
    }, `support.msg:${ticketId}:${Date.now()}`);
    setSending(false);
    if (!r.ok) { toast.error((r.error as any)?.message ?? "Failed to send"); return; }
    if (!r.queued) {
      void notifySupportEvent({ data: { ticketId, event: "customer_reply" } }).catch(() => {});
    }
    notifyStop();
    setReply(""); setFiles([]);
  }


  async function setStatus(status: "resolved" | "open") {
    setMenuOpen(false);
    const patch = status === "resolved"
      ? { status, resolved_at: new Date().toISOString() }
      : { status };
    const { error } = await supabase.from("support_tickets").update(patch).eq("id", ticketId);
    if (error) { toast.error(error.message); return; }
    toast.success(status === "resolved" ? "Ticket marked resolved" : "Ticket reopened");
  }

  function downloadTranscript() {
    setMenuOpen(false);
    if (!ticket || !messages) return;
    const lines = [
      `FoundOurMarket™ Support Transcript`,
      `Ticket ${ticket.ticket_number} — ${ticket.subject}`,
      `Status: ${ticket.status} · Priority: ${ticket.priority}`,
      `Created: ${new Date(ticket.created_at).toLocaleString()}`,
      `${"=".repeat(48)}`,
      "",
      ...messages.map((m) => {
        const who = m.sender_role === "customer" ? "You" : "Support Team";
        return `[${new Date(m.created_at).toLocaleString()}] ${who}:\n${m.body}\n`;
      }),
    ];
    const blob = new Blob([lines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${ticket.ticket_number}-transcript.txt`;
    a.click(); URL.revokeObjectURL(url);
  }

  if (loading || !user) {
    return <div className="min-h-dvh grid place-items-center bg-background"><Loader2 className="size-5 animate-spin text-accent" /></div>;
  }

  if (notFound) {
    return (
      <div className="min-h-dvh grid place-items-center bg-background px-6 text-center">
        <div>
          <AlertCircle className="size-7 text-accent mx-auto mb-3" />
          <p className="text-sm text-muted-foreground mb-4">This conversation could not be found.</p>
          <button onClick={() => nav({ to: "/account/support" })} className="bg-accent text-accent-foreground rounded-full px-5 py-2.5 text-xs uppercase tracking-widest font-bold">Back to Support</button>
        </div>
      </div>
    );
  }

  const closed = ticket?.status === "closed";
  const presenceLabel = availability.state === "online" ? "Support Online" : availability.state === "away" ? "Support Away" : "Support Offline";

  // Group messages by day for date separators.
  const groups: { label: string; items: Message[] }[] = [];
  if (messages) {
    for (const m of messages) {
      const label = dayLabel(new Date(m.created_at));
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(m);
      else groups.push({ label, items: [m] });
    }
  }

  return (
    <div className="fixed inset-0 z-[120] flex flex-col bg-background">
      {/* Ambient glow */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[120%] h-[40vh] opacity-30 animate-glow" style={{ background: "var(--gradient-ember-soft)", filter: "blur(120px)" }} />
      </div>

      {/* Sticky header */}
      <header className="shrink-0 backdrop-blur-xl bg-background/80 border-b border-white/[0.06]" style={{ paddingTop: "env(safe-area-inset-top)" }}>
        <div className="flex items-center gap-2.5 px-3 h-14">
          <button onClick={() => nav({ to: "/account/support" })} aria-label="Back" className="size-9 -ml-1 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition">
            <ArrowLeft className="size-5" />
          </button>
          <div className="size-9 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/30">
            <ShieldCheck className="size-4" />
          </div>
          <button onClick={() => setDetailsOpen(true)} className="min-w-0 flex-1 text-left">
            <p className="text-sm font-semibold truncate leading-tight">{ticket?.subject ?? "Conversation"}</p>
            <p className="flex items-center gap-1.5 text-[11px] text-muted-foreground leading-tight mt-0.5">
              <span aria-hidden>{presence.dot}</span>
              <span className="truncate">{presenceLabel}</span>
              {availability.state !== "online" && availability.lastActiveAt && (
                <span className="text-muted-foreground/50 truncate">· {fmtLastActive(availability.lastActiveAt)}</span>
              )}
            </p>
          </button>
          <div className="relative shrink-0">
            <button onClick={() => setMenuOpen((v) => !v)} aria-label="Ticket actions" className="size-9 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground hover:text-foreground transition">
              <MoreVertical className="size-5" />
            </button>
            <AnimatePresence>
              {menuOpen && (
                <>
                  <div className="fixed inset-0 z-10" onClick={() => setMenuOpen(false)} />
                  <motion.div
                    initial={{ opacity: 0, y: -6, scale: 0.97 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -6, scale: 0.97 }}
                    transition={{ duration: 0.15 }}
                    className="absolute right-0 top-11 z-20 w-56 rounded-2xl glass-strong p-1.5 shadow-2xl"
                  >
                    {!closed && ticket?.status !== "resolved" && (
                      <MenuItem icon={CheckCircle2} label="Mark resolved" onClick={() => setStatus("resolved")} />
                    )}
                    {(ticket?.status === "resolved" || closed) && (
                      <MenuItem icon={RotateCcw} label="Reopen ticket" onClick={() => setStatus("open")} />
                    )}
                    <MenuItem icon={Download} label="Download transcript" onClick={downloadTranscript} />
                    {ticket?.order_id && (
                      <MenuItem icon={Package} label="View order" onClick={() => { setMenuOpen(false); nav({ to: "/account/orders" }); }} />
                    )}
                    <MenuItem icon={Info} label="Ticket details" onClick={() => { setMenuOpen(false); setDetailsOpen(true); }} />
                  </motion.div>
                </>
              )}
            </AnimatePresence>
          </div>
        </div>
        {/* Badges row */}
        <div className="flex items-center gap-2 px-3 pb-2.5 overflow-x-auto no-scrollbar">
          <span className="shrink-0 rounded-full px-2 py-0.5 text-[10px] font-mono tracking-wider text-muted-foreground bg-white/[0.04] ring-1 ring-white/10">{ticket?.ticket_number}</span>
          {ticket && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ring-1", statusTone(ticket.status))}>{ticket.status}</span>}
          {ticket && <span className={cn("shrink-0 rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest ring-1", priorityTone(ticket.priority))}>{ticket.priority}</span>}
          {ticket?.channel === "email" && <span className="shrink-0 inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-[9px] font-mono uppercase tracking-widest text-sky-400 bg-sky-400/10 ring-1 ring-sky-400/25"><Mail className="size-2.5" /> Email</span>}
        </div>
      </header>

      {/* Conversation */}
      <div ref={scrollRef} onScroll={onScroll} className="flex-1 min-h-0 overflow-y-auto px-3 py-4">
        <div className="mx-auto w-full max-w-2xl space-y-4">
          {ticket?.context && Object.keys(ticket.context).length > 0 && <ContextCard ctx={ticket.context} />}

          {messages === null ? (
            <div className="grid place-items-center py-16"><Loader2 className="size-5 animate-spin text-muted-foreground" /></div>
          ) : messages.length === 0 ? (
            <div className="grid place-items-center text-center py-12">
              <img src={supportEmpty} alt="" width={160} height={160} loading="lazy" className="size-40 object-contain opacity-90 mb-4" />
              <p className="text-lg font-display font-semibold">How can we help you today?</p>
              <p className="text-sm text-muted-foreground mt-1 max-w-xs">Send your first message and our team will reply in real time.</p>
            </div>
          ) : (
            groups.map((g) => (
              <div key={g.label} className="space-y-3">
                <div className="flex items-center justify-center">
                  <span className="rounded-full px-3 py-1 text-[10px] font-mono uppercase tracking-widest text-muted-foreground bg-white/[0.04] ring-1 ring-white/[0.06]">{g.label}</span>
                </div>
                {g.items.map((m) => {
                  const mine = m.sender_role === "customer";
                  return (
                    <div key={m.id} className={cn("flex items-end gap-2", mine ? "justify-end" : "justify-start")}>
                      {!mine && (
                        <div className="size-7 shrink-0 grid place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/25 mb-5">
                          <ShieldCheck className="size-3.5" />
                        </div>
                      )}
                      <div className={cn(
                        "max-w-[82%] rounded-2xl px-3.5 py-2.5",
                        mine
                          ? "bg-gradient-to-br from-accent to-[color-mix(in_oklab,var(--accent)_78%,black)] text-accent-foreground rounded-br-md shadow-[0_8px_24px_-12px_color-mix(in_oklab,var(--accent)_60%,transparent)]"
                          : "glass rounded-bl-md",
                      )}>
                        {!mine && (
                          <p className="flex items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-accent mb-1"><ShieldCheck className="size-3" /> Support Team</p>
                        )}
                        {m.channel === "email" && (
                          <p className="flex flex-wrap items-center gap-1 text-[9px] font-mono uppercase tracking-widest text-sky-400 mb-1">
                            <Mail className="size-3" /> Email
                            {m.sender_email && <span className="text-muted-foreground/70 normal-case tracking-normal">· {m.sender_email}</span>}
                          </p>
                        )}
                        <p className={cn("text-sm whitespace-pre-wrap break-words", mine && "text-accent-foreground")}>{m.body}</p>
                        {m.attachments.length > 0 && (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {m.attachments.map((p) => <Attachment key={p} path={p} />)}
                          </div>
                        )}
                        <p className={cn("flex items-center gap-1 text-[9px] font-mono mt-1.5", mine ? "text-accent-foreground/70 justify-end" : "text-muted-foreground/50")}>
                          <span>{new Date(m.created_at).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</span>
                          {mine && (
                            m.read_at ? (
                              <span className="flex items-center gap-0.5" title={`Read ${new Date(m.read_at).toLocaleString()}`}><CheckCheck className="size-3" /> Read</span>
                            ) : (
                              <span className="flex items-center gap-0.5" title="Delivered"><Check className="size-3" /> Delivered</span>
                            )
                          )}
                        </p>
                      </div>
                    </div>
                  );
                })}
              </div>
            ))
          )}

          <TypingIndicator show={otherTyping} label="Support" />

          {(ticket?.status === "resolved" || closed) && user && (
            <TicketRatingPrompt ticketId={ticketId} userId={user.id} />
          )}
          <div ref={endRef} />
        </div>
      </div>

      {/* Composer */}
      <div className="shrink-0 border-t border-white/[0.06] backdrop-blur-xl bg-background/80 px-3 pt-2.5" style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}>
        <div className="mx-auto w-full max-w-2xl">
          {closed ? (
            <div className="rounded-xl glass p-3 text-center text-xs text-muted-foreground flex items-center justify-center gap-2">
              <CheckCircle2 className="size-3.5 text-emerald-400" /> This ticket is closed. Reopen it to reply.
            </div>
          ) : (
            <div className="space-y-2">
              {files.length > 0 && <AttachmentPicker files={files} setFiles={setFiles} compact />}
              <div className="flex items-end gap-2">
                {files.length === 0 && <AttachmentPicker files={files} setFiles={setFiles} compact />}
                <textarea
                  ref={taRef}
                  value={reply}
                  onChange={(e) => { setReply(e.target.value); if (e.target.value.trim()) notifyTyping(); else notifyStop(); }}
                  onBlur={notifyStop}
                  onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); void send(); } }}
                  rows={1}
                  placeholder="Write a reply…"
                  className="flex-1 bg-white/[0.04] border border-white/10 rounded-2xl px-3.5 py-2.5 text-sm focus:outline-none focus:border-accent/60 resize-none transition max-h-[120px]"
                />
                <button onClick={send} disabled={sending || (!reply.trim() && files.length === 0)} aria-label="Send" className="size-11 shrink-0 grid place-items-center rounded-2xl bg-accent text-accent-foreground disabled:opacity-40 hover:brightness-110 active:scale-95 transition">
                  {sending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Details slide-over */}
      <AnimatePresence>
        {detailsOpen && ticket && (
          <DetailsPanel ticket={ticket} onClose={() => setDetailsOpen(false)} onViewOrder={() => nav({ to: "/account/orders" })} />
        )}
      </AnimatePresence>
    </div>
  );
}

function MenuItem({ icon: Icon, label, onClick }: { icon: typeof Info; label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="w-full flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm text-left hover:bg-white/5 transition">
      <Icon className="size-4 text-muted-foreground" /> {label}
    </button>
  );
}

function DetailsPanel({ ticket, onClose, onViewOrder }: { ticket: Ticket; onClose: () => void; onViewOrder: () => void }) {
  const timeline = [
    { label: "Created", at: ticket.created_at, icon: Calendar },
    ticket.resolved_at ? { label: "Resolved", at: ticket.resolved_at, icon: CheckCircle2 } : null,
    ticket.closed_at ? { label: "Closed", at: ticket.closed_at, icon: CheckCircle2 } : null,
  ].filter(Boolean) as { label: string; at: string; icon: typeof Calendar }[];

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-[130] flex justify-end">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <motion.aside
        initial={{ x: "100%" }} animate={{ x: 0 }} exit={{ x: "100%" }}
        transition={{ duration: 0.3, ease: [0.16, 1, 0.3, 1] }}
        className="relative w-full sm:max-w-sm h-dvh glass-strong overflow-y-auto p-5"
        style={{ paddingTop: "max(1.25rem, env(safe-area-inset-top))", paddingBottom: "max(1.25rem, env(safe-area-inset-bottom))" }}
      >
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-display font-semibold">Ticket details</h3>
          <button onClick={onClose} className="size-8 grid place-items-center rounded-full hover:bg-white/5 text-muted-foreground"><X className="size-4" /></button>
        </div>

        <section className="space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/60">Information</p>
          <Row icon={Hash} label="Ticket" value={ticket.ticket_number} />
          <Row icon={Calendar} label="Created" value={new Date(ticket.created_at).toLocaleString()} />
          <Row icon={CheckCircle2} label="Status" value={ticket.status} cap />
          <Row icon={Flag} label="Priority" value={ticket.priority} cap />
          <Row icon={Tag} label="Category" value={ticket.category} cap />
          <Row icon={Mail} label="Channel" value={ticket.channel} cap />
        </section>

        {ticket.context && Object.keys(ticket.context).length > 0 && (
          <section className="mt-6 space-y-3">
            <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/60">Linked order</p>
            <ContextCard ctx={ticket.context} />
            {ticket.order_id && (
              <button onClick={onViewOrder} className="w-full inline-flex items-center justify-center gap-2 rounded-full bg-white/[0.04] ring-1 ring-white/10 px-4 py-2.5 text-xs uppercase tracking-widest font-semibold hover:ring-accent/40 transition">
                <ExternalLink className="size-3.5" /> View order
              </button>
            )}
          </section>
        )}

        <section className="mt-6 space-y-3">
          <p className="text-[10px] font-mono uppercase tracking-[0.24em] text-muted-foreground/60">Activity timeline</p>
          <div className="space-y-3">
            {timeline.map((e, i) => (
              <div key={e.label} className="flex gap-3">
                <div className="flex flex-col items-center">
                  <span className="size-7 grid place-items-center rounded-full bg-accent/15 text-accent ring-1 ring-accent/25"><e.icon className="size-3.5" /></span>
                  {i < timeline.length - 1 && <span className="w-px flex-1 bg-white/10 my-1" />}
                </div>
                <div className="pb-1">
                  <p className="text-sm font-medium">{e.label}</p>
                  <p className="flex items-center gap-1 text-[11px] text-muted-foreground/70 mt-0.5"><Clock className="size-3" /> {new Date(e.at).toLocaleString()}</p>
                </div>
              </div>
            ))}
          </div>
        </section>
      </motion.aside>
    </motion.div>
  );
}

function Row({ icon: Icon, label, value, cap }: { icon: typeof Info; label: string; value: string; cap?: boolean }) {
  return (
    <div className="flex items-center gap-3 rounded-xl glass p-3">
      <Icon className="size-4 text-accent/70 shrink-0" />
      <span className="text-xs text-muted-foreground">{label}</span>
      <span className={cn("ml-auto text-sm font-medium text-right truncate", cap && "capitalize")}>{value.replace(/_/g, " ")}</span>
    </div>
  );
}
