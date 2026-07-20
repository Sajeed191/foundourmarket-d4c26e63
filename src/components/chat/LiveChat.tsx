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
  Truck,
  RotateCcw,
  ShoppingBag,
  Headset,
  Search,
  FileText,
  AlertTriangle,
  LifeBuoy,
  Wallet,
  MapPin,
} from "lucide-react";
import { toast } from "sonner";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import { useAuth } from "@/lib/auth";
import {
  loadCrisp,
  sendCrispMessage,
  setCrispUser,
  setCrispSessionData,
  onOperatorMessage,
  onOperatorTyping,
  onAvailabilityChange,
  getAvailability,
  onChatOpenRequest,
  onChatCloseRequest,
  type Availability,
  type CrispMessage,
} from "@/lib/crisp";
import {
  useChatOrders,
  orderStage,
  stageMeta,
  orderNumber,
  primaryItem,
  type ChatOrder,
  type OrderStage,
} from "@/lib/chat-orders";
import { BrandName } from "@/components/site/BrandName";
import { waitForLayoutReady, isHeaderLayoutReady } from "@/lib/wait-for-layout";
import { useSupportSettings } from "@/lib/use-support-settings";
import { registerFloating, subscribeFloating, setChatActive, isContextHidden, getBuyBarLift } from "@/lib/floating-stack";

type Msg = CrispMessage;

const QUICK_ACTIONS = [
  { icon: Package, label: "Track Order", prompt: "Hi, I'd like to track my order." },
  { icon: Truck, label: "Shipping Update", prompt: "Hi, I'd like a shipping update on my order." },
  { icon: RotateCcw, label: "Return Request", prompt: "Hi, I'd like to request a return." },
  { icon: Wallet, label: "Refund Status", prompt: "Hi, I'd like to check my refund status." },
  { icon: ShoppingBag, label: "Product Question", prompt: "Hi, I have a question about a product." },
  { icon: LifeBuoy, label: "Contact Support", prompt: "Hi, I need to contact support." },
];

const AI_SUGGESTIONS = [
  "Where is my order?",
  "How long is shipping?",
  "Return policy",
  "Contact support",
];

const STATUS_META: Record<Availability, { dot: string; sub: string }> = {
  online: { dot: "bg-emerald-400", sub: "Usually replies within 2 minutes" },
  away: { dot: "bg-amber-400", sub: "We'll reply as soon as we're back" },
  offline: { dot: "bg-muted-foreground", sub: "Leave a message — we'll email you back" },
};

type OrderAction = "track" | "support" | "return" | "report" | "invoice";

function actionMessage(action: OrderAction, num: string): string {
  switch (action) {
    case "track": return `Hi, I need to track Order #${num}.`;
    case "support": return `Hi, I need help with Order #${num}.`;
    case "return": return `Hi, I'd like to start a return for Order #${num}.`;
    case "report": return `Hi, I want to report an issue with Order #${num}.`;
    case "invoice": return `Hi, please send me the invoice for Order #${num}.`;
  }
}

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" });
  } catch {
    return "";
  }
}

export function LiveChat() {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const isAuthRoute = pathname.startsWith("/auth");
  const { user } = useAuth();
  const { settings: support } = useSupportSettings();
  const whatsappNumber = support.whatsappNumbers[0] || "";

  const customerName = useMemo(() => {
    const full = (user?.user_metadata?.full_name as string | undefined) ?? "";
    return full.trim() || user?.email?.split("@")[0] || "";
  }, [user]);

  const { orders, lastUpdate, clearUpdate } = useChatOrders(user?.id);

  const [open, setOpen] = useState(false);
  const [unread, setUnread] = useState(0);
  const openRef = useRef(false);
  const dismissGreetingRef = useRef<() => void>(() => {});
  useEffect(() => { openRef.current = open; if (open) { setUnread(0); dismissGreetingRef.current(); } }, [open]);
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [operatorTyping, setOperatorTyping] = useState(false);
  const [operatorJoined, setOperatorJoined] = useState(false);
  const [availability, setAvailability] = useState<Availability>("away");
  const [menuOpen, setMenuOpen] = useState(false);
  // Broadcast active state so lower-priority floating widgets (Admin toolbar)
  // can visually recede while the chat surface or quick-actions menu is open.
  useEffect(() => { setChatActive(open || menuOpen); return () => setChatActive(false); }, [open, menuOpen]);
  const [activeOrder, setActiveOrder] = useState<ChatOrder | null>(null);
  // Fixed floating orb — smart scroll hide. While the user scrolls DOWN the
  // orb slides out (translateY(120%) + opacity 0). Scrolling UP or pausing
  // scroll for 300ms restores it. Fully fixed position; not draggable.
  const [orbHidden, setOrbHidden] = useState(false);
  useEffect(() => {
    let ticking = false;
    let idleTimer: number | undefined;
    let lastY = typeof window !== "undefined" ? window.scrollY : 0;
    const THRESH = 6;
    const scheduleRestore = () => {
      if (idleTimer) window.clearTimeout(idleTimer);
      idleTimer = window.setTimeout(() => setOrbHidden(false), 300);
    };
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      requestAnimationFrame(() => {
        const y = window.scrollY;
        const dy = y - lastY;
        if (Math.abs(dy) >= THRESH) {
          if (dy > 0 && y > 40) {
            setOrbHidden(true);
            dismissGreetingRef.current();
          } else if (dy < 0) {
            setOrbHidden(false);
          }
          lastY = y;
        }
        ticking = false;
        scheduleRestore();
      });
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => {
      window.removeEventListener("scroll", onScroll);
      if (idleTimer) window.clearTimeout(idleTimer);
    };
  }, []);

  // "Need help?" tooltip — first-time visitors only. Appears 4s after mount,
  // auto-hides 4s later. Persisted in localStorage so it never returns.
  const [greetVisible, setGreetVisible] = useState(false);
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      if (localStorage.getItem("fom_chat_greet_seen") === "1") return;
    } catch { /* noop */ }
    const showT = window.setTimeout(() => setGreetVisible(true), 4000);
    return () => window.clearTimeout(showT);
  }, []);
  useEffect(() => {
    if (!greetVisible) return;
    const hideT = window.setTimeout(() => setGreetVisible(false), 4000);
    return () => window.clearTimeout(hideT);
  }, [greetVisible]);
  const dismissGreeting = useCallback(() => {
    setGreetVisible(false);
    try { localStorage.setItem("fom_chat_greet_seen", "1"); } catch { /* noop */ }
  }, []);
  useEffect(() => { dismissGreetingRef.current = dismissGreeting; }, [dismissGreeting]);



  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const status = STATUS_META[availability];
  const hasConversation = messages.length > 0;
  const effectiveActiveOrder = activeOrder ?? orders[0] ?? null;

  // Identify the customer to Crisp so agents see who they're talking to.
  useEffect(() => {
    if (user?.email) setCrispUser({ email: user.email, nickname: customerName || undefined });
  }, [user, customerName]);

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
      setOperatorJoined(true);
      setMessages((prev) => [...prev, m]);
      if (!openRef.current) setUnread((c) => c + 1);
    });
    const offTyping = onOperatorTyping((t) => setOperatorTyping(t));
    const offAvail = onAvailabilityChange((a) => setAvailability(a));
    return () => { offMsg(); offTyping(); offAvail(); };
  }, []);

  // Lock body scroll, hide top & bottom nav while chat is open.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("hide-bottom-nav");
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("hide-bottom-nav");
    };
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

  // Attach the order context to the Crisp conversation, then send a message.
  const sendWithOrderContext = useCallback((order: ChatOrder, text: string) => {
    const num = orderNumber(order.id);
    const item = primaryItem(order);
    const meta = stageMeta(orderStage(order));
    setActiveOrder(order);
    setCrispSessionData({
      order_id: num,
      product: item?.name,
      order_status: meta.label,
      tracking_number: order.tracking_number,
      carrier: order.carrier,
      customer_name: customerName,
    });
    pushUser(text);
  }, [pushUser, customerName]);

  const onOrderAction = useCallback((order: ChatOrder, action: OrderAction) => {
    sendWithOrderContext(order, actionMessage(action, orderNumber(order.id)));
  }, [sendWithOrderContext]);

  const onOrderPrompt = useCallback((order: ChatOrder, prompt: string) => {
    sendWithOrderContext(order, `${prompt} (Order #${orderNumber(order.id)})`);
  }, [sendWithOrderContext]);

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

  // In-chat "Order Updated" toast for live status changes.
  const updatedOrder = useMemo(
    () => (lastUpdate ? orders.find((o) => o.id === lastUpdate.id) ?? null : null),
    [lastUpdate, orders],
  );

  if (isAuthRoute) return null;

  return (
    <>
      {/* Premium floating support orb — fixed, status ring, long-press menu. */}
      {!open && (
        <FixedOrb
          hidden={orbHidden}
          availability={availability}
          unread={unread}
          onTap={() => {
            dismissGreeting();
            if (availability === "offline") {
              window.location.href = "/contact";
              return;
            }
            setOpen(true);
          }}
          onLongPress={() => { dismissGreeting(); setMenuOpen(true); }}
          greetVisible={greetVisible}
          onDismissGreeting={dismissGreeting}
        />
      )}

      {/* Long-press quick actions menu */}
      {menuOpen && !open && (
        <div
          className="fixed inset-0 z-[65] flex items-end justify-center bg-black/50 backdrop-blur-sm animate-in fade-in duration-200"
          onClick={() => setMenuOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-label="Support quick actions"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="w-full sm:max-w-md rounded-t-3xl sm:rounded-3xl border border-white/10 bg-card/95 backdrop-blur-xl p-5 shadow-2xl animate-in slide-in-from-bottom duration-300"
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + var(--mobile-nav-clearance, 0px) + 1.25rem)" }}
          >
            <div className="mx-auto mb-4 h-1 w-10 rounded-full bg-white/15" aria-hidden />
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="font-display font-semibold text-base leading-tight">Quick actions</p>
                <p className="mt-0.5 text-[11px] text-muted-foreground">Choose how you'd like to get help</p>
              </div>
              <button
                type="button"
                onClick={() => setMenuOpen(false)}
                aria-label="Close"
                className="size-8 grid place-items-center rounded-full text-muted-foreground hover:bg-white/10"
              >
                <X className="size-4" />
              </button>
            </div>
            <div className="mt-4 space-y-2">
              <ChatMenuOption
                icon={Headset}
                label="Live Chat"
                desc="Chat with our support team"
                onClick={() => { setMenuOpen(false); setOpen(true); }}
              />
              {whatsappNumber && (
                <ChatMenuOption
                  icon={LifeBuoy}
                  label="WhatsApp"
                  desc={whatsappNumber}
                  onClick={() => {
                    setMenuOpen(false);
                    const n = whatsappNumber.replace(/[^\d]/g, "");
                    window.open(`https://wa.me/${n}`, "_blank", "noopener,noreferrer");
                  }}
                />
              )}
              <ChatMenuOption
                icon={FileText}
                label="Help Center"
                desc="Browse guides and FAQs"
                onClick={() => { setMenuOpen(false); window.location.href = "/help"; }}
              />
              <ChatMenuOption
                icon={Package}
                label="Track Order"
                desc="View your recent orders"
                onClick={() => { setMenuOpen(false); window.location.href = "/account"; }}
              />
            </div>
          </div>
        </div>
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

              <DropdownMenu open={menuOpen} onOpenChange={setMenuOpen}>
                <DropdownMenuTrigger asChild>
                  <button
                    type="button"
                    aria-label="More options"
                    className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
                  >
                    <MoreVertical className="h-5 w-5" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent
                  align="end"
                  sideOffset={8}
                  collisionPadding={12}
                  className="z-[90] w-52 rounded-2xl border-border/60 bg-popover/95 p-1.5 backdrop-blur-xl shadow-[var(--shadow-float)]"
                  style={{
                    marginBottom: "env(safe-area-inset-bottom)",
                    marginRight: "env(safe-area-inset-right)",
                  }}
                >
                  <DropdownMenuItem
                    onSelect={() => { setMessages([]); setOperatorJoined(false); toast.success("Conversation cleared"); }}
                    className="cursor-pointer rounded-xl px-3 py-2.5 text-sm text-foreground focus:bg-foreground/5"
                  >
                    Clear conversation
                  </DropdownMenuItem>
                  <DropdownMenuItem
                    onSelect={closePanel}
                    className="cursor-pointer gap-2 rounded-xl px-3 py-2.5 text-sm text-foreground focus:bg-foreground/5"
                  >
                    <X className="h-4 w-4" /> Close chat
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>

          {/* Live agent handoff banner */}
          {operatorJoined && effectiveActiveOrder && (
            <HandoffBanner order={effectiveActiveOrder} customerName={customerName} />
          )}

          {/* Live order-update toast */}
          {updatedOrder && (
            <OrderUpdateToast order={updatedOrder} stage={lastUpdate!.stage} onDismiss={clearUpdate} />
          )}

          {/* Conversation area */}
          <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-none px-4 py-5">
            {!hasConversation ? (
              <Welcome
                onQuick={pushUser}
                availability={availability}
                orders={orders}
                customerName={customerName}
                onOrderAction={onOrderAction}
                onOrderPrompt={onOrderPrompt}
                isLoggedIn={!!user}
              />
            ) : (
              <div className="mx-auto flex max-w-lg flex-col gap-3">
                {messages.map((m) => (
                  <MessageBubble key={m.id} msg={m} />
                ))}
                {operatorTyping && <TypingIndicator />}
              </div>
            )}
          </div>

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

function Welcome({
  onQuick,
  availability,
  orders,
  customerName,
  onOrderAction,
  onOrderPrompt,
  isLoggedIn,
}: {
  onQuick: (t: string) => void;
  availability: Availability;
  orders: ChatOrder[];
  customerName: string;
  onOrderAction: (order: ChatOrder, action: OrderAction) => void;
  onOrderPrompt: (order: ChatOrder, prompt: string) => void;
  isLoggedIn: boolean;
}) {
  const [query, setQuery] = useState("");
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase().replace(/^#?(fom-)?/, "");
    if (!q) return orders;
    return orders.filter((o) =>
      orderNumber(o.id).toLowerCase().includes(q) ||
      (primaryItem(o)?.name ?? "").toLowerCase().includes(q),
    );
  }, [orders, query]);

  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-4">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[var(--shadow-ember)] animate-float-soft">
          <Headset className="h-7 w-7" />
        </div>
        <h2 className="text-2xl font-semibold text-foreground">Hello{customerName ? ` ${customerName}` : ""} 👋</h2>
        <p className="mt-1 text-sm text-muted-foreground">Welcome to <BrandName className="font-medium" /></p>
        <p className="text-sm text-muted-foreground">How can we help you today?</p>
      </div>

      {/* Order intelligence panel */}
      {isLoggedIn && orders.length > 0 && (
        <div className="flex flex-col gap-3">
          <div className="flex items-center justify-between px-1">
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Your Recent Orders</p>
            <span className="text-[10px] text-muted-foreground">{orders.length} order{orders.length > 1 ? "s" : ""}</span>
          </div>

          {/* Order search */}
          <div className="flex items-center gap-2 rounded-2xl border border-input bg-secondary/60 px-3 py-2">
            <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search Order # (e.g. FOM-1A2B3C)"
              className="w-full bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none"
            />
          </div>

          {filtered.length === 0 ? (
            <p className="px-1 text-xs text-muted-foreground">No orders match “{query}”.</p>
          ) : (
            filtered.map((o) => (
              <OrderCard key={o.id} order={o} onAction={onOrderAction} onPrompt={onOrderPrompt} />
            ))
          )}
        </div>
      )}

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

function OrderCard({
  order,
  onAction,
  onPrompt,
}: {
  order: ChatOrder;
  onAction: (order: ChatOrder, action: OrderAction) => void;
  onPrompt: (order: ChatOrder, prompt: string) => void;
}) {
  const stage = orderStage(order);
  const meta = stageMeta(stage);
  const item = primaryItem(order);
  const num = orderNumber(order.id);

  const actions: { key: OrderAction; label: string; icon: typeof Package }[] = [
    { key: "track", label: "Track", icon: MapPin },
    { key: "support", label: "Support", icon: LifeBuoy },
    { key: "return", label: "Return", icon: RotateCcw },
    { key: "report", label: "Report", icon: AlertTriangle },
    { key: "invoice", label: "Invoice", icon: FileText },
  ];

  return (
    <div className="overflow-hidden rounded-2xl border border-border/60 bg-card/70 backdrop-blur-xl shadow-[var(--shadow-card)] animate-chat-bubble-in">
      <div className="flex items-center gap-3 p-3">
        <div className="h-12 w-12 shrink-0 overflow-hidden rounded-xl border border-border/60 bg-secondary/60">
          {item?.image ? (
            <img src={item.image} alt={item.name} loading="lazy" className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-muted-foreground"><Package className="h-5 w-5" /></div>
          )}
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <p className="truncate text-xs font-mono text-muted-foreground">#{num}</p>
            <span className={`shrink-0 text-[11px] font-medium ${meta.tone}`}>{meta.emoji} {meta.label}</span>
          </div>
          <p className="truncate text-sm font-medium text-foreground">{item?.name ?? "Order"}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(order.created_at)}</p>
        </div>
      </div>

      {meta.prompt && (
        <button
          type="button"
          onClick={() => onPrompt(order, meta.prompt!)}
          className="flex w-full items-center gap-2 border-t border-border/40 bg-primary/10 px-3 py-2 text-left text-xs font-medium text-primary transition-colors hover:bg-primary/15"
        >
          <Zap className="h-3.5 w-3.5" /> {meta.prompt}
        </button>
      )}

      <div className="flex flex-wrap gap-1.5 border-t border-border/40 p-2.5">
        {actions.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => onAction(order, key)}
            className="flex items-center gap-1 rounded-full border border-border/60 bg-secondary/60 px-2.5 py-1 text-[11px] font-medium text-foreground/90 transition-colors hover:border-primary/50 hover:bg-secondary active:scale-95"
          >
            <Icon className="h-3 w-3" /> {label}
          </button>
        ))}
      </div>
    </div>
  );
}

function HandoffBanner({ order, customerName }: { order: ChatOrder; customerName: string }) {
  const meta = stageMeta(orderStage(order));
  return (
    <div className="relative z-10 border-b border-emerald-500/20 bg-emerald-500/10 px-4 py-2.5 backdrop-blur-xl">
      <div className="mx-auto flex max-w-lg items-center gap-3">
        <span className="flex h-2.5 w-2.5 shrink-0 rounded-full bg-emerald-400 animate-pulse" />
        <div className="min-w-0 text-[11px] leading-tight text-foreground/90">
          <p className="font-semibold text-foreground">Connected to Marketplace Support</p>
          <p className="truncate text-muted-foreground">
            {customerName ? `${customerName} · ` : ""}#{orderNumber(order.id)} · {meta.emoji} {meta.label}
          </p>
        </div>
      </div>
    </div>
  );
}

function OrderUpdateToast({ order, stage, onDismiss }: { order: ChatOrder; stage: OrderStage; onDismiss: () => void }) {
  const meta = stageMeta(stage);
  useEffect(() => {
    const t = setTimeout(onDismiss, 6000);
    return () => clearTimeout(t);
  }, [onDismiss]);
  return (
    <div className="relative z-10 px-4 pt-2">
      <div className="mx-auto flex max-w-lg items-center gap-3 rounded-2xl border border-primary/30 bg-primary/10 px-3 py-2 backdrop-blur-xl animate-scale-in">
        <Truck className="h-4 w-4 shrink-0 text-primary" />
        <div className="min-w-0 flex-1 text-[11px] leading-tight">
          <p className="font-semibold text-foreground">Order Updated · #{orderNumber(order.id)}</p>
          <p className="text-muted-foreground">Status: {meta.emoji} {meta.label}</p>
        </div>
        <button type="button" onClick={onDismiss} aria-label="Dismiss" className="text-muted-foreground hover:text-foreground">
          <X className="h-4 w-4" />
        </button>
      </div>
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

function ChatMenuOption({
  icon: Icon, label, desc, onClick,
}: {
  icon: typeof Headset;
  label: string;
  desc?: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 rounded-2xl border border-white/10 bg-white/[0.03] p-3.5 text-left transition-colors hover:bg-white/[0.06] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent/60"
    >
      <span className="size-10 rounded-xl grid place-items-center shrink-0 bg-accent/10 text-accent">
        <Icon className="size-5" strokeWidth={1.8} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-medium leading-tight">{label}</span>
        {desc && <span className="block text-[11px] text-muted-foreground mt-0.5 truncate">{desc}</span>}
      </span>
    </button>
  );
}

// Fixed floating support orb — never draggable, never repositioned by the
// user. Dock: bottom-right, 20px inset, above the mobile bottom nav, respects
// safe-area insets and the software keyboard (visualViewport). Hides while
// the user scrolls down and restores on scroll-up or 300ms of idle scroll.
const ORB_SIZE = 56;
const EDGE_INSET = 20;
const BOTTOM_GAP = 16;
const LONG_PRESS_MS = 500;
const TAP_THRESHOLD = 8;

function ringClass(a: Availability): { color: string; anim: string } {
  switch (a) {
    case "online":  return { color: "ring-emerald-400/80", anim: "orb-ring-online" };
    case "away":    return { color: "ring-amber-400/80",   anim: "orb-ring-busy" };
    case "offline": return { color: "ring-white/25",       anim: "" };
    default:        return { color: "ring-white/25",       anim: "" };
  }
}

function FixedOrb({
  hidden,
  availability,
  unread,
  onTap,
  onLongPress,
  greetVisible,
  onDismissGreeting,
}: {
  hidden: boolean;
  availability: Availability;
  unread: number;
  onTap: () => void;
  onLongPress: () => void;
  greetVisible: boolean;
  onDismissGreeting: () => void;
}) {
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const longPressTimer = useRef<number | undefined>(undefined);
  const longPressedRef = useRef(false);
  const downRef = useRef({ active: false, moved: false, x: 0, y: 0 });
  const [placed, setPlaced] = useState(false);

  // Position Lock v6.0: compute the fixed anchor after layout is ready, cache
  // it, and never tie it to footer/sticky CTA/toast/bottom-sheet visibility.
  // Scroll only changes opacity/transform through applyVisibility().
  const cachedRef = useRef({ navH: 96, kb: 0, baselineVV: 0 });

  const readBottomNavHeight = useCallback(() => {
    if (window.matchMedia("(min-width: 768px)").matches) return 0;
    const css = getComputedStyle(document.documentElement);
    const rootFontPx = Number.parseFloat(css.fontSize) || 16;
    return rootFontPx * 5.75;
  }, []);

  const writeBottom = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const c = cachedRef.current;
    const buyBar = getBuyBarLift();
    el.style.bottom = `calc(${c.navH + BOTTOM_GAP + c.kb + buyBar}px + env(safe-area-inset-bottom, 0px))`;
  }, []);


  // Full recompute — allowed only on real layout events, never on scroll or
  // floating UI changes.
  const applyPosition = useCallback(() => {
    const c = cachedRef.current;
    c.navH = readBottomNavHeight();
    const vv = window.visualViewport;
    // Keyboard height: measured against the cached baseline (captured at
    // layout-ready). Only counts when the shrink is large enough to be a
    // software keyboard, not browser-chrome address-bar animation.
    if (vv && c.baselineVV) {
      const delta = c.baselineVV - (vv.height + vv.offsetTop);
      c.kb = delta > 150 ? delta : 0;
    } else {
      c.kb = 0;
    }
    writeBottom();
  }, [readBottomNavHeight, writeBottom]);

  const applyVisibility = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ctxHidden = isContextHidden();
    const off = hidden || ctxHidden;
    // Show: 180ms ease-out, translateY(20px → 0), opacity 0 → 1.
    // Hide: 180ms ease-in,  translateY(0 → 20px), opacity 1 → 0.
    el.style.transition = off
      ? "transform 180ms ease-in, opacity 180ms ease-in"
      : "transform 180ms ease-out, opacity 180ms ease-out";
    el.style.transform = off ? "translateY(20px)" : "translateY(0)";
    el.style.opacity = off ? "0" : "1";
    el.style.pointerEvents = off ? "none" : "";
  }, [hidden]);

  useEffect(() => {
    // Register with the floating-widgets collision system as priority 1 on the
    // right edge so lower-priority widgets (Admin toolbar) shift out of its way.
    const unregister = registerFloating("livechat", {
      priority: 1,
      side: "right",
      width: ORB_SIZE,
      height: ORB_SIZE,
    });
    let cleanupWait = () => {};
    const cancelWait = waitForLayoutReady(isHeaderLayoutReady, () => {
      const raf = requestAnimationFrame(() => {
        const vv = window.visualViewport;
        cachedRef.current.baselineVV = vv ? vv.height + vv.offsetTop : window.innerHeight;
        applyPosition();
        applyVisibility();
        setPlaced(true);
      });
      cleanupWait = () => cancelAnimationFrame(raf);
    });

    // Debounced window resize: browsers fire resize continuously during
    // address-bar animation, so wait for it to settle before recomputing.
    let resizeTimer: number | undefined;
    const onResize = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        // Refresh baseline on genuine resize (orientation, window resize).
        const vv = window.visualViewport;
        if (vv) cachedRef.current.baselineVV = vv.height + vv.offsetTop;
        applyPosition();
      }, 180);
    };
    const onOrientation = () => {
      if (resizeTimer) window.clearTimeout(resizeTimer);
      resizeTimer = window.setTimeout(() => {
        const vv = window.visualViewport;
        if (vv) cachedRef.current.baselineVV = vv.height + vv.offsetTop;
        applyPosition();
      }, 220);
    };
    // visualViewport RESIZE (not scroll) — fires when the software keyboard
    // opens/closes. We diff against the cached baseline; small deltas from
    // browser-chrome collapse are ignored inside applyPosition().
    let vvTimer: number | undefined;
    const onVVResize = () => {
      if (vvTimer) window.clearTimeout(vvTimer);
      vvTimer = window.setTimeout(applyPosition, 60);
    };

    window.addEventListener("resize", onResize);
    window.addEventListener("orientationchange", onOrientation);
    window.visualViewport?.addEventListener("resize", onVVResize);

    // Re-apply visibility only on floating-stack changes. Live Chat position is
    // deliberately locked and must ignore footer/sticky CTA/toast stack changes.
    const unsubscribe = subscribeFloating(() => {
      applyVisibility();
    });
    return () => {
      unregister();
      unsubscribe();
      cancelWait();
      cleanupWait();
      if (resizeTimer) window.clearTimeout(resizeTimer);
      if (vvTimer) window.clearTimeout(vvTimer);
      window.removeEventListener("resize", onResize);
      window.removeEventListener("orientationchange", onOrientation);
      window.visualViewport?.removeEventListener("resize", onVVResize);
    };
  }, [applyPosition, applyVisibility]);


  // Re-apply visibility whenever the hide flag changes.
  useEffect(() => { applyVisibility(); }, [applyVisibility]);

  const clearLongPress = useCallback(() => {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  }, []);

  const onPointerDown = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    downRef.current = { active: true, moved: false, x: e.clientX, y: e.clientY };
    longPressedRef.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      if (!downRef.current.moved) {
        longPressedRef.current = true;
        onLongPress();
      }
    }, LONG_PRESS_MS);
  }, [clearLongPress, onLongPress]);

  const onPointerMove = useCallback((e: React.PointerEvent<HTMLButtonElement>) => {
    const d = downRef.current;
    if (!d.active) return;
    if (Math.hypot(e.clientX - d.x, e.clientY - d.y) > TAP_THRESHOLD) {
      d.moved = true;
      clearLongPress();
    }
  }, [clearLongPress]);

  const onPointerUp = useCallback(() => {
    const d = downRef.current;
    if (!d.active) return;
    d.active = false;
    clearLongPress();
    if (!d.moved && !longPressedRef.current) onTap();
  }, [clearLongPress, onTap]);

  const onPointerCancel = useCallback(() => {
    downRef.current.active = false;
    clearLongPress();
  }, [clearLongPress]);

  const ring = ringClass(availability);

  return (
    <div
      ref={wrapRef}
      className="fixed z-[60] flex items-end gap-2"
      style={{
        right: `calc(${EDGE_INSET}px + env(safe-area-inset-right, 0px))`,
        bottom: 0,
        willChange: "transform, opacity",
        visibility: placed ? "visible" : "hidden",
      }}
    >
      <button
        type="button"
        data-floating-control
        aria-label={
          availability === "online" ? "Live chat online — tap to open, long-press for options"
          : availability === "away" ? "Support busy — tap to open, long-press for options"
          : "Support offline — tap to contact us"
        }
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerCancel}
        onContextMenu={(e) => e.preventDefault()}
        className={`group relative grid place-items-center size-14 md:size-[60px] lg:size-16 min-w-[48px] min-h-[48px] rounded-full bg-gradient-to-br from-primary to-[oklch(0.62_0.17_35)] text-primary-foreground shadow-[0_10px_28px_-10px_rgba(0,0,0,0.55)] ring-2 ${ring.color} backdrop-blur-md transition-[box-shadow] duration-200 hover:shadow-[0_16px_36px_-10px_var(--color-primary,theme(colors.orange.500))] select-none`}
      >
        {ring.anim && (
          <span
            aria-hidden
            className={`pointer-events-none absolute -inset-1 rounded-full ring-2 ${ring.color} ${ring.anim}`}
          />
        )}
        <Headset className="size-6 md:size-[26px] lg:size-7" strokeWidth={1.8} />
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold grid place-items-center ring-2 ring-background animate-in zoom-in duration-200">
            {unread > 99 ? "99+" : unread}
          </span>
        )}
      </button>
      {greetVisible && (
        <button
          type="button"
          onClick={onDismissGreeting}
          className="absolute -top-3 right-[calc(100%+8px)] -translate-y-full whitespace-nowrap rounded-2xl border border-white/10 bg-card/95 px-3 py-2 text-[12px] font-medium text-foreground shadow-[0_8px_24px_-12px_rgba(0,0,0,0.6)] backdrop-blur-xl animate-in fade-in slide-in-from-bottom-1 duration-300"
          aria-label="Dismiss greeting"
        >
          Need help?
        </button>
      )}
      <span className="sr-only">
        {availability === "online" ? "Live chat online" : availability === "away" ? "Live chat busy" : "Live chat offline"}
      </span>
    </div>
  );
}


