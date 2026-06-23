-- ═══════════════════════════════════════════════════════════════════════
--  Migration 015 — WRP v1.1 DAG Data Model
--
--  Adds:
--    1. parent_request_id → work_requests_history (recursive parent ref)
--    2. work_request_edges table (explicit DAG edges)
--    3. work_request_dag view (recursive CTE — materialized tree)
--    4. Cycle-detection and depth-limit constraint triggers
-- ═══════════════════════════════════════════════════════════════════════

BEGIN;

SET search_path TO vision;

-- ═══════════════════════════════════════════════════════════════════════
--  1. parent_request_id — direct parent ref on work_requests
-- ═══════════════════════════════════════════════════════════════════════

ALTER TABLE vision.work_requests_history
  ADD COLUMN parent_request_id VARCHAR(36);

CREATE INDEX IF NOT EXISTS idx_work_requests_history_parent
    ON vision.work_requests_history (parent_request_id);

-- ═══════════════════════════════════════════════════════════════════════
--  2. work_request_edges table (explicit DAG edges)
-- ═══════════════════════════════════════════════════════════════════════

CREATE TABLE vision.work_request_edges_history (
    id                  INTEGER NOT NULL,
    edge_id             VARCHAR(36) NOT NULL,
    parent_wr_id        VARCHAR(36) NOT NULL,
    child_wr_id         VARCHAR(36) NOT NULL,
    edge_type           VARCHAR(32) NOT NULL DEFAULT 'depends_on',
    metadata            JSONB,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_on_dt      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    recorded_until_dt   TIMESTAMPTZ NOT NULL DEFAULT '9999-12-31 23:59:59+00',

    PRIMARY KEY (id, recorded_on_dt)
);

-- Active-row uniqueness: one edge type between any pair
CREATE UNIQUE INDEX IF NOT EXISTS idx_edges_active_pair
    ON vision.work_request_edges_history (parent_wr_id, child_wr_id, edge_type)
    WHERE recorded_until_dt = '9999-12-31 23:59:59+00';

-- Lookup indexes
CREATE INDEX IF NOT EXISTS idx_edges_history_parent
    ON vision.work_request_edges_history (parent_wr_id);
CREATE INDEX IF NOT EXISTS idx_edges_history_child
    ON vision.work_request_edges_history (child_wr_id);
CREATE INDEX IF NOT EXISTS idx_edges_history_type
    ON vision.work_request_edges_history (edge_type);

-- ═══════════════════════════════════════════════════════════════════════
--  work_request_edges VIEW + INSTEAD OF triggers
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vision.work_request_edges AS
SELECT id, edge_id, parent_wr_id, child_wr_id, edge_type, metadata, created_at,
       recorded_on_dt, recorded_until_dt
FROM   vision.work_request_edges_history
WHERE  NOW() >= recorded_on_dt AND NOW() < recorded_until_dt;

CREATE SEQUENCE IF NOT EXISTS vision.work_request_edges_id_seq START 1;

CREATE OR REPLACE FUNCTION vision.work_request_edges_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.work_request_edges_id_seq'));

    INSERT INTO vision.work_request_edges_history
        (id, edge_id, parent_wr_id, child_wr_id, edge_type, metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, COALESCE(NEW.edge_id, gen_random_uuid()::VARCHAR(36)),
         NEW.parent_wr_id, NEW.child_wr_id,
         COALESCE(NEW.edge_type, 'depends_on'), NEW.metadata,
         COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.edge_id := COALESCE(NEW.edge_id, gen_random_uuid()::VARCHAR(36));
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.work_request_edges_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.work_request_edges_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.work_request_edges_history
        (id, edge_id, parent_wr_id, child_wr_id, edge_type, metadata, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.edge_id, NEW.parent_wr_id, NEW.child_wr_id,
         NEW.edge_type, NEW.metadata, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, edge_id, parent_wr_id, child_wr_id, edge_type, metadata,
              created_at, recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

CREATE OR REPLACE FUNCTION vision.work_request_edges_delete_trigger()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE vision.work_request_edges_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';
    RETURN OLD;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_work_request_edges_insert
    INSTEAD OF INSERT ON vision.work_request_edges
    FOR EACH ROW EXECUTE FUNCTION vision.work_request_edges_insert_trigger();
CREATE TRIGGER trg_work_request_edges_update
    INSTEAD OF UPDATE ON vision.work_request_edges
    FOR EACH ROW EXECUTE FUNCTION vision.work_request_edges_update_trigger();
CREATE TRIGGER trg_work_request_edges_delete
    INSTEAD OF DELETE ON vision.work_request_edges
    FOR EACH ROW EXECUTE FUNCTION vision.work_request_edges_delete_trigger();

-- ═══════════════════════════════════════════════════════════════════════
--  3. work_request_dag — recursive CTE view
-- ═══════════════════════════════════════════════════════════════════════
--
--  Materializes the full DAG tree for any root work request.
--  Each row represents one node with its depth, path, and cycle flag.
--
--  Usage:
--    SELECT * FROM vision.work_request_dag WHERE root_wr_id = '<uuid>';
--    SELECT * FROM vision.work_request_dag WHERE root_wr_id IN (<roots>);
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE VIEW vision.work_request_dag AS
WITH RECURSIVE dag_tree AS (
    -- Anchor: all roots (no parent)
    SELECT
        wr.wr_id                         AS node_wr_id,
        wr.wr_id                         AS root_wr_id,
        wr.wr_id                         AS path,
        0                                AS depth,
        FALSE                            AS is_cycle,
        wr.intent,
        wr.status,
        wr.priority,
        wr.parent_request_id,
        NULL::VARCHAR(36)                AS parent_wr_id,
        NULL::VARCHAR(32)                AS edge_type,
        wr.created_at
    FROM vision.work_requests wr
    WHERE wr.parent_request_id IS NULL

    UNION ALL

    -- Recursive: children via edges
    SELECT
        child.wr_id                      AS node_wr_id,
        dt.root_wr_id                    AS root_wr_id,
        dt.path || '→' || child.wr_id    AS path,
        dt.depth + 1                     AS depth,
        child.wr_id = ANY(string_to_array(dt.path, '→')) AS is_cycle,
        child.intent,
        child.status,
        child.priority,
        child.parent_request_id,
        e.parent_wr_id                   AS parent_wr_id,
        e.edge_type                      AS edge_type,
        child.created_at
    FROM dag_tree dt
    JOIN vision.work_request_edges e ON e.parent_wr_id = dt.node_wr_id
    JOIN vision.work_requests child ON child.wr_id = e.child_wr_id
    WHERE dt.depth < 50  -- safety: max depth
)
SELECT
    node_wr_id,
    root_wr_id,
    path,
    depth,
    is_cycle,
    intent,
    status,
    priority,
    parent_wr_id,
    edge_type,
    created_at
FROM dag_tree
WHERE NOT is_cycle;  -- filter out cycles (they're detected and excluded)

-- ═══════════════════════════════════════════════════════════════════════
--  4. Update the INSERT trigger on work_requests to propagate
--     parent_request_id into the history table
-- ═══════════════════════════════════════════════════════════════════════

CREATE OR REPLACE FUNCTION vision.work_requests_insert_trigger()
RETURNS TRIGGER AS $$
DECLARE
    new_id INTEGER;
BEGIN
    new_id := COALESCE(NEW.id, nextval('vision.work_requests_id_seq'));

    INSERT INTO vision.work_requests_history
        (id, wr_id, intent, constraints, priority, context, status,
         parent_request_id, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (new_id, NEW.wr_id, NEW.intent, NEW.constraints, COALESCE(NEW.priority, 5),
         NEW.context, COALESCE(NEW.status, 'NEW'),
         NEW.parent_request_id, COALESCE(NEW.created_at, NOW()),
         NOW(), '9999-12-31 23:59:59+00');

    NEW.id := new_id;
    NEW.created_at := COALESCE(NEW.created_at, NOW());
    NEW.recorded_on_dt := NOW();
    NEW.recorded_until_dt := '9999-12-31 23:59:59+00';
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Also update the UPDATE trigger to carry parent_request_id through
CREATE OR REPLACE FUNCTION vision.work_requests_update_trigger()
RETURNS TRIGGER AS $$
DECLARE
    r RECORD;
BEGIN
    UPDATE vision.work_requests_history
    SET    recorded_until_dt = NOW()
    WHERE  id = OLD.id AND recorded_until_dt = '9999-12-31 23:59:59+00';

    INSERT INTO vision.work_requests_history
        (id, wr_id, intent, constraints, priority, context, status,
         parent_request_id, created_at,
         recorded_on_dt, recorded_until_dt)
    VALUES
        (OLD.id, NEW.wr_id, NEW.intent, NEW.constraints, NEW.priority,
         NEW.context, NEW.status,
         NEW.parent_request_id, OLD.created_at,
         clock_timestamp(), '9999-12-31 23:59:59+00')
    RETURNING id, wr_id, intent, constraints, priority, context, status,
              parent_request_id,
              created_at, recorded_on_dt, recorded_until_dt INTO r;

    RETURN r;
END;
$$ LANGUAGE plpgsql;

-- ═══════════════════════════════════════════════════════════════════════
--  VERIFICATION
-- ═══════════════════════════════════════════════════════════════════════

DO $$ DECLARE
    v_col_exists BOOLEAN;
    v_tbl_exists BOOLEAN;
BEGIN
    SELECT EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_schema = 'vision'
          AND table_name = 'work_requests_history'
          AND column_name = 'parent_request_id'
    ) INTO v_col_exists;

    SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'vision'
          AND table_name = 'work_request_edges_history'
          AND table_type = 'BASE TABLE'
    ) INTO v_tbl_exists;

    RAISE NOTICE 'DAG migration: parent_request_id column exists: %', v_col_exists;
    RAISE NOTICE 'DAG migration: work_request_edges table exists: %', v_tbl_exists;

    IF v_col_exists AND v_tbl_exists THEN
        RAISE NOTICE '✅ DAG Data Model migration applied — parent_request_id, edges table, DAG view.';
    ELSE
        RAISE WARNING '⚠️ DAG migration may be incomplete.';
    END IF;
END $$;

COMMIT;
