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

export type BillingPlan = {
  priceId: string;
  productId: string;
  productName: string;
  productDescription: string | null;
  active: boolean;
  type: string;
  currency: string;
  unitAmount: number | null;
  recurringInterval: string | null;
  recurringIntervalCount: number | null;
  usageType: string | null;
  meterId: string | null;
  taxBehavior: string | null;
  billingStrategy: string;
  metadata: Record<string, string> | null;
};

type BillingPlansResponse = {
  plans: BillingPlan[];
};

export type ActiveSubscription = {
  subscriptionId: string;
  priceId: string | null;
  status: string;
  currentPeriodStart: string | null;
  currentPeriodEnd: string | null;
  productName: string | null;
  productDescription: string | null;
  billingStrategy: string;
  currency: string | null;
  unitAmount: number | null;
  recurringInterval: string | null;
};

type ActiveSubscriptionsResponse = {
  subscriptions: ActiveSubscription[];
};

export type TransactionItem = {
  id: string;
  stripeEventId: string | null;
  eventType: string;
  type: string;
  status: string;
  amount: number | null;
  currency: string | null;
  stripeInvoiceId: string | null;
  stripePaymentIntentId: string | null;
  stripeChargeId: string | null;
  stripeSubscriptionId: string | null;
  rawPayload: unknown;
  occurredAt: string;
  createdAt: string;
  updatedAt: string;
};

export type TransactionsResponse = {
  transactions: TransactionItem[];
  pageInfo: {
    limit: number;
    hasMore: boolean;
    nextCursor: string | null;
  };
};

type TransactionsQuery = {
  cursor?: string;
  limit?: number;
  type?: string;
  status?: string;
  from?: string;
  to?: string;
};

type CheckoutSessionRequest = {
  priceId: string;
};

type CheckoutSessionResponse = {
  checkoutUrl: string;
  checkoutSessionId: string;
};

type BurnUnitsRequest = {
  priceId: string;
  units: number;
  reason?: string;
  idempotencyKey?: string;
};

export type BurnUnitsResponse = {
  usageEventId: string;
  idempotencyKey: string;
  duplicate: boolean;
  strategy: string;
  stripePriceId: string;
  stripeSubscriptionId: string;
  status: string;
  units: number;
  reason: string | null;
  stripeMeterEventId: string | null;
  stripeMeterEventIdentifier: string | null;
  peakUnits: number | null;
  peakEventEmitted: boolean;
  periodStart: string | null;
  periodEnd: string | null;
  errorMessage: string | null;
  createdAt: string;
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

export function getBillingPlans(accessToken: string) {
  return httpRequest<BillingPlansResponse>("/api/billing/plans", {
    method: "GET",
    credentials: "include",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}

export function getActiveSubscriptions(accessToken: string) {
  return httpRequest<ActiveSubscriptionsResponse>(
    "/api/billing/subscriptions/active",
    {
      method: "GET",
      credentials: "include",
      headers: {
        authorization: `Bearer ${accessToken}`,
      },
    },
  );
}

export function createCheckoutSession(
  accessToken: string,
  payload: CheckoutSessionRequest,
) {
  return httpRequest<CheckoutSessionResponse>("/api/billing/checkout-session", {
    method: "POST",
    credentials: "include",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: payload,
  });
}

export function burnUnits(accessToken: string, payload: BurnUnitsRequest) {
  return httpRequest<BurnUnitsResponse>("/api/usage/burn", {
    method: "POST",
    credentials: "include",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
    body: payload,
  });
}

export function getTransactions(
  accessToken: string,
  query: TransactionsQuery = {},
) {
  const searchParams = new URLSearchParams();

  if (query.cursor) {
    searchParams.set("cursor", query.cursor);
  }

  if (typeof query.limit === "number") {
    searchParams.set("limit", String(query.limit));
  }

  if (query.type) {
    searchParams.set("type", query.type);
  }

  if (query.status) {
    searchParams.set("status", query.status);
  }

  if (query.from) {
    searchParams.set("from", query.from);
  }

  if (query.to) {
    searchParams.set("to", query.to);
  }

  const queryString = searchParams.toString();
  const path = queryString
    ? `/api/transactions?${queryString}`
    : "/api/transactions";

  return httpRequest<TransactionsResponse>(path, {
    method: "GET",
    credentials: "include",
    headers: {
      authorization: `Bearer ${accessToken}`,
    },
  });
}
