import { createFileRoute } from "@tanstack/react-router";
import { createHash } from "crypto";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Email / campaign link click tracking + redirect.
 *
 * Campaign links are registered in `campaign_links` with a unique `token`.
 * The link in the email points to .../api/public/track/click?t=<token>.
 * We log a real `click` event into `campaign_events` and 302-redirect the
 * visitor to the link's `target_url` (which already carries utm_* + fom_cid
 * so the landing page can record an attribution touch).
 */

const SAFE_FALLBACK = "/";

function redirect(to: string) {
  return new Response(null, { status: 302, headers: { Location: to } });
}

export const Route = createFileRoute("/api/public/track/click")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const token = url.searchParams.get("t");
        const messageId = url.searchParams.get("m");
        const email = url.searchParams.get("e");

        if (!token || token.length > 128) return redirect(SAFE_FALLBACK);

        try {
          const { data: link } = await supabaseAdmin
            .from("campaign_links")
            .select("id, campaign_id, target_url, utm")
            .eq("token", token)
            .maybeSingle();

          if (!link) return redirect(SAFE_FALLBACK);

          const ip =
            request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
            request.headers.get("x-real-ip") ??
            "";
          const ipHash = ip
            ? createHash("sha256").update(ip).digest("hex").slice(0, 32)
            : null;

          await supabaseAdmin.from("campaign_events").insert({
            campaign_id: link.campaign_id,
            link_id: link.id,
            event_type: "click",
            recipient_email: email ? email.slice(0, 320) : null,
            message_id: messageId ? messageId.slice(0, 200) : null,
            utm: link.utm ?? {},
            user_agent: (request.headers.get("user-agent") ?? "").slice(0, 400),
            ip_hash: ipHash,
          });

          // Only allow http(s) or same-site relative targets.
          const target = link.target_url;
          if (/^https?:\/\//i.test(target) || target.startsWith("/")) {
            return redirect(target);
          }
          return redirect(SAFE_FALLBACK);
        } catch (err) {
          console.error("track/click failed", err);
          return redirect(SAFE_FALLBACK);
        }
      },
    },
  },
});
