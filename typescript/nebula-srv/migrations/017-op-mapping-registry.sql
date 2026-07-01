-- ═══════════════════════════════════════════════════════════════════════
--  Migration 017 — Op Mapping Registry
--
--  Creates the versioned Op Mapping Registry table in the nebula schema.
--  This is the compiler's "instruction selection table" — a deterministic
--  dictionary that binds Implementation Plan intent patterns → WorkRequest
--  opcode sequences.
--
--  From the locked CCNF/WRP spec:
--    "If it's not in the registry, it cannot compile."
--
--  Design principles:
--    1. IMMUTABLE — once published, entries are never modified in place.
--       Changes use FORK (new version) or DEPRECATE (soft retire).
--    2. VERSIONED — every intent mapping has a version string.
--    3. AUDITABLE — full created/updated/deleted_at trace.
--    4. REFERENCED — WorkRequests can link back to the exact registry
--       version that compiled them.
--
--  Registry evolution (ADD / DEPRECATE / FORK only):
--    - ADD:       new intent mapping, no side effects
--    - DEPRECATE: mark active → deprecated, point to replacement
--    - FORK:      create new version of an existing intent (v1 → v2)
--
--  Run AFTER: 016-move-plans-to-nebula-schema.sql
--  Usage:
--    psql -h localhost -U pguser -d nexus -f 017-op-mapping-registry.sql
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  1. Create the op_registry table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS nebula.op_registry (
    -- Unique identifier for this intent mapping (e.g., "INIT_SERVICE_SCAFFOLD")
    id              TEXT PRIMARY KEY,

    -- Intent identifier — groups versions of the same semantic intent
    intent_id       TEXT NOT NULL,

    -- Semantic version string (e.g., "v1", "v2")
    version         TEXT NOT NULL DEFAULT 'v1',

    -- Registry entry status
    --   active:     currently used for compilation
    --   deprecated: still usable for existing WorkRequests, but new compilations
    --               should use the replacement
    --   superseded: replaced by a newer version, kept for historical reproducibility
    status          TEXT NOT NULL DEFAULT 'active'
                    CHECK (status IN ('active', 'deprecated', 'superseded')),

    -- Human-readable label for this mapping
    label           TEXT NOT NULL DEFAULT '',

    -- Text patterns to match against Implementation Plan goal/goal nodes
    -- (e.g., ['initialize service', 'create service scaffold', 'bootstrap service'])
    -- Used by the intent classifier to select the right mapping.
    match_patterns  TEXT[] NOT NULL DEFAULT '{}',

    -- JSON array of opcode sequence templates.
    -- Each template entry: { "op": "CREATE_DIR", "target": "{{service_root}}", ... }
    -- Parameters use {{mustache}} syntax and are resolved at compile time.
    opcode_template JSONB NOT NULL DEFAULT '[]'::jsonb,

    -- Required parameter names (must be provided at compile time)
    -- (e.g., ["service_root", "python_version"])
    required_params TEXT[] NOT NULL DEFAULT '{}',

    -- Optional parameter names
    optional_params TEXT[] NOT NULL DEFAULT '{}',

    -- Precondition descriptions (informational, used for validation)
    preconditions   TEXT[] NOT NULL DEFAULT '{}',

    -- Postcondition descriptions
    postconditions  TEXT[] NOT NULL DEFAULT '{}',

    -- Default idempotency key template (may include {{param}} references)
    idempotency_key TEXT NOT NULL DEFAULT '',

    -- If deprecated or superseded, the successor entry ID
    successor_id    TEXT REFERENCES nebula.op_registry(id),

    -- Human-readable notes about this mapping (why it exists, what changed)
    notes           TEXT NOT NULL DEFAULT '',

    -- Schema version of this entry (for future migration compatibility)
    schema_version  INTEGER NOT NULL DEFAULT 1,

    -- Temporal tracking
    created_at      TEXT NOT NULL,
    updated_at      TEXT NOT NULL,
    deleted_at      TEXT
);

-- Uniqueness: intent_id + version is unique
CREATE UNIQUE INDEX IF NOT EXISTS idx_op_registry_intent_version
    ON nebula.op_registry(intent_id, version)
    WHERE deleted_at IS NULL;

-- Index for active status lookups
CREATE INDEX IF NOT EXISTS idx_op_registry_status
    ON nebula.op_registry(status)
    WHERE deleted_at IS NULL;

-- Index for pattern matching lookups
CREATE INDEX IF NOT EXISTS idx_op_registry_patterns
    ON nebula.op_registry USING GIN(match_patterns)
    WHERE deleted_at IS NULL AND status = 'active';

-- ═══════════════════════════════════════════════════════════════════════
--  2. Validation function: validate opcode template against the ISA
-- ═══════════════════════════════════════════════════════════════════════

-- This function checks that every opcode in a registry template is a known
-- ISA opcode with valid parameters. It raises an exception if invalid.
CREATE OR REPLACE FUNCTION nebula.validate_opcode_template()
RETURNS TRIGGER AS $$
DECLARE
    v_op           TEXT;
    v_entry        JSONB;
    v_valid_ops    TEXT[] := ARRAY[
        -- Filesystem
        'CREATE_DIR', 'DELETE_DIR', 'MOVE_PATH', 'COPY_PATH',
        'WRITE_FILE', 'APPEND_FILE', 'READ_FILE', 'RENAME_PATH',
        -- Environment
        'INIT_VENV', 'INSTALL_DEPENDENCIES', 'SET_ENV_VAR',
        'CONFIGURE_RUNTIME', 'SELECT_PYTHON_VERSION', 'RUN_SHELL_COMMAND',
        -- Code construction
        'CREATE_MODULE', 'WRITE_SOURCE_FILE', 'APPLY_TEMPLATE',
        'GENERATE_CLASS', 'GENERATE_FUNCTION', 'PATCH_FILE',
        -- Service registration
        'REGISTER_SERVICE', 'UPDATE_SERVICE_REGISTRY', 'CONFIGURE_ROUTE',
        'DEFINE_ENDPOINT', 'BIND_PORT', 'DEPLOY_SERVICE',
        -- Validation
        'VALIDATE_SYNTAX', 'CHECK_DEPENDENCIES', 'RUN_TYPECHECK',
        'RUN_TEST_SUITE', 'VERIFY_SCHEMA', 'DRY_RUN_EXECUTION',
        -- Event / observability
        'EMIT_EVENT', 'LOG_ARTIFACT', 'REGISTER_TRACEPOINT', 'PUBLISH_STATE'
    ];
BEGIN
    -- Only validate if opcode_template is a JSON array
    IF jsonb_typeof(NEW.opcode_template) != 'array' THEN
        RAISE EXCEPTION 'opcode_template must be a JSON array, got %', jsonb_typeof(NEW.opcode_template);
    END IF;

    -- Iterate over each entry in the template
    FOR v_entry IN SELECT * FROM jsonb_array_elements(NEW.opcode_template)
    LOOP
        v_op := v_entry->>'op';
        IF v_op IS NULL THEN
            RAISE EXCEPTION 'Each template entry must have an "op" field';
        END IF;

        -- Check opcode is in the valid ISA set
        IF NOT (v_op = ANY(v_valid_ops)) THEN
            RAISE EXCEPTION 'Invalid opcode "%" in template entry. Must be one of: %',
                v_op, array_to_string(v_valid_ops, ', ');
        END IF;

        -- Check that target is present
        IF (v_entry->>'target') IS NULL OR (v_entry->>'target') = '' THEN
            RAISE EXCEPTION 'Template entry for opcode "%" is missing a "target" field', v_op;
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Attach the trigger to INSERT and UPDATE
DROP TRIGGER IF EXISTS trg_validate_opcode_template ON nebula.op_registry;
CREATE TRIGGER trg_validate_opcode_template
    BEFORE INSERT OR UPDATE OF opcode_template
    ON nebula.op_registry
    FOR EACH ROW
    EXECUTE FUNCTION nebula.validate_opcode_template();

-- ═══════════════════════════════════════════════════════════════════════
--  3. Verify
-- ═══════════════════════════════════════════════════════════════════════

DO $$
BEGIN
    RAISE NOTICE '✅ Migration 017 complete: nebula.op_registry';
    RAISE NOTICE '   Registry evolution: ADD / DEPRECATE / FORK only';
    RAISE NOTICE '   ISA validation trigger active';
END $$;

COMMIT;
