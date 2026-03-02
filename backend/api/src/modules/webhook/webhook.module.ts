import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StripeClientModule } from '../../infrastructure/stripe/stripe-client.module';
import { WebhookController } from './webhook.controller';
import { WebhookService } from './webhook.service';

@Module({
  imports: [PrismaModule, StripeClientModule],
  controllers: [WebhookController],
  providers: [WebhookService],
})
export class WebhookModule {}
