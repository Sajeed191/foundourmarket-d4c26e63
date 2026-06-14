// Server-only: fan-out email-failure alerts to admins.
//
// When any customer-facing email fails to render/enqueue (password reset,
// welcome, order confirmation, shipment update, etc.) admins must know
// immediately. This helper:
//   1. creates a CRITICAL in-app notification for every admin / super_admin
//      (so it shows up in the Operations Center + bell + dashboard alert)
//   2. writes a tamper-proof `admin_activity_logs` audit row
//
// It is intentionally resilient — it never throws, so a failed alert can
// never break the email send path it is observing.
//
// NEVER import from client code (uses the service-role admin client).
import { supabaseAdmin } from '@/integrations/supabase/client.server'

/** Templates whose failure is business-critical and must page admins. */
const CRITICAL_TEMPLATES = new Set<string>([
  // security
  'password-reset',
  'recovery',
  'account-recovery',
  'password-changed',
  'account-locked',
  // onboarding
  'welcome',
  'signup',
  'email-verification',
  // commerce
  'order-confirmed',
  'payment-verified',
  'payment-failed',
  'order-shipped',
  'out-for-delivery',
  'order-delivered',
  'refund-processed',
  'refund-initiated',
])

export type EmailFailureAlert = {
  /** Template / event key, e.g. "order-confirmed" or "password-reset". */
  template: string
  /** Recipient address (best-effort; may be unknown). */
  recipient?: string | null
  /** Short human-readable failure reason. */
  reason: string
  /** Originating subsystem: "order" | "lifecycle" | "support" | … */
  context?: string
  /** Related entity id (order id, customer id, ticket id) for traceability. */
  refId?: string | null
}

function isCritical(template: string): boolean {
  if (CRITICAL_TEMPLATES.has(template)) return true
  // Heuristic catch-all for variants like "order-*", "shipment-*".
  return /^(order|payment|shipment|refund|password|account|security)/i.test(template)
}

/**
 * Alert all admins about a failed customer email. Best-effort, never throws.
 * Returns how many admins were notified (0 on any failure).
 */
export async function notifyAdminsEmailFailure(alert: EmailFailureAlert): Promise<number> {
  const nowIso = new Date().toISOString()
  const reason = (alert.reason || 'Unknown error').slice(0, 480)
  const recipient = alert.recipient?.trim() || null
  const critical = isCritical(alert.template)

  // 1) Audit log — always, even if no admins are configured.
  try {
    await supabaseAdmin.from('admin_activity_logs').insert({
      action: 'email_failed',
      entity_type: 'email',
      entity_id: alert.refId ?? recipient ?? alert.template,
      metadata: {
        template: alert.template,
        recipient,
        reason,
        context: alert.context ?? null,
        critical,
        at: nowIso,
      } as never,
    })
  } catch (err) {
    console.error('[email-alerts] audit insert failed', String(err))
  }

  // 2) Fan-out in-app notification to every admin / super_admin.
  try {
    const { data: admins, error } = await supabaseAdmin
      .from('user_roles')
      .select('user_id')
      .in('role', ['admin', 'super_admin'])
    if (error) throw new Error(error.message)

    const ids = [...new Set((admins ?? []).map((r) => r.user_id as string))].filter(Boolean)
    if (ids.length === 0) return 0

    const title = `Email failed: ${alert.template}`
    const body = `${alert.context ? `${alert.context} • ` : ''}${recipient ?? 'unknown recipient'} — ${reason}`.slice(0, 500)

    const rows = ids.map((uid) => ({
      user_id: uid,
      type: 'email_failure',
      title,
      body,
      link: '/admin-email-diagnostics',
      priority: critical ? 'critical' : 'important',
      data: {
        template: alert.template,
        recipient,
        reason,
        context: alert.context ?? null,
        ref_id: alert.refId ?? null,
        critical,
        at: nowIso,
      } as never,
    }))

    const { error: insErr } = await supabaseAdmin.from('notifications').insert(rows as never)
    if (insErr) throw new Error(insErr.message)
    return ids.length
  } catch (err) {
    console.error('[email-alerts] admin notification fan-out failed', String(err))
    return 0
  }
}
