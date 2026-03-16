import { Module } from '@nestjs/common';
import { PrismaModule } from '../../infrastructure/prisma/prisma.module';
import { StripeClientModule } from '../../infrastructure/stripe/stripe-client.module';
import { AuthModule } from '../auth/auth.module';
import { BurnController } from './burn.controller';
import { BurnService } from './burn.service';

@Module({
  imports: [AuthModule, PrismaModule, StripeClientModule],
  controllers: [BurnController],
  providers: [BurnService],
})
export class BurnModule {}
