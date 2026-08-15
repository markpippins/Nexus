/**
 * tackle-srv re-homing (Wave 3.5) — AI config + tool-access domain.
 *
 * Ported from nexus/typescript/tackle-srv/src/routes/{ai-config,tool-access}.ts.
 * Runs on the `tackle` named connection (search_path=tackle,public) so the
 * unqualified table names resolve exactly as upstream. The upstream db.ts
 * used @name-style placeholders; these are converted to $n here.
 */

import type { HttpContext } from '@adonisjs/core/http'
import { q, qT } from '#services/nebula_helpers'
import fs from 'node:fs'
import path from 'node:path'
import { spawn } from 'node:child_process'

const CONN = 'tackle'

// ── Config bundle invocation_mode validation (mirrors upstream) ──────
const INVOCATION_MODES = ['CLI', 'HTTP', 'SDK', 'MCP', 'INTERACTIVE'] as const
const LEGACY_INVOCATION_MODES = new Set(['stream', 'direct', 'batch', 'fallback', 'sync', 'async'])

function invocationModeError(mode: unknown): string | null {
  if (mode === undefined || mode === null) return null
  if (typeof mode !== 'string' || !(INVOCATION_MODES as readonly string[]).includes(mode)) {
    const legacyHint =
      typeof mode === 'string' && LEGACY_INVOCATION_MODES.has(mode.toLowerCase())
        ? ` '${mode}' is the old dispatch vocabulary — pick an invocation channel instead.`
        : ''
    return `Invalid invocation_mode '${String(mode)}'. Allowed values: ${INVOCATION_MODES.join(', ')}.${legacyHint}`
  }
  return null
}

function bundlesInvocationModeError(bundles: unknown): string | null {
  if (!Array.isArray(bundles)) return null
  for (const b of bundles) {
    const err = invocationModeError((b as any)?.invocation_mode)
    if (err) return err
  }
  return null
}

// opencode model-arg qualification (mirrors upstream)
const OPENCODE_PROVIDER_TYPES = ['ollama', 'openai', 'anthropic', 'google', 'codex', 'opencode']

function opencodeProviderKey(provider: any): string | null {
  if (!provider) return null
  try {
    const cfg = JSON.parse(provider.config_json || '{}')
    if (cfg.opencodeProvider) return String(cfg.opencodeProvider)
  } catch {
    /* fall through */
  }
  const t = provider.type ? String(provider.type).toLowerCase() : ''
  return OPENCODE_PROVIDER_TYPES.includes(t) ? t : null
}

function openCodeModelArg(model: any, provider: any): string {
  const id = model.model_identifier
  const key = opencodeProviderKey(provider)
  if (!key) return id
  return `${key}/${id}`
}

// Bounds a verify run
const VERIFY_WATCHDOG_MS = 20 * 60 * 1000
const VERIFY_DEFAULT_PROMPT =
  'Reply with the single word OK and nothing else. Do not add any explanation.'
const VERIFY_FAIL_MARKERS =
  /ProviderModelNotFoundError|Model not found|model not found|No such model|unauthorized/i

export default class TackleAiController {
  // ── Full snapshot ──────────────────────────────────────────────
  async snapshot(_ctx: HttpContext) {
    const [providers, harnesses, models, roles, bundles] = await Promise.all([
      q('SELECT * FROM providers ORDER BY name', [], CONN),
      q('SELECT * FROM harnesses ORDER BY name', [], CONN),
      q('SELECT * FROM models ORDER BY name', [], CONN),
      q(
        `SELECT DISTINCT ON (cb.role)
                cb.id, cb.role, cb.model_id,
                COALESCE(cb.provider_id, m.provider_id) AS provider_id,
                COALESCE(cb.harness_id, m.harness_id) AS harness_id,
                '{}'::TEXT AS extra_params, cb.created_at, cb.updated_at
         FROM config_bundle cb
         JOIN models m ON cb.model_id = m.id
         WHERE cb.is_active = 1
         ORDER BY cb.role, cb.priority ASC`,
        [],
        CONN
      ),
      q('SELECT * FROM config_bundle ORDER BY role, priority ASC', [], CONN),
    ])
    return {
      providers: providers.rows,
      harnesses: harnesses.rows,
      models: models.rows,
      roles: roles.rows,
      bundles: bundles.rows,
    }
  }

  // ── Validate ───────────────────────────────────────────────────
  async validate(_ctx: HttpContext) {
    const warnings: any[] = []
    // provider-less models
    const mRes = await q(
      `SELECT m.id, m.name FROM models m
       LEFT JOIN providers p ON m.provider_id = p.id
       WHERE m.provider_id IS NOT NULL AND p.id IS NULL`,
      [],
      CONN
    )
    for (const r of mRes.rows) warnings.push({ severity: 'warning', code: 'model_missing_provider', model_id: r.id, message: `Model ${r.name} references a missing provider` })
    // harness-less models
    const hRes = await q(
      `SELECT m.id, m.name FROM models m
       LEFT JOIN harnesses h ON m.harness_id = h.id
       WHERE h.id IS NULL`,
      [],
      CONN
    )
    for (const r of hRes.rows) warnings.push({ severity: 'warning', code: 'model_missing_harness', model_id: r.id, message: `Model ${r.name} references a missing harness` })
    return { valid: warnings.length === 0, warnings }
  }

  // ── Seed defaults ──────────────────────────────────────────────
  async seedDefaults({ request, response }: HttpContext) {
    try {
      const { force } = request.all()
      const countRes = await q('SELECT COUNT(*)::int AS count FROM providers', [], CONN)
      if (countRes.rows[0].count > 0 && !force) {
        return response.json({ seeded: false, reason: 'AI config already populated (use force=true to reseed)' })
      }
      await q(
        `INSERT INTO providers (id, name, type, endpoint_url, config_json, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $6)
         ON CONFLICT (id) DO NOTHING`,
        ['opencode', 'OpenCode', 'opencode', null, '{}', new Date().toISOString()],
        CONN
      )
      await q(
        `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $4)
         ON CONFLICT (id) DO NOTHING`,
        ['opencode', 'opencode', JSON.stringify({ binary: 'opencode', env: {} }), new Date().toISOString()],
        CONN
      )
      return response.json({ seeded: true })
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  // ── Import full snapshot ───────────────────────────────────────
  async importConfig({ request, response }: HttpContext) {
    const { providers, harnesses, models, roles, bundles } = request.all()
    if (!providers && !harnesses && !models && !roles && !bundles) {
      return response.status(400).json({ error: 'No import data provided' })
    }
    const modeErr = bundlesInvocationModeError(bundles)
    if (modeErr) {
      return response.status(400).json({ error: modeErr, allowed: INVOCATION_MODES })
    }
    try {
      // Simplest faithful import: clear + reinsert within a transaction.
      const { default: db } = await import('@adonisjs/lucid/services/db')
      const trx = await db.connection('tackle').transaction()
      try {
        await qT(trx, 'DELETE FROM config_bundle')
        await qT(trx, 'DELETE FROM models')
        await qT(trx, 'DELETE FROM harnesses')
        await qT(trx, 'DELETE FROM providers')
        const now = new Date().toISOString()
        for (const p of providers || []) {
          await qT(trx,
            `INSERT INTO providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $7)`,
            [p.id, p.name, p.type, p.endpoint_url ?? null, p.api_key ?? null, p.config_json ?? '{}', now]
          )
        }
        for (const h of harnesses || []) {
          await qT(trx,
            `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $4)`,
            [h.id, h.name, h.invocation_semantics ?? '{}', now]
          )
        }
        for (const m of models || []) {
          await qT(trx,
            `INSERT INTO models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $6)`,
            [m.id, m.name, m.harness_id, m.provider_id ?? null, m.model_identifier, now]
          )
        }
        for (const r of roles || []) {
          await qT(trx,
            `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, 0, 'CLI', 1, '{}', $7, $7)
             ON CONFLICT (id) DO NOTHING`,
            [r.id, `Primary: ${r.model_id} for ${r.role}`, r.role, r.model_id, r.provider_id ?? null, r.harness_id ?? null, now]
          )
        }
        for (const b of bundles || []) {
          await qT(trx,
            `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, command, endpoint_url, timeout_ms, valid_from, valid_to, is_active, metadata, created_at, updated_at)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
             ON CONFLICT (id) DO UPDATE SET
               name = EXCLUDED.name, role = EXCLUDED.role, model_id = EXCLUDED.model_id,
               provider_id = EXCLUDED.provider_id, harness_id = EXCLUDED.harness_id,
               priority = EXCLUDED.priority, invocation_mode = EXCLUDED.invocation_mode,
               command = EXCLUDED.command, endpoint_url = EXCLUDED.endpoint_url,
               timeout_ms = EXCLUDED.timeout_ms, valid_from = EXCLUDED.valid_from,
               valid_to = EXCLUDED.valid_to, is_active = EXCLUDED.is_active,
               metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at`,
            [b.id, b.name, b.role, b.model_id, b.provider_id ?? null, b.harness_id ?? null, b.priority ?? 0, b.invocation_mode ?? 'CLI', b.command ?? null, b.endpoint_url ?? null, b.timeout_ms ?? null, b.valid_from ?? null, b.valid_to ?? null, b.is_active === false || b.is_active === 0 ? 0 : 1, b.metadata ? JSON.stringify(b.metadata) : '{}', now]
          )
        }
        await trx.commit()
      } catch (e) {
        await trx.rollback()
        throw e
      }
      return response.json({ imported: true })
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  // ── Providers ──────────────────────────────────────────────────
  async listProviders(_ctx: HttpContext) {
    const r = await q('SELECT * FROM providers ORDER BY name', [], CONN)
    return r.rows
  }

  async getProvider({ params, response }: HttpContext) {
    const r = await q('SELECT * FROM providers WHERE id = $1', [params.id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Provider not found' })
    return response.json(r.rows[0])
  }

  async upsertProvider({ request, response }: HttpContext) {
    const { id, name, type, endpoint_url, api_key, config_json } = request.all()
    if (!id || !name || !type) {
      return response.status(400).json({ error: 'id, name, and type are required' })
    }
    const now = new Date().toISOString()
    await q(
      `INSERT INTO providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $7)
       ON CONFLICT(id) DO UPDATE SET
         name = EXCLUDED.name, type = EXCLUDED.type,
         endpoint_url = EXCLUDED.endpoint_url, api_key = EXCLUDED.api_key,
         config_json = EXCLUDED.config_json, updated_at = EXCLUDED.updated_at`,
      [id, name, type, endpoint_url ?? null, api_key ?? null, config_json ?? '{}', now],
      CONN
    )
    return response.json({ saved: true, id })
  }

  async deleteProvider({ params, response }: HttpContext) {
    const r = await q('DELETE FROM providers WHERE id = $1', [params.id], CONN)
    return response.json({ deleted: r.rowCount > 0, id: params.id })
  }

  // ── Harnesses ──────────────────────────────────────────────────
  async listHarnesses(_ctx: HttpContext) {
    const r = await q('SELECT * FROM harnesses ORDER BY name', [], CONN)
    return r.rows
  }

  async getHarness({ params, response }: HttpContext) {
    const r = await q('SELECT * FROM harnesses WHERE id = $1', [params.id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Harness not found' })
    return response.json(r.rows[0])
  }

  async upsertHarness({ request, response }: HttpContext) {
    const { id, name, invocation_semantics } = request.all()
    if (!id || !name) {
      return response.status(400).json({ error: 'id and name are required' })
    }
    const now = new Date().toISOString()
    await q(
      `INSERT INTO harnesses (id, name, invocation_semantics, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $4)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, invocation_semantics = EXCLUDED.invocation_semantics,
         updated_at = EXCLUDED.updated_at`,
      [id, name, invocation_semantics ?? '{}', now],
      CONN
    )
    return response.json({ saved: true, id })
  }

  async deleteHarness({ params, response }: HttpContext) {
    const r = await q('DELETE FROM harnesses WHERE id = $1', [params.id], CONN)
    return response.json({ deleted: r.rowCount > 0, id: params.id })
  }

  // ── Models ─────────────────────────────────────────────────────
  async listModels(_ctx: HttpContext) {
    const r = await q('SELECT * FROM models ORDER BY name', [], CONN)
    return r.rows
  }

  async getModel({ params, response }: HttpContext) {
    const r = await q('SELECT * FROM models WHERE id = $1', [params.id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Model not found' })
    return response.json(r.rows[0])
  }

  async upsertModel({ request, response }: HttpContext) {
    const { id, name, harness_id, provider_id, model_identifier } = request.all()
    if (!id || !name || !harness_id || !model_identifier) {
      return response.status(400).json({ error: 'id, name, harness_id, and model_identifier are required' })
    }
    const now = new Date().toISOString()
    await q(
      `INSERT INTO models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $6)
       ON CONFLICT(id) DO UPDATE SET
         name = EXCLUDED.name, harness_id = EXCLUDED.harness_id,
         provider_id = EXCLUDED.provider_id, model_identifier = EXCLUDED.model_identifier,
         updated_at = EXCLUDED.updated_at`,
      [id, name, harness_id, provider_id ?? null, model_identifier, now],
      CONN
    )
    return response.json({ saved: true, id })
  }

  async deleteModel({ params, response }: HttpContext) {
    const r = await q('DELETE FROM models WHERE id = $1', [params.id], CONN)
    return response.json({ deleted: r.rowCount > 0, id: params.id })
  }

  // ── Role Configs ───────────────────────────────────────────────
  async listRoleConfigs(_ctx: HttpContext) {
    const r = await q(
      `SELECT DISTINCT ON (cb.role)
              cb.id, cb.role, cb.model_id,
              COALESCE(cb.provider_id, m.provider_id) AS provider_id,
              COALESCE(cb.harness_id, m.harness_id) AS harness_id,
              '{}'::TEXT AS extra_params, cb.created_at, cb.updated_at
       FROM config_bundle cb
       JOIN models m ON cb.model_id = m.id
       WHERE cb.is_active = 1
       ORDER BY cb.role, cb.priority ASC`,
      [],
      CONN
    )
    return r.rows
  }

  async getRoleConfig({ params, response }: HttpContext) {
    const r = await q(
      `SELECT cb.id, cb.role, cb.model_id,
              COALESCE(cb.provider_id, m.provider_id) AS provider_id,
              COALESCE(cb.harness_id, m.harness_id) AS harness_id,
              '{}'::TEXT AS extra_params, cb.created_at, cb.updated_at
       FROM config_bundle cb
       JOIN models m ON cb.model_id = m.id
       WHERE cb.role = $1 AND cb.is_active = 1
       ORDER BY cb.priority ASC LIMIT 1`,
      [params.role],
      CONN
    )
    if (r.rows.length === 0) return response.status(404).json({ error: 'Role config not found' })
    return response.json(r.rows[0])
  }

  async upsertRoleConfig({ request, response }: HttpContext) {
    const { id, role, provider_id, harness_id, model_id, bundles } = request.all()
    if (!id || !role || !provider_id || !harness_id || !model_id) {
      return response.status(400).json({ error: 'id, role, provider_id, harness_id, and model_id are required' })
    }
    if (Array.isArray(bundles) && bundles.length > 0) {
      const modeErr = bundlesInvocationModeError(bundles)
      if (modeErr) {
        return response.status(400).json({ error: modeErr, allowed: INVOCATION_MODES })
      }
      await this.upsertConfigBundles(role, bundles)
    } else {
      const now = new Date().toISOString()
      const verified = await this.isModelVerified(model_id)
      const isActive = verified ? 1 : 0
      await q(
        `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, 0, 'CLI', $7, '{}', $8, $8)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, role = EXCLUDED.role, model_id = EXCLUDED.model_id,
           provider_id = EXCLUDED.provider_id, harness_id = EXCLUDED.harness_id,
           priority = 0, is_active = EXCLUDED.is_active, updated_at = EXCLUDED.updated_at`,
        [id, `Primary: ${model_id} for ${role}`, role, model_id, provider_id, harness_id, isActive, now],
        CONN
      )
    }
    return response.json({ saved: true, id, role })
  }

  async deleteRoleConfig({ params, response }: HttpContext) {
    const r = await q('DELETE FROM config_bundle WHERE role = $1', [params.role], CONN)
    return response.json({ deleted: r.rowCount > 0, role: params.role })
  }

  private async isModelVerified(modelId: string): Promise<boolean> {
    const r = await q('SELECT verified FROM models WHERE id = $1', [modelId], CONN)
    return r.rows.length > 0 && r.rows[0].verified === true
  }

  // ── Config Bundles ─────────────────────────────────────────────
  async listBundles(_ctx: HttpContext) {
    const r = await q('SELECT * FROM config_bundle ORDER BY role, priority ASC', [], CONN)
    return r.rows
  }

  async listRoleBundles({ params }: HttpContext) {
    const r = await q('SELECT * FROM config_bundle WHERE role = $1 ORDER BY priority ASC', [params.role], CONN)
    return r.rows
  }

  async getBundle({ params, response }: HttpContext) {
    const r = await q('SELECT * FROM config_bundle WHERE id = $1', [params.id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Bundle not found' })
    return response.json(r.rows[0])
  }

  async upsertBundle({ request, response }: HttpContext) {
    const { id, name, role, model_id, provider_id, harness_id, priority,
            invocation_mode, command, endpoint_url, timeout_ms,
            valid_from, valid_to, is_active, metadata } = request.all()
    if (!name || !role || !model_id) {
      return response.status(400).json({ error: 'name, role, and model_id are required' })
    }
    const modeErr = invocationModeError(invocation_mode)
    if (modeErr) {
      return response.status(400).json({ error: modeErr, allowed: INVOCATION_MODES })
    }
    const isActive = is_active === true || is_active === 1 || is_active === '1' ? 1 : 0
    const bundleId = id || `bundle-${Date.now().toString(36)}`
    const now = new Date().toISOString()
    await q(
      `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority,
              invocation_mode, command, endpoint_url, timeout_ms, valid_from, valid_to,
              is_active, metadata, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
       ON CONFLICT (id) DO UPDATE SET
         name = EXCLUDED.name, role = EXCLUDED.role, model_id = EXCLUDED.model_id,
         provider_id = EXCLUDED.provider_id, harness_id = EXCLUDED.harness_id,
         priority = EXCLUDED.priority, invocation_mode = EXCLUDED.invocation_mode,
         command = EXCLUDED.command, endpoint_url = EXCLUDED.endpoint_url,
         timeout_ms = EXCLUDED.timeout_ms, valid_from = EXCLUDED.valid_from,
         valid_to = EXCLUDED.valid_to, is_active = EXCLUDED.is_active,
         metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at`,
      [bundleId, name, role, model_id, provider_id ?? null, harness_id ?? null, priority ?? 0,
       invocation_mode ?? 'CLI', command ?? null, endpoint_url ?? null, timeout_ms ?? null,
       valid_from ?? null, valid_to ?? null, isActive, metadata ? JSON.stringify(metadata) : '{}', now],
      CONN
    )
    return response.json({ saved: true, id: bundleId })
  }

  async deleteBundle({ params, response }: HttpContext) {
    const r = await q('DELETE FROM config_bundle WHERE id = $1', [params.id], CONN)
    return response.json({ deleted: r.rowCount > 0, id: params.id })
  }

  async upsertConfigBundles(role: string, bundles: any[]) {
    for (const b of bundles) {
      const bundleId = b.id || `bundle-${Date.now().toString(36)}`
      const now = new Date().toISOString()
      const isActive = b.is_active === true || b.is_active === 1 || b.is_active === '1' ? 1 : 0
      await q(
        `INSERT INTO config_bundle (id, name, role, model_id, provider_id, harness_id, priority,
                invocation_mode, command, endpoint_url, timeout_ms, valid_from, valid_to,
                is_active, metadata, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $16)
         ON CONFLICT (id) DO UPDATE SET
           name = EXCLUDED.name, role = EXCLUDED.role, model_id = EXCLUDED.model_id,
           provider_id = EXCLUDED.provider_id, harness_id = EXCLUDED.harness_id,
           priority = EXCLUDED.priority, invocation_mode = EXCLUDED.invocation_mode,
           command = EXCLUDED.command, endpoint_url = EXCLUDED.endpoint_url,
           timeout_ms = EXCLUDED.timeout_ms, valid_from = EXCLUDED.valid_from,
           valid_to = EXCLUDED.valid_to, is_active = EXCLUDED.is_active,
           metadata = EXCLUDED.metadata, updated_at = EXCLUDED.updated_at`,
        [bundleId, b.name || `Bundle for ${role}`, role, b.model_id, b.provider_id ?? null, b.harness_id ?? null,
         b.priority ?? 0, b.invocation_mode ?? 'CLI', b.command ?? null, b.endpoint_url ?? null, b.timeout_ms ?? null,
         b.valid_from ?? null, b.valid_to ?? null, isActive, b.metadata ? JSON.stringify(b.metadata) : '{}', now],
        CONN
      )
    }
  }

  async bulkUpsertRoleBundles({ params, request, response }: HttpContext) {
    const { bundles } = request.all()
    if (!Array.isArray(bundles) || bundles.length === 0) {
      return response.status(400).json({ error: 'bundles array is required' })
    }
    const modeErr = bundlesInvocationModeError(bundles)
    if (modeErr) {
      return response.status(400).json({ error: modeErr, allowed: INVOCATION_MODES })
    }
    await this.upsertConfigBundles(params.role, bundles)
    return response.json({ saved: true, role: params.role, count: bundles.length })
  }

  // ── Resolved Config ────────────────────────────────────────────
  async resolveRoleConfig({ params, response }: HttpContext) {
    const r = await q(
      `SELECT cb.id, cb.role, cb.model_id, cb.provider_id, cb.harness_id, cb.priority,
              cb.invocation_mode, cb.command, cb.endpoint_url, cb.timeout_ms, cb.is_active,
              m.model_identifier, m.name AS model_name,
              p.name AS provider_name, h.name AS harness_name
       FROM config_bundle cb
       JOIN models m ON cb.model_id = m.id
       LEFT JOIN providers p ON COALESCE(cb.provider_id, m.provider_id) = p.id
       LEFT JOIN harnesses h ON COALESCE(cb.harness_id, m.harness_id) = h.id
       WHERE cb.role = $1 AND cb.is_active = 1
       ORDER BY cb.priority ASC, cb.created_at ASC
       LIMIT 1`,
      [params.role],
      CONN
    )
    if (r.rows.length === 0) return response.status(404).json({ error: `No config found for role '${params.role}'` })
    const primary = r.rows[0]
    const fallbacks = await q(
      `SELECT cb.id, cb.role, cb.model_id, cb.provider_id, cb.harness_id, cb.priority,
              cb.invocation_mode, cb.command, cb.endpoint_url, cb.timeout_ms, cb.is_active,
              m.model_identifier, m.name AS model_name,
              p.name AS provider_name, h.name AS harness_name
       FROM config_bundle cb
       JOIN models m ON cb.model_id = m.id
       LEFT JOIN providers p ON COALESCE(cb.provider_id, m.provider_id) = p.id
       LEFT JOIN harnesses h ON COALESCE(cb.harness_id, m.harness_id) = h.id
       WHERE cb.role = $1 AND cb.is_active = 1 AND cb.id <> $2
       ORDER BY cb.priority ASC, cb.created_at ASC`,
      [params.role, primary.id],
      CONN
    )
    return response.json({ primary, fallbacks: fallbacks.rows })
  }

  // ── Test Invoke ────────────────────────────────────────────────
  async testInvoke({ request, response }: HttpContext) {
    try {
      const { model_id, test_prompt } = request.all()
      if (!model_id || !test_prompt) {
        return response.status(400).json({ error: 'model_id and test_prompt are required' })
      }
      const models = await q('SELECT * FROM models WHERE id = $1', [model_id], CONN)
      const model = models.rows[0]
      if (!model) return response.status(404).json({ error: `Model ${model_id} not found` })
      if (!model.verified) {
        return response.status(400).json({
          error: `Model ${model_id} is not verified — test invocation refused. Verify the model through a successful harness run before testing.`,
        })
      }
      const harnesses = await q('SELECT * FROM harnesses WHERE id = $1', [model.harness_id], CONN)
      const harness = harnesses.rows[0]
      if (!harness) return response.status(404).json({ error: `Harness ${model.harness_id} not found` })

      const providers = await q('SELECT * FROM providers WHERE id = $1', [model.provider_id], CONN)
      const provider = providers.rows[0]
      const runModelId = openCodeModelArg(model, provider)

      let harnessType = 'opencode'
      try {
        const sem = JSON.parse(harness.invocation_semantics || '{}')
        const binary = (sem.binary || 'opencode').toLowerCase()
        if (binary.includes('codex')) harnessType = 'codex'
        else if (binary.includes('ollama')) harnessType = 'ollama'
        else harnessType = 'opencode'
      } catch { /* default */ }

      const now = new Date().toISOString()
      const sessionId = `test-${model_id}-${Date.now()}`
      await q(
        `INSERT INTO sessions (id, agent_role, start_iso, model)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, 'test', now, model.model_identifier],
        CONN
      )

      const projectRoot = process.env.PIPELINE_ROOT || '/home/codex/dev'
      const sessionsDir = path.join(projectRoot, 'nexus', 'logs')
      fs.mkdirSync(sessionsDir, { recursive: true })
      const sessionLogPath = path.join(sessionsDir, `${sessionId}.log`)
      const logFd = fs.openSync(sessionLogPath, 'a')

      const proc = spawn(harnessType, [
        'run', '--model', runModelId,
        '--dir', projectRoot,
        '--print-logs', '--log-level', 'ERROR',
        test_prompt,
      ], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
      })
      fs.closeSync(logFd)
      proc.unref()

      if (proc.pid && proc.pid > 0) {
        await q('UPDATE sessions SET pid = $1 WHERE id = $2', [proc.pid, sessionId], CONN)
      }

      return response.json({
        started: true,
        sessionId,
        model_id,
        model_name: model.name,
        model_identifier: model.model_identifier,
        harness: harnessType,
        logPath: `/log/${sessionId}`,
        timestamp: new Date().toISOString(),
      })
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  // ── Verify Model ───────────────────────────────────────────────
  async verifyModel({ request, response }: HttpContext) {
    try {
      const { model_id, test_prompt } = request.all()
      if (!model_id) return response.status(400).json({ error: 'model_id is required' })

      const models = await q('SELECT * FROM models WHERE id = $1', [model_id], CONN)
      const model = models.rows[0]
      if (!model) return response.status(404).json({ error: `Model ${model_id} not found` })

      if (model.verified) {
        return response.json({
          started: false, alreadyVerified: true, verified: true, model_id,
          message: 'Model is already verified — nothing to run.',
        })
      }
      const harnesses = await q('SELECT * FROM harnesses WHERE id = $1', [model.harness_id], CONN)
      const harness = harnesses.rows[0]
      if (!harness) return response.status(404).json({ error: `Harness ${model.harness_id} not found` })

      const providers = await q('SELECT * FROM providers WHERE id = $1', [model.provider_id], CONN)
      const provider = providers.rows[0]
      const runModelId = openCodeModelArg(model, provider)

      let harnessType = 'opencode'
      try {
        const sem = JSON.parse(harness.invocation_semantics || '{}')
        const binary = (sem.binary || 'opencode').toLowerCase()
        if (binary.includes('codex')) harnessType = 'codex'
        else if (binary.includes('ollama')) harnessType = 'ollama'
        else harnessType = 'opencode'
      } catch { /* default */ }

      const prompt = test_prompt || VERIFY_DEFAULT_PROMPT
      const now = new Date().toISOString()
      const sessionId = `verify-${model_id}-${Date.now()}`
      await q(
        `INSERT INTO sessions (id, agent_role, start_iso, model)
         VALUES ($1, $2, $3, $4)`,
        [sessionId, 'test', now, model.model_identifier],
        CONN
      )

      const projectRoot = process.env.PIPELINE_ROOT || '/home/codex/dev'
      const sessionsDir = path.join(projectRoot, 'nexus', 'logs')
      fs.mkdirSync(sessionsDir, { recursive: true })
      const sessionLogPath = path.join(sessionsDir, `${sessionId}.log`)
      const logFd = fs.openSync(sessionLogPath, 'a')

      const proc = spawn(harnessType, [
        'run', '--model', runModelId,
        '--dir', projectRoot,
        '--print-logs', '--log-level', 'ERROR',
        prompt,
      ], {
        detached: true,
        stdio: ['ignore', logFd, logFd],
      })
      fs.closeSync(logFd)

      let settled = false
      let watchdog: ReturnType<typeof setTimeout> | undefined
      const onDone = async (exitCode: number | null) => {
        if (settled) return
        settled = true
        if (watchdog) clearTimeout(watchdog)
        const doneIso = new Date().toISOString()
        let success = exitCode === 0
        if (success) {
          try {
            const tail = fs.readFileSync(sessionLogPath, 'utf8').slice(-4000)
            if (VERIFY_FAIL_MARKERS.test(tail)) success = false
          } catch { /* keep exit-code verdict */ }
        }
        try {
          if (success) {
            await q('UPDATE models SET verified = $1, updated_at = $2 WHERE id = $3', [true, new Date().toISOString(), model_id], CONN)
            const rearmed = await q(
              `UPDATE config_bundle SET is_active = 1, updated_at = $2 WHERE model_id = $1`,
              [model_id, new Date().toISOString()],
              CONN
            )
            console.log(`[verify] ${model_id} VERIFIED — ${rearmed.rowCount} bundle(s) re-armed`)
          }
          await q(
            `UPDATE sessions SET end_iso = $1, exit_code = $2, is_running = 0 WHERE id = $3`,
            [doneIso, exitCode ?? -1, sessionId],
            CONN
          )
        } catch (e: any) {
          console.error(`[verify] ${sessionId} post-exit update failed:`, e.message)
        }
      }
      proc.on('exit', (code) => { void onDone(code) })
      proc.on('error', (err) => {
        console.error(`[verify] ${sessionId} spawn error:`, err.message)
        void onDone(null)
      })
      watchdog = setTimeout(() => {
        if (settled) return
        console.error(`[verify] ${sessionId} watchdog fired after ${VERIFY_WATCHDOG_MS / 60000}min — killing hung harness`)
        try { proc.kill('SIGKILL') } catch { /* child gone */ }
      }, VERIFY_WATCHDOG_MS)

      if (proc.pid && proc.pid > 0) {
        await q('UPDATE sessions SET pid = $1 WHERE id = $2', [proc.pid, sessionId], CONN)
      }

      return response.json({
        started: true, verified: false, sessionId, model_id,
        model_name: model.name, model_identifier: model.model_identifier,
        harness: harnessType, logPath: `/log/${sessionId}`,
        message: 'Verification run started — the model flips to verified on a clean exit.',
        timestamp: new Date().toISOString(),
      })
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  async verifyStatus({ params, response }: HttpContext) {
    try {
      const r = await q('SELECT * FROM sessions WHERE id = $1', [params.sessionId], CONN)
      const session = r.rows[0]
      if (!session) return response.status(404).json({ error: 'Verify session not found' })
      let running = session.is_running === 1
      let staleSettled = false
      if (running && session.start_iso) {
        const ageMs = Date.now() - new Date(session.start_iso).getTime()
        if (ageMs > VERIFY_WATCHDOG_MS + 2 * 60 * 1000) {
          const nowIso = new Date().toISOString()
          await q(
            `UPDATE sessions SET end_iso = $1, exit_code = $2, is_running = 0 WHERE id = $3`,
            [nowIso, -1, session.id],
            CONN
          )
          session.exit_code = -1
          session.end_iso = nowIso
          running = false
          staleSettled = true
        }
      }
      return response.json({
        sessionId: session.id,
        running,
        exit_code: session.exit_code,
        end_iso: session.end_iso,
        model_identifier: session.model,
        verified: running ? null : session.exit_code === 0,
        stale_settled: staleSettled,
      })
    } catch (e: any) {
      return response.status(500).json({ error: e.message })
    }
  }

  // ── Tool Access ────────────────────────────────────────────────
  async listToolAccess({ request, response }: HttpContext) {
    const { role } = request.qs()
    const r = role
      ? await q('SELECT id, role, mcp_id, tool_slug, created_at FROM role_tool_access WHERE role = $1 ORDER BY role, tool_slug', [role], CONN)
      : await q('SELECT id, role, mcp_id, tool_slug, created_at FROM role_tool_access ORDER BY role, tool_slug', [], CONN)
    return response.json({ count: r.rows.length, access: r.rows })
  }

  async listRoleToolAccess({ params }: HttpContext) {
    const r = await q('SELECT id, role, mcp_id, tool_slug, created_at FROM role_tool_access WHERE role = $1 ORDER BY role, tool_slug', [params.role], CONN)
    return { count: r.rows.length, access: r.rows }
  }

  async updateToolAccess({ params, request, response }: HttpContext) {
    const { allowed } = request.all()
    if (typeof allowed !== 'boolean') {
      return response.status(400).json({ error: 'allowed (boolean) is required' })
    }
    if (allowed === false) {
      const r = await q('DELETE FROM role_tool_access WHERE id = $1', [params.id], CONN)
      if (r.rowCount === 0) return response.status(404).json({ error: 'Tool access rule not found' })
      return response.json({ updated: true, id: params.id, deleted: true })
    }
    const r = await q('SELECT id, role, mcp_id, tool_slug FROM role_tool_access WHERE id = $1', [params.id], CONN)
    if (r.rows.length === 0) return response.status(404).json({ error: 'Tool access rule not found' })
    return response.json({ updated: true, ...r.rows[0] })
  }
}
