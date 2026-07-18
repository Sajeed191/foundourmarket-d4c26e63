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
  paymentFailedTemplate,
  orderProcessingTemplate,
  orderPackedTemplate,
  orderCancelledTemplate,
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
import { demoOrderReceivedTemplate } from './demo-order'
import {
  suspendedTemplate,
  bannedTemplate,
  orderingBlockedTemplate,
  reviewsDisabledTemplate,
  accountDeletedTemplate,
  accountRestoredTemplate,
  accountReactivatedTemplate,
  banRemovedTemplate,
  orderingUnblockedTemplate,
  reviewsRestoredTemplate,
} from './lifecycle-emails'
import {
  passwordChangedTemplate,
  accountRecoveryTemplate,
  loginNewDeviceTemplate,
  accountLockedTemplate,
  suspiciousActivityTemplate,
} from './security-emails'
import { newsletterVerifyTemplate } from './newsletter-verify'
import {
  returnRequestedTemplate,
  returnApprovedTemplate,
  returnRejectedTemplate,
  refundInitiatedTemplate,
} from './return-emails'

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
  'demo-order-received': demoOrderReceivedTemplate,
  'account-suspended': suspendedTemplate,
  'account-banned': bannedTemplate,
  'ordering-blocked': orderingBlockedTemplate,
  'reviews-disabled': reviewsDisabledTemplate,
  'account-deleted': accountDeletedTemplate,
  'account-restored': accountRestoredTemplate,
  'account-reactivated': accountReactivatedTemplate,
  'ban-removed': banRemovedTemplate,
  'ordering-unblocked': orderingUnblockedTemplate,
  'reviews-restored': reviewsRestoredTemplate,
  // Order lifecycle
  'payment-failed': paymentFailedTemplate,
  'order-processing': orderProcessingTemplate,
  'order-packed': orderPackedTemplate,
  'order-cancelled': orderCancelledTemplate,
  // Return & refund
  'return-requested': returnRequestedTemplate,
  'return-approved': returnApprovedTemplate,
  'return-rejected': returnRejectedTemplate,
  'refund-initiated': refundInitiatedTemplate,
  // Security (highest priority)
  'password-changed': passwordChangedTemplate,
  'account-recovery': accountRecoveryTemplate,
  'login-new-device': loginNewDeviceTemplate,
  'account-locked': accountLockedTemplate,
  'suspicious-activity': suspiciousActivityTemplate,
  // Newsletter
  'newsletter-verify': newsletterVerifyTemplate,
}
