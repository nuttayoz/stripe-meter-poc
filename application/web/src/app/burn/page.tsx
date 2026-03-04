'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { useLogout, useSession } from '@/hooks/use-session';
import {
  ApiError,
  burnUnits,
  getBillingPlans,
  type BillingPlan,
  type BurnUnitsResponse,
} from '@/lib/api';
import {
  getDemoSelectedPriceId,
  setDemoSelectedPriceId,
} from '@/lib/subscription-storage';

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function createIdempotencyKey() {
  if (
    typeof window !== 'undefined' &&
    typeof window.crypto !== 'undefined' &&
    typeof window.crypto.randomUUID === 'function'
  ) {
    return window.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

function toFriendlyStrategyLabel(strategy: string) {
  if (strategy === 'BASE_PLUS_OVERAGE') {
    return 'Base + Overage';
  }

  if (strategy === 'MAX_MEMBER_USAGE') {
    return 'Max Member Usage';
  }

  return strategy;
}

export default function BurnPage() {
  const router = useRouter();
  const sessionQuery = useSession();
  const logoutMutation = useLogout();
  const accessToken = sessionQuery.data?.accessToken ?? null;
  const [selectedPriceId, setSelectedPriceId] = useState<string | null>(
    getDemoSelectedPriceId(),
  );
  const [history, setHistory] = useState<BurnUnitsResponse[]>([]);
  const [feedbackMessage, setFeedbackMessage] = useState<string | null>(null);

  const plansQuery = useQuery({
    queryKey: ['billing-plans', accessToken],
    enabled: !!accessToken,
    queryFn: async () => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      return getBillingPlans(accessToken);
    },
  });

  const totalBurned = useMemo(
    () => history.reduce((sum, event) => sum + event.units, 0),
    [history],
  );

  const sortedPlans = useMemo(() => {
    const plans = plansQuery.data?.plans ?? [];
    return [...plans].sort((left, right) =>
      left.productName.localeCompare(right.productName),
    );
  }, [plansQuery.data]);

  const resolvedSelectedPriceId = useMemo(() => {
    if (sortedPlans.length === 0) {
      return null;
    }

    if (
      selectedPriceId &&
      sortedPlans.some((plan) => plan.priceId === selectedPriceId)
    ) {
      return selectedPriceId;
    }

    return sortedPlans[0]?.priceId ?? null;
  }, [selectedPriceId, sortedPlans]);

  const selectedPlan: BillingPlan | null =
    sortedPlans.find((plan) => plan.priceId === resolvedSelectedPriceId) ??
    null;

  const burnMutation = useMutation({
    mutationFn: async (params: { units: number; reason: string }) => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      if (!resolvedSelectedPriceId) {
        throw new Error('Missing selected price id');
      }

      return burnUnits(accessToken, {
        priceId: resolvedSelectedPriceId,
        units: params.units,
        reason: params.reason,
        idempotencyKey: createIdempotencyKey(),
      });
    },
    onSuccess: (result) => {
      setHistory((previous) => [result, ...previous].slice(0, 25));
      setDemoSelectedPriceId(result.stripePriceId);
      setFeedbackMessage(
        result.duplicate
          ? 'Duplicate request detected; no additional usage recorded.'
          : `Usage recorded (${result.strategy}).`,
      );
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setFeedbackMessage(
          'Selected plan is not an active subscription for this organization.',
        );
        return;
      }

      setFeedbackMessage('Failed to burn units. Please retry.');
    },
  });

  function burnPreset(units: number, reason: string) {
    burnMutation.mutate({ units, reason });
  }

  function resetUsage() {
    setHistory([]);
    setFeedbackMessage(null);
  }

  async function onLogout() {
    await logoutMutation.mutateAsync();
    router.replace('/login');
  }

  return (
    <RouteGuard mode="protected" redirectTo="/login">
      {sessionQuery.isLoading ? (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-sm text-zinc-700">
          Loading burn page...
        </div>
      ) : (
        <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
          <main className="mx-auto w-full max-w-5xl space-y-8">
            <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                  Stripe Meter POC
                </p>
                <h1 className="mt-2 text-2xl font-semibold">Burn Unit Simulator</h1>
                <p className="mt-1 text-sm text-zinc-600">
                  Operator: <span className="font-medium">{sessionQuery.data?.user.email}</span>
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Link
                  className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100"
                  href="/plans"
                >
                  Back to Plans
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
              <h2 className="text-lg font-semibold">Select Plan</h2>
              <p className="mt-1 text-sm text-zinc-600">
                Choose which plan you want to burn credits against.
              </p>
              {plansQuery.isLoading ? (
                <p className="mt-3 text-sm text-zinc-500">Loading plans...</p>
              ) : null}
              {plansQuery.isError ? (
                <p className="mt-3 text-sm text-red-700">
                  Failed to load plans. Please go back to plans page and sync catalog.
                </p>
              ) : null}
              {!plansQuery.isLoading && !plansQuery.isError && sortedPlans.length === 0 ? (
                <p className="mt-3 text-sm text-zinc-600">
                  No plans available in catalog yet.
                </p>
              ) : null}
              {sortedPlans.length > 0 ? (
                <div className="mt-4 space-y-3">
                  <label className="block text-xs font-semibold uppercase tracking-[0.14em] text-zinc-500">
                    Plan
                  </label>
                  <select
                    className="w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm"
                    value={resolvedSelectedPriceId ?? ''}
                    onChange={(event) => {
                      const nextPriceId = event.target.value;
                      setSelectedPriceId(nextPriceId);
                      setDemoSelectedPriceId(nextPriceId);
                      setFeedbackMessage(null);
                    }}
                    disabled={burnMutation.isPending}
                  >
                    {sortedPlans.map((plan) => (
                      <option key={plan.priceId} value={plan.priceId}>
                        {plan.productName} ({toFriendlyStrategyLabel(plan.billingStrategy)})
                      </option>
                    ))}
                  </select>
                  {selectedPlan ? (
                    <p className="text-xs text-zinc-500">
                      Selected: <span className="font-medium">{selectedPlan.productName}</span>{' '}
                      ({toFriendlyStrategyLabel(selectedPlan.billingStrategy)}) /{' '}
                      <span className="font-mono">{selectedPlan.priceId}</span>
                    </p>
                  ) : null}
                </div>
              ) : null}
            </section>

            {resolvedSelectedPriceId ? (
              <>
                <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-3">
                  <button
                    className="rounded-xl border border-zinc-300 px-4 py-5 text-left transition hover:bg-zinc-100 disabled:opacity-60"
                    type="button"
                    onClick={() => burnPreset(10, 'light')}
                    disabled={burnMutation.isPending}
                  >
                    <p className="text-sm font-semibold">Burn 10 units</p>
                    <p className="mt-1 text-xs text-zinc-500">Light operation</p>
                  </button>
                  <button
                    className="rounded-xl border border-zinc-300 px-4 py-5 text-left transition hover:bg-zinc-100 disabled:opacity-60"
                    type="button"
                    onClick={() => burnPreset(25, 'normal')}
                    disabled={burnMutation.isPending}
                  >
                    <p className="text-sm font-semibold">Burn 25 units</p>
                    <p className="mt-1 text-xs text-zinc-500">Normal operation</p>
                  </button>
                  <button
                    className="rounded-xl border border-zinc-300 px-4 py-5 text-left transition hover:bg-zinc-100 disabled:opacity-60"
                    type="button"
                    onClick={() => burnPreset(50, 'peak')}
                    disabled={burnMutation.isPending}
                  >
                    <p className="text-sm font-semibold">Burn 50 units</p>
                    <p className="mt-1 text-xs text-zinc-500">Peak operation</p>
                  </button>
                </section>

                <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
                  <div className="flex items-center justify-between">
                    <h2 className="text-lg font-semibold">Usage Snapshot</h2>
                    <button
                      className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium transition hover:bg-zinc-100"
                      type="button"
                      onClick={resetUsage}
                    >
                      Reset
                    </button>
                  </div>
                  <p className="mt-2 text-sm text-zinc-600">Total units burned: {totalBurned}</p>
                  {burnMutation.isPending ? (
                    <p className="mt-2 text-sm text-zinc-500">Submitting usage event...</p>
                  ) : null}
                  {feedbackMessage ? (
                    <p className="mt-2 text-sm text-zinc-700">{feedbackMessage}</p>
                  ) : null}

                  <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className="bg-zinc-100 text-left text-zinc-600">
                        <tr>
                          <th className="px-4 py-2 font-medium">Timestamp</th>
                          <th className="px-4 py-2 font-medium">Units</th>
                          <th className="px-4 py-2 font-medium">Strategy</th>
                          <th className="px-4 py-2 font-medium">Peak</th>
                          <th className="px-4 py-2 font-medium">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 bg-white">
                        {history.length === 0 ? (
                          <tr>
                            <td className="px-4 py-3 text-zinc-500" colSpan={5}>
                              No usage recorded yet.
                            </td>
                          </tr>
                        ) : (
                          history.map((event) => (
                            <tr key={event.usageEventId}>
                              <td className="px-4 py-3">{formatDateTime(event.createdAt)}</td>
                              <td className="px-4 py-3 font-medium">{event.units}</td>
                              <td className="px-4 py-3">{event.strategy}</td>
                              <td className="px-4 py-3">
                                {event.peakUnits === null ? '-' : event.peakUnits}
                              </td>
                              <td className="px-4 py-3">
                                {event.status}
                                {event.duplicate ? ' (duplicate)' : ''}
                              </td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            ) : null}
          </main>
        </div>
      )}
    </RouteGuard>
  );
}
