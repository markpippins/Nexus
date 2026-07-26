import { Router } from 'express';
import { NotFoundError } from '../errors.js';
import { fetchNebula, snakeToCamel } from '../utils/fetchNebula.js';

export const intentsRouter = Router();

intentsRouter.get('/', async (req, res, next) => {
  try {
    const nebulaResponse = await fetchNebula('/intents', {
      page: req.query.page || '1',
      pageSize: req.query.pageSize || '100',
    });
    if (nebulaResponse.items) {
      nebulaResponse.items = nebulaResponse.items.map(snakeToCamel);
    }
    res.json(nebulaResponse);
  } catch (err) {
    next(err);
  }
});

intentsRouter.get('/:id', async (req, res, next) => {
  try {
    const nebulaResponse = await fetchNebula(`/intents/${req.params.id}`);
    if (!nebulaResponse || !nebulaResponse.id) {
      throw new NotFoundError('Not found');
    }
    res.json(snakeToCamel(nebulaResponse));
  } catch (err) {
    next(err);
  }
});
