'use client';

import { useMutation, useQuery } from '@tanstack/react-query';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { useLogout, useSession } from '@/hooks/use-session';
import {
  ApiError,
  createCheckoutSession,
  getBillingPlans,
  type BillingPlan,
} from '@/lib/api';
import {
  getDemoSubscriptionActive,
  setDemoSubscriptionActive,
} from '@/lib/subscription-storage';

function formatPlanAmount(plan: BillingPlan) {
  if (plan.unitAmount === null) {
    return 'Metered';
  }

  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: plan.currency.toUpperCase(),
  }).format(plan.unitAmount / 100);
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

export default function PlansPage() {
  const router = useRouter();
  const sessionQuery = useSession();
  const logoutMutation = useLogout();
  const accessToken = sessionQuery.data?.accessToken ?? null;
  const [subscriptionActive, setSubscriptionActive] = useState(
    getDemoSubscriptionActive,
  );
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

  const checkoutMutation = useMutation({
    mutationFn: async (priceId: string) => {
      if (!accessToken) {
        throw new Error('Missing access token');
      }

      return createCheckoutSession(accessToken, { priceId });
    },
    onSuccess: (result) => {
      window.location.assign(result.checkoutUrl);
    },
    onError: (error) => {
      if (error instanceof ApiError && error.status === 409) {
        setFeedbackMessage(
          'This organization already has an active subscription. Use Burn Units.',
        );
        setDemoSubscriptionActive(true);
        setSubscriptionActive(true);
        return;
      }

      setFeedbackMessage('Could not create checkout session. Please try again.');
    },
  });

  useEffect(() => {
    const searchParams = new URLSearchParams(window.location.search);
    const checkoutStatus = searchParams.get('checkout');

    if (checkoutStatus === 'success') {
      const frameId = window.requestAnimationFrame(() => {
        setDemoSubscriptionActive(true);
        setSubscriptionActive(true);
        setFeedbackMessage(
          'Checkout completed. Subscription will be confirmed by webhook shortly.',
        );
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }

    if (checkoutStatus === 'canceled') {
      const frameId = window.requestAnimationFrame(() => {
        setFeedbackMessage('Checkout was canceled.');
      });

      return () => {
        window.cancelAnimationFrame(frameId);
      };
    }
  }, []);

  const sortedPlans = useMemo(() => {
    if (!plansQuery.data) {
      return [];
    }

    return [...plansQuery.data.plans].sort((left, right) =>
      left.productName.localeCompare(right.productName),
    );
  }, [plansQuery.data]);

  async function onLogout() {
    await logoutMutation.mutateAsync();
    router.replace('/login');
  }

  return (
    <RouteGuard mode="protected" redirectTo="/login">
      <div className="min-h-screen bg-zinc-50 px-6 py-12 text-zinc-900">
        <main className="mx-auto w-full max-w-5xl space-y-8">
          <header className="flex flex-col gap-3 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:flex-row md:items-center md:justify-between">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
                Stripe Meter POC
              </p>
              <h1 className="mt-2 text-2xl font-semibold">Select Plan</h1>
              <p className="mt-1 text-sm text-zinc-600">
                Logged in as <span className="font-medium">{sessionQuery.data?.user.email}</span>
              </p>
            </div>
            <button
              className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100 disabled:opacity-60"
              type="button"
              onClick={() => void onLogout()}
              disabled={logoutMutation.isPending}
            >
              {logoutMutation.isPending ? 'Signing out...' : 'Sign out'}
            </button>
          </header>

          <section className="space-y-4">
            {plansQuery.isLoading ? (
              <article className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
                Loading plans from billing catalog...
              </article>
            ) : null}

            {plansQuery.isError ? (
              <article className="rounded-2xl border border-red-200 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
                Failed to load plans. Run catalog sync and refresh this page.
              </article>
            ) : null}

            {!plansQuery.isLoading &&
            !plansQuery.isError &&
            sortedPlans.length === 0 ? (
              <article className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-600 shadow-sm">
                No active plans in local catalog. Run sync first.
              </article>
            ) : null}

            {!plansQuery.isLoading && !plansQuery.isError ? (
              <div className="grid gap-4 md:grid-cols-2">
                {sortedPlans.map((plan) => (
                  <article
                    className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm"
                    key={plan.priceId}
                  >
                    <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                      {toFriendlyStrategyLabel(plan.billingStrategy)}
                    </p>
                    <h2 className="mt-2 text-xl font-semibold">{plan.productName}</h2>
                    <p className="mt-1 text-sm text-zinc-600">
                      {plan.productDescription ?? 'No description'}
                    </p>
                    <p className="mt-3 text-sm font-medium text-zinc-800">
                      {formatPlanAmount(plan)}
                      {plan.recurringInterval ? ` / ${plan.recurringInterval}` : ''}
                    </p>
                    <button
                      className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700 disabled:opacity-60"
                      type="button"
                      onClick={() => checkoutMutation.mutate(plan.priceId)}
                      disabled={checkoutMutation.isPending}
                    >
                      {checkoutMutation.isPending
                        ? 'Redirecting to Checkout...'
                        : 'Subscribe via Stripe Checkout'}
                    </button>
                  </article>
                ))}
              </div>
            ) : null}
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Subscription Status</h2>
            <p className="mt-2 text-sm text-zinc-600">
              {subscriptionActive ? 'Subscription active.' : 'No active subscription yet.'}
            </p>
            {feedbackMessage ? (
              <p className="mt-2 text-sm text-zinc-700">{feedbackMessage}</p>
            ) : null}
            <div className="mt-4 flex flex-wrap gap-3">
              <Link
                className={`inline-flex items-center rounded-lg px-4 py-2 text-sm font-medium text-white transition ${
                  subscriptionActive
                    ? 'bg-zinc-900 hover:bg-zinc-700'
                    : 'pointer-events-none bg-zinc-400'
                }`}
                href="/burn"
                aria-disabled={!subscriptionActive}
                tabIndex={subscriptionActive ? 0 : -1}
                onClick={(event) => {
                  if (!subscriptionActive) {
                    event.preventDefault();
                  }
                }}
              >
                Continue to Burn Units
              </Link>
              <button
                className="rounded-lg border border-zinc-300 px-4 py-2 text-sm font-medium transition hover:bg-zinc-100"
                type="button"
                onClick={() => {
                  setDemoSubscriptionActive(false);
                  setSubscriptionActive(false);
                  setFeedbackMessage(null);
                }}
              >
                Reset Local Subscription Flag
              </button>
            </div>
          </section>
        </main>
      </div>
    </RouteGuard>
  );
}
