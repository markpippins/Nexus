-- V2: Add UNIQUE constraint on peb_violations.transaction_id
--
-- Prevents duplicate violation rows when MCP retries resend the same
-- transaction. PostgreSQL allows multiple NULL values in a UNIQUE
-- constraint, so the rare null-transaction_id row is unaffected.
-- If existing data has duplicates, this migration will fail — run a
-- dedup CTE first or add WHERE clause deferral.

ALTER TABLE peb_violations
    ADD CONSTRAINT uq_peb_violations_transaction_id UNIQUE (transaction_id);
