import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  HOST: Env.schema.string({ format: 'host' }),
  APP_NAME: Env.schema.string(),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),
  /**
   * 32-byte dev key — replace in production. Only the encryption module
   * (cookies/signed URLs) uses it; the JSON API surface does not.
   */
  APP_KEY: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | PostgreSQL (canonical store)
  |----------------------------------------------------------
  */
  PG_HOST: Env.schema.string(),
  PG_PORT: Env.schema.number(),
  PG_USER: Env.schema.string(),
  PG_PASSWORD: Env.schema.string(),
  PG_DB_NAME: Env.schema.string(),

  /*
  |----------------------------------------------------------
  | Redis (cache / pubsub)
  |----------------------------------------------------------
  */
  REDIS_HOST: Env.schema.string(),
  REDIS_PORT: Env.schema.number(),
})
