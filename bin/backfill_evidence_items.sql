-- ═══════════════════════════════════════════════════════════════════════
--  Backfill: seed evidence_items + statement_evidence from
--  concept_relationship / representation_relationship inline columns.
--
--  Run once after V072 is applied.  Idempotent — WHERE NOT EXISTS on
--  the evidence_item hash dedup and statement_evidence unique index
--  mean re-running produces no duplicates.
--
--  Usage:
--    PGPASSWORD=pgpass psql -h localhost -p 5432 -U pguser -d nexus \
--      -f bin/backfill_evidence_items.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Create evidence_items from unique evidence sources ────────────
-- Dedup: (evidence_type_id, source_hash) unique per active row (V072).

WITH sources AS (
    SELECT DISTINCT evidence_source
    FROM (
        SELECT evidence_source
        FROM semantics.concept_relationship
        WHERE evidence_source IS NOT NULL
        UNION ALL
        SELECT evidence_source
        FROM semantics.representation_relationship
        WHERE evidence_source IS NOT NULL
    ) _
),
mapped AS (
    SELECT
        evidence_source,
        -- All current evidence_sources are agent-record URIs
        CASE
            WHEN evidence_source LIKE 'agent-record:%' THEN 'agent_record'
            ELSE 'user_assertion'
        END AS evidence_type_name,
        'harvested' AS origin,
        encode(sha256(evidence_source::bytea), 'hex') AS source_hash
    FROM sources
),
inserted AS (
    INSERT INTO semantics.evidence_item
        (evidence_type_id, uri, excerpt, origin, captured_at, source_hash,
         recorded_on_dt, recorded_until_dt)
    SELECT
        et.id,
        m.evidence_source,                         -- uri
        'Evidence from agent record (backfill)',    -- excerpt
        m.origin,
        now(),                                      -- captured_at
        m.source_hash,
        now(),
        '9999-12-31 23:59:59+00'
    FROM mapped m
    JOIN semantics.evidence_type et ON et.name = m.evidence_type_name
    WHERE NOT EXISTS (
        SELECT 1 FROM semantics.evidence_item ei
        WHERE ei.evidence_type_id = et.id
          AND ei.source_hash = m.source_hash
          AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
    )
    RETURNING id, uri, evidence_type_id, source_hash
)
SELECT 'evidence_items created: ' || count(*)::text AS result FROM inserted;

\echo

-- ── 2. Create statement_evidence for concept_relationship rows ───────
-- One row per relationship with evidence, linking to the evidence_item
-- created above.

WITH cr_evidence AS (
    SELECT
        cr.id AS cr_id,
        cr.evidence_type AS old_type,
        cr.evidence_source,
        cr.evidence_notes,
        cr.confidence,
        -- Map role
        CASE
            WHEN cr.evidence_type = 'declaration' THEN 'originated_from'
            WHEN cr.evidence_type = 'inference'   THEN 'contextualizes'
            ELSE 'supports'
        END AS role
    FROM semantics.concept_relationship cr
    WHERE cr.evidence_source IS NOT NULL
),
inserted_cr AS (
    INSERT INTO semantics.statement_evidence
        (evidence_item_id, statement_type, statement_id, role, strength, comment, effective_at)
    SELECT
        ei.id,
        'concept_relationship',
        cr.cr_id,
        cr.role,
        cr.confidence,
        cr.evidence_notes,
        now()
    FROM cr_evidence cr
    JOIN semantics.evidence_item ei ON ei.uri = cr.evidence_source
                                   AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
    WHERE NOT EXISTS (
        SELECT 1 FROM semantics.statement_evidence se
        WHERE se.statement_type = 'concept_relationship'
          AND se.statement_id = cr.cr_id
          AND se.role = cr.role
          AND se.expired_at IS NULL
    )
    RETURNING id
)
SELECT 'concept_relationship evidence links created: ' || count(*)::text AS result FROM inserted_cr;

\echo

-- ── 3. Create statement_evidence for representation_relationship ────

WITH rr_evidence AS (
    SELECT
        rr.id AS rr_id,
        rr.evidence_type AS old_type,
        rr.evidence_source,
        rr.evidence_notes,
        rr.confidence,
        CASE
            WHEN rr.evidence_type = 'declaration' THEN 'originated_from'
            WHEN rr.evidence_type = 'inference'   THEN 'contextualizes'
            ELSE 'supports'
        END AS role
    FROM semantics.representation_relationship rr
    WHERE rr.evidence_source IS NOT NULL
),
inserted_rr AS (
    INSERT INTO semantics.statement_evidence
        (evidence_item_id, statement_type, statement_id, role, strength, comment, effective_at)
    SELECT
        ei.id,
        'representation_relationship',
        rr.rr_id,
        rr.role,
        rr.confidence,
        rr.evidence_notes,
        now()
    FROM rr_evidence rr
    JOIN semantics.evidence_item ei ON ei.uri = rr.evidence_source
                                   AND ei.recorded_until_dt = '9999-12-31 23:59:59+00'
    WHERE NOT EXISTS (
        SELECT 1 FROM semantics.statement_evidence se
        WHERE se.statement_type = 'representation_relationship'
          AND se.statement_id = rr.rr_id
          AND se.role = rr.role
          AND se.expired_at IS NULL
    )
    RETURNING id
)
SELECT 'representation_relationship evidence links created: ' || count(*)::text AS result FROM inserted_rr;

\echo

-- ── 4. Verify counts ─────────────────────────────────────────────────

SELECT 'evidence_items (total): ' || count(*)::text AS result
FROM semantics.evidence_item
WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

SELECT 'statement_evidence (total): ' || count(*)::text AS result
FROM semantics.statement_evidence
WHERE expired_at IS NULL;

-- Breakdown by role
SELECT role, count(*) AS cnt
FROM semantics.statement_evidence
WHERE expired_at IS NULL
GROUP BY role
ORDER BY cnt DESC;

-- Verification join: show a few linked rows
SELECT se.role, se.strength, se.statement_type,
       et.name AS evidence_type_name,
       ei.uri,
       left(se.comment, 80) AS comment_snippet
FROM semantics.statement_evidence se
JOIN semantics.evidence_item ei ON ei.id = se.evidence_item_id
JOIN semantics.evidence_type et ON et.id = ei.evidence_type_id
WHERE se.expired_at IS NULL
LIMIT 5;

COMMIT;
