import { Router } from "express";
import { getDb } from "../db";
import { TABLES, TableMeta } from "../tables";

export const semanticsRouter = Router();

// ── Helpers ──────────────────────────────────────────────────────────

function coerce(t: TableMeta, paramName: string, value: any): any {
  const col = paramName.replace(/^p_/, "");
  if (t.smallintCols.includes(col)) {
    if (value === null || value === undefined) return null;
    const n = Number(value);
    if (Number.isNaN(n)) throw new Error(`Invalid numeric value for ${paramName}: ${value}`);
    return n;
  }
  if (t.jsonbCols.includes(col)) {
    if (value === null || value === undefined) return null;
    if (typeof value === "string") return JSON.parse(value);
    return value;
  }
  return value;
}

function buildAddCall(
  t: TableMeta,
  body: Record<string, any>,
): { sql: string; values: any[] } {
  const values: any[] = [];
  const parts: string[] = [];
  const push = (name: string, val: any) => {
    values.push(coerce(t, name, val));
    parts.push(`${name} => $${values.length}`);
  };
  if (body.p_id !== undefined) push("p_id", body.p_id);
  for (const col of t.writable) {
    const key = `p_${col}`;
    if (body[key] !== undefined) push(key, body[key]);
  }
  return { sql: `SELECT * FROM semantics.add_${t.table}(${parts.join(", ")})`, values };
}

function buildUpdateCall(
  t: TableMeta,
  body: Record<string, any>,
): { sql: string; values: any[] } {
  const values: any[] = [];
  const parts: string[] = [];
  const push = (name: string, val: any) => {
    values.push(coerce(t, name, val));
    parts.push(`${name} => $${values.length}`);
  };
  const idParam = t.idParam ?? "p_id";
  push(idParam, body[idParam] ?? body.p_id);
  if (t.table === "owning_subsystem") {
    if (body.p_new_id === undefined) {
      throw new Error("update owning_subsystem requires p_new_id (the new smallint key)");
    }
    push("p_new_id", body.p_new_id);
  }
  if (t.table === "relationship_type") {
    if (body.p_new_name === undefined) {
      throw new Error("update relationship_type requires p_new_name (the new type name)");
    }
    push("p_new_name", body.p_new_name);
  }
  for (const col of t.writable) {
    const key = `p_${col}`;
    if (key === idParam) continue; // id already pushed above
    if (body[key] !== undefined) push(key, body[key]);
  }
  return { sql: `SELECT * FROM semantics.update_${t.table}(${parts.join(", ")})`, values };
}

// ── GET /api/meta — schema overview ──────────────────────────────────

semanticsRouter.get("/meta", async (_req, res) => {
  try {
    const db = getDb();
    const items = [];
    for (const t of TABLES) {
      const r = await db.query(
        `SELECT
           (SELECT count(*)::int FROM semantics.${t.table} WHERE expired_at IS NULL) AS active,
           (SELECT count(*)::int FROM semantics.${t.table}) AS total`,
      );
      items.push({ table: t.table, label: t.label, idType: t.idType, idAuto: t.idAuto, ...r.rows[0] });
    }
    const { rows: procRows } = await db.query(`
      SELECT count(*)::int AS procs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
      WHERE n.nspname = 'semantics'
        AND (p.proname LIKE 'add_%' OR p.proname LIKE 'soft_delete_%'
             OR p.proname LIKE 'update_%' OR p.proname LIKE 'resolve_%')`);
    res.json({
      service: "semantics-srv",
      schema: "semantics",
      tables: items,
      procs: procRows[0]?.procs ?? 0,
      writableParams: Object.fromEntries(TABLES.map((t) => [t.table, ["p_id", ...t.writable.map((c) => `p_${c}`)]])),
    });
  } catch (err: any) {
    res.status(500).json({ error: "meta_failed", message: err.message });
  }
});

// ── T02: Asset identity spine — envelope routes ─────────────────────
// Registered BEFORE the for-loop so they override the auto-gen flat
// GET /canonical_asset/:id and GET /asset_revision/:id.
// POST/PATCH/DELETE auto-gen routes on the same paths still work
// because they use different HTTP methods.

// GET /api/canonical_asset/:id — expanded envelope with revisions,
// identity claims, relations, and cross-schema external IDs.
semanticsRouter.get("/canonical_asset/:id", async (req, res) => {
  try {
    const db = getDb();
    const assetId = req.params.id;

    // 1. Fetch the asset (match on uuid or canonical_asset_id)
    const { rows: [asset] } = await db.query(
      `SELECT * FROM semantics.canonical_asset
       WHERE (id::text = $1 OR canonical_asset_id = $1)
         AND expired_at IS NULL
       LIMIT 1`,
      [assetId],
    );
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${assetId} not found` });
    }

    // 2–4: run parallel queries (no cross-schema — those can fail independently)
    const [revResult, claimResult, relResult] = await Promise.all([
      // 2. Revisions with source_observations
      db.query(
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
         WHERE ar.asset_id = $1 AND ar.expired_at IS NULL
         GROUP BY ar.id, parent.revision_id
         ORDER BY ar.recording_start DESC NULLS LAST, ar.created_at DESC`,
        [asset.id],
      ),
      // 3. Identity claims with candidate asset
      db.query(
        `SELECT aic.*,
                json_build_object(
                  'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                  'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
                ) AS "candidateAsset"
         FROM semantics.asset_identity_claim aic
         LEFT JOIN semantics.canonical_asset ca ON ca.id = aic.candidate_asset_id AND ca.expired_at IS NULL
         WHERE aic.asset_id = $1 AND aic.expired_at IS NULL
         ORDER BY aic.created_at DESC`,
        [asset.id],
      ),
      // 4. Relations with related asset (resolve both directions).
      // NOTE: CASE in JOIN ON clause trades index usage for a single
      // query instead of a UNION — fine for small relation tables.
      db.query(
        `SELECT ar.*,
                json_build_object(
                  'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                  'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
                ) AS "relatedAsset",
                CASE WHEN ar.from_asset_id = $1 THEN 'outbound' ELSE 'inbound' END AS direction
         FROM semantics.asset_relation ar
         JOIN semantics.canonical_asset ca ON ca.id =
           CASE WHEN ar.from_asset_id = $1 THEN ar.to_asset_id ELSE ar.from_asset_id END
           AND ca.expired_at IS NULL
         WHERE (ar.from_asset_id = $1 OR ar.to_asset_id = $1)
           AND ar.expired_at IS NULL
         ORDER BY ar.effective_at DESC`,
        [asset.id],
      ),
    ]);

    // 5. Cross-schema external IDs — V076 migration: replaced
    //    system_external_ids junction with asset_relation.
    //    Returns nebula systems that own this asset.
    let extRows: any[] = [];
    try {
      const { rows } = await db.query(
        `SELECT ar.id, ar.relation_type AS "relationType",
                ar.effective_at AS "effectiveAt",
                json_build_object(
                  'id', ns.id, 'name', ns.name,
                  'description', ns.description
                ) AS "nebulaSystem"
         FROM semantics.asset_relation ar
         JOIN nebula.systems ns ON ns.asset_id = ar.from_asset_id
         WHERE ar.to_asset_id = $1
           AND ar.expired_at IS NULL
         ORDER BY ar.effective_at DESC`,
        [asset.id],
      );
      extRows = rows;
    } catch {
      // nebula schema may not be accessible in all environments
    }

    // Assemble the envelope
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
    }));

    const identityClaims = (claimResult.rows || []).map((c: any) => ({
      id: c.id,
      claimType: c.claim_type,
      confidence: c.confidence,
      basis: c.basis,
      status: c.status,
      decidedBy: c.decided_by,
      decidedAt: c.decided_at,
      candidateAsset: c.candidateAsset || null,
    }));

    const relations = (relResult.rows || []).map((r: any) => ({
      id: r.id,
      relationType: r.relation_type,
      direction: r.direction,
      effectiveAt: r.effective_at,
      decidedBy: r.decided_by,
      decidedAt: r.decided_at,
      relatedAsset: r.relatedAsset,
    }));

    const externalIds = extRows;

    res.json({
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
      externalIds,
    });
  } catch (err: any) {
    res.status(500).json({ error: "envelope_failed", message: err.message });
  }
});

// GET /api/asset_revision/:id — expanded envelope with asset,
// source observations, parent revision, and child revisions.
semanticsRouter.get("/asset_revision/:id", async (req, res) => {
  try {
    const db = getDb();

    // Fetch the revision
    const { rows: [rev] } = await db.query(
      `SELECT * FROM semantics.asset_revision
       WHERE (id::text = $1 OR revision_id = $1)
         AND expired_at IS NULL
       LIMIT 1`,
      [req.params.id],
    );
    if (!rev) {
      return res.status(404).json({ error: "not_found", message: `asset_revision ${req.params.id} not found` });
    }

    // Parallel: asset, source observations, parent, children
    const [assetResult, soResult, parentResult, childResult] = await Promise.all([
      db.query("SELECT * FROM semantics.canonical_asset WHERE id = $1 AND expired_at IS NULL", [rev.asset_id]),
      db.query("SELECT * FROM semantics.source_observation WHERE revision_id = $1 AND expired_at IS NULL ORDER BY observed_at DESC", [rev.id]),
      rev.parent_revision_id
        ? db.query("SELECT id, revision_id, content_hash, created_at FROM semantics.asset_revision WHERE id = $1", [rev.parent_revision_id])
        : Promise.resolve({ rows: [] }),
      db.query("SELECT id, revision_id, content_hash, created_at FROM semantics.asset_revision WHERE parent_revision_id = $1 AND expired_at IS NULL ORDER BY created_at DESC", [rev.id]),
    ]);

    res.json({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: "envelope_failed", message: err.message });
  }
});

// ── Evidence filter routes (before for-loop to override auto-gen) ──

// GET /api/evidence_item?evidenceType=agent_record&origin=harvested
semanticsRouter.get("/evidence_item", async (req, res) => {
  try {
    const db = getDb();
    const includeExpired = req.query.includeExpired === "true" || req.query.includeExpired === "1";
    const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);

    const clauses: string[] = includeExpired ? [] : ["ei.expired_at IS NULL"];
    const values: any[] = [];
    let i = 1;

    if (req.query.evidenceType) {
      clauses.push(`et.name = $${i++}`);
      values.push(req.query.evidenceType);
    }
    if (req.query.origin) {
      clauses.push(`ei.origin = $${i++}`);
      values.push(req.query.origin);
    }
    if (req.query.uri) {
      clauses.push(`ei.uri LIKE $${i++}`);
      values.push(`${req.query.uri}%`);
    }
    if (req.query.sourceHash) {
      clauses.push(`ei.source_hash = $${i++}`);
      values.push(req.query.sourceHash);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT ei.*, et.name AS "evidenceType"
         FROM semantics.evidence_item ei
         JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
         ${where}
         ORDER BY ei.captured_at DESC NULLS LAST
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, limit, offset],
      ),
      db.query(
        `SELECT count(*)::int AS total
         FROM semantics.evidence_item ei
         JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
         ${where}`,
        values,
      ),
    ]);

    res.json({
      items: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: "list_failed", message: err.message });
  }
});

// GET /api/statement_evidence?statementType=concept_relationship&statementId=<uuid>
semanticsRouter.get("/statement_evidence", async (req, res) => {
  try {
    const db = getDb();
    const includeExpired = req.query.includeExpired === "true" || req.query.includeExpired === "1";
    const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);

    const clauses: string[] = includeExpired ? [] : ["se.expired_at IS NULL"];
    const values: any[] = [];
    let i = 1;

    if (req.query.statementType) {
      clauses.push(`se.statement_type = $${i++}`);
      values.push(req.query.statementType);
    }
    if (req.query.statementId) {
      clauses.push(`se.statement_id = $${i++}`);
      values.push(req.query.statementId);
    }
    if (req.query.role) {
      clauses.push(`se.role = $${i++}`);
      values.push(req.query.role);
    }

    const where = clauses.length > 0 ? `WHERE ${clauses.join(" AND ")}` : "";

    const [dataResult, countResult] = await Promise.all([
      db.query(
        `SELECT se.*, et.name AS "evidenceType", ei.uri, ei.excerpt
         FROM semantics.statement_evidence se
         JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
         JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
         ${where}
         ORDER BY se.effective_at DESC
         LIMIT $${i} OFFSET $${i + 1}`,
        [...values, limit, offset],
      ),
      db.query(
        `SELECT count(*)::int AS total
         FROM semantics.statement_evidence se
         ${where}`,
        values,
      ),
    ]);

    res.json({
      items: dataResult.rows,
      total: countResult.rows[0]?.total ?? 0,
      page: Math.floor(offset / limit) + 1,
      pageSize: limit,
    });
  } catch (err: any) {
    res.status(500).json({ error: "list_failed", message: err.message });
  }
});

// ── Generated per-table CRUD ─────────────────────────────────────────

for (const t of TABLES) {
  const base = `/${t.table}`;

  // GET /api/<table> — list (active by default)
  semanticsRouter.get(base, async (req, res) => {
    try {
      const includeExpired =
        req.query.includeExpired === "true" || req.query.includeExpired === "1";
      const limit = Math.min(parseInt(String(req.query.limit || "100"), 10) || 100, 500);
      const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);
      const where = includeExpired ? "" : "WHERE expired_at IS NULL";
      const { rows } = await getDb().query(
        `SELECT * FROM semantics.${t.table} ${where} ORDER BY ${t.table === "owning_subsystem" ? "id" : "id"} LIMIT $1 OFFSET $2`,
        [limit, offset],
      );
      res.json({ table: t.table, count: rows.length, items: rows });
    } catch (err: any) {
      res.status(500).json({ error: "list_failed", message: err.message });
    }
  });

  // GET /api/<table>/:id — get by id (includes expired rows; row carries expired_at).
  // Tables with an idCol distinct from the uuid PK (relationship_type) match
  // on either the uuid id or the natural key so both lookup styles work.
  semanticsRouter.get(`${base}/:id`, async (req, res) => {
    try {
      const idCol = t.idCol ?? "id";
      // idCol tables (relationship_type) match on either the uuid PK or the
      // natural key; the uuid side is cast to text so the shared $1 placeholder
      // resolves (avoiding 'operator does not exist: text = uuid' ambiguity).
      const match =
        idCol === "id" ? "id = $1" : "id::text = $1 OR " + idCol + " = $1";
      const { rows } = await getDb().query(
        `SELECT * FROM semantics.${t.table} WHERE ${match} LIMIT 1`,
        [req.params.id],
      );
      if (!rows.length) {
        return res.status(404).json({ error: "not_found", message: `${t.table} ${req.params.id} not found` });
      }
      res.json(rows[0]);
    } catch (err: any) {
      res.status(500).json({ error: "get_failed", message: err.message });
    }
  });

  // POST /api/<table> — add via add_<table> proc (p_* body params)
  semanticsRouter.post(base, async (req, res) => {
    try {
      const { sql, values } = buildAddCall(t, req.body || {});
      const { rows } = await getDb().query(sql, values);
      res.status(201).json(rows[0]);
    } catch (err: any) {
      // node-postgres exposes the SQLSTATE on err.code (e.g. '23505'), not in
      // the message text — match on err.code so duplicate detection works.
      const isDup = err?.code === "23505";
      const dup = isDup ? "duplicate_active_key" : "add_failed";
      res.status(400).json({ error: dup, message: err.message });
    }
  });

  // PATCH /api/<table>/:id — append-only replace via update_<table> proc.
  // NOTE: expires the old row and inserts a NEW version with a NEW id.
  // Response includes superseded_id = the id that was expired.
  // evidence_item is immutable — no PATCH route.
  if (t.table !== "evidence_item") {
  semanticsRouter.patch(`${base}/:id`, async (req, res) => {
    try {
      const body = { ...(req.body || {}), [t.idParam ?? "p_id"]: req.params.id };
      const { sql, values } = buildUpdateCall(t, body);
      const { rows } = await getDb().query(sql, values);
      res.json({ ...rows[0], superseded_id: req.params.id });
    } catch (err: any) {
      const isDup = err?.code === "23505";
      const code = err.message?.includes("no active row")
        ? "not_found"
        : isDup
          ? "duplicate_active_key"
          : "update_failed";
      const status = code === "not_found" ? 404 : 400;
      res.status(status).json({ error: code, message: err.message });
    }
  });
  }

  // DELETE /api/<table>/:id — soft-delete (expire-not-delete, idempotent)
  semanticsRouter.delete(`${base}/:id`, async (req, res) => {
    try {
      const { rows } = await getDb().query(
        `SELECT semantics.soft_delete_${t.table}(${t.idParam ?? "p_id"} => $1) AS deleted`,
        [req.params.id],
      );
      res.json({ table: t.table, id: req.params.id, deleted: rows[0].deleted });
    } catch (err: any) {
      res.status(500).json({ error: "soft_delete_failed", message: err.message });
    }
  });
}

// ── Evidence join endpoints ──────────────────────────────────────────

// GET /api/concept-relationship/:id/evidence — all evidence for a concept relationship
semanticsRouter.get("/concept_relationship/:id/evidence", async (req, res) => {
  try {
    const db = getDb();
    const { rows: [rel] } = await db.query(
      "SELECT * FROM semantics.concept_relationship WHERE id = $1",
      [req.params.id],
    );
    if (!rel) return res.status(404).json({ error: "Concept relationship not found" });

    const { rows: evidence } = await db.query(
      `SELECT se.id AS "statementEvidenceId", se.role, se.strength, se.comment,
              ei.id, ei.uri, ei.excerpt, ei.origin, ei.captured_at AS "capturedAt",
              ei.source_hash AS "sourceHash",
              et.name AS "evidenceType"
       FROM semantics.statement_evidence se
       JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
          AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
       JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
       WHERE se.statement_type = 'concept_relationship'
         AND se.statement_id = $1
         AND se.expired_at IS NULL
       ORDER BY se.effective_at DESC`,
      [req.params.id],
    );

    res.json({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: "evidence_lookup_failed", message: err.message });
  }
});

// GET /api/representation-relationship/:id/evidence
semanticsRouter.get("/representation_relationship/:id/evidence", async (req, res) => {
  try {
    const db = getDb();
    const { rows: [rel] } = await db.query(
      "SELECT * FROM semantics.representation_relationship WHERE id = $1",
      [req.params.id],
    );
    if (!rel) return res.status(404).json({ error: "Representation relationship not found" });

    const { rows: evidence } = await db.query(
      `SELECT se.id AS "statementEvidenceId", se.role, se.strength, se.comment,
              ei.id, ei.uri, ei.excerpt, ei.origin, ei.captured_at AS "capturedAt",
              ei.source_hash AS "sourceHash",
              et.name AS "evidenceType"
       FROM semantics.statement_evidence se
       JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
          AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
       JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
       WHERE se.statement_type = 'representation_relationship'
         AND se.statement_id = $1
         AND se.expired_at IS NULL
       ORDER BY se.effective_at DESC`,
      [req.params.id],
    );

    res.json({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: "evidence_lookup_failed", message: err.message });
  }
});

// ── T02: Asset sub-resource routes ───────────────────────────────────

// GET /api/canonical_asset/:id/revisions — paginated revisions
semanticsRouter.get("/canonical_asset/:id/revisions", async (req, res) => {
  try {
    const db = getDb();
    const limit = Math.min(parseInt(String(req.query.limit || "50"), 10) || 50, 200);
    const offset = Math.max(parseInt(String(req.query.offset || "0"), 10) || 0, 0);

    // Resolve asset first (match on uuid or canonical_asset_id)
    const { rows: [asset] } = await db.query(
      "SELECT id, canonical_asset_id, asset_kind FROM semantics.canonical_asset WHERE (id::text = $1 OR canonical_asset_id = $1) AND expired_at IS NULL LIMIT 1",
      [req.params.id],
    );
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const { rows: revisions } = await db.query(
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
       WHERE ar.asset_id = $1 AND ar.expired_at IS NULL
       GROUP BY ar.id, parent.revision_id
       ORDER BY ar.recording_start DESC NULLS LAST, ar.created_at DESC
       LIMIT $2 OFFSET $3`,
      [asset.id, limit, offset],
    );

    const { rows: [{ count }] } = await db.query(
      "SELECT count(*)::int FROM semantics.asset_revision WHERE asset_id = $1 AND expired_at IS NULL",
      [asset.id],
    );

    res.json({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: "revisions_failed", message: err.message });
  }
});

// GET /api/canonical_asset/:id/identity-claims
semanticsRouter.get("/canonical_asset/:id/identity-claims", async (req, res) => {
  try {
    const db = getDb();

    const { rows: [asset] } = await db.query(
      "SELECT id, canonical_asset_id, asset_kind FROM semantics.canonical_asset WHERE (id::text = $1 OR canonical_asset_id = $1) AND expired_at IS NULL LIMIT 1",
      [req.params.id],
    );
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const { rows: claims } = await db.query(
      `SELECT aic.*,
              json_build_object(
                'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
              ) AS "candidateAsset"
       FROM semantics.asset_identity_claim aic
       LEFT JOIN semantics.canonical_asset ca ON ca.id = aic.candidate_asset_id AND ca.expired_at IS NULL
       WHERE aic.asset_id = $1 AND aic.expired_at IS NULL
       ORDER BY aic.created_at DESC`,
      [asset.id],
    );

    res.json({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: "claims_failed", message: err.message });
  }
});

// GET /api/canonical_asset/:id/relations
semanticsRouter.get("/canonical_asset/:id/relations", async (req, res) => {
  try {
    const db = getDb();

    const { rows: [asset] } = await db.query(
      "SELECT id, canonical_asset_id, asset_kind FROM semantics.canonical_asset WHERE (id::text = $1 OR canonical_asset_id = $1) AND expired_at IS NULL LIMIT 1",
      [req.params.id],
    );
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const { rows: relations } = await db.query(
      `SELECT ar.*,
              json_build_object(
                'id', ca.id, 'canonicalAssetId', ca.canonical_asset_id,
                'assetKind', ca.asset_kind, 'canonicalKey', ca.canonical_key
              ) AS "relatedAsset",
              CASE WHEN ar.from_asset_id = $1 THEN 'outbound' ELSE 'inbound' END AS direction
       FROM semantics.asset_relation ar
       JOIN semantics.canonical_asset ca ON ca.id =
         CASE WHEN ar.from_asset_id = $1 THEN ar.to_asset_id ELSE ar.from_asset_id END
         AND ca.expired_at IS NULL
       WHERE (ar.from_asset_id = $1 OR ar.to_asset_id = $1)
         AND ar.expired_at IS NULL
       ORDER BY ar.effective_at DESC`,
      [asset.id],
    );

    res.json({
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
    });
  } catch (err: any) {
    res.status(500).json({ error: "relations_failed", message: err.message });
  }
});

// GET /api/canonical_asset/:id/external-ids — cross-schema bridge
// V076 migration: queries asset_relation instead of the deprecated
// system_external_ids junction.
semanticsRouter.get("/canonical_asset/:id/external-ids", async (req, res) => {
  try {
    const db = getDb();

    const { rows: [asset] } = await db.query(
      "SELECT id, canonical_asset_id, asset_kind FROM semantics.canonical_asset WHERE (id::text = $1 OR canonical_asset_id = $1) AND expired_at IS NULL LIMIT 1",
      [req.params.id],
    );
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    let externalIds: any[] = [];
    try {
      const { rows } = await db.query(
        `SELECT ar.id, ar.relation_type AS "relationType",
                ar.effective_at AS "effectiveAt",
                json_build_object(
                  'id', ns.id, 'name', ns.name,
                  'description', ns.description
                ) AS "nebulaSystem"
         FROM semantics.asset_relation ar
         JOIN nebula.systems ns ON ns.asset_id = ar.from_asset_id
         WHERE ar.to_asset_id = $1
           AND ar.expired_at IS NULL
         ORDER BY ar.effective_at DESC`,
        [asset.id],
      );
      externalIds = rows;
    } catch {
      // nebula schema may not be accessible in all environments — graceful degrade
    }

    res.json({
      asset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
      externalIds,
      count: externalIds.length,
    });
  } catch (err: any) {
    res.status(500).json({ error: "external_ids_failed", message: err.message });
  }
});

// ── T02: Mutation routes for sub-resources ───────────────────────────

// Helper: resolve a canonical_asset by uuid or canonical_asset_id.
// Returns the asset row or null.
async function resolveAsset(db: any, id: string): Promise<any> {
  const { rows: [asset] } = await db.query(
    "SELECT * FROM semantics.canonical_asset WHERE (id::text = $1 OR canonical_asset_id = $1) AND expired_at IS NULL LIMIT 1",
    [id],
  );
  return asset || null;
}

// POST /api/canonical_asset/:id/revisions — create a revision scoped to an asset
semanticsRouter.post("/canonical_asset/:id/revisions", async (req, res) => {
  try {
    const db = getDb();
    const asset = await resolveAsset(db, req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const body = req.body || {};
    const params: string[] = [];
    const values: any[] = [];
    const push = (name: string, val: any) => { values.push(val); params.push(`${name} => $${values.length}`); };

    push("p_asset_id", asset.id);
    if (body.revisionId !== undefined) push("p_revision_id", body.revisionId);
    if (body.contentHash !== undefined) push("p_content_hash", body.contentHash);
    if (body.sourceHash !== undefined) push("p_source_hash", body.sourceHash);
    if (body.parentRevisionId !== undefined) push("p_parent_revision_id", body.parentRevisionId);
    if (body.recordingStart !== undefined) push("p_recording_start", body.recordingStart);
    if (body.recordingEnd !== undefined) push("p_recording_end", body.recordingEnd);
    if (body.createdBy !== undefined) push("p_created_by", body.createdBy);

    const { rows: [revision] } = await db.query(
      `SELECT * FROM semantics.add_asset_revision(${params.join(", ")})`,
      values,
    );
    res.status(201).json(revision);
  } catch (err: any) {
    const isDup = err?.code === "23505";
    res.status(isDup ? 400 : 500).json({
      error: isDup ? "duplicate_active_key" : "add_revision_failed",
      message: err.message,
    });
  }
});

// POST /api/canonical_asset/:id/identity-claims — create a claim scoped to an asset
semanticsRouter.post("/canonical_asset/:id/identity-claims", async (req, res) => {
  try {
    const db = getDb();
    const asset = await resolveAsset(db, req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const body = req.body || {};
    const params: string[] = [];
    const values: any[] = [];
    const push = (name: string, val: any) => { values.push(val); params.push(`${name} => $${values.length}`); };

    push("p_asset_id", asset.id);
    if (body.candidateAssetId !== undefined) push("p_candidate_asset_id", body.candidateAssetId);
    if (body.claimType !== undefined) push("p_claim_type", body.claimType);
    if (body.confidence !== undefined) push("p_confidence", body.confidence);
    if (body.basis !== undefined) push("p_basis", body.basis);
    if (body.status !== undefined) push("p_status", body.status);
    if (body.decidedBy !== undefined) push("p_decided_by", body.decidedBy);

    const { rows: [claim] } = await db.query(
      `SELECT * FROM semantics.add_asset_identity_claim(${params.join(", ")})`,
      values,
    );
    res.status(201).json(claim);
  } catch (err: any) {
    const isDup = err?.code === "23505";
    res.status(isDup ? 400 : 500).json({
      error: isDup ? "duplicate_active_key" : "add_claim_failed",
      message: err.message,
    });
  }
});

// POST /api/canonical_asset/:id/relations — create a relation with automatic
// direction resolution. The asset in :id becomes `from_asset_id`; the body's
// `relatedAssetId` becomes `to_asset_id`. The relation is directional —
// use relation_type values like supersedes, derives_from, contradicts, etc.
semanticsRouter.post("/canonical_asset/:id/relations", async (req, res) => {
  try {
    const db = getDb();
    const asset = await resolveAsset(db, req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const body = req.body || {};
    if (!body.relatedAssetId) {
      return res.status(400).json({ error: "missing_field", message: "relatedAssetId is required" });
    }
    if (!body.relationType) {
      return res.status(400).json({ error: "missing_field", message: "relationType is required" });
    }

    // Resolve the related asset
    const related = await resolveAsset(db, body.relatedAssetId);
    if (!related) {
      return res.status(404).json({ error: "not_found", message: `related asset ${body.relatedAssetId} not found` });
    }

    if (asset.id === related.id) {
      return res.status(400).json({ error: "self_relation", message: "Cannot relate an asset to itself" });
    }

    const params: string[] = [];
    const values: any[] = [];
    const push = (name: string, val: any) => { values.push(val); params.push(`${name} => $${values.length}`); };

    push("p_from_asset_id", asset.id);
    push("p_to_asset_id", related.id);
    push("p_relation_type", body.relationType);
    if (body.decidedBy !== undefined) push("p_decided_by", body.decidedBy);
    if (body.effectiveAt !== undefined) push("p_effective_at", body.effectiveAt);

    const { rows: [relation] } = await db.query(
      `SELECT * FROM semantics.add_asset_relation(${params.join(", ")})`,
      values,
    );

    res.status(201).json({
      ...relation,
      fromAsset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
      toAsset: { id: related.id, canonicalAssetId: related.canonical_asset_id, assetKind: related.asset_kind },
    });
  } catch (err: any) {
    const isDup = err?.code === "23505";
    res.status(isDup ? 400 : 500).json({
      error: isDup ? "duplicate_active_key" : "add_relation_failed",
      message: err.message,
    });
  }
});

// POST /api/asset_identity_claim/:id/resolve — lifecycle transition
// (open → resolved | rejected). Sets decided_by and decided_at.
semanticsRouter.post("/asset_identity_claim/:id/resolve", async (req, res) => {
  try {
    const db = getDb();
    const body = req.body || {};
    const status = body.status;

    if (!status || !["resolved", "rejected"].includes(status)) {
      return res.status(400).json({
        error: "invalid_status",
        message: "status must be 'resolved' or 'rejected'",
      });
    }

    // Fetch current state
    const { rows: [claim] } = await db.query(
      "SELECT * FROM semantics.asset_identity_claim WHERE id = $1 AND expired_at IS NULL",
      [req.params.id],
    );
    if (!claim) {
      return res.status(404).json({ error: "not_found", message: `claim ${req.params.id} not found` });
    }
    if (claim.status !== "open") {
      return res.status(400).json({
        error: "invalid_transition",
        message: `Claim is already ${claim.status} — only 'open' claims can be resolved`,
      });
    }

    // Update via the append-only update_ proc — must pass all NOT NULL
    // fields from the original claim (asset_id, claim_type, status) so
    // the new row passes constraints.
    const { rows: [updated] } = await db.query(
      `SELECT * FROM semantics.update_asset_identity_claim(
         p_id => $1, p_asset_id => $2, p_candidate_asset_id => $3,
         p_claim_type => $4, p_confidence => $5, p_basis => $6,
         p_status => $7, p_decided_by => $8, p_decided_at => $9
       )`,
      [
        req.params.id,
        claim.asset_id,
        claim.candidate_asset_id,
        claim.claim_type,
        claim.confidence,
        claim.basis,
        status,
        body.decidedBy || claim.decided_by || null,
        new Date().toISOString(),
      ],
    );

    res.json({
      ...updated,
      supersededId: req.params.id,
      previousStatus: "open",
    });
  } catch (err: any) {
    res.status(500).json({ error: "resolve_failed", message: err.message });
  }
});

// POST /api/canonical_asset/:id/external-ids — create a cross-schema link
// V076 migration: writes to asset_relation instead of system_external_ids.
semanticsRouter.post("/canonical_asset/:id/external-ids", async (req, res) => {
  try {
    const db = getDb();
    const asset = await resolveAsset(db, req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const body = req.body || {};
    if (!body.nebulaSystemId) {
      return res.status(400).json({ error: "missing_field", message: "nebulaSystemId is required" });
    }

    // Verify the nebula system exists and has an asset_id
    const { rows: [sys] } = await db.query(
      "SELECT id, name, description, asset_id FROM nebula.systems WHERE id = $1",
      [body.nebulaSystemId],
    );
    if (!sys) {
      return res.status(404).json({ error: "not_found", message: `nebula system ${body.nebulaSystemId} not found` });
    }
    if (!sys.asset_id) {
      return res.status(400).json({ error: "no_asset", message: `nebula system ${body.nebulaSystemId} has no asset_id — run V075 first` });
    }

    // Check for existing relation (idempotent guard)
    const { rows: [existing] } = await db.query(
      `SELECT id FROM semantics.asset_relation
       WHERE from_asset_id = $1 AND to_asset_id = $2
         AND relation_type = $3 AND expired_at IS NULL`,
      [sys.asset_id, asset.id, body.relationType || "owns"],
    );
    if (existing) {
      return res.status(409).json({
        error: "duplicate_active_key",
        message: "An active relation already exists between these assets",
        existingId: existing.id,
      });
    }

    const { rows: [relation] } = await db.query(
      `SELECT * FROM semantics.add_asset_relation(
         p_from_asset_id => $1, p_to_asset_id => $2,
         p_relation_type => $3, p_decided_by => $4
       )`,
      [sys.asset_id, asset.id, body.relationType || "owns", body.decidedBy || null],
    );

    res.status(201).json({
      ...relation,
      nebulaSystem: { id: sys.id, name: sys.name, description: sys.description },
      canonicalAsset: { id: asset.id, canonicalAssetId: asset.canonical_asset_id, assetKind: asset.asset_kind },
    });
  } catch (err: any) {
    const isDup = err?.code === "23505";
    res.status(isDup ? 409 : 500).json({
      error: isDup ? "duplicate_active_key" : "link_failed",
      message: err.message,
    });
  }
});

// DELETE /api/canonical_asset/:id/external-ids/:eid — soft-expire a cross-schema link
semanticsRouter.delete("/canonical_asset/:id/external-ids/:eid", async (req, res) => {
  try {
    const db = getDb();

    // Verify the asset exists
    const asset = await resolveAsset(db, req.params.id);
    if (!asset) {
      return res.status(404).json({ error: "not_found", message: `canonical_asset ${req.params.id} not found` });
    }

    const { rows: [result] } = await db.query(
      `UPDATE semantics.asset_relation
       SET expired_at = now()
       WHERE id = $1
         AND to_asset_id = $2
         AND expired_at IS NULL
       RETURNING id`,
      [req.params.eid, asset.id],
    );

    if (!result) {
      return res.status(404).json({
        error: "not_found",
        message: `Relation ${req.params.eid} not found or already expired for this asset`,
      });
    }

    res.json({ id: req.params.eid, deleted: true });
  } catch (err: any) {
    res.status(500).json({ error: "unlink_failed", message: err.message });
  }
});

// ── Drift lifecycle ──────────────────────────────────────────────────

// POST /api/drift_finding/:id/resolve — detected → resolved
semanticsRouter.post("/drift_finding/:id/resolve", async (req, res) => {
  try {
    const resolvedAt = (req.body || {}).p_resolved_at ?? null;
    const { rows } = await getDb().query(
      "SELECT semantics.resolve_drift_finding($1, $2) AS resolved",
      [req.params.id, resolvedAt],
    );
    res.json({ id: req.params.id, resolved: rows[0].resolved });
  } catch (err: any) {
    res.status(500).json({ error: "resolve_failed", message: err.message });
  }
});
