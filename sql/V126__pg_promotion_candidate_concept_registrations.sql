-- V126: Register pg:* PromotionCandidate concept surface in resolution
-- ====================================================================
-- HALT criterion 1 — unblock the SOL gate by registering the pg:*
-- concept, attributes, attribute values, and frame_dimension that
-- promotion_gate.py binds against.
--
-- Surface extracted from promotion_gate.py _build(), verified against
-- engineer-ii's handoff (7038e0df / 7be3698f).
--
-- Idempotent: all inserts use ON CONFLICT DO NOTHING.

BEGIN;

-- ── 1. pg:PromotionCandidate concept ──────────────────────────────

INSERT INTO resolution.concept (id, name, description)
VALUES ('b0000000-0000-0000-0000-000000000001',
        'PromotionCandidate',
        'Harvest candidate under evaluation for promotion to requirement')
ON CONFLICT (name) DO NOTHING;

-- ── 2. pg:status attribute ────────────────────────────────────────

INSERT INTO resolution.concept_attribute (id, concept_id, name, description,
                                          value_type, is_state_attribute)
VALUES ('b0000000-0000-0000-0000-000000000010',
        'b0000000-0000-0000-0000-000000000001',
        'status',
        'Candidate lifecycle status',
        'text',
        true)
ON CONFLICT (concept_id, name) DO NOTHING;

-- status allowed values
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description)
VALUES
  ('b0000000-0000-0000-0000-000000000011',
   'b0000000-0000-0000-0000-000000000010', 'pending',
   'Candidate has not yet been evaluated'),
  ('b0000000-0000-0000-0000-000000000012',
   'b0000000-0000-0000-0000-000000000010', 'promoted',
   'Candidate has been promoted to a requirement'),
  ('b0000000-0000-0000-0000-000000000013',
   'b0000000-0000-0000-0000-000000000010', 'discarded',
   'Candidate has been discarded'),
  ('b0000000-0000-0000-0000-000000000014',
   'b0000000-0000-0000-0000-000000000010', 'rejected',
   'Candidate has been rejected')
ON CONFLICT (attribute_id, value) DO NOTHING;

-- ── 3. pg:compilation_readiness attribute ─────────────────────────

INSERT INTO resolution.concept_attribute (id, concept_id, name, description,
                                          value_type, is_state_attribute)
VALUES ('b0000000-0000-0000-0000-000000000020',
        'b0000000-0000-0000-0000-000000000001',
        'compilation_readiness',
        'CPF compilation readiness score (0.0–1.0)',
        'numeric',
        false)
ON CONFLICT (concept_id, name) DO NOTHING;

-- ── 4. pg:planner_questions attribute ─────────────────────────────

INSERT INTO resolution.concept_attribute (id, concept_id, name, description,
                                          value_type, is_state_attribute)
VALUES ('b0000000-0000-0000-0000-000000000030',
        'b0000000-0000-0000-0000-000000000001',
        'planner_questions',
        'True when planner posted any comment on the batch thread — blocks auto-promotion',
        'boolean',
        false)
ON CONFLICT (concept_id, name) DO NOTHING;

-- ── 5. pg:system_mapped frame dimension ───────────────────────────

INSERT INTO resolution.frame_dimension (id, name, description, value_kind)
VALUES ('b0000000-0000-0000-0000-000000000100',
        'pg:system_mapped',
        'Whether the candidate has a resolvable system/subsystem mapping',
        'governed_reference')
ON CONFLICT (name) DO NOTHING;

-- frame dimension values
INSERT INTO resolution.frame_dimension_value
    (id, dimension_id, value, description)
VALUES
  ('b0000000-0000-0000-0000-000000000101',
   'b0000000-0000-0000-0000-000000000100', 'true',
   'Candidate has a confirmed system/subsystem mapping'),
  ('b0000000-0000-0000-0000-000000000102',
   'b0000000-0000-0000-0000-000000000100', 'false',
   'Candidate has no system/subsystem mapping')
ON CONFLICT (dimension_id, value) DO NOTHING;

COMMIT;