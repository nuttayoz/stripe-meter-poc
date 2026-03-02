export const SUPPORTED_STRIPE_WEBHOOK_EVENTS = [
  'checkout.session.completed',
  'checkout.session.async_payment_succeeded',
  'checkout.session.async_payment_failed',
  'customer.subscription.created',
  'customer.subscription.updated',
  'customer.subscription.deleted',
  'invoice.finalized',
  'invoice.paid',
  'invoice.payment_failed',
  'invoice.voided',
  'invoice.marked_uncollectible',
  'charge.refunded',
] as const;

export type SupportedStripeWebhookEventType =
  (typeof SUPPORTED_STRIPE_WEBHOOK_EVENTS)[number];

export function isSupportedStripeWebhookEvent(
  eventType: string,
): eventType is SupportedStripeWebhookEventType {
  return (SUPPORTED_STRIPE_WEBHOOK_EVENTS as readonly string[]).includes(
    eventType,
  );
}
