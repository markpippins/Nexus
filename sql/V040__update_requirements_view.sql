-- V040: Update requirements view to include work_request_dco column
--
-- The requirements temporal view was missing the work_request_dco column
-- added in V039, causing the compiler cron to fail when checking for
-- existing DCOs.

CREATE OR REPLACE VIEW nebula.requirements AS
SELECT id,
    system_id,
    subsystem_id,
    feature_id,
    title,
    description,
    status,
    priority,
    start_date,
    completion_date,
    created_at,
    recorded_on_dt,
    recorded_until_dt,
    valid_from,
    valid_until,
    parent_id,
    req_type,
    acceptance_criteria,
    candidate_id,
    conduit_plan_id,
    work_request_dco
FROM nebula.requirements_history rh
WHERE now() >= recorded_on_dt AND now() < recorded_until_dt
AND now() >= valid_from AND now() < valid_until;
