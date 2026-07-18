import * as React from 'react'
import { EmailShell, InfoList, Quote, type Tone } from './_ui'
import type { TemplateEntry } from './registry'

export interface SupportCustomerEmailProps {
  kind?: 'created' | 'reply' | 'resolved' | 'closed' | 'escalated'
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

const CUSTOMER_COPY: Record<
  NonNullable<SupportCustomerEmailProps['kind']>,
  { badge: string; tone: Tone; heading: string; intro: string }
> = {
  created: {
    badge: 'Ticket Received',
    tone: 'accent',
    heading: "We've got your request",
    intro:
      'Our team has received your ticket and will reply as soon as possible. You can track and continue the conversation any time.',
  },
  reply: {
    badge: 'New Reply',
    tone: 'accent',
    heading: 'Support replied to you',
    intro:
      'Our support team just replied to your ticket. Tap below to read the full message and respond.',
  },
  resolved: {
    badge: 'Resolved',
    tone: 'success',
    heading: 'Your ticket is resolved',
    intro:
      "We've marked your ticket as resolved. If anything still needs attention, just reply and we'll reopen it.",
  },
  closed: {
    badge: 'Closed',
    tone: 'neutral',
    heading: 'Your ticket is closed',
    intro:
      "This ticket is now closed. If you need anything else, open a new ticket and we'll be happy to help.",
  },
  escalated: {
    badge: 'Escalated',
    tone: 'warning',
    heading: 'Your ticket has been escalated',
    intro:
      "We've escalated your ticket to a senior specialist for priority handling. We'll be in touch shortly with an update.",
  },
}

const SupportCustomerEmail = (props: SupportCustomerEmailProps) => {
  const kind = props.kind ?? 'reply'
  const copy = CUSTOMER_COPY[kind]
  return (
    <EmailShell
      preview={copy.heading}
      badge={copy.badge}
      badgeTone={copy.tone}
      heading={copy.heading}
      intro={copy.intro}
      actionUrl={props.ctaUrl}
      actionLabel={props.ctaUrl ? 'View ticket' : undefined}
      unsubscribeUrl={props.unsubscribeUrl}
    >
      <InfoList
        items={[
          { label: 'Ticket', value: props.ticketShort ? `#${props.ticketShort}` : undefined },
          { label: 'Subject', value: props.ticketSubject },
          { label: 'Status', value: props.status },
        ]}
      />
      {props.replyPreview && <Quote text={props.replyPreview} />}
    </EmailShell>
  )
}

const ADMIN_COPY: Record<
  NonNullable<SupportAdminEmailProps['kind']>,
  { badge: string; tone: Tone; heading: string; intro: string }
> = {
  new: {
    badge: 'New Ticket',
    tone: 'accent',
    heading: 'A new support ticket arrived',
    intro:
      'A customer just opened a support ticket. Review the details and respond from the admin console.',
  },
  reply: {
    badge: 'Customer Reply',
    tone: 'accent',
    heading: 'A customer replied',
    intro:
      'A customer added a new message to an open ticket. Jump in to keep response times fast.',
  },
  high: {
    badge: 'High Priority',
    tone: 'danger',
    heading: 'High priority ticket needs attention',
    intro: 'A ticket has been flagged high priority. Please review and escalate as needed.',
  },
}

const SupportAdminEmail = (props: SupportAdminEmailProps) => {
  const kind = props.kind ?? 'new'
  const copy = ADMIN_COPY[kind]
  return (
    <EmailShell
      preview={copy.heading}
      badge={copy.badge}
      badgeTone={copy.tone}
      heading={copy.heading}
      intro={copy.intro}
      actionUrl={props.ctaUrl}
      actionLabel={props.ctaUrl ? 'Open in admin' : undefined}
    >
      <InfoList
        items={[
          { label: 'Ticket', value: props.ticketShort ? `#${props.ticketShort}` : undefined },
          { label: 'Subject', value: props.ticketSubject },
          { label: 'Customer', value: props.customerEmail },
          { label: 'Category', value: props.category },
          { label: 'Priority', value: props.priority },
          {
            label: 'Unread messages',
            value:
              typeof props.unreadCount === 'number' && props.unreadCount > 0
                ? String(props.unreadCount)
                : undefined,
          },
        ]}
      />
      {props.replyPreview && <Quote text={props.replyPreview} />}
    </EmailShell>
  )
}

export const supportCustomerTemplate: TemplateEntry = {
  component: SupportCustomerEmail,
  subject: (d: SupportCustomerEmailProps) => {
    const t = d.ticketSubject ? ` — ${d.ticketSubject}` : ''
    switch (d.kind) {
      case 'created':
        return `We received your support request${t}`
      case 'resolved':
        return `Your support ticket is resolved${t}`
      case 'closed':
        return `Your support ticket is closed${t}`
      case 'escalated':
        return `Your support ticket has been escalated${t}`
      default:
        return `New reply to your support ticket${t}`
    }
  },
  displayName: 'Support — customer update',
  previewData: {
    kind: 'reply',
    ticketSubject: 'Where is my order?',
    ticketShort: 'a1b2c3d4',
    status: 'pending',
    replyPreview:
      'Thanks for reaching out! Your order shipped today and will arrive in 2–3 days.',
    ctaUrl: 'https://foundourmarket.com/account/support',
  } satisfies SupportCustomerEmailProps,
}

export const supportAdminTemplate: TemplateEntry = {
  component: SupportAdminEmail,
  subject: (d: SupportAdminEmailProps) => {
    const t = d.ticketSubject ? ` — ${d.ticketSubject}` : ''
    switch (d.kind) {
      case 'reply':
        return `Customer replied${t}`
      case 'high':
        return `⚠ High priority ticket${t}`
      default:
        return `New support ticket${t}`
    }
  },
  displayName: 'Support — admin alert',
  previewData: {
    kind: 'new',
    ticketSubject: 'Refund request',
    ticketShort: 'a1b2c3d4',
    priority: 'high',
    category: 'refund',
    customerEmail: 'customer@foundourmarket.com',
    replyPreview: "I'd like a refund for my last order, it arrived damaged.",
    ctaUrl: 'https://foundourmarket.com/admin-support',
  } satisfies SupportAdminEmailProps,
}
