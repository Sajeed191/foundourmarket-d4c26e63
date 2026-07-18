import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'

const STAFF_ROLES = ["admin", "super_admin", "manager"];

const GMAIL_GW = "https://connector-gateway.lovable.dev/google_mail/gmail/v1";
const OUTLOOK_GW = "https://connector-gateway.lovable.dev/microsoft_outlook";

const SITE_NAME = "FoundOurMarket";
const SENDER_DOMAIN = "ou.foundourmarket.com";
const FROM_DOMAIN = "foundourmarket.com";

async function assertEmailStaff(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("role")
    .eq("user_id", userId);
  if (error) throw new Error("Could not verify permissions.");
  const roles = (data ?? []).map((r) => r.role as string);
  if (!roles.some((r) => STAFF_ROLES.includes(r))) {
    throw new Error("You are not authorised to run inbox placement tests.");
  }
}

function gmailHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const key = process.env.GOOGLE_MAIL_API_KEY;
  if (!lov) throw new Error("LOVABLE_API_KEY is not configured.");
  if (!key) throw new Error("GOOGLE_MAIL_API_KEY is not configured (connect Gmail).");
  return { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key };
}

function outlookHeaders() {
  const lov = process.env.LOVABLE_API_KEY;
  const key = process.env.MICROSOFT_OUTLOOK_API_KEY;
  if (!lov) throw new Error("LOVABLE_API_KEY is not configured.");
  if (!key) throw new Error("MICROSOFT_OUTLOOK_API_KEY is not configured (connect Outlook).");
  return { Authorization: `Bearer ${lov}`, "X-Connection-Api-Key": key };
}

async function detectGmailAddress(): Promise<string | null> {
  try {
    const res = await fetch(`${GMAIL_GW}/users/me/profile`, { headers: gmailHeaders() });
    if (!res.ok) return null;
    const json = (await res.json()) as { emailAddress?: string };
    return json.emailAddress ?? null;
  } catch {
    return null;
  }
}

async function detectOutlookAddress(): Promise<string | null> {
  try {
    const res = await fetch(`${OUTLOOK_GW}/me?%24select=mail,userPrincipalName`, {
      headers: outlookHeaders(),
    });
    if (!res.ok) return null;
    const json = (await res.json()) as { mail?: string; userPrincipalName?: string };
    const addr = json.mail || json.userPrincipalName || null;
    if (addr && addr.includes("@")) return addr;
    return null;
  } catch {
    return null;
  }
}

/** Return the connected seed inbox addresses for Gmail and Outlook. */
export const getSeedInboxes = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);
    const [gmail, outlook] = await Promise.all([detectGmailAddress(), detectOutlookAddress()]);
    return {
      gmail: { connected: !!process.env.GOOGLE_MAIL_API_KEY, address: gmail },
      outlook: { connected: !!process.env.MICROSOFT_OUTLOOK_API_KEY, address: outlook },
    };
  });

function testEmailHtml(token: string) {
  return `<!doctype html><html><body style="font-family:Arial,Helvetica,sans-serif;background:#0b0d12;color:#e8eaed;padding:32px">
  <div style="max-width:520px;margin:0 auto;background:#12151c;border-radius:16px;padding:32px;border:1px solid #232733">
    <h1 style="font-size:20px;margin:0 0 12px">Your FoundOurMarket order update</h1>
    <p style="font-size:14px;line-height:1.6;color:#aab0bb;margin:0 0 16px">
      Hi there — this is a quick update about your recent FoundOurMarket order.
      Your package is being prepared and you'll get tracking details shortly.
    </p>
    <p style="font-size:14px;line-height:1.6;color:#aab0bb;margin:0 0 16px">
      Thanks for shopping with us. Everything you need — all in one place 🌍
    </p>
    <p style="font-size:11px;color:#5a6170;margin:24px 0 0">Reference: ${token}</p>
  </div></body></html>`;
}

const createSchema = z.object({
  gmailAddress: z.string().trim().email().max(254).optional().nullable(),
  outlookAddress: z.string().trim().email().max(254).optional().nullable(),
});

/** Create a placement test and enqueue a tagged email to each seed inbox. */
export const createPlacementTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    const gmailAddress = data.gmailAddress?.toLowerCase() || null;
    const outlookAddress = data.outlookAddress?.toLowerCase() || null;
    if (!gmailAddress && !outlookAddress) {
      throw new Error("Provide at least one seed inbox address.");
    }

    // Short, mailbox-searchable tag embedded in the subject line.
    const token = `FOM-${Math.random().toString(36).slice(2, 8).toUpperCase()}${Date.now().toString(36).slice(-4).toUpperCase()}`;
    const subject = `Your FoundOurMarket order update [${token}]`;
    const html = testEmailHtml(token);
    const text = `Your FoundOurMarket order update. Reference: ${token}`;

    const { data: row, error: insErr } = await supabaseAdmin
      .from("inbox_placement_tests")
      .insert({
        created_by: userId,
        token,
        subject,
        status: "pending",
        gmail_address: gmailAddress,
        outlook_address: outlookAddress,
        gmail_placement: gmailAddress ? "pending" : null,
        outlook_placement: outlookAddress ? "pending" : null,
      })
      .select("id")
      .single();
    if (insErr || !row) throw new Error(insErr?.message ?? "Could not create test.");

    const recipients = [gmailAddress, outlookAddress].filter(Boolean) as string[];
    for (const recipient of recipients) {
      const messageId = `inbox-test-${token}-${recipient}`;
      await supabaseAdmin.from("email_send_log").insert({
        message_id: messageId,
        template_name: "inbox-placement-test",
        recipient_email: recipient,
        status: "pending",
      });
      const { error: enqErr } = await supabaseAdmin.rpc("enqueue_email", {
        queue_name: "transactional_emails",
        payload: {
          message_id: messageId,
          to: recipient,
          from: await enforceSender(PRIMARY_FROM, { recipient, template: 'inbox placement', context: 'inbox placement' }),
          reply_to: `support@${FROM_DOMAIN}`,
          sender_domain: SENDER_DOMAIN,
          subject,
          html,
          text,
          purpose: "transactional",
          label: "inbox-placement-test",
          idempotency_key: messageId,
          queued_at: new Date().toISOString(),
        },
      });
      if (enqErr) {
        await supabaseAdmin.from("email_send_log").insert({
          message_id: messageId,
          template_name: "inbox-placement-test",
          recipient_email: recipient,
          status: "failed",
          error_message: "Failed to enqueue placement test email",
        });
      }
    }

    return { id: row.id as string, token };
  });

type GmailPlacement =
  | "primary"
  | "promotions"
  | "social"
  | "updates"
  | "forums"
  | "spam"
  | "trash"
  | "archive"
  | "missing";

function classifyGmailLabels(labelIds: string[]): GmailPlacement {
  const set = new Set(labelIds);
  if (set.has("SPAM")) return "spam";
  if (set.has("TRASH")) return "trash";
  if (set.has("INBOX")) {
    if (set.has("CATEGORY_PROMOTIONS")) return "promotions";
    if (set.has("CATEGORY_SOCIAL")) return "social";
    if (set.has("CATEGORY_UPDATES")) return "updates";
    if (set.has("CATEGORY_FORUMS")) return "forums";
    return "primary";
  }
  return "archive";
}

async function classifyGmail(token: string): Promise<{ placement: GmailPlacement; messageId: string | null }> {
  const headers = gmailHeaders();
  const listRes = await fetch(
    `${GMAIL_GW}/users/me/messages?q=${encodeURIComponent(`subject:${token} newer_than:1d`)}&maxResults=5`,
    { headers },
  );
  if (!listRes.ok) throw new Error(`Gmail search failed (${listRes.status})`);
  const list = (await listRes.json()) as { messages?: { id: string }[] };
  const first = list.messages?.[0];
  if (!first) return { placement: "missing", messageId: null };

  const msgRes = await fetch(
    `${GMAIL_GW}/users/me/messages/${first.id}?format=metadata&metadataHeaders=Subject`,
    { headers },
  );
  if (!msgRes.ok) throw new Error(`Gmail message read failed (${msgRes.status})`);
  const msg = (await msgRes.json()) as { labelIds?: string[] };
  return { placement: classifyGmailLabels(msg.labelIds ?? []), messageId: first.id };
}

type OutlookPlacement = "focused" | "other" | "junk" | "archive" | "missing";

async function searchOutlookFolder(folder: string, token: string, headers: Record<string, string>) {
  const url = `${OUTLOOK_GW}/me/mailFolders/${folder}/messages?%24search=%22${encodeURIComponent(token)}%22&%24top=3&%24select=id,subject,inferenceClassification`;
  const res = await fetch(url, { headers });
  if (!res.ok) return [] as { id: string; inferenceClassification?: string }[];
  const json = (await res.json()) as { value?: { id: string; inferenceClassification?: string }[] };
  return json.value ?? [];
}

async function classifyOutlook(token: string): Promise<{ placement: OutlookPlacement; messageId: string | null }> {
  const headers = outlookHeaders();
  const junk = await searchOutlookFolder("junkemail", token, headers);
  if (junk[0]) return { placement: "junk", messageId: junk[0].id };
  const inbox = await searchOutlookFolder("inbox", token, headers);
  if (inbox[0]) {
    return {
      placement: inbox[0].inferenceClassification === "other" ? "other" : "focused",
      messageId: inbox[0].id,
    };
  }
  const archive = await searchOutlookFolder("archive", token, headers);
  if (archive[0]) return { placement: "archive", messageId: archive[0].id };
  return { placement: "missing", messageId: null };
}

const classifySchema = z.object({ id: z.string().uuid() });

/** Re-read both seed inboxes and record where the tagged email landed. */
export const classifyPlacementTest = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => classifySchema.parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);

    const { data: test, error } = await supabaseAdmin
      .from("inbox_placement_tests")
      .select("id, token, gmail_address, outlook_address")
      .eq("id", data.id)
      .maybeSingle();
    if (error || !test) throw new Error("Test not found.");

    const token = test.token as string;
    const patch: {
      status: string;
      gmail_placement?: string;
      gmail_message_id?: string | null;
      gmail_checked_at?: string;
      outlook_placement?: string;
      outlook_message_id?: string | null;
      outlook_checked_at?: string;
      error?: string | null;
    } = { status: "classifying" };
    const errors: string[] = [];

    if (test.gmail_address) {
      try {
        const g = await classifyGmail(token);
        patch.gmail_placement = g.placement;
        patch.gmail_message_id = g.messageId;
        patch.gmail_checked_at = new Date().toISOString();
      } catch (e) {
        errors.push(`Gmail: ${(e as Error).message}`);
      }
    }

    if (test.outlook_address) {
      try {
        const o = await classifyOutlook(token);
        patch.outlook_placement = o.placement;
        patch.outlook_message_id = o.messageId;
        patch.outlook_checked_at = new Date().toISOString();
      } catch (e) {
        errors.push(`Outlook: ${(e as Error).message}`);
      }
    }

    patch.status = errors.length ? "failed" : "completed";
    patch.error = errors.length ? errors.join(" · ") : null;

    const { error: upErr } = await supabaseAdmin
      .from("inbox_placement_tests")
      .update(patch)
      .eq("id", data.id);
    if (upErr) throw new Error(upErr.message);

    return { ok: errors.length === 0, error: patch.error as string | null };
  });

const listSchema = z.object({ limit: z.number().int().min(1).max(100).default(25) });

/** List recent placement tests with their latest results. */
export const listPlacementTests = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => listSchema.parse(input ?? {}))
  .handler(async ({ data, context }) => {
    const { userId } = context as { userId: string };
    await assertEmailStaff(userId);
    const { data: rows, error } = await supabaseAdmin
      .from("inbox_placement_tests")
      .select(
        "id, token, subject, status, gmail_address, outlook_address, gmail_placement, outlook_placement, gmail_checked_at, outlook_checked_at, error, created_at",
      )
      .order("created_at", { ascending: false })
      .limit(data.limit);
    if (error) throw new Error(error.message);
    return { tests: rows ?? [] };
  });
