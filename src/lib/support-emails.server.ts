// Server-only: renders FoundOurMarket™ support emails and enqueues them.
// Never import from client code (uses the service-role admin client).
import { createHash, randomUUID } from 'node:crypto'
import { render } from '@react-email/components'
import * as React from 'react'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import type {
  SupportCustomerEmailProps,
  SupportAdminEmailProps,
} from '@/lib/email-templates/support-emails'
import { buildUnsubscribeLinks } from '@/lib/unsubscribe.server'

const SITE_NAME = 'FoundOurMarket'
const SENDER_DOMAIN = 'ou.foundourmarket.com'
const FROM_DOMAIN = 'foundourmarket.com'
// Single transactional inbox for staff alerts (avoids fan-out to a list).
const SUPPORT_INBOX = `support@${SENDER_DOMAIN}`
const PUBLIC_BASE = `https://${FROM_DOMAIN}`

export type SupportEvent =
  | 'created'
  | 'customer_reply'
  | 'staff_reply'
  | 'resolved'
  | 'closed'
  | 'escalated'

function deterministicId(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-')
}

async function enqueue(opts: {
  messageId: string
  templateName: string
  recipient: string
  fromUser: string
  props: Record<string, unknown>
  unsub?: { oneClickUrl: string; pageUrl: string } | null
  /** When set, mirror the send into email_logs for Customer-360 timeline visibility. */
  timelineUserId?: string | null
  /** Subject shown on the timeline row (defaults to the rendered subject). */
}): Promise<boolean> {
  const entry = TEMPLATES[opts.templateName]
  if (!entry) return false

  // Suppression check.
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', opts.recipient)
    .maybeSingle()
  if (suppressed) return false

  // Audit: log the attempt BEFORE rendering so we never lose visibility,
  // even when the React-Email render path throws.
  await supabaseAdmin.from('email_send_log').insert({
    message_id: opts.messageId,
    template_name: opts.templateName,
    recipient_email: opts.recipient,
    status: 'pending',
  })

  // --- Render (resilient): a render failure must be logged, never thrown. ---
  let html: string
  let text: string
  let subject: string
  try {
    const element = React.createElement(entry.component, opts.props as any)
    html = await render(element)
    text = await render(element, { plainText: true })
    subject = typeof entry.subject === 'function' ? entry.subject(opts.props as any) : entry.subject
  } catch (err: any) {
    const msg = `render_failed: ${String(err?.message ?? err)}`.slice(0, 500)
    console.error('[support-emails] render failed', {
      template: opts.templateName,
      recipient: opts.recipient,
      error: msg,
      stack: err?.stack,
    })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: opts.messageId,
      template_name: opts.templateName,
      recipient_email: opts.recipient,
      status: 'failed',
      error_message: msg,
    })
    {
      const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
      await notifyAdminsEmailFailure({ template: opts.templateName, recipient: opts.recipient, reason: msg, context: 'support email' })
    }
    return false
  }

  // --- Enqueue (resilient): an enqueue failure must be logged, never thrown. ---
  try {
    const { error } = await supabaseAdmin.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: opts.messageId,
        to: opts.recipient,
        from: await enforceSender(PRIMARY_FROM, { recipient: opts.recipient, template: opts.templateName, context: 'support email' }),
        reply_to: `support@${FROM_DOMAIN}`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: opts.templateName,
        idempotency_key: opts.messageId,
        queued_at: new Date().toISOString(),
        ...(opts.unsub
          ? {
              headers: {
                'List-Unsubscribe': `<${opts.unsub.oneClickUrl}>, <${opts.unsub.pageUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
      },
    })

    if (error) {
      const msg = `enqueue_failed: ${String(error.message ?? error)}`.slice(0, 500)
      console.error('[support-emails] enqueue failed', {
        template: opts.templateName,
        recipient: opts.recipient,
        error: msg,
      })
      await supabaseAdmin.from('email_send_log').insert({
        message_id: opts.messageId,
        template_name: opts.templateName,
        recipient_email: opts.recipient,
        status: 'failed',
        error_message: msg,
      })
      {
        const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
        await notifyAdminsEmailFailure({ template: opts.templateName, recipient: opts.recipient, reason: msg, context: 'support email' })
      }
      return false
    }
  } catch (err: any) {
    const msg = `enqueue_threw: ${String(err?.message ?? err)}`.slice(0, 500)
    console.error('[support-emails] enqueue threw', {
      template: opts.templateName,
      recipient: opts.recipient,
      error: msg,
      stack: err?.stack,
    })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: opts.messageId,
      template_name: opts.templateName,
      recipient_email: opts.recipient,
      status: 'failed',
      error_message: msg,
    })
    {
      const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
      await notifyAdminsEmailFailure({ template: opts.templateName, recipient: opts.recipient, reason: msg, context: 'support email' })
    }
    return false
  }

  // Customer-360 timeline visibility: mirror into email_logs. Never throw.
  if (opts.timelineUserId) {
    try {
      await supabaseAdmin.from('email_logs').insert({
        user_id: opts.timelineUserId,
        recipient: opts.recipient,
        template: opts.templateName,
        subject,
        status: 'sent',
        provider: 'lovable-queue',
        provider_message_id: opts.messageId,
        payload: opts.props as never,
      })
    } catch (err) {
      console.error('[support-emails] email_logs insert failed', { template: opts.templateName, err: String(err) })
    }
  }

  return true
}

/**
 * Render + enqueue branded support emails for a real ticket event.
 * Resolves recipients server-side from the ticket — callers never pass
 * arbitrary email addresses.
 */
export async function enqueueSupportEmail(
  ticketId: string,
  event: SupportEvent,
): Promise<{ ok: boolean; reason?: string }> {
  const { data: ticket, error } = await supabaseAdmin
    .from('support_tickets')
    .select('id, user_id, subject, category, status, priority')
    .eq('id', ticketId)
    .maybeSingle()
  if (error || !ticket) return { ok: false, reason: 'ticket_not_found' }

  const short = String(ticket.id).slice(0, 8)

  // Latest message preview.
  const { data: lastMsg } = await supabaseAdmin
    .from('support_messages')
    .select('body, sender_role, created_at')
    .eq('ticket_id', ticketId)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle()
  const preview = (lastMsg?.body ?? '').slice(0, 280)

  // Customer email (ticket owner).
  const { data: ownerRes } = await supabaseAdmin.auth.admin.getUserById(ticket.user_id as string)
  const customerEmail = ownerRes?.user?.email?.trim().toLowerCase() ?? null

  // ---- Customer-facing events ----
  if (['created', 'staff_reply', 'resolved', 'closed', 'escalated'].includes(event) && customerEmail) {
    const kind: SupportCustomerEmailProps['kind'] =
      event === 'created' ? 'created'
      : event === 'staff_reply' ? 'reply'
      : event === 'resolved' ? 'resolved'
      : event === 'escalated' ? 'escalated'
      : 'closed'
    const unsub = await buildUnsubscribeLinks(customerEmail)
    const props: SupportCustomerEmailProps = {
      kind,
      ticketSubject: ticket.subject as string,
      ticketShort: short,
      status: ticket.status as string,
      replyPreview: kind === 'reply' ? preview : undefined,
      ctaUrl: `${PUBLIC_BASE}/account/support`,
      unsubscribeUrl: unsub?.pageUrl,
    }
    // Per (ticket,event) for create/resolve/close/escalate; per-message for replies.
    const seed =
      event === 'staff_reply'
        ? `support:${ticketId}:staff_reply:${lastMsg?.created_at ?? randomUUID()}`
        : `support:${ticketId}:${event}`
    await enqueue({
      messageId: deterministicId(seed),
      templateName: 'support-customer-update',
      recipient: customerEmail,
      fromUser: 'support',
      props: props as Record<string, unknown>,
      unsub,
      timelineUserId: ticket.user_id as string,
    })
  }

  // ---- Admin-facing events ----
  if (event === 'created' || event === 'customer_reply') {
    const props: SupportAdminEmailProps = {
      kind: event === 'created' ? (ticket.priority === 'high' || ticket.priority === 'urgent' ? 'high' : 'new') : 'reply',
      ticketSubject: ticket.subject as string,
      ticketShort: short,
      priority: ticket.priority as string,
      category: ticket.category as string,
      customerEmail: customerEmail ?? undefined,
      replyPreview: preview || undefined,
      ctaUrl: `${PUBLIC_BASE}/admin-support`,
    }
    const seed =
      event === 'created'
        ? `support-admin:${ticketId}:new`
        : `support-admin:${ticketId}:reply:${lastMsg?.created_at ?? randomUUID()}`
    await enqueue({
      messageId: deterministicId(seed),
      templateName: 'support-admin-alert',
      recipient: SUPPORT_INBOX,
      fromUser: 'noreply',
      props: props as Record<string, unknown>,
    })
  }

  return { ok: true }
}
