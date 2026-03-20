import { Env } from '@adonisjs/core/env'

export default await Env.create(new URL('../', import.meta.url), {
  NODE_ENV: Env.schema.enum(['development', 'production', 'test'] as const),
  PORT: Env.schema.number(),
  APP_KEY: Env.schema.string(),
  HOST: Env.schema.string({ format: 'host' }),
  LOG_LEVEL: Env.schema.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']),

  /*
  |----------------------------------------------------------
  | Proxy configuration
  |----------------------------------------------------------
  */
  BROKER_GATEWAY_URL: Env.schema.string(),
  PROXY_TIMEOUT: Env.schema.number.optional(),

  /*
  |----------------------------------------------------------
  | Service Registry registration
  |----------------------------------------------------------
  */
  HOST_SERVER_URL: Env.schema.string(),
  SERVICE_NAME: Env.schema.string(),
  SERVICE_HOST: Env.schema.string(),
  SERVICE_PORT: Env.schema.number(),
  HEARTBEAT_INTERVAL_MS: Env.schema.number(),
})
