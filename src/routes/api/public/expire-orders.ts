import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Cron endpoint: releases reserved stock for unpaid orders past their
 * 15-minute expiry and marks them failed. Idempotent and safe to call often.
 * Scheduled via pg_cron every minute.
 */
export const Route = createFileRoute("/api/public/expire-orders")({
  server: {
    handlers: {
      POST: async () => {
        const { data, error } = await supabaseAdmin.rpc("expire_stale_orders");
        if (error) {
          console.error("expire_stale_orders failed", error);
          return new Response(JSON.stringify({ ok: false, error: error.message }), {
            status: 500,
            headers: { "Content-Type": "application/json" },
          });
        }
        return new Response(JSON.stringify({ ok: true, expired: data ?? 0 }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      },
    },
  },
});
