import * as React from 'react'
import {
  Body,
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

/* FoundOurMarket™ account lifecycle emails — suspension, ban, ordering block,
   review restriction and account deletion. Same cyber-dark brand system as the
   account emails, mobile-first (560px), dark-mode aware, plain-text fallback. */

const BG = '#070a12'
const PANEL = '#0d1322'
const BORDER = '#1c2740'
const TEXT = '#e7ecf6'
const MUTED = '#8a96ad'
const ACCENT = '#ff8a3d'
const DANGER = '#ff6b6b'
const ACCENT_SOFT = 'rgba(255,138,61,0.14)'
const SUPPORT = 'support@foundourmarket.com'

export interface LifecycleEmailProps {
  /** Recipient first name, optional. */
  name?: string
  /** Reason supplied by the staff member, optional. */
  reason?: string
  /** Human-readable timestamp of the action. */
  timestamp?: string
}

function Shell({
  preview,
  badge,
  badgeColor,
  heading,
  intro,
  reason,
  timestamp,
  appeal,
  note,
}: {
  preview: string
  badge: string
  badgeColor: string
  heading: string
  intro: string
  reason?: string
  timestamp?: string
  appeal?: boolean
  note?: string
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        <meta name="color-scheme" content="dark light" />
        <meta name="supported-color-schemes" content="dark light" />
      </Head>
      <Preview>{preview}</Preview>
      <Body
        style={{
          backgroundColor: BG,
          margin: 0,
          padding: '32px 0',
          fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif",
        }}
      >
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
                backgroundColor: ACCENT_SOFT,
                border: `1px solid ${badgeColor}55`,
                borderRadius: '999px',
                padding: '6px 14px',
                marginBottom: '20px',
              }}
            >
              <Text style={{ margin: 0, fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: badgeColor, fontWeight: 700 }}>
                {badge}
              </Text>
            </Section>

            <Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>
              {heading}
            </Heading>
            <Text style={{ margin: '0 0 20px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>
              {intro}
            </Text>

            {(reason || timestamp) && (
              <Section
                style={{
                  backgroundColor: 'rgba(255,138,61,0.06)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '14px',
                  padding: '14px 16px',
                  marginBottom: '18px',
                }}
              >
                {reason && (
                  <>
                    <Text style={{ margin: '0 0 4px', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED }}>
                      Reason
                    </Text>
                    <Text style={{ margin: '0 0 10px', fontSize: '14px', lineHeight: '1.55', color: TEXT }}>
                      {reason}
                    </Text>
                  </>
                )}
                {timestamp && (
                  <>
                    <Text style={{ margin: '0 0 4px', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED }}>
                      When
                    </Text>
                    <Text style={{ margin: 0, fontSize: '14px', color: TEXT }}>{timestamp}</Text>
                  </>
                )}
              </Section>
            )}

            {appeal && (
              <Text style={{ margin: '0 0 4px', fontSize: '14px', lineHeight: '1.6', color: MUTED }}>
                If you believe this was a mistake, you can appeal by replying to this email or
                contacting{' '}
                <Link href={`mailto:${SUPPORT}`} style={{ color: ACCENT }}>
                  {SUPPORT}
                </Link>
                .
              </Text>
            )}

            {note && (
              <Text style={{ margin: '18px 0 0', fontSize: '12px', lineHeight: '1.6', color: MUTED }}>
                {note}
              </Text>
            )}
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '24px 0 16px' }} />
          <Section style={{ textAlign: 'center', padding: '0 0 8px' }}>
            <Text style={{ margin: 0, fontSize: '11px', color: MUTED }}>
              Need help? Reach us at{' '}
              <Link href={`mailto:${SUPPORT}`} style={{ color: ACCENT }}>
                {SUPPORT}
              </Link>
            </Text>
            <Text style={{ margin: '6px 0 0', fontSize: '11px', color: '#5a6a7d' }}>
              © {new Date().getFullYear()} FoundOurMarket™. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

const greet = (name?: string) => (name ? `Hi ${name}, ` : 'Hi there, ')

function SuspendedEmail({ name, reason, timestamp }: LifecycleEmailProps) {
  return (
    <Shell
      preview="Your FoundOurMarket™ account has been suspended"
      badge="Account Suspended"
      badgeColor={ACCENT}
      heading="Your account has been suspended"
      intro={`${greet(name)}your FoundOurMarket™ account has been temporarily suspended. While suspended, you won't be able to place new orders.`}
      reason={reason}
      timestamp={timestamp}
      appeal
    />
  )
}

function BannedEmail({ name, reason, timestamp }: LifecycleEmailProps) {
  return (
    <Shell
      preview="Your FoundOurMarket™ account has been banned"
      badge="Account Banned"
      badgeColor={DANGER}
      heading="Your account has been banned"
      intro={`${greet(name)}your FoundOurMarket™ account has been banned and access has been revoked. You will no longer be able to sign in or use the marketplace.`}
      reason={reason}
      timestamp={timestamp}
      appeal
    />
  )
}

function OrderingBlockedEmail({ name, reason, timestamp }: LifecycleEmailProps) {
  return (
    <Shell
      preview="Ordering has been disabled on your FoundOurMarket™ account"
      badge="Ordering Disabled"
      badgeColor={ACCENT}
      heading="Ordering has been disabled"
      intro={`${greet(name)}ordering has been temporarily disabled on your FoundOurMarket™ account. You can still browse and manage your account, but new orders are paused.`}
      reason={reason}
      timestamp={timestamp}
      appeal
    />
  )
}

function ReviewsDisabledEmail({ name, reason, timestamp }: LifecycleEmailProps) {
  return (
    <Shell
      preview="Reviewing has been restricted on your FoundOurMarket™ account"
      badge="Reviews Restricted"
      badgeColor={ACCENT}
      heading="Reviewing has been restricted"
      intro={`${greet(name)}the ability to post reviews has been restricted on your FoundOurMarket™ account. All other features remain available.`}
      reason={reason}
      timestamp={timestamp}
      appeal
    />
  )
}

function AccountDeletedEmail({ name, reason, timestamp }: LifecycleEmailProps) {
  return (
    <Shell
      preview="Your FoundOurMarket™ account has been closed"
      badge="Account Closed"
      badgeColor={DANGER}
      heading="Your account has been closed"
      intro={`${greet(name)}your FoundOurMarket™ account has been closed. If you have any questions about this or believe it was made in error, please get in touch.`}
      reason={reason}
      timestamp={timestamp}
      appeal
    />
  )
}

const SUCCESS = '#34d399'

function AccountRestoredEmail({ name, reason, timestamp }: LifecycleEmailProps) {
  return (
    <Shell
      preview="Your FoundOurMarket™ account has been restored"
      badge="Account Restored"
      badgeColor={SUCCESS}
      heading="Your account has been restored"
      intro={`${greet(name)}good news — your FoundOurMarket™ account has been fully restored. You can sign in and use the marketplace as normal again.`}
      reason={reason}
      timestamp={timestamp}
      note="Restored access: sign-in, browsing, ordering & checkout, and writing reviews. If you need anything, our support team is here to help."
    />
  )
}

export const suspendedTemplate = {
  component: SuspendedEmail,
  subject: 'Your FoundOurMarket™ account has been suspended',
  displayName: 'Account suspended',
  previewData: { name: 'Alex', reason: 'Multiple chargeback disputes', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry

export const bannedTemplate = {
  component: BannedEmail,
  subject: 'Your FoundOurMarket™ account has been banned',
  displayName: 'Account banned',
  previewData: { name: 'Alex', reason: 'Fraudulent activity', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry

export const orderingBlockedTemplate = {
  component: OrderingBlockedEmail,
  subject: 'Ordering disabled on your FoundOurMarket™ account',
  displayName: 'Ordering disabled',
  previewData: { name: 'Alex', reason: 'Pending verification', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry

export const reviewsDisabledTemplate = {
  component: ReviewsDisabledEmail,
  subject: 'Reviewing restricted on your FoundOurMarket™ account',
  displayName: 'Reviews restricted',
  previewData: { name: 'Alex', reason: 'Review policy violation', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry

export const accountDeletedTemplate = {
  component: AccountDeletedEmail,
  subject: 'Your FoundOurMarket™ account has been closed',
  displayName: 'Account closed',
  previewData: { name: 'Alex', reason: 'Requested by customer', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry

export const accountRestoredTemplate = {
  component: AccountRestoredEmail,
  subject: 'Your FoundOurMarket™ account has been restored',
  displayName: 'Account restored',
  previewData: { name: 'Alex', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry
