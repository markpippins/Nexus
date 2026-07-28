-- V046: Wind Event Model — database-driven events for workflow triggering
-- Adds wind.events, wind.event_types, and dedup columns to wind.instances

BEGIN;

-- ═══════════════════════════════════════════════════════════════════
-- wind.event_types — The Registry
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wind.event_types (
  event_type TEXT PRIMARY KEY,
  description TEXT,
  schema JSONB,                                           -- payload schema (for later validation)
  workflow_id UUID REFERENCES wind.workflows(id),         -- which workflow to trigger
  dedup_key_template TEXT,                                -- JSON path to extract dedup key from payload
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

COMMENT ON TABLE wind.event_types IS 'Registry of event types and their associated workflows';
COMMENT ON COLUMN wind.event_types.dedup_key_template IS 'JSON path expression to extract dedup key from payload, e.g. $.harvest_id';
COMMENT ON COLUMN wind.event_types.workflow_id IS 'Workflow to trigger when this event occurs';

-- ═══════════════════════════════════════════════════════════════════
-- wind.events — The Event Log
-- ═══════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS wind.events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  event_type TEXT NOT NULL REFERENCES wind.event_types(event_type),
  subject TEXT NOT NULL,                                  -- routing key: 'harvest.{harvest_id}'
  payload JSONB NOT NULL DEFAULT '{}',                    -- the event data
  source TEXT NOT NULL,                                   -- which service produced it
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  consumed_at TIMESTAMPTZ,                                -- NULL = unconsumed
  metadata JSONB DEFAULT '{}'
);

COMMENT ON TABLE wind.events IS 'Event log — all events that can trigger workflows';
COMMENT ON COLUMN wind.events.subject IS 'Routing key for subject-based queries, e.g. harvest.4859a5c2';
COMMENT ON COLUMN wind.events.consumed_at IS 'NULL = unconsumed; set when Wind processes the event';

-- Hot path: find unconsumed events
CREATE INDEX IF NOT EXISTS idx_wind_events_unconsumed ON wind.events(created_at)
  WHERE consumed_at IS NULL;

-- Subject-based queries
CREATE INDEX IF NOT EXISTS idx_wind_events_subject ON wind.events(subject);

-- Event type queries
CREATE INDEX IF NOT EXISTS idx_wind_events_type ON wind.events(event_type);

-- Source queries (for debugging)
CREATE INDEX IF NOT EXISTS idx_wind_events_source ON wind.events(source, created_at);

-- ═══════════════════════════════════════════════════════════════════
-- wind.workflow_instances — Add Dedup Columns
-- ═══════════════════════════════════════════════════════════════════

-- Add dedup key and event reference to instances
ALTER TABLE wind.workflow_instances ADD COLUMN IF NOT EXISTS dedup_key TEXT;
ALTER TABLE wind.workflow_instances ADD COLUMN IF NOT EXISTS event_id UUID REFERENCES wind.events(id);

-- Unique constraint: one instance per dedup key per workflow version
CREATE UNIQUE INDEX IF NOT EXISTS idx_wind_workflow_instances_dedup
  ON wind.workflow_instances(workflow_version_id, dedup_key)
  WHERE dedup_key IS NOT NULL;

COMMENT ON COLUMN wind.workflow_instances.dedup_key IS 'Deduplication key — prevents duplicate instances for the same event';
COMMENT ON COLUMN wind.workflow_instances.event_id IS 'The event that triggered this instance';

-- ═══════════════════════════════════════════════════════════════════
-- Seed: Rover Stage 2 Event Type
-- ═══════════════════════════════════════════════════════════════════

INSERT INTO wind.event_types (event_type, description, workflow_id, dedup_key_template, enabled)
VALUES (
  'harvest.created',
  'A new harvest has been created and needs Stage 2 processing',
  'acf017b6-56fc-46a8-b9ee-beb54ff7b79e',  -- Rover Stage 2 Pipeline workflow
  '$.harvest_id',
  true
)
ON CONFLICT (event_type) DO NOTHING;

COMMIT;
