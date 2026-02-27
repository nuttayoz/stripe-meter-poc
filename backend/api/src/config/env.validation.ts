type RawEnv = Record<string, string | undefined>;

const DURATION_PATTERN = /^\d+(ms|s|m|h|d)$/;

function requireString(
  env: RawEnv,
  key: string,
  options: { startsWith?: string; minLength?: number } = {},
) {
  const value = env[key]?.trim();
  if (!value) {
    throw new Error(`Missing required environment variable: ${key}`);
  }

  if (options.startsWith && !value.startsWith(options.startsWith)) {
    throw new Error(
      `Invalid environment variable ${key}: must start with "${options.startsWith}"`,
    );
  }

  if (options.minLength && value.length < options.minLength) {
    throw new Error(
      `Invalid environment variable ${key}: must be at least ${options.minLength} characters`,
    );
  }

  return value;
}

function requireUrl(env: RawEnv, key: string) {
  const value = requireString(env, key);

  try {
    // Ensures a valid absolute URL format for callback/cors configuration.
    new URL(value);
  } catch {
    throw new Error(`Invalid environment variable ${key}: must be a valid URL`);
  }

  return value;
}

function requireDuration(env: RawEnv, key: string) {
  const value = requireString(env, key);
  if (!DURATION_PATTERN.test(value)) {
    throw new Error(
      `Invalid environment variable ${key}: must match "<number>(ms|s|m|h|d)"`,
    );
  }

  return value;
}

function normalizePort(env: RawEnv, key: string, fallback: number) {
  const rawValue = env[key];
  if (!rawValue) {
    return String(fallback);
  }

  const parsed = Number(rawValue);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    throw new Error(
      `Invalid environment variable ${key}: must be an integer between 1 and 65535`,
    );
  }

  return String(parsed);
}

export function validateEnv(config: Record<string, unknown>) {
  const env = config as RawEnv;

  env.PORT = normalizePort(env, 'PORT', 3001);

  requireUrl(env, 'APP_BASE_URL');
  requireUrl(env, 'FRONTEND_ORIGIN');
  requireString(env, 'DATABASE_URL');
  requireString(env, 'REDIS_URL');

  requireString(env, 'JWT_ACCESS_SECRET', { minLength: 24 });
  requireString(env, 'JWT_REFRESH_SECRET', { minLength: 24 });
  requireDuration(env, 'JWT_ACCESS_EXPIRES_IN');
  requireDuration(env, 'JWT_REFRESH_EXPIRES_IN');
  requireString(env, 'JWT_REFRESH_COOKIE_NAME');

  requireString(env, 'STRIPE_SECRET_KEY', { startsWith: 'sk_' });
  requireString(env, 'STRIPE_WEBHOOK_SECRET', { startsWith: 'whsec_' });

  return config;
}
