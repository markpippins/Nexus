-- V139 (Lilac Wave 1, plan 8261639 / C3): canonical Resolution persistence.
--
-- Implements the C2 contract draft (034eb36c) as amended by binding rulings:
--   * 1394292c — R2 authority boundary, R4 idempotency, R5 lineage discipline.
--   * a515667d (Q3) — ONE canonical receipt stream: resolution.receipt,
--     kind-discriminated; kind-scoped producer grants; authority != storage.
--   * 8d30e540 (Q1) — nebula.receipts dual-read projection; not canonical.
--
-- STAGED (not activated): producers keep writing the legacy seam until C2 is
-- formally ratified and C3 cutover is authorized. Nothing here redirects
-- existing writers; the seams (db_adapter, peb-srv) grow an env-gated
-- shadow-write path (default OFF).
--
-- R9 note: schema change. MUST be replicated to vanadium (host `vanadium`,
-- db `nexus`, user `pguser`, port 5432) AFTER the DBA applies it locally —
-- per AGENTS.md R9, never assume replication; confirm with the operator.
-- (barium 192.168.1.212 is unreachable: disk-full + forensics hold.)

-- ── 1. Contract version registry ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resolution.contract_version (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  version         integer NOT NULL UNIQUE,
  schema_hash     text NOT NULL,
  event_vocabulary text[] NOT NULL,
  key_scheme      text NOT NULL,
  outcome_classes text[] NOT NULL,
  ratified_by     text,
  ratified_at     timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);

-- ── 2. Producer registry — named write authorities (R2/Q3) ──────────────
CREATE TABLE IF NOT EXISTS resolution.producer_registry (
  producer_id           text PRIMARY KEY,
  name                  text NOT NULL,
  allowed_kinds         text[] NOT NULL,
  contract_version_min  integer NOT NULL,
  contract_version_max  integer NOT NULL,
  state                 text NOT NULL DEFAULT 'active'
                        CHECK (state IN ('active','suspended','retired')),
  registered_by         text NOT NULL,
  registered_at         timestamptz NOT NULL DEFAULT now(),
  retired_at            timestamptz,
  CONSTRAINT chk_producer_version_range CHECK (contract_version_min <= contract_version_max)
);

-- ── 3. The canonical receipt stream (Q3) ────────────────────────────────
CREATE TABLE IF NOT EXISTS resolution.receipt (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  producer_id         text NOT NULL REFERENCES resolution.producer_registry(producer_id),
  kind                text NOT NULL,
  source_system       text NOT NULL,
  source_receipt_id   text NOT NULL,
  payload_fingerprint text NOT NULL,
  payload             jsonb NOT NULL,
  refs                jsonb NOT NULL DEFAULT '{}'::jsonb,
  contract_version    integer NOT NULL,
  created_at          timestamptz NOT NULL DEFAULT now(),
  -- R4: receipt idempotency — one canonical row per source id. Identical
  -- replay (same fingerprint) → duplicate-equivalent; conflicting payload
  -- → REFUSED with both fingerprints recorded. The DB enforces uniqueness
  -- on the source id; the adapter compares fingerprints on violation and
  -- raises the explicit refusal (never silently ignores).
  CONSTRAINT uq_resolution_receipt_idem
    UNIQUE (source_system, source_receipt_id)
);
CREATE INDEX IF NOT EXISTS idx_resolution_receipt_refs
  ON resolution.receipt USING gin (refs);

-- Kind-scoped grant enforcement (Q3: "a producer simply cannot write the
-- wrong kind"). Refuses any write whose producer lacks a matching
-- allowed_kinds[] grant, whose contract_version falls outside the
-- producer's declared range, or whose producer is not active.
CREATE FUNCTION resolution.enforce_producer_grant() RETURNS trigger AS $$
BEGIN
  PERFORM 1 FROM resolution.producer_registry p
   WHERE p.producer_id = NEW.producer_id
     AND p.state = 'active'
     AND NEW.contract_version BETWEEN p.contract_version_min AND p.contract_version_max
     AND NEW.kind = ANY (p.allowed_kinds);
  IF NOT FOUND THEN
    RAISE EXCEPTION 'producer grant refused: producer=% kind=% contract_version=%',
      NEW.producer_id, NEW.kind, NEW.contract_version
      USING ERRCODE = 'P0004';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_resolution_receipt_grant
  BEFORE INSERT ON resolution.receipt
  FOR EACH ROW EXECUTE FUNCTION resolution.enforce_producer_grant();

-- ── 4. Operational tickets ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS resolution.ticket (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workflow_ref           text NOT NULL,
  role                   text NOT NULL,
  position               integer NOT NULL,
  status                 text NOT NULL DEFAULT 'open'
                         CHECK (status IN ('open','claimed','stale','closed')),
  predecessor_receipt_id uuid REFERENCES resolution.receipt(id),
  generation             integer NOT NULL DEFAULT 0,
  objective              text NOT NULL DEFAULT '',  -- descriptive ONLY, never routed
  contract_version       integer NOT NULL,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now(),
  -- R4: ticket issuance idempotency key.
  CONSTRAINT uq_resolution_ticket_idem
    UNIQUE (workflow_ref, role, position, generation)
);

-- ── 5. Append-only ticket lifecycle log ─────────────────────────────────
CREATE TABLE IF NOT EXISTS resolution.ticket_transition (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ticket_id              uuid NOT NULL REFERENCES resolution.ticket(id),
  input_receipt_id       uuid REFERENCES resolution.receipt(id),
  from_status            text NOT NULL,
  to_status              text NOT NULL,
  fanout_policy_version  integer NOT NULL DEFAULT 1,
  outcome_class          text NOT NULL CHECK (outcome_class IN
                         ('accepted','duplicate-equivalent','conflict','refused','unlinked','quarantined')),
  payload                jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- R4: transition idempotency key.
  CONSTRAINT uq_resolution_ticket_transition_idem
    UNIQUE (ticket_id, from_status, to_status, input_receipt_id, fanout_policy_version)
);

-- ── 6. Position-aware fan-out ledger (ONE receipt-to-ticket fan-out) ────
CREATE TABLE IF NOT EXISTS resolution.fanout_transition (
  id                     uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  input_receipt_id       uuid NOT NULL REFERENCES resolution.receipt(id),
  kind                   text NOT NULL,
  fan_out_policy_version integer NOT NULL,
  outcome                text NOT NULL CHECK (outcome IN
                         ('spawned','completed','no-op','conflict','refused')),
  produced               jsonb NOT NULL DEFAULT '[]'::jsonb,
  conflict_fingerprints  jsonb NOT NULL DEFAULT '[]'::jsonb,
  created_at             timestamptz NOT NULL DEFAULT now(),
  -- R4: fan-out idempotency key — the ledger IS the single fan-out.
  CONSTRAINT uq_resolution_fanout_idem
    UNIQUE (input_receipt_id, kind, fan_out_policy_version)
);

-- ── 7. Kind-scoped producer grants — staging seeds (Q3 authority table) ─
INSERT INTO resolution.producer_registry
  (producer_id, name, allowed_kinds, contract_version_min, contract_version_max, registered_by)
VALUES
  ('conduit-mcp',
   'Conduit MCP (TS front-door :3100)',
   ARRAY['plan_create','planning','implementation','review','review_pass',
         'review_reject','critique','critique_pass','critique_reject','block',
         'hold','ccnf_execution','requeued','api_limit','abandoned',
         'cancelled','plan_block'],
   1, 1, 'V139'),
  ('nexus-execution-worker',
   'Python execution worker (builder; redirected via Lilac adapter at C3 cutover)',
   ARRAY['plan_create','planning','implementation','review','review_pass',
         'review_reject','critique','critique_pass','critique_reject','block',
         'hold','ccnf_execution','requeued','api_limit','abandoned',
         'cancelled','plan_block'],
   1, 1, 'V139'),
  ('peb-srv',
   'PEB admission runtime',
   ARRAY['admission'],
   1, 1, 'V139')
ON CONFLICT (producer_id) DO NOTHING;

COMMENT ON TABLE resolution.receipt IS 'Lilac canonical receipt stream (Q3): immutable, producer-registered, kind-discriminated. THE receipt.';
COMMENT ON TABLE resolution.producer_registry IS 'Named write authorities with kind-scoped grants (R2/Q3). Unknown/ambiguous writer → refused.';
COMMENT ON TABLE resolution.fanout_transition IS 'Position-aware fan-out ledger: THE single receipt-to-ticket fan-out (C3).';
