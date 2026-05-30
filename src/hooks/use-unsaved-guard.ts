import { useEffect } from "react";
import { useBlocker } from "@tanstack/react-router";

/**
 * Guards against losing unsaved work. Warns on browser close/refresh
 * (beforeunload) and intercepts in-app route changes (TanStack useBlocker).
 */
export function useUnsavedGuard(
  dirty: boolean,
  message = "You have unsaved changes. Leave without saving?",
) {
  // Browser refresh / tab close / logout via full navigation.
  useEffect(() => {
    if (!dirty) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = message;
      return message;
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [dirty, message]);

  // In-app route changes.
  useBlocker({
    shouldBlockFn: () => {
      if (!dirty) return false;
      return !window.confirm(message);
    },
    enableBeforeUnload: false,
  });
}
