import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Silent global crash guard.
 *
 * The user must NEVER see a full-screen "We're having trouble loading…" or
 * "Try Again" page. On a React tree crash we:
 *   1. Log the error to diagnostics (invisible to the user).
 *   2. Show only the small non-blocking connection toast (via the startup
 *      guard's `window.__fomShowToast`).
 *   3. Silently trigger the same background auto-recovery pipeline that
 *      handles chunk / network failures — up to 5 retries, 1–2s apart, and
 *      then keeps polling silently. State (cart, session, scroll, etc.) is
 *      preserved by the browser across the recovery reload.
 *
 * This boundary never renders a visible fallback.
 */

type Props = { children: ReactNode };
type State = { hasError: boolean };

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error("[AppErrorBoundary] React tree crashed:", error, info.componentStack);
      const w = window as unknown as {
        __fomDiag?: (event: string, payload?: Record<string, unknown>) => void;
        __fomRecover?: (reason?: unknown) => void;
        __fomShowToast?: (msg: string) => void;
      };
      w.__fomDiag?.("react-error-boundary", {
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      });
      // Small non-blocking toast — never a full-page interruption.
      w.__fomShowToast?.("Reconnecting…");
      // Kick the same background recovery pipeline used for chunk / network
      // failures. It retries silently and preserves application state.
      w.__fomRecover?.(error);
    } catch {
      /* ignore */
    }
  }

  render() {
    // Never render a visible error page. If the tree crashed the recovery
    // pipeline handles it in the background; rendering `null` avoids a flash
    // of any fallback UI before the silent reload commits.
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
