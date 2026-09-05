import { Request, Response, Router } from 'express';
import { query, withTransaction } from './db';

const router = Router();

// ── Helpers ──────────────────────────────────────────────────────
const isUuid = (v: string) =>
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);

const error = (res: Response, status: number, message: string) => {
  res.status(status).json({ error: message, message });
};

/** Assert the registry exists (or 404). Returns its id. */
async function requireRegistry(id: string | string[], res: Response): Promise<string | null> {
  const idStr = String(id);
  if (!isUuid(idStr)) { error(res, 400, 'invalid registry id'); return null; }
  const { rows } = await query('SELECT id FROM aegis.registry WHERE id = $1', [idStr]);
  if (rows.length === 0) { error(res, 404, 'registry not found'); return null; }
  return rows[0].id as string;
}

/** Assert a child row exists under a registry (or 404). */
async function requireChild(
  table: string, registryId: string, childId: string | string[], res: Response,
): Promise<boolean> {
  const childIdStr = String(childId);
  if (!isUuid(childIdStr)) { error(res, 400, 'invalid child id'); return false; }
  const { rows } = await query(
    `SELECT id FROM aegis.${table} WHERE id = $1 AND registry_id = $2`, [childIdStr, registryId],
  );
  if (rows.length === 0) { error(res, 404, `${table} not found`); return false; }
  return true;
}

/** Pick only the allowed columns out of a request body. */
function pick(body: any, allowed: string[]): Record<string, any> {
  const out: Record<string, any> = {};
  for (const k of allowed) {
    if (body[k] !== undefined) out[k] = body[k];
  }
  return out;
}

/** Columns stored as JSONB — JS objects/arrays/scalars must be JSON.stringify'd for pg. */
const JSONB_COLS = new Set([
  'metadata', 'value', 'initial_value', 'domain', 'variable_assignments',
  'action', 'default_value', 'trace', 'errors', 'warnings', 'suggestions', 'context',
]);

/** Coerce jsonb values to valid JSON text (pg accepts objects, but arrays/bare scalars need stringify). */
function jsonbCoerce(body: Record<string, any>, cols: string[]): any[] {
  return cols.map((c) => {
    const v = body[c];
    if (JSONB_COLS.has(c) && v !== null && v !== undefined) {
      return JSON.stringify(v);
    }
    return v;
  });
}

/** Handle DB unique-violation / check violations into 409/400. */
function pgError(res: Response, err: any) {
  const code = err?.code;
  if (code === '23505') return error(res, 409, `duplicate key: ${err?.detail || err?.constraint || 'conflict'}`);
  if (code === '23503') return error(res, 400, `foreign key violation: ${err?.detail || 'referenced row missing'}`);
  if (code === '23514') return error(res, 400, `check constraint violation: ${err?.detail || err?.constraint || ''}`);
  if (code === '22P02') return error(res, 400, `invalid value: ${err?.message || ''}`);
  console.error('[aegis-srv] DB error:', err?.message);
  return error(res, 500, 'internal server error');
}

// ══════════════════════════════════════════════════════════════════
// Registry-scoped child handlers (shared CRUD logic per table).
// Each route is declared with a literal path so the TypeSpec↔source
// reconciler can statically prove coverage (contract-first convention).
// ══════════════════════════════════════════════════════════════════
interface ChildHandlers {
  list: (req: Request, res: Response) => Promise<void>;
  create: (req: Request, res: Response) => Promise<void>;
  get: (req: Request, res: Response) => Promise<void>;
  update: (req: Request, res: Response) => Promise<void>;
  remove: (req: Request, res: Response) => Promise<void>;
}

function childHandlers(table: string, createCols: string[], updateCols: string[]): ChildHandlers {
  return {
    async list(req, res) {
      try {
        const registryId = await requireRegistry(req.params.id, res);
        if (!registryId) return;
        const { rows } = await query(
          `SELECT * FROM aegis.${table} WHERE registry_id = $1 ORDER BY created_at`, [registryId],
        );
        res.json({ items: rows });
      } catch (e) { pgError(res, e); }
    },
    async create(req, res) {
      try {
        const registryId = await requireRegistry(req.params.id, res);
        if (!registryId) return;
        const body = pick(req.body, createCols);
        const cols = Object.keys(body);
        if (cols.length === 0) { error(res, 400, 'no fields provided'); return; }
        const values = cols.map((_, i) => `$${i + 2}`);
        const { rows } = await query(
          `INSERT INTO aegis.${table} (registry_id, ${cols.join(', ')})
           VALUES ($1, ${values.join(', ')})
           RETURNING *`,
          [registryId, ...jsonbCoerce(body, cols)],
        );
        res.status(201).json(rows[0]);
      } catch (e) { pgError(res, e); }
    },
    async get(req, res) {
      try {
        const registryId = await requireRegistry(req.params.id, res);
        if (!registryId) return;
        if (!(await requireChild(table, registryId, req.params.cid, res))) return;
        const { rows } = await query(
          `SELECT * FROM aegis.${table} WHERE id = $1 AND registry_id = $2`,
          [String(req.params.cid), registryId],
        );
        res.json(rows[0]);
      } catch (e) { pgError(res, e); }
    },
    async update(req, res) {
      try {
        const registryId = await requireRegistry(req.params.id, res);
        if (!registryId) return;
        if (!(await requireChild(table, registryId, req.params.cid, res))) return;
        const body = pick(req.body, updateCols);
        const cols = Object.keys(body);
        if (cols.length === 0) { error(res, 400, 'no fields provided'); return; }
        const set = cols.map((c, i) => `${c} = $${i + 3}`);
        const { rows } = await query(
          `UPDATE aegis.${table}
           SET ${set.join(', ')}
           WHERE id = $1 AND registry_id = $2
           RETURNING *`,
          [String(req.params.cid), registryId, ...jsonbCoerce(body, cols)],
        );
        res.json(rows[0]);
      } catch (e) { pgError(res, e); }
    },
    async remove(req, res) {
      try {
        const registryId = await requireRegistry(req.params.id, res);
        if (!registryId) return;
        if (!(await requireChild(table, registryId, req.params.cid, res))) return;
        await query(
          `DELETE FROM aegis.${table} WHERE id = $1 AND registry_id = $2`,
          [String(req.params.cid), registryId],
        );
        res.json({ deleted: String(req.params.cid) });
      } catch (e) { pgError(res, e); }
    },
  };
}

// ══════════════════════════════════════════════════════════════════
// Health is served by index.ts at /health (not under /api).
// ══════════════════════════════════════════════════════════════════

// ══════════════════════════════════════════════════════════════════
// Registries (root CRUD)
// ══════════════════════════════════════════════════════════════════
const REGISTRY_COLS = [
  'name', 'description', 'version', 'tla_plus_source', 'tla_plus_module',
  'metadata', 'tags', 'is_active', 'expires_at', 'main_concept_id',
];

router.get('/registries', async (_req, res) => {
  try {
    const { rows } = await query('SELECT * FROM aegis.registry ORDER BY created_at');
    res.json({ items: rows });
  } catch (e) { pgError(res, e); }
});

router.get('/registries/name/:name', async (req, res) => {
  try {
    const { rows } = await query('SELECT * FROM aegis.registry WHERE name = $1 AND is_active = true', [req.params.name]);
    if (rows.length === 0) { error(res, 404, 'registry not found'); return; }
    res.json(rows[0]);
  } catch (e) { pgError(res, e); }
});

router.post('/registries', async (req, res) => {
  try {
    const body = pick(req.body, REGISTRY_COLS);
    const cols = Object.keys(body);
    if (cols.length === 0) { error(res, 400, 'no fields provided'); return; }
    const values = cols.map((_, i) => `$${i + 1}`);
    const { rows } = await query(
      `INSERT INTO aegis.registry (${cols.join(', ')})
       VALUES (${values.join(', ')})
       RETURNING *`,
      jsonbCoerce(body, cols),
    );
    res.status(201).json(rows[0]);
  } catch (e) { pgError(res, e); }
});

router.get('/registries/:id', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    const { rows } = await query('SELECT * FROM aegis.registry WHERE id = $1', [registryId]);
    res.json(rows[0]);
  } catch (e) { pgError(res, e); }
});

router.patch('/registries/:id', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    const body = pick(req.body, REGISTRY_COLS);
    const cols = Object.keys(body);
    if (cols.length === 0) { error(res, 400, 'no fields provided'); return; }
    const set = cols.map((c, i) => `${c} = $${i + 2}`);
    const { rows } = await query(
      `UPDATE aegis.registry SET ${set.join(', ')} WHERE id = $1 RETURNING *`,
      [registryId, ...jsonbCoerce(body, cols)],
    );
    res.json(rows[0]);
  } catch (e) { pgError(res, e); }
});

// Soft delete: is_active = false (schema partial unique index on active name)
router.delete('/registries/:id', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    await query('UPDATE aegis.registry SET is_active = false WHERE id = $1', [registryId]);
    res.json({ deleted: String(req.params.id) });
  } catch (e) { pgError(res, e); }
});

// ══════════════════════════════════════════════════════════════════
// Action endpoints
// ══════════════════════════════════════════════════════════════════
router.post('/registries/:id/validate', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    const result = await withTransaction(async (client) => {
      const { rows: reg } = await client.query('SELECT * FROM aegis.registry WHERE id = $1', [registryId]);
      const registry = reg[0];
      const errors: any[] = [];
      const warnings: any[] = [];
      const suggestions: any[] = [];
      if (!registry.name) errors.push({ code: 'missing_name', message: 'registry has no name' });
      if (!registry.version) warnings.push({ code: 'missing_version', message: 'registry has no version, defaulting to 1.0.0' });
      const validated_by = req.body?.validated_by || null;
      const { rows } = await client.query(
        `INSERT INTO aegis.validation_result (registry_id, is_valid, errors, warnings, suggestions, validated_by)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [registryId, errors.length === 0, JSON.stringify(errors), JSON.stringify(warnings), JSON.stringify(suggestions), validated_by],
      );
      return rows[0];
    });
    res.status(201).json(result);
  } catch (e) { pgError(res, e); }
});

// Model-check: bookkeeping stub for a TLA+ checker run (TLC integration is a follow-up).
router.post('/registries/:id/model-check', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    const body = pick(req.body, ['property_id', 'status', 'trace', 'checked_properties', 'execution_time_ms', 'checked_by']);
    const status = body.status || 'unknown';
    const { rows } = await query(
      `INSERT INTO aegis.model_check_result
         (registry_id, property_id, status, trace, checked_properties, execution_time_ms, checked_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *`,
      [registryId, body.property_id || null, status, body.trace ? JSON.stringify(body.trace) : null, body.checked_properties || [], body.execution_time_ms || null, body.checked_by || null],
    );
    res.status(201).json(rows[0]);
  } catch (e) { pgError(res, e); }
});

router.get('/registries/:id/validation-results', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    const { rows } = await query(
      'SELECT * FROM aegis.validation_result WHERE registry_id = $1 ORDER BY validated_at DESC', [registryId],
    );
    res.json({ items: rows });
  } catch (e) { pgError(res, e); }
});

router.get('/registries/:id/model-check-results', async (req, res) => {
  try {
    const registryId = await requireRegistry(req.params.id, res);
    if (!registryId) return;
    const { rows } = await query(
      'SELECT * FROM aegis.model_check_result WHERE registry_id = $1 ORDER BY checked_at DESC', [registryId],
    );
    res.json({ items: rows });
  } catch (e) { pgError(res, e); }
});

// ══════════════════════════════════════════════════════════════════
// Child resources (constants, variables, states, transitions, invariants,
// properties, temporal-properties, mappings, execution-log)
// ══════════════════════════════════════════════════════════════════
const C = {
  constants: childHandlers('constant', ['name', 'type', 'value', 'description', 'constraints'], ['name', 'type', 'value', 'description', 'constraints']),
  variables: childHandlers('variable', ['name', 'type', 'initial_value', 'domain', 'description', 'constraints', 'attribute_id'], ['name', 'type', 'initial_value', 'domain', 'description', 'constraints', 'attribute_id']),
  states: childHandlers('state', ['name', 'description', 'variable_assignments', 'constraints', 'is_initial', 'is_terminal', 'concept_id', 'attribute_value_id'], ['name', 'description', 'variable_assignments', 'constraints', 'is_initial', 'is_terminal', 'concept_id', 'attribute_value_id']),
  transitions: childHandlers('transition', ['name', 'description', 'guard_expression', 'action', 'weak_fairness', 'strong_fairness', 'temporal_conditions', 'priority', 'from_state_id', 'to_state_id', 'guard_rule_id', 'transition_rule_id', 'state_transition_id'], ['name', 'description', 'guard_expression', 'action', 'weak_fairness', 'strong_fairness', 'temporal_conditions', 'priority', 'from_state_id', 'to_state_id', 'guard_rule_id', 'transition_rule_id', 'state_transition_id']),
  invariants: childHandlers('invariant', ['name', 'expression', 'description', 'is_type_invariant', 'rule_id', 'expression_id'], ['name', 'expression', 'description', 'is_type_invariant', 'rule_id', 'expression_id']),
  properties: childHandlers('property', ['name', 'type', 'expression', 'description', 'is_verified', 'verified_at', 'verified_by'], ['name', 'type', 'expression', 'description', 'is_verified', 'verified_at', 'verified_by']),
  temporalProps: childHandlers('temporal_property', ['name', 'operator', 'expression', 'description'], ['name', 'operator', 'expression', 'description']),
  conceptMappings: childHandlers('concept_mapping', ['tla_name', 'concept_id', 'mapping_type', 'mapping_expression', 'cardinality'], ['tla_name', 'concept_id', 'mapping_type', 'mapping_expression', 'cardinality']),
  attributeMappings: childHandlers('attribute_mapping', ['tla_variable', 'attribute_id', 'conversion_function', 'default_value'], ['tla_variable', 'attribute_id', 'conversion_function', 'default_value']),
  relationshipMappings: childHandlers('relationship_mapping', ['tla_relationship', 'relationship_id', 'mapping_type', 'constraints'], ['tla_relationship', 'relationship_id', 'mapping_type', 'constraints']),
  executionLog: childHandlers('execution_log', ['entity_id', 'from_state_id', 'to_state_id', 'transition_id', 'trigger_event', 'trigger_user', 'context'], ['entity_id', 'from_state_id', 'to_state_id', 'transition_id', 'trigger_event', 'trigger_user', 'context']),
};

// constants
router.get('/registries/:id/constants', C.constants.list);
router.post('/registries/:id/constants', C.constants.create);
router.get('/registries/:id/constants/:cid', C.constants.get);
router.patch('/registries/:id/constants/:cid', C.constants.update);
router.delete('/registries/:id/constants/:cid', C.constants.remove);

// variables
router.get('/registries/:id/variables', C.variables.list);
router.post('/registries/:id/variables', C.variables.create);
router.get('/registries/:id/variables/:cid', C.variables.get);
router.patch('/registries/:id/variables/:cid', C.variables.update);
router.delete('/registries/:id/variables/:cid', C.variables.remove);

// states
router.get('/registries/:id/states', C.states.list);
router.post('/registries/:id/states', C.states.create);
router.get('/registries/:id/states/:cid', C.states.get);
router.patch('/registries/:id/states/:cid', C.states.update);
router.delete('/registries/:id/states/:cid', C.states.remove);

// transitions
router.get('/registries/:id/transitions', C.transitions.list);
router.post('/registries/:id/transitions', C.transitions.create);
router.get('/registries/:id/transitions/:cid', C.transitions.get);
router.patch('/registries/:id/transitions/:cid', C.transitions.update);
router.delete('/registries/:id/transitions/:cid', C.transitions.remove);

// invariants
router.get('/registries/:id/invariants', C.invariants.list);
router.post('/registries/:id/invariants', C.invariants.create);
router.get('/registries/:id/invariants/:cid', C.invariants.get);
router.patch('/registries/:id/invariants/:cid', C.invariants.update);
router.delete('/registries/:id/invariants/:cid', C.invariants.remove);

// properties
router.get('/registries/:id/properties', C.properties.list);
router.post('/registries/:id/properties', C.properties.create);
router.get('/registries/:id/properties/:cid', C.properties.get);
router.patch('/registries/:id/properties/:cid', C.properties.update);
router.delete('/registries/:id/properties/:cid', C.properties.remove);

// temporal-properties
router.get('/registries/:id/temporal-properties', C.temporalProps.list);
router.post('/registries/:id/temporal-properties', C.temporalProps.create);
router.get('/registries/:id/temporal-properties/:cid', C.temporalProps.get);
router.patch('/registries/:id/temporal-properties/:cid', C.temporalProps.update);
router.delete('/registries/:id/temporal-properties/:cid', C.temporalProps.remove);

// concept-mappings
router.get('/registries/:id/concept-mappings', C.conceptMappings.list);
router.post('/registries/:id/concept-mappings', C.conceptMappings.create);
router.get('/registries/:id/concept-mappings/:cid', C.conceptMappings.get);
router.patch('/registries/:id/concept-mappings/:cid', C.conceptMappings.update);
router.delete('/registries/:id/concept-mappings/:cid', C.conceptMappings.remove);

// attribute-mappings
router.get('/registries/:id/attribute-mappings', C.attributeMappings.list);
router.post('/registries/:id/attribute-mappings', C.attributeMappings.create);
router.get('/registries/:id/attribute-mappings/:cid', C.attributeMappings.get);
router.patch('/registries/:id/attribute-mappings/:cid', C.attributeMappings.update);
router.delete('/registries/:id/attribute-mappings/:cid', C.attributeMappings.remove);

// relationship-mappings
router.get('/registries/:id/relationship-mappings', C.relationshipMappings.list);
router.post('/registries/:id/relationship-mappings', C.relationshipMappings.create);
router.get('/registries/:id/relationship-mappings/:cid', C.relationshipMappings.get);
router.patch('/registries/:id/relationship-mappings/:cid', C.relationshipMappings.update);
router.delete('/registries/:id/relationship-mappings/:cid', C.relationshipMappings.remove);

// execution-log
router.get('/registries/:id/execution-log', C.executionLog.list);
router.post('/registries/:id/execution-log', C.executionLog.create);
router.get('/registries/:id/execution-log/:cid', C.executionLog.get);
router.patch('/registries/:id/execution-log/:cid', C.executionLog.update);
router.delete('/registries/:id/execution-log/:cid', C.executionLog.remove);

export const routes = router;