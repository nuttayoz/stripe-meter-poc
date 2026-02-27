'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { useLogout, useSession } from '@/hooks/use-session';
import {
  getDemoSubscriptionActive,
  setDemoSubscriptionActive,
} from '@/lib/subscription-storage';

export default function PlansPage() {
  const router = useRouter();
  const sessionQuery = useSession();
  const logoutMutation = useLogout();
  const [subscriptionActive, setSubscriptionActive] = useState(
    getDemoSubscriptionActive,
  );
  const [selectedPlan, setSelectedPlan] = useState<'PLAN_A' | 'PLAN_B' | null>(
    null,
  );

  function selectPlan(plan: 'PLAN_A' | 'PLAN_B') {
    setSelectedPlan(plan);
    setDemoSubscriptionActive(true);
    setSubscriptionActive(true);
  }

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

          <section className="grid gap-4 md:grid-cols-2">
            <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                PLAN_A
              </p>
              <h2 className="mt-2 text-xl font-semibold">Base Monthly + Metered Overage</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Fixed monthly price plus extra usage billed by Stripe meter events.
              </p>
              <button
                className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                type="button"
                onClick={() => selectPlan('PLAN_A')}
              >
                Select PLAN_A (Demo)
              </button>
            </article>

            <article className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
              <p className="text-xs font-semibold uppercase tracking-[0.15em] text-zinc-500">
                PLAN_B
              </p>
              <h2 className="mt-2 text-xl font-semibold">Max Member Usage Per Month</h2>
              <p className="mt-2 text-sm text-zinc-600">
                Monthly bill uses the highest member usage in the organization.
              </p>
              <button
                className="mt-4 rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white transition hover:bg-zinc-700"
                type="button"
                onClick={() => selectPlan('PLAN_B')}
              >
                Select PLAN_B (Demo)
              </button>
            </article>
          </section>

          <section className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">Demo Subscription Status</h2>
            <p className="mt-2 text-sm text-zinc-600">
              {subscriptionActive
                ? `Subscription active${selectedPlan ? ` (${selectedPlan})` : ''}.`
                : 'No active subscription yet.'}
            </p>
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
                  setSelectedPlan(null);
                }}
              >
                Reset Demo Subscription
              </button>
            </div>
          </section>
        </main>
      </div>
    </RouteGuard>
  );
}
