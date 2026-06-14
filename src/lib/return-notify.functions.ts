import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Fire the customer-facing "Return requested" communications (in-app
 * notification + branded email + audit/timeline entry) for a return the
 * authenticated caller owns. Idempotent and resilient — safe to call right
 * after the client inserts the return row. Never throws back into the UI.
 */
export const notifyReturnRequestedFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ returnId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    try {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: ret } = await supabaseAdmin
        .from("returns")
        .select("id, order_id, user_id")
        .eq("id", data.returnId)
        .maybeSingle();
      // Ownership guard — only the customer who created it can trigger this.
      if (!ret || ret.user_id !== userId) return { ok: false, reason: "not_owner" };

      const { notifyCustomer, fmOrderNo } = await import("./customer-notify.server");
      const no = fmOrderNo(ret.order_id);
      await notifyCustomer({
        userId,
        category: "return",
        type: "return_update",
        title: "Return requested",
        body: `We've received your return request for order #${no}. Our team will review it shortly.`,
        link: `/account/returns?return=${ret.id}&order=${ret.order_id}`,
        priority: "normal",
        data: { return_id: ret.id, order_id: ret.order_id },
        actorId: userId,
      });

      const { enqueueReturnEmail } = await import("./return-emails.server");
      await enqueueReturnEmail(ret.order_id, "return-requested", {}, `return-${ret.id}-requested`);

      return { ok: true };
    } catch (err: any) {
      console.error("[notifyReturnRequested] failed", {
        returnId: data.returnId,
        error: String(err?.message ?? err),
      });
      return { ok: false, reason: "error" };
    }
  });
