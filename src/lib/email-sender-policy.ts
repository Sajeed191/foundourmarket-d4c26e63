// FoundOurMarket™ — Email Sender Governance Policy (client-safe)
//
// Single source of truth for *who* customer-facing emails are allowed to come
// from. Importable from both server (enqueue paths, Gmail path) and client
// (read-only admin composer field). No server-only deps live here.

export interface SenderIdentity {
  email: string
  name: string
}

/** Default sender for ALL customer-facing communications. */
export const PRIMARY_SENDER: SenderIdentity = {
  email: 'support@foundourmarket.com',
  name: 'FoundOurMarket Support',
}

/** Automatic fallback — used ONLY on primary provider outage / delivery failure. */
export const FALLBACK_SENDER: SenderIdentity = {
  email: 'foundourmarket@gmail.com',
  name: 'FoundOurMarket Backup Mail',
}

/** Every sender identity the platform is permitted to send customer mail from. */
export const APPROVED_SENDERS: SenderIdentity[] = [PRIMARY_SENDER, FALLBACK_SENDER]

const APPROVED_EMAILS = new Set(APPROVED_SENDERS.map((s) => s.email.toLowerCase()))

/** Format an identity as an RFC 5322 `Name <email>` string. */
export function formatSender(s: SenderIdentity): string {
  return `${s.name} <${s.email}>`
}

/** Canonical `From` strings. */
export const PRIMARY_FROM = formatSender(PRIMARY_SENDER)
export const FALLBACK_FROM = formatSender(FALLBACK_SENDER)

/** Extract the bare email address from a `Name <email>` or plain string. */
export function extractEmail(from: string): string {
  const m = from.match(/<([^>]+)>/)
  return (m ? m[1] : from).trim().toLowerCase()
}

/** True only if `from` resolves to an approved FoundOurMarket sender identity. */
export function isApprovedSender(from: string | null | undefined): boolean {
  if (!from) return false
  return APPROVED_EMAILS.has(extractEmail(from))
}

/** Which tier an approved sender belongs to (for audit logging). */
export function senderTier(from: string): 'primary' | 'secondary' | 'unapproved' {
  const email = extractEmail(from)
  if (email === PRIMARY_SENDER.email.toLowerCase()) return 'primary'
  if (email === FALLBACK_SENDER.email.toLowerCase()) return 'secondary'
  return 'unapproved'
}

/**
 * Throw if `from` is not an approved sender. Use at every send site so a
 * personal/admin/dev address can never reach a customer.
 */
export function assertApprovedSender(from: string): string {
  if (!isApprovedSender(from)) {
    throw new Error(
      `Email sender policy violation: "${from}" is not an approved FoundOurMarket sender. ` +
        `Allowed: ${APPROVED_SENDERS.map(formatSender).join(' | ')}`,
    )
  }
  return from
}
