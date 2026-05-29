// Server-only: renders FoundOurMarket™ order emails and enqueues them.
// Never import from client code (uses the service-role admin client).
import { createHash } from 'node:crypto'
import { render } from '@react-email/components'
import * as React from 'react'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import type { OrderEmailProps } from '@/lib/email-templates/order-emails'
import { buildUnsubscribeLinks } from '@/lib/unsubscribe.server'

const SITE_NAME = 'FoundOurMarket'
const SENDER_DOMAIN = 'notify.foundourmarket.com'
const FROM_DOMAIN = 'foundourmarket.com'

export type OrderEmailEvent =
  | 'order-confirmed'
  | 'payment-verified'
  | 'order-shipped'
  | 'out-for-delivery'
  | 'order-delivered'
  | 'refund-processed'

interface OrderEmailExtra {
  refundAmount?: number
  refundCurrency?: string
}

// Deterministic UUID derived from order + event so each email sends only once.
function deterministicId(orderId: string, event: string): string {
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
  const messageId = deterministicId(orderId, event)

  // De-duplicate: skip if we've already logged this exact email.
  const { data: prior } = await supabaseAdmin
    .from('email_send_log')
    .select('id')
    .eq('message_id', messageId)
    .maybeSingle()
  if (prior) return { ok: true, reason: 'already_sent' }

  const { data: order, error } = await supabaseAdmin
    .from('orders')
    .select('id, contact_email, total, currency, tracking_number, carrier, shipping_address')
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

  const element = React.createElement(entry.component, props as any)
  const html = await render(element)
  const text = await render(element, { plainText: true })
  const subject = typeof entry.subject === 'function' ? entry.subject(props as any) : entry.subject

  // Audit: log pending before enqueue.
  await supabaseAdmin.from('email_send_log').insert({
    message_id: messageId,
    template_name: event,
    recipient_email: recipient,
    status: 'pending',
  })

  const { error: enqueueError } = await supabaseAdmin.rpc('enqueue_email', {
    queue_name: 'transactional_emails',
    payload: {
      message_id: messageId,
      to: recipient,
      from: `${SITE_NAME} <orders@${FROM_DOMAIN}>`,
      sender_domain: SENDER_DOMAIN,
      subject,
      html,
      text,
      purpose: 'transactional',
      label: event,
      idempotency_key: messageId,
      queued_at: new Date().toISOString(),
    },
  })

  if (enqueueError) {
    await supabaseAdmin.from('email_send_log').insert({
      message_id: messageId,
      template_name: event,
      recipient_email: recipient,
      status: 'failed',
      error_message: 'Failed to enqueue order email',
    })
    return { ok: false, reason: 'enqueue_failed' }
  }

  return { ok: true }
}
