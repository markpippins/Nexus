-- =============================================================================
-- TESTS: resolution v32 — evaluation-context gate for evaluate_proposition
--
-- Companion to resolution_migration_v32.sql. Run with psql against a database
-- where v32 is applied and the v32 scaffolding exists (frame_dimension
-- migration_phase/as_of_version, Target requirements, proposition fc,
-- rule fc_context_gate_probe). Exits nonzero on first failure via RAISE.
--
-- Explicitly covers the admin-review ratification conditions:
--   * OVERLOAD UNIQUENESS: arity-1 and arity-2 positional calls resolve to
--     the single canonical function without 'function ... is not unique'.
--   * UNFRAMED + UNKNOWN CONTEXT KEY (D3 narrowed): an unframed proposition
--     treats context as wholly irrelevant ('not_scoped') -- an unknown key is
--     neither validated nor consulted, per case-1 semantics. Documented
--     EXPECTED behavior, asserted here so silence is codified, not accidental.
--   * FRAMED + UNKNOWN KEY raises (typo detection).
--   * NON-OBJECT JSON (array/scalar) raises the explicit contract error.
--   * Refusals write nothing (assertion_evaluation/disposition/
--     last_evaluated_at untouched).
-- =============================================================================

DO $test$
DECLARE
    F1   constant uuid := 'f1000000-0000-0000-0000-00000000f001';  -- unframed HealthCheck
    FC   constant uuid := 'fc000000-0000-4000-8000-0000000000c1';  -- well-framed Target
    v_dispo text; v_passed boolean; v_status text;
    v_rows integer; v_evals_before integer; v_evals_after integer;
    v_lea timestamptz;
BEGIN
    ------------------------------------------------------------------
    -- T1/T2: overload uniqueness + unframed behavior (incl. unknown key)
    ------------------------------------------------------------------
    -- T1: arity-1 positional call resolves uniquely (no 'is not unique')
    SELECT disposition, all_passed, context_status INTO v_dispo, v_passed, v_status
    FROM resolution.evaluate_proposition(F1);
    IF v_status IS DISTINCT FROM 'not_scoped' THEN
        RAISE EXCEPTION 'T1 FAILED: unframed arity-1 call returned context_status %', v_status;
    END IF;

    -- T2: arity-2 positional call resolves uniquely
    SELECT disposition, all_passed, context_status INTO v_dispo, v_passed, v_status
    FROM resolution.evaluate_proposition(F1, 'manual');
    IF v_status IS DISTINCT FROM 'not_scoped' THEN
        RAISE EXCEPTION 'T2 FAILED: unframed arity-2 call returned context_status %', v_status;
    END IF;

    -- T3: UNFRAMED + UNKNOWN key -> context wholly irrelevant, evaluates
    -- normally with not_scoped. This codifies the narrowed-D3 ruling.
    SELECT disposition, all_passed, context_status INTO v_dispo, v_passed, v_status
    FROM resolution.evaluate_proposition(F1, 'manual', '{"no_such_dimension":"x"}');
    IF v_status IS DISTINCT FROM 'not_scoped' THEN
        RAISE EXCEPTION 'T3 FAILED: unframed+unknown-key returned context_status %', v_status;
    END IF;

    ------------------------------------------------------------------
    -- T4: framed + NO context -> context_required, writes NOTHING
    ------------------------------------------------------------------
    SELECT count(*) INTO v_evals_before FROM resolution.assertion_evaluation WHERE proposition_id=FC;
    SELECT last_evaluated_at INTO v_lea FROM resolution.proposition WHERE id=FC;

    SELECT disposition, all_passed, context_status INTO v_dispo, v_passed, v_status
    FROM resolution.evaluate_proposition(FC);
    IF v_status IS DISTINCT FROM 'context_required' OR v_dispo IS NOT NULL OR v_passed IS NOT NULL THEN
        RAISE EXCEPTION 'T4 FAILED: got %/%/%', v_dispo, v_passed, v_status;
    END IF;

    SELECT count(*) INTO v_evals_after FROM resolution.assertion_evaluation WHERE proposition_id=FC;
    IF v_evals_after <> v_evals_before THEN
        RAISE EXCEPTION 'T4 FAILED: refusal wrote assertion_evaluation rows (% -> %)', v_evals_before, v_evals_after;
    END IF;
    IF (SELECT last_evaluated_at FROM resolution.proposition WHERE id=FC) IS DISTINCT FROM v_lea THEN
        RAISE EXCEPTION 'T4 FAILED: refusal touched last_evaluated_at';
    END IF;

    ------------------------------------------------------------------
    -- T5: framed + PARTIAL context (as_of_version uncovered) -> context_required
    ------------------------------------------------------------------
    SELECT context_status INTO v_status FROM resolution.evaluate_proposition(FC,'manual','{"migration_phase":"pre_migration"}');
    IF v_status IS DISTINCT FROM 'context_required' THEN
        RAISE EXCEPTION 'T5 FAILED: uncovered dimension gave %', v_status;
    END IF;

    ------------------------------------------------------------------
    -- T6: contradicting governed value -> context_mismatch
    ------------------------------------------------------------------
    SELECT context_status INTO v_status FROM resolution.evaluate_proposition(FC,'manual',
        '{"migration_phase":"post_migration","as_of_version":"v1"}');
    IF v_status IS DISTINCT FROM 'context_mismatch' THEN
        RAISE EXCEPTION 'T6 FAILED: wrong governed ref gave %', v_status;
    END IF;

    ------------------------------------------------------------------
    -- T7: contradicting scalar -> context_mismatch
    ------------------------------------------------------------------
    SELECT context_status INTO v_status FROM resolution.evaluate_proposition(FC,'manual',
        '{"migration_phase":"pre_migration","as_of_version":"v9"}');
    IF v_status IS DISTINCT FROM 'context_mismatch' THEN
        RAISE EXCEPTION 'T7 FAILED: wrong scalar gave %', v_status;
    END IF;

    ------------------------------------------------------------------
    -- T8: FRAMED + UNKNOWN key -> raises (typo detection)
    ------------------------------------------------------------------
    BEGIN
        PERFORM * FROM resolution.evaluate_proposition(FC,'manual','{"bogus_dim":"x"}');
        RAISE EXCEPTION 'T8 FAILED: unknown key on framed proposition did not raise';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%names no known frame_dimension%' THEN
                RAISE EXCEPTION 'T8 FAILED: unexpected error: %', SQLERRM;
            END IF;
    END;

    ------------------------------------------------------------------
    -- T9/T10: non-object JSON -> explicit contract error
    ------------------------------------------------------------------
    BEGIN
        PERFORM * FROM resolution.evaluate_proposition(FC,'manual','["migration_phase"]');
        RAISE EXCEPTION 'T9 FAILED: array context did not raise';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%must be a JSON object%' THEN
                RAISE EXCEPTION 'T9 FAILED: unexpected error: %', SQLERRM;
            END IF;
    END;

    BEGIN
        PERFORM * FROM resolution.evaluate_proposition(FC,'manual','"x"');
        RAISE EXCEPTION 'T10 FAILED: scalar context did not raise';
    EXCEPTION
        WHEN OTHERS THEN
            IF SQLERRM NOT LIKE '%must be a JSON object%' THEN
                RAISE EXCEPTION 'T10 FAILED: unexpected error: %', SQLERRM;
            END IF;
    END;

    ------------------------------------------------------------------
    -- T11: full matching context -> scoped + normal evaluation (writes happen)
    ------------------------------------------------------------------
    SELECT disposition, all_passed, context_status INTO v_dispo, v_passed, v_status
    FROM resolution.evaluate_proposition(FC,'manual','{"migration_phase":"pre_migration","as_of_version":"v1"}');
    IF v_status IS DISTINCT FROM 'scoped' OR v_dispo IS NULL OR v_passed IS NULL THEN
        RAISE EXCEPTION 'T11 FAILED: scoped evaluation gave %/%/%', v_dispo, v_passed, v_status;
    END IF;
    SELECT count(*) INTO v_evals_after FROM resolution.assertion_evaluation WHERE proposition_id=FC;
    IF v_evals_after <= v_evals_before THEN
        RAISE EXCEPTION 'T11 FAILED: scoped evaluation wrote no assertion rows';
    END IF;
    IF (SELECT last_evaluated_at FROM resolution.proposition WHERE id=FC) IS NULL THEN
        RAISE EXCEPTION 'T11 FAILED: scoped evaluation did not set last_evaluated_at';
    END IF;

    RAISE NOTICE 'ALL v32 GATE TESTS PASSED (T1-T11)';
END;
$test$;
