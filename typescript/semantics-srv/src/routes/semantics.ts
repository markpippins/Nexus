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
