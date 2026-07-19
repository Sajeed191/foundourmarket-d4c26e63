import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Renders `null` (never re-renders children) if its subtree throws. Prevents
 * a crash in a single deferred widget (admin toolbar, live chat, etc.) from
 * blanking the whole app via the top-level AppErrorBoundary.
 */
type Props = { name: string; children: ReactNode };
type State = { dead: boolean };

export class IsolatedBoundary extends Component<Props, State> {
  state: State = { dead: false };

  static getDerivedStateFromError(): State {
    return { dead: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    try {
      console.error(`[IsolatedBoundary:${this.props.name}]`, error, info.componentStack);
      (window as unknown as {
        __fomDiag?: (event: string, payload?: Record<string, unknown>) => void;
      }).__fomDiag?.("isolated-boundary-crash", {
        name: this.props.name,
        message: error.message,
        stack: error.stack,
        componentStack: info.componentStack,
      });
    } catch {
      /* ignore */
    }
  }

  render() {
    return this.state.dead ? null : this.props.children;
  }
}

export default IsolatedBoundary;
