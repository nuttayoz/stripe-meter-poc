'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { useLogout, useSession } from '@/hooks/use-session';
import {
  appendBurnEvent,
  clearBurnHistory,
  getBurnHistory,
  type BurnEvent,
} from '@/lib/burn-history';
import { getDemoSubscriptionActive } from '@/lib/subscription-storage';

function formatDateTime(value: string) {
  const date = new Date(value);
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export default function BurnPage() {
  const router = useRouter();
  const sessionQuery = useSession();
  const logoutMutation = useLogout();
  const [hydrated, setHydrated] = useState(false);
  const [subscriptionActive, setSubscriptionActive] = useState(false);
  const [history, setHistory] = useState<BurnEvent[]>([]);

  useEffect(() => {
    const frameId = window.requestAnimationFrame(() => {
      setHydrated(true);
      setSubscriptionActive(getDemoSubscriptionActive());
      setHistory(getBurnHistory());
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, []);

  useEffect(() => {
    if (hydrated && !subscriptionActive) {
      router.replace('/plans');
    }
  }, [hydrated, router, subscriptionActive]);

  const totalBurned = useMemo(
    () => history.reduce((sum, event) => sum + event.units, 0),
    [history],
  );

  function burnUnits(units: number) {
    setHistory(appendBurnEvent(units));
  }

  function resetUsage() {
    clearBurnHistory();
    setHistory([]);
  }

  async function onLogout() {
    await logoutMutation.mutateAsync();
    router.replace('/login');
  }

  return (
    <RouteGuard mode="protected" redirectTo="/login">
      {!hydrated ? (
        <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-sm text-zinc-700">
          Loading burn simulator...
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

            {!subscriptionActive ? (
              <section className="rounded-2xl border border-zinc-200 bg-white p-6 text-sm text-zinc-700 shadow-sm">
                No active subscription. Redirecting to plans...
              </section>
            ) : (
              <>
                <section className="grid gap-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm md:grid-cols-3">
                  <button
                    className="rounded-xl border border-zinc-300 px-4 py-5 text-left transition hover:bg-zinc-100"
                    type="button"
                    onClick={() => burnUnits(10)}
                  >
                    <p className="text-sm font-semibold">Burn 10 units</p>
                    <p className="mt-1 text-xs text-zinc-500">Light operation</p>
                  </button>
                  <button
                    className="rounded-xl border border-zinc-300 px-4 py-5 text-left transition hover:bg-zinc-100"
                    type="button"
                    onClick={() => burnUnits(25)}
                  >
                    <p className="text-sm font-semibold">Burn 25 units</p>
                    <p className="mt-1 text-xs text-zinc-500">Normal operation</p>
                  </button>
                  <button
                    className="rounded-xl border border-zinc-300 px-4 py-5 text-left transition hover:bg-zinc-100"
                    type="button"
                    onClick={() => burnUnits(50)}
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

                  <div className="mt-4 overflow-hidden rounded-xl border border-zinc-200">
                    <table className="min-w-full divide-y divide-zinc-200 text-sm">
                      <thead className="bg-zinc-100 text-left text-zinc-600">
                        <tr>
                          <th className="px-4 py-2 font-medium">Timestamp</th>
                          <th className="px-4 py-2 font-medium">Units</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-zinc-200 bg-white">
                        {history.length === 0 ? (
                          <tr>
                            <td className="px-4 py-3 text-zinc-500" colSpan={2}>
                              No usage recorded yet.
                            </td>
                          </tr>
                        ) : (
                          history.map((event) => (
                            <tr key={event.id}>
                              <td className="px-4 py-3">{formatDateTime(event.createdAt)}</td>
                              <td className="px-4 py-3 font-medium">{event.units}</td>
                            </tr>
                          ))
                        )}
                      </tbody>
                    </table>
                  </div>
                </section>
              </>
            )}
          </main>
        </div>
      )}
    </RouteGuard>
  );
}
