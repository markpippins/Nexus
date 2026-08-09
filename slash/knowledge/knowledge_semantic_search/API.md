# Command

/knowledge knowledge_semantic_search

## Usage

Unified semantic search across four pgvector embed layers using cosine similarity via nomic-embed-text: knowledge.graph_entity_embeddings (curated KG entities: work_requests, plans, actors), nebula.harvest_candidate_embeddings (harvested candidates), semantics.source_observation_embeddings (transcripts, session logs, audit docs), and nebula.agent_record_embeddings (agent records). Returns merged results with provenance labels (curated / harvested / observed / agent_record). Optionally restrict layers, agent record types, and a similarity floor via the layers / recordTypes / minSimilarity parameters.

## Parameters

| Name | Type | Required | Description |
|------|------|----------|-------------|
| `layers` | array<string> | No | Which embed layers to search. Omit to search all four. 'kg' = curated knowledge-graph entities (work_requests, plans, actors), 'harvest' = harvest candidates, 'observation' = transcripts/session logs/audit docs, 'agent' = agent records. |
| `limit` | number | No | Max results (1-50) |
| `minSimilarity` | number | No | Only return results with similarity >= this threshold (e.g. 0.55). Applies across all selected layers. |
| `query` | string | Yes | Search query string (e.g. 'TypeSpec contract architecture') |
| `recordTypes` | array<string> | No | Restrict agent-layer results to these record types. Use to suppress noise (e.g. omit 'inspection' to filter out .gitkeep-style inspection records). Only affects the agent layer. |

## Returns

JSON object with the tool's response content.

## Source

- **MCP Server**: `knowledge-mcp`
- **Tool**: `knowledge_semantic_search`
