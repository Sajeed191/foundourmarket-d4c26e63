import * as React from 'react'

import {
  Body,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Section,
  Text,
} from '@react-email/components'

interface ReauthenticationEmailProps {
  token: string
}

export const ReauthenticationEmail = ({ token }: ReauthenticationEmailProps) => (
  <Html lang="en" dir="ltr">
    <Head />
    <Preview>Your verification code</Preview>
    <Body style={main}>
      <Container style={container}>
        <Section style={header}>
          <Text style={brand}>FoundOurMarket</Text>
          <Text style={tagline}>Everything You Need — All in One Place 🌍</Text>
        </Section>
        <Section style={content}>
          <Heading style={h1}>Confirm reauthentication</Heading>
          <Text style={text}>Use the code below to confirm your identity:</Text>
          <Text style={codeStyle}>{token}</Text>
          <Text style={footer}>
            This code will expire shortly. If you didn't request this, you can
            safely ignore this email.
          </Text>
        </Section>
      </Container>
    </Body>
  </Html>
)

export default ReauthenticationEmail

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
const codeStyle = {
  fontFamily: 'Courier, monospace',
  fontSize: '26px',
  letterSpacing: '4px',
  fontWeight: 'bold' as const,
  color: '#0a0f1f',
  backgroundColor: '#fff7ed',
  border: '1px solid #fcd9a3',
  borderRadius: '8px',
  padding: '14px 0',
  textAlign: 'center' as const,
  margin: '0 0 30px',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
