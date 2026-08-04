-- ═══════════════════════════════════════════════════════════════════════
--  V059 — semantics: seed the lookup layer (type-level legend)
--
--  Populates the curated lookup tables that let us describe the system:
--    • owning_subsystem      — the real subsystems of the fleet (stable
--                              smallint keys; names from nexus/typescript/*
--                              service packages and bin/ orchestration)
--    • concept               — the classes ("the legend, not the map"):
--                              the harvest → work-request pipeline spine
--                              from semantics-db.md, plus the Asset class
--    • concept_relationship  — the legal pipeline shape between classes,
--                              tagged green/red per semantics-db.md
--    • identity_strategy     — what identity means per concept (prose),
--                              the reconciliation root of the model
--
--  All inserts are idempotent (ON CONFLICT DO NOTHING / WHERE NOT EXISTS)
--  so the migration is safe to re-apply. App-level writes should still go
--  through the add_* stored procedures; this is a one-time curated seed.
--
--  Deliberately NOT seeded here (later migrations):
--    • representation / representation_relationship / consumer_operation
--      — physical-form rows (doc's Implementation-Plan example: WRP DAG
--      node, work_request table, Planner cache; Wind/Orb/Drift consumers)
--    • representation_identity — needs representations first
--    • Asset parentage — per doc decision, unbuilt until canonical Asset
--      identity lands
--
--  Usage:  psql -h localhost -U pguser -d nexus -f V059__semantics_seed_lookup.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. owning_subsystem — the fleet
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO semantics.owning_subsystem (id, name, description) VALUES
  ( 1, 'nebula',        'Core knowledge graph & record store — nebula-srv (:3101 REST), nebula-mcp (:3102 MCP); canonical store for agent records, harvests, candidates, requirements, plans'),
  ( 2, 'conduit',       'WorkRequest pipeline & execution orchestration — conduit-mcp (:3100), conduit-srv; tickets, receipts, WorkResultEvent append-only audit trail'),
  ( 3, 'assembly',      'Role forums, change-log, todos — assembly-srv (:3107); role- and model-attributed audit trail'),
  ( 4, 'tackle',        'Role memory & procedure cards — tackle-mcp (:3400), role-memory-srv (:3500)'),
  ( 5, 'cascade',       'Instance-level operational lineage graph — cascade-srv; cascade.lineage_edges (the "map" to semantics'' "legend")'),
  ( 6, 'harness',       'Agent execution harnesses — opencode (interactive), ollama-sdk (daemon), codex-cli (oneshot); harness-srv'),
  ( 7, 'wind',          'Projection engine — wind-srv; "Wind projection" consumer of implementation plans; wind-ui'),
  ( 8, 'harvest',       'Ingestion pipeline — DocLang → DAL → Rover → nebula.harvests/harvest_candidates (python/rover: candidate_promote, req_compiler)'),
  ( 9, 'peb',           'Pebble service — peb-srv, peb-mcp; peb-ui'),
  (10, 'knowledge',     'Semantic knowledge projection layer — knowledge-srv, knowledge-mcp; knowledge.semantic_documents'),
  (11, 'vision',        'Vision processing — vision-mcp; vision-ui'),
  (12, 'terrain',       'Terrain knowledge MCP — terrain-mcp'),
  (13, 'timeclock',     'Agent clock-in/out & heartbeat (:3600); (role, model, session_id) session identity'),
  (14, 'address-tts',   'Completion announcements via speech synthesis — address-tts-mcp (R6 TTS)'),
  (15, 'bitemporal-api','Chronal/bitemporal data API — bitemporal-api service'),
  (16, 'semantics',     'Type-level semantic topology legend — this schema (nexus DB)')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  2. concept — the classes
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO semantics.concept (name, description) VALUES
  ('Harvest',            'A raw ingestion run — chat transcript(s) captured into nebula.harvests'),
  ('SegmentSet',         'A recovered set of transcript segments (DocLang/DAL deterministic structure recovery)'),
  ('Candidate',          'A harvested idea in nebula.harvest_candidates; lifecycle pending → linked → useful → promoted | rejected'),
  ('IntentRecord',       'Pre-canonical intent record (nebula.intent_records); lightweight, draft status, source_type candidate|manual'),
  ('Requirement',        'Formal requirement — hierarchy placement, structured acceptance criteria, priority, req_type (Epic/Story/Task/Bug)'),
  ('Specification',      'Specification; requirements are member_of a specification on the green path'),
  ('ImplementationPlan', 'Compiled implementation plan (nebula.implementation_plans; auto-assigned plan_number, files_affected, acceptance_criteria)'),
  ('WorkRequest',        'Executable work request submitted to conduit-mcp (runtime_submit_work_request)'),
  ('Agenda',             'Agenda item — red-path basis_of target; candidates optionally matched via embeddings at promotion'),
  ('Question',           'Open question — red-path basis_of target'),
  ('Asset',              'Canonical asset class; the identity root other strategies tie to. Parentage lineage deliberately unbuilt until canonical Asset identity lands')
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  3. identity_strategy — what identity means per concept
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO semantics.identity_strategy (concept_id, canonical_key_description)
SELECT c.id, v.description
FROM (VALUES
  ('WorkRequest',        'entity_key — the conduit work-request entity key (runtime_submit_work_request payload). WRP DAG node, work_request table, and Planner cache representations all resolve through this key.'),
  ('ImplementationPlan', 'plan_number — auto-assigned by conduit-mcp on plan creation (nebula.implementation_plans.plan_number).'),
  ('Requirement',        'requirement_id — the nebula.requirements UUID; req_compiler.py resolves hierarchy + acceptance criteria via this id.'),
  ('Candidate',          'candidate UUID — nebula.harvest_candidates.id; stable across promotion (promoted-from-candidate tag) and dedup gates.'),
  ('IntentRecord',       'intent_record UUID — nebula.intent_records.id; lightweight pre-canonical identity before decomposition.'),
  ('Asset',              'canonical_asset_id — the canonical asset identifier; the identity root that other concepts'' strategies ultimately tie to (lineage structure pending).')
) AS v(concept_name, description)
JOIN semantics.concept c ON c.name = v.concept_name AND c.expired_at IS NULL
ON CONFLICT DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  4. concept_relationship — the legal pipeline shape (green/red paths)
--     The 9 rows from semantics-db.md, plus 3 harvest-pipeline rows
--     (Harvest→SegmentSet, Candidate→IntentRecord, IntentRecord→Requirement).
--     Asset parent_of Asset is deliberately omitted (doc decision).
-- ═══════════════════════════════════════════════════════════════════════
INSERT INTO semantics.concept_relationship
    (from_concept_id, to_concept_id, relationship_type, path, notes)
SELECT fc.id, tc.id, v.rel_type, v.path, v.notes
FROM (VALUES
  ('Harvest',           'SegmentSet',         'produces',          NULL,   NULL),
  ('SegmentSet',        'Candidate',          'produces',          NULL,   NULL),
  ('Candidate',         'IntentRecord',       'produces',          NULL,   'Promotion gate: candidate_promote.py (CPF >= 0.7, dedup gate, promoted-from-candidate tag)'),
  ('IntentRecord',      'Requirement',        'produces',          NULL,   'Decomposition step — currently manual (the pipeline gap); direct candidate→requirement also legal via requirements.candidate_id FK'),
  ('Candidate',         'Requirement',        'produces',          NULL,   'Direct path — requirements.candidate_id FK exists in schema (no automation)'),
  ('Requirement',       'Requirement',        'spawns',            NULL,   'Child / nested requirements (parent_id)'),
  ('Requirement',       'Specification',      'member_of',         'green', NULL),
  ('Specification',     'ImplementationPlan', 'transforms_into',   'green', NULL),
  ('ImplementationPlan','WorkRequest',        'transforms_into',   'green', 'req_compiler.py: compile → create plan + cross_reference compiles_to → runtime_submit_work_request'),
  ('Requirement',       'Agenda',             'basis_of',          'red',   NULL),
  ('Requirement',       'Question',           'basis_of',          'red',   NULL),
  ('WorkRequest',       'WorkRequest',        'provenance_of',     'red',   'Failed run or inspection flag feeding a subsequent WorkRequest (trigger reason kept as prose per doc decision)')
) AS v(from_name, to_name, rel_type, path, notes)
JOIN semantics.concept fc ON fc.name = v.from_name AND fc.expired_at IS NULL
JOIN semantics.concept tc ON tc.name = v.to_name AND tc.expired_at IS NULL
WHERE NOT EXISTS (
    SELECT 1
    FROM semantics.concept_relationship cr
    JOIN semantics.concept f2 ON f2.id = cr.from_concept_id
    JOIN semantics.concept t2 ON t2.id = cr.to_concept_id
    WHERE f2.name = v.from_name AND t2.name = v.to_name
      AND cr.relationship_type = v.rel_type
      AND cr.expired_at IS NULL
);

-- ═══════════════════════════════════════════════════════════════════════
--  5. VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════
DO $$
DECLARE
    v_subsys  integer;
    v_concepts integer;
    v_strategies integer;
    v_edges   integer;
    v_green   integer;
    v_red     integer;
    v_unpath  integer;
BEGIN
    SELECT count(*) INTO v_subsys    FROM semantics.owning_subsystem WHERE expired_at IS NULL;
    SELECT count(*) INTO v_concepts  FROM semantics.concept WHERE expired_at IS NULL;
    SELECT count(*) INTO v_strategies FROM semantics.identity_strategy WHERE expired_at IS NULL;
    SELECT count(*) INTO v_edges     FROM semantics.concept_relationship WHERE expired_at IS NULL;
    SELECT count(*) INTO v_green     FROM semantics.concept_relationship WHERE expired_at IS NULL AND path = 'green';
    SELECT count(*) INTO v_red       FROM semantics.concept_relationship WHERE expired_at IS NULL AND path = 'red';
    SELECT count(*) INTO v_unpath    FROM semantics.concept_relationship WHERE expired_at IS NULL AND path IS NULL;

    RAISE NOTICE 'owning_subsystem=%, concepts=%, identity_strategies=%, edges=% (green=%, red=%, unpath=%)',
                 v_subsys, v_concepts, v_strategies, v_edges, v_green, v_red, v_unpath;

    IF v_subsys < 10 THEN RAISE EXCEPTION 'V059 verification failed: too few subsystems (%)', v_subsys; END IF;
    IF v_concepts <> 11 THEN RAISE EXCEPTION 'V059 verification failed: expected 11 concepts, got %', v_concepts; END IF;
    IF v_edges <> 12 THEN RAISE EXCEPTION 'V059 verification failed: expected 12 edges, got %', v_edges; END IF;
    IF v_green <> 3 OR v_red <> 3 THEN RAISE EXCEPTION 'V059 verification failed: expected 3 green / 3 red, got % / %', v_green, v_red; END IF;
    RAISE NOTICE '✅ V059 applied — semantics lookup layer seeded.';
END $$;

COMMIT;
