-- Keychains event contract v1.
--
-- The source database owns this append-only event/outbox. Keychains consumes
-- committed rows and creates checkpoints only for checkpoint-eligible outcomes.
-- Source content is referenced by identity/read_set; it is not copied here.

CREATE TABLE IF NOT EXISTS resolution.keychain_event_outbox (
    id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    source_namespace text NOT NULL,
    source_event_id text NOT NULL,
    event_kind text NOT NULL,
    outcome text NOT NULL,
    schema_version integer NOT NULL DEFAULT 1,
    aggregate_id text,
    causation_id text,
    correlation_id text,
    actor text,
    contract_id text,
    evaluator_id text,
    law_id text,
    effective_at timestamptz,
    recorded_at timestamptz NOT NULL DEFAULT now(),
    read_set jsonb NOT NULL DEFAULT '{}'::jsonb,
    payload jsonb NOT NULL DEFAULT '{}'::jsonb,
    checkpoint_status text NOT NULL DEFAULT 'pending',
    delivery_attempts integer NOT NULL DEFAULT 0,
    claimed_at timestamptz,
    delivered_at timestamptz,
    last_error text,
    created_at timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT keychain_event_outbox_outcome_ck
        CHECK (outcome IN ('committed', 'refused', 'rejected', 'unknown', 'stale', 'failed')),
    CONSTRAINT keychain_event_outbox_checkpoint_status_ck
        CHECK (checkpoint_status IN ('pending', 'delivering', 'delivered', 'not_applicable', 'failed')),
    CONSTRAINT keychain_event_outbox_source_event_uq
        UNIQUE (source_namespace, source_event_id)
);

CREATE INDEX IF NOT EXISTS idx_keychain_event_outbox_pending
    ON resolution.keychain_event_outbox (checkpoint_status, recorded_at)
    WHERE checkpoint_status IN ('pending', 'failed');

COMMENT ON TABLE resolution.keychain_event_outbox IS
    'Append-only Keychains source events and delivery state; source authority remains Resolution/SOL.';
COMMENT ON COLUMN resolution.keychain_event_outbox.read_set IS
    'Stable identities, versions, hashes, cursors, and access scope available to the evaluator.';

-- Upgrade an already-created v1 table without rewriting event history.
ALTER TABLE resolution.keychain_event_outbox
    ADD COLUMN IF NOT EXISTS claimed_at timestamptz;
ALTER TABLE resolution.keychain_event_outbox
    DROP CONSTRAINT IF EXISTS keychain_event_outbox_checkpoint_status_ck;
ALTER TABLE resolution.keychain_event_outbox
    ADD CONSTRAINT keychain_event_outbox_checkpoint_status_ck
    CHECK (checkpoint_status IN ('pending', 'delivering', 'delivered', 'not_applicable', 'failed'));
