-- V106: T23 — peb.cir_violations (CIR-SDM data-level violation persistence)
--
-- Creates the durable store for CIR-SDM violations produced by
-- python/nexus_core/wrp/cir_sdm.py (T23 Step 4). The table mirrors the T09
-- violation record shape one-to-one:
--
--   (violation_id, cer_id, event_id, rule_id, rule_version, severity,
--    description, detected_at, blocking)
--
-- Placement rationale (T09 open item / architect recommendation): peb.
-- owns governance enforcement, so CIR violations live here — NOT in
-- semantics.drift_finding (that schema is inventory-drift semantics and is
-- not a fit for CIR).
--
-- Write path is INSERT-ONLY (no update/delete in normal operation). The
-- PRIMARY KEY is the deterministic violation_id emitted by cir_sdm.py, so
-- re-evaluating the same stream and re-persisting is naturally idempotent
-- (INSERT ... ON CONFLICT (violation_id) DO NOTHING).
--
-- detected_at is the *offending event's* timestamp (deterministic, produced by
-- the pure evaluator — never the persistence wall clock). created_at is the
-- persistence time (housekeeping). severity ∈ blocking|warning|info; blocking
-- is the enforcement flag (default FALSE = shadow/advisory mode, T23 Step 6).
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE SCHEMA IF NOT EXISTS.

BEGIN;

CREATE SCHEMA IF NOT EXISTS peb;

CREATE TABLE IF NOT EXISTS peb.cir_violations (
    violation_id TEXT PRIMARY KEY,
    cer_id       TEXT,
    event_id     TEXT NOT NULL,
    rule_id      TEXT NOT NULL,
    rule_version TEXT NOT NULL,
    severity     TEXT NOT NULL CHECK (severity IN ('blocking', 'warning', 'info')),
    description  TEXT NOT NULL,
    detected_at  TIMESTAMPTZ,
    blocking     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Lookup indexes for the enforcement/shadow-review queries.
CREATE INDEX IF NOT EXISTS idx_cir_violations_rule_id
    ON peb.cir_violations (rule_id);

CREATE INDEX IF NOT EXISTS idx_cir_violations_event_id
    ON peb.cir_violations (event_id);

CREATE INDEX IF NOT EXISTS idx_cir_violations_severity
    ON peb.cir_violations (severity);

CREATE INDEX IF NOT EXISTS idx_cir_violations_detected_at
    ON peb.cir_violations (detected_at);

COMMIT;
