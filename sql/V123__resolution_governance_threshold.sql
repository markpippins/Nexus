-- V123: resolution.governance_threshold — immutable-temporal readiness bars
-- Ruling 64392cdc: thresholds are immutable-temporal ((name,value,effective_from));
-- the ACTIVE value for a name is the row with the greatest effective_from <= now().
-- Replaces the hardcoded 0.7 literal in promotion_gate (kiro #4 Gap B).
-- Threshold CHANGES are inserts (auditable decisions), never updates.

CREATE SCHEMA IF NOT EXISTS resolution;

CREATE TABLE IF NOT EXISTS resolution.governance_threshold (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name            text NOT NULL,
    value           numeric NOT NULL,
    unit            text NOT NULL DEFAULT 'ratio',
    rationale       text,
    decided_by      text,
    effective_from  timestamptz NOT NULL DEFAULT now(),
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (name, effective_from)
);

CREATE INDEX IF NOT EXISTS idx_gov_threshold_name_eff
    ON resolution.governance_threshold (name, effective_from DESC);

-- Seed the current de-facto bar so behavior is unchanged on deploy.
INSERT INTO resolution.governance_threshold (name, value, unit, rationale, decided_by)
VALUES ('promotion_min_readiness', 0.7, 'ratio',
        'Seed of pre-existing literal from promotion_gate.py; makes future changes auditable.',
        'V123 migration')
ON CONFLICT (name, effective_from) DO NOTHING;

COMMENT ON TABLE resolution.governance_threshold IS
    'Immutable-temporal governance thresholds; active value = latest effective_from <= now().';
