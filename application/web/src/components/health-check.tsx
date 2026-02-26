'use client';

import { useQuery } from '@tanstack/react-query';
import { getHealth, getVersion } from '@/lib/api';

export function HealthCheck() {
  const healthQuery = useQuery({
    queryKey: ['health'],
    queryFn: getHealth,
  });

  const versionQuery = useQuery({
    queryKey: ['version'],
    queryFn: getVersion,
  });

  if (healthQuery.isLoading || versionQuery.isLoading) {
    return <p className="text-sm text-zinc-600">Checking API status...</p>;
  }

  if (healthQuery.isError || versionQuery.isError) {
    return (
      <p className="text-sm text-red-600">
        API is unreachable. Check backend at http://localhost:3001.
      </p>
    );
  }

  if (!healthQuery.data || !versionQuery.data) {
    return <p className="text-sm text-zinc-600">Waiting for API response...</p>;
  }

  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-4 text-sm text-zinc-700 shadow-sm">
      <p>
        API status: <span className="font-semibold text-green-700">{healthQuery.data.status}</span>
      </p>
      <p>
        API version: <span className="font-semibold">{versionQuery.data.version}</span>
      </p>
      <p>
        Last heartbeat: <span className="font-mono">{healthQuery.data.timestamp}</span>
      </p>
    </div>
  );
}
