-- Migration 037: Role definitions table
--
-- Defines roles, their capabilities, constraints, and domain ownership.
-- This is the authoritative source for role-based access control and
-- cron process configuration.

-- ═══════════════════════════════════════════════════════════════════════
-- ROLES TABLE
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE nebula.roles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Identity
    name TEXT NOT NULL UNIQUE,
    display_name TEXT NOT NULL,
    description TEXT,
    
    -- Domain ownership
    owns_domains TEXT[] NOT NULL DEFAULT '{}',
        -- e.g., {'plan_proposals', 'requirement_readiness'}
    
    -- Capabilities
    can_greenlight BOOLEAN NOT NULL DEFAULT FALSE,
    can_create_questions BOOLEAN NOT NULL DEFAULT FALSE,
    can_create_agendas BOOLEAN NOT NULL DEFAULT FALSE,
    can_resolve_questions BOOLEAN NOT NULL DEFAULT FALSE,
    can_verify_work_requests BOOLEAN NOT NULL DEFAULT FALSE,
    
    -- Constraints
    max_open_questions INTEGER,  -- NULL = unlimited
    requires_approval_from TEXT[],  -- roles that must approve before action
    
    -- Cron configuration
    cron_enabled BOOLEAN NOT NULL DEFAULT FALSE,
    cron_expression TEXT,  -- e.g., '*/30 * * * *'
    cron_description TEXT,
    
    -- Escalation rules
    escalates_to TEXT[],  -- roles this role can escalate to
    escalation_triggers TEXT[],  -- what triggers escalation
    
    -- Knowledge stratification
    level_filter_primary TEXT NOT NULL DEFAULT 'level <= 2',
    level_filter_allowed TEXT NOT NULL DEFAULT 'level <= 3',
    visibility_scope TEXT[] NOT NULL DEFAULT '{planner, all}',
    
    -- Audit
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT roles_name_check CHECK (name ~ '^[a-z_]+$')
);

-- ═══════════════════════════════════════════════════════════════════════
-- SEED DATA: Core Roles
-- ═══════════════════════════════════════════════════════════════════════

INSERT INTO nebula.roles (
    name, display_name, description,
    owns_domains,
    can_greenlight, can_create_questions, can_create_agendas, 
    can_resolve_questions, can_verify_work_requests,
    cron_enabled, cron_expression, cron_description,
    escalates_to, escalation_triggers,
    level_filter_primary, level_filter_allowed, visibility_scope
) VALUES
-- Planner: intent evaluator
(
    'planner', 'Planner', 
    'Evaluates requirement readiness, identifies ambiguities, creates agendas for deliberation.',
    ARRAY['plan_proposals', 'requirement_readiness'],
    TRUE, TRUE, TRUE, TRUE, FALSE,
    TRUE, '*/30 * * * *', 'Scan ToDo requirements for readiness evaluation',
    ARRAY['architect', 'analyst'], ARRAY['architecture_concern', 'scope_too_broad'],
    'level <= 2', 'level <= 3', ARRAY['planner', 'all']
),
-- Architect: design authority
(
    'architect', 'Architect',
    'Owns architecture decisions, generates specifications, writes implementation plans.',
    ARRAY['architecture_decisions', 'specifications', 'implementation_plans'],
    FALSE, TRUE, FALSE, TRUE, TRUE,
    FALSE, NULL, NULL,
    ARRAY['topologist'], ARRAY['topology_conflict'],
    'level <= 3', 'level = 4', ARRAY['architect', 'all']
),
-- Analyst: issue triage and ambiguity resolution
(
    'analyst', 'Analyst',
    'Triages issues, resolves ambiguities, provides detail for unclear requirements.',
    ARRAY['issue_triage', 'ambiguity_resolution'],
    FALSE, TRUE, FALSE, TRUE, FALSE,
    TRUE, '*/15 * * * *', 'Monitor for new open questions requiring analysis',
    ARRAY['architect', 'planner'], ARRAY['requirement_unclear'],
    'level <= 3', 'level <= 3', ARRAY['analyst', 'all']
),
-- Engineer: implementation and verification
(
    'engineer', 'Engineer',
    'Implements features, verifies work requests for buildability.',
    ARRAY['implementation', 'build_verification'],
    FALSE, FALSE, FALSE, FALSE, TRUE,
    FALSE, NULL, NULL,
    ARRAY['architect'], ARRAY['design_concern'],
    'level <= 1', 'level <= 2', ARRAY['builder', 'all']
),
-- Topologist: system landscape verification
(
    'topologist', 'Topologist',
    'Verifies work requests fit the system landscape, checks topology constraints.',
    ARRAY['topology_verification', 'system_landscape'],
    FALSE, FALSE, FALSE, FALSE, TRUE,
    FALSE, NULL, NULL,
    ARRAY['architect'], ARRAY['topology_conflict'],
    'level <= 2', 'level <= 3', ARRAY['all']
),
-- Reviewer: review judgment
(
    'reviewer', 'Reviewer',
    'Reviews implementation for quality, approves or rejects changes.',
    ARRAY['review_judgment'],
    FALSE, FALSE, FALSE, FALSE, FALSE,
    FALSE, NULL, NULL,
    ARRAY['architect'], ARRAY['design_concern'],
    'level <= 2', 'level <= 2', ARRAY['reviewer', 'builder', 'all']
),
-- Inspector: compliance and governance
(
    'inspector', 'Inspector',
    'Checks compliance, identifies violations, enforces governance rules.',
    ARRAY['compliance', 'governance'],
    FALSE, TRUE, FALSE, TRUE, FALSE,
    TRUE, '*/15 * * * *', 'Monitor for compliance violations',
    ARRAY['architect'], ARRAY['governance_concern'],
    'level <= 3', 'level <= 3', ARRAY['all']
),
-- Builder: execution (subset of Engineer)
(
    'builder', 'Builder',
    'Executes implementation work as directed by conduit pipeline.',
    ARRAY['execution'],
    FALSE, FALSE, FALSE, FALSE, FALSE,
    FALSE, NULL, NULL,
    ARRAY['engineer', 'architect'], ARRAY['build_failure'],
    'level <= 1', 'level <= 1', ARRAY['builder']
);

-- ═══════════════════════════════════════════════════════════════════════
-- ROLE CAPABILITIES VIEW
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW nebula.v_role_capabilities AS
SELECT 
    name,
    display_name,
    owns_domains,
    CASE WHEN can_greenlight THEN '✓' ELSE '·' END as greenlight,
    CASE WHEN can_create_questions THEN '✓' ELSE '·' END as questions,
    CASE WHEN can_create_agendas THEN '✓' ELSE '·' END as agendas,
    CASE WHEN can_resolve_questions THEN '✓' ELSE '·' END as resolve,
    CASE WHEN can_verify_work_requests THEN '✓' ELSE '·' END as verify,
    CASE WHEN cron_enabled THEN cron_expression ELSE '·' END as cron,
    escalates_to
FROM nebula.roles
ORDER BY name;

-- ═══════════════════════════════════════════════════════════════════════
-- ROLE VALIDATION FUNCTION
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION nebula.can_role_perform(
    role_name TEXT,
    action TEXT
)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        SELECT 1 
        FROM nebula.roles r
        WHERE r.name = role_name
          AND (
            (action = 'greenlight' AND r.can_greenlight = TRUE)
            OR (action = 'create_questions' AND r.can_create_questions = TRUE)
            OR (action = 'create_agendas' AND r.can_create_agendas = TRUE)
            OR (action = 'resolve_questions' AND r.can_resolve_questions = TRUE)
            OR (action = 'verify_work_requests' AND r.can_verify_work_requests = TRUE)
          )
    );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON TABLE nebula.roles IS 
    'Role definitions with capabilities, constraints, and cron configuration.';

COMMENT ON FUNCTION nebula.can_role_perform(TEXT, TEXT) IS 
    'Validates if a role can perform a specific action.';
