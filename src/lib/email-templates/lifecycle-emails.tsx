import * as React from 'react'
import { EmailShell, InfoList, SUPPORT, type Tone } from './_ui'
import { Link } from '@react-email/components'
import type { TemplateEntry } from './registry'

/* FoundOurMarket™ account lifecycle emails — restrictions & restorations,
   built on the shared premium EmailShell. */

export interface LifecycleEmailProps {
  name?: string
  reason?: string
  timestamp?: string
}

const greet = (n?: string) => (n ? `Hi ${n}, ` : 'Hi there, ')

function make(opts: {
  preview: string
  badge: string
  tone: Tone
  heading: string
  intro: (p: LifecycleEmailProps) => string
  appeal?: boolean
  note?: string
}) {
  return function Email(p: LifecycleEmailProps) {
    return (
      <EmailShell
        preview={opts.preview}
        badge={opts.badge}
        badgeTone={opts.tone}
        heading={opts.heading}
        intro={opts.intro(p)}
        note={opts.note}
      >
        <InfoList
          items={[
            { label: 'Reason', value: p.reason },
            { label: 'When', value: p.timestamp },
          ]}
        />
        {opts.appeal && (
          <p
            style={{
              margin: '18px 0 0',
              fontSize: '13px',
              lineHeight: '1.65',
              color: '#8a96ad',
            }}
          >
            If you believe this was a mistake, you can appeal by replying to this email or contacting{' '}
            <Link href={`mailto:${SUPPORT}`} style={{ color: '#ff8a3d' }}>
              {SUPPORT}
            </Link>
            .
          </p>
        )}
      </EmailShell>
    )
  }
}

const SuspendedEmail = make({
  preview: 'Your FoundOurMarket™ account has been suspended',
  badge: 'Account Suspended',
  tone: 'warning',
  heading: 'Your account has been suspended',
  intro: (p) => `${greet(p.name)}your FoundOurMarket™ account has been temporarily suspended. While suspended, you won't be able to place new orders.`,
  appeal: true,
})

const BannedEmail = make({
  preview: 'Your FoundOurMarket™ account has been banned',
  badge: 'Account Banned',
  tone: 'danger',
  heading: 'Your account has been banned',
  intro: (p) => `${greet(p.name)}your FoundOurMarket™ account has been banned and access has been revoked. You will no longer be able to sign in or use the marketplace.`,
  appeal: true,
})

const OrderingBlockedEmail = make({
  preview: 'Ordering has been disabled on your FoundOurMarket™ account',
  badge: 'Ordering Disabled',
  tone: 'warning',
  heading: 'Ordering has been disabled',
  intro: (p) => `${greet(p.name)}ordering has been temporarily disabled on your FoundOurMarket™ account. You can still browse and manage your account, but new orders are paused.`,
  appeal: true,
})

const ReviewsDisabledEmail = make({
  preview: 'Reviewing has been restricted on your FoundOurMarket™ account',
  badge: 'Reviews Restricted',
  tone: 'warning',
  heading: 'Reviewing has been restricted',
  intro: (p) => `${greet(p.name)}the ability to post reviews has been restricted on your FoundOurMarket™ account. All other features remain available.`,
  appeal: true,
})

const AccountDeletedEmail = make({
  preview: 'Your FoundOurMarket™ account has been closed',
  badge: 'Account Closed',
  tone: 'danger',
  heading: 'Your account has been closed',
  intro: (p) => `${greet(p.name)}your FoundOurMarket™ account has been closed. If you have any questions about this or believe it was made in error, please get in touch.`,
  appeal: true,
})

const AccountRestoredEmail = make({
  preview: 'Your FoundOurMarket™ account has been restored',
  badge: 'Account Restored',
  tone: 'success',
  heading: 'Your account has been restored',
  intro: (p) => `${greet(p.name)}good news — your FoundOurMarket™ account has been fully restored. You can sign in and use the marketplace as normal again.`,
  note: 'Restored access: sign-in, browsing, ordering & checkout, and writing reviews.',
})

const AccountReactivatedEmail = make({
  preview: 'Your FoundOurMarket™ account has been reactivated',
  badge: 'Account Reactivated',
  tone: 'success',
  heading: 'Your account has been reactivated',
  intro: (p) => `${greet(p.name)}your FoundOurMarket™ account is active again. You can sign in, browse, and place orders as normal.`,
  note: 'If you have any questions, our support team is here to help.',
})

const BanRemovedEmail = make({
  preview: 'The ban on your FoundOurMarket™ account has been lifted',
  badge: 'Ban Lifted',
  tone: 'success',
  heading: 'The ban on your account has been lifted',
  intro: (p) => `${greet(p.name)}good news — the ban on your FoundOurMarket™ account has been removed. You can sign in and use the marketplace again.`,
  note: 'Restored access: sign-in, browsing, ordering & checkout.',
})

const OrderingUnblockedEmail = make({
  preview: 'Ordering has been re-enabled on your FoundOurMarket™ account',
  badge: 'Ordering Restored',
  tone: 'success',
  heading: 'Ordering has been re-enabled',
  intro: (p) => `${greet(p.name)}ordering has been re-enabled on your FoundOurMarket™ account. You can place new orders right away.`,
})

const ReviewsRestoredEmail = make({
  preview: 'Reviewing has been restored on your FoundOurMarket™ account',
  badge: 'Reviews Restored',
  tone: 'success',
  heading: 'Reviewing has been restored',
  intro: (p) => `${greet(p.name)}you can post product reviews again on your FoundOurMarket™ account. Thanks for sharing your feedback with the community.`,
})

const previewBase = { name: 'Alex', timestamp: 'June 14, 2026, 10:00 AM' }

export const suspendedTemplate = {
  component: SuspendedEmail,
  subject: 'Your FoundOurMarket™ account has been suspended',
  displayName: 'Account suspended',
  previewData: { ...previewBase, reason: 'Multiple chargeback disputes' },
} satisfies TemplateEntry

export const bannedTemplate = {
  component: BannedEmail,
  subject: 'Your FoundOurMarket™ account has been banned',
  displayName: 'Account banned',
  previewData: { ...previewBase, reason: 'Fraudulent activity' },
} satisfies TemplateEntry

export const orderingBlockedTemplate = {
  component: OrderingBlockedEmail,
  subject: 'Ordering disabled on your FoundOurMarket™ account',
  displayName: 'Ordering disabled',
  previewData: { ...previewBase, reason: 'Pending verification' },
} satisfies TemplateEntry

export const reviewsDisabledTemplate = {
  component: ReviewsDisabledEmail,
  subject: 'Reviewing restricted on your FoundOurMarket™ account',
  displayName: 'Reviews restricted',
  previewData: { ...previewBase, reason: 'Review policy violation' },
} satisfies TemplateEntry

export const accountDeletedTemplate = {
  component: AccountDeletedEmail,
  subject: 'Your FoundOurMarket™ account has been closed',
  displayName: 'Account closed',
  previewData: { ...previewBase, reason: 'Requested by customer' },
} satisfies TemplateEntry

export const accountRestoredTemplate = {
  component: AccountRestoredEmail,
  subject: 'Your FoundOurMarket™ account has been restored',
  displayName: 'Account restored',
  previewData: previewBase,
} satisfies TemplateEntry

export const accountReactivatedTemplate = {
  component: AccountReactivatedEmail,
  subject: 'Your FoundOurMarket™ account has been reactivated',
  displayName: 'Account reactivated',
  previewData: previewBase,
} satisfies TemplateEntry

export const banRemovedTemplate = {
  component: BanRemovedEmail,
  subject: 'The ban on your FoundOurMarket™ account has been lifted',
  displayName: 'Ban removed',
  previewData: previewBase,
} satisfies TemplateEntry

export const orderingUnblockedTemplate = {
  component: OrderingUnblockedEmail,
  subject: 'Ordering re-enabled on your FoundOurMarket™ account',
  displayName: 'Ordering restored',
  previewData: previewBase,
} satisfies TemplateEntry

export const reviewsRestoredTemplate = {
  component: ReviewsRestoredEmail,
  subject: 'Reviewing restored on your FoundOurMarket™ account',
  displayName: 'Reviews restored',
  previewData: previewBase,
} satisfies TemplateEntry
