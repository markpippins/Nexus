-- V101: D-T19-2(d) — mark vision.receipts frozen (legacy receipt store, pending archive)
--
-- The real pipeline no longer writes here (D-T19-2(b) re-pointed writers to
-- execution.receipts). vision.receipts now serves only the test/synthetic
-- fallback path, and will be archived after a 7-day soak (confirm with ops).

BEGIN;

COMMENT ON TABLE vision.receipts IS
  'FROZEN (D-T19-2d): legacy receipt store, read-only for the pipeline — real receipts now write execution.receipts. Only the test/synthetic fallback path writes here. Archive after 7-day soak (confirm with ops).';

COMMIT;
