import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { Redis } from 'ioredis'
import env from '#start/env'

export default class HealthController {
  /**
   * GET /health — report edge health: DB + Redis connectivity.
   * ioredis used directly (same as the Express services being re-homed);
   * per-request short-lived connection, no global pool.
   */
  async index({ response }: HttpContext) {
    const redis = new Redis({
      host: env.get('REDIS_HOST'),
      port: env.get('REDIS_PORT'),
      lazyConnect: true,
      maxRetriesPerRequest: 1,
      enableOfflineQueue: false,
      retryStrategy: () => null,
    })
    try {
      await db.rawQuery('select 1')
      await redis.connect()
      await redis.ping()
      response.ok({
        status: 'ok',
        service: 'nexus-data-edge',
        db: 'up',
        redis: 'up',
        timestamp: new Date().toISOString(),
      })
    } catch (error: any) {
      response.status(503).send({
        status: 'error',
        service: 'nexus-data-edge',
        error: error.message,
      })
    } finally {
      redis.disconnect()
    }
  }
}
