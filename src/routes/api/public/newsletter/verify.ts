/**
 * Newsletter Stage 3 — Double Opt-In verification endpoint.
 *
 * GET /api/public/newsletter/verify?token=...
 *   Consumes a single-use, expiring verification token.
 *   Redirects to a friendly result page (?state=ok|expired|invalid|already).
 */
import { createFileRoute } from '@tanstack/react-router'

const RESULT_BASE = '/newsletter/verified'

function done(state: 'ok' | 'expired' | 'invalid' | 'already'): Response {
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${RESULT_BASE}?state=${state}`,
      'Cache-Control': 'no-store',
    },
  })
}

export const Route = createFileRoute('/api/public/newsletter/verify')({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url)
        const token = (url.searchParams.get('token') ?? '').trim()
        if (!token || token.length < 16 || token.length > 128) return done('invalid')

        const { supabaseAdmin } = await import('@/integrations/supabase/client.server')

        const { data: row } = await supabaseAdmin
          .from('newsletter_subscribers')
          .select('id, email, status, verification_expires_at, verified_at')
          .eq('verification_token', token)
          .maybeSingle()

        if (!row) return done('invalid')
        const r = row as any

        if (r.status === 'subscribed' && r.verified_at) {
          // Token already consumed; still show friendly success.
          return done('already')
        }

        const expiresAt = r.verification_expires_at ? new Date(r.verification_expires_at) : null
        if (!expiresAt || expiresAt.getTime() < Date.now()) return done('expired')

        const nowIso = new Date().toISOString()
        const { error: updateErr } = await supabaseAdmin
          .from('newsletter_subscribers')
          .update({
            status: 'subscribed',
            verified_at: nowIso,
            subscribed_at: nowIso,
            verification_token: null,
            verification_expires_at: null,
          } as never)
          .eq('id', r.id)

        if (updateErr) return done('invalid')

        try {
          await supabaseAdmin.from('newsletter_audit_log').insert({
            actor_id: null,
            actor_email: null,
            action: 'verified',
            target_email: r.email,
            ip_hash: null,
            metadata: {} as never,
          } as never)
        } catch { /* never break */ }

        return done('ok')
      },
    },
  },
})
