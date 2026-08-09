-- V086: Add updated_at trigger to tackle.roles
-- Architect handoff (agent_record 932b3827): tackle.roles v9 follow-up.
-- Ensures updated_at is auto-set to NOW() on every UPDATE,
-- matching the pattern already in use by execution, voyager, and kernel.

BEGIN;

CREATE OR REPLACE FUNCTION tackle.set_updated_at()
 RETURNS trigger
 LANGUAGE plpgsql
AS $$
        BEGIN
            NEW.updated_at = NOW();
            RETURN NEW;
        END;
        $$;

CREATE TRIGGER trg_tackle_roles_updated_at
  BEFORE UPDATE ON tackle.roles
  FOR EACH ROW
  EXECUTE FUNCTION tackle.set_updated_at();

COMMIT;
