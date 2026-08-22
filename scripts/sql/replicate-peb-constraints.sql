-- PEB Schema Constraint Replication Script
-- Target: Strontium server (172.16.30.2, nexus database)
-- Purpose: Add PRIMARY KEY and UNIQUE constraints to the peb.* tables that
--          were missing them. These constraints are declared in the V1
--          migration (V1__init_peb_schema.sql) but were lost during a
--          schema rebuild on the local server. This script brings Strontium
--          in line with the local server.
--
-- Generated: 2026-08-22
-- Applied locally: 2026-08-22 (verified: 8 constraints in place)
--
-- Usage:
--   PGPASSWORD=pgpass psql -h strontium -p 5432 -U pguser -d nexus -f scripts/sql/replicate-peb-constraints.sql
--
-- Safety:
--   - Each ALTER TABLE uses IF NOT EXISTS semantics (checks for existing
--     constraint name before adding).
--   - Duplicate-row cleanup runs before constraint creation to avoid
--     failures from pre-existing duplicates.
--   - The script is idempotent: re-running it is a no-op.

\set ON_ERROR_STOP ON

-- =============================================================================
-- Phase 1: Clean up duplicate rows (if any) that would prevent constraint
-- creation. The begin_transaction + commit pattern created duplicate rows
-- when no PK existed. Keep the latest row (highest ctid) per id.
-- =============================================================================

-- Clean duplicate transaction rows by id
DELETE FROM peb.transactions
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.transactions GROUP BY id
);

-- Clean duplicate transaction rows by idempotency_key (keep latest by ctid)
DELETE FROM peb.transactions
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.transactions GROUP BY idempotency_key
);

-- Clean duplicate violation rows by id
DELETE FROM peb.violations
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.violations GROUP BY id
);

-- Clean duplicate decision rows by id
DELETE FROM peb.decisions
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.decisions GROUP BY id
);

-- Clean duplicate trace rows by id
DELETE FROM peb.traces
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.traces GROUP BY id
);

-- Clean duplicate capability rows by id
DELETE FROM peb.capabilities
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.capabilities GROUP BY id
);

-- Clean duplicate state rows by id
DELETE FROM peb.state
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.state GROUP BY id
);

-- Clean duplicate state rows by key (keep latest by ctid)
DELETE FROM peb.state
WHERE ctid NOT IN (
    SELECT max(ctid) FROM peb.state GROUP BY key
);

-- =============================================================================
-- Phase 2: Add PRIMARY KEY constraints
-- =============================================================================

-- transactions: PRIMARY KEY on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.transactions'::regclass
        AND conname = 'transactions_pkey'
    ) THEN
        ALTER TABLE peb.transactions ADD CONSTRAINT transactions_pkey PRIMARY KEY (id);
        RAISE NOTICE 'Added transactions_pkey';
    ELSE
        RAISE NOTICE 'transactions_pkey already exists — skipping';
    END IF;
END $$;

-- violations: PRIMARY KEY on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.violations'::regclass
        AND conname = 'violations_pkey'
    ) THEN
        ALTER TABLE peb.violations ADD CONSTRAINT violations_pkey PRIMARY KEY (id);
        RAISE NOTICE 'Added violations_pkey';
    ELSE
        RAISE NOTICE 'violations_pkey already exists — skipping';
    END IF;
END $$;

-- decisions: PRIMARY KEY on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.decisions'::regclass
        AND conname = 'decisions_pkey'
    ) THEN
        ALTER TABLE peb.decisions ADD CONSTRAINT decisions_pkey PRIMARY KEY (id);
        RAISE NOTICE 'Added decisions_pkey';
    ELSE
        RAISE NOTICE 'decisions_pkey already exists — skipping';
    END IF;
END $$;

-- traces: PRIMARY KEY on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.traces'::regclass
        AND conname = 'traces_pkey'
    ) THEN
        ALTER TABLE peb.traces ADD CONSTRAINT traces_pkey PRIMARY KEY (id);
        RAISE NOTICE 'Added traces_pkey';
    ELSE
        RAISE NOTICE 'traces_pkey already exists — skipping';
    END IF;
END $$;

-- capabilities: PRIMARY KEY on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.capabilities'::regclass
        AND conname = 'capabilities_pkey'
    ) THEN
        ALTER TABLE peb.capabilities ADD CONSTRAINT capabilities_pkey PRIMARY KEY (id);
        RAISE NOTICE 'Added capabilities_pkey';
    ELSE
        RAISE NOTICE 'capabilities_pkey already exists — skipping';
    END IF;
END $$;

-- state: PRIMARY KEY on id
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.state'::regclass
        AND conname = 'state_pkey'
    ) THEN
        ALTER TABLE peb.state ADD CONSTRAINT state_pkey PRIMARY KEY (id);
        RAISE NOTICE 'Added state_pkey';
    ELSE
        RAISE NOTICE 'state_pkey already exists — skipping';
    END IF;
END $$;

-- =============================================================================
-- Phase 3: Add UNIQUE constraints
-- =============================================================================

-- transactions: UNIQUE on idempotency_key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.transactions'::regclass
        AND conname = 'transactions_idempotency_key_key'
    ) THEN
        ALTER TABLE peb.transactions ADD CONSTRAINT transactions_idempotency_key_key UNIQUE (idempotency_key);
        RAISE NOTICE 'Added transactions_idempotency_key_key';
    ELSE
        RAISE NOTICE 'transactions_idempotency_key_key already exists — skipping';
    END IF;
END $$;

-- state: UNIQUE on key
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint
        WHERE conrelid = 'peb.state'::regclass
        AND conname = 'state_key_key'
    ) THEN
        ALTER TABLE peb.state ADD CONSTRAINT state_key_key UNIQUE (key);
        RAISE NOTICE 'Added state_key_key';
    ELSE
        RAISE NOTICE 'state_key_key already exists — skipping';
    END IF;
END $$;

-- =============================================================================
-- Phase 4: Verify all constraints are in place
-- =============================================================================

SELECT conrelid::regclass AS table_name, conname, contype, pg_get_constraintdef(oid) AS definition
FROM pg_constraint
WHERE conrelid IN (
    'peb.transactions'::regclass,
    'peb.violations'::regclass,
    'peb.decisions'::regclass,
    'peb.traces'::regclass,
    'peb.capabilities'::regclass,
    'peb.state'::regclass
)
AND contype IN ('p', 'u')
ORDER BY conrelid::regclass::text, contype;
