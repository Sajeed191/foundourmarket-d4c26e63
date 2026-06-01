// Crisp Chat lazy loader — only injects the script on first request.
// Website ID is a public identifier (shipped in Crisp's own embed snippet).
export const CRISP_WEBSITE_ID = "e01c081c-fa06-440a-a578-99ed7f53ed1a";

declare global {
  interface Window {
    $crisp?: any[];
    CRISP_WEBSITE_ID?: string;
    CRISP_RUNTIME_CONFIG?: { locale?: string };
  }
}

let loadPromise: Promise<void> | null = null;
let loadStart = 0;

// Lightweight, dev-only performance monitoring for chat readiness.
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

export function loadCrisp(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  // Single-initialization guarantee: reuse the in-flight / resolved promise.
  if (loadPromise) return loadPromise;

  loadStart = typeof performance !== "undefined" ? performance.now() : 0;
  perf.mark("load-start");

  loadPromise = new Promise<void>((resolve, reject) => {
    try {
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;

      // Keep the launcher hidden until we explicitly open it.
      window.$crisp.push(["safe", true]);
      window.$crisp.push(["do", "chat:hide"]);
      window.$crisp.push(["on", "chat:initiated", () => {}]);

      const finish = () => {
        const ms = loadStart ? Math.round(performance.now() - loadStart) : 0;
        perf.mark("load-end");
        perf.log(`SDK ready in ${ms}ms`);
        resolve();
      };

      const existing = document.getElementById("crisp-widget-script") as HTMLScriptElement | null;
      if (existing) {
        // Already injected — resolve next tick (prevents duplicate SDK loading).
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

// Preload the Crisp SDK in the background once the page is idle/interactive,
// so the widget is already in memory by the time the user clicks a chat entry
// point. Safe to call multiple times — loadCrisp() de-dupes internally.
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

  // Wait until the page is interactive so chat loading never blocks first paint.
  if (document.readyState === "complete") schedule();
  else window.addEventListener("load", schedule, { once: true });
}


export function openCrispChat(): void {
  if (typeof window === "undefined") return;
  perf.mark("open-request");
  // Ensure the SDK is loading (deduped) so direct callers open instantly too.
  void loadCrisp();
  window.$crisp = window.$crisp || [];
  ensureHideStyle();
  document.documentElement.removeAttribute("data-crisp-hidden");
  window.$crisp.push(["do", "chat:show"]);
  window.$crisp.push(["do", "chat:open"]);
  window.$crisp.push(["on", "chat:opened", () => { perf.mark("open-done"); showBackButton(); }]);
  // Auto-hide the widget entirely once the user closes the chat.
  window.$crisp.push(["on", "chat:closed", () => closeCrispChat()]);
  // Relabel Crisp's built-in "Minimize" menu item to "Close chat".
  customizeCrispMenu();
  // Show a left-side Back button overlay for an easy single-tap exit.
  showBackButton();
}

const BACK_BUTTON_ID = "crisp-back-button";

// Renders a permanent top-left "← Back" button while the Crisp chat is open.
// Tapping it closes the chat (conversation/session preserved) and returns the
// user to the exact previous page state — no navigation, no refresh.
function showBackButton(): void {
  if (typeof window === "undefined" || typeof document === "undefined") return;

  let btn = document.getElementById(BACK_BUTTON_ID) as HTMLButtonElement | null;
  if (!btn) {
    btn = document.createElement("button");
    btn.id = BACK_BUTTON_ID;
    btn.type = "button";
    btn.setAttribute("aria-label", "Back");
    btn.innerHTML = `<span style="font-size:18px;line-height:1">←</span><span>Back</span>`;
    btn.style.cssText = [
      "position:fixed",
      "top:calc(env(safe-area-inset-top) + 12px)",
      "left:calc(env(safe-area-inset-left) + 12px)",
      "z-index:2147483647",
      "display:flex",
      "align-items:center",
      "gap:6px",
      "padding:8px 14px",
      "border:none",
      "border-radius:9999px",
      "background:rgba(17,17,17,0.92)",
      "color:#fff",
      "font:600 14px/1 system-ui,-apple-system,sans-serif",
      "box-shadow:0 4px 14px rgba(0,0,0,0.3)",
      "cursor:pointer",
      "-webkit-tap-highlight-color:transparent",
    ].join(";");
    btn.addEventListener("click", () => closeCrispChat());
    document.body.appendChild(btn);
  }
  btn.style.display = "flex";
}

function hideBackButton(): void {
  if (typeof document === "undefined") return;
  const btn = document.getElementById(BACK_BUTTON_ID);
  if (btn) btn.style.display = "none";
}


let menuObserver: MutationObserver | null = null;

// Crisp ships a "Minimize Support" item in its chatbox menu. We relabel it to
// "Close chat" and make clicking it fully close + hide the widget.
// We also remove the "We run on Crisp" branding.
function customizeCrispMenu(): void {
  if (typeof window === "undefined") return;

  const apply = () => {
    const box = document.getElementById("crisp-chatbox");
    if (!box) return;

    // Relabel "Minimize" → "Close chat"
    const items = box.querySelectorAll("li");
    items.forEach((li) => {
      const label = (li.textContent || "").trim().toLowerCase();
      if (label.includes("minimize")) {
        if (li.textContent !== "Close chat") li.textContent = "Close chat";
        if (!li.dataset.closeBound) {
          li.dataset.closeBound = "true";
          li.addEventListener("click", () => {
            // Defer so Crisp's own handler runs first, then force-close.
            setTimeout(() => closeCrispChat(), 0);
          });
        }
      }
    });
    // Hide "We run on Crisp" branding (can render as div, span or anchor)
    const candidates = box.querySelectorAll("a, span, div, p");
    candidates.forEach((node) => {
      const text = (node.textContent || "").trim().toLowerCase();
      if (text.includes("we run on") && text.includes("crisp")) {
        (node as HTMLElement).style.display = "none";
      }
    });
    // Hide "Additional support" / "Need additional support?" links
    const allNodes = box.querySelectorAll("a, span, div, p, button");
    allNodes.forEach((node) => {
      const text = (node.textContent || "").trim().toLowerCase();
      if (text.includes("additional support")) {
        (node as HTMLElement).style.display = "none";
      }
    });
  };

  apply();
  if (menuObserver) return;
  menuObserver = new MutationObserver(() => apply());
  menuObserver.observe(document.body, { childList: true, subtree: true });
}



const HIDE_STYLE_ID = "crisp-force-hide-style";

function ensureHideStyle(): HTMLStyleElement {
  let el = document.getElementById(HIDE_STYLE_ID) as HTMLStyleElement | null;
  if (!el) {
    el = document.createElement("style");
    el.id = HIDE_STYLE_ID;
    el.textContent = `
      html[data-crisp-hidden="true"] #crisp-chatbox,
      html[data-crisp-hidden="true"] .crisp-client,
      html[data-crisp-hidden="true"] [class*="crisp-client"],
      html[data-crisp-hidden="true"] [id^="crisp-"],
      html[data-crisp-hidden="true"] iframe[src*="crisp.chat"] {
        display: none !important;
        visibility: hidden !important;
        opacity: 0 !important;
        pointer-events: none !important;
      }
      @media (max-width: 767px) {
        #crisp-chatbox,
        .crisp-client,
        [class*="crisp-client"],
        iframe[src*="crisp.chat"] {
          bottom: var(--floating-bottom-offset) !important;
          z-index: var(--z-floating-controls) !important;
        }
      }
    `;
    document.head.appendChild(el);
  }
  return el;
}

export function closeCrispChat(): void {
  if (typeof window === "undefined") return;
  window.$crisp = window.$crisp || [];
  window.$crisp.push(["do", "chat:close"]);
  window.$crisp.push(["do", "chat:hide"]);
  ensureHideStyle();
  hideBackButton();
  document.documentElement.setAttribute("data-crisp-hidden", "true");
}

export function isCrispChatOpen(): boolean {
  if (typeof window === "undefined" || !window.$crisp) return false;
  // Crisp doesn't expose a direct state getter; we rely on page state tracking.
  return false;
}

export function setCrispUser(opts: { email?: string; nickname?: string }): void {
  if (typeof window === "undefined") return;
  window.$crisp = window.$crisp || [];
  if (opts.email) window.$crisp.push(["set", "user:email", [opts.email]]);
  if (opts.nickname) window.$crisp.push(["set", "user:nickname", [opts.nickname]]);
}
