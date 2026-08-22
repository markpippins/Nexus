# Legacy Python — nexus/legacy/python/rover/

Retired 2026-08-21. This directory contained the Rover MCP server and its
supporting modules for the harvest pipeline (Dockling → Gemini candidate
extraction).

The Rover was the original "transcript intelligence" system — it parsed
HTML chat transcripts, extracted discourse structure, and used Gemini to
identify architectural candidates worth implementing.

---

## Core Modules

### rover_mcp_server.py
**Purpose:** The main MCP server for Rover. Exposes tools for querying
harvests, candidates, and transcript data via the Model Context Protocol.
Listens on a configurable port and handles JSON-RPC requests.

**Key tools exposed:**
- `list_harvests` — list all harvests with metadata
- `get_harvest` — get a specific harvest by ID
- `list_candidates` — list all candidates with status
- `get_candidate` — get a specific candidate by ID
- `search_transcripts` — semantic search across transcript content

---

### rover_client.py
**Purpose:** Python client library for connecting to the Rover MCP server.
Handles connection management, request formatting, and response parsing.

**Usage:**
```python
from rover_client import RoverClient
client = RoverClient("http://localhost:3200")
harvests = client.list_harvests()
```

---

### rover_mcp_sse.py
**Purpose:** SSE (Server-Sent Events) transport layer for the Rover MCP
server. Handles the MCP session lifecycle including `initialize` handshake,
session ID management, and event streaming.

---

## Transcript Processing

### agenda_matcher.py
**Purpose:** Matches harvested conversation topics against the existing
agenda items in the nebula knowledge graph. Identifies which conversations
relate to which architectural agendas and creates cross-reference links.

**Algorithm:** Uses TF-IDF similarity and entity overlap to score
matches between transcript segments and agenda descriptions.

---

### assembly_publish.py
**Purpose:** Publishes harvest results and candidate proposals to the
Assembly forum. Creates structured forum threads with harvest summaries,
candidate descriptions, and links back to the source transcripts.

**Output:** Forum threads in `harvest-candidates` and `transcripts` forums.

---

### capture_transcript.js
**Purpose:** Browser bookmarklet that captures the current chat
conversation from a web UI (ChatGPT, Gemini, Claude, etc.) and exports
it as an HTML file matching the expected format.

**Usage:** Drag the bookmarklet to your bookmarks bar, then click it
while viewing a chat conversation to download the HTML export.

---

### capture_transcript.bookmarklet.txt
**Purpose:** The minified bookmarklet version of `capture_transcript.js`,
ready to be added to a browser's bookmarks bar.

---

### detect_truncated_transcripts.py
**Purpose:** Scans a directory of HTML transcript files and identifies
those that appear to be truncated (cut off mid-conversation). Checks for
proper HTML closing tags, conversation flow continuity, and expected
structure patterns.

**Output:** List of files flagged as potentially truncated, with
confidence scores.

---

### embed_util.py
**Purpose:** Utility functions for generating and managing embeddings
for transcript content. Wraps the embedding model API and provides
caching, batching, and similarity search capabilities.

**Used by:** `agenda_matcher.py` for semantic matching.

---

### event_emitter.py
**Purpose:** Event emission system for the Rover pipeline. Publishes
events (harvest started, candidate extracted, error encountered) to
a message bus or log for monitoring and debugging.

---

## Configuration & Documentation

### prompt.md
**Purpose:** The Gemini prompt template used by Stage 2
(`batch_file_candidates.py`) for candidate extraction. Contains the
system prompt that instructs Gemini to identify architectural candidates
from docklang discourse units.

---

### outline.md
**Purpose:** Detailed design outline for the Rover system. Describes
the architecture, data flow, API contracts, and integration points
with the nebula knowledge graph.

---

### SPEC.md
**Purpose:** Formal specification for the Rover MCP server. Defines
the tool interfaces, request/response schemas, and behavioral contracts.

---

### TASK_DAEMON_SPEC.md
**Purpose:** Specification for the Rover task daemon — a background
process that watches for new transcript files and automatically runs
them through the harvest pipeline.

---

### IMPLEMENTATION_PLAN.md
**Purpose:** Implementation plan tracking the Rover's development.
Lists completed features, in-progress work, and known gaps.

---

### cleanup.md
**Purpose:** Cleanup procedures for the Rover system. Documents how
to reset the harvest database, clear the embedding cache, and handle
data corruption scenarios.

---

## Scripts

### setup.sh
**Purpose:** One-time setup script for the Rover environment. Creates
the Python virtual environment, installs dependencies, and configures
the database connection.

---

### watch_transcripts.sh
**Purpose:** Filesystem watcher that monitors the `chats/` directory
for new HTML transcript files. When a new file appears, it triggers
the harvest pipeline automatically (inotify-based).

---

## Tests

### test_rover_mcp.py
**Purpose:** Unit tests for the Rover MCP server. Tests tool execution,
error handling, and response formatting.

---

### tests/
**Purpose:** Additional test files for the Rover modules, including
integration tests for the harvest pipeline and parser tests for
individual transcript formats.

---

## Data

### .embedding_cache/
**Purpose:** Cached embedding vectors for transcript content. Avoids
re-embedding already-processed content on subsequent runs.

---

### schema.sql
**Purpose:** PostgreSQL schema definition for the Rover-specific tables
(independent of the main nebula schema). Used for local development
and testing.

---

### schemas.py
**Purpose:** Python dataclass definitions for the Rover's internal
data models (Harvest, Candidate, Transcript, etc.).

---

### requirements.txt / requirements-mcp.txt
**Purpose:** Python dependency files for the Rover environment.
`requirements.txt` contains the base dependencies;
`requirements-mcp.txt` adds MCP-specific packages.

---

### ollama-service-override.conf
**Purpose:** systemd service override for running the Rover with a
local Ollama model instead of the Gemini API. Used for development
and testing without API costs.
