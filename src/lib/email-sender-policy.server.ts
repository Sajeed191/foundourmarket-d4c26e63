// FoundOurMarket™ — Email Sender Governance (server-only enforcement & audit)
//
// Wraps the client-safe policy with audit logging into `security_audit_log`
// via the shared logSecurity helper. Import only from server code
// (.server.ts / *.functions.ts handlers).
import { logSecurity } from '@/lib/admin-guard.server'
import {
  assertApprovedSender,
  isApprovedSender,
  senderTier,
  extractEmail,
} from '@/lib/email-sender-policy'

interface SenderAuditMeta {
  recipient?: string | null
  template?: string | null
  context?: string | null
  userId?: string | null
}

/**
 * Enforce the sender policy before a send. Returns the validated `from` string.
 * On violation: logs a security audit event AND throws so the send is blocked.
 */
export async function enforceSender(from: string, meta: SenderAuditMeta = {}): Promise<string> {
  if (!isApprovedSender(from)) {
    await logSecurity({
      actorId: meta.userId ?? null,
      actorRole: 'system',
      action: 'email.sender.violation',
      target: meta.recipient ?? null,
      success: false,
      detail: {
        attempted_sender: from,
        attempted_email: extractEmail(from),
        recipient: meta.recipient ?? null,
        template: meta.template ?? null,
        context: meta.context ?? null,
        reason: 'unapproved_sender',
      },
    })
    return assertApprovedSender(from) // throws
  }
  return from
}

/** Record which approved sender (primary vs secondary) was used for a send. */
export async function recordSenderUsage(
  from: string,
  meta: SenderAuditMeta & { status?: string; fallbackReason?: string } = {},
): Promise<void> {
  const tier = senderTier(from)
  // Only log secondary/fallback usage as an audit event (primary is the norm).
  if (tier === 'secondary') {
    await logSecurity({
      actorId: meta.userId ?? null,
      actorRole: 'system',
      action: 'email.sender.fallback_used',
      target: meta.recipient ?? null,
      success: meta.status !== 'failed',
      detail: {
        sender: from,
        tier,
        recipient: meta.recipient ?? null,
        template: meta.template ?? null,
        context: meta.context ?? null,
        status: meta.status ?? null,
        fallback_reason: meta.fallbackReason ?? null,
      },
    })
  }
}
