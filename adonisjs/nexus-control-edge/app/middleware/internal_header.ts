import type { HttpContext } from '@adonisjs/core/http'

/**
 * Security Pass Alpha (audit C3, decisions df8ff49d + 22fe12bc):
 * uniform X-Nexus-Internal fleet-secret check on the control edge.
 *
 * Two modes via NEXUS_INTERNAL_ENFORCE:
 *  - "false" (default): DISCOVERY WINDOW — accept and WARN with caller identity
 *    for 72h so ~15 riding consumers surface in logs before enforcement flips.
 *  - "true": ENFORCE — missing/invalid secret is rejected with 403.
 *
 * The secret itself comes from NEXUS_INTERNAL_SECRET (fleet-internal.env,
 * ansible-distributed). Rotation: replace everywhere, restart consumers.
 */
export default class InternalHeaderMiddleware {
  async handle(ctx: HttpContext, next: () => Promise<void>) {
    const secret = process.env.NEXUS_INTERNAL_SECRET
    const enforce = process.env.NEXUS_INTERNAL_ENFORCE === 'true'
    const provided = ctx.request.header('x-nexus-internal')

    if (secret && provided && provided === secret) {
      return next()
    }

    if (enforce) {
      ctx.logger.warn(
        { ip: ctx.request.ip(), ua: ctx.request.header('user-agent'), path: ctx.request.url() },
        'rejected: missing/invalid X-Nexus-Internal (enforce mode)'
      )
      return ctx.response.status(403).json({ error: 'forbidden' })
    }

    // Discovery window (72h from pass-alpha deployment): log-if-missing.
    ctx.logger.warn(
      {
        ip: ctx.request.ip(),
        ua: ctx.request.header('user-agent'),
        path: ctx.request.url(),
        method: ctx.request.method(),
      },
      'X-Nexus-Internal missing/invalid — discovery window (accepting, will enforce)'
    )

    await next()
  }
}
