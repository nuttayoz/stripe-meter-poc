import { Inject, Injectable } from '@nestjs/common';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import type {
  StripeClient,
  StripePrice,
} from '../../infrastructure/stripe/stripe.client';
import { STRIPE_CLIENT } from '../../infrastructure/stripe/stripe.constants';
import { inferBillingStrategy } from './billing-strategy';

type StripeCollection<T extends { id: string }> = {
  data: T[];
  has_more: boolean;
};

@Injectable()
export class BillingService {
  constructor(
    private readonly prisma: PrismaService,
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

  private resolveProductId(price: StripePrice) {
    if (typeof price.product === 'string') {
      return price.product;
    }

    if (price.product && typeof price.product.id === 'string') {
      return price.product.id;
    }

    return null;
  }
}
