// Server-only: renders FoundOurMarket™ order emails and enqueues them.
// Never import from client code (uses the service-role admin client).
import { createHash } from 'node:crypto'
import { render } from '@react-email/components'
import * as React from 'react'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import type { OrderEmailProps } from '@/lib/email-templates/order-emails'
import { buildUnsubscribeLinks } from '@/lib/unsubscribe.server'

const SITE_NAME = 'FoundOurMarket'
const SENDER_DOMAIN = 'ou.foundourmarket.com'
const FROM_DOMAIN = 'foundourmarket.com'

export type OrderEmailEvent =
  | 'order-confirmed'
  | 'payment-verified'
  | 'order-shipped'
  | 'out-for-delivery'
  | 'order-delivered'
  | 'refund-processed'
  | 'demo-order-received'

interface OrderEmailExtra {
  refundAmount?: number
  refundCurrency?: string
}

// All order lifecycle email events, in delivery order.
export const ORDER_EMAIL_EVENTS: OrderEmailEvent[] = [
  'order-confirmed',
  'payment-verified',
  'order-shipped',
  'out-for-delivery',
  'order-delivered',
  'refund-processed',
]

// Deterministic UUID derived from order + event so each email sends only once.
export function orderEmailMessageId(orderId: string, event: string): string {
  const h = createHash('sha256').update(`${orderId}:${event}`).digest('hex')
  return [
    h.slice(0, 8),
    h.slice(8, 12),
    h.slice(12, 16),
    h.slice(16, 20),
    h.slice(20, 32),
  ].join('-')
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
 * Render + enqueue a branded order email for a real backend event.
 * Idempotent: a given (orderId, event) pair will only ever enqueue once.
 */
export async function enqueueOrderEmail(
  orderId: string,
  event: OrderEmailEvent,
  extra: OrderEmailExtra = {},
): Promise<{ ok: boolean; reason?: string }> {
  const messageId = orderEmailMessageId(orderId, event)

  // De-duplicate: skip if we've already logged this exact email.
  const { data: prior } = await supabaseAdmin
    .from('email_send_log')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle()
  if (prior) return { ok: true, reason: 'already_sent' }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, user_id, contact_email, total, currency, tracking_number, carrier, shipping_address')
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

  const entry = TEMPLATES[event]
  if (!entry) return { ok: false, reason: 'template_missing' }

  const addr = (order.shipping_address ?? {}) as Record<string, any>
  // Issue/reuse a one-click unsubscribe token for the footer link + headers.
  const unsub = await buildUnsubscribeLinks(recipient)

  const props: OrderEmailProps = {
    orderNumber: String(order.id).slice(0, 8).toUpperCase(),
    customerName: typeof addr.full_name === 'string' ? addr.full_name.split(' ')[0] : undefined,
    amount: money(order.total as number, order.currency as string),
    trackingNumber: (order.tracking_number as string | null) ?? undefined,
    carrier: (order.carrier as string | null) ?? undefined,
    unsubscribeUrl: unsub?.pageUrl,
    refundAmount:
      event === 'refund-processed'
        ? money(extra.refundAmount ?? (order.total as number), extra.refundCurrency ?? (order.currency as string))
        : undefined,
  }

  // Audit: log the attempt BEFORE rendering so we never lose visibility,
  // even if the React-Email render path throws.
  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: event,
    recipient_email: recipient,
    status: 'pending',
  })

  // --- Render (resilient): a render failure must be logged, never thrown. ---
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
    console.error('[order-emails] render failed', { event, orderId, error: msg, stack: err?.stack })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: event,
      recipient_email: recipient,
      status: 'failed',
      error_message: msg,
    })
    const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
    await notifyAdminsEmailFailure({ template: event, recipient, reason: msg, context: 'order email', refId: orderId })
    return { ok: false, reason: 'render_failed' }
  }

  // --- Enqueue (resilient): an enqueue failure must be logged, never thrown. ---
  try {
    const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: recipient,
        from: await enforceSender(PRIMARY_FROM, { recipient, template: event, context: 'order email' }),
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
      console.error('[order-emails] enqueue failed', { event, orderId, error: msg })
      await supabaseAdmin.from('email_send_log').insert({
        message_id: messageId,
        template_name: event,
        recipient_email: recipient,
        status: 'failed',
        error_message: msg,
      })
      const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
      await notifyAdminsEmailFailure({ template: event, recipient, reason: msg, context: 'order email', refId: orderId })
      return { ok: false, reason: 'enqueue_failed' }
    }
  } catch (err: any) {
    const msg = `enqueue_threw: ${String(err?.message ?? err)}`.slice(0, 500)
    console.error('[order-emails] enqueue threw', { event, orderId, error: msg, stack: err?.stack })
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: event,
      recipient_email: recipient,
      status: 'failed',
      error_message: msg,
    })
    const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
    await notifyAdminsEmailFailure({ template: event, recipient, reason: msg, context: 'order email', refId: orderId })
    return { ok: false, reason: 'enqueue_threw' }
  }

  // Customer-360 timeline visibility: mirror the send into `email_logs` (read by
  // the customer timeline). Resolve user_id from the order. Never throw.
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
    console.error('[order-emails] email_logs insert failed', { event, orderId, err: String(err) })
  }

  return { ok: true }

}
