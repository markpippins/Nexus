-- V123: governance_threshold — WITHDRAWN AS DDL; converted to seed-only.
--
-- DISCOVERY (2026-08-24, on apply): resolution.governance_threshold already
-- exists with the immutable-temporal shape the ruling 64392cdc requires
-- (UNIQUE(name, effective_from DESC); active = latest effective_from <= now()).
-- It was found EMPTY, so this migration seeds the current de-facto bar so
-- promotion_gate.load_min_readiness() reads from-table instead of falling
-- back to its compiled default.

INSERT INTO resolution.governance_threshold (name, value, effective_from, description)
VALUES ('promotion_min_readiness', 0.7, now(),
        'Seed of pre-existing literal from promotion_gate.py; future changes are auditable inserts.')
ON CONFLICT (name, effective_from) DO NOTHING;
