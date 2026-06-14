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

/* FoundOurMarket™ security emails — highest priority transactional notices.
   Dark luxury brand shell, mobile-first (560px), dark-mode aware. */

const BG = '#070a12'
const PANEL = '#0d1322'
const BORDER = '#1c2740'
const TEXT = '#e7ecf6'
const MUTED = '#8a96ad'
const ACCENT = '#ff8a3d'
const DANGER = '#ff6b6b'
const SUCCESS = '#34d399'
const SUPPORT = 'support@foundourmarket.com'

export interface SecurityEmailProps {
  /** Recipient first name, optional. */
  name?: string
  /** Optional action URL (e.g. recovery / secure-account link). */
  actionUrl?: string
  /** Human-readable timestamp of the event. */
  timestamp?: string
  /** Device / browser description, optional. */
  device?: string
  /** Approximate location, optional. */
  location?: string
  /** IP address, optional. */
  ipAddress?: string
}

function Shell({
  preview,
  badge,
  badgeColor,
  heading,
  intro,
  actionUrl,
  actionLabel,
  details,
  note,
}: {
  preview: string
  badge: string
  badgeColor: string
  heading: string
  intro: string
  actionUrl?: string
  actionLabel?: string
  details?: Array<{ label: string; value: string }>
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
                backgroundColor: 'rgba(255,138,61,0.14)',
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
            <Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>
              {intro}
            </Text>

            {actionUrl && actionLabel && (
              <Section style={{ textAlign: 'center', margin: '0 0 22px' }}>
                <Button
                  href={actionUrl}
                  style={{
                    backgroundColor: ACCENT,
                    color: '#0a0a0a',
                    fontSize: '14px',
                    fontWeight: 700,
                    letterSpacing: '0.5px',
                    textDecoration: 'none',
                    padding: '14px 30px',
                    borderRadius: '999px',
                    display: 'inline-block',
                  }}
                >
                  {actionLabel}
                </Button>
              </Section>
            )}

            {details && details.length > 0 && (
              <Section
                style={{
                  backgroundColor: 'rgba(255,138,61,0.06)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '14px',
                  padding: '14px 16px',
                  marginBottom: '4px',
                }}
              >
                {details.map((d) => (
                  <Section key={d.label} style={{ marginBottom: '8px' }}>
                    <Text style={{ margin: 0, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED }}>
                      {d.label}
                    </Text>
                    <Text style={{ margin: '2px 0 0', fontSize: '14px', color: TEXT, fontWeight: 600 }}>{d.value}</Text>
                  </Section>
                ))}
              </Section>
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

function sessionDetails(p: SecurityEmailProps): Array<{ label: string; value: string }> {
  const out: Array<{ label: string; value: string }> = []
  if (p.device) out.push({ label: 'Device', value: p.device })
  if (p.location) out.push({ label: 'Location', value: p.location })
  if (p.ipAddress) out.push({ label: 'IP address', value: p.ipAddress })
  if (p.timestamp) out.push({ label: 'When', value: p.timestamp })
  return out
}

/* ---------- Password changed ---------- */
function PasswordChangedEmail(p: SecurityEmailProps) {
  return (
    <Shell
      preview="Your FoundOurMarket™ password was changed"
      badge="Password Changed"
      badgeColor={SUCCESS}
      heading="Your password was changed"
      intro={`${greet(p.name)}this is a confirmation that the password for your FoundOurMarket™ account was just changed.`}
      details={sessionDetails(p)}
      note="If you didn't make this change, reset your password immediately and contact support — your account may be at risk."
    />
  )
}

/* ---------- Account recovery ---------- */
function AccountRecoveryEmail(p: SecurityEmailProps) {
  return (
    <Shell
      preview="Recover access to your FoundOurMarket™ account"
      badge="Account Recovery"
      badgeColor={ACCENT}
      heading="Recover your account"
      intro={`${greet(p.name)}we received a request to recover access to your FoundOurMarket™ account. Use the secure link below to continue.`}
      actionUrl={p.actionUrl}
      actionLabel={p.actionUrl ? 'Recover my account' : undefined}
      note="If you didn't request account recovery, you can safely ignore this email — no changes have been made."
    />
  )
}

/* ---------- Login from new device ---------- */
function LoginNewDeviceEmail(p: SecurityEmailProps) {
  return (
    <Shell
      preview="New sign-in to your FoundOurMarket™ account"
      badge="New Device Login"
      badgeColor={ACCENT}
      heading="New sign-in detected"
      intro={`${greet(p.name)}your FoundOurMarket™ account was just signed in to from a new device or location.`}
      details={sessionDetails(p)}
      actionUrl={p.actionUrl}
      actionLabel={p.actionUrl ? 'Review account activity' : undefined}
      note="If this was you, no action is needed. If you don't recognise this activity, change your password right away."
    />
  )
}

/* ---------- Account locked ---------- */
function AccountLockedEmail(p: SecurityEmailProps) {
  return (
    <Shell
      preview="Your FoundOurMarket™ account has been locked"
      badge="Account Locked"
      badgeColor={DANGER}
      heading="Your account has been locked"
      intro={`${greet(p.name)}for your protection, we've temporarily locked your FoundOurMarket™ account after unusual sign-in activity.`}
      details={sessionDetails(p)}
      actionUrl={p.actionUrl}
      actionLabel={p.actionUrl ? 'Unlock my account' : undefined}
      note="If this wasn't you, please reset your password and contact support to secure your account."
    />
  )
}

/* ---------- Suspicious activity ---------- */
function SuspiciousActivityEmail(p: SecurityEmailProps) {
  return (
    <Shell
      preview="Suspicious activity on your FoundOurMarket™ account"
      badge="Security Alert"
      badgeColor={DANGER}
      heading="Suspicious activity detected"
      intro={`${greet(p.name)}we noticed activity on your FoundOurMarket™ account that looks unusual. Please review it to make sure it was you.`}
      details={sessionDetails(p)}
      actionUrl={p.actionUrl}
      actionLabel={p.actionUrl ? 'Secure my account' : undefined}
      note="If you don't recognise this activity, change your password immediately and contact support."
    />
  )
}

export const passwordChangedTemplate = {
  component: PasswordChangedEmail,
  subject: 'Your FoundOurMarket™ password was changed',
  displayName: 'Password changed',
  previewData: { name: 'Alex', timestamp: 'June 14, 2026, 10:00 AM', device: 'Chrome on macOS' },
} satisfies TemplateEntry

export const accountRecoveryTemplate = {
  component: AccountRecoveryEmail,
  subject: 'Recover your FoundOurMarket™ account',
  displayName: 'Account recovery',
  previewData: { name: 'Alex', actionUrl: 'https://foundourmarket.com/recover?token=sample' },
} satisfies TemplateEntry

export const loginNewDeviceTemplate = {
  component: LoginNewDeviceEmail,
  subject: 'New sign-in to your FoundOurMarket™ account',
  displayName: 'Login from new device',
  previewData: { name: 'Alex', device: 'Safari on iPhone', location: 'Mumbai, IN', ipAddress: '203.0.113.7', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry

export const accountLockedTemplate = {
  component: AccountLockedEmail,
  subject: 'Your FoundOurMarket™ account has been locked',
  displayName: 'Account locked',
  previewData: { name: 'Alex', timestamp: 'June 14, 2026, 10:00 AM', ipAddress: '203.0.113.7' },
} satisfies TemplateEntry

export const suspiciousActivityTemplate = {
  component: SuspiciousActivityEmail,
  subject: '⚠ Suspicious activity on your FoundOurMarket™ account',
  displayName: 'Suspicious activity',
  previewData: { name: 'Alex', device: 'Unknown device', location: 'Unknown', timestamp: 'June 14, 2026, 10:00 AM' },
} satisfies TemplateEntry
