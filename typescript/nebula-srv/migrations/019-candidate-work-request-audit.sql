-- 019: Add work_request_id and completed flag to harvest_candidates
-- work_request_id links to the WRP runtime work request (UUID, event-sourced system).
-- completed is a manual flag for backfilling conduit-era work that was done before the WRP runtime.

ALTER TABLE nebula.harvest_candidates ADD COLUMN work_request_id UUID;
ALTER TABLE nebula.harvest_candidates ADD COLUMN completed BOOLEAN NOT NULL DEFAULT false;
