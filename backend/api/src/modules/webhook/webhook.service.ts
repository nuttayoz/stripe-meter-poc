import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  StripeClient,
  StripeWebhookEvent,
} from '../../infrastructure/stripe/stripe.client';
import { STRIPE_CLIENT } from '../../infrastructure/stripe/stripe.constants';
import { isSupportedStripeWebhookEvent } from './stripe-webhook-events';

type InvoiceWebhookEventType =
  | 'invoice.finalized'
  | 'invoice.paid'
  | 'invoice.payment_failed'
  | 'invoice.voided'
  | 'invoice.marked_uncollectible';

@Injectable()
export class WebhookService {
  private readonly logger = new Logger(WebhookService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
  ) {}

  async handleStripeWebhook(signature?: string, rawBody?: string | Buffer) {
    if (!signature) {
      throw new BadRequestException('Missing stripe-signature header');
    }

    const payload = this.toPayload(rawBody);
    const stripeEvent = await this.constructStripeEvent(payload, signature);

    const existingEvent = await this.prisma.stripeWebhookEvent.findUnique({
      where: {
        stripeEventId: stripeEvent.id,
      },
      select: {
        id: true,
      },
    });

    if (existingEvent) {
      return {
        received: true,
        duplicate: true,
        eventType: stripeEvent.type,
      };
    }

    const trackedEvent = await this.prisma.stripeWebhookEvent.create({
      data: {
        stripeEventId: stripeEvent.id,
        type: stripeEvent.type,
        rawPayload: payload,
      },
      select: {
        id: true,
      },
    });

    try {
      await this.processEvent(stripeEvent, payload);

      await this.prisma.stripeWebhookEvent.update({
        where: {
          id: trackedEvent.id,
        },
        data: {
          processed: true,
          processedAt: new Date(),
          errorMessage: null,
        },
      });
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      await this.prisma.stripeWebhookEvent.update({
        where: {
          id: trackedEvent.id,
        },
        data: {
          processed: false,
          processedAt: new Date(),
          errorMessage,
        },
      });

      this.logger.error(
        `Failed processing Stripe webhook ${stripeEvent.id} (${stripeEvent.type}): ${errorMessage}`,
      );
      throw new InternalServerErrorException(
        'Stripe webhook processing failed',
      );
    }

    return {
      received: true,
      duplicate: false,
      eventType: stripeEvent.type,
      processed: isSupportedStripeWebhookEvent(stripeEvent.type),
    };
  }

  private async constructStripeEvent(payload: string, signature: string) {
    const webhookSecret = this.configService.getOrThrow<string>(
      'STRIPE_WEBHOOK_SECRET',
    );

    try {
      return await this.stripeClient.webhooks.constructEventAsync(
        payload,
        signature,
        webhookSecret,
      );
    } catch {
      throw new BadRequestException('Invalid Stripe signature');
    }
  }

  private async processEvent(stripeEvent: StripeWebhookEvent, payload: string) {
    if (!isSupportedStripeWebhookEvent(stripeEvent.type)) {
      return;
    }

    const object = this.getEventObject(stripeEvent);

    switch (stripeEvent.type) {
      case 'checkout.session.completed':
        await this.handleCheckoutSessionEvent(
          stripeEvent,
          object,
          payload,
          'completed',
        );
        return;
      case 'checkout.session.async_payment_succeeded':
        await this.handleCheckoutSessionEvent(
          stripeEvent,
          object,
          payload,
          'async_payment_succeeded',
        );
        return;
      case 'checkout.session.async_payment_failed':
        await this.handleCheckoutSessionEvent(
          stripeEvent,
          object,
          payload,
          'async_payment_failed',
        );
        return;
      case 'customer.subscription.created':
      case 'customer.subscription.updated':
      case 'customer.subscription.deleted':
        await this.handleSubscriptionEvent(stripeEvent, object, payload);
        return;
      case 'invoice.finalized':
        await this.handleInvoiceEvent(
          stripeEvent,
          object,
          payload,
          'invoice.finalized',
        );
        return;
      case 'invoice.paid':
        await this.handleInvoiceEvent(
          stripeEvent,
          object,
          payload,
          'invoice.paid',
        );
        return;
      case 'invoice.payment_failed':
        await this.handleInvoiceEvent(
          stripeEvent,
          object,
          payload,
          'invoice.payment_failed',
        );
        return;
      case 'invoice.voided':
        await this.handleInvoiceEvent(
          stripeEvent,
          object,
          payload,
          'invoice.voided',
        );
        return;
      case 'invoice.marked_uncollectible':
        await this.handleInvoiceEvent(
          stripeEvent,
          object,
          payload,
          'invoice.marked_uncollectible',
        );
        return;
      case 'charge.refunded':
        await this.handleChargeRefundedEvent(stripeEvent, object, payload);
        return;
      default:
        return;
    }
  }

  private async handleCheckoutSessionEvent(
    stripeEvent: StripeWebhookEvent,
    object: Record<string, unknown>,
    payload: string,
    status: string,
  ) {
    const organizationId =
      await this.resolveOrganizationIdFromEventObject(object);

    await this.recordTransaction({
      organizationId,
      stripeEventId: stripeEvent.id,
      eventType: stripeEvent.type,
      type: 'checkout_session',
      status,
      amount: this.getNumber(object, 'amount_total') ?? null,
      currency: this.getString(object, 'currency') ?? null,
      stripeInvoiceId: this.getExpandableId(object['invoice']),
      stripePaymentIntentId: this.getExpandableId(object['payment_intent']),
      stripeChargeId: null,
      stripeSubscriptionId: this.getExpandableId(object['subscription']),
      payload,
      occurredAt: this.toOccurredAt(stripeEvent.created),
    });
  }

  private async handleSubscriptionEvent(
    stripeEvent: StripeWebhookEvent,
    object: Record<string, unknown>,
    payload: string,
  ) {
    const subscriptionId = this.getString(object, 'id');
    if (!subscriptionId) {
      throw new Error('Subscription webhook payload missing object.id');
    }

    const organizationId =
      await this.resolveOrganizationIdFromEventObject(object);
    const status =
      stripeEvent.type === 'customer.subscription.deleted'
        ? 'canceled'
        : (this.getString(object, 'status') ?? 'unknown');

    const stripePriceId = this.extractFirstSubscriptionPriceId(object);
    const currentPeriodStart = this.getDateFromUnix(
      object,
      'current_period_start',
    );
    const currentPeriodEnd = this.getDateFromUnix(object, 'current_period_end');

    if (organizationId) {
      await this.prisma.subscription.upsert({
        where: {
          stripeSubscriptionId: subscriptionId,
        },
        create: {
          organizationId,
          stripeSubscriptionId: subscriptionId,
          stripePriceId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
        },
        update: {
          organizationId,
          stripePriceId,
          status,
          currentPeriodStart,
          currentPeriodEnd,
        },
      });
    }

    await this.recordTransaction({
      organizationId,
      stripeEventId: stripeEvent.id,
      eventType: stripeEvent.type,
      type: 'subscription',
      status,
      amount: null,
      currency: null,
      stripeInvoiceId: null,
      stripePaymentIntentId: null,
      stripeChargeId: null,
      stripeSubscriptionId: subscriptionId,
      payload,
      occurredAt: this.toOccurredAt(stripeEvent.created),
    });
  }

  private async handleInvoiceEvent(
    stripeEvent: StripeWebhookEvent,
    object: Record<string, unknown>,
    payload: string,
    invoiceEventType: InvoiceWebhookEventType,
  ) {
    const organizationId =
      await this.resolveOrganizationIdFromEventObject(object);
    const invoiceId = this.getString(object, 'id');
    const status = this.toInvoiceStatus(invoiceEventType);

    await this.recordTransaction({
      organizationId,
      stripeEventId: stripeEvent.id,
      eventType: stripeEvent.type,
      type: 'invoice',
      status,
      amount: this.pickInvoiceAmount(invoiceEventType, object),
      currency: this.getString(object, 'currency') ?? null,
      stripeInvoiceId: invoiceId ?? null,
      stripePaymentIntentId: this.getExpandableId(object['payment_intent']),
      stripeChargeId: this.getExpandableId(object['charge']),
      stripeSubscriptionId: this.getExpandableId(object['subscription']),
      payload,
      occurredAt: this.toOccurredAt(stripeEvent.created),
    });
  }

  private async handleChargeRefundedEvent(
    stripeEvent: StripeWebhookEvent,
    object: Record<string, unknown>,
    payload: string,
  ) {
    const organizationId =
      await this.resolveOrganizationIdFromEventObject(object);
    const chargeId = this.getString(object, 'id');
    const refundedAmount =
      this.getNumber(object, 'amount_refunded') ??
      this.getNumber(object, 'amount');

    await this.recordTransaction({
      organizationId,
      stripeEventId: stripeEvent.id,
      eventType: stripeEvent.type,
      type: 'charge',
      status: 'refunded',
      amount: refundedAmount ?? null,
      currency: this.getString(object, 'currency') ?? null,
      stripeInvoiceId: this.getExpandableId(object['invoice']),
      stripePaymentIntentId: this.getExpandableId(object['payment_intent']),
      stripeChargeId: chargeId ?? null,
      stripeSubscriptionId: null,
      payload,
      occurredAt: this.toOccurredAt(stripeEvent.created),
    });
  }

  private async recordTransaction(input: {
    organizationId: string | null;
    stripeEventId: string;
    eventType: string;
    type: string;
    status: string;
    amount: number | null;
    currency: string | null;
    stripeInvoiceId: string | null;
    stripePaymentIntentId: string | null;
    stripeChargeId: string | null;
    stripeSubscriptionId: string | null;
    payload: string;
    occurredAt: Date;
  }) {
    await this.prisma.transaction.upsert({
      where: {
        stripeEventId: input.stripeEventId,
      },
      create: {
        organizationId: input.organizationId,
        stripeEventId: input.stripeEventId,
        eventType: input.eventType,
        type: input.type,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        stripeInvoiceId: input.stripeInvoiceId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeChargeId: input.stripeChargeId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        rawPayload: input.payload,
        occurredAt: input.occurredAt,
      },
      update: {
        organizationId: input.organizationId,
        eventType: input.eventType,
        type: input.type,
        status: input.status,
        amount: input.amount,
        currency: input.currency,
        stripeInvoiceId: input.stripeInvoiceId,
        stripePaymentIntentId: input.stripePaymentIntentId,
        stripeChargeId: input.stripeChargeId,
        stripeSubscriptionId: input.stripeSubscriptionId,
        rawPayload: input.payload,
        occurredAt: input.occurredAt,
      },
    });
  }

  private async resolveOrganizationIdFromEventObject(
    object: Record<string, unknown>,
  ) {
    const customerId = this.extractCustomerId(object);
    if (!customerId) {
      return null;
    }

    const organization = await this.prisma.organization.findUnique({
      where: {
        stripeCustomerId: customerId,
      },
      select: {
        id: true,
      },
    });

    return organization?.id ?? null;
  }

  private extractCustomerId(object: Record<string, unknown>) {
    return this.getExpandableId(object['customer']);
  }

  private extractFirstSubscriptionPriceId(object: Record<string, unknown>) {
    const itemsValue: unknown = object['items'];
    if (!this.isRecord(itemsValue)) {
      return null;
    }

    const dataValue: unknown = itemsValue['data'];
    if (!Array.isArray(dataValue) || dataValue.length === 0) {
      return null;
    }

    const firstItemValue: unknown = dataValue[0];
    if (!this.isRecord(firstItemValue)) {
      return null;
    }

    return this.getExpandableId(firstItemValue['price']);
  }

  private pickInvoiceAmount(
    eventType: InvoiceWebhookEventType,
    object: Record<string, unknown>,
  ) {
    const amountPaid = this.getNumber(object, 'amount_paid');
    const amountDue = this.getNumber(object, 'amount_due');

    if (eventType === 'invoice.paid') {
      return amountPaid ?? amountDue ?? null;
    }

    return amountDue ?? amountPaid ?? null;
  }

  private toInvoiceStatus(eventType: InvoiceWebhookEventType) {
    switch (eventType) {
      case 'invoice.finalized':
        return 'finalized';
      case 'invoice.paid':
        return 'paid';
      case 'invoice.payment_failed':
        return 'payment_failed';
      case 'invoice.voided':
        return 'voided';
      case 'invoice.marked_uncollectible':
        return 'marked_uncollectible';
      default:
        return 'unknown';
    }
  }

  private getEventObject(stripeEvent: StripeWebhookEvent) {
    const object = stripeEvent.data.object;
    if (this.isRecord(object)) {
      return object;
    }

    throw new Error('Stripe event payload has invalid data.object');
  }

  private toOccurredAt(unixTimestampSeconds: number) {
    return new Date(unixTimestampSeconds * 1000);
  }

  private toPayload(rawBody?: string | Buffer) {
    if (typeof rawBody === 'string') {
      return rawBody;
    }

    if (Buffer.isBuffer(rawBody)) {
      return rawBody.toString('utf8');
    }

    throw new BadRequestException(
      'Missing raw request body for Stripe webhook verification',
    );
  }

  private getString(object: Record<string, unknown>, key: string) {
    const value = object[key];
    return typeof value === 'string' ? value : undefined;
  }

  private getNumber(object: Record<string, unknown>, key: string) {
    const value = object[key];
    return typeof value === 'number' ? value : undefined;
  }

  private getDateFromUnix(object: Record<string, unknown>, key: string) {
    const value = this.getNumber(object, key);
    if (value === undefined) {
      return null;
    }

    return new Date(value * 1000);
  }

  private getExpandableId(value: unknown) {
    if (typeof value === 'string') {
      return value;
    }

    if (this.isRecord(value)) {
      const id = value['id'];
      if (typeof id === 'string') {
        return id;
      }
    }

    return null;
  }

  private isRecord(value: unknown): value is Record<string, unknown> {
    return typeof value === 'object' && value !== null && !Array.isArray(value);
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
