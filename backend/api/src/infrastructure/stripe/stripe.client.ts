type StripeAccount = {
  id: string;
  livemode: boolean;
};

type StripeMetadata = Record<string, string>;

type StripeListResponse<T> = {
  data: T[];
  has_more: boolean;
};

type StripeListParams = {
  active?: boolean;
  limit?: number;
  starting_after?: string;
};

type StripeSubscriptionListParams = {
  customer: string;
  status: 'all';
  limit?: number;
  starting_after?: string;
};

type StripeCheckoutSessionCreateParams = {
  mode: 'subscription';
  customer: string;
  line_items: Array<{
    price: string;
    quantity?: number;
  }>;
  success_url: string;
  cancel_url: string;
  subscription_data: {
    default_tax_rates: Array<string>;
  };
  client_reference_id?: string;
  metadata?: StripeMetadata;
};

export type StripeProduct = {
  id: string;
  name: string;
  description: string | null;
  active: boolean;
  metadata: StripeMetadata;
};

type StripeRecurring = {
  interval: string;
  interval_count: number;
  usage_type?: string | null;
  meter?: string | null;
};

type StripePriceProduct = string | { id: string };

export type StripePrice = {
  id: string;
  product: StripePriceProduct;
  active: boolean;
  type: string;
  currency: string;
  unit_amount: number | null;
  recurring: StripeRecurring | null;
  tax_behavior: string | null;
  metadata: StripeMetadata;
};

export type StripeCustomer = {
  id: string;
};

export type StripeSubscription = {
  id: string;
  status: string;
};

type StripeCheckoutSession = {
  id: string;
  url: string | null;
};

export type StripeWebhookEvent = {
  id: string;
  type: string;
  created: number;
  data: {
    object: Record<string, unknown>;
  };
};

export type StripeClient = {
  accounts: {
    retrieve(): Promise<StripeAccount>;
  };
  products: {
    list(params: StripeListParams): Promise<StripeListResponse<StripeProduct>>;
  };
  prices: {
    list(params: StripeListParams): Promise<StripeListResponse<StripePrice>>;
  };
  customers: {
    create(params: {
      name?: string;
      email?: string;
      metadata?: StripeMetadata;
    }): Promise<StripeCustomer>;
  };
  subscriptions: {
    list(
      params: StripeSubscriptionListParams,
    ): Promise<StripeListResponse<StripeSubscription>>;
  };
  checkout: {
    sessions: {
      create(
        params: StripeCheckoutSessionCreateParams,
      ): Promise<StripeCheckoutSession>;
    };
  };
  webhooks: {
    constructEventAsync(
      payload: string | Buffer,
      signature: string,
      secret: string,
    ): Promise<StripeWebhookEvent>;
  };
};

type StripeConstructor = new (
  apiKey: string,
  options: {
    maxNetworkRetries: number;
    appInfo: {
      name: string;
      version: string;
    };
  },
) => StripeClient;

function hasDefaultExport(
  value: unknown,
): value is { default: StripeConstructor } {
  return (
    typeof value === 'object' &&
    value !== null &&
    'default' in value &&
    typeof (value as { default?: unknown }).default === 'function'
  );
}

function isConstructor(value: unknown): value is StripeConstructor {
  return typeof value === 'function';
}

export function loadStripeConstructor() {
  try {
    // Dynamic require keeps compile-time independent from local package manager state.
    // Install dependency with: bun --cwd backend/api add stripe
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const stripeModule: unknown = require('stripe');

    if (hasDefaultExport(stripeModule)) {
      return stripeModule.default;
    }

    if (isConstructor(stripeModule)) {
      return stripeModule;
    }
  } catch (error) {
    const details = error instanceof Error ? error.message : String(error);
    throw new Error(
      `Failed to load Stripe SDK. Install with "cd backend/api && bun add stripe", then run "bun install" at repo root. Cause: ${details}`,
    );
  }

  throw new Error('Failed to load Stripe SDK constructor');
}
