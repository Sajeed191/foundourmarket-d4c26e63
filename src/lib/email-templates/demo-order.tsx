import * as React from 'react'
import { EmailShell, InfoList } from './_ui'
import type { TemplateEntry } from './registry'
import type { OrderEmailProps } from './order-emails'

/* FoundOurMarket™ Global Beta — demo order acknowledgement. */

const greet = (n?: string) => (n ? `Hi ${n}, ` : '')

function DemoOrderEmail({
  orderNumber,
  customerName,
  amount,
  unsubscribeUrl,
}: OrderEmailProps) {
  return (
    <EmailShell
      preview="Your demo order has been recorded — FoundOurMarket™ Global Beta"
      badge="Global Beta · Demo Order"
      badgeTone="info"
      heading="Demo order received"
      intro={`${greet(customerName)}thanks for your interest in FoundOurMarket™. Your demo order has been recorded while international payment support is being finalised — we'll notify you as soon as global payments become available.`}
      unsubscribeUrl={unsubscribeUrl}
    >
      <InfoList
        items={[
          { label: 'Order number', value: orderNumber ? `#${orderNumber}` : undefined },
          { label: 'Order total', value: amount },
          { label: 'Payment', value: 'Demo Payment · Global Beta' },
        ]}
      />
    </EmailShell>
  )
}

export const demoOrderReceivedTemplate = {
  component: DemoOrderEmail,
  subject: 'Demo Order Received — FoundOurMarket™',
  displayName: 'Demo order received',
  previewData: { orderNumber: '8F3A21C9', customerName: 'Alex', amount: '$49.00' },
} satisfies TemplateEntry
