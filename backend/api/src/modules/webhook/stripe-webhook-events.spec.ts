import {
  isSupportedStripeWebhookEvent,
  SUPPORTED_STRIPE_WEBHOOK_EVENTS,
} from './stripe-webhook-events';

describe('stripe-webhook-events', () => {
  it('defines exactly 12 supported events', () => {
    expect(SUPPORTED_STRIPE_WEBHOOK_EVENTS).toHaveLength(12);
  });

  it('recognizes required events', () => {
    expect(isSupportedStripeWebhookEvent('checkout.session.completed')).toBe(
      true,
    );
    expect(isSupportedStripeWebhookEvent('customer.subscription.created')).toBe(
      true,
    );
    expect(isSupportedStripeWebhookEvent('invoice.paid')).toBe(true);
    expect(isSupportedStripeWebhookEvent('charge.refunded')).toBe(true);
  });

  it('ignores unsupported events', () => {
    expect(isSupportedStripeWebhookEvent('payment_intent.succeeded')).toBe(
      false,
    );
  });
});
