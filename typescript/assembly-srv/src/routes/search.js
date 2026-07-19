import { Router } from 'express';
import { pool } from '../db.js';

export const searchRouter = Router();

searchRouter.get('/', async (req, res, next) => {
  try {
    const q = String(req.query.q || '').trim();
    if (!q || q.length < 2) {
      return res.json({ query: q, results: [] });
    }

    const pattern = `%${q}%`;
    const limit = 20;

    const [forumResult, workRequestResult, requirementResult, agentRecordResult, openQuestionResult] = await Promise.all([
      pool.query(
        `SELECT id, name, slug, description
         FROM assembly.forums
         WHERE name ILIKE $1 OR description ILIKE $1 OR slug ILIKE $1
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, status
         FROM nebula.work_requests
         WHERE title ILIKE $1 OR description ILIKE $1 OR status ILIKE $1
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, status
         FROM nebula.requirements
         WHERE title ILIKE $1 OR description ILIKE $1 OR status ILIKE $1
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, record_type, role, title, content
         FROM nebula.agent_records
         WHERE title ILIKE $1 OR content ILIKE $1 OR role ILIKE $1
         LIMIT $2`,
        [pattern, limit]
      ),
      pool.query(
        `SELECT id, title, description, status
         FROM nebula.open_questions
         WHERE title ILIKE $1 OR description ILIKE $1
         LIMIT $2`,
        [pattern, limit]
      ),
    ]);

    const results = [
      ...forumResult.rows.map(row => ({
        type: 'forum',
        id: row.id,
        title: row.name,
        description: row.description || '',
        href: `/forums/${row.slug}`,
      })),
      ...workRequestResult.rows.map(row => ({
        type: 'work-request',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/work-requests/${row.id}`,
      })),
      ...requirementResult.rows.map(row => ({
        type: 'requirement',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/requirements/${row.id}`,
      })),
      ...agentRecordResult.rows.map(row => ({
        type: 'agent-record',
        id: row.id,
        title: row.title,
        description: row.content ? row.content.slice(0, 200) : '',
        role: row.role,
        recordType: row.record_type,
        href: `/agent-records/${row.id}`,
      })),
      ...openQuestionResult.rows.map(row => ({
        type: 'open-question',
        id: row.id,
        title: row.title,
        description: row.description || '',
        status: row.status,
        href: `/open-questions/${row.id}`,
      })),
    ];

    res.json({ query: q, results });
  } catch (err) {
    next(err);
  }
});
