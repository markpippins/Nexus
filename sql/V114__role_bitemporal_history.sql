-- V114 — T12 R7: role records — soft-expire on delete (preserved history)
--
-- nebula.roles is already a bitemporal view over nebula.roles_history:
--   - INSERT stamps valid_from = now(), valid_until = '9999-12-31' (defaults)
--   - the view exposes only rows where now() is inside [valid_from, valid_until)
--   - nebula.roles_history is the base table (PK id, UNIQUE name)
--
-- The one gap in "bitemporal with preserved history" was DELETE: the
-- role CRUD route hard-deleted the row, destroying its history and
-- violating expire-not-delete. This migration adds an INSTEAD OF DELETE
-- trigger so a delete soft-expires the row (valid_until = now()), keeping
-- the record in nebula.roles_history for lineage/FK resolution.
--
-- Field edits (PATCH) stay in-place on purpose: each capability/domain
-- change is recorded as a `capability.changed` event on cascade.events
-- (T12 R3), so the event stream is the field-edit audit trail and the
-- bitemporal window tracks the role lifecycle (grant → revoke/expire).
--
-- Mirrors the existing nebula.conversation_blocks INSTEAD OF DELETE pattern.
-- Idempotent (CREATE OR REPLACE + DROP IF EXISTS).

BEGIN;

CREATE OR REPLACE FUNCTION nebula.roles_delete_trigger()
RETURNS trigger
LANGUAGE plpgsql
AS $function$
BEGIN
    UPDATE nebula.roles_history
       SET valid_until = NOW()
     WHERE id = OLD.id
       AND valid_until = '9999-12-31 00:00:00+00';
    RETURN OLD;
END;
$function$;

DROP TRIGGER IF EXISTS trg_roles_soft_delete ON nebula.roles;
CREATE TRIGGER trg_roles_soft_delete
    INSTEAD OF DELETE ON nebula.roles
    FOR EACH ROW EXECUTE FUNCTION nebula.roles_delete_trigger();

COMMIT;
