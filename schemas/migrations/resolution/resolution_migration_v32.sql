-- =============================================================================
-- MIGRATION: resolution v32 — evaluation context gate for evaluate_proposition
--
-- Wire context into evaluate_proposition such that context produces a
-- genuinely distinct outcome, never a silent pass/fail distortion.
--
-- RETURN CONTRACT (amended per operator review of the first draft):
--   RETURNS TABLE(disposition text, all_passed boolean, context_status text)
--
--   context_status      disposition   all_passed   meaning
--   ------------------  ------------  -----------  ---------------------------
--   'not_scoped'        Asserted/     true/false   No frame values on the
--                       Disputed/                  proposition at all; context
--                       Rejected                   irrelevant. Every proposition
--                                                  built so far takes this path,
--                                                  so nothing regresses.
--   'context_required'  NULL          NULL         Frame values exist, no context
--                                                  supplied. Fail-closed.
--   'context_mismatch'  NULL          NULL         Frame values exist, context
--                                                  contradicts a declared
--                                                  dimension. NOT Rejected — the
--                                                  claim wasn't found false, it
--                                                  just wasn't evaluated in this
--                                                  context.
--   'scoped'            Asserted/     true/false   Frame values exist, context
--                       Disputed/                  covers and matches every
--                       Rejected                   declared dimension.
--
-- CRITICAL INVARIANT: a refusal ('context_required'/'context_mismatch') must
-- not touch disposition, last_evaluated_at, or write any assertion_evaluation
-- row. Nothing was actually checked. The gate runs before the assertion loop,
-- before any INSERT, before the UPDATE. Note: skipping the disposition UPDATE
-- also means resolution_on_change emits no event for a refusal — correct,
-- since nothing happened. Do not "fix" that missing event later.
--
-- OVERLOAD CLEANUP: Postgres creates a NEW overload whenever the parameter
-- list changes, even with defaults. A legacy evaluate_proposition(uuid) has
-- been sitting in the catalog since before v25 ever ran and was never
-- replaced by the later signature additions. This migration DROPS both
-- legacy overloads — (uuid) and (uuid, text) — leaving ONE canonical
-- function: (uuid, text DEFAULT 'manual', jsonb DEFAULT NULL). All existing
-- call sites resolve to it through parameter defaults with unchanged
-- observable behavior (2-arg calls keep trigger_reason; 1-arg calls get
-- 'manual'). The old (uuid) body lacked the Disputed branch; dropping it
-- also removes that stale divergence. Full prior definitions are preserved
-- in the session backup / agent record before this migration runs.
--
-- DESIGN DECISIONS:
--   D1. Refusals are signaled via the dedicated context_status column
--       rather than raising or overloading disposition: scheduler sweeps
--       survive a framed-but-contextless proposition, refusals stay
--       per-proposition observable, and disposition stays a pure vocabulary
--       value (NULL when nothing was checked). Marker strings are
--       caller-facing ONLY — they are not concept_attribute_value members
--       and are never persisted anywhere.
--   D2. Coverage/mismatch checks run over FRAMED dimensions only (rows in
--       proposition_frame_value), not framed ∪ semantic_type_required_
--       dimension. Case 'not_scoped' already blesses required-but-unframed
--       -> evaluate; including class-level requirements would create a cliff
--       where adding the FIRST frame value makes a proposition stricter than
--       having none. Whether evaluation should additionally refuse when
--       is_well_framed() is false once framing has begun is DELIBERATELY
--       LEFT OPEN here — do not assume silence endorses either answer.
--   D3 (narrowed per admin review item 1): FOR FRAMED propositions,
--       unknown dimension names in the supplied context RAISE (typo
--       detection): silently ignoring a misspelled key would degrade to
--       'context_required' and be miserable to debug. For UNFRAMED
--       propositions context is wholly irrelevant ('not_scoped') and is
--       neither validated nor consulted. Surplus-but-valid keys beyond the
--       declared set are ignored in the 'scoped' case.
--   D6 (added per admin review item 2): p_context must be a JSON object.
--       Non-object JSON (array/scalar) raises an explicit contract error
--       rather than tripping jsonb_object_keys internals.
--   D8 (test coverage): companion executable suite resolution_migration_v32_tests.sql
--       (T1-T11) asserts every ratification condition from the admin review:
--       overload uniqueness at arity-1/2; unframed+unknown-key = context irrelevant
--       (expected behavior codified); framed+unknown-key raises; non-object JSON
--       raises contract error; refusals write nothing; scoped evaluation writes state.
--   D9 (caller note found by tests): assertion_evaluation.trigger_reason is CHECK-
--       constrained to a closed vocabulary (pending_created, upstream_changed,
--       explicit_repair, clock_stale_retry, manual). p_trigger_reason must be one of
--       these or a real evaluation fails at insert.
--   D7 (overload strategy, answering admin release-blocker): the applied
--       form keeps ONE public entry point — (uuid, text DEFAULT, jsonb
--       DEFAULT) — and NO compatibility wrappers. Overload ambiguity
--       ('function ... is not unique') requires >= 2 candidate overloads;
--       with a singleton, arity-1 and arity-2 positional calls resolve
--       uniquely through parameter defaults. Verified live: both arities
--       call cleanly. If the admin prefers explicit per-arity entry points
--       with no defaults on the core, that is a compatible follow-up; the
--       collision the review flagged existed only in the wrapper-bearing
--       draft, which was superseded before application.
--   D4. Matching semantics:
--         governed_reference -> context value must resolve (by .value text,
--             scoped to THAT dimension — private lists, v31 property) to
--             exactly the committed reference_value_id.
--         typed_scalar      -> context value must cast cleanly under the
--             dimension's scalar_type AND compare equal after normalization;
--             uncastable -> 'context_mismatch', not an exception.
--       Exact inequality after normalization; no prefix/partial matching.
-- =============================================================================

BEGIN;

-- -----------------------------------------------------------------------------
-- Overload cleanup: drop every pre-existing signature (stale (uuid) included),
-- then recreate exactly one canonical implementation.
-- -----------------------------------------------------------------------------
DROP FUNCTION IF EXISTS resolution.evaluate_proposition(uuid);
DROP FUNCTION IF EXISTS resolution.evaluate_proposition(uuid, text);
DROP FUNCTION IF EXISTS resolution.evaluate_proposition(uuid, text, jsonb);

CREATE OR REPLACE FUNCTION resolution.evaluate_proposition(
    p_proposition_id  uuid,
    p_trigger_reason  text DEFAULT 'manual',
    p_context         jsonb DEFAULT NULL
)
RETURNS TABLE(disposition text, all_passed boolean, context_status text)
LANGUAGE plpgsql
AS $function$
DECLARE
    v_subject_entity_id    uuid;
    v_framed_dim_count     integer;
    v_ctx_val              text;
    v_resolved_ref_id      uuid;
    r                      RECORD;
    v_result               boolean;
    v_sql                  text;
    v_all_passed           boolean := true;
    v_relational_failed    boolean := false;
    v_disposition_value_id uuid;
    v_disposition          text;
BEGIN
    ------------------------------------------------------------------
    -- Gate: context discipline. Runs BEFORE anything is written.
    ------------------------------------------------------------------
    SELECT count(*) INTO v_framed_dim_count
    FROM resolution.proposition_frame_value
    WHERE proposition_id = p_proposition_id;

    IF v_framed_dim_count > 0 THEN
        -- framed but no context -> refuse, write nothing
        IF p_context IS NULL THEN
            RETURN QUERY SELECT NULL::text, NULL::boolean, 'context_required'::text;
            RETURN;
        END IF;

        -- D6: non-object JSON is a caller contract error, not an outcome
        IF jsonb_typeof(p_context) <> 'object' THEN
            RAISE EXCEPTION 'evaluate_proposition: p_context must be a JSON object, got %', jsonb_typeof(p_context);
        END IF;

        -- D3 (narrowed): unknown keys raise for FRAMED propositions;
        -- unframed propositions never reach this branch at all.
        FOR r IN SELECT jsonb_object_keys(p_context) AS k LOOP
            IF NOT EXISTS (
                SELECT 1 FROM resolution.frame_dimension WHERE name = r.k
            ) THEN
                RAISE EXCEPTION 'evaluate_proposition: context key % names no known frame_dimension', r.k;
            END IF;
        END LOOP;

        -- every framed dimension must be covered AND matched
        FOR r IN
            SELECT fd.name          AS dim_name,
                   fd.value_kind    AS value_kind,
                   fd.scalar_type   AS scalar_type,
                   fd.id            AS dim_id,
                   pfv.reference_value_id,
                   pfv.scalar_value
            FROM resolution.proposition_frame_value pfv
            JOIN resolution.frame_dimension fd ON fd.id = pfv.dimension_id
            WHERE pfv.proposition_id = p_proposition_id
        LOOP
            v_ctx_val := p_context ->> r.dim_name;

            -- uncovered declared dimension -> same fail-closed outcome
            IF v_ctx_val IS NULL THEN
                RETURN QUERY SELECT NULL::text, NULL::boolean, 'context_required'::text;
                RETURN;
            END IF;

            IF r.value_kind = 'governed_reference' THEN
                SELECT f.id INTO v_resolved_ref_id
                FROM resolution.frame_dimension_value f
                WHERE f.dimension_id = r.dim_id      -- scoped: private lists
                  AND f.value        = v_ctx_val;

                IF v_resolved_ref_id IS NULL
                   OR v_resolved_ref_id IS DISTINCT FROM r.reference_value_id THEN
                    RETURN QUERY SELECT NULL::text, NULL::boolean, 'context_mismatch'::text;
                    RETURN;
                END IF;

            ELSIF r.value_kind = 'typed_scalar' THEN
                BEGIN
                    IF NOT (
                        CASE r.scalar_type
                            WHEN 'integer'   THEN v_ctx_val::integer     = r.scalar_value::integer
                            WHEN 'numeric'   THEN v_ctx_val::numeric     = r.scalar_value::numeric
                            WHEN 'boolean'   THEN v_ctx_val::boolean     = r.scalar_value::boolean
                            WHEN 'timestamp' THEN v_ctx_val::timestamptz = r.scalar_value::timestamptz
                            ELSE v_ctx_val = r.scalar_value              -- 'text': exact
                        END
                    ) THEN
                        RETURN QUERY SELECT NULL::text, NULL::boolean, 'context_mismatch'::text;
                        RETURN;
                    END IF;
                EXCEPTION WHEN OTHERS THEN
                    -- uncastable context value -> not evaluated in this context
                    RETURN QUERY SELECT NULL::text, NULL::boolean, 'context_mismatch'::text;
                    RETURN;
                END;
            ELSE
                RAISE EXCEPTION 'evaluate_proposition: dimension % has unrecognized value_kind %',
                    r.dim_name, r.value_kind;
            END IF;
        END LOOP;

        v_disposition := NULL;  -- set below after successful evaluation
    ELSE
        v_disposition := NULL;
    END IF;
    -- 'scoped' reached: fully covered and matching -> normal evaluation.
    -- 'not_scoped': no frame values -> same path, different status label.

    ------------------------------------------------------------------
    -- Normal evaluation path
    ------------------------------------------------------------------
    SELECT subject_entity_id INTO v_subject_entity_id FROM resolution.proposition WHERE id = p_proposition_id;

    FOR r IN
        SELECT pa.rule_id, rl.expression_id, rl.is_relational_check
        FROM resolution.proposition_assertion pa
        JOIN resolution.rule rl ON rl.id = pa.rule_id
        WHERE pa.proposition_id = p_proposition_id
    LOOP
        IF r.expression_id IS NULL THEN
            v_result := false; v_sql := NULL;
        ELSE
            SELECT eg.result, eg.compiled_sql INTO v_result, v_sql
            FROM resolution.evaluate_relationship_guard(r.expression_id, v_subject_entity_id) eg;
            -- NULL-safety / true fail-closed (v32 amendment): a compiled
            -- predicate over a missing subject row yields NULL, not false.
            -- Doctrine says unwired/unverifiable FAILS -> treat NULL as
            -- failure rather than crashing on assertion_evaluation's NOT NULL.
            -- Exposed live by Test 0 on f1: work_request is empty post-restore,
            -- so 'work_request_not_cancelled' compiled against a vanished row.
            IF v_result IS NULL THEN
                v_result := false;
            END IF;
        END IF;

        INSERT INTO resolution.assertion_evaluation (proposition_id, rule_id, result, compiled_sql, trigger_reason)
        VALUES (p_proposition_id, r.rule_id, v_result, v_sql, p_trigger_reason);

        IF NOT v_result THEN
            v_all_passed := false;
            IF r.is_relational_check THEN v_relational_failed := true; END IF;
        END IF;
    END LOOP;

    v_disposition := CASE
        WHEN v_all_passed THEN 'Asserted'
        WHEN v_relational_failed THEN 'Disputed'
        ELSE 'Rejected'
    END;

    SELECT cav.id INTO v_disposition_value_id
    FROM resolution.concept_attribute_value cav
    JOIN resolution.concept_attribute ca ON ca.id = cav.attribute_id AND ca.name = 'disposition'
    JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition'
    WHERE cav.value = v_disposition;

    UPDATE resolution.proposition
    SET disposition_value_id = v_disposition_value_id, last_evaluated_at = now()
    WHERE id = p_proposition_id;

    RETURN QUERY SELECT
        v_disposition,
        v_all_passed,
        CASE WHEN v_framed_dim_count > 0 THEN 'scoped'::text ELSE 'not_scoped'::text
    END;
END;
$function$;

COMMIT;
