-- V044: Add FKs for stable references (adjusted strategy)
--
-- Strategy:
--   harvest_candidates.harvest_id  → NO FK (historical churn, artifact_provenance handles it)
--   intent_records.candidate_id    → FK to harvest_candidates(id) [stable]
--   implementation_plans.requirement_id → NO FK (requirements is a VIEW)
--   work_requests.plan_id          → FK to implementation_plans(plan_number) [stable]
--   work_requests.source_requirement_id → NO FK (requirements is a VIEW)
--   work_requests.source_specification_id → FK to specifications(id) [stable]
--
-- Prerequisites: add PKs to implementation_plans and specifications

BEGIN;

-- =====================================================================
-- Step 1: Add PKs to tables missing them
-- =====================================================================

ALTER TABLE nebula.implementation_plans
    ADD CONSTRAINT implementation_plans_pkey PRIMARY KEY (id);

ALTER TABLE nebula.specifications
    ADD CONSTRAINT specifications_pkey PRIMARY KEY (id);

-- =====================================================================
-- Step 2: Fix implementation_plans.plan_number constraint
-- =====================================================================
-- Current: partial unique index (WHERE plan_number IS NOT NULL)
-- Need: full UNIQUE constraint for FK target

DROP INDEX IF EXISTS nebula.idx_implementation_plans_plan_number;

ALTER TABLE nebula.implementation_plans
    ADD CONSTRAINT uq_implementation_plans_plan_number
    UNIQUE (plan_number);

-- =====================================================================
-- Step 3: Add FKs
-- =====================================================================

-- intent_records.candidate_id → harvest_candidates(id)
ALTER TABLE nebula.intent_records
    ADD CONSTRAINT fk_intent_records_candidate
    FOREIGN KEY (candidate_id) REFERENCES nebula.harvest_candidates(id);

-- work_requests.plan_id → implementation_plans(plan_number)
ALTER TABLE nebula.work_requests
    ADD CONSTRAINT fk_work_requests_plan
    FOREIGN KEY (plan_id) REFERENCES nebula.implementation_plans(plan_number);

-- work_requests.source_specification_id → specifications(id)
ALTER TABLE nebula.work_requests
    ADD CONSTRAINT fk_work_requests_specification
    FOREIGN KEY (source_specification_id) REFERENCES nebula.specifications(id);

COMMIT;
