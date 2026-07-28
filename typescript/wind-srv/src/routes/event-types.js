import { Router } from 'express';
import { query } from '../db.js';
import { NotFoundError, BadRequestError } from '../errors.js';

export const eventTypesRouter = Router();

// List all event types
eventTypesRouter.get('/', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT et.event_type, et.description, et.schema, et.workflow_id, et.dedup_key_template,
              et.enabled, et.created_at, w.name AS workflow_name
       FROM wind.event_types et
       LEFT JOIN wind.workflows w ON et.workflow_id = w.id
       ORDER BY et.event_type`
    );
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Get event type by event_type string
eventTypesRouter.get('/:eventType', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT et.event_type, et.description, et.schema, et.workflow_id, et.dedup_key_template,
              et.enabled, et.created_at, w.name AS workflow_name
       FROM wind.event_types et
       LEFT JOIN wind.workflows w ON et.workflow_id = w.id
       WHERE et.event_type = $1`,
      [req.params.eventType]
    );
    if (result.rows.length === 0) throw new NotFoundError('Event type not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// Register a new event type
eventTypesRouter.post('/', async (req, res, next) => {
  try {
    const { event_type, description, workflow_id, dedup_key_template, enabled } = req.body;
    if (!event_type) throw new BadRequestError('event_type is required');

    const result = await query(
      `INSERT INTO wind.event_types (event_type, description, workflow_id, dedup_key_template, enabled)
       VALUES ($1, $2, $3, $4, $5)
       ON CONFLICT (event_type) DO UPDATE SET
         description = EXCLUDED.description,
         workflow_id = EXCLUDED.workflow_id,
         dedup_key_template = EXCLUDED.dedup_key_template,
         enabled = EXCLUDED.enabled
       RETURNING event_type, description, workflow_id, dedup_key_template, enabled, created_at`,
      [event_type, description || null, workflow_id || null, dedup_key_template || null, enabled !== false]
    );

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// Delete an event type
eventTypesRouter.delete('/:eventType', async (req, res, next) => {
  try {
    const result = await query(
      'DELETE FROM wind.event_types WHERE event_type = $1 RETURNING event_type',
      [req.params.eventType]
    );
    if (result.rows.length === 0) throw new NotFoundError('Event type not found');
    res.json({ deleted: result.rows[0].event_type });
  } catch (err) { next(err); }
});
