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

/** Set a customer's account status (active / suspended / banned). */
export const setCustomerStatusFn = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        customerId: z.string().uuid(),
        status: z.enum(["active", "suspended", "banned"]),
      })
      .parse(input),
  )
  .handler(async ({ data: input, context }) => {
    const { userId } = context as { userId: string };
    const { primaryRole } = await requireStaff(userId, CUST_STAFF, "customers.status.set", input.customerId);

    const { error } = await supabaseAdmin
      .from("profiles")
      .update({ account_status: input.status, deleted_at: null, deleted_by: null })
      .eq("id", input.customerId);
    if (error) throw new Error(error.message);

    await logSecurity({
      actorId: userId,
      actorRole: primaryRole,
      action: "customers.status.set",
      target: input.customerId,
      success: true,
      detail: { status: input.status },
    });
    return { ok: true, status: input.status };
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
    const { error } = await supabaseAdmin.from("profiles").update(patch).eq("id", input.customerId);
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
