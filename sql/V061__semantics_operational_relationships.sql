-- ═══════════════════════════════════════════════════════════════════════
--  V061 — semantics: operational relationships between representations
--
--  Resolves the open question in semantics-db.md (representation_relationship
--  DDL comment): "is Consumes/Produces ever going to describe two
--  representations directly — e.g. a CER event producing a Wind projection
--  with no service in between? … that's legitimately a
--  representation_relationship type too."
--
--  Answer: YES. Adds the operational vocabulary so we can state, between
--  ANY two representations, that one calls / consumes / produces / writes /
--  reads / uses the other:
--
--    calls       one representation invokes another at runtime (API/RPC)
--    consumes    one representation consumes data or events produced by another
--    writes      one representation writes state into another (storage target)
--    reads       one representation reads state from another (storage source)
--    uses        one representation depends on another operationally
--    produces    broadened from concept-scope to 'both' — also covers one
--                representation emitting data/events another consumes
--
--  The vocabulary FKs from V060 already enforce legality on
--  representation_relationship — no code changes needed; this is a pure
--  data extension. scope remains an advisory tag (the vocabulary is the
--  constraint, not the scope).
--
--  Idempotent: ON CONFLICT DO NOTHING + guarded UPDATE. Safe to re-apply.
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V061__semantics_operational_relationships.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. ADD — five operational relationship types (representation scope)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO semantics.relationship_type (name, description, scope, notes) VALUES
  ('calls',    'one representation invokes another at runtime (API/RPC call between services)', 'representation',
   'Operational fact — expresses a runtime invocation between two physical forms; e.g. semantics-mcp calls semantics-srv'),
  ('consumes', 'one representation consumes data or events produced by another', 'representation',
   'Operational fact — the consuming side of produces'),
  ('writes',   'one representation writes state into another (storage target)', 'representation',
   'Operational fact — the representation is a write target'),
  ('reads',    'one representation reads state from another (storage source)', 'representation',
   'Operational fact — the representation is a read source'),
  ('uses',     'one representation depends on another operationally (generic runtime dependency)', 'representation',
   'Operational fact — broadest of the runtime-dependency set')
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  2. BROADEN — produces now covers representation-level producing too
-- ═══════════════════════════════════════════════════════════════════════
UPDATE semantics.relationship_type
   SET scope = 'both',
       description = 'A thing of one concept is created from a thing of another — pipeline step (Harvest → SegmentSet → Candidate → …) OR one representation produces data/events another consumes'
 WHERE name = 'produces' AND expired_at IS NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  3. CLEANUP — drop stale pre-V060 proc overloads
--     V060 originally declared soft_delete_/update_relationship_type with
--     (p_id uuid) before they were corrected to name-keyed signatures.
--     CREATE OR REPLACE cannot change a signature, so the old overloads
--     were left behind as dead procs; drop them here (idempotent).
-- ═══════════════════════════════════════════════════════════════════════
DROP FUNCTION IF EXISTS semantics.soft_delete_relationship_type(uuid);
DROP FUNCTION IF EXISTS semantics.update_relationship_type(
    uuid, text, text, text, text, timestamptz
);

-- ═══════════════════════════════════════════════════════════════════════
--  4. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_types integer;
    v_missing integer;
    v_produces_scope text;
    v_procs integer;
    v_stale integer;
BEGIN
    SELECT count(*) INTO v_types FROM semantics.relationship_type WHERE expired_at IS NULL;
    SELECT count(*) INTO v_missing
      FROM unnest(ARRAY['calls','consumes','writes','reads','uses']) t(name)
     WHERE NOT EXISTS (
        SELECT 1 FROM semantics.relationship_type rt
        WHERE rt.name = t.name AND rt.expired_at IS NULL
     );
    SELECT scope INTO v_produces_scope
      FROM semantics.relationship_type WHERE name = 'produces' AND expired_at IS NULL;
    SELECT count(*) INTO v_procs
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'semantics'
       AND (p.proname LIKE 'add_%' OR p.proname LIKE 'soft_delete_%'
            OR p.proname LIKE 'update_%' OR p.proname LIKE 'resolve_%');
    SELECT count(*) INTO v_stale
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'semantics'
       AND p.proname IN ('soft_delete_relationship_type','update_relationship_type')
       AND pg_get_function_identity_arguments(p.oid) LIKE '%uuid%';

    RAISE NOTICE 'relationship_type=%, missing_new=%, produces_scope=%, procs=%, stale_overloads=%',
                 v_types, v_missing, v_produces_scope, v_procs, v_stale;

    IF v_types <> 29 THEN RAISE EXCEPTION 'V061 verification failed: expected 29 relationship types, got %', v_types; END IF;
    IF v_missing <> 0 THEN RAISE EXCEPTION 'V061 verification failed: new operational types missing'; END IF;
    IF v_produces_scope <> 'both' THEN RAISE EXCEPTION 'V061 verification failed: produces scope should be both, got %', v_produces_scope; END IF;
    IF v_procs <> 37 THEN RAISE EXCEPTION 'V061 verification failed: expected 37 procs (stale overloads not dropped), got %', v_procs; END IF;
    IF v_stale <> 0 THEN RAISE EXCEPTION 'V061 verification failed: % stale relationship_type overloads remain', v_stale; END IF;
    RAISE NOTICE '✅ V061 applied — 5 operational relationship types added; produces broadened; stale proc overloads dropped.';
END $$;

COMMIT;
