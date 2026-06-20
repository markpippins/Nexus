-- V3: Create dedicated peb schema and migrate tables out of public
--
-- After this migration, all PEB tables live under the peb schema:
--   public.peb_state       → peb.state
--   public.peb_transactions → peb.transactions
--   public.peb_decisions    → peb.decisions
--   public.peb_traces       → peb.traces
--   public.peb_violations   → peb.violations
--   public.peb_capabilities → peb.capabilities
--
-- Schema-qualified names are used throughout so Flyway runs correctly
-- regardless of default_schema or search_path settings.

CREATE SCHEMA IF NOT EXISTS peb;

-- Move each table from public to peb (preserves indexes, constraints, FKs).
ALTER TABLE peb_state       SET SCHEMA peb;
ALTER TABLE peb_transactions SET SCHEMA peb;
ALTER TABLE peb_decisions    SET SCHEMA peb;
ALTER TABLE peb_traces       SET SCHEMA peb;
ALTER TABLE peb_violations   SET SCHEMA peb;
ALTER TABLE peb_capabilities SET SCHEMA peb;

-- Strip the peb_ prefix now that the schema provides the namespace.
ALTER TABLE peb.peb_state        RENAME TO state;
ALTER TABLE peb.peb_transactions RENAME TO transactions;
ALTER TABLE peb.peb_decisions    RENAME TO decisions;
ALTER TABLE peb.peb_traces       RENAME TO traces;
ALTER TABLE peb.peb_violations   RENAME TO violations;
ALTER TABLE peb.peb_capabilities RENAME TO capabilities;
