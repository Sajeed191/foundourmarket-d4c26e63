// Server-only: renders + enqueues the newsletter double-opt-in verification email.
import { render } from '@react-email/components'
import * as React from 'react'
import { supabaseAdmin } from '@/integrations/supabase/client.server'
import { PRIMARY_FROM } from '@/lib/email-sender-policy'
import { enforceSender } from '@/lib/email-sender-policy.server'
import { newsletterVerifyTemplate } from '@/lib/email-templates/newsletter-verify'

const SENDER_DOMAIN = 'ou.foundourmarket.com'
const FROM_DOMAIN = 'foundourmarket.com'
const PUBLIC_BASE = 'https://foundourmarket.com'

export async function enqueueNewsletterVerifyEmail(
  recipient: string,
  token: string,
  expiresInHours: number,
): Promise<{ ok: boolean; reason?: string }> {
  const email = recipient.trim().toLowerCase()
  if (!email) return { ok: false, reason: 'no_recipient' }

  // Respect suppression list — never re-send to bounced/complained addresses.
  const { data: suppressed } = await supabaseAdmin
    .from('suppressed_emails')
    .select('id')
    .eq('email', email)
    .maybeSingle()
  if (suppressed) return { ok: false, reason: 'email_suppressed' }

  const verifyUrl = `${PUBLIC_BASE}/api/public/newsletter/verify?token=${encodeURIComponent(token)}`
  const messageId = `newsletter-verify:${token.slice(0, 32)}`

  let html: string
  let text: string
  let subject: string
  try {
    const el = React.createElement(newsletterVerifyTemplate.component, {
      verifyUrl,
      expiresInHours,
    })
    html = await render(el)
    text = await render(el, { plainText: true })
    subject = newsletterVerifyTemplate.subject as string
  } catch (err: any) {
    console.error('[newsletter-verify] render failed', err)
    return { ok: false, reason: 'render_failed' }
  }

  try {
    const { error } = await supabaseAdmin.rpc('enqueue_email', {
      queue_name: 'transactional_emails',
      payload: {
        message_id: messageId,
        to: email,
        from: await enforceSender(PRIMARY_FROM, {
          recipient: email,
          template: 'newsletter-verify',
          context: 'newsletter double opt-in',
        }),
        reply_to: `support@${FROM_DOMAIN}`,
        sender_domain: SENDER_DOMAIN,
        subject,
        html,
        text,
        purpose: 'transactional',
        label: 'newsletter-verify',
        idempotency_key: messageId,
        queued_at: new Date().toISOString(),
      },
    })
    if (error) {
      console.error('[newsletter-verify] enqueue failed', error)
      return { ok: false, reason: 'enqueue_failed' }
    }
  } catch (err: any) {
    console.error('[newsletter-verify] enqueue threw', err)
    return { ok: false, reason: 'enqueue_threw' }
  }

  return { ok: true }
}
