-- Migration 010: Policy Rule Table — CUE-compiled policy enforcement in the kernel.
--
-- Establishes the policy_rule table and wires it into trg_authorize_transition.
-- Policy rules are CUE-compiled SQL predicates that the kernel evaluates
-- on every sys_transition() call. PEB authors the CUE; the kernel enforces
-- the compiled result.
--
-- Design:
--   1. Provenance-first: cue_source, compiler_version, doctrine_version
--      preserved alongside compiled_sql for full traceability.
--   2. Dual eval path: data-driven (compiled_sql evaluated dynamically) for
--      rapid iteration; code-generated (function_name) for stability/performance.
--   3. The trigger is the sole enforcement point — no application layer
--      decides transition validity.
--
-- This completes the compiler pipeline:
--   Doctrine → PEB → CUE → SQL Policy → Kernel → Events → Reducers → Views
--
-- Depends on: migration 008 (kernel schema, event_type enum, trigger function).
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  Policy Rule Table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kernel.policy_rule (
    rule_id          UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Identity
    rule_name        TEXT        NOT NULL UNIQUE,
    priority         INTEGER     NOT NULL DEFAULT 500
                        CHECK (priority >= 0 AND priority <= 1000),

    -- Scope: which event types this rule applies to
    event_type       kernel.event_type,       -- NULL = applies to ALL event types

    -- Provenance chain (source → compiled)
    cue_source       TEXT        NOT NULL,     -- original CUE — this is the authority
    compiled_sql     TEXT        NOT NULL,     -- CUE → SQL output (the predicate)
    function_name    TEXT,                     -- optional: code-generated function instead of dynamic SQL

    -- Version tracking
    compiler_version TEXT        NOT NULL
                        DEFAULT 'cue-to-sql@0.1',
    doctrine_version TEXT,                     -- which doctrine revision produced this rule

    -- Behaviour
    deny_reason      TEXT        NOT NULL,     -- message surfaced on KERNEL_POLICY_DENIED
    enabled          BOOLEAN     NOT NULL DEFAULT TRUE,

    -- Audit
    created_by       TEXT        NOT NULL,     -- who authored (role or system)
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- At most one of compiled_sql or function_name must be set
    CONSTRAINT ck_policy_rule_has_target CHECK (
        (compiled_sql IS NOT NULL AND length(trim(compiled_sql)) > 0)
        OR (function_name IS NOT NULL AND length(trim(function_name)) > 0)
    )
);

COMMENT ON TABLE kernel.policy_rule IS
    'CUE-compiled policy rules enforced by trg_authorize_transition.
     Every rule preserves provenance from source (cue_source) through
     compilation (compiler_version, doctrine_version) to executable
     form (compiled_sql or function_name).';

COMMENT ON COLUMN kernel.policy_rule.rule_name IS
    'Human-readable rule identifier, e.g. "capability.required" or
     "receipt.must_be_signed".';

COMMENT ON COLUMN kernel.policy_rule.priority IS
    'Evaluation order (0 = first, 1000 = last). Default 500.';

COMMENT ON COLUMN kernel.policy_rule.event_type IS
    'If set, this rule only applies to transitions of this event type.
     If NULL, applies to all event types.';

COMMENT ON COLUMN kernel.policy_rule.cue_source IS
    'The original CUE source that produced this rule. This is the
     authoritative policy expression — compiled_sql is derived.';

COMMENT ON COLUMN kernel.policy_rule.compiled_sql IS
    'The CUE-compiled SQL predicate. Evaluated dynamically by the
     trigger against the NEW transition_event row. Example:
     "NEW.actor IS NOT NULL AND NEW.authority IN (''architect'',''planner'')"';

COMMENT ON COLUMN kernel.policy_rule.function_name IS
    'Optional: schema-qualified function name for code-generated
     enforcement. When set, the trigger invokes this function instead
     of evaluating compiled_sql dynamically. Enables a migration path
     from data-driven to compiled enforcement as rules stabilize.';

COMMENT ON COLUMN kernel.policy_rule.compiler_version IS
    'Version of the CUE→SQL compiler that produced this rule. Enables
     invalidation and recompilation when the compiler changes.';

COMMENT ON COLUMN kernel.policy_rule.doctrine_version IS
    'Which revision of the policy doctrine this rule was generated from.
     Links back to the source of authority.';

COMMENT ON COLUMN kernel.policy_rule.deny_reason IS
    'Human-readable message returned to the caller when this rule rejects
     a transition. Surfaced as KERNEL_POLICY_DENIED.';

COMMENT ON COLUMN kernel.policy_rule.enabled IS
    'If false, the rule is skipped during evaluation. Enables gradual
     rollout and emergency disable without dropping rules.';

COMMENT ON COLUMN kernel.policy_rule.created_by IS
    'Who authored this rule — agent role (architect, planner) or system
     (peb, conduit).';

-- Index for trigger lookup
CREATE INDEX idx_policy_rule_lookup
    ON kernel.policy_rule (enabled, priority, event_type)
    WHERE enabled;

-- Index for provenance queries
CREATE INDEX idx_policy_rule_doctrine
    ON kernel.policy_rule (doctrine_version)
    WHERE doctrine_version IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  Update trg_authorize_transition — add policy rule evaluation
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.trg_authorize_transition()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
    v_rule  RECORD;
    v_sql   TEXT;
    v_pass  BOOLEAN;
BEGIN
    -- ──────────────────────────────────────────────────────────────────
    --  Phase 1: Structural authorization (kernel invariants)
    -- ──────────────────────────────────────────────────────────────────

    -- Rule: Actor is required
    IF NEW.actor IS NULL OR length(trim(NEW.actor)) = 0 THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: actor is required'
            USING HINT = 'Every transition must specify an actor';
    END IF;

    -- Rule: Aggregate type and ID are required
    IF NEW.aggregate_type IS NULL OR length(trim(NEW.aggregate_type)) = 0 THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: aggregate_type is required'
            USING HINT = 'Every transition must specify an aggregate type';
    END IF;

    IF NEW.aggregate_id IS NULL OR length(trim(NEW.aggregate_id)) = 0 THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: aggregate_id is required'
            USING HINT = 'Every transition must specify an aggregate instance';
    END IF;

    -- Rule: Past timestamps (5 sec clock skew tolerance)
    IF NEW.timestamp > now() + INTERVAL '5 seconds' THEN
        RAISE EXCEPTION 'KERNEL_AUTH_DENIED: future timestamp %', NEW.timestamp
            USING HINT = 'Timestamps must not be in the future';
    END IF;

    -- ──────────────────────────────────────────────────────────────────
    --  Phase 2: Policy rule evaluation (CUE-compiled)
    -- ──────────────────────────────────────────────────────────────────
    -- Evaluate all enabled rules matching this event type.
    -- Rules with event_type = NULL apply to all transitions.

    FOR v_rule IN
        SELECT rule_name, compiled_sql, function_name, deny_reason
        FROM kernel.policy_rule
        WHERE enabled
          AND (event_type IS NULL OR event_type = NEW.event_type)
        ORDER BY priority ASC
    LOOP
        -- Dual eval path: function_name (compiled) or compiled_sql (dynamic)
        IF v_rule.function_name IS NOT NULL THEN
            -- Code-generated path: invoke the function with NEW as argument
            v_sql := format('SELECT %s($1)', v_rule.function_name);
            EXECUTE v_sql USING NEW INTO v_pass;
        ELSE
            -- Data-driven path: evaluate the compiled SQL predicate.
            -- The predicate MUST reference the NEW record as $1.
            -- Examples: "($1).authority IS NOT NULL"
            --           "($1).receipt IS NOT NULL AND length(trim(($1).receipt)) > 0"
            v_sql := format('SELECT %s', v_rule.compiled_sql);
            EXECUTE v_sql USING NEW INTO v_pass;
        END IF;

        IF NOT v_pass OR v_pass IS NULL THEN
            RAISE EXCEPTION 'KERNEL_POLICY_DENIED: %', v_rule.deny_reason
                USING HINT = format('Policy rule "%s" rejected this transition',
                           v_rule.rule_name);
        END IF;
    END LOOP;

    RETURN NEW;
END;
$$;

COMMENT ON FUNCTION kernel.trg_authorize_transition IS
    'BEFORE INSERT trigger: authorizes every transition before commit.
     Phase 1 enforces structural invariants (actor, aggregate_type,
     aggregate_id, timestamp sanity). Phase 2 evaluates all enabled
     CUE-compiled policy rules from kernel.policy_rule. Rules matched
     by event_type are evaluated in priority order. Dual eval path:
     function_name (code-generated) or compiled_sql (data-driven).
     The compiled_sql predicate MUST reference the NEW record as $1,
     e.g.: "($1).authority IS NOT NULL".';

-- ═══════════════════════════════════════════════════════════════════════
--  Update updated_at on policy_rule changes
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.trg_policy_rule_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER trg_policy_rule_updated_at
    BEFORE UPDATE ON kernel.policy_rule
    FOR EACH ROW
    EXECUTE FUNCTION kernel.trg_policy_rule_updated_at();

-- ═══════════════════════════════════════════════════════════════════════
--  Seed rules
-- ═══════════════════════════════════════════════════════════════════════

-- Rule 1: Every transition must have a non-empty authority (soft enforcement)
INSERT INTO kernel.policy_rule (
    rule_name, priority, cue_source, compiled_sql, deny_reason, created_by
) VALUES (
    'authority.required',
    100,
    '// Seed rule: authority should be set for all transitions
     authority_required: true',
    '($1).authority IS NOT NULL AND length(trim(($1).authority)) > 0',
    'Authority is required for all transitions',
    'system'
) ON CONFLICT (rule_name) DO NOTHING;

-- Rule 2: receipt.issued events must carry a receipt (structural consistency)
INSERT INTO kernel.policy_rule (
    rule_name, priority, event_type, cue_source, compiled_sql, deny_reason, created_by
) VALUES (
    'receipt.must_carry_hash',
    200,
    'receipt.issued',
    '// Seed rule: receipt.issued events must have a receipt hash
     receipt_hash_required: true',
    '($1).receipt IS NOT NULL AND length(trim(($1).receipt)) > 0',
    'receipt.issued events must include a receipt hash',
    'system'
) ON CONFLICT (rule_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════
--  View: active policy rules
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW kernel.v_active_policy AS
SELECT
    rule_id,
    rule_name,
    priority,
    event_type::TEXT AS event_type,
    cue_source,
    compiled_sql,
    function_name,
    compiler_version,
    doctrine_version,
    deny_reason,
    enabled,
    created_by,
    created_at,
    updated_at
FROM kernel.policy_rule
WHERE enabled
ORDER BY priority ASC;

COMMENT ON VIEW kernel.v_active_policy IS
    'Active (enabled) policy rules in evaluation order. Used by inspectors
     and auditors to understand which rules are currently enforced.';

-- ═══════════════════════════════════════════════════════════════════════
--  Permissions
-- ═══════════════════════════════════════════════════════════════════════

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA kernel TO pguser;
