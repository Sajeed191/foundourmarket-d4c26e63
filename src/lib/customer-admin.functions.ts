/**
 * Staff-gated customer administration actions for the Customer 360° center:
 * status changes (active / suspended / banned), soft delete, ordering &
 * review controls and admin-initiated notifications. Every action is audited.
 */
import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireStaff, logSecurity, type StaffRole } from "./admin-guard.server";

const CUST_STAFF: StaffRole[] = ["admin", "super_admin", "manager"];

/** Set a customer's account status (active / suspended / banned) with an audit trail. */
export const setCustomerStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        status: z.enum(["active", "suspended", "banned"]),
        reason: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.status.set", input.customerId);

    const now = new Date().toISOString();
    const patch: Record<string, unknown> = {
      account_status: input.status,
      deleted_at: null,
      deleted_by: null,
    };
    if (input.status === "banned") {
      patch.ban_reason = input.reason ?? null;
      patch.banned_at = now;
      patch.banned_by = userId;
      patch.ordering_blocked = true;
      patch.reviews_disabled = true;
    } else if (input.status === "suspended") {
      patch.suspended_at = now;
      patch.suspended_by = userId;
      patch.ordering_blocked = true;
    } else {
      patch.ban_reason = null;
      patch.banned_at = null;
      patch.banned_by = null;
      patch.suspended_at = null;
      patch.suspended_by = null;
      patch.ordering_blocked = false;
      patch.reviews_disabled = false;
    }

    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", input.customerId);
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.status.set",
      target: input.customerId,
      success: true,
      detail: { status: input.status, reason: input.reason ?? null },
    });
    return { ok: true, status: input.status };
  });

/** Update a customer's editable profile fields (name, phone, and optionally email). */
export const updateCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        full_name: z.string().trim().max(160).optional(),
        phone: z.string().trim().max(40).optional(),
        email: z.string().trim().email().max(254).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.update", input.customerId);

    const patch: Record<string, unknown> = {};
    if (input.full_name !== undefined) patch.full_name = input.full_name || null;
    if (input.phone !== undefined) patch.phone = input.phone || null;
    if (Object.keys(patch).length > 0) {
      const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", input.customerId);
      if (error) throw new Error(error.message);
    }

    if (input.email) {
      const { error: ae } = await supabaseAdmin.auth.admin.updateUserById(input.customerId, {
        email: input.email,
      });
      if (ae) throw new Error(ae.message);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.update",
      target: input.customerId,
      success: true,
      detail: { fields: Object.keys({ ...patch, ...(input.email ? { email: 1 } : {}) }) },
    });
    return { ok: true };
  });

const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";

function encodeRawEmail(to: string, subject: string, body: string): string {
  const msg = [
    `To: ${to}`,
    `Subject: ${subject}`,
    'Content-Type: text/plain; charset="UTF-8"',
    "",
    body,
  ].join("\r\n");
  return Buffer.from(msg, "utf-8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

/** Send a direct email to a customer via the connected Gmail mailbox. */
export const sendCustomerEmailFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        to: z.string().trim().email(),
        subject: z.string().trim().min(2).max(200),
        body: z.string().trim().min(1).max(10000),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.email.send", input.customerId);

    const lov = process.env.LOVABLE_API_KEY;
    const key = process.env.GOOGLE_MAIL_API_KEY;
    if (!lov || !key) throw new Error("Email is not available — connect a Gmail mailbox first.");

    const raw = encodeRawEmail(input.to, input.subject, input.body);
    const res = await fetch(`${GMAIL_GW}/users/me/messages/send`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${lov}`,
        "X-Connection-Api-Key": key,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw }),
    });
    if (!res.ok) {
      const detail = await res.text().catch(() => "");
      throw new Error(`Failed to send email (${res.status}). ${detail.slice(0, 200)}`);
    }

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.email.send",
      target: input.customerId,
      success: true,
      detail: { to: input.to, subject: input.subject },
    });
    return { ok: true };
  });

/** Soft-delete a customer — never removes the record, just marks it deleted. */
export const softDeleteCustomerFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.delete.soft", input.customerId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ account_status: "deleted", deleted_at: new Date().toISOString(), deleted_by: userId })
      .eq("id", input.customerId);
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.delete.soft",
      target: input.customerId,
      success: true,
    });
    return { ok: true };
  });

/** Toggle an ordering / reviews control flag for a customer. */
export const setCustomerFlagFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        flag: z.enum(["ordering_blocked", "reviews_disabled"]),
        value: z.boolean(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.flag.set", input.customerId);

    const patch = input.flag === "ordering_blocked"
      ? { ordering_blocked: input.value }
      : { reviews_disabled: input.value };
    const { error } = await supabaseAdmin.from("profiles").update(patch as never).eq("id", input.customerId);
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.flag.set",
      target: input.customerId,
      success: true,
      detail: { flag: input.flag, value: input.value },
    });
    return { ok: true };
  });

/** Send an in-app notification to a customer (real notifications table row). */
export const sendCustomerNotificationFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        title: z.string().trim().min(2).max(160),
        body: z.string().trim().min(1).max(2000),
        link: z.string().trim().max(500).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.notify", input.customerId);

    const { error } = await supabaseAdmin.from("notifications").insert({
      user_id: input.customerId,
      type: "admin_message",
      title: input.title,
      body: input.body,
      link: input.link || null,
      priority: "normal",
    });
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.notify",
      target: input.customerId,
      success: true,
    });
    return { ok: true };
  });

/** Trigger a password-reset email for the customer via Supabase Auth. */
export const resetCustomerPasswordFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ customerId: z.string().uuid() }).parse(input))
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.password.reset", input.customerId);

    const { data: u, error: ue } = await supabaseAdmin.auth.admin.getUserById(input.customerId);
    if (ue || !u?.user?.email) throw new Error(ue?.message || "Customer has no email");

    const { error } = await supabaseAdmin.auth.resetPasswordForEmail(u.user.email);
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.password.reset",
      target: input.customerId,
      success: true,
    });
    return { ok: true, email: u.user.email };
  });
