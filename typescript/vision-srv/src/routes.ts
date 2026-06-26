import { Request, Response, Router } from 'express';
import { Pool } from 'pg';
import { v4 as uuidv4 } from 'uuid';

export function createRoutes(pool: Pool): Router {
  const router = Router();

  // ════════════════════════════════════════════════════════════════
  //  WORK REQUESTS
  // ════════════════════════════════════════════════════════════════

  // GET /api/work-requests — list all active work requests
  router.get('/work-requests', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM work_requests ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // GET /api/work-requests/:id
  router.get('/work-requests/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rows: [row] } = await pool.query(
        'SELECT * FROM work_requests WHERE id = $1',
        [id]
      );
      if (!row) return res.status(404).json({ error: 'Work request not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // POST /api/work-requests
  router.post('/work-requests', async (req: Request, res: Response) => {
    try {
      const { wrId, intent, constraints, priority, context, status } = req.body;
      if (!intent) return res.status(400).json({ error: 'intent is required' });
      const finalWrId = wrId || uuidv4();
      const { rows: [row] } = await pool.query(
        `INSERT INTO work_requests (wr_id, intent, constraints, priority, context, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [
          finalWrId,
          intent,
          constraints || null,
          priority || 5,
          context || null,
          status || 'NEW',
        ]
      );
      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // PATCH /api/work-requests/:id
  router.patch('/work-requests/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { intent, constraints, priority, context, status } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;
      if (intent !== undefined) { sets.push(`intent = $${i++}`); vals.push(intent); }
      if (constraints !== undefined) { sets.push(`constraints = $${i++}`); vals.push(constraints); }
      if (priority !== undefined) { sets.push(`priority = $${i++}`); vals.push(priority); }
      if (context !== undefined) { sets.push(`context = $${i++}`); vals.push(context); }
      if (status !== undefined) { sets.push(`status = $${i++}`); vals.push(status); }
      if (sets.length === 0) return res.json({ ok: true });
      vals.push(id);
      const { rows: [row] } = await pool.query(
        `UPDATE work_requests SET ${sets.join(', ')} WHERE id = $${i} RETURNING *`,
        vals
      );
      if (!row) return res.status(404).json({ error: 'Work request not found' });
      res.json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // DELETE /api/work-requests/:id
  router.delete('/work-requests/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query(
        'DELETE FROM work_requests WHERE id = $1', [id]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Work request not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  BRANCHES
  // ════════════════════════════════════════════════════════════════

  router.get('/branches', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM branches ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/branches', async (req: Request, res: Response) => {
    try {
      const { branchId, wrId, parentBranchId, forkPoint, label, status } = req.body;
      if (!branchId || !wrId) return res.status(400).json({ error: 'branchId and wrId are required' });
      const { rows: [row] } = await pool.query(
        `INSERT INTO branches (branch_id, wr_id, parent_branch_id, fork_point, label, status)
         VALUES ($1, $2, $3, $4, $5, $6) RETURNING *`,
        [branchId, wrId, parentBranchId || null, forkPoint || null, label || null, status || 'active']
      );
      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  ARTIFACTS
  // ════════════════════════════════════════════════════════════════

  router.get('/artifacts', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query(
        'SELECT * FROM artifacts ORDER BY created_at DESC'
      );
      res.json(rows);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  router.post('/artifacts', async (req: Request, res: Response) => {
    try {
      const { artifactId, type, content, confidence, provenance, wrId, parentArtifactId, templateMetadata } = req.body;
      if (!type || !content) return res.status(400).json({ error: 'type and content are required' });
      const { rows: [row] } = await pool.query(
        `INSERT INTO artifacts (artifact_id, type, content, confidence, provenance, wr_id, parent_artifact_id, template_metadata)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING *`,
        [artifactId || undefined, type, content, confidence || null, provenance || null, wrId || null, parentArtifactId || null, templateMetadata || null]
      );
      res.status(201).json(row);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
