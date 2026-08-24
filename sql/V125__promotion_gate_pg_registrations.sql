-- ═══════════════════════════════════════════════════════════════════════
-- V125 — promotion-gate pg:* registrations (HALT criterion 1 slice)
--
-- Work order 38614661 (architect): register the promotion-gate's in-memory
-- SOL corpus (promotion_gate.py _build()) as first-class resolution rows so
-- the gate expression tree binds to live, queryable law instead of
-- import-time Python. This is the last engineering blocker before HALT
-- c19018b3 lifts.
--
-- House pattern (V106/V107): deterministic UUIDs, INSERT-only,
-- ON CONFLICT DO NOTHING (idempotent).
--
-- Pre-existing state honored (richer form kept):
--   * frame_dimension 'pg:system_mapped' with values true/false ALREADY
--     exists — verified, not re-inserted.
--   * The unprefixed 'PromotionCandidate' concept remains untouched; this
--     migration registers the gate-facing pg:PromotionCandidate alongside it.
--     Dual-naming question flagged for analyst review.
--
-- Analyst review points (semantic correctness):
--   A1. Composite rule flattened to a 5-operand AND (semantically equal to
--       the code's nested AND tree; nesting is cosmetic in SOLScript).
--   A2. Readiness operand uses literal 0.7 with a label pointing at the
--       governed threshold entity (promotion_min_readiness) — expression
--       schema has no threshold-ref kind yet; making it a first-class
--       reference needs a schema addition (out of scope here).
--   A3. subject_entity_id left NULL: resolution has no entity table for
--       pg:candidate to reference; the id stays in SOLScript-land until
--       v34's entity modeling lands.
--   A4. status allowed_values (pending/promoted/discarded/rejected) live in
--       concept_attribute descriptions only — concept_attribute has no
--       allowed_values column; consider a vocabulary table later.
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ── 1. Concept ────────────────────────────────────────────────────────

INSERT INTO resolution.concept (id, name, description)
VALUES (
  'd0000000-0000-0000-4000-800000000001',
  'pg:PromotionCandidate',
  'Harvest candidate under evaluation for promotion to requirement (gate-facing registration; concretizes unprefixed PromotionCandidate).'
)
ON CONFLICT (id) DO NOTHING;

-- ── 2. Concept attributes ─────────────────────────────────────────────

INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute)
VALUES
  ('d0000000-0000-0000-4000-800000000010',
   'd0000000-0000-0000-4000-800000000001',
   'pg:status',
   'Candidate lifecycle status. Allowed: pending/promoted/discarded/rejected (vocabulary enforced app-side; see analyst note A4).',
   'text', true),
  ('d0000000-0000-0000-4000-800000000011',
   'd0000000-0000-0000-4000-800000000001',
   'pg:compilation_readiness',
   'CPF compilation readiness score (0.0–1.0).',
   'numeric', false),
  ('d0000000-0000-0000-4000-800000000012',
   'd0000000-0000-0000-4000-800000000001',
   'pg:planner_questions',
   'True when the planner has posted any comment on the batch thread — blocks auto-promotion.',
   'boolean', false)
ON CONFLICT (id) DO NOTHING;

-- ── 3. Frame dimension pg:system_mapped + values true/false ──────────
-- Already present (verified live 2026-08-24); asserted here so apply fails
-- loudly if someone drops them between review and DBA apply.

DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM resolution.frame_dimension WHERE name = 'pg:system_mapped') THEN
    RAISE EXCEPTION 'pg:system_mapped frame dimension missing — expected pre-existing';
  END IF;
  IF (SELECT count(*) FROM resolution.frame_dimension_value fdv
      JOIN resolution.frame_dimension fd ON fd.id = fdv.dimension_id
      WHERE fd.name = 'pg:system_mapped'
        AND fdv.value IN ('true','false')) < 2 THEN
    RAISE EXCEPTION 'pg:system_mapped frame values true/false incomplete';
  END IF;
END $$;

-- ── 4. Expression tree: composite readiness invariant ────────────────
-- Root  d...020 : AND( ¬promoted, ¬discarded, ¬rejected, readiness≥0.7, planner_questions=false )
-- Leaves use the registered attribute ids; threshold literal annotated per A2.

INSERT INTO resolution.expression (id, kind, operator, return_type, label)
VALUES ('d0000000-0000-0000-4000-800000000020', 'operator', 'AND', 'boolean', 'pg:expr:and — all promotion-gate checks hold')
ON CONFLICT (id) DO NOTHING;

-- Comparison operators (children: attribute_ref + literal per kind-exclusivity CHECK)
INSERT INTO resolution.expression (id, kind, operator, return_type, label)
VALUES
  ('d0000000-0000-0000-4000-800000000021', 'operator', '<>', 'boolean', 'pg:status <> promoted'),
  ('d0000000-0000-0000-4000-800000000022', 'operator', '<>', 'boolean', 'pg:status <> discarded'),
  ('d0000000-0000-0000-4000-800000000023', 'operator', '<>', 'boolean', 'pg:status <> rejected'),
  ('d0000000-0000-0000-4000-800000000024', 'operator', '>=', 'boolean', 'pg:compilation_readiness >= governed promotion_min_readiness (A2)'),
  ('d0000000-0000-0000-4000-800000000025', 'operator', '=',  'boolean', 'pg:planner_questions == false')
ON CONFLICT (id) DO NOTHING;

-- Attribute-ref leaves
INSERT INTO resolution.expression (id, kind, attribute_id, return_type, label)
VALUES
  ('d0000000-0000-0000-4000-800000000031', 'attribute_ref', 'd0000000-0000-0000-4000-800000000010', 'text',    'pg:status'),
  ('d0000000-0000-0000-4000-800000000035', 'attribute_ref', 'd0000000-0000-0000-4000-800000000011', 'numeric', 'pg:compilation_readiness'),
  ('d0000000-0000-0000-4000-800000000037', 'attribute_ref', 'd0000000-0000-0000-4000-800000000012', 'boolean', 'pg:planner_questions')
ON CONFLICT (id) DO NOTHING;

-- Literals
INSERT INTO resolution.expression (id, kind, literal_value, return_type, label)
VALUES
  ('d0000000-0000-0000-4000-800000000032', 'literal', 'promoted', 'text',    chr(39)||'promoted'||chr(39)),
  ('d0000000-0000-0000-4000-800000000033', 'literal', 'discarded','text',    chr(39)||'discarded'||chr(39)),
  ('d0000000-0000-0000-4000-800000000034', 'literal', 'rejected', 'text',    chr(39)||'rejected'||chr(39)),
  ('d0000000-0000-0000-4000-800000000036', 'literal', '0.7',      'numeric', 'governed by promotion_min_readiness threshold entity (A2)'),
  ('d0000000-0000-0000-4000-800000000038', 'literal', 'false',    'boolean', 'false')
ON CONFLICT (id) DO NOTHING;

-- Operand wiring
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, position)
VALUES
  ('d0000000-0000-0000-4000-800000000020','d0000000-0000-0000-4000-800000000021',1),
  ('d0000000-0000-0000-4000-800000000020','d0000000-0000-0000-4000-800000000022',2),
  ('d0000000-0000-0000-4000-800000000020','d0000000-0000-0000-4000-800000000023',3),
  ('d0000000-0000-0000-4000-800000000020','d0000000-0000-0000-4000-800000000024',4),
  ('d0000000-0000-0000-4000-800000000020','d0000000-0000-0000-4000-800000000025',5),
  ('d0000000-0000-0000-4000-800000000021','d0000000-0000-0000-4000-800000000031',1),
  ('d0000000-0000-0000-4000-800000000021','d0000000-0000-0000-4000-800000000032',2),
  ('d0000000-0000-0000-4000-800000000022','d0000000-0000-0000-4000-800000000031',1),
  ('d0000000-0000-0000-4000-800000000022','d0000000-0000-0000-4000-800000000033',2),
  ('d0000000-0000-0000-4000-800000000023','d0000000-0000-0000-4000-800000000031',1),
  ('d0000000-0000-0000-4000-800000000023','d0000000-0000-0000-4000-800000000034',2),
  ('d0000000-0000-0000-4000-800000000024','d0000000-0000-0000-4000-800000000035',1),
  ('d0000000-0000-0000-4000-800000000024','d0000000-0000-0000-4000-800000000036',2),
  ('d0000000-0000-0000-4000-800000000025','d0000000-0000-0000-4000-800000000037',1),
  ('d0000000-0000-0000-4000-800000000025','d0000000-0000-0000-4000-800000000038',2)
ON CONFLICT DO NOTHING;

-- ── 5. Rule ───────────────────────────────────────────────────────────

INSERT INTO resolution.rule (id, name, rule_type, expression_id, severity, concept_id, notes)
VALUES (
  'd0000000-0000-0000-4000-800000000030',
  'pg:rule:and',
  'invariant',
  'd0000000-0000-0000-4000-800000000020',
  'hard',
  'd0000000-0000-0000-4000-800000000001',
  'candidate is ready for promotion (composite of five checks; see A1/A2)'
)
ON CONFLICT (id) DO NOTHING;

-- ── 6. Proposition pg:ready + frame binding ──────────────────────────

INSERT INTO resolution.proposition (id, title, description, asset_concept_id, subject_entity_id, disposition_value_id)
VALUES (
  'd0000000-0000-0000-4000-800000000040',
  'pg:ready',
  'A harvest candidate qualifies for automatic promotion to a requirement: status pending, compilation_readiness >= governed minimum, system mapping resolvable, planner questions absent.',
  'd0000000-0000-0000-4000-800000000001',
  NULL, -- A3: no entity table yet; pg:candidate stays SOLScript-side until v34
  '39e2b178-97ca-481a-b331-059a2e5f410a' -- disposition=Pending (existing seeded value)
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO resolution.proposition_frame_value (id, proposition_id, dimension_id, reference_value_id, scalar_value)
SELECT
  'd0000000-0000-0000-4000-800000000041',
  'd0000000-0000-0000-4000-800000000040',
  fd.id,
  fdv.id,
  NULL
FROM resolution.frame_dimension fd
JOIN resolution.frame_dimension_value fdv ON fdv.dimension_id = fd.id
WHERE fd.name = 'pg:system_mapped' AND fdv.value = 'true'
ON CONFLICT (id) DO NOTHING;

COMMIT;
