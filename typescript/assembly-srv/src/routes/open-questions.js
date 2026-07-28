import { Router } from 'express';
import { fetchNebula, snakeToCamel } from '../utils/fetchNebula.js';
import { NotFoundError } from '../errors.js';

export const openQuestionsRouter = Router();

const nebulaUrl = (process.env.NEBULA_SRV_URL || 'http://localhost:3101') + '/api';

// GET / — paginated list of open questions
openQuestionsRouter.get('/', async (req, res, next) => {
  try {
    const { page = 1, pageSize = 100, entityType, entityId, requirementId, resolved } = req.query;
    const data = await fetchNebula('/open-questions', { page, pageSize, entityType, entityId, requirementId, resolved });
    res.json({
      items: (data.items || []).map(snakeToCamel),
      total: data.total || 0,
      page: data.page || 1,
      pageSize: data.pageSize || 100,
    });
  } catch (err) {
    next(err);
  }
});

// GET /:id — single open question
openQuestionsRouter.get('/:id', async (req, res, next) => {
  try {
    const data = await fetchNebula('/open-questions/' + req.params.id);
    if (!data) throw new NotFoundError('Not found');
    res.json(snakeToCamel(data));
  } catch (err) {
    next(err);
  }
});

// GET /:id/answers — list answers for a question
openQuestionsRouter.get('/:id/answers', async (req, res, next) => {
  try {
    const data = await fetchNebula('/open-questions/' + req.params.id + '/answers');
    res.json(data);
  } catch (err) {
    next(err);
  }
});

// POST /:id/answers — add an answer to a question
openQuestionsRouter.post('/:id/answers', async (req, res, next) => {
  try {
    const resp = await fetch(`${nebulaUrl}/open-questions/${req.params.id}/answers`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    next(err);
  }
});

// POST / — create a new open question
openQuestionsRouter.post('/', async (req, res, next) => {
  try {
    const resp = await fetch(`${nebulaUrl}/open-questions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body),
    });
    const data = await resp.json();
    res.status(resp.status).json(data);
  } catch (err) {
    next(err);
  }
});

// GET /:id/timeline — timeline events for a question
openQuestionsRouter.get('/:id/timeline', async (req, res, next) => {
  try {
    const data = await fetchNebula('/open-questions/' + req.params.id + '/timeline');
    res.json(data);
  } catch (err) {
    next(err);
  }
});
