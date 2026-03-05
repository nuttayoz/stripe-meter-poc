import { Controller, Get, Query, Req, UseGuards } from '@nestjs/common';
import {
  AccessTokenGuard,
  type AuthenticatedRequest,
} from '../auth/guards/access-token.guard';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';
import { TransactionsService } from './transactions.service';

@Controller('transactions')
@UseGuards(AccessTokenGuard)
export class TransactionsController {
  constructor(private readonly transactionsService: TransactionsService) {}

  @Get()
  async listTransactions(
    @Req() request: AuthenticatedRequest,
    @Query() query: ListTransactionsQueryDto,
  ) {
    return this.transactionsService.listForOrganization(
      request.authUser.orgId,
      query,
    );
  }
}
