-- ═══════════════════════════════════════════════════════════════════════
--  V083 — T01 Phase D: asset_id on knowledge.graph_entities + backfill
--
--  Decision ref: 898a203b (architect, 2026-08-09)
--  Handoff: T01 asset_id migration phases V079–V083
--
--  knowledge.graph_entities is a BASE TABLE (not a view).
--  asset_kind = 'knowledge_entity'.
--
--  Prerequisite: V079–V082.
--  Idempotent; re-runnable.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE knowledge.graph_entities
    ADD COLUMN IF NOT EXISTS asset_id uuid
    REFERENCES semantics.canonical_asset(id);

INSERT INTO semantics.canonical_asset (canonical_asset_id, asset_kind)
SELECT 'asset:nexus:knowledge_graph_entities:' || id::text, 'knowledge_entity'
FROM knowledge.graph_entities
WHERE asset_id IS NULL
ON CONFLICT (canonical_asset_id) WHERE expired_at IS NULL DO NOTHING;

UPDATE knowledge.graph_entities ge
SET asset_id = ca.id
FROM semantics.canonical_asset ca
WHERE ca.canonical_asset_id = 'asset:nexus:knowledge_graph_entities:' || ge.id::text
  AND ca.expired_at IS NULL
  AND ge.asset_id IS NULL;

DO $$
DECLARE
    v_total integer;
    v_null  integer;
BEGIN
    SELECT count(*), count(*) FILTER (WHERE asset_id IS NULL)
        INTO v_total, v_null FROM knowledge.graph_entities;

    IF v_null > 0 THEN
        RAISE EXCEPTION 'V083 verify: % of % graph_entity rows still NULL', v_null, v_total;
    END IF;

    RAISE NOTICE '✅ V083 applied — asset_id on % graph_entities (0 NULL).', v_total;
END $$;

COMMIT;
