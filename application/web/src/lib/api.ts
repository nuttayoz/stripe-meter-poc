const API_BASE_URL = process.env.NEXT_PUBLIC_API_BASE_URL ?? 'http://localhost:3001';

type HealthResponse = {
  status: string;
  timestamp: string;
};

type VersionResponse = {
  name: string;
  version: string;
};

async function httpGet<T>(path: string): Promise<T> {
  const response = await fetch(`${API_BASE_URL}${path}`, {
    method: 'GET',
  });

  if (!response.ok) {
    throw new Error(`Request failed: ${response.status}`);
  }

  return (await response.json()) as T;
}

export function getHealth() {
  return httpGet<HealthResponse>('/api/health');
}

export function getVersion() {
  return httpGet<VersionResponse>('/api/version');
}
