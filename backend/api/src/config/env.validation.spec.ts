import { validateEnv } from './env.validation';

type TestEnv = Record<string, string | undefined>;

function createValidEnv(): TestEnv {
  return {
    PORT: '3001',
    APP_BASE_URL: 'http://localhost:3000',
    FRONTEND_ORIGIN: 'http://localhost:3000',
    DATABASE_URL:
      'postgresql://stripe_user:stripe_password@localhost:5433/stripe_meter?schema=public',
    REDIS_URL: 'redis://localhost:6379',
    JWT_ACCESS_SECRET: 'this_is_a_long_demo_access_secret_123',
    JWT_REFRESH_SECRET: 'this_is_a_long_demo_refresh_secret_123',
    JWT_ACCESS_EXPIRES_IN: '15m',
    JWT_REFRESH_EXPIRES_IN: '7d',
    JWT_REFRESH_COOKIE_NAME: 'refresh_token',
    STRIPE_SECRET_KEY: 'sk_test_1234567890',
    STRIPE_WEBHOOK_SECRET: 'whsec_1234567890',
  };
}

describe('validateEnv', () => {
  it('accepts a valid environment object', () => {
    const env = createValidEnv();
    expect(validateEnv(env)).toBe(env);
  });

  it('throws when stripe secret key is missing', () => {
    const env = createValidEnv();
    env.STRIPE_SECRET_KEY = undefined;

    expect(() => validateEnv(env)).toThrow(
      'Missing required environment variable: STRIPE_SECRET_KEY',
    );
  });
});
