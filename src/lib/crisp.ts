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

export function loadCrisp(): Promise<void> {
  if (typeof window === "undefined") return Promise.resolve();
  if (loadPromise) return loadPromise;

  loadPromise = new Promise<void>((resolve, reject) => {
    try {
      window.$crisp = window.$crisp || [];
      window.CRISP_WEBSITE_ID = CRISP_WEBSITE_ID;

      // Keep the launcher hidden until we explicitly open it.
      window.$crisp.push(["safe", true]);
      window.$crisp.push(["do", "chat:hide"]);
      window.$crisp.push(["on", "chat:initiated", () => {}]);

      const existing = document.getElementById("crisp-widget-script") as HTMLScriptElement | null;
      if (existing) {
        // Already injected — resolve next tick.
        setTimeout(resolve, 0);
        return;
      }

      const s = document.createElement("script");
      s.id = "crisp-widget-script";
      s.src = "https://client.crisp.chat/l.js";
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        loadPromise = null;
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

export function openCrispChat(): void {
  if (typeof window === "undefined") return;
  window.$crisp = window.$crisp || [];
  ensureHideStyle();
  document.documentElement.removeAttribute("data-crisp-hidden");
  window.$crisp.push(["do", "chat:show"]);
  window.$crisp.push(["do", "chat:open"]);
  // Auto-hide the widget entirely once the user closes the chat.
  window.$crisp.push(["on", "chat:closed", () => closeCrispChat()]);
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
