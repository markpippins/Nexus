-- =============================================================================
-- MIGRATION: resolution v35 — frame semantics: meaning as first-class vocabulary
--
-- Motivation (engineer, 2026-08-24):
--   v31 introduced frame dimensions (context axes) and v32 made evaluation
--   context-gated. But those are the ENFORCEMENT half. The DESCRIPTION half —
--   what a dimension MEANS — still lived only in `frame_dimension.description`
--   prose, invisible to the proposition machinery. So the system could enforce
--   a context but could not reason ABOUT its own context vocabulary.
--
--   This migration makes "what a frame dimension means" first-class: a frame
--   dimension and its values become named concepts, and propositions can
--   describe them through a dedicated bridge. An agent can now ask "what does
--   `migration_phase` mean?" and receive checkable propositions, not prose.
--
-- Design:
--   * FrameDimension / FrameDimensionValue become resolution concepts (same
--     pattern as v28 seeding RoleLease, Evidence, etc. as vocabulary concepts).
--   * New semantic_type `FrameMeaning` classifies propositions that assert the
--     meaning or consequence of a dimension or value.
--   * New bridge `frame_dimension_meaning` links a proposition to the dimension
--     (whole-dimension meaning) or a specific value (value-level meaning).
--     Exactly one of dimension_id / frame_dimension_value_id is set.
--   * Meaning propositions are DESCRIPTIVE: their title/description carry the
--     semantics and they are queried/cross-referenced. They are deliberately
--     NOT framed via proposition_frame_value — a meaning proposition is ABOUT
--     context, not SCOPED BY it, so the v31/v32 gate must not refuse it.
--     A meaning proposition MAY later carry assertion rules when a consequence
--     becomes entity-checkable; that is an additive step, not required here.
--
-- Boundary with v31/v32 (unchanged):
--   v31/v32 = enforcement (does this claim apply in this context?)
--   v35     = description (what does this context axis signify?)
--
-- Idempotent: concepts/semantic_type via ON CONFLICT, bridge CREATE IF NOT
-- EXISTS, seeds guarded by existence checks keyed on title + dimension.
-- =============================================================================

BEGIN;

-- ── 1. Vocabulary concepts ────────────────────────────────────────────

INSERT INTO resolution.concept (name, description) VALUES
    ('FrameDimension',      'A named axis of evaluation context that scopes a proposition''s applicability'),
    ('FrameDimensionValue', 'A legal value within a frame dimension''s private vocabulary')
ON CONFLICT (name) DO NOTHING;

-- ── 2. semantic_type ──────────────────────────────────────────────────

INSERT INTO resolution.semantic_type (name, description, default_staleness_window)
VALUES (
    'FrameMeaning',
    'A proposition that asserts the meaning or consequence of a frame dimension or one of its values',
    interval '1 day'
)
ON CONFLICT (name) DO NOTHING;

-- ── 3. Bridge: proposition describes a frame dimension (or one value) ──

CREATE TABLE IF NOT EXISTS resolution.frame_dimension_meaning (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposition_id           uuid NOT NULL REFERENCES resolution.proposition(id),
    dimension_id             uuid REFERENCES resolution.frame_dimension(id),
    frame_dimension_value_id uuid REFERENCES resolution.frame_dimension_value(id),
    created_at               timestamptz NOT NULL DEFAULT now(),
    CHECK (
        (dimension_id IS NOT NULL AND frame_dimension_value_id IS NULL) OR
        (dimension_id IS NULL AND frame_dimension_value_id IS NOT NULL)
    ),
    UNIQUE (proposition_id, dimension_id, frame_dimension_value_id)
);

COMMENT ON TABLE resolution.frame_dimension_meaning IS
    'Links a proposition that describes the meaning of a frame dimension (or one of its values). This is the DESCRIPTION half of frame semantics; v31/v32 is the ENFORCEMENT half. Meaning propositions are about context, not scoped by it, so they carry no proposition_frame_value rows.';

-- ── 4. Seed meaning propositions for the live dimensions ──────────────
-- as_of_version, migration_phase (and its two governed values) are the
-- dimensions present in the live catalog at the time this migration was
-- authored. Seeds are idempotent (guarded by title + dimension).

DO $$
DECLARE
    v_fd_concept  uuid;
    v_fdv_concept uuid;
    v_frame_meaning uuid;
    v_dim         uuid;
    v_val         uuid;
    v_prop        uuid;
BEGIN
    SELECT id INTO v_fd_concept  FROM resolution.concept       WHERE name = 'FrameDimension';
    SELECT id INTO v_fdv_concept FROM resolution.concept       WHERE name = 'FrameDimensionValue';
    SELECT id INTO v_frame_meaning FROM resolution.semantic_type WHERE name = 'FrameMeaning';

    -- ── as_of_version (dimension-level) ─────────────────────────────
    SELECT id INTO v_dim FROM resolution.frame_dimension WHERE name = 'as_of_version';
    IF v_dim IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resolution.frame_dimension_meaning fdm
        JOIN resolution.proposition p ON p.id = fdm.proposition_id
        WHERE fdm.dimension_id = v_dim
          AND p.title = 'as_of_version pins the artifact version a claim is evaluated against'
    ) THEN
        INSERT INTO resolution.proposition (title, description, asset_concept_id, semantic_type_id)
        VALUES (
            'as_of_version pins the artifact version a claim is evaluated against',
            'A claim framed on as_of_version is version-pinned: its truth is asserted against one artifact version. A claim with no as_of_version frame is version-relative and may drift as the artifact set changes. Two claims at different as_of_version values are not automatically comparable — the version axis partitions their evaluation contexts.',
            v_fd_concept, v_frame_meaning
        )
        RETURNING id INTO v_prop;
        INSERT INTO resolution.frame_dimension_meaning (proposition_id, dimension_id)
        VALUES (v_prop, v_dim);
    END IF;

    -- ── migration_phase (dimension-level) ───────────────────────────
    SELECT id INTO v_dim FROM resolution.frame_dimension WHERE name = 'migration_phase';
    IF v_dim IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resolution.frame_dimension_meaning fdm
        JOIN resolution.proposition p ON p.id = fdm.proposition_id
        WHERE fdm.dimension_id = v_dim
          AND p.title = 'migration_phase partitions evaluation contexts by deployment cutover state'
    ) THEN
        INSERT INTO resolution.proposition (title, description, asset_concept_id, semantic_type_id)
        VALUES (
            'migration_phase partitions evaluation contexts by deployment cutover state',
            'migration_phase is a governed-reference frame dimension whose value selects which governing artifact set a claim is evaluated against. A claim evaluated pre_migration reflects the old contract; the same claim post_migration reflects the new contract. The dimension exists precisely so the two are never silently collapsed — a mismatch is context_mismatch, not agreement.',
            v_fd_concept, v_frame_meaning
        )
        RETURNING id INTO v_prop;
        INSERT INTO resolution.frame_dimension_meaning (proposition_id, dimension_id)
        VALUES (v_prop, v_dim);
    END IF;

    -- ── migration_phase = pre_migration (value-level) ───────────────
    SELECT fdv.id INTO v_val
    FROM resolution.frame_dimension_value fdv
    JOIN resolution.frame_dimension fd ON fd.id = fdv.dimension_id
    WHERE fd.name = 'migration_phase' AND fdv.value = 'pre_migration';
    IF v_val IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resolution.frame_dimension_meaning fdm
        JOIN resolution.proposition p ON p.id = fdm.proposition_id
        WHERE fdm.frame_dimension_value_id = v_val
          AND p.title = 'pre_migration means evaluation reflects the pre-cutover contract'
    ) THEN
        INSERT INTO resolution.proposition (title, description, asset_concept_id, semantic_type_id)
        VALUES (
            'pre_migration means evaluation reflects the pre-cutover contract',
            'When a claim is framed migration_phase=pre_migration, its evaluation context is the artifact set as it stood before cutover. The governing rules, representations, and authority bindings are the old ones. A pre_migration verdict does not transfer to the post_migration context.',
            v_fdv_concept, v_frame_meaning
        )
        RETURNING id INTO v_prop;
        INSERT INTO resolution.frame_dimension_meaning (proposition_id, frame_dimension_value_id)
        VALUES (v_prop, v_val);
    END IF;

    -- ── migration_phase = post_migration (value-level) ──────────────
    SELECT fdv.id INTO v_val
    FROM resolution.frame_dimension_value fdv
    JOIN resolution.frame_dimension fd ON fd.id = fdv.dimension_id
    WHERE fd.name = 'migration_phase' AND fdv.value = 'post_migration';
    IF v_val IS NOT NULL AND NOT EXISTS (
        SELECT 1 FROM resolution.frame_dimension_meaning fdm
        JOIN resolution.proposition p ON p.id = fdm.proposition_id
        WHERE fdm.frame_dimension_value_id = v_val
          AND p.title = 'post_migration means evaluation reflects the post-cutover contract'
    ) THEN
        INSERT INTO resolution.proposition (title, description, asset_concept_id, semantic_type_id)
        VALUES (
            'post_migration means evaluation reflects the post-cutover contract',
            'When a claim is framed migration_phase=post_migration, its evaluation context is the artifact set as it stands after cutover. The governing rules, representations, and authority bindings are the new ones. A post_migration verdict does not transfer to the pre_migration context.',
            v_fdv_concept, v_frame_meaning
        )
        RETURNING id INTO v_prop;
        INSERT INTO resolution.frame_dimension_meaning (proposition_id, frame_dimension_value_id)
        VALUES (v_prop, v_val);
    END IF;
END;
$$;

COMMIT;
