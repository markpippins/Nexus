-- Migration 009: Receipt Table — promote receipt to first-class entity.
--
-- Receipts are verifiable records that a specific event was committed.
-- In the WRP architecture, receipts have independent identity, lifecycle,
-- and queryability. This migration promotes the inline TEXT hash on
-- transition_event to a full receipt table.
--
-- Design:
--   1. kernel.receipt is the canonical receipt store.
--   2. transition_event.receipt remains as a quick inline hash for
--      performance-critical reads.
--   3. transition_event.receipt_id is an optional FK to kernel.receipt
--      for full receipt lifecycle tracking.
--   4. sys_issue_receipt() is the single write surface for issuing receipts.
--
-- Depends on: migration 008 (kernel schema, event_type enum exists).
-- ====================================================================

-- ═══════════════════════════════════════════════════════════════════════
--  Receipt table
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS kernel.receipt (
    id              UUID        NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,

    -- Receipt identity
    receipt_type    TEXT        NOT NULL
                        CHECK (receipt_type IN (
                            'proposed',
                            'plan_create',
                            'planning',
                            'implementation',
                            'review_pass',
                            'review_reject',
                            'transition_committed',
                            'transition_rejected',
                            'intent_registered',
                            'artifact_registered',
                            'policy_violated',
                            'notification_sent'
                        )),
    receipt_hash    TEXT        NOT NULL,           -- SHA-256 content hash

    -- Linkage
    event_id        UUID        NOT NULL
                        REFERENCES kernel.transition_event(event_id)
                        ON DELETE CASCADE,
    issued_by       TEXT        NOT NULL,            -- agent role or system
    plan_number     TEXT,                            -- optional conduit plan ref

    -- Metadata
    metadata        JSONB       NOT NULL DEFAULT '{}'::jsonb,

    -- Lifecycle
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),

    -- Immutability
    CONSTRAINT uq_receipt_hash UNIQUE (receipt_hash)
);

COMMENT ON TABLE kernel.receipt IS
    'First-class receipt records. Every receipt is a verifiable, content-addressed
     record that a specific event was committed. Receipts have independent identity
     and lifecycle — they can be queried, linked to plans, and used as proof of
     commitment outside the kernel.';

COMMENT ON COLUMN kernel.receipt.id IS 'Unique receipt identifier (UUID v4).';
COMMENT ON COLUMN kernel.receipt.receipt_type IS
    'Type of receipt — identifies the lifecycle event being certified
     (proposed, plan_create, transition_committed, etc.).';
COMMENT ON COLUMN kernel.receipt.receipt_hash IS
    'SHA-256 content hash of the receipt payload for integrity verification.';
COMMENT ON COLUMN kernel.receipt.event_id IS
    'The transition event this receipt certifies. FK to kernel.transition_event.';
COMMENT ON COLUMN kernel.receipt.issued_by IS
    'Who issued this receipt — agent role (architect, planner, builder)
     or system (kernel, conduit).';
COMMENT ON COLUMN kernel.receipt.plan_number IS
    'Optional reference to a conduit implementation plan number (e.g., 0053).';
COMMENT ON COLUMN kernel.receipt.metadata IS
    'Receipt-type-specific metadata — shape varies by receipt_type.';
COMMENT ON COLUMN kernel.receipt.created_at IS
    'When the receipt was issued (not when the event was committed).';

-- Indexes for common receipt query patterns
CREATE INDEX idx_receipt_type
    ON kernel.receipt (receipt_type, created_at DESC);

CREATE INDEX idx_receipt_event
    ON kernel.receipt (event_id);

CREATE INDEX idx_receipt_issuer
    ON kernel.receipt (issued_by, created_at DESC);

CREATE INDEX idx_receipt_plan
    ON kernel.receipt (plan_number)
    WHERE plan_number IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  Link receipt to transition_event
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE kernel.transition_event
    ADD COLUMN IF NOT EXISTS receipt_id UUID
        REFERENCES kernel.receipt(id)
        ON DELETE SET NULL;

COMMENT ON COLUMN kernel.transition_event.receipt_id IS
    'Optional FK to kernel.receipt for full receipt lifecycle tracking.
     The inline receipt TEXT hash remains for quick verification.';

CREATE INDEX IF NOT EXISTS idx_transition_event_receipt
    ON kernel.transition_event (receipt_id)
    WHERE receipt_id IS NOT NULL;

-- ═══════════════════════════════════════════════════════════════════════
--  sys_issue_receipt() — single write surface for issuing receipts
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION kernel.sys_issue_receipt(
    p_receipt_type    TEXT,
    p_receipt_hash    TEXT,
    p_event_id        UUID,
    p_issued_by       TEXT,
    p_plan_number     TEXT DEFAULT NULL,
    p_metadata        JSONB DEFAULT '{}'::jsonb
)
RETURNS kernel.receipt
LANGUAGE plpgsql
AS $$
DECLARE
    v_receipt kernel.receipt;
BEGIN
    -- ── Admission Phase ──
    -- Structural checks (policy-based checks can be added later)

    IF length(trim(p_receipt_hash)) = 0 THEN
        RAISE EXCEPTION 'RECEIPT_DENIED: receipt_hash is required'
            USING HINT = 'Every receipt must have a content hash';
    END IF;

    IF length(trim(p_issued_by)) = 0 THEN
        RAISE EXCEPTION 'RECEIPT_DENIED: issued_by is required'
            USING HINT = 'Every receipt must specify an issuer';
    END IF;

    -- Verify the referenced event exists
    IF NOT EXISTS (SELECT 1 FROM kernel.transition_event
                   WHERE event_id = p_event_id) THEN
        RAISE EXCEPTION 'RECEIPT_DENIED: event % does not exist', p_event_id
            USING HINT = 'Cannot issue a receipt for a non-existent event';
    END IF;

    -- ── Commit Phase ──
    INSERT INTO kernel.receipt (
        receipt_type,
        receipt_hash,
        event_id,
        issued_by,
        plan_number,
        metadata
    ) VALUES (
        p_receipt_type,
        p_receipt_hash,
        p_event_id,
        p_issued_by,
        p_plan_number,
        p_metadata
    )
    RETURNING * INTO v_receipt;

    -- ── Link back to the transition_event ──
    UPDATE kernel.transition_event
    SET receipt_id = v_receipt.id
    WHERE event_id = p_event_id;

    RETURN v_receipt;
END;
$$;

COMMENT ON FUNCTION kernel.sys_issue_receipt IS
    'Sole write surface for the receipt table. Issues a receipt linked to
     an existing transition event and back-links the event to the receipt.

     Args:
       p_receipt_type: Type of receipt (proposed, plan_create, etc.)
       p_receipt_hash: SHA-256 content hash for integrity verification
       p_event_id:     The transition event this receipt certifies
       p_issued_by:    Who issued this receipt (role or system)
       p_plan_number:  Optional conduit plan reference
       p_metadata:     Receipt-type-specific metadata (JSONB)

     Returns: the committed receipt row.
     Raises:  exception if validation fails.';

-- ═══════════════════════════════════════════════════════════════════════
--  Views
-- ═══════════════════════════════════════════════════════════════════════

-- View: receipt chain — join receipts to their events
CREATE OR REPLACE VIEW kernel.v_receipt_chain AS
SELECT
    r.id                AS receipt_id,
    r.receipt_type,
    r.receipt_hash,
    r.issued_by,
    r.plan_number,
    r.created_at        AS receipt_created_at,
    te.event_id,
    te.event_type::TEXT AS event_type,
    te.aggregate_type,
    te.aggregate_id,
    te.actor,
    te.timestamp         AS event_timestamp,
    te.causation_id,
    te.correlation_id
FROM kernel.receipt r
JOIN kernel.transition_event te ON te.event_id = r.event_id
ORDER BY r.created_at DESC;

COMMENT ON VIEW kernel.v_receipt_chain IS
    'Joined view of receipts with their source transition events.
     Useful for tracing which receipt certifies which event.';

-- View: receipt summary per plan
CREATE OR REPLACE VIEW kernel.v_plan_receipts AS
SELECT
    r.plan_number,
    r.receipt_type,
    count(*)                                    AS receipt_count,
    min(r.created_at)                           AS first_issued,
    max(r.created_at)                           AS last_issued,
    array_agg(DISTINCT r.issued_by)             AS issuers,
    array_agg(DISTINCT r.receipt_hash::TEXT)    AS hashes
FROM kernel.receipt r
WHERE r.plan_number IS NOT NULL
GROUP BY r.plan_number, r.receipt_type
ORDER BY r.plan_number;

COMMENT ON VIEW kernel.v_plan_receipts IS
    'Receipt summary grouped by plan number — useful for seeing
     which receipts have been issued for each conduit plan.';

-- ═══════════════════════════════════════════════════════════════════════
--  Permissions
-- ═══════════════════════════════════════════════════════════════════════

GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA kernel TO pguser;
GRANT ALL PRIVILEGES ON ALL FUNCTIONS IN SCHEMA kernel TO pguser;
