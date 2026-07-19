import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Global crash fallback for the entire app.
 *
 * On the first crash within a browser session we silently perform ONE hard
 * reload — most transient failures (chunk load errors, stale service worker,
 * flaky mobile network, cache corruption) recover cleanly on reload and the
 * user never sees a failure screen. Only if the reload also fails do we
 * render the minimal branded "Try Again" screen.
 *
 * Retry counter uses sessionStorage (`fom_auto_reload_count`) so it resets
 * for every new tab/session and can never trigger an infinite reload loop.
 * localStorage, cookies, auth, cart, and analytics state are preserved.
 */

const RELOAD_KEY = "fom_auto_reload_count";
const MAX_AUTO_RELOADS = 1;

type Props = { children: ReactNode };
type State = { hasError: boolean; exhausted: boolean };

function readCount(): number {
  try {
    return parseInt(sessionStorage.getItem(RELOAD_KEY) || "0", 10) || 0;
  } catch {
    return 0;
  }
}

function writeCount(n: number) {
  try {
    sessionStorage.setItem(RELOAD_KEY, String(n));
  } catch {
    /* ignore */
  }
}

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, exhausted: false };

  static getDerivedStateFromError(): State {
    const exhausted = readCount() >= MAX_AUTO_RELOADS;
    return { hasError: true, exhausted };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error("[AppErrorBoundary] React tree crashed:", error, info.componentStack);
      (window as unknown as { __fomDiag?: (event: string, payload?: Record<string, unknown>) => void }).__fomDiag?.(
        "react-error-boundary",
        { message: error.message, stack: error.stack, componentStack: info.componentStack },
      );
    } catch {
      /* ignore */
    }

    // Silent automatic recovery: one hard reload per session. Never shown to
    // the user — the reload replaces the current document before React can
    // paint the fallback below.
    if (typeof window === "undefined") return;
    if (readCount() >= MAX_AUTO_RELOADS) return;
    writeCount(readCount() + 1);
    // Small delay lets React finish the current tick and any pending logs flush.
    window.setTimeout(() => {
      try {
        window.location.reload();
      } catch {
        /* ignore */
      }
    }, 50);
  }

  private tryAgain = () => {
    if (typeof window === "undefined") return;
    writeCount(0);
    window.location.reload();
  };

  render() {
    if (!this.state.hasError) return this.props.children;

    // Automatic reload in flight — render nothing to avoid a flash of the
    // fallback before the reload commits.
    if (!this.state.exhausted) return null;

    return (
      <div
        role="alert"
        style={{
          minHeight: "100dvh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          padding: "1.5rem",
          background: "#0a0a0a",
          color: "#f5f5f5",
          fontFamily: "system-ui, -apple-system, Segoe UI, Roboto, sans-serif",
        }}
      >
        <div style={{ maxWidth: "22rem", textAlign: "center" }}>
          <div
            style={{
              margin: "0 auto 1rem",
              width: "3rem",
              height: "3rem",
              borderRadius: "0.85rem",
              display: "grid",
              placeItems: "center",
              background: "rgba(245,158,11,0.12)",
              border: "1px solid rgba(245,158,11,0.3)",
              fontSize: "1.5rem",
            }}
          >
            🌍
          </div>
          <h1 style={{ fontSize: "1.15rem", fontWeight: 600, margin: "0 0 0.5rem" }}>
            We&rsquo;re having trouble loading FoundOurMarket&trade;
          </h1>
          <p style={{ fontSize: "0.9rem", color: "#a3a3a3", margin: "0 0 1.5rem" }}>
            Please check your internet connection and try again.
          </p>
          <button
            type="button"
            onClick={this.tryAgain}
            style={{
              appearance: "none",
              border: "none",
              cursor: "pointer",
              borderRadius: "9999px",
              padding: "0.75rem 1.75rem",
              fontSize: "0.75rem",
              fontWeight: 600,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "#0a0a0a",
              background: "#f59e0b",
            }}
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }
}
