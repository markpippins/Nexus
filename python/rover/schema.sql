-- Rover: Chat Transcript Harvesting Pipeline
-- Schema: rover
-- Backend: shared Postgres instance (conduit-mcp's DB or dedicated)
--
-- Workers poll rover.chunks with FOR UPDATE SKIP LOCKED.
-- Rover API monitors jobs and compiles when all chunks are done.

CREATE SCHEMA IF NOT EXISTS rover;

-- ── Jobs ───────────────────────────────────────────────────────────────

CREATE TABLE rover.jobs (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    transcript_path TEXT NOT NULL,                    -- original HTML path
    transcript_hash TEXT,                             -- sha256 of markdown (dedup)
    total_chunks    INTEGER NOT NULL,
    status          TEXT NOT NULL DEFAULT 'pending'
                    CHECK (status IN ('pending','processing','done','failed')),
    output_path     TEXT,                             -- where compiled harvest was written
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_jobs_status ON rover.jobs (status);

-- ── Chunks ─────────────────────────────────────────────────────────────

CREATE TABLE rover.chunks (
    id                  BIGSERIAL PRIMARY KEY,
    job_id              UUID NOT NULL REFERENCES rover.jobs(id) ON DELETE CASCADE,
    chunk_index         INTEGER NOT NULL,
    chunk_text          TEXT NOT NULL,

    -- Worker lifecycle
    status              TEXT NOT NULL DEFAULT 'pending'
                        CHECK (status IN ('pending','claimed','done','failed')),
    worker_id           TEXT,                         -- hostname of claiming worker
    claimed_at          TIMESTAMPTZ,                  -- when worker picked it up
    error_message       TEXT,                         -- failure reason if failed

    -- NLP extraction result
    nlp_verdict         TEXT                          -- 'content' | 'repeat' | 'noise'
                        CHECK (nlp_verdict IS NULL OR nlp_verdict IN ('content','repeat','noise')),
    nlp_confidence      REAL,                         -- 0.0 – 1.0
    nlp_model           TEXT,                         -- e.g. 'qwen3:4b'
    nlp_candidate_json  JSONB,                        -- SpecificationAgenda items if verdict='content'

    completed_at        TIMESTAMPTZ,

    UNIQUE (job_id, chunk_index)
);

CREATE INDEX idx_chunks_job_status ON rover.chunks (job_id, status);
CREATE INDEX idx_chunks_pending    ON rover.chunks (status) WHERE status = 'pending';
