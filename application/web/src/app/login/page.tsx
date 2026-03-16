'use client';

import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { RouteGuard } from '@/components/route-guard';
import { setAccessToken } from '@/lib/auth-storage';
import { login } from '@/lib/api';

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('demo@example.com');
  const [password, setPassword] = useState('Passw0rd!23');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const queryClient = useQueryClient()

  const loginMutation = useMutation({
    mutationFn: login,
    onSuccess: (result) => {
      setAccessToken(result.accessToken);
      queryClient.invalidateQueries({queryKey: ['session']});
      router.push('/plans');
    },
    onError: () => {
      setErrorMessage('Login failed. Please check credentials and try again.');
    },
  });

  function onSubmit(event: React.SubmitEvent<HTMLFormElement>) {
    event.preventDefault();
    setErrorMessage(null);
    loginMutation.mutate({
      email,
      password,
    });
  }

  return (
    <RouteGuard mode="guest" redirectTo="/plans">
      <div className="min-h-screen bg-zinc-50 px-6 py-16 text-zinc-900">
        <main className="mx-auto w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 shadow-sm">
          <p className="text-xs font-semibold uppercase tracking-[0.2em] text-zinc-500">
            Stripe Meter POC
          </p>
          <h1 className="mt-2 text-2xl font-semibold">Login</h1>
          <p className="mt-2 text-sm text-zinc-600">
            Demo credentials are pre-filled. Submit to receive access token + refresh cookie.
          </p>

          <form className="mt-6 space-y-4" onSubmit={onSubmit}>
            <label className="block space-y-1">
              <span className="text-sm font-medium">Email</span>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
              />
            </label>

            <label className="block space-y-1">
              <span className="text-sm font-medium">Password</span>
              <input
                className="w-full rounded-lg border border-zinc-300 px-3 py-2 outline-none focus:border-zinc-500"
                type="password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>

            <button
              className="w-full rounded-lg bg-zinc-900 px-4 py-2 font-medium text-white transition hover:bg-zinc-700 disabled:cursor-not-allowed disabled:opacity-60"
              type="submit"
              disabled={loginMutation.isPending}
            >
              {loginMutation.isPending ? 'Signing in...' : 'Sign in'}
            </button>

            {errorMessage ? <p className="text-sm text-red-600">{errorMessage}</p> : null}
          </form>
        </main>
      </div>
    </RouteGuard>
  );
}
