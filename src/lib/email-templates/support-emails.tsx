import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

/* FoundOurMarket™ cyber-dark support email system. */

const BG = '#070a12'
const PANEL = '#0d1322'
const BORDER = '#1c2740'
const TEXT = '#e7ecf6'
const MUTED = '#8a96ad'
const ACCENT = '#ff8a3d'

export interface SupportCustomerEmailProps {
  kind?: 'created' | 'reply' | 'resolved' | 'closed'
  ticketSubject?: string
  ticketShort?: string
  status?: string
  replyPreview?: string
  ctaUrl?: string
  unsubscribeUrl?: string
}

export interface SupportAdminEmailProps {
  kind?: 'new' | 'reply' | 'high'
  ticketSubject?: string
  ticketShort?: string
  priority?: string
  category?: string
  customerEmail?: string
  replyPreview?: string
  unreadCount?: number
  ctaUrl?: string
}

function Shell({
  badge,
  heading,
  intro,
  children,
  ctaUrl,
  ctaLabel,
  unsubscribeUrl,
}: {
  badge: string
  heading: string
  intro: string
  children?: React.ReactNode
  ctaUrl?: string
  ctaLabel?: string
  unsubscribeUrl?: string
}) {
  return (
    <Html>
      <Head />
      <Preview>{heading}</Preview>
      <Body style={{ backgroundColor: BG, margin: 0, padding: '32px 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
        <Container style={{ width: '100%', maxWidth: '560px', margin: '0 auto', padding: '0 16px' }}>
          <Section style={{ textAlign: 'center', padding: '8px 0 20px' }}>
            <Text style={{ margin: 0, fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>
              FoundOurMarket™
            </Text>
            <Text style={{ margin: '6px 0 0', fontSize: '12px', color: MUTED }}>
              Everything You Need — All in One Place 🌍
            </Text>
          </Section>

          <Section
            style={{
              backgroundColor: PANEL,
              border: `1px solid ${BORDER}`,
              borderRadius: '20px',
              padding: '36px 32px',
              boxShadow: '0 24px 60px -24px rgba(255,138,61,0.35)',
            }}
          >
            <Section
              style={{
                display: 'inline-block',
                backgroundColor: 'rgba(255,138,61,0.14)',
                border: '1px solid rgba(255,138,61,0.3)',
                borderRadius: '999px',
                padding: '6px 14px',
                marginBottom: '20px',
              }}
            >
              <Text style={{ margin: 0, fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>
                {badge}
              </Text>
            </Section>

            <Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>
              {heading}
            </Heading>
            <Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>
              {intro}
            </Text>
            {children}
            {ctaUrl && (
              <Section style={{ textAlign: 'center', marginTop: '28px' }}>
                <Button
                  href={ctaUrl}
                  style={{
                    backgroundColor: ACCENT,
                    color: '#1a0e05',
                    fontSize: '13px',
                    fontWeight: 700,
                    letterSpacing: '1px',
                    textTransform: 'uppercase',
                    padding: '13px 28px',
                    borderRadius: '999px',
                    textDecoration: 'none',
                  }}
                >
                  {ctaLabel ?? 'Open conversation'}
                </Button>
              </Section>
            )}
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '24px 0 16px' }} />
          <Section style={{ textAlign: 'center', padding: '0 0 8px' }}>
            <Text style={{ margin: 0, fontSize: '11px', color: MUTED }}>
              Need help? Reach us at foundourmarket@gmail.com
            </Text>
            <Text style={{ margin: '6px 0 0', fontSize: '11px', color: '#5a6a7d' }}>
              © {new Date().getFullYear()} FoundOurMarket™. All rights reserved.
            </Text>
            {unsubscribeUrl && (
              <Text style={{ margin: '10px 0 0', fontSize: '11px', color: '#5a6a7d' }}>
                Don't want these emails?{' '}
                <Link href={unsubscribeUrl} style={{ color: MUTED, textDecoration: 'underline' }}>
                  Unsubscribe
                </Link>
              </Text>
            )}
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <Section style={{ borderTop: `1px solid ${BORDER}`, padding: '11px 0' }}>
      <Text style={{ margin: 0, fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED }}>{label}</Text>
      <Text style={{ margin: '4px 0 0', fontSize: '14px', color: TEXT, fontWeight: 600 }}>{value}</Text>
    </Section>
  )
}

function Quote({ text }: { text: string }) {
  return (
    <Section
      style={{
        backgroundColor: 'rgba(255,138,61,0.06)',
        border: `1px solid ${BORDER}`,
        borderLeft: `3px solid ${ACCENT}`,
        borderRadius: '12px',
        padding: '14px 16px',
        marginTop: '8px',
      }}
    >
      <Text style={{ margin: 0, fontSize: '14px', lineHeight: '1.6', color: TEXT, fontStyle: 'italic' }}>“{text}”</Text>
    </Section>
  )
}

/* ---------- Customer-facing ---------- */
const CUSTOMER_COPY: Record<NonNullable<SupportCustomerEmailProps['kind']>, { badge: string; heading: (s?: string) => string; intro: string }> = {
  created: { badge: 'Ticket received', heading: () => "We've got your request", intro: 'Our team has received your ticket and will reply as soon as possible. You can track and continue the conversation any time.' },
  reply: { badge: 'New reply', heading: () => 'Support replied to you', intro: 'Our support team just replied to your ticket. Tap below to read the full message and respond.' },
  resolved: { badge: 'Resolved', heading: () => 'Your ticket is resolved', intro: "We've marked your ticket as resolved. If anything still needs attention, just reply and we'll reopen it." },
  closed: { badge: 'Closed', heading: () => 'Your ticket is closed', intro: 'This ticket is now closed. If you need anything else, open a new ticket and we’ll be happy to help.' },
}

const SupportCustomerEmail = (props: SupportCustomerEmailProps) => {
  const kind = props.kind ?? 'reply'
  const copy = CUSTOMER_COPY[kind]
  return (
    <Shell
      badge={copy.badge}
      heading={copy.heading(props.ticketSubject)}
      intro={copy.intro}
      ctaUrl={props.ctaUrl}
      ctaLabel="View ticket"
      unsubscribeUrl={props.unsubscribeUrl}
    >
      {props.ticketShort && <DetailRow label="Ticket" value={`#${props.ticketShort}`} />}
      {props.ticketSubject && <DetailRow label="Subject" value={props.ticketSubject} />}
      {props.status && <DetailRow label="Status" value={props.status} />}
      {props.replyPreview && (
        <Section style={{ marginTop: '14px' }}>
          <Text style={{ margin: '0 0 6px', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED }}>Latest reply</Text>
          <Quote text={props.replyPreview} />
        </Section>
      )}
    </Shell>
  )
}

/* ---------- Admin-facing ---------- */
const ADMIN_COPY: Record<NonNullable<SupportAdminEmailProps['kind']>, { badge: string; heading: string; intro: string }> = {
  new: { badge: 'New ticket', heading: 'A new support ticket arrived', intro: 'A customer just opened a support ticket. Review the details and respond from the admin console.' },
  reply: { badge: 'Customer reply', heading: 'A customer replied', intro: 'A customer added a new message to an open ticket. Jump in to keep response times fast.' },
  high: { badge: 'High priority', heading: 'High priority ticket needs attention', intro: 'A ticket has been flagged high priority. Please review and escalate as needed.' },
}

const SupportAdminEmail = (props: SupportAdminEmailProps) => {
  const kind = props.kind ?? 'new'
  const copy = ADMIN_COPY[kind]
  return (
    <Shell
      badge={copy.badge}
      heading={copy.heading}
      intro={copy.intro}
      ctaUrl={props.ctaUrl}
      ctaLabel="Open in admin"
    >
      {props.ticketShort && <DetailRow label="Ticket" value={`#${props.ticketShort}`} />}
      {props.ticketSubject && <DetailRow label="Subject" value={props.ticketSubject} />}
      {props.customerEmail && <DetailRow label="Customer" value={props.customerEmail} />}
      {props.category && <DetailRow label="Category" value={props.category} />}
      {props.priority && <DetailRow label="Priority" value={props.priority} />}
      {typeof props.unreadCount === 'number' && props.unreadCount > 0 && (
        <DetailRow label="Unread messages" value={String(props.unreadCount)} />
      )}
      {props.replyPreview && (
        <Section style={{ marginTop: '14px' }}>
          <Text style={{ margin: '0 0 6px', fontSize: '10px', letterSpacing: '1.5px', textTransform: 'uppercase', color: MUTED }}>Message</Text>
          <Quote text={props.replyPreview} />
        </Section>
      )}
    </Shell>
  )
}

export const supportCustomerTemplate: TemplateEntry = {
  component: SupportCustomerEmail,
  subject: (d: SupportCustomerEmailProps) => {
    const t = d.ticketSubject ? ` — ${d.ticketSubject}` : ''
    switch (d.kind) {
      case 'created': return `We received your support request${t}`
      case 'resolved': return `Your support ticket is resolved${t}`
      case 'closed': return `Your support ticket is closed${t}`
      default: return `New reply to your support ticket${t}`
    }
  },
  displayName: 'Support — customer update',
  previewData: {
    kind: 'reply',
    ticketSubject: 'Where is my order?',
    ticketShort: 'a1b2c3d4',
    status: 'pending',
    replyPreview: 'Thanks for reaching out! Your order shipped today and will arrive in 2–3 days.',
    ctaUrl: 'https://foundourmarket.com/account/support',
  } satisfies SupportCustomerEmailProps,
}

export const supportAdminTemplate: TemplateEntry = {
  component: SupportAdminEmail,
  subject: (d: SupportAdminEmailProps) => {
    const t = d.ticketSubject ? ` — ${d.ticketSubject}` : ''
    switch (d.kind) {
      case 'reply': return `Customer replied${t}`
      case 'high': return `⚠ High priority ticket${t}`
      default: return `New support ticket${t}`
    }
  },
  displayName: 'Support — admin alert',
  previewData: {
    kind: 'new',
    ticketSubject: 'Refund request',
    ticketShort: 'a1b2c3d4',
    priority: 'high',
    category: 'refund',
    customerEmail: 'customer@example.com',
    replyPreview: "I'd like a refund for my last order, it arrived damaged.",
    ctaUrl: 'https://foundourmarket.com/admin-support',
  } satisfies SupportAdminEmailProps,
}
