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

/* FoundOurMarket™ cyber-dark email system — shared shell + per-event content. */

const BG = '#070a12'
const PANEL = '#0d1322'
const BORDER = '#1c2740'
const TEXT = '#e7ecf6'
const MUTED = '#8a96ad'
const ACCENT = '#ff8a3d'

export interface OrderEmailProps {
  orderNumber?: string
  customerName?: string
  amount?: string
  trackingNumber?: string
  carrier?: string
  refundAmount?: string
  unsubscribeUrl?: string
}

function Shell({
  badge,
  heading,
  intro,
  children,
  unsubscribeUrl,
}: {
  badge: string
  heading: string
  intro: string
  children?: React.ReactNode
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
          </Section>

          <Hr style={{ borderColor: BORDER, margin: '24px 0 16px' }} />
          <Section style={{ textAlign: 'center', padding: '0 0 8px' }}>
            <Text style={{ margin: 0, fontSize: '11px', color: MUTED }}>
              Need help? Reach us at support@foundourmarket.com
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
    <Section style={{ marginBottom: '8px' }}>
      <Text style={{ margin: 0, fontSize: '11px', letterSpacing: '1px', textTransform: 'uppercase', color: MUTED }}>
        {label}
      </Text>
      <Text style={{ margin: '2px 0 0', fontSize: '15px', color: TEXT, fontWeight: 600 }}>{value}</Text>
    </Section>
  )
}

function DetailCard({ children }: { children: React.ReactNode }) {
  return (
    <Section
      style={{
        backgroundColor: 'rgba(255,138,61,0.06)',
        border: `1px solid ${BORDER}`,
        borderRadius: '14px',
        padding: '18px 20px',
      }}
    >
      {children}
    </Section>
  )
}

const greet = (name?: string) => (name ? `Hi ${name}, ` : '')
const ref = (n?: string) => (n ? `#${n}` : 'your order')

/* ---------- Order confirmed ---------- */
function OrderConfirmedEmail({ orderNumber, customerName, amount, unsubscribeUrl }: OrderEmailProps) {
  return (
    <Shell
      unsubscribeUrl={unsubscribeUrl}
      badge="✦ Order Confirmed"
      heading="Your order is confirmed."
      intro={`${greet(customerName)}thanks for shopping with FoundOurMarket™. We've received order ${ref(orderNumber)} and our team is preparing it for dispatch.`}
    >
      <DetailCard>
        {orderNumber && <DetailRow label="Order number" value={`#${orderNumber}`} />}
        {amount && <DetailRow label="Order total" value={amount} />}
      </DetailCard>
    </Shell>
  )
}

/* ---------- Payment verified ---------- */
function PaymentVerifiedEmail({ orderNumber, customerName, amount, unsubscribeUrl }: OrderEmailProps) {
  return (
    <Shell
      unsubscribeUrl={unsubscribeUrl}
      badge="✦ Payment Verified"
      heading="Payment received."
      intro={`${greet(customerName)}we've securely verified your payment for order ${ref(orderNumber)}. Your order is now fully paid and moving to fulfilment.`}
    >
      <DetailCard>
        {orderNumber && <DetailRow label="Order number" value={`#${orderNumber}`} />}
        {amount && <DetailRow label="Amount paid" value={amount} />}
      </DetailCard>
    </Shell>
  )
}

/* ---------- Shipped ---------- */
function ShippedEmail({ orderNumber, customerName, trackingNumber, carrier, unsubscribeUrl }: OrderEmailProps) {
  return (
    <Shell
      unsubscribeUrl={unsubscribeUrl}
      badge="✦ Shipped"
      heading="Your order is on its way."
      intro={`${greet(customerName)}great news — order ${ref(orderNumber)} has been shipped and is now in transit.`}
    >
      <DetailCard>
        {orderNumber && <DetailRow label="Order number" value={`#${orderNumber}`} />}
        {carrier && <DetailRow label="Carrier" value={carrier} />}
        {trackingNumber && <DetailRow label="Tracking number" value={trackingNumber} />}
      </DetailCard>
    </Shell>
  )
}

/* ---------- Out for delivery ---------- */
function OutForDeliveryEmail({ orderNumber, customerName, trackingNumber, carrier, unsubscribeUrl }: OrderEmailProps) {
  return (
    <Shell
      unsubscribeUrl={unsubscribeUrl}
      badge="✦ Out for Delivery"
      heading="Arriving today."
      intro={`${greet(customerName)}order ${ref(orderNumber)} is out for delivery and should reach you soon. Please keep an eye out.`}
    >
      <DetailCard>
        {orderNumber && <DetailRow label="Order number" value={`#${orderNumber}`} />}
        {carrier && <DetailRow label="Carrier" value={carrier} />}
        {trackingNumber && <DetailRow label="Tracking number" value={trackingNumber} />}
      </DetailCard>
    </Shell>
  )
}

/* ---------- Delivered ---------- */
function DeliveredEmail({ orderNumber, customerName, unsubscribeUrl }: OrderEmailProps) {
  return (
    <Shell
      unsubscribeUrl={unsubscribeUrl}
      badge="✦ Delivered"
      heading="Delivered. Enjoy!"
      intro={`${greet(customerName)}order ${ref(orderNumber)} has been delivered. We hope you love it — thank you for choosing FoundOurMarket™.`}
    >
      <DetailCard>
        {orderNumber && <DetailRow label="Order number" value={`#${orderNumber}`} />}
      </DetailCard>
    </Shell>
  )
}

/* ---------- Refund processed ---------- */
function RefundProcessedEmail({ orderNumber, customerName, refundAmount, unsubscribeUrl }: OrderEmailProps) {
  return (
    <Shell
      unsubscribeUrl={unsubscribeUrl}
      badge="✦ Refund Processed"
      heading="Your refund is on the way."
      intro={`${greet(customerName)}we've processed your refund for order ${ref(orderNumber)}. Depending on your bank, it may take 5–7 business days to reflect.`}
    >
      <DetailCard>
        {orderNumber && <DetailRow label="Order number" value={`#${orderNumber}`} />}
        {refundAmount && <DetailRow label="Refund amount" value={refundAmount} />}
      </DetailCard>
    </Shell>
  )
}

const sampleTracking = { orderNumber: '8F3A21C9', customerName: 'Alex', trackingNumber: 'FOM1234567890', carrier: 'BlueDart' }

export const orderConfirmedTemplate = {
  component: OrderConfirmedEmail,
  subject: (d: Record<string, any>) => `Order confirmed${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Order confirmed',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex', amount: '₹2,499' },
} satisfies TemplateEntry

export const paymentVerifiedTemplate = {
  component: PaymentVerifiedEmail,
  subject: (d: Record<string, any>) => `Payment received${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Payment verified',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex', amount: '₹2,499' },
} satisfies TemplateEntry

export const shippedTemplate = {
  component: ShippedEmail,
  subject: (d: Record<string, any>) => `Your order has shipped${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Order shipped',
  previewData: sampleTracking,
} satisfies TemplateEntry

export const outForDeliveryTemplate = {
  component: OutForDeliveryEmail,
  subject: (d: Record<string, any>) => `Out for delivery${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Out for delivery',
  previewData: sampleTracking,
} satisfies TemplateEntry

export const deliveredTemplate = {
  component: DeliveredEmail,
  subject: (d: Record<string, any>) => `Delivered${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Order delivered',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex' },
} satisfies TemplateEntry

export const refundProcessedTemplate = {
  component: RefundProcessedEmail,
  subject: (d: Record<string, any>) => `Refund processed${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Refund processed',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex', refundAmount: '₹2,499' },
} satisfies TemplateEntry
