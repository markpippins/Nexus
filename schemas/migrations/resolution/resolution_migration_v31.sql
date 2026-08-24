-- =============================================================================
-- MIGRATION: resolution v31 — applicable_frames, split into class-level
-- schema (which dimensions matter) and instance-level commitment (concrete
-- values), per the user's hybrid instinct: the dimension itself carries the
-- rules for what counts as a valid value, not a generic string pair.
-- =============================================================================

-- frame_dimension is itself governed -- an open, extensible vocabulary of
-- axes (mirrors owning_subsystem/relationship_type's openness), but each
-- row declares its OWN value semantics, the same split concept_attribute
-- already uses (governed enum vs. open-typed).
CREATE TABLE resolution.frame_dimension (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name         text UNIQUE NOT NULL,
    description  text,
    value_kind   text NOT NULL CHECK (value_kind IN ('governed_reference', 'typed_scalar')),
    scalar_type  text CHECK (scalar_type IS NULL OR scalar_type IN ('text','integer','boolean','timestamp','numeric')),
    CHECK (
        (value_kind = 'typed_scalar' AND scalar_type IS NOT NULL) OR
        (value_kind = 'governed_reference' AND scalar_type IS NULL)
    )
);

-- per-dimension, NOT a global vocabulary -- 'jurisdiction' and 'environment'
-- each get their own private value list, never shared or cross-referenced.
CREATE TABLE resolution.frame_dimension_value (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    dimension_id  uuid NOT NULL REFERENCES resolution.frame_dimension(id),
    value         text NOT NULL,
    description   text,
    UNIQUE (dimension_id, value)
);

-- class-level: which dimensions a semantic_type requires to be well-formed
CREATE TABLE resolution.semantic_type_required_dimension (
    semantic_type_id  uuid NOT NULL REFERENCES resolution.semantic_type(id),
    dimension_id      uuid NOT NULL REFERENCES resolution.frame_dimension(id),
    PRIMARY KEY (semantic_type_id, dimension_id)
);

-- instance-level: this proposition's concrete commitment. Exactly one of
-- reference_value_id/scalar_value is set, enforced by CHECK; which one is
-- REQUIRED (and whether a scalar actually casts to its dimension's declared
-- type) is enforced by the trigger below, since that needs to look up the
-- dimension's own rules, not just check local column shape.
CREATE TABLE resolution.proposition_frame_value (
    id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    proposition_id      uuid NOT NULL REFERENCES resolution.proposition(id),
    dimension_id        uuid NOT NULL REFERENCES resolution.frame_dimension(id),
    reference_value_id  uuid REFERENCES resolution.frame_dimension_value(id),
    scalar_value        text,
    UNIQUE (proposition_id, dimension_id),
    CHECK (
        (reference_value_id IS NOT NULL AND scalar_value IS NULL) OR
        (reference_value_id IS NULL AND scalar_value IS NOT NULL)
    )
);

CREATE OR REPLACE FUNCTION resolution.validate_proposition_frame_value()
RETURNS trigger AS $$
DECLARE
    v_dim         resolution.frame_dimension%ROWTYPE;
    v_ref_dim_id  uuid;
BEGIN
    SELECT * INTO v_dim FROM resolution.frame_dimension WHERE id = NEW.dimension_id;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'no frame_dimension %', NEW.dimension_id;
    END IF;

    IF v_dim.value_kind = 'governed_reference' THEN
        IF NEW.reference_value_id IS NULL THEN
            RAISE EXCEPTION 'dimension % requires a governed reference value, not a scalar', v_dim.name;
        END IF;
        SELECT dimension_id INTO v_ref_dim_id FROM resolution.frame_dimension_value WHERE id = NEW.reference_value_id;
        IF v_ref_dim_id IS DISTINCT FROM NEW.dimension_id THEN
            RAISE EXCEPTION 'reference_value_id % belongs to a different dimension than %', NEW.reference_value_id, v_dim.name;
        END IF;

    ELSIF v_dim.value_kind = 'typed_scalar' THEN
        IF NEW.scalar_value IS NULL THEN
            RAISE EXCEPTION 'dimension % requires a scalar value, not a governed reference', v_dim.name;
        END IF;
        BEGIN
            CASE v_dim.scalar_type
                WHEN 'integer'   THEN PERFORM NEW.scalar_value::integer;
                WHEN 'numeric'   THEN PERFORM NEW.scalar_value::numeric;
                WHEN 'boolean'   THEN PERFORM NEW.scalar_value::boolean;
                WHEN 'timestamp' THEN PERFORM NEW.scalar_value::timestamptz;
                ELSE NULL;  -- 'text' needs no cast check
            END CASE;
        EXCEPTION WHEN OTHERS THEN
            RAISE EXCEPTION 'scalar_value % is not a valid % for dimension %', NEW.scalar_value, v_dim.scalar_type, v_dim.name;
        END;
    END IF;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_validate_proposition_frame_value
    BEFORE INSERT OR UPDATE ON resolution.proposition_frame_value
    FOR EACH ROW EXECUTE FUNCTION resolution.validate_proposition_frame_value();

-- the actual invariant: true only if every dimension the proposition's
-- semantic_type requires has a concrete value on the instance
CREATE OR REPLACE FUNCTION resolution.is_well_framed(p_proposition_id uuid)
RETURNS boolean AS $$
DECLARE
    v_missing_count integer;
BEGIN
    SELECT count(*) INTO v_missing_count
    FROM resolution.semantic_type_required_dimension std
    JOIN resolution.proposition p ON p.semantic_type_id = std.semantic_type_id
    WHERE p.id = p_proposition_id
      AND NOT EXISTS (
          SELECT 1 FROM resolution.proposition_frame_value pfv
          WHERE pfv.proposition_id = p_proposition_id AND pfv.dimension_id = std.dimension_id
      );
    RETURN v_missing_count = 0;
END;
$$ LANGUAGE plpgsql;
