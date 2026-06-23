-- ═══════════════════════════════════════════════════════════════════════
--  Vision Schema — LOSM Store
--  Semi-bitemporal (system-versioned) tables with views + INSTEAD OF triggers.
--
--  Pattern:
--    1. Create _history tables with recorded_on_dt / recorded_until_dt
--    2. Create views with original table names
--    3. Create INSTEAD OF INSERT/UPDATE/DELETE triggers for transparent versioning
--    4. Partial unique indexes for active-row uniqueness
--    5. Drop updated_at — replaced by recorded_on_dt
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════
--  SCHEMA
-- ═══════════════════════════════════════════════════════════════════════

CREATE SCHEMA IF NOT EXISTS vision;
SET search_path TO vision;

-- ═══════════════════════════════════════════════════════════════════════
--  HELPER: expiry sentinel
-- ═══════════════════════════════════════════════════════════════════════

-- Used as: '9999-12-31 23:59:59+00'::timestamptz

-- ═══════════════════════════════════════════════════════════════════════
--  1. work_requests
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.work_requests_history (
    id              INTEGER NOT NULL,
    wr_id           VARCHAR(36) NOT NULL,
    intent          TEXT NOT NULL,
    constraints     JSONB,
    priority        INTEGER NOT NULL DEFAULT 5,
    context         JSONB,
    status          VARCHAR(32) NOT NULL DEFAULT 'NEW',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

-- Unique index for active rows on the business key
CREATE UNIQUE INDEX IF NOT EXISTS idx_work_requests_active_wr_id
    ON vision.work_requests_history (wr_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- View — exposes the same columns as the original SQLAlchemy model + temporal columns
CREATE OR REPLACE VIEW vision.work_requests AS
SELECT id, wr_id, intent, constraints, priority, context, status, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.work_requests_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

-- Helper: set NEW.id from auto-increment on insert
CREATE SEQUENCE IF NOT EXISTS vision.work_requests_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.work_requests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.work_requests_id_seq'));

    INSERT INTO vision.work_requests_history
        (id, wr_id, intent, constraints, priority, context, status, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.wr_id, NEW.intent, NEW.constraints, COALESCE(NEW.priority, 5),
         NEW.context, COALESCE(NEW.status, 'NEW'), COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.work_requests_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.work_requests_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.work_requests_history
        (id, wr_id, intent, constraints, priority, context, status, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.wr_id, NEW.intent, NEW.constraints, NEW.priority,
         NEW.context, NEW.status, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, wr_id, intent, constraints, priority, context, status,
              created_at, recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.work_requests_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.work_requests_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_requests_insert
    INSTEAD OF INSERT ON vision.work_requests
    FOR EACH ROW EXECUTE FUNCTION vision.work_requests_insert_trigger();
CREATE TRIGGER trg_work_requests_update
    INSTEAD OF UPDATE ON vision.work_requests
    FOR EACH ROW EXECUTE FUNCTION vision.work_requests_update_trigger();
CREATE TRIGGER trg_work_requests_delete
    INSTEAD OF DELETE ON vision.work_requests
    FOR EACH ROW EXECUTE FUNCTION vision.work_requests_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  2. artifacts
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.artifacts_history (
    id                  INTEGER NOT NULL,
    artifact_id         VARCHAR(36) NOT NULL,
    type                VARCHAR(32) NOT NULL,
    content             JSONB NOT NULL,
    confidence          DOUBLE PRECISION,
    provenance          JSONB,
    wr_id               VARCHAR(36),
    parent_artifact_id  VARCHAR(36),
    template_metadata   JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt   TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_artifacts_active_artifact_id
    ON vision.artifacts_history (artifact_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_artifacts_history_wr_id
    ON vision.artifacts_history (wr_id);
CREATE INDEX IF NOT EXISTS idx_artifacts_history_parent
    ON vision.artifacts_history (parent_artifact_id);

CREATE OR REPLACE VIEW vision.artifacts AS
SELECT id, artifact_id, type, content, confidence, provenance,
       wr_id, parent_artifact_id, template_metadata, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.artifacts_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.artifacts_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.artifacts_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.artifacts_id_seq'));

    INSERT INTO vision.artifacts_history
        (id, artifact_id, type, content, confidence, provenance,
         wr_id, parent_artifact_id, template_metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.artifact_id, NEW.type, NEW.content, NEW.confidence,
         NEW.provenance, NEW.wr_id, NEW.parent_artifact_id,
         NEW.template_metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.artifacts_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.artifacts_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.artifacts_history
        (id, artifact_id, type, content, confidence, provenance,
         wr_id, parent_artifact_id, template_metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.artifact_id, NEW.type, NEW.content, NEW.confidence,
         NEW.provenance, NEW.wr_id, NEW.parent_artifact_id,
         NEW.template_metadata, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, artifact_id, type, content, confidence, provenance,
              wr_id, parent_artifact_id, template_metadata, created_at,
              recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.artifacts_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.artifacts_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_artifacts_insert
    INSTEAD OF INSERT ON vision.artifacts
    FOR EACH ROW EXECUTE FUNCTION vision.artifacts_insert_trigger();
CREATE TRIGGER trg_artifacts_update
    INSTEAD OF UPDATE ON vision.artifacts
    FOR EACH ROW EXECUTE FUNCTION vision.artifacts_update_trigger();
CREATE TRIGGER trg_artifacts_delete
    INSTEAD OF DELETE ON vision.artifacts
    FOR EACH ROW EXECUTE FUNCTION vision.artifacts_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  3. receipt_ingest_records
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.receipt_ingest_records_history (
    id              INTEGER NOT NULL,
    receipt_id      VARCHAR(36) NOT NULL,
    work_request_id VARCHAR(64) NOT NULL,
    executor_id     VARCHAR(128) NOT NULL,
    receipt_hash    VARCHAR(64) NOT NULL,
    result          VARCHAR(16) NOT NULL,
    lineage_parent  VARCHAR(128) NOT NULL,
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_active_receipt_id
    ON vision.receipt_ingest_records_history (receipt_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE UNIQUE INDEX IF NOT EXISTS idx_receipt_active_hash
    ON vision.receipt_ingest_records_history (receipt_hash)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_receipt_history_wr_id
    ON vision.receipt_ingest_records_history (work_request_id);

CREATE OR REPLACE VIEW vision.receipt_ingest_records AS
SELECT id, receipt_id, work_request_id, executor_id, receipt_hash,
       result, lineage_parent, payload, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.receipt_ingest_records_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.receipt_ingest_records_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.receipt_ingest_records_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.receipt_ingest_records_id_seq'));

    INSERT INTO vision.receipt_ingest_records_history
        (id, receipt_id, work_request_id, executor_id, receipt_hash,
         result, lineage_parent, payload, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.receipt_id, NEW.work_request_id, NEW.executor_id,
         NEW.receipt_hash, NEW.result, NEW.lineage_parent, NEW.payload,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.receipt_ingest_records_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.receipt_ingest_records_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.receipt_ingest_records_history
        (id, receipt_id, work_request_id, executor_id, receipt_hash,
         result, lineage_parent, payload, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.receipt_id, NEW.work_request_id, NEW.executor_id,
         NEW.receipt_hash, NEW.result, NEW.lineage_parent, NEW.payload,
         OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, receipt_id, work_request_id, executor_id, receipt_hash,
              result, lineage_parent, payload, created_at,
              recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.receipt_ingest_records_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.receipt_ingest_records_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_receipt_ingest_records_insert
    INSTEAD OF INSERT ON vision.receipt_ingest_records
    FOR EACH ROW EXECUTE FUNCTION vision.receipt_ingest_records_insert_trigger();
CREATE TRIGGER trg_receipt_ingest_records_update
    INSTEAD OF UPDATE ON vision.receipt_ingest_records
    FOR EACH ROW EXECUTE FUNCTION vision.receipt_ingest_records_update_trigger();
CREATE TRIGGER trg_receipt_ingest_records_delete
    INSTEAD OF DELETE ON vision.receipt_ingest_records
    FOR EACH ROW EXECUTE FUNCTION vision.receipt_ingest_records_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  4. governance_events
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.governance_events_history (
    id              INTEGER NOT NULL,
    event_id        VARCHAR(36) NOT NULL,
    event_type      VARCHAR(64) NOT NULL,
    work_request_id VARCHAR(64) NOT NULL,
    lineage_parent  VARCHAR(128),
    payload         JSONB NOT NULL,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_governance_active_event_id
    ON vision.governance_events_history (event_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_governance_history_wr_id
    ON vision.governance_events_history (work_request_id);

CREATE OR REPLACE VIEW vision.governance_events AS
SELECT id, event_id, event_type, work_request_id, lineage_parent, payload, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.governance_events_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.governance_events_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.governance_events_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.governance_events_id_seq'));

    INSERT INTO vision.governance_events_history
        (id, event_id, event_type, work_request_id, lineage_parent, payload, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.event_id, NEW.event_type, NEW.work_request_id,
         NEW.lineage_parent, NEW.payload, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.governance_events_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.governance_events_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.governance_events_history
        (id, event_id, event_type, work_request_id, lineage_parent, payload, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.event_id, NEW.event_type, NEW.work_request_id,
         NEW.lineage_parent, NEW.payload, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, event_id, event_type, work_request_id, lineage_parent,
              payload, created_at, recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.governance_events_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.governance_events_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_governance_events_insert
    INSTEAD OF INSERT ON vision.governance_events
    FOR EACH ROW EXECUTE FUNCTION vision.governance_events_insert_trigger();
CREATE TRIGGER trg_governance_events_update
    INSTEAD OF UPDATE ON vision.governance_events
    FOR EACH ROW EXECUTE FUNCTION vision.governance_events_update_trigger();
CREATE TRIGGER trg_governance_events_delete
    INSTEAD OF DELETE ON vision.governance_events
    FOR EACH ROW EXECUTE FUNCTION vision.governance_events_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  5. lifecycle_events
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.lifecycle_events_history (
    id              INTEGER NOT NULL,
    event_id        VARCHAR(36) NOT NULL,
    wr_id           VARCHAR(36) NOT NULL,
    from_state      VARCHAR(32),
    to_state        VARCHAR(32) NOT NULL,
    actor           VARCHAR(128) NOT NULL,
    reason          VARCHAR(256),
    metadata        JSONB,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_lifecycle_active_event_id
    ON vision.lifecycle_events_history (event_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_lifecycle_history_wr_id
    ON vision.lifecycle_events_history (wr_id);

CREATE OR REPLACE VIEW vision.lifecycle_events AS
SELECT id, event_id, wr_id, from_state, to_state, actor, reason, metadata, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.lifecycle_events_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.lifecycle_events_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.lifecycle_events_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.lifecycle_events_id_seq'));

    INSERT INTO vision.lifecycle_events_history
        (id, event_id, wr_id, from_state, to_state, actor, reason, metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.event_id, NEW.wr_id, NEW.from_state, NEW.to_state,
         NEW.actor, NEW.reason, NEW.metadata, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.lifecycle_events_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.lifecycle_events_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.lifecycle_events_history
        (id, event_id, wr_id, from_state, to_state, actor, reason, metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.event_id, NEW.wr_id, NEW.from_state, NEW.to_state,
         NEW.actor, NEW.reason, NEW.metadata, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, event_id, wr_id, from_state, to_state, actor, reason,
              metadata, created_at, recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.lifecycle_events_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.lifecycle_events_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_lifecycle_events_insert
    INSTEAD OF INSERT ON vision.lifecycle_events
    FOR EACH ROW EXECUTE FUNCTION vision.lifecycle_events_insert_trigger();
CREATE TRIGGER trg_lifecycle_events_update
    INSTEAD OF UPDATE ON vision.lifecycle_events
    FOR EACH ROW EXECUTE FUNCTION vision.lifecycle_events_update_trigger();
CREATE TRIGGER trg_lifecycle_events_delete
    INSTEAD OF DELETE ON vision.lifecycle_events
    FOR EACH ROW EXECUTE FUNCTION vision.lifecycle_events_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  6. branches
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.branches_history (
    id               INTEGER NOT NULL,
    branch_id        VARCHAR(36) NOT NULL,
    wr_id            VARCHAR(36) NOT NULL,
    parent_branch_id VARCHAR(36),
    fork_point       VARCHAR(36),
    label            VARCHAR(64),
    score            DOUBLE PRECISION,
    status           VARCHAR(32) NOT NULL DEFAULT 'active',
    created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt   TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branches_active_branch_id
    ON vision.branches_history (branch_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_branches_history_wr_id
    ON vision.branches_history (wr_id);

CREATE OR REPLACE VIEW vision.branches AS
SELECT id, branch_id, wr_id, parent_branch_id, fork_point, label, score, status, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.branches_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.branches_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.branches_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.branches_id_seq'));

    INSERT INTO vision.branches_history
        (id, branch_id, wr_id, parent_branch_id, fork_point, label, score, status, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.branch_id, NEW.wr_id, NEW.parent_branch_id, NEW.fork_point,
         NEW.label, NEW.score, COALESCE(NEW.status, 'active'), COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.branches_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.branches_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.branches_history
        (id, branch_id, wr_id, parent_branch_id, fork_point, label, score, status, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.branch_id, NEW.wr_id, NEW.parent_branch_id, NEW.fork_point,
         NEW.label, NEW.score, NEW.status, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, branch_id, wr_id, parent_branch_id, fork_point, label,
              score, status, created_at, recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.branches_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.branches_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branches_insert
    INSTEAD OF INSERT ON vision.branches
    FOR EACH ROW EXECUTE FUNCTION vision.branches_insert_trigger();
CREATE TRIGGER trg_branches_update
    INSTEAD OF UPDATE ON vision.branches
    FOR EACH ROW EXECUTE FUNCTION vision.branches_update_trigger();
CREATE TRIGGER trg_branches_delete
    INSTEAD OF DELETE ON vision.branches
    FOR EACH ROW EXECUTE FUNCTION vision.branches_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  7. branch_artifacts
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.branch_artifacts_history (
    id                INTEGER NOT NULL,
    artifact_id       VARCHAR(36) NOT NULL,
    branch_id         VARCHAR(36) NOT NULL,
    wr_id             VARCHAR(36) NOT NULL,
    artifact_type     VARCHAR(32) NOT NULL,
    content           TEXT NOT NULL,
    parent_artifact_id VARCHAR(36),
    score             DOUBLE PRECISION,
    created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_branch_artifacts_active_artifact_id
    ON vision.branch_artifacts_history (artifact_id)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

CREATE INDEX IF NOT EXISTS idx_branch_artifacts_history_branch
    ON vision.branch_artifacts_history (branch_id);
CREATE INDEX IF NOT EXISTS idx_branch_artifacts_history_wr
    ON vision.branch_artifacts_history (wr_id);

CREATE OR REPLACE VIEW vision.branch_artifacts AS
SELECT id, artifact_id, branch_id, wr_id, artifact_type, content,
       parent_artifact_id, score, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.branch_artifacts_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.branch_artifacts_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.branch_artifacts_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.branch_artifacts_id_seq'));

    INSERT INTO vision.branch_artifacts_history
        (id, artifact_id, branch_id, wr_id, artifact_type, content,
         parent_artifact_id, score, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.artifact_id, NEW.branch_id, NEW.wr_id, NEW.artifact_type,
         NEW.content, NEW.parent_artifact_id, NEW.score,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.branch_artifacts_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.branch_artifacts_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.branch_artifacts_history
        (id, artifact_id, branch_id, wr_id, artifact_type, content,
         parent_artifact_id, score, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.artifact_id, NEW.branch_id, NEW.wr_id, NEW.artifact_type,
         NEW.content, NEW.parent_artifact_id, NEW.score, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, artifact_id, branch_id, wr_id, artifact_type, content,
              parent_artifact_id, score, created_at,
              recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.branch_artifacts_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.branch_artifacts_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_branch_artifacts_insert
    INSTEAD OF INSERT ON vision.branch_artifacts
    FOR EACH ROW EXECUTE FUNCTION vision.branch_artifacts_insert_trigger();
CREATE TRIGGER trg_branch_artifacts_update
    INSTEAD OF UPDATE ON vision.branch_artifacts
    FOR EACH ROW EXECUTE FUNCTION vision.branch_artifacts_update_trigger();
CREATE TRIGGER trg_branch_artifacts_delete
    INSTEAD OF DELETE ON vision.branch_artifacts
    FOR EACH ROW EXECUTE FUNCTION vision.branch_artifacts_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_count INTEGER;
    v_name  TEXT;
BEGIN
    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'vision' AND table_type = 'BASE TABLE';
    RAISE NOTICE 'Vision schema base tables (history): %', v_count;

    SELECT count(*) INTO v_count
    FROM information_schema.tables
    WHERE table_schema = 'vision' AND table_type = 'VIEW';
    RAISE NOTICE 'Vision schema views: %', v_count;

    SELECT count(*) INTO v_count
    FROM information_schema.triggers
    WHERE trigger_schema = 'vision';
    RAISE NOTICE 'Vision schema triggers: %', v_count;

    RAISE NOTICE '✅ Vision schema created — 7 tables, 7 views, 21 triggers.';
END $$;

COMMIT;
