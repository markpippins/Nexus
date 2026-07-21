import { Router } from 'express';
import { pool, withTransaction } from '../db.js';
import { encodePayload, decodeObject } from '../lib/encode.js';

export const objectsRouter = Router();

// GET /api/objects?limit=&offset=&decode=false
objectsRouter.get('/', async (req, res, next) => {
  try {
    const limit  = Math.min(500, Math.max(1,  parseInt(req.query.limit  ?? '100', 10) || 100));
    const offset = Math.max(0, parseInt(req.query.offset ?? '0', 10) || 0);
    const decode = String(req.query.decode ?? 'false').toLowerCase() === 'true';

    const r = await pool.query(
      `SELECT id, created_at FROM shrapnel.object_instance ORDER BY id DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    if (!decode) {
      return res.json({ objects: r.rows });
    }

    // With ?decode=true, fetch each object's decoded JSON in parallel.
    const objects = [];
    for (const row of r.rows) {
      const decoded = await decodeObject(pool, row.id);
      objects.push({ id: row.id, created_at: row.created_at, values: decoded });
    }
    res.json({ objects });
  } catch (err) {
    next(err);
  }
});

// GET /api/objects/:id  -> decode the object to JSON
objectsRouter.get('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: { message: 'id must be integer' } });
    const check = await pool.query(
      `SELECT id, created_at FROM shrapnel.object_instance WHERE id = $1`,
      [id]
    );
    if (check.rowCount === 0) return res.status(404).json({ error: { message: 'not_found' } });
    const decoded = await decodeObject(pool, id);
    res.json({
      object: {
        id: check.rows[0].id,
        created_at: check.rows[0].created_at,
        values: decoded,
      },
    });
  } catch (err) {
    next(err);
  }
});

// POST /api/objects
// Body: { fields: [...], values: { ... } } OR just { ...values... } (values-only form)
// Returns: { object_id, fields }
objectsRouter.post('/', async (req, res, next) => {
  try {
    const result = await withTransaction(async (client) => {
      return encodePayload(client, req.body);
    });
    res.status(201).json({ object_id: result.object_id, fields: result.fields });
  } catch (err) {
    next(err);
  }
});

// DELETE /api/objects/:id  -> cascade-deletes object + values + bindings
objectsRouter.delete('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: { message: 'id must be integer' } });
    const r = await pool.query(
      `DELETE FROM shrapnel.object_instance WHERE id = $1 RETURNING id`,
      [id]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: { message: 'not_found' } });
    res.json({ deleted: r.rows[0].id });
  } catch (err) {
    next(err);
  }
});

// GET /api/objects/:id/values  -> raw (field, value) bindings
objectsRouter.get('/:id/values', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    if (!Number.isInteger(id)) return res.status(400).json({ error: { message: 'id must be integer' } });
    const r = await pool.query(
      `SELECT f.id AS field_id, f.property_name, f.label, f.name, f.field_type_code,
              oav.value_id, oav.created_at AS bound_at
       FROM shrapnel.object_attribute_value oav
       JOIN shrapnel.field f ON f.id = oav.field_id
       WHERE oav.object_id = $1
       ORDER BY f.field_index, f.id`,
      [id]
    );
    if (r.rowCount === 0) {
      // Distinguish "no such object" from "object has no bindings"
      const chk = await pool.query(
        `SELECT id FROM shrapnel.object_instance WHERE id = $1`, [id]
      );
      if (chk.rowCount === 0) {
        return res.status(404).json({ error: { message: 'not_found' } });
      }
    }
    res.json({ object_id: id, values: r.rows });
  } catch (err) {
    next(err);
  }
});
