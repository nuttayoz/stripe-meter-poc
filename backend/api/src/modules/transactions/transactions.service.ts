import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma, type Transaction } from '@prisma/client';
import { PrismaService } from '../../infrastructure/prisma/prisma.service';
import { ListTransactionsQueryDto } from './dto/list-transactions.query.dto';

const DEFAULT_LIMIT = 20;

type CursorPayload = {
  occurredAt: Date;
  id: string;
};

@Injectable()
export class TransactionsService {
  constructor(private readonly prisma: PrismaService) {}

  async listForOrganization(
    organizationId: string,
    query: ListTransactionsQueryDto,
  ) {
    const limit = query.limit ?? DEFAULT_LIMIT;
    const cursor = query.cursor ? this.decodeCursor(query.cursor) : null;
    const fromDate = query.from ? this.parseDate(query.from, 'from') : null;
    const toDate = query.to ? this.parseDate(query.to, 'to') : null;

    const where: Prisma.TransactionWhereInput = {
      organizationId,
      ...(query.type ? { type: query.type } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(fromDate || toDate
        ? {
            occurredAt: {
              ...(fromDate ? { gte: fromDate } : {}),
              ...(toDate ? { lte: toDate } : {}),
            },
          }
        : {}),
    };

    const pagedWhere = cursor
      ? {
          AND: [
            where,
            {
              OR: [
                {
                  occurredAt: {
                    lt: cursor.occurredAt,
                  },
                },
                {
                  occurredAt: cursor.occurredAt,
                  id: {
                    lt: cursor.id,
                  },
                },
              ],
            },
          ],
        }
      : where;

    const rows = await this.prisma.transaction.findMany({
      where: pagedWhere,
      orderBy: [{ occurredAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = rows.length > limit;
    const items = hasMore ? rows.slice(0, limit) : rows;
    const nextCursor =
      hasMore && items.length > 0
        ? this.encodeCursor(items[items.length - 1])
        : null;

    return {
      transactions: items.map((transaction) =>
        this.toTransactionResponse(transaction),
      ),
      pageInfo: {
        limit,
        hasMore,
        nextCursor,
      },
    };
  }

  private toTransactionResponse(transaction: Transaction) {
    return {
      id: transaction.id,
      stripeEventId: transaction.stripeEventId,
      eventType: transaction.eventType,
      type: transaction.type,
      status: transaction.status,
      amount: transaction.amount,
      currency: transaction.currency,
      stripeInvoiceId: transaction.stripeInvoiceId,
      stripePaymentIntentId: transaction.stripePaymentIntentId,
      stripeChargeId: transaction.stripeChargeId,
      stripeSubscriptionId: transaction.stripeSubscriptionId,
      rawPayload: transaction.rawPayload,
      occurredAt: transaction.occurredAt.toISOString(),
      createdAt: transaction.createdAt.toISOString(),
      updatedAt: transaction.updatedAt.toISOString(),
    };
  }

  private parseDate(value: string, fieldName: string) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      throw new BadRequestException(`Invalid ${fieldName} timestamp`);
    }

    return date;
  }

  private decodeCursor(value: string): CursorPayload {
    try {
      const decoded = Buffer.from(value, 'base64url').toString('utf8');
      const [occurredAtText, id] = decoded.split('|');

      if (!occurredAtText || !id) {
        throw new Error('Cursor format is invalid');
      }

      const occurredAt = new Date(occurredAtText);
      if (Number.isNaN(occurredAt.getTime())) {
        throw new Error('Cursor timestamp is invalid');
      }

      return { occurredAt, id };
    } catch {
      throw new BadRequestException('Invalid cursor');
    }
  }

  private encodeCursor(transaction: Transaction) {
    const value = `${transaction.occurredAt.toISOString()}|${transaction.id}`;
    return Buffer.from(value, 'utf8').toString('base64url');
  }
}
