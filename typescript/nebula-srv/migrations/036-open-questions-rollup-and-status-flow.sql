-- Migration 036: Open Questions Roll-up and Requirement Status Flow
--
-- Extends migration 035 with:
--   1. Recursive roll-up: parent requirements inherit children's open questions
--   2. Status flow enforcement: Backlog → To Do → In Progress → Done
--   3. Work Request DAG: requirement with children is a DAG, any node blocks
--   4. Verification tracking: Engineer, Topologist, Architect must verify

-- ═══════════════════════════════════════════════════════════════════════
-- RECURSIVE ROLL-UP: hasOpenQuestions()
-- ═══════════════════════════════════════════════════════════════════════

-- Function: recursively check if requirement OR any descendant has open questions
CREATE OR REPLACE FUNCTION nebula.has_open_questions(req_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN EXISTS (
        WITH RECURSIVE descendants AS (
            -- Start with the requirement itself
            SELECT id FROM nebula.requirements_history 
            WHERE id = req_id
            
            UNION ALL
            
            -- Recurse to children
            SELECT r.id 
            FROM nebula.requirements_history r
            INNER JOIN descendants d ON r.parent_id = d.id
        )
        SELECT 1 
        FROM nebula.open_questions oq
        WHERE oq.requirement_id IN (SELECT id FROM descendants)
          AND oq.blocking = TRUE 
          AND oq.status IN ('OPEN', 'IN_DELIBERATION')
    );
END;
$$ LANGUAGE plpgsql;

-- Function: get all blocking questions (direct + inherited from children)
CREATE OR REPLACE FUNCTION nebula.get_blocking_questions(req_id UUID)
RETURNS TABLE(
    question_id UUID,
    question_title TEXT,
    category TEXT,
    status TEXT,
    source_requirement_id UUID,
    source_requirement_title TEXT,
    is_inherited BOOLEAN
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        -- Start with the requirement itself
        SELECT id, title FROM nebula.requirements_history 
        WHERE id = req_id
        
        UNION ALL
        
        -- Recurse to children
        SELECT r.id, r.title
        FROM nebula.requirements_history r
        INNER JOIN descendants d ON r.parent_id = d.id
    )
    SELECT 
        oq.id as question_id,
        oq.title as question_title,
        oq.category,
        oq.status,
        oq.requirement_id as source_requirement_id,
        d.title as source_requirement_title,
        (oq.requirement_id != req_id) as is_inherited
    FROM nebula.open_questions oq
    INNER JOIN descendants d ON d.id = oq.requirement_id
    WHERE oq.blocking = TRUE 
      AND oq.status IN ('OPEN', 'IN_DELIBERATION')
    ORDER BY is_inherited, oq.created_at;
END;
$$ LANGUAGE plpgsql;

-- Function: get requirement completion readiness (with inheritance)
CREATE OR REPLACE FUNCTION nebula.get_requirement_readiness_v2(req_id UUID)
RETURNS TABLE(
    can_complete BOOLEAN,
    direct_open INTEGER,
    inherited_open INTEGER,
    total_blocking INTEGER,
    child_count INTEGER
) AS $$
BEGIN
    RETURN QUERY
    WITH RECURSIVE descendants AS (
        SELECT id FROM nebula.requirements_history 
        WHERE id = req_id
        
        UNION ALL
        
        SELECT r.id 
        FROM nebula.requirements_history r
        INNER JOIN descendants d ON r.parent_id = d.id
    )
    SELECT 
        NOT EXISTS (
            SELECT 1 
            FROM nebula.open_questions oq
            WHERE oq.requirement_id IN (SELECT id FROM descendants)
              AND oq.blocking = TRUE 
              AND oq.status IN ('OPEN', 'IN_DELIBERATION')
        ) as can_complete,
        COUNT(*) FILTER (WHERE oq.requirement_id = req_id)::INTEGER as direct_open,
        COUNT(*) FILTER (WHERE oq.requirement_id != req_id)::INTEGER as inherited_open,
        COUNT(*)::INTEGER as total_blocking,
        (SELECT COUNT(*) - 1 FROM descendants)::INTEGER as child_count
    FROM nebula.open_questions oq
    WHERE oq.requirement_id IN (SELECT id FROM descendants)
      AND oq.blocking = TRUE 
      AND oq.status IN ('OPEN', 'IN_DELIBERATION');
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- REQUIREMENT STATUS FLOW
-- ═══════════════════════════════════════════════════════════════════════

-- Status flow:
--   Backlog → To Do (promotion from harvest)
--   To Do → In Progress (Planner greenlights)
--   To Do → Blocked (Planner creates agenda)
--   In Progress → Done (Implementation complete)
--   Blocked → To Do (Questions resolved)
--   In Progress → Blocked (New questions arise)

-- Function: check if status transition is valid
CREATE OR REPLACE FUNCTION nebula.can_transition_status(
    req_id UUID, 
    new_status TEXT
)
RETURNS TABLE(
    allowed BOOLEAN,
    reason TEXT
) AS $$
DECLARE
    current_status TEXT;
    has_blocking BOOLEAN;
BEGIN
    -- Get current status
    SELECT status INTO current_status
    FROM nebula.requirements_history
    WHERE id = req_id
      AND now() >= recorded_on_dt 
      AND now() < recorded_until_dt
      AND now() >= valid_from 
      AND now() < valid_until;
    
    -- Check blocking questions
    SELECT nebula.has_open_questions(req_id) INTO has_blocking;
    
    -- Validate transition
    RETURN QUERY
    SELECT 
        CASE
            -- Backlog → To Do (always allowed)
            WHEN current_status = 'Backlog' AND new_status = 'To Do' THEN TRUE
            
            -- To Do → In Progress (only if no blocking questions)
            WHEN current_status = 'To Do' AND new_status = 'In Progress' AND NOT has_blocking THEN TRUE
            
            -- To Do → Blocked (always allowed - Planner creating agenda)
            WHEN current_status = 'To Do' AND new_status = 'Blocked' THEN TRUE
            
            -- Blocked → To Do (only if no blocking questions)
            WHEN current_status = 'Blocked' AND new_status = 'To Do' AND NOT has_blocking THEN TRUE
            
            -- In Progress → Done (only if no blocking questions)
            WHEN current_status = 'In Progress' AND new_status = 'Done' AND NOT has_blocking THEN TRUE
            
            -- In Progress → Blocked (new questions arise)
            WHEN current_status = 'In Progress' AND new_status = 'Blocked' THEN TRUE
            
            -- Same status (no-op)
            WHEN current_status = new_status THEN TRUE
            
            -- Everything else blocked
            ELSE FALSE
        END as allowed,
        CASE
            WHEN current_status IS NULL THEN 'Requirement not found'
            WHEN has_blocking AND new_status IN ('In Progress', 'Done') THEN 
                'Cannot transition to ' || new_status || ' with blocking open questions'
            ELSE 'Invalid transition from ' || COALESCE(current_status, 'NULL') || ' to ' || new_status
        END as reason;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- WORK REQUEST DAG
-- ═══════════════════════════════════════════════════════════════════════

-- A requirement with children is a WorkRequest DAG
-- Any node with open questions blocks the entire DAG

-- View: requirement DAG status
CREATE OR REPLACE VIEW nebula.v_requirement_dag_status AS
WITH RECURSIVE dag AS (
    -- Root requirements (no parent)
    SELECT 
        r.id,
        r.title,
        r.status,
        r.parent_id,
        0 as depth,
        ARRAY[r.id] as path
    FROM nebula.requirements r
    WHERE r.parent_id IS NULL
    
    UNION ALL
    
    -- Child requirements
    SELECT 
        r.id,
        r.title,
        r.status,
        r.parent_id,
        d.depth + 1,
        d.path || r.id
    FROM nebula.requirements r
    INNER JOIN dag d ON r.parent_id = d.id
)
SELECT 
    d.id,
    d.title,
    d.status,
    d.parent_id,
    d.depth,
    d.path,
    COUNT(oq.id) as direct_questions,
    BOOL_OR(oq.blocking AND oq.status IN ('OPEN', 'IN_DELIBERATION')) as has_direct_blocking,
    -- Check if any descendant has blocking questions
    EXISTS (
        WITH RECURSIVE descendants AS (
            SELECT id FROM nebula.requirements_history WHERE id = d.id
            UNION ALL
            SELECT r.id FROM nebula.requirements_history r
            INNER JOIN descendants desc2 ON r.parent_id = desc2.id
        )
        SELECT 1 FROM nebula.open_questions oq2
        WHERE oq2.requirement_id IN (SELECT id FROM descendants)
          AND oq2.blocking = TRUE
          AND oq2.status IN ('OPEN', 'IN_DELIBERATION')
    ) as has_any_blocking
FROM dag d
LEFT JOIN nebula.open_questions oq ON oq.requirement_id = d.id
GROUP BY d.id, d.title, d.status, d.parent_id, d.depth, d.path;

-- ═══════════════════════════════════════════════════════════════════════
-- VERIFICATION TRACKING
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE nebula.requirement_verifications (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    requirement_id UUID NOT NULL,
    work_request_id UUID,  -- linked work request
    
    -- Verification details
    role TEXT NOT NULL,  -- 'engineer', 'topologist', 'architect'
    status TEXT NOT NULL DEFAULT 'PENDING',
        -- PENDING: not yet reviewed
        -- APPROVED: verified and approved
        -- REJECTED: needs changes
        -- DEFERRED: pushed to later
    
    -- Feedback
    feedback TEXT,
    conditions TEXT,  -- conditions for approval
    
    -- Audit
    verified_at TIMESTAMPTZ,
    expires_at TIMESTAMPTZ,  -- verification validity period
    
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    CONSTRAINT verification_status_check 
        CHECK (status IN ('PENDING', 'APPROVED', 'REJECTED', 'DEFERRED')),
    UNIQUE(requirement_id, work_request_id, role)
);

-- Index for querying verifications
CREATE INDEX idx_verification_requirement ON nebula.requirement_verifications(requirement_id);
CREATE INDEX idx_verification_work_request ON nebula.requirement_verifications(work_request_id);
CREATE INDEX idx_verification_status ON nebula.requirement_verifications(status);

-- Function: check if requirement is fully verified
CREATE OR REPLACE FUNCTION nebula.is_fully_verified(req_id UUID, wr_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 
        FROM nebula.requirement_verifications
        WHERE requirement_id = req_id
          AND work_request_id = wr_id
          AND status != 'APPROVED'
    );
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- UPDATED VIEWS
-- ═══════════════════════════════════════════════════════════════════════

-- View: requirements with full status (including inheritance)
CREATE OR REPLACE VIEW nebula.v_requirements_full_status AS
SELECT 
    r.id,
    r.title,
    r.status,
    r.priority,
    r.feature_id,
    r.parent_id,
    -- Direct questions
    COUNT(oq.id) as direct_questions,
    COUNT(oq.id) FILTER (WHERE oq.status = 'OPEN') as direct_open,
    -- Inherited questions (from children)
    (SELECT COUNT(*) FROM nebula.get_blocking_questions(r.id) WHERE is_inherited) as inherited_open,
    -- Total blocking
    (SELECT COUNT(*) FROM nebula.get_blocking_questions(r.id)) as total_blocking,
    -- Can complete
    nebula.can_complete_requirement(r.id) as can_complete,
    -- Has children
    EXISTS(SELECT 1 FROM nebula.requirements WHERE parent_id = r.id) as has_children,
    -- Child count
    (SELECT COUNT(*) FROM nebula.requirements WHERE parent_id = r.id) as child_count
FROM nebula.requirements r
LEFT JOIN nebula.open_questions oq ON oq.requirement_id = r.id
GROUP BY r.id, r.title, r.status, r.priority, r.feature_id, r.parent_id;

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON FUNCTION nebula.has_open_questions(UUID) IS 
    'Recursively checks if requirement OR any descendant has blocking open questions.';

COMMENT ON FUNCTION nebula.get_blocking_questions(UUID) IS 
    'Returns all blocking questions (direct + inherited from children).';

COMMENT ON FUNCTION nebula.get_requirement_readiness_v2(UUID) IS 
    'Returns detailed breakdown including inherited questions from children.';

COMMENT ON FUNCTION nebula.can_transition_status(UUID, TEXT) IS 
    'Validates if a status transition is allowed given blocking questions.';

COMMENT ON TABLE nebula.requirement_verifications IS 
    'Tracks verification by Engineer, Topologist, and Architect before Work Request enters conduit.';

COMMENT ON FUNCTION nebula.is_fully_verified(UUID, UUID) IS 
    'Returns TRUE if all roles have approved the Work Request for a requirement.';
