-- ═══════════════════════════════════════════════════════════════════════
--  V060 — semantics: relationship vocabulary (type-level legend, part 2)
--
--  Formalizes the relationship-type vocabulary that semantics-db.md only
--  sketched in comments ('produces','spawns','member_of','transforms_into'
--  for concept_relationship; 'equivalent','derived','partial','legacy',
--  'supersedes','projects' for representation_relationship) and extends
--  it with 14 richer cross-domain types per user direction (defines,
--  implements, projects, derives_from, validates, constrains, governs,
--  supersedes, observes, mediates, interprets, depends_on_decision,
--  evidences, questions).
--
--  What this migration does:
--    • creates semantics.relationship_type — the canonical vocabulary
--      (name UNIQUE so edge tables can FK-reference it; descriptions
--      define each type; scope tags concept / representation / both)
--    • seeds 24 types: 6 concept pipeline types + 4 doc representation
--      types + the 14 new cross-domain types (user definitions verbatim)
--    • adds the standard proc trio (add_ / soft_delete_ / update_) so the
--      vocabulary is CRUD-able through the same surface as every table
--    • ENFORCES the vocabulary: FKs from concept_relationship and
--      representation_relationship reference relationship_type(name),
--      resolving the "shared vocabulary" open question in semantics-db.md
--      — only defined types are legal edge types now
--
--  Idempotent: CREATE TABLE IF NOT EXISTS, ON CONFLICT DO NOTHING,
--  constraint adds guarded by pg_constraint checks, CREATE OR REPLACE
--  procs. Safe to re-apply.
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V060__semantics_relationship_vocabulary.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. relationship_type — canonical vocabulary of legal edge types
-- ═══════════════════════════════════════════════════════════════════════
CREATE TABLE IF NOT EXISTS semantics.relationship_type (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL UNIQUE,
    description text NOT NULL,
    scope       text,           -- 'concept' | 'representation' | 'both' (advisory tag)
    notes       text,
    created_at  timestamptz NOT NULL DEFAULT now(),
    expired_at  timestamptz
);

-- ═══════════════════════════════════════════════════════════════════════
--  2. SEED — 24 relationship types
--     • 6 concept pipeline types (in use by V059 concept_relationship edges)
--     • 4 representation-fidelity types from semantics-db.md DDL comment
--     • 14 cross-domain types (user definitions, verbatim)
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO semantics.relationship_type (name, description, scope, notes) VALUES
  -- concept pipeline types (concept-to-concept, in use)
  ('produces',           'A thing of one concept is created from a thing of another concept — pipeline step (Harvest → SegmentSet → Candidate → …)', 'concept', NULL),
  ('spawns',             'A parent concept creates child instances of the same concept (Requirement spawns Requirement via parent_id)', 'concept', NULL),
  ('member_of',          'A concept belongs to / is a part of another (Requirement is member_of Specification — green path)', 'concept', NULL),
  ('transforms_into',    'A concept is compiled / converted into the next pipeline stage (Specification → ImplementationPlan → WorkRequest)', 'concept', NULL),
  ('basis_of',           'A concept is the foundation / justification for a non-pipeline artifact (Requirement is basis_of Agenda / Question — red path)', 'concept', NULL),
  ('provenance_of',      'A concept is the origin / history source for another (failed WorkRequest is provenance_of a subsequent WorkRequest)', 'concept', NULL),

  -- representation-fidelity types (physical forms of the same concept)
  ('equivalent',         'Two representations denote the same thing (physical-form equivalence)', 'representation', NULL),
  ('derived',            'One representation is computed from another', 'representation', NULL),
  ('partial',            'One representation covers only part of another (partial projection)', 'representation', NULL),
  ('legacy',             'One representation is the historical / retired form of another', 'representation', NULL),

  -- cross-domain types (user-defined vocabulary)
  ('defines',            'this document/schema/service establishes the meaning of a concept', 'both', NULL),
  ('implements',         'this artifact realizes a contract or specification', 'both', NULL),
  ('projects',           'this view is a representation of another source of truth', 'both', NULL),
  ('derives_from',       'this fact or object was computed from another', 'both', NULL),
  ('validates',          'this component asserts correctness of another', 'both', NULL),
  ('constrains',         'this rule limits acceptable behavior', 'both', NULL),
  ('governs',            'this policy controls decisions made elsewhere', 'both', NULL),
  ('supersedes',         'this replaces an earlier concept without erasing history', 'both', NULL),
  ('observes',           'this records state without owning it', 'both', NULL),
  ('mediates',           'this sits between domains and translates concepts', 'both', NULL),
  ('interprets',         'this gives meaning to otherwise raw data', 'both', NULL),
  ('depends_on_decision','this implementation assumes a prior architectural choice', 'both', NULL),
  ('evidences',          'this artifact is proof for a claim', 'both', NULL),
  ('questions',          'this artifact raises uncertainty about another', 'both', NULL)
ON CONFLICT (name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  3. STORED PROCEDURES — standard trio (vocabulary is CRUD-able)
-- ═══════════════════════════════════════════════════════════════════════
CREATE OR REPLACE FUNCTION semantics.add_relationship_type(
    p_id uuid DEFAULT NULL, p_name text DEFAULT NULL,
    p_description text DEFAULT NULL, p_scope text DEFAULT NULL,
    p_notes text DEFAULT NULL, p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.relationship_type AS $$
DECLARE v_row semantics.relationship_type%ROWTYPE;
BEGIN
    INSERT INTO semantics.relationship_type
        (id, name, description, scope, notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_name, p_description, p_scope, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- The row's identity IS its name (idCol 'name'), so the id-taking procs
-- take p_name and look up by name — matching how the REST/MCP layer calls
-- them (named params).
CREATE OR REPLACE FUNCTION semantics.soft_delete_relationship_type(p_name text)
RETURNS integer AS $$
DECLARE v_count integer;
BEGIN
    UPDATE semantics.relationship_type SET expired_at = NOW()
    WHERE name = p_name AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    RETURN v_count;
END;
$$ LANGUAGE plpgsql;

-- Append-only replace (owning_subsystem p_new_id pattern). p_name identifies
-- the row to supersede (the old name); p_new_name carries the replacement's
-- name. Names are FULLY UNIQUE and FK-referenced (never reused): the expired
-- row keeps the old name.
CREATE OR REPLACE FUNCTION semantics.update_relationship_type(
    p_name text, p_new_name text DEFAULT NULL, p_description text DEFAULT NULL,
    p_scope text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.relationship_type AS $$
DECLARE v_row semantics.relationship_type%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.relationship_type SET expired_at = NOW()
    WHERE name = p_name AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_relationship_type: no active row named %', p_name; END IF;
    INSERT INTO semantics.relationship_type
        (id, name, description, scope, notes, expired_at)
    VALUES
        (gen_random_uuid(), p_new_name, p_description, p_scope, p_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  4. ENFORCE THE VOCABULARY — FKs from both relationship tables
--     (resolves the "shared vocabulary" open question in semantics-db.md)
-- ═══════════════════════════════════════════════════════════════════════
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_concept_relationship_type') THEN
        ALTER TABLE semantics.concept_relationship
            ADD CONSTRAINT fk_concept_relationship_type
            FOREIGN KEY (relationship_type) REFERENCES semantics.relationship_type(name);
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'fk_representation_relationship_type') THEN
        ALTER TABLE semantics.representation_relationship
            ADD CONSTRAINT fk_representation_relationship_type
            FOREIGN KEY (relationship_type) REFERENCES semantics.relationship_type(name);
    END IF;
END $$;

-- ═══════════════════════════════════════════════════════════════════════
--  5. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_types integer;
    v_fks   integer;
    v_concept_fk integer;
    v_rep_fk integer;
BEGIN
    SELECT count(*) INTO v_types FROM semantics.relationship_type WHERE expired_at IS NULL;
    SELECT count(*) INTO v_fks
      FROM pg_constraint con JOIN pg_namespace nsp ON nsp.oid = con.connamespace
     WHERE con.contype = 'f' AND nsp.nspname = 'semantics';
    SELECT count(*) INTO v_concept_fk FROM pg_constraint WHERE conname = 'fk_concept_relationship_type';
    SELECT count(*) INTO v_rep_fk    FROM pg_constraint WHERE conname = 'fk_representation_relationship_type';

    RAISE NOTICE 'relationship_type=%, semantics_fks=%, concept_fk=%, representation_fk=%',
                 v_types, v_fks, v_concept_fk, v_rep_fk;

    IF v_types <> 24 THEN RAISE EXCEPTION 'V060 verification failed: expected 24 relationship types, got %', v_types; END IF;
    IF v_concept_fk <> 1 OR v_rep_fk <> 1 THEN RAISE EXCEPTION 'V060 verification failed: vocabulary FKs missing'; END IF;
    RAISE NOTICE '✅ V060 applied — relationship vocabulary (24 types) seeded and enforced via FK.';
END $$;

COMMIT;
