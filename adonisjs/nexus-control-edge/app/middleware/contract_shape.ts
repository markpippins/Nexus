import { HttpContext } from '@adonisjs/core/http'
import logger from '@adonisjs/core/services/logger'
import { getConformance } from '#start/conformance'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

/**
 * Advisory request-shape conformance middleware (D-2026-08-14-004 Phase A).
 *
 * For each matched route, checks the incoming request against the emitted
 * OpenAPI spec (contracts/openapi.yaml):
 *   - a `required: true` requestBody must be present;
 *   - required body properties must be present (when the body schema is
 *     resolvable via $ref).
 *
 * Advisory by default: logs a warning and sets an `X-Conformance` header.
 * Set CONFORMANCE_STRICT=true to hard-fail (400) on shape violations.
 */

const appRoot = path.dirname(path.dirname(path.dirname(fileURLToPath(import.meta.url))))
const specPath = path.join(appRoot, 'contracts', 'openapi.yaml')

let spec: any = null
let components: any = null

function loadSpec(): any {
  if (spec) return spec
  if (!fs.existsSync(specPath)) return null
  spec = parse(fs.readFileSync(specPath, 'utf-8'))
  components = spec.components || {}
  return spec
}

function resolveRef(ref: string): any {
  const parts = ref.replace('#/components/schemas/', '').split('/')
  let node = components
  for (const p of parts) {
    if (!node) return null
    node = node[p]
  }
  return node
}

/** Convert a spec path `/api/links/{id}` to a RegExp. */
function specPathToRe(p: string): RegExp {
  const escaped = p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\{([^}]+)\\\}/g, '([^/]+)')
  return new RegExp(`^${escaped}$`)
}

export default class ContractShapeMiddleware {
  private static conformanceChecked = false

  async handle(ctx: HttpContext, next: () => Promise<void>) {
    // First-request route-table conformance gate (D-2026-08-14-004 Phase A).
    if (!ContractShapeMiddleware.conformanceChecked) {
      ContractShapeMiddleware.conformanceChecked = true
      const result = await getConformance()
      const strict = process.env.CONFORMANCE_STRICT === 'true'
      if (strict && !result.ok) {
        ctx.response.status(503).json({
          error: 'Contract conformance failed (CONFORMANCE_STRICT)',
          missing: result.missing,
          undeclared: result.undeclared,
        })
        return
      }
    }

    const s = loadSpec()
    const violations: string[] = []

    if (s) {
      const method = ctx.request.method().toLowerCase()
      const urlPath = ctx.request.url().split('?')[0]

      // Find the spec operation whose path matches the request.
      let operation: any = null
      for (const [p, methods] of Object.entries(s.paths || {})) {
        if (!specPathToRe(p).test(urlPath)) continue
        const op = (methods as any)[method]
        if (op) {
          operation = op
          break
        }
      }

      if (operation) {
        const rb = operation.requestBody
        if (rb) {
          const required = rb.required === true
          const schemaRef =
            rb.content?.['application/json']?.schema?.['$ref'] ||
            rb.content?.['application/json']?.schema
          const schema = typeof schemaRef === 'string' ? resolveRef(schemaRef) : schemaRef

          const body = ctx.request.body() as any
          if (required && (body === undefined || body === null || Object.keys(body).length === 0)) {
            violations.push(`requestBody required but missing/empty on ${method.toUpperCase()} ${urlPath}`)
          }
          if (schema && schema.required && Array.isArray(schema.required)) {
            for (const prop of schema.required) {
              if (body === undefined || body[prop] === undefined) {
                violations.push(`missing required property "${prop}" on ${method.toUpperCase()} ${urlPath}`)
              }
            }
          }
        }
      }
    }

    const strict = process.env.CONFORMANCE_STRICT === 'true'
    if (violations.length) {
      if (strict) {
        ctx.response.status(400).json({ error: 'Contract shape violation', violations })
        return
      }
      logger.warn(`[conformance] ${violations.join('; ')}`)
      ctx.response.header('X-Conformance', `violations:${violations.length}`)
    } else {
      ctx.response.header('X-Conformance', 'ok')
    }

    await next()
  }
}
