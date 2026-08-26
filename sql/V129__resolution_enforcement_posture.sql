-- V129: resolution.enforcement_posture — CIR-SDM enforcement posture rows
-- ========================================================================
-- Per RULING R-D (record 2487aef3, 2026-08-25): the CIR-SDM enforcement
-- posture (enforced set / shadow / per-family additions) is CURRENT STATE,
-- not an event — so it does NOT live in peb.transactions (that table records
-- admissions/violations, i.e. APPLICATIONS of the posture). It persists as a
-- governance_threshold-STYLE row in the resolution schema: one row per rule
-- family {family, mode, authorized_by, effective_from}, immutable-temporal
-- (active = latest effective_from <= now() per family).
--
--   authorized_by  MUST cite the architect decision that admitted the family
--                  (4a57c089 for the initial enforced family) — makes the
--                  "no silent addition" rule of 4a57c089 mechanically
--                  checkable.
--
-- Backfill seed: cir-sdm.one-way-gate -> enforced (citing 4a57c089); every
-- other family starts shadow (not yet authorized to enforce). The seed rows
-- carry a FIXED effective_from (2026-08-25T00:00:00Z — the ruling date), so
-- re-runs are no-ops via the (family, effective_from) UNIQUE constraint:
-- a later posture change inserts a NEW row with a newer effective_from
-- (supersession by insertion, never UPDATE).
--
-- CIR_SDM_ENFORCE env demotes to bootstrap default ONLY while zero rows
-- exist; once rows exist the database wins. Env-vs-row divergence emits a
-- warning line.
--
-- Idempotent: safe to re-run (IF NOT EXISTS + ON CONFLICT DO NOTHING).

BEGIN;

CREATE TABLE IF NOT EXISTS resolution.enforcement_posture (
    id              uuid        PRIMARY KEY DEFAULT gen_random_uuid(),
    family          text        NOT NULL,
    mode            text        NOT NULL CHECK (mode IN ('enforced', 'shadow')),
    authorized_by   text,                 -- architect decision id that admitted the family
    effective_from  timestamptz NOT NULL,
    description     text,
    created_at      timestamptz NOT NULL DEFAULT now(),
    CONSTRAINT uq_enforcement_posture_family_effective
        UNIQUE (family, effective_from)
);

-- Backfill seed (idempotent — fixed effective_from, one row per family)
INSERT INTO resolution.enforcement_posture
    (family, mode, authorized_by, effective_from, description)
VALUES
  ('cir-sdm.one-way-gate',          'enforced', '4a57c089',
   '2026-08-25T00:00:00Z',
   'Initial enforced family — measured zero-FP-blocking window (77-event stream: 2 warnings / 0 blocking) + explicit architect approval (ruling 4a57c089, 2026-08-16).'),
  ('cir-sdm.audit-non-influence',   'shadow',   NULL,
   '2026-08-25T00:00:00Z',
   'Shadow until it demonstrates its own zero-FP window + explicit per-family approval (4a57c089).'),
  ('cir-sdm.provenance-causation',  'shadow',   NULL,
   '2026-08-25T00:00:00Z',
   'Shadow until its own zero-FP window + explicit per-family approval (4a57c089).'),
  ('cir-sdm.version-lock',          'shadow',   NULL,
   '2026-08-25T00:00:00Z',
   'Shadow until its own zero-FP window + explicit per-family approval (4a57c089).'),
  ('cir-sdm.ir-stage-separation',   'shadow',   NULL,
   '2026-08-25T00:00:00Z',
   'Shadow until its own zero-FP window + explicit per-family approval (4a57c089).'),
  ('cir-sdm.core-stage-separation', 'shadow',   NULL,
   '2026-08-25T00:00:00Z',
   'Shadow until its own zero-FP window + explicit per-family approval (4a57c089).'),
  ('cir-sdm.ir-payload-separation', 'shadow',   NULL,
   '2026-08-25T00:00:00Z',
   'Shadow until its own zero-FP window + explicit per-family approval (4a57c089).')
ON CONFLICT ON CONSTRAINT uq_enforcement_posture_family_effective DO NOTHING;

COMMIT;