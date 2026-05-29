import type { ComponentType } from 'react'

export interface TemplateEntry {
  component: ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  displayName?: string
  previewData?: Record<string, any>
  /** Fixed recipient — overrides caller-provided recipientEmail when set. */
  to?: string
}

/**
 * Template registry — maps template names to their React Email components.
 * Import and register new templates here after creating them in this directory.
 *
 * Example:
 *   import { template as welcomeTemplate } from './welcome'
 *   // then add to TEMPLATES: 'welcome': welcomeTemplate
 */
import { template as testEmailTemplate } from './test-email'
import {
  orderConfirmedTemplate,
  paymentVerifiedTemplate,
  shippedTemplate,
  outForDeliveryTemplate,
  deliveredTemplate,
  refundProcessedTemplate,
} from './order-emails'
import {
  welcomeTemplate,
  accountVerificationTemplate,
  passwordResetTemplate,
} from './account-emails'
import {
  supportCustomerTemplate,
  supportAdminTemplate,
} from './support-emails'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'test-email': testEmailTemplate,
  'order-confirmed': orderConfirmedTemplate,
  'payment-verified': paymentVerifiedTemplate,
  'order-shipped': shippedTemplate,
  'out-for-delivery': outForDeliveryTemplate,
  'order-delivered': deliveredTemplate,
  'refund-processed': refundProcessedTemplate,
  'welcome': welcomeTemplate,
  'account-verification': accountVerificationTemplate,
  'password-reset': passwordResetTemplate,
  'support-customer-update': supportCustomerTemplate,
  'support-admin-alert': supportAdminTemplate,
}
