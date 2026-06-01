import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouterState } from "@tanstack/react-router";
import {
  X,
  ChevronLeft,
  MoreVertical,
  Send,
  Paperclip,
  Mic,
  Smile,
  ShieldCheck,
  Zap,
  Lock,
  Package,
  CreditCard,
  Truck,
  RotateCcw,
  ShoppingBag,
  Wrench,
  Headset,
} from "lucide-react";
import { toast } from "sonner";
import {
  loadCrisp,
  sendCrispMessage,
  onOperatorMessage,
  onOperatorTyping,
  onAvailabilityChange,
  getAvailability,
  onChatOpenRequest,
  onChatCloseRequest,
  type Availability,
  type CrispMessage,
} from "@/lib/crisp";

type Msg = CrispMessage;

const QUICK_ACTIONS = [
  { icon: Package, label: "Track Order", prompt: "I'd like to track my order." },
  { icon: CreditCard, label: "Payment Help", prompt: "I need help with a payment." },
  { icon: Truck, label: "Shipping", prompt: "I have a question about shipping." },
  { icon: RotateCcw, label: "Returns", prompt: "I'd like to start a return." },
  { icon: ShoppingBag, label: "Product Questions", prompt: "I have a question about a product." },
  { icon: Wrench, label: "Technical Support", prompt: "I'm experiencing a technical issue." },
];

const AI_SUGGESTIONS = [
  "Where is my order?",
  "How long is shipping?",
  "Return policy",
  "Contact support",
];

const STATUS_META: Record<Availability, { label: string; dot: string; sub: string }> = {
  online: { label: "Marketplace Support", dot: "bg-emerald-400", sub: "Usually replies within 2 minutes" },
  away: { label: "Marketplace Support", dot: "bg-amber-400", sub: "We'll reply as soon as we're back" },
  offline: { label: "Marketplace Support", dot: "bg-muted-foreground", sub: "Leave a message — we'll email you back" },
};

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

export function LiveChat() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname.startsWith("/auth");

  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [availability, setAvailability] = useState<Availability>("away");
  const [menuOpen, setMenuOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const status = STATUS_META[availability];
  const hasConversation = messages.length > 0;

  // Wire open/close requests from anywhere in the app.
  useEffect(() => {
    const offOpen = onChatOpenRequest(() => setOpen(true));
    const offClose = onChatCloseRequest(() => setOpen(false));
    return () => { offOpen(); offClose(); };
  }, []);

  // Subscribe to Crisp once on mount.
  useEffect(() => {
    void loadCrisp();
    setAvailability(getAvailability());
    const offMsg = onOperatorMessage((m) => {
      setOperatorTyping(false);
      setMessages((prev) => [...prev, m]);
    });
    const offTyping = onOperatorTyping((t) => setOperatorTyping(t));
    const offAvail = onAvailabilityChange((a) => setAvailability(a));
    return () => { offMsg(); offTyping(); offAvail(); };
  }, []);

  // Lock body scroll & autoscroll when open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [messages, operatorTyping, open]);

  const pushUser = useCallback((text: string) => {
    const t = text.trim();
    if (!t) return;
    setMessages((prev) => [...prev, { id: `u_${Date.now()}_${Math.random()}`, from: "user", text: t, ts: Date.now() }]);
    sendCrispMessage(t);
  }, []);

  const handleSend = useCallback(() => {
    if (!input.trim()) return;
    pushUser(input);
    setInput("");
    inputRef.current?.focus();
  }, [input, pushUser]);

  const handleAttach = useCallback(() => {
    toast.info("Secure file sharing opens in the support uploader once an agent joins.");
    fileRef.current?.click();
  }, []);

  const handleVoice = useCallback(() => {
    toast.info("Voice notes are available after an agent connects to your chat.");
  }, []);

  const closePanel = useCallback(() => { setOpen(false); setMenuOpen(false); }, []);

  const onFilePicked = useCallback((e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    if (f) pushUser(`📎 Shared a file: ${f.name}`);
    e.target.value = "";
  }, [pushUser]);

  const insertEmoji = useCallback((emoji: string) => {
    setInput((v) => v + emoji);
    inputRef.current?.focus();
  }, []);

  if (isAuthRoute) return null;

  return (
    <>
      {/* Floating support orb */}
      {!open && (
        <button
          type="button"
          aria-label="Open live support chat"
          onClick={() => setOpen(true)}
          className="group fixed right-4 z-[60] flex h-14 w-14 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground animate-orb-breathe transition-transform duration-200 active:scale-90"
          style={{ bottom: "calc(var(--floating-bottom-offset))" }}
        >
          <Headset className="h-6 w-6" />
          <span
            className={`absolute -right-0.5 -top-0.5 h-3.5 w-3.5 rounded-full border-2 border-background ${status.dot}`}
            aria-hidden
          />
        </button>
      )}

      {open && (
        <div
          className="fixed inset-0 z-[70] flex flex-col bg-background/95 backdrop-blur-xl animate-chat-slide-up"
          role="dialog"
          aria-modal="true"
          aria-label="FoundOurMarket Support"
        >
          {/* Ambient glow */}
          <div className="pointer-events-none absolute inset-x-0 top-0 h-64" style={{ background: "var(--gradient-ember-soft)" }} aria-hidden />

          {/* Header */}
          <header
            className="relative z-10 border-b border-border/60 bg-card/70 backdrop-blur-xl"
            style={{ paddingTop: "env(safe-area-inset-top)" }}
          >
            <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent" />
            <div className="flex items-center gap-3 px-3 py-3">
              <button
                type="button"
                onClick={closePanel}
                aria-label="Back"
                className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>

              <div className="flex min-w-0 flex-1 items-center gap-3">
                <div className="relative flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground">
                  <Headset className="h-4 w-4" />
                  <span className={`absolute -bottom-0.5 -right-0.5 h-3 w-3 rounded-full border-2 border-card ${status.dot}`} />
                </div>
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-foreground">FoundOurMarket Support</p>
                  <p className="truncate text-[11px] text-muted-foreground">{status.sub}</p>
                </div>
              </div>

              <div className="relative">
                <button
                  type="button"
                  onClick={() => setMenuOpen((v) => !v)}
                  aria-label="More options"
                  className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
                >
                  <MoreVertical className="h-5 w-5" />
                </button>
                {menuOpen && (
                  <div className="absolute right-0 top-11 z-20 w-44 overflow-hidden rounded-2xl border border-border/60 bg-popover/95 backdrop-blur-xl shadow-[var(--shadow-float)] animate-scale-in">
                    <button
                      type="button"
                      onClick={() => { setMessages([]); setMenuOpen(false); toast.success("Conversation cleared"); }}
                      className="block w-full px-4 py-3 text-left text-sm text-foreground hover:bg-foreground/5"
                    >
                      Clear conversation
                    </button>
                    <button
                      type="button"
                      onClick={closePanel}
                      className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm text-foreground hover:bg-foreground/5"
                    >
                      <X className="h-4 w-4" /> Close chat
                    </button>
                  </div>
                )}
              </div>
            </div>
          </header>

          {/* Conversation area */}
          <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-none px-4 py-5">
            {!hasConversation ? (
              <Welcome onQuick={pushUser} availability={availability} />
            ) : (
              <div className="mx-auto flex max-w-lg flex-col gap-3">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                {operatorTyping && <TypingIndicator />}
              </div>
            )}
          </div>

          {/* AI smart suggestions (only before conversation, handled in Welcome) */}

          {/* Trust elements */}
          <div className="relative z-10 flex items-center justify-center gap-4 px-4 py-2 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> End-to-End Secure</span>
            <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-primary" /> Fast Response</span>
            <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Protected</span>
          </div>

          {/* Composer */}
          <div
            className="relative z-10 border-t border-border/60 bg-card/70 px-3 pt-2.5 backdrop-blur-xl"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
          >
            <div className="mx-auto flex max-w-lg items-end gap-2">
              <EmojiButton onPick={insertEmoji} />
              <button type="button" onClick={handleAttach} aria-label="Attach file" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground">
                <Paperclip className="h-5 w-5" />
              </button>
              <input ref={fileRef} type="file" className="hidden" onChange={onFilePicked} />

              <div className="flex flex-1 items-end rounded-3xl border border-input bg-secondary/60 px-4 py-2">
                <textarea
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSend(); }
                  }}
                  rows={1}
                  placeholder="Describe your issue..."
                  className="max-h-28 w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
                />
              </div>

              {input.trim() ? (
                <button type="button" onClick={handleSend} aria-label="Send message" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground transition-transform duration-200 active:scale-90">
                  <Send className="h-5 w-5" />
                </button>
              ) : (
                <button type="button" onClick={handleVoice} aria-label="Record voice note" className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground">
                  <Mic className="h-5 w-5" />
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function Welcome({ onQuick, availability }: { onQuick: (t: string) => void; availability: Availability }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[var(--shadow-ember)] animate-float-soft">
          <Headset className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Hello 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">Welcome to <span className="font-medium text-foreground">FoundOurMarket™</span></p>
        <p className="text-sm text-muted-foreground">How can we help you today?</p>
      </div>

      {/* Smart assistant block */}
      <div className="rounded-3xl border border-border/60 bg-card/60 p-4 backdrop-blur-xl">
        <p className="mb-3 flex items-center gap-2 text-xs font-medium text-foreground">
          <Zap className="h-3.5 w-3.5 text-primary" /> Ask anything — instant answers
        </p>
        <div className="flex flex-wrap gap-2">
          {AI_SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onQuick(s)}
              className="rounded-full border border-border/60 bg-secondary/60 px-3 py-1.5 text-xs text-foreground/90 transition-colors hover:border-primary/50 hover:bg-secondary active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 gap-2.5">
        {QUICK_ACTIONS.map(({ icon: Icon, label, prompt }) => (
          <button
            key={label}
            type="button"
            onClick={() => onQuick(prompt)}
            className="flex items-center gap-3 rounded-2xl border border-border/60 bg-card/60 p-3 text-left backdrop-blur-xl transition-all hover:border-primary/50 hover:bg-card active:scale-95"
          >
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-primary/15 text-primary">
              <Icon className="h-5 w-5" />
            </span>
            <span className="text-sm font-medium text-foreground">{label}</span>
          </button>
        ))}
      </div>

      {availability === "offline" && (
        <p className="text-center text-xs text-muted-foreground">
          Our team is offline right now — send a message and we'll get back to you by email.
        </p>
      )}
    </div>
  );
}

function MessageBubble({ msg }: { msg: Msg }) {
  const isUser = msg.from === "user";
  return (
    <div className={`flex animate-chat-bubble-in ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[80%] rounded-[22px] rounded-br-md bg-gradient-to-br from-primary to-primary/85 px-4 py-2.5 text-sm text-primary-foreground shadow-[var(--shadow-ember)]"
            : "max-w-[80%] rounded-[22px] rounded-bl-md border border-border/60 bg-card/80 px-4 py-2.5 text-sm text-foreground backdrop-blur-xl shadow-[var(--shadow-card)]"
        }
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.text}</p>
        <p className={`mt-1 text-[10px] ${isUser ? "text-primary-foreground/70" : "text-muted-foreground"}`}>{formatTime(msg.ts)}</p>
      </div>
    </div>
  );
}

function TypingIndicator() {
  return (
    <div className="flex justify-start animate-chat-bubble-in">
      <div className="flex items-center gap-1.5 rounded-[22px] rounded-bl-md border border-border/60 bg-card/80 px-4 py-3 backdrop-blur-xl">
        {[0, 1, 2].map((i) => (
          <span
            key={i}
            className="chat-typing-dot h-2 w-2 rounded-full bg-muted-foreground"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

const EMOJIS = ["😊", "👍", "🙏", "❤️", "😂", "🎉", "😮", "😢", "🔥", "✅", "📦", "🚚"];
function EmojiButton({ onPick }: { onPick: (e: string) => void }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-label="Emoji"
        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-muted-foreground transition-colors hover:bg-foreground/10 hover:text-foreground"
      >
        <Smile className="h-5 w-5" />
      </button>
      {open && (
        <div className="absolute bottom-12 left-0 z-30 grid grid-cols-6 gap-1 rounded-2xl border border-border/60 bg-popover/95 p-2 backdrop-blur-xl shadow-[var(--shadow-float)] animate-scale-in">
          {EMOJIS.map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => { onPick(e); setOpen(false); }}
              className="flex h-8 w-8 items-center justify-center rounded-lg text-lg hover:bg-foreground/10"
            >
              {e}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
