/**
 * Infrastructure v2.0 — barrel + boot.
 *
 * Import from route entry lazily:  import("@/lib/infra").then(m => m.bootInfra())
 * Nothing here should be eagerly imported by the entry chunk.
 */

export * from "./event-bus";
export * from "./network-quality";
export * from "./request-queue";
export * from "./queue-adapter";

import { startNetworkQuality } from "./network-quality";
import { startRequestQueue, setAuthTokenProvider } from "./request-queue";

let booted = false;

export function bootInfra() {
  if (booted || typeof window === "undefined") return;
  booted = true;

  // Wire auth token provider lazily so the queue module has no static
  // dependency on the Supabase client.
  setAuthTokenProvider(async () => {
    try {
      const { supabase } = await import("@/integrations/supabase/client");
      const { data } = await supabase.auth.getSession();
      return data.session?.access_token ?? null;
    } catch {
      return null;
    }
  });

  startNetworkQuality();
  startRequestQueue();

  // Infrastructure v2.0 — Self-Healing Service Worker + deployment recovery.
  // Every subsystem is idle-gated and no-ops on preview/dev/iframe.
  void (async () => {
    const { bootServiceWorker } = await import("./sw-controller");
    const active = await bootServiceWorker();
    if (!active) return; // preview/dev/iframe — v1.5 continues without SW
    const [{ startChunkRecoveryV2 }, { startDeploymentRecovery }, { startHealthMonitor }] = await Promise.all([
      import("./chunk-recovery-v2"),
      import("./deployment-recovery"),
      import("./health-monitor"),
    ]);
    startChunkRecoveryV2();
    startDeploymentRecovery();
    startHealthMonitor();
  })();
}

