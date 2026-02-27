import {
  Controller,
  ForbiddenException,
  Get,
  Post,
  Req,
  UseGuards,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { BillingService } from './billing.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/guards/access-token.guard';

@Controller('billing')
@UseGuards(AccessTokenGuard)
export class BillingController {
  constructor(private readonly billingService: BillingService) {}

  @Post('catalog/sync')
  async syncCatalog(@Req() request: AuthenticatedRequest) {
    const role = request.authUser.role;
    if (role !== UserRole.OWNER && role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only owner/admin can sync billing catalog');
    }

    return this.billingService.syncCatalog();
  }

  @Get('plans')
  async getPlans() {
    return this.billingService.getPlans();
  }
}
