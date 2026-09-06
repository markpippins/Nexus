-- V142 (Lilac C3 cutover prep): register the Python conduit kernel process
-- as a named producer.
--
-- Found while implementing the staged writer redirection flag: the C1
-- provenance stamp (db_adapter._receipt_provenance) declares producer_id
-- 'nexus-conduit-python' for the python-direct channel, but V139 seeded
-- only conduit-mcp / nexus-execution-worker / peb-srv. Enforce-mode writes
-- from the Python channel were (correctly) refused by the grant trigger —
-- the DB did its fail-closed job; this migration registers the authority
-- the writers actually declare (Q3: the conduit family holds lifecycle
-- kinds; admission remains PEB-only).
--
-- R9 note: schema data change. Replicate to vanadium after the DBA applies
-- it locally (operator confirmation required per AGENTS.md R9).

INSERT INTO resolution.producer_registry
  (producer_id, name, allowed_kinds, contract_version_min, contract_version_max, registered_by)
VALUES
  ('nexus-conduit-python',
   'Conduit Python kernel (conduit-kernel unit, python-direct channel)',
   ARRAY['plan_create','planning','implementation','review','review_pass',
         'review_reject','critique','critique_pass','critique_reject','block',
         'hold','ccnf_execution','requeued','api_limit','abandoned',
         'cancelled','plan_block'],
   1, 1, 'V142')
ON CONFLICT (producer_id) DO NOTHING;

COMMENT ON TABLE resolution.producer_registry IS
  'Named write authorities with kind-scoped grants (R2/Q3). Unknown/ambiguous writer → refused. Registered: conduit-mcp (TS), nexus-execution-worker (worker lane), nexus-conduit-python (python-direct channel, V142), peb-srv (admission-only).';
