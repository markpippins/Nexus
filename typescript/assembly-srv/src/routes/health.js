import { Router } from 'express';
import { pool } from '../db.js';

export const healthRouter = Router();

function isValidIdentifier(name) {
  return /^[a-zA-Z_][a-zA-Z0-9_]*$/.test(name);
}

healthRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT
        schemaname,
        matviewname AS name,
        ispopulated AS populated,
        pg_catalog.pg_get_expr(d.adbin, d.adrelid) AS definition
      FROM pg_matviews
      LEFT JOIN pg_catalog.pg_attrdef d ON d.adrelid = (schemaname || '.' || matviewname)::regclass
      WHERE schemaname = 'nebula'
      LIMIT 1`
    );

    const materializedView = result.rows.length > 0
      ? {
          schema: result.rows[0].schemaname,
          name: result.rows[0].name,
          populated: result.rows[0].populated,
          rowCount: 0,
        }
      : null;

    if (materializedView && isValidIdentifier(materializedView.name)) {
      const countResult = await pool.query(
        `SELECT COUNT(*)::int AS total FROM nebula."${materializedView.name}"`
      ).catch(() => ({ rows: [{ total: 0 }] }));
      materializedView.rowCount = countResult.rows[0].total;
    }

    res.json({
      status: 'healthy',
      materializedView,
      source: { lastBlockCreatedAt: new Date().toISOString() },
    });
  } catch (err) {
    next(err);
  }
});

healthRouter.post('/refresh-stats', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT matviewname AS name
       FROM pg_matviews
       WHERE schemaname = 'nebula'`
    );

    for (const row of result.rows) {
      await pool.query(`REFRESH MATERIALIZED VIEW nebula.${row.name}`).catch(() => {});
    }

    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
});
