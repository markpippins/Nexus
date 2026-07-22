# Rover Process Cleanup Analysis

## Overview
This document analyzes unused/orphaned scripts in the `rover` process directory and identifies dependencies to help maintain a clean codebase.

## Active Dependencies (Cron & Required)

These scripts are actively used by scheduled jobs and must be preserved:

### 1. Planner Script
**File:** `planner.py`  
**Purpose:** Handles candidate generation and intent detection  
**Cron:** `*/30 * * * * cd /home/codex/dev/nexus/python/rover && /home/codex/dev/nexus/python/rover/.venv/bin/python3 planner.py --limit 10 >> /tmp/planner-cron.log 2>&1`  
**Critical:** ✅ **Preserve** - Required for candidate generation pipeline  

### 2. Architect Process Todo
**File:** `architect_process_todo.py`  
**Purpose:** Manages TODO items in the Assembly forum workflow  
**Cron:** `*/5 * * * * cd /home/codex/dev/nexus/python/rover && /home/codex/dev/nexus/python/rover/.venv/bin/python3 architect_process_todo.py --limit 10 >> /tmp/architect-cron.log 2>&1`  
**Critical:** ✅ **Preserve** - Required for TODO item processing  

### 3. Compiler Process InProgress
**File:** `compiler_processInProgress.py`  
**Purpose:** Transitions plans from IN_PROGRESS to ACTIVE state  
**Cron:** `*/5 * * * * cd /home/codex/dev/nexus/python/rover && /home/codex/dev/nexus/python/rover/.venv/bin/python3 compiler_processInProgress.py --limit 10 >> /tmp/compiler-cron.log 2>&1`  
**Critical:** ✅ **Preserve** - Essential for plan lifecycle management  

### 4. Harvest Pipeline (Called by cron)
**File:** `harvest-pipeline.sh` (in `scripts/bash/`)  
**Purpose:** Orchestrates stages:
1. Stage 1: `batch_harvest_to_db.py` → Inserts to `tackle.implementation_plans`
2. Stage 2: `batch_file_candidates.py` → Sends to Gemini for candidate extraction
**Cron:** `0 * * * * /home/codex/dev/nexus/scripts/bash/harvest-pipeline.sh --apply --limit 6`
**Critical:** ✅ **Preserve** - Handles transcript ingestion and candidate extraction  

### 4a. Stage 1 Helper
**File:** `batch_harvest_to_db.py`  
**Purpose:** Processes HTML transcripts → structured docklang records  
**Status:** Active - See above  

### 4b. Stage 2 Helper
**File:** `batch_file_candidates.py`  
**Purpose:** Sends docklang to Gemini for architectural candidate extraction  
**Status:** Active - See above  

### 5. MCP Server Infrastructure
**Files:** `rover_mcp_sse.py`, `rover_mcp_server.py`  
**Purpose:** MCP SSE server running on port 3102 for transcript ingestion  
**Status:** ✅ **Preserve** - Server is running and accepting connections on port 3102  

### 6. Agenda Matcher (Used by Cascade)
**File:** `agenda_matcher.py`  
**Purpose:** Matches assessment text to existing agendas using embeddings  
**Dependencies:** Imported by `cascade/assembly_subscriber.py`  
**Internal imports:** `embed_util.py`, `event_emitter.py`  
**Critical:** ✅ **Preserve** - Used by cascade assembly subscriber for deliberation matching  

### 7. Supporting Modules (Required by agenda_matcher.py)
| File | Purpose | Status |
|------|---------|--------|
| `embed_util.py` | Embedding utilities (embed_texts, cosine_similarity_matrix) | ✅ **Preserve** - Required by agenda_matcher.py |
| `event_emitter.py` | Event emission (emit_agenda_item_added, emit_requirement_promoted_to_plan) | ✅ **Preserve** - Required by agenda_matcher.py |

---

## Potentially Obsolete Scripts (No Current Dependencies)

These scripts lack active cron jobs, imports, or visible dependencies and may be safe for cleanup:

| File | Purpose | Recommendation |
|------|---------|----------------|
| `batch_classify_unmapped.py` | Classifies unmapped chunks? | ⚠️ **Review** - May be orphaned |
| `batch_create_cross_references.py` | Creates cross-references | ⚠️ **Review** - Unverified usage |
| `batch_embed_and_match.py` | Embedding matching? | ⚠️ **Review** - Potentially orphaned |
| `batch_file_candidates_manual.py` | Manual file candidate processing | ⚠️ **Review** - May be legacy |
| `batch_mark_completed.py` | Marks harvests as completed | ⚠️ **Review** - Possibly obsolete |
| `batch_process_ccnf.py` | Cross-network candidate filtering? | ⚠️ **Review** |
| `batch_process_system_evolution.py` | System evolution analysis | ⚠️ **Review** |
| `batch_process_irl_ir.py` | IR processing pipeline | ⚠️ **Review** |
| `batch_process_losm.py` | Loss-of-significance monitoring? | ⚠️ **Review** |
| `batch_process_nlp_output.py` | NLP output processing | ⚠️ **Review** |
| `batch_process_unmapped.py` | Unmapped block processing | ⚠️ **Review** |
| `batch_publish_harvests.py` | Publishes harvests to forum | ⚠️ **Review** - May be legacy |
| `batch_rematch_cross_schema.py` | Schema rematch processing | ⚠️ **Review** |
| `batch_update_refs.py` | Reference updating | ⚠️ **Review** |
| `candidate_promote.py` | Promotes candidates to plans | ⚠️ **Review** |
| `chunk_and_write.py` | Chunk processing and storage | ⚠️ **Review** |
| `conductor_consensus.py` | Consensus engine | ⚠️ **Review** |
| `extract_conversation.py` | Conversation extraction | ⚠️ **Review** |
| `harvest_assisted.py` | Assisted harvesting | ⚠️ **Review** |
| `ingest_conduit_data.py` | Imports Conduit data | ⚠️ **Review** |
| `insert_*` scripts | Database insert helpers | ⚠️ **Review** |
| `link_cross_references.py` | Creates DAG cross-references | ⚠️ **Review** |
| `link_history.py` | Maintains lineage history | ⚠️ **Review** |
| `nlp_process_job.py` | NLP processing jobs | ⚠️ **Review** |
| `planner_mcp_server.py` | MCP server for planner | ⚠️ **Review** |
| `reject_ccnf.py` | Rejects invalid candidate networks | ⚠️ **Review** |
| `reject_harvest_entry.py` | Filters rejected harvests | ⚠️ **Review** |
| `resolve_requirements.py` | Handles requirement resolution | ⚠️ **Review** |
| `resolve_questions.py` | Processes question responses | ⚠️ **Review** |
| `recluster_intents.py` | Intent clustering/reclustering | ⚠️ **Review** |
| `reconcile_agent_records.py` | Audit agent record consistency | ⚠️ **Review** |
| `reconcile_completed.py` | Finalize completed records | ⚠️ **Review** |
| `reconcile_embeddings.py` | Embedding consistency | ⚠️ **Review** |
| `scan_all_chunks.py` | Re-examines all chunks | ⚠️ **Review** |
| `scan_chunks.py` | Basic chunk scanning | ⚠️ **Review** |
| `scan_losm.py` | Loss-of-significance monitoring | ⚠️ **Review** |
| `search_driver.py` | Embedding search/driver | ⚠️ **Review** |
| `service_chunk_selection.py` | Selects service chunks | ⚠️ **Review** |
| `setup_nlp.rb` | NLP setup? | ⚠️ **Review** |
| `unified_semantic_search.py` | Unified semantic search | ⚠️ **Review** |
| `update_latest_harvest_refs.py` | Updates reference tracking | ⚠️ **Review** |

---

## Dependency Graph Summary

```
cron → planner.py
cron → architect_process_todo.py
cron → compiler_processInProgress.py
cron → harvest-pipeline.sh → batch_harvest_to_db.py
                              batch_file_candidates.py
cron → (no direct call but server runs) → rover_mcp_sse.py → rover_mcp_server.py
cascade/assembly_subscriber.py → agenda_matcher.py → embed_util.py
                                                      → event_emitter.py
```

---

## Summary
- **Preserve (7+ files):** Files with active cron jobs, confirmed imports, or running services
- **Review (35+ files):** Files that may still be used but lack visible dependencies
- **Safe to Remove:** Files with no dependencies and no active usage (after verification)

### Next Steps
1. **Verify `agenda_matcher.py`** - Confirmed used by `cascade/assembly_subscriber.py` for deliberation matching
2. **Verify supporting modules** - Confirmed `embed_util.py` and `event_emitter.py` are imported by `agenda_matcher.py`
3. **Confirm MCP servers** - `rover_mcp_sse.py` is running on port 3102 (confirmed via `ss -tlnp`)
4. **Clean up branches/orphaned files** after verification of the review list