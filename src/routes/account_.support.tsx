import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ArrowLeft, Loader2, Plus, Send, LifeBuoy, Paperclip, X, ChevronRight,
  ShieldCheck, MessageSquare, ImageIcon, CheckCircle2,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/lib/auth";
import { useRegion } from "@/lib/region";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export const Route = createFileRoute("/account_/support")({
  head: () => ({
    meta: [
      { title: "Support — FoundOurMarket™" },
      { name: "description", content: "Open a support ticket and chat with our team in real time." },
    ],
  }),
  component: SupportPage,
});

const CATEGORIES = [
  { id: "order", label: "Order issue" },
  { id: "payment", label: "Payment" },
  { id: "shipping", label: "Shipping & delivery" },
  { id: "refund", label: "Refund / return" },
  { id: "product", label: "Product question" },
  { id: "account", label: "Account" },
  { id: "general", label: "Something else" },
] as const;

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
};

function statusTone(s: string) {
  const v = s.toLowerCase();
  if (v === "resolved" || v === "closed") return "text-emerald-400 bg-emerald-400/10 ring-emerald-400/20";
  if (v === "pending") return "text-sky-400 bg-sky-400/10 ring-sky-400/20";
  return "text-accent bg-accent/10 ring-accent/25";
}

function SupportPage() {
  const { user, loading } = useAuth();
  const { market } = useRegion();
  const nav = useNavigate();
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [composing, setComposing] = useState(false);

  useEffect(() => { if (!loading && !user) nav({ to: "/auth" }); }, [loading, user, nav]);

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
            onClose={() => setComposing(false)}
            onCreated={(id) => { setComposing(false); void loadTickets(); setActiveId(id); }}
          />
        )}
        {activeId && (
          <ThreadSheet ticketId={activeId} userId={user.id} isStaff={false} onClose={() => setActiveId(null)} />
        )}
      </AnimatePresence>
    </div>
  );
}

/* ---------- Compose new ticket ---------- */
function ComposeSheet({ userId, market, onClose, onCreated }: { userId: string; market: string; onClose: () => void; onCreated: (id: string) => void }) {
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState<string>("general");
  const [body, setBody] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [saving, setSaving] = useState(false);

  async function submit() {
    if (!subject.trim()) { toast.error("Add a subject"); return; }
    if (!body.trim()) { toast.error("Describe your issue"); return; }
    setSaving(true);
    const { data: t, error } = await supabase
      .from("support_tickets")
      .insert({ user_id: userId, subject: subject.trim(), category, market_region: market })
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
    onCreated(t.id);
  }

  return (
    <Sheet onClose={onClose} title="New ticket">
      <div className="space-y-4">
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
      </div>
    </Sheet>
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
      supabase.from("support_messages").select("id,ticket_id,sender_id,sender_role,body,attachments,created_at").eq("ticket_id", ticketId).order("created_at"),
      supabase.from("support_tickets").select("id,subject,category,status,priority,last_message_at,created_at").eq("id", ticketId).maybeSingle(),
    ]);
    setMessages(((m as Message[]) ?? []).map((x) => ({ ...x, attachments: (x.attachments as unknown as string[]) ?? [] })));
    setTicket((t as Ticket) ?? null);
  }, [ticketId]);

  useEffect(() => {
    void load();
    const ch = supabase
      .channel(`support-thread:${ticketId}`)
      .on("postgres_changes", { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${ticketId}` }, () => load())
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
                    <p className="text-sm whitespace-pre-wrap break-words">{m.body}</p>
                    {m.attachments.length > 0 && (
                      <div className="mt-2 flex flex-wrap gap-2">
                        {m.attachments.map((p) => <AttachmentImage key={p} path={p} />)}
                      </div>
                    )}
                    <p className="text-[9px] font-mono text-muted-foreground/50 mt-1.5">{new Date(m.created_at).toLocaleString()}</p>
                  </div>
                </div>
              );
            })
          )}
          <div ref={endRef} />
        </div>

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

function AttachmentPicker({ files, setFiles, compact }: { files: File[]; setFiles: (f: File[]) => void; compact?: boolean }) {
  const inputRef = useRef<HTMLInputElement>(null);
  function add(list: FileList | null) {
    if (!list) return;
    const next = [...files, ...Array.from(list)].filter((f) => f.type.startsWith("image/")).slice(0, 5);
    setFiles(next);
  }
  return (
    <div>
      <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(e) => add(e.target.files)} />
      {!compact && (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-2 text-xs text-muted-foreground hover:text-accent transition">
          <Paperclip className="size-3.5" /> Attach images
        </button>
      )}
      {files.length > 0 && (
        <div className="mt-2 flex flex-wrap gap-2">
          {files.map((f, i) => (
            <div key={i} className="relative size-14 rounded-lg overflow-hidden ring-1 ring-white/10">
              <img src={URL.createObjectURL(f)} alt="" className="w-full h-full object-cover" />
              <button onClick={() => setFiles(files.filter((_, j) => j !== i))} className="absolute top-0.5 right-0.5 size-4 grid place-items-center rounded-full bg-black/70 text-white"><X className="size-2.5" /></button>
            </div>
          ))}
        </div>
      )}
      {compact && (
        <button type="button" onClick={() => inputRef.current?.click()} className="flex items-center gap-1.5 text-[11px] text-muted-foreground hover:text-accent transition">
          <ImageIcon className="size-3" /> Attach
        </button>
      )}
    </div>
  );
}

function AttachmentImage({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let active = true;
    supabase.storage.from("support-attachments").createSignedUrl(path, 3600).then(({ data }) => { if (active) setUrl(data?.signedUrl ?? null); });
    return () => { active = false; };
  }, [path]);
  if (!url) return <div className="size-20 rounded-lg bg-white/5 animate-pulse" />;
  return <a href={url} target="_blank" rel="noreferrer"><img src={url} alt="attachment" className="size-20 rounded-lg object-cover ring-1 ring-white/10 hover:ring-accent/40 transition" /></a>;
}

async function uploadAttachments(userId: string, ticketId: string, files: File[]): Promise<string[]> {
  const urls: string[] = [];
  for (const f of files) {
    const ext = f.name.split(".").pop() || "png";
    const path = `${userId}/${ticketId}/${crypto.randomUUID()}.${ext}`;
    const { error } = await supabase.storage.from("support-attachments").upload(path, f, { upsert: false });
    if (error) { toast.error(`Upload failed: ${error.message}`); continue; }
    urls.push(path);
  }
  return urls;
}
