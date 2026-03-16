import { BillingStrategy } from '@prisma/client';

function normalizeKey(value?: string) {
  return value?.trim().toLowerCase();
}

export function toBillingStrategy(value?: string) {
  const normalized = normalizeKey(value);

  if (normalized === 'base_plus_overage' || normalized === 'plan_a') {
    return BillingStrategy.BASE_PLUS_OVERAGE;
  }

  if (normalized === 'max_member_usage' || normalized === 'plan_b') {
    return BillingStrategy.MAX_MEMBER_USAGE;
  }

  return BillingStrategy.UNKNOWN;
}

export function inferBillingStrategy(
  priceMetadata: Record<string, string>,
  productMetadata: Record<string, string>,
) {
  const priceStrategy = toBillingStrategy(priceMetadata.billing_strategy);
  if (priceStrategy !== BillingStrategy.UNKNOWN) {
    return priceStrategy;
  }

  const productStrategy = toBillingStrategy(productMetadata.billing_strategy);
  if (productStrategy !== BillingStrategy.UNKNOWN) {
    return productStrategy;
  }

  return BillingStrategy.UNKNOWN;
}
