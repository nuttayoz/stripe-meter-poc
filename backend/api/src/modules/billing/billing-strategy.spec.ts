import { BillingStrategy } from '@prisma/client';
import { inferBillingStrategy, toBillingStrategy } from './billing-strategy';

describe('billing-strategy', () => {
  describe('toBillingStrategy', () => {
    it('maps PLAN_A aliases', () => {
      expect(toBillingStrategy('base_plus_overage')).toBe(
        BillingStrategy.BASE_PLUS_OVERAGE,
      );
      expect(toBillingStrategy('plan_a')).toBe(
        BillingStrategy.BASE_PLUS_OVERAGE,
      );
    });

    it('maps PLAN_B aliases', () => {
      expect(toBillingStrategy('max_member_usage')).toBe(
        BillingStrategy.MAX_MEMBER_USAGE,
      );
      expect(toBillingStrategy('plan_b')).toBe(
        BillingStrategy.MAX_MEMBER_USAGE,
      );
    });
  });

  describe('inferBillingStrategy', () => {
    it('uses price metadata first', () => {
      const result = inferBillingStrategy(
        { billing_strategy: 'plan_a' },
        { billing_strategy: 'plan_b' },
      );

      expect(result).toBe(BillingStrategy.BASE_PLUS_OVERAGE);
    });

    it('falls back to product metadata', () => {
      const result = inferBillingStrategy(
        {},
        { billing_strategy: 'max_member_usage' },
      );

      expect(result).toBe(BillingStrategy.MAX_MEMBER_USAGE);
    });

    it('returns unknown for missing metadata', () => {
      const result = inferBillingStrategy({}, {});
      expect(result).toBe(BillingStrategy.UNKNOWN);
    });
  });
});
