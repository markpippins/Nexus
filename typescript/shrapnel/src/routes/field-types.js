import { Router } from 'express';
import { pool } from '../db.js';

export const fieldTypesRouter = Router();

fieldTypesRouter.get('/', async (_req, res, next) => {
  try {
    const r = await pool.query(
      `SELECT code, name, description, pg_type FROM shrapnel.field_type ORDER BY code`
    );
    res.json({ field_types: r.rows });
  } catch (err) {
    next(err);
  }
});

fieldTypesRouter.get('/:code', async (req, res, next) => {
  try {
    const code = Number(req.params.code);
    if (!Number.isInteger(code)) {
      return res.status(400).json({ error: { message: 'code must be an integer 1..7' } });
    }
    const r = await pool.query(
      `SELECT code, name, description, pg_type FROM shrapnel.field_type WHERE code = $1`,
      [code]
    );
    if (r.rowCount === 0) return res.status(404).json({ error: { message: 'not_found' } });
    res.json({ field_type: r.rows[0] });
  } catch (err) {
    next(err);
  }
});
