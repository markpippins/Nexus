import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';
import { execFile } from 'child_process';
import { promisify } from 'util';
import * as bs from './block-segmentation.service';
import * as bsRedis from './services/block-segmentation-redis.service';

const execFileAsync = promisify(execFile);

// ── Color Palette (matches client) ────────────────────────────────
const COLOR_PALETTE = [
  '#EF4444', '#F97316', '#F59E0B', '#10B981', '#06B6D4',
  '#3B82F6', '#6366F1', '#8B5CF6', '#EC4899', '#F43F5E',
  '#84CC16', '#14B8A6',
];

// ── Helpers ───────────────────────────────────────────────────────
function titleCase(s: string): string {
  return s.split(/\s+/).map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('');
}

/**
 * Bitemporal upsert of a harvest_context info tab on a system.
 * Synthesizes the candidate's title, intent_description, and harvest source
 * into a markdown block and writes it to nebula.system_info_tabs_history.
 *
 * Must be called inside an active transaction (uses the provided client).
 */
/** Returns true when planRef is a non-empty string (after trim). */
function hasPlanRef(planRef: any): boolean {
  return planRef !== undefined && planRef !== null && String(planRef).trim() !== '';
}

/**
 * Create a cross-reference from a harvest_candidate to a conduit plan
 * with rel_type='spawns_plan'. Uses WHERE NOT EXISTS for idempotency
 * (cross_references has no unique constraint on the composite key).
 *
 * Must be called inside an active transaction (uses the provided client).
 * Returns the created row, or null if planRef is empty or the link already exists.
 */
async function createSpawnsPlanCrossRef(
  client: import('pg').PoolClient,
  candidateId: string,
  planRef: string | null | undefined,
  extraMetadata?: Record<string, any>,
): Promise<any | null> {
  if (!hasPlanRef(planRef)) return null;
  const planRefStr = String(planRef).trim();
  const { rows: [xref] } = await client.query(
    `INSERT INTO nebula.cross_references (source_type, source_id, target_type, target_id, rel_type, metadata)
     SELECT 'harvest_candidate', $1, 'plan', $2, 'spawns_plan', $3
     WHERE NOT EXISTS (
       SELECT 1 FROM nebula.cross_references
       WHERE source_type = 'harvest_candidate'
         AND source_id = $1
         AND target_type = 'plan'
         AND target_id = $2
         AND rel_type = 'spawns_plan'
     )
     RETURNING *`,
    [candidateId, planRefStr, JSON.stringify(extraMetadata || {})]
  );
  return xref || null;
}

async function upsertHarvestContextTab(
  client: import('pg').PoolClient,
  systemId: string,
  candidate: { harvest_id: string; title: string; status: string | null; id: string; intent_description: string },
) {
  const { rows: [harvest] } = await client.query(
    'SELECT source_filename FROM nebula.harvests WHERE id = $1',
    [candidate.harvest_id]
  );

  const tabContent = [
    `## Harvest: ${candidate.title}`,
    '',
    `**Source:** ${harvest?.source_filename || candidate.harvest_id}`,
    `**Status:** ${candidate.status || 'unlinked'}`,
    `**Candidate ID:** ${candidate.id}`,
    '',
    '### Intent',
    '',
    candidate.intent_description,
  ].join('\n');

  await client.query(
    `UPDATE nebula.system_info_tabs_history
     SET recorded_until_dt = NOW()
     WHERE system_id = $1 AND tab_id = 'harvest_context'
       AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
    [systemId]
  );
  await client.query(
    `INSERT INTO nebula.system_info_tabs_history
     (system_id, tab_id, content, recorded_on_dt, recorded_until_dt)
     VALUES ($1, 'harvest_context', $2, NOW(), '9999-12-31 23:59:59+00')`,
    [systemId, tabContent]
  );
}

// ── Status Normalization (Plan 0132) ─────────────────────────
// Canonical eight accepted by the requirements table and the nebula-mcp
// zod enum (see typescript/nebula-mcp/src/tools/index.ts).
const STATUS_CANONICAL = new Set([
  'Backlog', 'ToDo', 'InProgress', 'Active',
  'Blocked', 'Done', 'Cancelled', 'Accepted',
]);
// Lookups keyed on trim+lowercased input. Includes the canonical values
// themselves plus common case / separator / phrasing variants. Returns
// null on empty or unrecognized input — callers turn that into a 400.
const STATUS_NORMALIZATION: Record<string, string> = {
  // Canonical (pass-through)
  backlog:   'Backlog',
  todo:      'ToDo',
  inprogress:'InProgress',
  active:    'Active',
  blocked:   'Blocked',
  done:      'Done',
  cancelled: 'Cancelled',
  accepted:  'Accepted',
  // Common variants
  'to-do':       'ToDo',
  'to do':       'ToDo',
  'in progress': 'InProgress',
  'in-progress': 'InProgress',
  in_progress:   'InProgress',
  cancel:        'Cancelled',
  canceled:      'Cancelled',
  accept:        'Accepted',
  complete:      'Done',
  completed:     'Done',
  resolved:      'Done',
  wip:           'InProgress',
  new:           'Backlog',
};
function normalizeStatus(input: string | null | undefined): string | null {
  if (input === undefined || input === null) return null;
  const key = String(input).trim().toLowerCase();
  if (!key) return null;
  return STATUS_NORMALIZATION[key] ?? null;
}

// ── Plans Display (Plan 0134) ─────────────────────────────────
const PLANS_ROOT = path.resolve('/home/codex/dev/nexus/audit/IMPLEMENTATION_PLANS');
const PLAN_STATUS_DIRS = ['pending', 'planning', 'proposed', 'completed'] as const;
type PlanStatus = typeof PLAN_STATUS_DIRS[number];

function parsePlanTitle(md: string): string {
  const m = md.match(/^\s*#\s+(.+?)\s*$/m);
  return m ? m[1] : '';
}

function readPlanEntries(): { id: string; status: PlanStatus; absPath: string; sizeBytes: number; modifiedAt: string }[] {
  const out: ReturnType<typeof readPlanEntries> = [];
  for (const status of PLAN_STATUS_DIRS) {
    const dir = path.join(PLANS_ROOT, status);
    if (!fs.existsSync(dir)) continue;
    for (const name of fs.readdirSync(dir)) {
      if (!name.endsWith('.md')) continue;
      const abs = path.join(dir, name);
      if (!fs.statSync(abs).isFile()) continue;
      const st = fs.statSync(abs);
      out.push({
        id: name.replace(/\.md$/, ''),
        status,
        absPath: abs,
        sizeBytes: st.size,
        modifiedAt: st.mtime.toISOString(),
      });
    }
  }
  return out;
}

function toEpochMs(row: any, ...cols: string[]): any {
  const out = { ...row };
  for (const col of cols) {
    if (out[col] && typeof out[col] === 'object' && out[col].getTime) {
      out[col] = out[col].getTime();
    }
  }
  return out;
}

async function getUnusedColor(systemId: string, pool: Pool): Promise<string> {
  const { rows } = await pool.query(
    'SELECT color FROM subsystems WHERE system_id = $1',
    [systemId]
  );
  const used = new Set(rows.map(r => r.color));
  for (const c of COLOR_PALETTE) {
    if (!used.has(c)) return c;

  }
  return COLOR_PALETTE[0]; // all used — pick first
}

export function createRoutes(pool: Pool): Router {
  const router = Router();

  // ════════════════════════════════════════════════════════════════
  //  SYSTEMS
  // ════════════════════════════════════════════════════════════════

  // GET /api/systems — full nested hierarchy
  router.get('/systems', async (_req: Request, res: Response) => {
    try {
      const { rows: systems } = await pool.query('SELECT * FROM systems ORDER BY name');
      const result = [];
      for (const sys of systems) {
        // Folders
        const { rows: folders } = await pool.query(
          'SELECT * FROM system_folders WHERE system_id = $1 ORDER BY name',
          [sys.id]
        );
        // Subsystems → Features
        const { rows: subs } = await pool.query(
          'SELECT * FROM subsystems WHERE system_id = $1 ORDER BY name',
          [sys.id]
        );
        const subsystems = [];
        for (const sub of subs) {
          const { rows: feats } = await pool.query(
            'SELECT * FROM features WHERE subsystem_id = $1 ORDER BY name',
            [sub.id]
          );
          subsystems.push({
            ...toEpochMs(sub, 'created_at'),
            systemId: sub.system_id,
            features: feats.map((f: any) => ({ ...toEpochMs(f, 'created_at'), subsystemId: f.subsystem_id })),
          });
        }
        result.push({
          ...toEpochMs(sys, 'created_at'),
          folders: folders.map((f: any) => ({ ...f, id: f.id, name: f.name, category: f.category, note: f.note })),
          subsystems,
        });
      }
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/systems
  router.post('/systems', async (req: Request, res: Response) => {
    try {
      const { name, description = '', readme = null, architecture = null } = req.body;
      if (!name) return res.status(400).json({ error: 'name is required' });
      const { rows: [sys] } = await pool.query(
        'INSERT INTO systems (name, description, readme, architecture) VALUES ($1, $2, $3, $4) RETURNING *',
        [name, description, readme, architecture]
      );
      res.status(201).json({ ...toEpochMs(sys, 'created_at'), folders: [], subsystems: [] });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/systems/:id — name, description, readme, architecture
  router.patch('/systems/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, readme, architecture } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
      if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description); }
      if (readme !== undefined) { sets.push(`readme = $${i++}`); vals.push(readme); }
      if (architecture !== undefined) { sets.push(`architecture = $${i++}`); vals.push(architecture); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [sys] } = await pool.query(
        `UPDATE systems SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!sys) return res.status(404).json({ error: 'System not found' });
      res.json({ ...toEpochMs(sys, 'created_at'), name: sys.name, description: sys.description, readme: sys.readme, architecture: sys.architecture });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/systems/:id — cascade deletes subsystems, features, folders, requirements
  router.delete('/systems/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Also delete associated work_sessions (parentId matches)
      await pool.query('DELETE FROM work_sessions WHERE parent_id = $1', [id]);
      const { rowCount } = await pool.query('DELETE FROM systems WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'System not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  SUBSYSTEMS
  // ════════════════════════════════════════════════════════════════

  // POST /api/subsystems
  router.post('/subsystems', async (req: Request, res: Response) => {
    try {
      const { systemId, name, description = '', readme = null } = req.body;
      if (!systemId || !name) return res.status(400).json({ error: 'systemId and name are required' });
      // Server-side color deduplication (Plan 0093)
      const color = await getUnusedColor(systemId, pool);
      const { rows: [sub] } = await pool.query(
        'INSERT INTO subsystems (system_id, name, description, readme, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [systemId, name, description, readme, color]
      );
      res.status(201).json({
        ...toEpochMs(sub, 'created_at'),
        systemId: sub.system_id,
        features: [],
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/subsystems/:id
  router.patch('/subsystems/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, readme, color } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
      if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description); }
      if (readme !== undefined) { sets.push(`readme = $${i++}`); vals.push(readme); }
      if (color !== undefined) { sets.push(`color = $${i++}`); vals.push(color); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [sub] } = await pool.query(
        `UPDATE subsystems SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!sub) return res.status(404).json({ error: 'Subsystem not found' });
      res.json({ ...toEpochMs(sub, 'created_at'), systemId: sub.system_id, name: sub.name, description: sub.description, readme: sub.readme, color: sub.color });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/subsystems/:id — cascade deletes features and requirements
  router.delete('/subsystems/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM requirements WHERE subsystem_id = $1', [id]);
      const { rowCount } = await pool.query('DELETE FROM subsystems WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Subsystem not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  FEATURES
  // ════════════════════════════════════════════════════════════════

  // POST /api/features
  router.post('/features', async (req: Request, res: Response) => {
    try {
      const { subsystemId, name, description = '', readme = null } = req.body;
      if (!subsystemId || !name) return res.status(400).json({ error: 'subsystemId and name are required' });
      const { rows: [feat] } = await pool.query(
        'INSERT INTO features (subsystem_id, name, description, readme) VALUES ($1, $2, $3, $4) RETURNING *',
        [subsystemId, name, description, readme]
      );
      res.status(201).json({ ...toEpochMs(feat, 'created_at'), subsystemId: feat.subsystem_id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/features/:id
  router.patch('/features/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, description, readme } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (name !== undefined) { sets.push(`name = $${i++}`); vals.push(name); }
      if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description); }
      if (readme !== undefined) { sets.push(`readme = $${i++}`); vals.push(readme); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [feat] } = await pool.query(
        `UPDATE features SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!feat) return res.status(404).json({ error: 'Feature not found' });
      res.json({ ...toEpochMs(feat, 'created_at'), subsystemId: feat.subsystem_id, name: feat.name, description: feat.description, readme: feat.readme });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/features/:id — cascade deletes requirements with feature_id
  router.delete('/features/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      await pool.query('DELETE FROM requirements WHERE feature_id = $1', [id]);
      const { rowCount } = await pool.query('DELETE FROM features WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Feature not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  REQUIREMENTS
  // ════════════════════════════════════════════════════════════════

  // GET /api/requirements — filterable
  router.get('/requirements', async (req: Request, res: Response) => {
    try {
      const { systemId, subsystemId, featureId } = req.query;
      const clauses: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (systemId) { clauses.push(`system_id = $${i++}`); vals.push(systemId); }
      if (subsystemId) { clauses.push(`subsystem_id = $${i++}`); vals.push(subsystemId); }
      if (featureId) { clauses.push(`feature_id = $${i++}`); vals.push(featureId); }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM requirements ${where} ORDER BY created_at DESC`,
        vals
      );
      res.json(rows.map((r: any) => ({
        ...toEpochMs(r, 'created_at'),
        systemId: r.system_id,
        subsystemId: r.subsystem_id,
        featureId: r.feature_id,
        startDate: r.start_date,
        completionDate: r.completion_date,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/requirements
  router.post('/requirements', async (req: Request, res: Response) => {
    try {
      const { systemId, subsystemId, featureId = null, title, description = '', status = 'Backlog', priority = 'Medium', startDate = null, completionDate = null } = req.body;
      if (!systemId || !subsystemId || !title) return res.status(400).json({ error: 'systemId, subsystemId, and title are required' });
      const normalizedStatus = normalizeStatus(status);
      if (!normalizedStatus) return res.status(400).json({ error: `status, if provided, must be one of: ${Array.from(STATUS_CANONICAL).join(', ')}` });
      const { rows: [reqt] } = await pool.query(
        `INSERT INTO requirements (system_id, subsystem_id, feature_id, title, description, status, priority, start_date, completion_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [systemId, subsystemId, featureId, title, description, normalizedStatus, priority, startDate, completionDate]
      );
      res.status(201).json({
        ...toEpochMs(reqt, 'created_at'),
        systemId: reqt.system_id,
        subsystemId: reqt.subsystem_id,
        featureId: reqt.feature_id,
        startDate: reqt.start_date,
        completionDate: reqt.completion_date,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/requirements/batch — batch status update (BEFORE /:id!)
  router.patch('/requirements/batch', async (req: Request, res: Response) => {
    try {
      const { ids, status } = req.body;
      if (!ids || !Array.isArray(ids) || !status) return res.status(400).json({ error: 'ids (array) and status are required' });
      const normalizedStatus = normalizeStatus(status);
      if (!normalizedStatus) return res.status(400).json({ error: `status must be one of: ${Array.from(STATUS_CANONICAL).join(', ')}` });
      const { rowCount } = await pool.query(
        'UPDATE requirements SET status = $1 WHERE id = ANY($2::uuid[])',
        [normalizedStatus, ids]
      );
      res.json({ ok: true, updated: rowCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/requirements/:id
  router.patch('/requirements/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, description, status, priority, startDate, completionDate, systemId, subsystemId, featureId } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
      if (description !== undefined) { sets.push(`description = $${i++}`); vals.push(description); }
      if (status !== undefined) {
      const normalizedStatus = normalizeStatus(status);
      if (!normalizedStatus) return res.status(400).json({ error: `status, if provided, must be one of: ${Array.from(STATUS_CANONICAL).join(', ')}` });
      sets.push(`status = $${i++}`); vals.push(normalizedStatus);
    }
      if (priority !== undefined) { sets.push(`priority = $${i++}`); vals.push(priority); }
      if (startDate !== undefined) { sets.push(`start_date = $${i++}`); vals.push(startDate); }
      if (completionDate !== undefined) { sets.push(`completion_date = $${i++}`); vals.push(completionDate); }
      if (systemId !== undefined) { sets.push(`system_id = $${i++}`); vals.push(systemId); }
      if (subsystemId !== undefined) { sets.push(`subsystem_id = $${i++}`); vals.push(subsystemId); }
      if (featureId !== undefined) { sets.push(`feature_id = $${i++}`); vals.push(featureId); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [reqt] } = await pool.query(
        `UPDATE requirements SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!reqt) return res.status(404).json({ error: 'Requirement not found' });
      res.json({
        ...toEpochMs(reqt, 'created_at'),
        systemId: reqt.system_id, subsystemId: reqt.subsystem_id, featureId: reqt.feature_id,
        startDate: reqt.start_date, completionDate: reqt.completion_date,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/requirements/:id
  router.delete('/requirements/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query('DELETE FROM requirements WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Requirement not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  SYSTEM FOLDERS
  // ════════════════════════════════════════════════════════════════

  // POST /api/requirements/:id/move — kanban-friendly single-id status move (Plan 0131)
  router.post('/requirements/:id/move', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { targetStatus, expectedCurrentStatus } = req.body;
      const allowedList = Array.from(STATUS_CANONICAL).join(', ');
      const expectedSupplied = expectedCurrentStatus !== undefined && expectedCurrentStatus !== null;
      const normalizedTarget = normalizeStatus(targetStatus);
      const normalizedExpected = expectedSupplied ? normalizeStatus(expectedCurrentStatus) : undefined;
      if (!normalizedTarget) {
        return res.status(400).json({ error: `targetStatus is required and must be one of: ${allowedList}` });
      }
      if (expectedSupplied && normalizedExpected === null) {
        return res.status(400).json({ error: `expectedCurrentStatus, if provided, must be one of: ${allowedList}` });
      }
      await client.query('BEGIN');
      // Lock the row to detect concurrent moves
      const { rows: [currentRow] } = await client.query(
        'SELECT id, status FROM nebula.requirements_history WHERE id = $1 AND recorded_until_dt = \'9999-12-31 23:59:59+00\' FOR UPDATE',
        [id]
      );
      if (!currentRow) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Requirement not found' });
      }
      if (normalizedExpected !== undefined && currentRow.status !== normalizedExpected) {
        await client.query('ROLLBACK');
        return res.status(409).json({
          error: 'Current status does not match expectedCurrentStatus',
          currentStatus: currentRow.status,
          expectedCurrentStatus: normalizedExpected,
        });
      }
      const { rows: [reqt] } = await client.query(
        'UPDATE requirements SET status = $1 WHERE id = $2 RETURNING *',
        [normalizedTarget, id]
      );
      await client.query('COMMIT');
      res.json({
        ...toEpochMs(reqt, 'created_at'),
        systemId: reqt.system_id, subsystemId: reqt.subsystem_id, featureId: reqt.feature_id,
        startDate: reqt.start_date, completionDate: reqt.completion_date,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/systems/:id/folders
  router.post('/systems/:id/folders', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { name, category, note = '' } = req.body;
      if (!name || !category) return res.status(400).json({ error: 'name and category are required' });
      const { rows: [folder] } = await pool.query(
        'INSERT INTO system_folders (system_id, name, category, note) VALUES ($1, $2, $3, $4) RETURNING *',
        [id, name, category, note]
      );
      res.status(201).json({ id: folder.id, name: folder.name, category: folder.category, note: folder.note });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/systems/:systemId/folders/:folderId
  router.delete('/systems/:systemId/folders/:folderId', async (req: Request, res: Response) => {
    try {
      const { systemId, folderId } = req.params;
      const { rowCount } = await pool.query(
        'DELETE FROM system_folders WHERE id = $1 AND system_id = $2',
        [folderId, systemId]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Folder not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  WORK SESSIONS
  // ════════════════════════════════════════════════════════════════

  // GET /api/sessions
  router.get('/sessions', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query('SELECT * FROM work_sessions ORDER BY created_at DESC');
      res.json(rows.map((r: any) => ({
        ...toEpochMs(r, 'created_at'),
        parentId: r.parent_id,
        parentType: r.parent_type,
        parentName: r.parent_name,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/sessions
  router.post('/sessions', async (req: Request, res: Response) => {
    try {
      const { parentId, parentType, parentName = '', context = '', platform = '', model = '', outcome = null, status = 'Pending' } = req.body;
      if (!parentId || !parentType) return res.status(400).json({ error: 'parentId and parentType are required' });
      // Normalize parent_type to lowercase to match DB CHECK constraint
      const normalizedParentType = parentType.toLowerCase();
      const { rows: [sess] } = await pool.query(
        `INSERT INTO work_sessions (parent_id, parent_type, parent_name, context, platform, model, outcome, status)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [parentId, normalizedParentType, parentName, context, platform, model, outcome, status]
      );
      res.status(201).json({
        ...toEpochMs(sess, 'created_at'),
        parentId: sess.parent_id, parentType: sess.parent_type, parentName: sess.parent_name,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/sessions/:id
  router.patch('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { outcome, status } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (outcome !== undefined) { sets.push(`outcome = $${i++}`); vals.push(outcome); }
      if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [sess] } = await pool.query(
        `UPDATE work_sessions SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!sess) return res.status(404).json({ error: 'Session not found' });
      res.json({
        ...toEpochMs(sess, 'created_at'),
        parentId: sess.parent_id, parentType: sess.parent_type, parentName: sess.parent_name,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  COMPLEX OPERATIONS (transactional)
  // ════════════════════════════════════════════════════════════════

  // POST /api/features/move — re-parent a feature to a different subsystem
  router.post('/features/move', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { featureId, targetSystemId, targetSubsystemId } = req.body;
      if (!featureId || !targetSystemId || !targetSubsystemId) return res.status(400).json({ error: 'featureId, targetSystemId, and targetSubsystemId are required' });
      await client.query('BEGIN');
      // Update the feature's subsystem_id
      const { rows: [feat] } = await client.query(
        'UPDATE features SET subsystem_id = $1 WHERE id = $2 RETURNING *',
        [targetSubsystemId, featureId]
      );
      if (!feat) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Feature not found' }); }
      // Update all requirements that reference this feature
      await client.query(
        'UPDATE requirements SET system_id = $1, subsystem_id = $2 WHERE feature_id = $3',
        [targetSystemId, targetSubsystemId, featureId]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/subsystems/move — re-parent a subsystem to a different system
  router.post('/subsystems/move', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { subsystemId, targetSystemId } = req.body;
      if (!subsystemId || !targetSystemId) return res.status(400).json({ error: 'subsystemId and targetSystemId are required' });
      await client.query('BEGIN');
      const { rows: [sub] } = await client.query(
        'UPDATE subsystems SET system_id = $1 WHERE id = $2 RETURNING *',
        [targetSystemId, subsystemId]
      );
      if (!sub) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Subsystem not found' }); }
      // Update requirements
      await client.query(
        'UPDATE requirements SET system_id = $1 WHERE subsystem_id = $2',
        [targetSystemId, subsystemId]
      );
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/systems/demote/:id — demote a system into a subsystem of another system
  router.post('/systems/demote/:id', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id: sourceId } = req.params;
      const { targetSystemId } = req.body;
      if (!targetSystemId) return res.status(400).json({ error: 'targetSystemId is required' });
      await client.query('BEGIN');
      // Get source system
      const { rows: [source] } = await client.query('SELECT * FROM systems WHERE id = $1', [sourceId]);
      if (!source) { await client.query('ROLLBACK'); return res.status(404).json({ error: 'Source system not found' }); }
      // Create new subsystem from the system
      const color = await getUnusedColor(targetSystemId, pool);
      const { rows: [newSub] } = await client.query(
        'INSERT INTO subsystems (system_id, name, description, readme, color) VALUES ($1, $2, $3, $4, $5) RETURNING *',
        [targetSystemId, source.name, source.description, source.readme, color]
      );
      // Move source's subsystems as features of the new subsystem
      const { rows: oldSubs } = await client.query('SELECT * FROM subsystems WHERE system_id = $1', [sourceId]);
      for (const os of oldSubs) {
        const { rows: [newFeat] } = await client.query(
          'INSERT INTO features (subsystem_id, name, description, readme) VALUES ($1, $2, $3, $4) RETURNING *',
          [newSub.id, os.name, os.description, os.readme]
        );
        // Move requirements from old subsystem to new feature
        await client.query(
          'UPDATE requirements SET system_id = $1, subsystem_id = $2, feature_id = $3 WHERE subsystem_id = $4',
          [targetSystemId, newSub.id, newFeat.id, os.id]
        );
        // Move feature-level requirements from old subsystem's features
        const { rows: oldFeats } = await client.query('SELECT * FROM features WHERE subsystem_id = $1', [os.id]);
        for (const of of oldFeats) {
          await client.query(
            'UPDATE requirements SET system_id = $1, subsystem_id = $2, feature_id = $3 WHERE feature_id = $4',
            [targetSystemId, newSub.id, newFeat.id, of.id]
          );
        }
      }
      // Move system-level requirements to new subsystem
      await client.query(
        'UPDATE requirements SET system_id = $1, subsystem_id = $2, feature_id = NULL WHERE system_id = $3 AND subsystem_id IS NULL',
        [targetSystemId, newSub.id, sourceId]
      );
      // Delete source system (cascade deletes its subsystems/features/folders)
      await client.query('DELETE FROM systems WHERE id = $1', [sourceId]);
      await client.query('COMMIT');
      res.json({ ok: true, newSubsystemId: newSub.id });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/sessions/:id
  router.delete('/sessions/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query('DELETE FROM work_sessions WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Session not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  WORKSPACES
  // ════════════════════════════════════════════════════════════════

  // GET /api/workspaces — list all workspace paths
  router.get('/workspaces', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        `SELECT w.id, w.system_id, w.subsystem_id, w.workspace_path, w.created_at,
                s.name AS system_name, sub.name AS subsystem_name
         FROM nebula.system_workspaces w
         LEFT JOIN nebula.systems s ON s.id = w.system_id
         LEFT JOIN nebula.subsystems sub ON sub.id = w.subsystem_id
         ORDER BY s.name, sub.name`
      );
      res.json(rows.map((r: any) => ({
        ...toEpochMs(r, 'created_at'),
        systemId: r.system_id,
        subsystemId: r.subsystem_id,
        workspacePath: r.workspace_path,
        systemName: r.system_name,
        subsystemName: r.subsystem_name,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/workspaces
  router.post('/workspaces', async (req: Request, res: Response) => {
    try {
      const { systemId, subsystemId = null, workspacePath } = req.body;
      if (!systemId || !workspacePath) return res.status(400).json({ error: 'systemId and workspacePath are required' });
      const { rows: [w] } = await pool.query(
        'INSERT INTO nebula.system_workspaces (system_id, subsystem_id, workspace_path) VALUES ($1, $2, $3) RETURNING *',
        [systemId, subsystemId, workspacePath]
      );
      res.status(201).json({
        ...toEpochMs(w, 'created_at'),
        systemId: w.system_id,
        subsystemId: w.subsystem_id,
        workspacePath: w.workspace_path,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/workspaces/:id
  router.delete('/workspaces/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query('DELETE FROM nebula.system_workspaces WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Workspace not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  DOCS FILES (read from disk)
  // ════════════════════════════════════════════════════════════════

  const NEXUS_ROOT = path.resolve('/home/codex/dev/nexus');
  const KNOWN_FILES = ['README.md', 'ARCHITECTURE.md', 'README.markdown', 'SPEC.md', 'REFERENCE.md'];

  // ── Shared helper: read known doc files from a workspace directory ──
  function readDocFiles(workspacePath: string): { filename: string; content: string }[] {
    const resolved = path.resolve(NEXUS_ROOT, workspacePath);
    if (!resolved.startsWith(NEXUS_ROOT)) return [];
    if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) return [];

    const files: { filename: string; content: string }[] = [];
    for (const fname of KNOWN_FILES) {
      const fpath = path.join(resolved, fname);
      if (fs.existsSync(fpath) && fs.statSync(fpath).isFile()) {
        files.push({ filename: fname, content: fs.readFileSync(fpath, 'utf-8') });
      }
    }
    return files;
  }

  // GET /api/docs — read README.md and ARCHITECTURE.md from workspace directory
  // Query params: workspacePath (relative to nexus root), e.g. typescript/conduit-mcp
  router.get('/docs', async (req: Request, res: Response) => {
    try {
      const workspacePath = req.query.workspacePath as string;
      if (!workspacePath) return res.status(400).json({ error: 'workspacePath query parameter is required' });
      // Security: prevent directory traversal (explicit 403 for this endpoint)
      const resolved = path.resolve(NEXUS_ROOT, workspacePath);
      if (!resolved.startsWith(NEXUS_ROOT)) {
        return res.status(403).json({ error: 'Path traversal denied' });
      }
      if (!fs.existsSync(resolved) || !fs.statSync(resolved).isDirectory()) {
        return res.status(404).json({ error: 'Workspace directory not found on disk' });
      }

      const files = readDocFiles(workspacePath);
      res.json({ workspacePath, files, found: files.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/subsystems/:id/docs — read docs from workspace path for a subsystem
  router.get('/subsystems/:id/docs', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      const { rows: workspaces } = await pool.query(
        'SELECT id, workspace_path FROM nebula.system_workspaces WHERE subsystem_id = $1',
        [id]
      );

      const docs: {
        workspacePath: string;
        files: { filename: string; content: string }[];
      }[] = [];

      for (const ws of workspaces) {
        const files = readDocFiles(ws.workspace_path);
        if (files.length > 0) {
          docs.push({ workspacePath: ws.workspace_path, files });
        }
      }

      res.json({ subsystemId: id, docs, found: docs.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/systems/:id/docs — read docs from all workspaces for a system
  router.get('/systems/:id/docs', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Get all workspace paths for this system (including subsystem workspaces)
      const { rows: workspaces } = await pool.query(
        'SELECT id, workspace_path, subsystem_id FROM nebula.system_workspaces WHERE system_id = $1',
        [id]
      );

      const docs: {
        workspacePath: string;
        subsystemId: string | null;
        files: { filename: string; content: string }[];
      }[] = [];

      for (const ws of workspaces) {
        const files = readDocFiles(ws.workspace_path);
        if (files.length > 0) {
          docs.push({
            workspacePath: ws.workspace_path,
            subsystemId: ws.subsystem_id,
            files,
          });
        }
      }

      res.json({ systemId: id, docs, found: docs.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  PLANS DISPLAY (Plan 0134)
  // ════════════════════════════════════════════════════════════════

  // GET /api/plans?status=pending|planning|proposed|completed|all
  router.get('/plans', async (req: Request, res: Response) => {
    try {
      const raw = (req.query.status as string | undefined) ?? 'all';
      const normalized = (raw || 'all').toLowerCase();
      if (normalized !== 'all' && !(PLAN_STATUS_DIRS as readonly string[]).includes(normalized)) {
        return res.status(400).json({ error: `status, if provided, must be one of: ${PLAN_STATUS_DIRS.join(', ')}, all` });
      }
      const all = readPlanEntries();
      const filtered = normalized === 'all' ? all : all.filter(e => e.status === normalized);
      res.json({
        plans: filtered.map(e => {
          const content = fs.readFileSync(e.absPath, 'utf-8');
          return {
            id: e.id,
            status: e.status,
            path: `${e.status}/${e.id}.md`,
            title: parsePlanTitle(content) || e.id,
            sizeBytes: e.sizeBytes,
            modifiedAt: e.modifiedAt,
          };
        }),
        count: filtered.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/plans/:id — collision-resilient (first match in pending→planning→proposed→completed order)
  router.get('/plans/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      if (id.includes('..') || id.includes('/') || id.includes('\\')) {
        return res.status(400).json({ error: 'id must be a plan basename, with no path separators' });
      }
      for (const status of PLAN_STATUS_DIRS) {
        const candidate = path.join(PLANS_ROOT, status, `${id}.md`);
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          const content = fs.readFileSync(candidate, 'utf-8');
          const st = fs.statSync(candidate);
          return res.json({
            id,
            status,
            path: `${status}/${id}.md`,
            title: parsePlanTitle(content) || id,
            content,
            sizeBytes: st.size,
            modifiedAt: st.mtime.toISOString(),
          });
        }
      }
      return res.status(404).json({ error: `Plan ${id} not found in ${PLAN_STATUS_DIRS.join(', ')}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  AUDIT FILES
  // ════════════════════════════════════════════════════════════════

  const AUDIT_ROOT = path.resolve('/home/codex/dev/nexus/audit');

  // ── Helper: recursively scan audit directory for .md files ──
  function scanAuditDir(dir: string, baseDir: string): { filePath: string; absPath: string; sizeBytes: number; mtime: string }[] {
    const results: { filePath: string; absPath: string; sizeBytes: number; mtime: string }[] = [];
    if (!fs.existsSync(dir) || !fs.statSync(dir).isDirectory()) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const absPath = path.join(dir, entry.name);
      const relPath = path.relative(baseDir, absPath);
      if (entry.isDirectory()) {
        results.push(...scanAuditDir(absPath, baseDir));
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        const st = fs.statSync(absPath);
        results.push({ filePath: relPath, absPath, sizeBytes: st.size, mtime: st.mtime.toISOString() });
      }
    }
    return results;
  }

  // ── Helper: upsert audit files into DB (bulk, with stale cleanup) ──
  async function syncAuditFilesToDb(): Promise<{ id: string; filePath: string; content: string; sizeBytes: number; recordedOn: string }[]> {
    const scanned = scanAuditDir(AUDIT_ROOT, AUDIT_ROOT);
    const scannedPaths = new Set(scanned.map(f => f.filePath));
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Remove stale entries (files deleted from disk)
      if (scannedPaths.size > 0) {
        await client.query(
          'DELETE FROM audit_files WHERE file_path != ALL($1::text[])',
          [Array.from(scannedPaths)]
        );
      } else {
        await client.query('DELETE FROM audit_files');
      }

      // Upsert each file
      const results: { id: string; filePath: string; content: string; sizeBytes: number; recordedOn: string }[] = [];
      for (const file of scanned) {
        const content = fs.readFileSync(file.absPath, 'utf-8');
      await client.query(
        `UPDATE nebula.audit_files_history
         SET recorded_until_dt = NOW()
         WHERE file_path = $1
           AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
        [file.filePath]
      );
      const { rows: [row] } = await client.query(
        `INSERT INTO nebula.audit_files_history (file_path, content, size_bytes, recorded_on_dt, recorded_until_dt)
         VALUES ($1, $2, $3, NOW(), '9999-12-31 23:59:59+00')
         RETURNING id, file_path, content, size_bytes, recorded_on_dt`,
        [file.filePath, content, file.sizeBytes]
      );
        results.push({
          id: row.id,
          filePath: row.file_path,
          content: row.content,
          sizeBytes: row.size_bytes,
          recordedOn: row.recorded_on_dt,
        });
      }

      await client.query('COMMIT');
      return results;
    } catch (err) {
      await client.query('ROLLBACK');
      throw err;
    } finally {
      client.release();
    }
  }

  // GET /api/audit — list all audit files (metadata only, no content)
  router.get('/audit', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, file_path, size_bytes, recorded_on_dt FROM audit_files ORDER BY file_path'
      );
      res.json({
        files: rows.map((r: any) => ({
          id: r.id,
          filePath: r.file_path,
          content: '',
          sizeBytes: r.size_bytes,
          updatedAt: new Date(r.recorded_on_dt).getTime(),
        })),
        count: rows.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/audit/graph — agent records as nodes, cross-references as edges
  // ⚠ MUST be before /audit/:id to avoid Express matching 'graph' as a UUID
  router.get('/audit/graph', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 200, 500);

      const [records, crossRefs] = await Promise.all([
        pool.query(
          `SELECT id, record_type AS entity_type, role, title AS name,
                  substring(content, 1, 300) AS description_abbr,
                  tags, created_at
           FROM nebula.agent_records
           ORDER BY created_at DESC
           LIMIT $1`,
          [limit]
        ),
        pool.query(
          `SELECT id, source_type AS relation_type,
                  source_type AS source_section, source_id,
                  target_type AS target_section, target_id,
                  rel_type, metadata
           FROM nebula.cross_references
           LIMIT $1`,
          [limit]
        ),
      ]);
      res.json({
        entities: records.rows,
        edges: crossRefs.rows,
        entityCount: records.rows.length,
        edgeCount: crossRefs.rows.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/audit/:id — get single audit file with content
  router.get('/audit/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT id, file_path, content, size_bytes, recorded_on_dt FROM audit_files WHERE id = $1',
        [id]
      );
      if (!row) return res.status(404).json({ error: 'Audit file not found' });
      res.json({
        id: row.id,
        filePath: row.file_path,
        content: row.content,
        sizeBytes: row.size_bytes,
        updatedAt: new Date(row.recorded_on_dt).getTime(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/audit/sync — scan filesystem and upsert all audit files
  router.post('/audit/sync', async (_req: Request, res: Response) => {
    try {
      const files = await syncAuditFilesToDb();
      res.json({
        files: files.map(f => ({
          id: f.id,
          filePath: f.filePath,
          content: '',
          sizeBytes: f.sizeBytes,
          recordedOn: new Date(f.recordedOn).getTime(),
        })),
        count: files.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/audit/:id/regenerate — re-read this specific file from disk into DB
  router.post('/audit/:id/regenerate', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [existing] } = await pool.query(
        'SELECT file_path FROM audit_files WHERE id = $1', [id]
      );
      if (!existing) return res.status(404).json({ error: 'Audit file not found' });

      const absPath = path.resolve(AUDIT_ROOT, existing.file_path);
      if (!absPath.startsWith(AUDIT_ROOT)) {
        return res.status(403).json({ error: 'Path traversal denied' });
      }
      if (!fs.existsSync(absPath) || !fs.statSync(absPath).isFile()) {
        return res.status(404).json({ error: 'Source file not found on disk' });
      }
      const content = fs.readFileSync(absPath, 'utf-8');
      const st = fs.statSync(absPath);
      const { rows: [updated] } = await pool.query(
        'UPDATE audit_files SET content = $1, size_bytes = $2 WHERE id = $3 RETURNING id, file_path, content, size_bytes, recorded_on_dt',
        [content, st.size, id]
      );
      res.json({
        id: updated.id,
        filePath: updated.file_path,
        content: updated.content,
        sizeBytes: updated.size_bytes,
        updatedAt: new Date(updated.recorded_on_dt).getTime(),
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  USER PREFERENCES
  // ════════════════════════════════════════════════════════════════

  // GET /api/preferences — get all preferences for the default user
  router.get('/preferences', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT key, value FROM user_preferences WHERE user_id = $1',
        ['default']
      );
      const prefs: Record<string, any> = {};
      rows.forEach(r => { prefs[r.key] = r.value; });
      res.json(prefs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/preferences/:key — set a single preference
  router.put('/preferences/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { value } = req.body;
      if (value === undefined) return res.status(400).json({ error: 'value is required' });
      await pool.query(
        `UPDATE nebula.user_preferences_history
         SET recorded_until_dt = NOW()
         WHERE user_id = $1 AND key = $2
           AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
        ['default', key]
      );
      await pool.query(
        `INSERT INTO nebula.user_preferences_history (user_id, key, value, recorded_on_dt, recorded_until_dt)
         VALUES ($1, $2, $3, NOW(), '9999-12-31 23:59:59+00')`,
        ['default', key, JSON.stringify(value)]
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/preferences/:key — delete a single preference (reset to default)
  router.delete('/preferences/:key', async (req: Request, res: Response) => {
    try {
      const { key } = req.params;
      const { rowCount } = await pool.query(
        'DELETE FROM user_preferences WHERE user_id = $1 AND key = $2',
        ['default', key]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Preference not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  SYSTEM INFO TABS
  // ════════════════════════════════════════════════════════════════

  // GET /api/systems/:id/info — get all info tabs for a system
  router.get('/systems/:id/info', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        'SELECT tab_id, content FROM system_info_tabs WHERE system_id = $1',
        [id]
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PUT /api/systems/:id/info/:tabId — save an info tab
  router.put('/systems/:id/info/:tabId', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id, tabId } = req.params;
      const { content } = req.body;

      await client.query('BEGIN');

      await client.query(
        `UPDATE nebula.system_info_tabs_history
         SET recorded_until_dt = NOW()
         WHERE system_id = $1 AND tab_id = $2
           AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
        [id, tabId]
      );
      await client.query(
        `INSERT INTO nebula.system_info_tabs_history (system_id, tab_id, content, recorded_on_dt, recorded_until_dt)
         VALUES ($1, $2, $3, NOW(), '9999-12-31 23:59:59+00')`,
        [id, tabId, content || '']
      );

      // Reverse link: when a harvest_context tab is cleared (empty content),
      // unlink all candidates from this system.
      if (tabId === 'harvest_context' && (!content || !String(content).trim())) {
        await client.query(
          'UPDATE nebula.harvest_candidates SET system_id = NULL WHERE system_id = $1',
          [id]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/systems/:id/info/:tabId — delete an info tab
  // When tabId='harvest_context', also unlinks all candidates from this system.
  router.delete('/systems/:id/info/:tabId', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id, tabId } = req.params;

      await client.query('BEGIN');

      // Close the current row in the history table
      const { rowCount } = await client.query(
        `UPDATE nebula.system_info_tabs_history
         SET recorded_until_dt = NOW()
         WHERE system_id = $1 AND tab_id = $2
           AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
        [id, tabId]
      );

      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Info tab not found' });
      }

      // Reverse link: unlinking the harvest_context tab removes the
      // system association from all candidates linked to this system.
      if (tabId === 'harvest_context') {
        await client.query(
          'UPDATE nebula.harvest_candidates SET system_id = NULL WHERE system_id = $1',
          [id]
        );
      }

      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  IMPORT / SEED
  // ════════════════════════════════════════════════════════════════

  // POST /api/import — bulk import from localStorage migration
  router.post('/import', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { systems, requirements, workSessions, preferences, infoTabs } = req.body;
      await client.query('BEGIN');
      let count = 0;
      if (systems && Array.isArray(systems)) {
        for (const sys of systems) {
          await client.query(
            'INSERT INTO systems (id, name, description, readme) SELECT $1, $2, $3, $4 WHERE NOT EXISTS (SELECT 1 FROM nebula.systems_history WHERE id = $1 AND recorded_until_dt = \'9999-12-31 23:59:59+00\')',
            [sys.id, sys.name, sys.description || '', sys.readme || null]
          );
          if (sys.folders) {
            for (const f of sys.folders) {
              await client.query(
                'INSERT INTO system_folders (id, system_id, name, category, note) SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM nebula.system_folders_history WHERE id = $1 AND recorded_until_dt = \'9999-12-31 23:59:59+00\')',
                [f.id, sys.id, f.name, f.category, f.note || '']
              );
            }
          }
          if (sys.subsystems) {
            for (const sub of sys.subsystems) {
              await client.query(
                'INSERT INTO subsystems (id, system_id, name, description, readme, color) SELECT $1, $2, $3, $4, $5, $6 WHERE NOT EXISTS (SELECT 1 FROM nebula.subsystems_history WHERE id = $1 AND recorded_until_dt = \'9999-12-31 23:59:59+00\')',
                [sub.id, sys.id, sub.name, sub.description || '', sub.readme || null, sub.color || '#3B82F6']
              );
              if (sub.features) {
                for (const feat of sub.features) {
                  await client.query(
                    'INSERT INTO features (id, subsystem_id, name, description, readme) SELECT $1, $2, $3, $4, $5 WHERE NOT EXISTS (SELECT 1 FROM nebula.features_history WHERE id = $1 AND recorded_until_dt = \'9999-12-31 23:59:59+00\')',
                    [feat.id, sub.id, feat.name, feat.description || '', feat.readme || null]
                  );
                }
              }
            }
          }
          count++;
        }
      }
      if (requirements && Array.isArray(requirements)) {
        for (const r of requirements) {
          await client.query(
            `INSERT INTO requirements (id, system_id, subsystem_id, feature_id, title, description, status, priority, start_date, completion_date)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9, $10
             WHERE NOT EXISTS (SELECT 1 FROM nebula.requirements_history WHERE id = $1 AND recorded_until_dt = '9999-12-31 23:59:59+00')`,
            [r.id, r.systemId, r.subsystemId, r.featureId || null, r.title, r.description || '', r.status || 'Backlog', r.priority || 'Medium', r.startDate || null, r.completionDate || null]
          );
        }
      }
      if (workSessions && Array.isArray(workSessions)) {
        for (const ws of workSessions) {
          await client.query(
            `INSERT INTO work_sessions (id, parent_id, parent_type, parent_name, context, platform, model, outcome, status)
             SELECT $1, $2, $3, $4, $5, $6, $7, $8, $9
             WHERE NOT EXISTS (SELECT 1 FROM nebula.work_sessions_history WHERE id = $1 AND recorded_until_dt = '9999-12-31 23:59:59+00')`,
            [ws.id, ws.parentId, ws.parentType, ws.parentName || '', ws.context || '', ws.platform || '', ws.model || '', ws.outcome || null, ws.status || 'Pending']
          );
        }
      }
      // Migrate preferences
      if (preferences && typeof preferences === 'object') {
        for (const [key, value] of Object.entries(preferences)) {
          await client.query(
            `UPDATE nebula.user_preferences_history
             SET recorded_until_dt = NOW()
             WHERE user_id = $1 AND key = $2
               AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
            ['default', key]
          );
          await client.query(
            `INSERT INTO nebula.user_preferences_history (user_id, key, value, recorded_on_dt, recorded_until_dt)
             VALUES ($1, $2, $3, NOW(), '9999-12-31 23:59:59+00')`,
            ['default', key, JSON.stringify(value)]
          );
        }
      }
      // Migrate info tabs
      if (infoTabs && typeof infoTabs === 'object') {
        for (const [systemId, tabs] of Object.entries(infoTabs)) {
          if (typeof tabs === 'object' && tabs !== null) {
            for (const [tabId, content] of Object.entries(tabs as Record<string, string>)) {
              await client.query(
                `UPDATE nebula.system_info_tabs_history
                 SET recorded_until_dt = NOW()
                 WHERE system_id = $1 AND tab_id = $2
                   AND recorded_until_dt = '9999-12-31 23:59:59+00'`,
                [systemId, tabId]
              );
              await client.query(
                `INSERT INTO nebula.system_info_tabs_history (system_id, tab_id, content, recorded_on_dt, recorded_until_dt)
                 VALUES ($1, $2, $3, NOW(), '9999-12-31 23:59:59+00')`,
                [systemId, tabId, content]
              );
            }
          }
        }
      }
      await client.query('COMMIT');
      res.json({ ok: true, systemsImported: count });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/seed — seed default example data (Plan 0087, idempotent, atomic)
  router.post('/seed', async (_req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // Idempotency check inside transaction — atomic with insert
      const existing = await client.query("SELECT id FROM systems WHERE name = 'E-Commerce Platform'");
      if (existing.rows.length > 0) {
        await client.query('COMMIT');
        return res.json({ ok: true, message: 'Already seeded', systemId: existing.rows[0].id });
      }
      const { rows: [sys] } = await client.query(
        "INSERT INTO systems (name, description, readme) VALUES ('E-Commerce Platform', 'Main customer facing retail platform', '# E-Commerce Platform Architecture\\nThis system handles all customer-facing interactions.\\n\\n## Tech Stack\\n- Angular 21\\n- Node.js API\\n- PostgreSQL') RETURNING *"
      );
      const { rows: [f1] } = await client.query(
        "INSERT INTO system_folders (system_id, name, category, note) VALUES ($1, 'webapp', 'UI', 'Main storefront angular app') RETURNING *",
        [sys.id]
      );
      const { rows: [f2] } = await client.query(
        "INSERT INTO system_folders (system_id, name, category, note) VALUES ($1, 'api-gateway', 'Service', 'BFF for mobile and web') RETURNING *",
        [sys.id]
      );
      const { rows: [sub] } = await client.query(
        "INSERT INTO subsystems (system_id, name, description, readme, color) VALUES ($1, 'Checkout', 'Payment and Order processing', '## Checkout Flow\\n1. Cart validation\\n2. User auth check\\n3. Shipping address\\n4. Payment processing', '#10B981') RETURNING *",
        [sys.id]
      );
      const { rows: [feat] } = await client.query(
        "INSERT INTO features (subsystem_id, name, description, readme) VALUES ($1, 'Payment Gateway', 'Stripe and PayPal integration', 'Integration requirements for Stripe v3 API.') RETURNING *",
        [sub.id]
      );
      await client.query('COMMIT');
      res.status(201).json({
        ok: true,
        systemId: sys.id,
        subsystemId: sub.id,
        featureId: feat.id,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  HARVESTS — database-first harvest pipeline output
  // ════════════════════════════════════════════════════════════════

  // GET /api/harvests — list all harvests with sort/filter support
  // sort options: candidate_count, code_blocks, turns, block_density, collaboration, created_at
  router.get('/harvests', async (req: Request, res: Response) => {
    try {
      const model = req.query.model as string | undefined;
      const version = req.query.version as string | undefined;
      const sourceHash = req.query.sourceHash as string | undefined;
      const level = req.query.level as string | undefined;
      const visibilityScope = req.query.visibilityScope as string | undefined;
      const tag = req.query.tag as string | undefined;
      const sort = (req.query.sort as string) || 'created_at';
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      const validSorts = ['candidate_count', 'code_blocks', 'turns', 'block_density', 'collaboration', 'created_at', 'tag_frequency', 'keyword_hits'];
      if (!validSorts.includes(sort)) {
        return res.status(400).json({ error: `sort must be one of: ${validSorts.join(', ')}` });
      }

      // Compute analytics via docklang for sortable metrics
      const sortExpr: Record<string, string> = {
        candidate_count: 'COALESCE(h.total_candidates, 0)',
        code_blocks:      "COALESCE((h.docklang #>> '{stats,by_type,code}')\n::int, 0)",
        turns:            'COALESCE(jsonb_array_length(h.docklang -> \'discourse_units\'), 0)',
        block_density:    "CASE WHEN jsonb_array_length(h.docklang -> 'discourse_units') > 0 THEN (h.docklang #>> '{stats,total_blocks}')::numeric / jsonb_array_length(h.docklang -> 'discourse_units') ELSE 0 END",
        collaboration:    "(SELECT count(*) FROM jsonb_array_elements(h.docklang -> 'discourse_units') du WHERE du #>> '{heading}' ILIKE '%— user%' OR du #>> '{heading}' ILIKE '%- user%')",
        created_at:       'h.created_at',
        tag_frequency:    `(SELECT COALESCE(sum(freq), 0) FROM (
           SELECT count(*) AS freq FROM nebula.harvests h2,
           unnest(h2.tags) AS t WHERE t = ANY(h.tags) GROUP BY t
         ) sub)`,
        keyword_hits:     `(SELECT count(*) FROM jsonb_array_elements(h.docklang -> 'discourse_units') du
            WHERE du #>> '{body}' ILIKE '%' || $1 || '%')`,
      };

      // Handle keyword_hits: keyword must be first param so it references $1
      const keyword = req.query.keyword as string | undefined;

      if (sort === 'keyword_hits' && !keyword) {
        return res.status(400).json({ error: 'keyword query parameter is required when sort=keyword_hits' });
      }

      const clauses: string[] = [];
      const params: any[] = [];
      let pi = 1;
      if (sort === 'keyword_hits' && keyword) { params.push(keyword); pi++; }  // keyword is $1
      if (model) { clauses.push(`h.model = $${pi++}`); params.push(model); }
      if (version) { clauses.push(`h.version = $${pi++}`); params.push(parseInt(version)); }
      if (sourceHash) { clauses.push(`h.source_hash = $${pi++}`); params.push(sourceHash); }
      if (level) { clauses.push(`h.level = $${pi++}`); params.push(parseInt(level)); }
      if (visibilityScope) { clauses.push(`h.visibility_scope = $${pi++}`); params.push(visibilityScope); }
      if (tag) { clauses.push(`$${pi++} = ANY(h.tags)`); params.push(tag); }
      const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';

      const query = `
        SELECT h.id, h.source_path, h.source_filename, h.model,
               h.total_candidates, h.tags, h.metadata, h.created_at,
               h.level, h.visibility_scope,
               h.source_hash, h.version, h.run_metadata,
               COALESCE((h.docklang #>> '{stats,by_type,code}')::int, 0) AS code_blocks,
               COALESCE(jsonb_array_length(h.docklang -> 'discourse_units'), 0) AS turns,
               CASE WHEN jsonb_array_length(h.docklang -> 'discourse_units') > 0
                    THEN (h.docklang #>> '{stats,total_blocks}')::numeric / jsonb_array_length(h.docklang -> 'discourse_units')
                    ELSE 0 END AS blocks_per_turn,
               (SELECT count(*) FROM jsonb_array_elements(h.docklang -> 'discourse_units') du
                WHERE du #>> '{heading}' ILIKE '%— user%' OR du #>> '{heading}' ILIKE '%- user%') AS user_turns,
               ${sort === 'keyword_hits' ? sortExpr.keyword_hits + ' AS keyword_hits' : '0::bigint AS keyword_hits'},
               ${sort === 'tag_frequency' ? sortExpr.tag_frequency + ' AS tag_frequency' : '0::bigint AS tag_frequency'}
        FROM nebula.harvests h
        ${where}
        ORDER BY ${sortExpr[sort]} DESC NULLS LAST
        LIMIT $${pi} OFFSET $${pi + 1}`;
      params.push(limit, offset);

      const { rows } = await pool.query(query, params);
      res.json({ harvests: rows, count: rows.length, sort });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/harvests/distribution — analytics histograms across all harvests
  router.get('/harvests/distribution', async (_req: Request, res: Response) => {
    try {
      // Turn count histogram
      const { rows: turnBuckets } = await pool.query(`
        SELECT
          CASE
            WHEN jsonb_array_length(h.docklang -> 'discourse_units') = 0 THEN '0'
            WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 1 AND 1 THEN '1'
            WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 2 AND 3 THEN '2-3'
            WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 4 AND 6 THEN '4-6'
            WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 7 AND 10 THEN '7-10'
            WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 11 AND 20 THEN '11-20'
            ELSE '20+'
          END AS bucket,
          count(*) AS harvest_count
        FROM nebula.harvests h
        WHERE h.docklang IS NOT NULL AND h.docklang != '{}'::jsonb
        GROUP BY bucket
        ORDER BY min(CASE
          WHEN jsonb_array_length(h.docklang -> 'discourse_units') = 0 THEN 0
          WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 1 AND 1 THEN 1
          WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 2 AND 3 THEN 2
          WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 4 AND 6 THEN 4
          WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 7 AND 10 THEN 7
          WHEN jsonb_array_length(h.docklang -> 'discourse_units') BETWEEN 11 AND 20 THEN 11
          ELSE 21
        END)
      `);

      // Block type totals across all harvests
      const { rows: blockTypes } = await pool.query(`
        SELECT block_type, count(*) AS cnt
        FROM nebula.harvest_blocks()
        GROUP BY block_type ORDER BY cnt DESC
      `);

      // Top tags across all harvests
      const { rows: topTags } = await pool.query(`
        SELECT t AS tag, count(*) AS cnt
        FROM nebula.harvests h, unnest(h.tags) AS t
        WHERE h.tags IS NOT NULL AND array_length(h.tags, 1) > 0
        GROUP BY t ORDER BY cnt DESC LIMIT 20
      `);

      // Totals
      const { rows: [totals] } = await pool.query(
        'SELECT count(*) AS total_harvests, sum(total_candidates)::int AS total_candidates, avg(total_candidates)::numeric(5,1) AS avg_candidates_per_harvest FROM nebula.harvests'
      );

      res.json({
        turnDistribution: turnBuckets,
        blockTypeDistribution: blockTypes,
        topTags,
        totals,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/harvests/:id — full harvest with candidates
  router.get('/harvests/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM nebula.harvests WHERE id = $1', [id]
      );
      if (!row) return res.status(404).json({ error: 'Harvest not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/harvests/:id/transcript — reconstructed conversation with code/diagrams
  router.get('/harvests/:id/transcript', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [harvest] } = await pool.query(
        'SELECT id, source_filename, docklang #>> \'{meta,title}\' AS title FROM nebula.harvests WHERE id = $1', [id]
      );
      if (!harvest) return res.status(404).json({ error: 'Harvest not found' });

      const { rows: units } = await pool.query(`
        SELECT
          (du_elem #>> '{provenance,turn_index}')::int AS turn_index,
          du_elem #>> '{heading}' AS heading,
          du_elem #>> '{provenance,role}' AS role,
          du_elem #>> '{body}' AS body,
          (du_elem #>> '{provenance,block_count}')::int AS block_count,
          jsonb_agg(
            jsonb_build_object(
              'index', (b #>> '{provenance,block_index}')::int,
              'type', b #>> '{type}',
              'content', CASE WHEN b ? 'content' THEN b #>> '{content}' ELSE NULL END,
              'items', CASE WHEN b ? 'items' THEN b -> 'items' ELSE NULL END
            ) ORDER BY (b #>> '{provenance,block_index}')::int
          ) AS blocks
        FROM nebula.harvests h,
             LATERAL jsonb_array_elements(h.docklang -> 'discourse_units') AS du_elem,
             LATERAL jsonb_array_elements(du_elem -> 'blocks') AS b
        WHERE h.id = $1 AND h.docklang IS NOT NULL AND h.docklang ? 'discourse_units'
        GROUP BY turn_index, heading, role, body, block_count
        ORDER BY turn_index
      `, [id]);

      // Count block types
      const { rows: [stats] } = await pool.query(
        "SELECT h.docklang -> 'stats' AS stats FROM nebula.harvests h WHERE h.id = $1", [id]
      );

      // Get candidates
      const { rows: candidates } = await pool.query(
        'SELECT id, title, status, system_id, intent_description FROM nebula.harvest_candidates WHERE harvest_id = $1 ORDER BY created_at', [id]
      );

      res.json({
        harvestId: id,
        title: harvest.title,
        source: harvest.source_filename,
        units,
        stats: stats?.stats || null,
        candidates,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/harvest-candidates/:id/promote — mark candidate as useful
  router.post('/harvest-candidates/:id/promote', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { status = 'useful' } = req.body;
      const validStatuses = ['useful', 'rejected', 'promoted'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({ error: `status must be one of: ${validStatuses.join(', ')}` });
      }
      const { rows: [result] } = await pool.query(
        'SELECT nebula.set_candidate_status($1, $2) AS result', [id, status]
      );
      res.json({ ok: true, result: result?.result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/harvest-candidates/promote-to-plan — collate useful candidates into a conduit plan
  router.post('/harvest-candidates/promote-to-plan', async (req: Request, res: Response) => {
    try {
      const { candidateIds, project = 'nexus', goal } = req.body;
      if (!candidateIds || !Array.isArray(candidateIds) || candidateIds.length === 0) {
        return res.status(400).json({ error: 'candidateIds (array of UUIDs) is required' });
      }
      const { rows: [result] } = await pool.query(
        'SELECT plan_id, plan_title, plan_goal, candidates_used, status_results FROM nebula.candidates_to_plan($1::uuid[], $2, $3)',
        [candidateIds, project, goal || null]
      );
      res.json({ ok: true, ...result });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  });

  // POST /api/harvests — create a new harvest record AND unpack candidates
  // into harvest_candidates (dual-write: JSONB preserved for Rover + relational for linking)
  router.post('/harvests', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { sourcePath, sourceFilename, model, totalCandidates, candidates, sourceText, tags, metadata, level, visibilityScope, sourceHash, runMetadata, docklang } = req.body;
      if (!sourcePath) return res.status(400).json({ error: 'sourcePath is required' });
      await client.query('BEGIN');

      // 1. Insert the harvest (trigger auto-computes version and source_hash)
      const { rows: [row] } = await client.query(
        `INSERT INTO nebula.harvests (source_path, source_filename, model, total_candidates, candidates, source_text, tags, metadata, level, visibility_scope, source_hash, run_metadata, docklang)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          sourcePath,
          sourceFilename || '',
          model || '',
          totalCandidates || 0,
          JSON.stringify(candidates || []),
          sourceText || null,
          tags || [],
          metadata || {},
          level ?? 1,
          visibilityScope || 'all',
          sourceHash || null,
          runMetadata || {},
          docklang || null,
        ]
      );

      // 2. Unpack each candidate into harvest_candidates (redundant but non-destructive)
      const candidateList: any[] = candidates || [];
      for (const c of candidateList) {
        await client.query(
          `INSERT INTO nebula.harvest_candidates (harvest_id, title, intent_description, implementation_notes, code_snippets, open_questions, tags, status)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
          [
            row.id,
            c.title || 'Untitled',
            c.intentDescription || c.intent_description || null,
            JSON.stringify(c.implementationNotes || c.implementation_notes || []),
            JSON.stringify(c.codeSnippets || c.code_snippets || []),
            JSON.stringify(c.openQuestions || c.open_questions || []),
            c.tags || [],
            c.status || c.promotionStatus || null,
          ]
        );
      }

      await client.query('COMMIT');
      res.status(201).json(row);
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // DELETE /api/harvests/:id
  router.delete('/harvests/:id', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      await client.query('BEGIN');
      // Manual cascade: harvest_candidates has no FK because harvests is a view
      await client.query('DELETE FROM nebula.harvest_candidates WHERE harvest_id = $1', [id]);
      const { rowCount } = await client.query('DELETE FROM nebula.harvests WHERE id = $1', [id]);
      if (rowCount === 0) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Harvest not found' });
      }
      await client.query('COMMIT');
      res.json({ ok: true });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  HARVEST CANDIDATES — normalized relational access to harvest data
  // ════════════════════════════════════════════════════════════════

  // GET /api/plans/:planRef/candidates — reverse lookup: find all
  // harvest_candidates linked to a given conduit plan via cross_references.
  router.get('/plans/:planRef/candidates', async (req: Request, res: Response) => {
    try {
      const { planRef } = req.params;
      const { rows } = await pool.query(
        `SELECT hc.id, hc.harvest_id, hc.title, hc.intent_description,
                hc.status, hc.tags, hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.valid_from, hc.valid_until, hc.created_at, hc.updated_at,
                h.source_filename AS harvest_source,
                cr.created_at AS linked_at
         FROM nebula.harvest_candidates hc
         JOIN nebula.cross_references cr ON cr.source_id = hc.id::text
         LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
         WHERE cr.source_type = 'harvest_candidate'
           AND cr.target_type = 'plan'
           AND cr.target_id = $1
           AND cr.rel_type = 'spawns_plan'
         ORDER BY cr.created_at DESC`,
        [planRef]
      );
      res.json({ planRef, candidates: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/systems/:id/harvest-candidates — list all harvest candidates
  // linked to a specific system (direct filter by system_id).
  router.get('/systems/:id/harvest-candidates', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT hc.id, hc.harvest_id, hc.title, hc.intent_description,
                hc.status, hc.tags, hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.valid_from, hc.valid_until, hc.created_at, hc.updated_at,
                h.source_filename AS harvest_source
         FROM nebula.harvest_candidates hc
         LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
         WHERE hc.system_id = $1
         ORDER BY hc.created_at DESC`,
        [id]
      );
      res.json({ systemId: id, candidates: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/subsystems/:id/harvest-candidates — list all harvest
  // candidates linked to a specific subsystem (filter by subsystem_id).
  router.get('/subsystems/:id/harvest-candidates', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT hc.id, hc.harvest_id, hc.title, hc.intent_description,
                hc.status, hc.tags, hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.valid_from, hc.valid_until, hc.created_at, hc.updated_at,
                h.source_filename AS harvest_source
         FROM nebula.harvest_candidates hc
         LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
         WHERE hc.subsystem_id = $1
         ORDER BY hc.created_at DESC`,
        [id]
      );
      res.json({ subsystemId: id, candidates: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/features/:id/harvest-candidates — list all harvest
  // candidates linked to a specific feature (filter by feature_id).
  router.get('/features/:id/harvest-candidates', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        `SELECT hc.id, hc.harvest_id, hc.title, hc.intent_description,
                hc.status, hc.tags, hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.valid_from, hc.valid_until, hc.created_at, hc.updated_at,
                h.source_filename AS harvest_source
         FROM nebula.harvest_candidates hc
         LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
         WHERE hc.feature_id = $1
         ORDER BY hc.created_at DESC`,
        [id]
      );
      res.json({ featureId: id, candidates: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/harvest-candidates — list candidates, filterable by harvest or hierarchy
  router.get('/harvest-candidates', async (req: Request, res: Response) => {
    try {
      const { harvestId, systemId, subsystemId, featureId, limit: qLimit, offset: qOffset } = req.query;
      const limit = Math.min(parseInt(qLimit as string) || 100, 500);
      const offset = parseInt(qOffset as string) || 0;

      const clauses: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (harvestId) { clauses.push(`hc.harvest_id = $${i++}`); vals.push(harvestId); }
      if (systemId) { clauses.push(`hc.system_id = $${i++}`); vals.push(systemId); }
      if (subsystemId) { clauses.push(`hc.subsystem_id = $${i++}`); vals.push(subsystemId); }
      if (featureId) { clauses.push(`hc.feature_id = $${i++}`); vals.push(featureId); }

      const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
      vals.push(limit, offset);

      const { rows } = await pool.query(
        `SELECT hc.id, hc.harvest_id, hc.title, hc.intent_description, hc.status, hc.tags,
                hc.system_id, hc.subsystem_id, hc.feature_id,
                hc.valid_from, hc.valid_until, hc.created_at, hc.updated_at,
                h.source_filename AS harvest_source
         FROM nebula.harvest_candidates hc
         LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
         ${where}
         ORDER BY hc.created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        vals
      );
      res.json({ candidates: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/harvest-candidates/:id — full candidate with all fields
  router.get('/harvest-candidates/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM nebula.harvest_candidates WHERE id = $1', [id]
      );
      if (!row) return res.status(404).json({ error: 'Harvest candidate not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/harvest-candidates/:id — update candidate (primarily for linking to hierarchy)
  // When systemId is set, auto-upserts the candidate's intent into a harvest_context info tab.
  router.patch('/harvest-candidates/:id', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const { title, intentDescription, status, systemId, subsystemId, featureId, tags, planRef } = req.body;

      await client.query('BEGIN');

      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
      if (intentDescription !== undefined) { sets.push(`intent_description = $${i++}`); vals.push(intentDescription); }
      if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
      if (systemId !== undefined) { sets.push(`system_id = $${i++}`); vals.push(systemId); }
      if (subsystemId !== undefined) { sets.push(`subsystem_id = $${i++}`); vals.push(subsystemId); }
      if (featureId !== undefined) { sets.push(`feature_id = $${i++}`); vals.push(featureId); }
      if (tags !== undefined) { sets.push(`tags = $${i++}`); vals.push(tags); }

      // planRef creates a cross-reference but doesn't update the candidate row;
      // still count it as a "change" to avoid the early no-op return.
      const planRefProvided = hasPlanRef(planRef);
      const hasChanges = sets.length > 0 || planRefProvided;
      if (!hasChanges) {
        await client.query('COMMIT');
        return res.json({ ok: true });
      }

      // Execute UPDATE (or fetch current row if planRef-only)
      let row: any;
      if (sets.length > 0) {
        vals.push(id);
        const result = await client.query(
          `UPDATE nebula.harvest_candidates SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
          vals
        );
        row = result.rows[0];
      } else {
        // planRef-only: fetch current row so cross-reference has context
        const result = await client.query(
          'SELECT * FROM nebula.harvest_candidates WHERE id = $1', [id]
        );
        row = result.rows[0];
      }
      if (!row) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Harvest candidate not found' });
      }

      // Auto-upsert: when a candidate is explicitly linked to a system (systemId
      // provided in the request), synthesize its intent_description into a
      // 'harvest_context' info tab on that system. Does NOT fire on status/title-only
      // patches of already-linked candidates.
      const shouldUpsert = systemId !== undefined && row.system_id && row.intent_description;
      if (shouldUpsert) {
        await upsertHarvestContextTab(client, row.system_id, row);
      }

      // Plan integration: when a planRef is provided, create a cross-reference
      // linking this harvest_candidate to a conduit plan with rel_type='spawns_plan'.
      await createSpawnsPlanCrossRef(client, row.id, planRef, {
        candidateTitle: row.title,
        harvestId: row.harvest_id,
        systemId: row.system_id,
        linkedAt: new Date().toISOString(),
      });

      await client.query('COMMIT');
      res.json(row);
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/harvest-candidates/:id/spawn-plan — full flow: link candidate
  // to system, create a requirement derived from the candidate, and optionally
  // cross-reference a conduit plan — all in one atomic transaction.
  router.post('/harvest-candidates/:id/spawn-plan', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { id } = req.params;
      const {
        systemId,
        subsystemId,
        featureId = null,
        planRef,
        priority = 'Medium',
        status = 'Backlog',
        title,
        description,
      } = req.body;

      if (!systemId) return res.status(400).json({ error: 'systemId is required' });
      if (!subsystemId) return res.status(400).json({ error: 'subsystemId is required (requirement must belong to a subsystem)' });
      await client.query('BEGIN');

      // 1. Fetch the harvest candidate (must exist)
      const { rows: [candidate] } = await client.query(
        'SELECT * FROM nebula.harvest_candidates WHERE id = $1', [id]
      );
      if (!candidate) {
        await client.query('ROLLBACK');
        return res.status(404).json({ error: 'Harvest candidate not found' });
      }

      // 2. Link candidate to hierarchy
      const { rows: [updatedCandidate] } = await client.query(
        `UPDATE nebula.harvest_candidates
         SET system_id = $1, subsystem_id = $2, feature_id = $3
         WHERE id = $4 RETURNING *`,
        [systemId, subsystemId, featureId, id]
      );

      // 3. Auto-upsert harvest_context info tab (same pattern as PATCH)
      if (candidate.intent_description) {
        await upsertHarvestContextTab(client, systemId, candidate);
      }

      // 4. Create a requirement derived from the candidate
      const reqTitle = title || candidate.title;
      const reqDescription = description || candidate.intent_description || '';
      const normalizedStatus = normalizeStatus(status);
      if (!normalizedStatus) {
        await client.query('ROLLBACK');
        return res.status(400).json({ error: `status, if provided, must be one of: ${Array.from(STATUS_CANONICAL).join(', ')}` });
      }
      const { rows: [requirement] } = await client.query(
        `INSERT INTO requirements (system_id, subsystem_id, feature_id, title, description, status, priority, start_date, completion_date)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [systemId, subsystemId, featureId, reqTitle, reqDescription, normalizedStatus, priority, null, null]
      );

      // 5. Create cross-reference: candidate → plan (if planRef provided)
      const crossRef = await createSpawnsPlanCrossRef(client, candidate.id, planRef, {
        candidateTitle: candidate.title,
        harvestId: candidate.harvest_id,
        systemId,
        requirementId: requirement.id,
        linkedAt: new Date().toISOString(),
      });

      await client.query('COMMIT');

      res.status(201).json({
        candidate: updatedCandidate,
        requirement: {
          ...toEpochMs(requirement, 'created_at'),
          systemId: requirement.system_id,
          subsystemId: requirement.subsystem_id,
          featureId: requirement.feature_id,
          startDate: requirement.start_date,
          completionDate: requirement.completion_date,
        },
        crossReference: crossRef
          ? { ...toEpochMs(crossRef, 'created_at'), sourceType: crossRef.source_type, sourceId: crossRef.source_id, targetType: crossRef.target_type, targetId: crossRef.target_id, relType: crossRef.rel_type }
          : null,
      });
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // POST /api/harvest-candidates — create a standalone candidate (e.g. manually linked).
  // When systemId is set, auto-upserts a harvest_context info tab on the target system.
  router.post('/harvest-candidates', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { harvestId, title, intentDescription, implementationNotes, codeSnippets, openQuestions, tags, status, systemId, subsystemId, featureId, planRef } = req.body;
      if (!harvestId || !title) return res.status(400).json({ error: 'harvestId and title are required' });
      await client.query('BEGIN');

      const { rows: [row] } = await client.query(
        `INSERT INTO nebula.harvest_candidates (harvest_id, title, intent_description, implementation_notes, code_snippets, open_questions, tags, status, system_id, subsystem_id, feature_id)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) RETURNING *`,
        [
          harvestId, title,
          intentDescription || null,
          JSON.stringify(implementationNotes || []),
          JSON.stringify(codeSnippets || []),
          JSON.stringify(openQuestions || []),
          tags || [], status || null,
          systemId || null, subsystemId || null, featureId || null,
        ]
      );

      // Auto-upsert: when created with a systemId and intent_description,
      // synthesize into a harvest_context info tab (same pattern as PATCH).
      if (row.system_id && row.intent_description) {
        await upsertHarvestContextTab(client, row.system_id, row);
      }

      // Plan integration: create cross-reference if planRef provided
      await createSpawnsPlanCrossRef(client, row.id, planRef, {
        candidateTitle: row.title,
        harvestId: row.harvest_id,
        systemId: row.system_id,
        linkedAt: new Date().toISOString(),
      });

      await client.query('COMMIT');
      res.status(201).json(row);
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  HARVEST CANDIDATE DISCOVERY — semantic search against project hierarchy
  // ════════════════════════════════════════════════════════════════

  // POST /api/harvest-candidates/discover — match unlinked candidates to systems/subsystems/features
  // via semantic search, flagging undocumented projects below confidence threshold.
  router.post('/harvest-candidates/discover', async (req: Request, res: Response) => {
    try {
      const {
        candidateIds,
        limit = 50,
        threshold = 0.75,
      } = req.body;

      const candidateLimit = Math.min(parseInt(String(limit)) || 50, 200);
      const rawThreshold = parseFloat(String(threshold));
      const matchThreshold = !isNaN(rawThreshold) && rawThreshold >= 0 && rawThreshold <= 1 ? rawThreshold : 0.75;

      // Validate threshold range at the REST level (zod validates at MCP level)
      if (isNaN(rawThreshold) || rawThreshold < 0 || rawThreshold > 1) {
        return res.status(400).json({ error: 'threshold must be a number between 0 and 1' });
      }

      // 1. Query unlinked harvest candidates (respect temporal validity)
      let candidateQuery = `
        SELECT hc.id, hc.title, hc.intent_description, hc.harvest_id,
               h.source_filename AS harvest_source
        FROM nebula.harvest_candidates hc
        LEFT JOIN nebula.harvests h ON h.id = hc.harvest_id
        WHERE hc.system_id IS NULL
          AND hc.subsystem_id IS NULL
          AND hc.feature_id IS NULL
          AND NOW() >= hc.valid_from
          AND NOW() < hc.valid_until
      `;
      const candidateParams: any[] = [];

      if (candidateIds && Array.isArray(candidateIds) && candidateIds.length > 0) {
        candidateQuery += ` AND hc.id = ANY($1::uuid[])`;
        candidateParams.push(candidateIds);
      }

      candidateQuery += ` ORDER BY hc.created_at DESC LIMIT $${candidateParams.length + 1}`;
      candidateParams.push(candidateLimit);

      const { rows: candidates } = await pool.query(candidateQuery, candidateParams);

      if (candidates.length === 0) {
        return res.json({
          candidateCount: 0,
          matchThreshold,
          matches: [],
          undocumented: [],
        });
      }

      // 2. Fetch full hierarchy (systems, subsystems, features) for name-based matching
      const [systemsRes, subsystemsRes, featuresRes] = await Promise.all([
        pool.query('SELECT id, name, description FROM systems ORDER BY name'),
        pool.query('SELECT s.id, s.name, s.description, s.system_id, sys.name AS system_name FROM subsystems s LEFT JOIN systems sys ON sys.id = s.system_id ORDER BY s.name'),
        pool.query('SELECT f.id, f.name, f.description, f.subsystem_id, sub.name AS subsystem_name, sub.system_id FROM features f LEFT JOIN subsystems sub ON sub.id = f.subsystem_id ORDER BY f.name'),
      ]);

      const allSystems = systemsRes.rows;
      const allSubsystems = subsystemsRes.rows;
      const allFeatures = featuresRes.rows;

      // 3. For each candidate, run semantic search (parallelized) and evaluate confidence
      const scriptPath = '/home/codex/dev/nexus/python/rover/unified_semantic_search.py';
      const pythonBin = '/home/codex/dev/nexus/python/rover/.venv/bin/python3';

      interface MatchResult {
        candidateId: string;
        candidateTitle: string;
        candidateIntent: string | null;
        harvestSource: string | null;
        curatedMatches: Array<{
          entityId: string;
          entityName: string;
          section: string;
          entityType: string;
          description: string;
          similarity: number;
        }>;
        hierarchyMatches: Array<{
          type: 'system' | 'subsystem' | 'feature';
          id: string;
          name: string;
          description: string;
          parentInfo?: string;
        }>;
        topSimilarity: number;
        searchFailed?: boolean;
      }

      // Helper: build search query and run text matching for one candidate
      const searchPromises = candidates.map(async (cand): Promise<MatchResult> => {
        const searchQuery = [cand.title, cand.intent_description]
          .filter(Boolean)
          .join(' ')
          .slice(0, 500);

        if (!searchQuery) {
          return {
            candidateId: cand.id,
            candidateTitle: cand.title,
            candidateIntent: cand.intent_description,
            harvestSource: cand.harvest_source,
            curatedMatches: [],
            hierarchyMatches: [],
            topSimilarity: 0,
          };
        }

        let curatedMatches: MatchResult['curatedMatches'] = [];
        let searchFailed = false;
        try {
          const { stdout } = await execFileAsync(
            pythonBin,
            [scriptPath, searchQuery, '--limit', '15', '--json'],
            { timeout: 60000, maxBuffer: 10 * 1024 * 1024 }
          );

          const parsed = JSON.parse(stdout);
          const results: any[] = parsed.results || [];

          curatedMatches = results
            .filter((r: any) => r.provenance === 'curated')
            .map((r: any) => ({
              entityId: r.id,
              entityName: r.title,
              section: r.section || '',
              entityType: r.entity_type || '',
              description: (r.description || '').slice(0, 300),
              similarity: r.similarity,
            }));
        } catch (searchErr: any) {
          console.error(`[discover] Semantic search failed for candidate ${cand.id}:`, searchErr.message);
          searchFailed = true;
        }

        // Simple text matching against hierarchy (token-based, ILIKE equivalent)
        const hierarchyMatches: MatchResult['hierarchyMatches'] = [];
        const searchTokens = searchQuery.toLowerCase().split(/\s+/).filter(t => t.length > 2);

        for (const sys of allSystems) {
          const sysName = (sys.name || '').toLowerCase();
          const sysDesc = (sys.description || '').toLowerCase();
          const tokenHits = searchTokens.filter(t => sysName.includes(t) || sysDesc.includes(t)).length;
          if (tokenHits > 0) {
            hierarchyMatches.push({
              type: 'system',
              id: sys.id,
              name: sys.name,
              description: (sys.description || '').slice(0, 200),
              parentInfo: undefined,
            });
          }
        }

        for (const sub of allSubsystems) {
          const subName = (sub.name || '').toLowerCase();
          const subDesc = (sub.description || '').toLowerCase();
          const tokenHits = searchTokens.filter(t => subName.includes(t) || subDesc.includes(t)).length;
          if (tokenHits > 0) {
            hierarchyMatches.push({
              type: 'subsystem',
              id: sub.id,
              name: sub.name,
              description: (sub.description || '').slice(0, 200),
              parentInfo: `System: ${sub.system_name || 'unknown'}`,
            });
          }
        }

        for (const feat of allFeatures) {
          const featName = (feat.name || '').toLowerCase();
          const featDesc = (feat.description || '').toLowerCase();
          const tokenHits = searchTokens.filter(t => featName.includes(t) || featDesc.includes(t)).length;
          if (tokenHits > 0) {
            hierarchyMatches.push({
              type: 'feature',
              id: feat.id,
              name: feat.name,
              description: (feat.description || '').slice(0, 200),
              parentInfo: `Subsystem: ${feat.subsystem_name || 'unknown'}`,
            });
          }
        }

        const topCuratedSimilarity = curatedMatches.length > 0
          ? Math.max(...curatedMatches.map(m => m.similarity))
          : 0;

        const result: MatchResult = {
          candidateId: cand.id,
          candidateTitle: cand.title,
          candidateIntent: cand.intent_description,
          harvestSource: cand.harvest_source,
          curatedMatches: curatedMatches.slice(0, 5),
          hierarchyMatches: hierarchyMatches.slice(0, 5),
          topSimilarity: topCuratedSimilarity,
        };
        if (searchFailed) result.searchFailed = true;
        return result;
      });

      // Run searches with concurrency limiting (max 8 parallel Python subprocesses
      // to avoid overwhelming Ollama and system resources)
      const MAX_CONCURRENT = 8;
      const allResults: MatchResult[] = [];
      for (let i = 0; i < searchPromises.length; i += MAX_CONCURRENT) {
        const batch = searchPromises.slice(i, i + MAX_CONCURRENT);
        const batchResults = await Promise.all(batch);
        allResults.push(...batchResults);
      }

      // Classify by threshold
      const matched: MatchResult[] = [];
      const undocumented: MatchResult[] = [];
      for (const result of allResults) {
        if (result.topSimilarity >= matchThreshold) {
          matched.push(result);
        } else {
          undocumented.push(result);
        }
      }

      res.json({
        candidateCount: candidates.length,
        matchThreshold,
        matches: matched,
        undocumented,
      });
    } catch (err: any) {
      console.error('[discover] Error:', err);
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  AGENT RECORDS — database-first audit trail
  // ════════════════════════════════════════════════════════════════

  // GET /api/agent-records — list records with optional filters
  router.get('/agent-records', async (req: Request, res: Response) => {
    try {
      const { type, role, systemId, planRef, tag, level, visibilityScope, limit: qLimit, offset: qOffset } = req.query;
      const limit = Math.min(parseInt(qLimit as string) || 100, 500);
      const offset = parseInt(qOffset as string) || 0;

      const clauses: string[] = [];
      const vals: any[] = [];
      let i = 1;

      if (type) { clauses.push(`record_type = $${i++}`); vals.push(type); }
      if (role) { clauses.push(`role = $${i++}`); vals.push(role); }
      if (systemId) { clauses.push(`system_id = $${i++}`); vals.push(systemId); }
      if (planRef) { clauses.push(`plan_ref = $${i++}`); vals.push(planRef); }
      if (tag) { clauses.push(`$${i} = ANY(tags)`); vals.push(tag); i++; }
      if (level) { clauses.push(`level = $${i++}`); vals.push(parseInt(level as string)); }
      if (visibilityScope) { clauses.push(`visibility_scope = $${i++}`); vals.push(visibilityScope); }

      const where = clauses.length > 0 ? 'WHERE ' + clauses.join(' AND ') : '';
      const { rows } = await pool.query(
        `SELECT id, record_type, role, title, source_path, tags, system_id, subsystem_id, plan_ref, created_at, recorded_on_dt, level, visibility_scope
         FROM nebula.agent_records ${where}
         ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, limit, offset]
      );
      res.json({ records: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/agent-records/:id — full record with content
  router.get('/agent-records/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM nebula.agent_records WHERE id = $1', [id]
      );
      if (!row) return res.status(404).json({ error: 'Agent record not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/agent-records — create a new agent record (canonical write path)
  router.post('/agent-records', async (req: Request, res: Response) => {
    try {
      const { recordType, role, title, content, sourcePath, metadata, tags, systemId, subsystemId, featureId, planRef, level, visibilityScope } = req.body;

      const validTypes = ['report', 'analysis', 'assessment', 'inspection', 'prompt', 'response', 'engineering_log', 'architecture_note', 'decision'];
      if (!recordType || !validTypes.includes(recordType)) {
        return res.status(400).json({ error: `recordType must be one of: ${validTypes.join(', ')}` });
      }

      if (level !== undefined && (level < 1 || level > 4)) {
        return res.status(400).json({ error: 'level must be between 1 and 4' });
      }

      const { rows: [row] } = await pool.query(
        `INSERT INTO nebula.agent_records (record_type, role, title, content, source_path, metadata, tags, system_id, subsystem_id, feature_id, plan_ref, level, visibility_scope)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13) RETURNING *`,
        [
          recordType, role || '', title || '', content || '',
          sourcePath || null, metadata || {}, tags || [],
          systemId || null, subsystemId || null, featureId || null, planRef || null,
          level ?? 1, visibilityScope || 'all',
        ]
      );
      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/agent-records/:id — update record fields
  router.patch('/agent-records/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { title, content, metadata, tags, systemId, subsystemId, featureId, planRef, level, visibilityScope } = req.body;
      if (level !== undefined && (level < 1 || level > 4)) {
        return res.status(400).json({ error: 'level must be between 1 and 4' });
      }
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (title !== undefined) { sets.push(`title = $${i++}`); vals.push(title); }
      if (content !== undefined) { sets.push(`content = $${i++}`); vals.push(content); }
      if (metadata !== undefined) { sets.push(`metadata = $${i++}`); vals.push(metadata); }
      if (tags !== undefined) { sets.push(`tags = $${i++}`); vals.push(tags); }
      if (systemId !== undefined) { sets.push(`system_id = $${i++}`); vals.push(systemId); }
      if (subsystemId !== undefined) { sets.push(`subsystem_id = $${i++}`); vals.push(subsystemId); }
      if (featureId !== undefined) { sets.push(`feature_id = $${i++}`); vals.push(featureId); }
      if (planRef !== undefined) { sets.push(`plan_ref = $${i++}`); vals.push(planRef); }
      if (level !== undefined) { sets.push(`level = $${i++}`); vals.push(level); }
      if (visibilityScope !== undefined) { sets.push(`visibility_scope = $${i++}`); vals.push(visibilityScope); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [row] } = await pool.query(
        `UPDATE nebula.agent_records SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!row) return res.status(404).json({ error: 'Agent record not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/agent-records/:id
  router.delete('/agent-records/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query('DELETE FROM nebula.agent_records WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Agent record not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  PROJECTIONS — on-demand markdown folder generation
  // ════════════════════════════════════════════════════════════════

  // GET /api/projections — list all projection configs
  router.get('/projections', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT id, name, type, description, target_path, model, schedule, created_at, recorded_on_dt FROM nebula.projections ORDER BY name'
      );
      res.json({ projections: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/projections — create a projection config
  router.post('/projections', async (req: Request, res: Response) => {
    try {
      const { name, type, description, sourceQuery, template, targetPath, model, schedule, metadata } = req.body;
      if (!name || !type) return res.status(400).json({ error: 'name and type are required' });
      if (!['deterministic', 'inference'].includes(type)) return res.status(400).json({ error: 'type must be deterministic or inference' });
      const { rows: [row] } = await pool.query(
        `INSERT INTO nebula.projections (name, type, description, source_query, template, target_path, model, schedule, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING *`,
        [name, type, description || '', sourceQuery || '', template || '', targetPath || '', model || '', schedule || '', metadata || {}]
      );
      res.status(201).json(row);
    } catch (err: any) {
      if (err.code === '23505') return res.status(409).json({ error: `Projection '${req.body.name}' already exists` });
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/projections/:id/render — execute a projection and write output files
  router.post('/projections/:id/render', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [proj] } = await pool.query('SELECT * FROM nebula.projections WHERE id = $1', [id]);
      if (!proj) return res.status(404).json({ error: 'Projection not found' });

      if (proj.type === 'deterministic') {
        // Execute the source SQL, then render each row through the template
        const { rows: data } = await pool.query(proj.source_query);
        const rendered: { path: string; content: string }[] = [];

        for (const row of data) {
          let content = proj.template;
          // Replace all {{key}} placeholders with values from the row
          for (const [key, value] of Object.entries(row)) {
            const val = value === null ? '' : String(value);
            content = content.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
          }
          const targetPath = proj.target_path
            .replace(/\{\{id\}\}/g, row.id || '')
            .replace(/\{\{name\}\}/g, row.name || row.title || 'unknown');

          const absPath = path.resolve(AUDIT_ROOT, targetPath);
          if (!absPath.startsWith(AUDIT_ROOT)) {
            return res.status(403).json({ error: `Target path traversal denied: ${targetPath}` });
          }
          const dir = path.dirname(absPath);
          fs.mkdirSync(dir, { recursive: true });
          fs.writeFileSync(absPath, content, 'utf-8');
          rendered.push({ path: targetPath, content: content.slice(0, 200) + '...' });
        }

        res.json({ ok: true, type: 'deterministic', rendered: rendered.length, files: rendered });
      } else {
        // Inference mode — placeholder; will invoke LLM in future version
        res.json({ ok: true, type: 'inference', note: 'Inference projection not yet implemented' });
      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/projections/:id
  router.delete('/projections/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query('DELETE FROM nebula.projections WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Projection not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  CROSS-REFERENCES
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/cross-references
  router.post('/cross-references', async (req: Request, res: Response) => {
    try {
      const { sourceType, sourceId, targetType, targetId, relType, metadata } = req.body;
      if (!sourceType || !sourceId || !targetType || !targetId || !relType) {
        return res.status(400).json({ error: 'sourceType, sourceId, targetType, targetId, and relType are required' });
      }

      // Validate against cross-reference taxonomy
      const { isValidCrossReferenceType, validateCrossRefConstraint } = await import('./crossref-taxonomy');
      if (!isValidCrossReferenceType(relType)) {
        const allowed = (await import('./crossref-taxonomy')).ALL_CROSSREF_TYPES.join(', ');
        return res.status(400).json({
          error: `Invalid rel_type "${relType}". Allowed values: ${allowed}`,
        });
      }

      const constraint = validateCrossRefConstraint(relType, sourceType, targetType);
      if (!constraint.valid) {
        return res.status(400).json({ error: constraint.error });
      }

      const { rows: [row] } = await pool.query(
        `INSERT INTO nebula.cross_references (source_type, source_id, target_type, target_id, rel_type, metadata)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [sourceType, sourceId, targetType, targetId, relType, JSON.stringify(metadata || {})]
      );
      res.status(201).json(toEpochMs(row, 'created_at'));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cross-references
  router.get('/cross-references', async (req: Request, res: Response) => {
    try {
      const { sourceType, sourceId, targetType, targetId, relType } = req.query;
      const clauses: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (sourceType) { clauses.push(`source_type = $${i++}`); vals.push(sourceType); }
      if (sourceId) { clauses.push(`source_id = $${i++}`); vals.push(sourceId); }
      if (targetType) { clauses.push(`target_type = $${i++}`); vals.push(targetType); }
      if (targetId) { clauses.push(`target_id = $${i++}`); vals.push(targetId); }
      if (relType) { clauses.push(`rel_type = $${i++}`); vals.push(relType); }
      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const { rows } = await pool.query(
        `SELECT * FROM nebula.cross_references ${where} ORDER BY created_at DESC`,
        vals
      );
      res.json(rows.map((r: any) => toEpochMs(r, 'created_at')));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/cross-references/:id
  router.get('/cross-references/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query('SELECT * FROM nebula.cross_references WHERE id = $1', [id]);
      if (!row) return res.status(404).json({ error: 'Cross-reference not found' });
      res.json(toEpochMs(row, 'created_at'));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/cross-references/:id
  router.delete('/cross-references/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query('DELETE FROM nebula.cross_references WHERE id = $1', [id]);
      if (rowCount === 0) return res.status(404).json({ error: 'Cross-reference not found' });
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // ═══════════════════════════════════════════════════════════════════
  //  EVIDENCE LINKS — typed harvest→knowledge bridge
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/evidence-links
  router.post('/evidence-links', async (req: Request, res: Response) => {
    try {
      const {
        knowledgeEntityId, nebulaHarvestId, nebulaCandidateId,
        linkType, confidence, provenance, rationale, sourceSpan, metadata,
      } = req.body;

      if (!knowledgeEntityId || !linkType) {
        return res.status(400).json({
          error: 'knowledgeEntityId and linkType are required',
        });
      }

      if (!nebulaHarvestId && !nebulaCandidateId) {
        return res.status(400).json({
          error: 'At least one of nebulaHarvestId or nebulaCandidateId is required',
        });
      }

      // Validate link type against taxonomy
      const { isValidEvidenceLinkType } = await import('./evidence-link-types');
      if (!isValidEvidenceLinkType(linkType)) {
        const allowed = (await import('./evidence-link-types')).ALL_EVIDENCE_LINK_TYPES.join(', ');
        return res.status(400).json({
          error: `Invalid linkType "${linkType}". Allowed values: ${allowed}`,
        });
      }

      // Validate provenance if provided
      if (provenance) {
        const { isValidProvenance } = await import('./evidence-link-types');
        if (!isValidProvenance(provenance)) {
          const allowed = (await import('./evidence-link-types')).EVIDENCE_PROVENANCE_VALUES.join(', ');
          return res.status(400).json({
            error: `Invalid provenance "${provenance}". Allowed values: ${allowed}`,
          });
        }
      }

      const { rows: [row] } = await pool.query(
        `INSERT INTO knowledge.evidence_links
           (knowledge_entity_id, nebula_harvest_id, nebula_candidate_id,
            link_type, confidence, provenance, rationale, source_span, metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
         RETURNING *`,
        [
          knowledgeEntityId,
          nebulaHarvestId || null,
          nebulaCandidateId || null,
          linkType,
          confidence != null ? confidence : null,
          provenance || 'auto_ingestor',
          rationale || null,
          sourceSpan ? JSON.stringify(sourceSpan) : null,
          JSON.stringify(metadata || {}),
        ]
      );
      res.status(201).json(toEpochMs(row, 'created_at'));
    } catch (err: any) {
      if (err.code === '23505') {
        return res.status(409).json({
          error: 'Duplicate evidence link — this entity+source+type combination already exists',
        });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/evidence-links
  router.get('/evidence-links', async (req: Request, res: Response) => {
    try {
      const {
        knowledgeEntityId, nebulaHarvestId, nebulaCandidateId,
        linkType, provenance, minConfidence, maxConfidence,
        limit, offset,
      } = req.query;

      const clauses: string[] = [];
      const vals: any[] = [];
      let i = 1;

      if (knowledgeEntityId) { clauses.push(`knowledge_entity_id = $${i++}`); vals.push(knowledgeEntityId); }
      if (nebulaHarvestId) { clauses.push(`nebula_harvest_id = $${i++}`); vals.push(nebulaHarvestId); }
      if (nebulaCandidateId) { clauses.push(`nebula_candidate_id = $${i++}`); vals.push(nebulaCandidateId); }
      if (linkType) { clauses.push(`link_type = $${i++}`); vals.push(linkType); }
      if (provenance) { clauses.push(`provenance = $${i++}`); vals.push(provenance); }
      if (minConfidence) { clauses.push(`confidence >= $${i++}`); vals.push(parseFloat(minConfidence as string)); }
      if (maxConfidence) { clauses.push(`confidence <= $${i++}`); vals.push(parseFloat(maxConfidence as string)); }

      const where = clauses.length > 0 ? `WHERE ${clauses.join(' AND ')}` : '';
      const l = limit ? parseInt(limit as string, 10) : 100;
      const o = offset ? parseInt(offset as string, 10) : 0;

      const { rows } = await pool.query(
        `SELECT * FROM knowledge.evidence_links ${where} ORDER BY created_at DESC LIMIT $${i} OFFSET $${i + 1}`,
        [...vals, l, o]
      );
      res.json(rows.map((r: any) => toEpochMs(r, 'created_at')));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/evidence-links/:id
  router.get('/evidence-links/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM knowledge.evidence_links WHERE id = $1', [id]
      );
      if (!row) return res.status(404).json({ error: 'Evidence link not found' });
      res.json(toEpochMs(row, 'created_at'));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/evidence-links/:id
  router.delete('/evidence-links/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query(
        'DELETE FROM knowledge.evidence_links WHERE id = $1', [id]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Evidence link not found' });
      res.status(204).send();
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/evidence-links?knowledgeEntityId=... — bulk delete all links for an entity
  router.delete('/evidence-links', async (req: Request, res: Response) => {
    try {
      const { knowledgeEntityId } = req.query;
      if (!knowledgeEntityId) {
        return res.status(400).json({ error: 'knowledgeEntityId query parameter is required for bulk delete' });
      }
      const { rowCount } = await pool.query(
        'DELETE FROM knowledge.evidence_links WHERE knowledge_entity_id = $1',
        [knowledgeEntityId]
      );
      res.json({ deleted: rowCount });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });


  // ════════════════════════════════════════════════════════════════
  //  BLOCK SEGMENTATION — interactive block-level transcript editing
  // ════════════════════════════════════════════════════════════════

  // GET /api/conversations/:id/snapshots — list all snapshots for a conversation
  router.get('/conversations/:id/snapshots', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await bs.listSnapshots(pool, id as string);
      res.json(result);

      // Warm session cache on read
      try {
        await bsRedis.cacheSession(id as string, {
          conversationId: id as string,
          activeSnapshotId: result.snapshots[0]?.id || null,
          mode: 'view',
          userId: 'unknown',
        });
      } catch (_) { /* Redis unavailable — non-fatal */ }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/snapshots/:id/blocks — list blocks with optional diff from a previous snapshot
  router.get('/snapshots/:id/blocks', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const dq = req.query.diffFrom;
      const diffFrom = typeof dq === 'string' ? dq : undefined;
      const result = await bs.listBlocks(pool, id as string, diffFrom);
      res.json(result);

      // Cache blocks for next read (non-diff queries only)
      if (!diffFrom) {
        try { await bsRedis.cacheBlocks(id as string, result.blocks); }
        catch (_) { /* non-fatal */ }

      }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/snapshots — create a new conversation snapshot with blocks
  router.post('/snapshots', async (req: Request, res: Response) => {
    try {
      const { conversationId, snapshotIndex, sourceHash, captureMode, blockCount, createdBy, blocks } = req.body;
      if (!conversationId || snapshotIndex === undefined || !sourceHash) {
        return res.status(400).json({ error: 'conversationId, snapshotIndex, and sourceHash are required' });
      }
      const result = await bs.createSnapshot(pool, {
        conversationId, snapshotIndex, sourceHash, captureMode, blockCount, createdBy, blocks,
      });
      // Cache new blocks and invalidate stale projection
      try {
        await bsRedis.cacheBlocks(result.snapshot.id, blocks || []);
        await bsRedis.invalidateProjection(result.snapshot.id);
      } catch (_) { /* non-fatal */ }
      res.status(201).json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/segments — commit a user-defined segment
  router.post('/segments', async (req: Request, res: Response) => {
    try {
      const { conversationId, snapshotId, startBlockId, endBlockId, startBlockIndex, endBlockIndex, segmentType, source, title, notesMd, createdBy } = req.body;
      if (!conversationId || !snapshotId || !startBlockId || !endBlockId || startBlockIndex === undefined || endBlockIndex === undefined) {
        return res.status(400).json({ error: 'conversationId, snapshotId, startBlockId, endBlockId, startBlockIndex, and endBlockIndex are required' });
      }
      // Invalidate caches after segment commit
      try {
        await bsRedis.invalidateCandidates(req.body.snapshotId);
        await bsRedis.invalidateProjection(req.body.snapshotId);
        await bsRedis.invalidateGraph(req.body.snapshotId);
      } catch (_) { /* non-fatal */ }
      const segment = await bs.createSegment(pool, {
        conversationId, snapshotId, startBlockId, endBlockId, startBlockIndex, endBlockIndex, segmentType, source, title, notesMd, createdBy,
      });
      res.status(201).json(segment);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/segments/:id — update segment (type, state, title, notes)
  router.patch('/segments/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { segmentType, state, title, notesMd } = req.body;
      const segment = await bs.updateSegment(pool, id as string, { segmentType, state, title, notesMd });
      if (!segment) return res.status(404).json({ error: 'Segment not found' });
      res.json(segment);
      try { await bsRedis.invalidateProjection(segment.snapshot_id); }
      catch (_) { /* non-fatal */ }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/segments/:id — supersede (bitemporal expire) a segment
  router.delete('/segments/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await bs.supersedeSegment(pool, id as string);
      res.json(result);

      // Invalidate caches after segment deletion
      try {
        const { rows } = await pool.query(
          'SELECT snapshot_id FROM nebula.segments_history WHERE id = $1 AND recorded_until_dt = \'9999-12-31 23:59:59+00\'',
          [req.params.id]
        );
        if (rows.length > 0) {
          await bsRedis.invalidateProjection(rows[0].snapshot_id);
          await bsRedis.invalidateGraph(rows[0].snapshot_id);
        }
      } catch (_) { /* non-fatal */ }
    } catch (err: any) {
      const status = err.message === 'Segment not found' ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // POST /api/projection-overrides — add a suppression/deprioritization override
  router.post('/projection-overrides', async (req: Request, res: Response) => {
    try {
      const { conversationId, snapshotId, targetType, targetId, projectionTarget, overrideType, reasonCode, notesMd, source, createdBy } = req.body;
      if (!conversationId || !snapshotId || !targetId) {
        return res.status(400).json({ error: 'conversationId, snapshotId, and targetId are required' });
      }
      // Invalidate projection cache for this snapshot
      try {
        await bsRedis.invalidateProjection(req.body.snapshotId, req.body.projectionTarget || 'BP');
      } catch (_) { /* non-fatal */ }
      const override = await bs.createProjectionOverride(pool, {
        conversationId, snapshotId, targetType, targetId, projectionTarget, overrideType, reasonCode, notesMd, source, createdBy,
      });
      res.status(201).json(override);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/projection-overrides/:id — remove an override
  router.delete('/projection-overrides/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const result = await bs.removeProjectionOverride(pool, id as string);
      res.json(result);

      // Invalidate projection cache
      try {
        const { rows } = await pool.query(
          "SELECT snapshot_id, projection_target FROM nebula.projection_overrides_history WHERE id = $1 AND recorded_until_dt = '9999-12-31 23:59:59+00'",
          [req.params.id]
        );
        if (rows.length > 0) {
          await bsRedis.invalidateProjection(rows[0].snapshot_id, rows[0].projection_target);
        }
      } catch (_) { /* non-fatal */ }
    } catch (err: any) {
      const status = err.message === 'Override not found' ? 404 : 500;
      res.status(status).json({ error: err.message });
    }
  });

  // GET /api/snapshots/:id/projection — get the BP projection for a snapshot
  router.get('/snapshots/:id/projection', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const tq = req.query.target;
      const target = (typeof tq === 'string' ? tq : undefined) || 'BP';

      // Try Redis cache first
      try {
        const cached = await bsRedis.getCachedProjection(id as string, target);
        if (cached) { res.json(cached); return; }
      } catch (_) { /* cache miss — fall through to PG */ }
      const result = await bs.getProjection(pool, id as string, target);
      res.json(result);

      // Cache projection for next read
      try { await bsRedis.cacheProjection(id as string, target, result); }
      catch (_) { /* non-fatal */ }
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/snapshots/:id/references — get harvest references for a snapshot
  router.get('/snapshots/:id/references', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const sq = req.query.state;
      const eq = req.query.edgeType;
      const state = typeof sq === 'string' ? sq : undefined;
      const edgeType = typeof eq === 'string' ? eq : undefined;
      const mq = req.query.minConfidence;
      const minConfidence = typeof mq === 'string' ? parseFloat(mq) : undefined;
      const result = await bs.listReferences(pool, id as string, { state, edgeType, minConfidence });
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  KNOWLEDGE GRAPH — read-only queries for graph visualization
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/knowledge/entities — list knowledge graph entities with optional filters
  router.get('/knowledge/entities', async (req: Request, res: Response) => {
    try {
      const { section, entity_type, search, limit: qLimit, offset: qOffset } = req.query;
      const limit = Math.min(parseInt(qLimit as string) || 200, 500);
      const offset = parseInt(qOffset as string) || 0;

      const conditions: string[] = [];
      const params: any[] = [];
      let i = 1;

      if (section) { conditions.push(`section = $${i++}`); params.push(section); }
      if (entity_type) { conditions.push(`entity_type = $${i++}`); params.push(entity_type); }
      if (search) { conditions.push(`(name ILIKE $${i} OR description ILIKE $${i})`); params.push(`%${search}%`); i++; }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);

      const { rows } = await pool.query(
        `SELECT id, section, entity_id, name, entity_type, status,
                substring(description, 1, 500) AS description_abbr,
                created_at, updated_at
         FROM knowledge.graph_entities ${where}
         ORDER BY section, name
         LIMIT $${i++} OFFSET $${i}`,
        params
      );
      res.json({ entities: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/knowledge/entities/:section/:entityId — get single entity
  router.get('/knowledge/entities/:section/:entityId', async (req: Request, res: Response) => {
    try {
      const { section, entityId } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM knowledge.graph_entities WHERE section = $1 AND entity_id = $2',
        [section, entityId]
      );
      if (!row) return res.status(404).json({ error: 'Entity not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/knowledge/entities/:section/:entityId/relations — inbound + outbound
  router.get('/knowledge/entities/:section/:entityId/relations', async (req: Request, res: Response) => {
    try {
      const { section, entityId } = req.params;
      const [outbound, inbound] = await Promise.all([
        pool.query(
          `SELECT e.id, e.relation_type, e.target_section, e.target_id, e.properties,
                  tgt.name AS target_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           WHERE e.source_section = $1 AND e.source_id = $2
           ORDER BY e.relation_type`,
          [section, entityId]
        ),
        pool.query(
          `SELECT e.id, e.relation_type, e.source_section, e.source_id, e.properties,
                  src.name AS source_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           WHERE e.target_section = $1 AND e.target_id = $2
           ORDER BY e.relation_type`,
          [section, entityId]
        ),
      ]);
      res.json({
        entity: { section, entity_id: entityId },
        outbound: { count: outbound.rows.length, edges: outbound.rows },
        inbound: { count: inbound.rows.length, edges: inbound.rows },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/knowledge/edges — list graph edges with optional filters
  router.get('/knowledge/edges', async (req: Request, res: Response) => {
    try {
      const { source_section, source_id, target_section, target_id, relation_type, limit: qLimit, offset: qOffset } = req.query;
      const limit = Math.min(parseInt(qLimit as string) || 200, 500);
      const offset = parseInt(qOffset as string) || 0;

      const conditions: string[] = [];
      const params: any[] = [];
      let i = 1;

      if (source_section) { conditions.push(`e.source_section = $${i++}`); params.push(source_section); }
      if (source_id) { conditions.push(`e.source_id = $${i++}`); params.push(source_id); }
      if (target_section) { conditions.push(`e.target_section = $${i++}`); params.push(target_section); }
      if (target_id) { conditions.push(`e.target_id = $${i++}`); params.push(target_id); }
      if (relation_type) { conditions.push(`e.relation_type = $${i++}`); params.push(relation_type); }

      const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
      params.push(limit, offset);

      const { rows } = await pool.query(
        `SELECT e.id, e.source_section, e.source_id, e.relation_type,
                e.target_section, e.target_id, e.properties, e.created_at,
                src.name AS source_name, tgt.name AS target_name
         FROM knowledge.graph_edges e
         LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
         LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
         ${where}
         ORDER BY e.source_section, e.source_id, e.relation_type
         LIMIT $${i++} OFFSET $${i}`,
        params
      );
      res.json({ edges: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  OP MAPPING REGISTRY — versioned intent→opcode mapping table
  //  Schema: nebula.op_registry
  // ═══════════════════════════════════════════════════════════════════

  // POST /api/op-registry — create a new registry entry
  router.post('/op-registry', async (req: Request, res: Response) => {
    try {
      const {
        id, intent_id, version, status, label,
        match_patterns, opcode_template, required_params, optional_params,
        preconditions, postconditions, idempotency_key, successor_id, notes,
      } = req.body;

      if (!id || !intent_id) {
        return res.status(400).json({ error: 'id and intent_id are required' });
      }

      const now = new Date().toISOString();
      const { rows: [row] } = await pool.query(
        `INSERT INTO nebula.op_registry
          (id, intent_id, version, status, label,
           match_patterns, opcode_template, required_params, optional_params,
           preconditions, postconditions, idempotency_key, successor_id, notes,
           created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
         RETURNING *`,
        [
          id, intent_id, version || 'v1', status || 'active', label || '',
          match_patterns || [], JSON.stringify(opcode_template || []),
          required_params || [], optional_params || [],
          preconditions || [], postconditions || [],
          idempotency_key || '', successor_id || null, notes || '',
          now, now,
        ]
      );
      res.status(201).json(row);
    } catch (err: any) {
      // Catch ISA validation trigger errors
      if (err.message && err.message.includes('Invalid opcode')) {
        return res.status(422).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/op-registry — list registry entries with optional filters
  router.get('/op-registry', async (req: Request, res: Response) => {
    try {
      const {
        intent_id, status, search,
        limit: qLimit, offset: qOffset,
      } = req.query;
      const limit = Math.min(parseInt(qLimit as string) || 100, 500);
      const offset = parseInt(qOffset as string) || 0;

      const conditions: string[] = ['deleted_at IS NULL'];
      const params: any[] = [];
      let i = 1;

      if (intent_id) { conditions.push(`intent_id = $${i++}`); params.push(intent_id); }
      if (status) { conditions.push(`status = $${i++}`); params.push(status); }
      if (search) {
        conditions.push(`(label ILIKE $${i} OR intent_id ILIKE $${i} OR notes ILIKE $${i})`);
        params.push(`%${search}%`);
        i++;
      }

      const where = conditions.join(' AND ');
      params.push(limit, offset);

      const { rows } = await pool.query(
        `SELECT * FROM nebula.op_registry
         WHERE ${where}
         ORDER BY intent_id, version DESC
         LIMIT $${i++} OFFSET $${i}`,
        params
      );
      res.json({ entries: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/op-registry/:id — get a single registry entry
  router.get('/op-registry/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM nebula.op_registry WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (!row) return res.status(404).json({ error: `Registry entry ${id} not found` });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/op-registry/:id/deprecate — deprecate a registry entry
  router.patch('/op-registry/:id/deprecate', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { successor_id } = req.body;
      const now = new Date().toISOString();
      const { rows: [row] } = await pool.query(
        `UPDATE nebula.op_registry
         SET status = 'deprecated', successor_id = COALESCE($2, successor_id),
             updated_at = $3
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [id, successor_id || null, now]
      );
      if (!row) return res.status(404).json({ error: `Registry entry ${id} not found or already deleted` });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/op-registry/:id/supersede — mark as superseded (replaced by fork)
  router.patch('/op-registry/:id/supersede', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { successor_id } = req.body;
      if (!successor_id) return res.status(400).json({ error: 'successor_id is required to supersede an entry' });
      const now = new Date().toISOString();
      const { rows: [row] } = await pool.query(
        `UPDATE nebula.op_registry
         SET status = 'superseded', successor_id = $2, updated_at = $3
         WHERE id = $1 AND deleted_at IS NULL
         RETURNING *`,
        [id, successor_id, now]
      );
      if (!row) return res.status(404).json({ error: `Registry entry ${id} not found or already deleted` });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/op-registry/:id — soft-delete a registry entry
  router.delete('/op-registry/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const now = new Date().toISOString();
      const { rows: [row] } = await pool.query(
        'UPDATE nebula.op_registry SET deleted_at = $2, updated_at = $2 WHERE id = $1 AND deleted_at IS NULL RETURNING *',
        [id, now]
      );
      if (!row) return res.status(404).json({ error: `Registry entry ${id} not found` });
      res.json({ deleted: true, id });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/op-registry/fork — create a new version of an existing intent mapping
  router.post('/op-registry/fork', async (req: Request, res: Response) => {
    try {
      const { source_id, new_version, label, notes, opcode_template, required_params } = req.body;
      if (!source_id || !new_version) {
        return res.status(400).json({ error: 'source_id and new_version are required' });
      }

      // Get the source entry
      const { rows: [source] } = await pool.query(
        'SELECT * FROM nebula.op_registry WHERE id = $1 AND deleted_at IS NULL',
        [source_id]
      );
      if (!source) return res.status(404).json({ error: `Source registry entry ${source_id} not found` });

      // Create the fork with a new ID
      const forkId = `${source.intent_id}:${new_version}`;
      const now = new Date().toISOString();

      const { rows: [fork] } = await pool.query(
        `INSERT INTO nebula.op_registry
          (id, intent_id, version, status, label,
           match_patterns, opcode_template, required_params, optional_params,
           preconditions, postconditions, idempotency_key, notes,
           created_at, updated_at)
         VALUES ($1, $2, $3, 'active', $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
         RETURNING *`,
        [
          forkId,
          source.intent_id,
          new_version,
          label || `${source.label} (${new_version})`,
          source.match_patterns,
          JSON.stringify(opcode_template || source.opcode_template),
          required_params || source.required_params,
          source.optional_params,
          source.preconditions,
          source.postconditions,
          source.idempotency_key,
          notes || '',
          now, now,
        ]
      );

      // Supersede the source
      await pool.query(
        `UPDATE nebula.op_registry SET status = 'superseded', successor_id = $2, updated_at = $3
         WHERE id = $1`,
        [source_id, forkId, now]
      );

      res.status(201).json({
        fork,
        superseded: source_id,
        message: `Forked ${source_id} → ${forkId}`,
      });
    } catch (err: any) {
      if (err.message && err.message.includes('Invalid opcode')) {
        return res.status(422).json({ error: err.message });
      }
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/op-registry/:id/lineage — show the version lineage of an intent
  router.get('/op-registry/:id/lineage', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      // Get the entry and follow successor chain
      const { rows: [entry] } = await pool.query(
        'SELECT * FROM nebula.op_registry WHERE id = $1 AND deleted_at IS NULL',
        [id]
      );
      if (!entry) return res.status(404).json({ error: `Registry entry ${id} not found` });

      // Get all versions of this intent
      const { rows: lineage } = await pool.query(
        `SELECT id, intent_id, version, status, successor_id, label, created_at
         FROM nebula.op_registry
         WHERE intent_id = $1 AND deleted_at IS NULL
         ORDER BY version DESC`,
        [entry.intent_id]
      );

      res.json({ intent_id: entry.intent_id, entries: lineage, count: lineage.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/knowledge/summary — entity counts by section, edge counts by relation type
  router.get('/knowledge/summary', async (_req: Request, res: Response) => {
    try {
      const [entityCount, edgeCount, xrefCount, sections, relationTypes] = await Promise.all([
        pool.query('SELECT COUNT(*)::int AS count FROM knowledge.graph_entities'),
        pool.query('SELECT COUNT(*)::int AS count FROM knowledge.graph_edges'),
        pool.query('SELECT COUNT(*)::int AS count FROM knowledge.graph_cross_references'),
        pool.query('SELECT section, COUNT(*)::int AS count FROM knowledge.graph_entities GROUP BY section ORDER BY count DESC'),
        pool.query('SELECT relation_type, COUNT(*)::int AS count FROM knowledge.graph_edges GROUP BY relation_type ORDER BY count DESC'),
      ]);
      res.json({
        entityCount: entityCount.rows[0]?.count ?? 0,
        edgeCount: edgeCount.rows[0]?.count ?? 0,
        crossReferenceCount: xrefCount.rows[0]?.count ?? 0,
        bySection: sections.rows,
        byRelationType: relationTypes.rows,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/knowledge/view — combined data payload for graph visualization
  // Returns all entities (including linked harvest_candidates) + all edges in one call, with optional limit. Harvest_candidates are unioned so spawn-plan cross-references render as dashed edges in graph-view X-Refs mode.
  router.get('/knowledge/view', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 500, 1000);

      // Union knowledge entities with linked harvest_candidates (for cross-ref visibility)
      const unionEntities = `
        SELECT id, section, entity_id, name, entity_type, status, description_abbr
        FROM (
          SELECT id, section, entity_id, name, entity_type, status,
                 substring(description, 1, 300) AS description_abbr
          FROM knowledge.graph_entities
          UNION ALL
          SELECT gen_random_uuid() AS id,
                 'harvest_candidate' AS section,
                 id::text AS entity_id,
                 COALESCE(title, 'Untitled') AS name,
                 'harvest_candidate' AS entity_type,
                 COALESCE(status, 'unlinked') AS status,
                 substring(intent_description, 1, 300) AS description_abbr
          FROM nebula.harvest_candidates
          WHERE system_id IS NOT NULL
        ) AS all_entities
        ORDER BY section, name
        LIMIT $1`;

      const [entities, edges] = await Promise.all([
        pool.query(unionEntities, [limit]),
        pool.query(
          `SELECT e.id, e.source_section, e.source_id, e.relation_type,
                  e.target_section, e.target_id,
                  src.name AS source_name, tgt.name AS target_name
           FROM knowledge.graph_edges e
           LEFT JOIN knowledge.graph_entities src ON src.section = e.source_section AND src.entity_id = e.source_id
           LEFT JOIN knowledge.graph_entities tgt ON tgt.section = e.target_section AND tgt.entity_id = e.target_id
           LIMIT $1`,
          [limit * 3]
        ),
      ]);
      res.json({
        entities: entities.rows,
        edges: edges.rows,
        entityCount: entities.rows.length,
        edgeCount: edges.rows.length,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/knowledge/cross-references — list cross-references for graph overlay. Also includes harvest_candidate spawn-plan cross-references from nebula.cross_references.
  router.get('/knowledge/cross-references', async (req: Request, res: Response) => {
    try {
      const limit = Math.min(parseInt(req.query.limit as string) || 500, 1000);
      // Union knowledge cross-references with harvest_candidate spawn-plan xrefs
      const { rows } = await pool.query(
        `SELECT id, map_name, source_section, source_id, target_section, target_id, weight
         FROM (
           SELECT xr.id, xr.map_name, xr.source_section, xr.source_id,
                  xr.target_section, xr.target_id, xr.weight
           FROM knowledge.graph_cross_references xr
           UNION ALL
           SELECT gen_random_uuid() AS id,
                  'harvest_candidate' AS map_name,
                  source_type AS source_section,
                  source_id,
                  target_type AS target_section,
                  target_id,
                  1 AS weight
           FROM nebula.cross_references
           WHERE source_type = 'harvest_candidate'
             AND rel_type = 'spawns_plan'
         ) AS all_xrefs
         LIMIT $1`,
        [limit]
      );
      res.json({ crossReferences: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ═══════════════════════════════════════════════════════════════════
  //  AUDIT GRAPH — agent records as graph nodes
  //  (route handler is defined above, alongside other audit routes)
  // ═══════════════════════════════════════════════════════════════════

  // ═══════════════════════════════════════════════════════════════════
  //  CONDUIT — plan history & point-in-time queries (conduit + vision schemas)
  //  Reads from nebula.plans, vision.receipts, vision.tickets
  //  via fully qualified table names (pool search_path=nebula).
  // ═══════════════════════════════════════════════════════════════════

  // GET /api/conduit/plans — list all conduit plans, option to include soft-deleted
  // Query params: includeDeleted (bool), asOf (ISO timestamp), status (filter by derived status)
  router.get('/conduit/plans', async (req: Request, res: Response) => {
    try {
      const includeDeleted = req.query.includeDeleted === 'true';
      const asOf = req.query.asOf as string | undefined;
      const statusFilter = req.query.status as string | undefined;
      const limit = Math.min(parseInt(req.query.limit as string) || 100, 500);
      const offset = parseInt(req.query.offset as string) || 0;

      let sql: string;
      const params: any[] = [];
      let i = 1;

      if (asOf) {
        // Point-in-time: use plan_status view + receipts up to asOf
        // We query the plans table and join with receipts to derive historical state
        sql = `SELECT p.*,
          (
            SELECT r.type FROM vision.receipts r
            WHERE r.plan_id = p.id
              AND r.created_at <= $${i}
            ORDER BY r.created_at DESC LIMIT 1
          ) AS derived_status_at_time
          FROM nebula.plans p
          WHERE 1=1`;
        i++;
        params.push(asOf);

        if (!includeDeleted) {
          sql += ` AND p.deleted = 0`;
        }
        if (statusFilter) {
          sql += ` AND (SELECT r.type FROM vision.receipts r
            WHERE r.plan_id = p.id
              AND r.created_at <= $1    -- $1 is asOf
            ORDER BY r.created_at DESC LIMIT 1) = $${i}`;
          i++;
          params.push(statusFilter);
        }
        sql += ` ORDER BY p.created_at DESC LIMIT $${i} OFFSET $${i+1}`;
        params.push(limit, offset);
      } else {
        // Current state: use plan_status view
        sql = `SELECT * FROM nebula.plan_status ps WHERE 1=1`;

        if (!includeDeleted) {
          sql += ` AND ps.deleted = 0`;
        }
        if (statusFilter) {
          sql += ` AND ps.derived_status = $${i}`;
          i++;
          params.push(statusFilter);
        }
        sql += ` ORDER BY ps.created_at DESC LIMIT $${i} OFFSET $${i+1}`;
        params.push(limit, offset);
      }

      const { rows } = await pool.query(sql, params);
      res.json({ plans: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/conduit/plans/as-of — point-in-time snapshot of plan states
  // Query params: timestamp (ISO 8601, required), includeDeleted
  router.get('/conduit/plans/as-of', async (req: Request, res: Response) => {
    try {
      const timestamp = req.query.timestamp as string;
      if (!timestamp) return res.status(400).json({ error: 'timestamp query parameter is required (ISO 8601)' });
      const includeDeleted = req.query.includeDeleted === 'true';

      const { rows } = await pool.query(
        `SELECT p.*,
          (
            SELECT r.type FROM vision.receipts r
            WHERE r.plan_id = p.id AND r.created_at <= $1
            ORDER BY r.created_at DESC LIMIT 1
          ) AS derived_status_at_time,
          (
            SELECT r.created_at FROM vision.receipts r
            WHERE r.plan_id = p.id AND r.created_at <= $1
            ORDER BY r.created_at DESC LIMIT 1
          ) AS last_receipt_at_time
          FROM nebula.plans p
          WHERE (p.created_at <= $1 OR p.updated_at <= $1)
          ${includeDeleted ? '' : 'AND p.deleted = 0'}
          ORDER BY p.created_at DESC`,
        [timestamp]
      );
      res.json({ timestamp, plans: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/conduit/plans/:id/history — full lifecycle history for one plan
  // Returns plan metadata (even if deleted), all receipts, all tickets, linked sessions, token usage
  router.get('/conduit/plans/:id/history', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;

      // Plan row (even if deleted)
      const { rows: [plan] } = await pool.query(
        'SELECT * FROM nebula.plans WHERE id = $1',
        [id]
      );
      if (!plan) return res.status(404).json({ error: `Plan ${id} not found` });

      // All receipts in chronological order
      const { rows: receipts } = await pool.query(
        'SELECT * FROM vision.receipts WHERE plan_id = $1 ORDER BY created_at ASC',
        [id]
      );

      // All tickets in chronological order
      const { rows: tickets } = await pool.query(
        'SELECT * FROM vision.tickets WHERE plan_id = $1 ORDER BY created_at ASC',
        [id]
      );

      // Token usage summary
      const { rows: [tokenUsage] } = await pool.query(
        'SELECT COALESCE(SUM(tokens_used), 0) AS total_tokens, COUNT(*) AS receipt_count FROM vision.receipts WHERE plan_id = $1',
        [id]
      );

      // Sessions that worked on this plan
      const { rows: sessions } = await pool.query(
        'SELECT s.id, s.agent_role, s.start_iso, s.end_iso, s.model, s.exit_code, s.workflow_id FROM conduit.sessions s WHERE s.id IN (SELECT DISTINCT r.session_id FROM vision.receipts r WHERE r.plan_id = $1 AND r.session_id IS NOT NULL) ORDER BY s.start_iso ASC',
        [id]
      );

      res.json({
        plan,
        receipts,
        tickets,
        sessions,
        tokenUsage: { totalTokens: tokenUsage?.total_tokens ?? 0, receiptCount: tokenUsage?.receipt_count ?? 0 },
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/conduit/plans/:id/receipts — receipts for a specific plan
  router.get('/conduit/plans/:id/receipts', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows } = await pool.query(
        'SELECT * FROM vision.receipts WHERE plan_id = $1 ORDER BY created_at ASC',
        [id]
      );
      res.json({ planId: id, receipts: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/conduit/deleted-plans — shortcut to find all soft-deleted plans
  router.get('/conduit/deleted-plans', async (req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM nebula.plans WHERE deleted = 1 ORDER BY updated_at DESC'
      );
      res.json({ plans: rows, count: rows.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
