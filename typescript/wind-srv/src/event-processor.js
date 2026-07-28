/**
 * Wind Event Processor
 *
 * Polls wind.events for unconsumed events and triggers workflows.
 * Designed for both real-time (NATS bridge) and recovery (polling) paths.
 *
 * Flow:
 *   1. Find unconsumed events ordered by created_at
 *   2. Look up event_type → workflow_id from wind.event_types
 *   3. Compute dedup_key from payload using dedup_key_template
 *   4. Check if instance exists for this dedup_key + workflow_version
 *   5. If not, start a new instance with payload as input
 *   6. Mark event as consumed
 */

import { query } from './db.js';
import { DEFAULT_POLL_INTERVAL_MS, DEFAULT_BATCH_SIZE, DEFAULT_RECOVERY_LAG_MS } from './config.js';

const NEBULA_API_URL = process.env.NEBULA_API_URL || 'http://127.0.0.1:3101';

// Map Wind titles to Nebula role tags (case-insensitive, lowercased)
const TITLE_TO_ROLE_TAG = {
  'lead architect': 'to:architect',
  'architect': 'to:architect',
  'planner': 'to:planner',
  'builder': 'to:builder',
  'engineer': 'to:engineer',
  'reviewer': 'to:reviewer',
  'analyst': 'to:analyst',
  'inspector': 'to:inspector',
  'critic': 'to:critic',
};

// Map Wind titles to nebula-mcp roles (case-insensitive, lowercased)
const TITLE_TO_NEBULA_ROLE = {
  'lead architect': 'architect',
  'architect': 'architect',
  'planner': 'planner',
  'builder': 'builder',
  'engineer': 'engineer',
  'reviewer': 'reviewer',
  'analyst': 'analyst',
  'inspector': 'inspector',
  'critic': 'critic',
};

/**
 * Emit a nebula agent record to notify the assigned role about a new ticket.
 */
async function emitTicketNotification(ticket, node, titleName, taskName, instanceId, eventType) {
  try {
    const roleTag = TITLE_TO_ROLE_TAG[titleName.toLowerCase()] || `to:${titleName.toLowerCase()}`;
    const nebulaRole = TITLE_TO_NEBULA_ROLE[titleName.toLowerCase()] || titleName.toLowerCase();

    const record = {
      recordType: 'report',
      role: nebulaRole,
      title: `New Ticket: ${taskName}`,
      content: [
        `## Ticket Created: ${taskName}`,
        '',
        `A new workflow ticket has been assigned to you for processing.`,
        '',
        `| Field | Value |`,
        `|-------|-------|`,
        `| **Ticket ID** | \`${ticket.id}\` |`,
        `| **Task** | ${taskName} |`,
        `| **Node** | ${node.node_name || taskName} |`,
        `| **Trigger** | ${eventType} |`,
        `| **Instance** | \`${instanceId}\` |`,
        `| **Status** | PENDING |`,
        '',
        '### Next Steps',
        '',
        `1. Retrieve the ticket via \`wind-srv GET /api/tickets/${ticket.id}\``,
        `2. Check the input artifact for data`,
        `3. Process and advance the workflow`,
      ].join('\n'),
      tags: [roleTag, 'type:ticket', 'status:open', 'source:wind-workflow'],
      level: 1,
      visibilityScope: 'builder',
    };

    const response = await fetch(`${NEBULA_API_URL}/api/agent-records`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(record),
    });

    if (!response.ok) {
      const text = await response.text();
      console.warn(`[event-processor] Failed to emit notification for ticket ${ticket.id.slice(0, 8)}: ${response.status} ${text.slice(0, 100)}`);
    } else {
      const result = await response.json();
      console.log(`[event-processor] Notification sent to ${roleTag} for ticket ${ticket.id.slice(0, 8)} (record ${result.id.slice(0, 8)})`);
    }
  } catch (err) {
    // Don't let notification failure block event processing
    console.warn(`[event-processor] Notification error for ticket ${ticket.id.slice(0, 8)}:`, err.message);
  }
}

/**
 * Process a single unconsumed event.
 * Returns { consumed: true } on success, or { error: ... } on failure.
 */
export async function processEvent(event) {
  // 1. Look up event type config
  const etResult = await query(
    `SELECT event_type, workflow_id, dedup_key_template, enabled
     FROM wind.event_types WHERE event_type = $1`,
    [event.event_type]
  );

  if (etResult.rows.length === 0) {
    console.warn(`[event-processor] No event_type registered: ${event.event_type} (event ${event.id})`);
    return { consumed: false, error: 'unknown_event_type' };
  }

  const eventType = etResult.rows[0];

  if (!eventType.enabled) {
    console.warn(`[event-processor] Event type disabled: ${event.event_type} (event ${event.id})`);
    return { consumed: false, error: 'event_type_disabled' };
  }

  if (!eventType.workflow_id) {
    console.warn(`[event-processor] No workflow bound to event_type: ${event.event_type} (event ${event.id})`);
    return { consumed: false, error: 'no_workflow_bound' };
  }

  // 2. Compute dedup key from payload
  let dedupKey = null;
  if (eventType.dedup_key_template) {
    try {
      const payload = typeof event.payload === 'string' ? JSON.parse(event.payload) : event.payload;
      dedupKey = extractByJsonPath(payload, eventType.dedup_key_template);
      if (dedupKey !== null && dedupKey !== undefined) {
        dedupKey = `${event.event_type}_${String(dedupKey)}`;
      }
    } catch (err) {
      console.warn(`[event-processor] Failed to compute dedup key for event ${event.id}: ${err.message}`);
    }
  }

  // 3. Find the active workflow version for this workflow
  const wvResult = await query(
    `SELECT id FROM wind.workflow_versions
     WHERE workflow_id = $1 AND is_active = true
     LIMIT 1`,
    [eventType.workflow_id]
  );

  if (wvResult.rows.length === 0) {
    console.warn(`[event-processor] No active version for workflow ${eventType.workflow_id} (event ${event.id})`);
    return { consumed: false, error: 'no_active_workflow_version' };
  }

  const workflowVersionId = wvResult.rows[0].id;

  // 4. Check for existing instance with same dedup key
  if (dedupKey) {
    const existingResult = await query(
      `SELECT id, status FROM wind.workflow_instances
       WHERE workflow_version_id = $1 AND dedup_key = $2
       LIMIT 1`,
      [workflowVersionId, dedupKey]
    );

    if (existingResult.rows.length > 0) {
      console.log(`[event-processor] Instance already exists for dedup_key=${dedupKey} (event ${event.id})`);
      // Mark consumed but don't start — dedup already handled
      await query(
        `UPDATE wind.events SET consumed_at = clock_timestamp() WHERE id = $1`,
        [event.id]
      );
      return { consumed: true, deduped: true, existing_instance_id: existingResult.rows[0].id };
    }
  }

  // 5. Start a new instance
  const instResult = await query(
    `INSERT INTO wind.workflow_instances (workflow_version_id, status, dedup_key, event_id)
     VALUES ($1, 'ACTIVE', $2, $3)
     RETURNING id, workflow_version_id, status, created_at`,
    [workflowVersionId, dedupKey, event.id]
  );

  const instance = instResult.rows[0];

  // 6. Find entrypoint nodes and create tickets
  const entryResult = await query(
    `SELECT id, task_id FROM wind.workflow_nodes
     WHERE workflow_version_id = $1 AND is_entrypoint = true`,
    [workflowVersionId]
  );

  const tickets = [];
  if (entryResult.rows.length === 0) {
    console.warn(`[event-processor] No entrypoint node in workflow version ${workflowVersionId}`);
    await query(
      `UPDATE wind.workflow_instances SET status = 'FAILED', updated_at = clock_timestamp() WHERE id = $1`,
      [instance.id]
    );
  } else {
    for (const node of entryResult.rows) {
      const taskResult = await query(
        'SELECT t.title_id, t.name AS task_name FROM wind.tasks t WHERE t.id = $1',
        [node.task_id]
      );
      if (taskResult.rows.length === 0) continue;
      const { title_id, task_name } = taskResult.rows[0];

      const ticketResult = await query(
        `INSERT INTO wind.tickets
         (workflow_instance_id, workflow_version_id, node_id, node_task_id, assigned_title_id,
          input_artifact_type, input_artifact_id, status)
         VALUES ($1, $2, $3, $4, $5, 'event_trigger', $6, 'PENDING')
         RETURNING id, status, created_at`,
        [instance.id, workflowVersionId, node.id, node.task_id,
         title_id, event.id]
      );
      tickets.push(ticketResult.rows[0]);

      // Emit agent record notification for the assigned role
      const titleNameResult = await query(
        'SELECT display_name FROM wind.titles WHERE id = $1',
        [title_id]
      );
      const titleName = titleNameResult.rows[0]?.display_name || 'unknown';
      emitTicketNotification(
        ticketResult.rows[0], node, titleName,
        task_name, instance.id, event.event_type
      );
    }
  }

  // 7. Mark event as consumed
  await query(
    `UPDATE wind.events SET consumed_at = clock_timestamp() WHERE id = $1`,
    [event.id]
  );

  console.log(`[event-processor] Event ${event.id} (${event.event_type}) → instance ${instance.id} with ${tickets.length} tickets`);

  return { consumed: true, instance_id: instance.id, tickets: tickets.length };
}

/**
 * Poll for unconsumed events and process them.
 * Events younger than RECOVERY_LAG_MS are skipped to allow real-time path priority.
 */
export async function pollEvents() {
  const now = new Date();
  const lagTime = new Date(now.getTime() - DEFAULT_RECOVERY_LAG_MS).toISOString();

  const result = await query(
    `SELECT id, event_type, subject, payload, source, created_at
     FROM wind.events
     WHERE consumed_at IS NULL
       AND created_at < $1  -- skip recent events (real-time path priority)
     ORDER BY created_at ASC
     LIMIT $2
     FOR UPDATE SKIP LOCKED`,
    [lagTime, DEFAULT_BATCH_SIZE]
  );

  if (result.rows.length === 0) return [];

  const results = [];
  for (const event of result.rows) {
    try {
      const outcome = await processEvent(event);
      results.push({ event_id: event.id, ...outcome });
    } catch (err) {
      console.error(`[event-processor] Error processing event ${event.id}:`, err.message);
      results.push({ event_id: event.id, error: err.message });
    }
  }

  return results;
}

/**
 * Start the event processor polling loop.
 * Runs in the background, checking for unconsumed events on a timer.
 */
export function startEventProcessor() {
  console.log(`[event-processor] Starting (interval=${DEFAULT_POLL_INTERVAL_MS}ms, batch=${DEFAULT_BATCH_SIZE}, recovery_lag=${DEFAULT_RECOVERY_LAG_MS}ms)`);

  const interval = setInterval(async () => {
    try {
      const results = await pollEvents();
      if (results.length > 0) {
        console.log(`[event-processor] Processed ${results.length} events`);
      }
    } catch (err) {
      console.error('[event-processor] Poll cycle failed:', err.message);
    }
  }, DEFAULT_POLL_INTERVAL_MS);

  // Allow graceful shutdown
  return () => clearInterval(interval);
}

/**
 * Simple JSON path extractor.
 * Supports dot-notation paths like $.harvest_id, $.payload.id
 */
function extractByJsonPath(obj, template) {
  // Strip leading $. if present
  const path = template.replace(/^\$\.?/, '');
  if (!path) return null;

  const parts = path.split('.');
  let current = obj;
  for (const part of parts) {
    if (current === null || current === undefined) return null;
    current = current[part];
  }
  return current !== undefined ? current : null;
}
