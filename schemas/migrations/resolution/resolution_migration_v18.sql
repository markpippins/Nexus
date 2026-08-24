-- =============================================================================
-- MIGRATION: resolution v17 -> v18
-- Proposition/Disposition layer. Proposition sits ABOVE Assertion (which is
-- unchanged -- rule+expression, already built): a Proposition is a coarser,
-- standing probe, composed of one or more Assertions via a plain join, and
-- its disposition is a judgment over their aggregate results, not a mirror
-- of any one boolean. This is the first time an evaluation gets PERSISTED
-- rather than just returned transiently -- closing a long-open gap.
-- =============================================================================

INSERT INTO resolution.concept (name, description) VALUES
    ('Proposition', 'A standing, coarser-grained probe/claim under investigation, composed of one or more Assertions'),
    ('Assertion',   'A sharp, binary-provable claim -- structurally, an existing resolution.rule + its expression');

CREATE TABLE resolution.proposition (
    id                 uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    title              text        NOT NULL,
    description        text,
    asset_concept_id   uuid        REFERENCES resolution.concept(id),   -- what this proposition is ABOUT
    subject_entity_id  uuid        NOT NULL,                            -- the specific instance, resolved via representation_identity
    disposition_value_id uuid      REFERENCES resolution.concept_attribute_value(id),
    created_at         timestamptz DEFAULT now() NOT NULL,
    valid_from         timestamptz DEFAULT now() NOT NULL,
    valid_until        timestamptz DEFAULT 'infinity' NOT NULL,
    recorded_on_dt     timestamptz DEFAULT now() NOT NULL,
    recorded_until_dt  timestamptz DEFAULT 'infinity' NOT NULL
);

-- disposition, governed the same way as every other lifecycle in this schema
INSERT INTO resolution.concept_attribute (concept_id, name, value_type, is_state_attribute)
SELECT id, 'disposition', 'enum', true FROM resolution.concept WHERE name = 'Proposition';

INSERT INTO resolution.concept_attribute_value (attribute_id, value)
SELECT ca.id, v.value
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition' AND ca.name = 'disposition',
     (VALUES ('Pending'),('Asserted'),('Disputed'),('Stale'),('Retracted'),('Rejected')) AS v(value);

INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name)
SELECT ca.id, 'resolution', 'proposition', 'disposition_value_id'
FROM resolution.concept_attribute ca
JOIN resolution.concept c ON c.id = ca.concept_id AND c.name = 'Proposition' AND ca.name = 'disposition';

-- legal transitions. v1 scope is deliberately narrow: the mechanical fast
-- path (Pending -> Asserted / Rejected) is fully handled by
-- evaluate_proposition() below. Disputed/Stale/Retracted transitions are
-- registered as legal shapes but nothing yet DRIVES them -- that's the
-- comparator/staleness-policy work still ahead, not built today.
INSERT INTO resolution.concept_state_transition (concept_id, from_value_id, to_value_id, name)
SELECT c.id, f.id, t.id, f.value || '_to_' || t.value
FROM resolution.concept c
JOIN resolution.concept_attribute ca ON ca.concept_id = c.id AND ca.name = 'disposition'
JOIN resolution.concept_attribute_value f ON f.attribute_id = ca.id
JOIN resolution.concept_attribute_value t ON t.attribute_id = ca.id
WHERE c.name = 'Proposition'
  AND (f.value, t.value) IN (
      ('Pending','Asserted'), ('Pending','Rejected'), ('Pending','Disputed'),
      ('Asserted','Disputed'), ('Asserted','Stale'), ('Asserted','Retracted'),
      ('Disputed','Retracted'), ('Stale','Pending')
  );

-- which Assertions bear on a Proposition -- a plain relational fact
INSERT INTO resolution.concept (name, description) VALUES
    ('PropositionAssertion', 'Links a Proposition to one of the Assertions (rules) that bear on it');

CREATE TABLE resolution.proposition_assertion (
    proposition_id  uuid NOT NULL REFERENCES resolution.proposition(id),
    rule_id         uuid NOT NULL REFERENCES resolution.rule(id),
    added_at        timestamptz DEFAULT now() NOT NULL,
    PRIMARY KEY (proposition_id, rule_id)
);

-- the persisted verification act + evidence -- the first time an
-- evaluation result survives past the function call that produced it.
CREATE TABLE resolution.assertion_evaluation (
    id              uuid        DEFAULT gen_random_uuid() NOT NULL PRIMARY KEY,
    proposition_id  uuid        NOT NULL REFERENCES resolution.proposition(id),
    rule_id         uuid        NOT NULL REFERENCES resolution.rule(id),
    result          boolean     NOT NULL,
    compiled_sql    text,
    evaluated_at    timestamptz DEFAULT now() NOT NULL
);
CREATE INDEX idx_assertion_evaluation_proposition ON resolution.assertion_evaluation (proposition_id, evaluated_at DESC);
