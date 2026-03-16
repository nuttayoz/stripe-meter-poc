import { Global, Module } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { loadStripeConstructor } from './stripe.client';
import { STRIPE_CLIENT } from './stripe.constants';

@Global()
@Module({
  providers: [
    {
      provide: STRIPE_CLIENT,
      inject: [ConfigService],
      useFactory: (configService: ConfigService) => {
        const stripeSecretKey =
          configService.getOrThrow<string>('STRIPE_SECRET_KEY');
        const StripeConstructor = loadStripeConstructor();

        return new StripeConstructor(stripeSecretKey, {
          maxNetworkRetries: 2,
          appInfo: {
            name: 'stripe-meter-poc',
            version: process.env.npm_package_version ?? '0.0.1',
          },
        });
      },
    },
  ],
  exports: [STRIPE_CLIENT],
})
export class StripeClientModule {}
