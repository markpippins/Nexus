-- Migration 032: Update execution.requests.source_wr_id to reference nebula.work_requests
--
-- Changes source_wr_id from TEXT (referencing vision.work_requests.wr_id)
-- to UUID (referencing nebula.work_requests.id).
--
-- All existing source_wr_id values were NULL, so no data migration needed.

-- Step 1: Add primary key to nebula.work_requests if missing
ALTER TABLE nebula.work_requests
    ADD CONSTRAINT work_requests_pkey PRIMARY KEY (id);

-- Step 2: Drop the existing TEXT column
ALTER TABLE execution.requests
    DROP COLUMN IF EXISTS source_wr_id;

-- Step 3: Add new UUID column with FK reference
ALTER TABLE execution.requests
    ADD COLUMN source_wr_id UUID REFERENCES nebula.work_requests(id) ON DELETE SET NULL;

-- Step 4: Add index for FK lookups
CREATE INDEX IF NOT EXISTS idx_execution_requests_source_wr
    ON execution.requests (source_wr_id)
    WHERE source_wr_id IS NOT NULL;

-- Step 5: Update comment
COMMENT ON COLUMN execution.requests.source_wr_id IS
    'Reference to the canonical work request in nebula.work_requests.id (UUID).';
