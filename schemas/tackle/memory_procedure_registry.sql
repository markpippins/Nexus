-- ─────────────────────────────────────────────────────────────────────
-- tackle.memory + tackle.role_memory (bitemporal)
-- Part of the Role Memory Procedure Registry (#1006)
--
-- The tackle.memory table stores procedure bodies (the "what").
-- The tackle.role_memory table assigns procedures to roles with
-- as_of_dt / expiration_dt bitemporal validity (the "who knows what
-- and when").
--
-- Redis cache is populated from these tables by role-memory-srv:
--   mem:proc:{slug}       → full procedure JSON body
--   mem:idx:{role}        → [{slug, summary, tags}, ...]
--   mem:meta:last_updated → ISO timestamp
-- ─────────────────────────────────────────────────────────────────────

-- btree_gist is needed for the temporal exclusion constraint
CREATE EXTENSION IF NOT EXISTS btree_gist;

-- ── tackle.memory: procedure definitions ──────────────────────────

CREATE TABLE IF NOT EXISTS tackle.memory (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    slug        TEXT NOT NULL UNIQUE,
    title       TEXT NOT NULL,
    summary     TEXT NOT NULL DEFAULT '',
    body_md     TEXT NOT NULL DEFAULT '',        -- full procedure markdown
    tags        TEXT[] NOT NULL DEFAULT '{}',     -- categorization tags
    triggers    TEXT[] NOT NULL DEFAULT '{}',     -- keywords that match user requests
    mcp_tools   TEXT[] NOT NULL DEFAULT '{}',     -- tools needed to execute
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- ── tackle.role_memory: role→procedure assignment (bitemporal) ─────

CREATE TABLE IF NOT EXISTS tackle.role_memory (
    id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    memory_id     UUID NOT NULL REFERENCES tackle.memory(id) ON DELETE CASCADE,
    role          TEXT NOT NULL,
    as_of_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    expiration_dt TIMESTAMPTZ,         -- NULL = currently active
    created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- No overlapping active assignments for the same (memory, role) pair
    CONSTRAINT uq_role_memory_active
        EXCLUDE USING gist (
            memory_id WITH =,
            role WITH =,
            tstzrange(as_of_dt, expiration_dt) WITH &&
        )
);

-- Index for change-detection queries (used by memory_check_since)
CREATE INDEX IF NOT EXISTS idx_role_memory_as_of
    ON tackle.role_memory (role, as_of_dt DESC);

CREATE INDEX IF NOT EXISTS idx_role_memory_expiration
    ON tackle.role_memory (role, expiration_dt DESC NULLS FIRST);

-- ── Seed: initial procedures from AGENTS.md ──────────────────────

-- Helper: upsert a procedure and assign it to one or more roles
-- Uses a DO block so it's idempotent (re-runnable).

DO $$
DECLARE
    v_memory_id UUID;
    v_role TEXT;
    v_slugs TEXT[] := ARRAY[
        'rover-harvest-notification',
        'terrain-registration',
        'planning-elucidation',
        'proposal-capture',
        'nexus-boot-procedure',
        'plan-deletion-cleanup',
        'orphan-detection'
    ];
    v_existing TEXT;
BEGIN
    -- Only seed if no memory rows exist yet
    SELECT slug INTO v_existing FROM tackle.memory LIMIT 1;
    IF FOUND THEN
        RAISE NOTICE 'Memory table already seeded, skipping.';
        RETURN;
    END IF;

    -- ── 1. Rover Harvest Notification ──────────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'rover-harvest-notification',
        'Rover Harvest Notification',
        'After harvests, create cross-refs and notify Architect + Analyst.',
        E'## Procedure\n\n'
        '1. **Execute the harvest** using Rover. Always use yourself as the '
        'inference component — do not delegate to Ollama unless explicitly told.\n\n'
        '2. **Persist harvest output** to the database via `nebula_create_harvest` '
        '(or `POST /api/harvests`).\n\n'
        '3. **Create cross-references** linking the harvest to knowledge entities:\n'
        '   a. Direct references via `nebula_create_cross_reference` with '
        '`relType: "informs"` (harvest → entity) and `relType: "sourced_from"` '
        '(entity → harvest). Use `knowledge_list_entities` to find matching entities.\n'
        '   b. Run automated discovery scripts: `embed_harvests.py`, '
        '`embed_knowledge_entities.py`, `cross_schema_classifier.py`, '
        '`provenance_linker.py` (requires Ollama + pgvector).\n\n'
        '4. **Notify Architect and Analyst** via `nebula_create_agent_record`:\n'
        '   - `tags: ["to:architect", "status:open", "type:finding", "thread:..."]`\n'
        '   - `tags: ["to:analyst", "status:open", "type:finding", "thread:..."]`\n'
        '   - Same `threadRef` UUID for both so they share a conversation thread.\n'
        '   - Title: "New harvest material available: <topic/summary>"',
        ARRAY['harvest', 'post-processing', 'notification', 'cross-reference'],
        ARRAY['rover', 'harvest', 'chat transcript', 'nebula_create_harvest'],
        ARRAY['nebula_create_harvest', 'nebula_create_cross_reference',
              'knowledge_list_entities', 'nebula_create_agent_record']
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['engineer', 'engineer-ii', 'devops']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    -- ── 2. Terrain Registration ────────────────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'terrain-registration',
        'Terrain Registration',
        'Register services in terrain topology after building or deploying.',
        E'## Procedure\n\n'
        '1. **Identify the service** — name, type (api|db|queue|worker|ui), '
        'endpoint, health check, dependencies.\n\n'
        '2. **Call `terrain-mcp`** to register:\n'
        '   - `terrain_register_service` — create new entry\n'
        '   - `terrain_update_service` — update existing metadata\n'
        '   - Include: `name`, `type`, `endpoint`, `health_check`, '
        '`depends_on`, `metadata` (version, region, etc.)\n\n'
        '3. **Verify** via `terrain_list_services` — confirm the service '
        'appears with correct topology links.',
        ARRAY['deployment', 'infrastructure', 'service-registry', 'topology'],
        ARRAY['deploy', 'build', 'set up', 'service', 'register'],
        ARRAY['terrain_register_service', 'terrain_list_services']
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['engineer', 'engineer-ii', 'devops']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    -- ── 3. Planning Elucidation Workflow ───────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'planning-elucidation',
        'Planning Elucidation Workflow',
        'Elucidate a planning-plan before promoting it to pending.',
        E'## Procedure\n\n'
        '1. **Present the plan** — show title, goal, existing metadata.\n\n'
        '2. **Discuss scope** — "Which files or modules would this change affect?" '
        'Capture as `filesAffected`.\n\n'
        '3. **Refine Acceptance Criteria** — define concrete, testable criteria.\n\n'
        '4. **Identify Dependencies** — check if this plan depends on others.\n\n'
        '5. **Confirm** — present summary and get explicit user confirmation.\n\n'
        '6. **Persist metadata** via `update_plan` or `report_plan_metadata`.\n\n'
        '7. **Move to Pending** — call `issue_receipt` with `PLAN_CREATE`.',
        ARRAY['planning', 'elucidation', 'promotion'],
        ARRAY['discuss plan', 'promote plan', 'elucidate', 'planning plan'],
        ARRAY['conduit-mcp_update_plan', 'conduit-mcp_issue_receipt']
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['planner']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    -- ── 4. Proposal Capture ────────────────────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'proposal-capture',
        'Proposal Capture (Followup Preservation)',
        'Persist followup suggestions as proposed plans after completing work.',
        E'## Procedure\n\n'
        '1. After calling `suggest_followups`, call `create_proposed_plan` for '
        'each suggestion.\n'
        '2. Use the suggestion label as title and a brief description as goal.\n'
        '3. Pass the current promptRef for bidirectional audit trail: '
        'prompt → proposal → implementation plan.\n'
        '4. Proposed plans are lightweight ideas — no files or acceptance criteria.',
        ARRAY['proposal', 'followup', 'preservation'],
        ARRAY['suggest followup', 'after completing', 'propose', 'follow-up'],
        ARRAY['conduit-mcp_create_proposed_plan']
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['planner', 'engineer', 'engineer-ii', 'devops', 'architect']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    -- ── 5. Nexus Boot Procedure ────────────────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'nexus-boot-procedure',
        'Nexus Boot Procedure',
        'Minimum startup read set before making changes in nexus/.',
        E'## Procedure\n\n'
        'Load at minimum:\n'
        '1. `nexus/CLAUDE.md`\n'
        '2. `nexus/.agents/pipeline-mode.json`\n'
        '3. `nexus/.agents/OPERATING_MODEL.md`\n'
        '4. `nexus/.agents/skills/mode-router/SKILL.md`\n'
        '5. Current conduit-mcp pipeline state (query via GET /state)\n\n'
        'Additional .agents/ documents as needed, not indiscriminately.',
        ARRAY['bootstrap', 'startup', 'initialization'],
        ARRAY['start session', 'activate', 'boot', 'nexus'],
        ARRAY[]::TEXT[]
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['engineer', 'engineer-ii', 'devops', 'planner', 'architect',
                                  'builder', 'reviewer']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    -- ── 6. Plan Deletion & Ticket Cleanup ──────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'plan-deletion-cleanup',
        'Plan Deletion & Ticket Cleanup',
        'Soft-delete a plan, cancel its open tickets, and notify the UI.',
        E'## Procedure\n\n'
        '1. Call `conduit-mcp_delete_plan` with the plan number.\n'
        '   - Soft-deletes in DB (deleted=1)\n'
        '   - Removes .md files from all IMPLEMENTATION_PLANS/ subdirs\n'
        '   - Cancels open tickets with closure_reason = plan_deleted\n'
        '   - Calls removePlanFromMemory() on the watcher\n'
        '   - Emits plan_deleted SSE event to the UI\n\n'
        '2. For stuck plans that cannot be recovered, use '
        '`conduit-mcp_hard_delete_plan` (irreversible). Requires '
        'confirmPlanTitle to match as a safety guard.\n\n'
        '3. Running delete_plan on an already-deleted plan is safe — it '
        'cleans up residual watcher state.',
        ARRAY['plan', 'deletion', 'cleanup', 'ticket'],
        ARRAY['delete plan', 'remove plan', 'cancel plan', 'stuck plan'],
        ARRAY['conduit-mcp_delete_plan', 'conduit-mcp_hard_delete_plan']
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['builder', 'engineer', 'engineer-ii', 'devops']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    -- ── 7. Orphan Detection ────────────────────────────────────────
    INSERT INTO tackle.memory (slug, title, summary, body_md, tags, triggers, mcp_tools)
    VALUES (
        'orphan-detection',
        'Orphan Detection',
        'Check for inconsistencies between DB state and filesystem artifacts.',
        E'## Procedure\n\n'
        'The conduit MCP /health endpoint includes an orphanScan section:\n'
        '- Plans deleted in DB (deleted=1) that still have .md files on disk\n'
        '- .md files on disk with no corresponding DB row\n\n'
        'Use this as a periodic check. The watcher getState() also filters '
        'soft-deleted plans from the filesystem-driven cache.',
        ARRAY['orphan', 'inconsistency', 'health'],
        ARRAY['check health', 'orphan scan', 'inconsistency'],
        ARRAY[]::TEXT[]
    )
    RETURNING id INTO v_memory_id;

    FOREACH v_role IN ARRAY ARRAY['engineer', 'engineer-ii', 'devops', 'reviewer', 'inspector']::TEXT[]
    LOOP
        INSERT INTO tackle.role_memory (memory_id, role, as_of_dt, expiration_dt)
        VALUES (v_memory_id, v_role, NOW(), NULL);
    END LOOP;

    RAISE NOTICE 'Seeded % memory procedures and role assignments.', array_length(v_slugs, 1);
END $$;
