// FoundOurMarket™ — Governed Secondary (Gmail) Email Fallback (server-only)
//
// Used ONLY when the primary delivery provider has exhausted its retries.
// Sends through the approved backup identity foundourmarket@gmail.com via the
// hosted connector gateway. Reply-To is ALWAYS the official support mailbox so
// every customer reply returns to support@foundourmarket.com.
//
// Import only from server code (queue processor / *.server.ts handlers).
import {
  FALLBACK_SENDER,
  REPLY_TO_ADDRESS,
  formatSender,
} from '@/lib/email-sender-policy'

const GATEWAY_URL = 'https://connector-gateway.lovable.dev'

export interface FallbackSendInput {
  to: string
  subject: string
  html?: string | null
  text?: string | null
}

export interface FallbackSendResult {
  ok: boolean
  providerMessageId?: string
  error?: string
}

/** RFC 2047 encode a header value so non-ASCII display names survive transit. */
function encodeHeader(value: string): string {
  // eslint-disable-next-line no-control-regex
  if (/^[\x00-\x7F]*$/.test(value)) return value
  const b64 = Buffer.from(value, 'utf-8').toString('base64')
  return `=?UTF-8?B?${b64}?=`
}

/** base64url encode (Gmail raw message format). */
function base64Url(input: string): string {
  return Buffer.from(input, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
}

function buildMime(input: FallbackSendInput): string {
  const from = formatSender(FALLBACK_SENDER)
  const replyTo = REPLY_TO_ADDRESS // governance: always the human support mailbox
  const boundary = `fom_${crypto.randomUUID().replace(/-/g, '')}`
  const headers = [
    `From: ${encodeHeader(FALLBACK_SENDER.name)} <${FALLBACK_SENDER.email}>`,
    `To: ${input.to}`,
    `Reply-To: ${replyTo}`,
    `Subject: ${encodeHeader(input.subject)}`,
    'MIME-Version: 1.0',
  ]

  const text = input.text || 'This message requires an HTML-capable email client.'
  const html = input.html || `<pre>${text}</pre>`

  const body = [
    `Content-Type: multipart/alternative; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    text,
    '',
    `--${boundary}`,
    'Content-Type: text/html; charset="UTF-8"',
    'Content-Transfer-Encoding: 8bit',
    '',
    html,
    '',
    `--${boundary}--`,
    '',
  ].join('\r\n')

  // 'from' silences the unused-var lint while documenting the visible sender.
  void from
  return `${headers.join('\r\n')}\r\n${body}`
}

/**
 * Attempt a governed fallback send via the approved Gmail backup identity.
 * Never throws — returns a structured result so the caller can audit the
 * outcome (primary failure -> fallback attempt -> success/failure).
 */
export async function sendViaFallback(input: FallbackSendInput): Promise<FallbackSendResult> {
  const lovableApiKey = process.env.LOVABLE_API_KEY
  const gmailApiKey = process.env.GOOGLE_MAIL_API_KEY

  if (!lovableApiKey || !gmailApiKey) {
    return { ok: false, error: 'Fallback sender not configured (missing connector credentials)' }
  }

  try {
    const raw = base64Url(buildMime(input))
    const res = await fetch(
      `${GATEWAY_URL}/google_mail/gmail/v1/users/me/messages/send`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${lovableApiKey}`,
          'X-Connection-Api-Key': gmailApiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ raw }),
      },
    )

    if (!res.ok) {
      const bodyText = await res.text().catch(() => '')
      return {
        ok: false,
        error: `Gmail gateway error ${res.status}: ${bodyText.slice(0, 500)}`,
      }
    }

    const data = (await res.json().catch(() => ({}))) as { id?: string }
    return { ok: true, providerMessageId: data.id }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}
