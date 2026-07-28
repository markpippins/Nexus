import { Router } from 'express';
import { query } from '../db.js';
import { pollEvents } from '../event-processor.js';
import { publishToNats } from '../nats-listener.js';
import { NotFoundError } from '../errors.js';

export const eventsRouter = Router();

// List events (optionally filter by event_type, source, or unconsumed)
eventsRouter.get('/', async (req, res, next) => {
  try {
    const { event_type, source, unconsumed, limit = 50 } = req.query;
    let sql = `SELECT id, event_type, subject, payload, source, created_at, consumed_at, metadata FROM wind.events WHERE 1=1`;
    const params = [];
    let idx = 1;

    if (event_type) {
      sql += ` AND event_type = $${idx++}`;
      params.push(event_type);
    }
    if (source) {
      sql += ` AND source = $${idx++}`;
      params.push(source);
    }
    if (unconsumed === 'true') {
      sql += ` AND consumed_at IS NULL`;
    }

    sql += ` ORDER BY created_at DESC LIMIT $${idx++}`;
    params.push(parseInt(limit, 10));

    const result = await query(sql, params);
    res.json(result.rows);
  } catch (err) { next(err); }
});

// Get event by ID
eventsRouter.get('/:id', async (req, res, next) => {
  try {
    const result = await query(
      `SELECT id, event_type, subject, payload, source, created_at, consumed_at, metadata FROM wind.events WHERE id = $1`,
      [req.params.id]
    );
    if (result.rows.length === 0) throw new NotFoundError('Event not found');
    res.json(result.rows[0]);
  } catch (err) { next(err); }
});

// Publish an event (for services that want to trigger workflows)
// Also broadcasts to NATS for real-time processing
eventsRouter.post('/', async (req, res, next) => {
  try {
    const { event_type, subject, payload, source, metadata } = req.body;
    if (!event_type || !subject || !source) {
      return res.status(400).json({ error: 'event_type, subject, and source are required' });
    }

    const result = await query(
      `INSERT INTO wind.events (event_type, subject, payload, source, metadata)
       VALUES ($1, $2, $3, $4, $5)
       RETURNING id, event_type, subject, payload, source, created_at`,
      [event_type, subject, JSON.stringify(payload || {}), source, JSON.stringify(metadata || {})]
    );

    // Broadcast to NATS for real-time processing
    publishToNats(event_type, subject, payload, source, metadata)
      .then(natsOk => {
        if (!natsOk) {
          console.log(`[events] Event ${result.rows[0].id.slice(0, 8)} not published to NATS — will be picked up by polling`);
        }
      })
      .catch(() => {});

    res.status(201).json(result.rows[0]);
  } catch (err) { next(err); }
});

// Trigger manual poll cycle (for testing)
eventsRouter.post('/poll', async (req, res, next) => {
  try {
    const results = await pollEvents();
    res.json({ processed: results.length, results });
  } catch (err) { next(err); }
});
