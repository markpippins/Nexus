-- V107: R-A-2026-08-15-010 (option c) — vision.wr_compile_verdicts
--
-- WR-scoped compile verdict store (WR_COMPILE_PASS/FAIL), keyed by the
-- compile unit's entityKey (D3: emission boundary owns entityKey). This is the
-- pre-release verdict that the D2/D5 WR-compile decoupling gate consults.
--
-- Placement rationale (ratified ruling):
--   * vision.receipts is REJECTED — frozen legacy write surface (D-T19-2(d)),
--     plan_id NOT NULL + sequence trigger. Pre-plan verdicts do not fit.
--   * execution.receipts is REJECTED — ADR-006 canonical governance projection,
--     request_id/attempt_id NOT NULL + FK. Verdicts are pre-attempt by
--     definition.
--   * A dedicated entityKey-keyed store keeps both frozen surfaces intact and
--     gives the newest-verdict gate its natural key.
--
-- Write path is INSERT-ONLY. The PRIMARY KEY is the deterministic verdict_id
-- (SHA256(type, entity_key, rule_version, description)) emitted by the
-- compile-pipeline path, so re-issuing the same verdict is naturally
-- idempotent (INSERT ... ON CONFLICT (verdict_id) DO NOTHING) — the same
-- pattern as peb.cir_violations (V106).
--
-- Immutability guard mirrors execution.receipts' immutable-evidence intent:
-- UPDATE/DELETE on verdict rows raise an exception.
--
-- Idempotent: CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS +
-- DROP TRIGGER IF EXISTS before CREATE TRIGGER.

BEGIN;

CREATE TABLE IF NOT EXISTS vision.wr_compile_verdicts (
    verdict_id   TEXT PRIMARY KEY,          -- SHA256(type, entity_key, rule_version, description)
    entity_key   TEXT NOT NULL,             -- compile-unit identity (D3)
    wr_id        TEXT,                      -- WR row link when present (nullable: pure-compile mode)
    plan_id      TEXT,                      -- re-parented at release via entityKey (D2 semantic)
    verdict_type TEXT NOT NULL CHECK (verdict_type IN ('WR_COMPILE_PASS','WR_COMPILE_FAIL')),
    rule_version TEXT NOT NULL,
    description  TEXT NOT NULL,
    detected_at  TIMESTAMPTZ,               -- compile event timestamp (deterministic)
    created_at   TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Newest-verdict gate lookup (D5): newest wins; FAIL blocks; PASS
-- release-eligible; no verdict = legacy unchanged.
CREATE INDEX IF NOT EXISTS idx_wr_compile_verdicts_entity_key
    ON vision.wr_compile_verdicts (entity_key, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_wr_compile_verdicts_wr_id
    ON vision.wr_compile_verdicts (wr_id);

CREATE INDEX IF NOT EXISTS idx_wr_compile_verdicts_plan
    ON vision.wr_compile_verdicts (plan_id);

-- Immutability guard — no UPDATE/DELETE on verdict rows.
CREATE OR REPLACE FUNCTION vision.wr_compile_verdicts_immutable()
RETURNS TRIGGER AS $$
BEGIN
    RAISE EXCEPTION 'vision.wr_compile_verdicts is immutable: % not allowed on verdict rows', TG_OP;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_wr_compile_verdicts_immutable ON vision.wr_compile_verdicts;
CREATE TRIGGER trg_wr_compile_verdicts_immutable
    BEFORE UPDATE OR DELETE ON vision.wr_compile_verdicts
    FOR EACH ROW
    EXECUTE FUNCTION vision.wr_compile_verdicts_immutable();

COMMIT;
