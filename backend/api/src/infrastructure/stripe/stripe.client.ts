type StripeAccount = {
  id: string;
  livemode: boolean;
};

export type StripeClient = {
  accounts: {
    retrieve(): Promise<StripeAccount>;
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
