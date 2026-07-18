import { createServerFn } from "@tanstack/react-start";
import { render } from "@react-email/components";
import * as React from "react";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'
import { TestEmail } from "@/lib/email-templates/test-email";

const STAFF_ROLES = ["admin", "super_admin", "manager"];
const SITE_NAME = "FoundOurMarket";
const SENDER_DOMAIN = "ou.foundourmarket.com";
const FROM_DOMAIN = "foundourmarket.com";

async function assertEmailStaff(userId: string): Promise<string[]> {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.some((r) => STAFF_ROLES.includes(r))) {
    throw new Error("You are not authorised to send test emails.");
  }
  return roles;
}

const inputSchema = z.object({
  recipientEmail: z.string().trim().toLowerCase().email().max(254),
  message: z.string().trim().max(600).optional(),
});

/** Admin — send a branded cyber-dark test email to any address. */
export const sendTestEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => inputSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as {
      userId: string;
      claims?: { email?: string };
    };
    await assertEmailStaff(userId);

    const recipient = data.recipientEmail;
    const sentBy = claims?.email ?? "admin";
    const messageId = crypto.randomUUID();

    // Respect the suppression list — never send to suppressed addresses.
    const { data: suppressed } = await supabaseAdmin
      .from("suppressed_emails")
      .select("id")
      .eq("email", recipient)
      .maybeSingle();

    if (suppressed) {
      return { success: false, reason: "email_suppressed" as const };
    }

    const element = React.createElement(TestEmail, {
      message: data.message,
      sentBy,
    });
    const html = await render(element);
    const text = await render(element, { plainText: true });

    // Audit: log pending before enqueue.
    await supabaseAdmin.from("email_send_log").insert({
      message_id: messageId,
      template_name: "test-email",
      recipient_email: recipient,
      status: "pending",
    });

    const { error: enqueueError } = await supabaseAdmin.rpc("enqueue_email", {
      queue_name: "transactional_emails",
      payload: {
        message_id: messageId,
        to: recipient,
        from: await enforceSender(PRIMARY_FROM, { recipient, template: 'test email', context: 'test email' }),
        reply_to: `support@${FROM_DOMAIN}`,
        sender_domain: SENDER_DOMAIN,
        subject: "FoundOurMarket™ — Test email delivery ✦",
        html,
        text,
        purpose: "transactional",
        label: "test-email",
        idempotency_key: messageId,
        queued_at: new Date().toISOString(),
      },
    });

    if (enqueueError) {
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "test-email",
        recipient_email: recipient,
        status: "failed",
        error_message: "Failed to enqueue test email",
      });
      throw new Error("Could not queue the test email. Please try again.");
    }

    return { success: true as const, recipient };
  });
