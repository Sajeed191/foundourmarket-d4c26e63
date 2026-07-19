/**
 * Infrastructure v1.5 — global sync toasts.
 *
 * Listens to the frozen Phase-1 queue events and surfaces the two subtle
 * toasts specified in the integration brief:
 *
 *   "Saved. We'll sync when you're back online."   (on queue:enqueued)
 *   "Synced successfully."                         (on queue:drained)
 *
 * Never renders anything itself — dispatches through the existing sonner
 * toaster used everywhere else in the app.
 */

import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { on } from "./event-bus";

export function SyncToastsMount() {
  const enqueuedInSession = useRef(false);
  const drainedNotifiedAt = useRef(0);

  useEffect(() => {
    const off1 = on("queue:enqueued", () => {
      enqueuedInSession.current = true;
      toast("Saved. We'll sync when you're back online.", {
        id: "infra-queue-saved",
        duration: 2600,
      });
    });
    const off2 = on("queue:drained", () => {
      if (!enqueuedInSession.current) return;
      const now = Date.now();
      if (now - drainedNotifiedAt.current < 1500) return;
      drainedNotifiedAt.current = now;
      enqueuedInSession.current = false;
      toast.success("Synced successfully.", {
        id: "infra-queue-synced",
        duration: 1800,
      });
    });
    const off3 = on("queue:failed", (payload) => {
      // Silent for customers — surfaced only in admin analytics later.
      if (typeof console !== "undefined") {
        console.debug("[infra] queue permanently failed", payload);
      }
    });
    return () => { off1(); off2(); off3(); };
  }, []);

  return null;
}
