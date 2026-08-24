-- V122: execution_evidence — WITHDRAWN AS DDL; converted to contract verification.
--
-- DISCOVERY (2026-08-24, on apply): resolution.execution_evidence ALREADY
-- EXISTS in its canonical V116-family form — richer than the sketch this
-- file originally proposed: deterministic evidence_key (unique-while-
-- active), source_system+evidence_kind+source_hash content-dedup index,
-- bitemporal recorded_*/valid_* columns, immutability trigger, and FKs
-- from execution_admission_receipt / execution_claim_evidence /
-- t24_graph_edge_evidence.
--
-- The gate's http_preflight writer (promotion_gate.record_execution_evidence)
-- targets THAT contract. This file therefore only VERIFIES the required
-- surface and registers adoption in resolution.migration_ledger. No schema
-- change is made here.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='resolution' AND table_name='execution_evidence'
      AND column_name IN ('evidence_key','source_system','evidence_kind',
                          'source_ref','source_hash','context_kind','payload')
    GROUP BY table_name
    HAVING count(*) = 7
  ) THEN
    RAISE EXCEPTION 'resolution.execution_evidence missing required gate-writer columns';
  END IF;
END $$;
