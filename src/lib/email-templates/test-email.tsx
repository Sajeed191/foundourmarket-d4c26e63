import * as React from 'react'
import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

interface TestEmailProps {
  /** Optional custom message shown in the email body. */
  message?: string
  /** Who triggered the test (admin email). */
  sentBy?: string
}

const BG = '#070a12'
const PANEL = '#0d1322'
const BORDER = '#1c2740'
const TEXT = '#e7ecf6'
const MUTED = '#8a96ad'
const ACCENT = '#ff8a3d'
const ACCENT_SOFT = 'rgba(255,138,61,0.14)'

export function TestEmail({ message, sentBy }: TestEmailProps) {
  const body =
    message?.trim() ||
    'This is a test email from FoundOurMarket™. If it landed in your inbox, your branded sender domain is configured correctly and ready to deliver real transactional emails.'

  return (
    <Html>
      <Head />
      <Preview>FoundOurMarket™ — test email delivery confirmed</Preview>
      <Body style={{ backgroundColor: BG, margin: 0, padding: '32px 0', fontFamily: "'Helvetica Neue', Helvetica, Arial, sans-serif" }}>
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
                border: `1px solid rgba(255,138,61,0.3)`,
                borderRadius: '999px',
                padding: '6px 14px',
                marginBottom: '20px',
              }}
            >
              <Text style={{ margin: 0, fontSize: '10px', letterSpacing: '2px', textTransform: 'uppercase', color: ACCENT, fontWeight: 700 }}>
                ✦ Test Delivery
              </Text>
            </Section>

            <Heading style={{ margin: '0 0 14px', fontSize: '24px', lineHeight: '1.25', color: TEXT, fontWeight: 700 }}>
              Your email system is live.
            </Heading>

            <Text style={{ margin: '0 0 22px', fontSize: '15px', lineHeight: '1.65', color: MUTED }}>
              {body}
            </Text>

            <Section
              style={{
                backgroundColor: 'rgba(255,138,61,0.06)',
                border: `1px solid ${BORDER}`,
                borderRadius: '14px',
                padding: '16px 18px',
              }}
            >
              <Text style={{ margin: 0, fontSize: '12px', lineHeight: '1.6', color: MUTED }}>
                <span style={{ color: ACCENT, fontWeight: 700 }}>Authenticated.</span> Delivered via your verified sender domain with SPF, DKIM &amp; DMARC managed automatically for high deliverability.
              </Text>
            </Section>
          </Section>

          {/* Footer */}
          <Hr style={{ borderColor: BORDER, margin: '24px 0 16px' }} />
          <Section style={{ textAlign: 'center', padding: '0 0 8px' }}>
            <Text style={{ margin: 0, fontSize: '11px', color: MUTED }}>
              {sentBy ? `Triggered by ${sentBy} · ` : ''}Sent from FoundOurMarket™ admin
            </Text>
            <Text style={{ margin: '6px 0 0', fontSize: '11px', color: '#5a6party'.replace('party', '6a7d') }}>
              © {new Date().getFullYear()} FoundOurMarket™. All rights reserved.
            </Text>
          </Section>
        </Container>
      </Body>
    </Html>
  )
}

export const template = {
  component: TestEmail,
  subject: 'FoundOurMarket™ — Test email delivery ✦',
  displayName: 'Admin test email',
  previewData: {
    message:
      'This is a test email from FoundOurMarket™. If it landed in your inbox, your branded sender domain is configured correctly.',
    sentBy: 'admin@foundourmarket.com',
  },
} satisfies TemplateEntry
