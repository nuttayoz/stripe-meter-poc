import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  StripeClient,
  StripePrice,
  StripeSubscription,
} from '../../infrastructure/stripe/stripe.client';
import { STRIPE_CLIENT } from '../../infrastructure/stripe/stripe.constants';
import { inferBillingStrategy } from './billing-strategy';

type StripeCollection<T extends { id: string }> = {
  data: T[];
  has_more: boolean;
};

const ACTIVE_SUBSCRIPTION_STATUSES = [
  'active',
  'trialing',
  'past_due',
] as const;

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly configService: ConfigService,
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
  ) {}

  async syncCatalog() {
    const products = await this.listAllProducts();
    const prices = await this.listAllPrices();

    const productsById = new Map(
      products.map((product) => [product.id, product]),
    );
    const syncedProducts = new Set<string>();
    const syncedPrices = new Set<string>();

    await this.prisma.$transaction(async (tx) => {
      for (const product of products) {
        await tx.billingProduct.upsert({
          where: {
            stripeProductId: product.id,
          },
          create: {
            stripeProductId: product.id,
            name: product.name,
            description: product.description,
            active: product.active,
            metadata: product.metadata,
          },
          update: {
            name: product.name,
            description: product.description,
            active: product.active,
            metadata: product.metadata,
          },
        });

        syncedProducts.add(product.id);
      }

      for (const price of prices) {
        const stripeProductId = this.resolveProductId(price);
        if (!stripeProductId) {
          continue;
        }

        const product = productsById.get(stripeProductId);
        const productMetadata = product?.metadata ?? {};

        await tx.billingPrice.upsert({
          where: {
            stripePriceId: price.id,
          },
          create: {
            stripePriceId: price.id,
            stripeProductId,
            type: price.type,
            currency: price.currency,
            unitAmount: price.unit_amount,
            recurringInterval: price.recurring?.interval ?? null,
            recurringIntervalCount: price.recurring?.interval_count ?? null,
            usageType: price.recurring?.usage_type ?? null,
            meterId: price.recurring?.meter ?? null,
            taxBehavior: price.tax_behavior,
            billingStrategy: inferBillingStrategy(
              price.metadata,
              productMetadata,
            ),
            active: price.active,
            metadata: price.metadata,
          },
          update: {
            stripeProductId,
            type: price.type,
            currency: price.currency,
            unitAmount: price.unit_amount,
            recurringInterval: price.recurring?.interval ?? null,
            recurringIntervalCount: price.recurring?.interval_count ?? null,
            usageType: price.recurring?.usage_type ?? null,
            meterId: price.recurring?.meter ?? null,
            taxBehavior: price.tax_behavior,
            billingStrategy: inferBillingStrategy(
              price.metadata,
              productMetadata,
            ),
            active: price.active,
            metadata: price.metadata,
          },
        });

        syncedPrices.add(price.id);
      }

      if (syncedProducts.size > 0) {
        await tx.billingProduct.updateMany({
          where: {
            stripeProductId: {
              notIn: Array.from(syncedProducts),
            },
          },
          data: {
            active: false,
          },
        });
      } else {
        await tx.billingProduct.updateMany({
          data: {
            active: false,
          },
        });
      }

      if (syncedPrices.size > 0) {
        await tx.billingPrice.updateMany({
          where: {
            stripePriceId: {
              notIn: Array.from(syncedPrices),
            },
          },
          data: {
            active: false,
          },
        });
      } else {
        await tx.billingPrice.updateMany({
          data: {
            active: false,
          },
        });
      }
    });

    return {
      syncedProducts: syncedProducts.size,
      syncedPrices: syncedPrices.size,
      syncedAt: new Date().toISOString(),
    };
  }

  async getPlans() {
    const prices = await this.prisma.billingPrice.findMany({
      where: {
        active: true,
      },
      include: {
        product: true,
      },
      orderBy: [
        {
          product: {
            name: 'asc',
          },
        },
        {
          unitAmount: 'asc',
        },
      ],
    });

    return {
      plans: prices.map((price) => ({
        priceId: price.stripePriceId,
        productId: price.product.stripeProductId,
        productName: price.product.name,
        productDescription: price.product.description,
        active: price.active,
        type: price.type,
        currency: price.currency,
        unitAmount: price.unitAmount,
        recurringInterval: price.recurringInterval,
        recurringIntervalCount: price.recurringIntervalCount,
        usageType: price.usageType,
        meterId: price.meterId,
        taxBehavior: price.taxBehavior,
        billingStrategy: price.billingStrategy,
        metadata: price.metadata,
      })),
    };
  }

  async getActiveSubscriptions(orgId: string) {
    const subscriptions = await this.prisma.subscription.findMany({
      where: {
        organizationId: orgId,
        status: {
          in: [...ACTIVE_SUBSCRIPTION_STATUSES],
        },
      },
      orderBy: {
        updatedAt: 'desc',
      },
    });

    const stripePriceIds = Array.from(
      new Set(
        subscriptions
          .map((subscription) => subscription.stripePriceId)
          .filter((stripePriceId): stripePriceId is string =>
            Boolean(stripePriceId),
          ),
      ),
    );

    const prices =
      stripePriceIds.length > 0
        ? await this.prisma.billingPrice.findMany({
            where: {
              stripePriceId: {
                in: stripePriceIds,
              },
            },
            include: {
              product: true,
            },
          })
        : [];

    const pricesById = new Map(
      prices.map((price) => [price.stripePriceId, price] as const),
    );

    return {
      subscriptions: subscriptions.map((subscription) => {
        const price = subscription.stripePriceId
          ? pricesById.get(subscription.stripePriceId)
          : undefined;

        return {
          subscriptionId: subscription.stripeSubscriptionId,
          priceId: subscription.stripePriceId,
          status: subscription.status,
          currentPeriodStart:
            subscription.currentPeriodStart?.toISOString() ?? null,
          currentPeriodEnd:
            subscription.currentPeriodEnd?.toISOString() ?? null,
          productName: price?.product.name ?? null,
          productDescription: price?.product.description ?? null,
          billingStrategy: price?.billingStrategy ?? 'UNKNOWN',
          currency: price?.currency ?? null,
          unitAmount: price?.unitAmount ?? null,
          recurringInterval: price?.recurringInterval ?? null,
        };
      }),
    };
  }

  async createCheckoutSession(params: {
    orgId: string;
    userId: string;
    priceId: string;
  }) {
    const { orgId, userId, priceId } = params;
    const price = await this.prisma.billingPrice.findUnique({
      where: {
        stripePriceId: priceId,
      },
      include: {
        product: true,
      },
    });

    if (!price || !price.active || !price.product.active) {
      throw new NotFoundException('Selected plan is not available');
    }

    if (price.type !== 'recurring') {
      throw new BadRequestException(
        'Only recurring prices are supported for checkout',
      );
    }

    const organization = await this.prisma.organization.findUnique({
      where: {
        id: orgId,
      },
    });

    if (!organization) {
      throw new NotFoundException('Organization not found');
    }

    const stripeCustomerId = await this.ensureStripeCustomer(organization);
    const existingSubscriptions =
      await this.listAllSubscriptions(stripeCustomerId);

    const hasActiveSubscriptionForPrice = existingSubscriptions.some(
      (subscription) =>
        this.isSubscriptionBlocking(subscription.status) &&
        this.subscriptionContainsPrice(subscription, price.stripePriceId),
    );

    if (hasActiveSubscriptionForPrice) {
      throw new ConflictException(
        'Organization already has an active subscription for this plan',
      );
    }

    const appBaseUrl = this.configService.getOrThrow<string>('APP_BASE_URL');
    const successUrl = `${appBaseUrl}/plans?checkout=success&session_id={CHECKOUT_SESSION_ID}`;
    const cancelUrl = `${appBaseUrl}/plans?checkout=canceled`;

    const checkoutSession = await this.stripeClient.checkout.sessions.create({
      mode: 'subscription',
      customer: stripeCustomerId,
      line_items: [
        {
          price: price.stripePriceId,
        },
      ],
      subscription_data: {
        default_tax_rates: ['txr_1T2Re6F6bJOUXc3rHQMVWaqO'],
      },
      success_url: successUrl,
      cancel_url: cancelUrl,
      client_reference_id: organization.id,
      metadata: {
        organization_id: organization.id,
        user_id: userId,
        stripe_price_id: price.stripePriceId,
        billing_strategy: price.billingStrategy,
      },
    });

    if (!checkoutSession.url) {
      throw new InternalServerErrorException(
        'Stripe checkout URL is missing in session response',
      );
    }

    return {
      checkoutUrl: checkoutSession.url,
      checkoutSessionId: checkoutSession.id,
    };
  }

  private async listAllProducts() {
    return this.listAll((startingAfter) =>
      this.stripeClient.products.list({
        active: true,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    );
  }

  private async listAllPrices() {
    return this.listAll((startingAfter) =>
      this.stripeClient.prices.list({
        active: true,
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    );
  }

  private async listAll<T extends { id: string }>(
    fetchPage: (startingAfter?: string) => Promise<StripeCollection<T>>,
  ) {
    const allItems: T[] = [];
    let lastItemId: string | undefined;

    while (true) {
      const page = await fetchPage(lastItemId);
      allItems.push(...page.data);

      if (!page.has_more || page.data.length === 0) {
        break;
      }

      const lastItem = page.data[page.data.length - 1];
      lastItemId = lastItem.id;
    }

    return allItems;
  }

  private async listAllSubscriptions(customerId: string) {
    return this.listAll((startingAfter) =>
      this.stripeClient.subscriptions.list({
        customer: customerId,
        status: 'all',
        limit: 100,
        ...(startingAfter ? { starting_after: startingAfter } : {}),
      }),
    );
  }

  private resolveProductId(price: StripePrice) {
    if (typeof price.product === 'string') {
      return price.product;
    }

    if (price.product && typeof price.product.id === 'string') {
      return price.product.id;
    }

    return null;
  }

  private async ensureStripeCustomer(organization: {
    id: string;
    name: string;
    stripeCustomerId: string | null;
  }) {
    if (organization.stripeCustomerId) {
      return organization.stripeCustomerId;
    }

    const customer = await this.stripeClient.customers.create({
      name: organization.name,
      metadata: {
        organization_id: organization.id,
      },
    });

    await this.prisma.organization.update({
      where: {
        id: organization.id,
      },
      data: {
        stripeCustomerId: customer.id,
      },
    });

    return customer.id;
  }

  private isSubscriptionBlocking(status: StripeSubscription['status']) {
    return status !== 'canceled' && status !== 'incomplete_expired';
  }

  private subscriptionContainsPrice(
    subscription: StripeSubscription,
    stripePriceId: string,
  ) {
    return (
      subscription.items?.data.some((item) => {
        const price = item.price;

        if (typeof price === 'string') {
          return price === stripePriceId;
        }

        return price?.id === stripePriceId;
      }) ?? false
    );
  }
}
