import { Router } from 'express';
import { pool } from '../db.js';

export const healthRouter = Router();

healthRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        (SELECT COUNT(*)::int FROM shrapnel.field_type)            AS field_type_count,
        (SELECT COUNT(*)::int FROM shrapnel.field)                  AS field_count,
        (SELECT COUNT(*)::int FROM shrapnel.object_instance)        AS object_count,
        (SELECT COUNT(*)::int FROM shrapnel.value)                  AS value_count,
        (SELECT COUNT(*)::int FROM shrapnel.object_attribute_value) AS binding_count`
    );
    res.json({
      status: 'healthy',
      counts: result.rows[0],
    });
  } catch (err) {
    next(err);
  }
});
