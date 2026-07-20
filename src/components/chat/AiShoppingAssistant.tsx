// AI Shopping Assistant — v1.2 premium shopping experience.
// Streams NDJSON from /api/ai-shopping, renders skeleton loaders, suggestion
// chips, and inline error/retry. UI language and structure preserved from v1.1.
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronLeft, MessageSquarePlus, Send, Sparkles, X, Menu, Trash2,
  Headset, Lock, ShieldCheck, Zap, RotateCw, RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { onAiOpen, onAiClose, openHub, setLastHubChoice } from "@/lib/ai-shopping/events";
import { openCrispChat } from "@/lib/crisp";
import { conversationStore as store } from "@/lib/ai-shopping/conversation-store";
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

function prefersReducedMotion(): boolean {
  if (typeof window === "undefined") return false;
  try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
  catch { return false; }
}

export function AiShoppingAssistant() {
  const [open, setOpen] = useState(false);
  const [threads, setThreads] = useState<AiThreadIndexEntry[]>([]);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [thread, setThread] = useState<AiThread | null>(null);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Live streamed text for the in-progress assistant reply.
  const [streamingText, setStreamingText] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const abortRef = useRef<AbortController | null>(null);
  const lastUserTextRef = useRef<string>("");

  useEffect(() => {
    const off1 = onAiOpen(() => setOpen(true));
    const off2 = onAiClose(() => setOpen(false));
    return () => { off1(); off2(); };
  }, []);

  useEffect(() => {
    if (!open) return;
    const idx = store.getThreads();
    setThreads(idx);
    if (!activeId) {
      if (idx.length > 0) {
        setActiveId(idx[0].id);
      } else {
        const fresh = store.createEmptyThread();
        store.saveThread(fresh);
        setThreads(store.getThreads());
        setActiveId(fresh.id);
        setThread(fresh);
      }
    }
  }, [open, activeId]);

  useEffect(() => {
    if (!activeId) { setThread(null); return; }
    const t = store.loadThread(activeId);
    if (t) setThread(t);
  }, [activeId]);

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

  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) requestAnimationFrame(() => { el.scrollTop = el.scrollHeight; });
  }, [thread?.messages.length, sending, streamingText, open]);

  const persist = useCallback((next: AiThread) => {
    store.saveThread(next);
    setThread(next);
    setThreads(store.getThreads());
  }, []);

  const startNewThread = useCallback(() => {
    const fresh = store.createEmptyThread();
    store.saveThread(fresh);
    setThreads(store.getThreads());
    setActiveId(fresh.id);
    setThread(fresh);
    setDrawerOpen(false);
    setInput("");
    inputRef.current?.focus();
  }, []);

  const removeThread = useCallback((id: string) => {
    store.deleteThread(id);
    const remaining = store.getThreads();
    setThreads(remaining);
    if (id === activeId) {
      if (remaining.length > 0) setActiveId(remaining[0].id);
      else {
        const fresh = store.createEmptyThread();
        store.saveThread(fresh);
        setThreads(store.getThreads());
        setActiveId(fresh.id);
        setThread(fresh);
      }
    }
  }, [activeId]);

  const sendMessage = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || sending) return;
    lastUserTextRef.current = trimmed;
    let current = thread;
    if (!current) {
      current = store.createEmptyThread();
      store.saveThread(current);
    }
    const userMsg = store.makeMessage("user", trimmed);
    const isFirst = current.messages.length === 0;
    const withUser: AiThread = {
      ...current,
      title: isFirst ? store.titleFromFirstMessage(trimmed) : current.title,
      messages: [...current.messages, userMsg],
    };
    persist(withUser);
    setInput("");
    setSending(true);
    setStreamingText("");

    abortRef.current?.abort();
    const ac = new AbortController();
    abortRef.current = ac;

    let accumulated = "";
    let finalProducts: AiProductRef[] | undefined;
    let finalSuggestions: string[] | undefined;
    let streamError: string | null = null;

    try {
      const payload = withUser.messages.map((m) => ({ role: m.role, content: m.content }));
      const res = await fetch("/api/ai-shopping", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messages: payload }),
        signal: ac.signal,
      });
      if (!res.ok || !res.body) {
        const errText = await res.text().catch(() => "");
        throw new Error(errText || `Request failed (${res.status})`);
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buf = "";
      readLoop: while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buf += decoder.decode(value, { stream: true });
        const lines = buf.split("\n");
        buf = lines.pop() ?? "";
        for (const line of lines) {
          const t = line.trim();
          if (!t) continue;
          let evt: { type: string; text?: string; products?: AiProductRef[]; suggestions?: string[]; message?: string };
          try { evt = JSON.parse(t); } catch { continue; }
          if (evt.type === "token" && typeof evt.text === "string") {
            accumulated += evt.text;
            setStreamingText(accumulated);
          } else if (evt.type === "products" && Array.isArray(evt.products)) {
            finalProducts = evt.products.slice(0, 6);
          } else if (evt.type === "suggestions" && Array.isArray(evt.suggestions)) {
            finalSuggestions = evt.suggestions.slice(0, 5);
          } else if (evt.type === "error") {
            streamError = evt.message ?? "Something went wrong";
          } else if (evt.type === "done") {
            break readLoop;
          }
        }
      }

      if (streamError) throw new Error(streamError);

      const replyText = accumulated.trim()
        || "I'm not sure how to help with that — try asking me to find a product or compare two.";
      const assistantMsg: AiMessage = {
        ...store.makeMessage("assistant", replyText, finalProducts),
        suggestions: finalSuggestions,
      };
      persist({ ...withUser, messages: [...withUser.messages, assistantMsg] });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return;
      const message = err instanceof Error ? err.message : "Something went wrong";
      toast.error(message);
      const errMsg: AiMessage = {
        ...store.makeMessage(
          "assistant",
          accumulated.trim()
            || "I couldn't reach the assistant right now. Please check your connection and try again.",
        ),
        error: true,
      };
      persist({ ...withUser, messages: [...withUser.messages, errMsg] });
    } finally {
      setSending(false);
      setStreamingText("");
    }
  }, [persist, sending, thread]);

  const retryLast = useCallback(() => {
    if (sending) return;
    const t = thread;
    if (!t) return;
    // Drop the last (errored) assistant message and re-send the last user text.
    const trimmed = [...t.messages];
    while (trimmed.length && trimmed[trimmed.length - 1].role === "assistant") trimmed.pop();
    persist({ ...t, messages: trimmed });
    const text = lastUserTextRef.current
      || [...trimmed].reverse().find((m) => m.role === "user")?.content
      || "";
    if (text) void sendMessage(text);
  }, [persist, sendMessage, sending, thread]);

  const handleSubmit = useCallback((e?: React.FormEvent) => {
    e?.preventDefault();
    if (input.trim()) sendMessage(input);
  }, [input, sendMessage]);

  const switchToSupport = useCallback(() => {
    setLastHubChoice("support");
    setOpen(false);
    openCrispChat();
  }, []);

  const onChipClick = useCallback((chip: string) => {
    if (/customer support/i.test(chip)) { switchToSupport(); return; }
    sendMessage(chip);
  }, [sendMessage, switchToSupport]);

  const messages = thread?.messages ?? [];
  const isEmpty = messages.length === 0 && !sending;
  const activeTitle = useMemo(() => thread?.title ?? "New chat", [thread]);
  const lastMsg = messages[messages.length - 1];
  const showChips = !sending && lastMsg?.role === "assistant" && !lastMsg.error
    && Array.isArray(lastMsg.suggestions) && lastMsg.suggestions.length > 0;
  const reducedMotion = prefersReducedMotion();

  if (!open) return null;

  return (
    <div
      className={`fixed inset-0 z-[72] flex flex-col bg-background/95 backdrop-blur-xl ${reducedMotion ? "" : "animate-chat-slide-up"}`}
      role="dialog"
      aria-modal="true"
      aria-label="FoundOurMarket AI Shopping Assistant"
    >
      <div
        className="pointer-events-none absolute inset-x-0 top-0 h-72"
        style={{ background: "var(--gradient-ember-soft)" }}
        aria-hidden
      />

      <header
        className="relative z-10 border-b border-border/60 bg-card/70 backdrop-blur-xl"
        style={{ paddingTop: "env(safe-area-inset-top)" }}
      >
        <div className="h-0.5 w-full bg-gradient-to-r from-transparent via-primary to-transparent" />
        <div className="flex items-center gap-2 px-3 py-3">
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close AI Shopping"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
          >
            <ChevronLeft className="h-5 w-5" aria-hidden />
          </button>

          <button
            type="button"
            onClick={() => setDrawerOpen(true)}
            aria-label="Show chats"
            className="flex h-11 w-11 items-center justify-center rounded-full text-foreground/90 transition-colors hover:bg-foreground/10 active:scale-90"
          >
            <Menu className="h-5 w-5" aria-hidden />
          </button>

          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-full bg-gradient-to-br from-primary to-primary/70 text-primary-foreground shadow-[var(--shadow-ember)]">
                <Sparkles className="h-3 w-3" aria-hidden />
              </span>
              <p className="truncate text-sm font-semibold text-foreground">AI Shopping</p>
            </div>
            <p className="truncate text-[11px] text-muted-foreground">{activeTitle}</p>
          </div>

          <button
            type="button"
            onClick={switchToSupport}
            className="inline-flex min-h-11 items-center gap-1 rounded-full border border-border/60 bg-card/60 px-3 py-2 text-[11px] font-medium text-foreground/90 backdrop-blur-xl transition-colors hover:border-primary/50 hover:bg-card active:scale-95"
          >
            <Headset className="h-3.5 w-3.5" aria-hidden /> Support
          </button>
        </div>
      </header>

      <div
        ref={scrollRef}
        className="relative z-10 flex-1 overflow-y-auto scrollbar-none px-4 py-5"
        aria-live="polite"
        aria-atomic="false"
      >
        {isEmpty ? (
          <Welcome onQuick={(s) => sendMessage(s)} />
        ) : (
          <div className="mx-auto flex max-w-lg flex-col gap-3">
            {messages.map((m) => (
              <Bubble
                key={m.id}
                msg={m}
                reducedMotion={reducedMotion}
                onRetry={m.error ? retryLast : undefined}
              />
            ))}
            {sending && (
              streamingText
                ? <StreamingBubble text={streamingText} reducedMotion={reducedMotion} />
                : <ThinkingSkeleton reducedMotion={reducedMotion} />
            )}
            {showChips && lastMsg?.suggestions && (
              <SuggestionChips chips={lastMsg.suggestions} onPick={onChipClick} />
            )}
          </div>
        )}
      </div>

      <div className="relative z-10 flex items-center justify-center gap-4 px-4 py-2 text-[10px] text-muted-foreground">
        <span className="flex items-center gap-1"><Sparkles className="h-3 w-3 text-primary" aria-hidden /> AI Curated</span>
        <span className="flex items-center gap-1"><Zap className="h-3 w-3 text-primary" aria-hidden /> Live Catalog</span>
        <span className="flex items-center gap-1"><ShieldCheck className="h-3 w-3" aria-hidden /> Private</span>
        <span className="flex items-center gap-1"><Lock className="h-3 w-3" aria-hidden /> On-device</span>
      </div>

      <form
        onSubmit={handleSubmit}
        className="relative z-10 border-t border-border/60 bg-card/70 px-3 pt-2.5 backdrop-blur-xl"
        style={{ paddingBottom: "calc(env(safe-area-inset-bottom) + 10px)" }}
      >
        <div className="mx-auto flex max-w-lg items-end gap-2">
          <div className="flex flex-1 items-end rounded-3xl border border-input bg-secondary/60 px-4 py-2">
            <label htmlFor="ai-shopping-composer" className="sr-only">Message the AI Shopping Assistant</label>
            <textarea
              id="ai-shopping-composer"
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
            aria-label="Send message"
            disabled={!input.trim() || sending}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-primary to-primary/80 text-primary-foreground transition-transform duration-200 active:scale-90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <Send className="h-5 w-5" aria-hidden />
          </button>
        </div>
      </form>

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
          <Sparkles className="h-7 w-7" aria-hidden />
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
            className="flex min-h-11 items-center justify-between gap-3 rounded-2xl border border-border/60 bg-card/60 px-4 py-3 text-left text-sm text-foreground/90 backdrop-blur-xl transition-all hover:border-primary/50 hover:bg-card active:scale-[0.99]"
          >
            <span className="min-w-0 flex-1 truncate">{s}</span>
            <Sparkles className="h-3.5 w-3.5 shrink-0 text-primary" aria-hidden />
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

function Bubble({
  msg, reducedMotion, onRetry,
}: { msg: AiMessage; reducedMotion: boolean; onRetry?: () => void }) {
  const isUser = msg.role === "user";
  const anim = reducedMotion ? "" : "animate-chat-bubble-in";
  if (isUser) {
    return (
      <div className={`flex justify-end ${anim}`}>
        <div className="max-w-[82%] rounded-[22px] rounded-br-md bg-gradient-to-br from-primary to-primary/85 px-4 py-2.5 text-sm text-primary-foreground shadow-[var(--shadow-ember)]">
          <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
          <p className="mt-1 text-[10px] text-primary-foreground/70">{formatTime(msg.ts)}</p>
        </div>
      </div>
    );
  }
  // Assistant — no colored bubble background; content sits on the surface.
  return (
    <div className={`flex justify-start ${anim}`}>
      <div className="max-w-[92%] text-sm text-foreground">
        <p className="whitespace-pre-wrap break-words leading-relaxed">{msg.content}</p>
        {msg.products && msg.products.length > 0 && (
          <div className="mt-3 flex flex-col gap-2">
            {msg.products.map((p) => <AiProductCard key={p.slug} product={p} />)}
          </div>
        )}
        {msg.error && onRetry && (
          <div className="mt-3 flex items-center gap-2">
            <button
              type="button"
              onClick={onRetry}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-card active:scale-95"
            >
              <RotateCw className="h-3.5 w-3.5" aria-hidden /> Try again
            </button>
            <a
              href="/deals"
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-2 text-[11px] font-medium text-foreground transition-colors hover:border-primary/50 hover:bg-card active:scale-95"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden /> Continue shopping
            </a>
          </div>
        )}
        <p className="mt-1 text-[10px] text-muted-foreground">{formatTime(msg.ts)}</p>
      </div>
    </div>
  );
}

function StreamingBubble({ text, reducedMotion }: { text: string; reducedMotion: boolean }) {
  const anim = reducedMotion ? "" : "animate-chat-bubble-in";
  return (
    <div className={`flex justify-start ${anim}`}>
      <div className="max-w-[92%] text-sm text-foreground">
        <p className="whitespace-pre-wrap break-words leading-relaxed">
          {text}
          <span className="ml-0.5 inline-block h-3 w-[2px] translate-y-0.5 animate-pulse bg-primary/80" aria-hidden />
        </p>
      </div>
    </div>
  );
}

function ThinkingSkeleton({ reducedMotion }: { reducedMotion: boolean }) {
  const pulse = reducedMotion ? "" : "animate-pulse";
  return (
    <div className="flex justify-start">
      <div className="w-full max-w-[92%] space-y-2" aria-label="Assistant is thinking">
        <div className={`h-3 w-3/4 rounded-full bg-foreground/10 ${pulse}`} />
        <div className={`h-3 w-2/3 rounded-full bg-foreground/10 ${pulse}`} />
        <div className={`h-3 w-1/2 rounded-full bg-foreground/10 ${pulse}`} />
      </div>
    </div>
  );
}

function SuggestionChips({ chips, onPick }: { chips: string[]; onPick: (c: string) => void }) {
  return (
    <div
      className="mt-1 flex flex-wrap gap-2"
      role="group"
      aria-label="Suggested follow-ups"
    >
      {chips.map((c) => (
        <button
          key={c}
          type="button"
          onClick={() => onPick(c)}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-full border border-border/60 bg-card/70 px-3 py-1.5 text-[12px] font-medium text-foreground/90 backdrop-blur-xl transition-colors hover:border-primary/50 hover:bg-card active:scale-95"
        >
          <Sparkles className="h-3 w-3 text-primary" aria-hidden />
          {c}
        </button>
      ))}
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
            aria-label="Close chats"
            className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-white/10 active:scale-90"
          >
            <X className="h-4 w-4" aria-hidden />
          </button>
        </div>

        <button
          type="button"
          onClick={onNew}
          className="mx-3 mt-3 flex min-h-11 items-center gap-3 rounded-2xl border border-primary/40 bg-primary/10 px-4 py-2.5 text-sm font-medium text-primary transition-colors hover:bg-primary/15 active:scale-[0.99]"
        >
          <MessageSquarePlus className="h-4 w-4" aria-hidden /> New chat
        </button>

        <div className="mt-3 flex-1 overflow-y-auto px-2 pb-6">
          {threads.length === 0 ? (
            <p className="px-3 py-6 text-center text-xs text-muted-foreground">No chats yet.</p>
          ) : (
            <ul className="flex flex-col gap-1">
              {threads.map((t) => {
                const active = t.id === activeId;
                return (
                  <li key={t.id} className="flex items-center gap-1">
                    <button
                      type="button"
                      onClick={() => onSelect(t.id)}
                      className={`min-h-11 flex-1 truncate rounded-2xl px-3 py-2 text-left text-sm transition-colors ${
                        active ? "bg-primary/15 text-primary" : "text-foreground/90 hover:bg-white/5"
                      }`}
                    >
                      {t.title || "New chat"}
                    </button>
                    <button
                      type="button"
                      onClick={() => onDelete(t.id)}
                      aria-label={`Delete chat: ${t.title || "New chat"}`}
                      className="grid h-11 w-11 place-items-center rounded-full text-muted-foreground hover:bg-white/5 hover:text-destructive active:scale-90"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden />
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
