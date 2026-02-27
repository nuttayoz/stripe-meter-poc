const API_BASE_URL =
  process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:3001";

export class ApiError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

type HealthResponse = {
  status: string;
  timestamp: string;
};

type VersionResponse = {
  name: string;
  version: string;
};

type LoginRequest = {
  email: string;
  password: string;
};

export type AuthUser = {
  id: string;
  organizationId: string;
  email: string;
  role: string;
};

export type AuthResponse = {
  accessToken: string;
  user: AuthUser;
};

type MeResponse = {
  user: AuthUser;
};

type RequestOptions = {
  method?: "GET" | "POST";
  body?: unknown;
  credentials?: RequestCredentials;
  headers?: Record<string, string>;
};

async function httpRequest<T>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  const { method = "GET", body, credentials, headers: inputHeaders } = options;
  const headers: Record<string, string> = { ...(inputHeaders ?? {}) };
  const init: RequestInit = {
    method,
    credentials,
    headers,
  };

  if (body !== undefined) {
    headers["content-type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const response = await fetch(`${API_BASE_URL}${path}`, init);

  if (!response.ok) {
    throw new ApiError(`Request failed: ${response.status}`, response.status);
  }

  const contentType = response.headers.get("content-type");
  if (contentType?.includes("application/json")) {
    return (await response.json()) as T;
  }

  return {} as T;
}

export function getHealth() {
  return httpRequest<HealthResponse>("/api/health");
}

export function getVersion() {
  return httpRequest<VersionResponse>("/api/version");
}

export function login(payload: LoginRequest) {
  return httpRequest<AuthResponse>("/api/auth/login", {
    method: "POST",
    body: payload,
    credentials: "include",
  });
}

export function refreshSession() {
  return httpRequest<AuthResponse>("/api/auth/refresh", {
    method: "POST",
    credentials: "include",
  });
}

export function getMe(accessToken: string) {
  return httpRequest<MeResponse>("/api/auth/me", {
    method: "GET",
    credentials: "include",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export function logout() {
  return httpRequest<{ success: boolean }>("/api/auth/logout", {
    method: "POST",
    credentials: "include",
  });
}
