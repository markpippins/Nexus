-- Migration 035: Open Questions and Agenda integration
--
-- Open questions are blocking: a requirement cannot move to "Done" until
-- all its open questions are resolved.
--
-- Flow:
--   1. Requirement moves to "To Do"
--   2. Planner cron evaluates: sufficient detail?
--   3. If not: creates open questions, creates agenda for deliberation
--   4. Roles participate in deliberation, resolve questions
--   5. When all questions resolved: requirement can move to "Done"
--
-- Note: requirements is a view over requirements_history.
--       agendas and agenda_items already exist with different schemas.
--       We add open_questions as a new table and link to existing agenda_items.

-- ═══════════════════════════════════════════════════════════════════════
-- OPEN QUESTIONS
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE nebula.open_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    -- Link to requirement (nullable: some questions may be general)
    requirement_id UUID,  -- FK added after table creation
    
    -- Question details
    title TEXT NOT NULL,
    description TEXT,
    
    -- Classification
    category TEXT NOT NULL DEFAULT 'AMBIGUITY',  
        -- AMBIGUITY: unclear requirement
        -- MISSING_INFO: insufficient detail
        -- CONFLICT: contradicts another requirement
        -- SCOPE: out of scope for this requirement
        -- DEPENDENCY: blocked by another requirement
    
    -- Status lifecycle
    status TEXT NOT NULL DEFAULT 'OPEN',
        -- OPEN: awaiting resolution
        -- IN_DELIBERATION: agenda created, roles discussing
        -- RESOLVED: question answered
        -- WONT_FIX: question dismissed
        -- DEFERRED: pushed to later
    
    -- Blocking behavior
    blocking BOOLEAN NOT NULL DEFAULT TRUE,
        -- TRUE: requirement cannot complete until this is resolved
        -- FALSE: informational only
    
    -- Resolution
    resolution TEXT,
    resolved_by TEXT,  -- role that resolved it
    resolved_at TIMESTAMPTZ,
    
    -- Audit
    created_by TEXT NOT NULL,  -- role that identified it
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Validity window (for temporal tracking)
    valid_from TIMESTAMPTZ DEFAULT NOW(),
    valid_until TIMESTAMPTZ DEFAULT '9999-12-31',
    
    -- Constraints
    CONSTRAINT open_questions_status_check 
        CHECK (status IN ('OPEN', 'IN_DELIBERATION', 'RESOLVED', 'WONT_FIX', 'DEFERRED')),
    CONSTRAINT open_questions_category_check 
        CHECK (category IN ('AMBIGUITY', 'MISSING_INFO', 'CONFLICT', 'SCOPE', 'DEPENDENCY'))
);

-- Add FK constraint to requirements (which is a view, but we can reference the underlying history table)
-- Note: We'll use a trigger instead since requirements is a view
-- ALTER TABLE nebula.open_questions 
--     ADD CONSTRAINT open_questions_requirement_fk 
--     FOREIGN KEY (requirement_id) REFERENCES nebula.requirements_history(id);

-- Index for querying open questions by requirement
CREATE INDEX idx_open_questions_requirement ON nebula.open_questions(requirement_id);
CREATE INDEX idx_open_questions_status ON nebula.open_questions(status);
CREATE INDEX idx_open_questions_blocking ON nebula.open_questions(blocking) WHERE blocking = TRUE;

-- ═══════════════════════════════════════════════════════════════════════
-- AGENDA ITEMS LINK (links open questions to existing agenda_items)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE nebula.agenda_item_questions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    agenda_item_id UUID NOT NULL REFERENCES nebula.agenda_items(id) ON DELETE CASCADE,
    open_question_id UUID NOT NULL REFERENCES nebula.open_questions(id) ON DELETE CASCADE,
    
    -- Contribution tracking
    contributed_by TEXT NOT NULL,
    contributed_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- Constraints
    UNIQUE(agenda_item_id, open_question_id)
);

-- ═══════════════════════════════════════════════════════════════════════
-- ROLE DELIBERATION (tracks who participated)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE nebula.deliberation_participants (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    
    open_question_id UUID NOT NULL REFERENCES nebula.open_questions(id) ON DELETE CASCADE,
    
    -- Who participated
    role TEXT NOT NULL,
    participated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    
    -- What they contributed
    contribution TEXT,  -- their input/answer
    
    -- Constraints
    UNIQUE(open_question_id, role)
);

-- ═══════════════════════════════════════════════════════════════════════
-- VIEWS
-- ═══════════════════════════════════════════════════════════════════════

-- View: requirements with open question counts
CREATE OR REPLACE VIEW nebula.v_requirements_with_questions AS
SELECT 
    r.id,
    r.title,
    r.status,
    r.priority,
    r.feature_id,
    COUNT(oq.id) as total_questions,
    COUNT(oq.id) FILTER (WHERE oq.status = 'OPEN') as open_questions,
    COUNT(oq.id) FILTER (WHERE oq.status = 'IN_DELIBERATION') as in_deliberation,
    COUNT(oq.id) FILTER (WHERE oq.status = 'RESOLVED') as resolved_questions,
    BOOL_OR(oq.blocking AND oq.status IN ('OPEN', 'IN_DELIBERATION')) as has_blocking_questions
FROM nebula.requirements r
LEFT JOIN nebula.open_questions oq ON oq.requirement_id = r.id
GROUP BY r.id, r.title, r.status, r.priority, r.feature_id;

-- View: open questions with agenda context
CREATE OR REPLACE VIEW nebula.v_open_questions_with_context AS
SELECT 
    oq.id,
    oq.title,
    oq.description,
    oq.category,
    oq.status,
    oq.blocking,
    oq.requirement_id,
    r.title as requirement_title,
    r.status as requirement_status,
    oq.created_by,
    oq.created_at,
    oq.resolved_by,
    oq.resolved_at,
    COUNT(dp.id) as participant_count,
    ARRAY_AGG(DISTINCT dp.role) FILTER (WHERE dp.role IS NOT NULL) as participating_roles
FROM nebula.open_questions oq
LEFT JOIN nebula.requirements r ON r.id = oq.requirement_id
LEFT JOIN nebula.deliberation_participants dp ON dp.open_question_id = oq.id
GROUP BY oq.id, oq.title, oq.description, oq.category, oq.status, oq.blocking, 
         oq.requirement_id, r.title, r.status, oq.created_by, oq.created_at, 
         oq.resolved_by, oq.resolved_at;

-- ═══════════════════════════════════════════════════════════════════════
-- FUNCTIONS
-- ═══════════════════════════════════════════════════════════════════════

-- Function: check if requirement can move to "Done"
CREATE OR REPLACE FUNCTION nebula.can_complete_requirement(req_id UUID)
RETURNS BOOLEAN AS $$
BEGIN
    RETURN NOT EXISTS (
        SELECT 1 
        FROM nebula.open_questions 
        WHERE requirement_id = req_id 
          AND blocking = TRUE 
          AND status IN ('OPEN', 'IN_DELIBERATION')
    );
END;
$$ LANGUAGE plpgsql;

-- Function: get requirement completion readiness
CREATE OR REPLACE FUNCTION nebula.get_requirement_readiness(req_id UUID)
RETURNS TABLE(
    can_complete BOOLEAN,
    open_blocking INTEGER,
    in_deliberation_blocking INTEGER,
    total_blocking INTEGER
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        NOT EXISTS (
            SELECT 1 
            FROM nebula.open_questions 
            WHERE requirement_id = req_id 
              AND blocking = TRUE 
              AND status IN ('OPEN', 'IN_DELIBERATION')
        ) as can_complete,
        COUNT(*) FILTER (WHERE status = 'OPEN')::INTEGER as open_blocking,
        COUNT(*) FILTER (WHERE status = 'IN_DELIBERATION')::INTEGER as in_deliberation_blocking,
        COUNT(*)::INTEGER as total_blocking
    FROM nebula.open_questions 
    WHERE requirement_id = req_id 
      AND blocking = TRUE;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
-- COMMENTS
-- ═══════════════════════════════════════════════════════════════════════

COMMENT ON TABLE nebula.open_questions IS 
    'Questions that arise during requirement analysis. Blocking questions prevent requirement completion.';

COMMENT ON TABLE nebula.agenda_item_questions IS 
    'Links open questions to agenda items for deliberation.';

COMMENT ON TABLE nebula.deliberation_participants IS 
    'Tracks which roles participated in deliberating open questions.';

COMMENT ON FUNCTION nebula.can_complete_requirement(UUID) IS 
    'Returns TRUE if requirement has no blocking open questions.';

COMMENT ON FUNCTION nebula.get_requirement_readiness(UUID) IS 
    'Returns detailed breakdown of blocking questions for a requirement.';
