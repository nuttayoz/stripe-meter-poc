import { Body, Controller, Post, Req, UseGuards } from '@nestjs/common';
import { BurnUnitsDto } from './dto/burn-units.dto';
import { BurnService } from './burn.service';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/guards/access-token.guard';

@Controller('usage')
@UseGuards(AccessTokenGuard)
export class BurnController {
  constructor(private readonly burnService: BurnService) {}

  @Post('burn')
  async burn(@Req() request: AuthenticatedRequest, @Body() dto: BurnUnitsDto) {
    return this.burnService.burn({
      orgId: request.authUser.orgId,
      userId: request.authUser.sub,
      priceId: dto.priceId,
      units: dto.units,
      reason: dto.reason,
      idempotencyKey: dto.idempotencyKey,
    });
  }
}
