-- V102: D-T19-2(b) idempotency — unique lineage_original_id for conduit-derived receipts
--
-- The execution.receipts INSERT for conduit-written receipts uses
-- `ON CONFLICT (lineage_original_id) WHERE lineage_source = 'conduit' DO NOTHING`
-- to stay idempotent on retry. This partial unique index backs that clause.

BEGIN;

CREATE UNIQUE INDEX IF NOT EXISTS idx_execution_receipts_conduit_lineage
  ON execution.receipts (lineage_original_id)
  WHERE lineage_source = 'conduit';

COMMIT;
