// Crisp Chat integration — the native Crisp widget is loaded but kept
// permanently hidden. All UI is rendered by our custom premium chat
// (src/components/chat/LiveChat.tsx) which drives Crisp through its
// programmatic JS API (message:send / message:received / availability).
//
// Website ID is a public identifier (shipped in Crisp's own embed snippet).
export const CRISP_WEBSITE_ID = "e01c081c-fa06-440a-a578-99ed7f53ed1a";

declare global {
  interface Window {
    $crisp?: any[];
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: { locale?: string };
  }
}

export type CrispMessage = {
  id: string;
  from: "user" | "operator";
  text: string;
  ts: number;
};

export type Availability = "online" | "away" | "offline";

let loadPromise: Promise<void> | null = null;
let loadStart = 0;

const perf = {
  mark(name: string) {
    if (typeof performance === "undefined") return;
    try { performance.mark(`crisp:${name}`); } catch { /* noop */ }
  },
  log(msg: string) {
    if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
      // eslint-disable-next-line no-console
      console.info(`[crisp] ${msg}`);
    }
  },
};

// Force the native Crisp chatbox + launcher to stay hidden at all times.
const HIDE_STYLE_ID = "crisp-force-hide-style";
function ensureHideStyle(): void {
  if (typeof document === "undefined") return;
  if (document.getElementById(HIDE_STYLE_ID)) return;
  const el = document.createElement("style");
  el.id = HIDE_STYLE_ID;
  el.textContent = `
    #crisp-chatbox,
    .crisp-client,
    [class*="crisp-client"],
    iframe[src*="crisp.chat"] {
      display: none !important;
      visibility: hidden !important;
      opacity: 0 !important;
      pointer-events: none !important;
    }
  `;
  document.head.appendChild(el);
}

export function loadCrisp(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadStart = typeof performance !== "undefined" ? performance.now() : 0;
  perf.mark("load-start");

  loadPromise = new Promise<void>((resolve, reject) => {
    try {
      ensureHideStyle();
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;

      // Keep Crisp's own UI fully hidden — we render our own.
      window.$crisp.push(["safe", true]);
      window.$crisp.push(["do", "chat:hide"]);

      const finish = () => {
        const ms = loadStart ? Math.round(performance.now() - loadStart) : 0;
        perf.mark("load-end");
        perf.log(`SDK ready in ${ms}ms`);
        // Re-assert hidden once loaded.
        try { window.$crisp!.push(["do", "chat:hide"]); } catch { /* noop */ }
        resolve();
      };

      const existing = document.getElementById("crisp-widget-script") as HTMLScriptElement | null;
      if (existing) {
        setTimeout(finish, 0);
        return;
      }

      const s = document.createElement("script");
      s.id = "crisp-widget-script";
      s.src = "https://client.crisp.chat/l.js";
      s.async = true;
      s.onload = finish;
      s.onerror = () => {
        loadPromise = null;
        perf.log("SDK failed to load");
        reject(new Error("Failed to load Crisp"));
      };
      document.head.appendChild(s);
    } catch (err) {
      loadPromise = null;
      reject(err as Error);
    }
  });

  return loadPromise;
}

let preloaded = false;
export function preloadCrisp(): void {
  if (typeof window === "undefined" || preloaded) return;
  preloaded = true;

  const start = () => {
    perf.mark("preload-start");
    void loadCrisp().catch(() => { preloaded = false; });
  };

  const schedule = () => {
    const ric = (window as any).requestIdleCallback as
      | ((cb: () => void, opts?: { timeout: number }) => number)
      | undefined;
    if (ric) ric(start, { timeout: 4000 });
    else setTimeout(start, 2000);
  };

  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}

const OPEN_EVENT = "fom-chat:open";
const CLOSE_EVENT = "fom-chat:close";

// Opening / closing now drives our custom UI via window events. Crisp itself
// stays hidden. These keep the old call sites working unchanged.
export function openCrispChat(): void {
  if (typeof window === "undefined") return;
  perf.mark("open-request");
  void loadCrisp();
  window.dispatchEvent(new CustomEvent(OPEN_EVENT));
}

export function closeCrispChat(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(CLOSE_EVENT));
}

export function onChatOpenRequest(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(OPEN_EVENT, cb);
  return () => window.removeEventListener(OPEN_EVENT, cb);
}

export function onChatCloseRequest(cb: () => void): () => void {
  if (typeof window === "undefined") return () => {};
  window.addEventListener(CLOSE_EVENT, cb);
  return () => window.removeEventListener(CLOSE_EVENT, cb);
}

export function isCrispChatOpen(): boolean {
  return false;
}

export function setCrispUser(opts: { email?: string; nickname?: string }): void {
  if (typeof window === "undefined") return;
  window.$crisp = window.$crisp || [];
  if (opts.email) window.$crisp.push(["set", "user:email", [opts.email]]);
  if (opts.nickname) window.$crisp.push(["set", "user:nickname", [opts.nickname]]);
}

// Attach order/customer context to the Crisp conversation so human agents see
// it without asking the customer to repeat themselves. Values must be strings.
export function setCrispSessionData(data: Record<string, string | number | null | undefined>): void {
  if (typeof window === "undefined") return;
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  const pairs = Object.entries(data)
    .filter(([, v]) => v !== null && v !== undefined && `${v}`.length > 0)
    .map(([k, v]) => [k, `${v}`]);
  if (pairs.length === 0) return;
  try { window.$crisp.push(["set", "session:data", [pairs]]); } catch { /* noop */ }
}


// ----- Programmatic messaging API used by the custom chat UI -----

export function sendCrispMessage(text: string): void {
  if (typeof window === "undefined" || !text.trim()) return;
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["do", "message:send", ["text", text]]);
}

let msgIdCounter = 0;
function nextId(): string {
  msgIdCounter += 1;
  return `m_${Date.now()}_${msgIdCounter}`;
}

// Subscribe to incoming operator messages. Returns an unsubscribe function.
export function onOperatorMessage(cb: (msg: CrispMessage) => void): () => void {
  if (typeof window === "undefined") return () => {};
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  const handler = (data: any) => {
    if (!data) return;
    // Only handle plain text content from operators.
    const text = typeof data.content === "string" ? data.content : "";
    if (!text) return;
    cb({
      id: nextId(),
      from: "operator",
      text,
      ts: typeof data.timestamp === "number" ? data.timestamp : Date.now(),
    });
  };
  window.$crisp.push(["on", "message:received", handler]);
  // Crisp doesn't expose removing a single listener cleanly; the handler is
  // idempotent and the component dedupes, so we no-op on cleanup.
  return () => {};
}

// Subscribe to operator typing indicator.
export function onOperatorTyping(cb: (typing: boolean) => void): () => void {
  if (typeof window === "undefined") return () => {};
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["on", "message:compose:received", (data: any) => {
    cb(!!(data && data.type === "start"));
  }]);
  return () => {};
}

// Subscribe to website availability (operator online/offline) changes.
export function onAvailabilityChange(cb: (a: Availability) => void): () => void {
  if (typeof window === "undefined") return () => {};
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["on", "website:availability:changed", (data: any) => {
    cb(data && data.status === "online" ? "online" : "offline");
  }]);
  return () => {};
}

export function getAvailability(): Availability {
  if (typeof window === "undefined" || !(window as any).$crisp?.get) return "away";
  try {
    const v = (window as any).$crisp.get("website:availability");
    return v === "online" ? "online" : v === "offline" ? "offline" : "away";
  } catch {
    return "away";
  }
}
