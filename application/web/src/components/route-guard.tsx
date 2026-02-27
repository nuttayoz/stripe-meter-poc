'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useSession } from '@/hooks/use-session';

type RouteGuardProps = {
  mode: 'protected' | 'guest';
  redirectTo: string;
  children: React.ReactNode;
};

function GuardMessage({ message }: { message: string }) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-zinc-50 px-6 text-zinc-700">
      <p className="text-sm">{message}</p>
    </div>
  );
}

export function RouteGuard({ mode, redirectTo, children }: RouteGuardProps) {
  const router = useRouter();
  const sessionQuery = useSession();
  const session = sessionQuery.data;
  const shouldRedirect =
    !sessionQuery.isLoading &&
    !sessionQuery.isError &&
    ((mode === 'protected' && !session) || (mode === 'guest' && !!session));

  useEffect(() => {
    if (shouldRedirect) {
      router.replace(redirectTo);
    }
  }, [redirectTo, router, shouldRedirect]);

  if (sessionQuery.isLoading) {
    return <GuardMessage message="Checking session..." />;
  }

  if (sessionQuery.isError) {
    return (
      <GuardMessage message="Could not validate your session. Please refresh and try again." />
    );
  }

  if (shouldRedirect) {
    return <GuardMessage message="Redirecting..." />;
  }

  return <>{children}</>;
}
