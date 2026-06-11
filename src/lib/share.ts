export type ShareData = {
  title?: string;
  text?: string;
  url: string;
  /** Optional product/preview image shown in the in-app share sheet. */
  image?: string;
};

const SHARE_EVENT = "fom:open-share";

/**
 * Opens the share experience for the given data.
 * - Uses the native device share sheet (WhatsApp, Messages, etc.) when available.
 * - Falls back to an in-app share dialog (WhatsApp, Telegram, Facebook, X, Email, Copy).
 */
export async function openShare(data: ShareData): Promise<void> {
  if (typeof window === "undefined") return;

  const canNativeShare =
    typeof navigator !== "undefined" &&
    typeof navigator.share === "function" &&
    (!navigator.canShare || navigator.canShare(data));

  if (canNativeShare) {
    try {
      await navigator.share(data);
      return;
    } catch (err) {
      // User dismissed the native sheet — stop quietly.
      if (err instanceof DOMException && err.name === "AbortError") return;
      // Any other error: fall through to the in-app dialog.
    }
  }

  window.dispatchEvent(new CustomEvent<ShareData>(SHARE_EVENT, { detail: data }));
}

export function onOpenShareDialog(handler: (data: ShareData) => void): () => void {
  const listener = (e: Event) => handler((e as CustomEvent<ShareData>).detail);
  window.addEventListener(SHARE_EVENT, listener);
  return () => window.removeEventListener(SHARE_EVENT, listener);
}

export async function copyToClipboard(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    document.execCommand("copy");
    document.body.removeChild(ta);
    return true;
  } catch {
    return false;
  }
}
