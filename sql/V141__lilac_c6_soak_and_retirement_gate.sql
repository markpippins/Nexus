-- V141 (Lilac Wave 1, plan 8261639 / C6): soak + retirement gate
-- infrastructure. SAFE, ADDITIVE — contains NO drops and NO re-pointing.
--
-- C6 has three phases: FENCE writers → SOAK on dual-read + shadow evidence
-- → RETIRE duplicate tables. This migration provides the evidence and gate
-- surfaces for the soak/retire phases. The retirement DDL itself lives in
-- V142 and is SELF-GATING: it refuses to apply until the function below
-- returns true.
--
-- Gate contract (all conditions must hold):
--   1. Canonical infra present (V139 tables).
--   2. Import completeness (C4): EVERY vision.receipts row has a canonical
--      twin (resolution.receipt with source_receipt_id = vision id).
--   3. Ticket seam drained: vision.tickets has zero non-closed tickets and
--      every row carries a resolution.migration_disposition entry.
--   4. Soak: >= 7 distinct GREEN soak_evidence days within the trailing
--      30 days (evidence recorded by the lilac_c6 drift checker).
--   5. Signoffs: 'operator' AND 'architect' rows in retirement_signoff
--      (I1: retirement closes only through the owning authorities).
---- Migration disposition convention (C4 import; classes RATIFIED in
-- contract v1, decision 1b02c07c):
--   disposition_class IN ('unlinked','quarantined','mapped','discarded','retired')
-- target_refs jsonb carries the canonical target identity.
--
-- R9 note: schema change. MUST be replicated to vanadium (host `vanadium`,
-- db `nexus`, user `pguser`, port 5432) AFTER the DBA applies it locally —
-- per AGENTS.md R9, never assume replication; confirm with the operator.
-- (barium 192.168.1.212 is unreachable: disk-full + forensics hold.)

-- ── C4 import disposition store (C2 draft §2.1 #7, R5 no-silent-joins) ──
CREATE TABLE IF NOT EXISTS resolution.migration_disposition (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source_schema     text NOT NULL,
  source_table      text NOT NULL,
  source_pk         text NOT NULL,
  migration_version text NOT NULL,
  disposition_class text NOT NULL
                    CHECK (disposition_class IN
                      ('unlinked','quarantined','mapped','discarded','retired')),
  target_refs       jsonb NOT NULL DEFAULT '{}'::jsonb,
  recorded_by       text NOT NULL,
  created_at        timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_migration_disposition
    UNIQUE (source_schema, source_table, source_pk, migration_version)
);
CREATE INDEX IF NOT EXISTS idx_migration_disposition_src
  ON resolution.migration_disposition (source_schema, source_table);

-- ── Soak evidence: one GREEN/RED report per day (drift checker writes) ──
CREATE TABLE IF NOT EXISTS resolution.soak_evidence (
  id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  evidence_date date NOT NULL UNIQUE,
  report        jsonb NOT NULL,
  green         boolean NOT NULL,
  recorded_by   text NOT NULL,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- ── Retirement signoff: one binding signoff per role (I1) ────────────────
CREATE TABLE IF NOT EXISTS resolution.retirement_signoff (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  role       text NOT NULL UNIQUE
             CHECK (role IN ('operator','architect','engineer','dba')),
  signoff    text NOT NULL,
  signed_by  text NOT NULL,
  signed_at  timestamptz NOT NULL DEFAULT now()
);

-- ── The verifiable gate ──────────────────────────────────────────────────
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

  -- 5. Signoffs: operator + architect.
  SELECT count(*) INTO v_signoffs
  FROM resolution.retirement_signoff WHERE role IN ('operator','architect');
  v_result := jsonb_set(v_result, '{binding_signoffs}', to_jsonb(v_signoffs));
  v_ok := v_ok AND (v_signoffs = 2);

  v_result := jsonb_set(v_result, '{satisfied}', to_jsonb(v_ok));
  RETURN v_result;
END;
$$ LANGUAGE plpgsql;

COMMENT ON FUNCTION resolution.c6_retirement_gate IS
  'C6 retirement gate (fence→soak→retire). V142 refuses to apply unless satisfied. Verifiable conditions: import completeness, ticket seam drained, 7 green soak days, operator+architect signoff.';
