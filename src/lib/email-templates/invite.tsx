import * as React from 'react'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface InviteEmailProps {
  siteName: string
  siteUrl: string
  confirmationUrl: string
}

export const InviteEmail = ({
  siteName,
  siteUrl,
  confirmationUrl,
}: InviteEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>You've been invited to join {siteName}</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>FoundOurMarket</Text>
          <Text style={tagline}>Everything You Need — All in One Place 🌍</Text>
        </Section>
        <Section style={content}>
          <Heading style={h1}>You've been invited</Heading>
          <Text style={text}>
            You've been invited to join{' '}
            <Link href={siteUrl} style={link}>
              <strong>{siteName}</strong>
            </Link>
            . Click the button below to accept the invitation and create your
            account.
          </Text>
          <Button style={button} href={confirmationUrl}>
            Accept Invitation
          </Button>
          <Text style={footer}>
            If you weren't expecting this invitation, you can safely ignore this
            email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default InviteEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, Helvetica, sans-serif' }
const container = { maxWidth: '480px', margin: '0 auto', padding: '24px 0' }
const header = {
  backgroundColor: '#0a0f1f',
  borderRadius: '14px 14px 0 0',
  padding: '28px 25px',
  textAlign: 'center' as const,
}
const brand = { fontSize: '22px', fontWeight: 'bold' as const, color: '#f59e0b', margin: '0' }
const tagline = { fontSize: '12px', color: '#c7ccd6', margin: '6px 0 0' }
const content = {
  border: '1px solid #eceef2',
  borderTop: 'none',
  borderRadius: '0 0 14px 14px',
  padding: '28px 25px',
}
const h1 = { fontSize: '22px', fontWeight: 'bold' as const, color: '#0a0f1f', margin: '0 0 20px' }
const text = { fontSize: '14px', color: '#55575d', lineHeight: '1.5', margin: '0 0 25px' }
const link = { color: '#b45309', textDecoration: 'underline' }
const button = {
  backgroundColor: '#f59e0b',
  color: '#0a0f1f',
  fontSize: '14px',
  fontWeight: 'bold' as const,
  borderRadius: '8px',
  padding: '12px 22px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
