import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Silent global crash guard.
 *
 * A React tree crash is NOT a connectivity event and must never trigger a
 * "Reconnecting…" toast or a background reload. We only forward the error
 * to the recovery pipeline when it is unambiguously a chunk / entry-script
 * failure — those are the errors the recovery pipeline is designed for.
 *
 * For any other error we log to diagnostics and render `null` so the app
 * doesn't show a scary error page; React will attempt to remount on the
 * next navigation.
 */

type Props = { children: ReactNode };
type State = { hasError: boolean };

const CHUNK_ERROR_RE =
  /Failed to fetch dynamically imported module|virtual:tanstack-start-client-entry|vite:preloadError|Importing a module script failed|error loading dynamically imported module|ChunkLoadError|Loading chunk|Loading CSS chunk/i;

function isChunkError(err: unknown): boolean {
  let msg = "";
  if (err && typeof err === "object" && "message" in err) {
    const m = (err as { message?: unknown }).message;
    msg = typeof m === "string" ? m : String(m ?? "");
  } else {
    msg = String(err ?? "");
  }
  return CHUNK_ERROR_RE.test(msg);
}

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
        __fomRecover?: (reason?: unknown, opts?: { force?: boolean }) => void;
      };
      w.__fomDiag?.("react-error-boundary", {
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      });
      // Only trigger silent recovery for real chunk/entry failures. Generic
      // component errors must NOT show a connection toast or reload the app.
      if (isChunkError(error)) {
        w.__fomRecover?.(error);
      }
    } catch {
      /* ignore */
    }
  }

  render() {
    if (this.state.hasError) return null;
    return this.props.children;
  }
}
