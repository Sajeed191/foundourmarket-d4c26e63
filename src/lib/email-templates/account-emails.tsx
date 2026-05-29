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

/* FoundOurMarket™ cyber-dark account email system — welcome, verification, reset.
   Mobile-first (560px max), dark-mode aware, with CTA buttons, support links,
   and automatic plain-text fallback (rendered by the send route). */

const BG = '#070a12'
const PANEL = '#0d1322'
const BORDER = '#1c2740'
const TEXT = '#e7ecf6'
const MUTED = '#8a96ad'
const ACCENT = '#ff8a3d'
const ACCENT_SOFT = 'rgba(255,138,61,0.14)'
const SUPPORT = 'support@foundourmarket.com'

export interface AccountEmailProps {
  /** Recipient first name, optional. */
  name?: string
  /** Absolute action URL (verification or reset link). */
  actionUrl?: string
  /** How long the link stays valid, e.g. "24 hours". */
  expiresIn?: string
}

function Shell({
  preview,
  badge,
  heading,
  intro,
  actionUrl,
  actionLabel,
  note,
  children,
}: {
  preview: string
  badge: string
  heading: string
  intro: string
  actionUrl?: string
  actionLabel?: string
  note?: string
  children?: React.ReactNode
}) {
  return (
    <Html lang="en" dir="ltr">
      <Head>
        {/* Dark-mode compatibility hints for supporting clients */}
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
          {/* Brand header */}
          <Section style={{ textAlign: 'center', padding: '8px 0 20px' }}>
            <Text style={{ margin: 0, fontSize: '11px', letterSpacing: '4px', textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>
              FoundOurMarket™
            </Text>
            <Text style={{ margin: '6px 0 0', fontSize: '12px', color: MUTED }}>
              Everything You Need — All in One Place 🌍
            </Text>
          </Section>

          {/* Glow card */}
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
            <Text style={{ margin: '0 0 24px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>
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

            {actionUrl && (
              <Section
                style={{
                  backgroundColor: 'rgba(255,138,61,0.06)',
                  border: `1px solid ${BORDER}`,
                  borderRadius: '14px',
                  padding: '14px 16px',
                  marginBottom: children ? '18px' : 0,
                }}
              >
                <Text style={{ margin: '0 0 6px', fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED }}>
                  Or paste this link
                </Text>
                <Link href={actionUrl} style={{ fontSize: '12px', color: ACCENT, wordBreak: 'break-all' }}>
                  {actionUrl}
                </Link>
              </Section>
            )}

            {children}

            {note && (
              <Text style={{ margin: '18px 0 0', fontSize: '12px', lineHeight: '1.6', color: MUTED }}>
                {note}
              </Text>
            )}
          </Section>

          {/* Footer */}
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

/* ---------- Welcome ---------- */
function WelcomeEmail({ name, actionUrl }: AccountEmailProps) {
  return (
    <Shell
      preview="Welcome to FoundOurMarket™ — your global marketplace awaits"
      badge="✦ Welcome"
      heading="Welcome to FoundOurMarket™"
      intro={`${greet(name)}your account is ready. Discover curated products from around the world — all in one place, delivered to your door.`}
      actionUrl={actionUrl}
      actionLabel={actionUrl ? 'Start exploring' : undefined}
      note="You're receiving this because you created an account with FoundOurMarket™."
    />
  )
}

/* ---------- Account verification ---------- */
function AccountVerificationEmail({ name, actionUrl, expiresIn }: AccountEmailProps) {
  return (
    <Shell
      preview="Verify your FoundOurMarket™ account"
      badge="✦ Verify Account"
      heading="Confirm your email address"
      intro={`${greet(name)}please verify your email to activate your FoundOurMarket™ account and keep it secure.`}
      actionUrl={actionUrl}
      actionLabel="Verify my account"
      note={`This verification link will expire in ${expiresIn || '24 hours'}. If you didn't create an account, you can safely ignore this email.`}
    />
  )
}

/* ---------- Password reset ---------- */
function PasswordResetEmail({ name, actionUrl, expiresIn }: AccountEmailProps) {
  return (
    <Shell
      preview="Reset your FoundOurMarket™ password"
      badge="✦ Password Reset"
      heading="Reset your password"
      intro={`${greet(name)}we received a request to reset your FoundOurMarket™ password. Tap the button below to choose a new one.`}
      actionUrl={actionUrl}
      actionLabel="Reset password"
      note={`This link will expire in ${expiresIn || '60 minutes'}. If you didn't request a password reset, ignore this email — your password won't change.`}
    />
  )
}

export const welcomeTemplate = {
  component: WelcomeEmail,
  subject: 'Welcome to FoundOurMarket™ 🌍',
  displayName: 'Welcome',
  previewData: { name: 'Alex', actionUrl: 'https://foundourmarket.com' },
} satisfies TemplateEntry

export const accountVerificationTemplate = {
  component: AccountVerificationEmail,
  subject: 'Verify your FoundOurMarket™ account',
  displayName: 'Account verification',
  previewData: { name: 'Alex', actionUrl: 'https://foundourmarket.com/verify?token=sample', expiresIn: '24 hours' },
} satisfies TemplateEntry

export const passwordResetTemplate = {
  component: PasswordResetEmail,
  subject: 'Reset your FoundOurMarket™ password',
  displayName: 'Password reset',
  previewData: { name: 'Alex', actionUrl: 'https://foundourmarket.com/reset?token=sample', expiresIn: '60 minutes' },
} satisfies TemplateEntry
