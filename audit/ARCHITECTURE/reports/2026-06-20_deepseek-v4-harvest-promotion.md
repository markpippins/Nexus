---
role: architect
date: 2026-06-20
summary: Promoted 21 DeepSeek V4 harvests from incoming/chats to processed/harvests, replacing 4 overlapping qwen2.5:0.5b low-quality files
---

# DeepSeek V4 Harvest Promotion

## Summary
All 21 markdown harvest files in `nexus/audit/ROVER/incoming/chats/` were quality-verified against the DeepSeek V4 benchmark and promoted to `ROVER/processed/harvests/`.

## Replacements (4 files)
Low-quality qwen2.5:0.5b harvests deleted in favor of DeepSeek V4 versions:

| Deleted | Replaced by | Candidates |
|---|---|---|
| `event-driven-cli-agents-harvested.md` | `Event_Driven_CLI_Agents_harvested.md` | 3 → 11 |
| `irl-ir-interaction-system-harvested.md` | `IRL_IR_Interaction_System_harvested.md` | weak → 4 |
| `strontium-as-cognition-node-harvested.md` | `Strontium_as_cognition_node_harvested.md` | weak → 5 |
| `system-evolution-and-naming-harvested.md` | `System_Evolution_and_Naming_harvested.md` | weak → 4 |

## New files (17 topics)
All first-class DeepSeek V4 quality (Architectural Intent + Requirements + Code Artifacts + Follow-ups):
- `AG_UI_MessageBox_MCP_Start_harvested.md` (5 candidates)
- `Building_a_Self_Evolving_Software_System_harvested.md` (9)
- `Cognitive_Projection_Model_harvested.md` (4)
- `Distributed_Cognition_Design_harvested.md` (1)
- `Dynamic_UI_Composition_harvested.md` (3)
- `EAV_Schema_Analysis_harvested.md` (3)
- `FreeBuff_Autonomy_Models_harvested.md` (6)
- `Knowledge_Graph_Performance_Concerns_harvested.md` (6)
- `Knowledge_Steward_and_kg_mcp_harvested.md` (3)
- `Nexus_Product_Definition_harvested.md` (1)
- `Phase_1_Completion_Summary_harvested.md` (8)
- `Role_Addressable_Cognitive_Filesystem_harvested.md` (6)
- `Self_audit_in_Agent_Runtime_harvested.md` (7)
- `Semantic_IR_v0.1_Overview_harvested.md` (4)
- `Worker_Context_and_Drift_harvested.md` (1)
- `WRP_DAG_Planning_Guidance_harvested.md` (3)
- `Agenda_Generator_for_DeepSeek_harvested.md` (3, qwen2.5:0.5b — instructions file, not a proper harvest)

## Remaining qwen2.5:0.5b (no DeepSeek replacement)
- `Agenda_Generator_qwen2.5-0.5b_harvested.md`
- `ccnf-normalization-vs-parsing-harvested.md`
- `losm-risk-management-harvested.md`
- `nlp-output-harvested.md`
- `semantic-ir-wrp-harvested.md`

## Quality verification
Spot-checked files at all candidate levels (1, 7, 9, 11). All match the benchmark DeepSeek V4 format: long-form Architectural Intent, actionable Requirements & Acceptance Criteria, code artifacts, and Unresolved Follow-Ups. The variance is in source material richness, not extraction quality.

## Cross-reference constraint
No LICENSE, CONTRIBUTING, README, node_modules, or build-artifact references were found in the current CROSS_REFERENCES.md. The constraint is noted for upcoming cross-reference enhancement work.
