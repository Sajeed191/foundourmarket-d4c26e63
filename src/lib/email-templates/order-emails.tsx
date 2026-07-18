import * as React from 'react'
import { EmailShell, InfoList, type Tone } from './_ui'
import type { TemplateEntry } from './registry'

/* FoundOurMarket™ order emails — all consume the shared premium EmailShell. */

export interface OrderEmailProps {
  orderNumber?: string
  customerName?: string
  amount?: string
  trackingNumber?: string
  carrier?: string
  refundAmount?: string
  trackingUrl?: string
  orderUrl?: string
  payUrl?: string
  unsubscribeUrl?: string
}

const greet = (n?: string) => (n ? `Hi ${n}, ` : '')
const ref = (n?: string) => (n ? `#${n}` : 'your order')

function build(opts: {
  badge: string
  tone?: Tone
  heading: string
  intro: (p: OrderEmailProps) => string
  actionLabel?: string
  actionKey?: 'orderUrl' | 'trackingUrl' | 'payUrl'
  items: (p: OrderEmailProps) => Array<{ label: string; value?: React.ReactNode }>
  note?: string
}) {
  return function Email(p: OrderEmailProps) {
    const actionUrl = opts.actionKey ? p[opts.actionKey] : undefined
    return (
      <EmailShell
        preview={opts.heading}
        badge={opts.badge}
        badgeTone={opts.tone ?? 'accent'}
        heading={opts.heading}
        intro={opts.intro(p)}
        actionUrl={actionUrl}
        actionLabel={actionUrl ? opts.actionLabel : undefined}
        actionTone={opts.tone ?? 'accent'}
        unsubscribeUrl={p.unsubscribeUrl}
        note={opts.note}
      >
        <InfoList items={opts.items(p)} />
      </EmailShell>
    )
  }
}

const OrderConfirmedEmail = build({
  badge: 'Order Confirmed',
  tone: 'accent',
  heading: 'Your order is confirmed',
  intro: (p) => `${greet(p.customerName)}thanks for shopping with FoundOurMarket™. We've received order ${ref(p.orderNumber)} and our team is preparing it for dispatch.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Order total', value: p.amount },
  ],
})

const PaymentVerifiedEmail = build({
  badge: 'Payment Verified',
  tone: 'success',
  heading: 'Payment received',
  intro: (p) => `${greet(p.customerName)}we've securely verified your payment for order ${ref(p.orderNumber)}. Your order is now fully paid and moving to fulfilment.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Amount paid', value: p.amount },
  ],
})

const ShippedEmail = build({
  badge: 'Shipped',
  tone: 'info',
  heading: 'Your order is on its way',
  intro: (p) => `${greet(p.customerName)}great news — order ${ref(p.orderNumber)} has been shipped and is now in transit.`,
  actionLabel: 'Track shipment',
  actionKey: 'trackingUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Carrier', value: p.carrier },
    { label: 'Tracking number', value: p.trackingNumber },
  ],
})

const OutForDeliveryEmail = build({
  badge: 'Out for Delivery',
  tone: 'info',
  heading: 'Arriving today',
  intro: (p) => `${greet(p.customerName)}order ${ref(p.orderNumber)} is out for delivery and should reach you soon. Please keep an eye out.`,
  actionLabel: 'Track shipment',
  actionKey: 'trackingUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Carrier', value: p.carrier },
    { label: 'Tracking number', value: p.trackingNumber },
  ],
})

const DeliveredEmail = build({
  badge: 'Delivered',
  tone: 'success',
  heading: 'Delivered — enjoy!',
  intro: (p) => `${greet(p.customerName)}order ${ref(p.orderNumber)} has been delivered. We hope you love it — thank you for choosing FoundOurMarket™.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [{ label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined }],
})

const RefundProcessedEmail = build({
  badge: 'Refund Processed',
  tone: 'success',
  heading: 'Your refund is on the way',
  intro: (p) => `${greet(p.customerName)}we've processed your refund for order ${ref(p.orderNumber)}. Depending on your bank, it may take 5–7 business days to reflect.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Refund amount', value: p.refundAmount },
  ],
})

const PaymentFailedEmail = build({
  badge: 'Payment Failed',
  tone: 'danger',
  heading: "We couldn't process your payment",
  intro: (p) => `${greet(p.customerName)}unfortunately your payment for order ${ref(p.orderNumber)} didn't go through. Your order is on hold until payment is completed.`,
  actionLabel: 'Retry payment',
  actionKey: 'payUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Amount due', value: p.amount },
  ],
})

const OrderProcessingEmail = build({
  badge: 'Processing',
  tone: 'accent',
  heading: "We're preparing your order",
  intro: (p) => `${greet(p.customerName)}order ${ref(p.orderNumber)} is now being processed. We'll let you know as soon as it's packed and ready to ship.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [{ label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined }],
})

const OrderPackedEmail = build({
  badge: 'Packed',
  tone: 'accent',
  heading: 'Your order is packed',
  intro: (p) => `${greet(p.customerName)}order ${ref(p.orderNumber)} has been packed and is ready for dispatch. It'll be on its way to you very soon.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [{ label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined }],
})

const OrderCancelledEmail = build({
  badge: 'Order Cancelled',
  tone: 'warning',
  heading: 'Your order has been cancelled',
  intro: (p) => `${greet(p.customerName)}order ${ref(p.orderNumber)} has been cancelled. If a payment was made, any eligible refund will be processed automatically.`,
  actionLabel: 'View order',
  actionKey: 'orderUrl',
  items: (p) => [
    { label: 'Order number', value: p.orderNumber ? `#${p.orderNumber}` : undefined },
    { label: 'Order total', value: p.amount },
  ],
})

const sampleTracking = {
  orderNumber: '8F3A21C9',
  customerName: 'Alex',
  trackingNumber: 'FOM1234567890',
  carrier: 'BlueDart',
}

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

export const paymentFailedTemplate = {
  component: PaymentFailedEmail,
  subject: (d: Record<string, any>) => `Payment failed${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Payment failed',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex', amount: '₹2,499' },
} satisfies TemplateEntry

export const orderProcessingTemplate = {
  component: OrderProcessingEmail,
  subject: (d: Record<string, any>) => `Order processing${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Order processing',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex' },
} satisfies TemplateEntry

export const orderPackedTemplate = {
  component: OrderPackedEmail,
  subject: (d: Record<string, any>) => `Order packed${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Order packed',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex' },
} satisfies TemplateEntry

export const orderCancelledTemplate = {
  component: OrderCancelledEmail,
  subject: (d: Record<string, any>) => `Order cancelled${d?.orderNumber ? ` · #${d.orderNumber}` : ''} — FoundOurMarket™`,
  displayName: 'Order cancelled',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex', amount: '₹2,499' },
} satisfies TemplateEntry
