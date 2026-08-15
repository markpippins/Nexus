/*
|--------------------------------------------------------------------------
| Contract-conformance gate (D-2026-08-14-004 Phase A)
|--------------------------------------------------------------------------
|
| Diff this edge's route table against the emitted OpenAPI spec
| (contracts/openapi.yaml — generated from typespec/v1/control-edge/).
|
|   - routes declared in the spec but missing from the app  → MISSING
|   - routes served by the app but absent from the spec     → UNDECLARED
|
| The router's route table is only fully materialized once the app has
| booted and starts handling requests, so the check runs lazily on the
| first request (memoized) rather than in a boot preload.
|
| Advisory by default (logs the diff, sets X-Conformance). Set
| CONFORMANCE_STRICT=true to hard-fail requests on any mismatch.
|
*/

import app from '@adonisjs/core/services/app'
import logger from '@adonisjs/core/services/logger'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { parse } from 'yaml'

const appRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)))
const specPath = path.join(appRoot, 'contracts', 'openapi.yaml')

export interface ConformanceResult {
  ok: boolean
  missing: string[]
  undeclared: string[]
  specPath: string
  checked: boolean
}

let memo: Promise<ConformanceResult> | null = null

function specPathToRoute(p: string): string {
  // OpenAPI `/api/links/{id}` → Adonis `/api/links/:id`
  return p.replace(/\{([^}]+)\}/g, ':$1')
}

async function check(): Promise<ConformanceResult> {
  if (!fs.existsSync(specPath)) {
    logger.warn(`[conformance] OpenAPI spec not found at ${specPath} — emit it from typespec/v1/control-edge/`)
    return { ok: true, missing: [], undeclared: [], specPath, checked: true }
  }

  const spec = parse(fs.readFileSync(specPath, 'utf-8'))

  // Contract surface: METHOD /route for every path+verb in the spec.
  const contractRoutes = new Set<string>()
  for (const [p, methods] of Object.entries(spec.paths || {})) {
    const route = specPathToRoute(p)
    for (const m of Object.keys(methods as object)) {
      if (['get', 'post', 'put', 'patch', 'delete', 'head', 'options', 'all'].includes(m)) {
        contractRoutes.add(`${m.toUpperCase()} ${route}`)
      }
    }
  }

  // App surface: flatten router.toJSON() (grouped by domain) into
  // METHOD /pattern entries.
  const router = await app.container.make('router')
  const appRoutes = new Set<string>()
  const domains = router.toJSON() as Record<string, { pattern: string; methods: string[] }[]>
  for (const domainRoutes of Object.values(domains)) {
    for (const r of domainRoutes) {
      const methods = r.methods && r.methods.length ? r.methods : ['GET']
      for (const m of methods) {
        // Adonis auto-registers HEAD for every GET route; the contract
        // declares only the explicit verbs.
        if (m.toUpperCase() === 'HEAD') continue
        appRoutes.add(`${m.toUpperCase()} ${r.pattern}`)
      }
    }
  }

  const missing = [...contractRoutes].filter((r) => !appRoutes.has(r)).sort()
  const undeclared = [...appRoutes].filter((r) => !contractRoutes.has(r)).sort()
  const ok = missing.length === 0 && undeclared.length === 0

  if (ok) {
    logger.info(`[conformance] route table matches contract (${contractRoutes.size} routes)`)
  } else {
    logger.warn(`[conformance] ${missing.length} missing, ${undeclared.length} undeclared`)
    for (const r of missing) logger.warn(`[conformance] MISSING    ${r}`)
    for (const r of undeclared) logger.warn(`[conformance] UNDECLARED ${r}`)
  }

  return { ok, missing, undeclared, specPath, checked: true }
}

/** Memoized conformance check — runs once, on first call. */
export function getConformance(): Promise<ConformanceResult> {
  if (!memo) memo = check()
  return memo
}
