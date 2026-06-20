import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import * as fs from 'fs';
import * as path from 'path';

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
        ...toEpochMs(r, 'created_at', 'updated_at'),
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
        ...toEpochMs(reqt, 'created_at', 'updated_at'),
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
        ...toEpochMs(reqt, 'created_at', 'updated_at'),
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
        'SELECT id, status FROM requirements WHERE id = $1 FOR UPDATE',
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
        ...toEpochMs(reqt, 'created_at', 'updated_at'),
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
        ...toEpochMs(r, 'created_at', 'updated_at'),
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
        ...toEpochMs(sess, 'created_at', 'updated_at'),
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
        ...toEpochMs(sess, 'created_at', 'updated_at'),
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
  async function syncAuditFilesToDb(): Promise<{ id: string; filePath: string; content: string; sizeBytes: number; updatedAt: string }[]> {
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
      const results: { id: string; filePath: string; content: string; sizeBytes: number; updatedAt: string }[] = [];
      for (const file of scanned) {
        const content = fs.readFileSync(file.absPath, 'utf-8');
        const { rows: [row] } = await client.query(
          `INSERT INTO audit_files (file_path, content, size_bytes)
           VALUES ($1, $2, $3)
           ON CONFLICT (file_path) DO UPDATE SET content = $2, size_bytes = $3, updated_at = NOW()
           RETURNING id, file_path, content, size_bytes, updated_at`,
          [file.filePath, content, file.sizeBytes]
        );
        results.push({
          id: row.id,
          filePath: row.file_path,
          content: row.content,
          sizeBytes: row.size_bytes,
          updatedAt: row.updated_at,
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
        'SELECT id, file_path, size_bytes, updated_at FROM audit_files ORDER BY file_path'
      );
      res.json({
        files: rows.map((r: any) => ({
          id: r.id,
          filePath: r.file_path,
          content: '',
          sizeBytes: r.size_bytes,
          updatedAt: new Date(r.updated_at).getTime(),
        })),
        count: rows.length,
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
        'SELECT id, file_path, content, size_bytes, updated_at FROM audit_files WHERE id = $1',
        [id]
      );
      if (!row) return res.status(404).json({ error: 'Audit file not found' });
      res.json({
        id: row.id,
        filePath: row.file_path,
        content: row.content,
        sizeBytes: row.size_bytes,
        updatedAt: new Date(row.updated_at).getTime(),
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
          updatedAt: new Date(f.updatedAt).getTime(),
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
        'UPDATE audit_files SET content = $1, size_bytes = $2, updated_at = NOW() WHERE id = $3 RETURNING id, file_path, content, size_bytes, updated_at',
        [content, st.size, id]
      );
      res.json({
        id: updated.id,
        filePath: updated.file_path,
        content: updated.content,
        sizeBytes: updated.size_bytes,
        updatedAt: new Date(updated.updated_at).getTime(),
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
        `INSERT INTO user_preferences (user_id, key, value)
         VALUES ($1, $2, $3)
         ON CONFLICT (user_id, key) DO UPDATE SET value = $3, updated_at = NOW()`,
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
    try {
      const { id, tabId } = req.params;
      const { content } = req.body;
      await pool.query(
        `INSERT INTO system_info_tabs (system_id, tab_id, content)
         VALUES ($1, $2, $3)
         ON CONFLICT (system_id, tab_id) DO UPDATE SET content = $3, updated_at = NOW()`,
        [id, tabId, content || '']
      );
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
            'INSERT INTO systems (id, name, description, readme) VALUES ($1, $2, $3, $4) ON CONFLICT (id) DO NOTHING',
            [sys.id, sys.name, sys.description || '', sys.readme || null]
          );
          if (sys.folders) {
            for (const f of sys.folders) {
              await client.query(
                'INSERT INTO system_folders (id, system_id, name, category, note) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
                [f.id, sys.id, f.name, f.category, f.note || '']
              );
            }
          }
          if (sys.subsystems) {
            for (const sub of sys.subsystems) {
              await client.query(
                'INSERT INTO subsystems (id, system_id, name, description, readme, color) VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT (id) DO NOTHING',
                [sub.id, sys.id, sub.name, sub.description || '', sub.readme || null, sub.color || '#3B82F6']
              );
              if (sub.features) {
                for (const feat of sub.features) {
                  await client.query(
                    'INSERT INTO features (id, subsystem_id, name, description, readme) VALUES ($1, $2, $3, $4, $5) ON CONFLICT (id) DO NOTHING',
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
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT (id) DO NOTHING`,
            [r.id, r.systemId, r.subsystemId, r.featureId || null, r.title, r.description || '', r.status || 'Backlog', r.priority || 'Medium', r.startDate || null, r.completionDate || null]
          );
        }
      }
      if (workSessions && Array.isArray(workSessions)) {
        for (const ws of workSessions) {
          await client.query(
            `INSERT INTO work_sessions (id, parent_id, parent_type, parent_name, context, platform, model, outcome, status)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) ON CONFLICT (id) DO NOTHING`,
            [ws.id, ws.parentId, ws.parentType, ws.parentName || '', ws.context || '', ws.platform || '', ws.model || '', ws.outcome || null, ws.status || 'Pending']
          );
        }
      }
      // Migrate preferences
      if (preferences && typeof preferences === 'object') {
        for (const [key, value] of Object.entries(preferences)) {
          await client.query(
            `INSERT INTO user_preferences (user_id, key, value)
             VALUES ($1, $2, $3)
             ON CONFLICT (user_id, key) DO UPDATE SET value = $3`,
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
                `INSERT INTO system_info_tabs (system_id, tab_id, content)
                 VALUES ($1, $2, $3)
                 ON CONFLICT (system_id, tab_id) DO UPDATE SET content = $3`,
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

  return router;
}
