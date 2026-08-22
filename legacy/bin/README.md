# Legacy Scripts — nexus/legacy/bin/

Retired 2026-08-21. These scripts were part of the old harvest pipeline
(Dockling → Gemini candidate extraction) and transcript ingest infrastructure.
They have been superseded by the streamlined `transcript_absorb.py` →
`transcript_ingest.py` pipeline still in `nexus/bin/`.

See `nexus/legacy/python/rover/README.md` for the rover MCP server and
supporting Python modules.

---

## Harvest Pipeline Scripts

### batch_harvest_to_db.py (Stage 1)
**Purpose:** Runs Dockling (a deterministic Rust-based parser) on unprocessed
HTML chat transcripts and inserts structured docklang into `nebula.harvests`
via the Nebula API.

**Input:** HTML files from `chats/` directory (Gemini, DeepSeek, ChatGPT
browser saves)
**Output:** Harvest records with `docklang` discourse units in PostgreSQL
**Called by:** `harvest-pipeline.sh` (Stage 1)

---

### batch_file_candidates.py (Stage 2)
**Purpose:** Reads docklang discourse units from unprocessed harvests and
sends them through Gemini to extract architectural candidates. Creates
`harvest_candidates` entries in the database and optionally publishes them
to the Assembly `harvest-candidates` forum.

**Input:** Harvests with docklang from Stage 1
**Output:** `nebula.harvest_candidates` + Assembly forum threads
**Called by:** `harvest-pipeline.sh` (Stage 2)
**Config:** Requires Gemini API key

---

### batch_file_candidates_manual.py
**Purpose:** Manual/interactive version of `batch_file_candidates.py` for
testing candidate extraction on specific harvests without the full pipeline.

---

### substance_segment_backfill.py (Stage 1.5)
**Purpose:** Heals the old corpus by backfilling segment sets for harvests
that have docklang `discourse_units` but no `conversation_snapshot`. Runs
idempotently — skips harvests that already have substance content.

**Input:** Harvests missing segment sets
**Output:** `nebula.segment_sets` via substance-srv
**Called by:** `harvest-pipeline.sh` (Stage 1.5)

---

### harvest_pipeline.py
**Purpose:** Orchestrator script that runs the full harvest pipeline
(Stage 1 → Stage 1.5 → Stage 2) in sequence. Handles logging, error
recovery, and summary reporting.

---

### harvest_batch.py
**Purpose:** Batch processing utility for running multiple harvests through
the pipeline with configurable limits and parallelism.

---

### harvest_assisted.py
**Purpose:** Assisted harvest mode — allows human-in-the-loop review of
harvest candidates before they're promoted to the database.

---

### batch_publish_harvests.py
**Purpose:** Publishes harvest data to the Assembly forum. Posts harvest
summaries and candidate descriptions as forum threads for cross-role
visibility.

---

## Ingest Scripts

### ingest.py
**Purpose:** The original transcript ingest script. Parsed chat transcripts
from various formats and created harvest records in the database. Predecessor
to the current `transcript_ingest.py`.

**Note:** This was the monolithic version before the pipeline was split into
`transcript_absorb.py` (batch orchestration) + `transcript_ingest.py`
(atomic per-file ingest).

---

### ingest_conduit_data.py
**Purpose:** Ingests data from the conduit work request pipeline into the
nebula database. Bridges the conduit schema (work requests, plans) with the
nebula knowledge graph.

---

### ingest_history.py
**Purpose:** Ingests historical data from legacy sources (MongoDB dumps,
old CSV exports) into the PostgreSQL nebula schema. Used for bootstrapping
the database with pre-existing conversation data.

---

### chatgpt-markdown-ingest.py
**Purpose:** Specialized ingest script for ChatGPT markdown exports. Parses
the YAML frontmatter + markdown body format and creates harvest records.
Superseded by `chatgpt_md_parser.py` used within `transcript_ingest.py`.

---

## Insert Scripts

These were one-shot scripts created to insert specific conversation datasets
into the nebula database. Each targeted a particular set of HTML transcripts.

### insert_arch_evolution_harvest.py
Inserts harvests from the "Architecture Evolution" conversation set.

### insert_cognitive_olap_harvest.py
Inserts harvests from the "Cognitive OLAP" conversation set.

### insert_missing_harvest.py
Inserts harvests that were missed by the automated pipeline (gap-filling).

### insert_nexus4_pa_harvest.py
Inserts harvests from the "Nexus 4 PA" conversation set.

### insert_pg_vs_olap_harvest.py
Inserts harvests from the "PostgreSQL vs OLAP" conversation set.

### insert_wrp_harvest.py
Inserts harvests from the "WorkRequest Pipeline" conversation set.

---

## Parsers

Format-specific parsers used by `transcript_ingest.py` to extract turns from
chat transcript files.

### chatgpt_json_parser.py
Parses ChatGPT JSON exports (the `conversations.json` format). Extracts
message roles, content, timestamps, and model information.

### chatgpt_md_parser.py
Parses ChatGPT markdown exports (YAML frontmatter + `## Role` headers).
Handles the `chat-export/exports/markdown/` directory format.

### claude_parser.py
Parses Claude/Anthropic HTML chat exports. Extracts turns from the
conversation thread structure.

### claude_to_markdown.py
Utility to convert Claude HTML exports to markdown format for easier parsing.

### copilot_html_parser.py
Parses GitHub Copilot Chat HTML exports. Handles the
`div.group/user-message` / `div.group/ai-message` structure with
`h5.sr-only` / `h6.sr-only` role markers ("You said" / "Copilot said").

**Created:** 2026-08-21 (this session)

### deepseek_parser.py
Parses DeepSeek JSON exports (the `conversations.json` format). Handles
the DeepSeek-specific message structure.

### deepseek_html_parser.py
Parses DeepSeek Chat HTML exports. Handles the
`div.d29f3d7d.ds-message` (user) / `div.ds-markdown.ds-assistant` (AI)
structure.

**Created:** 2026-08-21 (this session)

### gemini_parser.py
Parses Google Gemini HTML chat exports. Extracts turns from the Gemini
conversation interface structure.

---

## Infrastructure

### format_detector.py
**Purpose:** Detects the format of a chat transcript file by examining
file extension, content structure, and CSS class patterns. Returns a
format string (e.g., `chatgpt_html`, `deepseek_json`, `gemini3_html`)
and a confidence score.

**Used by:** `transcript_absorb.py` and `transcript_ingest.py` to route
files to the correct parser.

---

### discourse_segmenter.py
**Purpose:** Segments a transcript's turns into discourse arcs — logical
groupings of turns that form a coherent topic or sub-conversation. Uses
heuristics like topic shifts, role patterns, and content similarity.

**Input:** List of turns `[{role, text}, ...]`
**Output:** List of segments `[{title, turns, start_idx, end_idx}, ...]`

---

### mongo_to_pg_docklang.py
**Purpose:** Converts MongoDB docklang documents to the PostgreSQL
`docklang` JSONB format used by the nebula harvests table. Handles
schema mapping, field renaming, and nested structure flattening.

---

### embed_harvests.py
**Purpose:** Generates embeddings for harvest records and stores them in
the `harvest_candidate_embeddings` table. Used for semantic search and
similarity matching between harvests and candidates.

---

### backfill_candidate_agent_record_links.py
**Purpose:** Backfills links between harvest candidates and agent records.
Creates `agent_records` entries that reference candidates, establishing
the audit trail between what was proposed and what was implemented.

---

### update_latest_harvest_refs.py
**Purpose:** Updates the `harvest_references` table to point to the latest
version of each harvest. Handles the temporal versioning system where
harvests can be updated in place (new version rows).
