-- V146 (plan 8261639 / Stage D gate input): three-signatory retirement gate.
--
-- Amends resolution.c6_retirement_gate() so Stage D signoff requires
-- operator + architect + DBA (count = 3), per the architect ruling
-- answering DBA record 9872f297 (comment 94c0244a):
--
--   * Substance ADOPTED: the DBA is a required Stage D signatory, gated on
--     DB-layer verification — "zero direct writers + direct-DML grants
--     revoked + freeze DB-enforced" is certifiable by nobody else (the C1
--     DB-truth inventory found all 9 legacy tables grant direct DML to
--     pguser).
--   * Mechanism RULED OUT: inserting a ('dba', ...) row NOW. Two
--     independent counts: (1) the pre-V146 gate counts
--     role IN ('operator','architect') and requires exactly 2, so a dba
--     row is inert — it advances nothing; (2) retirement_signoff has
--     UNIQUE(role) and signed_at NOT NULL DEFAULT now(), so a placeholder
--     row is a *completed, dated signature* for a verification that has
--     not run — a false audit artifact on an immutable signoff surface.
--
-- The DBA row is written AT Stage D verification time BY THE DBA, after
-- running the live DB-layer checks — not before.
--
-- Scope (exactly as ruled): the function definition + COMMENT only.
-- retirement_signoff's CHECK already admits 'dba' — no table DDL change,
-- no data movement. Re-runnable (CREATE OR REPLACE). Reversible by
-- re-applying V141's function definition (both definitions are
-- self-contained CREATE OR REPLACE statements).
--
-- Downstream: V144's self-gate delegates to this gate's satisfied field,
-- so Stage D now cannot proceed without the DBA's verification-backed
-- signature. Nothing Stage-C-blocking: this is a Stage-D gate input only.

CREATE OR REPLACE FUNCTION resolution.c6_retirement_gate()
RETURNS jsonb AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_ok     boolean := true;
  v_missing_receipts bigint;
  v_open_tickets bigint;
  v_undisposed_tickets bigint;
  v_green_days integer;
  v_signoffs integer;
BEGIN
  -- 1. Canonical infra present.
  DECLARE
    v_infra boolean;
  BEGIN
    SELECT count(*) = 4 INTO v_infra FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'resolution'
      AND c.relname IN ('receipt','ticket','ticket_transition','fanout_transition')
      AND c.relkind = 'r';
    v_result := jsonb_set(v_result, '{canonical_infra}', to_jsonb(v_infra));
    v_ok := v_ok AND v_infra;
  END;

  -- 2. C4 import completeness for vision.receipts — mappable types ONLY.
  -- The type list mirrors lilac.RECEIPT_KIND_BY_TYPE (drift fixture
  -- lilac_drift.KIND_BY_TYPE): legacy-only types (e.g. PROPOSED) have no
  -- ratified canonical kind and can never acquire twins, so counting them
  -- would block the retirement gate forever.
  IF to_regclass('vision.receipts') IS NOT NULL THEN
    SELECT count(*) INTO v_missing_receipts
    FROM vision.receipts v
    WHERE v.type IN (
      'PLAN_CREATE','PLANNING','IMPLEMENTATION','REVIEW','REVIEW_PASS',
      'REVIEW_REJECT','CRITIQUE','CRITIQUE_PASS','CRITIQUE_REJECT','BLOCK',
      'HOLD','CCNF_EXECUTION','REQUEUED','API_LIMIT','ABANDONED',
      'CANCELLED','PLAN_BLOCK')
      AND NOT EXISTS (
      SELECT 1 FROM resolution.receipt r
      WHERE r.source_receipt_id = v.id
        AND r.source_system IN ('conduit', 'import:vision.receipts')
    );
  ELSE
    v_missing_receipts := 0;  -- already retired
  END IF;
  v_result := jsonb_set(v_result, '{vision_receipts_missing_twin}', to_jsonb(v_missing_receipts));
  v_ok := v_ok AND (v_missing_receipts = 0);

  -- 3. Ticket seam drained.
  IF to_regclass('vision.tickets') IS NOT NULL THEN
    SELECT count(*) INTO v_open_tickets
    FROM vision.tickets t WHERE t.status IN ('open','claimed','stale');
    SELECT count(*) INTO v_undisposed_tickets
    FROM vision.tickets t
    WHERE NOT EXISTS (
      SELECT 1 FROM resolution.migration_disposition d
      WHERE d.source_schema = 'vision' AND d.source_table = 'tickets'
        AND d.source_pk = t.id
    );
  ELSE
    v_open_tickets := 0;
    v_undisposed_tickets := 0;
  END IF;
  v_result := jsonb_set(v_result, '{vision_tickets_non_closed}', to_jsonb(v_open_tickets));
  v_result := jsonb_set(v_result, '{vision_tickets_undisposed}', to_jsonb(v_undisposed_tickets));
  v_ok := v_ok AND (v_open_tickets = 0) AND (v_undisposed_tickets = 0);

  -- 4. Soak: >= 7 green days in trailing 30.
  SELECT count(DISTINCT evidence_date) INTO v_green_days
  FROM resolution.soak_evidence
  WHERE green AND evidence_date > current_date - 30;
  v_result := jsonb_set(v_result, '{green_soak_days}', to_jsonb(v_green_days));
  v_ok := v_ok AND (v_green_days >= 7);

  -- 5. Signoffs: operator + architect + dba (V146, three-signatory rule).
  --    The dba row is written at Stage D verification time by the DBA,
  --    after the live DB-layer freeze checks (zero direct writers,
  --    direct-DML grants revoked, freeze DB-enforced) — never pre-staged.
  SELECT count(*) INTO v_signoffs
  FROM resolution.retirement_signoff WHERE role IN ('operator','architect','dba');
  v_result := jsonb_set(v_result, '{binding_signoffs}', to_jsonb(v_signoffs));
  v_ok := v_ok AND (v_signoffs = 3);

  v_result := jsonb_set(v_result, '{satisfied}', to_jsonb(v_ok));
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION resolution.c6_retirement_gate IS
  'C6 retirement gate (fence→soak→retire). V144 refuses to apply unless satisfied. Verifiable conditions: import completeness, ticket seam drained, 7 green soak days, operator+architect+dba signoff (three-signatory rule, V146 — dba signs at Stage D verification time, after DB-layer freeze checks).';
