import * as Joi from 'joi';

export const envSchema = Joi.object({
  NODE_ENV: Joi.string().valid('development', 'test', 'production').default('development'),
  PORT: Joi.number().port().default(3000),
  APP_BASE_URL: Joi.string().uri().required(),
  WEB_BASE_URL: Joi.string().uri().required(),

  DB_HOST: Joi.string().required(),
  DB_PORT: Joi.number().port().default(5432),
  DB_USER: Joi.string().required(),
  DB_PASSWORD: Joi.string().required(),
  DB_NAME: Joi.string().required(),

  REDIS_HOST: Joi.string().required(),
  REDIS_PORT: Joi.number().port().default(6379),

  SESSION_SECRET: Joi.string().min(8).required(),
  SESSION_COOKIE_NAME: Joi.string().default('sid'),
  SESSION_TTL_SECONDS: Joi.number().positive().default(86400),

  KEYCLOAK_REALM: Joi.string().required(),
  KEYCLOAK_ISSUER: Joi.string().uri().required(),
  KEYCLOAK_CLIENT_ID: Joi.string().required(),
  KEYCLOAK_CLIENT_SECRET: Joi.string().required(),
  KEYCLOAK_ADMIN_BASE_URL: Joi.string().uri().required(),
  KEYCLOAK_ADMIN_USERNAME: Joi.string().required(),
  KEYCLOAK_ADMIN_PASSWORD: Joi.string().required(),

  DEVICE_TOKEN_HASH_SECRET: Joi.string().min(8).required(),
}).unknown(true);

export type EnvShape = Record<string, string | undefined>;

export function validateEnv(env: EnvShape): EnvShape {
  const { error, value } = envSchema.validate(env, { abortEarly: false });
  if (error) {
    throw new Error(`Config validation error: ${error.message}`);
  }
  return value;
}
