// Server-only: renders FoundOurMarket™ account-lifecycle emails, enqueues them,
// records an email-history row, and creates an in-app customer notification.
// Never import from client code (uses the service-role admin client).
import { createHash } from 'node:crypto'
import { render } from '@react-email/components'
import * as React from 'react'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { TEMPLATES } from '@/lib/email-templates/registry'
import type { LifecycleEmailProps } from '@/lib/email-templates/lifecycle-emails'
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'

const SITE_NAME = 'FoundOurMarket'
const SENDER_DOMAIN = 'ou.foundourmarket.com'
const FROM_DOMAIN = 'foundourmarket.com'
const FROM = PRIMARY_FROM

export type LifecycleEvent =
  | 'account-suspended'
  | 'account-banned'
  | 'ordering-blocked'
  | 'reviews-disabled'
  | 'account-deleted'
  | 'account-restored'
  | 'account-reactivated'
  | 'ban-removed'
  | 'ordering-unblocked'
  | 'reviews-restored'
  | 'password-reset'

const NOTIFY_COPY: Record<LifecycleEvent, { title: string; body: (reason?: string) => string; link: string }> = {
  'account-suspended': {
    title: 'Your account has been suspended',
    body: (r) => `Your account is temporarily suspended and ordering is paused.${r ? ` Reason: ${r}` : ''}`,
    link: '/account',
  },
  'account-banned': {
    title: 'Your account has been banned',
    body: (r) => `Your account has been banned and access revoked.${r ? ` Reason: ${r}` : ''}`,
    link: '/account',
  },
  'ordering-blocked': {
    title: 'Ordering has been disabled',
    body: (r) => `Ordering is temporarily disabled on your account.${r ? ` Reason: ${r}` : ''}`,
    link: '/account',
  },
  'reviews-disabled': {
    title: 'Reviewing has been restricted',
    body: (r) => `Posting reviews has been restricted on your account.${r ? ` Reason: ${r}` : ''}`,
    link: '/account',
  },
  'account-deleted': {
    title: 'Your account has been closed',
    body: (r) => `Your account has been closed.${r ? ` Reason: ${r}` : ''}`,
    link: '/account',
  },
  'account-restored': {
    title: 'Your account has been restored',
    body: (r) => `Good news — your account has been fully restored. You can sign in and shop as normal again.${r ? ` Note: ${r}` : ''}`,
    link: '/account',
  },
  'account-reactivated': {
    title: 'Your account has been reactivated',
    body: (r) => `Your account is active again — you can sign in and shop as normal.${r ? ` Note: ${r}` : ''}`,
    link: '/account',
  },
  'ban-removed': {
    title: 'The ban on your account has been lifted',
    body: (r) => `Good news — the ban on your account has been removed and access restored.${r ? ` Note: ${r}` : ''}`,
    link: '/account',
  },
  'ordering-unblocked': {
    title: 'Ordering has been re-enabled',
    body: (r) => `Ordering has been re-enabled on your account. You can place new orders again.${r ? ` Note: ${r}` : ''}`,
    link: '/account',
  },
  'reviews-restored': {
    title: 'Reviewing has been restored',
    body: (r) => `You can post product reviews again on your account.${r ? ` Note: ${r}` : ''}`,
    link: '/account',
  },
  'password-reset': {
    title: 'Password reset requested',
    body: () => 'A password reset email has been sent to your inbox.',
    link: '/account',
  },
}

function deterministicId(seed: string): string {
  const h = createHash('sha256').update(seed).digest('hex')
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20, 32)].join('-')
}

function fmtTimestamp(iso: string): string {
  try {
    return new Date(iso).toLocaleString('en-US', {
      dateStyle: 'long',
      timeStyle: 'short',
    })
  } catch {
    return iso
  }
}

/**
 * Fire a complete lifecycle event for a customer:
 *  1) render + enqueue a branded email (when the event has its own template)
 *  2) record an email-history row in `email_logs`
 *  3) create an in-app notification row
 * Resilient: never throws — every failure is logged so the action path survives.
 */
export async function fireLifecycleEvent(opts: {
  customerId: string
  event: LifecycleEvent
  reason?: string | null
  /** Skip enqueuing the email (e.g. password-reset already sent via Auth). */
  emailAlreadySent?: boolean
}): Promise<{ email: boolean; notification: boolean }> {
  const { customerId, event } = opts
  const reason = opts.reason?.trim() || undefined
  const nowIso = new Date().toISOString()
  const result = { email: false, notification: false }

  // Resolve the customer's email + name.
  let email: string | null = null
  let firstName: string | undefined
  try {
    const { data: u } = await supabaseAdmin.auth.admin.getUserById(customerId)
    email = u?.user?.email?.trim().toLowerCase() ?? null
    const { data: prof } = await supabaseAdmin
      .from('profiles')
      .select('full_name')
      .eq('id', customerId)
      .maybeSingle()
    const fn = (prof?.full_name as string | null)?.trim()
    if (fn) firstName = fn.split(' ')[0]
  } catch (err) {
    console.error('[lifecycle] failed to resolve customer', { customerId, event, err: String(err) })
  }

  // ---- In-app notification (always) ----
  try {
    const copy = NOTIFY_COPY[event]
    const { error } = await supabaseAdmin.from('notifications').insert({
      user_id: customerId,
      type: 'account_status',
      title: copy.title,
      body: copy.body(reason),
      link: copy.link,
      priority: event === 'account-banned' || event === 'account-deleted' ? 'high' : 'normal',
      data: { event, reason: reason ?? null, at: nowIso } as never,
    })
    if (error) throw new Error(error.message)
    result.notification = true
  } catch (err) {
    console.error('[lifecycle] notification insert failed', { customerId, event, err: String(err) })
  }

  // ---- Branded email (skip when there's no dedicated template / already sent) ----
  const entry = TEMPLATES[event]
  if (entry && email && !opts.emailAlreadySent) {
    const messageId = deterministicId(`lifecycle:${customerId}:${event}:${nowIso}`)
    const props: LifecycleEmailProps = { name: firstName, reason, timestamp: fmtTimestamp(nowIso) }
    const subject = typeof entry.subject === 'function' ? entry.subject(props as never) : entry.subject

    // Email-history row first (so it's visible even if render/enqueue fails).
    try {
      await supabaseAdmin.from('email_logs').insert({
        user_id: customerId,
        recipient: email,
        template: event,
        subject,
        status: 'pending',
        provider: 'lovable-queue',
        payload: { event, reason: reason ?? null } as never,
      })
    } catch (err) {
      console.error('[lifecycle] email_logs insert failed', { customerId, event, err: String(err) })
    }

    try {
      const element = React.createElement(entry.component, props as never)
      const html = await render(element)
      const text = await render(element, { plainText: true })

      // Suppression check.
      const { data: suppressed } = await supabaseAdmin
        .from('suppressed_emails')
        .select('id')
        .eq('email', email)
        .maybeSingle()

      if (suppressed) {
        await supabaseAdmin.from('email_logs').update({ status: 'suppressed' }).eq('user_id', customerId).eq('template', event).eq('status', 'pending')
      } else {
        const { error: enqErr } = await supabaseAdmin.rpc('enqueue_email', {
          queue_name: 'transactional_emails',
          payload: {
            message_id: messageId,
            to: email,
            from: await enforceSender(FROM, { recipient: email, template: event, context: 'lifecycle email' }),
            reply_to: `support@${FROM_DOMAIN}`,
            sender_domain: SENDER_DOMAIN,
            subject,
            html,
            text,
            purpose: 'transactional',
            label: event,
            idempotency_key: messageId,
            queued_at: nowIso,
          },
        })
        if (enqErr) throw new Error(enqErr.message)
        await supabaseAdmin.from('email_logs').update({ status: 'sent', provider_message_id: messageId }).eq('user_id', customerId).eq('template', event).eq('status', 'pending')
        result.email = true
      }
    } catch (err) {
      const msg = String((err as Error)?.message ?? err).slice(0, 500)
      console.error('[lifecycle] email enqueue failed', { customerId, event, err: msg })
      await supabaseAdmin.from('email_logs').update({ status: 'failed', error: msg }).eq('user_id', customerId).eq('template', event).eq('status', 'pending')
      const { notifyAdminsEmailFailure } = await import('@/lib/email-alerts.server')
      await notifyAdminsEmailFailure({ template: event, recipient: email, reason: msg, context: 'account lifecycle', refId: customerId })
    }
  }

  return result
}
