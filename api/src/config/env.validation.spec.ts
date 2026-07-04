import { validateEnv } from './env.validation';

describe('validateEnv', () => {
  const base = {
    NODE_ENV: 'development',
    PORT: '3000',
    APP_BASE_URL: 'http://localhost:3000',
    WEB_BASE_URL: 'http://localhost:4200',
    DB_HOST: 'localhost',
    DB_PORT: '5432',
    DB_USER: 'postgres',
    DB_PASSWORD: 'postgres',
    DB_NAME: 'iot_platform',
    REDIS_HOST: 'localhost',
    REDIS_PORT: '6379',
    SESSION_SECRET: 'supersecret123456',
    SESSION_COOKIE_NAME: 'sid',
    SESSION_TTL_SECONDS: '86400',
    KEYCLOAK_REALM: 'thingsvu',
    KEYCLOAK_ISSUER: 'http://localhost:8081/realms/thingsvu',
    KEYCLOAK_CLIENT_ID: 'thingsvu',
    KEYCLOAK_CLIENT_SECRET: 'supersecret123456',
    KEYCLOAK_ADMIN_BASE_URL: 'http://localhost:8081',
    KEYCLOAK_ADMIN_USERNAME: 'admin',
    KEYCLOAK_ADMIN_PASSWORD: 'adminpassword',
    DEVICE_TOKEN_HASH_SECRET: 'peppertoken123456',
  };

  it('accepts a fully populated environment', () => {
    expect(() => validateEnv(base)).not.toThrow();
  });

  it('rejects a missing required variable', () => {
    const { DB_HOST, ...rest } = base;
    expect(() => validateEnv(rest)).toThrow(/DB_HOST/);
  });

  it('rejects a non-numeric PORT', () => {
    expect(() => validateEnv({ ...base, PORT: 'not-a-number' })).toThrow();
  });
});
