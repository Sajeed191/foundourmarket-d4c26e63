// Server-only: renders FoundOurMarket™ return & refund emails and enqueues them.
// Never import from client code (uses the service-role admin client).
import { createHash } from 'node:crypto'
import { render } from '@react-email/components'
import * as React from 'react'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import { buildUnsubscribeLinks } from '@/lib/unsubscribe.server'

const FROM_DOMAIN = 'foundourmarket.com'
const SENDER_DOMAIN = 'ou.foundourmarket.com'

export type ReturnEmailEvent =
  | 'return-requested'
  | 'return-approved'
  | 'return-rejected'
  | 'refund-initiated'
  | 'refund-completed'

// Map customer-facing return events → registered template names.
const TEMPLATE_FOR: Record<ReturnEmailEvent, string> = {
  'return-requested': 'return-requested',
  'return-approved': 'return-approved',
  'return-rejected': 'return-rejected',
  'refund-initiated': 'refund-initiated',
  'refund-completed': 'refund-processed',
}

interface ReturnEmailExtra {
  refundAmount?: number
  refundCurrency?: string
  reason?: string | null
  productName?: string | null
}

function uuidFrom(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-')
}

function money(amount: number | null | undefined, currency: string | null | undefined): string | undefined {
  if (amount == null) return undefined
  const cur = currency ?? 'INR'
  const symbol = cur === 'INR' ? '₹' : cur === 'USD' ? '$' : ''
  try {
    return `${symbol}${Number(amount).toLocaleString('en-IN', { maximumFractionDigits: 2 })}`
  } catch {
    return `${symbol}${amount}`
  }
}

/**
 * Render + enqueue a branded return/refund email, keyed off an order.
 * Idempotent: a given (orderId, event, dedupeKey) only ever enqueues once.
 */
export async function enqueueReturnEmail(
  orderId: string,
  event: ReturnEmailEvent,
  extra: ReturnEmailExtra = {},
  dedupeKey?: string,
): Promise<{ ok: boolean; reason?: string }> {
  const messageId = uuidFrom(`${orderId}:${event}:${dedupeKey ?? ''}`)

  // De-duplicate: skip if we've already logged this exact email.
  const { data: prior } = await supabaseAdmin
    .from('email_send_log')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle()
  if (prior) return { ok: true, reason: 'already_sent' }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, user_id, contact_email, total, currency, shipping_address')
    .eq('id', orderId)
    .maybeSingle()
  if (error || !order) return { ok: false, reason: 'order_not_found' }

  const recipient = (order.contact_email as string | null)?.trim().toLowerCase()
  if (!recipient) return { ok: false, reason: 'no_recipient' }

  // Respect the suppression list.
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', recipient)
    .maybeSingle()
  if (suppressed) return { ok: false, reason: 'email_suppressed' }

  const entry = TEMPLATES[TEMPLATE_FOR[event]]
  if (!entry) return { ok: false, reason: 'template_missing' }

  const addr = (order.shipping_address ?? {}) as Record<string, any>
  const unsub = await buildUnsubscribeLinks(recipient)

  const props: Record<string, any> = {
    orderNumber: String(order.id).slice(0, 8).toUpperCase(),
    customerName: typeof addr.full_name === 'string' ? addr.full_name.split(' ')[0] : undefined,
    productName: extra.productName ?? undefined,
    reason: extra.reason ?? undefined,
    amount: money(order.total as number, order.currency as string),
    refundAmount:
      extra.refundAmount != null
        ? money(extra.refundAmount, extra.refundCurrency ?? (order.currency as string))
        : undefined,
    unsubscribeUrl: unsub?.pageUrl,
  }

  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: event,
    recipient_email: recipient,
    status: 'pending',
  })

  let html: string
  let text: string
  let subject: string
  try {
    const element = React.createElement(entry.component, props as any)
    html = await render(element)
    text = await render(element, { plainText: true })
    subject = typeof entry.subject === 'function' ? entry.subject(props as any) : entry.subject
  } catch (err: any) {
    const msg = `render_failed: ${String(err?.message ?? err)}`.slice(0, 500)
    console.error('[return-emails] render failed', { event, orderId, error: msg })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: event,
      recipient_email: recipient,
      status: 'failed',
      error_message: msg,
    })
    const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
    await notifyAdminsEmailFailure({ template: event, recipient, reason: msg, context: 'return email', refId: orderId })
    return { ok: false, reason: 'render_failed' }
  }

  try {
    const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: recipient,
        from: await enforceSender(PRIMARY_FROM, { recipient, template: event, context: 'return email' }),
        reply_to: `support@${FROM_DOMAIN}`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: event,
        idempotency_key: messageId,
        queued_at: new Date().toISOString(),
        ...(unsub
          ? {
              headers: {
                'List-Unsubscribe': `<${unsub.oneClickUrl}>, <${unsub.pageUrl}>`,
                'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click',
              },
            }
          : {}),
      },
    })
    if (enqueueError) {
      const msg = `enqueue_failed: ${String(enqueueError.message ?? enqueueError)}`.slice(0, 500)
      console.error('[return-emails] enqueue failed', { event, orderId, error: msg })
      await supabaseAdmin.from('email_send_log').insert({
        message_id: messageId,
        template_name: event,
        recipient_email: recipient,
        status: 'failed',
        error_message: msg,
      })
      const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
      await notifyAdminsEmailFailure({ template: event, recipient, reason: msg, context: 'return email', refId: orderId })
      return { ok: false, reason: 'enqueue_failed' }
    }
  } catch (err: any) {
    const msg = `enqueue_threw: ${String(err?.message ?? err)}`.slice(0, 500)
    console.error('[return-emails] enqueue threw', { event, orderId, error: msg })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: event,
      recipient_email: recipient,
      status: 'failed',
      error_message: msg,
    })
    const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
    await notifyAdminsEmailFailure({ template: event, recipient, reason: msg, context: 'return email', refId: orderId })
    return { ok: false, reason: 'enqueue_threw' }
  }

  // Customer-360 timeline visibility: mirror the send into `email_logs`.
  try {
    const userId = (order.user_id as string | null) ?? null
    if (userId) {
      await supabaseAdmin.from('email_logs').insert({
        user_id: userId,
        recipient,
        template: event,
        subject,
        status: 'sent',
        provider: 'lovable-queue',
        provider_message_id: messageId,
        payload: { event, orderId } as never,
      })
    }
  } catch (err) {
    console.error('[return-emails] email_logs insert failed', { event, orderId, err: String(err) })
  }

  return { ok: true }
}
