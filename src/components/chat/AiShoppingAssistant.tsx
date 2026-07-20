// AI Shopping Assistant — full mobile-first chat surface.
// Threaded conversations, localStorage-only, lazy-loaded, luxury FoundOurMarket
// styling that mirrors LiveChat. Talks to POST /api/ai-shopping.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronLeft, MessageSquarePlus, Send, Sparkles, X, Menu, Trash2, Headset, Lock, ShieldCheck, Zap } from "lucide-react";
import { toast } from "sonner";
import { onAiOpen, onAiClose, openHub, setLastHubChoice } from "@/lib/ai-shopping/events";
import { openCrispChat } from "@/lib/crisp";
import {
  createEmptyThread,
  deleteThread,
  listThreads,
  loadThread,
  makeMessage,
  saveThread,
  titleFromFirstMessage,
} from "@/lib/ai-shopping/storage";
import type { AiMessage, AiProductRef, AiThread, AiThreadIndexEntry } from "@/lib/ai-shopping/types";
import { AiProductCard } from "./ai-shopping/AiProductCard";

const SUGGESTIONS = [
  "Show me lightweight running shoes under ₹3,000",
  "Gift ideas for my sister's birthday",
  "Which earbuds have the best battery life?",
  "Recommend a premium travel backpack",
];

function formatTime(ts: number): string {
  try {
    return new Date(ts).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  } catch { return ""; }
}

export function AiShoppingAssistant() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<AiThreadIndexEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<AiThread | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Wire open/close events.
  useEffect(() => {
    const off1 = onAiOpen(() => setOpen(true));
    const off2 = onAiClose(() => setOpen(false));
    return () => { off1(); off2(); };
  }, []);

  // Load thread index + choose active thread when opening.
  useEffect(() => {
    if (!open) return;
    const idx = listThreads();
    setThreads(idx);
    if (!activeId) {
      if (idx.length > 0) {
        setActiveId(idx[0].id);
      } else {
        const fresh = createEmptyThread();
        saveThread(fresh);
        setThreads(listThreads());
        setActiveId(fresh.id);
        setThread(fresh);
      }
    }
  }, [open, activeId]);

  // Load active thread into state.
  useEffect(() => {
    if (!activeId) { setThread(null); return; }
    const t = loadThread(activeId);
    if (t) setThread(t);
  }, [activeId]);

  // Body scroll lock + focus.
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    document.body.classList.add("hide-bottom-nav");
    const t = window.setTimeout(() => inputRef.current?.focus(), 200);
    return () => {
      document.body.style.overflow = prev;
      document.body.classList.remove("hide-bottom-nav");
      window.clearTimeout(t);
    };
  }, [open]);

  // Autoscroll on new messages.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [thread?.messages.length, sending, open]);

  const persist = useCallback((next: AiThread) => {
    saveThread(next);
    setThread(next);
    setThreads(listThreads());
  }, []);

  const startNewThread = useCallback(() => {
    const fresh = createEmptyThread();
    saveThread(fresh);
    setThreads(listThreads());
    setActiveId(fresh.id);
    setThread(fresh);
    setDrawerOpen(false);
    setInput("");
    inputRef.current?.focus();
  }, []);

  const removeThread = useCallback((id: string) => {
    deleteThread(id);
    const remaining = listThreads();
    setThreads(remaining);
    if (id === activeId) {
      if (remaining.length > 0) setActiveId(remaining[0].id);
      else {
        const fresh = createEmptyThread();
        saveThread(fresh);
        setThreads(listThreads());
        setActiveId(fresh.id);
        setThread(fresh);
      }
    }
  }, [activeId]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    let current = thread;
    if (!current) {
      current = createEmptyThread();
      saveThread(current);
    }
    const userMsg = makeMessage("user", trimmed);
    const isFirst = current.messages.length === 0;
    const withUser: AiThread = {
      ...current,
      title: isFirst ? titleFromFirstMessage(trimmed) : current.title,
      messages: [...current.messages, userMsg],
    };
    persist(withUser);
    setInput("");
    setSending(true);

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;
    try {
      const payload = withUser.messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai-shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: ac.signal,
      });
      const data = await res.json().catch(() => ({ error: "Bad response" }));
      if (!res.ok) throw new Error(data?.error || `Error ${res.status}`);

      const products: AiProductRef[] | undefined = Array.isArray(data.products)
        ? (data.products as AiProductRef[]).slice(0, 6).map((p) => ({
            slug: p.slug,
            name: p.name,
            image: p.image ?? null,
            price_inr: p.price_inr ?? null,
            compare_price_inr: p.compare_price_inr ?? null,
            rating: p.rating ?? null,
            tagline: p.tagline ?? null,
          }))
        : undefined;
      const assistantMsg = makeMessage("assistant", String(data.reply ?? ""), products);
      persist({ ...withUser, messages: [...withUser.messages, assistantMsg] });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
      const errMsg = makeMessage(
        "assistant",
        "I couldn't reach the AI service just now. Please try again in a moment.",
      );
      persist({ ...withUser, messages: [...withUser.messages, errMsg] });
    } finally {
      setSending(false);
    }
  }, [persist, sending, thread]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) sendMessage(input);
  }, [input, sendMessage]);

  const switchToSupport = useCallback(() => {
    setLastHubChoice("support");
    setOpen(false);
    openCrispChat();
  }, []);

  const messages = thread?.messages ?? [];
  const isEmpty = messages.length === 0;

  const activeTitle = useMemo(() => thread?.title ?? "New chat", [thread]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[72] flex flex-col bg-background/95 backdrop-blur-xl animate-chat-slide-up"
      role="dialog"
      aria-modal="true"
      aria-label="FoundOurMarket AI Shopping Assistant"
    >
      {/* Ambient glow */}
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: "var(--gradient-ember-soft)" }}
        aria-hidden
      />

      {/* Header */}
      <header
        className="relative z-10 border-b border-border/60 bg-card/70 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Back"
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Show chats"
            className="flex h-9 w-9 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
          >
            <Menu className="h-5 w-5" />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[var(--shadow-ember)]">
                <Sparkles className="h-3 w-3" />
              </span>
              <p className="truncate text-sm font-semibold text-foreground">AI Shopping</p>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{activeTitle}</p>
          </div>

          <button
            type="button"
            onClick={switchToSupport}
            className="inline-flex items-center gap-1 rounded-full border border-border/60 bg-card/60 px-2.5 py-1.5 text-[11px] font-medium text-foreground/90 backdrop-blur-xl transition-colors hover:border-primary/50 hover:bg-card active:scale-95"
          >
            <Headset className="h-3.5 w-3.5" /> Switch to Support
          </button>
        </div>
      </header>

      {/* Messages */}
      <div ref={scrollRef} className="relative z-10 flex-1 overflow-y-auto scrollbar-none px-4 py-5">
        {isEmpty ? (
          <Welcome onQuick={(s) => sendMessage(s)} />
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            {messages.map((m) => <Bubble key={m.id} msg={m} />)}
            {sending && <TypingIndicator />}
          </div>
        )}
      </div>

      {/* Trust row */}
      <div className="relative z-10 flex items-center justify-center gap-4 px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary" /> AI Curated</span>
        <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-primary" /> Live Catalog</span>
        <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Private</span>
        <span className="flex items-center gap-1"><Lock className="h-3 w-3" /> On-device history</span>
      </div>

      {/* Composer */}
      <form
        onSubmit={handleSubmit}
        className="relative z-10 border-t border-border/60 bg-card/70 px-3 pt-2.5 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <div className="flex flex-1 items-end rounded-3xl border border-input bg-secondary/60 px-4 py-2">
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSubmit(); }
              }}
              rows={1}
              disabled={sending}
              placeholder="Ask me anything about products…"
              className="max-h-28 w-full resize-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground focus:outline-none disabled:opacity-60"
            />
          </div>
          <button
            type="submit"
            aria-label="Send"
            disabled={!input.trim() || sending}
            className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground transition-transform duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" />
          </button>
        </div>
      </form>

      {/* Threads drawer */}
      {drawerOpen && (
        <ThreadsDrawer
          threads={threads}
          activeId={activeId}
          onClose={() => setDrawerOpen(false)}
          onSelect={(id) => { setActiveId(id); setDrawerOpen(false); }}
          onNew={startNewThread}
          onDelete={removeThread}
        />
      )}
    </div>
  );
}

function Welcome({ onQuick }: { onQuick: (s: string) => void }) {
  return (
    <div className="mx-auto flex max-w-lg flex-col gap-6 py-6">
      <div className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[var(--shadow-ember)] animate-float-soft">
          <Sparkles className="h-7 w-7" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-foreground">Your AI shopping concierge</h2>
        <p className="mt-1 px-4 text-sm text-muted-foreground">
          Discover, compare, and choose — from a catalog of curated pieces worldwide.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <p className="px-1 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
          Try asking
        </p>
        {SUGGESTIONS.map((s) => (
          <button
            key={s}
            type="button"
            onClick={() => onQuick(s)}
            className="flex items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-left text-sm text-foreground/90 backdrop-blur-xl transition-all hover:border-primary/50 hover:bg-card active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 truncate">{s}</span>
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" />
          </button>
        ))}
      </div>

      <p className="text-center text-[11px] text-muted-foreground">
        For orders, returns or delivery — use{" "}
        <button
          type="button"
          className="font-medium text-primary underline-offset-2 hover:underline"
          onClick={() => openHub()}
        >
          Customer Support
        </button>
        .
      </p>
    </div>
  );
}

function Bubble({ msg }: { msg: AiMessage }) {
  const isUser = msg.role === "user";
  return (
    <div className={`flex animate-chat-bubble-in ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={
          isUser
            ? "max-w-[82%] rounded-[22px] rounded-br-md bg-gradient-to-br from-primary to-primary/85 px-4 py-2.5 text-sm text-primary-foreground shadow-[var(--shadow-ember)]"
            : "max-w-[92%] rounded-[22px] rounded-bl-md border border-border/60 bg-card/80 px-4 py-2.5 text-sm text-foreground backdrop-blur-xl shadow-[var(--shadow-card)]"
        }
      >
        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
        {!isUser && msg.products && msg.products.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {msg.products.map((p) => <AiProductCard key={p.slug} product={p} />)}
          </div>
        )}
        <p className={`mt-1 text-[10px] ${isUser ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
          {formatTime(msg.ts)}
        </p>
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
            className="chat-typing-dot h-2 w-2 rounded-full bg-primary/70"
            style={{ animationDelay: `${i * 0.15}s` }}
          />
        ))}
      </div>
    </div>
  );
}

function ThreadsDrawer({
  threads, activeId, onClose, onSelect, onNew, onDelete,
}: {
  threads: AiThreadIndexEntry[];
  activeId: string | null;
  onClose: () => void;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div
      className="fixed inset-0 z-[74] flex bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Your chats"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="flex h-full w-[86%] max-w-sm flex-col border-r border-border/60 bg-card/95 backdrop-blur-2xl shadow-2xl animate-in slide-in-from-left duration-300"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="flex items-center justify-between border-b border-border/60 px-4 py-3">
          <p className="font-display text-base font-semibold text-foreground">Your chats</p>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="grid h-8 w-8 place-items-center rounded-full text-muted-foreground hover:bg-white/10 active:scale-90"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <button
          type="button"
          onClick={onNew}
          className="mx-3 mt-3 flex items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15 active:scale-[0.99]"
        >
          <MessageSquarePlus className="h-4 w-4" /> New chat
        </button>

        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-6">
          {threads.length === 0 ? (
            <p className="px-3 py-4 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            threads.map((t) => (
              <div
                key={t.id}
                className={`group mx-1 mb-1 flex items-center gap-2 rounded-xl px-2 py-2 transition-colors ${
                  t.id === activeId ? "bg-primary/10" : "hover:bg-white/[0.04]"
                }`}
              >
                <button
                  type="button"
                  onClick={() => onSelect(t.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className={`truncate text-sm ${t.id === activeId ? "font-semibold text-primary" : "text-foreground/90"}`}>
                    {t.title}
                  </p>
                  <p className="mt-0.5 text-[10px] text-muted-foreground">
                    {new Date(t.updatedAt).toLocaleDateString(undefined, { day: "numeric", month: "short" })}
                  </p>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm("Delete this chat?")) onDelete(t.id);
                  }}
                  aria-label="Delete chat"
                  className="grid size-8 place-items-center rounded-full text-muted-foreground opacity-0 transition-opacity hover:bg-white/10 hover:text-foreground group-hover:opacity-100"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export default AiShoppingAssistant;
