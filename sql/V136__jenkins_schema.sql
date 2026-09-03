-- V136: jenkins schema — CI build data for Barbie + Assembly integration.
-- Mirrors the sonar-sync pattern: pull from Jenkins REST → store in PG → serve to UIs.

CREATE SCHEMA IF NOT EXISTS jenkins;

-- Jobs: one row per Jenkins pipeline/job.
CREATE TABLE IF NOT EXISTS jenkins.jobs (
    name            TEXT PRIMARY KEY,
    url             TEXT NOT NULL,
    description     TEXT,
    buildable       BOOLEAN NOT NULL DEFAULT true,
    color           TEXT,              -- blue=success, red=failed, etc.
    last_build_num  INT,
    last_build_result TEXT,            -- SUCCESS, FAILURE, UNSTABLE, etc.
    last_build_ts   BIGINT,            -- epoch millis
    last_build_dur  INT,               -- milliseconds
    health_score    INT,               -- 0-100
    health_desc     TEXT,
    raw_json        JSONB NOT NULL DEFAULT '{}',
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Builds: one row per build execution.
CREATE TABLE IF NOT EXISTS jenkins.builds (
    job_name        TEXT NOT NULL REFERENCES jenkins.jobs(name),
    number          INT NOT NULL,
    result          TEXT,              -- SUCCESS, FAILURE, UNSTABLE, ABORTED
    timestamp       BIGINT NOT NULL,   -- epoch millis
    duration        INT,               -- milliseconds
    display_name    TEXT,
    url             TEXT,
    branch          TEXT,              -- git branch if available
    commit_sha      TEXT,              -- git commit if available
    commit_msg      TEXT,
    author          TEXT,
    change_count    INT DEFAULT 0,     -- number of files changed
    test_total      INT,
    test_pass       INT,
    test_fail       INT,
    test_skip       INT,
    raw_json        JSONB NOT NULL DEFAULT '{}',
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (job_name, number)
);

-- Stage results: one row per pipeline stage per build.
CREATE TABLE IF NOT EXISTS jenkins.stages (
    job_name        TEXT NOT NULL,
    build_number    INT NOT NULL,
    stage_name      TEXT NOT NULL,
    status          TEXT,              -- SUCCESS, FAILURE, IN_PROGRESS, etc.
    duration        INT,               -- milliseconds
    raw_json        JSONB NOT NULL DEFAULT '{}',
    synced_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    FOREIGN KEY (job_name, build_number) REFERENCES jenkins.builds(job_name, number),
    PRIMARY KEY (job_name, build_number, stage_name)
);

-- Sync bookkeeping (mirrors sonar.sync_state pattern).
CREATE TABLE IF NOT EXISTS jenkins.sync_state (
    id                      INT PRIMARY KEY DEFAULT 1,
    last_jobs_sync          TIMESTAMPTZ,
    last_builds_sync        TIMESTAMPTZ,
    jobs_total              INT,
    builds_total            INT,
    last_sync_status        TEXT,
    last_sync_count         INT,
    updated_at              TIMESTAMPTZ NOT NULL DEFAULT now()
);

INSERT INTO jenkins.sync_state (id) VALUES (1)
    ON CONFLICT (id) DO NOTHING;

-- Indexes for Barbie query patterns.
CREATE INDEX IF NOT EXISTS idx_builds_job_ts ON jenkins.builds(job_name, timestamp DESC);
CREATE INDEX IF NOT EXISTS idx_builds_result ON jenkins.builds(result) WHERE result IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_stages_build ON jenkins.stages(job_name, build_number);
