import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Global crash fallback for the entire app.
 *
 * TanStack Router's route-level `errorComponent` only catches errors thrown
 * inside a matched route's component/loader. It does NOT catch render-time
 * throws in the provider tree (RegionProvider, AuthProvider, CartProvider, …)
 * or in shared chrome (Nav/Footer). When one of those throws — common on
 * low-end Android with flaky networks or partially-loaded chunks — React
 * unmounts the whole tree and the user sees a blank/grey screen with the
 * browser's sad-face.
 *
 * This boundary wraps the provider tree so any such crash renders a branded,
 * dependency-free fallback (no app CSS or chunks required) with a one-tap
 * recovery instead of a blank page. The markup uses inline styles so it works
 * even if the stylesheet itself failed to load.
 */

type Props = { children: ReactNode };
type State = { hasError: boolean };

const RELOAD_GUARD = "fom_crash_reload_at";
const RELOAD_COOLDOWN_MS = 20_000;

export class AppErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // Keep this lightweight — logging must never throw inside the boundary.
    try {
      console.error("[AppErrorBoundary] React tree crashed:", error, info.componentStack);
    } catch {
      /* ignore */
    }
  }

  private hardReload = () => {
    if (typeof window === "undefined") return;
    try {
      // Guard against reload loops on a genuinely broken build.
      const last = Number(sessionStorage.getItem(RELOAD_GUARD) ?? 0);
      if (Date.now() - last < RELOAD_COOLDOWN_MS) {
        window.location.href = "/";
        return;
      }
      sessionStorage.setItem(RELOAD_GUARD, String(Date.now()));
    } catch {
      /* storage blocked — fall through */
    }
    const url = new URL(window.location.href);
    url.searchParams.set("_r", Date.now().toString(36));
    window.location.replace(url.toString());
  };

  render() {
    if (!this.state.hasError) return this.props.children;

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
            FoundOurMarket is loading.
          </h1>
          <p style={{ fontSize: "0.9rem", color: "#a3a3a3", margin: "0 0 1.5rem" }}>
            Please refresh or try again.
          </p>
          <button
            type="button"
            onClick={this.hardReload}
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
            Reload
          </button>
        </div>
      </div>
    );
  }
}
