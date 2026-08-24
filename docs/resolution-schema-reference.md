# Resolution Schema Reference

> Generated from the consolidated base dump; the live contract requires the ordered v28-v33 migrations.
> Live verification on 2026-08-23: 52 tables · 29 functions.
> This reference is a tracked projection and must be regenerated after the next live dump refresh.

---

## Tables

### resolution.assertion_evaluation
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `proposition_id` | uuid | NOT NULL |
| `rule_id` | uuid | NOT NULL |
| `result` | boolean | NOT NULL |
| `compiled_sql` | text | |
| `evaluated_at` | timestamptz | NOT NULL, `now()` |
| `trigger_reason` | text | DEFAULT `'manual'` |

### resolution.assessment
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `observation_id` | uuid | NOT NULL |
| `outcome` | text | NOT NULL |
| `confidence` | numeric(4,3) | |
| `impact_scope` | jsonb | NOT NULL, `'{}'` |
| `analysis_detail` | text | |
| `rationale` | jsonb | |
| `dimensions_used` | integer | |
| `dimensions_total` | integer | |
| `agenda_id` | uuid | |
| `auto_resolve_plan_id` | uuid | |
| `forum_post_id` | uuid | |
| `resolved_at` | timestamptz | |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.candidate
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `asset_id` | uuid | |
| `harvest_id` | uuid | NOT NULL |
| `title` | text | NOT NULL |
| `intent_description` | text | |
| `implementation_notes` | jsonb | NOT NULL, `'[]'` |
| `code_snippets` | jsonb | NOT NULL, `'[]'` |
| `tags` | text[] | NOT NULL, `'{}'` |
| `status` | text | |
| `type` | text | NOT NULL, `'requirement'` |
| `design_rationale` | jsonb | NOT NULL, `'[]'` |
| `compilation_readiness` | numeric(4,3) | |
| `completed` | boolean | NOT NULL, `false` |
| `needs_new_node` | boolean | NOT NULL, `false` |
| `proposed_parent` | text | |
| `proposed_name` | text | |
| `placement_reason` | text | |
| `system_id` | uuid | |
| `subsystem_id` | uuid | |
| `feature_id` | uuid | |
| `work_request_id` | uuid | |
| `created_at` | timestamptz | NOT NULL |
| `updated_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.candidate_segment_set
| Column | Type | Notes |
|---|---|---|
| `candidate_id` | uuid | NOT NULL |
| `segment_set_id` | uuid | NOT NULL |
| `role` | text | NOT NULL, `'primary'` |

### resolution.candidate_source_chunk
| Column | Type | Notes |
|---|---|---|
| `candidate_id` | uuid | NOT NULL |
| `chunk_id` | uuid | NOT NULL |
| `position` | integer | NOT NULL |

### resolution.canonical_asset
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `canonical_asset_id` | text | NOT NULL |
| `asset_kind` | text | NOT NULL |
| `canonical_key` | jsonb | |
| `source_hash` | text | |
| `content_hash` | text | |
| `validity_start` | timestamptz | |
| `validity_end` | timestamptz | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.concept
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `name` | text | NOT NULL |
| `description` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.concept_attribute
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `concept_id` | uuid | NOT NULL |
| `name` | text | NOT NULL |
| `description` | text | |
| `value_type` | text | NOT NULL |
| `is_state_attribute` | boolean | NOT NULL, `false` |

### resolution.concept_attribute_binding
| Column | Type | Notes |
|---|---|---|
| `attribute_id` | uuid | NOT NULL |
| `schema_name` | text | NOT NULL |
| `table_name` | text | NOT NULL |
| `column_name` | text | NOT NULL |

### resolution.concept_attribute_value
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `attribute_id` | uuid | NOT NULL |
| `value` | text | NOT NULL |
| `description` | text | |

### resolution.concept_relationship
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `from_concept_id` | uuid | NOT NULL |
| `to_concept_id` | uuid | NOT NULL |
| `relationship_type` | text | NOT NULL |
| `path` | text | |
| `notes` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.concept_relationship_binding
| Column | Type | Notes |
|---|---|---|
| `concept_relationship_id` | uuid | NOT NULL |
| `from_schema` | text | NOT NULL |
| `from_table` | text | NOT NULL |
| `from_column` | text | NOT NULL |
| `to_schema` | text | NOT NULL |
| `to_table` | text | NOT NULL |
| `to_column` | text | NOT NULL |
| `notes` | text | |

### resolution.concept_state_transition
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `concept_id` | uuid | NOT NULL |
| `from_value_id` | uuid | |
| `to_value_id` | uuid | NOT NULL |
| `name` | text | NOT NULL |
| `notes` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.consumer_operation
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `representation_id` | uuid | NOT NULL |
| `consumer_name` | text | NOT NULL |
| `operation` | text | NOT NULL |
| `notes` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.execution_admission_receipt
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `peb_transaction_id` | uuid | NOT NULL |
| `claim_id` | uuid | NOT NULL |
| `evidence_id` | uuid | NOT NULL |
| `evidence_kind` | text | NOT NULL |
| `source_system` | text | NOT NULL |
| `policy_version_hash` | text | NOT NULL |
| `lease_id` | text | NOT NULL |
| `grant_id` | text | NOT NULL |
| `attempt_id` | text | NOT NULL |
| `admitted` | boolean | NOT NULL |
| `reason` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL |

### resolution.execution_claim
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `claim_key` | text | NOT NULL |
| `proposition_id` | uuid | |
| `subject_kind` | text | NOT NULL |
| `subject_ref` | jsonb | NOT NULL, `'{}'` |
| `predicate` | text | NOT NULL |
| `object_value` | jsonb | NOT NULL, `'{}'` |
| `policy_version_hash` | text | |
| `lease_id` | text | |
| `grant_id` | text | |
| `attempt_id` | text | |
| `declared_by` | text | NOT NULL |
| `declared_at` | timestamptz | NOT NULL |
| `observed_at` | timestamptz | |
| `disposition` | text | NOT NULL, `'Proposed'` |
| `verification_method` | text | |
| `verified_by` | text | |
| `verified_at` | timestamptz | |
| `verification_summary` | jsonb | |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.execution_claim_evidence
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `claim_id` | uuid | NOT NULL |
| `evidence_id` | uuid | NOT NULL |
| `role` | text | NOT NULL |
| `verification_state` | text | NOT NULL, `'candidate'` |
| `strength` | numeric | |
| `linked_by` | text | NOT NULL |
| `linked_at` | timestamptz | NOT NULL |
| `notes` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.execution_evidence
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `evidence_key` | text | NOT NULL |
| `evidence_kind` | text | NOT NULL |
| `source_system` | text | NOT NULL |
| `source_ref` | jsonb | NOT NULL, `'{}'` |
| `source_hash` | text | NOT NULL |
| `captured_at` | timestamptz | NOT NULL |
| `captured_by` | text | NOT NULL |
| `context_kind` | text | NOT NULL, `'provenance'` |
| `policy_version_hash` | text | |
| `lease_id` | text | |
| `grant_id` | text | |
| `attempt_id` | text | |
| `verifier_id` | text | |
| `verifier_independence` | boolean | |
| `verifier_method` | text | |
| `payload` | jsonb | NOT NULL, `'{}'` |
| `metadata` | jsonb | NOT NULL, `'{}'` |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.expression
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `kind` | text | NOT NULL |
| `operator` | text | |
| `literal_value` | text | |
| `attribute_id` | uuid | |
| `function_name` | text | |
| `return_type` | text | NOT NULL |
| `label` | text | |
| `concept_relationship_id` | uuid | |
| `quantifier` | text | |
| `referenced_proposition_id` | uuid | |
| `proposition_ref_field` | text | |

### resolution.expression_operand
| Column | Type | Notes |
|---|---|---|
| `parent_expression_id` | uuid | NOT NULL |
| `child_expression_id` | uuid | NOT NULL |
| `position` | integer | NOT NULL |

### resolution.frame_dimension
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `name` | text | UNIQUE, NOT NULL |
| `description` | text | |
| `value_kind` | text | NOT NULL, `governed_reference` or `typed_scalar` |
| `scalar_type` | text | Optional; constrained to the declared scalar kind |

### resolution.frame_dimension_value
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `dimension_id` | uuid | NOT NULL, FK to `frame_dimension` |
| `value` | text | NOT NULL |
| `description` | text | |

### resolution.function_binding
| Column | Type | Notes |
|---|---|---|
| `function_name` | text | NOT NULL |
| `sql_template` | text | NOT NULL |
| `arg_count` | integer | NOT NULL |
| `return_type` | text | NOT NULL |
| `notes` | text | |

### resolution.harvest
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `asset_id` | uuid | |
| `source_path` | text | NOT NULL |
| `source_filename` | text | NOT NULL, `''` |
| `model` | text | NOT NULL, `''` |
| `total_candidates` | integer | NOT NULL, `0` |
| `source_text` | text | |
| `docklang` | jsonb | |
| `source_hash` | text | |
| `version` | integer | NOT NULL, `1` |
| `run_metadata` | jsonb | NOT NULL, `'{}'` |
| `file_size` | bigint | |
| `tags` | text[] | NOT NULL, `'{}'` |
| `metadata` | jsonb | NOT NULL, `'{}'` |
| `level` | integer | NOT NULL, `1` |
| `visibility_scope` | text | NOT NULL, `'all'` |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.identity_strategy
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `concept_id` | uuid | NOT NULL |
| `canonical_key_description` | text | NOT NULL |
| `notes` | text | |

### resolution.implementation_plan
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `asset_id` | uuid | |
| `plan_number` | text | |
| `specification_id` | uuid | |
| `requirement_id` | uuid | |
| `title` | text | NOT NULL |
| `goal` | text | |
| `content` | text | |
| `files_affected` | text[] | `'{}'` |
| `acceptance_criteria` | jsonb | `'[]'` |
| `dependencies` | text[] | `'{}'` |
| `status` | text | NOT NULL, `'draft'` |
| `tags` | text[] | `'{}'` |
| `metadata` | jsonb | `'{}'` |
| `created_at` | timestamptz | NOT NULL |
| `updated_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.observation
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `trigger_type` | text | NOT NULL |
| `asset_concept_id` | uuid | |
| `source_artifact_id` | uuid | |
| `predicate_type` | text | |
| `predicate_id` | uuid | |
| `payload` | jsonb | NOT NULL, `'{}'` |
| `assessed` | boolean | NOT NULL, `false` |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.observation_source_chunk
| Column | Type | Notes |
|---|---|---|
| `observation_id` | uuid | NOT NULL |
| `chunk_id` | uuid | NOT NULL |
| `position` | integer | NOT NULL |

### resolution.open_question
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `description` | text | |
| `blocking` | boolean | NOT NULL, `true` |
| `created_by` | text | NOT NULL |
| `created_at` | timestamptz | NOT NULL |
| `updated_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |
| `category_value_id` | uuid | |
| `status_value_id` | uuid | |
| `assessment_id` | uuid | |

### resolution.open_question_answer
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `question_id` | uuid | NOT NULL |
| `role` | text | NOT NULL |
| `answer` | text | NOT NULL |
| `confidence` | text | DEFAULT `'MEDIUM'` |
| `reasoning` | text | |
| `answered_at` | timestamptz | NOT NULL |
| `version` | integer | NOT NULL, `1` |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |

### resolution.open_question_entity
| Column | Type | Notes |
|---|---|---|
| `open_question_id` | uuid | NOT NULL |
| `asset_concept_id` | uuid | NOT NULL |
| `entity_id` | uuid | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |

### resolution.owning_subsystem
| Column | Type | Notes |
|---|---|---|
| `id` | smallint | NOT NULL |
| `name` | text | NOT NULL |
| `description` | text | |

### resolution.proposition
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `title` | text | NOT NULL |
| `description` | text | |
| `asset_concept_id` | uuid | |
| `subject_entity_id` | uuid | |
| `disposition_value_id` | uuid | |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |
| `last_evaluated_at` | timestamptz | |
| `grounding_status_value_id` | uuid | |
| `value` | boolean | |
| `semantic_type_id` | uuid | |

### resolution.proposition_assertion
| Column | Type | Notes |
|---|---|---|
| `proposition_id` | uuid | NOT NULL |
| `rule_id` | uuid | NOT NULL |
| `added_at` | timestamptz | NOT NULL |

### resolution.proposition_frame_value
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `proposition_id` | uuid | NOT NULL, FK to `proposition` |
| `dimension_id` | uuid | NOT NULL, FK to `frame_dimension` |
| `reference_value_id` | uuid | Optional governed reference |
| `scalar_value` | text | Optional typed scalar |

### resolution.proposition_comparison
| Column | Type | Notes |
|---|---|---|
| `proposition_id` | uuid | NOT NULL |
| `representation_comparison_id` | uuid | NOT NULL |
| `added_at` | timestamptz | NOT NULL |

### resolution.semantic_type_required_dimension
| Column | Type | Notes |
|---|---|---|
| `semantic_type_id` | uuid | NOT NULL, FK to `semantic_type` |
| `dimension_id` | uuid | NOT NULL, FK to `frame_dimension` |

### resolution.representation
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `concept_id` | uuid | NOT NULL |
| `label` | text | NOT NULL |
| `schema_name` | text | |
| `table_name` | text | |
| `owning_subsystem_id` | smallint | |
| `owner` | text | |
| `raw_metadata` | jsonb | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.representation_comparison
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `representation_relationship_id` | uuid | NOT NULL |
| `from_column` | text | NOT NULL |
| `to_column` | text | NOT NULL |
| `notes` | text | |

### resolution.representation_identity
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `representation_id` | uuid | NOT NULL |
| `identity_strategy_id` | uuid | NOT NULL |
| `identity_expression` | text | NOT NULL |
| `notes` | text | |

### resolution.representation_relationship
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `from_representation_id` | uuid | NOT NULL |
| `to_representation_id` | uuid | NOT NULL |
| `relationship_type` | text | NOT NULL |
| `notes` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |

### resolution.requirement
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `asset_id` | uuid | |
| `candidate_id` | uuid | |
| `parent_id` | uuid | |
| `source_type` | text | NOT NULL |
| `system_id` | uuid | |
| `subsystem_id` | uuid | |
| `feature_id` | uuid | |
| `title` | text | NOT NULL |
| `description` | text | NOT NULL, `''` |
| `status` | text | NOT NULL, `'Backlog'` |
| `priority` | text | NOT NULL, `'Medium'` |
| `req_type` | text | |
| `compilation_status` | text | NOT NULL, `'draft'` |
| `sol_ir_expression_id` | uuid | |
| `start_date` | text | |
| `completion_date` | text | |
| `acceptance_criteria` | jsonb | `'[]'` |
| `conduit_plan_id` | varchar(32) | |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.requirement_segment_set
| Column | Type | Notes |
|---|---|---|
| `requirement_id` | uuid | NOT NULL |
| `segment_set_id` | uuid | NOT NULL |
| `role` | text | NOT NULL, `'primary'` |

### resolution.rule
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `name` | text | NOT NULL |
| `rule_type` | text | NOT NULL |
| `expression_id` | uuid | |
| `severity` | text | NOT NULL, `'hard'` |
| `concept_id` | uuid | |
| `concept_relationship_id` | uuid | |
| `representation_id` | uuid | |
| `notes` | text | |
| `created_at` | timestamptz | NOT NULL |
| `expired_at` | timestamptz | |
| `state_transition_id` | uuid | |
| `is_relational_check` | boolean | NOT NULL, `false` |
| `staleness_window` | interval | |

### resolution.semantic_type
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `name` | text | NOT NULL |
| `description` | text | |
| `default_staleness_window` | interval | |

### resolution.specification
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `asset_id` | uuid | |
| `requirement_id` | uuid | |
| `agenda_id` | uuid | NOT NULL |
| `revision_number` | integer | NOT NULL |
| `revision_type` | text | NOT NULL |
| `superseded_by` | uuid | |
| `item_snapshot` | jsonb | NOT NULL, `'[]'` |
| `change_summary` | text | |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.specification_lineage
| Column | Type | Notes |
|---|---|---|
| `specification_id` | uuid | NOT NULL |
| `derived_from_id` | uuid | NOT NULL |

### resolution.t24_graph_edge_evidence
| Column | Type | Notes |
|---|---|---|
| `evidence_id` | uuid | NOT NULL |
| `graph_edge_id` | uuid | NOT NULL |
| `source_section` | text | NOT NULL |
| `source_id` | text | NOT NULL |
| `relation_type` | text | NOT NULL |
| `target_section` | text | |
| `target_id` | text | NOT NULL |
| `edge_properties` | jsonb | NOT NULL, `'{}'` |
| `source_migration_id` | uuid | |
| `graph_resolution` | text | NOT NULL, `'unknown'` |
| `unresolved_reason` | text | |
| `graph_created_at` | timestamptz | |
| `imported_at` | timestamptz | NOT NULL |

### resolution.verified_statement
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `answer_id` | uuid | NOT NULL |
| `expression_id` | uuid | NOT NULL |
| `asset_concept_id` | uuid | NOT NULL |
| `target_asset_id` | uuid | NOT NULL |
| `verified_by` | text | NOT NULL |
| `verified_at` | timestamptz | NOT NULL |
| `notes` | text | |

### resolution.work_request
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `asset_id` | uuid | |
| `title` | text | NOT NULL |
| `description` | text | |
| `source_specification_id` | uuid | |
| `source_requirement_id` | uuid | |
| `business_status` | text | NOT NULL, `'DRAFT'` |
| `intent` | text | |
| `context` | jsonb | NOT NULL, `'{}'` |
| `constraints` | jsonb | NOT NULL, `'{}'` |
| `created_by` | text | |
| `dco_json` | text | |
| `legacy_id` | text | |
| `plan_id` | text | |
| `step_outputs` | text | NOT NULL, `'{}'` |
| `consumed_at` | timestamptz | |
| `created_at` | timestamptz | NOT NULL |
| `updated_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |
| `recorded_on_dt` | timestamptz | NOT NULL |
| `recorded_until_dt` | timestamptz | NOT NULL, `infinity` |

### resolution.work_request_edge
| Column | Type | Notes |
|---|---|---|
| `id` | uuid | PK, `gen_random_uuid()` |
| `parent_work_request_id` | uuid | NOT NULL |
| `child_work_request_id` | uuid | NOT NULL |
| `edge_type` | text | NOT NULL, `'depends_on'` |
| `metadata` | jsonb | `'{}'` |
| `created_at` | timestamptz | NOT NULL |
| `valid_from` | timestamptz | NOT NULL |
| `valid_until` | timestamptz | NOT NULL, `infinity` |

---

## Functions

### resolution.admit_and_record(p_transaction_id, p_idempotency_key, p_entity_id, p_tool_name, p_input, p_state_transition_id)
- **Returns:** `text`
- **Parameters:** `uuid, text, text, text, jsonb, uuid`

### resolution.admit_verified_execution_claim(p_peb_transaction_id, p_claim_id, p_evidence_id, p_policy_version_hash, p_lease_id, p_grant_id, p_attempt_id, p_source_system, p_evidence_kind)
- **Returns:** `TABLE(admitted boolean, reason text, receipt_id uuid)`
- **Parameters:** `uuid, uuid, uuid, text, text, text, text, text, text`

### resolution.check_and_record_disagreement(p_representation_comparison_id, p_external_id, p_relational_proposition_id)
- **Returns:** `boolean`
- **Parameters:** `uuid, text, uuid`

### resolution.check_expression_acyclic()
- **Returns:** `trigger` (BEFORE INSERT ON `resolution.expression`)

### resolution.check_relationship_rule(p_concept_relationship_id, p_from_entity_id)
- **Returns:** `TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text)`
- **Parameters:** `uuid, uuid`

### resolution.check_representation_rule(p_representation_id, p_entity_id)
- **Returns:** `TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text)`
- **Parameters:** `uuid, uuid`

### resolution.check_transition_guard(p_state_transition_id, p_entity_id)
- **Returns:** `TABLE(admitted boolean, rule_name text, rule_type text, compiled_sql text, reason text)`
- **Parameters:** `uuid, uuid`

### resolution.compile_condition(expr_id, current_alias)
- **Returns:** `text`
- **Parameters:** `uuid, text`

### resolution.compile_count_scalar(expr_id, parent_ref)
- **Returns:** `text`
- **Parameters:** `uuid, text`

### resolution.compile_exists_chain(expr_id, parent_ref)
- **Returns:** `text`
- **Parameters:** `uuid, text`

### resolution.compile_proposition_ref(expr_id)
- **Returns:** `text`
- **Parameters:** `uuid`

### resolution.compile_root(expr_id, literal_root_ref)
- **Returns:** `text`
- **Parameters:** `uuid, text`

### resolution.correlation_ref(current_alias, child_expr_id)
- **Returns:** `text`
- **Parameters:** `text, uuid`

### resolution.derive_external_id(p_concept_name, p_entity_id)
- **Returns:** `text`
- **Parameters:** `text, uuid`

### resolution.detect_disagreement(p_representation_comparison_id, p_external_id)
- **Returns:** `TABLE(agrees boolean, from_value text, to_value text, from_repr text, to_repr text)`
- **Parameters:** `uuid, text`

### resolution.evaluate_proposition(p_proposition_id, p_trigger_reason, p_context)
- **Returns:** `TABLE(disposition text, all_passed boolean, context_status text)`
- **Parameters:** `uuid, text, jsonb` (defaults: `'manual'`, `NULL`)
- **Context statuses:** `not_scoped`, `context_required`, `context_mismatch`, `scoped`
- Refusals return NULL disposition/all_passed and do not write evaluation state.

### resolution.evaluate_proposition legacy arities
- The live catalog exposes one function with defaults, so calls with only `uuid` or `uuid, text` remain compatible.
- There are no separate `(uuid)` or `(uuid, text)` overloads.

### resolution.evaluate_relationship_guard(expr_id, root_instance_id)
- **Returns:** `TABLE(compiled_sql text, result boolean)`
- **Parameters:** `uuid, uuid`

### resolution.execution_evidence_immutable()
- **Returns:** `trigger` (BEFORE UPDATE ON `resolution.execution_evidence`)

### resolution.is_stale(p_proposition_id)
- **Returns:** `boolean`
- **Parameters:** `uuid`

### resolution.on_change(p_concept_name, p_entity_id)
- **Returns:** `TABLE(proposition_id uuid, action_taken text, resulting_disposition text)`
- **Parameters:** `text, uuid`

### resolution.reopen_disputed_proposition(p_proposition_id, p_external_id)
- **Returns:** `TABLE(disposition text, comparators_agree boolean, assertions_passed boolean)`
- **Parameters:** `uuid, text`

### resolution.resolve_disputed_via_verification(p_proposition_id, p_verified_statement_id)
- **Returns:** `text`
- **Parameters:** `uuid, uuid`

### resolution.resolve_entity_uuid(p_external_id, p_concept_name)
- **Returns:** `uuid`
- **Parameters:** `text, text`

### resolution.run_reconciliation_sweep(p_batch_limit)
- **Returns:** `TABLE(proposition_id uuid, action_taken text, resulting_disposition text)`
- **Parameters:** `integer` (default `50`)

### resolution.run_reconciliation_sweep(p_stale_after, p_batch_limit)
- **Returns:** `TABLE(proposition_id uuid, action_taken text, resulting_disposition text)`
- **Parameters:** `interval, integer` (both required)
- v33 removed the interval overload defaults so `run_reconciliation_sweep()` is unambiguous.

### resolution.run_staleness_sweep(p_batch_limit)
- **Returns:** `TABLE(proposition_id uuid, action_taken text, resulting_disposition text)`
- **Parameters:** `integer` (default `50`)

### resolution.run_staleness_sweep(p_stale_after, p_batch_limit)
- **Returns:** `TABLE(proposition_id uuid, action_taken text, resulting_disposition text)`
- **Parameters:** `interval, integer` (both required)
- v33 removed the interval overload defaults so `run_staleness_sweep()` is unambiguous.
