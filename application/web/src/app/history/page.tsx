'use client';

import { useInfiniteQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { useLogout, useSession } from '@/hooks/use-session';
import { getTransactions, type TransactionItem } from '@/lib/api';

const PAGE_LIMIT = 25;

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatAmount(transaction: TransactionItem) {
  if (transaction.amount === null) {
    return '-';
  }

  if (!transaction.currency) {
    return String(transaction.amount);
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: transaction.currency.toUpperCase(),
  }).format(transaction.amount / 100);
}

function toIsoStartOfDay(value: string) {
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function toIsoEndOfDay(value: string) {
  return new Date(`${value}T23:59:59.999Z`).toISOString();
}

export default function HistoryPage() {
  const router = useRouter();
  const sessionQuery = useSession();
  const logoutMutation = useLogout();
  const accessToken = sessionQuery.data?.accessToken ?? null;

  const [typeFilter, setTypeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');

  const transactionsQuery = useInfiniteQuery({
    queryKey: [
      'transactions-history',
      accessToken,
      typeFilter,
      statusFilter,
      fromDate,
      toDate,
    ],
    enabled: !!accessToken,
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      return getTransactions(accessToken, {
        cursor: pageParam,
        limit: PAGE_LIMIT,
        type: typeFilter || undefined,
        status: statusFilter || undefined,
        from: fromDate ? toIsoStartOfDay(fromDate) : undefined,
        to: toDate ? toIsoEndOfDay(toDate) : undefined,
      });
    },
    getNextPageParam: (lastPage) => lastPage.pageInfo.nextCursor ?? undefined,
  });

  const transactions = useMemo(
    () => transactionsQuery.data?.pages.flatMap((page) => page.transactions) ?? [],
    [transactionsQuery.data],
  );

  async function onLogout() {
    await logoutMutation.mutateAsync();
    router.replace('/login');
  }

  return (
    <RouteGuard mode="protected" redirectTo="/login">
      {sessionQuery.isLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-sm text-zinc-700">
          Loading history...
        </div>
      ) : (
        <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
          <main className="mx-auto w-full max-w-6xl space-y-8">
            <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Stripe Meter POC
                </p>
                <h1 className="mt-2 text-2xl font-semibold">Transaction History</h1>
                <p className="mt-1 text-sm text-zinc-600">
                  Operator: <span className="font-medium">{sessionQuery.data?.user.email}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100"
                  href="/plans"
                >
                  Plans
                </Link>
                <Link
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100"
                  href="/burn"
                >
                  Burn
                </Link>
                <button
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-60"
                  type="button"
                  onClick={() => void onLogout()}
                  disabled={logoutMutation.isPending}
                >
                  {logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
                </button>
              </div>
            </header>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <h2 className="text-lg font-semibold">Filters</h2>
              <div className="mt-4 grid gap-4 md:grid-cols-4">
                <label className="space-y-2 text-sm">
                  <span className="text-zinc-600">Type</span>
                  <input
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                    placeholder="usage, invoice, subscription..."
                    value={typeFilter}
                    onChange={(event) => setTypeFilter(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-zinc-600">Status</span>
                  <input
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                    placeholder="succeeded, failed, paid..."
                    value={statusFilter}
                    onChange={(event) => setStatusFilter(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-zinc-600">From</span>
                  <input
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                    type="date"
                    value={fromDate}
                    onChange={(event) => setFromDate(event.target.value)}
                  />
                </label>
                <label className="space-y-2 text-sm">
                  <span className="text-zinc-600">To</span>
                  <input
                    className="w-full rounded-lg border border-zinc-300 px-3 py-2"
                    type="date"
                    value={toDate}
                    onChange={(event) => setToDate(event.target.value)}
                  />
                </label>
              </div>
            </section>

            <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              {transactionsQuery.isLoading ? (
                <p className="text-sm text-zinc-600">Loading transactions...</p>
              ) : null}

              {transactionsQuery.isError ? (
                <p className="text-sm text-red-700">
                  Failed to load transactions. Please retry.
                </p>
              ) : null}

              {!transactionsQuery.isLoading &&
              !transactionsQuery.isError &&
              transactions.length === 0 ? (
                <p className="text-sm text-zinc-600">No transaction records found.</p>
              ) : null}

              {transactions.length > 0 ? (
                <div className="overflow-hidden rounded-xl border border-zinc-200">
                  <table className="min-w-full divide-y divide-zinc-200 text-sm">
                    <thead className="bg-zinc-100 text-left text-zinc-600">
                      <tr>
                        <th className="px-4 py-2 font-medium">Occurred</th>
                        <th className="px-4 py-2 font-medium">Type</th>
                        <th className="px-4 py-2 font-medium">Status</th>
                        <th className="px-4 py-2 font-medium">Amount</th>
                        <th className="px-4 py-2 font-medium">Subscription</th>
                        <th className="px-4 py-2 font-medium">Event</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-200 bg-white">
                      {transactions.map((transaction) => (
                        <tr key={transaction.id}>
                          <td className="px-4 py-3">
                            {formatDateTime(transaction.occurredAt)}
                          </td>
                          <td className="px-4 py-3">{transaction.type}</td>
                          <td className="px-4 py-3">{transaction.status}</td>
                          <td className="px-4 py-3">{formatAmount(transaction)}</td>
                          <td className="px-4 py-3">
                            {transaction.stripeSubscriptionId ?? '-'}
                          </td>
                          <td className="px-4 py-3">{transaction.eventType}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : null}

              {transactionsQuery.hasNextPage ? (
                <div className="mt-4">
                  <button
                    className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-60"
                    type="button"
                    onClick={() => void transactionsQuery.fetchNextPage()}
                    disabled={transactionsQuery.isFetchingNextPage}
                  >
                    {transactionsQuery.isFetchingNextPage
                      ? 'Loading more...'
                      : 'Load more'}
                  </button>
                </div>
              ) : null}
            </section>
          </main>
        </div>
      )}
    </RouteGuard>
  );
}
