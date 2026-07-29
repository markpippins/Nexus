import { Request, Response, Router } from 'express';
import { Pool } from 'pg';

export interface Link {
  id: string;
  address: string;
  imagename: string;
  text: string | null;
  type: 'link' | 'separator';
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export function createRoutes(pool: Pool): Router {
  const router = Router();

  // ════════════════════════════════════════════════════════════════
  //  LIST — GET /api/links
  // ════════════════════════════════════════════════════════════════
  router.get('/links', async (_req: Request, res: Response) => {
    try {
      const { rows } = await pool.query<Link>(
        'SELECT id, address, imagename, text, type, sort_order, created_at, updated_at FROM throttler.links ORDER BY sort_order ASC'
      );
      res.json(rows.map(r => ({
        id: r.id,
        address: r.address,
        imagename: r.imagename,
        text: r.text,
        type: r.type,
        sortOrder: r.sort_order,
        createdAt: r.created_at,
        updatedAt: r.updated_at,
      })));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  CREATE — POST /api/links
  // ════════════════════════════════════════════════════════════════
  router.post('/links', async (req: Request, res: Response) => {
    try {
      const { address, imagename, text = null, type = 'link', sortOrder } = req.body;
      if (type === 'link' && (!address || !imagename)) {
        return res.status(400).json({ error: 'address and imagename are required for type=link' });
      }
      if (type !== 'link' && type !== 'separator') {
        return res.status(400).json({ error: 'type must be "link" or "separator"' });
      }
      const nextOrder = sortOrder ?? ((await pool.query('SELECT COALESCE(MAX(sort_order), 0) + 1 AS n FROM throttler.links')).rows[0].n);
      const { rows: [link] } = await pool.query<Link>(
        `INSERT INTO throttler.links (address, imagename, text, type, sort_order)
         VALUES ($1, $2, $3, $4, $5) RETURNING id, address, imagename, text, type, sort_order, created_at, updated_at`,
        [address || '', imagename || '', text, type, nextOrder]
      );
      res.status(201).json({
        id: link.id,
        address: link.address,
        imagename: link.imagename,
        text: link.text,
        type: link.type,
        sortOrder: link.sort_order,
        createdAt: link.created_at,
        updatedAt: link.updated_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  REORDER — PATCH /api/links/reorder  (MUST come before /:id!)
  // ════════════════════════════════════════════════════════════════
  router.patch('/links/reorder', async (req: Request, res: Response) => {
    const client = await pool.connect();
    try {
      const { items } = req.body;
      if (!Array.isArray(items)) {
        return res.status(400).json({ error: 'items array is required' });
      }
      await client.query('BEGIN');
      for (const item of items) {
        await client.query(
          'UPDATE throttler.links SET sort_order = $1 WHERE id = $2::uuid',
          [item.sortOrder, item.id]
        );
      }
      await client.query('COMMIT');

      // Return the updated list
      const { rows } = await pool.query<Link>(
        'SELECT id, address, imagename, text, type, sort_order, created_at, updated_at FROM throttler.links ORDER BY sort_order ASC'
      );
      res.json(rows.map(r => ({
        id: r.id, address: r.address, imagename: r.imagename, text: r.text,
        type: r.type, sortOrder: r.sort_order, createdAt: r.created_at, updatedAt: r.updated_at,
      })));
    } catch (err: any) {
      await client.query('ROLLBACK');
      res.status(500).json({ error: err.message });
    } finally {
      client.release();
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  UPDATE — PATCH /api/links/:id
  // ════════════════════════════════════════════════════════════════
  router.patch('/links/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { address, imagename, text, type, sortOrder } = req.body;
      const sets: string[] = [];
      const vals: any[] = [];
      let i = 1;

      if (type !== undefined && type !== 'link' && type !== 'separator') {
        return res.status(400).json({ error: 'type must be "link" or "separator"' });
      }

      if (address !== undefined) { sets.push(`address = $${i++}`); vals.push(address); }
      if (imagename !== undefined) { sets.push(`imagename = $${i++}`); vals.push(imagename); }
      if (text !== undefined) { sets.push(`text = $${i++}`); vals.push(text); }
      if (type !== undefined) { sets.push(`type = $${i++}`); vals.push(type); }
      if (sortOrder !== undefined) { sets.push(`sort_order = $${i++}`); vals.push(sortOrder); }

      if (sets.length === 0) return res.json({ ok: true });

      sets.push(`updated_at = now()`);
      vals.push(id);

      const { rows: [link] } = await pool.query<Link>(
        `UPDATE throttler.links SET ${sets.join(', ')} WHERE id = $${i}::uuid
         RETURNING id, address, imagename, text, type, sort_order, created_at, updated_at`,
        vals
      );
      if (!link) return res.status(404).json({ error: 'Link not found' });
      res.json({
        id: link.id,
        address: link.address,
        imagename: link.imagename,
        text: link.text,
        type: link.type,
        sortOrder: link.sort_order,
        createdAt: link.created_at,
        updatedAt: link.updated_at,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // ════════════════════════════════════════════════════════════════
  //  DELETE — DELETE /api/links/:id
  // ════════════════════════════════════════════════════════════════
  router.delete('/links/:id', async (req: Request, res: Response) => {
    try {
      const { id } = req.params;
      const { rowCount } = await pool.query(
        'DELETE FROM throttler.links WHERE id = $1::uuid',
        [id]
      );
      if (rowCount === 0) return res.status(404).json({ error: 'Link not found' });
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return router;
}
