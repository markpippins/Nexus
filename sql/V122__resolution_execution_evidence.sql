-- V122: resolution.execution_evidence — provenance rows for gate preflight checks
-- Ruling 64392cdc: execution_evidence gets its OWN resolution table.
-- Scope item: kiro survey #4 Gap A (2f1202a / todo e7451e65 item 1).
-- Writers MUST treat this as append-only provenance; no updates.

CREATE SCHEMA IF NOT EXISTS resolution;

CREATE TABLE IF NOT EXISTS resolution.execution_evidence (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    context_kind   text NOT NULL,                -- e.g. 'provenance'
    source_system  text NOT NULL,                -- e.g. 'assembly-srv'
    evidence_kind  text NOT NULL,                -- e.g. 'http_preflight'
    subject_ref    text,                         -- batch_id / candidate id / thread id
    payload        jsonb NOT NULL DEFAULT '{}'::jsonb,
    recorded_at    timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_exec_evidence_subject
    ON resolution.execution_evidence (subject_ref, recorded_at DESC);
CREATE INDEX IF NOT EXISTS idx_exec_evidence_kind
    ON resolution.execution_evidence (evidence_kind, recorded_at DESC);

COMMENT ON TABLE resolution.execution_evidence IS
    'Append-only provenance/evidence rows produced by governed preflight checks (gate hardening, 2026-08-24).';
