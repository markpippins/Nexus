import type { HttpContext } from '@adonisjs/core/http'
import db from '@adonisjs/lucid/services/db'
import { TABLES, getTable, type TableMeta } from '../services/semantics_tables.js'

/**
 * semantics-srv routes, re-homed onto the control-plane edge (Wave 2.2).
 * Same wire surface as the retired Express service, backed by the
 * semantics.* schema in the nexus database.
 *
 * NOTE: Lucid rawQuery bindings go through knex, so placeholders are `?`
 * (knex translates to pg's $n). Where the original SQL reused a `$n`
 * placeholder, the value is passed once per occurrence.
 */

// ── Helpers ──────────────────────────────────────────────────────────

function coerce(t: TableMeta, paramName: string, value: any): any {
  const col = paramName.replace(/^p_/, '')
  if (t.smallintCols.includes(col)) {
    if (value === null || value === undefined) return null
    const n = Number(value)
    if (Number.isNaN(n)) throw new Error(`Invalid numeric value for ${paramName}: ${value}`)
    return n
  }
  if (t.jsonbCols.includes(col)) {
    if (value === null || value === undefined) return null
    if (typeof value === 'string') return JSON.parse(value)
    return value
  }
  return value
}

function buildAddCall(t: TableMeta, body: Record<string, any>): { sql: string; values: any[] } {
  const values: any[] = []
  const parts: string[] = []
  const push = (name: string, val: any) => {
    values.push(coerce(t, name, val))
    parts.push(`${name} => ?`)
  }
  if (body.p_id !== undefined) push('p_id', body.p_id)
  for (const col of t.writable) {
    const key = `p_${col}`
    if (body[key] !== undefined) push(key, body[key])
  }
  return { sql: `SELECT * FROM semantics.add_${t.table}(${parts.join(', ')})`, values }
}

function buildUpdateCall(t: TableMeta, body: Record<string, any>): { sql: string; values: any[] } {
  const values: any[] = []
  const parts: string[] = []
  const push = (name: string, val: any) => {
    values.push(coerce(t, name, val))
    parts.push(`${name} => ?`)
  }
  const idParam = t.idParam ?? 'p_id'
  push(idParam, body[idParam] ?? body.p_id)
  if (t.table === 'owning_subsystem') {
    if (body.p_new_id === undefined) {
      throw new Error('update owning_subsystem requires p_new_id (the new smallint key)')
    }
    push('p_new_id', body.p_new_id)
  }
  if (t.table === 'relationship_type' || t.table === 'evidence_type') {
    if (body.p_new_name === undefined) {
      throw new Error(`update ${t.table} requires p_new_name (the new name)`)
    }
    push('p_new_name', body.p_new_name)
  }
  for (const col of t.writable) {
    const key = `p_${col}`
    if (key === idParam) continue
    if (body[key] !== undefined) push(key, body[key])
  }
  return { sql: `SELECT * FROM semantics.update_${t.table}(${parts.join(', ')})`, values }
}

function intParam(v: any, dflt: number, min = 0, max = 500): number {
  const n = v === undefined ? dflt : parseInt(String(v), 10)
  if (Number.isNaN(n)) return dflt
  return Math.max(min, Math.min(max, n))
}

function errResponse(response: any, status: number, error: string, message: string) {
  return response.status(status).json({ error, message })
}

async function resolveAsset(id: string): Promise<any | null> {
  const { rows } = await db.rawQuery(
    `SELECT * FROM semantics.canonical_asset
     WHERE (id::text = ? OR canonical_asset_id = ?) AND expired_at IS NULL LIMIT 1`,
    [id, id],
  )
  return rows[0] || null
}

export default class SemanticsController {
  /** GET /api/meta — schema overview. */
  async meta({ response }: HttpContext) {
    try {
      const items = []
      for (const t of TABLES) {
        const r = await db.rawQuery(
          `SELECT
             (SELECT count(*)::int FROM semantics.${t.table} WHERE expired_at IS NULL) AS active,
             (SELECT count(*)::int FROM semantics.${t.table}) AS total`,
        )
        items.push({ table: t.table, label: t.label, idType: t.idType, idAuto: t.idAuto, ...r.rows[0] })
      }
      const { rows: procRows } = await db.rawQuery(`
        SELECT count(*)::int AS procs
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
        WHERE n.nspname = 'semantics'
          AND (p.proname LIKE 'add_%' OR p.proname LIKE 'soft_delete_%'
               OR p.proname LIKE 'update_%' OR p.proname LIKE 'resolve_%')`)
      return response.json({
        service: 'semantics-srv',
        schema: 'semantics',
        tables: items,
        procs: procRows[0]?.procs ?? 0,
        writableParams: Object.fromEntries(TABLES.map((t) => [t.table, ['p_id', ...t.writable.map((c) => `p_${c}`)]])),
      })
    } catch (err: any) {
      return errResponse(response, 500, 'meta_failed', err.message)
    }
  }

  /** GET /api/canonical_asset/:id — expanded envelope. */
  async assetEnvelope({ params, response }: HttpContext) {
    try {
      const assetId = params.id
      const { rows: [asset] } = await db.rawQuery(
        `SELECT * FROM semantics.canonical_asset
         WHERE (id::text = ? OR canonical_asset_id = ?) AND expired_at IS NULL LIMIT 1`,
        [assetId, assetId],
      )
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${assetId} not found`)
      }

      const [revResult, claimResult, relResult] = await Promise.all([
        db.rawQuery(
          `SELECT ar.*,
                  COALESCE(json_agg(
                    json_build_object(
                      'id', so.id, 'platform', so.platform,
                      'platformIdentifier', so.platform_identifier,
                      'namespace', so.namespace, 'rawLocation', so.raw_location,
                      'observedAt', so.observed_at, 'ingestionRunId', so.ingestion_run_id,
                      'rawHash', so.raw_hash
                    ) ORDER BY so.observed_at DESC
                  ) FILTER (WHERE so.id IS NOT NULL), '[]'::json) AS "sourceObservations",
                  parent.revision_id AS "parentRevisionId"
           FROM semantics.asset_revision ar
           LEFT JOIN semantics.source_observation so ON so.revision_id = ar.id AND so.expired_at IS NULL
           LEFT JOIN semantics.asset_revision parent ON parent.id = ar.parent_revision_id
           WHERE ar.asset_id = ? AND ar.expired_at IS NULL
           GROUP BY ar.id, parent.revision_id
           ORDER BY ar.recording_start DESC NULLS LAST, ar.created_at DESC`,
          [asset.id],
        ),
        db.rawQuery(
          `SELECT aic.*,
                  json_build_object(
                    'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                    'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
                  ) AS "candidateAsset"
           FROM semantics.asset_identity_claim aic
           LEFT JOIN semantics.canonical_asset ca ON ca.id = aic.candidate_asset_id AND ca.expired_at IS NULL
           WHERE aic.asset_id = ? AND aic.expired_at IS NULL
           ORDER BY aic.created_at DESC`,
          [asset.id],
        ),
        db.rawQuery(
          `SELECT ar.*,
                  json_build_object(
                    'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                    'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
                  ) AS "relatedAsset",
                  CASE WHEN ar.from_asset_id = ? THEN 'outbound' ELSE 'inbound' END AS direction
           FROM semantics.asset_relation ar
           JOIN semantics.canonical_asset ca ON ca.id =
             CASE WHEN ar.from_asset_id = ? THEN ar.to_asset_id ELSE ar.from_asset_id END
             AND ca.expired_at IS NULL
           WHERE (ar.from_asset_id = ? OR ar.to_asset_id = ?)
             AND ar.expired_at IS NULL
           ORDER BY ar.effective_at DESC`,
          [asset.id, asset.id, asset.id, asset.id],
        ),
      ])

      let extRows: any[] = []
      try {
        const { rows } = await db.rawQuery(
          `SELECT ar.id, ar.relation_type AS "relationType",
                  ar.effective_at AS "effectiveAt",
                  json_build_object(
                    'id', ns.id, 'name', ns.name,
                    'description', ns.description
                  ) AS "nebulaSystem"
           FROM semantics.asset_relation ar
           JOIN nebula.systems ns ON ns.asset_id = ar.from_asset_id
           WHERE ar.to_asset_id = ?
             AND ar.expired_at IS NULL
           ORDER BY ar.effective_at DESC`,
          [asset.id],
        )
        extRows = rows
      } catch {
        // nebula schema may not be accessible in all environments
      }

      const revisions = (revResult.rows || []).map((r: any) => ({
        id: r.id,
        revisionId: r.revision_id,
        contentHash: r.content_hash,
        sourceHash: r.source_hash,
        recordingStart: r.recording_start,
        recordingEnd: r.recording_end,
        createdBy: r.created_by,
        createdAt: r.created_at,
        parentRevisionId: r.parentRevisionId || null,
        sourceObservations: r.sourceObservations || [],
      }))

      const identityClaims = (claimResult.rows || []).map((c: any) => ({
        id: c.id,
        claimType: c.claim_type,
        confidence: c.confidence,
        basis: c.basis,
        status: c.status,
        decidedBy: c.decided_by,
        decidedAt: c.decided_at,
        candidateAsset: c.candidateAsset || null,
      }))

      const relations = (relResult.rows || []).map((r: any) => ({
        id: r.id,
        relationType: r.relation_type,
        direction: r.direction,
        effectiveAt: r.effective_at,
        decidedBy: r.decided_by,
        decidedAt: r.decided_at,
        relatedAsset: r.relatedAsset,
      }))

      return response.json({
        id: asset.id,
        canonicalAssetId: asset.canonical_asset_id,
        assetKind: asset.asset_kind,
        canonicalKey: asset.canonical_key,
        sourceHash: asset.source_hash,
        contentHash: asset.content_hash,
        validityStart: asset.validity_start,
        validityEnd: asset.validity_end,
        createdAt: asset.created_at,
        expiredAt: asset.expired_at,
        revisions,
        identityClaims,
        relations,
        externalIds: extRows,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'envelope_failed', err.message)
    }
  }

  /** GET /api/asset_revision/:id — expanded envelope. */
  async revisionEnvelope({ params, response }: HttpContext) {
    try {
      const { rows: [rev] } = await db.rawQuery(
        `SELECT * FROM semantics.asset_revision
         WHERE (id::text = ? OR revision_id = ?) AND expired_at IS NULL LIMIT 1`,
        [params.id, params.id],
      )
      if (!rev) {
        return errResponse(response, 404, 'not_found', `asset_revision ${params.id} not found`)
      }

      const [assetResult, soResult, parentResult, childResult] = await Promise.all([
        db.rawQuery('SELECT * FROM semantics.canonical_asset WHERE id = ? AND expired_at IS NULL', [rev.asset_id]),
        db.rawQuery('SELECT * FROM semantics.source_observation WHERE revision_id = ? AND expired_at IS NULL ORDER BY observed_at DESC', [rev.id]),
        rev.parent_revision_id
          ? db.rawQuery('SELECT id, revision_id, content_hash, created_at FROM semantics.asset_revision WHERE id = ?', [rev.parent_revision_id])
          : Promise.resolve({ rows: [] }),
        db.rawQuery('SELECT id, revision_id, content_hash, created_at FROM semantics.asset_revision WHERE parent_revision_id = ? AND expired_at IS NULL ORDER BY created_at DESC', [rev.id]),
      ])

      return response.json({
        id: rev.id,
        revisionId: rev.revision_id,
        contentHash: rev.content_hash,
        sourceHash: rev.source_hash,
        recordingStart: rev.recording_start,
        recordingEnd: rev.recording_end,
        createdBy: rev.created_by,
        createdAt: rev.created_at,
        asset: assetResult.rows[0] || null,
        sourceObservations: soResult.rows,
        parentRevision: parentResult.rows[0] || null,
        childRevisions: childResult.rows,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'envelope_failed', err.message)
    }
  }

  /** GET /api/evidence_item — filtered list (overrides generic list). */
  async evidenceItems({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const includeExpired = q.includeExpired === 'true' || q.includeExpired === '1'
      const limit = intParam(q.limit, 100, 0, 500)
      const offset = intParam(q.offset, 0, 0)

      const clauses: string[] = includeExpired ? [] : ['ei.expired_at IS NULL']
      const values: any[] = []

      if (q.evidenceType) { clauses.push('et.name = ?'); values.push(q.evidenceType) }
      if (q.origin) { clauses.push('ei.origin = ?'); values.push(q.origin) }
      if (q.uri) { clauses.push('ei.uri LIKE ?'); values.push(`${q.uri}%`) }
      if (q.sourceHash) { clauses.push('ei.source_hash = ?'); values.push(q.sourceHash) }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [dataResult, countResult] = await Promise.all([
        db.rawQuery(
          `SELECT ei.*, et.name AS "evidenceType"
           FROM semantics.evidence_item ei
           JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
           ${where}
           ORDER BY ei.captured_at DESC NULLS LAST
           LIMIT ? OFFSET ?`,
          [...values, limit, offset],
        ),
        db.rawQuery(
          `SELECT count(*)::int AS total
           FROM semantics.evidence_item ei
           JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
           ${where}`,
          values,
        ),
      ])

      return response.json({
        items: dataResult.rows,
        total: countResult.rows[0]?.total ?? 0,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'list_failed', err.message)
    }
  }

  /** GET /api/statement_evidence — filtered list (overrides generic list). */
  async statementEvidence({ request, response }: HttpContext) {
    try {
      const q = request.qs()
      const includeExpired = q.includeExpired === 'true' || q.includeExpired === '1'
      const limit = intParam(q.limit, 100, 0, 500)
      const offset = intParam(q.offset, 0, 0)

      const clauses: string[] = includeExpired ? [] : ['se.expired_at IS NULL']
      const values: any[] = []

      if (q.statementType) { clauses.push('se.statement_type = ?'); values.push(q.statementType) }
      if (q.statementId) { clauses.push('se.statement_id = ?'); values.push(q.statementId) }
      if (q.role) { clauses.push('se.role = ?'); values.push(q.role) }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : ''

      const [dataResult, countResult] = await Promise.all([
        db.rawQuery(
          `SELECT se.*, et.name AS "evidenceType", ei.uri, ei.excerpt
           FROM semantics.statement_evidence se
           JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
           JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
           ${where}
           ORDER BY se.effective_at DESC
           LIMIT ? OFFSET ?`,
          [...values, limit, offset],
        ),
        db.rawQuery(
          `SELECT count(*)::int AS total
           FROM semantics.statement_evidence se
           ${where}`,
          values,
        ),
      ])

      return response.json({
        items: dataResult.rows,
        total: countResult.rows[0]?.total ?? 0,
        page: Math.floor(offset / limit) + 1,
        pageSize: limit,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'list_failed', err.message)
    }
  }

  // ── Generic per-table CRUD (registry-driven) ───────────────────────

  /** GET /api/:table — list (active by default). */
  async listTable({ params, request, response }: HttpContext) {
    const t = getTable(params.table)
    if (!t) return errResponse(response, 404, 'unknown_table', `No semantics table '${params.table}'`)
    try {
      const q = request.qs()
      const includeExpired = q.includeExpired === 'true' || q.includeExpired === '1'
      const limit = intParam(q.limit, 100, 0, 500)
      const offset = intParam(q.offset, 0, 0)
      const where = includeExpired ? '' : 'WHERE expired_at IS NULL'
      const { rows } = await db.rawQuery(
        `SELECT * FROM semantics.${t.table} ${where} ORDER BY id LIMIT ? OFFSET ?`,
        [limit, offset],
      )
      return response.json({ table: t.table, count: rows.length, items: rows })
    } catch (err: any) {
      return errResponse(response, 500, 'list_failed', err.message)
    }
  }

  /** GET /api/:table/:id — get by id (includes expired rows). */
  async getTableRow({ params, response }: HttpContext) {
    const t = getTable(params.table)
    if (!t) return errResponse(response, 404, 'unknown_table', `No semantics table '${params.table}'`)
    try {
      const idCol = t.idCol ?? 'id'
      const match = idCol === 'id' ? 'id = ?' : 'id::text = ? OR ' + idCol + ' = ?'
      const bindings = idCol === 'id' ? [params.id] : [params.id, params.id]
      const { rows } = await db.rawQuery(
        `SELECT * FROM semantics.${t.table} WHERE ${match} LIMIT 1`,
        bindings,
      )
      if (!rows.length) {
        return errResponse(response, 404, 'not_found', `${t.table} ${params.id} not found`)
      }
      return response.json(rows[0])
    } catch (err: any) {
      return errResponse(response, 500, 'get_failed', err.message)
    }
  }

  /** POST /api/:table — add via add_<table> proc. */
  async addTableRow({ params, request, response }: HttpContext) {
    const t = getTable(params.table)
    if (!t) return errResponse(response, 404, 'unknown_table', `No semantics table '${params.table}'`)
    try {
      const { sql, values } = buildAddCall(t, request.body() || {})
      const { rows } = await db.rawQuery(sql, values)
      return response.status(201).json(rows[0])
    } catch (err: any) {
      const isDup = err?.code === '23505'
      return errResponse(response, 400, isDup ? 'duplicate_active_key' : 'add_failed', err.message)
    }
  }

  /** PATCH /api/:table/:id — append-only replace via update_<table> proc. */
  async updateTableRow({ params, request, response }: HttpContext) {
    const t = getTable(params.table)
    if (!t) return errResponse(response, 404, 'unknown_table', `No semantics table '${params.table}'`)
    if (t.table === 'evidence_item') {
      return errResponse(response, 404, 'immutable', 'evidence_item is immutable — no PATCH route')
    }
    try {
      const body = { ...(request.body() || {}), [t.idParam ?? 'p_id']: params.id }
      const { sql, values } = buildUpdateCall(t, body)
      const { rows } = await db.rawQuery(sql, values)
      return response.json({ ...rows[0], superseded_id: params.id })
    } catch (err: any) {
      const isDup = err?.code === '23505'
      const code = err.message?.includes('no active row')
        ? 'not_found'
        : isDup
          ? 'duplicate_active_key'
          : 'update_failed'
      const status = code === 'not_found' ? 404 : 400
      return errResponse(response, status, code, err.message)
    }
  }

  /** DELETE /api/:table/:id — soft-delete (expire-not-delete, idempotent). */
  async softDeleteTableRow({ params, response }: HttpContext) {
    const t = getTable(params.table)
    if (!t) return errResponse(response, 404, 'unknown_table', `No semantics table '${params.table}'`)
    try {
      const { rows } = await db.rawQuery(
        `SELECT semantics.soft_delete_${t.table}(${t.idParam ?? 'p_id'} => ?) AS deleted`,
        [params.id],
      )
      return response.json({ table: t.table, id: params.id, deleted: rows[0].deleted })
    } catch (err: any) {
      return errResponse(response, 500, 'soft_delete_failed', err.message)
    }
  }

  // ── Evidence join endpoints ─────────────────────────────────────────

  /** GET /api/concept_relationship/:id/evidence */
  async conceptRelationshipEvidence({ params, response }: HttpContext) {
    try {
      const { rows: [rel] } = await db.rawQuery(
        'SELECT * FROM semantics.concept_relationship WHERE id = ?',
        [params.id],
      )
      if (!rel) return errResponse(response, 404, 'not_found', 'Concept relationship not found')

      const { rows: evidence } = await db.rawQuery(
        `SELECT se.id AS "statementEvidenceId", se.role, se.strength, se.comment,
                ei.id, ei.uri, ei.excerpt, ei.origin, ei.captured_at AS "capturedAt",
                ei.source_hash AS "sourceHash",
                et.name AS "evidenceType"
         FROM semantics.statement_evidence se
         JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
            AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
         JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
         WHERE se.statement_type = 'concept_relationship'
           AND se.statement_id = ?
           AND se.expired_at IS NULL
         ORDER BY se.effective_at DESC`,
        [params.id],
      )

      return response.json({
        relationship: rel,
        evidence: evidence.map((e: any) => ({
          statementEvidenceId: e.statementEvidenceId,
          role: e.role,
          strength: e.strength,
          comment: e.comment,
          evidenceItem: {
            id: e.id,
            evidenceType: e.evidenceType,
            uri: e.uri,
            excerpt: e.excerpt,
            origin: e.origin,
            capturedAt: e.capturedAt ? new Date(e.capturedAt).getTime() : null,
            sourceHash: e.sourceHash,
          },
        })),
      })
    } catch (err: any) {
      return errResponse(response, 500, 'evidence_lookup_failed', err.message)
    }
  }

  /** GET /api/representation_relationship/:id/evidence */
  async representationRelationshipEvidence({ params, response }: HttpContext) {
    try {
      const { rows: [rel] } = await db.rawQuery(
        'SELECT * FROM semantics.representation_relationship WHERE id = ?',
        [params.id],
      )
      if (!rel) return errResponse(response, 404, 'not_found', 'Representation relationship not found')

      const { rows: evidence } = await db.rawQuery(
        `SELECT se.id AS "statementEvidenceId", se.role, se.strength, se.comment,
                ei.id, ei.uri, ei.excerpt, ei.origin, ei.captured_at AS "capturedAt",
                ei.source_hash AS "sourceHash",
                et.name AS "evidenceType"
         FROM semantics.statement_evidence se
         JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
            AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
         JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
         WHERE se.statement_type = 'representation_relationship'
           AND se.statement_id = ?
           AND se.expired_at IS NULL
         ORDER BY se.effective_at DESC`,
        [params.id],
      )

      return response.json({
        relationship: rel,
        evidence: evidence.map((e: any) => ({
          statementEvidenceId: e.statementEvidenceId,
          role: e.role,
          strength: e.strength,
          comment: e.comment,
          evidenceItem: {
            id: e.id,
            evidenceType: e.evidenceType,
            uri: e.uri,
            excerpt: e.excerpt,
            origin: e.origin,
            capturedAt: e.capturedAt ? new Date(e.capturedAt).getTime() : null,
            sourceHash: e.sourceHash,
          },
        })),
      })
    } catch (err: any) {
      return errResponse(response, 500, 'evidence_lookup_failed', err.message)
    }
  }

  // ── T02 asset sub-resources ─────────────────────────────────────────

  /** GET /api/canonical_asset/:id/revisions */
  async assetRevisions({ params, request, response }: HttpContext) {
    try {
      const q = request.qs()
      const limit = intParam(q.limit, 50, 0, 200)
      const offset = intParam(q.offset, 0, 0)

      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const { rows: revisions } = await db.rawQuery(
        `SELECT ar.*,
                COALESCE(json_agg(
                  json_build_object(
                    'id', so.id, 'platform', so.platform,
                    'platformIdentifier', so.platform_identifier,
                    'namespace', so.namespace, 'rawLocation', so.raw_location,
                    'observedAt', so.observed_at, 'ingestionRunId', so.ingestion_run_id,
                    'rawHash', so.raw_hash
                  ) ORDER BY so.observed_at DESC
                ) FILTER (WHERE so.id IS NOT NULL), '[]'::json) AS "sourceObservations",
                parent.revision_id AS "parentRevisionId"
         FROM semantics.asset_revision ar
         LEFT JOIN semantics.source_observation so ON so.revision_id = ar.id AND so.expired_at IS NULL
         LEFT JOIN semantics.asset_revision parent ON parent.id = ar.parent_revision_id
         WHERE ar.asset_id = ? AND ar.expired_at IS NULL
         GROUP BY ar.id, parent.revision_id
         ORDER BY ar.recording_start DESC NULLS LAST, ar.created_at DESC
         LIMIT ? OFFSET ?`,
        [asset.id, limit, offset],
      )

      const { rows: [{ count }] } = await db.rawQuery(
        'SELECT count(*)::int FROM semantics.asset_revision WHERE asset_id = ? AND expired_at IS NULL',
        [asset.id],
      )

      return response.json({
        asset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
        revisions: (revisions || []).map((r: any) => ({
          id: r.id,
          revisionId: r.revision_id,
          contentHash: r.content_hash,
          sourceHash: r.source_hash,
          recordingStart: r.recording_start,
          recordingEnd: r.recording_end,
          createdBy: r.created_by,
          createdAt: r.created_at,
          parentRevisionId: r.parentRevisionId || null,
          sourceObservations: r.sourceObservations || [],
        })),
        count,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'revisions_failed', err.message)
    }
  }

  /** POST /api/canonical_asset/:id/revisions — create a revision scoped to an asset. */
  async createAssetRevision({ params, request, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const body = request.body() || {}
      const parts: string[] = []
      const values: any[] = []
      const push = (name: string, val: any) => { values.push(val); parts.push(`${name} => ?`) }

      push('p_asset_id', asset.id)
      if (body.revisionId !== undefined) push('p_revision_id', body.revisionId)
      if (body.contentHash !== undefined) push('p_content_hash', body.contentHash)
      if (body.sourceHash !== undefined) push('p_source_hash', body.sourceHash)
      if (body.parentRevisionId !== undefined) push('p_parent_revision_id', body.parentRevisionId)
      if (body.recordingStart !== undefined) push('p_recording_start', body.recordingStart)
      if (body.recordingEnd !== undefined) push('p_recording_end', body.recordingEnd)
      if (body.createdBy !== undefined) push('p_created_by', body.createdBy)

      const { rows: [revision] } = await db.rawQuery(
        `SELECT * FROM semantics.add_asset_revision(${parts.join(', ')})`,
        values,
      )
      return response.status(201).json(revision)
    } catch (err: any) {
      const isDup = err?.code === '23505'
      return errResponse(response, isDup ? 400 : 500, isDup ? 'duplicate_active_key' : 'add_revision_failed', err.message)
    }
  }

  /** GET /api/canonical_asset/:id/identity-claims */
  async assetClaims({ params, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const { rows: claims } = await db.rawQuery(
        `SELECT aic.*,
                json_build_object(
                  'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                  'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
                ) AS "candidateAsset"
         FROM semantics.asset_identity_claim aic
         LEFT JOIN semantics.canonical_asset ca ON ca.id = aic.candidate_asset_id AND ca.expired_at IS NULL
         WHERE aic.asset_id = ? AND aic.expired_at IS NULL
         ORDER BY aic.created_at DESC`,
        [asset.id],
      )

      return response.json({
        asset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
        claims: (claims || []).map((c: any) => ({
          id: c.id,
          claimType: c.claim_type,
          confidence: c.confidence,
          basis: c.basis,
          status: c.status,
          decidedBy: c.decided_by,
          decidedAt: c.decided_at,
          createdAt: c.created_at,
          candidateAsset: c.candidateAsset || null,
        })),
        count: claims.length,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'claims_failed', err.message)
    }
  }

  /** POST /api/canonical_asset/:id/identity-claims — create a claim scoped to an asset. */
  async createAssetClaim({ params, request, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const body = request.body() || {}
      const parts: string[] = []
      const values: any[] = []
      const push = (name: string, val: any) => { values.push(val); parts.push(`${name} => ?`) }

      push('p_asset_id', asset.id)
      if (body.candidateAssetId !== undefined) push('p_candidate_asset_id', body.candidateAssetId)
      if (body.claimType !== undefined) push('p_claim_type', body.claimType)
      if (body.confidence !== undefined) push('p_confidence', body.confidence)
      if (body.basis !== undefined) push('p_basis', body.basis)
      if (body.status !== undefined) push('p_status', body.status)
      if (body.decidedBy !== undefined) push('p_decided_by', body.decidedBy)

      const { rows: [claim] } = await db.rawQuery(
        `SELECT * FROM semantics.add_asset_identity_claim(${parts.join(', ')})`,
        values,
      )
      return response.status(201).json(claim)
    } catch (err: any) {
      const isDup = err?.code === '23505'
      return errResponse(response, isDup ? 400 : 500, isDup ? 'duplicate_active_key' : 'add_claim_failed', err.message)
    }
  }

  /** GET /api/canonical_asset/:id/relations */
  async assetRelations({ params, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const { rows: relations } = await db.rawQuery(
        `SELECT ar.*,
                json_build_object(
                  'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                  'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
                ) AS "relatedAsset",
                CASE WHEN ar.from_asset_id = ? THEN 'outbound' ELSE 'inbound' END AS direction
         FROM semantics.asset_relation ar
         JOIN semantics.canonical_asset ca ON ca.id =
           CASE WHEN ar.from_asset_id = ? THEN ar.to_asset_id ELSE ar.from_asset_id END
           AND ca.expired_at IS NULL
         WHERE (ar.from_asset_id = ? OR ar.to_asset_id = ?)
           AND ar.expired_at IS NULL
         ORDER BY ar.effective_at DESC`,
        [asset.id, asset.id, asset.id, asset.id],
      )

      return response.json({
        asset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
        relations: (relations || []).map((r: any) => ({
          id: r.id,
          relationType: r.relation_type,
          direction: r.direction,
          effectiveAt: r.effective_at,
          decidedBy: r.decided_by,
          decidedAt: r.decided_at,
          relatedAsset: r.relatedAsset,
        })),
        count: relations.length,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'relations_failed', err.message)
    }
  }

  /** POST /api/canonical_asset/:id/relations — create a relation with direction resolution. */
  async createAssetRelation({ params, request, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const body = request.body() || {}
      if (!body.relatedAssetId) {
        return errResponse(response, 400, 'missing_field', 'relatedAssetId is required')
      }
      if (!body.relationType) {
        return errResponse(response, 400, 'missing_field', 'relationType is required')
      }

      const related = await resolveAsset(body.relatedAssetId)
      if (!related) {
        return errResponse(response, 404, 'not_found', `related asset ${body.relatedAssetId} not found`)
      }
      if (asset.id === related.id) {
        return errResponse(response, 400, 'self_relation', 'Cannot relate an asset to itself')
      }

      const parts: string[] = []
      const values: any[] = []
      const push = (name: string, val: any) => { values.push(val); parts.push(`${name} => ?`) }

      push('p_from_asset_id', asset.id)
      push('p_to_asset_id', related.id)
      push('p_relation_type', body.relationType)
      if (body.decidedBy !== undefined) push('p_decided_by', body.decidedBy)
      if (body.effectiveAt !== undefined) push('p_effective_at', body.effectiveAt)

      const { rows: [relation] } = await db.rawQuery(
        `SELECT * FROM semantics.add_asset_relation(${parts.join(', ')})`,
        values,
      )

      return response.status(201).json({
        ...relation,
        fromAsset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
        toAsset: { id: related.id, canonicalAssetId: related.canonical_asset_id, assetKind: related.asset_kind },
      })
    } catch (err: any) {
      const isDup = err?.code === '23505'
      return errResponse(response, isDup ? 400 : 500, isDup ? 'duplicate_active_key' : 'add_relation_failed', err.message)
    }
  }

  /** POST /api/asset_identity_claim/:id/resolve — lifecycle transition. */
  async resolveClaim({ params, request, response }: HttpContext) {
    try {
      const body = request.body() || {}
      const status = body.status
      if (!status || !['resolved', 'rejected'].includes(status)) {
        return errResponse(response, 400, 'invalid_status', "status must be 'resolved' or 'rejected'")
      }

      const { rows: [claim] } = await db.rawQuery(
        'SELECT * FROM semantics.asset_identity_claim WHERE id = ? AND expired_at IS NULL',
        [params.id],
      )
      if (!claim) {
        return errResponse(response, 404, 'not_found', `claim ${params.id} not found`)
      }
      if (claim.status !== 'open') {
        return errResponse(response, 400, 'invalid_transition', `Claim is already ${claim.status} — only 'open' claims can be resolved`)
      }

      const { rows: [updated] } = await db.rawQuery(
        `SELECT * FROM semantics.update_asset_identity_claim(
           p_id => ?, p_asset_id => ?, p_candidate_asset_id => ?,
           p_claim_type => ?, p_confidence => ?, p_basis => ?,
           p_status => ?, p_decided_by => ?, p_decided_at => ?
         )`,
        [
          params.id,
          claim.asset_id,
          claim.candidate_asset_id,
          claim.claim_type,
          claim.confidence,
          claim.basis,
          status,
          body.decidedBy || claim.decided_by || null,
          new Date().toISOString(),
        ],
      )

      return response.json({
        ...updated,
        supersededId: params.id,
        previousStatus: 'open',
      })
    } catch (err: any) {
      return errResponse(response, 500, 'resolve_failed', err.message)
    }
  }

  /** GET /api/canonical_asset/:id/external-ids */
  async assetExternalIds({ params, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      let externalIds: any[] = []
      try {
        const { rows } = await db.rawQuery(
          `SELECT ar.id, ar.relation_type AS "relationType",
                  ar.effective_at AS "effectiveAt",
                  json_build_object(
                    'id', ns.id, 'name', ns.name,
                    'description', ns.description
                  ) AS "nebulaSystem"
           FROM semantics.asset_relation ar
           JOIN nebula.systems ns ON ns.asset_id = ar.from_asset_id
           WHERE ar.to_asset_id = ?
             AND ar.expired_at IS NULL
           ORDER BY ar.effective_at DESC`,
          [asset.id],
        )
        externalIds = rows
      } catch {
        // nebula schema may not be accessible in all environments
      }

      return response.json({
        asset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
        externalIds,
        count: externalIds.length,
      })
    } catch (err: any) {
      return errResponse(response, 500, 'external_ids_failed', err.message)
    }
  }

  /** POST /api/canonical_asset/:id/external-ids — create a cross-schema link. */
  async createExternalId({ params, request, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const body = request.body() || {}
      if (!body.nebulaSystemId) {
        return errResponse(response, 400, 'missing_field', 'nebulaSystemId is required')
      }

      const { rows: [sys] } = await db.rawQuery(
        'SELECT id, name, description, asset_id FROM nebula.systems WHERE id = ?',
        [body.nebulaSystemId],
      )
      if (!sys) {
        return errResponse(response, 404, 'not_found', `nebula system ${body.nebulaSystemId} not found`)
      }
      if (!sys.asset_id) {
        return errResponse(response, 400, 'no_asset', `nebula system ${body.nebulaSystemId} has no asset_id — run V075 first`)
      }

      const { rows: [existing] } = await db.rawQuery(
        `SELECT id FROM semantics.asset_relation
         WHERE from_asset_id = ? AND to_asset_id = ?
           AND relation_type = ? AND expired_at IS NULL`,
        [sys.asset_id, asset.id, body.relationType || 'owns'],
      )
      if (existing) {
        return response.status(409).json({
          error: 'duplicate_active_key',
          message: 'An active relation already exists between these assets',
          existingId: existing.id,
        })
      }

      const { rows: [relation] } = await db.rawQuery(
        `SELECT * FROM semantics.add_asset_relation(
           p_from_asset_id => ?, p_to_asset_id => ?,
           p_relation_type => ?, p_decided_by => ?
         )`,
        [sys.asset_id, asset.id, body.relationType || 'owns', body.decidedBy || null],
      )

      return response.status(201).json({
        ...relation,
        nebulaSystem: { id: sys.id, name: sys.name, description: sys.description },
        canonicalAsset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
      })
    } catch (err: any) {
      const isDup = err?.code === '23505'
      return errResponse(response, isDup ? 409 : 500, isDup ? 'duplicate_active_key' : 'link_failed', err.message)
    }
  }

  /** DELETE /api/canonical_asset/:id/external-ids/:eid — soft-expire a cross-schema link. */
  async deleteExternalId({ params, response }: HttpContext) {
    try {
      const asset = await resolveAsset(params.id)
      if (!asset) {
        return errResponse(response, 404, 'not_found', `canonical_asset ${params.id} not found`)
      }

      const { rows: [result] } = await db.rawQuery(
        `UPDATE semantics.asset_relation
         SET expired_at = now()
         WHERE id = ?
           AND to_asset_id = ?
           AND expired_at IS NULL
         RETURNING id`,
        [params.eid, asset.id],
      )

      if (!result) {
        return errResponse(response, 404, 'not_found', `Relation ${params.eid} not found or already expired for this asset`)
      }

      return response.json({ id: params.eid, deleted: true })
    } catch (err: any) {
      return errResponse(response, 500, 'unlink_failed', err.message)
    }
  }

  /** POST /api/drift_finding/:id/resolve — detected → resolved. */
  async resolveDriftFinding({ params, request, response }: HttpContext) {
    try {
      const resolvedAt = (request.body() || {}).p_resolved_at ?? null
      const { rows } = await db.rawQuery(
        'SELECT semantics.resolve_drift_finding(?, ?) AS resolved',
        [params.id, resolvedAt],
      )
      return response.json({ id: params.id, resolved: rows[0].resolved })
    } catch (err: any) {
      return errResponse(response, 500, 'resolve_failed', err.message)
    }
  }
}
