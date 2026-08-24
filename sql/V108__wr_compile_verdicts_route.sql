-- V108: CP-9 review (a5f096e9) — add `route` to vision.wr_compile_verdicts
--
-- The D5 bootstrap gate could not distinguish PASS+reserved from
-- PASS+conduit because the verdict store (V107) had no route column. A PASS
-- verdict on a reserved (R3/R4) route therefore auto-emitted a builder ticket
-- — the exact behavior R-A-003 forbids ("R3/R4 → never auto-armed; explicit
-- Architect/human release only").
--
-- This appends a nullable `route` column (classification.route:
-- conduit | conduit-review | reserved). The bootstrap gate blocks on
-- verdict_type = 'WR_COMPILE_FAIL' OR route = 'reserved'. Nullable so that
-- pre-V108 verdicts and route-less issue_compile_verdict calls remain legacy
-- (no route = not reserved, legacy behavior unchanged).
--
-- Append-only (V107 is landed; do not rewrite). Idempotent:
-- ADD COLUMN IF NOT EXISTS.

BEGIN;

ALTER TABLE vision.wr_compile_verdicts
    ADD COLUMN IF NOT EXISTS route TEXT;   -- classification.route

COMMENT ON COLUMN vision.wr_compile_verdicts.route IS
    'classification.route (conduit | conduit-review | reserved); the D5 bootstrap gate blocks PASS verdicts when reserved';

COMMIT;
