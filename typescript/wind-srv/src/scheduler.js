/**
 * Wind Scheduler
 *
 * Runs periodic ticks (every 30 min) that pick one unprocessed harvest
 * and emit a `harvest.created` event to trigger the Rover Stage 2 workflow.
 *
 * This is the "timer for rover" — throttled to one transcript per tick
 * so each harvest gets processed deliberately without flooding the pipeline.
 */

import { query } from './db.js';

/** 30 minutes in milliseconds */
const ROVER_TICK_INTERVAL_MS = 30 * 60 * 1_000;

/**
 * Pick the single oldest harvest that hasn't yet triggered a `harvest.created`
 * event, and emit that event into wind.events.
 *
 * Returns the event id if one was created, or null if no harvests are pending.
 */
export async function tickRover() {
  // 1. Find one unprocessed harvest (oldest first, no existing event)
  const harvestResult = await query(
    `SELECT h.id, h.source_filename
     FROM nebula.harvests h
     WHERE NOT EXISTS (
       SELECT 1 FROM wind.events e
       WHERE e.event_type = 'harvest.created'
         AND e.payload->>'harvest_id' = h.id::text
     )
     ORDER BY h.created_at ASC
     LIMIT 1
     FOR UPDATE OF h SKIP LOCKED`,
    []
  );

  if (harvestResult.rows.length === 0) {
    console.log('[scheduler] No unprocessed harvests found — all caught up');
    return null;
  }

  const harvest = harvestResult.rows[0];

  // 2. Create the harvest.created event
  const eventResult = await query(
    `INSERT INTO wind.events (event_type, subject, payload, source, metadata)
     VALUES ($1, $2, $3, $4, $5)
     RETURNING id`,
    [
      'harvest.created',
      `harvest.${harvest.id}`,
      JSON.stringify({
        harvest_id: harvest.id,
        source_filename: harvest.source_filename,
      }),
      'wind-scheduler',
      JSON.stringify({ tick_source: 'rover_timer' }),
    ]
  );

  const eventId = eventResult.rows[0].id;
  console.log(
    `[scheduler] Rover tick → event ${eventId.slice(0, 8)} ` +
    `(harvest ${harvest.id.slice(0, 8)}: ${harvest.source_filename})`
  );

  // 3. Publish to NATS for the real-time path (if NATS bridge is running)
  try {
    const { publishToNats } = await import('./nats-listener.js');
    if (publishToNats) {
      await publishToNats({
        id: eventId,
        event_type: 'harvest.created',
        subject: `harvest.${harvest.id}`,
        payload: {
          harvest_id: harvest.id,
          source_filename: harvest.source_filename,
        },
        source: 'wind-scheduler',
        metadata: { tick_source: 'rover_timer' },
      });
    }
  } catch {
    // NATS bridge may not be loaded — this is non-fatal
  }

  return eventId;
}

/**
 * Start the Rover scheduler loop.
 * Runs every 30 minutes, picks one harvest per tick.
 * Returns a shutdown function.
 */
export function startRoverScheduler() {
  console.log(`[scheduler] Starting Rover timer (interval=${ROVER_TICK_INTERVAL_MS}ms = 30min)`);

  // Fire immediately on start so we don't wait a full cycle
  tickRover().catch(err => {
    console.error('[scheduler] Initial Rover tick failed:', err.message);
  });

  const interval = setInterval(async () => {
    try {
      await tickRover();
    } catch (err) {
      console.error('[scheduler] Rover tick failed:', err.message);
    }
  }, ROVER_TICK_INTERVAL_MS);

  return () => {
    clearInterval(interval);
    console.log('[scheduler] Rover timer stopped');
  };
}
