import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import {
  BillingStrategy,
  type BillingPrice,
  Prisma,
  type Subscription,
  type UsageEvent,
} from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type { StripeClient } from '../../infrastructure/stripe/stripe.client';
import { STRIPE_CLIENT } from '../../infrastructure/stripe/stripe.constants';

type BurnInput = {
  orgId: string;
  userId: string;
  priceId: string;
  units: number;
  reason?: string;
  idempotencyKey?: string;
};

type BillingPeriod = {
  start: Date;
  end: Date;
};

type StrategyContext = {
  organizationId: string;
  userId: string;
  stripePriceId: string;
  stripeSubscriptionId: string;
  units: number;
  meterEventName: string;
  stripeCustomerId: string;
  usageEventIdempotencyKey: string;
  period: BillingPeriod;
};

type StrategyResult = {
  stripeMeterEventId: string | null;
  stripeMeterEventIdentifier: string | null;
  peakUnits: number | null;
  peakEventEmitted: boolean;
  rawPayload: Prisma.InputJsonValue;
};

const BURNABLE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
] as const;

@Injectable()
export class BurnService {
  constructor(
    private readonly prisma: PrismaService,
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
  ) {}

  async burn(input: BurnInput) {
    const idempotencyKey = this.normalizeIdempotencyKey(input.idempotencyKey);

    const existingEvent = await this.prisma.usageEvent.findUnique({
      where: {
        idempotencyKey,
      },
    });

    if (existingEvent) {
      if (existingEvent.organizationId !== input.orgId) {
        throw new ConflictException(
          'Idempotency key is already used by another organization',
        );
      }
      if (existingEvent.stripePriceId !== input.priceId) {
        throw new ConflictException(
          'Idempotency key is already used with another price',
        );
      }

      return this.toResponse(existingEvent, {
        duplicate: true,
        peakUnits: null,
        peakEventEmitted: false,
      });
    }

    const [organization, subscription] = await Promise.all([
      this.getOrganization(input.orgId),
      this.getActiveSubscription(input.orgId, input.priceId),
    ]);

    if (!organization.stripeCustomerId) {
      throw new BadRequestException(
        'Organization is missing stripe_customer_id',
      );
    }

    const price = await this.prisma.billingPrice.findUnique({
      where: {
        stripePriceId: input.priceId,
      },
      select: {
        stripePriceId: true,
        billingStrategy: true,
        meterId: true,
        metadata: true,
      },
    });

    if (!price) {
      throw new NotFoundException(
        'No billing catalog entry found for requested price',
      );
    }

    if (
      price.billingStrategy !== BillingStrategy.BASE_PLUS_OVERAGE &&
      price.billingStrategy !== BillingStrategy.MAX_MEMBER_USAGE
    ) {
      throw new BadRequestException(
        'Active subscription does not define a supported billing strategy',
      );
    }

    const meterEventName = this.resolveMeterEventName(price);
    if (!meterEventName) {
      throw new BadRequestException(
        'Missing meter event name. Set billing price metadata "meter_event_name"',
      );
    }

    const period = this.resolveBillingPeriod(subscription);

    const usageEvent = await this.prisma.usageEvent.create({
      data: {
        organizationId: input.orgId,
        userId: input.userId,
        idempotencyKey,
        stripePriceId: input.priceId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        billingStrategy: price.billingStrategy,
        units: input.units,
        reason: input.reason?.trim() || null,
        status: 'pending',
        periodStart: period.start,
        periodEnd: period.end,
      },
    });

    try {
      const strategyContext: StrategyContext = {
        organizationId: input.orgId,
        userId: input.userId,
        stripePriceId: input.priceId,
        stripeSubscriptionId: subscription.stripeSubscriptionId,
        units: input.units,
        meterEventName,
        stripeCustomerId: organization.stripeCustomerId,
        usageEventIdempotencyKey: usageEvent.idempotencyKey,
        period,
      };

      const strategyResult =
        price.billingStrategy === BillingStrategy.BASE_PLUS_OVERAGE
          ? await this.handleBasePlusOverage(strategyContext)
          : await this.handleMaxMemberUsage(strategyContext);

      const finalizedUsageEvent = await this.prisma.usageEvent.update({
        where: {
          id: usageEvent.id,
        },
        data: {
          status: 'succeeded',
          stripeMeterEventId: strategyResult.stripeMeterEventId,
          stripeMeterEventIdentifier: strategyResult.stripeMeterEventIdentifier,
          rawPayload: strategyResult.rawPayload,
          errorMessage: null,
        },
      });

      await this.prisma.transaction.create({
        data: {
          organizationId: input.orgId,
          eventType: 'usage.burn',
          type: 'usage',
          status: 'succeeded',
          amount: input.units,
          currency: null,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          rawPayload: this.asJsonValue({
            usageEventId: finalizedUsageEvent.id,
            idempotencyKey: finalizedUsageEvent.idempotencyKey,
            strategy: finalizedUsageEvent.billingStrategy,
            stripePriceId: finalizedUsageEvent.stripePriceId,
            stripeSubscriptionId: finalizedUsageEvent.stripeSubscriptionId,
            peakUnits: strategyResult.peakUnits,
            peakEventEmitted: strategyResult.peakEventEmitted,
            stripeMeterEventId: finalizedUsageEvent.stripeMeterEventId,
            stripeMeterEventIdentifier:
              finalizedUsageEvent.stripeMeterEventIdentifier,
          }),
          occurredAt: new Date(),
        },
      });

      return this.toResponse(finalizedUsageEvent, {
        duplicate: false,
        peakUnits: strategyResult.peakUnits,
        peakEventEmitted: strategyResult.peakEventEmitted,
      });
    } catch (error) {
      const errorMessage = this.getErrorMessage(error);

      const failedUsageEvent = await this.prisma.usageEvent.update({
        where: {
          id: usageEvent.id,
        },
        data: {
          status: 'failed',
          errorMessage,
        },
      });

      await this.prisma.transaction.create({
        data: {
          organizationId: input.orgId,
          eventType: 'usage.burn',
          type: 'usage',
          status: 'failed',
          amount: input.units,
          currency: null,
          stripeSubscriptionId: subscription.stripeSubscriptionId,
          rawPayload: this.asJsonValue({
            usageEventId: failedUsageEvent.id,
            idempotencyKey: failedUsageEvent.idempotencyKey,
            strategy: failedUsageEvent.billingStrategy,
            stripePriceId: failedUsageEvent.stripePriceId,
            stripeSubscriptionId: failedUsageEvent.stripeSubscriptionId,
            errorMessage,
          }),
          occurredAt: new Date(),
        },
      });

      throw new InternalServerErrorException('Failed to record usage burn');
    }
  }

  private async handleBasePlusOverage(
    context: StrategyContext,
  ): Promise<StrategyResult> {
    const meterEvent = await this.sendMeterEvent({
      meterEventName: context.meterEventName,
      identifier: context.usageEventIdempotencyKey,
      stripeCustomerId: context.stripeCustomerId,
      value: context.units,
    });

    return {
      stripeMeterEventId: meterEvent.id,
      stripeMeterEventIdentifier: meterEvent.identifier,
      peakUnits: null,
      peakEventEmitted: false,
      rawPayload: this.asJsonValue({
        meterEvent: {
          id: meterEvent.id,
          identifier: meterEvent.identifier,
        },
      }),
    };
  }

  private async handleMaxMemberUsage(
    context: StrategyContext,
  ): Promise<StrategyResult> {
    const aggregation = await this.prisma.$transaction(async (tx) => {
      const memberUsage = await tx.memberPeriodUsage.upsert({
        where: {
          member_period_usage_unique: {
            organizationId: context.organizationId,
            stripePriceId: context.stripePriceId,
            userId: context.userId,
            periodStart: context.period.start,
            periodEnd: context.period.end,
          },
        },
        create: {
          organizationId: context.organizationId,
          stripePriceId: context.stripePriceId,
          userId: context.userId,
          periodStart: context.period.start,
          periodEnd: context.period.end,
          totalUnits: context.units,
        },
        update: {
          totalUnits: {
            increment: context.units,
          },
        },
      });

      const peakUsage = await tx.memberPeriodUsage.findFirst({
        where: {
          organizationId: context.organizationId,
          stripePriceId: context.stripePriceId,
          periodStart: context.period.start,
          periodEnd: context.period.end,
        },
        orderBy: [
          {
            totalUnits: 'desc',
          },
          {
            updatedAt: 'desc',
          },
        ],
        select: {
          userId: true,
          totalUnits: true,
        },
      });

      const currentPeak = peakUsage?.totalUnits ?? memberUsage.totalUnits;
      const sourceUserId = peakUsage?.userId ?? memberUsage.userId;

      const previousSnapshot = await tx.orgPeakUsageSnapshot.findFirst({
        where: {
          organizationId: context.organizationId,
          stripePriceId: context.stripePriceId,
          periodStart: context.period.start,
          periodEnd: context.period.end,
        },
        orderBy: [
          {
            peakUnits: 'desc',
          },
          {
            createdAt: 'desc',
          },
        ],
        select: {
          peakUnits: true,
        },
      });

      const previousPeak = previousSnapshot?.peakUnits ?? 0;
      if (currentPeak <= previousPeak) {
        return {
          peakUnits: currentPeak,
          snapshot: null,
        };
      }

      const peakSnapshot = await tx.orgPeakUsageSnapshot.create({
        data: {
          organizationId: context.organizationId,
          stripePriceId: context.stripePriceId,
          periodStart: context.period.start,
          periodEnd: context.period.end,
          peakUnits: currentPeak,
          sourceUserId,
          idempotencyKey: `${context.usageEventIdempotencyKey}:peak:${currentPeak}`,
          status: 'pending',
        },
        select: {
          id: true,
          idempotencyKey: true,
        },
      });

      return {
        peakUnits: currentPeak,
        snapshot: peakSnapshot,
      };
    });

    if (!aggregation.snapshot) {
      return {
        stripeMeterEventId: null,
        stripeMeterEventIdentifier: null,
        peakUnits: aggregation.peakUnits,
        peakEventEmitted: false,
        rawPayload: this.asJsonValue({
          peakUnits: aggregation.peakUnits,
          peakEventEmitted: false,
        }),
      };
    }

    try {
      const meterEvent = await this.sendMeterEvent({
        meterEventName: context.meterEventName,
        identifier: aggregation.snapshot.idempotencyKey,
        stripeCustomerId: context.stripeCustomerId,
        value: aggregation.peakUnits,
      });

      await this.prisma.orgPeakUsageSnapshot.update({
        where: {
          id: aggregation.snapshot.id,
        },
        data: {
          status: 'recorded',
          stripeMeterEventId: meterEvent.id,
          stripeMeterEventIdentifier: meterEvent.identifier,
          rawPayload: this.asJsonValue({
            meterEvent: {
              id: meterEvent.id,
              identifier: meterEvent.identifier,
            },
          }),
          errorMessage: null,
        },
      });

      return {
        stripeMeterEventId: meterEvent.id,
        stripeMeterEventIdentifier: meterEvent.identifier,
        peakUnits: aggregation.peakUnits,
        peakEventEmitted: true,
        rawPayload: this.asJsonValue({
          peakUnits: aggregation.peakUnits,
          peakEventEmitted: true,
          peakSnapshotId: aggregation.snapshot.id,
          meterEvent: {
            id: meterEvent.id,
            identifier: meterEvent.identifier,
          },
        }),
      };
    } catch (error) {
      await this.prisma.orgPeakUsageSnapshot.update({
        where: {
          id: aggregation.snapshot.id,
        },
        data: {
          status: 'failed',
          errorMessage: this.getErrorMessage(error),
        },
      });

      throw error;
    }
  }

  private async sendMeterEvent(input: {
    meterEventName: string;
    identifier: string;
    stripeCustomerId: string;
    value: number;
  }) {
    return this.stripeClient.billing.meterEvents.create({
      event_name: input.meterEventName,
      identifier: input.identifier,
      payload: {
        stripe_customer_id: input.stripeCustomerId,
        value: String(input.value),
      },
      timestamp: Math.floor(Date.now() / 1000),
    });
  }

  private async getOrganization(orgId: string) {
    const organization = await this.prisma.organization.findUnique({
      where: {
        id: orgId,
      },
      select: {
        id: true,
        stripeCustomerId: true,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    return organization;
  }

  private async getActiveSubscription(orgId: string, priceId: string) {
    console.log('input data active sub', orgId, priceId);
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        organizationId: orgId,
        stripePriceId: priceId,
        status: {
          in: [...BURNABLE_SUBSCRIPTION_STATUSES],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
      take: 2,
    });

    if (subscriptions.length === 0) {
      throw new ConflictException(
        `No active subscription for price "${priceId}". Please subscribe before burning units`,
      );
    }

    if (subscriptions.length > 1) {
      throw new ConflictException(
        `Multiple active subscriptions found for price "${priceId}". Please narrow selection by subscription in next API version`,
      );
    }

    return subscriptions[0];
  }

  private resolveMeterEventName(
    price: Pick<BillingPrice, 'meterId' | 'metadata'>,
  ) {
    const meterEventName =
      this.getMetadataString(price.metadata, 'meter_event_name') ??
      this.getMetadataString(price.metadata, 'event_name') ??
      this.getMetadataString(price.metadata, 'stripe_meter_event_name');

    if (meterEventName) {
      return meterEventName;
    }

    if (price.meterId && !price.meterId.startsWith('mtr_')) {
      return price.meterId;
    }

    return null;
  }

  private resolveBillingPeriod(
    subscription: Pick<Subscription, 'currentPeriodStart' | 'currentPeriodEnd'>,
  ): BillingPeriod {
    if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
      return {
        start: subscription.currentPeriodStart,
        end: subscription.currentPeriodEnd,
      };
    }

    const now = new Date();
    const start = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0, 0),
    );
    const end = new Date(
      Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1, 0, 0, 0, 0),
    );

    return {
      start,
      end,
    };
  }

  private normalizeIdempotencyKey(idempotencyKey?: string) {
    const normalized = idempotencyKey?.trim();
    return normalized && normalized.length > 0 ? normalized : randomUUID();
  }

  private getMetadataString(metadata: Prisma.JsonValue | null, key: string) {
    if (!metadata || typeof metadata !== 'object' || Array.isArray(metadata)) {
      return undefined;
    }

    const value = metadata[key];
    return typeof value === 'string' ? value : undefined;
  }

  private toResponse(
    usageEvent: UsageEvent,
    options: {
      duplicate: boolean;
      peakUnits: number | null;
      peakEventEmitted: boolean;
    },
  ) {
    return {
      usageEventId: usageEvent.id,
      idempotencyKey: usageEvent.idempotencyKey,
      duplicate: options.duplicate,
      strategy: usageEvent.billingStrategy,
      stripePriceId: usageEvent.stripePriceId,
      stripeSubscriptionId: usageEvent.stripeSubscriptionId,
      status: usageEvent.status,
      units: usageEvent.units,
      reason: usageEvent.reason,
      stripeMeterEventId: usageEvent.stripeMeterEventId,
      stripeMeterEventIdentifier: usageEvent.stripeMeterEventIdentifier,
      peakUnits: options.peakUnits,
      peakEventEmitted: options.peakEventEmitted,
      periodStart: usageEvent.periodStart?.toISOString() ?? null,
      periodEnd: usageEvent.periodEnd?.toISOString() ?? null,
      errorMessage: usageEvent.errorMessage,
      createdAt: usageEvent.createdAt.toISOString(),
    };
  }

  private asJsonValue(value: Record<string, unknown>) {
    return value as Prisma.InputJsonValue;
  }

  private getErrorMessage(error: unknown) {
    if (error instanceof Error) {
      return error.message;
    }

    return String(error);
  }
}
