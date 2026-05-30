import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Email open tracking pixel.
 *
 * Embedded in campaign emails as <img src=".../api/public/track/open?c=<campaignId>&m=<messageId>&e=<email>">.
 * Logs a real `open` event into `campaign_events` and always returns a
 * transparent 1x1 GIF (never blocks rendering, never leaks data).
 */

// 1x1 transparent GIF
const PIXEL = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64",
);

function pixelResponse() {
  return new Response(PIXEL, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Content-Length": String(PIXEL.length),
      "Cache-Control": "no-store, no-cache, must-revalidate, private",
      Pragma: "no-cache",
    },
  });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/track/open")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        try {
          const url = new URL(request.url);
          const campaignId = url.searchParams.get("c");
          const messageId = url.searchParams.get("m");
          const email = url.searchParams.get("e");

          if (campaignId && UUID_RE.test(campaignId)) {
            const ip =
              request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
              request.headers.get("x-real-ip") ??
              "";
            const ipHash = ip
              ? createHash("sha256").update(ip).digest("hex").slice(0, 32)
              : null;

            await supabaseAdmin.from("campaign_events").insert({
              campaign_id: campaignId,
              event_type: "open",
              recipient_email: email ? email.slice(0, 320) : null,
              message_id: messageId ? messageId.slice(0, 200) : null,
              user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400),
              ip_hash: ipHash,
            });
          }
        } catch (err) {
          console.error("track/open failed", err);
        }
        return pixelResponse();
      },
    },
  },
});
