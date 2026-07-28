/**
 * NATS Listener — Real-time event bridge for Wind.
 *
 * Subscribes to NATS subjects and processes Wind events immediately.
 * Works alongside the PG polling loop (recovery path).
 *
 * Flow:
 *   1. Connect to NATS, subscribe to `nexus.wind.v1.events.>`
 *   2. On message, parse payload as event data
 *   3. Insert into wind.events (with consumed_at = NOW() since we're processing)
 *   4. Process the event immediately via processEvent()
 */

import { connect, StringCodec } from 'nats';
import { query } from './db.js';
import { processEvent } from './event-processor.js';

const SC = StringCodec();

const DEFAULT_NATS_URL = process.env.NATS_URL || 'nats://localhost:4222';
const WIND_SUBJECT_PREFIX = 'nexus.wind.v1.events';

let nc = null;
let sub = null;
let stopHandler = null;

/**
 * Start the NATS listener.
 * Subscribes to `nexus.wind.v1.events.>` and processes events in real-time.
 * Gracefully handles NATS being unavailable.
 */
export async function startNatsListener() {
  try {
    nc = await connect({ servers: DEFAULT_NATS_URL });
    console.log(`[nats-listener] Connected to ${DEFAULT_NATS_URL}`);

    // Subscribe to all wind events under the subject prefix
    sub = nc.subscribe(`${WIND_SUBJECT_PREFIX}.>`);

    console.log(`[nats-listener] Subscribed to ${WIND_SUBJECT_PREFIX}.>`);

    // Process messages as they arrive
    (async () => {
      for await (const msg of sub) {
        try {
          const payload = JSON.parse(SC.decode(msg.data));
          await handleNatsMessage(msg.subject, payload);
        } catch (err) {
          console.error(`[nats-listener] Error processing ${msg.subject}:`, err.message);
        }
      }
    })();

    return true;
  } catch (err) {
    console.warn(`[nats-listener] NATS unavailable (${err.message}) — falling back to polling only`);
    return false;
  }
}

/**
 * Handle an incoming NATS message.
 * Extracts event data, inserts into wind.events, and processes immediately.
 */
async function handleNatsMessage(subject, payload) {
  const eventType = payload.event_type;
  const subjectKey = payload.subject;
  const source = payload.source || 'nats-bridge';
  const eventPayload = payload.payload || {};
  const metadata = payload.metadata || { nats_subject: subject };

  if (!eventType || !subjectKey) {
    console.warn(`[nats-listener] Invalid event on ${subject}: missing event_type or subject`);
    return;
  }

  // Insert the event and mark consumed immediately
  const result = await query(
    `INSERT INTO wind.events (event_type, subject, payload, source, consumed_at, metadata)
     VALUES ($1, $2, $3, $4, clock_timestamp(), $5)
     RETURNING id, event_type, subject, created_at`,
    [eventType, subjectKey, JSON.stringify(eventPayload), source, JSON.stringify(metadata)]
  );

  const event = result.rows[0];
  console.log(`[nats-listener] Event ${event.id.slice(0, 8)} (${eventType}) → processing`);

  // Process immediately
  await processEvent(event);
}

/**
 * Publish a Wind event to NATS for real-time distribution.
 * Called from the POST /api/events handler.
 */
export async function publishToNats(eventType, subject, payload, source, metadata) {
  if (!nc) {
    // NATS not connected — event will be picked up by polling
    return false;
  }

  const natsSubject = `${WIND_SUBJECT_PREFIX}.${eventType}`;
  const message = {
    event_type: eventType,
    subject,
    payload,
    source,
    metadata: metadata || {},
    timestamp: new Date().toISOString(),
  };

  try {
    await nc.publish(natsSubject, SC.encode(JSON.stringify(message)));
    return true;
  } catch (err) {
    console.warn(`[nats-listener] Publish failed to ${natsSubject}:`, err.message);
    return false;
  }
}

/**
 * Stop the NATS listener gracefully.
 */
export async function stopNatsListener() {
  if (sub) {
    sub.unsubscribe();
    sub = null;
  }
  if (nc) {
    await nc.drain();
    await nc.close();
    nc = null;
    console.log('[nats-listener] Disconnected');
  }
}
