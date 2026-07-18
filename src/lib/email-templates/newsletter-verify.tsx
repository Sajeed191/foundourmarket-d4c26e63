import * as React from 'react'
import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'
import type { TemplateEntry } from './registry'

export interface NewsletterVerifyProps {
  verifyUrl: string
  expiresInHours?: number
}

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '32px 28px', maxWidth: 560 as unknown as number }
const h1 = { fontSize: 22, lineHeight: '28px', color: '#0b1220', margin: '0 0 12px', fontWeight: 700 }
const p = { fontSize: 14, lineHeight: '22px', color: '#374151', margin: '0 0 16px' }
const btn = {
  backgroundColor: '#f59e0b',
  color: '#111827',
  padding: '12px 22px',
  borderRadius: 999,
  fontSize: 14,
  fontWeight: 700,
  textDecoration: 'none',
  display: 'inline-block',
}
const small = { fontSize: 12, lineHeight: '18px', color: '#6b7280', margin: '20px 0 0' }

const NewsletterVerify: React.FC<NewsletterVerifyProps> = ({ verifyUrl, expiresInHours = 24 }) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Confirm your FoundOurMarket newsletter subscription</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Confirm your subscription</Heading>
        <Text style={p}>
          Tap the button below to confirm you want deals, drops, and updates from FoundOurMarket.
        </Text>
        <Section style={{ margin: '20px 0 8px' }}>
          <Button href={verifyUrl} style={btn}>
            Confirm subscription
          </Button>
        </Section>
        <Text style={small}>
          This link expires in {expiresInHours} hour{expiresInHours === 1 ? '' : 's'}. If you didn't
          request this, you can safely ignore this email.
        </Text>
      </Container>
    </Body>
  </Html>
)

export const newsletterVerifyTemplate = {
  component: NewsletterVerify,
  subject: 'Confirm your FoundOurMarket subscription',
  displayName: 'Newsletter — Verify',
  previewData: { verifyUrl: 'https://foundourmarket.com/newsletter/verify?token=preview', expiresInHours: 24 },
} satisfies TemplateEntry
