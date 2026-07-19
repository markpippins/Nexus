import { Router } from 'express';
import { pool } from '../db.js';

export const usersRouter = Router();

usersRouter.get('/', async (_req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, alias, email, avatar_url, created_at
       FROM assembly.users
       ORDER BY alias ASC`
    );

    const users = result.rows.map(row => ({
      id: row.id,
      name: row.alias,
      email: row.email || null,
      avatar: row.avatar_url || '',
      createdAt: new Date(row.created_at).toISOString(),
    }));

    res.json(users);
  } catch (err) {
    next(err);
  }
});

usersRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await pool.query(
      `SELECT id, alias, email, avatar_url, created_at
       FROM assembly.users
       WHERE id = $1`,
      [req.params.id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Not found' });
    }

    const row = result.rows[0];
    res.json({
      id: row.id,
      name: row.alias,
      email: row.email || null,
      avatar: row.avatar_url || '',
      createdAt: new Date(row.created_at).toISOString(),
    });
  } catch (err) {
    next(err);
  }
});
