import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  getRazorpayCreds,
  rzpFetch,
  mapRzpToken,
  verifyPaymentSignature,
  type RzpToken,
} from "./razorpay.server";

type Ctx = { supabase: any; userId: string; claims: any };

/** Ensure the signed-in user has a Razorpay customer; create one on first use. Idempotent. */
async function ensureRazorpayCustomer(userId: string, claims: any): Promise<{ customerId: string }> {
  const { data: existing } = await supabaseAdmin
    .from("razorpay_customers")
    .select("razorpay_customer_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (existing?.razorpay_customer_id) {
    return { customerId: existing.razorpay_customer_id };
  }

  const email: string | undefined = claims?.email ?? undefined;
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("full_name,phone")
    .eq("id", userId)
    .maybeSingle();

  const body: Record<string, unknown> = {
    name: profile?.full_name || email?.split("@")[0] || "FoundOurMarket Customer",
    fail_existing: 0,
  };
  if (email) body.email = email;
  if (profile?.phone) body.contact = profile.phone;

  const customer = await rzpFetch<{ id: string }>("/customers", { method: "POST", body });

  await supabaseAdmin.from("razorpay_customers").upsert(
    {
      user_id: userId,
      razorpay_customer_id: customer.id,
      email: email ?? null,
      phone: profile?.phone ?? null,
    },
    { onConflict: "user_id" },
  );

  return { customerId: customer.id };
}

/** Create (or fetch) the Razorpay customer for this user. Returns the customer id + key for checkout. */
export const createRazorpayCustomer = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as Ctx;
    const { keyId } = getRazorpayCreds();
    const { customerId } = await ensureRazorpayCustomer(userId, claims);
    return { customerId, keyId };
  });

/** List the user's saved payment methods (DB-backed, RLS-scoped). */
export const listSavedPaymentMethods = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context as Ctx;
    const { data, error } = await supabase
      .from("saved_payment_methods")
      .select("*")
      .order("is_default", { ascending: false })
      .order("created_at", { ascending: false });
    if (error) throw new Error("Could not load payment methods.");
    return { methods: data ?? [] };
  });

/**
 * Sync tokens from Razorpay into our DB (source of truth = Razorpay).
 * Inserts new tokens, refreshes metadata, removes tokens that no longer exist.
 */
export const syncRazorpayPaymentMethods = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as Ctx;
    const { customerId } = await ensureRazorpayCustomer(userId, claims);

    let tokens: RzpToken[] = [];
    try {
      const res = await rzpFetch<{ items?: RzpToken[] }>(`/customers/${customerId}/tokens`);
      tokens = res.items ?? [];
    } catch (e: any) {
      await supabaseAdmin.from("tokenization_logs").insert({
        user_id: userId,
        razorpay_customer_id: customerId,
        status: "sync_failed",
        error: String(e?.message ?? e),
      });
      throw new Error("Could not sync payment methods from the gateway.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const live = tokens.filter((t) => !t.expired_at || t.expired_at > nowSec);

    // Upsert live tokens
    if (live.length) {
      const rows = live.map((t) => {
        const mapped = mapRzpToken(t, customerId, userId);
        return { ...mapped, updated_at: new Date().toISOString() };
      });
      await supabaseAdmin
        .from("saved_payment_methods")
        .upsert(rows, { onConflict: "user_id,razorpay_token_id" });
    }

    // Remove DB rows whose token no longer exists in Razorpay
    const liveIds = new Set(live.map((t) => t.id));
    const { data: dbRows } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("id,razorpay_token_id,is_default")
      .eq("user_id", userId);
    const stale = (dbRows ?? []).filter((r: any) => !liveIds.has(r.razorpay_token_id));
    if (stale.length) {
      await supabaseAdmin
        .from("saved_payment_methods")
        .delete()
        .in(
          "id",
          stale.map((r: any) => r.id),
        );
    }

    // Ensure at least one default
    const { data: finalRows } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("id,is_default")
      .eq("user_id", userId)
      .order("created_at", { ascending: false });
    if (finalRows?.length && !finalRows.some((r: any) => r.is_default)) {
      await supabaseAdmin
        .from("saved_payment_methods")
        .update({ is_default: true })
        .eq("id", finalRows[0].id);
    }

    await supabaseAdmin.from("tokenization_logs").insert({
      user_id: userId,
      razorpay_customer_id: customerId,
      status: "synced",
      metadata: { count: live.length },
    });

    return { synced: live.length };
  });

const saveSchema = z.object({
  razorpayTokenId: z.string().min(1).max(120),
  makeDefault: z.boolean().optional(),
});

/**
 * Save a specific token after a successful tokenized payment/authorization.
 * Validates the token belongs to the user's Razorpay customer before storing.
 */
export const savePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => saveSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as Ctx;
    const { customerId } = await ensureRazorpayCustomer(userId, claims);

    let token: RzpToken | null = null;
    try {
      token = await rzpFetch<RzpToken>(`/customers/${customerId}/tokens/${data.razorpayTokenId}`);
    } catch (e: any) {
      await supabaseAdmin.from("tokenization_logs").insert({
        user_id: userId,
        razorpay_customer_id: customerId,
        razorpay_token_id: data.razorpayTokenId,
        status: "save_failed",
        error: String(e?.message ?? e),
      });
      throw new Error("This payment method could not be verified.");
    }
    if (!token?.id) throw new Error("Invalid payment token.");

    const mapped = mapRzpToken(token, customerId, userId);
    const { data: existingCount } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("id")
      .eq("user_id", userId);
    const isFirst = !existingCount?.length;

    const { error } = await supabaseAdmin.from("saved_payment_methods").upsert(
      { ...mapped, is_default: data.makeDefault || isFirst },
      { onConflict: "user_id,razorpay_token_id" },
    );
    if (error) throw new Error("Could not save payment method.");

    await supabaseAdmin.from("tokenization_logs").insert({
      user_id: userId,
      razorpay_customer_id: customerId,
      razorpay_token_id: token.id,
      payment_type: mapped.payment_type,
      status: "saved",
    });

    return { ok: true };
  });

const idSchema = z.object({ id: z.string().uuid() });

/** Delete a saved payment method — removes the token at Razorpay too. Ownership enforced. */
export const deletePaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const { data: row } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("id,user_id,razorpay_customer_id,razorpay_token_id,is_default")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.user_id !== userId) throw new Error("Payment method not found.");

    try {
      await rzpFetch(`/customers/${row.razorpay_customer_id}/tokens/${row.razorpay_token_id}`, {
        method: "DELETE",
      });
    } catch {
      /* token may already be gone at gateway — continue to remove locally */
    }

    await supabaseAdmin.from("saved_payment_methods").delete().eq("id", row.id);

    // Promote a new default if we removed the default
    if (row.is_default) {
      const { data: next } = await supabaseAdmin
        .from("saved_payment_methods")
        .select("id")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (next?.id) {
        await supabaseAdmin
          .from("saved_payment_methods")
          .update({ is_default: true })
          .eq("id", next.id);
      }
    }

    return { ok: true };
  });

/** Set a saved payment method as the default. Ownership enforced; single-default enforced by trigger. */
export const setDefaultPaymentMethod = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => idSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as Ctx;
    const { data: row } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("id,user_id")
      .eq("id", data.id)
      .maybeSingle();
    if (!row || row.user_id !== userId) throw new Error("Payment method not found.");

    const { error } = await supabaseAdmin
      .from("saved_payment_methods")
      .update({ is_default: true })
      .eq("id", data.id);
    if (error) throw new Error("Could not set default payment method.");
    return { ok: true };
  });

/* ---------------------------------------------------------------------------
 * Dedicated "add payment method" setup flow (tokenization via a tiny auth
 * charge that is immediately refunded). Real Razorpay, no demo data.
 * ------------------------------------------------------------------------- */

const SETUP_AMOUNT_PAISE = 200; // ₹2 validation charge, auto-refunded after tokenization

/** Step 1 — create a small Razorpay order tied to the user's customer for tokenization. */
export const createTokenizationSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId, claims } = context as Ctx;
    const { keyId } = getRazorpayCreds();
    const { customerId } = await ensureRazorpayCustomer(userId, claims);

    const order = await rzpFetch<{ id: string; amount: number; currency: string }>("/orders", {
      method: "POST",
      body: {
        amount: SETUP_AMOUNT_PAISE,
        currency: "INR",
        customer_id: customerId,
        notes: { purpose: "save_payment_method", user_id: userId },
      },
    });

    await supabaseAdmin.from("tokenization_logs").insert({
      user_id: userId,
      razorpay_customer_id: customerId,
      status: "setup_created",
      metadata: { razorpay_order_id: order.id },
    });

    return {
      keyId,
      customerId,
      razorpayOrderId: order.id,
      amount: order.amount,
      currency: order.currency,
    };
  });

const verifySetupSchema = z.object({
  razorpayOrderId: z.string().min(1).max(120),
  razorpayPaymentId: z.string().min(1).max(120),
  razorpaySignature: z.string().min(1).max(256),
});

/**
 * Step 2 — verify the handshake, refund the validation charge, then sync the
 * newly tokenized method(s) into our DB. Returns how many tokens are now saved.
 */
export const verifyTokenizationSetup = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => verifySetupSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId, claims } = context as Ctx;

    const valid = verifyPaymentSignature(
      data.razorpayOrderId,
      data.razorpayPaymentId,
      data.razorpaySignature,
    );
    if (!valid) {
      await supabaseAdmin.from("tokenization_logs").insert({
        user_id: userId,
        status: "setup_failed",
        error: "signature_verification_failed",
      });
      throw new Error("Could not verify this payment method.");
    }

    // Refund the tiny validation charge — best effort, never blocks tokenization.
    try {
      await rzpFetch(`/payments/${data.razorpayPaymentId}/refund`, {
        method: "POST",
        body: { notes: { reason: "save_payment_method_validation" } },
      });
    } catch {
      /* refund may be async/auto-captured later; continue */
    }

    const { customerId } = await ensureRazorpayCustomer(userId, claims);

    let tokens: RzpToken[] = [];
    try {
      const res = await rzpFetch<{ items?: RzpToken[] }>(`/customers/${customerId}/tokens`);
      tokens = res.items ?? [];
    } catch (e: any) {
      await supabaseAdmin.from("tokenization_logs").insert({
        user_id: userId,
        razorpay_customer_id: customerId,
        status: "sync_failed",
        error: String(e?.message ?? e),
      });
      throw new Error("Saved, but could not refresh your methods. Try Sync.");
    }

    const nowSec = Math.floor(Date.now() / 1000);
    const live = tokens.filter((t) => !t.expired_at || t.expired_at > nowSec);

    const { data: existing } = await supabaseAdmin
      .from("saved_payment_methods")
      .select("id")
      .eq("user_id", userId);
    const hadNone = !existing?.length;

    if (live.length) {
      const rows = live.map((t, i) => {
        const mapped = mapRzpToken(t, customerId, userId);
        return {
          ...mapped,
          is_default: hadNone && i === 0 ? true : undefined,
          updated_at: new Date().toISOString(),
        };
      });
      await supabaseAdmin
        .from("saved_payment_methods")
        .upsert(rows, { onConflict: "user_id,razorpay_token_id" });
    }

    await supabaseAdmin.from("tokenization_logs").insert({
      user_id: userId,
      razorpay_customer_id: customerId,
      status: "setup_completed",
      metadata: { count: live.length },
    });

    return { ok: true, saved: live.length };
  });
