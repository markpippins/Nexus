-- V045: Expand harvest_candidates schema for Rover Stage 2
-- Adds fields for design rationale, candidate typing, and hierarchy placement

BEGIN;

-- Add new columns for expanded candidate schema
ALTER TABLE nebula.harvest_candidates
  ADD COLUMN IF NOT EXISTS type TEXT NOT NULL DEFAULT 'requirement',
  ADD COLUMN IF NOT EXISTS design_rationale JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS provenance_block_indices JSONB NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS needs_new_node BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS proposed_parent TEXT,
  ADD COLUMN IF NOT EXISTS proposed_name TEXT,
  ADD COLUMN IF NOT EXISTS placement_reason TEXT;

-- Add check constraint for type field
ALTER TABLE nebula.harvest_candidates
  ADD CONSTRAINT hc_type_check
  CHECK (type IN ('requirement', 'principle', 'rejected_alternative', 'tension', 'rationale', 'mixed'));

-- Add index for type-based queries
CREATE INDEX IF NOT EXISTS idx_hc_type ON nebula.harvest_candidates(type);

-- Add index for needs_new_node filtering
CREATE INDEX IF NOT EXISTS idx_hc_needs_new_node ON nebula.harvest_candidates(needs_new_node) WHERE needs_new_node = true;

COMMENT ON COLUMN nebula.harvest_candidates.type IS 'Candidate type: requirement, principle, rejected_alternative, tension, rationale, or mixed';
COMMENT ON COLUMN nebula.harvest_candidates.design_rationale IS 'Stated principles, rejected alternatives, or reasoning that shaped a decision — even when no concrete action item follows';
COMMENT ON COLUMN nebula.harvest_candidates.provenance_block_indices IS 'List of DockLang block indices that support this candidate (may be non-contiguous)';
COMMENT ON COLUMN nebula.harvest_candidates.needs_new_node IS 'True when Operation 2B cannot find a clean hierarchy match';
COMMENT ON COLUMN nebula.harvest_candidates.proposed_parent IS 'Proposed parent node for needs_new_node candidates';
COMMENT ON COLUMN nebula.harvest_candidates.proposed_name IS 'Proposed name for needs_new_node candidates';
COMMENT ON COLUMN nebula.harvest_candidates.placement_reason IS 'Reason why needs_new_node was flagged';

COMMIT;
