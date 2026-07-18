// Server-only: converts inbound support emails into FoundOurMarket™ tickets.
// Single source of truth = public.support_tickets. Never import from client code.
import { supabaseAdmin } from '@/integrations/supabase/client.server'

const SUPPORT_ADDRESSES = ['support@foundourmarket.com', 'foundourmarket@gmail.com']
const PRIMARY_SOURCE = 'support@foundourmarket.com'

const ALLOWED_TYPES = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'application/pdf']
const MAX_BYTES = 10 * 1024 * 1024 // 10MB per file

export interface InboundAttachment {
  filename?: string
  contentType?: string
  size?: number
  /** base64-encoded file content */
  contentBase64?: string
}

export interface InboundEmail {
  from?: { email?: string; name?: string } | string
  to?: string | string[]
  subject?: string
  text?: string
  html?: string
  messageId?: string
  inReplyTo?: string
  references?: string | string[]
  headers?: Record<string, string>
  attachments?: InboundAttachment[]
}

export interface InboundResult {
  ok: boolean
  status: 'created' | 'appended' | 'rejected' | 'error'
  ticketId?: string
  ticketNumber?: string
  reason?: string
}

function normalizeEmail(raw: unknown): string | null {
  if (!raw) return null
  if (typeof raw === 'object') {
    const e = (raw as { email?: string }).email
    return e ? e.trim().toLowerCase() : null
  }
  const str = String(raw)
  // Extract from "Name <email@x.com>" or plain "email@x.com".
  const m = str.match(/<([^>]+)>/)
  const candidate = (m ? m[1] : str).trim().toLowerCase()
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(candidate) ? candidate : null
}

function fromName(raw: InboundEmail['from']): string | null {
  if (!raw) return null
  if (typeof raw === 'object') return raw.name?.trim() || null
  const m = String(raw).match(/^\s*"?([^"<]+?)"?\s*</)
  return m ? m[1].trim() : null
}

function recipients(to: InboundEmail['to']): string[] {
  if (!to) return []
  const arr = Array.isArray(to) ? to : String(to).split(',')
  return arr.map((t) => normalizeEmail(t)).filter((e): e is string => !!e)
}

function pickSource(to: InboundEmail['to']): string {
  const rcpts = recipients(to)
  // Always prefer the primary support address when present.
  if (rcpts.includes(PRIMARY_SOURCE)) return PRIMARY_SOURCE
  const known = rcpts.find((r) => SUPPORT_ADDRESSES.includes(r))
  return known ?? PRIMARY_SOURCE
}

function extractTicketNumber(subject: string | undefined): string | null {
  if (!subject) return null
  const m = subject.match(/\[?(FOM-\d{6})\]?/i)
  return m ? m[1].toUpperCase() : null
}

function cleanBody(email: InboundEmail): string {
  const raw = (email.text || email.html || '').toString()
  // Strip HTML tags if only html was provided.
  const stripped = email.text ? raw : raw.replace(/<[^>]+>/g, ' ')
  return stripped.replace(/\u00a0/g, ' ').replace(/[ \t]+\n/g, '\n').trim()
}

/** Heuristic spam / auto-responder / mail-loop detection. */
function detectRejection(email: InboundEmail, fromEmail: string | null, body: string): string | null {
  const subject = (email.subject || '').trim()
  if (!fromEmail) return 'no_sender'
  if (!subject && !body) return 'empty_email'
  if (body.length < 1 && subject.length < 2) return 'empty_email'

  // Mail loop: inbound from one of our own support addresses.
  if (SUPPORT_ADDRESSES.includes(fromEmail) || fromEmail.endsWith('@ou.foundourmarket.com')) {
    return 'mail_loop'
  }

  const headers = Object.fromEntries(
    Object.entries(email.headers || {}).map(([k, v]) => [k.toLowerCase(), String(v).toLowerCase()]),
  )
  // Auto-responders.
  if (headers['auto-submitted'] && headers['auto-submitted'] !== 'no') return 'auto_responder'
  if (['bulk', 'auto_reply', 'list', 'junk'].includes(headers['precedence'] || '')) return 'auto_responder'
  if (headers['x-autoreply'] || headers['x-autorespond'] || headers['x-auto-response-suppress']) {
    return 'auto_responder'
  }
  const subjLower = subject.toLowerCase()
  if (/^(auto(matic)?\s*reply|out of office|out of the office|away from|abwesenheit|réponse automatique)/.test(subjLower)) {
    return 'auto_responder'
  }
  // Obvious spam markers.
  if (headers['x-spam-flag'] === 'yes') return 'spam'
  return null
}

async function logEvent(row: {
  status: string
  reason?: string | null
  email: InboundEmail
  fromEmail: string | null
  toSource: string
  ticketId?: string | null
  messageId?: string | null
}) {
  try {
    await supabaseAdmin.from('support_email_events').insert({
      direction: 'inbound',
      provider_message_id: row.email.messageId ?? null,
      thread_id: Array.isArray(row.email.references) ? row.email.references[0] : (row.email.references ?? null),
      reply_to_id: row.email.inReplyTo ?? null,
      from_email: row.fromEmail,
      to_email: row.toSource,
      subject: row.email.subject ?? null,
      ticket_id: row.ticketId ?? null,
      message_id: row.messageId ?? null,
      status: row.status,
      rejection_reason: row.reason ?? null,
      raw: {
        subject: row.email.subject ?? null,
        to: row.email.to ?? null,
        from: row.email.from ?? null,
        messageId: row.email.messageId ?? null,
        inReplyTo: row.email.inReplyTo ?? null,
        references: row.email.references ?? null,
        headers: row.email.headers ?? null,
        attachmentCount: row.email.attachments?.length ?? 0,
      },
    })
  } catch (err) {
    console.error('[support-inbound] event log failed', String(err))
  }
}

/** Customer matching: 1) auth account 2) previous guest ticket 3) guest. */
async function matchCustomer(fromEmail: string): Promise<{ userId: string | null }> {
  // 1. Auth account by email (paginated scan, capped).
  try {
    for (let page = 1; page <= 20; page++) {
      const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage: 200 })
      if (error || !data?.users?.length) break
      const hit = data.users.find((u) => u.email?.trim().toLowerCase() === fromEmail)
      if (hit) return { userId: hit.id }
      if (data.users.length < 200) break
    }
  } catch (err) {
    console.error('[support-inbound] auth lookup failed', String(err))
  }
  return { userId: null }
}

async function storeAttachments(
  ticketId: string,
  ownerId: string | null,
  attachments: InboundAttachment[] | undefined,
): Promise<string[]> {
  if (!attachments?.length) return []
  const stored: string[] = []
  for (const att of attachments) {
    const type = (att.contentType || '').toLowerCase().split(';')[0].trim()
    if (!ALLOWED_TYPES.includes(type)) continue
    if (!att.contentBase64) continue
    let buf: Buffer
    try {
      buf = Buffer.from(att.contentBase64, 'base64')
    } catch {
      continue
    }
    if (buf.byteLength === 0 || buf.byteLength > MAX_BYTES) continue
    const ext = att.filename?.split('.').pop()?.toLowerCase() || (type === 'application/pdf' ? 'pdf' : 'png')
    const path = `inbound/${ticketId}/${crypto.randomUUID()}.${ext}`
    const { error } = await supabaseAdmin.storage
      .from('support-attachments')
      .upload(path, buf, { upsert: false, contentType: type })
    if (error) {
      console.error('[support-inbound] attachment upload failed', error.message)
      continue
    }
    await supabaseAdmin.from('support_attachments').insert({
      ticket_id: ticketId,
      uploaded_by: ownerId,
      file_name: att.filename || `attachment.${ext}`,
      file_type: type,
      file_size: buf.byteLength,
      storage_path: path,
    })
    stored.push(path)
  }
  return stored
}

export async function processInboundEmail(email: InboundEmail): Promise<InboundResult> {
  const fromEmail = normalizeEmail(email.from)
  const source = pickSource(email.to)
  const body = cleanBody(email)

  // ---- Spam / loop protection ----
  const rejection = detectRejection(email, fromEmail, body)
  if (rejection) {
    await logEvent({ status: 'rejected', reason: rejection, email, fromEmail, toSource: source })
    return { ok: true, status: 'rejected', reason: rejection }
  }
  const sender = fromEmail as string

  // ---- Existing ticket reply? ----
  const ticketNumber = extractTicketNumber(email.subject)
  let ticketId: string | null = null
  let ownerId: string | null = null
  let createdNew = false

  if (ticketNumber) {
    const { data: existing } = await supabaseAdmin
      .from('support_tickets')
      .select('id, user_id, ticket_number, status')
      .eq('ticket_number', ticketNumber)
      .maybeSingle()
    if (existing) {
      ticketId = existing.id as string
      ownerId = (existing.user_id as string | null) ?? null
      // Reopen if customer replies on a resolved/closed ticket.
      if (['resolved', 'closed'].includes(String(existing.status))) {
        await supabaseAdmin.from('support_tickets').update({ status: 'open' }).eq('id', ticketId)
      }
    }
  }

  // ---- New ticket ----
  if (!ticketId) {
    const { userId } = await matchCustomer(sender)
    ownerId = userId
    const subject = (email.subject || '').trim() || 'Support request via email'
    const { data: created, error } = await supabaseAdmin
      .from('support_tickets')
      .insert({
        user_id: userId,
        subject: subject.slice(0, 200),
        status: 'open',
        category: 'general',
        priority: 'normal',
        channel: 'email',
        source,
        guest_email: userId ? null : sender,
        guest_name: userId ? null : fromName(email.from),
      })
      .select('id, ticket_number')
      .single()
    if (error || !created) {
      await logEvent({ status: 'error', reason: error?.message ?? 'insert_failed', email, fromEmail: sender, toSource: source })
      return { ok: false, status: 'error', reason: error?.message ?? 'insert_failed' }
    }
    ticketId = created.id as string
    createdNew = true
  }

  // ---- Append message ----
  const { data: message, error: msgErr } = await supabaseAdmin
    .from('support_messages')
    .insert({
      ticket_id: ticketId,
      sender_id: ownerId,
      sender_role: 'customer',
      body: body || '(no content)',
      channel: 'email',
      source,
      sender_email: sender,
      received_at: new Date().toISOString(),
      inbound_email_id: email.messageId ?? null,
      thread_id: Array.isArray(email.references) ? email.references[0] : (email.references ?? null),
      reply_to_id: email.inReplyTo ?? null,
      delivery_status: 'received',
      processing_status: 'processed',
    })
    .select('id')
    .single()
  if (msgErr || !message) {
    await logEvent({ status: 'error', reason: msgErr?.message ?? 'message_failed', email, fromEmail: sender, toSource: source, ticketId })
    return { ok: false, status: 'error', reason: msgErr?.message ?? 'message_failed', ticketId }
  }
  const messageId = message.id as string

  // ---- Attachments ----
  const stored = await storeAttachments(ticketId, ownerId, email.attachments)
  if (stored.length) {
    await supabaseAdmin.from('support_messages').update({ attachments: stored }).eq('id', messageId)
  }

  // ---- Touch ticket activity ----
  await supabaseAdmin
    .from('support_tickets')
    .update({ last_message_at: new Date().toISOString() })
    .eq('id', ticketId)

  // ---- Audit event ----
  await logEvent({
    status: createdNew ? 'created' : 'appended',
    email,
    fromEmail: sender,
    toSource: source,
    ticketId,
    messageId,
  })

  // ---- Outbound confirmation (only on new tickets with a known owner) ----
  if (createdNew && ownerId) {
    try {
      const { enqueueSupportEmail } = await import('@/lib/support-emails.server')
      await enqueueSupportEmail(ticketId, 'created')
    } catch (err) {
      console.error('[support-inbound] confirmation enqueue failed', String(err))
    }
  }

  // Fetch ticket number for the response.
  const { data: t } = await supabaseAdmin
    .from('support_tickets')
    .select('ticket_number')
    .eq('id', ticketId)
    .maybeSingle()

  return {
    ok: true,
    status: createdNew ? 'created' : 'appended',
    ticketId,
    ticketNumber: (t?.ticket_number as string) ?? undefined,
  }
}
