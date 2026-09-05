-- =============================================================================
-- MIGRATION: resolution v37 — Shrapnel field metadata synchronization
--
-- Purpose:
--   Keep the universal resolution.ShrapnelFact concept's attribute metadata
--   synchronized with shrapnel.field without copying any Shrapnel instance
--   values into resolution.concept_attribute_value.
--
-- Authority boundary:
--   * shrapnel.field remains authoritative for field names and EAV types.
--   * Shrapnel value/value_<type> rows remain authoritative for instances.
--   * Resolution owns the declarative ConceptAttribute metadata and bridge
--     evidence only.
--   * Field metadata is additive and immutable at this seam: changing a
--     field's property_name or field_type_code after synchronization fails
--     closed rather than leaving two incompatible projections.
--
-- Delivery:
--   * resolution.sync_shrapnel_field(field_id) is replayable and idempotent.
--   * resolution.reconcile_shrapnel_field_metadata() replays every field.
--   * shrapnel.field INSERTs invoke the sync through an AFTER trigger.
--   * Each distinct field metadata snapshot produces one append-only evidence
--     row; duplicate delivery does not create duplicate metadata or evidence.
--
-- Type mapping is closed and explicit:
--   1 bigint, 2 text, 3 double precision, 4 boolean, 5 timestamptz,
--   6 jsonb, 7 uuid. Unsupported codes fail closed.
-- =============================================================================

BEGIN;

CREATE TABLE IF NOT EXISTS resolution.shrapnel_field_sync_evidence (
    id                    uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    field_id              bigint NOT NULL,
    property_name         text NOT NULL,
    field_type_code       smallint NOT NULL,
    value_type            text NOT NULL,
    concept_attribute_id  uuid NOT NULL REFERENCES resolution.concept_attribute(id),
    action                text NOT NULL CHECK (action IN ('created', 'already_present')),
    metadata_fingerprint  text NOT NULL,
    synchronized_at       timestamptz NOT NULL DEFAULT now(),
    details               jsonb NOT NULL DEFAULT '{}'::jsonb,
    UNIQUE (field_id, metadata_fingerprint)
);

COMMENT ON TABLE resolution.shrapnel_field_sync_evidence IS
    'Append-only evidence for additive Shrapnel field -> ShrapnelFact metadata synchronization; contains no instance values.';

CREATE OR REPLACE FUNCTION resolution.prevent_shrapnel_field_sync_evidence_mutation()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    RAISE EXCEPTION 'shrapnel_field_sync_evidence is append-only';
END;
$function$;

DROP TRIGGER IF EXISTS trg_shrapnel_field_sync_evidence_no_update
    ON resolution.shrapnel_field_sync_evidence;
CREATE TRIGGER trg_shrapnel_field_sync_evidence_no_update
    BEFORE UPDATE ON resolution.shrapnel_field_sync_evidence
    FOR EACH ROW
    EXECUTE FUNCTION resolution.prevent_shrapnel_field_sync_evidence_mutation();

DROP TRIGGER IF EXISTS trg_shrapnel_field_sync_evidence_no_delete
    ON resolution.shrapnel_field_sync_evidence;
CREATE TRIGGER trg_shrapnel_field_sync_evidence_no_delete
    BEFORE DELETE ON resolution.shrapnel_field_sync_evidence
    FOR EACH ROW
    EXECUTE FUNCTION resolution.prevent_shrapnel_field_sync_evidence_mutation();

CREATE OR REPLACE FUNCTION resolution.sync_shrapnel_field(p_field_id bigint)
RETURNS text
LANGUAGE plpgsql
AS $function$
DECLARE
    v_concept_id       uuid;
    v_attr_id          uuid;
    v_property_name    text;
    v_type_code        smallint;
    v_value_type       text;
    v_fingerprint      text;
    v_previous         text;
    v_action           text;
BEGIN
    -- Serialize duplicate delivery for one authoritative field. This keeps
    -- the get-or-create path deterministic under concurrent trigger events;
    -- different fields remain fully concurrent.
    PERFORM pg_advisory_xact_lock(
        hashtextextended('resolution.shrapnel_field:' || p_field_id::text, 0)
    );

    SELECT c.id INTO v_concept_id
    FROM resolution.concept c
    WHERE c.name = 'ShrapnelFact'
      AND c.expired_at IS NULL
    LIMIT 1;

    IF v_concept_id IS NULL THEN
        RAISE EXCEPTION 'ShrapnelFact concept is not registered';
    END IF;

    SELECT f.property_name, f.field_type_code::smallint
    INTO v_property_name, v_type_code
    FROM shrapnel.field f
    WHERE f.id = p_field_id;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Shrapnel field % does not exist', p_field_id;
    END IF;

    IF v_property_name IS NULL OR btrim(v_property_name) = '' THEN
        RAISE EXCEPTION 'Shrapnel field % has an empty property_name', p_field_id;
    END IF;

    v_value_type := CASE v_type_code
        WHEN 1 THEN 'bigint'
        WHEN 2 THEN 'text'
        WHEN 3 THEN 'double precision'
        WHEN 4 THEN 'boolean'
        WHEN 5 THEN 'timestamptz'
        WHEN 6 THEN 'jsonb'
        WHEN 7 THEN 'uuid'
        ELSE NULL
    END;

    IF v_value_type IS NULL THEN
        RAISE EXCEPTION
            'unsupported Shrapnel field_type_code % for field %',
            v_type_code, p_field_id;
    END IF;

    v_fingerprint := md5(format('%s:%s:%s:%s',
        v_concept_id, p_field_id, v_property_name, v_type_code));

    -- A field identity cannot silently change shape after it has crossed the
    -- bridge. Labels/names may evolve, but property_name/type changes require
    -- a separately reviewed migration rather than an ambiguous re-sync.
    SELECT e.metadata_fingerprint INTO v_previous
    FROM resolution.shrapnel_field_sync_evidence e
    WHERE e.field_id = p_field_id
      AND e.metadata_fingerprint <> v_fingerprint
    LIMIT 1;

    IF v_previous IS NOT NULL THEN
        RAISE EXCEPTION
            'Shrapnel field % metadata changed after synchronization',
            p_field_id;
    END IF;

    SELECT ca.id, ca.value_type
    INTO v_attr_id, v_previous
    FROM resolution.concept_attribute ca
    WHERE ca.concept_id = v_concept_id
      AND ca.name = v_property_name;

    IF v_attr_id IS NULL THEN
        INSERT INTO resolution.concept_attribute
            (concept_id, name, description, value_type, is_state_attribute)
        VALUES (
            v_concept_id,
            v_property_name,
            'Synchronized from shrapnel.field metadata',
            v_value_type,
            false
        )
        RETURNING id INTO v_attr_id;
        v_action := 'created';
    ELSE
        IF v_previous <> v_value_type THEN
            RAISE EXCEPTION
                'Shrapnel field % conflicts with ShrapnelFact attribute %: % vs %',
                p_field_id, v_property_name, v_previous, v_value_type;
        END IF;
        v_action := 'already_present';
    END IF;

    INSERT INTO resolution.shrapnel_field_sync_evidence
        (field_id, property_name, field_type_code, value_type,
         concept_attribute_id, action, metadata_fingerprint, details)
    VALUES (
        p_field_id, v_property_name, v_type_code, v_value_type,
        v_attr_id, v_action, v_fingerprint,
        jsonb_build_object(
            'source', 'shrapnel.field',
            'target', 'resolution.concept_attribute',
            'instance_values_copied', false,
            'bridge_version', 'v37'
        )
    )
    ON CONFLICT (field_id, metadata_fingerprint) DO NOTHING;

    RETURN v_action;
END;
$function$;

COMMENT ON FUNCTION resolution.sync_shrapnel_field(bigint) IS
    'Replayable, additive, fail-closed metadata sync from shrapnel.field to ShrapnelFact; never copies EAV instance values.';

CREATE OR REPLACE FUNCTION resolution.reconcile_shrapnel_field_metadata()
RETURNS TABLE(processed integer, created integer, already_present integer)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_field_id bigint;
    v_action text;
BEGIN
    processed := 0;
    created := 0;
    already_present := 0;

    FOR v_field_id IN SELECT f.id FROM shrapnel.field f ORDER BY f.id LOOP
        v_action := resolution.sync_shrapnel_field(v_field_id);
        processed := processed + 1;
        IF v_action = 'created' THEN
            created := created + 1;
        ELSE
            already_present := already_present + 1;
        END IF;
    END LOOP;

    RETURN NEXT;
END;
$function$;

COMMENT ON FUNCTION resolution.reconcile_shrapnel_field_metadata() IS
    'Replay all Shrapnel field metadata through the v37 bridge; safe to rerun and produces append-only evidence.';

-- The trigger function lives in the source schema so field creation remains
-- event-driven at the authoritative metadata boundary. The called Resolution
-- function owns the cross-schema contract and fail-closed validation.
CREATE OR REPLACE FUNCTION shrapnel.sync_field_metadata_to_resolution()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    PERFORM resolution.sync_shrapnel_field(NEW.id);
    RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_sync_field_metadata_to_resolution ON shrapnel.field;
CREATE TRIGGER trg_sync_field_metadata_to_resolution
    AFTER INSERT OR UPDATE OF property_name, field_type_code ON shrapnel.field
    FOR EACH ROW
    EXECUTE FUNCTION shrapnel.sync_field_metadata_to_resolution();

-- Backfill/reconcile existing metadata once, using the same idempotent path
-- that future field events use. No EAV value table is touched.
SELECT * FROM resolution.reconcile_shrapnel_field_metadata();

COMMIT;
