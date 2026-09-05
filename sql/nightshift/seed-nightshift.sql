-- Night-shift scheduler seed — nexus_nightshift (Option-A isolation target).
--
-- Doubles as the canonical bootstrap for a fresh night-shift test DB. Mirrors
-- the live config_bundle rows (CLI/harn-opencode) so the scheduler runner's
-- fail-closed _is_interactive_hosted guard passes, then inserts the four
-- nightshift cycle entries (Planner -> Builder -> Critic -> Reviewer) with
-- staggered intervals.
--
-- Hermetic-safe: contains NO live credentials. The provider api_key here is a
-- placeholder; the real key lives in the live tackle.providers row and is not
-- required for scheduler launches (the launcher delegates to the harness's own
-- model/provider config).
--
-- Safe to re-run (idempotent): every statement guards on existence.
--
-- Usage:  psql -d nexus_nightshift -f seed-nightshift.sql

BEGIN;

-- ── 0. Cycle roles (FK targets for config_bundle / agent_scheduler) ──────
INSERT INTO tackle.roles (name, description) VALUES
  ('planner', 'Work decomposition authority — creates and manages implementation plans, promotes proposals'),
  ('builder', 'Implementation executor — picks up pending plans and implements them against acceptance criteria'),
  ('critic',  'Adversarial evaluator — surfaces risks, contradictions, and blind spots'),
  ('reviewer','Quality gate — reviews changes, issues approval/rejection receipts')
ON CONFLICT (name) DO NOTHING;

-- ── 1. Provider + verified model (config_bundle verified-gate target) ────
-- The verified_gate trigger forces is_active=0 unless the referenced model is
-- verified. A schema-only bootstrap has empty tackle.providers/models, so the
-- nightshift DB must carry its own provider+model rows.
INSERT INTO tackle.providers (id, name, type, endpoint_url, api_key, config_json, created_at, updated_at)
SELECT 'prov-nightshift', 'Nightshift placeholder provider', 'openai',
       'https://integrate.api.nvidia.com/v1',
       'nvapi-PLACEHOLDER-NOT-A-REAL-KEY',
       '{"opencodeProvider": "nvidia"}', now(), now()
WHERE NOT EXISTS (SELECT 1 FROM tackle.providers WHERE id='prov-nightshift');

INSERT INTO tackle.models (id, name, harness_id, provider_id, model_identifier, created_at, updated_at, verified)
SELECT 'mod-nightshift-deepseek-v4-flash', 'DeepSeek V4 Flash 0731 (nightshift)', 'harn-opencode',
       'prov-nightshift', 'deepseek-ai/deepseek-v4-flash-0731', now(), now(), true
WHERE NOT EXISTS (SELECT 1 FROM tackle.models WHERE id='mod-nightshift-deepseek-v4-flash');

-- ── 2. config_bundle: CLI/harn-opencode rows for the cycle roles ─────────
-- The runner refuses to launch a role unless an ACTIVE config_bundle with
-- invocation_mode != 'INTERACTIVE' exists (fail-closed, incident e6d854da
-- spirit). model_id here must be a verified model (see gate above).
INSERT INTO tackle.config_bundle
  (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, created_at, updated_at)
SELECT 'cb-nightshift-planner', 'Bundle: nightshift planner (CLI/harn-opencode)', 'planner',
       'mod-nightshift-deepseek-v4-flash', 'prov-nightshift', 'harn-opencode', 1, 'CLI', 1, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM tackle.config_bundle WHERE role='planner' AND is_active=1 AND invocation_mode='CLI');

INSERT INTO tackle.config_bundle
  (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, created_at, updated_at)
SELECT 'cb-nightshift-builder', 'Bundle: nightshift builder (CLI/harn-opencode)', 'builder',
       'mod-nightshift-deepseek-v4-flash', 'prov-nightshift', 'harn-opencode', 1, 'CLI', 1, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM tackle.config_bundle WHERE role='builder' AND is_active=1 AND invocation_mode='CLI');

INSERT INTO tackle.config_bundle
  (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, created_at, updated_at)
SELECT 'cb-nightshift-critic', 'Bundle: nightshift critic (CLI/harn-opencode)', 'critic',
       'mod-nightshift-deepseek-v4-flash', 'prov-nightshift', 'harn-opencode', 1, 'CLI', 1, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM tackle.config_bundle WHERE role='critic' AND is_active=1 AND invocation_mode='CLI');

INSERT INTO tackle.config_bundle
  (id, name, role, model_id, provider_id, harness_id, priority, invocation_mode, is_active, created_at, updated_at)
SELECT 'cb-nightshift-reviewer', 'Bundle: nightshift reviewer (CLI/harn-opencode)', 'reviewer',
       'mod-nightshift-deepseek-v4-flash', 'prov-nightshift', 'harn-opencode', 1, 'CLI', 1, now(), now()
WHERE NOT EXISTS (SELECT 1 FROM tackle.config_bundle WHERE role='reviewer' AND is_active=1 AND invocation_mode='CLI');

-- ── 3. Harness row if missing (launcher reads tackle.harnesses) ──────────
INSERT INTO tackle.harnesses (id, name, invocation_semantics, created_at, updated_at)
SELECT 'harn-opencode', 'Opencode CLI',
       '{"binary":"opencode","capabilities":{"model":true,"agent":true,"working_directory":true,"system_prompt":false},"execution":{"mode":"interactive","subcommand":"run"},"semantics":{"model":{"type":"flag","flag":"--model"},"agent":{"type":"flag","flag":"--agent"},"working_directory":{"type":"flag","flag":"--dir"}},"role_mapping":{"strategy":"agent"}}',
       now(), now()
WHERE NOT EXISTS (SELECT 1 FROM tackle.harnesses WHERE id='harn-opencode');

-- ── 4. Nightshift cycle entries ──────────────────────────────────────────
-- Staggered intervals (~30 min per stage) so the flow order
-- Planner -> Builder -> Critic -> Reviewer is preserved. _has_eligible_work
-- gates builder (READY execution.requests) and reviewer (open vision.tickets)
-- before launch; planner/critic default to eligible (conservative).
-- project_dir=/home/codex/dev matches the day harness bootstrap.
INSERT INTO tackle.agent_scheduler
  (role, model_id, harness, agent_config, schedule_type, schedule_value, enabled, project_dir, task_slug)
SELECT 'planner', 'mod-nightshift-deepseek-v4-flash', 'opencode',
       '{"title":"nightshift-planner-triage"}', 'interval', 1800, 1, '/home/codex/dev', 'nightshift'
WHERE NOT EXISTS (SELECT 1 FROM tackle.agent_scheduler WHERE role='planner' AND harness='opencode' AND coalesce(task_slug,'')='nightshift');

INSERT INTO tackle.agent_scheduler
  (role, model_id, harness, agent_config, schedule_type, schedule_value, enabled, project_dir, task_slug)
SELECT 'builder', 'mod-nightshift-deepseek-v4-flash', 'opencode',
       '{"title":"nightshift-builder-implement"}', 'interval', 1800, 1, '/home/codex/dev', 'nightshift'
WHERE NOT EXISTS (SELECT 1 FROM tackle.agent_scheduler WHERE role='builder' AND harness='opencode' AND coalesce(task_slug,'')='nightshift');

INSERT INTO tackle.agent_scheduler
  (role, model_id, harness, agent_config, schedule_type, schedule_value, enabled, project_dir, task_slug)
SELECT 'critic', 'mod-nightshift-deepseek-v4-flash', 'opencode',
       '{"title":"nightshift-critic-gate"}', 'interval', 1800, 1, '/home/codex/dev', 'nightshift'
WHERE NOT EXISTS (SELECT 1 FROM tackle.agent_scheduler WHERE role='critic' AND harness='opencode' AND coalesce(task_slug,'')='nightshift');

INSERT INTO tackle.agent_scheduler
  (role, model_id, harness, agent_config, schedule_type, schedule_value, enabled, project_dir, task_slug)
SELECT 'reviewer', 'mod-nightshift-deepseek-v4-flash', 'opencode',
       '{"title":"nightshift-reviewer-merge"}', 'interval', 1800, 1, '/home/codex/dev', 'nightshift'
WHERE NOT EXISTS (SELECT 1 FROM tackle.agent_scheduler WHERE role='reviewer' AND harness='opencode' AND coalesce(task_slug,'')='nightshift');

COMMIT;