--
-- PostgreSQL database dump
--

\restrict C8MfL63nSMCIDEBc89rnDLuEcYBum5TpneauPGvA1v8RzoTJTBUxm6anDHqOP2x

-- Dumped from database version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)
-- Dumped by pg_dump version 16.14 (Ubuntu 16.14-0ubuntu0.24.04.1)

SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Data for Name: concept; Type: TABLE DATA; Schema: resolution; Owner: -
--

SET SESSION AUTHORIZATION DEFAULT;

ALTER TABLE resolution.concept DISABLE TRIGGER ALL;

INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('3c27e87d-cd91-41c9-a21e-c982d94c65c5', 'Asset', 'Canonical identity anchor for any tracked thing in the system', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('eb71fe83-b476-4197-af4e-eb76720ea5d7', 'Harvest', 'A processing run over a source transcript, producing docklang and candidates', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('dda27bb4-a994-4c56-8693-34bee69738c4', 'Candidate', 'A harvested unit proposed for promotion toward a requirement', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('094b785c-82b4-44fc-b262-7e60bc85db6f', 'Requirement', 'A governed unit of scope, compiled to SOL IR — spawned from a candidate or entered manually', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('5f2f4dea-9715-4104-b2d3-100abe72685e', 'Specification', 'A deliberation/audit artifact over a complex requirement, revised via agenda review, not itself compiled', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('efba776b-d731-4018-8610-a3e1af0bc3d3', 'ImplementationPlan', 'A concrete plan transforming a requirement/specification into actionable work', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('d22cd236-6353-445e-9b48-bbb8880493df', 'WorkRequest', 'The dispatchable unit of execution', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('8be34f47-00d0-4bd7-8a5b-375a8f785882', 'Observation', 'A recorded trigger event that may require assessment', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('fc9b393a-5269-47d8-95cb-61f1cef05d3e', 'Assessment', 'The recorded analysis and outcome of an observation', '2026-08-12 04:36:32.371841+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('e95175e0-1f71-4858-9a82-0ea283baaa65', 'OpenQuestion', 'A question raised during analysis, potentially implicating several assets, resolved through deliberation', '2026-08-13 02:45:20.536532+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('513796b2-3c19-4559-8ab3-d749033d0464', 'Answer', 'One role''s response within an open question''s deliberation thread', '2026-08-13 02:45:20.536532+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('be93554f-f720-4b6b-b011-7540d9b96e59', 'VerifiedStatement', 'A Verifier-compiled SOL IR fact, derived from one verified Answer', '2026-08-13 20:02:35.668635+00', NULL);
INSERT INTO resolution.concept (id, name, description, created_at, expired_at) VALUES ('b6872d58-0f7a-41ce-bdf4-e8902957d647', 'WorkRequestEdge', 'A dependency edge between two WorkRequests -- parent is upstream/prerequisite, child is downstream/dependent', '2026-08-15 17:28:48.391495+00', NULL);


ALTER TABLE resolution.concept ENABLE TRIGGER ALL;

--
-- Data for Name: observation; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.observation DISABLE TRIGGER ALL;

INSERT INTO resolution.observation (id, trigger_type, asset_concept_id, source_artifact_id, predicate_type, predicate_id, payload, assessed, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('0b000000-0000-0000-0000-000000000001', 'candidate_compile_failure', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'cb000000-0000-0000-0000-00000000000b', NULL, NULL, '{"reason": "lacks_operand", "to_concept": "OnCallEngineer", "from_concept": "WorkRequest", "attempted_relationship": "escalates_to"}', true, '2026-08-14 03:24:27.169956+00', '2026-08-14 03:24:27.169956+00', 'infinity', '2026-08-14 03:24:27.169956+00', 'infinity');


ALTER TABLE resolution.observation ENABLE TRIGGER ALL;

--
-- Data for Name: assessment; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.assessment DISABLE TRIGGER ALL;

INSERT INTO resolution.assessment (id, observation_id, outcome, confidence, impact_scope, analysis_detail, rationale, dimensions_used, dimensions_total, agenda_id, auto_resolve_plan_id, forum_post_id, resolved_at, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('a5000001-0000-0000-0000-000000000001', '0b000000-0000-0000-0000-000000000001', 'needs_deliberation', NULL, '{"missing_concept": "possibly none -- may be a missing concept_relationship on an existing Role concept, or a genuinely new concept"}', 'Candidate cannot compile: no concept_relationship exists for WorkRequest escalating to a role/person. Need to decide whether this is a new concept_relationship on an existing concept, or evidence the language is missing a concept entirely.', NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-14 03:24:27.17632+00', '2026-08-14 03:24:27.17632+00', 'infinity', '2026-08-14 03:24:27.17632+00', 'infinity');


ALTER TABLE resolution.assessment ENABLE TRIGGER ALL;

--
-- Data for Name: canonical_asset; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.canonical_asset DISABLE TRIGGER ALL;

INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash, validity_start, validity_end, created_at, expired_at) VALUES ('11111111-1111-1111-1111-111111111101', 'harvest:2026-08-12-arch-review', 'Harvest', NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.746463+00', NULL);
INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash, validity_start, validity_end, created_at, expired_at) VALUES ('11111111-1111-1111-1111-111111111102', 'candidate:doc-store-access', 'Candidate', NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.746463+00', NULL);
INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash, validity_start, validity_end, created_at, expired_at) VALUES ('11111111-1111-1111-1111-111111111103', 'candidate:doc-store-indexing', 'Candidate', NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.746463+00', NULL);
INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash, validity_start, validity_end, created_at, expired_at) VALUES ('11111111-1111-1111-1111-111111111104', 'requirement:doc-store-parent', 'Requirement', NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.746463+00', NULL);
INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash, validity_start, validity_end, created_at, expired_at) VALUES ('11111111-1111-1111-1111-111111111105', 'requirement:doc-store-access', 'Requirement', NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.746463+00', NULL);
INSERT INTO resolution.canonical_asset (id, canonical_asset_id, asset_kind, canonical_key, source_hash, content_hash, validity_start, validity_end, created_at, expired_at) VALUES ('11111111-1111-1111-1111-111111111106', 'requirement:doc-store-indexing', 'Requirement', NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.746463+00', NULL);


ALTER TABLE resolution.canonical_asset ENABLE TRIGGER ALL;

--
-- Data for Name: harvest; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.harvest DISABLE TRIGGER ALL;

INSERT INTO resolution.harvest (id, asset_id, source_path, source_filename, model, total_candidates, source_text, docklang, source_hash, version, run_metadata, file_size, tags, metadata, level, visibility_scope, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('22222222-2222-2222-2222-222222222201', '11111111-1111-1111-1111-111111111101', 'transcripts/2026-08-12-arch-review.md', '2026-08-12-arch-review.md', '', 2, NULL, NULL, NULL, 1, '{}', NULL, '{}', '{}', 1, 'all', '2026-08-12 04:36:47.749097+00', '2026-08-12 04:36:47.749097+00', 'infinity', '2026-08-12 04:36:47.749097+00', 'infinity');
INSERT INTO resolution.harvest (id, asset_id, source_path, source_filename, model, total_candidates, source_text, docklang, source_hash, version, run_metadata, file_size, tags, metadata, level, visibility_scope, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('e9000000-0000-0000-0000-000000000009', NULL, 'transcripts/2026-08-05-standup.md', '2026-08-05-standup.md', '', 1, NULL, NULL, NULL, 1, '{}', NULL, '{}', '{}', 1, 'all', '2026-08-13 02:46:01.43831+00', '2026-08-13 02:46:01.43831+00', 'infinity', '2026-08-13 02:46:01.43831+00', 'infinity');


ALTER TABLE resolution.harvest ENABLE TRIGGER ALL;

--
-- Data for Name: candidate; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.candidate DISABLE TRIGGER ALL;

INSERT INTO resolution.candidate (id, asset_id, harvest_id, title, intent_description, implementation_notes, code_snippets, tags, status, type, design_rationale, compilation_readiness, completed, needs_new_node, proposed_parent, proposed_name, placement_reason, system_id, subsystem_id, feature_id, work_request_id, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('33333333-3333-3333-3333-333333333301', '11111111-1111-1111-1111-111111111102', '22222222-2222-2222-2222-222222222201', 'Document store access layer', 'Needs a document database for the candidate/observation payloads', '[]', '[]', '{}', 'promoted', 'requirement', '[]', 0.910, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.750756+00', '2026-08-12 04:36:47.750756+00', '2026-08-12 04:36:47.750756+00', 'infinity', '2026-08-12 04:36:47.750756+00', 'infinity');
INSERT INTO resolution.candidate (id, asset_id, harvest_id, title, intent_description, implementation_notes, code_snippets, tags, status, type, design_rationale, compilation_readiness, completed, needs_new_node, proposed_parent, proposed_name, placement_reason, system_id, subsystem_id, feature_id, work_request_id, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('33333333-3333-3333-3333-333333333302', '11111111-1111-1111-1111-111111111103', '22222222-2222-2222-2222-222222222201', 'Document store indexing strategy', 'Needs a compound index on (asset_concept_id, source_artifact_id)', '[]', '[]', '{}', 'pending', 'requirement', '[]', 0.300, false, false, NULL, NULL, NULL, NULL, NULL, NULL, NULL, '2026-08-12 04:36:47.750756+00', '2026-08-12 04:36:47.750756+00', '2026-08-12 04:36:47.750756+00', 'infinity', '2026-08-12 04:36:47.750756+00', 'infinity');
INSERT INTO resolution.candidate (id, asset_id, harvest_id, title, intent_description, implementation_notes, code_snippets, tags, status, type, design_rationale, compilation_readiness, completed, needs_new_node, proposed_parent, proposed_name, placement_reason, system_id, subsystem_id, feature_id, work_request_id, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('cb000000-0000-0000-0000-00000000000b', NULL, 'e9000000-0000-0000-0000-000000000009', 'Escalate stuck WorkRequest to on-call', 'After 3 failed retries, page whoever is on call', '[]', '[]', '{}', 'pending', 'requirement', '[]', 0.200, false, true, 'WorkRequest', 'OnCallEngineer', 'candidate references an escalation relationship from WorkRequest to a person/role concept that does not exist in concept_relationship', NULL, NULL, NULL, NULL, '2026-08-13 02:46:01.440023+00', '2026-08-13 02:46:01.440023+00', '2026-08-13 02:46:01.440023+00', 'infinity', '2026-08-13 02:46:01.440023+00', 'infinity');


ALTER TABLE resolution.candidate ENABLE TRIGGER ALL;

--
-- Data for Name: candidate_segment_set; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.candidate_segment_set DISABLE TRIGGER ALL;

INSERT INTO resolution.candidate_segment_set (candidate_id, segment_set_id, role) VALUES ('33333333-3333-3333-3333-333333333301', '44444444-4444-4444-4444-444444444401', 'primary');
INSERT INTO resolution.candidate_segment_set (candidate_id, segment_set_id, role) VALUES ('33333333-3333-3333-3333-333333333302', '44444444-4444-4444-4444-444444444402', 'primary');


ALTER TABLE resolution.candidate_segment_set ENABLE TRIGGER ALL;

--
-- Data for Name: candidate_source_chunk; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.candidate_source_chunk DISABLE TRIGGER ALL;

INSERT INTO resolution.candidate_source_chunk (candidate_id, chunk_id, "position") VALUES ('cb000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000201', 1);
INSERT INTO resolution.candidate_source_chunk (candidate_id, chunk_id, "position") VALUES ('cb000000-0000-0000-0000-00000000000b', 'c1000000-0000-0000-0000-000000000202', 2);


ALTER TABLE resolution.candidate_source_chunk ENABLE TRIGGER ALL;

--
-- Data for Name: concept_attribute; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.concept_attribute DISABLE TRIGGER ALL;

INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'e95175e0-1f71-4858-9a82-0ea283baaa65', 'category', NULL, 'enum', false);
INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('a23a2ee8-94cf-44e7-a557-a40e19514c99', 'e95175e0-1f71-4858-9a82-0ea283baaa65', 'status', NULL, 'enum', true);
INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('5b88bbed-e14d-464c-bb7f-f3ec718b4948', '513796b2-3c19-4559-8ab3-d749033d0464', 'confidence', NULL, 'enum', false);
INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('ba5ef765-dfb6-49dc-b061-ce7382d16fec', '513796b2-3c19-4559-8ab3-d749033d0464', 'role', NULL, 'text', false);
INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('f395029e-9155-426d-873e-6e1fd282f260', '094b785c-82b4-44fc-b262-7e60bc85db6f', 'compilation_status', NULL, 'enum', true);
INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('b4056429-6419-4c7b-a98b-c1382648085d', 'b6872d58-0f7a-41ce-bdf4-e8902957d647', 'edge_type', NULL, 'enum', false);
INSERT INTO resolution.concept_attribute (id, concept_id, name, description, value_type, is_state_attribute) VALUES ('70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'd22cd236-6353-445e-9b48-bbb8880493df', 'business_status', NULL, 'enum', true);


ALTER TABLE resolution.concept_attribute ENABLE TRIGGER ALL;

--
-- Data for Name: concept_attribute_binding; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.concept_attribute_binding DISABLE TRIGGER ALL;

INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name) VALUES ('5b88bbed-e14d-464c-bb7f-f3ec718b4948', 'resolution', 'open_question_answer', 'confidence');
INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name) VALUES ('ba5ef765-dfb6-49dc-b061-ce7382d16fec', 'resolution', 'open_question_answer', 'role');
INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name) VALUES ('f395029e-9155-426d-873e-6e1fd282f260', 'resolution', 'requirement', 'compilation_status');
INSERT INTO resolution.concept_attribute_binding (attribute_id, schema_name, table_name, column_name) VALUES ('70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'resolution', 'work_request', 'business_status');


ALTER TABLE resolution.concept_attribute_binding ENABLE TRIGGER ALL;

--
-- Data for Name: concept_attribute_value; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.concept_attribute_value DISABLE TRIGGER ALL;

INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('a912a22f-1bc6-40d5-80fd-5ab60251867c', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'AMBIGUITY', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('77e25c7b-7be8-4bef-84ab-d068ef45ff5f', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'MISSING_INFO', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('aebc6790-8dfa-4691-b6f2-1afc9b31c1f3', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'CONFLICT', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('217a3212-f9f5-44bc-bfe4-7fdd5be26378', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'SCOPE', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('bdc60b92-d837-4f28-afef-d8d2cba6810e', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'DEPENDENCY', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('9df6a193-87bc-488f-8bad-0a4e4a8edb68', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'DUPLICATE_CANDIDATE', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('41757b62-4a68-4bf3-8160-a0b68716b6a2', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'WORK_COMPLETED', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('fd715903-800c-4761-8f8e-3bc8614c0820', '8ff3de10-ff3b-48d8-914f-ea3e8c133dfa', 'NEEDS_SPEC', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('8b502a97-81b8-4dcf-83a7-e8ca66c86cc7', 'a23a2ee8-94cf-44e7-a557-a40e19514c99', 'OPEN', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('57cb4961-3ba3-4181-a059-2fdde629caaa', 'a23a2ee8-94cf-44e7-a557-a40e19514c99', 'IN_DELIBERATION', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('f0dbd831-ede3-4b3e-bc2b-2e2630b3b288', 'a23a2ee8-94cf-44e7-a557-a40e19514c99', 'RESOLVED', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('f9ab428f-3daf-4bae-9831-380d94907950', 'a23a2ee8-94cf-44e7-a557-a40e19514c99', 'WONT_FIX', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('b8e4c0e4-9b61-4cdf-8e97-d667e07d5f24', 'a23a2ee8-94cf-44e7-a557-a40e19514c99', 'DEFERRED', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('2f5ffe88-511f-4607-b482-029090bcfab1', '5b88bbed-e14d-464c-bb7f-f3ec718b4948', 'LOW', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('a2ef5a02-d6b9-4d83-81af-5b57a830d886', '5b88bbed-e14d-464c-bb7f-f3ec718b4948', 'MEDIUM', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('86046646-08e1-494a-96d8-b8d039f1f72b', '5b88bbed-e14d-464c-bb7f-f3ec718b4948', 'HIGH', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('9ef399e5-81b6-4328-b2ca-c14df840044a', 'f395029e-9155-426d-873e-6e1fd282f260', 'draft', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('46d5324b-5159-469e-b295-d2f98d75f4ef', 'f395029e-9155-426d-873e-6e1fd282f260', 'compiled', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('26f26a58-8391-48f3-8176-b3b873f36a59', 'f395029e-9155-426d-873e-6e1fd282f260', 'rejected', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('70fb20df-30e3-4c07-9eaf-7bfc132945fe', 'b4056429-6419-4c7b-a98b-c1382648085d', 'depends_on', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('a435675e-cfd7-4507-b717-23575efd5fb3', '70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'DRAFT', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('6512396a-5e71-4dc1-8516-f8489ecd8937', '70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'APPROVED', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('a6da4dd9-c92b-4a19-a650-980567a7cb83', '70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'DISPATCHED', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('09b20fc4-aa51-465c-ad3f-2319c3f7e381', '70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'COMPLETED', NULL);
INSERT INTO resolution.concept_attribute_value (id, attribute_id, value, description) VALUES ('0cf9cf66-b0d4-47dd-a93c-264cb845f6e7', '70f62acf-ced2-41fa-bf6c-e54549ad1c9b', 'CANCELLED', NULL);


ALTER TABLE resolution.concept_attribute_value ENABLE TRIGGER ALL;

--
-- Data for Name: concept_relationship; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.concept_relationship DISABLE TRIGGER ALL;

INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('8b8d93a6-47c4-49a4-b070-cd5d7b0a04c2', 'eb71fe83-b476-4197-af4e-eb76720ea5d7', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'produces', NULL, NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('fd4f8f53-8b6b-45ab-b7b6-1bcefe6053da', 'dda27bb4-a994-4c56-8693-34bee69738c4', '094b785c-82b4-44fc-b262-7e60bc85db6f', 'produces', NULL, NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('b589bd8d-9a75-4355-81c7-19eeef4c875c', '094b785c-82b4-44fc-b262-7e60bc85db6f', '094b785c-82b4-44fc-b262-7e60bc85db6f', 'spawns', NULL, NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('99613184-ee71-4a92-a54f-ea235e3f4581', '094b785c-82b4-44fc-b262-7e60bc85db6f', '5f2f4dea-9715-4104-b2d3-100abe72685e', 'member_of', 'green', NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('c401da6f-85a7-4aa5-9e4e-ac880757ceb2', '5f2f4dea-9715-4104-b2d3-100abe72685e', 'efba776b-d731-4018-8610-a3e1af0bc3d3', 'transforms_into', 'green', NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('d0588304-134f-4249-ba90-565edbe4de01', '094b785c-82b4-44fc-b262-7e60bc85db6f', 'efba776b-d731-4018-8610-a3e1af0bc3d3', 'transforms_into', 'green', NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('cb4bbe3f-f347-466a-a2f0-3e843cf348a2', 'efba776b-d731-4018-8610-a3e1af0bc3d3', 'd22cd236-6353-445e-9b48-bbb8880493df', 'transforms_into', 'green', NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('48679a01-7dab-497c-8edd-f01d363ff1f3', 'd22cd236-6353-445e-9b48-bbb8880493df', 'd22cd236-6353-445e-9b48-bbb8880493df', 'provenance_of', 'red', NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('d3bd232c-f3c1-4176-bd50-ef4fdfbc77d7', '8be34f47-00d0-4bd7-8a5b-375a8f785882', 'fc9b393a-5269-47d8-95cb-61f1cef05d3e', 'basis_of', NULL, NULL, '2026-08-12 04:36:32.377019+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('a6c49168-f1a1-464b-b5d6-eca955e5112f', 'fc9b393a-5269-47d8-95cb-61f1cef05d3e', 'e95175e0-1f71-4858-9a82-0ea283baaa65', 'basis_of', NULL, NULL, '2026-08-13 02:45:20.562291+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('88893e8b-3f40-4a72-b6cf-47cbadfed531', 'e95175e0-1f71-4858-9a82-0ea283baaa65', '513796b2-3c19-4559-8ab3-d749033d0464', 'produces', NULL, NULL, '2026-08-13 02:45:20.562291+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('fe03134e-7b46-4e59-a30b-94ce108d7525', '513796b2-3c19-4559-8ab3-d749033d0464', 'be93554f-f720-4b6b-b011-7540d9b96e59', 'produces', NULL, NULL, '2026-08-13 20:02:35.681746+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('3bacfbc6-2272-4818-96eb-791c16b830cd', 'd22cd236-6353-445e-9b48-bbb8880493df', 'b6872d58-0f7a-41ce-bdf4-e8902957d647', 'has_dependency', NULL, NULL, '2026-08-15 17:28:48.405854+00', NULL);
INSERT INTO resolution.concept_relationship (id, from_concept_id, to_concept_id, relationship_type, path, notes, created_at, expired_at) VALUES ('646db3bd-e91f-4a33-8e11-80ba9ce4d34b', 'b6872d58-0f7a-41ce-bdf4-e8902957d647', 'd22cd236-6353-445e-9b48-bbb8880493df', 'depends_on', NULL, NULL, '2026-08-15 17:28:48.405854+00', NULL);


ALTER TABLE resolution.concept_relationship ENABLE TRIGGER ALL;

--
-- Data for Name: concept_relationship_binding; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.concept_relationship_binding DISABLE TRIGGER ALL;

INSERT INTO resolution.concept_relationship_binding (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes) VALUES ('88893e8b-3f40-4a72-b6cf-47cbadfed531', 'resolution', 'open_question', 'id', 'resolution', 'open_question_answer', 'question_id', 'OpenQuestion produces Answer');
INSERT INTO resolution.concept_relationship_binding (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes) VALUES ('fe03134e-7b46-4e59-a30b-94ce108d7525', 'resolution', 'open_question_answer', 'id', 'resolution', 'verified_statement', 'answer_id', 'Answer produces VerifiedStatement');
INSERT INTO resolution.concept_relationship_binding (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes) VALUES ('b589bd8d-9a75-4355-81c7-19eeef4c875c', 'resolution', 'requirement', 'id', 'resolution', 'requirement', 'parent_id', 'Requirement spawns Requirement: find my children');
INSERT INTO resolution.concept_relationship_binding (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes) VALUES ('3bacfbc6-2272-4818-96eb-791c16b830cd', 'resolution', 'work_request', 'id', 'resolution', 'work_request_edge', 'child_work_request_id', 'WorkRequest has_dependency WorkRequestEdge: find edges where I am the dependent side');
INSERT INTO resolution.concept_relationship_binding (concept_relationship_id, from_schema, from_table, from_column, to_schema, to_table, to_column, notes) VALUES ('646db3bd-e91f-4a33-8e11-80ba9ce4d34b', 'resolution', 'work_request_edge', 'parent_work_request_id', 'resolution', 'work_request', 'id', 'WorkRequestEdge depends_on WorkRequest: find my prerequisite');


ALTER TABLE resolution.concept_relationship_binding ENABLE TRIGGER ALL;

--
-- Data for Name: concept_state_transition; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.concept_state_transition DISABLE TRIGGER ALL;

INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('efa6bf84-a52b-4f79-8784-e49a6dd82a14', 'e95175e0-1f71-4858-9a82-0ea283baaa65', '8b502a97-81b8-4dcf-83a7-e8ca66c86cc7', '57cb4961-3ba3-4181-a059-2fdde629caaa', 'OPEN_to_IN_DELIBERATION', NULL, '2026-08-13 02:45:20.544889+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('7b4a9766-f69b-4d96-9306-48392a67d14b', 'e95175e0-1f71-4858-9a82-0ea283baaa65', '8b502a97-81b8-4dcf-83a7-e8ca66c86cc7', 'f9ab428f-3daf-4bae-9831-380d94907950', 'OPEN_to_WONT_FIX', NULL, '2026-08-13 02:45:20.544889+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('fef7c2a1-81a1-46bf-934b-721236d66a17', 'e95175e0-1f71-4858-9a82-0ea283baaa65', '57cb4961-3ba3-4181-a059-2fdde629caaa', 'b8e4c0e4-9b61-4cdf-8e97-d667e07d5f24', 'IN_DELIBERATION_to_DEFERRED', NULL, '2026-08-13 02:45:20.544889+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('91e0e1ed-fa6a-4837-9142-c2f807fdbb94', 'e95175e0-1f71-4858-9a82-0ea283baaa65', '57cb4961-3ba3-4181-a059-2fdde629caaa', 'f0dbd831-ede3-4b3e-bc2b-2e2630b3b288', 'IN_DELIBERATION_to_RESOLVED', NULL, '2026-08-13 02:45:20.544889+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('4201c811-f0a5-4d99-b626-835c5fcf097e', 'e95175e0-1f71-4858-9a82-0ea283baaa65', '57cb4961-3ba3-4181-a059-2fdde629caaa', 'f9ab428f-3daf-4bae-9831-380d94907950', 'IN_DELIBERATION_to_WONT_FIX', NULL, '2026-08-13 02:45:20.544889+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('50cd4780-bb4d-4669-8bb1-e68c60f570ad', 'e95175e0-1f71-4858-9a82-0ea283baaa65', 'b8e4c0e4-9b61-4cdf-8e97-d667e07d5f24', '57cb4961-3ba3-4181-a059-2fdde629caaa', 'DEFERRED_to_IN_DELIBERATION', NULL, '2026-08-13 02:45:20.544889+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('f8e56af6-f0bf-4d8d-9f5a-40b613850828', 'd22cd236-6353-445e-9b48-bbb8880493df', 'a435675e-cfd7-4507-b717-23575efd5fb3', '6512396a-5e71-4dc1-8516-f8489ecd8937', 'DRAFT_to_APPROVED', NULL, '2026-08-15 17:28:48.620498+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('2642ab9b-c7b1-40ad-ba6f-49b5aae118a8', 'd22cd236-6353-445e-9b48-bbb8880493df', 'a435675e-cfd7-4507-b717-23575efd5fb3', '0cf9cf66-b0d4-47dd-a93c-264cb845f6e7', 'DRAFT_to_CANCELLED', NULL, '2026-08-15 17:28:48.620498+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('db7cb890-679c-43be-a614-fe68fbbf3dc6', 'd22cd236-6353-445e-9b48-bbb8880493df', '6512396a-5e71-4dc1-8516-f8489ecd8937', '0cf9cf66-b0d4-47dd-a93c-264cb845f6e7', 'APPROVED_to_CANCELLED', NULL, '2026-08-15 17:28:48.620498+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('f9389719-c826-4ee2-9ad2-aca56bb9076d', 'd22cd236-6353-445e-9b48-bbb8880493df', '6512396a-5e71-4dc1-8516-f8489ecd8937', 'a6da4dd9-c92b-4a19-a650-980567a7cb83', 'APPROVED_to_DISPATCHED', NULL, '2026-08-15 17:28:48.620498+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('c1e709b7-60e3-44a3-abee-cb842879d0b7', 'd22cd236-6353-445e-9b48-bbb8880493df', 'a6da4dd9-c92b-4a19-a650-980567a7cb83', '0cf9cf66-b0d4-47dd-a93c-264cb845f6e7', 'DISPATCHED_to_CANCELLED', NULL, '2026-08-15 17:28:48.620498+00', NULL);
INSERT INTO resolution.concept_state_transition (id, concept_id, from_value_id, to_value_id, name, notes, created_at, expired_at) VALUES ('a0ea051a-462c-441a-8ef7-bb8fec144764', 'd22cd236-6353-445e-9b48-bbb8880493df', 'a6da4dd9-c92b-4a19-a650-980567a7cb83', '09b20fc4-aa51-465c-ad3f-2319c3f7e381', 'DISPATCHED_to_COMPLETED', NULL, '2026-08-15 17:28:48.620498+00', NULL);


ALTER TABLE resolution.concept_state_transition ENABLE TRIGGER ALL;

--
-- Data for Name: owning_subsystem; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.owning_subsystem DISABLE TRIGGER ALL;

INSERT INTO resolution.owning_subsystem (id, name, description) VALUES (1, 'nexus', NULL);
INSERT INTO resolution.owning_subsystem (id, name, description) VALUES (2, 'nebula', NULL);
INSERT INTO resolution.owning_subsystem (id, name, description) VALUES (3, 'tackle', NULL);
INSERT INTO resolution.owning_subsystem (id, name, description) VALUES (4, 'wind', NULL);
INSERT INTO resolution.owning_subsystem (id, name, description) VALUES (5, 'conduit', NULL);
INSERT INTO resolution.owning_subsystem (id, name, description) VALUES (6, 'cascade', NULL);


ALTER TABLE resolution.owning_subsystem ENABLE TRIGGER ALL;

--
-- Data for Name: representation; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.representation DISABLE TRIGGER ALL;

INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('a904bddb-49c7-467b-bd82-e2aad4ef4a02', '3c27e87d-cd91-41c9-a21e-c982d94c65c5', 'canonical_asset table', 'resolution', 'canonical_asset', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('d0242eb7-11a9-43a9-9d2a-6f7ef921a25e', 'eb71fe83-b476-4197-af4e-eb76720ea5d7', 'harvest table', 'resolution', 'harvest', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('73370e46-9ced-4830-905a-ed785d2e6e45', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'candidate table', 'resolution', 'candidate', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('512853a3-b74b-4eda-8267-1960e9b8b7b1', '094b785c-82b4-44fc-b262-7e60bc85db6f', 'requirement table', 'resolution', 'requirement', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('3f28a82e-2453-49a9-8214-030205d92796', '5f2f4dea-9715-4104-b2d3-100abe72685e', 'specification table', 'resolution', 'specification', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('6c4cf312-16b7-4a57-82ca-123924ecab0b', 'efba776b-d731-4018-8610-a3e1af0bc3d3', 'implementation_plan table', 'resolution', 'implementation_plan', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('592c5fcf-d8e7-4f7f-bb92-31f415fb7cc3', 'd22cd236-6353-445e-9b48-bbb8880493df', 'work_request table', 'resolution', 'work_request', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('f6cd02ea-30ec-473d-9ab5-ca7f48b4c00a', '8be34f47-00d0-4bd7-8a5b-375a8f785882', 'observation table', 'resolution', 'observation', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('6efc2cee-6e9d-4728-9b56-b0dd885b439b', 'fc9b393a-5269-47d8-95cb-61f1cef05d3e', 'assessment table', 'resolution', 'assessment', 2, NULL, NULL, '2026-08-12 04:36:32.372603+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('538296cc-511e-47d8-9848-2d97d9b8ea73', 'e95175e0-1f71-4858-9a82-0ea283baaa65', 'open_question table', 'resolution', 'open_question', 2, NULL, NULL, '2026-08-13 02:45:20.56115+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('6341ceaa-e991-4d74-aa2e-75e73f3b9406', '513796b2-3c19-4559-8ab3-d749033d0464', 'open_question_answer table', 'resolution', 'open_question_answer', 2, NULL, NULL, '2026-08-13 02:45:20.56115+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('e35e1bc1-f53c-4d4c-a794-8639464b4b01', 'be93554f-f720-4b6b-b011-7540d9b96e59', 'verified_statement table', 'resolution', 'verified_statement', 2, NULL, NULL, '2026-08-13 20:02:35.673802+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('a1000000-0000-0000-0000-000000000001', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'harvest.candidates jsonb (embedded array, dropped)', 'nebula', 'harvests_history', 2, NULL, '{"column": "candidates", "status": "dropped in resolution schema"}', '2026-08-14 11:10:53.473277+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('a2000000-0000-0000-0000-000000000002', 'efba776b-d731-4018-8610-a3e1af0bc3d3', 'WRP DAG node', 'conduit', 'wrp_dag_nodes', 5, NULL, '{"note": "external to resolution schema -- documented here for topology completeness, not physically joinable yet"}', '2026-08-14 11:10:53.476247+00', NULL);
INSERT INTO resolution.representation (id, concept_id, label, schema_name, table_name, owning_subsystem_id, owner, raw_metadata, created_at, expired_at) VALUES ('7726b5cd-86c4-407b-988e-8168faee7a93', 'b6872d58-0f7a-41ce-bdf4-e8902957d647', 'work_request_edge table', 'resolution', 'work_request_edge', 2, NULL, NULL, '2026-08-15 17:28:48.394314+00', NULL);


ALTER TABLE resolution.representation ENABLE TRIGGER ALL;

--
-- Data for Name: consumer_operation; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.consumer_operation DISABLE TRIGGER ALL;

INSERT INTO resolution.consumer_operation (id, representation_id, consumer_name, operation, notes, created_at, expired_at) VALUES ('1437b7dd-6bc2-44d9-be91-49f6f08c9638', '6c4cf312-16b7-4a57-82ca-123924ecab0b', 'Wind', 'reads', 'projects plan status into downstream views', '2026-08-14 11:10:53.477672+00', NULL);
INSERT INTO resolution.consumer_operation (id, representation_id, consumer_name, operation, notes, created_at, expired_at) VALUES ('e2a01751-4ff6-40c2-8dba-47b60fc7d2eb', '6c4cf312-16b7-4a57-82ca-123924ecab0b', 'Orb', 'reads', 'surfaces plan content for review', '2026-08-14 11:10:53.477672+00', NULL);
INSERT INTO resolution.consumer_operation (id, representation_id, consumer_name, operation, notes, created_at, expired_at) VALUES ('8080ac9e-fea5-41fc-bf55-84272534b50c', '6c4cf312-16b7-4a57-82ca-123924ecab0b', 'Drift', 'observes', 'flags projection drift against WRP', '2026-08-14 11:10:53.477672+00', NULL);
INSERT INTO resolution.consumer_operation (id, representation_id, consumer_name, operation, notes, created_at, expired_at) VALUES ('31d0ff50-aed5-42ba-a2ea-58ba6f704152', '73370e46-9ced-4830-905a-ed785d2e6e45', 'Planner', 'writes', 'creates candidate rows from harvest extraction', '2026-08-14 11:10:53.478512+00', NULL);
INSERT INTO resolution.consumer_operation (id, representation_id, consumer_name, operation, notes, created_at, expired_at) VALUES ('ca413cc8-39bd-429c-88fc-2579990e60d1', 'e35e1bc1-f53c-4d4c-a794-8639464b4b01', 'Verifier', 'writes', 'compiles a verified answer into an asserted SOL IR fact', '2026-08-14 11:10:53.479021+00', NULL);


ALTER TABLE resolution.consumer_operation ENABLE TRIGGER ALL;

--
-- Data for Name: expression; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.expression DISABLE TRIGGER ALL;

INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('77777777-7777-7777-7777-777777777701', 'function_call', NULL, NULL, NULL, 'escalates_to', 'boolean', 'WorkRequest escalates_to Role(OnCall)', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e1000000-0000-0000-0000-000000000001', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists related Answer', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e2000000-0000-0000-0000-000000000002', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists related VerifiedStatement', 'fe03134e-7b46-4e59-a30b-94ce108d7525', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e3000000-0000-0000-0000-000000000003', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists related Answer with confidence = HIGH', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e4000000-0000-0000-0000-000000000004', 'operator', '=', NULL, NULL, NULL, 'boolean', 'confidence = HIGH', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e5000000-0000-0000-0000-000000000005', 'attribute_ref', NULL, NULL, '5b88bbed-e14d-464c-bb7f-f3ec718b4948', NULL, 'enum', 'Answer.confidence', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e6000000-0000-0000-0000-000000000006', 'literal', NULL, 'HIGH', NULL, NULL, 'enum', '''HIGH''', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e7000000-0000-0000-0000-000000000007', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists Answer: confidence=HIGH AND role=architect', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e8000000-0000-0000-0000-000000000008', 'operator', 'AND', NULL, NULL, NULL, 'boolean', 'confidence=HIGH AND role=architect', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e0a00000-0000-0000-0000-00000000000a', 'operator', '=', NULL, NULL, NULL, 'boolean', 'role = architect', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e0b00000-0000-0000-0000-00000000000b', 'attribute_ref', NULL, NULL, 'ba5ef765-dfb6-49dc-b061-ce7382d16fec', NULL, 'text', 'Answer.role', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e0c00000-0000-0000-0000-00000000000c', 'literal', NULL, 'architect', NULL, NULL, 'text', '''architect''', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e7100000-0000-0000-0000-000000000071', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists Answer: confidence=HIGH OR role=architect', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e8100000-0000-0000-0000-000000000081', 'operator', 'OR', NULL, NULL, NULL, 'boolean', 'confidence=HIGH OR role=architect', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('f0000000-0000-0000-0000-000000000001', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'all children have compilation_status = compiled', 'b589bd8d-9a75-4355-81c7-19eeef4c875c', 'ALL');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('f0000000-0000-0000-0000-000000000002', 'operator', '=', NULL, NULL, NULL, 'boolean', 'compilation_status = compiled', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('f0000000-0000-0000-0000-000000000003', 'attribute_ref', NULL, NULL, 'f395029e-9155-426d-873e-6e1fd282f260', NULL, 'enum', 'Requirement.compilation_status', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('f0000000-0000-0000-0000-000000000004', 'literal', NULL, 'compiled', NULL, NULL, 'enum', '''compiled''', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('fa000000-0000-0000-0000-00000000000a', 'literal', NULL, 'sanity-check', NULL, NULL, 'text', 'sanity check leaf', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('c0000000-0000-0000-0000-000000000001', 'relationship_ref', NULL, NULL, NULL, NULL, 'integer', 'count of Answers', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'COUNT');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('c0000000-0000-0000-0000-000000000002', 'literal', NULL, '2', NULL, NULL, 'integer', '2', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('c0000000-0000-0000-0000-000000000003', 'operator', '>=', NULL, NULL, NULL, 'boolean', 'answer count >= 2', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0000000-0000-0000-0000-000000000001', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists Answer role=architect (exact)', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0000000-0000-0000-0000-000000000002', 'operator', '=', NULL, NULL, NULL, 'boolean', 'role = architect (exact)', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0000000-0000-0000-0000-000000000003', 'attribute_ref', NULL, NULL, 'ba5ef765-dfb6-49dc-b061-ce7382d16fec', NULL, 'text', 'Answer.role', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0000000-0000-0000-0000-000000000004', 'literal', NULL, 'architect', NULL, NULL, 'text', '''architect''', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0100000-0000-0000-0000-000000000011', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists Answer lower(role)=architect', '88893e8b-3f40-4a72-b6cf-47cbadfed531', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0200000-0000-0000-0000-000000000021', 'operator', '=', NULL, NULL, NULL, 'boolean', 'lower(role) = architect', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('d0300000-0000-0000-0000-000000000031', 'function_call', NULL, NULL, NULL, 'lower', 'text', 'lower(Answer.role)', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e9100000-0000-0000-0000-000000000092', 'literal', NULL, 'foo', NULL, NULL, 'text', NULL, NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e9200000-0000-0000-0000-000000000093', 'literal', NULL, 'bar', NULL, NULL, 'text', NULL, NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('e9000000-0000-0000-0000-000000000091', 'function_call', NULL, NULL, NULL, 'concat', 'text', 'concat test', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('a1000000-0000-0000-0000-00000000a001', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'all dependency edges satisfied', '3bacfbc6-2272-4818-96eb-791c16b830cd', 'ALL');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('a2000000-0000-0000-0000-00000000a002', 'relationship_ref', NULL, NULL, NULL, NULL, 'boolean', 'exists a completed prerequisite', '646db3bd-e91f-4a33-8e11-80ba9ce4d34b', 'EXISTS');
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('a3000000-0000-0000-0000-00000000a003', 'operator', '=', NULL, NULL, NULL, 'boolean', 'business_status = COMPLETED', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('a4000000-0000-0000-0000-00000000a004', 'attribute_ref', NULL, NULL, '70f62acf-ced2-41fa-bf6c-e54549ad1c9b', NULL, 'enum', 'WorkRequest.business_status', NULL, NULL);
INSERT INTO resolution.expression (id, kind, operator, literal_value, attribute_id, function_name, return_type, label, concept_relationship_id, quantifier) VALUES ('a5000000-0000-0000-0000-00000000a005', 'literal', NULL, 'COMPLETED', NULL, NULL, 'enum', '''COMPLETED''', NULL, NULL);


ALTER TABLE resolution.expression ENABLE TRIGGER ALL;

--
-- Data for Name: expression_operand; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.expression_operand DISABLE TRIGGER ALL;

INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e1000000-0000-0000-0000-000000000001', 'e2000000-0000-0000-0000-000000000002', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e3000000-0000-0000-0000-000000000003', 'e4000000-0000-0000-0000-000000000004', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e4000000-0000-0000-0000-000000000004', 'e5000000-0000-0000-0000-000000000005', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e4000000-0000-0000-0000-000000000004', 'e6000000-0000-0000-0000-000000000006', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e7000000-0000-0000-0000-000000000007', 'e8000000-0000-0000-0000-000000000008', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e8000000-0000-0000-0000-000000000008', 'e4000000-0000-0000-0000-000000000004', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e8000000-0000-0000-0000-000000000008', 'e0a00000-0000-0000-0000-00000000000a', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e0a00000-0000-0000-0000-00000000000a', 'e0b00000-0000-0000-0000-00000000000b', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e0a00000-0000-0000-0000-00000000000a', 'e0c00000-0000-0000-0000-00000000000c', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e7100000-0000-0000-0000-000000000071', 'e8100000-0000-0000-0000-000000000081', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e8100000-0000-0000-0000-000000000081', 'e4000000-0000-0000-0000-000000000004', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e8100000-0000-0000-0000-000000000081', 'e0a00000-0000-0000-0000-00000000000a', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000002', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000003', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('f0000000-0000-0000-0000-000000000002', 'f0000000-0000-0000-0000-000000000004', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('f0000000-0000-0000-0000-000000000002', 'fa000000-0000-0000-0000-00000000000a', 3);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000001', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('c0000000-0000-0000-0000-000000000003', 'c0000000-0000-0000-0000-000000000002', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0000000-0000-0000-0000-000000000001', 'd0000000-0000-0000-0000-000000000002', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000003', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0000000-0000-0000-0000-000000000002', 'd0000000-0000-0000-0000-000000000004', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0100000-0000-0000-0000-000000000011', 'd0200000-0000-0000-0000-000000000021', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0200000-0000-0000-0000-000000000021', 'd0300000-0000-0000-0000-000000000031', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0200000-0000-0000-0000-000000000021', 'd0000000-0000-0000-0000-000000000004', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('d0300000-0000-0000-0000-000000000031', 'd0000000-0000-0000-0000-000000000003', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e9000000-0000-0000-0000-000000000091', 'e9100000-0000-0000-0000-000000000092', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('e9000000-0000-0000-0000-000000000091', 'e9200000-0000-0000-0000-000000000093', 2);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('a1000000-0000-0000-0000-00000000a001', 'a2000000-0000-0000-0000-00000000a002', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('a2000000-0000-0000-0000-00000000a002', 'a3000000-0000-0000-0000-00000000a003', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('a3000000-0000-0000-0000-00000000a003', 'a4000000-0000-0000-0000-00000000a004', 1);
INSERT INTO resolution.expression_operand (parent_expression_id, child_expression_id, "position") VALUES ('a3000000-0000-0000-0000-00000000a003', 'a5000000-0000-0000-0000-00000000a005', 2);


ALTER TABLE resolution.expression_operand ENABLE TRIGGER ALL;

--
-- Data for Name: function_binding; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.function_binding DISABLE TRIGGER ALL;

INSERT INTO resolution.function_binding (function_name, sql_template, arg_count, return_type, notes) VALUES ('lower', 'lower(%s)', 1, 'text', 'case-insensitive comparisons');
INSERT INTO resolution.function_binding (function_name, sql_template, arg_count, return_type, notes) VALUES ('concat', 'concat(%s, %s)', 2, 'text', 'proves multi-arg positional ordering');


ALTER TABLE resolution.function_binding ENABLE TRIGGER ALL;

--
-- Data for Name: identity_strategy; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.identity_strategy DISABLE TRIGGER ALL;

INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('08d5b64a-af94-481c-9691-5be09f5dafd4', '3c27e87d-cd91-41c9-a21e-c982d94c65c5', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);
INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('96af24d0-9e12-4ce0-a6fb-912918430576', 'eb71fe83-b476-4197-af4e-eb76720ea5d7', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);
INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('150b2b72-6bae-4596-bd67-53a72db4297e', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);
INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('62be4006-1a10-4c5d-975d-6d978644c275', '094b785c-82b4-44fc-b262-7e60bc85db6f', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);
INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('598441cc-3632-4438-97df-bfc6ecef500b', '5f2f4dea-9715-4104-b2d3-100abe72685e', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);
INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('3d1e7f85-aba3-495f-92d7-6f3dbdd7f4a8', 'efba776b-d731-4018-8610-a3e1af0bc3d3', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);
INSERT INTO resolution.identity_strategy (id, concept_id, canonical_key_description, notes) VALUES ('f642e929-cf65-4225-b862-0f562db066ef', 'd22cd236-6353-445e-9b48-bbb8880493df', 'Resolved through resolution.canonical_asset.canonical_asset_id (active row, expired_at IS NULL)', NULL);


ALTER TABLE resolution.identity_strategy ENABLE TRIGGER ALL;

--
-- Data for Name: requirement; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.requirement DISABLE TRIGGER ALL;

INSERT INTO resolution.requirement (id, asset_id, candidate_id, parent_id, source_type, system_id, subsystem_id, feature_id, title, description, status, priority, req_type, compilation_status, sol_ir_expression_id, start_date, completion_date, acceptance_criteria, conduit_plan_id, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('55555555-5555-5555-5555-555555555501', '11111111-1111-1111-1111-111111111104', NULL, NULL, 'candidate', NULL, NULL, NULL, 'Persist Nexus observations in a document store', 'Parent story rolling up document-store access and indexing', 'Backlog', 'Medium', 'Story', 'draft', NULL, NULL, NULL, '[]', NULL, '2026-08-12 04:36:47.753598+00', '2026-08-12 04:36:47.753598+00', 'infinity', '2026-08-12 04:36:47.753598+00', 'infinity');
INSERT INTO resolution.requirement (id, asset_id, candidate_id, parent_id, source_type, system_id, subsystem_id, feature_id, title, description, status, priority, req_type, compilation_status, sol_ir_expression_id, start_date, completion_date, acceptance_criteria, conduit_plan_id, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('55555555-5555-5555-5555-555555555502', '11111111-1111-1111-1111-111111111105', '33333333-3333-3333-3333-333333333301', '55555555-5555-5555-5555-555555555501', 'candidate', NULL, NULL, NULL, 'Document store access layer', '', 'Backlog', 'Medium', 'Task', 'compiled', NULL, NULL, NULL, '[]', NULL, '2026-08-12 04:36:47.755081+00', '2026-08-12 04:36:47.755081+00', 'infinity', '2026-08-12 04:36:47.755081+00', 'infinity');
INSERT INTO resolution.requirement (id, asset_id, candidate_id, parent_id, source_type, system_id, subsystem_id, feature_id, title, description, status, priority, req_type, compilation_status, sol_ir_expression_id, start_date, completion_date, acceptance_criteria, conduit_plan_id, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('55555555-5555-5555-5555-555555555503', '11111111-1111-1111-1111-111111111106', '33333333-3333-3333-3333-333333333302', '55555555-5555-5555-5555-555555555501', 'candidate', NULL, NULL, NULL, 'Document store indexing strategy', '', 'Backlog', 'Medium', 'Task', 'compiled', NULL, NULL, NULL, '[]', NULL, '2026-08-12 04:36:47.755081+00', '2026-08-12 04:36:47.755081+00', 'infinity', '2026-08-12 04:36:47.755081+00', 'infinity');


ALTER TABLE resolution.requirement ENABLE TRIGGER ALL;

--
-- Data for Name: specification; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.specification DISABLE TRIGGER ALL;

INSERT INTO resolution.specification (id, asset_id, requirement_id, agenda_id, revision_number, revision_type, superseded_by, item_snapshot, change_summary, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('50000000-0000-0000-0000-000000000002', NULL, '55555555-5555-5555-5555-555555555502', '5a000000-0000-0000-0000-00000000005a', 2, 'revised', NULL, '[{"item": "relies on a document database"}, {"item": "must support geo-replication across two regions"}]', 'Added geo-replication requirement after architect raised availability concerns during deliberation.', '2026-08-14 11:19:17.794522+00', '2026-08-14 11:19:17.794522+00', 'infinity', '2026-08-14 11:19:17.794522+00', 'infinity');
INSERT INTO resolution.specification (id, asset_id, requirement_id, agenda_id, revision_number, revision_type, superseded_by, item_snapshot, change_summary, created_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('50000000-0000-0000-0000-000000000001', NULL, '55555555-5555-5555-5555-555555555502', '5a000000-0000-0000-0000-00000000005a', 1, 'created', '50000000-0000-0000-0000-000000000002', '[{"item": "relies on a document database"}]', 'Initial specification from architecture deliberation -- deliberately abstract, not implementation-specific.', '2026-08-14 11:10:53.479943+00', '2026-08-14 11:10:53.479943+00', 'infinity', '2026-08-14 11:10:53.479943+00', 'infinity');


ALTER TABLE resolution.specification ENABLE TRIGGER ALL;

--
-- Data for Name: implementation_plan; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.implementation_plan DISABLE TRIGGER ALL;

INSERT INTO resolution.implementation_plan (id, asset_id, plan_number, specification_id, requirement_id, title, goal, content, files_affected, acceptance_criteria, dependencies, status, tags, metadata, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('60000000-0000-0000-0000-000000000001', NULL, 'PLAN-0002', '50000000-0000-0000-0000-000000000001', '55555555-5555-5555-5555-555555555502', 'Provision document store access layer', 'Give the access-layer requirement a concrete backing store', 'Connects to MongoDB on port 27017 at 10.0.4.12, replica set nexus-docstore-01.', '{}', '[]', '{}', 'approved', '{}', '{}', '2026-08-14 11:10:53.480962+00', '2026-08-14 11:10:53.480962+00', '2026-08-14 11:10:53.480962+00', 'infinity', '2026-08-14 11:10:53.480962+00', 'infinity');


ALTER TABLE resolution.implementation_plan ENABLE TRIGGER ALL;

--
-- Data for Name: observation_source_chunk; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.observation_source_chunk DISABLE TRIGGER ALL;

INSERT INTO resolution.observation_source_chunk (observation_id, chunk_id, "position") VALUES ('0b000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000201', 1);
INSERT INTO resolution.observation_source_chunk (observation_id, chunk_id, "position") VALUES ('0b000000-0000-0000-0000-000000000001', 'c1000000-0000-0000-0000-000000000202', 2);


ALTER TABLE resolution.observation_source_chunk ENABLE TRIGGER ALL;

--
-- Data for Name: open_question; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.open_question DISABLE TRIGGER ALL;

INSERT INTO resolution.open_question (id, title, description, blocking, created_by, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt, category_value_id, status_value_id, assessment_id) VALUES ('99999999-9999-9999-9999-999999999999', 'Unanswered control question', NULL, true, 'test', '2026-08-13 20:03:31.602233+00', '2026-08-13 20:03:31.602233+00', '2026-08-13 20:03:31.602233+00', 'infinity', '2026-08-13 20:03:31.602233+00', 'infinity', NULL, NULL, NULL);
INSERT INTO resolution.open_question (id, title, description, blocking, created_by, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt, category_value_id, status_value_id, assessment_id) VALUES ('99999999-9999-9999-9999-999999999902', 'Medium-confidence-only control question', NULL, true, 'test', '2026-08-13 20:08:25.63077+00', '2026-08-13 20:08:25.63077+00', '2026-08-13 20:08:25.63077+00', 'infinity', '2026-08-13 20:08:25.63077+00', 'infinity', NULL, NULL, NULL);
INSERT INTO resolution.open_question (id, title, description, blocking, created_by, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt, category_value_id, status_value_id, assessment_id) VALUES ('99999999-9999-9999-9999-999999999903', 'High-confidence-wrong-role control question', NULL, true, 'test', '2026-08-14 01:29:04.325865+00', '2026-08-14 01:29:04.325865+00', '2026-08-14 01:29:04.325865+00', 'infinity', '2026-08-14 01:29:04.325865+00', 'infinity', NULL, NULL, NULL);
INSERT INTO resolution.open_question (id, title, description, blocking, created_by, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt, category_value_id, status_value_id, assessment_id) VALUES ('99999999-9999-9999-9999-999999999901', 'Should WorkRequest escalation target a Role or a specific Person?', 'Candidate proposes WorkRequest -> escalates_to -> OnCallEngineer, but no concept_relationship exists for either shape yet.', true, 'Planner', '2026-08-13 02:46:03.892569+00', '2026-08-13 02:46:03.901149+00', '2026-08-13 02:46:03.892569+00', 'infinity', '2026-08-13 02:46:03.892569+00', 'infinity', 'fd715903-800c-4761-8f8e-3bc8614c0820', 'f0dbd831-ede3-4b3e-bc2b-2e2630b3b288', 'a5000001-0000-0000-0000-000000000001');
INSERT INTO resolution.open_question (id, title, description, blocking, created_by, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt, category_value_id, status_value_id, assessment_id) VALUES ('99999999-9999-9999-9999-999999999904', 'Case-sensitivity control question', NULL, true, 'test', '2026-08-14 11:23:45.16954+00', '2026-08-14 11:23:45.16954+00', '2026-08-14 11:23:45.16954+00', 'infinity', '2026-08-14 11:23:45.16954+00', 'infinity', NULL, NULL, NULL);


ALTER TABLE resolution.open_question ENABLE TRIGGER ALL;

--
-- Data for Name: open_question_answer; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.open_question_answer DISABLE TRIGGER ALL;

INSERT INTO resolution.open_question_answer (id, question_id, role, answer, confidence, reasoning, answered_at, version, valid_from, valid_until) VALUES ('88888888-8888-8888-8888-888888888801', '99999999-9999-9999-9999-999999999901', 'architect', 'Escalate to the OnCall role, not a specific person', 'HIGH', 'A named person leaves the org; the role concept survives org changes and matches how Wind already models responders.', '2026-08-13 02:46:03.896918+00', 1, '2026-08-13 02:46:03.896918+00', 'infinity');
INSERT INTO resolution.open_question_answer (id, question_id, role, answer, confidence, reasoning, answered_at, version, valid_from, valid_until) VALUES ('88888888-8888-8888-8888-888888888802', '99999999-9999-9999-9999-999999999901', 'planner', 'Agree — model OnCallRole as a Role concept, WorkRequest.escalates_to should point at Role, not Person', 'MEDIUM', 'Consistent with existing Role usage elsewhere in Nebula.', '2026-08-13 02:46:03.896918+00', 1, '2026-08-13 02:46:03.896918+00', 'infinity');
INSERT INTO resolution.open_question_answer (id, question_id, role, answer, confidence, reasoning, answered_at, version, valid_from, valid_until) VALUES ('591b73ae-8611-4fd6-9d64-aefcfc852038', '99999999-9999-9999-9999-999999999902', 'planner', 'Best guess, not fully confident', 'MEDIUM', NULL, '2026-08-13 20:08:25.632305+00', 1, '2026-08-13 20:08:25.632305+00', 'infinity');
INSERT INTO resolution.open_question_answer (id, question_id, role, answer, confidence, reasoning, answered_at, version, valid_from, valid_until) VALUES ('c0860090-6709-4ff0-bec3-c761fbf76ae6', '99999999-9999-9999-9999-999999999903', 'planner', 'Confident, but I am not the architect', 'HIGH', NULL, '2026-08-14 01:29:04.328138+00', 1, '2026-08-14 01:29:04.328138+00', 'infinity');
INSERT INTO resolution.open_question_answer (id, question_id, role, answer, confidence, reasoning, answered_at, version, valid_from, valid_until) VALUES ('254b2717-9dbb-410b-a8ac-7abf4926136a', '99999999-9999-9999-9999-999999999904', 'ARCHITECT', 'Answering in caps to test case handling', 'HIGH', NULL, '2026-08-14 11:23:45.171249+00', 1, '2026-08-14 11:23:45.171249+00', 'infinity');


ALTER TABLE resolution.open_question_answer ENABLE TRIGGER ALL;

--
-- Data for Name: open_question_entity; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.open_question_entity DISABLE TRIGGER ALL;

INSERT INTO resolution.open_question_entity (open_question_id, asset_concept_id, entity_id, valid_from, valid_until) VALUES ('99999999-9999-9999-9999-999999999901', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'cb000000-0000-0000-0000-00000000000b', '2026-08-13 02:46:03.895826+00', 'infinity');


ALTER TABLE resolution.open_question_entity ENABLE TRIGGER ALL;

--
-- Data for Name: representation_identity; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.representation_identity DISABLE TRIGGER ALL;

INSERT INTO resolution.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes) VALUES ('ad90c5dc-f485-43a2-a4b3-e6c0c6ed5a98', 'd0242eb7-11a9-43a9-9d2a-6f7ef921a25e', '96af24d0-9e12-4ce0-a6fb-912918430576', 'asset_id', NULL);
INSERT INTO resolution.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes) VALUES ('36a6ca98-a266-4bf0-8728-591a335bd47e', '73370e46-9ced-4830-905a-ed785d2e6e45', '150b2b72-6bae-4596-bd67-53a72db4297e', 'asset_id', NULL);
INSERT INTO resolution.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes) VALUES ('125016d5-2896-45a7-ad19-47e33ecf0ce6', '512853a3-b74b-4eda-8267-1960e9b8b7b1', '62be4006-1a10-4c5d-975d-6d978644c275', 'asset_id', NULL);
INSERT INTO resolution.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes) VALUES ('af0fa2f8-8188-4be1-b74b-0610423036ca', '3f28a82e-2453-49a9-8214-030205d92796', '598441cc-3632-4438-97df-bfc6ecef500b', 'asset_id', NULL);
INSERT INTO resolution.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes) VALUES ('852b067e-7d7e-4cba-9b37-270bf45a04a3', '6c4cf312-16b7-4a57-82ca-123924ecab0b', '3d1e7f85-aba3-495f-92d7-6f3dbdd7f4a8', 'asset_id', NULL);
INSERT INTO resolution.representation_identity (id, representation_id, identity_strategy_id, identity_expression, notes) VALUES ('992885b5-c5b3-44ae-9f43-18cb5e76c6a1', '592c5fcf-d8e7-4f7f-bb92-31f415fb7cc3', 'f642e929-cf65-4225-b862-0f562db066ef', 'asset_id', NULL);


ALTER TABLE resolution.representation_identity ENABLE TRIGGER ALL;

--
-- Data for Name: representation_relationship; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.representation_relationship DISABLE TRIGGER ALL;

INSERT INTO resolution.representation_relationship (id, from_representation_id, to_representation_id, relationship_type, notes, created_at, expired_at) VALUES ('3703d4d6-1847-40ae-bf56-ee8dc856033f', 'a1000000-0000-0000-0000-000000000001', '73370e46-9ced-4830-905a-ed785d2e6e45', 'legacy', 'Superseded by resolution.candidate as the single source of truth -- the embedded jsonb array duplicated harvest_candidates_history and was dropped when the resolution schema was built.', '2026-08-14 11:10:53.474994+00', NULL);
INSERT INTO resolution.representation_relationship (id, from_representation_id, to_representation_id, relationship_type, notes, created_at, expired_at) VALUES ('614e87e5-679d-43e5-a476-02d4ff996513', '6c4cf312-16b7-4a57-82ca-123924ecab0b', 'a2000000-0000-0000-0000-000000000002', 'partial', 'implementation_plans captures goal/content/status but not full DAG structure (dependencies as an ordered graph, parallel branches) -- WRP is the fuller representation for execution planning.', '2026-08-14 11:10:53.476902+00', NULL);


ALTER TABLE resolution.representation_relationship ENABLE TRIGGER ALL;

--
-- Data for Name: requirement_segment_set; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.requirement_segment_set DISABLE TRIGGER ALL;

INSERT INTO resolution.requirement_segment_set (requirement_id, segment_set_id, role) VALUES ('55555555-5555-5555-5555-555555555502', '44444444-4444-4444-4444-444444444401', 'primary');
INSERT INTO resolution.requirement_segment_set (requirement_id, segment_set_id, role) VALUES ('55555555-5555-5555-5555-555555555503', '44444444-4444-4444-4444-444444444402', 'primary');


ALTER TABLE resolution.requirement_segment_set ENABLE TRIGGER ALL;

--
-- Data for Name: rule; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.rule DISABLE TRIGGER ALL;

INSERT INTO resolution.rule (id, name, rule_type, expression_id, severity, concept_id, concept_relationship_id, representation_id, notes, created_at, expired_at, state_transition_id) VALUES ('4cd4ea8e-c9a1-4c32-83e5-e09836ec83b7', 'open_question_resolve_requires_verified_statement', 'guard', 'e1000000-0000-0000-0000-000000000001', 'hard', NULL, NULL, NULL, 'EXISTS (SELECT 1 FROM open_question_answer a JOIN verified_statement vs ON vs.answer_id = a.id WHERE a.question_id = <this open_question''s id>)', '2026-08-13 03:05:05.390305+00', NULL, '91e0e1ed-fa6a-4837-9142-c2f807fdbb94');
INSERT INTO resolution.rule (id, name, rule_type, expression_id, severity, concept_id, concept_relationship_id, representation_id, notes, created_at, expired_at, state_transition_id) VALUES ('8a382752-f902-4099-8fe2-ac9ef669b9ef', 'requirement_rollup_validity', 'invariant', 'f0000000-0000-0000-0000-000000000001', 'hard', '094b785c-82b4-44fc-b262-7e60bc85db6f', NULL, NULL, 'A parent requirement cannot be compilation_status=compiled while any child requirement (requirement.parent_id = this.id) is not compiled.', '2026-08-12 04:36:32.380304+00', NULL, NULL);
INSERT INTO resolution.rule (id, name, rule_type, expression_id, severity, concept_id, concept_relationship_id, representation_id, notes, created_at, expired_at, state_transition_id) VALUES ('126a6421-8fc8-4154-a38b-beff552b33b4', 'work_request_dependencies_satisfied', 'guard', 'a1000000-0000-0000-0000-00000000a001', 'hard', NULL, NULL, NULL, 'A WorkRequest cannot move APPROVED -> DISPATCHED unless every dependency edge points at a COMPLETED prerequisite.', '2026-08-15 17:29:12.112854+00', NULL, 'f9389719-c826-4ee2-9ad2-aca56bb9076d');


ALTER TABLE resolution.rule ENABLE TRIGGER ALL;

--
-- Data for Name: specification_lineage; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.specification_lineage DISABLE TRIGGER ALL;

INSERT INTO resolution.specification_lineage (specification_id, derived_from_id) VALUES ('50000000-0000-0000-0000-000000000002', '50000000-0000-0000-0000-000000000001');


ALTER TABLE resolution.specification_lineage ENABLE TRIGGER ALL;

--
-- Data for Name: verified_statement; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.verified_statement DISABLE TRIGGER ALL;

INSERT INTO resolution.verified_statement (id, answer_id, expression_id, asset_concept_id, target_asset_id, verified_by, verified_at, notes) VALUES ('ba20d3d8-7428-4369-aae0-707001409c57', '88888888-8888-8888-8888-888888888801', '77777777-7777-7777-7777-777777777701', 'dda27bb4-a994-4c56-8693-34bee69738c4', 'cb000000-0000-0000-0000-00000000000b', 'Verifier', '2026-08-13 02:46:03.89994+00', 'Compiled from architect answer; planner answer concurred, used as corroboration not a second statement.');


ALTER TABLE resolution.verified_statement ENABLE TRIGGER ALL;

--
-- Data for Name: work_request; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.work_request DISABLE TRIGGER ALL;

INSERT INTO resolution.work_request (id, asset_id, title, description, source_specification_id, source_requirement_id, business_status, intent, context, constraints, created_by, dco_json, legacy_id, plan_id, step_outputs, consumed_at, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('70000000-0000-0000-0000-000000000001', NULL, 'Implement document store access layer', NULL, NULL, '55555555-5555-5555-5555-555555555502', 'DISPATCHED', 'Stand up MongoDB access per PLAN-0002, geo-replicated per specification revision 2.', '{}', '{}', NULL, NULL, NULL, 'PLAN-0002', '{}', NULL, '2026-08-14 11:19:17.805713+00', '2026-08-14 11:19:17.805713+00', '2026-08-14 11:19:17.805713+00', 'infinity', '2026-08-14 11:19:17.805713+00', 'infinity');
INSERT INTO resolution.work_request (id, asset_id, title, description, source_specification_id, source_requirement_id, business_status, intent, context, constraints, created_by, dco_json, legacy_id, plan_id, step_outputs, consumed_at, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('90000000-0000-0000-0000-000000000002', NULL, 'Wire access layer to MongoDB cluster (dependent)', NULL, NULL, NULL, 'APPROVED', 'Cannot dispatch until the cluster prerequisite is complete', '{}', '{}', NULL, NULL, NULL, NULL, '{}', NULL, '2026-08-15 17:29:12.114609+00', '2026-08-15 17:29:12.114609+00', '2026-08-15 17:29:12.114609+00', 'infinity', '2026-08-15 17:29:12.114609+00', 'infinity');
INSERT INTO resolution.work_request (id, asset_id, title, description, source_specification_id, source_requirement_id, business_status, intent, context, constraints, created_by, dco_json, legacy_id, plan_id, step_outputs, consumed_at, created_at, updated_at, valid_from, valid_until, recorded_on_dt, recorded_until_dt) VALUES ('90000000-0000-0000-0000-000000000001', NULL, 'Provision MongoDB cluster (prerequisite)', NULL, NULL, NULL, 'COMPLETED', 'Stand up the replica set the access layer depends on', '{}', '{}', NULL, NULL, NULL, NULL, '{}', NULL, '2026-08-15 17:29:12.114609+00', '2026-08-15 17:29:12.114609+00', '2026-08-15 17:29:12.114609+00', 'infinity', '2026-08-15 17:29:12.114609+00', 'infinity');


ALTER TABLE resolution.work_request ENABLE TRIGGER ALL;

--
-- Data for Name: work_request_edge; Type: TABLE DATA; Schema: resolution; Owner: -
--

ALTER TABLE resolution.work_request_edge DISABLE TRIGGER ALL;

INSERT INTO resolution.work_request_edge (id, parent_work_request_id, child_work_request_id, edge_type, metadata, created_at, valid_from, valid_until) VALUES ('61f590f9-cc88-43fa-8649-2e853dcd9c41', '90000000-0000-0000-0000-000000000001', '90000000-0000-0000-0000-000000000002', 'depends_on', '{}', '2026-08-15 17:29:12.116026+00', '2026-08-15 17:29:12.116026+00', 'infinity');


ALTER TABLE resolution.work_request_edge ENABLE TRIGGER ALL;

--
-- PostgreSQL database dump complete
--

\unrestrict C8MfL63nSMCIDEBc89rnDLuEcYBum5TpneauPGvA1v8RzoTJTBUxm6anDHqOP2x

