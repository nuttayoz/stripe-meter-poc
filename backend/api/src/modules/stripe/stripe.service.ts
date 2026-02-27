import { Inject, Injectable } from '@nestjs/common';
import type { StripeClient } from '../../infrastructure/stripe/stripe.client';
import { STRIPE_CLIENT } from '../../infrastructure/stripe/stripe.constants';

@Injectable()
export class StripeService {
  constructor(
    @Inject(STRIPE_CLIENT) private readonly stripeClient: StripeClient,
  ) {}

  async getHealth() {
    const account = await this.stripeClient.accounts.retrieve();

    return {
      provider: 'stripe',
      status: 'ok',
      accountId: account.id,
      livemode: account.livemode,
    };
  }
}
