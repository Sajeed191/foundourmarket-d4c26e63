// Public inbound-email webhook: external mail providers POST normalized
// inbound support emails here. Converts each into a FoundOurMarket™ ticket.
//
// Security: requires a shared secret. Configure your provider to send it as
// the `x-support-inbound-secret` header (or `?token=` query param). Set the
// SUPPORT_INBOUND_SECRET secret to match.
import { createFileRoute } from '@tanstack/react-router'
import { timingSafeEqual } from 'node:crypto'
import { z } from 'zod'

const attachmentSchema = z.object({
  filename: z.string().max(500).optional(),
  contentType: z.string().max(200).optional(),
  size: z.number().nonnegative().optional(),
  contentBase64: z.string().optional(),
})

const emailSchema = z.object({
  from: z.union([z.string().max(500), z.object({ email: z.string().max(320).optional(), name: z.string().max(200).optional() })]).optional(),
  to: z.union([z.string().max(2000), z.array(z.string().max(320)).max(50)]).optional(),
  subject: z.string().max(2000).optional(),
  text: z.string().max(200_000).optional(),
  html: z.string().max(500_000).optional(),
  messageId: z.string().max(998).optional(),
  inReplyTo: z.string().max(998).optional(),
  references: z.union([z.string().max(4000), z.array(z.string().max(998)).max(50)]).optional(),
  headers: z.record(z.string(), z.string().max(4000)).optional(),
  attachments: z.array(attachmentSchema).max(25).optional(),
})

function safeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a)
  const bb = Buffer.from(b)
  if (ab.length !== bb.length) return false
  return timingSafeEqual(ab, bb)
}

export const Route = createFileRoute('/api/public/support/inbound-email')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env.SUPPORT_INBOUND_SECRET
        if (!secret) {
          return new Response(JSON.stringify({ ok: false, error: 'inbound_not_configured' }), {
            status: 503,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const url = new URL(request.url)
        const provided =
          request.headers.get('x-support-inbound-secret') ||
          request.headers.get('authorization')?.replace(/^Bearer\s+/i, '') ||
          url.searchParams.get('token') ||
          ''
        if (!provided || !safeEqual(provided, secret)) {
          return new Response('Unauthorized', { status: 401 })
        }

        let payload: unknown
        try {
          payload = await request.json()
        } catch {
          return new Response(JSON.stringify({ ok: false, error: 'invalid_json' }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const parsed = emailSchema.safeParse(payload)
        if (!parsed.success) {
          return new Response(JSON.stringify({ ok: false, error: 'invalid_payload', issues: parsed.error.issues.slice(0, 5) }), {
            status: 400,
            headers: { 'Content-Type': 'application/json' },
          })
        }

        const { processInboundEmail } = await import('@/lib/support-inbound.server')
        const result = await processInboundEmail(parsed.data)

        return new Response(JSON.stringify(result), {
          status: result.ok ? 200 : 500,
          headers: { 'Content-Type': 'application/json' },
        })
      },
    },
  },
})
