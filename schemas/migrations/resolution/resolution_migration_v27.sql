-- Extensible, not a closed enum -- new semantic types will emerge, same
-- reasoning as owning_subsystem/concept_relationship.relationship_type
-- being open reference tables rather than baked-in CHECK constraints.
CREATE TABLE resolution.semantic_type (
    id                      uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name                    text UNIQUE NOT NULL,
    description             text,
    default_staleness_window interval  -- NULL = never stale by default for this kind of claim
);

INSERT INTO resolution.semantic_type (name, description, default_staleness_window) VALUES
    ('Configuration', 'A fact about how something is set up -- e.g. "service X runs on port 4042". Stable but not eternal.', interval '7 days'),
    ('Preference',    'An organizational or policy stance -- e.g. "prefer reuse over reinvention". Essentially never auto-stale.', NULL),
    ('Target',        'A goal or planning state -- e.g. "the migration is currently targeting Titanium". Changes with planning cycles.', interval '3 days'),
    ('HealthCheck',   'An operational status claim -- e.g. "this deployment is healthy". Highly volatile.', interval '5 minutes'),
    ('StructuralInvariant', 'A structural fact about the system model itself holding true -- e.g. rollup validity. Changes only when the structure changes.', interval '7 days'),
    ('RepresentationConsistency', 'Whether two representations of the same instance currently agree.', interval '5 minutes');

ALTER TABLE resolution.proposition ADD COLUMN semantic_type_id uuid REFERENCES resolution.semantic_type(id);

-- backfill real existing propositions with real classifications
UPDATE resolution.proposition SET semantic_type_id = (SELECT id FROM resolution.semantic_type WHERE name = 'HealthCheck')
WHERE id IN ('f1000000-0000-0000-0000-00000000f001', 'fa000000-0000-0000-0000-00000000fa01', 'fb000000-0000-0000-0000-00000000fb01');

UPDATE resolution.proposition SET semantic_type_id = (SELECT id FROM resolution.semantic_type WHERE name = 'StructuralInvariant')
WHERE id = 'f3000000-0000-0000-0000-00000000f003';

UPDATE resolution.proposition SET semantic_type_id = (SELECT id FROM resolution.semantic_type WHERE name = 'RepresentationConsistency')
WHERE id = 'f4000000-0000-0000-0000-00000000f004';

-- is_stale(): assertion-level overrides still win (tightest wins, as
-- proven before); only when NONE of a proposition's assertions specify a
-- window does it fall back to the proposition's own semantic_type default,
-- rather than defaulting straight to "never stale".
CREATE OR REPLACE FUNCTION resolution.is_stale(p_proposition_id uuid)
RETURNS boolean AS $$
DECLARE
    v_last_evaluated  timestamptz;
    v_tightest_window interval;
    v_type_default    interval;
BEGIN
    SELECT last_evaluated_at INTO v_last_evaluated FROM resolution.proposition WHERE id = p_proposition_id;
    IF v_last_evaluated IS NULL THEN
        RETURN false;
    END IF;

    SELECT min(rl.staleness_window) INTO v_tightest_window
    FROM resolution.proposition_assertion pa
    JOIN resolution.rule rl ON rl.id = pa.rule_id
    WHERE pa.proposition_id = p_proposition_id AND rl.staleness_window IS NOT NULL;

    IF v_tightest_window IS NULL THEN
        SELECT st.default_staleness_window INTO v_type_default
        FROM resolution.proposition p
        JOIN resolution.semantic_type st ON st.id = p.semantic_type_id
        WHERE p.id = p_proposition_id;
        v_tightest_window := v_type_default;
    END IF;

    IF v_tightest_window IS NULL THEN
        RETURN false;  -- no assertion override AND no semantic-type default -- never stale
    END IF;

    RETURN v_last_evaluated < now() - v_tightest_window;
END;
$$ LANGUAGE plpgsql;
