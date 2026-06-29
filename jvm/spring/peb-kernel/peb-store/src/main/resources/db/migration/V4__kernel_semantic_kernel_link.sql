-- V4: Link PEB transactions to the PostgreSQL Semantic Kernel.
--
-- Adds kernel_event_id and kernel_event_type columns to peb.transactions
-- so each PEB governance decision records its corresponding kernel
-- transition event. Also grants USAGE on the kernel schema so PEB can
-- call kernel.sys_transition().
--
-- The kernel schema is in the same database (nexus), separate schema.
-- ====================================================================

-- ── Add kernel linkage columns to peb.transactions ──
ALTER TABLE peb.transactions
    ADD COLUMN IF NOT EXISTS kernel_event_id   UUID,
    ADD COLUMN IF NOT EXISTS kernel_event_type VARCHAR(32);

COMMENT ON COLUMN peb.transactions.kernel_event_id IS
    'FK to kernel.transition_event.event_id — the kernel event recorded
     for this PEB governance decision. Set by PebGovernanceEngine
     when it calls kernel.sys_transition().';

COMMENT ON COLUMN peb.transactions.kernel_event_type IS
    'The kernel event_type recorded (transition.requested,
     transition.committed, transition.rejected).';

-- Index for looking up PEB transactions by kernel event
CREATE INDEX IF NOT EXISTS idx_peb_transactions_kernel_event
    ON peb.transactions (kernel_event_id)
    WHERE kernel_event_id IS NOT NULL;

-- ── Grant kernel schema access to the application user ──
-- This allows the PEB Spring Boot app (which connects as pguser)
-- to call kernel.sys_transition() and read kernel views.
GRANT USAGE ON SCHEMA kernel TO pguser;
GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA kernel TO pguser;
GRANT SELECT ON ALL TABLES IN SCHEMA kernel TO pguser;
