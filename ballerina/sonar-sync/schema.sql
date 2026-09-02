-- sonar sync schema — canonical store for SonarQube findings.
-- Pulled from SonarQube REST API by the ballerina sonar-sync service on a
-- schedule; agent review decisions flow back out via writeback columns.
-- The nexus DB is canonical; SonarQube stays in sync so either surface can
-- be used (assembly-ui Sonar forum / barbie SonarQube Quality view).

CREATE SCHEMA IF NOT EXISTS sonar;

-- ── issues (bugs, vulnerabilities, code smells) ─────────────────────
CREATE TABLE IF NOT EXISTS sonar.issues (
    key             TEXT PRIMARY KEY,
    sonar_type      TEXT NOT NULL,            -- BUG | VULNERABILITY | CODE_SMELL
    severity        TEXT NOT NULL,            -- BLOCKER | CRITICAL | MAJOR | MINOR | INFO
    status          TEXT NOT NULL,            -- OPEN | CONFIRMED | REOPENED | RESOLVED | CLOSED
    resolution      TEXT,                     -- FIXED | WONTFIX | FALSE-POSITIVE | REMOVED (null when open)
    project_key     TEXT NOT NULL,
    component_key   TEXT,                     -- file/component path in the project
    line            INTEGER,
    rule_key        TEXT NOT NULL,
    message         TEXT NOT NULL,
    effort          TEXT,                     -- technical debt (e.g. "3h")
    author          TEXT,
    tags            JSONB NOT NULL DEFAULT '[]'::jsonb,
    raw_json        JSONB NOT NULL,           -- full payload from SonarQube
    update_key      TEXT,                     -- SonarQube update sequence (dedupe/staleness)

    -- nexus review ledger (writeback intent)
    review_status   TEXT,                     -- null = untouched | assigned | working | done | wontfix
    review_owner    TEXT,                     -- which role/agent claimed it
    review_note     TEXT,
    reviewed_at     TIMESTAMPTZ,
    synced_to_sonar BOOLEAN NOT NULL DEFAULT false,

    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sonar_issues_project  ON sonar.issues (project_key);
CREATE INDEX IF NOT EXISTS idx_sonar_issues_status   ON sonar.issues (status);
CREATE INDEX IF NOT EXISTS idx_sonar_issues_severity ON sonar.issues (severity);
CREATE INDEX IF NOT EXISTS idx_sonar_issues_type     ON sonar.issues (sonar_type);

-- ── security hotspots ───────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sonar.hotspots (
    key                       TEXT PRIMARY KEY,
    security_category         TEXT NOT NULL,   -- auth | sql-injection | ...
    vulnerability_probability TEXT NOT NULL,   -- LOW | MEDIUM | HIGH
    status                    TEXT NOT NULL,   -- TO_REVIEW | REVIEWED
    resolution                TEXT,            -- SAFE | FIXED | ACCEPTED_RISK (null when to-review)
    project_key               TEXT NOT NULL,
    component_key             TEXT,
    line                      INTEGER,
    rule_key                  TEXT NOT NULL,
    message                   TEXT NOT NULL,
    author                    TEXT,
    raw_json                  JSONB NOT NULL,
    update_key                TEXT,

    review_status   TEXT,
    review_owner    TEXT,
    review_note     TEXT,
    reviewed_at     TIMESTAMPTZ,
    synced_to_sonar BOOLEAN NOT NULL DEFAULT false,

    first_seen_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sonar_hotspots_project ON sonar.hotspots (project_key);
CREATE INDEX IF NOT EXISTS idx_sonar_hotspots_status  ON sonar.hotspots (status);
CREATE INDEX IF NOT EXISTS idx_sonar_hotspots_cat     ON sonar.hotspots (security_category);

-- ── per-project quality measures snapshot ───────────────────────────
CREATE TABLE IF NOT EXISTS sonar.measures (
    project_key         TEXT NOT NULL,
    metric_key          TEXT NOT NULL,         -- reliability_rating | security_rating | coverage | ...
    metric_value        TEXT NOT NULL,
    quality_gate_status TEXT,                  -- ERROR | OK | WARN (project gate)
    captured_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (project_key, metric_key, captured_at)
);

-- ── sync bookkeeping ────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS sonar.sync_state (
    id              INTEGER PRIMARY KEY CHECK (id = 1),  -- singleton row
    last_issues_sync  TIMESTAMPTZ,
    last_hotspots_sync TIMESTAMPTZ,
    last_measures_sync TIMESTAMPTZ,
    issues_cursor      TEXT,                  -- SonarQube paging cursor if needed
    hotspots_cursor    TEXT,
    issues_total       INTEGER,
    hotspots_total     INTEGER,
    last_sync_status   TEXT,                  -- ok | partial | failed
    last_sync_error    TEXT,
    last_sync_count    INTEGER,               -- items upserted in the last pull
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);
INSERT INTO sonar.sync_state (id) VALUES (1) ON CONFLICT (id) DO NOTHING;