-- V064 — evidence columns on the relationship tables
--
-- concept_relationship and representation_relationship gain structured
-- provenance for each asserted edge:
--   evidence_source  text    — pointer to the artifact/record that backs the
--                              relationship (agent record id, harvest id, file
--                              path, doc reference, …)
--   evidence_type    text    — how the edge was established:
--                              declaration | observation | inference |
--                              derivation | verification (advisory, like `scope`)
--   confidence       numeric — 0..1 belief in the edge (CHECK-enforced)
--   evidence_notes   text    — free-text basis / justification
--
-- The four add_/update_ procs are rebuilt with p_evidence_* / p_confidence
-- params. CREATE OR REPLACE cannot change a signature, so the old overloads
-- are DROPPED first (same stale-overload trap as V061/V062).
--
-- Safe to re-apply.

-- ── 1. Columns ─────────────────────────────────────────────────────
ALTER TABLE semantics.concept_relationship
    ADD COLUMN IF NOT EXISTS evidence_source text,
    ADD COLUMN IF NOT EXISTS evidence_type   text,
    ADD COLUMN IF NOT EXISTS confidence      numeric,
    ADD COLUMN IF NOT EXISTS evidence_notes  text;

ALTER TABLE semantics.representation_relationship
    ADD COLUMN IF NOT EXISTS evidence_source text,
    ADD COLUMN IF NOT EXISTS evidence_type   text,
    ADD COLUMN IF NOT EXISTS confidence      numeric,
    ADD COLUMN IF NOT EXISTS evidence_notes  text;

-- ── 2. Confidence range constraint (0..1, nullable) ─────────────────
ALTER TABLE semantics.concept_relationship
    DROP CONSTRAINT IF EXISTS chk_concept_relationship_confidence;
ALTER TABLE semantics.concept_relationship
    ADD CONSTRAINT chk_concept_relationship_confidence
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

ALTER TABLE semantics.representation_relationship
    DROP CONSTRAINT IF EXISTS chk_representation_relationship_confidence;
ALTER TABLE semantics.representation_relationship
    ADD CONSTRAINT chk_representation_relationship_confidence
    CHECK (confidence IS NULL OR (confidence >= 0 AND confidence <= 1));

-- ── 3. Drop old proc overloads ──────────────────────────────────────
DROP FUNCTION IF EXISTS semantics.add_concept_relationship(uuid, uuid, uuid, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS semantics.update_concept_relationship(uuid, uuid, uuid, text, text, text, timestamptz);
DROP FUNCTION IF EXISTS semantics.add_representation_relationship(uuid, uuid, uuid, text, timestamptz);
DROP FUNCTION IF EXISTS semantics.update_representation_relationship(uuid, uuid, uuid, text, timestamptz);

-- ── 4. Recreate add_/update_ procs with evidence params ─────────────
CREATE OR REPLACE FUNCTION semantics.add_concept_relationship(
    p_id uuid DEFAULT NULL, p_from_concept_id uuid DEFAULT NULL,
    p_to_concept_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_path text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_evidence_source text DEFAULT NULL, p_evidence_type text DEFAULT NULL,
    p_confidence numeric DEFAULT NULL, p_evidence_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.concept_relationship AS $$
DECLARE v_row semantics.concept_relationship%ROWTYPE;
BEGIN
    INSERT INTO semantics.concept_relationship
        (id, from_concept_id, to_concept_id, relationship_type, path, notes,
         evidence_source, evidence_type, confidence, evidence_notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_from_concept_id, p_to_concept_id,
         p_relationship_type, p_path, p_notes,
         p_evidence_source, p_evidence_type, p_confidence, p_evidence_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_concept_relationship(
    p_id uuid, p_from_concept_id uuid DEFAULT NULL,
    p_to_concept_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_path text DEFAULT NULL, p_notes text DEFAULT NULL,
    p_evidence_source text DEFAULT NULL, p_evidence_type text DEFAULT NULL,
    p_confidence numeric DEFAULT NULL, p_evidence_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.concept_relationship AS $$
DECLARE v_row semantics.concept_relationship%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.concept_relationship SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_concept_relationship: no active row with id %', p_id; END IF;
    INSERT INTO semantics.concept_relationship
        (id, from_concept_id, to_concept_id, relationship_type, path, notes,
         evidence_source, evidence_type, confidence, evidence_notes, expired_at)
    VALUES
        (gen_random_uuid(), p_from_concept_id, p_to_concept_id,
         p_relationship_type, p_path, p_notes,
         p_evidence_source, p_evidence_type, p_confidence, p_evidence_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.add_representation_relationship(
    p_id uuid DEFAULT NULL, p_from_representation_id uuid DEFAULT NULL,
    p_to_representation_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_evidence_source text DEFAULT NULL, p_evidence_type text DEFAULT NULL,
    p_confidence numeric DEFAULT NULL, p_evidence_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation_relationship AS $$
DECLARE v_row semantics.representation_relationship%ROWTYPE;
BEGIN
    INSERT INTO semantics.representation_relationship
        (id, from_representation_id, to_representation_id, relationship_type, notes,
         evidence_source, evidence_type, confidence, evidence_notes, expired_at)
    VALUES
        (COALESCE(p_id, gen_random_uuid()), p_from_representation_id, p_to_representation_id,
         p_relationship_type, p_notes,
         p_evidence_source, p_evidence_type, p_confidence, p_evidence_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION semantics.update_representation_relationship(
    p_id uuid, p_from_representation_id uuid DEFAULT NULL,
    p_to_representation_id uuid DEFAULT NULL, p_relationship_type text DEFAULT NULL,
    p_notes text DEFAULT NULL,
    p_evidence_source text DEFAULT NULL, p_evidence_type text DEFAULT NULL,
    p_confidence numeric DEFAULT NULL, p_evidence_notes text DEFAULT NULL,
    p_expired_at timestamptz DEFAULT NULL
) RETURNS semantics.representation_relationship AS $$
DECLARE v_row semantics.representation_relationship%ROWTYPE; v_count integer;
BEGIN
    UPDATE semantics.representation_relationship SET expired_at = NOW()
    WHERE id = p_id AND expired_at IS NULL;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count = 0 THEN RAISE EXCEPTION 'update_representation_relationship: no active row with id %', p_id; END IF;
    INSERT INTO semantics.representation_relationship
        (id, from_representation_id, to_representation_id, relationship_type, notes,
         evidence_source, evidence_type, confidence, evidence_notes, expired_at)
    VALUES
        (gen_random_uuid(), p_from_representation_id, p_to_representation_id,
         p_relationship_type, p_notes,
         p_evidence_source, p_evidence_type, p_confidence, p_evidence_notes, p_expired_at)
    RETURNING * INTO v_row;
    RETURN v_row;
END;
$$ LANGUAGE plpgsql;

-- ── 5. Verification ────────────────────────────────────────────────
DO $$
DECLARE
    v_ev_cols  int;   -- evidence columns across both tables (expect 8)
    v_checks   int;   -- confidence CHECK constraints (expect 2)
    v_rel_proc int;   -- rebuilt relationship procs (expect 4)
BEGIN
    SELECT count(*) INTO v_ev_cols
      FROM information_schema.columns
     WHERE table_schema = 'semantics'
       AND table_name IN ('concept_relationship', 'representation_relationship')
       AND column_name IN ('evidence_source', 'evidence_type', 'confidence', 'evidence_notes');
    SELECT count(*) INTO v_checks
      FROM pg_constraint
     WHERE conname IN ('chk_concept_relationship_confidence', 'chk_representation_relationship_confidence');
    SELECT count(*) INTO v_rel_proc
      FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
     WHERE n.nspname = 'semantics'
       AND p.proname IN ('add_concept_relationship', 'update_concept_relationship',
                         'add_representation_relationship', 'update_representation_relationship')
       AND pg_get_function_identity_arguments(p.oid) LIKE '%numeric%';

    IF v_ev_cols <> 8 THEN RAISE EXCEPTION 'expected 8 evidence columns, got %', v_ev_cols; END IF;
    IF v_checks <> 2 THEN RAISE EXCEPTION 'expected 2 confidence CHECKs, got %', v_checks; END IF;
    IF v_rel_proc <> 4 THEN RAISE EXCEPTION 'expected 4 rebuilt relationship procs, got %', v_rel_proc; END IF;

    RAISE NOTICE 'V064 OK — evidence columns live on both relationship tables (8 cols, 2 CHECKs, 4 procs rebuilt)';
END $$;
