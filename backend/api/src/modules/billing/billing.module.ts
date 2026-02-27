import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StripeClientModule } from '../../infrastructure/stripe/stripe-client.module';
import { AuthModule } from '../auth/auth.module';
import { BillingController } from './billing.controller';
import { BillingService } from './billing.service';

@Module({
  imports: [AuthModule, PrismaModule, StripeClientModule],
  controllers: [BillingController],
  providers: [BillingService],
})
export class BillingModule {}
