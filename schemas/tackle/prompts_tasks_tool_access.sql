-- ─────────────────────────────────────────────────────────────────────
-- tackle.prompts + tackle.tasks + tackle.role_tool_access
-- Architect decision: record d708c452-b8b1-4589-af99-064d75185ec9 (2026-07-25, BINDING)
-- Engineer intent:    record 81b7f09a-cf70-4036-b910-5668b367b3da
--
-- This migration implements the schema-only portion (steps 1-3) of the
-- six-step implementation scope from the Architect's decision. Steps 4-6
-- (prompt content migration, per-role allowlist population, aggregator
-- bootstrap integration) are tracked as separate follow-up plans because
-- they touch nexus/python/operator_svc/ and nexus/typescript/tools-aggregator/.
--
-- Conventions mirrored from nexus/schemas/tackle/memory_procedure_registry.sql
-- and verified against the live PG schema on 2026-07-25:
--   - id UUID PRIMARY KEY DEFAULT gen_random_uuid()
--   - TEXT (not VARCHAR) for all string columns — VARCHAR without length
--     == TEXT in PG. The decision doc says VARCHAR; we use TEXT for
--     consistency with the existing tackle.roles.name FK target (TEXT).
--     This is a non-deviation from the binding decision.
--   - created_at/updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
--   - FK to tackle.roles(name) (natural key), matching fk_role_memory_role,
--     fk_sessions_agent_role, fk_config_bundle_role, fk_agent_scheduler_role
--   - CREATE TABLE IF NOT EXISTS + CREATE INDEX IF NOT EXISTS for idempotency
-- ─────────────────────────────────────────────────────────────────────

-- ── 1. tackle.prompts: reusable, versioned prompt templates ─────────
--
-- One row per (role, slug, version). Templates are parameterized
-- (e.g. {task_title}, {criteria}) and reusable across tasks. Different
-- access pattern from tackle.memory procedure cards: prompts are
-- ASSEMBLED at agent launch; procedure cards are CONSULTED on demand.
--
-- Q1b decision: prompts live in their own table, NOT in tackle.memory
-- as a record_type discriminator. Different access patterns justified
-- the separation.

CREATE TABLE IF NOT EXISTS tackle.prompts (
    id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role              TEXT NOT NULL,
    slug              TEXT NOT NULL,          -- template slug, e.g. "operator-launch"
    version           INTEGER NOT NULL DEFAULT 1,
    title             TEXT NOT NULL,
    body_md           TEXT NOT NULL DEFAULT '',  -- parameterized prompt body
    parameter_schema  JSONB NOT NULL DEFAULT '{}'::jsonb,
                                                -- names + descriptions of {placeholders}
                                                -- the body expects, for static validation
    tags              TEXT[] NOT NULL DEFAULT '{}',
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A role cannot have two templates with the same (slug, version).
    -- NOTE: there is intentionally NO global UNIQUE(slug, version). The
    -- same slug+version can belong to multiple roles (e.g. the
    -- 'opencode-persona' template exists once per role, all at v1).
    -- `tackle.tasks.prompt_id` resolves the template unambiguously
    -- because `prompt_id` is a UUID PK, so we don't need (slug, version)
    -- to be globally unique for task referencing.
    CONSTRAINT uq_prompts_role_slug_version
        UNIQUE (role, slug, version),

    -- Version numbering starts at 1 and must be positive. New revisions
    -- of an existing template bump the version rather than mutating the
    -- row in place, so historical launches stay reproducible.
    CONSTRAINT chk_prompts_version_positive
        CHECK (version >= 1),

    -- FK to roles. A prompt must belong to a known role.
    CONSTRAINT fk_prompts_role
        FOREIGN KEY (role) REFERENCES tackle.roles(name)
);

-- Lookups by role (launch-time: "give me the prompts for role X")
CREATE INDEX IF NOT EXISTS idx_prompts_role
    ON tackle.prompts (role);

-- Lookups by slug (latest version lookup, etc.)
CREATE INDEX IF NOT EXISTS idx_prompts_slug
    ON tackle.prompts (slug);

-- ── 2. tackle.tasks: concrete task assignments ─────────────────────
--
-- A task binds (role, task_slug, scope, acceptance_criteria, prompt_id).
-- Launched agents pick up tasks by id or by (role, task_slug). The
-- prompt is assembled from the referenced template at launch time —
-- the task row does not store the rendered prompt text.
--
-- prompt_id FK uses ON DELETE RESTRICT deliberately: deleting a prompt
-- template that tasks still reference would orphan those tasks. To
-- retire a template, expire it (a future column or a new version) rather
-- than hard-deleting the row. ON DELETE CASCADE would silently break
-- historical task reproducibility.

CREATE TABLE IF NOT EXISTS tackle.tasks (
    id                   UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role                 TEXT NOT NULL,
    task_slug            TEXT NOT NULL,         -- e.g. "boot-verify-services"
    scope                TEXT NOT NULL DEFAULT '',
                                               -- what the task is scoped to
                                               -- (free-form: a plan ref, a
                                               -- subsystem, a file path, etc.)
    acceptance_criteria  TEXT[] NOT NULL DEFAULT '{}',
                                               -- concrete, testable criteria
    prompt_id            UUID NOT NULL,
    active               BOOLEAN NOT NULL DEFAULT TRUE,
                                               -- FALSE = retired/superseded;
                                               -- default-allowlist semantics
                                               -- (no grandfathered implicit
                                               -- access) apply: only active
                                               -- rows are picked up at launch
    created_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A role cannot have two active tasks with the same task_slug. This
    -- unique constraint is over (role, task_slug) regardless of active,
    -- so once a task_slug is used it cannot be re-used for a different
    -- task even after retirement — bump task_slug or version the row
    -- via id if you need a successor. (Keeps launch lookups unambiguous.)
    CONSTRAINT uq_tasks_role_task_slug
        UNIQUE (role, task_slug),

    -- FK to prompts. RESTRICT: see comment above the CREATE TABLE.
    CONSTRAINT fk_tasks_prompt
        FOREIGN KEY (prompt_id)
        REFERENCES tackle.prompts(id) ON DELETE RESTRICT,

    -- FK to roles. A task must be assigned to a known role.
    CONSTRAINT fk_tasks_role
        FOREIGN KEY (role) REFERENCES tackle.roles(name)
);

-- Primary launch lookup: "what tasks does role X have?"
CREATE INDEX IF NOT EXISTS idx_tasks_role
    ON tackle.tasks (role);

-- Quick filter to active tasks only (the common launch path)
CREATE INDEX IF NOT EXISTS idx_tasks_role_active
    ON tackle.tasks (role, active);

-- Reverse lookup: "which tasks reference prompt X?" (for impact analysis
-- before retiring a template)
CREATE INDEX IF NOT EXISTS idx_tasks_prompt
    ON tackle.tasks (prompt_id);

-- ── 3. tackle.role_tool_access: default-deny positive allowlist ────
--
-- Q2 decision: per-tool-slug granularity with an mcp_id convenience
-- rollup column. tool_slug is the fully-qualified aggregator name
-- (e.g. "conduit-mcp_query_conduit_state").
--
-- Q3 decision: DEFAULT-DENY + positive allowlist. A row grants access.
-- No rows = zero tools. No deny table, no deny column. The operator
-- role's current implicit "212 tools indiscriminately" path must be
-- re-expressed as explicit allowlist rows — no grandfathered implicit
-- access. (Population of those rows is step 5, a follow-up plan.)

CREATE TABLE IF NOT EXISTS tackle.role_tool_access (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    role        TEXT NOT NULL,
    mcp_id      TEXT NOT NULL,         -- parent MCP server identifier
                                       -- (e.g. "conduit-mcp")
    tool_slug   TEXT NOT NULL,         -- fully-qualified aggregator name
                                       -- (e.g. "conduit-mcp_query_conduit_state")
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    -- A role cannot have duplicate grants for the same tool.
    CONSTRAINT uq_role_tool_access_role_tool
        UNIQUE (role, tool_slug),

    -- FK to roles. An ACL row must reference a known role.
    CONSTRAINT fk_role_tool_access_role
        FOREIGN KEY (role) REFERENCES tackle.roles(name)
);

-- Index on (mcp_id) for bulk queries: "show me all tools from conduit-mcp
-- across all roles" or "which roles have any tool from MCP X?"
CREATE INDEX IF NOT EXISTS idx_role_tool_access_mcp_id
    ON tackle.role_tool_access (mcp_id);

-- Index on (tool_slug) for the reverse query: "which roles may call tool X?"
CREATE INDEX IF NOT EXISTS idx_role_tool_access_tool_slug
    ON tackle.role_tool_access (tool_slug);

-- ── Migration version stamp ──────────────────────────────────────────
-- tackle.schema_version is the canonical migration ledger. version is
-- INTEGER (verified against information_schema 2026-07-25; latest applied
-- is 6). This migration is version 7. Use ON CONFLICT so this is
-- idempotent on re-run.

INSERT INTO tackle.schema_version (version, description, applied_at)
VALUES (
    7,
    'tackle.prompts (reusable versioned prompt templates, one row per ' ||
    '(role,slug,version)) + tackle.tasks (concrete task assignments, FK ' ||
    'prompt_id -> prompts.id ON DELETE RESTRICT, binds role/task_slug/' ||
    'scope/acceptance_criteria/prompt_id) + tackle.role_tool_access ' ||
    '(per-tool-slug default-deny positive allowlist with mcp_id rollup, ' ||
    'UNIQUE(role, tool_slug), INDEX(mcp_id)). Architect decision ' ||
    'd708c452. Schema-only portion (steps 1-3 of 6); prompt content ' ||
    'migration, allowlist population, and aggregator bootstrap are ' ||
    'follow-up plans.',
    NOW()
)
ON CONFLICT (version) DO UPDATE
    SET description = EXCLUDED.description,
        applied_at  = EXCLUDED.applied_at;
