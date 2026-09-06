-- V140 (Lilac Wave 1, plan 8261639 / C5): receipts_unified becomes the C5
-- dual-read projection surface over the canonical stream.
--
-- Implements architect ruling Q1 (8d30e540): nebula.receipts_unified is NOT
-- canonical — it is re-pointed onto resolution.receipt as a dual-read
-- projection and dies with the legacy seam at C6. Its sequence-NULL defect
-- is retired with the legacy seam, not patched.
--
-- STAGED (paired with V139): safe to apply the moment V139 is applied. The
-- canonical branch contributes rows only when shadow evidence exists;
-- without shadow mode the projection is behavior-identical to V111 (all
-- rows come from the legacy branches). No consumer is redirected here —
-- they already read the VIEW; the migration is the re-pointing itself.
--
-- Consumer reads of the VIEW contract (14 columns, V110/V111):
--   id, plan_id, type, agent_role, session_id, artifact_path, summary,
--   metadata_json, created_at, ticket_id, tokens_used, sequence,
--   recorded_on_dt, recorded_until_dt
--
-- R9 note: schema change. MUST be replicated to vanadium (host `vanadium`,
-- db `nexus`, user `pguser`, port 5432) AFTER the DBA applies it locally —
-- per AGENTS.md R9, never assume replication; confirm with the operator.
-- (barium 192.168.1.212 is unreachable: disk-full + forensics hold.)

-- ── The canonical branch (V139 shapes) as a typed projection ─────────────
-- Only kinds in the conduit lifecycle vocabulary map onto the unified
-- contract; canonical rows need a plan ref to appear in the unified view
-- (plan_id is not nullable in the legacy contract).
CREATE OR REPLACE VIEW resolution.receipt_unified_projection AS
SELECT
  r.source_receipt_id                    AS id,
  r.refs->>'plan_id'                     AS plan_id,
  (SELECT m.legacy_type FROM (VALUES
    ('plan_create','PLAN_CREATE'),('planning','PLANNING'),
    ('implementation','IMPLEMENTATION'),('review','REVIEW'),
    ('review_pass','REVIEW_PASS'),('review_reject','REVIEW_REJECT'),
    ('critique','CRITIQUE'),('critique_pass','CRITIQUE_PASS'),
    ('critique_reject','CRITIQUE_REJECT'),('block','BLOCK'),
    ('hold','HOLD'),('ccnf_execution','CCNF_EXECUTION'),
    ('requeued','REQUEUED'),('api_limit','API_LIMIT'),
    ('abandoned','ABANDONED'),('cancelled','CANCELLED'),
    ('plan_block','PLAN_BLOCK')) AS m(t, legacy_type)
   WHERE m.t = r.kind)                    AS type,
  r.payload->>'agent_role'               AS agent_role,
  r.payload->>'session_id'               AS session_id,
  r.payload->>'artifact_path'            AS artifact_path,
  COALESCE(r.payload->>'summary', '')    AS summary,
  r.payload::text                        AS metadata_json,
  r.created_at                           AS created_at,
  r.payload->>'ticket_id'                AS ticket_id,
  COALESCE((r.payload->>'tokens_used')::integer, 0) AS tokens_used,
  NULL::integer                          AS sequence,
  r.created_at                           AS recorded_on_dt,
  NULL::timestamptz                      AS recorded_until_dt
FROM resolution.receipt r
WHERE r.kind <> 'admission'
  AND r.refs->>'plan_id' IS NOT NULL;

-- ── Re-point the unified surface (CREATE OR REPLACE — dependent views
--    nebula.plan_status and scratch.plan_status are preserved) ────────────
CREATE OR REPLACE VIEW nebula.receipts_unified AS
-- Legacy branch 1: execution.receipts (request-scoped, conduit lineage) —
-- unchanged from V111.
SELECT COALESCE(e.lineage_original_id, e.id::text) AS id,
    rq.source_plan_id AS plan_id,
    e.type,
    e.agent_role,
    e.metadata ->> 'session_id' AS session_id,
    e.metadata ->> 'artifact_path' AS artifact_path,
    e.summary,
    e.metadata::text AS metadata_json,
    e.issued_at AS created_at,
    e.metadata ->> 'ticket_id' AS ticket_id,
    COALESCE((e.metadata ->> 'tokens_used')::integer, 0) AS tokens_used,
    NULL::integer AS sequence,
    e.issued_at AS recorded_on_dt,
    NULL::timestamptz AS recorded_until_dt
FROM execution.receipts e
JOIN execution.requests rq ON rq.id = e.request_id
WHERE e.lineage_source = 'conduit'
UNION ALL
-- Legacy branch 2: vision.receipts (frozen synthetic/standalone surface) —
-- unchanged from V111.
SELECT receipts.id,
    receipts.plan_id,
    receipts.type,
    receipts.agent_role,
    receipts.session_id,
    receipts.artifact_path,
    receipts.summary,
    receipts.metadata_json,
    receipts.created_at,
    receipts.ticket_id,
    receipts.tokens_used,
    receipts.sequence,
    receipts.recorded_on_dt,
    receipts.recorded_until_dt
FROM vision.receipts receipts
UNION ALL
-- Canonical branch (NEW): resolution.receipt shadow evidence, deduplicated
-- against the legacy branches on the unified identity (id, plan_id, type).
-- A row that exists both canonically (shadow) and legibly (legacy write of
-- the same receipt) appears ONCE — from the legacy branch — so consumers
-- see identical row sets to V111 during dual-read; shadow-only receipts
-- (V139 applied without a legacy surface write) surface here.
SELECT p.id, p.plan_id, p.type, p.agent_role, p.session_id,
       p.artifact_path, p.summary, p.metadata_json, p.created_at,
       p.ticket_id, p.tokens_used, p.sequence,
       p.recorded_on_dt, p.recorded_until_dt
FROM resolution.receipt_unified_projection p
WHERE NOT EXISTS (
  SELECT 1 FROM execution.receipts e
  JOIN execution.requests rq ON rq.id = e.request_id
  WHERE e.lineage_source = 'conduit'
    AND rq.source_plan_id = p.plan_id
    AND COALESCE(e.lineage_original_id, e.id::text) = p.id
    AND e.type = p.type
) AND NOT EXISTS (
  SELECT 1 FROM vision.receipts v
  WHERE v.id = p.id AND v.plan_id = p.plan_id AND v.type = p.type
);

-- ── C5 consumer contract: comment the projection's role (R5 discipline) ──
COMMENT ON VIEW nebula.receipts_unified IS
  'C5 dual-read projection over resolution.receipt (Q1 8d30e540): legacy execution ∪ legacy vision ∪ canonical-minus-duplicates. NOT canonical. Re-pointed fully onto resolution.receipt at C6, which also retires the sequence-NULL defect.';
COMMENT ON VIEW resolution.receipt_unified_projection IS
  'C5 typed projection of the canonical stream onto the unified contract (conduit lifecycle kinds with a plan ref only).';
